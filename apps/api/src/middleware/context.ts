import type { NextFunction, Request, Response } from 'express';
import { roleRank, type TenantRole } from '@score-assign/shared';
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
    if (tenant.status === 'suspended') throw forbidden('This workspace is suspended');

    req.tenant = tenant;
    req.db = getTenantModels(tenant.dbName);
    next();
  } catch (error) {
    next(error instanceof Error && error.name === 'HttpError' ? error : unauthorized());
  }
}

export function requireRole(minimum: TenantRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    if (roleRank[req.auth.role] < roleRank[minimum]) {
      return next(forbidden(`Requires ${minimum} access or higher`));
    }
    next();
  };
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
