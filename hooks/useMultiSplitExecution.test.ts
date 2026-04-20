import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio, StockData, Trade } from '../types';
import type { ServiceResult } from '../services/serviceUtils';
import { okResult } from '../services/serviceUtils';
import {
  calcMultiSplitOrders,
  calcQuarterStopLossOrders,
  type MultiSplitExecutionResult,
  type MultiSplitParams,
  type QuarterStopLossResult,
} from '../utils/multiSplitCalc';
import { DEFAULT_PORTFOLIO_FEE_RATE } from './multiSplitExecutionShared';
import { useMultiSplitExecution } from './useMultiSplitExecution';

vi.mock('../services/stockService', () => ({
  fetchLatestStockSnapshot: vi.fn(),
  getRecentTradingDaysFromDbSafe: vi.fn(),
}));

vi.mock('../components/tds-adapter/showErrorToast', () => ({
  showErrorToast: vi.fn(),
}));

import {
  fetchLatestStockSnapshot,
  getRecentTradingDaysFromDbSafe,
} from '../services/stockService';

type HookProps = {
  portfolio: Portfolio;
  lang: 'ko' | 'en';
};

const MOCK_CURRENT_PRICE = 100;
const MOCK_RECENT_TRADING_DAYS = ['2026-01-10', '2026-01-09', '2026-01-08'];

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
    totalSplitCount: overrides.totalSplitCount ?? 4,
  };
}

function createPortfolio(
  overrides: Partial<Portfolio> = {},
): Portfolio {
  const multiSplit = createMultiSplitParams();

  return {
    id: overrides.id ?? 'portfolio-1',
    name: overrides.name ?? 'multi split portfolio',
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
    isQuarterMode: overrides.isQuarterMode ?? false,
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

async function waitForExecutionData(): Promise<void> {
  await waitFor(() => {
    expect(fetchLatestStockSnapshot).toHaveBeenCalled();
    expect(getRecentTradingDaysFromDbSafe).toHaveBeenCalled();
  });
}

describe('useMultiSplitExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestStockSnapshot).mockResolvedValue(
      createQuoteResult(MOCK_CURRENT_PRICE),
    );
    vi.mocked(getRecentTradingDaysFromDbSafe).mockResolvedValue(
      createRecentDaysResult(MOCK_RECENT_TRADING_DAYS),
    );
  });

  it('T 값 변화에 따라 multiSplitPhase가 first -> second -> quarter로 정확히 전환된다', async () => {
    // Why: 회차 판정이 어긋나면 전반/후반/쿼터 주문 전략이 완전히 다른 브랜치로 흘러 금융 의사결정이 뒤집힙니다.
    const firstPortfolio = createPortfolio({
      trades: [createTrade({ price: 100, quantity: 1 })],
    });
    const secondPortfolio = createPortfolio({
      trades: [createTrade({ price: 100, quantity: 2 })],
    });
    const quarterPortfolio = createPortfolio({
      trades: [createTrade({ price: 350, quantity: 1 })],
    });

    const { result, rerender } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
      {
        initialProps: {
          portfolio: firstPortfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.multiSplitExecutionData).not.toBeNull();
    });
    expect(result.current.currentRound).toBe(1);
    expect(result.current.multiSplitPhase).toBe('first');

    rerender({
      portfolio: secondPortfolio,
      lang: 'ko',
    });

    await waitForExecutionData();
    expect(result.current.currentRound).toBe(2);
    expect(result.current.multiSplitPhase).toBe('second');
    expect(result.current.multiSplitExecutionData?.phase).toBe('second');

    rerender({
      portfolio: quarterPortfolio,
      lang: 'ko',
    });

    await waitForExecutionData();
    expect(result.current.currentRound).toBe(3.5);
    expect(result.current.multiSplitPhase).toBe('quarter');
    expect(result.current.isInQuarterModeByT).toBe(true);
    expect(result.current.multiSplitExecutionData).toBeNull();
  });

  it('isQuarterMode가 true이면 quarterStopLossData만 계산되고 일반 multiSplitExecutionData와 충돌하지 않는다', async () => {
    // Why: 쿼터 손절 모드와 일반 다분할 주문이 동시에 살아 있으면 UI가 어떤 주문을 따라야 하는지 결정할 수 없습니다.
    const portfolio = createPortfolio({
      isQuarterMode: true,
      trades: [
        createTrade({
          id: 'buy-1',
          type: 'buy',
          date: '2026-01-01',
          price: 100,
          quantity: 4,
          fee: 0,
        }),
        createTrade({
          id: 'moc-sell-1',
          type: 'sell',
          date: '2026-01-10',
          price: 90,
          quantity: 1,
          fee: 0,
          isMOC: true,
        }),
      ],
    });

    const { result } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
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

    expect(result.current.isInQuarterMode).toBe(true);
    expect(result.current.quarterStopLossData?.hasMOC).toBe(true);
    expect(result.current.multiSplitExecutionData).toBeNull();
  });

  it('portfolio.feeRate가 없으면 DEFAULT_PORTFOLIO_FEE_RATE로 안전하게 폴백한다', async () => {
    // Why: 레거시/불완전 데이터에서 수수료율이 비어 있어도 훅이 NaN으로 무너지지 않고 제품 기본값으로 계속 동작해야 합니다.
    const portfolio = createPortfolioWithoutFeeRate({
      trades: [createTrade({ price: 100, quantity: 2, fee: 0 })],
    });

    const { result } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
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

    const expected = calcMultiSplitOrders({
      phase: 'second',
      A: 10,
      a: 4,
      T: 2,
      basePrice: 100,
      currentQuantity: 2,
      oneTimeAmount: 100,
      feeRate: DEFAULT_PORTFOLIO_FEE_RATE,
    });

    expect(result.current.multiSplitExecutionData).toEqual(expected);
  });

  it('명시된 퍼센트 수수료율은 훅을 통과해 산술 함수로 왜곡 없이 그대로 전달된다', async () => {
    // Why: 훅 계층에서 feeRate 단위가 손실되면 산술 모듈 테스트가 모두 통과해도 실제 UI 주문은 잘못 생성됩니다.
    const explicitFeeRate = 0.75;
    const portfolio = createPortfolio({
      dailyBuyAmount: 100,
      feeRate: explicitFeeRate,
      trades: [createTrade({ price: 2, quantity: 100, fee: 0 })],
    });

    const { result } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
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

    const expectedWithExplicitFee: MultiSplitExecutionResult =
      calcMultiSplitOrders({
        phase: 'second',
        A: 10,
        a: 4,
        T: 2,
        basePrice: 2,
        currentQuantity: 100,
        oneTimeAmount: 100,
        feeRate: explicitFeeRate,
      });
    const expectedWithDefaultFee: MultiSplitExecutionResult =
      calcMultiSplitOrders({
        phase: 'second',
        A: 10,
        a: 4,
        T: 2,
        basePrice: 2,
        currentQuantity: 100,
        oneTimeAmount: 100,
        feeRate: DEFAULT_PORTFOLIO_FEE_RATE,
      });

    expect(result.current.multiSplitExecutionData).toEqual(expectedWithExplicitFee);
    expect(result.current.multiSplitExecutionData).not.toEqual(expectedWithDefaultFee);
  });

  it('동일한 입력으로 rerender되면 multiSplitExecutionData와 quarterStopLossData의 참조 동일성을 유지한다', async () => {
    // Why: 의존성이 안 바뀌었는데도 새 객체를 계속 만들면 카드 하위 컴포넌트가 연쇄 리렌더링되어 성능과 추적성이 악화됩니다.
    const portfolio = createPortfolio({
      isQuarterMode: true,
      trades: [
        createTrade({
          id: 'buy-1',
          type: 'buy',
          date: '2026-01-01',
          price: 100,
          quantity: 4,
          fee: 0,
        }),
        createTrade({
          id: 'moc-sell-1',
          type: 'sell',
          date: '2026-01-10',
          price: 90,
          quantity: 1,
          fee: 0,
          isMOC: true,
        }),
      ],
    });

    const { result, rerender } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
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

    const previousQuarterStopLossData = result.current.quarterStopLossData;
    const previousMultiSplitExecutionData = result.current.multiSplitExecutionData;

    rerender({
      portfolio,
      lang: 'ko',
    });

    expect(result.current.quarterStopLossData).toBe(previousQuarterStopLossData);
    expect(result.current.multiSplitExecutionData).toBe(previousMultiSplitExecutionData);
  });

  it('dailyBuyAmount가 currentPrice보다 작으면 multiSplitInsufficientAmount를 true로 반환한다', async () => {
    // Why: 1회 매수금 부족 경고가 빠지면 사용자는 주문이 왜 0주인지 알 수 없어 잘못된 전략 설정을 계속 유지하게 됩니다.
    const portfolio = createPortfolio({
      dailyBuyAmount: 50,
      trades: [createTrade({ price: 100, quantity: 1, fee: 0 })],
    });

    const { result } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
      {
        initialProps: {
          portfolio,
          lang: 'ko',
        },
      },
    );

    await waitFor(() => {
      expect(result.current.multiSplitInsufficientAmount).toBe(true);
    });

    expect(result.current.multiSplitInsufficientAmount).toBe(true);
  });

  it('쿼터 모드 데이터는 산술 모듈의 실제 계산 결과와 동일하게 훅을 관통한다', async () => {
    // Why: 훅이 쿼터 입력을 변형하면 순수 함수 테스트와 실제 화면 동작 사이에 분기 불일치가 생깁니다.
    const trades = [
      createTrade({
        id: 'buy-1',
        type: 'buy',
        date: '2026-01-01',
        price: 100,
        quantity: 4,
        fee: 0,
      }),
      createTrade({
        id: 'moc-sell-1',
        type: 'sell',
        date: '2026-01-10',
        price: 90,
        quantity: 1,
        fee: 0,
        isMOC: true,
      }),
    ];
    const portfolio = createPortfolio({
      isQuarterMode: true,
      trades,
    });

    const { result } = renderHook(
      ({ portfolio, lang }: HookProps) =>
        useMultiSplitExecution(portfolio, lang),
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

    const expectedQuarterData: QuarterStopLossResult | null =
      calcQuarterStopLossOrders({
        trades: trades.map((trade) => ({
          type: trade.type,
          stock: trade.stock,
          date: trade.date,
          price: trade.price,
          quantity: trade.quantity,
          fee: trade.fee,
          ...(trade.isMOC !== undefined ? { isMOC: trade.isMOC } : {}),
        })),
        dailyBuyAmount: 100,
        multiSplit: createMultiSplitParams(),
        feeRate: 0.25,
        recentTradingDays: MOCK_RECENT_TRADING_DAYS,
        avgPrice: 100,
        currentQuantity: 3,
      });

    expect(result.current.quarterStopLossData).toEqual(expectedQuarterData);
  });
});
