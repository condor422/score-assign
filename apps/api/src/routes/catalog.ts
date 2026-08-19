import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  instrumentReorderSchema,
  instrumentSchema,
  instrumentUpdateSchema,
  musicianSchema,
  ordinalPartLabel,
  organizationSchema,
  partSchema,
  partsBulkSchema,
  seasonSchema,
  songSchema,
} from '@score-assign/shared';
import { can, requireAuth, requireCapability, tenantContext } from '../middleware/context.js';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { assertCapacity, currentUsage, effectiveLimits } from '../middleware/entitlements.js';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

/** Slug used to keep instrument names unique within a tenant. */
function instrumentKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Instrumentation is per-tenant data seeded from the flute-choir defaults, not a
 * hard-coded list. Pickers ask for the active instruments; the admin module asks
 * for everything so retired ones can be seen and re-enabled.
 */
catalogRouter.get(
  '/instruments',
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const filter = req.query.includeInactive === 'true' ? {} : { active: true };
    const instruments = await db.Instrument.find(filter).sort({ order: 1 }).lean();
    res.json(
      instruments.map((i) => ({
        id: String(i._id),
        name: i.name,
        key: i.key,
        order: i.order,
        active: i.active,
      })),
    );
  }),
);

catalogRouter.post(
  '/instruments',
  requireCapability('settings.manage'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = instrumentSchema.parse(req.body);
    const key = instrumentKey(input.name);
    if (!key) throw badRequest('Use at least one letter or digit in the instrument name');
    if (await db.Instrument.exists({ key })) throw badRequest('That instrument already exists');
    const count = await db.Instrument.countDocuments({});
    const created = await db.Instrument.create({
      key,
      name: input.name,
      order: count + 1,
      active: true,
    });
    res.status(201).json({ id: String(created._id), name: created.name, key: created.key });
  }),
);

/**
 * Rename and retire only. Instruments are never deleted because parts and past
 * assignments point at them; deactivating hides an instrument from pickers while
 * leaving previous seasons readable.
 */
catalogRouter.patch(
  '/instruments/:id',
  requireCapability('settings.manage'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = instrumentUpdateSchema.parse(req.body);
    const instrument = await db.Instrument.findById(req.params.id);
    if (!instrument) throw notFound('Instrument not found');

    if (input.name !== undefined) instrument.name = input.name;
    if (input.active !== undefined) instrument.active = input.active;
    await instrument.save();

    const partCount = await db.Part.countDocuments({ instrumentId: instrument._id });
    res.json({
      id: String(instrument._id),
      name: instrument.name,
      active: instrument.active,
      partCount,
    });
  }),
);

catalogRouter.post(
  '/instruments/reorder',
  requireCapability('settings.manage'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = instrumentReorderSchema.parse(req.body);
    const ids = input.instrumentIds.map((id) => new Types.ObjectId(id));
    const known = await db.Instrument.countDocuments({ _id: { $in: ids } });
    if (known !== ids.length) throw badRequest('Unknown instrument in that order');

    await Promise.all(
      ids.map((id, index) => db.Instrument.updateOne({ _id: id }, { $set: { order: index + 1 } })),
    );
    res.json({ ordered: ids.length });
  }),
);

/** Organisation profile for the admin module's Organisation tab. */
catalogRouter.get(
  '/organization',
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    res.json({
      id: String(tenant._id),
      slug: tenant.slug,
      name: tenant.name,
      contactEmail: tenant.contactEmail,
      timezone: tenant.timezone,
      plan: tenant.plan,
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      currentPeriodEnd: tenant.currentPeriodEnd,
      limits: effectiveLimits(tenant),
    });
  }),
);

catalogRouter.patch(
  '/organization',
  requireCapability('settings.manage'),
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const input = organizationSchema.parse(req.body);
    const { Tenant } = platformModels(getBaseConnection());
    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          name: input.name,
          ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
        },
      },
      { new: true },
    );
    if (!updated) throw notFound('Workspace not found');
    res.json({
      id: String(updated._id),
      name: updated.name,
      contactEmail: updated.contactEmail,
      timezone: updated.timezone,
    });
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
  requireCapability('program.write'),
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
  requireCapability('program.write'),
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
  requireCapability('program.write'),
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
  requireCapability('program.write'),
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
  requireCapability('program.write'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const part = await db.Part.findByIdAndDelete(req.params.partId);
    if (!part) throw notFound('Part not found');
    await db.Assignment.deleteMany({ partId: part._id });
    res.status(204).end();
  }),
);

/**
 * Contact details reach owners, administrators and directors; viewers and
 * section leaders get the same record with the address fields absent.
 */
function serializeMusician(
  m: {
    _id: unknown;
    name: string;
    email: string;
    phone: string | null;
    instruments: { instrumentId: Types.ObjectId; rank: number }[];
    willingToDouble: boolean;
    experienceLevel: string;
    difficultyPreference: string;
    maxAssignments: number;
    active: boolean;
  },
  showContact: boolean,
): Record<string, unknown> {
  return {
    id: String(m._id),
    name: m.name,
    ...(showContact ? { email: m.email, phone: m.phone } : {}),
    instruments: m.instruments.map((entry) => ({
      instrumentId: String(entry.instrumentId),
      rank: entry.rank,
    })),
    willingToDouble: m.willingToDouble,
    experienceLevel: m.experienceLevel,
    difficultyPreference: m.difficultyPreference,
    maxAssignments: m.maxAssignments,
    active: m.active,
  };
}

catalogRouter.get(
  '/musicians',
  requireCapability('roster.read'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const showContact = can(req, 'roster.readContact');
    const musicians = await db.Musician.find({}).sort({ name: 1 }).lean();
    res.json(musicians.map((m) => serializeMusician(m, showContact)));
  }),
);

/** Manual entry for a musician who registered by phone or paper. */
catalogRouter.post(
  '/musicians',
  requireCapability('roster.write'),
  asyncRoute(async (req: Request, res) => {
    const { tenant, db } = tenantContext(req);
    const input = musicianSchema.parse(req.body);
    await assertCapacity(tenant, db, 'musicians');
    const created = await db.Musician.create({
      ...input,
      phone: input.phone ?? null,
      sourceResponseIds: [],
    });
    res.status(201).json(serializeMusician(created, can(req, 'roster.readContact')));
  }),
);

/** Editing an existing record is an admin-module action; adding one is not. */
catalogRouter.put(
  '/musicians/:id',
  requireCapability('settings.manage'),
  asyncRoute(async (req: Request, res) => {
    const { db } = tenantContext(req);
    const input = musicianSchema.parse(req.body);
    const updated = await db.Musician.findByIdAndUpdate(
      req.params.id,
      { $set: { ...input, phone: input.phone ?? null } },
      { new: true },
    );
    if (!updated) throw notFound('Musician not found');
    res.json(serializeMusician(updated, can(req, 'roster.readContact')));
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
