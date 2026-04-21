// 배포: supabase functions deploy generate-daily-execution-summaries --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEffectiveSubscriptionState } from "../../../server/src/services/paymentFulfillment.ts";
import type {
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
  calculateMultiSplitStrategyState,
  RECENT_TRADING_DAYS_COUNT,
  type MultiSplitExecutionResult,
  type QuarterStopLossResult,
  type TradeInput,
} from "../_shared/multiSplitShared.ts";
import {
  calculateNoStopMultiSplitState,
  type NoStopMultiSplitExecutionData,
} from "../_shared/noStopMultiSplitShared.ts";

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

interface StockSnapshot {
  price: number;
  rsi: number;
  ma20: number;
  ma60: number;
  ma120: number;
}

interface StockPriceRow {
  close: number | string | null;
  trade_date: string | null;
}

type PartialProfitStrategyConfig =
  | Strategy["ma1"]
  | Strategy["ma2"]
  | Strategy["ma3"];

type MultiSplitExecutionData = MultiSplitExecutionResult;
type QuarterStopLossData = QuarterStopLossResult;

const STANDARD_MA_PERIODS = [20, 60, 120];
const PORTFOLIO_USER_CHUNK = 200;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
    isQuarterMode: row.is_quarter_mode ?? false,
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
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
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
  return 100 - (100 / (1 + rs));
}

async function getStockHistory(
  supabase: ReturnType<typeof createClient>,
  cache: Map<string, StockHistory>,
  symbol: string,
  limit: number,
): Promise<StockHistory> {
  const key = symbol.trim().toUpperCase();
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
  snapshotCache: Map<string, StockSnapshot>,
  symbol: string,
): Promise<StockSnapshot> {
  const key = symbol.trim().toUpperCase();
  const cached = snapshotCache.get(key);
  if (cached) return cached;

  const history = await getStockHistory(supabase, historyCache, key, 240);
  const prices = history.prices;
  const latestPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
  const ma20 = calculateMA(prices, 20);
  const ma60 = calculateMA(prices, 60);
  const ma120 = calculateMA(prices, 120);
  const rsi = calculateRSI(prices);

  const snapshot = { price: latestPrice, rsi, ma20, ma60, ma120 };
  snapshotCache.set(key, snapshot);
  return snapshot;
}

function computeMAFromHistory(history: number[], period: number): number {
  if (!history.length || period < 1) return 0;
  return calculateMA(history, period);
}

async function getMAForBaseStock(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, StockSnapshot>,
  symbol: string,
  period: number,
): Promise<number> {
  const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, symbol);
  if (STANDARD_MA_PERIODS.includes(period)) {
    if (period === 20 && snapshot.ma20 > 0) return snapshot.ma20;
    if (period === 60 && snapshot.ma60 > 0) return snapshot.ma60;
    if (period === 120 && snapshot.ma120 > 0) return snapshot.ma120;
  }
  const history = await getStockHistory(
    supabase,
    historyCache,
    symbol,
    Math.max(period + 30, 120),
  );
  return computeMAFromHistory(history.prices, period);
}

async function getMAValuesForAlignment(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, StockSnapshot>,
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
  snapshotCache: Map<string, StockSnapshot>,
  portfolio: Portfolio,
): Promise<1 | 2 | 3 | null> {
  const ma0Stock = portfolio.strategy.ma0.stock;
  const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, ma0Stock);
  const ma0Price = snapshot.price;
  if (!ma0Price) return null;

  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maA = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maAPeriod);
  const maB = await getMAForBaseStock(supabase, historyCache, snapshotCache, ma0Stock, maBPeriod);

  return determineMaActiveSectionFromValues(ma0Price, maA, maB);
}

async function getRecentTradingDays(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  symbol: string,
  days: number,
): Promise<string[]> {
  const history = await getStockHistory(supabase, historyCache, symbol, days * 2);
  const sorted = [...history.dates].sort((a, b) => b.localeCompare(a));
  return sorted.slice(0, days);
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
  snapshotCache: Map<string, StockSnapshot>,
  portfolio: Portfolio,
  lang: Lang,
): Promise<string | null> {
  const alarm = portfolio.alarmconfig;
  if (!alarm?.enabled) return null;
  if (!Array.isArray(alarm.selectedHours) || alarm.selectedHours.length === 0) return null;

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
    const a = portfolio.strategy.multiSplit.totalSplitCount ?? 0;
    const targetStock = portfolio.strategy.multiSplit.targetStock;
    const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, targetStock);
    const recentTradingDays = await getRecentTradingDays(
      supabase,
      historyCache,
      targetStock,
      RECENT_TRADING_DAYS_COUNT,
    );
    const multiSplitState = calculateMultiSplitStrategyState({
      trades: toMultiSplitTradeInputs(portfolio.trades),
      dailyBuyAmount: portfolio.dailyBuyAmount,
      feeRate: portfolio.feeRate ?? 0.25,
      multiSplit: portfolio.strategy.multiSplit,
      isQuarterMode: portfolio.isQuarterMode === true,
      currentPrice: snapshot.price ?? 0,
      recentTradingDays,
    });
    const currentRound = multiSplitState.currentRound;
    const multiSplitPhase = multiSplitState.multiSplitPhase;
    const multiSplitOverLimit = a > 0 && currentRound > a;

    return formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitState.multiSplitExecutionData,
      quarterStopLossData: multiSplitState.quarterStopLossData,
      multiSplitPhase,
      isQuarterStopLossActive: portfolio.isQuarterMode === true,
      multiSplitOverLimit,
      multiSplitFirstRoundHint: currentRound >= 0 && currentRound < 0.5,
      multiSplitInsufficientAmount: multiSplitState.multiSplitInsufficientAmount,
    });
  }

  if (portfolio.strategy.noStopMultiSplit) {
    const snapshot = await getStockSnapshot(
      supabase,
      historyCache,
      snapshotCache,
      portfolio.strategy.noStopMultiSplit.targetStock,
    );
    const noStopState = calculateNoStopMultiSplitState({
      trades: toMultiSplitTradeInputs(portfolio.trades),
      oneTimeAmount: portfolio.dailyBuyAmount,
      feeRate: portfolio.feeRate ?? 0.25,
      currentPrice: snapshot.price ?? 0,
      strategy: portfolio.strategy.noStopMultiSplit,
    });

    return formatPortfolioDailyExecutionBlock(portfolio, lang, {
      noStopMultiSplitExecutionData: noStopState.executionData,
    });
  }

  const section = await determineActiveSection(supabase, historyCache, snapshotCache, portfolio);
  let maRsiNotMet = false;
  let maAlignmentNotMet = false;
  let maPartialProfitLines: { section: 1 | 2 | 3; stock: string; quantity: number }[] = [];

  if (section === 1 || section === 2 || section === 3) {
    const ma0 = portfolio.strategy.ma0;
    const baseStock = ma0.stock;
    const baseSnapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, baseStock);

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
      if (!config?.takePartialProfit || config.partialProfitTargetPct == null || config.partialProfitTargetPct <= 0) return;
      const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, config.stock);
      const nextLine = collectMaPartialProfitLine({
        section: sec,
        config,
        holdings,
        prices: {
          [config.stock]: {
            price: snapshot.price,
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
    maPartialProfitLines: maPartialProfitLines.length ? maPartialProfitLines : undefined,
    maRsiNotMet,
    maAlignmentNotMet,
  });
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
      .select("id, user_id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_quarter_mode, is_closed, vr_snapshot")
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
    const snapshotCache = new Map<string, StockSnapshot>();
    const summaryDate = getCurrentKSTDateString();
    const upsertRows: Array<{ user_id: string; summary_date: string; summary_text: string; lang: Lang; updated_at: string }> = [];

    for (const profile of eligibleProfiles) {
      const userPortfolios = portfoliosByUser.get(profile.id) ?? [];
      if (userPortfolios.length === 0) continue;
      const lang = normalizeLang(profile.preferred_language);

      const blocks: string[] = [];
      for (const portfolio of userPortfolios) {
        const block = await buildPortfolioBlock(supabase, historyCache, snapshotCache, portfolio, lang);
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
