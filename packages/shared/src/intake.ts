import { z } from 'zod';
import {
  difficultySchema,
  emailSchema,
  experienceLevelSchema,
  phoneSchema,
  slugSchema,
} from './domain.js';

/**
 * Intake forms are data, not code: a tenant composes questions from these
 * field types, so tenant-specific questions (membership status, rehearsal
 * dates) never require a deploy.
 */
export const fieldTypes = [
  'text',
  'longtext',
  'email',
  'phone',
  'radio',
  'checkbox',
  'instrument_ranking',
  'boolean',
] as const;
export const fieldTypeSchema = z.enum(fieldTypes);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/**
 * Fields carrying meaning for the assignment engine declare a role. Exactly
 * one field per role is allowed; roleless fields are collected verbatim and
 * shown to the director but never interpreted.
 */
export const fieldRoles = [
  'name',
  'email',
  'phone',
  'instruments',
  'doubling',
  'experience',
  'difficulty',
  'notes',
] as const;
export const fieldRoleSchema = z.enum(fieldRoles);
export type FieldRole = z.infer<typeof fieldRoleSchema>;

export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const formFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, 'snake_case identifier'),
  label: z.string().min(1).max(500),
  // Nullish throughout: the API serves absent values as null, and a form the
  // builder round-trips must validate exactly as it was read.
  helpText: z.string().max(2000).nullish(),
  type: fieldTypeSchema,
  role: fieldRoleSchema.nullish(),
  required: z.boolean().default(false),
  options: z.array(fieldOptionSchema).default([]),
  order: z.number().int().min(0),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formStatuses = ['draft', 'open', 'closed'] as const;
export const formStatusSchema = z.enum(formStatuses);

export const intakeFormSchema = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(8000).nullish(),
  status: formStatusSchema.default('draft'),
  opensAt: z.coerce.date().nullish(),
  closesAt: z.coerce.date().nullish(),
  confirmationMessage: z.string().max(2000).nullish(),
  fields: z.array(formFieldSchema).min(1),
});
export type IntakeFormInput = z.infer<typeof intakeFormSchema>;

/** A musician's ranked instrument choice; rank 1 is most preferred. */
export const instrumentPreferenceSchema = z.object({
  instrumentId: z.string().min(1),
  rank: z.number().int().min(1),
});
export type InstrumentPreference = z.infer<typeof instrumentPreferenceSchema>;

/**
 * Public submissions arrive as an untyped answer map keyed by field key; the
 * API validates it against the form definition at request time (see
 * validateSubmission) because the shape is only knowable per form.
 */
export const intakeSubmissionSchema = z.object({
  answers: z.record(z.unknown()),
  honeypot: z.string().max(0).optional(),
});
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;

/** Engine-facing projection derived from a raw submission. */
export const normalizedResponseSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  phone: phoneSchema.optional(),
  instruments: z.array(instrumentPreferenceSchema).min(1),
  willingToDouble: z.boolean().nullable().default(null),
  experienceLevel: experienceLevelSchema.nullable().default(null),
  difficultyPreference: difficultySchema.nullable().default(null),
  notes: z.string().max(4000).optional(),
});
export type NormalizedResponse = z.infer<typeof normalizedResponseSchema>;

export const responseStatuses = ['new', 'linked', 'rejected', 'withdrawn'] as const;
export const responseStatusSchema = z.enum(responseStatuses);
