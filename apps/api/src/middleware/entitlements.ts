import { freeLimits, planCatalog, type PlanLimits } from '@score-assign/shared';
import type { TenantDoc } from '../models/platform.js';
import type { TenantModels } from '../models/tenant.js';
import { paymentRequired } from './errors.js';

/**
 * Effective limits for a tenant right now. A trial gets full paid capacity;
 * once it lapses without a subscription the tenant falls back to the free
 * caps (3 parts / 10 musicians) rather than losing access to their data.
 */
export function effectiveLimits(tenant: TenantDoc, now: Date = new Date()): PlanLimits {
  if (tenant.status === 'trialing' && tenant.trialEndsAt && tenant.trialEndsAt > now) {
    return planCatalog.find((p) => p.key === 'annual')!.limits;
  }
  if (tenant.status === 'active' && tenant.plan === 'annual') {
    return tenant.limits;
  }
  return freeLimits;
}

export function isTrialExpired(tenant: TenantDoc, now: Date = new Date()): boolean {
  return tenant.status === 'trialing' && !!tenant.trialEndsAt && tenant.trialEndsAt <= now;
}

export interface UsageSnapshot {
  parts: number;
  musicians: number;
  songs: number;
}

export async function currentUsage(db: TenantModels): Promise<UsageSnapshot> {
  const [parts, musicians, songs] = await Promise.all([
    db.Part.countDocuments({}),
    db.Musician.countDocuments({ active: true }),
    db.Song.countDocuments({}),
  ]);
  return { parts, musicians, songs };
}

type Resource = keyof UsageSnapshot;

const limitKey: Record<Resource, keyof PlanLimits> = {
  parts: 'maxParts',
  musicians: 'maxMusicians',
  songs: 'maxSongs',
};

/**
 * Throws 402 when creating `count` more of `resource` would exceed the plan.
 * Called on every create/import path -- the UI meters are advisory only.
 */
export async function assertCapacity(
  tenant: TenantDoc,
  db: TenantModels,
  resource: Resource,
  count = 1,
): Promise<void> {
  const limits = effectiveLimits(tenant);
  const max = limits[limitKey[resource]];
  const usage = await currentUsage(db);
  const used = usage[resource];
  if (used + count <= max) return;

  throw paymentRequired(
    `Your ${tenant.plan === 'annual' ? 'plan' : 'free plan'} allows ${max} ${resource}. ` +
      `You have ${used}. Upgrade to add more.`,
    { resource, limit: max, used, requested: count },
  );
}
