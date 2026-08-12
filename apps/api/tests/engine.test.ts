import { describe, expect, it } from 'vitest';
import {
  runAssignment,
  validateManualMove,
  type EngineMusician,
  type EnginePart,
} from '@score-assign/shared';

const PICC = 'picc';
const FLUTE = 'flute';
const ALTO = 'alto';

function part(id: string, instrumentId: string, partNumber: number, extra: Partial<EnginePart> = {}): EnginePart {
  return {
    id,
    songId: 'song1',
    instrumentId,
    partNumber,
    difficulty: 'moderate',
    minPlayers: 1,
    maxPlayers: 1,
    order: partNumber,
    ...extra,
  };
}

function musician(id: string, instruments: string[], extra: Partial<EngineMusician> = {}): EngineMusician {
  return {
    id,
    preferences: instruments.map((instrumentId, index) => ({ instrumentId, rank: index + 1 })),
    willingToDouble: null,
    experienceLevel: null,
    difficultyPreference: null,
    ...extra,
  };
}

describe('runAssignment', () => {
  it('fills every part when enough capable musicians exist', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', FLUTE, 2), part('p3', ALTO, 1)];
    const musicians = [
      musician('m1', [FLUTE]),
      musician('m2', [FLUTE]),
      musician('m3', [ALTO]),
    ];

    const result = runAssignment(musicians, parts);

    expect(result.stats.partsUnfilled).toBe(0);
    expect(result.assignments).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it('never places a musician on an instrument they do not play', () => {
    const parts = [part('p1', PICC, 1), part('p2', FLUTE, 1)];
    const musicians = [musician('m1', [FLUTE]), musician('m2', [FLUTE])];

    const result = runAssignment(musicians, parts);

    expect(result.assignments.every((a) => a.instrumentId === FLUTE)).toBe(true);
    expect(result.warnings.some((w) => w.code === 'part_no_candidates' && w.partId === 'p1')).toBe(true);
  });

  it('spreads parts evenly rather than loading one musician', () => {
    const parts = Array.from({ length: 6 }, (_, i) => part(`p${i}`, FLUTE, i + 1));
    const musicians = ['m1', 'm2', 'm3'].map((id) => musician(id, [FLUTE]));

    const result = runAssignment(musicians, parts);

    expect(result.stats.maxAssignmentsPerMusician - result.stats.minAssignmentsPerMusician).toBeLessThanOrEqual(1);
    expect(result.stats.assignmentsCreated).toBe(6);
  });

  it('lets a multi-instrument musician double across instruments', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', PICC, 1)];
    const musicians = [musician('m1', [FLUTE, PICC], { willingToDouble: true })];

    const result = runAssignment(musicians, parts);

    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map((a) => a.instrumentId))).toEqual(new Set([FLUTE, PICC]));
  });

  it('keeps a musician who declined doubling on a single instrument', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', PICC, 1)];
    const musicians = [musician('m1', [FLUTE, PICC], { willingToDouble: false })];

    const result = runAssignment(musicians, parts);

    const instruments = new Set(result.assignments.map((a) => a.instrumentId));
    expect(instruments.size).toBe(1);
    expect(result.warnings.some((w) => w.code === 'part_unfilled')).toBe(true);
  });

  it('still allows extra parts on the same instrument when doubling is declined', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', FLUTE, 2)];
    const musicians = [musician('m1', [FLUTE], { willingToDouble: false })];

    const result = runAssignment(musicians, parts);

    expect(result.assignments).toHaveLength(2);
  });

  it('prefers the musician who ranked the instrument first', () => {
    const parts = [part('p1', PICC, 1)];
    const musicians = [
      musician('m1', [FLUTE, PICC]), // piccolo is second choice
      musician('m2', [PICC, FLUTE]), // piccolo is first choice
    ];

    const result = runAssignment(musicians, parts);

    expect(result.assignments[0]?.musicianId).toBe('m2');
  });

  it('fills a scarce instrument before its only player is used elsewhere', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', ALTO, 1)];
    // m1 is the only alto player and also plays flute.
    const musicians = [musician('m1', [FLUTE, ALTO], { willingToDouble: false }), musician('m2', [FLUTE])];

    const result = runAssignment(musicians, parts);

    expect(result.assignments.find((a) => a.partId === 'p2')?.musicianId).toBe('m1');
    expect(result.assignments.find((a) => a.partId === 'p1')?.musicianId).toBe('m2');
  });

  it('respects a per-musician assignment cap', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', FLUTE, 2), part('p3', FLUTE, 3)];
    const musicians = [musician('m1', [FLUTE], { maxAssignments: 1 })];

    const result = runAssignment(musicians, parts);

    expect(result.assignments).toHaveLength(1);
  });

  it('leaves locked assignments untouched', () => {
    const parts = [part('p1', FLUTE, 1), part('p2', FLUTE, 2)];
    const musicians = [musician('m1', [FLUTE]), musician('m2', [FLUTE])];
    const locked = [{ partId: 'p1', musicianId: 'm2', instrumentId: FLUTE, locked: true }];

    const result = runAssignment(musicians, parts, locked);

    expect(result.assignments.find((a) => a.partId === 'p1')?.musicianId).toBe('m2');
    expect(result.assignments.find((a) => a.partId === 'p2')?.musicianId).toBe('m1');
  });

  it('seats surplus musicians on parts that allow extra players', () => {
    const parts = [part('p1', FLUTE, 1, { maxPlayers: 3 })];
    const musicians = ['m1', 'm2', 'm3'].map((id) => musician(id, [FLUTE]));

    const result = runAssignment(musicians, parts);

    expect(result.assignments).toHaveLength(3);
    expect(result.stats.musiciansAssigned).toBe(3);
  });

  it('reports musicians it could not place', () => {
    const parts = [part('p1', FLUTE, 1)];
    const musicians = [musician('m1', [FLUTE]), musician('m2', [ALTO])];

    const result = runAssignment(musicians, parts);

    expect(result.warnings.some((w) => w.code === 'musician_unassigned' && w.musicianId === 'm2')).toBe(true);
  });

  it('produces identical output for identical input', () => {
    const parts = Array.from({ length: 8 }, (_, i) => part(`p${i}`, i % 2 === 0 ? FLUTE : ALTO, (i % 4) + 1));
    const musicians = ['m1', 'm2', 'm3', 'm4'].map((id) => musician(id, [FLUTE, ALTO], { willingToDouble: true }));

    const first = runAssignment(musicians, parts);
    const second = runAssignment(musicians, parts);

    expect(second.assignments).toEqual(first.assignments);
  });

  it('matches difficulty preference when candidates are otherwise equal', () => {
    const parts = [part('p1', FLUTE, 1, { difficulty: 'challenging' })];
    const musicians = [
      musician('m1', [FLUTE], { difficultyPreference: 'easier', experienceLevel: 'intermediate' }),
      musician('m2', [FLUTE], { difficultyPreference: 'challenging', experienceLevel: 'graduate_professional' }),
    ];

    const result = runAssignment(musicians, parts);

    expect(result.assignments[0]?.musicianId).toBe('m2');
  });
});

describe('validateManualMove', () => {
  it('warns but does not block an instrument the musician never listed', () => {
    const warnings = validateManualMove(musician('m1', [FLUTE]), part('p1', PICC, 1), []);
    expect(warnings.map((w) => w.code)).toContain('instrument_mismatch');
  });

  it('warns when a move would force doubling on someone who declined it', () => {
    const warnings = validateManualMove(
      musician('m1', [FLUTE, PICC], { willingToDouble: false }),
      part('p2', PICC, 1),
      [{ partId: 'p1', musicianId: 'm1', instrumentId: FLUTE, locked: false }],
    );
    expect(warnings.map((w) => w.code)).toContain('doubling_declined');
  });

  it('warns when the part is already at capacity', () => {
    const warnings = validateManualMove(musician('m2', [FLUTE]), part('p1', FLUTE, 1, { maxPlayers: 1 }), [
      { partId: 'p1', musicianId: 'm1', instrumentId: FLUTE, locked: false },
    ]);
    expect(warnings.map((w) => w.code)).toContain('over_capacity');
  });

  it('returns no warnings for a clean move', () => {
    const warnings = validateManualMove(musician('m1', [FLUTE]), part('p1', FLUTE, 1), []);
    expect(warnings).toEqual([]);
  });
});
