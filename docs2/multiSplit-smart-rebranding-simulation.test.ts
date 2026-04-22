import { describe, expect, it } from 'vitest';
import type { TradeInput } from '../utils/multiSplitCalc';
import {
  applyTemplateSim,
  buildMultiSplitStrategyFromDraftSim,
  buildMultiSplitSummaryLinesSim,
  calculateMultiSplitBuyGuideSim,
  calculateMultiSplitCashUsagePctSim,
  calculateMultiSplitGuideStateSim,
  calculateMultiSplitSellGuideSim,
  deriveMultiSplitIntermediateTakeProfitRatioPctSim,
  findTargetHoldingSim,
  formatCurrencySim,
  resolveAppliedLocRatioSim,
} from './multiSplit-smart-rebranding-simulation-snippets';

function makeTrade(
  overrides: Partial<TradeInput> & { type: 'buy' | 'sell'; stock: string },
): TradeInput {
  return {
    date: '2026-04-22',
    price: 100,
    quantity: 1,
    fee: 0,
    ...overrides,
  };
}

function makeStrategy() {
  return buildMultiSplitStrategyFromDraftSim({
    targetStock: 'TQQQ',
    targetReturnRate: 12,
    totalSplitCount: 20,
    baseLocRatio: 50,
    mainTakeProfitRatioPct: 65,
    riskCutRatioPct: 20,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi40',
      budgetPreset: 'loc70',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma5_20',
      budgetPreset: 'moc70',
    },
  });
}

describe('multiSplit smart rebranding simulation', () => {
  it('uses calcHoldings-based target holding accounting only for the configured symbol', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 10 }),
      makeTrade({ type: 'sell', stock: 'TQQQ', price: 120, quantity: 4 }),
      makeTrade({ type: 'buy', stock: 'AAPL', price: 200, quantity: 3 }),
    ];

    expect(findTargetHoldingSim(trades, ' tqqq ')).toEqual({
      stock: 'TQQQ',
      quantity: 6,
      totalCost: 600,
      avgPrice: 100,
      realizedPnL: 80,
    });
  });

  it('tracks cash usage from target holding cost only and ignores other positions', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 1 }),
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 9 }),
    ];
    const targetHolding = findTargetHoldingSim(trades, 'TQQQ');
    const investedCost = Math.max(0, targetHolding?.totalCost ?? 0);

    expect(
      calculateMultiSplitCashUsagePctSim({
        investedCost,
        oneTimeAmount: 100,
        totalSplitCount: 2,
      }),
    ).toBe(50);
  });

  it('maps draft presets into runtime LOC ratio rules without introducing a new identifier', () => {
    expect(makeStrategy()).toEqual({
      targetStock: 'TQQQ',
      targetReturnRate: 12,
      totalSplitCount: 20,
      baseLocRatio: 50,
      mainTakeProfitRatioPct: 65,
      riskCutRatioPct: 20,
      rsiRule: {
        threshold: 40,
        locRatio: 70,
      },
      alignmentRule: {
        shortPeriod: 5,
        longPeriod: 20,
        locRatio: 30,
      },
    });
  });

  it('falls back to baseLocRatio when no RSI or alignment condition matches', () => {
    const strategy = makeStrategy();

    expect(
      resolveAppliedLocRatioSim(strategy, {
        currentPrice: 95,
        rsi: 55,
        maByPeriod: {
          5: 100,
          20: 101,
        },
      }),
    ).toBe(50);
  });

  it('chooses the larger LOC preset when RSI and alignment conditions both match', () => {
    const strategy = makeStrategy();

    expect(
      resolveAppliedLocRatioSim(strategy, {
        currentPrice: 95,
        rsi: 35,
        maByPeriod: {
          5: 105,
          20: 100,
        },
      }),
    ).toBe(70);
  });

  it('keeps main/intermediate take-profit ratios complementary and rejects out-of-range main ratio', () => {
    expect(deriveMultiSplitIntermediateTakeProfitRatioPctSim(65)).toBe(35);
    expect(deriveMultiSplitIntermediateTakeProfitRatioPctSim(100)).toBe(0);
    expect(() => deriveMultiSplitIntermediateTakeProfitRatioPctSim(0)).toThrow(
      /mainTakeProfitRatioPct/,
    );
    expect(() => deriveMultiSplitIntermediateTakeProfitRatioPctSim(101)).toThrow(
      /mainTakeProfitRatioPct/,
    );
  });

  it('splits sell guidance into main, intermediate, and risk-cut quantities', () => {
    expect(
      calculateMultiSplitSellGuideSim({
        currentQuantity: 17,
        mainTakeProfitRatioPct: 65,
        riskCutRatioPct: 20,
      }),
    ).toEqual({
      mainTakeProfitQty: 11,
      intermediateTakeProfitQty: 6,
      riskCutQty: 3,
    });
  });

  it('assigns a single share to the closer take-profit bucket instead of hard-biasing main or intermediate', () => {
    expect(
      calculateMultiSplitSellGuideSim({
        currentQuantity: 1,
        mainTakeProfitRatioPct: 10,
        riskCutRatioPct: 0,
      }),
    ).toEqual({
      mainTakeProfitQty: 0,
      intermediateTakeProfitQty: 1,
      riskCutQty: 0,
    });

    expect(
      calculateMultiSplitSellGuideSim({
        currentQuantity: 1,
        mainTakeProfitRatioPct: 100,
        riskCutRatioPct: 0,
      }),
    ).toEqual({
      mainTakeProfitQty: 1,
      intermediateTakeProfitQty: 0,
      riskCutQty: 0,
    });

    expect(
      calculateMultiSplitSellGuideSim({
        currentQuantity: 1,
        mainTakeProfitRatioPct: 90,
        riskCutRatioPct: 0,
      }),
    ).toEqual({
      mainTakeProfitQty: 1,
      intermediateTakeProfitQty: 0,
      riskCutQty: 0,
    });
  });

  it('uses no-stop LOC ratio resolution and MOC-first waterfall for buy guidance', () => {
    const state = calculateMultiSplitGuideStateSim({
      trades: [makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 5 })],
      strategy: makeStrategy(),
      oneTimeAmount: 100,
      feeRate: 0.25,
      snapshot: {
        currentPrice: 95,
        rsi: 35,
        maByPeriod: {
          5: 105,
          20: 100,
        },
      },
    });

    expect(state.appliedLocRatioPct).toBe(70);
    expect(state.displayLocBuy).toEqual({
      price: 100,
      quantity: 10,
    });
    expect(state.displayMocBuy).toEqual({
      quantity: 4,
    });
  });

  it('keeps integer-share guidance intact at floating-point boundaries without losing one share', () => {
    const precisionStrategy = buildMultiSplitStrategyFromDraftSim({
      targetStock: 'TQQQ',
      targetReturnRate: 12,
      totalSplitCount: 3,
      baseLocRatio: 100,
      mainTakeProfitRatioPct: 65,
      riskCutRatioPct: 20,
    });

    expect(
      calculateMultiSplitBuyGuideSim({
        remainingBudget: 0.3,
        feeRate: 0,
        avgPrice: 0.1,
        snapshot: {
          currentPrice: 1,
        },
        strategy: precisionStrategy,
      }),
    ).toEqual({
      appliedLocRatioPct: 100,
      displayLocBuy: {
        price: 0.1,
        quantity: 3,
      },
      displayMocBuy: undefined,
    });
  });

  it('replaces every duplicated template token instead of only the first one', () => {
    expect(
      applyTemplateSim({
        template: '{label}: {value}% | {label}: {value}%',
        replacements: {
          label: '현금 사용률',
          value: '25',
        },
      }),
    ).toBe('현금 사용률: 25% | 현금 사용률: 25%');
  });

  it('formats currency via the native currency api and returns empty text for invalid values', () => {
    expect(formatCurrencySim(100)).toBe('$100.00');
    expect(formatCurrencySim(Number.NaN)).toBe('');
  });

  it('returns empty buy guidance when corrupted near-zero unit costs would create an unsafe division path', () => {
    expect(
      calculateMultiSplitBuyGuideSim({
        remainingBudget: 1000,
        feeRate: 0,
        avgPrice: Number.EPSILON / 2,
        snapshot: {
          currentPrice: Number.EPSILON / 2,
        },
        strategy: makeStrategy(),
      }),
    ).toEqual({
      appliedLocRatioPct: 50,
    });
  });

  it('treats exact rounded seed usage as exhausted without mixing quantity epsilon into currency comparisons', () => {
    const state = calculateMultiSplitGuideStateSim({
      trades: [makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 10 })],
      strategy: buildMultiSplitStrategyFromDraftSim({
        targetStock: 'TQQQ',
        targetReturnRate: 12,
        totalSplitCount: 10,
        baseLocRatio: 50,
        mainTakeProfitRatioPct: 65,
        riskCutRatioPct: 20,
      }),
      oneTimeAmount: 100,
      feeRate: 0.25,
      snapshot: {
        currentPrice: 95,
      },
    });

    expect(state.isFirstBuy).toBe(false);
    expect(state.isSeedExhausted).toBe(true);
    expect(state.displayLocBuy).toBeUndefined();
    expect(state.displayMocBuy).toBeUndefined();
  });

  it('keeps first-buy state empty instead of hallucinating LOC or MOC guidance', () => {
    const state = calculateMultiSplitGuideStateSim({
      trades: [],
      strategy: makeStrategy(),
      oneTimeAmount: 100,
      feeRate: 0.25,
      snapshot: {
        currentPrice: 95,
        rsi: 35,
        maByPeriod: {
          5: 105,
          20: 100,
        },
      },
    });

    expect(state).toEqual({
      cashUsagePct: 0,
      totalInvested: 0,
      totalSeed: 2000,
      remainingBudget: 2000,
      currentQuantity: 0,
      avgPrice: 0,
      isFirstBuy: true,
      isSeedExhausted: false,
      appliedLocRatioPct: 70,
      sellGuide: {
        mainTakeProfitQty: 0,
        intermediateTakeProfitQty: 0,
        riskCutQty: 0,
      },
    });
  });

  it('formats summary lines with avgPrice LOC and quantity-only MOC output', () => {
    const state = calculateMultiSplitGuideStateSim({
      trades: [makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 5 })],
      strategy: makeStrategy(),
      oneTimeAmount: 100,
      feeRate: 0.25,
      snapshot: {
        currentPrice: 95,
        rsi: 35,
        maByPeriod: {
          5: 105,
          20: 100,
        },
      },
    });

    const lines = buildMultiSplitSummaryLinesSim({
      lang: 'ko',
      state,
    });

    expect(lines).toContain('현금 사용률: 25%');
    expect(lines).toContain('평단가 매수 (LOC): $100.00 / 10주');
    expect(lines).toContain('분할 매수 (MOC): 4주');
    expect(lines).toContain('메인 익절: 3주');
    expect(lines).toContain('중간 익절: 2주');
    expect(lines).toContain('리스크 컷: 1주');
    expect(lines.some((line) => line.includes('$95.00 /'))).toBe(false);
  });
});
