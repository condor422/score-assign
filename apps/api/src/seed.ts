/**
 * Creates a demo workspace with instruments, a season, an open intake form,
 * musicians and parts so the whole flow (including an assignment run) can be
 * exercised locally. Safe to re-run: it removes the demo tenant first.
 */
import argon2 from 'argon2';
import { annualLimits } from '@score-assign/shared';
import { config } from './config.js';
import { connect, disconnect, getBaseConnection } from './db/connection.js';
import { getTenantModels } from './db/tenantRegistry.js';
import { platformModels } from './models/platform.js';
import { ensurePlatformCatalog, provisionTenant } from './services/provisioning.js';
import { logger } from './logger.js';

const DEMO_SLUG = 'afs';
const DEMO_EMAIL = 'director@example.org';
const DEMO_PASSWORD = 'DemoDirector1';

const demoMusicians = [
  { name: 'Ana Reyes', instruments: ['c_flute', 'piccolo'], double: true, exp: 'graduate_professional', diff: 'challenging' },
  { name: 'Ben Cho', instruments: ['c_flute'], double: null, exp: 'intermediate', diff: 'easier' },
  { name: 'Cara Diaz', instruments: ['alto_flute', 'c_flute'], double: false, exp: 'advanced', diff: 'moderate' },
  { name: 'Dev Patel', instruments: ['bass_flute', 'c_flute'], double: true, exp: 'collegiate', diff: 'challenging' },
  { name: 'Elena Ruiz', instruments: ['c_flute'], double: null, exp: 'advanced', diff: 'moderate' },
  { name: 'Femi Ade', instruments: ['contrabass_flute', 'bass_flute'], double: true, exp: 'graduate_professional', diff: 'moderate' },
  { name: 'Gina Long', instruments: ['piccolo', 'c_flute'], double: true, exp: 'advanced', diff: 'challenging' },
  { name: 'Hana Kim', instruments: ['c_flute', 'alto_flute'], double: true, exp: 'intermediate', diff: 'easier' },
  { name: 'Ivan Petrov', instruments: ['alto_flute'], double: null, exp: 'collegiate', diff: 'moderate' },
  { name: 'Jo Nakamura', instruments: ['c_flute', 'bass_flute'], double: false, exp: 'advanced', diff: 'moderate' },
] as const;

async function main(): Promise<void> {
  await connect();
  await ensurePlatformCatalog();

  const { Tenant, PlatformUser } = platformModels(getBaseConnection());

  const stale = await Tenant.findOne({ slug: DEMO_SLUG });
  if (stale) {
    await getBaseConnection().useDb(stale.dbName, { useCache: true }).dropDatabase();
    await Tenant.deleteOne({ _id: stale._id });
    await PlatformUser.deleteOne({ email: DEMO_EMAIL });
    logger.info('removed previous demo tenant');
  }

  const { tenant } = await provisionTenant({
    name: 'Arizona Flute Society',
    slug: DEMO_SLUG,
    contactEmail: DEMO_EMAIL,
  });

  // Demo tenant is put on the paid plan so limits do not obscure the flow.
  await Tenant.updateOne(
    { _id: tenant._id },
    { $set: { status: 'active', plan: 'annual', limits: annualLimits } },
  );

  await PlatformUser.create({
    email: DEMO_EMAIL,
    name: 'Demo Director',
    passwordHash: await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id }),
    memberships: [{ tenantId: tenant._id, role: 'owner' }],
    isPlatformAdmin: true,
  });

  const models = getTenantModels(tenant.dbName);
  const instruments = await models.Instrument.find({}).lean();
  const instrumentByKey = new Map(instruments.map((i) => [i.key, i]));

  const form = await models.IntakeForm.findOne({});
  if (form) {
    form.title = 'Alla Breve Fall 2026 Registration';
    form.status = 'open';
    await form.save();
  }

  const season = await models.Season.findOne({});
  if (!season) throw new Error('season was not provisioned');
  season.name = 'Fall 2026';
  season.venue = 'Shadow Rock United Church of Christ';
  await season.save();

  await models.Musician.insertMany(
    demoMusicians.map((m) => ({
      name: m.name,
      email: `${m.name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
      phone: '602-555-0100',
      instruments: m.instruments.map((key, index) => ({
        instrumentId: String(instrumentByKey.get(key)!._id),
        rank: index + 1,
      })),
      willingToDouble: m.double,
      experienceLevel: m.exp,
      difficultyPreference: m.diff,
      sourceResponseIds: [],
    })),
  );

  const songs = await models.Song.insertMany([
    { seasonId: season._id, title: 'Fanfare for a New Season', composer: 'Trad.', order: 0 },
    { seasonId: season._id, title: 'Nocturne', composer: 'C. Debussy', arranger: 'arr. Smith', order: 1 },
  ]);

  const layout: { instrument: string; count: number; difficulty: 'easier' | 'moderate' | 'challenging' }[] = [
    { instrument: 'piccolo', count: 1, difficulty: 'challenging' },
    { instrument: 'c_flute', count: 3, difficulty: 'moderate' },
    { instrument: 'alto_flute', count: 1, difficulty: 'moderate' },
    { instrument: 'bass_flute', count: 1, difficulty: 'easier' },
  ];

  let order = 0;
  const parts = [];
  for (const song of songs) {
    for (const row of layout) {
      for (let n = 1; n <= row.count; n += 1) {
        parts.push({
          seasonId: season._id,
          songId: song._id,
          instrumentId: instrumentByKey.get(row.instrument)!._id,
          partNumber: n,
          difficulty: row.difficulty,
          minPlayers: 1,
          maxPlayers: 2,
          notes: null,
          order: order++,
        });
      }
    }
  }
  await models.Part.insertMany(parts);

  logger.info(
    {
      tenant: tenant.slug,
      login: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      formUrl: `http://${DEMO_SLUG}.localhost:5173/register/registration`,
      parts: parts.length,
      musicians: demoMusicians.length,
      dbName: tenant.dbName,
      cluster: config.MONGODB_URI,
    },
    'demo workspace ready',
  );

  await disconnect();
}

main().catch((error) => {
  logger.error({ err: error }, 'seed failed');
  process.exit(1);
});
