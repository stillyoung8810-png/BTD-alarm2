import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { DASHBOARD_MESSAGES } from '../../constants/messages/dashboardMessages';
import {
  MULTI_SPLIT_EXECUTION_MESSAGE_IDS,
  buildMultiSplitExecutionSummaryLines,
  getMultiSplitExecutionMessages,
} from '../../supabase/functions/_shared/multiSplitExecutionMessages';
import {
  calculateMultiSplitGuideState,
  type MultiSplitGuideState,
  type TradeInput,
} from '../../supabase/functions/_shared/multiSplitShared';
import type { Portfolio, PortfolioRow, Trade } from '../../types';

const E2E_SUPABASE_URL = 'https://btd-e2e.supabase.local';
const E2E_USER_ID = '00000000-0000-4000-8000-000000000001';
const E2E_USER_EMAIL = 'smart-split-e2e@example.com';
const E2E_CURRENT_PRICE = 100;
const E2E_DEFAULT_DAILY_BUY_AMOUNT = 100;
const E2E_DEFAULT_FEE_RATE = 0;
const E2E_DEFAULT_TOTAL_SPLIT_COUNT = 5;
const E2E_DEFAULT_RISK_CUT_RATIO_PCT = 20;
const E2E_MAIN_TAKE_PROFIT_RATIO_PCT = 50;
const E2E_TARGET_RETURN_RATE = 20;
const E2E_INTERMEDIATE_RETURN_RATE = 5;
const E2E_PROFILE = {
  id: E2E_USER_ID,
  subscription_tier: 'premium',
  subscription_status: 'active',
  max_portfolios: 20,
  max_alarms: 20,
  preferred_language: 'ko',
  timezone: 'Asia/Seoul',
  ai_analysis_daily_usage: 0,
  backtest_daily_usage: 0,
  last_usage_reset_at: null,
};
const STOCK_PRICE_ROWS = [
  {
    symbol: 'TQQQ',
    close: E2E_CURRENT_PRICE,
    trade_date: '2026-04-27',
  },
  {
    symbol: 'TQQQ',
    close: E2E_CURRENT_PRICE,
    trade_date: '2026-04-24',
  },
];

type SmartSplitPortfolioOptions = {
  id: string;
  name: string;
  dailyBuyAmount?: number;
  trades: Trade[];
};

function buildSmartSplitPortfolio({
  id,
  name,
  dailyBuyAmount = E2E_DEFAULT_DAILY_BUY_AMOUNT,
  trades,
}: SmartSplitPortfolioOptions): Portfolio {
  return {
    id,
    name,
    dailyBuyAmount,
    startDate: '2026-01-01',
    feeRate: E2E_DEFAULT_FEE_RATE,
    strategy: {
      ma0: {
        stock: 'TQQQ',
        rsiEnabled: false,
        alignmentEnabled: false,
      },
      ma1: {
        stock: 'TQQQ',
      },
      ma2: {
        stock: 'TQQQ',
        splitCount: 1,
      },
      ma3: {
        stock: 'TQQQ',
      },
      multiSplit: {
        targetStock: 'TQQQ',
        targetReturnRate: E2E_TARGET_RETURN_RATE,
        intermediateReturnRate: E2E_INTERMEDIATE_RETURN_RATE,
        totalSplitCount: E2E_DEFAULT_TOTAL_SPLIT_COUNT,
        baseLocRatio: 50,
        mainTakeProfitRatioPct: E2E_MAIN_TAKE_PROFIT_RATIO_PCT,
        riskCutRatioPct: E2E_DEFAULT_RISK_CUT_RATIO_PCT,
      },
    },
    trades,
    isClosed: false,
    alarmconfig: {
      enabled: false,
      selectedHours: [],
      timezone: 'Asia/Seoul',
    },
  };
}

function createTrade(overrides: Partial<Trade> & Pick<Trade, 'id' | 'type'>): Trade {
  return {
    stock: 'TQQQ',
    date: '2026-01-01',
    price: 100,
    quantity: 1,
    fee: 0,
    ...overrides,
  };
}

function toPortfolioRow(portfolio: Portfolio): PortfolioRow {
  return {
    id: portfolio.id,
    user_id: E2E_USER_ID,
    name: portfolio.name,
    daily_buy_amount: portfolio.dailyBuyAmount,
    start_date: portfolio.startDate,
    fee_rate: portfolio.feeRate,
    is_closed: portfolio.isClosed,
    closed_at: portfolio.closedAt ?? null,
    final_sell_amount: portfolio.finalSellAmount ?? null,
    trades: portfolio.trades,
    strategy: portfolio.strategy,
    alarm_config: portfolio.alarmconfig ?? null,
    vr_snapshot: portfolio.vrSnapshot ?? null,
  };
}

function toTradeInput(trade: Trade): TradeInput {
  return {
    type: trade.type,
    stock: trade.stock,
    date: trade.date,
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    ...(trade.isMOC != null ? { isMOC: trade.isMOC } : {}),
  };
}

function getSmartSplitExecution(portfolio: Portfolio): MultiSplitGuideState {
  const strategy = portfolio.strategy.multiSplit;
  if (strategy == null) {
    throw new Error('Smart Split strategy is required for this E2E case.');
  }

  return calculateMultiSplitGuideState({
    trades: portfolio.trades.map(toTradeInput),
    strategy,
    oneTimeAmount: portfolio.dailyBuyAmount,
    feeRate: portfolio.feeRate,
    snapshot: {
      currentPrice: E2E_CURRENT_PRICE,
    },
  });
}

function buildExpectedSummaryLines(portfolio: Portfolio): string[] {
  return buildMultiSplitExecutionSummaryLines({
    lang: 'ko',
    execution: getSmartSplitExecution(portfolio),
  });
}

function findSummaryLineByLabel(
  lines: readonly string[],
  label: string,
): string {
  const matchedLine = lines.find((line) => line.includes(label));
  if (matchedLine == null) {
    throw new Error(`Expected summary line with label "${label}" was not built.`);
  }

  return matchedLine;
}

async function fulfillJson(
  route: Route,
  json: unknown,
  status: number = 200,
): Promise<void> {
  await route.fulfill({
    status,
    json,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    },
  });
}

async function installSupabaseRoutes(
  page: Page,
  portfolios: readonly Portfolio[],
): Promise<void> {
  await page.route(`${E2E_SUPABASE_URL}/auth/v1/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, {
      id: E2E_USER_ID,
      email: E2E_USER_EMAIL,
      role: 'authenticated',
      aud: 'authenticated',
    });
  });

  await page.route(`${E2E_SUPABASE_URL}/rest/v1/user_profiles**`, async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, E2E_PROFILE);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.route(`${E2E_SUPABASE_URL}/rest/v1/portfolios**`, async (route) => {
    await fulfillJson(route, portfolios.map(toPortfolioRow));
  });

  await page.route(`${E2E_SUPABASE_URL}/rest/v1/stock_prices**`, async (route) => {
    await fulfillJson(route, STOCK_PRICE_ROWS);
  });

  await page.route(
    `${E2E_SUPABASE_URL}/rest/v1/daily_execution_summaries**`,
    async (route) => {
      await fulfillJson(route, []);
    },
  );
}

async function installSignedInSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ userId, email }) => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
      const session = {
        access_token: 'btd-e2e-access-token',
        refresh_token: 'btd-e2e-refresh-token',
        token_type: 'bearer',
        expires_in: 60 * 60,
        expires_at: expiresAt,
        user: {
          id: userId,
          email,
          aud: 'authenticated',
          role: 'authenticated',
        },
      };

      window.localStorage.setItem('sb-auth-token', JSON.stringify(session));
      window.sessionStorage.setItem('sb-auth-token', JSON.stringify(session));
    },
    {
      userId: E2E_USER_ID,
      email: E2E_USER_EMAIL,
    },
  );
}

async function openDashboardWithPortfolio(
  page: Page,
  portfolio: Portfolio,
): Promise<Locator> {
  await installSupabaseRoutes(page, [portfolio]);
  await installSignedInSession(page);
  await page.goto('/');

  const executionButton = page.getByRole('button', {
    name: DASHBOARD_MESSAGES.ko.openExecutionAria(portfolio.name),
  });
  await expect(executionButton).toBeVisible();

  return executionButton;
}

test.describe('Smart Split daily execution QA', () => {
  test('TC-D1: 최신순 저장 거래도 날짜순 장부로 진행률과 평단가 매수 라인을 계산한다', async ({
    page,
  }) => {
    const portfolio = buildSmartSplitPortfolio({
      id: 'smart-split-d1',
      name: 'Smart Split D1',
      trades: [
        createTrade({
          id: 'sell-april',
          type: 'sell',
          date: '2026-04-01',
          price: 120,
          quantity: 3,
        }),
        createTrade({
          id: 'buy-january',
          type: 'buy',
          date: '2026-01-01',
          price: 100,
          quantity: 5,
        }),
      ],
    });
    const expectedLines = buildExpectedSummaryLines(portfolio);
    const executionButton = await openDashboardWithPortfolio(page, portfolio);
    const progressBar = executionButton.getByLabel(
      DASHBOARD_MESSAGES.ko.execution.multiSplitProgressBarAriaLabel,
    );

    await expect(executionButton).toContainText(expectedLines[0]);
    await expect(executionButton).toContainText(expectedLines[1]);
    await expect(progressBar).toHaveAttribute('style', /width:\s*40%;/);
  });

  test('TC-U1: 첫 매수 상태에서는 첫 매수 가이드만 노출하고 일반 주문 라인을 숨긴다', async ({
    page,
  }) => {
    const portfolio = buildSmartSplitPortfolio({
      id: 'smart-split-u1',
      name: 'Smart Split U1',
      trades: [],
    });
    const expectedLines = buildExpectedSummaryLines(portfolio);
    const messages = getMultiSplitExecutionMessages('ko');
    const executionButton = await openDashboardWithPortfolio(page, portfolio);

    await expect(executionButton).toContainText(expectedLines[1]);
    await expect(
      executionButton.getByText(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.locBuy]),
    ).toBeHidden();
    await expect(
      executionButton.getByText(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mocBuy]),
    ).toBeHidden();
    await expect(
      executionButton.getByText(
        messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mainTakeProfit],
      ),
    ).toBeHidden();
    await expect(
      executionButton.getByText(
        messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.intermediateTakeProfit],
      ),
    ).toBeHidden();
  });

  test('TC-U2: 매수금 부족 상태에서는 매수 라인을 숨기고 보유량 기반 손절 라인은 유지한다', async ({
    page,
  }) => {
    const portfolio = buildSmartSplitPortfolio({
      id: 'smart-split-u2',
      name: 'Smart Split U2',
      trades: [
        createTrade({
          id: 'buy-near-seed-limit',
          type: 'buy',
          date: '2026-01-01',
          price: 90,
          quantity: 5,
        }),
      ],
    });
    const expectedLines = buildExpectedSummaryLines(portfolio);
    const messages = getMultiSplitExecutionMessages('ko');
    const riskCutLine = findSummaryLineByLabel(
      expectedLines,
      messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.riskCut],
    );
    const executionButton = await openDashboardWithPortfolio(page, portfolio);

    await expect(executionButton).toContainText(expectedLines[1]);
    await expect(executionButton).toContainText(riskCutLine);
    await expect(
      executionButton.getByText(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.locBuy]),
    ).toBeHidden();
    await expect(
      executionButton.getByText(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mocBuy]),
    ).toBeHidden();
    await expect(
      executionButton.getByText(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.riskCut]),
    ).toBeVisible();
  });
});
