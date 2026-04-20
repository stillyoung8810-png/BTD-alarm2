import { describe, expect, it } from 'vitest';
import type {
  OrderLevel,
  PortfolioRow,
  Trade,
  VrBandStrategyParams,
  VrSnapshot,
} from '../types';
import { getVrDeltaCashForNextV } from '../types';
import { TIME_MS, VR_CYCLE } from '../constants/vrConstants';
import { normalizePortfolioData } from './portfolioNormalize';
import {
  calculateCycleIndexFromDates,
  calculatePoolDelta,
  computeVrSnapshotAfterTrade,
  createInitialVrSnapshot,
  generateBuyOrders,
  generateSellOrders,
  getSanitizedDeltaCash,
  sanitizeVrCycleWeeks,
  toFixedMoney,
} from './vrBandStrategy';

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

function createLegacyRow(rawFeeRate: number): PortfolioRow {
  return {
    id: 'portfolio-1',
    name: 'VR legacy fee heal',
    daily_buy_amount: 100,
    start_date: '2026-04-13',
    fee_rate: rawFeeRate,
    is_closed: false,
    trades: [],
    strategy: {
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
      vrBand: createVrParams('lump_sum', 0),
    },
  };
}

describe('vrBandStrategy B1 guards', () => {
  describe('calculateCycleIndexFromDates', () => {
    it('음수 UTC ms는 제품 계약상 0으로 차단한다', () => {
      // Why: 잘못된 날짜 입력이 사이클 인덱스를 오염시키면 스케줄러가 잘못된 회차로 점프할 수 있습니다.
      expect(calculateCycleIndexFromDates(-1, TIME_MS.PER_DAY, 2)).toBe(0);
      expect(calculateCycleIndexFromDates(0, -1, 2)).toBe(0);
    });

    it('사이클 몫을 floor(+EPSILON)로 계산한다', () => {
      // Why: 사이클 경계에서 1.999999999 같은 드리프트가 나면 회차가 하루 늦게 바뀌는 금융 결함이 생깁니다.
      const cycleLengthMs = 2 * TIME_MS.PER_WEEK;
      const targetDateMs =
        cycleLengthMs * 2 - TIME_MS.PER_DAY + Number.EPSILON;

      expect(calculateCycleIndexFromDates(0, targetDateMs, 2)).toBe(2);
    });
  });

  describe('sanitizeVrCycleWeeks', () => {
    it('문자열 입력은 trim 후 파싱한다', () => {
      // Why: 폼 입력은 문자열로 들어오므로 공백 포함 숫자를 안정적으로 주 단위로 복구해야 합니다.
      expect(sanitizeVrCycleWeeks(' 4 ')).toBe(4);
    });

    it('빈 문자열과 비문자 입력은 기본 주기로 되돌린다', () => {
      // Why: 비정상 cycleWeeks가 스케줄러 분모 0 또는 NaN으로 번지지 않도록 기본값으로 회복해야 합니다.
      expect(sanitizeVrCycleWeeks('   ')).toBe(VR_CYCLE.DEFAULT_WEEKS);
      expect(sanitizeVrCycleWeeks([])).toBe(VR_CYCLE.DEFAULT_WEEKS);
    });
  });
});

describe('vrBandStrategy financial integrity', () => {
  it('calculatePoolDelta는 소수 수수료율 0.0025를 기준으로 돈 값을 안정적으로 계산한다', () => {
    // Why: 0.25% 수수료를 25% 또는 0.25(25bp가 아닌 25%)로 오해하면 Pool이 대형 오차로 훼손됩니다.
    const delta = calculatePoolDelta('buy', 50, 1, 0.0025);

    expect(delta).toBeCloseTo(-50.125, 10);
    expect(toFixedMoney(Math.abs(delta))).toBe(50.13);
  });

  it('normalizePortfolioData는 레거시 루트 fee_rate 소수 저장 버그를 퍼센트 값으로 복구한다', () => {
    // Why: 과거 DB 버그를 힐링하지 않으면 VR이 아닌 퍼센트 소비자들이 0.0025%로 잘못 해석합니다.
    const normalized = normalizePortfolioData([createLegacyRow(0.0025)]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].feeRate).toBe(0.25);
    expect(normalized[0].strategy.vrBand?.feeRate).toBe(0.0025);
  });

  it('shares가 0이어도 generateBuyOrders는 minOrderQty를 분모 대체값으로 사용해 NaN/Infinity 없이 동작한다', () => {
    // Why: 첫 진입 시 0주 나눗셈이 터지면 예약 주문 생성이 중단되거나 Infinity 루프가 발생할 수 있습니다.
    const orders = generateBuyOrders({
      shares: 0,
      pool: 1_000,
      bandLow: 500,
      minOrderQty: 2,
      feeRate: 0.0025,
      poolUsageRateBuy: 1,
    });

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].price).toBe(250);
    expect(orders[0].sharesAfter).toBe(2);
    expect(
      orders.every(
        (order) =>
          Number.isFinite(order.price) &&
          Number.isFinite(order.poolAfter) &&
          order.price > 0,
      ),
    ).toBe(true);
  });

  it('예산이 사실상 무한대여도 generateBuyOrders는 MAX_ORDER_STEPS 20에서 정확히 멈춘다', () => {
    // Why: 예산이 매우 크고 단계 비용이 계속 양수면 상한 없이 주문을 찍다 OOM으로 죽을 수 있습니다.
    const orders = generateBuyOrders({
      shares: 1,
      pool: 1_000_000_000,
      bandLow: 1_000_000,
      minOrderQty: 1,
      feeRate: 0.0025,
      poolUsageRateBuy: 1,
    });

    expect(orders).toHaveLength(20);
    expect(orders[19].step).toBe(20);
  });

  it('첫 매수는 buyOrders와 sellOrders를 새 상태 기준으로 재생성한다', () => {
    // Why: 첫 진입 직후 주문표가 재생성되지 않으면 0주 기준 표를 계속 보게 되어 실제 체결 전략이 틀어집니다.
    const params = createVrParams('lump_sum', 0);
    const prevSnapshot = createInitialVrSnapshot(params);
    const firstBuy = createTrade({
      type: 'buy',
      price: 400,
      quantity: 1,
    });
    const newPool =
      prevSnapshot.pool +
      calculatePoolDelta('buy', firstBuy.price, firstBuy.quantity, params.feeRate);

    const nextSnapshot = computeVrSnapshotAfterTrade(
      prevSnapshot,
      firstBuy,
      newPool,
      params,
    );
    const expectedBuyOrders = generateBuyOrders({
      shares: nextSnapshot.shares,
      pool: newPool,
      bandLow: prevSnapshot.bandLow,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
      poolUsageRateBuy: params.poolUsageRateBuy,
    });
    const expectedSellOrders = generateSellOrders({
      shares: nextSnapshot.shares,
      pool: newPool,
      bandHigh: prevSnapshot.bandHigh,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
    });

    expect(nextSnapshot.buyOrders).not.toBe(prevSnapshot.buyOrders);
    expect(nextSnapshot.sellOrders).not.toBe(prevSnapshot.sellOrders);
    expect(nextSnapshot.buyOrders).toEqual(expectedBuyOrders);
    expect(nextSnapshot.sellOrders).toEqual(expectedSellOrders);
  });

  it('보유 중 추가 매수는 currentV·밴드·주문표를 참조까지 그대로 동결한다', () => {
    // Why: 사이클 중 체결로 V/밴드/표가 흔들리면 전략 핵심 규칙인 cycle freeze가 깨집니다.
    const params = createVrParams('lump_sum', 0);
    const prevSnapshot = createInitialVrSnapshot(params);
    const frozenBuyOrders: OrderLevel[] = [
      {
        step: 1,
        price: 475,
        qty: 1,
        isBuffer: false,
        sharesAfter: 2,
        poolAfter: 523.81,
      },
    ];
    const frozenSellOrders: OrderLevel[] = [
      {
        step: 1,
        price: 525,
        qty: 1,
        isBuffer: false,
        sharesAfter: 0,
        poolAfter: 1_023.69,
      },
    ];
    const seededSnapshot: VrSnapshot = {
      ...prevSnapshot,
      shares: 1,
      avgPrice: 500,
      pool: 499.75,
      buyOrders: frozenBuyOrders,
      sellOrders: frozenSellOrders,
    };
    const nextPool =
      seededSnapshot.pool +
      calculatePoolDelta('buy', 250, 1, params.feeRate);

    const nextSnapshot = computeVrSnapshotAfterTrade(
      seededSnapshot,
      createTrade({ type: 'buy', price: 250, quantity: 1 }),
      nextPool,
      params,
    );

    expect(nextSnapshot.currentV).toBe(seededSnapshot.currentV);
    expect(nextSnapshot.bandLow).toBe(seededSnapshot.bandLow);
    expect(nextSnapshot.bandHigh).toBe(seededSnapshot.bandHigh);
    expect(nextSnapshot.buyOrders).toBe(frozenBuyOrders);
    expect(nextSnapshot.sellOrders).toBe(frozenSellOrders);
    expect(nextSnapshot.buyOrders).toEqual(seededSnapshot.buyOrders);
    expect(nextSnapshot.sellOrders).toEqual(seededSnapshot.sellOrders);
  });

  it('보유 중 일부 매도도 currentV·밴드·주문표를 참조까지 그대로 동결한다', () => {
    // Why: 일부 매도 때 표가 다시 계산되면 사이클 경계 전 스냅샷과 카드 문구가 서로 어긋납니다.
    const params = createVrParams('lump_sum', 0);
    const prevSnapshot = createInitialVrSnapshot(params);
    const frozenBuyOrders: OrderLevel[] = [
      {
        step: 1,
        price: 475,
        qty: 1,
        isBuffer: false,
        sharesAfter: 3,
        poolAfter: 100,
      },
    ];
    const frozenSellOrders: OrderLevel[] = [
      {
        step: 1,
        price: 525,
        qty: 1,
        isBuffer: false,
        sharesAfter: 1,
        poolAfter: 1_024,
      },
    ];
    const seededSnapshot: VrSnapshot = {
      ...prevSnapshot,
      shares: 2,
      avgPrice: 400,
      pool: 200,
      buyOrders: frozenBuyOrders,
      sellOrders: frozenSellOrders,
    };
    const nextPool =
      seededSnapshot.pool +
      calculatePoolDelta('sell', 600, 1, params.feeRate);

    const nextSnapshot = computeVrSnapshotAfterTrade(
      seededSnapshot,
      createTrade({ type: 'sell', price: 600, quantity: 1 }),
      nextPool,
      params,
    );

    expect(nextSnapshot.currentV).toBe(seededSnapshot.currentV);
    expect(nextSnapshot.bandLow).toBe(seededSnapshot.bandLow);
    expect(nextSnapshot.bandHigh).toBe(seededSnapshot.bandHigh);
    expect(nextSnapshot.buyOrders).toBe(frozenBuyOrders);
    expect(nextSnapshot.sellOrders).toBe(frozenSellOrders);
    expect(nextSnapshot.buyOrders).toEqual(seededSnapshot.buyOrders);
    expect(nextSnapshot.sellOrders).toEqual(seededSnapshot.sellOrders);
  });

  it('accumulate 모드는 음수 입력이어도 deltaCash를 양수로 강제한다', () => {
    // Why: 적립식은 음수 입력이 들어와도 V 증액으로만 해석되어야 투자 흐름이 역전되지 않습니다.
    const params = createVrParams('accumulate', -50);

    expect(getSanitizedDeltaCash('accumulate', -50)).toBe(50);
    expect(getVrDeltaCashForNextV(params)).toBe(50);
  });

  it('withdraw 모드는 양수 입력이어도 deltaCash를 음수로 강제한다', () => {
    // Why: 인출식은 사용자가 양수 금액을 입력해도 실제 V 계산에는 반드시 현금 유출 부호로 반영되어야 합니다.
    const params = createVrParams('withdraw', 50);

    expect(getSanitizedDeltaCash('withdraw', 50)).toBe(-50);
    expect(getVrDeltaCashForNextV(params)).toBe(-50);
  });

  it('lump_sum 모드는 어떤 입력이 와도 deltaCash를 0으로 고정한다', () => {
    // Why: 거치식은 추가 입출금 개념이 없으므로 임의 입력이 섞여도 V 계산을 오염시키면 안 됩니다.
    const params = createVrParams('lump_sum', 0);

    expect(getSanitizedDeltaCash('lump_sum', 999)).toBe(0);
    expect(getVrDeltaCashForNextV(params)).toBe(0);
  });
});
