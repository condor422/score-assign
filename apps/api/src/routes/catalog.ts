import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  musicianSchema,
  ordinalPartLabel,
  partSchema,
  partsBulkSchema,
  seasonSchema,
  songSchema,
} from '@score-assign/shared';
import { requireAuth, requireRole, tenantContext } from '../middleware/context.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { assertCapacity, currentUsage, effectiveLimits } from '../middleware/entitlements.js';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get(
  '/instruments',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const instruments = await db.Instrument.find({}).sort({ order: 1 }).lean();
    res.json(instruments.map((i) => ({ id: String(i._id), name: i.name, key: i.key, active: i.active })));
  }),
);

catalogRouter.post(
  '/instruments',
  requireRole('admin'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw badRequest('An instrument name is required');
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const count = await db.Instrument.countDocuments({});
    const created = await db.Instrument.create({ key, name, order: count + 1, active: true });
    res.status(201).json({ id: String(created._id), name: created.name, key: created.key });
  }),
);

catalogRouter.get(
  '/seasons',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const seasons = await db.Season.find({}).sort({ createdAt: -1 }).lean();
    res.json(
      seasons.map((s) => ({
        id: String(s._id),
        name: s.name,
        status: s.status,
        concertDate: s.concertDate,
        venue: s.venue,
        intakeFormId: s.intakeFormId ? String(s.intakeFormId) : null,
      })),
    );
  }),
);

catalogRouter.post(
  '/seasons',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = seasonSchema.parse(req.body);
    const created = await db.Season.create({
      name: input.name,
      concertDate: input.concertDate ?? null,
      venue: input.venue ?? null,
      notes: input.notes ?? null,
    });
    res.status(201).json({ id: String(created._id), name: created.name });
  }),
);

catalogRouter.get(
  '/seasons/:seasonId/songs',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const songs = await db.Song.find({ seasonId: req.params.seasonId }).sort({ order: 1 }).lean();
    res.json(
      songs.map((s) => ({
        id: String(s._id),
        title: s.title,
        composer: s.composer,
        arranger: s.arranger,
        order: s.order,
      })),
    );
  }),
);

catalogRouter.post(
  '/seasons/:seasonId/songs',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = songSchema.parse(req.body);
    await assertCapacity(tenant, db, 'songs');
    const count = await db.Song.countDocuments({ seasonId: req.params.seasonId });
    const created = await db.Song.create({
      seasonId: new Types.ObjectId(req.params.seasonId),
      title: input.title,
      composer: input.composer ?? null,
      arranger: input.arranger ?? null,
      notes: input.notes ?? null,
      order: input.order ?? count,
    });
    res.status(201).json({ id: String(created._id), title: created.title });
  }),
);

/** Parts joined with song and instrument names, ready for the board UI. */
catalogRouter.get(
  '/seasons/:seasonId/parts',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const seasonId = new Types.ObjectId(req.params.seasonId);
    const [parts, songs, instruments] = await Promise.all([
      db.Part.find({ seasonId }).sort({ order: 1, partNumber: 1 }).lean(),
      db.Song.find({ seasonId }).lean(),
      db.Instrument.find({}).lean(),
    ]);
    const songById = new Map(songs.map((s) => [String(s._id), s]));
    const instrumentById = new Map(instruments.map((i) => [String(i._id), i]));

    res.json(
      parts.map((p) => ({
        id: String(p._id),
        songId: String(p.songId),
        songTitle: songById.get(String(p.songId))?.title ?? 'Unknown song',
        instrumentId: String(p.instrumentId),
        instrumentName: instrumentById.get(String(p.instrumentId))?.name ?? 'Unknown instrument',
        partNumber: p.partNumber,
        partLabel: ordinalPartLabel(p.partNumber),
        difficulty: p.difficulty,
        minPlayers: p.minPlayers,
        maxPlayers: p.maxPlayers,
        order: p.order,
      })),
    );
  }),
);

catalogRouter.post(
  '/seasons/:seasonId/parts',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = partSchema.parse(req.body);
    if (input.maxPlayers < input.minPlayers) {
      throw badRequest('maxPlayers cannot be lower than minPlayers');
    }
    await assertCapacity(tenant, db, 'parts');
    const count = await db.Part.countDocuments({ seasonId: req.params.seasonId });
    const created = await db.Part.create({
      seasonId: new Types.ObjectId(req.params.seasonId),
      songId: new Types.ObjectId(input.songId),
      instrumentId: new Types.ObjectId(input.instrumentId),
      partNumber: input.partNumber,
      difficulty: input.difficulty,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      notes: input.notes ?? null,
      order: count,
    });
    res.status(201).json({ id: String(created._id), partLabel: ordinalPartLabel(created.partNumber) });
  }),
);

/** Creates parts 1..count for one instrument, how a score is normally entered. */
catalogRouter.post(
  '/seasons/:seasonId/parts/bulk',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = partsBulkSchema.parse(req.body);
    if (input.maxPlayers < input.minPlayers) {
      throw badRequest('maxPlayers cannot be lower than minPlayers');
    }
    await assertCapacity(tenant, db, 'parts', input.count);

    const existing = await db.Part.countDocuments({ seasonId: req.params.seasonId });
    const docs = Array.from({ length: input.count }, (_, index) => ({
      seasonId: new Types.ObjectId(req.params.seasonId),
      songId: new Types.ObjectId(input.songId),
      instrumentId: new Types.ObjectId(input.instrumentId),
      partNumber: index + 1,
      difficulty: input.difficulty,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      notes: null,
      order: existing + index,
    }));
    const created = await db.Part.insertMany(docs, { ordered: false });
    res.status(201).json({ created: created.length });
  }),
);

catalogRouter.delete(
  '/parts/:partId',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const part = await db.Part.findByIdAndDelete(req.params.partId);
    if (!part) throw notFound('Part not found');
    await db.Assignment.deleteMany({ partId: part._id });
    res.status(204).end();
  }),
);

catalogRouter.get(
  '/musicians',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const musicians = await db.Musician.find({}).sort({ name: 1 }).lean();
    res.json(
      musicians.map((m) => ({
        id: String(m._id),
        name: m.name,
        email: m.email,
        phone: m.phone,
        instruments: m.instruments,
        willingToDouble: m.willingToDouble,
        experienceLevel: m.experienceLevel,
        difficultyPreference: m.difficultyPreference,
        maxAssignments: m.maxAssignments,
        active: m.active,
      })),
    );
  }),
);

/** Manual entry for a musician who registered by phone or paper. */
catalogRouter.post(
  '/musicians',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = musicianSchema.parse(req.body);
    await assertCapacity(tenant, db, 'musicians');
    const created = await db.Musician.create({
      ...input,
      phone: input.phone ?? null,
      sourceResponseIds: [],
    });
    res.status(201).json({ id: String(created._id), name: created.name });
  }),
);

catalogRouter.put(
  '/musicians/:id',
  requireRole('director'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = musicianSchema.parse(req.body);
    const updated = await db.Musician.findByIdAndUpdate(
      req.params.id,
      { $set: { ...input, phone: input.phone ?? null } },
      { new: true },
    );
    if (!updated) throw notFound('Musician not found');
    res.json({ id: String(updated._id), name: updated.name });
  }),
);

/** Live usage against the tenant's effective plan limits, for the UI meters. */
catalogRouter.get(
  '/usage',
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const usage = await currentUsage(db);
    res.json({ usage, limits: effectiveLimits(tenant), plan: tenant.plan, status: tenant.status });
  }),
);
