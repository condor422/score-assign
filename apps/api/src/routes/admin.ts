import { Router, type Request } from 'express';
import { discountCodeInputSchema, discountCodePatchSchema } from '@score-assign/shared';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/context.js';
import { asyncRoute, notFound } from '../middleware/errors.js';

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

adminRouter.get(
  '/tenants',
  asyncRoute(async (_req: Request, res) => {
    const { Tenant } = platformModels(getBaseConnection());
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).limit(500).lean();
    res.json(
      tenants.map((t) => ({
        id: String(t._id),
        slug: t.slug,
        name: t.name,
        status: t.status,
        plan: t.plan,
        trialEndsAt: t.trialEndsAt,
        currentPeriodEnd: t.currentPeriodEnd,
        pendingVerification: t.pendingVerification,
      })),
    );
  }),
);

/** Clears the verification hold once eligibility evidence has been reviewed. */
adminRouter.post(
  '/tenants/:id/verify-discount',
  asyncRoute(async (req: Request, res) => {
    const { Tenant } = platformModels(getBaseConnection());
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { pendingVerification: false } },
      { new: true },
    );
    if (!tenant) throw notFound('Tenant not found');
    res.json({ id: String(tenant._id), pendingVerification: tenant.pendingVerification });
  }),
);
