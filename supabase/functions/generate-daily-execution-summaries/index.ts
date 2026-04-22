// 배포: supabase functions deploy generate-daily-execution-summaries --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEffectiveSubscriptionState } from "../../../server/src/services/paymentFulfillment.ts";
import type {
  IndicatorRequirements,
  NoStopIndicatorSnapshot,
  NoStopMovingAveragePeriod,
  Portfolio,
  PortfolioRow,
  Strategy,
  UserProfileRow,
} from "../_shared/types.ts";
import {
  calculateMaAlignmentNotMet,
  calculateMaRsiNotMet,
  collectMaPartialProfitLine,
  determineMaActiveSectionFromValues,
  formatPortfolioDailyExecutionBlock,
  getMaPeriods,
  type Lang,
} from "../_shared/maSummaryShared.ts";
import {
  calculateMultiSplitGuideState,
  collectIndicatorRequirements as collectMultiSplitIndicatorRequirements,
  type TradeInput,
} from "../_shared/multiSplitShared.ts";
import {
  buildSummaryIndicatorSnapshot,
  calcNoStopCurrentRound,
  calculateNoStopExecution,
  collectIndicatorRequirements as collectNoStopIndicatorRequirements,
  EMPTY_PRICE_HISTORY_ERROR,
  type NoStopMultiSplitExecutionData,
  type NoStopIndicatorMathPort,
} from "../_shared/noStopMultiSplitShared.ts";
import { roundMoney } from "../_shared/financialMath.ts";

interface Holdings {
  stock: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
}

interface StockHistory {
  prices: number[];
  dates: string[];
}

interface StockPriceRow {
  close: number | string | null;
  trade_date: string | null;
}

type PartialProfitStrategyConfig =
  | Strategy["ma1"]
  | Strategy["ma2"]
  | Strategy["ma3"];

const REQUIREMENT_AWARE_MA_PERIODS = [5, 20, 60, 120] as const;
const PORTFOLIO_USER_CHUNK = 200;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RSI_HISTORY_WINDOW = 15;
const MIN_HISTORY_WINDOW = 1;
const PRICE_ONLY_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: false,
  maPeriods: [],
};
const RSI_ONLY_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: true,
  maPeriods: [],
};

function getCurrentKSTDateString(): string {
  const nowUtc = new Date();
  const kstTime = new Date(nowUtc.getTime() + KST_OFFSET_MS);
  const year = kstTime.getUTCFullYear();
  const month = String(kstTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kstTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeLang(value?: string | null): Lang {
  return value === "en" ? "en" : "ko";
}

function shouldSendTelegram(profile: UserProfileRow | null): boolean {
  if (!profile) return false;
  const effective = getEffectiveSubscriptionState(profile);
  if (effective.tier !== "pro" && effective.tier !== "premium") return false;
  if (!effective.isActive || effective.isExpired) return false;
  if (profile.telegram_enabled !== true) return false;
  const chatId = profile.telegram_chat_id;
  if (!chatId || String(chatId).trim() === "") return false;
  return true;
}

function normalizeTickerSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeIndicatorRequirements(
  requirements: IndicatorRequirements,
): IndicatorRequirements {
  const normalizedPeriods = Array.from(
    new Set(
      requirements.maPeriods.filter((period) =>
        REQUIREMENT_AWARE_MA_PERIODS.includes(period)
      ),
    ),
  ).sort((left, right) => left - right);

  return {
    needsRsi: requirements.needsRsi === true,
    maPeriods: normalizedPeriods,
  };
}

function buildIndicatorRequirementCacheKey(args: {
  symbol: string;
  requirements: IndicatorRequirements;
}): string {
  const normalizedSymbol = normalizeTickerSymbol(args.symbol);
  const normalizedRequirements = normalizeIndicatorRequirements(
    args.requirements,
  );
  const serializedPeriods = normalizedRequirements.maPeriods.join(",");

  return `${normalizedSymbol}|rsi:${normalizedRequirements.needsRsi ? 1 : 0}|ma:${serializedPeriods}`;
}

function getRequiredHistoryCount(requirements: IndicatorRequirements): number {
  const minimumRsiWindow = requirements.needsRsi
    ? RSI_HISTORY_WINDOW
    : MIN_HISTORY_WINDOW;
  const maximumMaWindow = requirements.maPeriods.reduce(
    (currentMax, period) => (period > currentMax ? period : currentMax),
    MIN_HISTORY_WINDOW,
  );

  return Math.max(minimumRsiWindow, maximumMaWindow);
}

function isRequirementAwareMaPeriod(
  period: number,
): period is NoStopMovingAveragePeriod {
  return REQUIREMENT_AWARE_MA_PERIODS.includes(
    period as NoStopMovingAveragePeriod,
  );
}

function isEmptyPriceHistoryError(error: unknown): boolean {
  return error instanceof Error && error.message === EMPTY_PRICE_HISTORY_ERROR;
}

function toStockPriceRows(raw: unknown): StockPriceRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<StockPriceRow[]>((acc, row) => {
    if (typeof row === "object" && row !== null) {
      const data = row as Record<string, unknown>;
      acc.push({
        close:
          typeof data.close === "number" || typeof data.close === "string"
            ? data.close
            : null,
        trade_date:
          typeof data.trade_date === "string" ? String(data.trade_date) : null,
      });
    }
    return acc;
  }, []);
}

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row || !row.strategy) return null;
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: row.name ?? "",
    dailyBuyAmount: row.daily_buy_amount ?? 0,
    startDate: row.start_date ?? row.startDate ?? "",
    feeRate: row.fee_rate ?? 0,
    strategy: row.strategy,
    trades: Array.isArray(row.trades) ? row.trades : [],
    isClosed: row.is_closed ?? false,
    alarmconfig: row.alarm_config ?? row.alarmconfig ?? undefined,
    vrSnapshot: row.vr_snapshot ?? row.vrSnapshot ?? undefined,
  };
}

function calculateHoldings(portfolio: Portfolio): Holdings[] {
  const holdingsMap: Record<string, { quantity: number; totalCost: number }> = {};

  portfolio.trades.forEach((trade) => {
    if (trade.type === "buy") {
      if (!holdingsMap[trade.stock]) {
        holdingsMap[trade.stock] = { quantity: 0, totalCost: 0 };
      }
      holdingsMap[trade.stock].quantity += trade.quantity;
      holdingsMap[trade.stock].totalCost += trade.price * trade.quantity + trade.fee;
    } else if (trade.type === "sell") {
      if (holdingsMap[trade.stock]) {
        holdingsMap[trade.stock].quantity -= trade.quantity;
        const avgPrice = holdingsMap[trade.stock].totalCost /
          (holdingsMap[trade.stock].quantity + trade.quantity);
        holdingsMap[trade.stock].totalCost =
          holdingsMap[trade.stock].quantity * avgPrice;
      }
    }
  });

  return Object.entries(holdingsMap)
    .filter(([_, data]) => data.quantity > 0)
    .map(([stock, data]) => ({
      stock,
      quantity: data.quantity,
      totalCost: data.totalCost,
      avgPrice: data.totalCost / data.quantity,
    }));
}

function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const recentPrices = prices.slice(-period);
  const rawAverage =
    recentPrices.reduce((sum, price) => sum + price, 0) / period;
  return roundMoney(rawAverage);
}

function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const currentChange = changes[i];
    const currentGain = currentChange > 0 ? currentChange : 0;
    const currentLoss = currentChange < 0 ? Math.abs(currentChange) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rawRsi = 100 - (100 / (1 + rs));
  const boundedRsi = Math.max(0, Math.min(100, rawRsi));
  return roundMoney(boundedRsi);
}

async function getStockHistory(
  supabase: ReturnType<typeof createClient>,
  cache: Map<string, StockHistory>,
  symbol: string,
  limit: number,
): Promise<StockHistory> {
  const key = normalizeTickerSymbol(symbol);
  const cached = cache.get(key);
  if (cached && cached.prices.length >= limit) {
    return cached;
  }

  const { data, error } = await supabase
    .from("stock_prices")
    .select("close, trade_date")
    .eq("symbol", key)
    .order("trade_date", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    const empty = { prices: [], dates: [] };
    cache.set(key, empty);
    return empty;
  }

  const rows = toStockPriceRows([...data].reverse());
  const prices = rows
    .map((row) => Number(row.close ?? 0))
    .filter((price) => price > 0);
  const dates = rows
    .map((row) => String(row.trade_date ?? ""))
    .filter(Boolean);
  const history = { prices, dates };
  cache.set(key, history);
  return history;
}

async function getStockSnapshot(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, NoStopIndicatorSnapshot>,
  symbol: string,
  requirements: IndicatorRequirements = PRICE_ONLY_REQUIREMENTS,
): Promise<NoStopIndicatorSnapshot> {
  const normalizedSymbol = normalizeTickerSymbol(symbol);
  const normalizedRequirements = normalizeIndicatorRequirements(requirements);
  const cacheKey = buildIndicatorRequirementCacheKey({
    symbol: normalizedSymbol,
    requirements: normalizedRequirements,
  });
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const history = await getStockHistory(
    supabase,
    historyCache,
    normalizedSymbol,
    getRequiredHistoryCount(normalizedRequirements),
  );
  const sharedMath: NoStopIndicatorMathPort = {
    calculateMA: (prices, period) => calculateMA(prices, period),
    calculateRSI: (prices) => calculateRSI(prices),
  };
  const snapshot = buildSummaryIndicatorSnapshot({
    prices: history.prices,
    requirements: normalizedRequirements,
    sharedMath,
  });
  snapshotCache.set(cacheKey, snapshot);
  return snapshot;
}

function computeMAFromHistory(history: number[], period: number): number {
  if (!history.length || period < 1) return 0;
  return calculateMA(history, period);
}

async function getMAForBaseStock(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, NoStopIndicatorSnapshot>,
  symbol: string,
  period: number,
): Promise<number> {
  if (isRequirementAwareMaPeriod(period)) {
    const snapshot = await getStockSnapshot(
      supabase,
      historyCache,
      snapshotCache,
      symbol,
      {
        needsRsi: false,
        maPeriods: [period],
      },
    );
    const maValue = snapshot.maByPeriod?.[period];
    if (typeof maValue === "number" && Number.isFinite(maValue) && maValue > 0) {
      return maValue;
    }
  }

  const history = await getStockHistory(
    supabase,
    historyCache,
    symbol,
    Math.max(period + 30, 120),
  );
  if (history.prices.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  return computeMAFromHistory(history.prices, period);
}

async function getMAValuesForAlignment(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, NoStopIndicatorSnapshot>,
  portfolio: Portfolio,
): Promise<{ maA: number; maB: number }> {
  const ma0Stock = portfolio.strategy.ma0.stock;
  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maA = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maAPeriod);
  const maB = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maBPeriod);
  return { maA, maB };
}

async function determineActiveSection(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, NoStopIndicatorSnapshot>,
  portfolio: Portfolio,
): Promise<1 | 2 | 3 | null> {
  const ma0Stock = portfolio.strategy.ma0.stock;
  const snapshot = await getStockSnapshot(
    supabase,
    historyCache,
    snapshotCache,
    ma0Stock,
  );
  const ma0Price = snapshot.currentPrice;
  if (!ma0Price) return null;

  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maA = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maAPeriod);
  const maB = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maBPeriod);

  return determineMaActiveSectionFromValues(ma0Price, maA, maB);
}

function toMultiSplitTradeInputs(trades: Portfolio["trades"]): TradeInput[] {
  return trades.map((trade) => ({
    type: trade.type,
    stock: trade.stock,
    date: trade.date,
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    ...(trade.isMOC !== undefined ? { isMOC: trade.isMOC } : {}),
  }));
}

function joinDailyExecutionBlocks(blocks: string[]): string {
  const filtered = blocks.filter(Boolean);
  if (filtered.length === 0) return "";
  return filtered.join("\n\n");
}

async function buildPortfolioBlock(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, NoStopIndicatorSnapshot>,
  portfolio: Portfolio,
  lang: Lang,
): Promise<string | null> {
  const alarm = portfolio.alarmconfig;
  if (!alarm?.enabled) return null;
  if (!Array.isArray(alarm.selectedHours) || alarm.selectedHours.length === 0) return null;

  try {
    if (portfolio.strategy.vrBand) {
      const snapshot = portfolio.vrSnapshot;
      let vrMaxBuyStep = 0;
      if (snapshot?.buyOrders && Array.isArray(snapshot.buyOrders)) {
        snapshot.buyOrders
          .filter((o) => !o.isBuffer)
          .forEach((o) => {
            if (typeof o.step === "number" && o.step > vrMaxBuyStep) {
              vrMaxBuyStep = o.step;
            }
          });
      }

      return formatPortfolioDailyExecutionBlock(portfolio, lang, {
        vrMaxBuyStep,
      });
    }

    if (portfolio.strategy.multiSplit) {
      const strategy = portfolio.strategy.multiSplit;
      const requirements = collectMultiSplitIndicatorRequirements(strategy);
      const indicatorSnapshot = await getStockSnapshot(
        supabase,
        historyCache,
        snapshotCache,
        strategy.targetStock,
        requirements,
      );
      const multiSplitExecutionData = calculateMultiSplitGuideState({
        trades: toMultiSplitTradeInputs(portfolio.trades),
        oneTimeAmount: portfolio.dailyBuyAmount,
        feeRate: portfolio.feeRate ?? 0.25,
        strategy,
        snapshot: indicatorSnapshot,
      });

      return formatPortfolioDailyExecutionBlock(portfolio, lang, {
        multiSplitExecutionData,
      });
    }

    if (portfolio.strategy.noStopMultiSplit) {
      const strategy = portfolio.strategy.noStopMultiSplit;
      const requirements = collectNoStopIndicatorRequirements(strategy);
      const indicatorSnapshot = await getStockSnapshot(
        supabase,
        historyCache,
        snapshotCache,
        strategy.targetStock,
        requirements,
      );
      const trades = toMultiSplitTradeInputs(portfolio.trades);
      const currentRound = calcNoStopCurrentRound(
        trades,
        portfolio.dailyBuyAmount,
        strategy.targetStock,
      );
      const execution = calculateNoStopExecution({
        trades,
        oneTimeAmount: portfolio.dailyBuyAmount,
        feeRate: portfolio.feeRate ?? 0.25,
        snapshot: indicatorSnapshot,
        strategy,
      });
      const noStopExecutionData: NoStopMultiSplitExecutionData = {
        currentRound,
        progressPct: execution.progressPct,
        isFirstBuy: execution.isFirstBuy,
        isSplitComplete: execution.isSplitComplete,
        displayLowLoc: execution.displayLowLoc,
        displayMocBuy: execution.displayMocBuy,
        takeProfit: execution.takeProfit,
      };

      return formatPortfolioDailyExecutionBlock(portfolio, lang, {
        noStopMultiSplitExecutionData: noStopExecutionData,
      });
    }

    const section = await determineActiveSection(
      supabase,
      historyCache,
      snapshotCache,
      portfolio,
    );
    let maRsiNotMet = false;
    let maAlignmentNotMet = false;
    let maPartialProfitLines: {
      section: 1 | 2 | 3;
      stock: string;
      quantity: number;
    }[] = [];

    if (section === 1 || section === 2 || section === 3) {
      const ma0 = portfolio.strategy.ma0;
      const baseStock = ma0.stock;
      const baseSnapshot = await getStockSnapshot(
        supabase,
        historyCache,
        snapshotCache,
        baseStock,
        RSI_ONLY_REQUIREMENTS,
      );

      maRsiNotMet = calculateMaRsiNotMet({
        strategy: portfolio.strategy,
        section,
        currentRsi: baseSnapshot.rsi,
      });

      if (ma0.alignmentEnabled) {
        const { maA, maB } = await getMAValuesForAlignment(
          supabase,
          historyCache,
          snapshotCache,
          portfolio,
        );
        maAlignmentNotMet = calculateMaAlignmentNotMet({
          isAlignmentEnabled: ma0.alignmentEnabled,
          maA,
          maB,
        });
      }

      const holdings = calculateHoldings(portfolio);
      const lines: { section: 1 | 2 | 3; stock: string; quantity: number }[] = [];
      const checkPartial = async (
        sec: 1 | 2 | 3,
        config: PartialProfitStrategyConfig | undefined,
      ) => {
        if (
          !config?.takePartialProfit ||
          config.partialProfitTargetPct == null ||
          config.partialProfitTargetPct <= 0
        ) {
          return;
        }

        const priceSnapshot = await getStockSnapshot(
          supabase,
          historyCache,
          snapshotCache,
          config.stock,
        );
        const nextLine = collectMaPartialProfitLine({
          section: sec,
          config,
          holdings,
          prices: {
            [config.stock]: {
              price: priceSnapshot.currentPrice,
            },
          },
        });
        if (nextLine != null) {
          lines.push(nextLine);
        }
      };

      await checkPartial(1, portfolio.strategy.ma1);
      await checkPartial(2, portfolio.strategy.ma2);
      await checkPartial(3, portfolio.strategy.ma3);
      maPartialProfitLines = lines;
    }

    return formatPortfolioDailyExecutionBlock(portfolio, lang, {
      maActiveSection: section,
      maPartialProfitLines: maPartialProfitLines.length
        ? maPartialProfitLines
        : undefined,
      maRsiNotMet,
      maAlignmentNotMet,
    });
  } catch (error) {
    if (isEmptyPriceHistoryError(error)) {
      console.warn("Skipping daily execution summary due to empty price history", {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
      });
      return null;
    }

    throw error;
  }
}

async function fetchPortfoliosForUsers(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<PortfolioRow[]> {
  const results: PortfolioRow[] = [];
  for (let i = 0; i < userIds.length; i += PORTFOLIO_USER_CHUNK) {
    const chunk = userIds.slice(i, i + PORTFOLIO_USER_CHUNK);
    const { data, error } = await supabase
      .from("portfolios")
      .select("id, user_id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_closed, vr_snapshot")
      .in("user_id", chunk)
      .eq("is_closed", false);
    if (error) {
      console.error("Error fetching portfolios:", error);
      continue;
    }
    if (data && data.length > 0) {
      results.push(...(data as PortfolioRow[]));
    }
  }
  return results;
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalSecret = (Deno.env.get("INTERNAL_ALARM_SECRET") ?? Deno.env.get("internal_alarm_secret"))?.trim() || "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing server config" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (internalSecret) {
      const headerSecret = (_req.headers.get("X-Internal-Alarm-Secret") ??
        _req.headers.get("x-internal-alarm-secret"))?.trim() ?? "";
      if (headerSecret !== internalSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", code: 401 }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, subscription_tier, subscription_status, subscription_expires_at, pending_plan, pending_plan_effective_at, telegram_enabled, telegram_chat_id, preferred_language")
      .in("subscription_tier", ["pro", "premium"])
      .eq("telegram_enabled", true)
      .not("telegram_chat_id", "is", null);

    if (profileError) {
      console.error("Failed to fetch user_profiles:", profileError);
      return new Response(JSON.stringify({ error: "Failed to fetch user profiles" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const eligibleProfiles = (profiles ?? []).filter(
      (profile): profile is UserProfileRow & { id: string } =>
        shouldSendTelegram(profile) &&
        typeof profile.id === "string" &&
        profile.id.trim() !== "",
    );
    if (eligibleProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, users: 0, upserted: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userIds = eligibleProfiles.map((p) => p.id);
    const portfolioRows = await fetchPortfoliosForUsers(supabase, userIds);

    const portfoliosByUser = new Map<string, Portfolio[]>();
    for (const row of portfolioRows) {
      if (typeof row.user_id !== "string" || row.user_id.trim() === "") {
        continue;
      }

      const portfolio = mapPortfolioRow(row);
      if (!portfolio) continue;
      const userId = row.user_id;
      if (!portfoliosByUser.has(userId)) {
        portfoliosByUser.set(userId, []);
      }
      portfoliosByUser.get(userId)?.push(portfolio);
    }

    const historyCache = new Map<string, StockHistory>();
    const snapshotCache = new Map<string, NoStopIndicatorSnapshot>();
    const summaryDate = getCurrentKSTDateString();
    const upsertRows: Array<{ user_id: string; summary_date: string; summary_text: string; lang: Lang; updated_at: string }> = [];

    for (const profile of eligibleProfiles) {
      const userPortfolios = portfoliosByUser.get(profile.id) ?? [];
      if (userPortfolios.length === 0) continue;
      const lang = normalizeLang(profile.preferred_language);

      const blocks: string[] = [];
      for (const portfolio of userPortfolios) {
        let block: string | null = null;
        try {
          block = await buildPortfolioBlock(
            supabase,
            historyCache,
            snapshotCache,
            portfolio,
            lang,
          );
        } catch (error) {
          console.error("Failed to build daily execution block:", {
            userId: profile.id,
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            error,
          });
        }
        if (block) blocks.push(block);
      }

      const summary = joinDailyExecutionBlocks(blocks);
      if (!summary || summary.trim().length === 0) continue;

      upsertRows.push({
        user_id: profile.id,
        summary_date: summaryDate,
        summary_text: summary,
        lang,
        updated_at: new Date().toISOString(),
      });
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("daily_execution_summaries")
        .upsert(upsertRows, { onConflict: "user_id,summary_date" });

      if (upsertError) {
        console.error("daily_execution_summaries upsert error:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to upsert summaries" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      users: eligibleProfiles.length,
      upserted: upsertRows.length,
      summary_date: summaryDate,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in generate-daily-execution-summaries:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
