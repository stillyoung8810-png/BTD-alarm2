// Tech Debt Monitor: 이 테스트가 실패하면 프론트엔드와 서버의 MA 계산 로직이 서로 동기화되지 않은 (Split-Brain) 상태임을 의미합니다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData } from '../types';
import type { Portfolio as ServerPortfolio } from '../supabase/functions/_shared/types.ts';
import {
  calculateMaAlignmentNotMet as calculateFrontendMaAlignmentNotMet,
  calculateMaRsiNotMet as calculateFrontendMaRsiNotMet,
  collectMaPartialProfitLine as collectFrontendMaPartialProfitLine,
  DEFAULT_MA_RSI_FALLBACK,
  determineActiveSection as determineFrontendActiveSection,
  getMaPeriods as getFrontendMaPeriods,
} from './portfolioCalculations';
import { formatPortfolioDailyExecutionBlock as formatFrontendDailyExecutionBlock } from './dailyExecutionSummary';
import {
  calculateMaAlignmentNotMet as calculateServerMaAlignmentNotMet,
  calculateMaRsiNotMet as calculateServerMaRsiNotMet,
  collectMaPartialProfitLine as collectServerMaPartialProfitLine,
  determineMaActiveSectionFromValues,
  formatPortfolioDailyExecutionBlock as formatServerDailyExecutionBlock,
  getMaPeriods as getServerMaPeriods,
} from '../supabase/functions/_shared/maSummaryShared.ts';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';
import {
  fetchStockPriceHistory,
  fetchStockPrices,
} from '../services/stockService';

vi.mock('../services/stockService', () => ({
  fetchStockPrices: vi.fn(),
  fetchStockPriceHistory: vi.fn(),
}));

type CrossValidationPortfolio = Portfolio & ServerPortfolio;
const KO_EXECUTION = getDashboardMessages('ko').execution;

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
    ma60: overrides.ma60 ?? 80,
    ma120: overrides.ma120 ?? 70,
  };
}

function createMaPortfolio(
  overrides: Partial<CrossValidationPortfolio> = {},
): CrossValidationPortfolio {
  const portfolio: Portfolio = {
    id: overrides.id ?? 'ma-cross-validation',
    name: overrides.name ?? 'MA cross validation',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 1_000,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'QQQ',
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 20,
        maBPeriod: 60,
      },
      ma1: {
        stock: 'SOXL',
        takePartialProfit: false,
      },
      ma2: {
        stock: 'TQQQ',
        splitCount: 1,
        takePartialProfit: false,
      },
      ma3: {
        stock: 'SQQQ',
        takePartialProfit: false,
      },
    },
    trades: overrides.trades ?? [],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig ?? {
      enabled: true,
      selectedHours: ['23:00'],
      timezone: 'Asia/Seoul',
    },
    vrSnapshot: overrides.vrSnapshot,
  };

  return portfolio as CrossValidationPortfolio;
}

function createLegacyPeriodPortfolio(): CrossValidationPortfolio {
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
    strategy: legacyStrategy as CrossValidationPortfolio['strategy'],
  };
}

describe('MA strategy split-brain cross validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchStockPrices).mockResolvedValue({});
    vi.mocked(fetchStockPriceHistory).mockResolvedValue([]);
  });

  it('주가가 hi와 정확히 일치하는 엣지 케이스에서 프론트와 서버 구간 판정이 완전히 일치한다', async () => {
    // Why: 경계값에서 프론트와 서버가 서로 다른 구간을 내면 같은 시세를 보고도 앱과 알림이 다른 전략 행동을 지시하는 Drift가 발생합니다.
    const portfolio = createMaPortfolio();
    const snapshot = createStockData({
      symbol: 'QQQ',
      price: 120.55,
      ma20: 120.55,
      ma60: 110.1,
    });

    vi.mocked(fetchStockPrices).mockResolvedValue({
      QQQ: snapshot,
    });

    const frontendSection = await determineFrontendActiveSection(portfolio);
    const serverPeriods = getServerMaPeriods(portfolio);
    const serverSection = determineMaActiveSectionFromValues(
      snapshot.price,
      serverPeriods.maAPeriod === 20 ? snapshot.ma20 : snapshot.ma60,
      serverPeriods.maBPeriod === 60 ? snapshot.ma60 : snapshot.ma20,
    );

    expect(frontendSection).toBe(2);
    expect(serverSection).toBe(2);
    expect(frontendSection).toBe(serverSection);
  });

  it('구형 포트폴리오 기간 폴백도 프론트와 서버가 완전히 동일하게 해석한다', () => {
    // Why: 기간 필드 폴백 순서가 한쪽만 달라지면 같은 레거시 포트폴리오가 클라이언트와 서버에서 서로 다른 이평 기간으로 계산됩니다.
    const legacyPortfolio = createLegacyPeriodPortfolio();

    expect(getFrontendMaPeriods(legacyPortfolio)).toEqual({
      maAPeriod: 15,
      maBPeriod: 90,
    });
    expect(getServerMaPeriods(legacyPortfolio)).toEqual({
      maAPeriod: 15,
      maBPeriod: 90,
    });
    expect(getFrontendMaPeriods(legacyPortfolio)).toEqual(
      getServerMaPeriods(legacyPortfolio),
    );
  });

  it('구간 1 + 정배열 미충족 + RSI 충족 상태의 최종 한글 요약 문자열이 프론트와 서버에서 토씨 하나 없이 동일하다', () => {
    // Why: 알림 문구가 프론트와 서버에서 한 글자라도 달라지면 PO가 의도한 UX는 같아 보여도 실제 운영 메시지와 앱 화면이 서로 다른 상태로 드리프트합니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: true,
          alignmentEnabled: true,
        },
      },
    });

    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: false,
      maAlignmentNotMet: true,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: false,
      maAlignmentNotMet: true,
    });

    const expectedWatchLine = `- ${KO_EXECUTION.section} 1: ${KO_EXECUTION.sectionWatchAlignmentNotMet}`;

    expect(frontendSummary).toContain(expectedWatchLine);
    expect(serverSummary).toContain(expectedWatchLine);
    expect(frontendSummary === serverSummary).toBe(true);
    expect(frontendSummary).toBe(serverSummary);
  });

  it('RSI 임계값과 현재 RSI가 정확히 같을 때 프론트와 서버는 동일하게 RSI 조건 충족으로 판단하고 최종 문자열도 일치한다', () => {
    // Tech Debt Monitor: RSI 임계값 부등호(> vs >=) 불일치 감시
    // Why: 임계값 경계에서 한쪽만 관망 처리되면 앱 화면과 서버 알림이 같은 가격에서 서로 다른 매수 신호를 내게 됩니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: true,
          alignmentEnabled: false,
        },
        ma1: {
          ...createMaPortfolio().strategy.ma1,
          rsiThreshold: 40,
        },
      },
    });

    const frontendRsiNotMet = calculateFrontendMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: 40,
    });
    const serverRsiNotMet = calculateServerMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: 40,
    });

    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: frontendRsiNotMet,
      maAlignmentNotMet: false,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: serverRsiNotMet,
      maAlignmentNotMet: false,
    });
    const expectedBuyLine = `- ${KO_EXECUTION.section} 1: ${portfolio.strategy.ma1.stock} ${KO_EXECUTION.buy}`;

    expect(frontendRsiNotMet).toBe(false);
    expect(serverRsiNotMet).toBe(false);
    expect(frontendRsiNotMet).toBe(serverRsiNotMet);
    expect(frontendSummary).toContain(expectedBuyLine);
    expect(serverSummary).toContain(expectedBuyLine);
    expect(frontendSummary).toBe(serverSummary);
  });

  it('구간 2 중간익절 조건이 발동하면 프론트와 서버가 동일한 중간익절 라인을 생성한다', () => {
    // Tech Debt Monitor: 중간익절 수익률 계산 및 표시 드리프트 감시
    // Why: 익절 발동 조건이 양쪽에서 어긋나면 한쪽은 매도 가이드를 주고 다른 쪽은 계속 보유를 유도하는 운영 사고가 납니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma2: {
          ...createMaPortfolio().strategy.ma2,
          stock: 'TQQQ',
          takePartialProfit: true,
          partialProfitTargetPct: 10,
        },
      },
    });
    const holdings = [
      {
        stock: 'TQQQ',
        quantity: 3,
        avgPrice: 100,
      },
    ] as const;
    const prices = {
      TQQQ: {
        price: 110,
      },
    } as const;

    const frontendLine = collectFrontendMaPartialProfitLine({
      section: 2,
      config: portfolio.strategy.ma2,
      holdings,
      prices,
    });
    const serverLine = collectServerMaPartialProfitLine({
      section: 2,
      config: portfolio.strategy.ma2,
      holdings,
      prices,
    });

    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 2,
      maPartialProfitLines: frontendLine == null ? [] : [frontendLine],
      maRsiNotMet: false,
      maAlignmentNotMet: false,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 2,
      maPartialProfitLines: serverLine == null ? [] : [serverLine],
      maRsiNotMet: false,
      maAlignmentNotMet: false,
    });
    const expectedPartialProfitLine = `- ${KO_EXECUTION.section} 2 ${KO_EXECUTION.sectionPartialProfit}: TQQQ 3${KO_EXECUTION.sharesUnit}`;

    expect(frontendLine).toEqual({
      section: 2,
      stock: 'TQQQ',
      quantity: 3,
    });
    expect(serverLine).toEqual(frontendLine);
    expect(frontendSummary).toContain(expectedPartialProfitLine);
    expect(serverSummary).toContain(expectedPartialProfitLine);
    expect(frontendSummary).toBe(serverSummary);
  });

  it('RSI 값이 누락된 비정상 상태에서도 프론트와 서버는 동일한 fallback RSI로 안전하게 관망 처리한다', () => {
    // Tech Debt Monitor: 비정상 스냅샷(RSI 누락) 폴백 불일치 감시
    // Why: 데이터 공급원이 일시적으로 RSI를 비우는 순간 한쪽만 기본값을 다르게 쓰면 알림과 앱 UI의 전략 상태가 즉시 갈라집니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: true,
        },
        ma1: {
          ...createMaPortfolio().strategy.ma1,
          rsiThreshold: 40,
        },
      },
    });

    const frontendRsiNotMet = calculateFrontendMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: undefined,
    });
    const serverRsiNotMet = calculateServerMaRsiNotMet({
      strategy: portfolio.strategy,
      section: 1,
      currentRsi: undefined,
    });

    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: frontendRsiNotMet,
      maAlignmentNotMet: false,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      maActiveSection: 1,
      maRsiNotMet: serverRsiNotMet,
      maAlignmentNotMet: false,
    });
    const expectedWatchLine = `- ${KO_EXECUTION.section} 1: ${KO_EXECUTION.sectionWatchRsiNotMet}`;

    expect(DEFAULT_MA_RSI_FALLBACK).toBe(50);
    expect(frontendRsiNotMet).toBe(true);
    expect(serverRsiNotMet).toBe(true);
    expect(frontendRsiNotMet).toBe(serverRsiNotMet);
    expect(frontendSummary).toContain(expectedWatchLine);
    expect(serverSummary).toContain(expectedWatchLine);
    expect(frontendSummary).toBe(serverSummary);
  });

  it('maA와 maB가 정확히 같을 때 프론트와 서버는 동일하게 정배열 미충족으로 판정한다', () => {
    // Tech Debt Monitor: 정배열 부등호(> vs >=) 불일치 감시
    // Why: 동률을 한쪽만 정배열로 인정하면 경계 구간에서 앱 화면과 알림의 관망/매수 판단이 갈라질 수 있습니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          alignmentEnabled: true,
        },
      },
    });

    const frontendNotMet = calculateFrontendMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 120.55,
      maB: 120.55,
    });
    const serverNotMet = calculateServerMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 120.55,
      maB: 120.55,
    });

    expect(frontendNotMet).toBe(true);
    expect(serverNotMet).toBe(true);
    expect(!frontendNotMet).toBe(false);
    expect(!serverNotMet).toBe(false);
    expect(frontendNotMet).toBe(serverNotMet);
  });

  it('maA가 maB보다 미세하게 작을 때도 프론트와 서버는 동일하게 정배열 미충족으로 판정한다', () => {
    // Tech Debt Monitor: 정배열 부등호(> vs >=) 불일치 감시
    // Why: 부동소수점에 가까운 미세 역배열에서 판정이 엇갈리면 특정 가격대에서만 재현되는 잠복 드리프트가 운영 중에 튀어나옵니다.
    const portfolio = createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          alignmentEnabled: true,
        },
      },
    });

    const frontendNotMet = calculateFrontendMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 120.549999,
      maB: 120.55,
    });
    const serverNotMet = calculateServerMaAlignmentNotMet({
      isAlignmentEnabled: portfolio.strategy.ma0.alignmentEnabled,
      maA: 120.549999,
      maB: 120.55,
    });

    expect(frontendNotMet).toBe(true);
    expect(serverNotMet).toBe(true);
    expect(!frontendNotMet).toBe(false);
    expect(!serverNotMet).toBe(false);
    expect(frontendNotMet).toBe(serverNotMet);
  });
});
