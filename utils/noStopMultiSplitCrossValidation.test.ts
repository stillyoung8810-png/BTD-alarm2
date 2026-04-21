// Tech Debt Monitor: 무손절 다분할 프론트/서버 로직 동기화 감시
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData, Trade } from '../types';
import type { Portfolio as ServerPortfolio } from '../supabase/functions/_shared/types.ts';
import {
  calculateNoStopMultiSplitState,
  type NoStopMultiSplitParams,
} from '../supabase/functions/_shared/noStopMultiSplitShared.ts';
import { formatPortfolioDailyExecutionBlock as formatServerDailyExecutionBlock } from '../supabase/functions/_shared/maSummaryShared.ts';
import { formatPortfolioDailyExecutionBlock as formatFrontendDailyExecutionBlock } from './dailyExecutionSummary';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import { toTradeInputsForMultiSplit } from '../hooks/multiSplitExecutionShared';
import type { ServiceResult } from '../services/serviceUtils';
import { okResult } from '../services/serviceUtils';

vi.mock('../services/stockService', () => ({
  fetchLatestStockSnapshot: vi.fn(),
}));

import { fetchLatestStockSnapshot } from '../services/stockService';

type CrossValidationPortfolio = Portfolio & ServerPortfolio;

type HookProps = {
  portfolio: CrossValidationPortfolio;
  lang: 'ko' | 'en';
};

function createQuoteResult(price: number): ServiceResult<StockData> {
  return okResult<StockData>({
    symbol: 'TQQQ',
    price,
    change: 0,
    changePercent: 0,
    rsi: 50,
    ma20: price,
    ma60: price,
    ma120: price,
  });
}

function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: overrides.id ?? 'trade-1',
    type: overrides.type ?? 'buy',
    stock: overrides.stock ?? 'TQQQ',
    date: overrides.date ?? '2026-03-13',
    price: overrides.price ?? 100,
    quantity: overrides.quantity ?? 1,
    fee: overrides.fee ?? 0,
    metadata: overrides.metadata,
    isMOC: overrides.isMOC,
  };
}

function createNoStopParams(
  overrides: Partial<NoStopMultiSplitParams> = {},
): NoStopMultiSplitParams {
  return {
    targetStock: overrides.targetStock ?? 'TQQQ',
    lowLocBudgetRatio: overrides.lowLocBudgetRatio ?? 50,
    highLocPremiumPct: overrides.highLocPremiumPct ?? 15,
    takeProfitPct: overrides.takeProfitPct ?? 10,
    totalSplitCount: overrides.totalSplitCount ?? 40,
  };
}

function createPortfolio(
  overrides: Partial<CrossValidationPortfolio> = {},
): CrossValidationPortfolio {
  const noStopMultiSplit = createNoStopParams(
    overrides.strategy?.noStopMultiSplit ?? undefined,
  );

  return {
    id: overrides.id ?? 'no-stop-cross-validation',
    name: overrides.name ?? 'no stop cross validation',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 1_000,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: noStopMultiSplit.targetStock,
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 5,
        maBPeriod: 20,
      },
      ma1: { stock: noStopMultiSplit.targetStock },
      ma2: { stock: noStopMultiSplit.targetStock, splitCount: 1 },
      ma3: { stock: noStopMultiSplit.targetStock },
      noStopMultiSplit,
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

function calculateServerState(
  portfolio: CrossValidationPortfolio,
  currentPrice: number,
) {
  const strategy = portfolio.strategy.noStopMultiSplit;
  if (strategy == null) {
    throw new Error('noStopMultiSplit strategy is required');
  }

  return calculateNoStopMultiSplitState({
    trades: toTradeInputsForMultiSplit(portfolio.trades),
    oneTimeAmount: portfolio.dailyBuyAmount,
    feeRate: portfolio.feeRate ?? 0.25,
    currentPrice,
    strategy,
  });
}

describe('no-stop multi-split split-brain cross validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('소수점 부동오차가 있는 회차 엣지 케이스에서도 프론트 훅과 서버 공용 엔진이 동일한 정수 회차를 반환한다', async () => {
    // Why: 회차 반올림 기준이 어긋나면 서버는 3.0000000000000004, 앱은 3처럼 표시되어 분할 완료 조건과 카드 표기가 갈라질 수 있습니다.
    const currentPrice = 0.1;
    vi.mocked(fetchLatestStockSnapshot).mockResolvedValue(
      createQuoteResult(currentPrice),
    );
    const portfolio = createPortfolio({
      dailyBuyAmount: 0.1,
      trades: [
        createTrade({
          stock: 'TQQQ',
          price: 0.1,
          quantity: 3,
        }),
      ],
      strategy: {
        ...createPortfolio().strategy,
        noStopMultiSplit: createNoStopParams({
          targetStock: 'TQQQ',
          highLocPremiumPct: 0,
        }),
      },
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useNoStopMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.executionData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio, currentPrice);

    expect(result.current.currentRound).toBe(3);
    expect(serverState.currentRound).toBe(3);
    expect(result.current.executionData?.currentRound).toBe(3);
    expect(serverState.executionData.currentRound).toBe(3);
    expect(result.current.currentRound).toBe(serverState.currentRound);
    expect(result.current.executionData).toEqual(serverState.executionData);
  });

  it('floorSafe가 필요한 애매한 예산 상태에서도 프론트 훅과 서버 공용 엔진이 동일한 저가·고가 LOC와 익절 주문을 계산한다', async () => {
    // Why: EPSILON 보정이 한쪽에만 빠지면 경계 예산에서 1주씩 줄어드는 잠복 오차가 생겨 실제 주문 수량이 프론트와 서버에서 달라집니다.
    const currentPrice = 100;
    vi.mocked(fetchLatestStockSnapshot).mockResolvedValue(
      createQuoteResult(currentPrice),
    );
    const portfolio = createPortfolio({
      dailyBuyAmount: 399.99999999999994,
      feeRate: 0,
      trades: [
        createTrade({
          stock: 'TQQQ',
          price: 100,
          quantity: 1,
        }),
      ],
      strategy: {
        ...createPortfolio().strategy,
        noStopMultiSplit: createNoStopParams({
          targetStock: 'TQQQ',
          lowLocBudgetRatio: 25,
          highLocPremiumPct: 0,
          takeProfitPct: 10,
        }),
      },
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useNoStopMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.executionData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio, currentPrice);

    expect(result.current.executionData).toEqual({
      currentRound: 0.25,
      isFirstBuy: false,
      isSplitComplete: false,
      lowLoc: { price: 100, quantity: 1 },
      highLoc: { price: 100, quantity: 3 },
      takeProfit: { price: 110, quantity: 1 },
    });
    expect(serverState.executionData).toEqual(result.current.executionData);
  });

  it('보유 수량 0인 픽스처에서는 프론트와 서버 모두 동일하게 isFirstBuy로 판정하고 익절 라인을 숨긴다', async () => {
    // Why: 평단가가 없는 첫 매수 상태에서 한쪽만 익절 라인을 만들면 존재하지 않는 매도 계획을 사용자에게 노출하는 제품 오작동이 됩니다.
    const currentPrice = 40;
    vi.mocked(fetchLatestStockSnapshot).mockResolvedValue(
      createQuoteResult(currentPrice),
    );
    const portfolio = createPortfolio({
      trades: [],
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useNoStopMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.executionData).not.toBeNull();
    });

    const serverState = calculateServerState(portfolio, currentPrice);
    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      noStopMultiSplitExecutionData: result.current.executionData ?? undefined,
    });
    const serverSummary = formatServerDailyExecutionBlock(portfolio, 'ko', {
      noStopMultiSplitExecutionData: serverState.executionData,
    });

    expect(result.current.executionData?.isFirstBuy).toBe(true);
    expect(serverState.executionData.isFirstBuy).toBe(true);
    expect(result.current.executionData?.takeProfit).toBeUndefined();
    expect(serverState.executionData.takeProfit).toBeUndefined();
    expect(frontendSummary).toContain('첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.');
    expect(serverSummary).toContain('첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.');
    expect(frontendSummary).not.toContain('익절 목표');
    expect(serverSummary).not.toContain('익절 목표');
    expect(frontendSummary).toBe(serverSummary);
  });
});
