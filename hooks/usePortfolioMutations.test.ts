import { describe, expect, it } from 'vitest';
import type { Portfolio, Trade, VrBandStrategyParams } from '../types';
import { createInitialVrSnapshot } from '../utils/vrBandStrategy';
import { buildTradeDraft } from './usePortfolioMutations';

const BASE_VR_NUMBERS = {
  initialV: 500,
  initialCapital: 1_000,
  bandRateUpper: 0.05,
  bandRateLower: 0.05,
  feeRate: 0.0025,
  G: 4,
  minOrderQty: 1,
  poolUsageRateBuy: 0.5,
  cycleWeeks: 1,
} as const;

function createVrParams(
  mode: VrBandStrategyParams['vrMode'],
  deltaCash: number,
): VrBandStrategyParams {
  switch (mode) {
    case 'accumulate':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'accumulate',
        deltaCash,
      };
    case 'withdraw':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'withdraw',
        deltaCash,
      };
    case 'lump_sum':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'lump_sum',
        deltaCash: 0,
      };
    default: {
      const exhaustiveCheck: never = mode;
      return exhaustiveCheck;
    }
  }
}

function createPortfolio(
  vrParams: VrBandStrategyParams,
  overrides: Partial<Portfolio> = {},
): Portfolio {
  return {
    id: overrides.id ?? 'portfolio-1',
    name: overrides.name ?? 'VR test portfolio',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 100,
    startDate: overrides.startDate ?? '2026-04-13',
    // 루트 feeRate는 UI 퍼센트 저장 계약(0.25%)을 모사한다.
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'TQQQ',
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 5,
        maBPeriod: 20,
      },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'TQQQ', splitCount: 1 },
      ma3: { stock: 'TQQQ' },
      vrBand: vrParams,
    },
    trades: overrides.trades ?? [],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig,
    isQuarterMode: overrides.isQuarterMode,
    vrSnapshot: overrides.vrSnapshot ?? createInitialVrSnapshot(vrParams),
  };
}

function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: overrides.id ?? 'trade-1',
    type: overrides.type ?? 'buy',
    stock: overrides.stock ?? 'TQQQ',
    date: overrides.date ?? '2026-04-20',
    price: overrides.price ?? 50,
    quantity: overrides.quantity ?? 1,
    fee: overrides.fee ?? 0,
    metadata: overrides.metadata,
    isMOC: overrides.isMOC,
  };
}

describe('buildTradeDraft for VR portfolios', () => {
  it('루트 feeRate가 0.25(퍼센트)여도 strategy.vrBand.feeRate 0.0025만 사용해 Pool을 차감한다', () => {
    // Why: 실제 장애는 루트 퍼센트 수수료를 VR 소수 수수료로 오해해 Pool을 25% 과차감한 데서 시작됐습니다.
    const vrParams = createVrParams('lump_sum', 0);
    const portfolio = createPortfolio(vrParams, {
      vrSnapshot: {
        ...createInitialVrSnapshot(vrParams),
        buyOrders: [],
        sellOrders: [],
      },
    });
    const trade = createTrade({
      type: 'buy',
      price: 50,
      quantity: 1,
    });

    const prepared = buildTradeDraft(portfolio, trade);
    const expectedPoolAfter = 949.875;
    const incorrectPoolAfterIfPercentWasUsed = 937.5;

    expect(
      prepared.nextPortfolio.trades[0].metadata?.pool_after,
    ).toBeCloseTo(expectedPoolAfter, 10);
    expect(prepared.nextPortfolio.vrSnapshot?.pool).toBeCloseTo(
      expectedPoolAfter,
      10,
    );
    expect(prepared.nextPortfolio.vrSnapshot?.pool).not.toBeCloseTo(
      incorrectPoolAfterIfPercentWasUsed,
      10,
    );
  });

  it('추가 매수는 Pool·shares·avgPrice만 바꾸고 currentV·밴드·주문표는 동결한다', () => {
    // Why: 사이클 중 추가 체결은 잔고만 바뀌어야 하며, V/밴드/표 재계산은 사이클 전환 시점에만 일어나야 합니다.
    const vrParams = createVrParams('lump_sum', 0);
    const portfolio = createPortfolio(vrParams, {
      vrSnapshot: {
        currentV: 500,
        pool: 600,
        shares: 2,
        avgPrice: 400,
        bandLow: 475,
        bandHigh: 525,
        buyOrders: [
          {
            step: 1,
            price: 200,
            qty: 1,
            isBuffer: false,
            sharesAfter: 3,
            poolAfter: 399.5,
          },
        ],
        sellOrders: [
          {
            step: 1,
            price: 262.5,
            qty: 1,
            isBuffer: false,
            sharesAfter: 1,
            poolAfter: 861.84,
          },
        ],
        cycleIndex: 0,
      },
    });
    const prevSnapshot = portfolio.vrSnapshot;
    const trade = createTrade({
      id: 'trade-2',
      type: 'buy',
      price: 100,
      quantity: 1,
    });

    const prepared = buildTradeDraft(portfolio, trade);
    const nextSnapshot = prepared.nextPortfolio.vrSnapshot;

    expect(nextSnapshot).toBeDefined();
    expect(nextSnapshot?.currentV).toBe(prevSnapshot?.currentV);
    expect(nextSnapshot?.bandLow).toBe(prevSnapshot?.bandLow);
    expect(nextSnapshot?.bandHigh).toBe(prevSnapshot?.bandHigh);
    expect(nextSnapshot?.buyOrders).toBe(prevSnapshot?.buyOrders);
    expect(nextSnapshot?.sellOrders).toBe(prevSnapshot?.sellOrders);
    expect(nextSnapshot?.pool).toBeCloseTo(499.75, 10);
    expect(nextSnapshot?.shares).toBe(3);
    expect(nextSnapshot?.avgPrice).toBe(300);
  });

  it('일부 매도도 currentV·밴드·주문표를 그대로 유지한 채 Pool만 증가시킨다', () => {
    // Why: 매도 후에도 사이클 스냅샷이 재계산되면 일별 실행 카드와 주문표가 장중에 흔들립니다.
    const vrParams = createVrParams('lump_sum', 0);
    const portfolio = createPortfolio(vrParams, {
      vrSnapshot: {
        currentV: 500,
        pool: 100,
        shares: 2,
        avgPrice: 400,
        bandLow: 475,
        bandHigh: 525,
        buyOrders: [
          {
            step: 1,
            price: 237.5,
            qty: 1,
            isBuffer: false,
            sharesAfter: 3,
            poolAfter: -137.09,
          },
        ],
        sellOrders: [
          {
            step: 1,
            price: 262.5,
            qty: 1,
            isBuffer: false,
            sharesAfter: 1,
            poolAfter: 361.84,
          },
        ],
        cycleIndex: 0,
      },
    });
    const prevSnapshot = portfolio.vrSnapshot;
    const trade = createTrade({
      id: 'trade-3',
      type: 'sell',
      price: 300,
      quantity: 1,
    });

    const prepared = buildTradeDraft(portfolio, trade);
    const nextSnapshot = prepared.nextPortfolio.vrSnapshot;

    expect(nextSnapshot).toBeDefined();
    expect(nextSnapshot?.currentV).toBe(prevSnapshot?.currentV);
    expect(nextSnapshot?.bandLow).toBe(prevSnapshot?.bandLow);
    expect(nextSnapshot?.bandHigh).toBe(prevSnapshot?.bandHigh);
    expect(nextSnapshot?.buyOrders).toBe(prevSnapshot?.buyOrders);
    expect(nextSnapshot?.sellOrders).toBe(prevSnapshot?.sellOrders);
    expect(nextSnapshot?.pool).toBeCloseTo(399.25, 10);
    expect(nextSnapshot?.shares).toBe(1);
    expect(nextSnapshot?.avgPrice).toBe(400);
  });
});
