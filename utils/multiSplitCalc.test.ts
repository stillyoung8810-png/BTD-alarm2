/**
 * multiSplitCalc.ts 순수 함수 유닛 테스트
 *
 * 엣지 케이스: 99주 분할, T=0, 중간 손익 음수, 쿼터 재진입, 빈 데이터
 */

import { describe, it, expect } from 'vitest';
import {
  calcHoldings,
  calcT,
  getPhase,
  checkRecentMOCSell,
  calcIntermediateProfit,
  calcNewOneTimeAmount,
  calcSellSplitQuantities,
  safeOrder,
  calcQuarterStopLossOrders,
  calcMultiSplitOrders,
  LOC_SELL_RATIO,
  QUARTER_SPLIT_COUNT,
  type TradeInput,
} from './multiSplitCalc';

// ---------------------------------------------------------------------------
// 테스트 헬퍼
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<TradeInput> & { type: 'buy' | 'sell'; stock: string }): TradeInput {
  return {
    date: '2026-01-15',
    price: 100,
    quantity: 10,
    fee: 0,
    isMOC: false,
    ...overrides,
  };
}

// ===========================================================================
// calcHoldings
// ===========================================================================

describe('calcHoldings', () => {
  it('빈 거래 목록 → 빈 배열', () => {
    expect(calcHoldings([])).toEqual([]);
  });

  it('매수 1건 → 보유 1건, realizedPnL 0', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 150, quantity: 10, fee: 2.5 }),
    ];
    const holdings = calcHoldings(trades);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].stock).toBe('AAPL');
    expect(holdings[0].quantity).toBe(10);
    expect(holdings[0].totalCost).toBe(150 * 10 + 2.5); // 1502.5
    expect(holdings[0].avgPrice).toBeCloseTo(150.25, 2);
    expect(holdings[0].realizedPnL).toBe(0);
  });

  it('매수 + 부분 매도 → 보유 수량 차감, 실현손익 누적', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 4, fee: 0 }),
    ];
    const holdings = calcHoldings(trades);
    expect(holdings[0].quantity).toBe(6);
    expect(holdings[0].avgPrice).toBeCloseTo(100, 2);
    expect(holdings[0].realizedPnL).toBe((110 - 100) * 4);
  });

  it('전량 매도 → quantity 0이어도 realizedPnL 있으면 1건 반환 (closed position)', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 5, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 5, fee: 0 }),
    ];
    const holdings = calcHoldings(trades);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].stock).toBe('AAPL');
    expect(holdings[0].quantity).toBe(0);
    expect(holdings[0].totalCost).toBe(0);
    expect(holdings[0].avgPrice).toBe(0);
    expect(holdings[0].realizedPnL).toBe((110 - 100) * 5);
  });

  it('매도 수량 > 보유 수량 → 예외 발생', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 3, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 110, quantity: 5, fee: 0 }),
    ];
    expect(() => calcHoldings(trades)).toThrow(/초과 매도 에러/);
  });

  it('본전 전량 매도(quantity=0, realizedPnL=0) → 1건 반환', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
    ];
    const holdings = calcHoldings(trades);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(0);
    expect(holdings[0].realizedPnL).toBe(0);
  });

  it('여러 종목 보유', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'buy', stock: 'TSLA', price: 200, quantity: 5, fee: 0 }),
    ];
    const holdings = calcHoldings(trades);
    expect(holdings).toHaveLength(2);
    expect(holdings.find((h) => h.stock === 'AAPL')?.quantity).toBe(10);
    expect(holdings.find((h) => h.stock === 'TSLA')?.quantity).toBe(5);
  });
});

// ===========================================================================
// calcT
// ===========================================================================

describe('calcT', () => {
  it('빈 거래 → T=0', () => {
    expect(calcT([], 100)).toBe(0);
  });

  it('dailyBuyAmount=0 → T=0', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
    ];
    expect(calcT(trades, 0)).toBe(0);
  });

  it('1000$ 매수, dailyBuyAmount=250 → T=4', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 0 }),
    ];
    // totalInvested = 1000, T = ceil(1000/250 * 100) / 100 = ceil(400) / 100 = 4
    expect(calcT(trades, 250)).toBe(4);
  });

  it('수수료 포함 시 T 올림', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', price: 100, quantity: 10, fee: 5 }),
    ];
    // totalInvested = 1005, T = ceil(1005/250 * 100) / 100 = ceil(402) / 100 = 4.02
    expect(calcT(trades, 250)).toBe(4.02);
  });
});

// ===========================================================================
// getPhase
// ===========================================================================

describe('getPhase', () => {
  // a = 40 기준
  const a = 40;

  it('T < 0.5 → null (초기 구간)', () => {
    expect(getPhase(0, a)).toBeNull();
    expect(getPhase(0.49, a)).toBeNull();
  });

  it('전반전: 0.5 <= T < a/2', () => {
    expect(getPhase(0.5, a)).toBe('first');
    expect(getPhase(10, a)).toBe('first');
    expect(getPhase(19.99, a)).toBe('first');
  });

  it('후반전: a/2 <= T < a-1', () => {
    expect(getPhase(20, a)).toBe('second');
    expect(getPhase(30, a)).toBe('second');
    expect(getPhase(38.99, a)).toBe('second');
  });

  it('쿼터: a-1 < T <= a', () => {
    expect(getPhase(39.01, a)).toBe('quarter');
    expect(getPhase(40, a)).toBe('quarter');
  });

  it('T > a → null (초과)', () => {
    expect(getPhase(40.01, a)).toBeNull();
    expect(getPhase(50, a)).toBeNull();
  });

  it('경계값 정확히: T = a-1 → second (미만이므로)', () => {
    // a-1 = 39, getPhase 조건: T < a-1 이므로 T=39는 false
    // T > a-1 이므로 quarter? No: T > 39 AND T <= 40 → T=39는 T>39 = false
    // 따라서 T=39는 second (T >= 20 && T < 39)
    expect(getPhase(39, a)).toBe('second');
  });
});

// ===========================================================================
// checkRecentMOCSell
// ===========================================================================

describe('checkRecentMOCSell', () => {
  it('빈 영업일 → hasMOC=false', () => {
    const result = checkRecentMOCSell([], []);
    expect(result.hasMOC).toBe(false);
  });

  it('MOC 기록 없음 → hasMOC=false', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', isMOC: false }),
    ];
    const result = checkRecentMOCSell(trades, ['2026-01-10', '2026-01-09']);
    expect(result.hasMOC).toBe(false);
  });

  it('MOC 기록 있음 → hasMOC=true + 최신 날짜', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-08', isMOC: true }),
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', isMOC: true }),
    ];
    const result = checkRecentMOCSell(trades, ['2026-01-10', '2026-01-09', '2026-01-08']);
    expect(result.hasMOC).toBe(true);
    expect(result.mocDate).toBe('2026-01-10');
  });

  it('기간 밖 MOC → hasMOC=false', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2025-12-01', isMOC: true }),
    ];
    const result = checkRecentMOCSell(trades, ['2026-01-10', '2026-01-09']);
    expect(result.hasMOC).toBe(false);
  });
});

// ===========================================================================
// calcSellSplitQuantities — 25% LOC / 잔량 지정가
// ===========================================================================

describe('calcSellSplitQuantities', () => {
  it('100주 → LOC 25, 지정가 75', () => {
    const { locSellQty, limitSellQty } = calcSellSplitQuantities(100);
    expect(locSellQty).toBe(25);
    expect(limitSellQty).toBe(75);
  });

  it('99주 → LOC 24, 지정가 75 (합계 99, 누락 없음)', () => {
    const { locSellQty, limitSellQty } = calcSellSplitQuantities(99);
    expect(locSellQty).toBe(24);
    expect(limitSellQty).toBe(75);
    // 핵심: 합계 = 원래 수량
    expect(locSellQty + limitSellQty).toBe(99);
  });

  it('1주 → LOC 0, 지정가 1', () => {
    const { locSellQty, limitSellQty } = calcSellSplitQuantities(1);
    expect(locSellQty).toBe(0);
    expect(limitSellQty).toBe(1);
  });

  it('0주 → 모두 0', () => {
    const { locSellQty, limitSellQty } = calcSellSplitQuantities(0);
    expect(locSellQty).toBe(0);
    expect(limitSellQty).toBe(0);
  });

  it('3주 → LOC 0, 지정가 3 (floor(0.75)=0)', () => {
    const { locSellQty, limitSellQty } = calcSellSplitQuantities(3);
    expect(locSellQty).toBe(0);
    expect(limitSellQty).toBe(3);
    expect(locSellQty + limitSellQty).toBe(3);
  });
});

// ===========================================================================
// safeOrder
// ===========================================================================

describe('safeOrder', () => {
  it('유효한 입력 → OrderEntry', () => {
    const order = safeOrder(150.123, 10.7);
    expect(order).not.toBeNull();
    expect(order!.price).toBe(150.12);
    expect(order!.quantity).toBe(10);
  });

  it('가격 <= 0 → null', () => {
    expect(safeOrder(0, 10)).toBeNull();
    expect(safeOrder(-5, 10)).toBeNull();
  });

  it('수량 floor 후 <= 0 → null', () => {
    expect(safeOrder(100, 0.5)).toBeNull();
    expect(safeOrder(100, 0)).toBeNull();
  });

  it('NaN → null', () => {
    expect(safeOrder(NaN, 10)).toBeNull();
    expect(safeOrder(100, NaN)).toBeNull();
  });

  it('수량이 정수 경계 바로 아래면 floor(+EPSILON)로 1주 누락을 막는다', () => {
    expect(safeOrder(100, 1.9999999999999998)).toEqual({
      price: 100,
      quantity: 2,
    });
  });
});

// ===========================================================================
// calcIntermediateProfit
// ===========================================================================

describe('calcIntermediateProfit', () => {
  it('매도 거래 없음 → 0', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 10, fee: 0 }),
    ];
    expect(calcIntermediateProfit(trades, '2026-01-01')).toBe(0);
  });

  it('이익 매도 → 양수', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', price: 120, quantity: 5, fee: 1 }),
    ];
    // 평단가 100, 매도가 120 → (120-100)*5 - 1 = 99
    expect(calcIntermediateProfit(trades, '2026-01-01')).toBe(99);
  });

  it('손실 매도 → 음수', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', price: 80, quantity: 5, fee: 1 }),
    ];
    // (80-100)*5 - 1 = -101
    expect(calcIntermediateProfit(trades, '2026-01-01')).toBe(-101);
  });
});

// ===========================================================================
// calcNewOneTimeAmount
// ===========================================================================

describe('calcNewOneTimeAmount', () => {
  it('dailyBuyAmount=0 → 0', () => {
    expect(calcNewOneTimeAmount([], 0, 40, '2026-01-01')).toBe(0);
  });

  it('새 공식: (잔금 + MOC 매도 금액) / 10, C_current = C_init - Σ(E_buy) + Σ(E_sell)', () => {
    // C_init = 250*40 = 10000, 매수 1000 → C_current = 10000 - 1000 = 9000, new = 9000/10 = 900
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 10, fee: 0 }),
    ];
    const result = calcNewOneTimeAmount(trades, 250, 40, '2026-01-01');
    expect(result).toBe(900);
  });

  it('매도 회수금 반영: C_current = C_init - E_buy + E_sell', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 10, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', price: 80, quantity: 5, fee: 0 }),
    ];
    // C_init=10000, E_buy=1000, E_sell=80*5-0=400 → C_current=9400, new=940
    const result = calcNewOneTimeAmount(trades, 250, 40, '2026-01-01');
    expect(result).toBe(940);
  });
});

// ===========================================================================
// calcQuarterStopLossOrders
// ===========================================================================

describe('calcQuarterStopLossOrders', () => {
  const baseParams = {
    trades: [] as TradeInput[],
    dailyBuyAmount: 250,
    multiSplit: { totalSplitCount: 40, targetReturnRate: 10, targetStock: 'AAPL' },
    feeRate: 0.25,
    recentTradingDays: ['2026-01-10', '2026-01-09', '2026-01-08'],
    avgPrice: 100,
    currentQuantity: 100,
  };

  it('MOC 기록 없음 → hasMOC=false + mocQuantity 표시', () => {
    const result = calcQuarterStopLossOrders(baseParams);
    expect(result).not.toBeNull();
    expect(result!.hasMOC).toBe(false);
    expect(result!.mocQuantity).toBe(25); // 100 * 0.25
  });

  it('avgPrice=0 + MOC 기록 있음 → null', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', isMOC: true }),
    ];
    const result = calcQuarterStopLossOrders({
      ...baseParams,
      trades,
      avgPrice: 0,
    });
    expect(result).toBeNull();
  });

  it('currentQuantity=0 + MOC 기록 있음 → null', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', isMOC: true }),
    ];
    const result = calcQuarterStopLossOrders({
      ...baseParams,
      trades,
      currentQuantity: 0,
    });
    expect(result).toBeNull();
  });

  it('MOC 기록 있음 → hasMOC=true + 주문 데이터', () => {
    const trades: TradeInput[] = [
      makeTrade({ type: 'buy', stock: 'AAPL', date: '2026-01-01', price: 100, quantity: 40, fee: 0 }),
      makeTrade({ type: 'sell', stock: 'AAPL', date: '2026-01-10', price: 90, quantity: 10, fee: 0, isMOC: true }),
    ];
    const result = calcQuarterStopLossOrders({
      ...baseParams,
      trades,
      avgPrice: 100,
      currentQuantity: 30,
    });
    expect(result).not.toBeNull();
    expect(result!.hasMOC).toBe(true);
    expect(result!.newOneTimeAmount).toBeGreaterThan(0);
  });
});

// ===========================================================================
// calcMultiSplitOrders
// ===========================================================================

describe('calcMultiSplitOrders', () => {
  const baseParams = {
    phase: 'first' as const,
    A: 10,
    a: 40,
    T: 5,
    basePrice: 100,
    currentQuantity: 50,
    oneTimeAmount: 250,
    feeRate: 0.25,
  };

  it('전반전: locBuy1 + locBuy2 + locSell + limitSell', () => {
    const result = calcMultiSplitOrders(baseParams);
    expect(result.phase).toBe('first');
    expect(result.locBuy1).toBeDefined();
    expect(result.locBuy2).toBeDefined();
    expect(result.locSell).toBeDefined();
    expect(result.limitSell).toBeDefined();
  });

  it('후반전: locBuy2만 (locBuy1 없음)', () => {
    const result = calcMultiSplitOrders({ ...baseParams, phase: 'second', T: 25 });
    expect(result.phase).toBe('second');
    expect(result.locBuy1).toBeUndefined();
    expect(result.locBuy2).toBeDefined();
  });

  it('유효하지 않은 입력 (A=0) → 빈 결과', () => {
    const result = calcMultiSplitOrders({ ...baseParams, A: 0 });
    expect(result.phase).toBe('first');
    expect(result.locBuy1).toBeUndefined();
    expect(result.locBuy2).toBeUndefined();
    expect(result.locSell).toBeUndefined();
    expect(result.limitSell).toBeUndefined();
  });

  it('유효하지 않은 입력 (basePrice=0) → 빈 결과', () => {
    const result = calcMultiSplitOrders({ ...baseParams, basePrice: 0 });
    expect(result.locBuy1).toBeUndefined();
  });

  it('currentQuantity=0 → 매도 수량 0으로 표시 (orderEntryForDisplay)', () => {
    const result = calcMultiSplitOrders({ ...baseParams, currentQuantity: 0 });
    expect(result.locSell).toBeDefined();
    expect(result.locSell!.quantity).toBe(0);
    expect(result.limitSell).toBeDefined();
    expect(result.limitSell!.quantity).toBe(0);
  });

  it('매도 수량 합계 = 보유 수량 (누락 없음)', () => {
    const result = calcMultiSplitOrders({ ...baseParams, currentQuantity: 99 });
    const locQty = result.locSell?.quantity ?? 0;
    const limitQty = result.limitSell?.quantity ?? 0;
    expect(locQty + limitQty).toBe(99);
  });
});
