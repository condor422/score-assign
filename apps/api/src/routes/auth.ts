import { Router, type Request } from 'express';
import argon2 from 'argon2';
import type { Types } from 'mongoose';
import rateLimit from 'express-rate-limit';
import { acceptInviteSchema, loginSchema, signupSchema } from '@score-assign/shared';
import { config } from '../config.js';
import { getBaseConnection } from '../db/connection.js';
import { platformModels, type PlatformUserDoc, type TenantDoc } from '../models/platform.js';
import { asyncRoute, badRequest, conflict, unauthorized } from '../middleware/errors.js';
import { requireAuth, tenantSlugFromRequest } from '../middleware/context.js';
import { effectiveLimits, isTrialExpired } from '../middleware/entitlements.js';
import { provisionTenant } from '../services/provisioning.js';
import {
  createOpaqueToken,
  hashToken,
  signAccessToken,
  type AccessTokenClaims,
} from '../services/tokens.js';

const REFRESH_COOKIE = 'sa_refresh';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function sessionPayload(user: PlatformUserDoc, tenant: TenantDoc, claims: AccessTokenClaims) {
  return {
    accessToken: signAccessToken(claims),
    user: { id: String(user._id), name: user.name, email: user.email, role: claims.role },
    tenant: {
      id: String(tenant._id),
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      trialEndsAt: tenant.trialEndsAt,
      trialExpired: isTrialExpired(tenant),
      limits: effectiveLimits(tenant),
    },
  };
}

async function issueRefreshToken(userId: Types.ObjectId): Promise<string> {
  const { RefreshToken } = platformModels(getBaseConnection());
  const { token, hash } = createOpaqueToken();
  await RefreshToken.create({
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

/** Creates the organization, its dedicated database and the owner account. */
authRouter.post(
  '/signup',
  authLimiter,
  asyncRoute(async (req: Request, res) => {
    const input = signupSchema.parse(req.body);
    const { PlatformUser } = platformModels(getBaseConnection());

    const existing = await PlatformUser.findOne({ email: input.email });
    if (existing && existing.memberships.length > 0) {
      // An existing operator may open a second workspace, but not by
      // re-registering with a different password.
      throw conflict('That email already has an account. Sign in and create the workspace there.');
    }

    const { tenant } = await provisionTenant({
      name: input.organizationName,
      slug: input.slug,
      contactEmail: input.email,
    });

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await PlatformUser.create({
      email: input.email,
      name: input.name,
      passwordHash,
      memberships: [{ tenantId: tenant._id, role: 'owner' }],
    });

    const refresh = await issueRefreshToken(user._id);
    res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    res.status(201).json(
      sessionPayload(user, tenant, {
        sub: String(user._id),
        email: user.email,
        tenantId: String(tenant._id),
        tenantSlug: tenant.slug,
        role: 'owner',
        isPlatformAdmin: user.isPlatformAdmin,
      }),
    );
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncRoute(async (req: Request, res) => {
    const input = loginSchema.parse(req.body);
    const { PlatformUser, Tenant } = platformModels(getBaseConnection());

    const user = await PlatformUser.findOne({ email: input.email });
    // Same message either way so the endpoint cannot enumerate accounts.
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw unauthorized('Invalid email or password');
    }

    const slug = input.tenantSlug ?? tenantSlugFromRequest(req);
    const tenant = slug
      ? await Tenant.findOne({ slug })
      : await Tenant.findById(user.memberships[0]?.tenantId);
    if (!tenant) throw unauthorized('Invalid email or password');

    const membership = user.memberships.find((m) => String(m.tenantId) === String(tenant._id));
    if (!membership) throw unauthorized('Invalid email or password');

    user.lastLoginAt = new Date();
    await user.save();

    const refresh = await issueRefreshToken(user._id);
    res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    res.json(
      sessionPayload(user, tenant, {
        sub: String(user._id),
        email: user.email,
        tenantId: String(tenant._id),
        tenantSlug: tenant.slug,
        role: membership.role,
        isPlatformAdmin: user.isPlatformAdmin,
      }),
    );
  }),
);

/** Rotates the refresh token on every use so a stolen token is single-shot. */
authRouter.post(
  '/refresh',
  asyncRoute(async (req: Request, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (typeof presented !== 'string') throw unauthorized('No refresh token');

    const { RefreshToken, PlatformUser, Tenant } = platformModels(getBaseConnection());
    const record = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      throw unauthorized('Refresh token is no longer valid');
    }

    record.revokedAt = new Date();
    await record.save();

    const user = await PlatformUser.findById(record.userId);
    if (!user) throw unauthorized('Account no longer exists');

    const slug = tenantSlugFromRequest(req);
    const tenant = slug
      ? await Tenant.findOne({ slug })
      : await Tenant.findById(user.memberships[0]?.tenantId);
    const membership = tenant
      ? user.memberships.find((m) => String(m.tenantId) === String(tenant._id))
      : undefined;
    if (!tenant || !membership) throw unauthorized('No access to this workspace');

    const refresh = await issueRefreshToken(user._id);
    res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    res.json(
      sessionPayload(user, tenant, {
        sub: String(user._id),
        email: user.email,
        tenantId: String(tenant._id),
        tenantSlug: tenant.slug,
        role: membership.role,
        isPlatformAdmin: user.isPlatformAdmin,
      }),
    );
  }),
);

authRouter.post(
  '/logout',
  asyncRoute(async (req: Request, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (typeof presented === 'string') {
      const { RefreshToken } = platformModels(getBaseConnection());
      await RefreshToken.updateOne(
        { tokenHash: hashToken(presented) },
        { $set: { revokedAt: new Date() } },
      );
    }
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req: Request, res) => {
    const { PlatformUser } = platformModels(getBaseConnection());
    const user = await PlatformUser.findById(req.auth!.sub);
    if (!user || !req.tenant) throw unauthorized();
    res.json(sessionPayload(user, req.tenant, req.auth!));
  }),
);

authRouter.post(
  '/accept-invite',
  authLimiter,
  asyncRoute(async (req: Request, res) => {
    const input = acceptInviteSchema.parse(req.body);
    const { Invite, PlatformUser, Tenant } = platformModels(getBaseConnection());

    const invite = await Invite.findOne({ tokenHash: hashToken(input.token) });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw badRequest('This invitation is no longer valid');
    }
    const tenant = await Tenant.findById(invite.tenantId);
    if (!tenant) throw badRequest('This workspace no longer exists');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user = await PlatformUser.findOne({ email: invite.email });
    if (user) {
      if (!user.memberships.some((m) => String(m.tenantId) === String(tenant._id))) {
        user.memberships.push({ tenantId: tenant._id, role: invite.role });
        await user.save();
      }
    } else {
      user = await PlatformUser.create({
        email: invite.email,
        name: input.name,
        passwordHash,
        memberships: [{ tenantId: tenant._id, role: invite.role }],
      });
    }

    invite.acceptedAt = new Date();
    await invite.save();

    const refresh = await issueRefreshToken(user._id);
    res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    res.status(201).json(
      sessionPayload(user, tenant, {
        sub: String(user._id),
        email: user.email,
        tenantId: String(tenant._id),
        tenantSlug: tenant.slug,
        role: invite.role,
        isPlatformAdmin: user.isPlatformAdmin,
      }),
    );
  }),
);
