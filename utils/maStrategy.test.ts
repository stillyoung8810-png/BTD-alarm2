import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData } from '../types';
import {
  determineActiveSection,
  getMaPeriods,
} from './portfolioCalculations';
import { formatPortfolioDailyExecutionBlock } from './dailyExecutionSummary';
import { buildPortfolioDraftFromWizardState } from '../src/components/StrategyCreator/utils';
import {
  fetchStockPriceHistory,
  fetchStockPrices,
} from '../services/stockService';

vi.mock('../services/stockService', () => ({
  fetchStockPrices: vi.fn(),
  fetchStockPriceHistory: vi.fn(),
}));

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

function createMaPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: overrides.id ?? 'ma-portfolio',
    name: overrides.name ?? 'MA portfolio',
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
    isQuarterMode: overrides.isQuarterMode,
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
    strategy: legacyStrategy as unknown as Portfolio['strategy'],
  };
}

describe('MA strategy client logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchStockPrices).mockResolvedValue({});
    vi.mocked(fetchStockPriceHistory).mockResolvedValue([]);
  });

  it('현재가가 hi와 정확히 같으면 구간 1이 아니라 구간 2로 판정한다', async () => {
    // Why: 백테스트/실서비스가 경계값에서 갈라지면 같은 시세에서도 다른 구간 매수가 발생해 실전 체결이 틀어집니다.
    vi.mocked(fetchStockPrices).mockResolvedValue({
      QQQ: createStockData({
        symbol: 'QQQ',
        price: 120.55,
        ma20: 120.55,
        ma60: 110.1,
      }),
    });

    const section = await determineActiveSection(createMaPortfolio());

    expect(section).toBe(2);
    expect(fetchStockPriceHistory).not.toHaveBeenCalled();
  });

  it('현재가가 0 이하이거나 NaN이면 크래시 없이 null을 반환한다', async () => {
    // Why: 시세 API가 깨졌을 때 구간 판정이 예외를 던지면 대시보드·퀵입력 모두 연쇄적으로 실패할 수 있습니다.
    vi.mocked(fetchStockPrices).mockResolvedValueOnce({
      QQQ: createStockData({
        symbol: 'QQQ',
        price: 0,
      }),
    });
    const zeroPriceSection = await determineActiveSection(createMaPortfolio());

    vi.mocked(fetchStockPrices).mockResolvedValueOnce({
      QQQ: createStockData({
        symbol: 'QQQ',
        price: Number.NaN,
      }),
    });
    const nanPriceSection = await determineActiveSection(createMaPortfolio());

    expect(zeroPriceSection).toBeNull();
    expect(nanPriceSection).toBeNull();
  });

  it('구형 포트폴리오 스키마에서도 ma1/ma3 내부 기간으로 안전하게 폴백한다', () => {
    // Why: 기존 사용자 포트폴리오를 읽을 때 기간 필드 위치가 달라도 구간 판정이 같은 값으로 이어져야 데이터 마이그레이션 없이 서비스가 유지됩니다.
    const legacyPortfolio = createLegacyPeriodPortfolio();

    expect(getMaPeriods(legacyPortfolio)).toEqual({
      maAPeriod: 15,
      maBPeriod: 90,
    });
  });

  it('MA 전략 초안 생성은 신규 스키마의 ma0에 기간과 정배열 옵션을 저장한다', () => {
    // Why: 새로 만든 포트폴리오가 legacy 산개 필드로 저장되면 클라이언트와 서버의 기간 해석이 다시 분기될 수 있습니다.
    const result = buildPortfolioDraftFromWizardState({
      selectedStrategy: 'rsi_ma_interval',
      wizardState: {
        meta: {
          name: 'MA draft',
          dailyBuyAmount: 700,
          startDate: '2026-04-20',
          feeRatePercent: 0.25,
        },
        maInterval: {
          ma0Stock: 'QQQ',
          maAPeriod: 12,
          maBPeriod: 48,
          rsiEnabled: true,
          alignmentEnabled: true,
          ma1: {
            stock: 'SOXL',
            rsiThreshold: 35,
          },
          ma2: {
            stock: 'TQQQ',
            rsiThreshold: 30,
          },
          ma3: {
            stock: 'SQQQ',
            rsiThreshold: 25,
          },
        },
      },
    });

    expect(result.portfolio.strategy.ma0.maAPeriod).toBe(12);
    expect(result.portfolio.strategy.ma0.maBPeriod).toBe(48);
    expect(result.portfolio.strategy.ma0.alignmentEnabled).toBe(true);
    expect(result.portfolio.strategy.ma0.rsiEnabled).toBe(true);
  });

  it('RSI만 미충족이면 관망 문자열을 RSI 우선 문구로 출력한다', () => {
    // Why: 관망 사유가 흐려지면 사용자는 구간 자체가 틀린 것으로 오해하고 전략 설정을 잘못 수정할 수 있습니다.
    const summary = formatPortfolioDailyExecutionBlock(createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: true,
          alignmentEnabled: false,
        },
      },
    }), 'ko', {
      maActiveSection: 1,
      maRsiNotMet: true,
      maAlignmentNotMet: false,
    });

    expect(summary).toContain('- 구간 1: 관망 (RSI 조건 미충족)');
    expect(summary).not.toContain('- 구간 1: SOXL 매수');
  });

  it('정배열만 미충족이면 maA <= maB 상태를 정배열 관망 문자열로 유지한다', () => {
    // Why: 정배열 필터는 RSI와 별도 제약이므로, 동률·역배열 상태가 단순 매수로 노출되면 전략 의미가 훼손됩니다.
    const summary = formatPortfolioDailyExecutionBlock(createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: false,
          alignmentEnabled: true,
        },
      },
    }), 'ko', {
      maActiveSection: 1,
      maRsiNotMet: false,
      maAlignmentNotMet: true,
    });

    expect(summary).toContain('- 구간 1: 관망 (정배열 미충족)');
    expect(summary).not.toContain('- 구간 1: SOXL 매수');
  });

  it('정배열과 RSI가 모두 미충족이면 두 사유가 결합된 최우선 관망 문자열을 출력한다', () => {
    // Why: 두 제약이 동시에 걸린 상황에서 한쪽 이유만 남으면 사용자가 잘못된 단일 원인만 수정해도 된다고 오판할 수 있습니다.
    const summary = formatPortfolioDailyExecutionBlock(createMaPortfolio({
      strategy: {
        ...createMaPortfolio().strategy,
        ma0: {
          ...createMaPortfolio().strategy.ma0,
          rsiEnabled: true,
          alignmentEnabled: true,
        },
      },
    }), 'ko', {
      maActiveSection: 1,
      maRsiNotMet: true,
      maAlignmentNotMet: true,
    });

    expect(summary).toContain('- 구간 1: 관망 (정배열 미충족, RSI 조건 미충족)');
    expect(summary).not.toContain('- 구간 1: 관망 (RSI 조건 미충족)');
  });
});
