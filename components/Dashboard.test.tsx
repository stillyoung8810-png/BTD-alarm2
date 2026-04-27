import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18N } from '../constants';
import {
  getDashboardMessages,
  type DashboardMessageSet,
} from '../constants/messages/dashboardMessages';
import type { Portfolio, StockData, Trade } from '../types';
import type { MultiSplitHookResult } from '../hooks/useMultiSplitExecution';
import type { NoStopMultiSplitHookResult } from '../hooks/useNoStopMultiSplitExecution';
import { determineActiveSection } from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import { DashboardPortfolioCardHost } from './Dashboard';

const mockUseMultiSplitExecution = vi.fn<
  (portfolio: Portfolio, lang: 'ko' | 'en') => MultiSplitHookResult
>();
const mockUseNoStopMultiSplitExecution = vi.fn<
  (portfolio: Portfolio, lang: 'ko' | 'en') => NoStopMultiSplitHookResult
>();
const mockBuildPortfolioMetricsSnapshot = vi.fn();

vi.mock('../hooks/useMultiSplitExecution', () => ({
  useMultiSplitExecution: (
    portfolio: Portfolio,
    lang: 'ko' | 'en',
  ): MultiSplitHookResult => mockUseMultiSplitExecution(portfolio, lang),
}));

vi.mock('../hooks/useNoStopMultiSplitExecution', () => ({
  useNoStopMultiSplitExecution: (
    portfolio: Portfolio,
    lang: 'ko' | 'en',
  ): NoStopMultiSplitHookResult => mockUseNoStopMultiSplitExecution(portfolio, lang),
}));

vi.mock('../hooks/useVrOrders', () => ({
  useVrOrders: () => ({
    safeBuyOrders: [],
    safeSellOrders: [],
  }),
}));

vi.mock('../contexts/TossAppContext', () => ({
  useTossApp: () => ({
    isInTossApp: false,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  }),
}));

vi.mock('../utils/portfolioCalculations', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/portfolioCalculations')>(
      '../utils/portfolioCalculations',
    );

  return {
    ...actual,
    buildPortfolioMetricsSnapshot: (...args: unknown[]) =>
      mockBuildPortfolioMetricsSnapshot(...args),
    determineActiveSection: vi.fn(async () => 1),
  };
});

vi.mock('../services/stockService', () => ({
  fetchStockPriceHistory: vi.fn(),
  fetchStockPrices: vi.fn(),
}));

vi.mock('./portfolio/PortfolioCardActions', () => ({
  default: (): React.ReactElement => <div data-testid="portfolio-card-actions" />,
}));

vi.mock('./StockLogo', () => ({
  default: ({ ticker }: { ticker: string }): React.ReactElement => (
    <div data-testid="stock-logo">{ticker}</div>
  ),
}));

vi.mock('./VrOrderModal', () => ({
  default: (): null => null,
}));

vi.mock('./VrPortfolioSummary', () => ({
  default: (): null => null,
}));

vi.mock('./tds-adapter/showErrorToast', () => ({
  showErrorToast: vi.fn(),
}));

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

function createPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: overrides.id ?? 'portfolio-1',
    name: overrides.name ?? 'Multi Split Portfolio',
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
      multiSplit: {
        targetStock: 'AAPL',
        targetReturnRate: 10,
        intermediateReturnRate: 5,
        totalSplitCount: 4,
        baseLocRatio: 50,
        mainTakeProfitRatioPct: 60,
        riskCutRatioPct: 20,
      },
    },
    trades: overrides.trades ?? [createTrade({ price: 100, quantity: 1 })],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig ?? { enabled: false, selectedHours: [] },
    vrSnapshot: overrides.vrSnapshot,
  };
}

function createDefaultMultiSplitHookResult(
  overrides: Partial<MultiSplitHookResult> = {},
): MultiSplitHookResult {
  const defaultExecutionData: NonNullable<MultiSplitHookResult['executionData']> =
    {
      cashUsagePct: 50,
      totalInvested: 1000,
      totalSeed: 2000,
      remainingBudget: 1000,
      currentQuantity: 10,
      avgPrice: 100,
      isFirstBuy: false,
      isDataError: false,
      isSeedExhausted: false,
      isLowBudget: false,
      appliedLocRatioPct: 70,
      displayLocBuy: { price: 100, quantity: 1 },
      displayMocBuy: { quantity: 0 },
      sellGuide: {
        mainTakeProfitQty: 6,
        intermediateTakeProfitQty: 4,
        riskCutQty: 2,
        displayMainTakeProfit: { price: 110, quantity: 6 },
        displayIntermediateTakeProfit: { price: 105, quantity: 4 },
      },
    };

  return {
    status: overrides.status ?? 'ready',
    executionData:
      'executionData' in overrides
        ? overrides.executionData ?? null
        : defaultExecutionData,
  };
}

function createDefaultNoStopHookResult(
  overrides: Partial<NoStopMultiSplitHookResult> = {},
): NoStopMultiSplitHookResult {
  return {
    currentRound: overrides.currentRound ?? 0,
    executionData:
      'executionData' in overrides
        ? overrides.executionData ?? null
        : null,
    status: overrides.status ?? 'idle',
  };
}

const KOREAN_COPY: DashboardMessageSet = getDashboardMessages('ko');
const DAILY_EXECUTION_LABEL = I18N.ko.dailyExecution;
const DEFAULT_MA_PRICE = 200;
const DEFAULT_MA20 = 150;
const DEFAULT_MA60 = 100;

async function renderDashboardCard(
  hookResult: MultiSplitHookResult,
  portfolioOverrides: Partial<Portfolio> = {},
): Promise<void> {
  mockUseMultiSplitExecution.mockReturnValue(hookResult);
  mockUseNoStopMultiSplitExecution.mockReturnValue(
    createDefaultNoStopHookResult(),
  );
  mockBuildPortfolioMetricsSnapshot.mockResolvedValue({
    currentValuation: 1000,
    investedAmount: 100,
    yieldRate: 10,
    realizedProfit: 0,
  });

  render(
    <DashboardPortfolioCardHost
      lang="ko"
      portfolio={createPortfolio(portfolioOverrides)}
      onClosePortfolio={vi.fn()}
      onDeletePortfolio={vi.fn()}
      onOpenAlarm={vi.fn()}
      onOpenDetails={vi.fn()}
      onOpenQuickInput={vi.fn()}
      onOpenExecution={vi.fn()}
      onOpenAIImage={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(
      screen.getByText(DAILY_EXECUTION_LABEL),
    ).toBeInTheDocument();
  });
}

async function renderNoStopDashboardCard(
  hookResult: NoStopMultiSplitHookResult,
): Promise<void> {
  mockUseMultiSplitExecution.mockReturnValue({
    status: 'idle',
    executionData: null,
  });
  mockUseNoStopMultiSplitExecution.mockReturnValue(hookResult);
  mockBuildPortfolioMetricsSnapshot.mockResolvedValue({
    currentValuation: 1000,
    investedAmount: 100,
    yieldRate: 10,
    realizedProfit: 0,
  });

  render(
    <DashboardPortfolioCardHost
      lang="ko"
      portfolio={createPortfolio({
        strategy: {
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
          noStopMultiSplit: {
            targetStock: 'AAPL',
            baseLocRatio: 50,
            takeProfitPct: 10,
            totalSplitCount: 4,
          },
        },
      })}
      onClosePortfolio={vi.fn()}
      onDeletePortfolio={vi.fn()}
      onOpenAlarm={vi.fn()}
      onOpenDetails={vi.fn()}
      onOpenQuickInput={vi.fn()}
      onOpenExecution={vi.fn()}
      onOpenAIImage={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(
      screen.getByText(DAILY_EXECUTION_LABEL),
    ).toBeInTheDocument();
  });
}

function getExecutionCard(): HTMLElement {
  return screen.getByRole('button', {
    name: KOREAN_COPY.openExecutionAria('Multi Split Portfolio'),
  });
}

function createStockData(
  symbol: string,
  overrides: Partial<StockData> = {},
): StockData {
  return {
    symbol,
    price: overrides.price ?? DEFAULT_MA_PRICE,
    change: overrides.change ?? 0,
    changePercent: overrides.changePercent ?? 0,
    rsi: overrides.rsi ?? 40,
    ma20: overrides.ma20 ?? DEFAULT_MA20,
    ma60: overrides.ma60 ?? DEFAULT_MA60,
    ma120: overrides.ma120 ?? 80,
  };
}

function createMaPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return createPortfolio({
    ...overrides,
    name: overrides.name ?? 'MA Portfolio',
    alarmconfig: overrides.alarmconfig ?? {
      enabled: true,
      selectedHours: ['09:00'],
    },
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'QQQ',
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 20,
        maBPeriod: 60,
      },
      ma1: { stock: 'QQQ', takePartialProfit: false },
      ma2: { stock: 'QLD', splitCount: 1, takePartialProfit: false },
      ma3: { stock: 'TQQQ', takePartialProfit: false },
    },
  });
}

function mockMaPriceMap(): void {
  vi.mocked(fetchStockPrices).mockResolvedValue({
    QQQ: createStockData('QQQ'),
    QLD: createStockData('QLD'),
    TQQQ: createStockData('TQQQ'),
  });
}

function renderMaDashboardCard(args: {
  portfolio?: Portfolio;
  onOpenQuickInput?: (portfolioId: string, activeSection?: 1 | 2 | 3) => void;
  onDailyExecutionBlock?: (portfolioId: string, block: string | null) => void;
} = {}) {
  mockUseMultiSplitExecution.mockReturnValue({
    status: 'idle',
    executionData: null,
  });
  mockUseNoStopMultiSplitExecution.mockReturnValue(
    createDefaultNoStopHookResult(),
  );
  mockBuildPortfolioMetricsSnapshot.mockResolvedValue({
    currentValuation: 1000,
    investedAmount: 100,
    yieldRate: 10,
    realizedProfit: 0,
  });
  mockMaPriceMap();

  const portfolio = args.portfolio ?? createMaPortfolio();
  const onOpenQuickInput = args.onOpenQuickInput ?? vi.fn();
  const onDailyExecutionBlock = args.onDailyExecutionBlock ?? vi.fn();

  return render(
    <DashboardPortfolioCardHost
      lang="ko"
      portfolio={portfolio}
      onClosePortfolio={vi.fn()}
      onDeletePortfolio={vi.fn()}
      onOpenAlarm={vi.fn()}
      onOpenDetails={vi.fn()}
      onOpenQuickInput={onOpenQuickInput}
      onOpenExecution={vi.fn()}
      onOpenAIImage={vi.fn()}
      onDailyExecutionBlock={onDailyExecutionBlock}
    />,
  );
}

describe('Dashboard multi-split execution rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Smart Split 현금 사용률 progress와 LOC/MOC/익절 가이드를 렌더링한다', async () => {
    // Why: Smart Split 카드가 구형 phase/T 표기를 계속 쓰면 새 순수 계산 레이어가 붙어도 사용자는 여전히 레거시 전략으로 오해하게 됩니다.
    await renderDashboardCard(
      createDefaultMultiSplitHookResult({
        executionData: {
          cashUsagePct: 50,
          totalInvested: 1000,
          totalSeed: 2000,
          remainingBudget: 1000,
          currentQuantity: 10,
          avgPrice: 100,
          isFirstBuy: false,
          isDataError: false,
          isSeedExhausted: false,
          isLowBudget: false,
          appliedLocRatioPct: 70,
          displayLocBuy: { price: 100, quantity: 1 },
          displayMocBuy: { quantity: 0 },
          sellGuide: {
            mainTakeProfitQty: 6,
            intermediateTakeProfitQty: 4,
            riskCutQty: 2,
            displayMainTakeProfit: { price: 110, quantity: 6 },
            displayIntermediateTakeProfit: { price: 105, quantity: 4 },
          },
        },
      }),
    );

    const executionCard = getExecutionCard();

    expect(
      within(executionCard).getByText('현금 사용률: 50%'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByLabelText(
        KOREAN_COPY.execution.multiSplitProgressBarAriaLabel,
      ),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('평단가 매수 (LOC): $100.00 / 1주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('분할 매수 (MOC): 0주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('메인 익절: $110.00 / 6주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('중간 익절: $105.00 / 4주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).queryByText('위험 관리 손절: 2주'),
    ).not.toBeInTheDocument();
    expect(within(executionCard).queryByText(/T = /)).not.toBeInTheDocument();
  });

  it('데이터 fetch 중에는 계산 중 문구만 노출한다', async () => {
    await renderDashboardCard(
      createDefaultMultiSplitHookResult({
        status: 'loading',
        executionData: null,
      }),
    );

    expect(
      within(getExecutionCard()).getByText(KOREAN_COPY.execution.calculating),
    ).toBeInTheDocument();
  });
});

describe('Dashboard no-stop execution rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('무손절 displayLowLoc 수량이 0이어도 DOM에 0주로 렌더링한다', async () => {
    await renderNoStopDashboardCard(
      createDefaultNoStopHookResult({
        currentRound: 2,
        status: 'ready',
        executionData: {
          currentRound: 2,
          progressPct: 12.5,
          appliedLocRatio: 50,
          isFirstBuy: false,
          isSplitComplete: false,
          displayLowLoc: { price: 100, quantity: 0 },
          displayMocBuy: { quantity: 0 },
          takeProfit: { price: 110, quantity: 3 },
        },
      }),
    );

    const executionCard = getExecutionCard();

    expect(
      within(executionCard).getByText('전략 진행률: 12.5%'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('평단가 매수 (LOC): $100.00 / 0주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('분할 매수 (MOC): 0주'),
    ).toBeInTheDocument();
    expect(within(executionCard).queryByText(/undefined/)).not.toBeInTheDocument();
  });
});

describe('Dashboard MA execution optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('부분익절을 쓰지 않는 MA 구간 종목은 가격 조회 대상에서 제외한다', async () => {
    renderMaDashboardCard();

    await waitFor(() => {
      expect(fetchStockPrices).toHaveBeenCalled();
    });

    const [symbols] = vi.mocked(fetchStockPrices).mock.calls[0];
    expect(symbols).toEqual(['QQQ']);
  });

  it('부분익절이 켜진 MA 구간 종목만 가격 조회 대상에 추가한다', async () => {
    const portfolio = createMaPortfolio({
      strategy: {
        ma0: {
          stock: 'QQQ',
          rsiEnabled: false,
          alignmentEnabled: false,
          maAPeriod: 20,
          maBPeriod: 60,
        },
        ma1: { stock: 'QQQ', takePartialProfit: false },
        ma2: {
          stock: 'QLD',
          splitCount: 1,
          takePartialProfit: true,
          partialProfitTargetPct: 5,
        },
        ma3: { stock: 'TQQQ', takePartialProfit: false },
      },
    });

    renderMaDashboardCard({ portfolio });

    await waitFor(() => {
      expect(fetchStockPrices).toHaveBeenCalled();
    });

    const [symbols] = vi.mocked(fetchStockPrices).mock.calls[0];
    expect(symbols).toEqual(['QQQ', 'QLD']);
  });

  it('빠른 입력은 이미 계산된 MA 구간을 재사용한다', async () => {
    const onOpenQuickInput = vi.fn();
    renderMaDashboardCard({ onOpenQuickInput });

    await waitFor(() => {
      expect(screen.getByText('구간 1: QQQ 매수')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: KOREAN_COPY.quickInputAria,
      }),
    );

    await waitFor(() => {
      expect(onOpenQuickInput).toHaveBeenCalledWith('portfolio-1', 1);
    });
    expect(determineActiveSection).not.toHaveBeenCalled();
  });

  it('동일한 MA 실행 블록이면 상위 콜백을 다시 호출하지 않는다', async () => {
    const onDailyExecutionBlock = vi.fn();
    const portfolio = createMaPortfolio();
    const { rerender } = renderMaDashboardCard({
      portfolio,
      onDailyExecutionBlock,
    });

    await waitFor(() => {
      expect(onDailyExecutionBlock).toHaveBeenCalledTimes(1);
    });

    vi.mocked(fetchStockPrices).mockClear();
    onDailyExecutionBlock.mockClear();
    rerender(
      <DashboardPortfolioCardHost
        lang="ko"
        portfolio={createMaPortfolio()}
        onClosePortfolio={vi.fn()}
        onDeletePortfolio={vi.fn()}
        onOpenAlarm={vi.fn()}
        onOpenDetails={vi.fn()}
        onOpenQuickInput={vi.fn()}
        onOpenExecution={vi.fn()}
        onOpenAIImage={vi.fn()}
        onDailyExecutionBlock={onDailyExecutionBlock}
      />,
    );

    await waitFor(() => {
      expect(fetchStockPrices).toHaveBeenCalledTimes(1);
    });
    expect(onDailyExecutionBlock).not.toHaveBeenCalled();
  });
});
