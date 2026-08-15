import {
  difficultyRank,
  experienceRank,
  type Difficulty,
  type ExperienceLevel,
} from './domain.js';

/** A musician as the engine sees them: capability plus stated preferences. */
export interface EngineMusician {
  id: string;
  /** instrumentId -> rank (1 = most preferred). Only instruments they play. */
  preferences: { instrumentId: string; rank: number }[];
  /**
   * false means "keep me on one instrument for the whole concert" -- extra
   * parts on that same instrument stay allowed.
   */
  willingToDouble: boolean | null;
  experienceLevel: ExperienceLevel | null;
  difficultyPreference: Difficulty | null;
  /** Optional hard cap on total parts for this musician. */
  maxAssignments?: number;
}

export interface EnginePart {
  id: string;
  songId: string;
  instrumentId: string;
  partNumber: number;
  difficulty: Difficulty;
  /** Players needed to consider the part covered. */
  minPlayers: number;
  /** Players the part can hold at most (divisi / section doubling). */
  maxPlayers: number;
  /** Display order, used only to keep output stable. */
  order: number;
}

export interface EngineAssignment {
  partId: string;
  musicianId: string;
  instrumentId: string;
  /** Pre-existing assignments the director pinned before the run. */
  locked: boolean;
}

export interface AssignmentWeights {
  /** Reward for landing a musician on a highly ranked instrument. */
  preference: number;
  /** Reward for matching the part difficulty to what they asked for. */
  difficultyMatch: number;
  /** Reward for experience that suits the part's difficulty. */
  experienceFit: number;
  /** Penalty per part already held -- this is what produces even spread. */
  load: number;
  /** Penalty for putting a musician on a second distinct instrument. */
  secondInstrument: number;
}

export const defaultWeights: AssignmentWeights = {
  preference: 100,
  difficultyMatch: 30,
  experienceFit: 20,
  load: 45,
  secondInstrument: 15,
};

export interface AssignmentRunOptions {
  weights?: Partial<AssignmentWeights>;
  /** Ceiling on parts per musician when none is set on the musician. */
  defaultMaxAssignments?: number;
  /** Fill parts beyond minPlayers when musicians are still under-loaded. */
  fillToMaxPlayers?: boolean;
}

export type WarningCode =
  | 'part_unfilled'
  | 'part_no_candidates'
  | 'musician_unassigned'
  | 'doubling_declined'
  | 'over_capacity'
  | 'instrument_mismatch';

export interface AssignmentWarning {
  code: WarningCode;
  message: string;
  partId?: string;
  musicianId?: string;
}

export interface AssignmentRunResult {
  assignments: EngineAssignment[];
  warnings: AssignmentWarning[];
  stats: {
    musiciansConsidered: number;
    musiciansAssigned: number;
    partsTotal: number;
    partsFilled: number;
    partsUnfilled: number;
    assignmentsCreated: number;
    minAssignmentsPerMusician: number;
    maxAssignmentsPerMusician: number;
    avgAssignmentsPerMusician: number;
    /** Share of assignments landing on the musician's top-ranked instrument. */
    topPreferenceSatisfiedPct: number;
  };
}

export interface MusicianState {
  musician: EngineMusician;
  rankByInstrument: Map<string, number>;
  assignedPartIds: Set<string>;
  instrumentsPlayed: Set<string>;
}

function buildState(musicians: EngineMusician[]): Map<string, MusicianState> {
  const states = new Map<string, MusicianState>();
  for (const musician of musicians) {
    states.set(musician.id, {
      musician,
      rankByInstrument: new Map(musician.preferences.map((p) => [p.instrumentId, p.rank])),
      assignedPartIds: new Set(),
      instrumentsPlayed: new Set(),
    });
  }
  return states;
}

function maxAssignmentsFor(state: MusicianState, fallback: number): number {
  return state.musician.maxAssignments ?? fallback;
}

/**
 * Whether a musician may take a part at all. Capability and consent are hard
 * constraints; everything softer is expressed through the score instead.
 */
function isEligible(state: MusicianState, part: EnginePart, defaultMax: number): boolean {
  if (!state.rankByInstrument.has(part.instrumentId)) return false;
  if (state.assignedPartIds.has(part.id)) return false;
  if (state.assignedPartIds.size >= maxAssignmentsFor(state, defaultMax)) return false;
  const wouldBeNewInstrument = !state.instrumentsPlayed.has(part.instrumentId);
  if (
    wouldBeNewInstrument &&
    state.instrumentsPlayed.size > 0 &&
    state.musician.willingToDouble === false
  ) {
    return false;
  }
  return true;
}

export function scoreCandidate(
  state: MusicianState,
  part: EnginePart,
  weights: AssignmentWeights,
): number {
  const rank = state.rankByInstrument.get(part.instrumentId);
  if (rank === undefined) return Number.NEGATIVE_INFINITY;

  // Rank 1 scores full preference weight and each step down decays.
  let score = weights.preference / rank;

  const wanted = state.musician.difficultyPreference;
  if (wanted) {
    const gap = Math.abs(difficultyRank[wanted] - difficultyRank[part.difficulty]);
    score += weights.difficultyMatch - gap * weights.difficultyMatch;
  }

  const experience = state.musician.experienceLevel;
  if (experience) {
    // Experience at or above the part's demand is fine; below it is penalised.
    const headroom = experienceRank[experience] - difficultyRank[part.difficulty];
    score += headroom >= 0 ? weights.experienceFit : headroom * weights.experienceFit;
  }

  score -= state.assignedPartIds.size * weights.load;

  if (state.instrumentsPlayed.size > 0 && !state.instrumentsPlayed.has(part.instrumentId)) {
    score -= weights.secondInstrument;
  }

  return score;
}

/**
 * Distributes musicians across parts as evenly as possible. Intended to be
 * invoked only by an explicit director action -- nothing here schedules itself.
 *
 * Strategy: fill scarce parts first (fewest capable musicians), pick the
 * highest scoring eligible musician for each slot, then run swap-based
 * rebalancing passes until the load spread cannot be narrowed further.
 * Deterministic for a given input, so re-runs are diffable.
 */
export function runAssignment(
  musicians: EngineMusician[],
  parts: EnginePart[],
  existing: EngineAssignment[] = [],
  options: AssignmentRunOptions = {},
): AssignmentRunResult {
  const weights = { ...defaultWeights, ...options.weights };
  const defaultMax = options.defaultMaxAssignments ?? Number.MAX_SAFE_INTEGER;
  const states = buildState(musicians);
  const warnings: AssignmentWarning[] = [];

  const assignments: EngineAssignment[] = [];
  const partLoad = new Map<string, number>(parts.map((p) => [p.id, 0]));
  const partById = new Map(parts.map((p) => [p.id, p]));

  // Locked assignments are preserved verbatim and count toward every budget.
  for (const locked of existing.filter((a) => a.locked)) {
    const state = states.get(locked.musicianId);
    const part = partById.get(locked.partId);
    if (!state || !part) continue;
    assignments.push(locked);
    state.assignedPartIds.add(part.id);
    state.instrumentsPlayed.add(locked.instrumentId);
    partLoad.set(part.id, (partLoad.get(part.id) ?? 0) + 1);
  }

  const candidateCount = (part: EnginePart): number => {
    let count = 0;
    for (const state of states.values()) {
      if (state.rankByInstrument.has(part.instrumentId)) count += 1;
    }
    return count;
  };

  // Scarcity first: a part only three people can play must be filled before
  // those three get consumed by parts everyone can cover.
  const orderedParts = [...parts].sort((a, b) => {
    const scarcity = candidateCount(a) - candidateCount(b);
    if (scarcity !== 0) return scarcity;
    if (a.difficulty !== b.difficulty) {
      return difficultyRank[b.difficulty] - difficultyRank[a.difficulty];
    }
    return a.order - b.order || a.partNumber - b.partNumber;
  });

  const fillPass = (target: (part: EnginePart) => number): void => {
    for (const part of orderedParts) {
      while ((partLoad.get(part.id) ?? 0) < target(part)) {
        let best: MusicianState | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const state of states.values()) {
          if (!isEligible(state, part, defaultMax)) continue;
          const score = scoreCandidate(state, part, weights);
          // Ties break on id so runs are reproducible.
          if (
            score > bestScore ||
            (score === bestScore && best !== null && state.musician.id < best.musician.id)
          ) {
            best = state;
            bestScore = score;
          }
        }
        if (!best) break;
        assignments.push({
          partId: part.id,
          musicianId: best.musician.id,
          instrumentId: part.instrumentId,
          locked: false,
        });
        best.assignedPartIds.add(part.id);
        best.instrumentsPlayed.add(part.instrumentId);
        partLoad.set(part.id, (partLoad.get(part.id) ?? 0) + 1);
      }
    }
  };

  fillPass((part) => part.minPlayers);

  // Only widen parts past minPlayers once every part has its minimum, so
  // surplus players get seated rather than left out.
  if (options.fillToMaxPlayers !== false) {
    const anyUnfilled = parts.some((p) => (partLoad.get(p.id) ?? 0) < p.minPlayers);
    if (!anyUnfilled) {
      const idle = [...states.values()].filter((s) => s.assignedPartIds.size === 0);
      if (idle.length > 0) fillPass((part) => part.maxPlayers);
    }
  }

  rebalance(states, assignments, partById, partLoad, weights, defaultMax);

  for (const part of parts) {
    const load = partLoad.get(part.id) ?? 0;
    if (load >= part.minPlayers) continue;
    const capable = candidateCount(part);
    warnings.push(
      capable === 0
        ? {
            code: 'part_no_candidates',
            partId: part.id,
            message: `No musician plays the instrument required for part ${part.partNumber}.`,
          }
        : {
            code: 'part_unfilled',
            partId: part.id,
            message: `Part ${part.partNumber} has ${load} of ${part.minPlayers} players.`,
          },
    );
  }

  for (const state of states.values()) {
    if (state.assignedPartIds.size === 0) {
      warnings.push({
        code: 'musician_unassigned',
        musicianId: state.musician.id,
        message: 'Musician was not placed on any part.',
      });
    }
  }

  return { assignments, warnings, stats: buildStats(states, assignments, parts, partLoad) };
}

/**
 * Narrows the gap between the busiest and least busy musician by moving parts
 * from over-loaded to under-loaded players, but only when the move does not
 * reduce total score by more than the balance gain is worth.
 */
function rebalance(
  states: Map<string, MusicianState>,
  assignments: EngineAssignment[],
  partById: Map<string, EnginePart>,
  partLoad: Map<string, number>,
  weights: AssignmentWeights,
  defaultMax: number,
): void {
  const maxPasses = 20;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const loads = [...states.values()].map((s) => s.assignedPartIds.size);
    if (loads.length === 0) return;
    const min = Math.min(...loads);
    const max = Math.max(...loads);
    if (max - min <= 1) return;

    let moved = false;
    const overloaded = [...states.values()]
      .filter((s) => s.assignedPartIds.size === max)
      .sort((a, b) => a.musician.id.localeCompare(b.musician.id));
    const underloaded = [...states.values()]
      .filter((s) => s.assignedPartIds.size === min)
      .sort((a, b) => a.musician.id.localeCompare(b.musician.id));

    for (const donor of overloaded) {
      for (const receiver of underloaded) {
        const movable = assignments.filter(
          (a) => !a.locked && a.musicianId === donor.musician.id,
        );
        for (const assignment of movable) {
          const part = partById.get(assignment.partId);
          if (!part) continue;
          if (!isEligible(receiver, part, defaultMax)) continue;

          const before = scoreCandidate(donor, part, weights);
          const after = scoreCandidate(receiver, part, weights);
          // The receiver is strictly less loaded, so accept any move whose
          // score loss is smaller than the load penalty it removes.
          if (after + weights.load < before) continue;

          assignment.musicianId = receiver.musician.id;
          donor.assignedPartIds.delete(part.id);
          receiver.assignedPartIds.add(part.id);
          recomputeInstruments(donor, assignments, partById);
          recomputeInstruments(receiver, assignments, partById);
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) return;
  }
}

function recomputeInstruments(
  state: MusicianState,
  assignments: EngineAssignment[],
  partById: Map<string, EnginePart>,
): void {
  state.instrumentsPlayed = new Set(
    assignments
      .filter((a) => a.musicianId === state.musician.id)
      .map((a) => partById.get(a.partId)?.instrumentId)
      .filter((id): id is string => Boolean(id)),
  );
}

function buildStats(
  states: Map<string, MusicianState>,
  assignments: EngineAssignment[],
  parts: EnginePart[],
  partLoad: Map<string, number>,
): AssignmentRunResult['stats'] {
  const loads = [...states.values()].map((s) => s.assignedPartIds.size);
  const assigned = loads.filter((l) => l > 0).length;
  const partsFilled = parts.filter((p) => (partLoad.get(p.id) ?? 0) >= p.minPlayers).length;

  let topPreference = 0;
  for (const assignment of assignments) {
    const state = states.get(assignment.musicianId);
    if (state?.rankByInstrument.get(assignment.instrumentId) === 1) topPreference += 1;
  }

  return {
    musiciansConsidered: states.size,
    musiciansAssigned: assigned,
    partsTotal: parts.length,
    partsFilled,
    partsUnfilled: parts.length - partsFilled,
    assignmentsCreated: assignments.length,
    minAssignmentsPerMusician: loads.length ? Math.min(...loads) : 0,
    maxAssignmentsPerMusician: loads.length ? Math.max(...loads) : 0,
    avgAssignmentsPerMusician: loads.length
      ? Number((loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(2))
      : 0,
    topPreferenceSatisfiedPct: assignments.length
      ? Math.round((topPreference / assignments.length) * 100)
      : 0,
  };
}

/**
 * Validates a director's manual drag-and-drop move. Returns advisory warnings
 * rather than rejections: the director always outranks the engine.
 */
export function validateManualMove(
  musician: EngineMusician,
  part: EnginePart,
  currentAssignments: EngineAssignment[],
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];
  const plays = musician.preferences.some((p) => p.instrumentId === part.instrumentId);
  if (!plays) {
    warnings.push({
      code: 'instrument_mismatch',
      musicianId: musician.id,
      partId: part.id,
      message: 'Musician did not list this instrument on their intake form.',
    });
  }

  const held = currentAssignments.filter((a) => a.musicianId === musician.id);
  const otherInstruments = new Set(
    held.filter((a) => a.partId !== part.id).map((a) => a.instrumentId),
  );
  if (
    musician.willingToDouble === false &&
    otherInstruments.size > 0 &&
    !otherInstruments.has(part.instrumentId)
  ) {
    warnings.push({
      code: 'doubling_declined',
      musicianId: musician.id,
      partId: part.id,
      message: 'Musician asked to stay on a single instrument for the concert.',
    });
  }

  const onPart = currentAssignments.filter(
    (a) => a.partId === part.id && a.musicianId !== musician.id,
  ).length;
  if (onPart + 1 > part.maxPlayers) {
    warnings.push({
      code: 'over_capacity',
      partId: part.id,
      message: `Part holds at most ${part.maxPlayers} player(s).`,
    });
  }

  return warnings;
}
