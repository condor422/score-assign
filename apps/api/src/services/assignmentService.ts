import { Types } from 'mongoose';
import {
  runAssignment,
  validateManualMove,
  type AssignmentRunOptions,
  type AssignmentRunResult,
  type EngineAssignment,
  type EngineMusician,
  type EnginePart,
} from '@score-assign/shared';
import type { TenantModels } from '../models/tenant.js';
import { notFound } from '../middleware/errors.js';

export async function loadEngineInputs(
  db: TenantModels,
  seasonId: string,
): Promise<{ musicians: EngineMusician[]; parts: EnginePart[]; existing: EngineAssignment[] }> {
  const [musicianDocs, partDocs, assignmentDocs] = await Promise.all([
    db.Musician.find({ active: true }).lean(),
    db.Part.find({ seasonId: new Types.ObjectId(seasonId) })
      .sort({ order: 1, partNumber: 1 })
      .lean(),
    db.Assignment.find({ seasonId: new Types.ObjectId(seasonId) }).lean(),
  ]);

  return {
    musicians: musicianDocs.map((m) => ({
      id: String(m._id),
      preferences: m.instruments.map((i) => ({ instrumentId: i.instrumentId, rank: i.rank })),
      willingToDouble: m.willingToDouble,
      experienceLevel: m.experienceLevel,
      difficultyPreference: m.difficultyPreference,
      ...(m.maxAssignments ? { maxAssignments: m.maxAssignments } : {}),
    })),
    parts: partDocs.map((p) => ({
      id: String(p._id),
      songId: String(p.songId),
      instrumentId: String(p.instrumentId),
      partNumber: p.partNumber,
      difficulty: p.difficulty,
      minPlayers: p.minPlayers,
      maxPlayers: p.maxPlayers,
      order: p.order,
    })),
    existing: assignmentDocs.map((a) => ({
      partId: String(a.partId),
      musicianId: String(a.musicianId),
      instrumentId: String(a.instrumentId),
      locked: a.locked,
    })),
  };
}

export interface ExecuteRunParams {
  db: TenantModels;
  seasonId: string;
  triggeredBy: string;
  options: AssignmentRunOptions;
  /** When false, current unlocked placements are kept and only gaps are filled. */
  clearExisting: boolean;
}

/**
 * Executes one on-demand assignment run and persists the outcome. Nothing in
 * the codebase calls this on a timer or on form submission -- it runs only
 * from an explicit request by the tenant.
 */
export async function executeRun(params: ExecuteRunParams): Promise<{
  runId: string;
  result: AssignmentRunResult;
}> {
  const { db, seasonId, triggeredBy, options, clearExisting } = params;
  const season = await db.Season.findById(seasonId);
  if (!season) throw notFound('Season not found');

  const { musicians, parts, existing } = await loadEngineInputs(db, seasonId);

  const run = await db.AssignmentRun.create({
    seasonId: season._id,
    triggeredBy,
    params: { ...options, clearExisting },
    status: 'running',
    snapshotBefore: existing.map((a) => ({
      partId: new Types.ObjectId(a.partId),
      musicianId: new Types.ObjectId(a.musicianId),
      instrumentId: new Types.ObjectId(a.instrumentId),
      locked: a.locked,
    })),
  });

  try {
    // Unlocked placements are either discarded (fresh run) or carried in as
    // pinned so the engine only fills what is missing.
    const carried = clearExisting
      ? existing.filter((a) => a.locked)
      : existing.map((a) => ({ ...a, locked: true }));

    const result = runAssignment(musicians, parts, carried, options);

    // Locked rows stay in place; every unlocked row is rewritten from the run.
    await db.Assignment.deleteMany({ seasonId: season._id, locked: false });

    const keptPairs = new Set(
      existing.filter((a) => a.locked).map((a) => `${a.partId}:${a.musicianId}`),
    );
    const toInsert = result.assignments.filter(
      (a) => !keptPairs.has(`${a.partId}:${a.musicianId}`),
    );

    if (toInsert.length > 0) {
      await db.Assignment.insertMany(
        toInsert.map((a) => ({
          seasonId: season._id,
          partId: new Types.ObjectId(a.partId),
          musicianId: new Types.ObjectId(a.musicianId),
          instrumentId: new Types.ObjectId(a.instrumentId),
          runId: run._id,
          source: 'auto' as const,
          locked: false,
          confirmation: { status: 'pending' as const, respondedAt: null, note: null },
        })),
      );
    }

    run.status = 'succeeded';
    run.finishedAt = new Date();
    run.stats = result.stats as unknown as Record<string, number>;
    run.warnings = result.warnings;
    await run.save();

    season.status = 'assigned';
    await season.save();

    return { runId: String(run._id), result };
  } catch (error) {
    run.status = 'failed';
    run.finishedAt = new Date();
    await run.save();
    throw error;
  }
}

/** Restores the assignments captured before a run. */
export async function revertRun(db: TenantModels, runId: string): Promise<number> {
  const run = await db.AssignmentRun.findById(runId);
  if (!run) throw notFound('Assignment run not found');

  await db.Assignment.deleteMany({ seasonId: run.seasonId });
  if (run.snapshotBefore.length === 0) return 0;

  await db.Assignment.insertMany(
    run.snapshotBefore.map((a) => ({
      seasonId: run.seasonId,
      partId: a.partId,
      musicianId: a.musicianId,
      instrumentId: a.instrumentId,
      runId: null,
      source: 'manual' as const,
      locked: a.locked,
      confirmation: { status: 'pending' as const, respondedAt: null, note: null },
    })),
  );
  return run.snapshotBefore.length;
}

/** Advisory checks for a drag-and-drop move; the director may proceed anyway. */
export async function warningsForMove(
  db: TenantModels,
  seasonId: string,
  musicianId: string,
  partId: string,
): Promise<AssignmentRunResult['warnings']> {
  const { musicians, parts, existing } = await loadEngineInputs(db, seasonId);
  const musician = musicians.find((m) => m.id === musicianId);
  const part = parts.find((p) => p.id === partId);
  if (!musician) throw notFound('Musician not found');
  if (!part) throw notFound('Part not found');
  return validateManualMove(musician, part, existing);
}
