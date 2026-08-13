import { z } from 'zod';
import { tenantRoles, type TenantRole } from './domain.js';

/**
 * Access is expressed as capabilities rather than "role >= director"
 * comparisons, so adding a role means editing one table instead of auditing
 * every route.
 */
export const capabilities = [
  /** See the member list at all. */
  'roster.read',
  /** See musician email and phone. Withheld from everyone below admin. */
  'roster.readContact',
  /** Create and edit musician records. */
  'roster.write',
  /** Songs, parts and seasons. */
  'program.write',
  /** Trigger the on-demand assignment run and revert runs. */
  'assignment.run',
  /** Drag-and-drop moves, locking and removal. */
  'assignment.write',
  /** Email musicians their parts. */
  'assignment.notify',
  /** Edit the intake form definition. */
  'form.write',
  /** Read raw intake submissions, which contain whatever the musician typed. */
  'form.readResponses',
  /** Plan changes and checkout. */
  'billing.manage',
  /** Invite teammates and change their roles. */
  'team.manage',
] as const;
export const capabilitySchema = z.enum(capabilities);
export type Capability = z.infer<typeof capabilitySchema>;

const viewer: Capability[] = ['roster.read'];

/**
 * A section leader is a viewer today; their reads are additionally narrowed to
 * their own sections (see sectionScope on the API side). Granting them
 * assignment.write within their section is a one-line change here.
 */
const sectionLeader: Capability[] = [...viewer];

const director: Capability[] = [
  ...viewer,
  'program.write',
  'assignment.run',
  'assignment.write',
  'assignment.notify',
  'form.write',
  'roster.write',
];

/**
 * Contact details stop here. A director never needs an address to do their job
 * because part emails are rendered and sent server-side, so the values never
 * reach a director's browser.
 */
const admin: Capability[] = [...director, 'roster.readContact', 'form.readResponses', 'team.manage'];

const owner: Capability[] = [...admin, 'billing.manage'];

export const roleCapabilities: Record<TenantRole, readonly Capability[]> = {
  viewer,
  section_leader: sectionLeader,
  director,
  admin,
  owner,
};

export function roleHasCapability(role: TenantRole, capability: Capability): boolean {
  return roleCapabilities[role].includes(capability);
}

/** Capabilities as a flat list, for shipping to the client in a session payload. */
export function capabilitiesForRole(role: TenantRole): Capability[] {
  return [...roleCapabilities[role]];
}

/** Roles a given role is allowed to grant, so nobody can escalate past themselves. */
export function grantableRoles(role: TenantRole): TenantRole[] {
  if (role === 'owner') return [...tenantRoles];
  if (role === 'admin') return tenantRoles.filter((r) => r !== 'owner');
  return [];
}
