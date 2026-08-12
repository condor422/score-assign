import { Router, type Request } from 'express';
import { inviteSchema } from '@score-assign/shared';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { requireAuth, requireRole, tenantContext } from '../middleware/context.js';
import { asyncRoute, paymentRequired } from '../middleware/errors.js';
import { effectiveLimits } from '../middleware/entitlements.js';
import { createOpaqueToken } from '../services/tokens.js';
import { emailProvider } from '../services/email.js';
import { config } from '../config.js';

export const teamRouter = Router();
teamRouter.use(requireAuth);

teamRouter.get(
  '/',
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const { PlatformUser, Invite } = platformModels(getBaseConnection());
    const [users, invites] = await Promise.all([
      PlatformUser.find({ 'memberships.tenantId': tenant._id }).lean(),
      Invite.find({ tenantId: tenant._id, acceptedAt: null }).lean(),
    ]);
    res.json({
      members: users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.memberships.find((m) => String(m.tenantId) === String(tenant._id))?.role ?? 'viewer',
      })),
      pendingInvites: invites.map((i) => ({ id: String(i._id), email: i.email, role: i.role })),
    });
  }),
);

teamRouter.post(
  '/invites',
  requireRole('admin'),
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const input = inviteSchema.parse(req.body);
    const { PlatformUser, Invite } = platformModels(getBaseConnection());

    // Seats are a plan limit like any other resource.
    const seatsUsed = await PlatformUser.countDocuments({ 'memberships.tenantId': tenant._id });
    const pending = await Invite.countDocuments({ tenantId: tenant._id, acceptedAt: null });
    const maxSeats = effectiveLimits(tenant).maxSeats;
    if (seatsUsed + pending + 1 > maxSeats) {
      throw paymentRequired(`Your plan includes ${maxSeats} seat(s).`, {
        resource: 'seats',
        limit: maxSeats,
        used: seatsUsed + pending,
      });
    }

    const { token, hash } = createOpaqueToken();
    await Invite.create({
      tenantId: tenant._id,
      email: input.email,
      role: input.role,
      tokenHash: hash,
      invitedBy: req.auth!.sub,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const url = `https://${tenant.slug}.${config.APP_ROOT_DOMAIN}/accept-invite?token=${token}`;
    await emailProvider().send({
      to: input.email,
      subject: `You have been invited to ${tenant.name} on ScoreAssign`,
      text: `Accept the invitation (valid 14 days):\n\n${url}\n`,
    });

    res.status(201).json({ ok: true });
  }),
);
