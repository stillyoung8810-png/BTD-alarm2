import { describe, expect, it } from 'vitest';
import type {
  OrderLevel,
  Portfolio,
  PortfolioRow,
  Strategy,
  VrBandStrategyParams,
  VrSnapshot,
} from '../supabase/functions/_shared/types.ts';
import {
  buildRefreshedVrSnapshot,
  calculateNextCycleIndexForPortfolio,
  getLogicalNewYorkDate,
  processVrRefreshBatch,
  refreshPortfolioSnapshotIfDue,
} from '../supabase/functions/_shared/vrSnapshotRefresh.ts';
import {
  createInitialVrSnapshot,
  generateBuyOrders,
  generateSellOrders,
} from '../supabase/functions/_shared/vrBandStrategy.ts';
import { TIME_MS } from '../constants/vrConstants';

const BASE_VR_NUMBERS = {
  initialV: 500,
  initialCapital: 1_000,
  bandRateUpper: 0.05,
  bandRateLower: 0.05,
  feeRate: 0.0025,
  G: 4,
  baseGrowthRatePct: 10,
  smartBrakeThresholdPct: 25,
  minOrderQty: 1,
  poolUsageRateBuy: 0.5,
  cycleWeeks: 1,
} as const;

function createVrParams(
  mode: VrBandStrategyParams['vrMode'],
  deltaCash: number,
  overrides: Partial<VrBandStrategyParams> = {},
): VrBandStrategyParams {
  const base = {
    ...BASE_VR_NUMBERS,
    ...overrides,
  };

  switch (mode) {
    case 'accumulate':
      return {
        ...base,
        vrMode: 'accumulate',
        deltaCash,
      };
    case 'withdraw':
      return {
        ...base,
        vrMode: 'withdraw',
        deltaCash,
      };
    case 'lump_sum':
      return {
        ...base,
        vrMode: 'lump_sum',
        deltaCash: 0,
      };
    default: {
      const exhaustiveCheck: never = mode;
      return exhaustiveCheck;
    }
  }
}

function createBaseStrategy(vrBand: VrBandStrategyParams): Strategy {
  return {
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
    vrBand,
  };
}

function createOrdersSnapshot(
  params: VrBandStrategyParams,
  overrides: Partial<VrSnapshot> = {},
): VrSnapshot {
  const currentV = overrides.currentV ?? 500;
  const pool = overrides.pool ?? 600;
  const shares = overrides.shares ?? 2;
  const bandLow = overrides.bandLow ?? 475;
  const bandHigh = overrides.bandHigh ?? 525;

  const buyOrders =
    overrides.buyOrders ??
    generateBuyOrders({
      shares,
      pool,
      bandLow,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
      poolUsageRateBuy: params.poolUsageRateBuy,
    });
  const sellOrders =
    overrides.sellOrders ??
    generateSellOrders({
      shares,
      pool,
      bandHigh,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
    });

  return {
    currentV,
    pool,
    shares,
    avgPrice: overrides.avgPrice ?? 400,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex: overrides.cycleIndex ?? 0,
  };
}

function createPortfolio(
  params: VrBandStrategyParams,
  overrides: Partial<Portfolio> = {},
): Portfolio {
  return {
    id: overrides.id ?? 'portfolio-1',
    name: overrides.name ?? 'VR scheduler test',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 100,
    startDate: overrides.startDate ?? '2026-04-13',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? createBaseStrategy(params),
    trades: overrides.trades ?? [],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig,
    vrSnapshot: overrides.vrSnapshot ?? createInitialVrSnapshot(params),
  };
}

function clonePortfolioWithSnapshot(
  portfolio: Portfolio,
  snapshot: VrSnapshot,
): Portfolio {
  return {
    ...portfolio,
    vrSnapshot: snapshot,
  };
}

function createPortfolioRow(
  params: VrBandStrategyParams,
  overrides: Partial<PortfolioRow> = {},
): PortfolioRow {
  const portfolio = createPortfolio(params, {
    id: overrides.id == null ? 'portfolio-row-1' : String(overrides.id),
    startDate:
      overrides.start_date == null
        ? '2026-04-13'
        : String(overrides.start_date),
    vrSnapshot:
      overrides.vr_snapshot != null &&
      typeof overrides.vr_snapshot === 'object'
        ? (overrides.vr_snapshot as VrSnapshot)
        : createOrdersSnapshot(params, { cycleIndex: 0 }),
  });

  return {
    id: portfolio.id,
    name: portfolio.name,
    daily_buy_amount: portfolio.dailyBuyAmount,
    start_date: portfolio.startDate,
    fee_rate: portfolio.feeRate,
    strategy: portfolio.strategy,
    trades: portfolio.trades,
    is_closed: portfolio.isClosed,
    vr_snapshot: portfolio.vrSnapshot,
    ...overrides,
  };
}

describe('VR snapshot refresh scheduler core', () => {
  it('주기가 아직 끝나지 않았으면 조기 종료되어 cycleIndex가 증가하지 않는다', () => {
    // Why: 아직 사이클이 끝나지 않았는데 배치가 앞당겨 실행되면 V·밴드·주문표가 하루 이상 조기 갱신되는 금융 사고가 납니다.
    const params = createVrParams('lump_sum', 0, { cycleWeeks: 2 });
    const portfolio = createPortfolio(params, {
      startDate: '2026-04-13',
      vrSnapshot: createOrdersSnapshot(params, { cycleIndex: 0 }),
    });

    const targetCycleIndex = calculateNextCycleIndexForPortfolio(
      portfolio,
      new Date('2026-04-19T16:00:00Z'),
    );
    const refreshed = refreshPortfolioSnapshotIfDue(
      portfolio,
      new Date('2026-04-19T16:00:00Z'),
    );

    expect(targetCycleIndex).toBeNull();
    expect(refreshed).toBeNull();
  });

  it('같은 날짜에 중복 실행되어도 cycleIndex는 한 번만 오르고 두 번째 실행은 무시된다', () => {
    // Why: 크론 중복 호출 시 회차가 2번 오르면 V와 주문표가 같은 날 두 번 재계산되는 치명적 멱등성 결함이 생깁니다.
    const params = createVrParams('lump_sum', 0, { cycleWeeks: 1 });
    const portfolio = createPortfolio(params, {
      startDate: '2026-04-13',
      vrSnapshot: createOrdersSnapshot(params, { cycleIndex: 0 }),
    });
    const now = new Date('2026-04-20T16:00:00Z');

    const firstTargetCycleIndex = calculateNextCycleIndexForPortfolio(portfolio, now);
    const firstRefreshedSnapshot = refreshPortfolioSnapshotIfDue(portfolio, now);

    expect(firstTargetCycleIndex).toBe(1);
    expect(firstRefreshedSnapshot).not.toBeNull();
    expect(firstRefreshedSnapshot?.cycleIndex).toBe(1);

    const updatedPortfolio = clonePortfolioWithSnapshot(
      portfolio,
      firstRefreshedSnapshot as VrSnapshot,
    );

    const secondTargetCycleIndex = calculateNextCycleIndexForPortfolio(
      updatedPortfolio,
      now,
    );
    const secondRefreshedSnapshot = refreshPortfolioSnapshotIfDue(
      updatedPortfolio,
      now,
    );

    expect(secondTargetCycleIndex).toBeNull();
    expect(secondRefreshedSnapshot).toBeNull();
  });

  it('accumulate 모드에서는 새 V가 정산 전 pool 성장분 + deltaCash를 반영하고 pool도 입금액만큼 증가한다', () => {
    // Why: 적립식 사이클 전환에서 입금액이 빠지면 새 회차 목표가가 낮아지고 이후 주문표 전체가 과소 계산됩니다.
    const params = createVrParams('accumulate', 50);
    const previousSnapshot = createOrdersSnapshot(params, {
      currentV: 500,
      pool: 600,
      shares: 2,
      bandLow: 475,
      bandHigh: 525,
      cycleIndex: 0,
    });
    const portfolio = createPortfolio(params, {
      vrSnapshot: previousSnapshot,
    });

    const refreshed = buildRefreshedVrSnapshot(portfolio, 1);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.currentV).toBe(610);
    expect(refreshed?.pool).toBe(650);
    expect(refreshed?.bandLow).toBe(579.5);
    expect(refreshed?.bandHigh).toBe(640.5);
    expect(refreshed?.cycleIndex).toBe(1);
  });

  it('withdraw 모드에서는 새 V가 정산 전 pool 성장분 - deltaCash를 반영하고 pool도 출금액만큼 감소한다', () => {
    // Why: 인출식에서 출금액 부호가 잘못되면 V가 오히려 상승해 매수/매도 기준이 완전히 반대로 뒤집힙니다.
    const params = createVrParams('withdraw', 50);
    const previousSnapshot = createOrdersSnapshot(params, {
      currentV: 500,
      pool: 600,
      shares: 2,
      bandLow: 475,
      bandHigh: 525,
      cycleIndex: 0,
    });
    const portfolio = createPortfolio(params, {
      vrSnapshot: previousSnapshot,
    });

    const refreshed = buildRefreshedVrSnapshot(portfolio, 1);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.currentV).toBe(510);
    expect(refreshed?.pool).toBe(550);
    expect(refreshed?.bandLow).toBe(484.5);
    expect(refreshed?.bandHigh).toBe(535.5);
    expect(refreshed?.cycleIndex).toBe(1);
  });

  it('withdraw 모드에서 인출액이 현재 pool보다 크면 음수 장부를 만들지 않고 실패한다', () => {
    // Why: 초과 인출을 허용하면 다음 회차 주문표가 음수 현금을 기준으로 생성되어 장부 전체가 깨집니다.
    const params = createVrParams('withdraw', 700);
    const previousSnapshot = createOrdersSnapshot(params, {
      currentV: 500,
      pool: 600,
      shares: 2,
      bandLow: 475,
      bandHigh: 525,
      cycleIndex: 0,
    });
    const portfolio = createPortfolio(params, {
      vrSnapshot: previousSnapshot,
    });

    expect(() => buildRefreshedVrSnapshot(portfolio, 1)).toThrow(
      '[VR_Settlement_Error]',
    );
  });

  it('사이클 갱신 시 buyOrders와 sellOrders는 이전 회차 표를 재사용하지 않고 새 밴드 기준으로 완전히 재생성된다', () => {
    // Why: 사이클이 바뀌었는데 이전 주문표를 재사용하면 새 V와 카드 문구는 바뀌고 실제 주문표만 낡은 채 남는 이중 장부가 발생합니다.
    const params = createVrParams('accumulate', 50);
    const previousSnapshot = createOrdersSnapshot(params, {
      currentV: 500,
      pool: 600,
      shares: 2,
      bandLow: 475,
      bandHigh: 525,
      cycleIndex: 0,
    });
    const portfolio = createPortfolio(params, {
      vrSnapshot: previousSnapshot,
    });

    const refreshed = buildRefreshedVrSnapshot(portfolio, 1);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.buyOrders).not.toBe(previousSnapshot.buyOrders);
    expect(refreshed?.sellOrders).not.toBe(previousSnapshot.sellOrders);
    expect(refreshed?.buyOrders).not.toEqual(previousSnapshot.buyOrders);
    expect(refreshed?.sellOrders).not.toEqual(previousSnapshot.sellOrders);
    expect(refreshed?.buyOrders.length).toBeGreaterThan(0);
    expect(refreshed?.sellOrders.length).toBeGreaterThan(0);
  });

  it('배치 중 한 포트폴리오에서 에러가 나도 나머지 정상 포트폴리오는 계속 처리된다', async () => {
    // Why: 대량 배치에서 한 건의 장애가 전체 포트폴리오 갱신을 중단시키면 다른 고객의 사이클까지 전부 밀리는 운영 장애가 됩니다.
    const params = createVrParams('lump_sum', 0, { cycleWeeks: 1 });
    const rows: PortfolioRow[] = [
      createPortfolioRow(params, { id: 'portfolio-ok-1' }),
      createPortfolioRow(params, { id: 'portfolio-fail' }),
      createPortfolioRow(params, { id: 'portfolio-ok-2' }),
    ];
    const successfulRefreshes: Array<{
      portfolioId: string;
      targetCycleIndex: number;
    }> = [];

    await processVrRefreshBatch(rows, {
      now: new Date('2026-04-20T16:00:00Z'),
      refreshPortfolio: async (_portfolio, portfolioId, targetCycleIndex) => {
        if (portfolioId === 'portfolio-fail') {
          throw new Error('intentional batch failure');
        }

        successfulRefreshes.push({ portfolioId, targetCycleIndex });
      },
    });

    expect(successfulRefreshes).toEqual([
      { portfolioId: 'portfolio-ok-1', targetCycleIndex: 1 },
      { portfolioId: 'portfolio-ok-2', targetCycleIndex: 1 },
    ]);
  });

  it('뉴욕 DST 시작 경계에서도 logical date는 하루를 건너뛰지 않고 정확히 1일 전진한다', () => {
    // Why: 봄철 23시간짜리 날에 날짜 추출이 흔들리면 배치가 회차를 건너뛰거나 하루 늦게 반영하는 금융 장애가 납니다.
    const beforeMidnight = getLogicalNewYorkDate(
      new Date('2026-03-09T03:59:59Z'),
    );
    const afterMidnight = getLogicalNewYorkDate(
      new Date('2026-03-09T04:00:00Z'),
    );

    expect(beforeMidnight).not.toBeNull();
    expect(afterMidnight).not.toBeNull();
    if (beforeMidnight == null || afterMidnight == null) {
      throw new Error('logical New York dates must be resolved');
    }
    expect(afterMidnight.getTime() - beforeMidnight.getTime()).toBe(TIME_MS.PER_DAY);
    expect(beforeMidnight.toISOString()).toBe('2026-03-08T00:00:00.000Z');
    expect(afterMidnight.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  it('뉴욕 DST 종료 경계에서도 logical date는 하루를 중복 계산하지 않고 정확히 1일 전진한다', () => {
    // Why: 가을철 25시간짜리 날에 같은 캘린더 날짜를 두 번 읽으면 멱등성 가드가 있어도 회차 판정 자체가 꼬일 수 있습니다.
    const beforeMidnight = getLogicalNewYorkDate(
      new Date('2026-11-02T04:59:59Z'),
    );
    const afterMidnight = getLogicalNewYorkDate(
      new Date('2026-11-02T05:00:00Z'),
    );

    expect(beforeMidnight).not.toBeNull();
    expect(afterMidnight).not.toBeNull();
    if (beforeMidnight == null || afterMidnight == null) {
      throw new Error('logical New York dates must be resolved');
    }
    expect(afterMidnight.getTime() - beforeMidnight.getTime()).toBe(TIME_MS.PER_DAY);
    expect(beforeMidnight.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(afterMidnight.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });
});
