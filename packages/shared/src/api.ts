import { z } from 'zod';
import {
  difficultySchema,
  emailSchema,
  experienceLevelSchema,
  phoneSchema,
  slugSchema,
  tenantRoleSchema,
} from './domain.js';
import { instrumentPreferenceSchema } from './intake.js';
import { paidPlanKeys } from './billing.js';

const passwordSchema = z
  .string()
  .min(12, 'use at least 12 characters')
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: 'include upper case, lower case and a digit',
  });

export const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  slug: slugSchema,
  name: z.string().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  /** Omitted when the tenant is implied by the request subdomain. */
  tenantSlug: slugSchema.optional(),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: tenantRoleSchema,
  /** Only meaningful for section leaders; empty means the whole ensemble. */
  sectionInstrumentIds: z.array(z.string().min(1)).default([]),
});

export const memberRoleSchema = z.object({
  role: tenantRoleSchema,
  sectionInstrumentIds: z.array(z.string().min(1)).default([]),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(2).max(120),
  password: passwordSchema,
});

export const seasonSchema = z.object({
  name: z.string().min(1).max(120),
  concertDate: z.coerce.date().optional(),
  venue: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
});

export const songSchema = z.object({
  title: z.string().min(1).max(200),
  composer: z.string().max(200).optional(),
  arranger: z.string().max(200).optional(),
  order: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export const partSchema = z.object({
  songId: z.string().min(1),
  instrumentId: z.string().min(1),
  partNumber: z.number().int().min(1).max(99),
  difficulty: difficultySchema.default('moderate'),
  minPlayers: z.number().int().min(1).max(50).default(1),
  maxPlayers: z.number().int().min(1).max(50).default(1),
  notes: z.string().max(1000).optional(),
});

export const partsBulkSchema = z.object({
  songId: z.string().min(1),
  instrumentId: z.string().min(1),
  /** Creates parts 1..count in one call, the common way to enter a score. */
  count: z.number().int().min(1).max(30),
  difficulty: difficultySchema.default('moderate'),
  minPlayers: z.number().int().min(1).max(50).default(1),
  maxPlayers: z.number().int().min(1).max(50).default(1),
});

export const musicianSchema = z.object({
  name: z.string().min(1).max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  instruments: z.array(instrumentPreferenceSchema).min(1),
  willingToDouble: z.boolean().nullable().default(null),
  experienceLevel: experienceLevelSchema.nullable().default(null),
  difficultyPreference: difficultySchema.nullable().default(null),
  maxAssignments: z.number().int().min(1).max(50).nullable().default(null),
  active: z.boolean().default(true),
});

export const instrumentSchema = z.object({
  name: z.string().min(1).max(80),
});

export const instrumentUpdateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    /** Deactivated instruments disappear from pickers but keep their history. */
    active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.active !== undefined, {
    message: 'provide a name or an active flag',
  });

export const instrumentReorderSchema = z.object({
  /** Full list of instrument ids in their new display order. */
  instrumentIds: z.array(z.string().min(1)).min(1),
});

export const organizationSchema = z.object({
  name: z.string().min(2).max(120),
  contactEmail: emailSchema.nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export const tenantStatusActionSchema = z.object({
  action: z.enum(['suspend', 'restore']),
  reason: z.string().max(500).optional(),
});

export const runAssignmentSchema = z.object({
  weights: z
    .object({
      preference: z.number().min(0).max(1000).optional(),
      difficultyMatch: z.number().min(0).max(1000).optional(),
      experienceFit: z.number().min(0).max(1000).optional(),
      load: z.number().min(0).max(1000).optional(),
      secondInstrument: z.number().min(0).max(1000).optional(),
    })
    .optional(),
  defaultMaxAssignments: z.number().int().min(1).max(50).optional(),
  fillToMaxPlayers: z.boolean().optional(),
  /** Replace every unlocked assignment rather than keeping current placements. */
  clearExisting: z.boolean().default(true),
});

export const moveAssignmentSchema = z.object({
  partId: z.string().min(1),
  musicianId: z.string().min(1),
});

export const createAssignmentSchema = z.object({
  partId: z.string().min(1),
  musicianId: z.string().min(1),
});

export const checkoutSchema = z.object({
  planKey: z.enum(paidPlanKeys),
  discountCode: z.string().trim().toUpperCase().max(32).optional(),
});

export const verifyDiscountSchema = z.object({
  decision: z.enum(['approve', 'reject']).default('approve'),
  note: z.string().max(500).optional(),
});

export const quoteRequestSchema = z.object({
  planKey: z.enum(paidPlanKeys).default('annual'),
  discountCode: z.string().trim().toUpperCase().max(32).optional(),
});

export const musicianLoginRequestSchema = z.object({
  email: emailSchema,
});

export const musicianTokenSchema = z.object({
  token: z.string().min(10),
});

export const confirmAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  accepted: z.boolean(),
  note: z.string().max(1000).optional(),
});
