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

  return {
    status: overrides.status ?? 'ready',
    executionData:
      'executionData' in overrides
        ? overrides.executionData ?? null
        : defaultExecutionData,
  };
}

function createDefaultNoStopHookResult(): NoStopMultiSplitHookResult {
  return {
    currentRound: 0,
    executionData: null,
    status: 'idle',
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
          isSeedExhausted: false,
          appliedLocRatioPct: 70,
          displayLocBuy: { price: 100, quantity: 7 },
          displayMocBuy: { quantity: 2 },
          sellGuide: {
            mainTakeProfitQty: 6,
            intermediateTakeProfitQty: 4,
            riskCutQty: 2,
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
      within(executionCard).getByText('평단가 매수 (LOC): $100.00 / 7주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('분할 매수 (MOC): 2주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('메인 익절: 6주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('중간 익절: 4주'),
    ).toBeInTheDocument();
    expect(
      within(executionCard).getByText('리스크 컷: 2주'),
    ).toBeInTheDocument();
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
