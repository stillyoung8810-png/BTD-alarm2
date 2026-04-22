import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MultiSplitIndicatorSnapshot,
  MultiSplitStrategy,
  Portfolio,
  Trade,
} from '../types';
import type { ServiceResult } from '../services/serviceUtils';
import { okResult } from '../services/serviceUtils';
import {
  calculateMultiSplitGuideState,
  type MultiSplitGuideState,
} from '../supabase/functions/_shared/multiSplitShared.ts';
import { buildMultiSplitExecutionSummaryLines } from '../supabase/functions/_shared/multiSplitExecutionMessages.ts';
import { formatPortfolioDailyExecutionBlock } from './dailyExecutionSummary';
import { formatPortfolioDailyExecutionBlock as formatServerDailyExecutionBlock } from '../supabase/functions/_shared/maSummaryShared.ts';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { toTradeInputsForMultiSplit } from '../hooks/multiSplitExecutionShared';

vi.mock('../services/stockService', () => ({
  buildIndicatorRequirementCacheKey: vi.fn(
    ({ symbol, requirements }: { symbol: string; requirements: { needsRsi: boolean; maPeriods: readonly number[] } }) =>
      `${symbol}|rsi:${requirements.needsRsi ? 1 : 0}|ma:${requirements.maPeriods.join(',')}`,
  ),
  fetchIndicatorAwareSnapshot: vi.fn(),
}));

import { fetchIndicatorAwareSnapshot } from '../services/stockService';

type HookProps = {
  portfolio: Portfolio;
  lang: 'ko' | 'en';
};

function createSnapshotResult(
  snapshot: MultiSplitIndicatorSnapshot,
): ServiceResult<MultiSplitIndicatorSnapshot> {
  return okResult(snapshot);
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

function createMultiSplitStrategy(
  overrides: Partial<MultiSplitStrategy> = {},
): MultiSplitStrategy {
  return {
    targetStock: overrides.targetStock ?? 'AAPL',
    targetReturnRate: overrides.targetReturnRate ?? 10,
    totalSplitCount: overrides.totalSplitCount ?? 10,
    baseLocRatio: overrides.baseLocRatio ?? 50,
    mainTakeProfitRatioPct: overrides.mainTakeProfitRatioPct ?? 60,
    riskCutRatioPct: overrides.riskCutRatioPct ?? 20,
    rsiRule: overrides.rsiRule,
    alignmentRule: overrides.alignmentRule,
  };
}

function createPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  const multiSplit = createMultiSplitStrategy(
    overrides.strategy?.multiSplit ?? undefined,
  );

  return {
    id: overrides.id ?? 'multi-split-cross-validation',
    name: overrides.name ?? 'smart split cross validation',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 100,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: multiSplit.targetStock,
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 5,
        maBPeriod: 20,
      },
      ma1: { stock: multiSplit.targetStock },
      ma2: { stock: multiSplit.targetStock, splitCount: 1 },
      ma3: { stock: multiSplit.targetStock },
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
    vrSnapshot: overrides.vrSnapshot,
  };
}

describe('multi-split cross validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult({
        currentPrice: 110,
        rsi: 30,
        maByPeriod: {
          5: 110,
          20: 100,
        },
      }),
    );
  });

  it('프론트 훅 executionData는 동일 입력의 공용 순수 함수 결과와 일치한다', async () => {
    // Why: hook과 shared pure function이 갈라지면 Dashboard와 알람 문자열이 같은 포트폴리오에서 서로 다른 수량을 안내하게 됩니다.
    const strategy = createMultiSplitStrategy({
      rsiRule: {
        threshold: 40,
        locRatio: 70,
      },
    });
    const snapshot: MultiSplitIndicatorSnapshot = {
      currentPrice: 110,
      rsi: 30,
    };
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult(snapshot),
    );
    const portfolio = createPortfolio({
      dailyBuyAmount: 200,
      trades: [createTrade({ price: 100, quantity: 10, fee: 0 })],
      strategy: {
        ma0: {
          stock: strategy.targetStock,
          rsiEnabled: true,
          alignmentEnabled: false,
          maAPeriod: 5,
          maBPeriod: 20,
        },
        ma1: { stock: strategy.targetStock },
        ma2: { stock: strategy.targetStock, splitCount: 1 },
        ma3: { stock: strategy.targetStock },
        multiSplit: strategy,
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
      expect(result.current.status).toBe('ready');
      expect(result.current.executionData).not.toBeNull();
    });

    const expected = calculateMultiSplitGuideState({
      trades: toTradeInputsForMultiSplit(portfolio.trades),
      strategy,
      oneTimeAmount: portfolio.dailyBuyAmount,
      feeRate: portfolio.feeRate ?? 0.25,
      snapshot,
    });

    expect(result.current.executionData).toEqual(expected);
  });

  it('프론트 요약과 서버 요약은 Smart Split shared line builder와 완전히 동일하다', async () => {
    // Why: 대시보드와 Edge Function이 다른 문자열을 만들면 같은 포트폴리오에서 다른 주문을 안내하는 치명적 정합성 버그가 됩니다.
    const executionData: MultiSplitGuideState = {
      cashUsagePct: 50,
      totalInvested: 1000,
      totalSeed: 2000,
      remainingBudget: 1000,
      currentQuantity: 10,
      avgPrice: 100,
      isFirstBuy: false,
      isSeedExhausted: false,
      appliedLocRatioPct: 70,
      displayLocBuy: { price: 100, quantity: 7 },
      displayMocBuy: { quantity: 2 },
      sellGuide: {
        mainTakeProfitQty: 6,
        intermediateTakeProfitQty: 4,
        riskCutQty: 2,
      },
    };
    const portfolio = createPortfolio();

    const summaryLines = buildMultiSplitExecutionSummaryLines({
      lang: 'ko',
      execution: executionData,
    });
    const clientBlock = formatPortfolioDailyExecutionBlock(portfolio, 'ko', {
      multiSplitExecutionData: executionData,
    });
    const serverBlock = formatServerDailyExecutionBlock(portfolio, 'ko', {
      multiSplitExecutionData: executionData,
    });

    expect(summaryLines).toEqual([
      '현금 사용률: 50%',
      '평단가 매수 (LOC): $100.00 / 7주',
      '분할 매수 (MOC): 2주',
      '메인 익절: 6주',
      '중간 익절: 4주',
      '리스크 컷: 2주',
    ]);
    expect(clientBlock).toBe(serverBlock);
    expect(clientBlock).toContain('- 스마트 스플릿');
    expect(clientBlock).toContain('- 현금 사용률: 50%');
    expect(clientBlock).toContain('- 평단가 매수 (LOC): $100.00 / 7주');
    expect(clientBlock).toContain('- 분할 매수 (MOC): 2주');
    expect(clientBlock).toContain('- 메인 익절: 6주');
    expect(clientBlock).toContain('- 중간 익절: 4주');
    expect(clientBlock).toContain('- 리스크 컷: 2주');
  });
});
