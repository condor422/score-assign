import { describe, expect, it } from 'vitest';
import { ANNUAL_PRICE_CENTS, quotePrice, seedDiscountCodes } from '@score-assign/shared';

const byCode = (code: string) => seedDiscountCodes.find((c) => c.code === code)!;

describe('quotePrice', () => {
  it('charges the list price with no code', () => {
    expect(quotePrice(ANNUAL_PRICE_CENTS).totalCents).toBe(9600);
  });

  it.each([
    ['STUDENT30', 6720],
    ['TEACHER40', 5760],
    ['NONPROFIT50', 4800],
  ])('applies %s to the $96 annual plan', (code, expected) => {
    const discount = byCode(code);
    const quote = quotePrice(ANNUAL_PRICE_CENTS, {
      code: discount.code,
      label: discount.label,
      type: discount.type,
      value: discount.value,
    });
    expect(quote.totalCents).toBe(expected);
  });

  it('never discounts below zero', () => {
    const quote = quotePrice(9600, { code: 'BIG', label: 'Big', type: 'fixed', value: 20000 });
    expect(quote.totalCents).toBe(0);
    expect(quote.discountCents).toBe(9600);
  });
});
