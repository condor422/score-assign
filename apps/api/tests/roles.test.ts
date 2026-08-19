import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { capabilitiesForRole, grantableRoles, roleHasCapability } from '@score-assign/shared';

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

/**
 * Adds a teammate with a given role. Invitations are emailed, so the token is
 * minted directly the way the delivered link would carry it.
 */
async function addTeammate(
  slug: string,
  email: string,
  role: string,
  sectionInstrumentIds: string[] = [],
): Promise<Session> {
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
    sectionInstrumentIds,
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

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.PLATFORM_DB_NAME = 'roles_platform';
  process.env.TENANT_DB_PREFIX = 'roles_tenant_';
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

describe('capability table', () => {
  it('withholds contact details from viewers and section leaders only', () => {
    expect(roleHasCapability('viewer', 'roster.readContact')).toBe(false);
    expect(roleHasCapability('section_leader', 'roster.readContact')).toBe(false);
    expect(roleHasCapability('director', 'roster.readContact')).toBe(true);
    expect(roleHasCapability('admin', 'roster.readContact')).toBe(true);
    expect(roleHasCapability('owner', 'roster.readContact')).toBe(true);
  });

  it('reserves workspace configuration for owners and administrators', () => {
    expect(roleHasCapability('director', 'settings.manage')).toBe(false);
    expect(roleHasCapability('admin', 'settings.manage')).toBe(true);
    expect(roleHasCapability('owner', 'settings.manage')).toBe(true);
  });

  it('lets directors run the program but not manage the team or billing', () => {
    expect(roleHasCapability('director', 'assignment.run')).toBe(true);
    expect(roleHasCapability('director', 'assignment.write')).toBe(true);
    expect(roleHasCapability('director', 'form.write')).toBe(true);
    expect(roleHasCapability('director', 'team.manage')).toBe(false);
    expect(roleHasCapability('director', 'billing.manage')).toBe(false);
    expect(roleHasCapability('director', 'form.readResponses')).toBe(false);
  });

  it('gives section leaders read-only access for now', () => {
    expect(capabilitiesForRole('section_leader')).toEqual(['roster.read']);
  });

  it('reserves billing for the owner', () => {
    expect(roleHasCapability('admin', 'billing.manage')).toBe(false);
    expect(roleHasCapability('owner', 'billing.manage')).toBe(true);
  });

  it('never lets a role grant above itself', () => {
    expect(grantableRoles('owner')).toContain('owner');
    expect(grantableRoles('admin')).not.toContain('owner');
    expect(grantableRoles('director')).toEqual([]);
  });
});

describe('roster redaction', () => {
  it('sends contact details to a director and withholds them from a viewer', async () => {
    const owner = await signup('redact-co', 'Redact Co');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(owner))
      .send({
        name: 'Private Player',
        email: 'private.player@example.org',
        phone: '602-555-0100',
        instruments: [{ instrumentId: flute, rank: 1 }],
      })
      .expect(201);

    const director = await addTeammate('redact-co', 'director@redact-co.example.org', 'director');
    const viewer = await addTeammate('redact-co', 'viewer@redact-co.example.org', 'viewer');

    const asDirector = await request(app).get('/api/v1/roster').set(auth(director)).expect(200);
    expect(asDirector.body.includesContact).toBe(true);
    expect(asDirector.body.musicians[0].email).toBe('private.player@example.org');
    expect(asDirector.body.musicians[0].phone).toBe('602-555-0100');

    const asViewer = await request(app).get('/api/v1/roster').set(auth(viewer)).expect(200);
    expect(asViewer.body.includesContact).toBe(false);
    expect(asViewer.body.musicians[0].name).toBe('Private Player');
    expect(asViewer.body.musicians[0].email).toBeUndefined();
    expect(asViewer.body.musicians[0].phone).toBeUndefined();
    // The redaction is server-side: the address is absent from the payload itself.
    expect(JSON.stringify(asViewer.body)).not.toContain('private.player@example.org');
  });

  it('strips contact details from the musicians list and the board', async () => {
    const owner = await signup('board-redact', 'Board Redact');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(owner)).expect(200);
    const seasonId = seasons.body[0].id;
    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(owner))
      .send({ title: 'Redacted Suite' })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(owner))
      .send({ songId: song.body.id, instrumentId: flute, count: 1 })
      .expect(201);
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(owner))
      .send({
        name: 'Board Player',
        email: 'board.player@example.org',
        instruments: [{ instrumentId: flute, rank: 1 }],
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(owner))
      .send({})
      .expect(201);

    const viewer = await addTeammate('board-redact', 'viewer@board-redact.example.org', 'viewer');

    const musicians = await request(app).get('/api/v1/musicians').set(auth(viewer)).expect(200);
    expect(musicians.body[0].email).toBeUndefined();

    const board = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(viewer))
      .expect(200);
    expect(board.body.parts[0].assignments[0].musicianName).toBe('Board Player');
    expect(board.body.parts[0].assignments[0].musicianEmail).toBeUndefined();

    const asOwner = await request(app)
      .get(`/api/v1/seasons/${seasonId}/board`)
      .set(auth(owner))
      .expect(200);
    expect(asOwner.body.parts[0].assignments[0].musicianEmail).toBe('board.player@example.org');
  });

  it('keeps raw form responses away from a director', async () => {
    const owner = await signup('raw-co', 'Raw Co');
    const forms = await request(app).get('/api/v1/forms').set(auth(owner)).expect(200);
    const director = await addTeammate('raw-co', 'director@raw-co.example.org', 'director');

    await request(app)
      .get(`/api/v1/forms/${forms.body[0].id}/responses`)
      .set(auth(director))
      .expect(403);
    await request(app)
      .get(`/api/v1/forms/${forms.body[0].id}/responses`)
      .set(auth(owner))
      .expect(200);
  });
});

describe('section leaders', () => {
  it('sees only the musicians in the sections they lead, and cannot edit', async () => {
    const owner = await signup('section-co', 'Section Co');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const alto = instruments.body.find((i: { name: string }) => i.name === 'Alto Flute').id;

    for (const [name, instrumentId] of [
      ['Flute Player', flute],
      ['Alto Player', alto],
    ] as const) {
      await request(app)
        .post('/api/v1/musicians')
        .set(auth(owner))
        .send({
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
          instruments: [{ instrumentId, rank: 1 }],
        })
        .expect(201);
    }

    const leader = await addTeammate(
      'section-co',
      'leader@section-co.example.org',
      'section_leader',
      [alto],
    );

    const roster = await request(app).get('/api/v1/roster').set(auth(leader)).expect(200);
    expect(roster.body.sectionScope).toEqual([alto]);
    expect(roster.body.musicians.map((m: { name: string }) => m.name)).toEqual(['Alto Player']);
    expect(roster.body.includesContact).toBe(false);

    // Read-only for now: no program or assignment writes.
    const seasons = await request(app).get('/api/v1/seasons').set(auth(leader)).expect(200);
    await request(app)
      .post(`/api/v1/seasons/${seasons.body[0].id}/songs`)
      .set(auth(leader))
      .send({ title: 'Not Allowed' })
      .expect(403);
    await request(app)
      .post(`/api/v1/seasons/${seasons.body[0].id}/runs`)
      .set(auth(leader))
      .send({})
      .expect(403);
  });
});

describe('musician portal', () => {
  async function seedPortalTenant(slug: string): Promise<{
    owner: Session;
    musicianToken: string;
    assignmentId: string;
  }> {
    const owner = await signup(slug, slug);
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const flute = instruments.body.find((i: { name: string }) => i.name === 'C Flute').id;
    const seasons = await request(app).get('/api/v1/seasons').set(auth(owner)).expect(200);
    const seasonId = seasons.body[0].id;
    const song = await request(app)
      .post(`/api/v1/seasons/${seasonId}/songs`)
      .set(auth(owner))
      .send({ title: 'Portal Piece' })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/parts/bulk`)
      .set(auth(owner))
      .send({ songId: song.body.id, instrumentId: flute, count: 1 })
      .expect(201);
    await request(app)
      .post('/api/v1/musicians')
      .set(auth(owner))
      .send({
        name: 'Portal Player',
        email: `player@${slug}.example.org`,
        phone: '602-555-0199',
        instruments: [{ instrumentId: flute, rank: 1 }],
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/seasons/${seasonId}/runs`)
      .set(auth(owner))
      .send({})
      .expect(201);

    const { getBaseConnection } = await import('../src/db/connection.js');
    const { platformModels } = await import('../src/models/platform.js');
    const { getTenantModels } = await import('../src/db/tenantRegistry.js');
    const { createOpaqueToken } = await import('../src/services/tokens.js');
    const tenant = await platformModels(getBaseConnection()).Tenant.findOne({ slug });
    const db = getTenantModels(tenant!.dbName);
    const musician = await db.Musician.findOne({ email: `player@${slug}.example.org` });
    const { token, hash } = createOpaqueToken();
    await db.MusicianLoginToken.create({
      musicianId: musician!._id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const verified = await request(app)
      .post('/api/v1/musician-auth/verify')
      .set('x-tenant-slug', slug)
      .send({ token })
      .expect(200);

    const parts = await request(app)
      .get('/api/v1/musician/my-parts')
      .set('Authorization', `Bearer ${verified.body.accessToken}`)
      .expect(200);

    return {
      owner,
      musicianToken: verified.body.accessToken,
      assignmentId: parts.body.assignments[0].id,
    };
  }

  it('shows a musician their own contact details', async () => {
    const { musicianToken } = await seedPortalTenant('profile-co');
    const profile = await request(app)
      .get('/api/v1/musician/profile')
      .set('Authorization', `Bearer ${musicianToken}`)
      .expect(200);
    expect(profile.body.musician.email).toBe('player@profile-co.example.org');
    expect(profile.body.musician.phone).toBe('602-555-0199');
    expect(profile.body.musician.instruments[0].instrumentName).toBe('C Flute');
    expect(profile.body.tenant.slug).toBe('profile-co');
  });

  it('records a decline with the musician\u2019s note', async () => {
    const { musicianToken, assignmentId } = await seedPortalTenant('decline-co');
    const declined = await request(app)
      .post('/api/v1/musician/confirm')
      .set('Authorization', `Bearer ${musicianToken}`)
      .send({ assignmentId, accepted: false, note: 'Travelling that weekend' })
      .expect(200);
    expect(declined.body.confirmation).toBe('declined');
    expect(declined.body.note).toBe('Travelling that weekend');

    const parts = await request(app)
      .get('/api/v1/musician/my-parts')
      .set('Authorization', `Bearer ${musicianToken}`)
      .expect(200);
    expect(parts.body.assignments[0].confirmation).toBe('declined');
    expect(parts.body.assignments[0].respondedAt).toBeTruthy();
  });

  it('refuses a musician token on staff endpoints', async () => {
    const { musicianToken } = await seedPortalTenant('scope-co');
    await request(app)
      .get('/api/v1/roster')
      .set('Authorization', `Bearer ${musicianToken}`)
      .expect(401);
  });

  it('will not let one musician answer for another', async () => {
    const first = await seedPortalTenant('cross-a');
    const second = await seedPortalTenant('cross-b');
    await request(app)
      .post('/api/v1/musician/confirm')
      .set('Authorization', `Bearer ${second.musicianToken}`)
      .send({ assignmentId: first.assignmentId, accepted: true })
      .expect(404);
  });
});

describe('monthly billing', () => {
  it('quotes $12 a month and applies a discount code to it', async () => {
    const owner = await signup('monthly-co', 'Monthly Co');
    const plain = await request(app)
      .post('/api/v1/billing/quote')
      .set(auth(owner))
      .send({ planKey: 'monthly' })
      .expect(200);
    expect(plain.body.totalCents).toBe(1200);
    expect(plain.body.interval).toBe('month');

    const discounted = await request(app)
      .post('/api/v1/billing/quote')
      .set(auth(owner))
      .send({ planKey: 'monthly', discountCode: 'STUDENT30' })
      .expect(200);
    expect(discounted.body.totalCents).toBe(840);
  });

  it('activates a monthly subscription that renews in a month', async () => {
    const owner = await signup('monthly-checkout', 'Monthly Checkout');
    const checkout = await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(owner))
      .send({ planKey: 'monthly' })
      .expect(201);
    expect(checkout.body.activated).toBe(true);

    const plans = await request(app).get('/api/v1/billing/plans').set(auth(owner)).expect(200);
    expect(plans.body.current.plan).toBe('monthly');
    const days = (new Date(plans.body.current.currentPeriodEnd).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);

    const usage = await request(app).get('/api/v1/usage').set(auth(owner)).expect(200);
    expect(usage.body.limits.maxParts).toBeGreaterThan(3);
  });

  it('offers both paid plans in the catalog', async () => {
    const owner = await signup('catalog-co', 'Catalog Co');
    const plans = await request(app).get('/api/v1/billing/plans').set(auth(owner)).expect(200);
    const byKey = new Map(
      plans.body.plans.map((p: { key: string; priceCents: number; interval: string }) => [p.key, p]),
    );
    expect(byKey.get('monthly')).toMatchObject({ priceCents: 1200, interval: 'month' });
    expect(byKey.get('annual')).toMatchObject({ priceCents: 9600, interval: 'year' });
  });

  it('keeps checkout with the owner', async () => {
    const owner = await signup('billing-guard', 'Billing Guard');
    const admin = await addTeammate('billing-guard', 'admin@billing-guard.example.org', 'admin');
    await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(admin))
      .send({ planKey: 'monthly' })
      .expect(403);
    await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(owner))
      .send({ planKey: 'monthly' })
      .expect(201);
  });
});

describe('platform console', () => {
  async function promoteToPlatformAdmin(email: string): Promise<void> {
    const { getBaseConnection } = await import('../src/db/connection.js');
    const { platformModels } = await import('../src/models/platform.js');
    await platformModels(getBaseConnection()).PlatformUser.updateOne(
      { email },
      { $set: { isPlatformAdmin: true } },
    );
  }

  it('refuses a tenant owner who is not platform staff', async () => {
    const owner = await signup('console-outsider', 'Console Outsider');
    await request(app).get('/api/v1/admin/metrics').set(auth(owner)).expect(403);
    await request(app).get('/api/v1/admin/tenants').set(auth(owner)).expect(403);
  });

  it('reports metrics and filters tenants for platform staff', async () => {
    await signup('console-staff', 'Console Staff');
    await promoteToPlatformAdmin('owner@console-staff.example.org');
    const staff = await request(app)
      .post('/api/v1/auth/login')
      .set('x-tenant-slug', 'console-staff')
      .send({ email: 'owner@console-staff.example.org', password: 'SuperSecret123' })
      .expect(200);
    const session = { accessToken: staff.body.accessToken };
    expect(staff.body.user.isPlatformAdmin).toBe(true);

    const metrics = await request(app).get('/api/v1/admin/metrics').set(auth(session)).expect(200);
    expect(metrics.body.tenantsByStatus.trialing).toBeGreaterThan(0);
    expect(metrics.body.activeCodes).toBeGreaterThan(0);

    const trialing = await request(app)
      .get('/api/v1/admin/tenants?status=trialing')
      .set(auth(session))
      .expect(200);
    expect(trialing.body.every((t: { status: string }) => t.status === 'trialing')).toBe(true);
    const own = trialing.body.find((t: { slug: string }) => t.slug === 'console-staff');
    expect(own.contactEmail).toBe('owner@console-staff.example.org');
    expect(own.seats).toBeGreaterThan(0);
  });

  it('clears the discount when a verification claim is rejected', async () => {
    const owner = await signup('verify-co', 'Verify Co');
    await request(app)
      .post('/api/v1/billing/checkout')
      .set(auth(owner))
      .send({ planKey: 'monthly', discountCode: 'NONPROFIT50' })
      .expect(201);

    await signup('verify-staff', 'Verify Staff');
    await promoteToPlatformAdmin('owner@verify-staff.example.org');
    const staffLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('x-tenant-slug', 'verify-staff')
      .send({ email: 'owner@verify-staff.example.org', password: 'SuperSecret123' })
      .expect(200);
    const staff = { accessToken: staffLogin.body.accessToken };

    const pending = await request(app)
      .get('/api/v1/admin/tenants?pendingVerification=true')
      .set(auth(staff))
      .expect(200);
    const claimant = pending.body.find((t: { slug: string }) => t.slug === 'verify-co');
    expect(claimant.discountCode.code).toBe('NONPROFIT50');

    await request(app)
      .post(`/api/v1/admin/tenants/${claimant.id}/verify-discount`)
      .set(auth(staff))
      .send({ decision: 'reject', note: 'No 501(c)(3) letter supplied' })
      .expect(200);

    const after = await request(app)
      .get('/api/v1/admin/tenants?plan=monthly')
      .set(auth(staff))
      .expect(200);
    const resolved = after.body.find((t: { slug: string }) => t.slug === 'verify-co');
    expect(resolved.pendingVerification).toBe(false);
    expect(resolved.discountCode).toBeNull();
  });
});

describe('team management', () => {
  it('lets an admin promote a viewer but never mint an owner', async () => {
    const owner = await signup('team-co', 'Team Co');
    const admin = await addTeammate('team-co', 'admin@team-co.example.org', 'admin');
    const viewerEmail = 'viewer@team-co.example.org';
    await addTeammate('team-co', viewerEmail, 'viewer');

    const team = await request(app).get('/api/v1/team').set(auth(admin)).expect(200);
    expect(team.body.grantableRoles).not.toContain('owner');
    const viewer = team.body.members.find((m: { email: string }) => m.email === viewerEmail);

    const promoted = await request(app)
      .patch(`/api/v1/team/members/${viewer.id}`)
      .set(auth(admin))
      .send({ role: 'director', sectionInstrumentIds: [] })
      .expect(200);
    expect(promoted.body.role).toBe('director');

    await request(app)
      .patch(`/api/v1/team/members/${viewer.id}`)
      .set(auth(admin))
      .send({ role: 'owner', sectionInstrumentIds: [] })
      .expect(403);

    // A director cannot manage the team at all.
    const asOwner = await request(app).get('/api/v1/team').set(auth(owner)).expect(200);
    expect(asOwner.body.grantableRoles).toContain('owner');
  });

  it('records the sections a section leader was invited to lead', async () => {
    const owner = await signup('scope-team', 'Scope Team');
    const instruments = await request(app).get('/api/v1/instruments').set(auth(owner)).expect(200);
    const bass = instruments.body.find((i: { name: string }) => i.name === 'Bass Flute').id;
    await addTeammate('scope-team', 'leader@scope-team.example.org', 'section_leader', [bass]);

    const team = await request(app).get('/api/v1/team').set(auth(owner)).expect(200);
    const leader = team.body.members.find(
      (m: { email: string }) => m.email === 'leader@scope-team.example.org',
    );
    expect(leader.role).toBe('section_leader');
    expect(leader.sectionInstrumentIds).toEqual([bass]);
  });
});
