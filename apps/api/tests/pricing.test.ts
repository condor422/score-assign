import { describe, expect, it } from 'vitest';
import {
  ANNUAL_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  periodEndFor,
  quotePrice,
  seedDiscountCodes,
  type PaidPlanKey,
} from '@score-assign/shared';

const byCode = (code: string) => seedDiscountCodes.find((c) => c.code === code)!;

const quoteWithCode = (planKey: PaidPlanKey, price: number, code: string) => {
  const discount = byCode(code);
  return quotePrice(planKey, price, {
    code: discount.code,
    label: discount.label,
    type: discount.type,
    value: discount.value,
  });
};

describe('quotePrice', () => {
  it('charges the list price with no code', () => {
    expect(quotePrice('annual', ANNUAL_PRICE_CENTS).totalCents).toBe(9600);
    expect(quotePrice('monthly', MONTHLY_PRICE_CENTS).totalCents).toBe(1200);
  });

  it('reports the interval it priced', () => {
    expect(quotePrice('monthly', MONTHLY_PRICE_CENTS).interval).toBe('month');
    expect(quotePrice('annual', ANNUAL_PRICE_CENTS).interval).toBe('year');
  });

  it.each([
    ['STUDENT30', 6720],
    ['TEACHER40', 5760],
    ['NONPROFIT50', 4800],
  ])('applies %s to the $96 annual plan', (code, expected) => {
    expect(quoteWithCode('annual', ANNUAL_PRICE_CENTS, code).totalCents).toBe(expected);
  });

  it.each([
    ['STUDENT30', 840],
    ['TEACHER40', 720],
    ['NONPROFIT50', 600],
  ])('applies %s to the $12 monthly plan', (code, expected) => {
    expect(quoteWithCode('monthly', MONTHLY_PRICE_CENTS, code).totalCents).toBe(expected);
  });

  it('offers every seeded code on both intervals', () => {
    for (const code of seedDiscountCodes) {
      expect(code.appliesToPlanKeys).toEqual(['monthly', 'annual']);
    }
  });

  it('never discounts below zero', () => {
    const quote = quotePrice('annual', 9600, {
      code: 'BIG',
      label: 'Big',
      type: 'fixed',
      value: 20000,
    });
    expect(quote.totalCents).toBe(0);
    expect(quote.discountCents).toBe(9600);
  });
});

describe('periodEndFor', () => {
  it('renews a monthly plan a month out', () => {
    expect(periodEndFor('monthly', new Date('2026-01-15T00:00:00Z')).toISOString()).toBe(
      new Date('2026-02-15T00:00:00Z').toISOString(),
    );
  });

  it('renews an annual plan a year out', () => {
    expect(periodEndFor('annual', new Date('2026-01-15T00:00:00Z')).toISOString()).toBe(
      new Date('2027-01-15T00:00:00Z').toISOString(),
    );
  });
});
