import React from 'react';
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
} from '../utils/multiSplitCalc';
import { useMultiSplitExecution } from './useMultiSplitExecution';
import {
  DEFAULT_PORTFOLIO_FEE_RATE,
  toTradeInputsForMultiSplit,
} from './multiSplitExecutionShared';

vi.mock('../services/stockService', () => ({
  buildIndicatorRequirementCacheKey: vi.fn(
    ({ symbol, requirements }: { symbol: string; requirements: { needsRsi: boolean; maPeriods: readonly number[] } }) =>
      `${symbol}|rsi:${requirements.needsRsi ? 1 : 0}|ma:${requirements.maPeriods.join(',')}`,
  ),
  fetchIndicatorAwareSnapshot: vi.fn(),
}));

vi.mock('../components/tds-adapter/showErrorToast', () => ({
  showErrorToast: vi.fn(),
}));

import { fetchIndicatorAwareSnapshot } from '../services/stockService';

type HookProps = {
  portfolio: Portfolio;
  lang: 'ko' | 'en';
};

function StrictModeWrapper(props: {
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(React.StrictMode, null, props.children);
}

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
    intermediateReturnRate: overrides.intermediateReturnRate ?? 5,
    totalSplitCount: overrides.totalSplitCount ?? 10,
    baseLocRatio: overrides.baseLocRatio ?? 50,
    mainTakeProfitRatioPct: overrides.mainTakeProfitRatioPct ?? 60,
    riskCutRatioPct: overrides.riskCutRatioPct ?? 20,
    rsiRule: overrides.rsiRule,
    alignmentRule: overrides.alignmentRule,
  };
}

function createPortfolio(
  overrides: Partial<Portfolio> = {},
): Portfolio {
  const multiSplit = createMultiSplitStrategy(
    overrides.strategy?.multiSplit ?? undefined,
  );

  return {
    id: overrides.id ?? 'portfolio-1',
    name: overrides.name ?? 'smart split portfolio',
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
    alarmconfig: overrides.alarmconfig,
    vrSnapshot: overrides.vrSnapshot,
  };
}

function createPortfolioWithoutFeeRate(
  overrides: Partial<Portfolio> = {},
): Portfolio {
  const withOptionalFeeRate: Omit<Portfolio, 'feeRate'> & { feeRate?: number } = {
    ...createPortfolio(overrides),
    feeRate: undefined,
  };

  return withOptionalFeeRate as Portfolio;
}

describe('useMultiSplitExecution', () => {
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

  it('React StrictMode 이중 effect에서도 단일 fetch/useMemo 구조로 정상 수렴한다', async () => {
    // Why: 첫 mount cleanup이 요청을 중단해도 두 번째 mount가 같은 cache key로 재시작하지 못하면 카드가 "계산 중..."에 영구 고착됩니다.
    const portfolio = createPortfolio({
      trades: [createTrade({ price: 100, quantity: 10, fee: 0 })],
    });

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
        wrapper: StrictModeWrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.executionData).not.toBeNull();
    });

    expect(fetchIndicatorAwareSnapshot).toHaveBeenCalled();
    expect(result.current.executionData?.cashUsagePct).toBe(100);
  });

  it('훅 출력은 동일 입력의 calculateMultiSplitGuideState 결과와 정확히 일치한다', async () => {
    // Why: 훅이 fetch 결과나 feeRate를 변형하면 순수 함수 레이어가 검증되어도 실제 화면 안내 수량은 다른 값이 됩니다.
    const explicitFeeRate = 0.75;
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
      feeRate: explicitFeeRate,
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
      feeRate: explicitFeeRate,
      snapshot,
    });

    expect(result.current.executionData).toEqual(expected);
  });

  it('dailyBuyAmount가 0이면 fetch를 시작하지 않고 invalid_amount로 종료한다', () => {
    const portfolio = createPortfolio({
      dailyBuyAmount: 0,
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

    expect(result.current.status).toBe('invalid_amount');
    expect(result.current.executionData).toBeNull();
    expect(fetchIndicatorAwareSnapshot).not.toHaveBeenCalled();
  });

  it('동일 입력으로 rerender되면 executionData 참조를 유지한다', async () => {
    // Why: snapshot과 전략이 같은데도 executionData 객체가 매 렌더마다 바뀌면 Dashboard progress/라인 블록이 불필요하게 재렌더링됩니다.
    const portfolio = createPortfolioWithoutFeeRate({
      trades: [createTrade({ price: 100, quantity: 10, fee: 0 })],
    });

    const { result, rerender } = renderHook(
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

    const previousExecutionData = result.current.executionData;
    const expected: MultiSplitGuideState = calculateMultiSplitGuideState({
      trades: toTradeInputsForMultiSplit(portfolio.trades),
      strategy: portfolio.strategy.multiSplit as MultiSplitStrategy,
      oneTimeAmount: portfolio.dailyBuyAmount,
      feeRate: DEFAULT_PORTFOLIO_FEE_RATE,
      snapshot: {
        currentPrice: 110,
        rsi: 30,
        maByPeriod: {
          5: 110,
          20: 100,
        },
      },
    });

    expect(previousExecutionData).toEqual(expected);

    rerender({
      portfolio,
      lang: 'ko',
    });

    expect(result.current.executionData).toBe(previousExecutionData);
  });
});
