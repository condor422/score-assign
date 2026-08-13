import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  grantableRoles,
  inviteSchema,
  memberRoleSchema,
  roleLabels,
  type TenantRole,
} from '@score-assign/shared';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { requireAuth, requireCapability, tenantContext } from '../middleware/context.js';
import { asyncRoute, badRequest, forbidden, notFound, paymentRequired } from '../middleware/errors.js';
import { effectiveLimits } from '../middleware/entitlements.js';
import { createOpaqueToken } from '../services/tokens.js';
import { emailProvider } from '../services/email.js';
import { tenantOrigin } from '../services/urls.js';

export const teamRouter = Router();
teamRouter.use(requireAuth);

/** Nobody may hand out a role they do not hold themselves. */
function assertGrantable(actor: TenantRole, target: TenantRole): void {
  if (!grantableRoles(actor).includes(target)) {
    throw forbidden(`You cannot grant the ${roleLabels[target]} role`);
  }
}

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
      members: users.map((u) => {
        const membership = u.memberships.find((m) => String(m.tenantId) === String(tenant._id));
        return {
          id: String(u._id),
          name: u.name,
          email: u.email,
          role: membership?.role ?? 'viewer',
          sectionInstrumentIds: (membership?.sectionInstrumentIds ?? []).map(String),
        };
      }),
      pendingInvites: invites.map((i) => ({
        id: String(i._id),
        email: i.email,
        role: i.role,
        sectionInstrumentIds: i.sectionInstrumentIds.map(String),
      })),
      grantableRoles: grantableRoles(req.auth!.role),
    });
  }),
);

teamRouter.post(
  '/invites',
  requireCapability('team.manage'),
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const input = inviteSchema.parse(req.body);
    assertGrantable(req.auth!.role, input.role);
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
      sectionInstrumentIds: input.sectionInstrumentIds.map((id) => new Types.ObjectId(id)),
      tokenHash: hash,
      invitedBy: req.auth!.sub,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const url = `${tenantOrigin(req, tenant.slug)}/accept-invite?token=${token}`;
    await emailProvider().send({
      to: input.email,
      subject: `You have been invited to ${tenant.name} on ScoreAssign`,
      text: `Accept the invitation (valid 14 days):\n\n${url}\n`,
    });

    res.status(201).json({ ok: true });
  }),
);

/** Changes a teammate's role, and for section leaders which sections they lead. */
teamRouter.patch(
  '/members/:userId',
  requireCapability('team.manage'),
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const input = memberRoleSchema.parse(req.body);
    assertGrantable(req.auth!.role, input.role);
    if (req.params.userId === req.auth!.sub) {
      throw badRequest('You cannot change your own role');
    }

    const { PlatformUser } = platformModels(getBaseConnection());
    const user = await PlatformUser.findOne({
      _id: req.params.userId,
      'memberships.tenantId': tenant._id,
    });
    if (!user) throw notFound('That teammate is not in this workspace');

    const membership = user.memberships.find((m) => String(m.tenantId) === String(tenant._id))!;
    assertGrantable(req.auth!.role, membership.role);
    membership.role = input.role;
    membership.sectionInstrumentIds =
      input.role === 'section_leader'
        ? input.sectionInstrumentIds.map((id) => new Types.ObjectId(id))
        : [];
    await user.save();

    res.json({
      id: String(user._id),
      role: membership.role,
      sectionInstrumentIds: membership.sectionInstrumentIds.map(String),
    });
  }),
);
