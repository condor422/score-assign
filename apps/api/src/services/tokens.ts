import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import type { TenantRole } from '@score-assign/shared';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  /** Tenant the session is scoped to. Never read from the request body. */
  tenantId: string;
  tenantSlug: string;
  role: TenantRole;
  isPlatformAdmin: boolean;
}

export interface MusicianTokenClaims {
  sub: string;
  tenantId: string;
  scope: 'musician';
}

/** The TTLs come from configuration, which jsonwebtoken types as a literal union. */
function signOptions(ttl: string): SignOptions {
  return { expiresIn: ttl as SignOptions['expiresIn'], issuer: 'score-assign' };
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, signOptions(config.ACCESS_TOKEN_TTL));
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, { issuer: 'score-assign' }) as AccessTokenClaims;
}

export function signMusicianToken(claims: MusicianTokenClaims): string {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, signOptions('7d'));
}

export function verifyMusicianToken(token: string): MusicianTokenClaims {
  const claims = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'score-assign',
  }) as MusicianTokenClaims;
  if (claims.scope !== 'musician') throw new Error('wrong token scope');
  return claims;
}

/**
 * Opaque refresh tokens are stored only as digests, so a database leak cannot
 * be replayed as a session.
 */
export function createOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
