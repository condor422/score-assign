import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';

let mongo: MongoMemoryServer;
// The app is imported only after the environment points at the in-memory
// server, since configuration is read at module load.
let app: Express;

interface Session {
  accessToken: string;
  slug: string;
}

async function signup(slug: string, name: string): Promise<Session> {
  const response = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      organizationName: name,
      slug,
      name: `${name} Director`,
      email: `owner@${slug}.example.org`,
      password: 'SuperSecret123',
    })
    .expect(201);
  return { accessToken: response.body.accessToken, slug };
}

const auth = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.PLATFORM_DB_NAME = 'test_platform';
  process.env.TENANT_DB_PREFIX = 'test_tenant_';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-1234567890';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-1234567890';

  const { connect } = await import('../src/db/connection.js');
  const { ensurePlatformCatalog } = await import('../src/services/provisioning.js');
  await connect(mongo.getUri());
  await ensurePlatformCatalog();
  app = (await import('../src/app.js')).createApp();
}, 180_000);

afterAll(async () => {
  const { disconnect } = await import('../src/db/connection.js');
  await disconnect();
  await mongo.stop();
});

describe('signup and provisioning', () => {
  it('provisions a workspace seeded with instruments, a season and a draft form', async () => {
    const session = await signup('choir-a', 'Choir A');

    const instruments = await request(app)
      .get('/api/v1/instruments')
      .set(auth(session))
      .expect(200);
    expect(instruments.body.map((i: { name: string }) => i.name)).toEqual([
      'Piccolo',
      'C Flute',
      'Alto Flute',
      'Bass Flute',
      'Contrabass Flute',
    ]);

    const seasons = await request(app).get('/api/v1/seasons').set(auth(session)).expect(200);
    expect(seasons.body).toHaveLength(1);

    const forms = await request(app).get('/api/v1/forms').set(auth(session)).expect(200);
    expect(forms.body[0].status).toBe('draft');
    // The seeded form is the ranked-preference flute choir template.
    expect(forms.body[0].fieldCount).toBeGreaterThan(5);
  });

  it('starts the tenant on a 7 day trial', async () => {
    const session = await signup('choir-trial', 'Choir Trial');
    const plans = await request(app).get('/api/v1/billing/plans').set(auth(session)).expect(200);
    expect(plans.body.current.status).toBe('trialing');
    const days = (new Date(plans.body.current.trialEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });

  it('rejects a duplicate workspace slug', async () => {
    await signup('choir-dupe', 'Choir Dupe');
    await request(app)
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Another',
        slug: 'choir-dupe',
        name: 'Someone',
        email: 'other@example.org',
        password: 'SuperSecret123',
      })
      .expect(409);
  });

  it('rejects a reserved workspace slug', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Admin Co',
        slug: 'admin',
        name: 'Someone',
        email: 'admin-co@example.org',
        password: 'SuperSecret123',
      })
      .expect(409);
  });
});

describe('tenant isolation', () => {
  it('does not leak one tenant\u2019s musicians to another', async () => {
    const a = await signup('iso-a', 'Iso A');
    const b = await signup('iso-b', 'Iso B');

    const instruments = await request(app).get('/api/v1/instruments').set(auth(a)).expect(200);
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(a))
      .send({
        name: 'Only In A',
        email: 'only-in-a@example.org',
        instruments: [{ instrumentId: instruments.body[1].id, rank: 1 }],
      })
      .expect(201);

    const fromA = await request(app).get('/api/v1/musicians').set(auth(a)).expect(200);
    const fromB = await request(app).get('/api/v1/musicians').set(auth(b)).expect(200);

    expect(fromA.body).toHaveLength(1);
    expect(fromB.body).toHaveLength(0);
  });

  it('refuses requests without a token', async () => {
    await request(app).get('/api/v1/musicians').expect(401);
  });
});

describe('public intake', () => {
  it('stores the raw submission and derives a musician record', async () => {
    const session = await signup('intake-co', 'Intake Co');
    const forms = await request(app).get('/api/v1/forms').set(auth(session)).expect(200);
    const form = await request(app)
      .get(`/api/v1/forms/${forms.body[0].id}`)
      .set(auth(session))
      .expect(200);

    // Open the form so the public endpoint will serve it.
    await request(app)
      .put(`/api/v1/forms/${forms.body[0].id}`)
      .set(auth(session))
      .send({ ...form.body, status: 'open' })
      .expect(200);

    const publicForm = await request(app)
      .get('/api/v1/public/forms/registration')
      .set('x-tenant-slug', 'intake-co')
      .expect(200);
    const flute = publicForm.body.instruments.find((i: { name: string }) => i.name === 'C Flute');
    const piccolo = publicForm.body.instruments.find((i: { name: string }) => i.name === 'Piccolo');

    await request(app)
      .post('/api/v1/public/forms/registration/responses')
      .set('x-tenant-slug', 'intake-co')
      .send({
        answers: {
          name: 'Ranked Player',
          email: 'ranked@example.org',
          phone: '602-555-0111',
          member_status: 'yes',
          rehearsal_attendance: 'yes',
          // Drag order: piccolo first, C flute second.
          instruments: [piccolo.id, flute.id],
          doubling: 'yes',
          experience: 'advanced',
          difficulty: 'challenging',
        },
      })
      .expect(201);

    const musicians = await request(app).get('/api/v1/musicians').set(auth(session)).expect(200);
    expect(musicians.body).toHaveLength(1);
    expect(musicians.body[0].instruments).toEqual([
      { instrumentId: piccolo.id, rank: 1 },
      { instrumentId: flute.id, rank: 2 },
    ]);
    expect(musicians.body[0].willingToDouble).toBe(true);
    expect(musicians.body[0].experienceLevel).toBe('advanced');

    const responses = await request(app)
      .get(`/api/v1/forms/${forms.body[0].id}/responses`)
      .set(auth(session))
      .expect(200);
    // The verbatim answers are kept alongside the derived projection.
    expect(responses.body[0].answers.member_status).toBe('yes');
  });

  it('rejects a submission missing a required answer', async () => {
    await request(app)
      .post('/api/v1/public/forms/registration/responses')
      .set('x-tenant-slug', 'intake-co')
      .send({ answers: { name: 'No Email' } })
      .expect(400);
  });

  it('refuses a closed form', async () => {
    const session = await signup('closed-co', 'Closed Co');
    void session;
    await request(app)
      .get('/api/v1/public/forms/registration')
      .set('x-tenant-slug', 'closed-co')
      .expect(403);
  });
});

describe('assignment run and manual moves', () => {
  it('assigns parts on demand, then supports a drag-and-drop move', async () => {
    const session = await signup('run-co', 'Run Co');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(session)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(session)).expect(200);
    const seasonId = seasons.body[0].id;

    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(session))
      .send({ title: 'Test Piece' })
      .expect(201);

    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(session))
      .send({ songId: song.body.id, instrumentId: flute, count: 3 })
      .expect(201);

    for (const name of ['Player One', 'Player Two', 'Player Three']) {
      await request(app)
        .post('/api/v1/musicians')
        .set(auth(session))
        .send({
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
          instruments: [{ instrumentId: flute, rank: 1 }],
        })
        .expect(201);
    }

    const run = await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(session))
      .send({})
      .expect(201);
    expect(run.body.stats.partsUnfilled).toBe(0);
    expect(run.body.stats.assignmentsCreated).toBe(3);

    const board = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(session))
      .expect(200);
    expect(board.body.parts).toHaveLength(3);
    expect(board.body.unassigned).toHaveLength(0);

    // Move the musician on part 1 over to part 2, as a drag would.
    const source = board.body.parts[0];
    const targetPart = board.body.parts[1];
    const moved = await request(app)
      .patch(`/api/v1/assignments/${source.assignments[0].id}`)
      .set(auth(session))
      .send({ partId: targetPart.id, musicianId: source.assignments[0].musicianId })
      .expect(200);
    // Part 2 already holds someone, so the director is warned about capacity.
    expect(moved.body.warnings.map((w: { code: string }) => w.code)).toContain('over_capacity');

    const after = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(session))
      .expect(200);
    const target = after.body.parts.find((p: { id: string }) => p.id === targetPart.id);
    expect(target.assignments).toHaveLength(2);
  });

  it('keeps locked assignments across a re-run and can revert a run', async () => {
    const session = await signup('lock-co', 'Lock Co');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(session)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(session)).expect(200);
    const seasonId = seasons.body[0].id;
    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(session))
      .send({ title: 'Lockable' })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(session))
      .send({ songId: song.body.id, instrumentId: flute, count: 2 })
      .expect(201);
    for (const name of ['Lock A', 'Lock B']) {
      await request(app)
        .post('/api/v1/musicians')
        .set(auth(session))
        .send({
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
          instruments: [{ instrumentId: flute, rank: 1 }],
        })
        .expect(201);
    }

    await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(session))
      .send({})
      .expect(201);

    const board = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(session))
      .expect(200);
    const pinned = board.body.parts[0].assignments[0];
    await request(app)
      .post(`/api/v1/assignments/${pinned.id}/lock`)
      .set(auth(session))
      .send({ locked: true })
      .expect(200);

    const rerun = await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(session))
      .send({})
      .expect(201);

    const afterRerun = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(session))
      .expect(200);
    const stillThere = afterRerun.body.parts
      .find((p: { id: string }) => p.id === board.body.parts[0].id)
      .assignments.some((a: { musicianId: string }) => a.musicianId === pinned.musicianId);
    expect(stillThere).toBe(true);

    const reverted = await request(app)
      .post(`/api/v1/runs/${rerun.body.runId}/revert`)
      .set(auth(session))
      .expect(200);
    expect(reverted.body.restored).toBe(2);
  });
});

describe('plan limits', () => {
  it('blocks the 4th part and 11th musician once the trial has lapsed', async () => {
    const session = await signup('limit-co', 'Limit Co');
    const { getBaseConnection } = await import('../src/db/connection.js');
    const { platformModels } = await import('../src/models/platform.js');
    const { Tenant } = platformModels(getBaseConnection());
    // Expire the trial so free-tier caps take effect.
    await Tenant.updateOne({ slug: 'limit-co' }, { $set: { trialEndsAt: new Date(Date.now() - 1000) } });

    const instruments = await request(app).get('/api/v1/instruments').set(auth(session)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(session)).expect(200);
    const seasonId = seasons.body[0].id;
    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(session))
      .send({ title: 'Free Tier Piece' })
      .expect(201);

    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(session))
      .send({ songId: song.body.id, instrumentId: flute, count: 3 })
      .expect(201);

    const overParts = await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts`)
      .set(auth(session))
      .send({ songId: song.body.id, instrumentId: flute, partNumber: 4 })
      .expect(402);
    expect(overParts.body.error.code).toBe('plan_limit_reached');

    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/v1/musicians')
        .set(auth(session))
        .send({
          name: `Free Player ${i}`,
          email: `free.player.${i}@example.org`,
          instruments: [{ instrumentId: flute, rank: 1 }],
        })
        .expect(201);
    }
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(session))
      .send({
        name: 'One Too Many',
        email: 'one.too.many@example.org',
        instruments: [{ instrumentId: flute, rank: 1 }],
      })
      .expect(402);
  });
});

describe('billing', () => {
  it('quotes each discount category against the $96 annual plan', async () => {
    const session = await signup('discount-co', 'Discount Co');
    for (const [code, total] of [
      ['STUDENT30', 6720],
      ['TEACHER40', 5760],
      ['NONPROFIT50', 4800],
    ] as const) {
      const quote = await request(app)
        .post('/api/v1/billing/quote')
        .set(auth(session))
        .send({ discountCode: code })
        .expect(200);
      expect(quote.body.totalCents).toBe(total);
      expect(quote.body.requiresVerification).toBe(true);
    }
  });

  it('rejects an unknown code', async () => {
    const session = await signup('badcode-co', 'Bad Code Co');
    await request(app)
      .post('/api/v1/billing/quote')
      .set(auth(session))
      .send({ discountCode: 'NOPE' })
      .expect(400);
  });

  it('activates the annual plan and lifts the free limits', async () => {
    const session = await signup('upgrade-co', 'Upgrade Co');
    const checkout = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(session))
      .send({ planKey: 'annual', discountCode: 'NONPROFIT50' })
      .expect(201);
    expect(checkout.body.quote.totalCents).toBe(4800);
    expect(checkout.body.activated).toBe(true);

    const usage = await request(app).get('/api/v1/usage').set(auth(session)).expect(200);
    expect(usage.body.plan).toBe('annual');
    expect(usage.body.limits.maxParts).toBeGreaterThan(3);
  });

  it('refuses a second redemption of a one-per-tenant code', async () => {
    const session = await signup('once-co', 'Once Co');
    await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(session))
      .send({ planKey: 'annual', discountCode: 'STUDENT30' })
      .expect(201);
    await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(session))
      .send({ planKey: 'annual', discountCode: 'STUDENT30' })
      .expect(400);
  });
});

describe('musician portal', () => {
  it('signs a musician in by emailed link and records a confirmation', async () => {
    const session = await signup('portal-co', 'Portal Co');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(session)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(session)).expect(200);
    const seasonId = seasons.body[0].id;
    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(session))
      .send({ title: 'Portal Piece' })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(session))
      .send({ songId: song.body.id, instrumentId: flute, count: 1 })
      .expect(201);
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(session))
      .send({
        name: 'Portal Player',
        email: 'portal.player@example.org',
        instruments: [{ instrumentId: flute, rank: 1 }],
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(session))
      .send({})
      .expect(201);

    // The link is emailed, so read the issued token straight from the tenant db.
    const { getBaseConnection } = await import('../src/db/connection.js');
    const { platformModels } = await import('../src/models/platform.js');
    const { getTenantModels } = await import('../src/db/tenantRegistry.js');
    const { createOpaqueToken } = await import('../src/services/tokens.js');
    const tenant = await platformModels(getBaseConnection()).Tenant.findOne({ slug: 'portal-co' });
    const db = getTenantModels(tenant!.dbName);
    const musician = await db.Musician.findOne({ email: 'portal.player@example.org' });
    const { token, hash } = createOpaqueToken();
    await db.MusicianLoginToken.create({
      musicianId: musician!._id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const verified = await request(app)
      .post('/api/v1/musician-auth/verify')
      .set('x-tenant-slug', 'portal-co')
      .send({ token })
      .expect(200);

    const myParts = await request(app)
      .get('/api/v1/musician/my-parts')
      .set('Authorization', `Bearer ${verified.body.accessToken}`)
      .expect(200);
    expect(myParts.body.assignments).toHaveLength(1);
    expect(myParts.body.assignments[0].confirmation).toBe('pending');

    const confirmed = await request(app)
      .post('/api/v1/musician/confirm')
      .set('Authorization', `Bearer ${verified.body.accessToken}`)
      .send({ assignmentId: myParts.body.assignments[0].id, accepted: true })
      .expect(200);
    expect(confirmed.body.confirmation).toBe('accepted');
  });

  it('reports success for an unknown email so addresses cannot be probed', async () => {
    await request(app)
      .post('/api/v1/musician-auth/request-link')
      .set('x-tenant-slug', 'portal-co')
      .send({ email: 'nobody@example.org' })
      .expect(202);
  });
});
