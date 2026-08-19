import type { NextFunction, Request, Response } from 'express';
import { roleHasCapability, type Capability } from '@score-assign/shared';
import { getBaseConnection } from '../db/connection.js';
import { getTenantModels } from '../db/tenantRegistry.js';
import { platformModels, type TenantDoc } from '../models/platform.js';
import type { TenantModels } from '../models/tenant.js';
import { forbidden, notFound, unauthorized } from './errors.js';
import { verifyAccessToken, verifyMusicianToken, type AccessTokenClaims } from '../services/tokens.js';
import { config } from '../config.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenClaims;
    musicianAuth?: { musicianId: string; tenantId: string };
    tenant?: TenantDoc;
    db?: TenantModels;
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Authenticates a tenant user and binds the request to that tenant's database. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const claims = verifyAccessToken(token);
    req.auth = claims;

    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findById(claims.tenantId);
    if (!tenant) throw unauthorized('Tenant no longer exists');

    req.tenant = tenant;
    req.db = getTenantModels(tenant.dbName);
    next();
  } catch (error) {
    next(error instanceof Error && error.name === 'HttpError' ? error : unauthorized());
  }
}

/**
 * Capabilities a suspended workspace keeps. Suspension freezes a tenant rather
 * than locking it out: staff can still read their data and export what they
 * need, but nothing may change until a platform admin restores them.
 */
const suspendedCapabilities: readonly Capability[] = ['roster.read', 'roster.readContact'];

/**
 * The only access check in the app. Roles map to capabilities in one shared
 * table, so a new role never means auditing route guards.
 */
export function requireCapability(capability: Capability) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    if (!roleHasCapability(req.auth.role, capability)) {
      return next(forbidden(`Your role cannot ${capability.replace('.', ' ')}`));
    }
    if (req.tenant?.status === 'suspended' && !suspendedCapabilities.includes(capability)) {
      return next(forbidden('This workspace is suspended and is read-only'));
    }
    next();
  };
}

export function can(req: Request, capability: Capability): boolean {
  return req.auth ? roleHasCapability(req.auth.role, capability) : false;
}

/**
 * Instrument sections a request may read. Section leaders see only the sections
 * they lead; every other role sees the whole ensemble, so this is a no-op for
 * them.
 */
export function sectionScope(req: Request): string[] | null {
  if (req.auth?.role !== 'section_leader') return null;
  return req.auth.sectionInstrumentIds ?? [];
}

/** Guards writes that are not already behind a capability, such as musician replies. */
export function assertNotSuspended(req: Request): void {
  if (req.tenant?.status === 'suspended') {
    throw forbidden('This workspace is suspended and is read-only');
  }
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.isPlatformAdmin) return next(forbidden('Platform administrators only'));
  next();
}

/** Authenticates a musician viewing their own assignments. */
export async function requireMusician(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const claims = verifyMusicianToken(token);
    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findById(claims.tenantId);
    if (!tenant) throw unauthorized('Tenant no longer exists');

    req.musicianAuth = { musicianId: claims.sub, tenantId: claims.tenantId };
    req.tenant = tenant;
    req.db = getTenantModels(tenant.dbName);
    next();
  } catch (error) {
    next(error instanceof Error && error.name === 'HttpError' ? error : unauthorized());
  }
}

/**
 * Resolves the tenant for unauthenticated traffic (public intake forms) from
 * the request subdomain, falling back to an explicit slug so path-based local
 * development works without wildcard DNS.
 */
export function tenantSlugFromRequest(req: Request): string | null {
  const explicit = req.params.tenantSlug ?? req.get('x-tenant-slug');
  if (explicit) return explicit.toLowerCase();

  const host = (req.hostname || '').toLowerCase();
  const suffixes = [config.APP_ROOT_DOMAIN, 'localhost'];
  for (const suffix of suffixes) {
    if (host.endsWith(`.${suffix}`)) {
      const label = host.slice(0, -(suffix.length + 1));
      // Ignore multi-label hosts like "a.b.scoreassign.com".
      if (label && !label.includes('.')) return label;
    }
  }
  return null;
}

export async function resolvePublicTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = tenantSlugFromRequest(req);
    if (!slug) throw notFound('Unknown workspace');
    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findOne({ slug });
    if (!tenant) throw notFound('Unknown workspace');
    if (tenant.status === 'suspended' || tenant.status === 'canceled') {
      throw forbidden('This workspace is not accepting registrations');
    }
    req.tenant = tenant;
    req.db = getTenantModels(tenant.dbName);
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrowing helper for handlers that run behind requireAuth/resolvePublicTenant. */
export function tenantContext(req: Request): { tenant: TenantDoc; db: TenantModels } {
  if (!req.tenant || !req.db) throw unauthorized();
  return { tenant: req.tenant, db: req.db };
}
