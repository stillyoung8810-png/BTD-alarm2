// Tech Debt Monitor: 다분할 매매법 프론트/서버 로직 동기화 감시
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData, Trade } from '../types';
import type { Portfolio as ServerPortfolio } from '../supabase/functions/_shared/types.ts';
import {
  calculateMultiSplitStrategyState,
  type MultiSplitParams,
} from '../supabase/functions/_shared/multiSplitShared.ts';
import { formatPortfolioDailyExecutionBlock as formatServerDailyExecutionBlock } from '../supabase/functions/_shared/maSummaryShared.ts';
import type { ServiceResult } from '../services/serviceUtils';
import { okResult } from '../services/serviceUtils';
import { formatPortfolioDailyExecutionBlock as formatFrontendDailyExecutionBlock } from './dailyExecutionSummary';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { toTradeInputsForMultiSplit } from '../hooks/multiSplitExecutionShared';

vi.mock('../services/stockService', () => ({
  fetchLatestStockSnapshot: vi.fn(),
  getRecentTradingDaysFromDbSafe: vi.fn(),
}));

import {
  fetchLatestStockSnapshot,
  getRecentTradingDaysFromDbSafe,
} from '../services/stockService';

type CrossValidationPortfolio = Portfolio & ServerPortfolio;

const MOCK_CURRENT_PRICE = 100;
const MOCK_RECENT_TRADING_DAYS = ['2026-01-10', '2026-01-09', '2026-01-08'];

type HookProps = {
  portfolio: CrossValidationPortfolio;
  lang: 'ko' | 'en';
};

function createQuoteResult(price: number): ServiceResult<StockData> {
  return okResult<StockData>({
    symbol: 'AAPL',
    price,
    change: 0,
    changePercent: 0,
    rsi: 50,
    ma20: price,
    ma60: price,
    ma120: price,
  });
}

function createRecentDaysResult(days: string[]): ServiceResult<string[]> {
  return okResult<string[]>(days);
}

function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: overrides.id ?? 'trade-1',
    type: overrides.type ?? 'buy',
    stock: overrides.stock ?? 'AAPL',
    date: overrides.date ?? '2026-01-01',
    price: overrides.price ?? 100,
    quantity: overrides.quantity ?? 1,
    fee: overrides.fee ?? 0,
    metadata: overrides.metadata,
    isMOC: overrides.isMOC,
  };
}

function createMultiSplitParams(
  overrides: Partial<MultiSplitParams> = {},
): MultiSplitParams {
  return {
    targetStock: overrides.targetStock ?? 'AAPL',
    targetReturnRate: overrides.targetReturnRate ?? 10,
    totalSplitCount: overrides.totalSplitCount ?? 40,
  };
}

function createPortfolio(
  overrides: Partial<CrossValidationPortfolio> = {},
): CrossValidationPortfolio {
  const multiSplit = createMultiSplitParams(
    overrides.strategy?.multiSplit ?? undefined,
  );

  return {
    id: overrides.id ?? 'multi-split-cross-validation',
    name: overrides.name ?? 'multi split cross validation',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 100,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'AAPL',
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 5,
        maBPeriod: 20,
      },
      ma1: { stock: 'AAPL' },
      ma2: { stock: 'AAPL', splitCount: 1 },
      ma3: { stock: 'AAPL' },
      multiSplit,
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
    isQuarterMode: overrides.isQuarterMode ?? false,
    vrSnapshot: overrides.vrSnapshot,
  };
}

function calculateServerState(portfolio: CrossValidationPortfolio) {
  const multiSplit = portfolio.strategy.multiSplit;
  if (multiSplit == null) {
    throw new Error('multiSplit strategy is required for cross validation');
  }

  return calculateMultiSplitStrategyState({
    trades: toTradeInputsForMultiSplit(portfolio.trades),
    dailyBuyAmount: portfolio.dailyBuyAmount,
    feeRate: portfolio.feeRate ?? 0.25,
    multiSplit,
    isQuarterMode: portfolio.isQuarterMode === true,
    currentPrice: MOCK_CURRENT_PRICE,
    recentTradingDays: MOCK_RECENT_TRADING_DAYS,
  });
}

describe('multi-split split-brain cross validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestStockSnapshot).mockResolvedValue(
      createQuoteResult(MOCK_CURRENT_PRICE),
    );
    vi.mocked(getRecentTradingDaysFromDbSafe).mockResolvedValue(
      createRecentDaysResult(MOCK_RECENT_TRADING_DAYS),
    );
  });

  it('전반전 최소 1주 보정 엣지 케이스에서 프론트 훅과 서버 공용 엔진이 동일하게 LOC 매수1 1주를 반환한다', async () => {
    // Why: 이 1주 보정이 서버에서 빠지면 같은 포트폴리오를 보고도 앱과 알림이 서로 다른 전반전 매수 수량을 지시합니다.
    const portfolio = createPortfolio({
      dailyBuyAmount: 160,
      feeRate: 0,
      trades: [
        createTrade({
          stock: 'AAPL',
          price: 100,
          quantity: 5,
        }),
      ],
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.multiSplitExecutionData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio);

    expect(result.current.multiSplitPhase).toBe('first');
    expect(serverState.multiSplitPhase).toBe('first');
    expect(result.current.multiSplitExecutionData?.locBuy1).toEqual({
      price: 100,
      quantity: 1,
    });
    expect(serverState.multiSplitExecutionData?.locBuy1).toEqual({
      price: 100,
      quantity: 1,
    });
    expect(result.current.multiSplitExecutionData).toEqual(
      serverState.multiSplitExecutionData,
    );
  });

  it('보유 수량 0인 매도 엣지 케이스에서 프론트와 서버 요약 문자열이 가격과 0주를 동일하게 노출한다', async () => {
    // Why: 0주 매도 라인을 한쪽만 숨기면 사용자는 앱과 서버 알림 중 무엇이 최신 정책인지 알 수 없게 됩니다.
    const portfolio = createPortfolio({
      trades: [
        createTrade({
          stock: 'QQQ',
          price: 100,
          quantity: 1,
        }),
      ],
      strategy: {
        ...createPortfolio().strategy,
        multiSplit: createMultiSplitParams({
          targetStock: 'AAPL',
          targetReturnRate: 10,
          totalSplitCount: 4,
        }),
      },
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.multiSplitExecutionData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio);
    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      multiSplitExecutionData: result.current.multiSplitExecutionData ?? undefined,
      multiSplitPhase: result.current.multiSplitPhase,
      isQuarterStopLossActive: false,
      multiSplitOverLimit: false,
      multiSplitFirstRoundHint: false,
      multiSplitInsufficientAmount: false,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      multiSplitExecutionData: serverState.multiSplitExecutionData ?? undefined,
      multiSplitPhase: serverState.multiSplitPhase,
      isQuarterStopLossActive: false,
      multiSplitOverLimit: false,
      multiSplitFirstRoundHint: false,
      multiSplitInsufficientAmount: false,
    });

    expect(result.current.multiSplitExecutionData?.locSell).toEqual({
      price: 105,
      quantity: 0,
    });
    expect(result.current.multiSplitExecutionData?.limitSell).toEqual({
      price: 110,
      quantity: 0,
    });
    expect(serverState.multiSplitExecutionData).toEqual(
      result.current.multiSplitExecutionData,
    );
    expect(frontendSummary).toContain('- LOC 매도: 105.00 / 0주');
    expect(frontendSummary).toContain('- 지정가 매도: 110.00 / 0주');
    expect(frontendSummary).toBe(serverSummary);
  });

  it('T가 정확히 전환 경계 a/2에 도달하면 프론트 훅과 서버 공용 엔진이 동일하게 second 구간으로 판정한다', async () => {
    // Why: phase 경계 한 칸만 어긋나도 전반전 2분할과 후반전 1분할이 뒤집혀 운영 주문이 완전히 달라집니다.
    const portfolio = createPortfolio({
      trades: [
        createTrade({
          stock: 'AAPL',
          price: 100,
          quantity: 20,
        }),
      ],
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.multiSplitExecutionData?.phase).toBe('second');
    });

    const serverState = calculateServerState(portfolio);

    expect(result.current.currentRound).toBe(20);
    expect(serverState.currentRound).toBe(20);
    expect(result.current.multiSplitPhase).toBe('second');
    expect(serverState.multiSplitPhase).toBe('second');
    expect(result.current.multiSplitExecutionData).toEqual(
      serverState.multiSplitExecutionData,
    );
  });

  it('T가 a-1을 넘고 쿼터 모드가 켜진 상태에서는 프론트 훅과 서버 공용 엔진이 동일한 쿼터 진입과 25% MOC 수량을 계산한다', async () => {
    // Why: 쿼터 진입 조건이 어긋나면 한쪽은 손절 모드, 다른 쪽은 일반 다분할 주문을 보여주는 치명적 split-brain이 발생합니다.
    const portfolio = createPortfolio({
      isQuarterMode: true,
      trades: [
        createTrade({
          stock: 'AAPL',
          price: 3950,
          quantity: 1,
        }),
      ],
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.quarterStopLossData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio);

    expect(result.current.currentRound).toBe(39.5);
    expect(serverState.currentRound).toBe(39.5);
    expect(result.current.multiSplitPhase).toBe('quarter');
    expect(serverState.multiSplitPhase).toBe('quarter');
    expect(result.current.isInQuarterModeByT).toBe(true);
    expect(serverState.isInQuarterModeByT).toBe(true);
    expect(result.current.quarterStopLossData).toEqual({
      hasMOC: false,
      mocQuantity: 0.25,
    });
    expect(serverState.quarterStopLossData).toEqual(
      result.current.quarterStopLossData,
    );
  });
});
