import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  createAssignmentSchema,
  moveAssignmentSchema,
  ordinalPartLabel,
  runAssignmentSchema,
} from '@score-assign/shared';
import { requireAuth, requireRole, tenantContext } from '../middleware/context.js';
import { asyncRoute, notFound } from '../middleware/errors.js';
import { executeRun, revertRun, warningsForMove } from '../services/assignmentService.js';
import { assignmentNoticeEmail, emailProvider } from '../services/email.js';
import { recordAudit } from '../services/audit.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

/**
 * The full board: every part with the musicians on it, plus the pool of
 * musicians holding no part. This is the single read the drag-and-drop UI needs.
 */
assignmentsRouter.get(
  '/seasons/:seasonId/board',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const seasonId = new Types.ObjectId(req.params.seasonId);
    const [parts, songs, instruments, musicians, assignments, latestRun] = await Promise.all([
      db.Part.find({ seasonId }).sort({ order: 1, partNumber: 1 }).lean(),
      db.Song.find({ seasonId }).sort({ order: 1 }).lean(),
      db.Instrument.find({}).lean(),
      db.Musician.find({ active: true }).sort({ name: 1 }).lean(),
      db.Assignment.find({ seasonId }).lean(),
      db.AssignmentRun.findOne({ seasonId }).sort({ startedAt: -1 }).lean(),
    ]);

    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));
    const musicianById = new Map(musicians.map((m) => [String(m._id), m]));
    const songById = new Map(songs.map((s) => [String(s._id), s]));

    const byPart = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = String(assignment.partId);
      const bucket = byPart.get(key) ?? [];
      bucket.push(assignment);
      byPart.set(key, bucket);
    }

    const assignedMusicianIds = new Set(assignments.map((a) => String(a.musicianId)));

    res.json({
      songs: songs.map((s) => ({ id: String(s._id), title: s.title, order: s.order })),
      instruments: instruments.map((i) => ({ id: String(i._id), name: i.name })),
      parts: parts.map((p) => ({
        id: String(p._id),
        songId: String(p.songId),
        songTitle: songById.get(String(p.songId))?.title ?? 'Unknown song',
        instrumentId: String(p.instrumentId),
        instrumentName: instrumentById.get(String(p.instrumentId))?.name ?? 'Unknown',
        partNumber: p.partNumber,
        partLabel: ordinalPartLabel(p.partNumber),
        difficulty: p.difficulty,
        minPlayers: p.minPlayers,
        maxPlayers: p.maxPlayers,
        assignments: (byPart.get(String(p._id)) ?? []).map((a) => {
          const musician = musicianById.get(String(a.musicianId));
          return {
            id: String(a._id),
            musicianId: String(a.musicianId),
            musicianName: musician?.name ?? 'Unknown musician',
            musicianEmail: musician?.email ?? null,
            source: a.source,
            locked: a.locked,
            confirmation: a.confirmation.status,
          };
        }),
      })),
      unassigned: musicians
        .filter((m) => !assignedMusicianIds.has(String(m._id)))
        .map((m) => ({
          id: String(m._id),
          name: m.name,
          instruments: m.instruments,
          experienceLevel: m.experienceLevel,
        })),
      lastRun: latestRun
        ? {
            id: String(latestRun._id),
            startedAt: latestRun.startedAt,
            status: latestRun.status,
            stats: latestRun.stats,
            warnings: latestRun.warnings,
          }
        : null,
    });
  }),
);

/**
 * On-demand assignment. This is the only path that creates automatic
 * assignments, and it requires an explicit request from the tenant.
 */
assignmentsRouter.post(
  '/seasons/:seasonId/runs',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = runAssignmentSchema.parse(req.body ?? {});
    const { runId, result } = await executeRun({
      db,
      seasonId: req.params.seasonId!,
      triggeredBy: req.auth!.email,
      clearExisting: input.clearExisting,
      options: {
        ...(input.weights ? { weights: input.weights } : {}),
        ...(input.defaultMaxAssignments
          ? { defaultMaxAssignments: input.defaultMaxAssignments }
          : {}),
        ...(input.fillToMaxPlayers !== undefined
          ? { fillToMaxPlayers: input.fillToMaxPlayers }
          : {}),
      },
    });

    await recordAudit({
      tenantId: tenant._id,
      actorUserId: new Types.ObjectId(req.auth!.sub),
      action: 'assignment_run.executed',
      targetType: 'assignmentRun',
      targetId: runId,
      meta: result.stats,
      ip: req.ip ?? null,
    });

    res.status(201).json({ runId, stats: result.stats, warnings: result.warnings });
  }),
);

assignmentsRouter.get(
  '/seasons/:seasonId/runs',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const runs = await db.AssignmentRun.find({ seasonId: req.params.seasonId })
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();
    res.json(
      runs.map((r) => ({
        id: String(r._id),
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        triggeredBy: r.triggeredBy,
        status: r.status,
        stats: r.stats,
        warningCount: r.warnings.length,
      })),
    );
  }),
);

assignmentsRouter.post(
  '/runs/:runId/revert',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const restored = await revertRun(db, req.params.runId!);
    res.json({ restored });
  }),
);

/** Drag a musician from the pool onto a part. */
assignmentsRouter.post(
  '/seasons/:seasonId/assignments',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = createAssignmentSchema.parse(req.body);
    const seasonId = new Types.ObjectId(req.params.seasonId);
    const part = await db.Part.findById(input.partId);
    if (!part) throw notFound('Part not found');

    const warnings = await warningsForMove(
      db,
      req.params.seasonId!,
      input.musicianId,
      input.partId,
    );

    const created = await db.Assignment.findOneAndUpdate(
      { partId: part._id, musicianId: new Types.ObjectId(input.musicianId) },
      {
        $set: { seasonId, instrumentId: part.instrumentId, source: 'manual', runId: null },
        $setOnInsert: { locked: false, confirmation: { status: 'pending', respondedAt: null, note: null } },
      },
      { new: true, upsert: true },
    );

    res.status(201).json({ id: String(created._id), warnings });
  }),
);

/** Drag a musician from one part to another. */
assignmentsRouter.patch(
  '/assignments/:id',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = moveAssignmentSchema.parse(req.body);
    const assignment = await db.Assignment.findById(req.params.id);
    if (!assignment) throw notFound('Assignment not found');
    const part = await db.Part.findById(input.partId);
    if (!part) throw notFound('Part not found');

    const warnings = await warningsForMove(
      db,
      String(assignment.seasonId),
      input.musicianId,
      input.partId,
    );

    assignment.partId = part._id;
    assignment.instrumentId = part.instrumentId;
    assignment.musicianId = new Types.ObjectId(input.musicianId);
    assignment.source = 'manual';
    // A manual move detaches the row from the run that produced it and resets
    // the musician's confirmation, since they are now on a different part.
    assignment.runId = null;
    assignment.confirmation = { status: 'pending', respondedAt: null, note: null };
    await assignment.save();

    res.json({ id: String(assignment._id), warnings });
  }),
);

assignmentsRouter.post(
  '/assignments/:id/lock',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const locked = req.body?.locked !== false;
    const assignment = await db.Assignment.findByIdAndUpdate(
      req.params.id,
      { $set: { locked } },
      { new: true },
    );
    if (!assignment) throw notFound('Assignment not found');
    res.json({ id: String(assignment._id), locked: assignment.locked });
  }),
);

assignmentsRouter.delete(
  '/assignments/:id',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const deleted = await db.Assignment.findByIdAndDelete(req.params.id);
    if (!deleted) throw notFound('Assignment not found');
    res.status(204).end();
  }),
);

/** Emails each musician the parts they currently hold. */
assignmentsRouter.post(
  '/seasons/:seasonId/notify',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const seasonId = new Types.ObjectId(req.params.seasonId);
    const [assignments, parts, songs, instruments, musicians] = await Promise.all([
      db.Assignment.find({ seasonId }).lean(),
      db.Part.find({ seasonId }).lean(),
      db.Song.find({ seasonId }).lean(),
      db.Instrument.find({}).lean(),
      db.Musician.find({ active: true }).lean(),
    ]);

    const partById = new Map(parts.map((p) => [String(p._id), p]));
    const songById = new Map(songs.map((s) => [String(s._id), s]));
    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));
    const mailer = emailProvider();

    let sent = 0;
    for (const musician of musicians) {
      const lines = assignments
        .filter((a) => String(a.musicianId) === String(musician._id))
        .map((a) => {
          const part = partById.get(String(a.partId));
          if (!part) return null;
          const song = songById.get(String(part.songId))?.title ?? 'Unknown song';
          const instrument = instrumentById.get(String(part.instrumentId))?.name ?? 'Unknown';
          return `${song} — ${instrument} ${ordinalPartLabel(part.partNumber)}`;
        })
        .filter((l): l is string => Boolean(l));
      if (lines.length === 0) continue;
      await mailer.send(
        assignmentNoticeEmail({
          to: musician.email,
          musicianName: musician.name,
          tenantName: tenant.name,
          lines,
        }),
      );
      sent += 1;
    }

    res.json({ notified: sent });
  }),
);
