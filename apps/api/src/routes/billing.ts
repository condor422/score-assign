import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { checkoutSchema, planCatalog, quotePrice } from '@score-assign/shared';
import { config } from '../config.js';
import { getBaseConnection } from '../db/connection.js';
import { platformModels, type DiscountCodeDoc, type TenantDoc } from '../models/platform.js';
import { requireAuth, requireRole, tenantContext } from '../middleware/context.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { effectiveLimits, isTrialExpired } from '../middleware/entitlements.js';
import { billingProvider } from '../services/billing.js';
import { recordAudit } from '../services/audit.js';

export const billingRouter = Router();
billingRouter.use(requireAuth);

/**
 * Resolves a discount code for a tenant, rejecting inactive, expired,
 * exhausted or already-redeemed codes. Returns the code document so callers
 * can price with it.
 */
async function resolveDiscount(
  code: string,
  tenant: TenantDoc,
  planKey: 'annual',
): Promise<DiscountCodeDoc> {
  const { DiscountCode, Redemption } = platformModels(getBaseConnection());
  const discount = await DiscountCode.findOne({ code: code.toUpperCase() });
  if (!discount || !discount.active) throw badRequest('That discount code is not valid');

  const now = new Date();
  if (discount.validFrom && discount.validFrom > now) throw badRequest('That code is not active yet');
  if (discount.validUntil && discount.validUntil < now) throw badRequest('That code has expired');
  if (!discount.appliesToPlanKeys.includes(planKey)) {
    throw badRequest('That code does not apply to this plan');
  }
  if (discount.maxRedemptions !== null && discount.redemptionCount >= discount.maxRedemptions) {
    throw badRequest('That code has reached its redemption limit');
  }

  const used = await Redemption.countDocuments({
    tenantId: tenant._id,
    discountCodeId: discount._id,
  });
  if (used >= discount.perTenantLimit) throw badRequest('You have already used that code');

  return discount;
}

billingRouter.get(
  '/plans',
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const { Plan } = platformModels(getBaseConnection());
    const plans = await Plan.find({ active: true }).lean();
    res.json({
      plans: (plans.length > 0 ? plans : planCatalog).map((p) => ({
        key: p.key,
        name: p.name,
        priceCents: p.key === 'annual' ? config.ANNUAL_PRICE_CENTS : p.priceCents,
        interval: 'year',
        limits: p.limits,
      })),
      current: {
        plan: tenant.plan,
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
        trialExpired: isTrialExpired(tenant),
        currentPeriodEnd: tenant.currentPeriodEnd,
        limits: effectiveLimits(tenant),
      },
    });
  }),
);

/** Prices a code without redeeming it, so the UI can preview the discount. */
billingRouter.post(
  '/quote',
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const code = String(req.body?.discountCode ?? '').trim();
    if (!code) {
      res.json(quotePrice(config.ANNUAL_PRICE_CENTS, null));
      return;
    }
    const discount = await resolveDiscount(code, tenant, 'annual');
    res.json({
      ...quotePrice(config.ANNUAL_PRICE_CENTS, {
        code: discount.code,
        label: discount.label,
        type: discount.type,
        value: discount.value,
      }),
      requiresVerification: discount.requiresVerification,
    });
  }),
);

/**
 * Starts checkout. With the stub provider no money moves and the subscription
 * is activated immediately, which keeps the entitlement path exercisable
 * before a payment processor is connected.
 */
billingRouter.post(
  '/checkout',
  requireRole('owner'),
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const input = checkoutSchema.parse(req.body);
    const { Tenant, Subscription, DiscountCode, Redemption } = platformModels(getBaseConnection());

    const discount = input.discountCode
      ? await resolveDiscount(input.discountCode, tenant, 'annual')
      : null;

    const session = await billingProvider().createCheckoutSession({
      tenantId: String(tenant._id),
      tenantSlug: tenant.slug,
      customerEmail: tenant.contactEmail,
      planKey: 'annual',
      listPriceCents: config.ANNUAL_PRICE_CENTS,
      discount: discount
        ? {
            code: discount.code,
            label: discount.label,
            type: discount.type,
            value: discount.value,
          }
        : null,
    });

    const annual = planCatalog.find((p) => p.key === 'annual')!;
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await Subscription.create({
      tenantId: tenant._id,
      planKey: 'annual',
      provider: session.provider,
      providerSubscriptionId: session.sessionId,
      status: session.simulated ? 'active' : 'pending',
      discountCodeId: discount?._id ?? null,
      listPriceCents: session.quote.listPriceCents,
      discountCents: session.quote.discountCents,
      amountCents: session.quote.totalCents,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    });

    if (discount) {
      await DiscountCode.updateOne({ _id: discount._id }, { $inc: { redemptionCount: 1 } });
      await Redemption.create({ tenantId: tenant._id, discountCodeId: discount._id });
    }

    if (session.simulated) {
      await Tenant.updateOne(
        { _id: tenant._id },
        {
          $set: {
            status: 'active',
            plan: 'annual',
            limits: annual.limits,
            currentPeriodEnd: periodEnd,
            discountCodeId: discount?._id ?? null,
            // Verification-gated codes still owe proof of eligibility.
            pendingVerification: discount?.requiresVerification ?? false,
          },
        },
      );
    }

    await recordAudit({
      tenantId: tenant._id,
      actorUserId: new Types.ObjectId(req.auth!.sub),
      action: 'billing.checkout_started',
      targetType: 'subscription',
      targetId: session.sessionId,
      meta: { totalCents: session.quote.totalCents, code: discount?.code ?? null },
      ip: req.ip ?? null,
    });

    res.status(201).json({
      checkoutUrl: session.checkoutUrl,
      quote: session.quote,
      activated: session.simulated,
    });
  }),
);

billingRouter.get(
  '/subscription',
  asyncRoute(async (req: Request, res) => {
    const { tenant } = tenantContext(req);
    const { Subscription } = platformModels(getBaseConnection());
    const subscription = await Subscription.findOne({ tenantId: tenant._id })
      .sort({ createdAt: -1 })
      .lean();
    if (!subscription) throw notFound('No subscription yet');
    res.json({
      id: String(subscription._id),
      planKey: subscription.planKey,
      status: subscription.status,
      listPriceCents: subscription.listPriceCents,
      discountCents: subscription.discountCents,
      amountCents: subscription.amountCents,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }),
);
