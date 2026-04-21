import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18N } from '../constants';
import {
  getDashboardMessages,
  type DashboardMessageSet,
} from '../constants/messages/dashboardMessages';
import type { Portfolio, Trade } from '../types';
import type { MultiSplitHookResult } from '../hooks/useMultiSplitExecution';
import type { NoStopMultiSplitHookResult } from '../hooks/useNoStopMultiSplitExecution';
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
        totalSplitCount: 4,
      },
    },
    trades: overrides.trades ?? [createTrade({ price: 100, quantity: 1 })],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig ?? { enabled: false, selectedHours: [] },
    isQuarterMode: overrides.isQuarterMode ?? false,
    vrSnapshot: overrides.vrSnapshot,
  };
}

function createDefaultMultiSplitHookResult(
  overrides: Partial<MultiSplitHookResult> = {},
): MultiSplitHookResult {
  return {
    currentRound: overrides.currentRound ?? 1,
    multiSplitPhase: overrides.multiSplitPhase ?? 'first',
    isInQuarterMode: overrides.isInQuarterMode ?? false,
    isInQuarterModeByT: overrides.isInQuarterModeByT ?? false,
    quarterStopLossData: overrides.quarterStopLossData ?? null,
    multiSplitExecutionData: overrides.multiSplitExecutionData ?? {
      phase: 'first',
      locBuy1: { price: 100, quantity: 1 },
      locBuy2: { price: 95, quantity: 1 },
    },
    multiSplitInsufficientAmount: overrides.multiSplitInsufficientAmount ?? false,
  };
}

function createDefaultNoStopHookResult(): NoStopMultiSplitHookResult {
  return {
    currentRound: 0,
    executionData: null,
  };
}

const KOREAN_COPY: DashboardMessageSet = getDashboardMessages('ko');
const DAILY_EXECUTION_LABEL = I18N.ko.dailyExecution;

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
      onUpdatePortfolio={vi.fn(async () => undefined)}
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

describe('Dashboard multi-split execution rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('전반전 0주 초기 상태에서도 매도 UI를 숨기지 않고 0주 fallback을 고정 렌더링한다', async () => {
    // Why: Phase나 보유 수량에 따라 매도 행이 사라지면 카드 높이가 흔들리고 사용자가 동일 위치에서 주문 타입을 인지하지 못하게 됩니다.
    await renderDashboardCard(
      createDefaultMultiSplitHookResult({
        currentRound: 1,
        multiSplitPhase: 'first',
        multiSplitExecutionData: {
          phase: 'first',
          locBuy1: { price: 100, quantity: 1 },
          locBuy2: { price: 95, quantity: 1 },
          locSell: { price: 105, quantity: 0 },
          limitSell: { price: 110, quantity: 0 },
        },
      }),
      {
        trades: [],
      },
    );
    const executionCard = getExecutionCard();
    const zeroSharesLabel = `0${KOREAN_COPY.execution.sharesUnit}`;

    expect(
      within(executionCard).getByText(KOREAN_COPY.execution.locBuy1, {
        selector: 'span',
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText(KOREAN_COPY.execution.locBuy2, {
        selector: 'span',
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText(KOREAN_COPY.execution.locSell, {
        selector: 'span',
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText(KOREAN_COPY.execution.limitSell, {
        selector: 'span',
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(within(executionCard).getByText('$105.00 / 0주')).toBeInTheDocument();
    expect(within(executionCard).getByText('$110.00 / 0주')).toBeInTheDocument();
  });
});
