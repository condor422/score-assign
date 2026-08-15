import { z } from 'zod';

/** Roles a platform user can hold within a single tenant. */
export const tenantRoles = ['owner', 'admin', 'director', 'viewer'] as const;
export const tenantRoleSchema = z.enum(tenantRoles);
export type TenantRole = z.infer<typeof tenantRoleSchema>;

/** Ordered from least to most privileged; used for role comparisons. */
export const roleRank: Record<TenantRole, number> = {
  viewer: 0,
  director: 1,
  admin: 2,
  owner: 3,
};

export const planKeys = ['free', 'annual'] as const;
export const planKeySchema = z.enum(planKeys);
export type PlanKey = z.infer<typeof planKeySchema>;

export const tenantStatuses = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended',
] as const;
export const tenantStatusSchema = z.enum(tenantStatuses);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const experienceLevels = [
  'intermediate',
  'advanced',
  'collegiate',
  'graduate_professional',
] as const;
export const experienceLevelSchema = z.enum(experienceLevels);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

/** Experience mapped to a numeric ladder so it can be compared to difficulty. */
export const experienceRank: Record<ExperienceLevel, number> = {
  intermediate: 1,
  advanced: 2,
  collegiate: 3,
  graduate_professional: 4,
};

export const difficulties = ['easier', 'moderate', 'challenging'] as const;
export const difficultySchema = z.enum(difficulties);
export type Difficulty = z.infer<typeof difficultySchema>;

export const difficultyRank: Record<Difficulty, number> = {
  easier: 1,
  moderate: 2,
  challenging: 3,
};

/** Flute-choir instrumentation seeded into every new tenant. */
export const defaultInstruments = [
  { key: 'piccolo', name: 'Piccolo', order: 1 },
  { key: 'c_flute', name: 'C Flute', order: 2 },
  { key: 'alto_flute', name: 'Alto Flute', order: 3 },
  { key: 'bass_flute', name: 'Bass Flute', order: 4 },
  { key: 'contrabass_flute', name: 'Contrabass Flute', order: 5 },
] as const;

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinalPartLabel(partNumber: number): string {
  const rem100 = partNumber % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${partNumber}th`;
  switch (partNumber % 10) {
    case 1:
      return `${partNumber}st`;
    case 2:
      return `${partNumber}nd`;
    case 3:
      return `${partNumber}rd`;
    default:
      return `${partNumber}th`;
  }
}

export const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase letters, digits and hyphens only');

/** Subdomains that can never belong to a tenant. */
export const reservedSlugs = new Set([
  'www',
  'app',
  'api',
  'admin',
  'auth',
  'billing',
  'static',
  'assets',
  'cdn',
  'mail',
  'support',
  'status',
  'docs',
  'help',
  'blog',
]);

export const emailSchema = z.string().trim().toLowerCase().email();

/** Deliberately permissive: international and extension formats vary widely. */
export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .regex(/^[+()\-.\s\d]+$/, 'digits and phone punctuation only');
