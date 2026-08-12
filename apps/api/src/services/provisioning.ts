import { Types } from 'mongoose';
import {
  defaultInstruments,
  defaultIntakeForm,
  freeLimits,
  planCatalog,
  reservedSlugs,
  seedDiscountCodes,
} from '@score-assign/shared';
import { config } from '../config.js';
import { getBaseConnection } from '../db/connection.js';
import { getTenantModels, tenantDbName } from '../db/tenantRegistry.js';
import { platformModels, type TenantDoc } from '../models/platform.js';
import type { TenantModels } from '../models/tenant.js';
import { conflict } from '../middleware/errors.js';

/** Idempotently loads the plan and launch discount catalogue. */
export async function ensurePlatformCatalog(): Promise<void> {
  const { Plan, DiscountCode } = platformModels(getBaseConnection());
  for (const plan of planCatalog) {
    await Plan.updateOne(
      { key: plan.key },
      {
        $setOnInsert: {
          key: plan.key,
          name: plan.name,
          priceCents: plan.key === 'annual' ? config.ANNUAL_PRICE_CENTS : plan.priceCents,
          currency: 'usd',
          interval: 'year',
          limits: plan.limits,
          active: true,
        },
      },
      { upsert: true },
    );
  }
  for (const code of seedDiscountCodes) {
    await DiscountCode.updateOne(
      { code: code.code },
      { $setOnInsert: { ...code, redemptionCount: 0 } },
      { upsert: true },
    );
  }
}

export interface ProvisionResult {
  tenant: TenantDoc;
  db: TenantModels;
}

/**
 * Creates a tenant plus its dedicated database, seeded with the flute-choir
 * instrument list, a first season and a draft intake form so the workspace is
 * immediately usable.
 */
export async function provisionTenant(params: {
  name: string;
  slug: string;
  contactEmail: string;
}): Promise<ProvisionResult> {
  const { Tenant } = platformModels(getBaseConnection());
  const slug = params.slug.toLowerCase();
  if (reservedSlugs.has(slug)) throw conflict(`"${slug}" is reserved`);
  if (await Tenant.exists({ slug })) throw conflict(`Workspace "${slug}" is already taken`);

  const tenantId = new Types.ObjectId();
  const trialEndsAt = new Date(Date.now() + config.TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const tenant = await Tenant.create({
    _id: tenantId,
    slug,
    name: params.name,
    contactEmail: params.contactEmail,
    dbName: tenantDbName(String(tenantId)),
    // Trials start with paid capacity and fall back to free limits on expiry.
    status: 'trialing',
    plan: 'free',
    limits: freeLimits,
    trialEndsAt,
    currentPeriodEnd: null,
  });

  const db = getTenantModels(tenant.dbName);
  await seedTenantData(db);
  return { tenant, db };
}

export async function seedTenantData(db: TenantModels): Promise<void> {
  const existing = await db.Instrument.countDocuments({});
  if (existing === 0) {
    await db.Instrument.insertMany(
      defaultInstruments.map((i) => ({ key: i.key, name: i.name, order: i.order, active: true })),
    );
  }

  let season = await db.Season.findOne({});
  if (!season) {
    season = await db.Season.create({ name: currentSeasonName(), status: 'planning' });
  }

  const form = await db.IntakeForm.findOne({});
  if (!form) {
    const template = defaultIntakeForm();
    const created = await db.IntakeForm.create({
      ...template,
      seasonId: season._id,
      fields: template.fields.map((f) => ({ ...f, helpText: f.helpText ?? null, role: f.role ?? null })),
    });
    season.intakeFormId = created._id;
    await season.save();
  }
}

function currentSeasonName(now: Date = new Date()): string {
  const month = now.getMonth();
  const term = month >= 6 ? 'Fall' : month >= 3 ? 'Summer' : 'Spring';
  return `${term} ${now.getFullYear()}`;
}
