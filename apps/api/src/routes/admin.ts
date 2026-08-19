import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  discountCodeInputSchema,
  discountCodePatchSchema,
  planIntervals,
  tenantStatusActionSchema,
  verifyDiscountSchema,
} from '@score-assign/shared';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/context.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.js';

/**
 * Platform-staff surface for pricing: discount codes and the verification
 * queue for codes that require proof (student ID, teaching post, 501c3 letter).
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get(
  '/discount-codes',
  asyncRoute(async (_req: Request, res) => {
    const { DiscountCode } = platformModels(getBaseConnection());
    const codes = await DiscountCode.find({}).sort({ createdAt: -1 }).lean();
    res.json(
      codes.map((c) => ({
        id: String(c._id),
        code: c.code,
        label: c.label,
        category: c.category,
        type: c.type,
        value: c.value,
        appliesToPlanKeys: c.appliesToPlanKeys,
        maxRedemptions: c.maxRedemptions,
        perTenantLimit: c.perTenantLimit,
        redemptionCount: c.redemptionCount,
        requiresVerification: c.requiresVerification,
        validFrom: c.validFrom,
        validUntil: c.validUntil,
        active: c.active,
      })),
    );
  }),
);

adminRouter.post(
  '/discount-codes',
  asyncRoute(async (req: Request, res) => {
    const input = discountCodeInputSchema.parse(req.body);
    const { DiscountCode } = platformModels(getBaseConnection());
    const created = await DiscountCode.create({ ...input, redemptionCount: 0 });
    res.status(201).json({ id: String(created._id), code: created.code });
  }),
);

adminRouter.patch(
  '/discount-codes/:id',
  asyncRoute(async (req: Request, res) => {
    const input = discountCodePatchSchema.parse(req.body);
    const { DiscountCode } = platformModels(getBaseConnection());
    const updated = await DiscountCode.findByIdAndUpdate(
      req.params.id,
      { $set: input },
      { new: true },
    );
    if (!updated) throw notFound('Discount code not found');
    res.json({ id: String(updated._id), code: updated.code, active: updated.active });
  }),
);

/** Tenant list for the console, optionally filtered by status or plan. */
adminRouter.get(
  '/tenants',
  asyncRoute(async (req: Request, res) => {
    const { Tenant, DiscountCode, PlatformUser } = platformModels(getBaseConnection());
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status;
    if (typeof req.query.plan === 'string' && req.query.plan) filter.plan = req.query.plan;
    if (req.query.pendingVerification === 'true') filter.pendingVerification = true;

    const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const codeIds = tenants.map((t) => t.discountCodeId).filter((id): id is Types.ObjectId => !!id);
    const codes = await DiscountCode.find({ _id: { $in: codeIds } }).lean();
    const codeById = new Map(codes.map((c) => [String(c._id), c]));
    const seatCounts = await PlatformUser.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $unwind: '$memberships' },
      { $group: { _id: '$memberships.tenantId', count: { $sum: 1 } } },
    ]);
    const seatsByTenant = new Map(seatCounts.map((s) => [String(s._id), s.count]));

    res.json(
      tenants.map((t) => {
        const code = t.discountCodeId ? codeById.get(String(t.discountCodeId)) : undefined;
        return {
          id: String(t._id),
          slug: t.slug,
          name: t.name,
          contactEmail: t.contactEmail,
          status: t.status,
          suspendedAt: t.suspendedAt,
          suspensionReason: t.suspensionReason,
          plan: t.plan,
          interval: planIntervals[t.plan],
          seats: seatsByTenant.get(String(t._id)) ?? 0,
          trialEndsAt: t.trialEndsAt,
          currentPeriodEnd: t.currentPeriodEnd,
          pendingVerification: t.pendingVerification,
          createdAt: t.createdAt,
          discountCode: code
            ? { code: code.code, label: code.label, category: code.category }
            : null,
        };
      }),
    );
  }),
);

/** Counts for the console's summary strip. */
adminRouter.get(
  '/metrics',
  asyncRoute(async (_req: Request, res) => {
    const { Tenant, DiscountCode } = platformModels(getBaseConnection());
    const [byStatus, byPlan, pendingVerification, activeCodes] = await Promise.all([
      Tenant.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Tenant.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      Tenant.countDocuments({ pendingVerification: true }),
      DiscountCode.countDocuments({ active: true }),
    ]);
    res.json({
      tenantsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      tenantsByPlan: Object.fromEntries(byPlan.map((p) => [p._id, p.count])),
      pendingVerification,
      activeCodes,
    });
  }),
);

/**
 * Suspension freezes a workspace instead of locking it out: staff keep read
 * access so they can retrieve their roster, and every write is refused until a
 * platform admin restores them. Restoring returns the status held before the
 * suspension rather than assuming 'active'.
 */
adminRouter.post(
  '/tenants/:id/status',
  asyncRoute(async (req: Request, res) => {
    const input = tenantStatusActionSchema.parse(req.body ?? {});
    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw notFound('Tenant not found');

    if (input.action === 'suspend') {
      if (tenant.status === 'suspended') throw badRequest('That workspace is already suspended');
      tenant.statusBeforeSuspension = tenant.status;
      tenant.status = 'suspended';
      tenant.suspendedAt = new Date();
      tenant.suspensionReason = input.reason ?? null;
    } else {
      if (tenant.status !== 'suspended') throw badRequest('That workspace is not suspended');
      tenant.status = tenant.statusBeforeSuspension ?? 'active';
      tenant.statusBeforeSuspension = null;
      tenant.suspendedAt = null;
      tenant.suspensionReason = null;
    }
    await tenant.save();

    await recordAudit({
      tenantId: tenant._id,
      actorUserId: new Types.ObjectId(req.auth!.sub),
      action: `tenant.${input.action}`,
      targetType: 'tenant',
      targetId: String(tenant._id),
      meta: { reason: input.reason ?? null, status: tenant.status },
      ip: req.ip ?? null,
    });

    res.json({ id: String(tenant._id), status: tenant.status });
  }),
);

/**
 * Resolves the verification hold on a discount claim. Approving clears the
 * hold; rejecting also drops the code from the tenant so a bogus claim does
 * not sit pending forever.
 */
adminRouter.post(
  '/tenants/:id/verify-discount',
  asyncRoute(async (req: Request, res) => {
    const input = verifyDiscountSchema.parse(req.body ?? {});
    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw notFound('Tenant not found');

    tenant.pendingVerification = false;
    if (input.decision === 'reject') tenant.discountCodeId = null;
    await tenant.save();

    await recordAudit({
      tenantId: tenant._id,
      actorUserId: new Types.ObjectId(req.auth!.sub),
      action: `discount.verification_${input.decision}`,
      targetType: 'tenant',
      targetId: String(tenant._id),
      meta: { note: input.note ?? null },
      ip: req.ip ?? null,
    });

    res.json({
      id: String(tenant._id),
      pendingVerification: tenant.pendingVerification,
      decision: input.decision,
    });
  }),
);
