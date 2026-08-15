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
  planKey: z.literal('annual'),
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
