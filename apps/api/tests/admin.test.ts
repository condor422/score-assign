/**
 * Phase 3: tenant configuration (instruments, musician records, organisation
 * profile) and platform suspension authority.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';

let mongo: MongoMemoryServer;
let app: Express;

interface Session {
  accessToken: string;
}

const auth = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

async function signup(slug: string, name: string): Promise<Session> {
  const response = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      organizationName: name,
      slug,
      name: `${name} Owner`,
      email: `owner@${slug}.example.org`,
      password: 'SuperSecret123',
    })
    .expect(201);
  return { accessToken: response.body.accessToken };
}

async function addTeammate(slug: string, email: string, role: string): Promise<Session> {
  const { getBaseConnection } = await import('../src/db/connection.js');
  const { platformModels } = await import('../src/models/platform.js');
  const { createOpaqueToken } = await import('../src/services/tokens.js');
  const { Tenant, Invite, PlatformUser } = platformModels(getBaseConnection());

  const tenant = await Tenant.findOne({ slug });
  const owner = await PlatformUser.findOne({ email: `owner@${slug}.example.org` });
  const { token, hash } = createOpaqueToken();
  await Invite.create({
    tenantId: tenant!._id,
    email,
    role,
    sectionInstrumentIds: [],
    tokenHash: hash,
    invitedBy: owner!._id,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const accepted = await request(app)
    .post('/api/v1/auth/accept-invite')
    .set('x-tenant-slug', slug)
    .send({ token, name: `${role} person`, password: 'SuperSecret123' })
    .expect(201);
  return { accessToken: accepted.body.accessToken };
}

async function makePlatformStaff(slug: string): Promise<Session> {
  const { getBaseConnection } = await import('../src/db/connection.js');
  const { platformModels } = await import('../src/models/platform.js');
  const email = `owner@${slug}.example.org`;
  await platformModels(getBaseConnection()).PlatformUser.updateOne(
    { email },
    { $set: { isPlatformAdmin: true } },
  );
  const signedIn = await request(app)
    .post('/api/v1/auth/login')
    .set('x-tenant-slug', slug)
    .send({ email, password: 'SuperSecret123' })
    .expect(200);
  return { accessToken: signedIn.body.accessToken };
}

async function tenantIdFor(slug: string): Promise<string> {
  const { getBaseConnection } = await import('../src/db/connection.js');
  const { platformModels } = await import('../src/models/platform.js');
  const tenant = await platformModels(getBaseConnection()).Tenant.findOne({ slug });
  return String(tenant!._id);
}

async function openTheForm(session: Session): Promise<void> {
  const forms = await request(app).get('/api/v1/forms').set(auth(session)).expect(200);
  const form = await request(app)
    .get(`/api/v1/forms/${forms.body[0].id}`)
    .set(auth(session))
    .expect(200);
  await request(app)
    .put(`/api/v1/forms/${forms.body[0].id}`)
    .set(auth(session))
    .send({ ...form.body, status: 'open' })
    .expect(200);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.PLATFORM_DB_NAME = 'admin_platform';
  process.env.TENANT_DB_PREFIX = 'admin_tenant_';
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

describe('instrument configuration', () => {
  it('adds, renames and reorders instruments for one tenant only', async () => {
    const owner = await signup('inst-co', 'Inst Co');
    const other = await signup('inst-other', 'Inst Other');

    const added = await request(app)
      .post('/api/v1/instruments')
      .set(auth(owner))
      .send({ name: 'Contra-alto Flute' })
      .expect(201);
    expect(added.body.key).toBe('contra_alto_flute');

    await request(app)
      .post('/api/v1/instruments')
      .set(auth(owner))
      .send({ name: 'contra-alto flute' })
      .expect(400);

    const renamed = await request(app)
      .patch(`/api/v1/instruments/${added.body.id}`)
      .set(auth(owner))
      .send({ name: 'Contra-alto' })
      .expect(200);
    expect(renamed.body.name).toBe('Contra-alto');

    const mine = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const reversed = [...mine.body].reverse().map((i: { id: string }) => i.id);
    await request(app)
      .post('/api/v1/instruments/reorder')
      .set(auth(owner))
      .send({ instrumentIds: reversed })
      .expect(200);
    const afterReorder = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    expect(afterReorder.body.map((i: { id: string }) => i.id)).toEqual(reversed);

    // The new instrument belongs to one workspace, not the whole cluster.
    const theirs = await request(app).get('/api/v1/instruments').set(auth(other)).expect(200);
    expect(theirs.body.map((i: { name: string }) => i.name)).not.toContain('Contra-alto');
  });

  it('keeps instrument configuration away from directors', async () => {
    const owner = await signup('inst-perm', 'Inst Perm');
    const director = await addTeammate('inst-perm', 'director@inst-perm.example.org', 'director');
    void owner;

    await request(app)
      .post('/api/v1/instruments')
      .set(auth(director))
      .send({ name: 'Ocarina' })
      .expect(403);
  });

  it('hides a retired instrument from pickers and the public form but keeps its parts', async () => {
    const owner = await signup('retire-co', 'Retire Co');
    await openTheForm(owner);

    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const piccolo = instruments.body.find((i: { name: string }) => i.name === 'Piccolo');
    const seasons = await request(app).get('/api/v1/seasons').set(auth(owner)).expect(200);
    const song = await request(app)
      .post(`/api/v1/seasons/${seasons.body[0].id}/songs`)
      .set(auth(owner))
      .send({ title: 'Retiring Suite' })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasons.body[0].id}/parts/bulk`)
      .set(auth(owner))
      .send({ songId: song.body.id, instrumentId: piccolo.id, count: 1 })
      .expect(201);

    const retired = await request(app)
      .patch(`/api/v1/instruments/${piccolo.id}`)
      .set(auth(owner))
      .send({ active: false })
      .expect(200);
    // Retirement is reported with the history it would have destroyed if deleted.
    expect(retired.body.partCount).toBe(1);

    const active = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    expect(active.body.map((i: { name: string }) => i.name)).not.toContain('Piccolo');

    const all = await request(app)
      .get('/api/v1/instruments?includeInactive=true')
      .set(auth(owner))
      .expect(200);
    expect(all.body.find((i: { name: string }) => i.name === 'Piccolo').active).toBe(false);

    const publicForm = await request(app)
      .get('/api/v1/public/forms/registration')
      .set('x-tenant-slug', 'retire-co')
      .expect(200);
    expect(publicForm.body.instruments.map((i: { name: string }) => i.name)).not.toContain(
      'Piccolo',
    );

    const parts = await request(app)
      .get(`/api/v1/seasons/${seasons.body[0].id}/parts`)
      .set(auth(owner))
      .expect(200);
    expect(parts.body).toHaveLength(1);

    const restored = await request(app)
      .patch(`/api/v1/instruments/${piccolo.id}`)
      .set(auth(owner))
      .send({ active: true })
      .expect(200);
    expect(restored.body.active).toBe(true);
  });
});

describe('musician records', () => {
  it('lets an owner edit doubling and experience, and refuses a director', async () => {
    const owner = await signup('edit-co', 'Edit Co');
    const director = await addTeammate('edit-co', 'director@edit-co.example.org', 'director');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const alto = instruments.body.find((i: { name: string }) => i.name === 'Alto Flute').id;

    // A director may still add a player who signed up on paper.
    const created = await request(app)
      .post('/api/v1/musicians')
      .set(auth(director))
      .send({
        name: 'Paper Player',
        email: 'paper.player@example.org',
        instruments: [{ instrumentId: flute, rank: 1 }],
        willingToDouble: true,
        experienceLevel: 'collegiate',
      })
      .expect(201);
    expect(created.body.willingToDouble).toBe(true);
    expect(created.body.experienceLevel).toBe('collegiate');

    const edit = {
      name: 'Paper Player',
      email: 'paper.player@example.org',
      phone: '602-555-0111',
      instruments: [
        { instrumentId: alto, rank: 1 },
        { instrumentId: flute, rank: 2 },
      ],
      willingToDouble: false,
      experienceLevel: 'graduate_professional',
      difficultyPreference: 'challenging',
      maxAssignments: 3,
      active: false,
    };

    await request(app)
      .put(`/api/v1/musicians/${created.body.id}`)
      .set(auth(director))
      .send(edit)
      .expect(403);

    const updated = await request(app)
      .put(`/api/v1/musicians/${created.body.id}`)
      .set(auth(owner))
      .send(edit)
      .expect(200);
    expect(updated.body.willingToDouble).toBe(false);
    expect(updated.body.experienceLevel).toBe('graduate_professional');
    expect(updated.body.difficultyPreference).toBe('challenging');
    expect(updated.body.maxAssignments).toBe(3);
    expect(updated.body.active).toBe(false);
    expect(updated.body.instruments[0].instrumentId).toBe(alto);
  });
});

describe('organization settings', () => {
  it('lets an owner rename the workspace and refuses a director', async () => {
    const owner = await signup('org-co', 'Org Co');
    const director = await addTeammate('org-co', 'director@org-co.example.org', 'director');

    const before = await request(app).get('/api/v1/organization').set(auth(owner)).expect(200);
    expect(before.body.slug).toBe('org-co');
    expect(before.body.limits.maxParts).toBeGreaterThan(0);

    await request(app)
      .patch('/api/v1/organization')
      .set(auth(director))
      .send({ name: 'Hijacked' })
      .expect(403);

    const updated = await request(app)
      .patch('/api/v1/organization')
      .set(auth(owner))
      .send({ name: 'Org Co Winds', timezone: 'America/Phoenix' })
      .expect(200);
    expect(updated.body.name).toBe('Org Co Winds');
    expect(updated.body.timezone).toBe('America/Phoenix');
  });
});

describe('tenant suspension', () => {
  it('is reserved for platform staff', async () => {
    const owner = await signup('susp-perm', 'Susp Perm');
    const id = await tenantIdFor('susp-perm');
    await request(app)
      .post(`/api/v1/admin/tenants/${id}/status`)
      .set(auth(owner))
      .send({ action: 'suspend' })
      .expect(403);
  });

  it('makes the workspace read-only, closes registration, and restores the prior status', async () => {
    const owner = await signup('susp-co', 'Susp Co');
    await openTheForm(owner);
    await signup('platform-hq', 'Platform HQ');
    const staff = await makePlatformStaff('platform-hq');
    const id = await tenantIdFor('susp-co');

    const suspended = await request(app)
      .post(`/api/v1/admin/tenants/${id}/status`)
      .set(auth(staff))
      .send({ action: 'suspend', reason: 'Non-payment' })
      .expect(200);
    expect(suspended.body.status).toBe('suspended');

    // Reading still works, so a director can look up who plays what.
    const roster = await request(app).get('/api/v1/roster').set(auth(owner)).expect(200);
    expect(roster.body.includesContact).toBe(true);

    // Every write is refused, including ones the owner would normally hold.
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(owner))
      .send({ name: 'Late Joiner', email: 'late@example.org', instruments: [] })
      .expect(403);

    await request(app)
      .get('/api/v1/public/forms/registration')
      .set('x-tenant-slug', 'susp-co')
      .expect(403);

    const listed = await request(app)
      .get('/api/v1/admin/tenants?status=suspended')
      .set(auth(staff))
      .expect(200);
    const row = listed.body.find((t: { slug: string }) => t.slug === 'susp-co');
    expect(row.suspensionReason).toBe('Non-payment');
    expect(row.suspendedAt).toBeTruthy();

    await request(app)
      .post(`/api/v1/admin/tenants/${id}/status`)
      .set(auth(staff))
      .send({ action: 'suspend' })
      .expect(400);

    const restored = await request(app)
      .post(`/api/v1/admin/tenants/${id}/status`)
      .set(auth(staff))
      .send({ action: 'restore' })
      .expect(200);
    // Signing up starts a trial, and that is what restoring must hand back.
    expect(restored.body.status).toBe('trialing');

    await request(app)
      .get('/api/v1/public/forms/registration')
      .set('x-tenant-slug', 'susp-co')
      .expect(200);

    const { getBaseConnection } = await import('../src/db/connection.js');
    const { platformModels } = await import('../src/models/platform.js');
    const audits = await platformModels(getBaseConnection())
      .AuditLog.find({ targetId: id })
      .sort({ createdAt: 1 })
      .lean();
    expect(audits.map((entry) => entry.action)).toEqual(['tenant.suspend', 'tenant.restore']);
  });
});
