import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { ordinalPartLabel } from '@score-assign/shared';
import { can, requireAuth, requireCapability, sectionScope, tenantContext } from '../middleware/context.js';
import { asyncRoute } from '../middleware/errors.js';

export const rosterRouter = Router();
rosterRouter.use(requireAuth);

/**
 * The ensemble roster. Contact details are attached only for callers holding
 * roster.readContact, so a director's browser never receives an address: the
 * redaction happens here rather than in the UI.
 */
rosterRouter.get(
  '/',
  requireCapability('roster.read'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const showContact = can(req, 'roster.readContact');
    const scope = sectionScope(req);
    const seasonId = req.query.seasonId;

    const assignmentFilter =
      typeof seasonId === 'string' && seasonId
        ? { seasonId: new Types.ObjectId(seasonId) }
        : {};

    const [musicians, assignments, parts, songs, instruments] = await Promise.all([
      db.Musician.find({}).sort({ name: 1 }).lean(),
      db.Assignment.find(assignmentFilter).lean(),
      db.Part.find({}).lean(),
      db.Song.find({}).lean(),
      db.Instrument.find({}).sort({ order: 1 }).lean(),
    ]);

    const partById = new Map(parts.map((p) => [String(p._id), p]));
    const songById = new Map(songs.map((s) => [String(s._id), s]));
    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));

    const inScope = (instrumentId: string): boolean => scope === null || scope.includes(instrumentId);

    const rows = musicians
      .map((musician) => {
        const held = assignments
          .filter((a) => String(a.musicianId) === String(musician._id))
          .map((a) => {
            const part = partById.get(String(a.partId));
            if (!part) return null;
            const instrumentId = String(part.instrumentId);
            return {
              assignmentId: String(a._id),
              partId: String(part._id),
              instrumentId,
              songTitle: songById.get(String(part.songId))?.title ?? 'Unknown song',
              instrumentName: instrumentById.get(instrumentId)?.name ?? 'Unknown',
              partLabel: ordinalPartLabel(part.partNumber),
              difficulty: part.difficulty,
              locked: a.locked,
              confirmation: a.confirmation.status,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        const sections = musician.instruments
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((pref) => ({
            instrumentId: String(pref.instrumentId),
            instrumentName: instrumentById.get(String(pref.instrumentId))?.name ?? 'Unknown',
            rank: pref.rank,
          }));

        return {
          id: String(musician._id),
          name: musician.name,
          sections,
          parts: held,
          partCount: held.length,
          willingToDouble: musician.willingToDouble,
          experienceLevel: musician.experienceLevel,
          difficultyPreference: musician.difficultyPreference,
          maxAssignments: musician.maxAssignments,
          active: musician.active,
          ...(showContact ? { email: musician.email, phone: musician.phone } : {}),
        };
      })
      .filter(
        (row) =>
          scope === null ||
          row.sections.some((s) => inScope(s.instrumentId)) ||
          row.parts.some((p) => inScope(p.instrumentId)),
      );

    res.json({
      includesContact: showContact,
      sectionScope: scope,
      instruments: instruments.map((i) => ({ id: String(i._id), name: i.name })),
      musicians: rows,
    });
  }),
);
