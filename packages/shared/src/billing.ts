import { z } from 'zod';
import { planKeySchema, type PlanKey } from './domain.js';

/** Caps enforced by the entitlements middleware on every create/import. */
export interface PlanLimits {
  maxParts: number;
  maxMusicians: number;
  maxSongs: number;
  maxSeats: number;
}

export const planLimitsSchema = z.object({
  maxParts: z.number().int().min(1),
  maxMusicians: z.number().int().min(1),
  maxSongs: z.number().int().min(1),
  maxSeats: z.number().int().min(1),
});

export const UNLIMITED = 1_000_000;

/** Free tier is deliberately just big enough to run one tiny piece. */
export const freeLimits: PlanLimits = {
  maxParts: 3,
  maxMusicians: 10,
  maxSongs: 1,
  maxSeats: 1,
};

/** Monthly and annual buy the same product; only the cadence differs. */
export const paidLimits: PlanLimits = {
  maxParts: UNLIMITED,
  maxMusicians: UNLIMITED,
  maxSongs: UNLIMITED,
  maxSeats: 25,
};

export const ANNUAL_PRICE_CENTS = 9600;
export const MONTHLY_PRICE_CENTS = 1200;
export const TRIAL_DAYS = 7;

export const billingIntervals = ['month', 'year'] as const;
export const billingIntervalSchema = z.enum(billingIntervals);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const planIntervals: Record<PlanKey, BillingInterval> = {
  free: 'year',
  monthly: 'month',
  annual: 'year',
};

export const paidPlanKeys = ['monthly', 'annual'] as const;
export type PaidPlanKey = (typeof paidPlanKeys)[number];

export function isPaidPlanKey(key: string): key is PaidPlanKey {
  return (paidPlanKeys as readonly string[]).includes(key);
}

/** The end of the period a plan buys, from a given start. */
export function periodEndFor(planKey: PaidPlanKey, from: Date = new Date()): Date {
  const end = new Date(from);
  if (planKey === 'monthly') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}

export const planCatalog = [
  {
    key: 'free' as const,
    name: 'Free',
    priceCents: 0,
    interval: 'year' as const,
    limits: freeLimits,
  },
  {
    key: 'monthly' as const,
    name: 'Monthly',
    priceCents: MONTHLY_PRICE_CENTS,
    interval: 'month' as const,
    limits: paidLimits,
  },
  {
    key: 'annual' as const,
    name: 'Annual',
    priceCents: ANNUAL_PRICE_CENTS,
    interval: 'year' as const,
    limits: paidLimits,
  },
];

export const discountCategories = ['student', 'teacher', 'nonprofit', 'promo'] as const;
export const discountCategorySchema = z.enum(discountCategories);
export type DiscountCategory = z.infer<typeof discountCategorySchema>;

export const discountTypes = ['percent', 'fixed'] as const;
export const discountTypeSchema = z.enum(discountTypes);

/** Exposed unrefined so callers can build a partial schema for PATCH bodies. */
export const discountCodeFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, 'uppercase letters, digits and hyphens only'),
  label: z.string().min(1).max(120),
  category: discountCategorySchema,
  type: discountTypeSchema,
  /** Percent (1-100) when type is percent, otherwise cents off. */
  value: z.number().int().min(1),
  appliesToPlanKeys: z.array(planKeySchema).default(['monthly', 'annual']),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
  perTenantLimit: z.number().int().min(1).default(1),
  /** Student / teacher / 501c3 status must be reviewed before it applies. */
  requiresVerification: z.boolean().default(false),
  validFrom: z.coerce.date().nullable().default(null),
  validUntil: z.coerce.date().nullable().default(null),
  active: z.boolean().default(true),
});

const percentCap = (c: { type?: 'percent' | 'fixed'; value?: number }): boolean =>
  c.type !== 'percent' || c.value === undefined || c.value <= 100;
const percentCapIssue = {
  message: 'percent discounts cannot exceed 100',
  path: ['value'],
};

export const discountCodeInputSchema = discountCodeFieldsSchema.refine(percentCap, percentCapIssue);
export const discountCodePatchSchema = discountCodeFieldsSchema
  .partial()
  .refine(percentCap, percentCapIssue);
export type DiscountCodeInput = z.infer<typeof discountCodeInputSchema>;

/** Discount codes seeded for the pricing tiers the product launches with. */
export const seedDiscountCodes: DiscountCodeInput[] = [
  {
    code: 'STUDENT30',
    label: 'Student',
    category: 'student',
    type: 'percent',
    value: 30,
    appliesToPlanKeys: ['monthly', 'annual'],
    maxRedemptions: null,
    perTenantLimit: 1,
    requiresVerification: true,
    validFrom: null,
    validUntil: null,
    active: true,
  },
  {
    code: 'TEACHER40',
    label: 'Teacher',
    category: 'teacher',
    type: 'percent',
    value: 40,
    appliesToPlanKeys: ['monthly', 'annual'],
    maxRedemptions: null,
    perTenantLimit: 1,
    requiresVerification: true,
    validFrom: null,
    validUntil: null,
    active: true,
  },
  {
    code: 'NONPROFIT50',
    label: '501(c)(3) Non-profit',
    category: 'nonprofit',
    type: 'percent',
    value: 50,
    appliesToPlanKeys: ['monthly', 'annual'],
    maxRedemptions: null,
    perTenantLimit: 1,
    requiresVerification: true,
    validFrom: null,
    validUntil: null,
    active: true,
  },
];

export interface PriceQuote {
  planKey: PlanKey;
  interval: BillingInterval;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  code?: string;
  label?: string;
}

/** Never lets a discount push the total below zero. */
export function quotePrice(
  planKey: PaidPlanKey,
  listPriceCents: number,
  discount?: { code: string; label: string; type: 'percent' | 'fixed'; value: number } | null,
): PriceQuote {
  const base = { planKey, interval: planIntervals[planKey], listPriceCents };
  if (!discount) {
    return { ...base, discountCents: 0, totalCents: listPriceCents };
  }
  const raw =
    discount.type === 'percent'
      ? Math.round((listPriceCents * discount.value) / 100)
      : discount.value;
  const discountCents = Math.min(raw, listPriceCents);
  return {
    ...base,
    discountCents,
    totalCents: listPriceCents - discountCents,
    code: discount.code,
    label: discount.label,
  };
}
