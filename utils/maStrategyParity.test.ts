import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData } from '../types';
import {
  calculateMaAlignmentNotMet as calculateClientMaAlignmentNotMet,
  calculateMaRsiNotMet as calculateClientMaRsiNotMet,
  collectMaPartialProfitLine as collectClientMaPartialProfitLine,
  determineActiveSection as determineClientActiveSection,
  getMaPeriods as getClientMaPeriods,
} from './portfolioCalculations';
import {
  calculateMaAlignmentNotMet as calculateEdgeMaAlignmentNotMet,
  calculateMaRsiNotMet as calculateEdgeMaRsiNotMet,
  collectMaPartialProfitLine as collectEdgeMaPartialProfitLine,
  determineMaActiveSectionFromValues,
  formatPortfolioDailyExecutionBlock as formatEdgeDailyExecutionBlock,
  getMaPeriods as getEdgeMaPeriods,
} from '../supabase/functions/_shared/maSummaryShared.ts';
import { formatPortfolioDailyExecutionBlock as formatClientDailyExecutionBlock } from './dailyExecutionSummary';

vi.mock('../services/stockService', () => ({
  fetchStockPrices: vi.fn(),
  fetchStockPriceHistory: vi.fn(),
}));

import { fetchStockPrices } from '../services/stockService';

type LegacyMaStrategy = Portfolio['strategy'] & {
  ma1: Portfolio['strategy']['ma1'] & { period?: number };
  ma2: Portfolio['strategy']['ma2'] & { period1?: number; period2?: number };
  ma3: Portfolio['strategy']['ma3'] & { period?: number };
};

function createStockData(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: overrides.symbol ?? 'QQQ',
    price: overrides.price ?? 100,
    change: overrides.change ?? 0,
    changePercent: overrides.changePercent ?? 0,
    rsi: overrides.rsi ?? 50,
    ma20: overrides.ma20 ?? 90,
    ma60: overrides.ma60 ?? 110,
    ma120: overrides.ma120 ?? 120,
  };
}

function createMaPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: overrides.id ?? 'ma-parity',
    name: overrides.name ?? 'MA parity',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 1_000,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'QQQ',
        rsiEnabled: true,
        alignmentEnabled: true,
        maAPeriod: 20,
        maBPeriod: 60,
      },
      ma1: {
        stock: 'TQQQ',
        rsiThreshold: 40,
        takePartialProfit: true,
        partialProfitTargetPct: 10,
      },
      ma2: {
        stock: 'SOXL',
        splitCount: 1,
        rsiThreshold: 45,
        takePartialProfit: false,
      },
      ma3: {
        stock: 'SQQQ',
        rsiThreshold: 50,
        takePartialProfit: false,
      },
    },
    trades: overrides.trades ?? [],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig,
    vrSnapshot: overrides.vrSnapshot,
  };
}

function createLegacyPeriodPortfolio(): Portfolio {
  const basePortfolio = createMaPortfolio();
  const legacyStrategy: LegacyMaStrategy = {
    ...basePortfolio.strategy,
    ma0: {
      ...basePortfolio.strategy.ma0,
      maAPeriod: undefined,
      maBPeriod: undefined,
    },
    ma1: {
      ...basePortfolio.strategy.ma1,
      period: 15,
    },
    ma2: {
      ...basePortfolio.strategy.ma2,
      period1: 15,
      period2: 75,
    },
    ma3: {
      ...basePortfolio.strategy.ma3,
      period: 90,
    },
  };

  return {
    ...basePortfolio,
    strategy: legacyStrategy,
  };
}

describe('MA strategy client/edge parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('동일한 가격·이평선 입력이면 활성 구간을 동일하게 계산한다', async () => {
    const portfolio = createMaPortfolio();
    const snapshot = createStockData({
      price: 100,
      ma20: 90,
      ma60: 110,
    });
    vi.mocked(fetchStockPrices).mockResolvedValue({
      QQQ: snapshot,
    });

    const clientSection = await determineClientActiveSection(portfolio);
    const edgeSection = determineMaActiveSectionFromValues(
      snapshot.price,
      snapshot.ma20 ?? 0,
      snapshot.ma60 ?? 0,
    );

    expect(clientSection).toBe(edgeSection);
    expect(edgeSection).toBe(2);
  });

  it('RSI·정배열·중간익절 판정과 일일 요약 문자열이 동일하다', () => {
    const portfolio = createMaPortfolio();
    const clientRsiNotMet = calculateClientMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: 40,
    });
    const edgeRsiNotMet = calculateEdgeMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: 40,
    });
    const clientAlignmentNotMet = calculateClientMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 100,
      maB: 100,
    });
    const edgeAlignmentNotMet = calculateEdgeMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 100,
      maB: 100,
    });
    const holdings = [
      {
        stock: 'TQQQ',
        quantity: 3,
        avgPrice: 100,
      },
    ];
    const prices = {
      TQQQ: {
        price: 110,
      },
    };
    const clientPartialProfitLine = collectClientMaPartialProfitLine({
      section: 1,
      config: portfolio.strategy.ma1,
      holdings,
      prices,
    });
    const edgePartialProfitLine = collectEdgeMaPartialProfitLine({
      section: 1,
      config: portfolio.strategy.ma1,
      holdings,
      prices,
    });

    expect(clientRsiNotMet).toBe(edgeRsiNotMet);
    expect(clientAlignmentNotMet).toBe(edgeAlignmentNotMet);
    expect(clientPartialProfitLine).toEqual(edgePartialProfitLine);
    expect(clientPartialProfitLine).toEqual({
      section: 1,
      stock: 'TQQQ',
      quantity: 3,
    });
    expect(
      formatClientDailyExecutionBlock(portfolio, 'ko', {
        maActiveSection: 1,
        maRsiNotMet: clientRsiNotMet,
        maAlignmentNotMet: clientAlignmentNotMet,
        maPartialProfitLines:
          clientPartialProfitLine == null ? [] : [clientPartialProfitLine],
      }),
    ).toBe(
      formatEdgeDailyExecutionBlock(portfolio, 'ko', {
        maActiveSection: 1,
        maRsiNotMet: edgeRsiNotMet,
        maAlignmentNotMet: edgeAlignmentNotMet,
        maPartialProfitLines:
          edgePartialProfitLine == null ? [] : [edgePartialProfitLine],
      }),
    );
  });

  it('레거시 기간 필드 폴백도 동일하게 해석한다', () => {
    const portfolio = createLegacyPeriodPortfolio();

    expect(getClientMaPeriods(portfolio)).toEqual(getEdgeMaPeriods(portfolio));
    expect(getEdgeMaPeriods(portfolio)).toEqual({
      maAPeriod: 15,
      maBPeriod: 90,
    });
  });
});
