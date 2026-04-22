// Tech Debt Monitor: 무손절 다분할 프론트/서버 로직 동기화 감시
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NoStopIndicatorSnapshot,
  NoStopMultiSplitStrategy,
  Portfolio,
  Trade,
} from '../types';
import type { Portfolio as ServerPortfolio } from '../supabase/functions/_shared/types.ts';
import {
  calcNoStopCurrentRound,
  calculateNoStopExecution,
} from '../supabase/functions/_shared/noStopMultiSplitShared.ts';
import { formatPortfolioDailyExecutionBlock as formatFrontendDailyExecutionBlock } from './dailyExecutionSummary';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import { toTradeInputsForMultiSplit } from '../hooks/multiSplitExecutionShared';
import type { ServiceResult } from '../services/serviceUtils';
import { okResult } from '../services/serviceUtils';

vi.mock('../services/stockService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/stockService')>();
  return {
    ...actual,
    fetchIndicatorAwareSnapshot: vi.fn(),
  };
});

vi.mock('../components/tds-adapter/showErrorToast', () => ({
  showErrorToast: vi.fn(),
}));

import { fetchIndicatorAwareSnapshot } from '../services/stockService';

type CrossValidationPortfolio = Portfolio & ServerPortfolio;

type HookProps = {
  portfolio: CrossValidationPortfolio;
  lang: 'ko' | 'en';
};

function StrictModeWrapper(props: {
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(React.StrictMode, null, props.children);
}

function createSnapshotResult(
  snapshot: NoStopIndicatorSnapshot,
): ServiceResult<NoStopIndicatorSnapshot | null> {
  return okResult<NoStopIndicatorSnapshot | null>(snapshot);
}

function clonePortfolioWithSameNoStopConfig(
  portfolio: CrossValidationPortfolio,
): CrossValidationPortfolio {
  return createPortfolio({
    ...portfolio,
    strategy: {
      ...portfolio.strategy,
      ma0: { ...portfolio.strategy.ma0 },
      ma1: { ...portfolio.strategy.ma1 },
      ma2: { ...portfolio.strategy.ma2 },
      ma3: { ...portfolio.strategy.ma3 },
      noStopMultiSplit:
        portfolio.strategy.noStopMultiSplit == null
          ? undefined
          : { ...portfolio.strategy.noStopMultiSplit },
    },
    trades: portfolio.trades.map((trade) => ({ ...trade })),
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
  overrides: Partial<NoStopMultiSplitStrategy> = {},
): NoStopMultiSplitStrategy {
  return {
    targetStock: overrides.targetStock ?? 'TQQQ',
    baseLocRatio: overrides.baseLocRatio ?? 50,
    takeProfitPct: overrides.takeProfitPct ?? 10,
    totalSplitCount: overrides.totalSplitCount ?? 40,
    ...(overrides.rsiRule != null ? { rsiRule: overrides.rsiRule } : {}),
    ...(overrides.alignmentRule != null
      ? { alignmentRule: overrides.alignmentRule }
      : {}),
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

  const trades = toTradeInputsForMultiSplit(portfolio.trades);
  const oneTimeAmount = portfolio.dailyBuyAmount;
  const feeRate = portfolio.feeRate ?? 0.25;
  const currentRound = calcNoStopCurrentRound(
    trades,
    oneTimeAmount,
    strategy.targetStock,
  );
  const execution = calculateNoStopExecution({
    trades,
    oneTimeAmount,
    feeRate,
    snapshot: {
      currentPrice,
    },
    strategy,
  });

  return {
    currentRound,
    executionData: {
      currentRound,
      progressPct: execution.progressPct,
      appliedLocRatio: execution.appliedLocRatio,
      isFirstBuy: execution.isFirstBuy,
      isSplitComplete: execution.isSplitComplete,
      ...(execution.displayLowLoc != null
        ? { displayLowLoc: execution.displayLowLoc }
        : {}),
      ...(execution.displayMocBuy != null
        ? { displayMocBuy: execution.displayMocBuy }
        : {}),
      ...(execution.takeProfit != null ? { takeProfit: execution.takeProfit } : {}),
    },
  };
}

describe('no-stop multi-split split-brain cross validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('소수점 부동오차가 있는 회차 엣지 케이스에서도 프론트 훅과 서버 공용 엔진이 동일한 정수 회차를 반환한다', async () => {
    // Why: 회차 반올림 기준이 어긋나면 서버는 3.0000000000000004, 앱은 3처럼 표시되어 분할 완료 조건과 카드 표기가 갈라질 수 있습니다.
    const currentPrice = 0.1;
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult({ currentPrice }),
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
    expect(result.current.currentRound).toBe(serverState.currentRound);
    expect(result.current.executionData).toEqual(serverState.executionData);
  });

  it('floorSafe가 필요한 애매한 예산 상태에서도 프론트 훅과 서버 공용 엔진이 동일한 저가·고가 LOC와 익절 주문을 계산한다', async () => {
    // Why: isolated engine의 EPSILON floor와 15% MOC 버퍼가 훅 결과에 그대로 반영되어야 주문 수량 drift가 생기지 않습니다.
    const currentPrice = 100;
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult({ currentPrice }),
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
          baseLocRatio: 25,
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
    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      noStopMultiSplitExecutionData:
        result.current.executionData == null
          ? undefined
          : {
              currentRound: result.current.executionData.currentRound,
              progressPct: result.current.executionData.progressPct,
              isFirstBuy: result.current.executionData.isFirstBuy,
              isSplitComplete: result.current.executionData.isSplitComplete,
              displayLowLoc: result.current.executionData.displayLowLoc,
              displayMocBuy: result.current.executionData.displayMocBuy,
              takeProfit: result.current.executionData.takeProfit,
            },
    });

    expect(result.current.executionData).toEqual({
      currentRound: 0.25,
      progressPct: 0.63,
      appliedLocRatio: 25,
      isFirstBuy: false,
      isSplitComplete: false,
      displayLowLoc: { price: 100, quantity: 1 },
      displayMocBuy: { quantity: 2 },
      takeProfit: { price: 110, quantity: 1 },
    });
    expect(serverState.executionData).toEqual(result.current.executionData);
    expect(frontendSummary).toContain('전략 진행률: 0.63%');
    expect(frontendSummary).toContain('평단가 매수 (LOC): $100.00 / 1주');
    expect(frontendSummary).toContain('분할 매수 (MOC): 2주');
    expect(frontendSummary).not.toContain('저가 LOC');
    expect(frontendSummary).not.toContain('고가 LOC');
    expect(frontendSummary).not.toContain('분할 매수 (MOC): $100.00 / 2주');
  });

  it('보유 수량 0인 픽스처에서는 프론트와 서버 모두 동일하게 isFirstBuy로 판정하고 익절 라인을 숨긴다', async () => {
    // Why: 평단가가 없는 첫 매수 상태에서 한쪽만 익절 라인을 만들면 존재하지 않는 매도 계획을 사용자에게 노출하는 제품 오작동이 됩니다.
    const currentPrice = 40;
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult({ currentPrice }),
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

    const frontendSummary = formatFrontendDailyExecutionBlock(portfolio, 'ko', {
      noStopMultiSplitExecutionData:
        result.current.executionData == null
          ? undefined
          : {
              currentRound: result.current.executionData.currentRound,
              progressPct: result.current.executionData.progressPct,
              isFirstBuy: result.current.executionData.isFirstBuy,
              isSplitComplete: result.current.executionData.isSplitComplete,
              displayLowLoc: result.current.executionData.displayLowLoc,
              displayMocBuy: result.current.executionData.displayMocBuy,
              takeProfit: result.current.executionData.takeProfit,
            },
    });

    expect(result.current.executionData?.isFirstBuy).toBe(true);
    expect(result.current.executionData?.takeProfit).toBeUndefined();
    expect(frontendSummary).toContain('첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.');
    expect(frontendSummary).not.toContain('익절 목표');
  });

  it('일회 매수금이 0 이하면 no-stop 훅이 invalid_amount 상태를 반환하고 불필요한 fetch를 건너뛴다', async () => {
    const portfolio = createPortfolio({
      dailyBuyAmount: 0,
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
      expect(result.current.status).toBe('invalid_amount');
    });

    expect(result.current.executionData).toBeNull();
    expect(fetchIndicatorAwareSnapshot).not.toHaveBeenCalled();
  });

  it('스냅샷 fetch 실패 시 fetch_error 상태로 전환되어 계산 중 문구에 영구 고착되지 않는다', async () => {
    vi.mocked(fetchIndicatorAwareSnapshot).mockRejectedValue(
      new Error('network failed'),
    );
    const portfolio = createPortfolio();

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
      expect(result.current.status).toBe('fetch_error');
    });

    expect(result.current.executionData).toBeNull();
    expect(fetchIndicatorAwareSnapshot).toHaveBeenCalledTimes(1);
  });

  it('스냅샷 fetch가 멈춰도 타임아웃 후 fetch_error로 전환되어 영구 loading에 빠지지 않는다', async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(fetchIndicatorAwareSnapshot).mockImplementationOnce(
        async (_symbol, _requirements, options) =>
          new Promise<ServiceResult<NoStopIndicatorSnapshot | null>>(
            (_resolve, reject) => {
              options?.signal?.addEventListener(
                'abort',
                () => {
                  reject(new DOMException('The operation was aborted.', 'AbortError'));
                },
                { once: true },
              );
            },
          ),
      );
      const portfolio = createPortfolio();

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

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.status).toBe('loading');

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();
      });

      expect(result.current.status).toBe('fetch_error');
      expect(result.current.executionData).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('같은 cache key로 포트폴리오 객체만 새로 들어와도 진행 중인 스냅샷 fetch 결과를 정상 반영한다', async () => {
    let resolveSnapshotResult:
      | ((
          value: ServiceResult<NoStopIndicatorSnapshot | null>,
        ) => void)
      | undefined;
    const pendingSnapshotResult = new Promise<
      ServiceResult<NoStopIndicatorSnapshot | null>
    >((resolve) => {
      resolveSnapshotResult = resolve;
    });
    vi.mocked(fetchIndicatorAwareSnapshot).mockReturnValueOnce(
      pendingSnapshotResult,
    );
    const initialPortfolio = createPortfolio();

    const { result, rerender } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useNoStopMultiSplitExecution(hookPortfolio, lang),
      {
        initialProps: {
          portfolio: initialPortfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('loading');
    });

    rerender({
      portfolio: clonePortfolioWithSameNoStopConfig(initialPortfolio),
      lang: 'ko',
    });

    await act(async () => {
      resolveSnapshotResult?.(createSnapshotResult({ currentPrice: 100 }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.executionData).not.toBeNull();
    });

    expect(fetchIndicatorAwareSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.executionData?.currentRound).toBe(0);
  });

  it('React StrictMode 이중 effect 환경에서도 same cache key fetch가 ready 상태로 수렴한다', async () => {
    vi.mocked(fetchIndicatorAwareSnapshot).mockResolvedValue(
      createSnapshotResult({ currentPrice: 100 }),
    );
    const portfolio = createPortfolio();

    const { result } = renderHook(
      ({ portfolio: hookPortfolio, lang }: HookProps) =>
        useNoStopMultiSplitExecution(hookPortfolio, lang),
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
  });
});
