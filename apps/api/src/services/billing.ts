import { randomUUID } from 'node:crypto';
import { quotePrice, type PriceQuote } from '@score-assign/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface CheckoutRequest {
  tenantId: string;
  tenantSlug: string;
  customerEmail: string;
  planKey: 'annual';
  listPriceCents: number;
  discount?: {
    code: string;
    label: string;
    type: 'percent' | 'fixed';
    value: number;
  } | null;
}

export interface CheckoutSession {
  provider: string;
  sessionId: string;
  /** Where the client sends the user to pay. */
  checkoutUrl: string;
  quote: PriceQuote;
  /** True when no money moved and the subscription was activated locally. */
  simulated: boolean;
}

/**
 * Payment provider boundary. The application never depends on a specific
 * processor: swapping in Stripe means implementing this interface and setting
 * BILLING_PROVIDER, with no changes to routes or the entitlement logic.
 */
export interface BillingProvider {
  readonly name: string;
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

/**
 * Development stand-in: prices the plan with the same discount rules a real
 * processor would apply, then reports the subscription as paid so the rest of
 * the product (entitlements, limits, renewal dates) can be exercised without
 * a payment account.
 */
class StubBillingProvider implements BillingProvider {
  readonly name = 'stub';

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const quote = quotePrice(request.listPriceCents, request.discount ?? null);
    const sessionId = `stub_${randomUUID()}`;
    logger.info(
      { tenantId: request.tenantId, sessionId, totalCents: quote.totalCents },
      'stub checkout session created',
    );
    return {
      provider: this.name,
      sessionId,
      checkoutUrl: `${config.WEB_ORIGIN}/billing/stub-checkout?session=${sessionId}`,
      quote,
      simulated: true,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    logger.info({ subscriptionId }, 'stub subscription canceled');
  }
}

export function billingProvider(): BillingProvider {
  switch (config.BILLING_PROVIDER) {
    case 'stub':
    default:
      return new StubBillingProvider();
  }
}
