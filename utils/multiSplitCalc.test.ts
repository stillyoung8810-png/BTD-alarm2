import { describe, expect, it } from 'vitest';
import {
  calcHoldings,
  calculateMultiSplitBuyGuide,
  calculateMultiSplitCashUsagePct,
  calculateMultiSplitGuideState,
  calculateMultiSplitSellGuide,
  normalizeMultiSplitReturnRates,
  resolveAppliedLocRatio,
  type TradeInput,
} from './multiSplitCalc';
import type {
  MultiSplitIndicatorSnapshot,
  MultiSplitStrategy,
} from '../types';

function makeTrade(
  overrides: Partial<TradeInput> & { type: 'buy' | 'sell'; stock: string },
): TradeInput {
  return {
    date: '2026-01-15',
    price: 100,
    quantity: 10,
    fee: 0,
    isMOC: false,
    ...overrides,
  };
}

function makeSmartSplitStrategy(
  overrides: Partial<MultiSplitStrategy> = {},
): MultiSplitStrategy {
  return {
    targetStock: overrides.targetStock ?? 'AAPL',
    targetReturnRate: overrides.targetReturnRate ?? 10,
    intermediateReturnRate: overrides.intermediateReturnRate ?? 5,
    totalSplitCount: overrides.totalSplitCount ?? 10,
    baseLocRatio: overrides.baseLocRatio ?? 50,
    mainTakeProfitRatioPct: overrides.mainTakeProfitRatioPct ?? 60,
    riskCutRatioPct: overrides.riskCutRatioPct ?? 25,
    rsiRule: overrides.rsiRule,
    alignmentRule: overrides.alignmentRule,
  };
}

function makeIndicatorSnapshot(
  overrides: Partial<MultiSplitIndicatorSnapshot> = {},
): MultiSplitIndicatorSnapshot {
  return {
    currentPrice: overrides.currentPrice ?? 110,
    rsi: overrides.rsi,
    maByPeriod: overrides.maByPeriod,
  };
}

describe('calcHoldings', () => {
  it('빈 거래 목록이면 빈 배열을 반환한다', () => {
    expect(calcHoldings([])).toEqual([]);
  });

  it('부분 매도 후 평균 단가와 실현손익을 유지한다', () => {
    const holdings = calcHoldings([
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 4, fee: 0 }),
    ]);

    expect(holdings).toEqual([
      {
        stock: 'AAPL',
        quantity: 6,
        totalCost: 600,
        avgPrice: 100,
        realizedPnL: 40,
      },
    ]);
  });

  it('전량 매도된 포지션도 realizedPnL 기록을 유지한다', () => {
    const holdings = calcHoldings([
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 5, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 5, fee: 0 }),
    ]);

    expect(holdings).toEqual([
      {
        stock: 'AAPL',
        quantity: 0,
        totalCost: 0,
        avgPrice: 0,
        realizedPnL: 50,
      },
    ]);
  });

  it('보유 수량보다 많이 매도하면 예외를 던진다', () => {
    expect(() =>
      calcHoldings([
        makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 3, fee: 0 }),
        makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 5, fee: 0 }),
      ]),
    ).toThrow(/초과 매도 에러/);
  });
});

describe('resolveAppliedLocRatio', () => {
  it('기본값과 조건부 preset이 동시에 맞으면 가장 높은 LOC 비율을 사용한다', () => {
    const strategy = makeSmartSplitStrategy({
      baseLocRatio: 50,
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
    const snapshot = makeIndicatorSnapshot({
      rsi: 30,
      maByPeriod: {
        5: 110,
        20: 100,
      },
    });

    expect(resolveAppliedLocRatio(strategy, snapshot)).toBe(70);
  });
});

describe('calculateMultiSplitCashUsagePct', () => {
  it('총 시드 대비 투자금 비율을 0~100 범위로 반올림해 반환한다', () => {
    expect(
      calculateMultiSplitCashUsagePct({
        investedCost: 1001,
        oneTimeAmount: 250,
        totalSplitCount: 10,
      }),
    ).toBe(40.04);
  });
});

describe('normalizeMultiSplitReturnRates', () => {
  it('스마트 스플릿 수익률 A/B를 허용 범위로 클램프하고 보정 여부를 반환한다', () => {
    expect(
      normalizeMultiSplitReturnRates({
        targetReturnRate: 300,
        intermediateReturnRate: -2,
      }),
    ).toEqual({
      targetReturnRate: 100,
      intermediateReturnRate: 1,
      didClamp: true,
    });
  });
});

describe('calculateMultiSplitBuyGuide', () => {
  it('MOC를 먼저 배정한 뒤 남은 예산으로 LOC 수량을 계산한다', () => {
    const result = calculateMultiSplitBuyGuide({
      buyTrancheBudget: 1000,
      feeRate: 0.25,
      avgPrice: 80,
      snapshot: makeIndicatorSnapshot({
        currentPrice: 100,
      }),
      strategy: makeSmartSplitStrategy({
        baseLocRatio: 50,
      }),
    });

    expect(result).toEqual({
      appliedLocRatioPct: 50,
      displayLocBuy: {
        price: 80,
        quantity: 6,
      },
      displayMocBuy: {
        quantity: 4,
      },
    });
  });

  it('평단가가 near-zero 로 손상되면 분모 계산으로 진입하지 않는다', () => {
    const result = calculateMultiSplitBuyGuide({
      buyTrancheBudget: 1000,
      feeRate: 0.25,
      avgPrice: Number.EPSILON / 2,
      snapshot: makeIndicatorSnapshot({
        currentPrice: 100,
      }),
      strategy: makeSmartSplitStrategy(),
    });

    expect(result).toEqual({
      appliedLocRatioPct: 50,
    });
  });
});

describe('calculateMultiSplitSellGuide', () => {
  it('메인 익절은 먼저 반올림하고 중간 익절은 잔량으로 계산한다', () => {
    expect(
      calculateMultiSplitSellGuide({
        currentQuantity: 5,
        avgPrice: 100,
        targetReturnRate: 10,
        intermediateReturnRate: 5,
        mainTakeProfitRatioPct: 50,
        riskCutRatioPct: 20,
      }),
    ).toEqual({
      mainTakeProfitQty: 3,
      intermediateTakeProfitQty: 2,
      riskCutQty: 1,
      displayMainTakeProfit: {
        price: 110,
        quantity: 3,
      },
      displayIntermediateTakeProfit: {
        price: 105,
        quantity: 2,
      },
    });
  });
});

describe('calculateMultiSplitGuideState', () => {
  it('보유 수량과 스냅샷을 합성해 Smart Split 가이드를 한 번에 계산한다', () => {
    const result = calculateMultiSplitGuideState({
      trades: [
        makeTrade({
          type: 'buy',
          stock: 'AAPL',
          price: 100,
          quantity: 10,
          fee: 0,
        }),
      ],
      strategy: makeSmartSplitStrategy({
        baseLocRatio: 50,
        rsiRule: {
          threshold: 40,
          locRatio: 70,
        },
      }),
      oneTimeAmount: 200,
      feeRate: 0.25,
      snapshot: makeIndicatorSnapshot({
        currentPrice: 110,
        rsi: 30,
      }),
    });

    expect(result).toEqual({
      cashUsagePct: 50,
      totalInvested: 1000,
      totalSeed: 2000,
      remainingBudget: 1000,
      currentQuantity: 10,
      avgPrice: 100,
      isFirstBuy: false,
      isSeedExhausted: false,
      appliedLocRatioPct: 70,
      displayLocBuy: {
        price: 100,
        quantity: 1,
      },
      displayMocBuy: {
        quantity: 0,
      },
      sellGuide: {
        mainTakeProfitQty: 6,
        intermediateTakeProfitQty: 4,
        riskCutQty: 2,
        displayMainTakeProfit: {
          price: 110,
          quantity: 6,
        },
        displayIntermediateTakeProfit: {
          price: 105,
          quantity: 4,
        },
      },
    });
  });

  it('남은 시드가 커도 LOC/MOC 수량은 1회 매수금 범위를 넘지 않는다', () => {
    const result = calculateMultiSplitGuideState({
      trades: [
        makeTrade({
          type: 'buy',
          stock: 'TQQQ',
          price: 55,
          quantity: 3,
          fee: 0,
        }),
      ],
      strategy: makeSmartSplitStrategy({
        targetStock: 'TQQQ',
        baseLocRatio: 50,
        totalSplitCount: 100,
      }),
      oneTimeAmount: 200,
      feeRate: 0.25,
      snapshot: makeIndicatorSnapshot({
        currentPrice: 55,
        rsi: 50,
      }),
    });

    expect(result.totalSeed).toBe(20_000);
    expect(result.remainingBudget).toBeGreaterThan(1000);

    const locQty = result.displayLocBuy?.quantity ?? 0;
    const mocQty = result.displayMocBuy?.quantity ?? 0;
    const locUnit = 55 * (1 + 0.25 / 100);
    const mocUnit = 55 * 1.15;
    expect(locQty * locUnit + mocQty * mocUnit).toBeLessThanOrEqual(200 + 1e-6);
  });
});
