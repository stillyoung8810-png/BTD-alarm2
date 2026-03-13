import { describe, expect, it } from 'vitest';
import {
  calcNoStopCurrentRound,
  calcNoStopMultiSplitOrders,
  type NoStopMultiSplitParams,
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

describe('calcNoStopCurrentRound', () => {
  it('보유 원가 / 1회 매수 금액으로 현재 회차를 계산한다', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'TQQQ', price: 100, quantity: 3, fee: 0 }),
    ];

    expect(calcNoStopCurrentRound(trades, 150)).toBe(2);
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
