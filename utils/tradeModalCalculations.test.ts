import { describe, expect, it } from 'vitest';
import { calculateBudgetBuyQuantity } from '../src/utils/tradeModalCalculations';

describe('calculateBudgetBuyQuantity', () => {
  it('keeps 2 shares at the epsilon boundary instead of dropping to 1', () => {
    const rawQuantity = 2 - Number.EPSILON / 2;
    const price = 100 / rawQuantity;

    const quantity = calculateBudgetBuyQuantity({
      price,
      dailyBuyAmount: 100,
      feeRatePercent: 0,
    });

    expect(quantity).toBe(2);
  });

  it('keeps 2 shares when the budget exactly matches price plus fees', () => {
    const quantity = calculateBudgetBuyQuantity({
      price: 100,
      dailyBuyAmount: 200.5,
      feeRatePercent: 0.25,
    });

    expect(quantity).toBe(2);
  });

  it('keeps 1 share when the budget exactly matches a single share plus fees', () => {
    const quantity = calculateBudgetBuyQuantity({
      price: 100,
      dailyBuyAmount: 100.25,
      feeRatePercent: 0.25,
    });

    expect(quantity).toBe(1);
  });
});
