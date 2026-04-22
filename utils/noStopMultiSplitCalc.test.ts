import { describe, expect, it } from 'vitest';
import {
  EMPTY_PRICE_HISTORY_ERROR,
  buildSummaryIndicatorSnapshot,
  calcNoStopCurrentRound,
  calcNoStopMultiSplitOrders,
  calculateMocQuantity,
  calculateNoStopExecution,
  collectIndicatorRequirements,
  resolveAppliedLocRatio,
  type NoStopIndicatorMathPort,
  type NoStopMultiSplitParams,
  type NoStopMultiSplitStrategy,
} from './noStopMultiSplitCalc';
import type { TradeInput } from './multiSplitCalc';

function makeTrade(overrides: Partial<TradeInput> & { type: 'buy' | 'sell'; stock: string }): TradeInput {
  return {
    date: '2026-03-13',
    price: 100,
    quantity: 1,
    fee: 0,
    ...overrides,
  };
}

const strategy: NoStopMultiSplitParams = {
  targetStock: 'TQQQ',
  lowLocBudgetRatio: 50,
  highLocPremiumPct: 15,
  takeProfitPct: 10,
  totalSplitCount: 40,
};

const canonicalStrategy: NoStopMultiSplitStrategy = {
  targetStock: 'TQQQ',
  baseLocRatio: 50,
  takeProfitPct: 10,
  totalSplitCount: 40,
  rsiRule: {
    threshold: 40,
    locRatio: 70,
  },
  alignmentRule: {
    shortPeriod: 20,
    longPeriod: 60,
    locRatio: 30,
  },
};

describe('calcNoStopCurrentRound', () => {
  it('보유 원가 / 1회 매수 금액으로 현재 회차를 계산한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 3, fee: 0 }),
    ];

    expect(calcNoStopCurrentRound(trades, 150)).toBe(2);
  });

  it('targetStock을 넘기면 해당 종목 원가만으로 회차를 계산한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 1, fee: 0 }),
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 9, fee: 0 }),
    ];

    expect(calcNoStopCurrentRound(trades, 100)).toBe(10);
    expect(calcNoStopCurrentRound(trades, 100, 'TQQQ')).toBe(1);
  });

  it('전량 매도 후에는 현재 회차가 0으로 돌아간다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 3, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'TQQQ', price: 110, quantity: 3, fee: 0 }),
    ];

    expect(calcNoStopCurrentRound(trades, 150)).toBe(0);
  });
});

describe('calcNoStopMultiSplitOrders', () => {
  it('첫 매수 전에는 first buy 상태만 반환한다', () => {
    const result = calcNoStopMultiSplitOrders({
      trades: [],
      oneTimeAmount: 1000,
      feeRate: 0.25,
      currentPrice: 40,
      strategy,
    });

    expect(result.isFirstBuy).toBe(true);
    expect(result.lowLoc).toBeUndefined();
    expect(result.highLoc).toBeUndefined();
    expect(result.takeProfit).toBeUndefined();
  });

  it('저가 LOC는 평단가 그대로, 남은 예산으로 고가 LOC를 계산한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 10, fee: 0 }),
    ];

    const result = calcNoStopMultiSplitOrders({
      trades,
      oneTimeAmount: 1000,
      feeRate: 0.25,
      currentPrice: 80,
      strategy,
    });

    expect(result.isFirstBuy).toBe(false);
    expect(result.lowLoc).toEqual({ price: 100, quantity: 4 });
    expect(result.highLoc).toEqual({ price: 92, quantity: 6 });
    expect(result.takeProfit).toEqual({ price: 110, quantity: 10 });
  });

  it('총 분할 횟수에 도달하면 추가 매수 없이 익절 주문만 유지한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 20, fee: 0 }),
    ];

    const result = calcNoStopMultiSplitOrders({
      trades,
      oneTimeAmount: 50,
      feeRate: 0.25,
      currentPrice: 80,
      strategy: { ...strategy, totalSplitCount: 40 },
    });

    expect(result.isSplitComplete).toBe(true);
    expect(result.lowLoc).toBeUndefined();
    expect(result.highLoc).toBeUndefined();
    expect(result.takeProfit).toEqual({ price: 110, quantity: 20 });
  });
});

describe('collectIndicatorRequirements', () => {
  it('전략이 실제로 켠 지표만 수집한다', () => {
    expect(collectIndicatorRequirements(canonicalStrategy)).toEqual({
      needsRsi: true,
      maPeriods: [20, 60],
    });

    expect(
      collectIndicatorRequirements({
        ...canonicalStrategy,
        rsiRule: undefined,
        alignmentRule: undefined,
      }),
    ).toEqual({
      needsRsi: false,
      maPeriods: [],
    });
  });
});

describe('buildSummaryIndicatorSnapshot', () => {
  const sharedMath: NoStopIndicatorMathPort = {
    calculateMA: (_prices, period) => {
      if (period === 20) {
        return 120;
      }
      if (period === 60) {
        return 110;
      }
      return 100;
    },
    calculateRSI: () => 35,
  };

  it('빈 가격 배열이면 즉시 예외를 던진다', () => {
    expect(() =>
      buildSummaryIndicatorSnapshot({
        prices: [],
        requirements: {
          needsRsi: false,
          maPeriods: [],
        },
        sharedMath,
      }),
    ).toThrow(EMPTY_PRICE_HISTORY_ERROR);
  });

  it('필요한 지표만 포함한 snapshot을 만든다', () => {
    expect(
      buildSummaryIndicatorSnapshot({
        prices: [90, 95, 100],
        requirements: collectIndicatorRequirements(canonicalStrategy),
        sharedMath,
      }),
    ).toEqual({
      currentPrice: 100,
      rsi: 35,
      maByPeriod: {
        20: 120,
        60: 110,
      },
    });
  });
});

describe('resolveAppliedLocRatio', () => {
  it('필수 지표가 없으면 baseLocRatio로 안전하게 fallback한다', () => {
    expect(
      resolveAppliedLocRatio(canonicalStrategy, {
        currentPrice: 100,
      }),
    ).toBe(50);
  });

  it('RSI와 정배열이 동시에 충족되면 더 보수적인 LOC ratio를 선택한다', () => {
    expect(
      resolveAppliedLocRatio(canonicalStrategy, {
        currentPrice: 100,
        rsi: 25,
        maByPeriod: {
          20: 120,
          60: 100,
        },
      }),
    ).toBe(70);
  });
});

describe('calculateMocQuantity', () => {
  it('MOC 수량은 15% 안전 버퍼를 적용해서 계산한다', () => {
    expect(
      calculateMocQuantity({
        mocBudget: 230,
        currentPrice: 100,
      }),
    ).toBe(2);
  });
});

describe('calculateNoStopExecution', () => {
  it('targetHolding만 사용해 진행률과 주문 수량을 계산한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 1, fee: 0 }),
      makeTrade({ type: 'buy', stock: 'AAPL', price: 900, quantity: 1, fee: 0 }),
    ];

    expect(
      calculateNoStopExecution({
        trades,
        oneTimeAmount: 1000,
        feeRate: 0,
        snapshot: {
          currentPrice: 100,
        },
        strategy: {
          targetStock: 'TQQQ',
          baseLocRatio: 50,
          takeProfitPct: 10,
          totalSplitCount: 2,
        },
      }),
    ).toEqual({
      appliedLocRatio: 50,
      progressPct: 5,
      isFirstBuy: false,
      isSplitComplete: false,
      displayLowLoc: { price: 100, quantity: 5 },
      displayMocBuy: { quantity: 4 },
      executableLowLoc: { price: 100, quantity: 5 },
      executableMocBuy: { quantity: 4 },
      takeProfit: { price: 110, quantity: 1 },
    });
  });
});
