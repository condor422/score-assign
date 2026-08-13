import type { Request } from 'express';
import { config } from '../config.js';

/**
 * The origin a tenant's own users reach the app on. Derived from the request
 * when it already arrived on that tenant's host, so links emailed during local
 * development point at `slug.localhost:5173` instead of the production domain.
 */
export function tenantOrigin(req: Request, slug: string): string {
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0]?.trim();
  if (host && host.toLowerCase().startsWith(`${slug.toLowerCase()}.`)) {
    const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0]?.trim() || 'http';
    return `${proto}://${host}`;
  }
  return `https://${slug}.${config.APP_ROOT_DOMAIN}`;
}
