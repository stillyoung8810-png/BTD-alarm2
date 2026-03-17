// 배포: supabase functions deploy generate-daily-execution-summaries --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEffectiveSubscriptionState } from "../../../server/src/services/paymentFulfillment.ts";

type Lang = "ko" | "en";

interface AlarmConfig {
  enabled?: boolean;
  selectedHours?: string[];
  timezone?: string;
}

interface Strategy {
  ma0: {
    stock: string;
    rsiEnabled: boolean;
    alignmentEnabled?: boolean;
    maAPeriod?: number;
    maBPeriod?: number;
  };
  ma1: {
    stock: string;
    rsiThreshold?: number;
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  ma2: {
    stock: string;
    splitCount: number;
    rsiThreshold?: number;
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  ma3: {
    stock: string;
    rsiThreshold?: number;
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  multiSplit?: {
    targetStock: string;
    targetReturnRate: number;
    totalSplitCount: number;
  };
  noStopMultiSplit?: {
    targetStock: string;
    lowLocBudgetRatio: number;
    highLocPremiumPct: number;
    takeProfitPct: number;
    totalSplitCount: number;
  };
  vrBand?: any;
}

interface Trade {
  type: "buy" | "sell";
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean;
}

interface Portfolio {
  id: string;
  name: string;
  dailyBuyAmount: number;
  feeRate: number;
  strategy: Strategy;
  trades: Trade[];
  isClosed: boolean;
  alarmconfig?: AlarmConfig | null;
  isQuarterMode?: boolean;
  vrSnapshot?: {
    currentV: number;
    pool: number;
    bandLow: number;
    bandHigh: number;
    buyOrders?: { step: number; isBuffer?: boolean }[];
  } | null;
}

interface PortfolioRow {
  id: string;
  user_id: string;
  name: string | null;
  daily_buy_amount: number | null;
  fee_rate: number | null;
  strategy: Strategy | null;
  trades: Trade[] | null;
  alarm_config: AlarmConfig | null;
  is_quarter_mode: boolean | null;
  is_closed: boolean | null;
  vr_snapshot: Portfolio["vrSnapshot"] | null;
}

interface UserProfileRow {
  id: string;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean | null;
  telegram_chat_id?: string | null;
  preferred_language?: string | null;
}

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

interface MultiSplitExecutionData {
  phase: "first" | "second" | "quarter" | null;
  locBuy1?: { price: number; quantity: number };
  locBuy2?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
  mocSell?: { quantity: number };
}

interface QuarterStopLossData {
  hasMOC: boolean;
  mocQuantity?: number;
  newOneTimeAmount?: number;
  locBuy?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
}

interface NoStopMultiSplitExecutionData {
  currentRound: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: { price: number; quantity: number };
  highLoc?: { price: number; quantity: number };
  takeProfit?: { price: number; quantity: number };
}

const STANDARD_MA_PERIODS = [20, 60, 120];
const RECENT_TRADING_DAYS = 11;
const PORTFOLIO_USER_CHUNK = 200;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// --- 다분할 매매법 공용 상수 (utils/multiSplitCalc.ts 와 동일) ---
const LOC_SELL_RATIO = 0.25;
const QUARTER_LOC_PRICE_FACTOR = 0.9;
const LOC_PRICE_OFFSET = 0.01;
const QUARTER_SPLIT_COUNT = 10;
const FIRST_HALF_BUY_RATIO = 0.5;
const MIN_PRICE = 0.01;

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

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row || !row.strategy) return null;
  return {
    id: row.id,
    name: row.name ?? "",
    dailyBuyAmount: row.daily_buy_amount ?? 0,
    feeRate: row.fee_rate ?? 0,
    strategy: row.strategy,
    trades: Array.isArray(row.trades) ? row.trades : [],
    isClosed: row.is_closed ?? false,
    alarmconfig: row.alarm_config ?? null,
    isQuarterMode: row.is_quarter_mode ?? false,
    vrSnapshot: row.vr_snapshot ?? null,
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

  const rows = [...data].reverse();
  const prices = rows.map((row: any) => Number(row.close ?? 0)).filter((p) => p > 0);
  const dates = rows.map((row: any) => String(row.trade_date || "")).filter(Boolean);
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

function getMaPeriods(portfolio: Portfolio): { maAPeriod: number; maBPeriod: number } {
  const s = portfolio.strategy;
  const ma1 = s.ma1 as { period?: number };
  const ma2 = s.ma2 as { period1?: number; period2?: number };
  const ma3 = s.ma3 as { period?: number };
  return {
    maAPeriod: s.ma0.maAPeriod ?? ma1.period ?? 20,
    maBPeriod: s.ma0.maBPeriod ?? ma3.period ?? ma2.period2 ?? 60,
  };
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

  const hi = Math.max(maA, maB);
  const lo = Math.min(maA, maB);
  if (hi <= 0 || lo <= 0) return null;

  if (ma0Price > hi) return 1;
  if (ma0Price < lo) return 3;
  return 2;
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

// T 계산 (utils/multiSplitCalc.ts calcT 와 동일 로직)
function getCurrentRound(portfolio: Portfolio): number {
  if (!portfolio.strategy.multiSplit) return 0;
  const holdings = calculateHoldings(portfolio);
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const oneTimeAmount = portfolio.dailyBuyAmount;
  if (oneTimeAmount === 0) return 0;
  return Math.ceil((totalInvested / oneTimeAmount) * 100) / 100;
}

function getNoStopCurrentRound(portfolio: Portfolio): number {
  if (!portfolio.strategy.noStopMultiSplit) return 0;
  const holdings = calculateHoldings(portfolio);
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const oneTimeAmount = portfolio.dailyBuyAmount;
  if (oneTimeAmount <= 0) return 0;
  return totalInvested / oneTimeAmount;
}

function getMultiSplitPhase(
  portfolio: Portfolio,
  currentRound: number,
): "first" | "second" | "quarter" | null {
  if (!portfolio.strategy.multiSplit) return null;
  const a = portfolio.strategy.multiSplit.totalSplitCount;
  if (currentRound >= 0.5 && currentRound < a / 2) return "first";
  if (currentRound >= a / 2 && currentRound <= a - 1) return "second";
  // quarter: 쿼터모드 진입 구간. calculateMultiSplitExecutionData에서는 별도 처리하지 않고,
  // calculateQuarterStopLossData가 별도 경로로 주문 데이터를 생성함.
  if (currentRound > a - 1 && currentRound <= a) return "quarter";
  return null;
}

function checkRecentMOCSell(
  trades: Trade[],
  recentTradingDays: string[],
): { hasMOC: boolean; mocDate?: string } {
  if (!recentTradingDays.length) return { hasMOC: false };
  const mocSells = trades.filter((t) =>
    t.type === "sell" &&
    t.isMOC === true &&
    recentTradingDays.includes(t.date)
  );
  if (mocSells.length === 0) return { hasMOC: false };
  const sorted = mocSells.sort((a, b) => b.date.localeCompare(a.date));
  return { hasMOC: true, mocDate: sorted[0].date };
}

// 쿼터모드 1회 매수금 재계산 (utils/multiSplitCalc.ts calcNewOneTimeAmount 와 동일 로직)
// 새 1회 매수금 = [잔금 + MOC 매도 금액] / 10, C_current = C_init - Σ(E_buy) + Σ(E_sell)
function calculateNewOneTimeAmount(portfolio: Portfolio, _mocDate: string): number {
  if (!portfolio.strategy.multiSplit) return portfolio.dailyBuyAmount;
  const dailyBuyAmount = portfolio.dailyBuyAmount;
  const a = portfolio.strategy.multiSplit.totalSplitCount;
  if (dailyBuyAmount <= 0 || a <= 0) return 0;

  const C_init = dailyBuyAmount * a;
  const sumEbuy = portfolio.trades
    .filter((t) => t.type === "buy")
    .reduce((sum, t) => sum + t.price * t.quantity + t.fee, 0);
  const sells = portfolio.trades.filter((t) => t.type === "sell");
  const sumEsellNonMOC = sells
    .filter((t) => !t.isMOC)
    .reduce((sum, t) => sum + t.price * t.quantity - t.fee, 0);
  const mocSellAmount = sells
    .filter((t) => t.isMOC)
    .reduce((sum, t) => sum + t.price * t.quantity - t.fee, 0);

  const cashBeforeMOC = C_init - sumEbuy + sumEsellNonMOC;
  const newOneTimeAmount = (cashBeforeMOC + mocSellAmount) / QUARTER_SPLIT_COUNT;
  return Math.max(0, newOneTimeAmount);
}

async function calculateQuarterStopLossData(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, StockSnapshot>,
  portfolio: Portfolio,
  recentTradingDays: string[],
): Promise<QuarterStopLossData | null> {
  if (!portfolio.strategy.multiSplit) return null;
  if (!portfolio.isQuarterMode || recentTradingDays.length === 0) return null;

  const mocCheck = checkRecentMOCSell(portfolio.trades, recentTradingDays);
  const holdings = calculateHoldings(portfolio);
  const targetStock = portfolio.strategy.multiSplit.targetStock;
  const targetHolding = holdings.find((h) => h.stock === targetStock);
  const avgPrice = targetHolding?.avgPrice || 0;
  const currentQuantity = targetHolding?.quantity || 0;
  const feeRate = portfolio.feeRate || 0.25;

  if (!mocCheck.hasMOC) {
    const mocQuantity = currentQuantity * LOC_SELL_RATIO;
    return {
      hasMOC: false,
      mocQuantity: Math.round(mocQuantity * 100) / 100,
    };
  }

  if (!mocCheck.mocDate || avgPrice <= 0 || currentQuantity <= 0) {
    return null;
  }

  const newOneTimeAmount = calculateNewOneTimeAmount(portfolio, mocCheck.mocDate);
  const A = portfolio.strategy.multiSplit.targetReturnRate;

  const locBuyPrice = Math.max(MIN_PRICE, avgPrice * QUARTER_LOC_PRICE_FACTOR - LOC_PRICE_OFFSET);
  const locBuyQty = newOneTimeAmount > 0 && locBuyPrice > 0
    ? Math.floor(newOneTimeAmount / (locBuyPrice * (1 + feeRate / 100)))
    : 0;

  const locSellPrice = avgPrice * QUARTER_LOC_PRICE_FACTOR;
  // 25% 먼저 정수화 → 잔량이 지정가 (utils/multiSplitCalc.ts calcSellSplitQuantities 와 동일)
  const locSellQty = Math.floor(currentQuantity * LOC_SELL_RATIO);

  const limitSellPrice = avgPrice * (1 + A / 100);
  const limitSellQty = currentQuantity - locSellQty;

  return {
    hasMOC: true,
    newOneTimeAmount,
    locBuy: locBuyQty > 0
      ? { price: Math.round(locBuyPrice * 100) / 100, quantity: locBuyQty }
      : undefined,
    locSell: locSellQty > 0
      ? { price: Math.round(locSellPrice * 100) / 100, quantity: locSellQty }
      : undefined,
    limitSell: limitSellQty > 0
      ? { price: Math.round(limitSellPrice * 100) / 100, quantity: limitSellQty }
      : undefined,
  };
}

async function calculateMultiSplitExecutionData(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, StockSnapshot>,
  portfolio: Portfolio,
  multiSplitPhase: "first" | "second" | "quarter" | null,
  currentRound: number,
): Promise<MultiSplitExecutionData | null> {
  if (!portfolio.strategy.multiSplit || !multiSplitPhase) return null;

  const { targetReturnRate, totalSplitCount, targetStock } = portfolio.strategy.multiSplit;
  const A = targetReturnRate;
  const a = totalSplitCount;
  const T = currentRound;

  if (A <= 0 || a <= 0 || T <= 0) return null;

  const holdings = calculateHoldings(portfolio);
  let targetHolding = holdings.find((h) => h.stock === targetStock);
  if (!targetHolding && holdings.length > 0) {
    targetHolding = holdings[0];
  }

  const avgPrice = targetHolding?.avgPrice || 0;
  const currentQuantity = targetHolding?.quantity || 0;
  const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, targetStock);
  const currentPrice = snapshot.price || 0;

  const basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0);
  if (basePrice <= 0) return null;

  const oneTimeAmount = portfolio.dailyBuyAmount;
  const feeRate = portfolio.feeRate || 0.25;

  const locFactor = 1 + (A * (1 - (2 * T) / a)) / 100;
  const rawLocSellPrice = basePrice * locFactor;
  const locSellBasePrice = Math.max(MIN_PRICE, rawLocSellPrice);
  const locBuyBasePrice = Math.max(MIN_PRICE, locSellBasePrice - LOC_PRICE_OFFSET);

  // safeCalculate: utils/multiSplitCalc.ts safeOrder 와 동일
  const safeCalculate = (price: number, qty: number) => {
    if (isNaN(price) || isNaN(qty) || price <= 0) return null;
    const finalQty = Math.max(0, Math.floor(qty));
    if (finalQty <= 0) return null;
    return { price: Number(price.toFixed(2)), quantity: finalQty };
  };

  // 25% 먼저 정수화 → 잔량이 지정가 (utils/multiSplitCalc.ts calcSellSplitQuantities 와 동일)
  const locSellQtyBase = Math.floor(currentQuantity * LOC_SELL_RATIO);
  const limitSellQtyBase = currentQuantity - locSellQtyBase;

  const result: MultiSplitExecutionData = { phase: multiSplitPhase };

  if (multiSplitPhase === "first") {
    const half = oneTimeAmount * FIRST_HALF_BUY_RATIO;

    const locBuy1Price = basePrice;
    const locBuy1Qty = half > 0 && locBuy1Price > 0
      ? half / (locBuy1Price * (1 + feeRate / 100))
      : 0;
    result.locBuy1 = safeCalculate(locBuy1Price, locBuy1Qty) || undefined;

    const locBuy2Qty = half > 0 && locBuyBasePrice > 0
      ? half / (locBuyBasePrice * (1 + feeRate / 100))
      : 0;
    result.locBuy2 = safeCalculate(locBuyBasePrice, locBuy2Qty) || undefined;

    result.locSell = safeCalculate(locSellBasePrice, locSellQtyBase) || undefined;

    const limitSellPrice = basePrice * (1 + A / 100);
    result.limitSell = safeCalculate(limitSellPrice, limitSellQtyBase) || undefined;
  } else if (multiSplitPhase === "second") {
    const locBuyQty = oneTimeAmount > 0 && locBuyBasePrice > 0
      ? oneTimeAmount / (locBuyBasePrice * (1 + feeRate / 100))
      : 0;
    result.locBuy2 = safeCalculate(locBuyBasePrice, locBuyQty) || undefined;

    result.locSell = safeCalculate(locSellBasePrice, locSellQtyBase) || undefined;

    const limitSellPrice = basePrice * (1 + A / 100);
    result.limitSell = safeCalculate(limitSellPrice, limitSellQtyBase) || undefined;
  }

  return result;
}

async function calculateNoStopMultiSplitExecutionData(
  supabase: ReturnType<typeof createClient>,
  historyCache: Map<string, StockHistory>,
  snapshotCache: Map<string, StockSnapshot>,
  portfolio: Portfolio,
): Promise<NoStopMultiSplitExecutionData | null> {
  const strategy = portfolio.strategy.noStopMultiSplit;
  if (!strategy) return null;

  const holdings = calculateHoldings(portfolio);
  const targetHolding =
    holdings.find((holding) => holding.stock === strategy.targetStock) ??
    holdings.find((holding) => holding.quantity > 0) ??
    null;

  const avgPrice = targetHolding?.avgPrice ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const currentRound = getNoStopCurrentRound(portfolio);
  const isFirstBuy = currentQuantity <= 0 || avgPrice <= 0;
  const isSplitComplete = currentRound >= strategy.totalSplitCount;

  const result: NoStopMultiSplitExecutionData = {
    currentRound,
    isFirstBuy,
    isSplitComplete,
  };

  if (isFirstBuy) {
    return result;
  }

  const takeProfitPrice = avgPrice * (1 + strategy.takeProfitPct / 100);
  if (currentQuantity >= 1) {
    result.takeProfit = {
      price: Number(takeProfitPrice.toFixed(2)),
      quantity: Math.floor(currentQuantity),
    };
  }

  if (isSplitComplete || portfolio.dailyBuyAmount <= 0) {
    return result;
  }

  const snapshot = await getStockSnapshot(
    supabase,
    historyCache,
    snapshotCache,
    strategy.targetStock,
  );
  const currentPrice = snapshot.price ?? 0;
  if (currentPrice <= 0) return result;

  const feeRate = portfolio.feeRate || 0.25;
  const oneTimeAmount = portfolio.dailyBuyAmount;
  const pLow = avgPrice;
  const lowBudgetMax = oneTimeAmount * (strategy.lowLocBudgetRatio / 100);
  const qtyLow = Math.max(0, Math.floor(lowBudgetMax / (pLow * (1 + feeRate / 100))));
  const usedLow = qtyLow * pLow * (1 + feeRate / 100);
  const highBudget = Math.max(0, oneTimeAmount - usedLow);
  const pHigh = currentPrice * (1 + strategy.highLocPremiumPct / 100);
  const qtyHigh = Math.max(0, Math.floor(highBudget / (pHigh * (1 + feeRate / 100))));

  if (qtyLow >= 1) {
    result.lowLoc = {
      price: Number(pLow.toFixed(2)),
      quantity: qtyLow,
    };
  }
  if (qtyHigh >= 1) {
    result.highLoc = {
      price: Number(pHigh.toFixed(2)),
      quantity: qtyHigh,
    };
  }

  return result;
}

function linePriceQty(label: string, price: number, qty: number, unit: string): string {
  if (typeof price !== "number" || typeof qty !== "number" || Number.isNaN(price) || Number.isNaN(qty)) {
    return "";
  }
  const q = Math.round(qty);
  if (q <= 0) return "";
  return `- ${label}: ${price.toFixed(2)} / ${q}${unit}`;
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;

  if (!snapshot) {
    const pending =
      lang === "ko"
        ? "VR 밴드 전략 데이터를 계산하는 중입니다. 첫 매수를 V값 안에서 진행해 주세요."
        : "Calculating VR band data. Please execute your first buy within the V value.";
    return `- ${pending}`;
  }

  const lines: string[] = [];
  const vrMode = (portfolio.strategy as any).vrBand?.vrMode as
    | "lump_sum"
    | "accumulate"
    | "withdraw"
    | undefined;

  if (vrMode) {
    const modeLabel =
      vrMode === "lump_sum"
        ? lang === "ko"
          ? "거치식"
          : "Lump-sum"
        : vrMode === "accumulate"
        ? lang === "ko"
          ? "적립식"
          : "Accumulate"
        : lang === "ko"
        ? "인출식"
        : "Withdraw";
    lines.push(`[${modeLabel}]`);
  }

  const { currentV, pool, bandLow, bandHigh } = snapshot;
  lines.push(`- V: ${formatCurrency(currentV)}`);
  lines.push(`- Pool: ${formatCurrency(pool)}`);
  if (typeof bandLow === "number" && typeof bandHigh === "number") {
    lines.push(`- Band: ${bandLow.toFixed(2)} ~ ${bandHigh.toFixed(2)}`);
  }

  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    const hint =
      lang === "ko"
        ? `예약 매수는 표의 ${maxStep}번까지 주문하세요`
        : `Place reserve buy orders up to row ${maxStep}.`;
    lines.push(`- ${hint}`);
  }

  const readyHint =
    lang === "ko"
      ? "VR 밴드 룰에 따라 예약 주문표를 참고하여 매매하세요."
      : "Follow the VR band rules using the reservation order table.";
  lines.push(`- ${readyHint}`);

  return lines.join("\n");
}

const STRINGS: Record<Lang, {
  strategyMultiSplit: string;
  strategyNoStopMultiSplit: string;
  strategyMa: string;
  strategyVrBand: string;
  alarmTimes: string;
  noOrder: string;
  overLimit: string;
  section: string;
  buy: string;
  sectionProfit: string;
  sectionPartialProfit: string;
  sectionWatchRsiNotMet: string;
  sectionWatchAlignmentNotMet: string;
  sectionWatchBothNotMet: string;
  locBuy1: string;
  locBuy2: string;
  lowLoc: string;
  highLoc: string;
  locSell: string;
  limitSell: string;
  mocSell: string;
  firstBuyAmount: string;
  noStopFirstBuyHint: string;
  noStopSplitComplete: string;
  noStopTakeProfitTarget: string;
  noStopGuaranteedDailyFill: string;
  quarterHint: string;
  firstRoundStartHint: string;
  multiSplitInsufficientAmount: string;
  sharesUnit: string;
}> = {
  ko: {
    strategyMultiSplit: "다분할 매매법",
    strategyNoStopMultiSplit: "다분할 매매법(무손절)",
    strategyMa: "이평선 구간매수",
    strategyVrBand: "타겟 밸류 채널",
    alarmTimes: "알람 시간",
    noOrder: "오늘 주문 요약은 앱에서 확인해 주세요.",
    overLimit: "매매 내역을 확인하세요. 총투자금을 초과했습니다.",
    section: "구간",
    buy: "매수",
    sectionProfit: "익절",
    sectionPartialProfit: "중간익절",
    sectionWatchRsiNotMet: "관망 (RSI 조건 미충족)",
    sectionWatchAlignmentNotMet: "관망 (정배열 미충족)",
    sectionWatchBothNotMet: "관망 (정배열 미충족, RSI 조건 미충족)",
    locBuy1: "LOC 매수1",
    locBuy2: "LOC 매수2",
    lowLoc: "저가 LOC",
    highLoc: "고가 LOC",
    locSell: "LOC 매도",
    limitSell: "지정가 매도",
    mocSell: "MOC 매도",
    firstBuyAmount: "1회 매수금",
    noStopFirstBuyHint: "첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.",
    noStopSplitComplete: "분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유(존버)와 익절만 수행합니다.",
    noStopTakeProfitTarget: "익절 목표",
    noStopGuaranteedDailyFill: "매일 체결 보장용",
    quarterHint: "MOC 매도 하여 쿼터 손절 모드 시작",
    firstRoundStartHint: "1회차 매수를 시작하세요",
    multiSplitInsufficientAmount: "알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.",
    sharesUnit: "주",
  },
  en: {
    strategyMultiSplit: "Multi-Split Strategy",
    strategyNoStopMultiSplit: "No-Stop Multi-Split",
    strategyMa: "Moving Average Strategy",
    strategyVrBand: "Target Value Channel",
    alarmTimes: "Alarm times",
    noOrder: "Please check today's orders in the app.",
    overLimit: "Check your trades. Total invested has exceeded the limit.",
    section: "Section",
    buy: "Buy",
    sectionProfit: "Take profit",
    sectionPartialProfit: "Partial profit",
    sectionWatchRsiNotMet: "Watch (RSI not met)",
    sectionWatchAlignmentNotMet: "Watch (alignment not met)",
    sectionWatchBothNotMet: "Watch (alignment not met, RSI not met)",
    locBuy1: "LOC Buy1",
    locBuy2: "LOC Buy2",
    lowLoc: "Low LOC",
    highLoc: "High LOC",
    locSell: "LOC Sell",
    limitSell: "Limit Sell",
    mocSell: "MOC Sell",
    firstBuyAmount: "1st Buy Amount",
    noStopFirstBuyHint: "For your first buy, feel free to buy anytime during market hours.",
    noStopSplitComplete: "All split buys are complete. Hold and wait for take profit without additional buys.",
    noStopTakeProfitTarget: "Take-profit target",
    noStopGuaranteedDailyFill: "For guaranteed daily fill",
    quarterHint: "Execute MOC sell to start quarter stop-loss mode",
    firstRoundStartHint: "Start your 1st round buy",
    multiSplitInsufficientAmount: "Notice: 1st buy amount is too low to place orders. Please check your settings.",
    sharesUnit: "shares",
  },
};

function formatPortfolioDailyExecutionBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: {
    multiSplitExecutionData?: MultiSplitExecutionData | null;
    quarterStopLossData?: QuarterStopLossData | null;
    noStopMultiSplitExecutionData?: NoStopMultiSplitExecutionData | null;
    multiSplitPhase?: "first" | "second" | "quarter" | null;
    isQuarterStopLossActive?: boolean;
    multiSplitOverLimit?: boolean;
    multiSplitFirstRoundHint?: boolean;
    multiSplitInsufficientAmount?: boolean;
    maActiveSection?: 1 | 2 | 3 | null;
    maPartialProfitLines?: { section: 1 | 2 | 3; stock: string; quantity: number }[];
    maRsiNotMet?: boolean;
    maAlignmentNotMet?: boolean;
    vrMaxBuyStep?: number;
  },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(", ");
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? "";
  const isVrBand = !!(portfolio.strategy as any).vrBand;
  const isMultiSplit = !!portfolio.strategy.multiSplit;
  const isNoStopMultiSplit = !!portfolio.strategy.noStopMultiSplit;

  lines.push(`📌 ${portfolioName}`);
  lines.push(
    isVrBand
      ? `- ${s.strategyVrBand}`
      : isMultiSplit
        ? `- ${s.strategyMultiSplit}`
        : isNoStopMultiSplit
          ? `- ${s.strategyNoStopMultiSplit}`
          : `- ${s.strategyMa}`,
  );
  const tzLabel = portfolio.alarmconfig?.timezone || "Asia/Seoul";
  lines.push(`- ${s.alarmTimes} (${tzLabel}): ${hours || "-"}`);

  if (isVrBand) {
    const vrBlock = formatVrBandBlock(portfolio, lang, { vrMaxBuyStep: options.vrMaxBuyStep ?? 0 });
    if (vrBlock) lines.push(vrBlock);
    return lines.join("\n");
  }

  if (!isMultiSplit && !isNoStopMultiSplit) {
    const { maActiveSection, maPartialProfitLines, maRsiNotMet, maAlignmentNotMet } = options;
    const rsiEnabled = portfolio.strategy.ma0?.rsiEnabled === true;
    const alignmentEnabled = portfolio.strategy.ma0?.alignmentEnabled === true;
    const effectiveRsiNot = rsiEnabled && (maRsiNotMet === true);
    const effectiveAlignmentNot = alignmentEnabled && (maAlignmentNotMet === true);

    if (maActiveSection === 1 || maActiveSection === 2 || maActiveSection === 3) {
      if (effectiveAlignmentNot && effectiveRsiNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchBothNotMet}`);
      } else if (effectiveAlignmentNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchAlignmentNotMet}`);
      } else if (effectiveRsiNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchRsiNotMet}`);
      } else {
        const stock = maActiveSection === 1
          ? (portfolio.strategy.ma1?.stock ?? "")
          : maActiveSection === 2
            ? (portfolio.strategy.ma2?.stock ?? "")
            : (portfolio.strategy.ma3?.stock ?? "");
        if (stock) lines.push(`- ${s.section} ${maActiveSection}: ${stock} ${s.buy}`);
      }
    }

    if (maPartialProfitLines && maPartialProfitLines.length > 0) {
      const ma1 = portfolio.strategy.ma1;
      const ma2 = portfolio.strategy.ma2;
      const ma3 = portfolio.strategy.ma3;
      maPartialProfitLines.forEach(({ section, stock, quantity }) => {
        if (section !== 1 && section !== 2 && section !== 3) return;
        const takeEnabled = section === 1
          ? ma1?.takePartialProfit
          : section === 2
            ? ma2?.takePartialProfit
            : ma3?.takePartialProfit;
        if (!takeEnabled) return;
        const q = Math.round(quantity);
        if (q > 0 && stock) {
          lines.push(`- ${s.section} ${section} ${s.sectionPartialProfit}: ${stock} ${q}${s.sharesUnit}`);
        }
      });
    }

    lines.push(`- ${s.noOrder}`);
    return lines.join("\n");
  }

  const unit = s.sharesUnit;

  if (isNoStopMultiSplit) {
    const data = options.noStopMultiSplitExecutionData;
    const takeProfitPct = portfolio.strategy.noStopMultiSplit?.takeProfitPct ?? 0;

    if (data?.isFirstBuy) {
      lines.push(`- ${s.noStopFirstBuyHint}`);
      return lines.join("\n");
    }
    if (data?.lowLoc) {
      lines.push(linePriceQty(s.lowLoc, data.lowLoc.price, data.lowLoc.quantity, unit));
    }
    if (data?.highLoc) {
      const highLocLine = linePriceQty(s.highLoc, data.highLoc.price, data.highLoc.quantity, unit);
      if (highLocLine) lines.push(`${highLocLine} (${s.noStopGuaranteedDailyFill})`);
    }
    if (data?.isSplitComplete) {
      lines.push(`- ${s.noStopSplitComplete}`);
    }
    if (data?.takeProfit) {
      lines.push(
        lang === "ko"
          ? `- ${s.noStopTakeProfitTarget}: 평단 대비 +${takeProfitPct}% (전량 지정가 매도)`
          : `- ${s.noStopTakeProfitTarget}: Avg price +${takeProfitPct}% (full limit sell)`
      );
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join("\n");
  }

  const {
    multiSplitExecutionData,
    quarterStopLossData,
    multiSplitPhase,
    isQuarterStopLossActive,
    multiSplitOverLimit,
    multiSplitFirstRoundHint,
    multiSplitInsufficientAmount,
  } = options;

  if (multiSplitOverLimit) {
    lines.push(`- ${s.overLimit}`);
    return lines.join("\n");
  }
  if (multiSplitInsufficientAmount) {
    lines.push(`- ${s.multiSplitInsufficientAmount}`);
    lines.push(`- ${s.noOrder}`);
    return lines.join("\n");
  }

  if (isQuarterStopLossActive && quarterStopLossData) {
    if (!quarterStopLossData.hasMOC) {
      const qty = quarterStopLossData.mocQuantity ?? 0;
      lines.push(`- ${s.mocSell}: ${qty.toFixed(2)} ${unit}`);
      lines.push(`- ${s.quarterHint}`);
    } else {
      if (quarterStopLossData.newOneTimeAmount != null) {
        lines.push(`- ${s.firstBuyAmount}: $${quarterStopLossData.newOneTimeAmount.toFixed(2)}`);
      }
      if (quarterStopLossData.locBuy) {
        lines.push(linePriceQty(s.locBuy2, quarterStopLossData.locBuy.price, quarterStopLossData.locBuy.quantity, unit));
      }
      if (quarterStopLossData.locSell) {
        lines.push(linePriceQty(s.locSell, quarterStopLossData.locSell.price, quarterStopLossData.locSell.quantity, unit));
      }
      if (quarterStopLossData.limitSell) {
        lines.push(linePriceQty(s.limitSell, quarterStopLossData.limitSell.price, quarterStopLossData.limitSell.quantity, unit));
      }
    }
    return lines.join("\n");
  }

  if (multiSplitExecutionData && multiSplitPhase === "first") {
    if (multiSplitExecutionData.locBuy1) {
      lines.push(linePriceQty(s.locBuy1, multiSplitExecutionData.locBuy1.price, multiSplitExecutionData.locBuy1.quantity, unit));
    }
    if (multiSplitExecutionData.locBuy2) {
      lines.push(linePriceQty(s.locBuy2, multiSplitExecutionData.locBuy2.price, multiSplitExecutionData.locBuy2.quantity, unit));
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(linePriceQty(s.locSell, multiSplitExecutionData.locSell.price, multiSplitExecutionData.locSell.quantity, unit));
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(linePriceQty(s.limitSell, multiSplitExecutionData.limitSell.price, multiSplitExecutionData.limitSell.quantity, unit));
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join("\n");
  }

  if (multiSplitExecutionData && multiSplitPhase === "second") {
    if (multiSplitExecutionData.locBuy2) {
      lines.push(linePriceQty(s.locBuy2, multiSplitExecutionData.locBuy2.price, multiSplitExecutionData.locBuy2.quantity, unit));
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(linePriceQty(s.locSell, multiSplitExecutionData.locSell.price, multiSplitExecutionData.locSell.quantity, unit));
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(linePriceQty(s.limitSell, multiSplitExecutionData.limitSell.price, multiSplitExecutionData.limitSell.quantity, unit));
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join("\n");
  }

  if (multiSplitFirstRoundHint) {
    lines.push(`- ${s.firstRoundStartHint}`);
  }
  lines.push(`- ${s.noOrder}`);
  return lines.join("\n");
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

  if ((portfolio.strategy as any).vrBand) {
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
    const currentRound = getCurrentRound(portfolio);
    const multiSplitPhase = getMultiSplitPhase(portfolio, currentRound);
    const a = portfolio.strategy.multiSplit.totalSplitCount ?? 0;
    const multiSplitOverLimit = a > 0 && currentRound > a;
    const targetStock = portfolio.strategy.multiSplit.targetStock;
    const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, targetStock);
    const multiSplitInsufficientAmount = snapshot.price > 0 &&
      portfolio.dailyBuyAmount < snapshot.price;

    const recentTradingDays = await getRecentTradingDays(
      supabase,
      historyCache,
      targetStock,
      RECENT_TRADING_DAYS,
    );

    const quarterStopLossData = await calculateQuarterStopLossData(
      supabase,
      historyCache,
      snapshotCache,
      portfolio,
      recentTradingDays,
    );

    const multiSplitExecutionData = await calculateMultiSplitExecutionData(
      supabase,
      historyCache,
      snapshotCache,
      portfolio,
      multiSplitPhase,
      currentRound,
    );

    return formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData,
      quarterStopLossData,
      multiSplitPhase,
      isQuarterStopLossActive: portfolio.isQuarterMode === true,
      multiSplitOverLimit,
      multiSplitFirstRoundHint: currentRound >= 0 && currentRound < 0.5,
      multiSplitInsufficientAmount,
    });
  }

  if (portfolio.strategy.noStopMultiSplit) {
    const noStopMultiSplitExecutionData = await calculateNoStopMultiSplitExecutionData(
      supabase,
      historyCache,
      snapshotCache,
      portfolio,
    );

    return formatPortfolioDailyExecutionBlock(portfolio, lang, {
      noStopMultiSplitExecutionData,
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

    if (ma0.rsiEnabled) {
      const threshold = section === 1
        ? portfolio.strategy.ma1?.rsiThreshold
        : section === 2
          ? portfolio.strategy.ma2?.rsiThreshold
          : portfolio.strategy.ma3?.rsiThreshold;
      const rsi = baseSnapshot.rsi ?? 50;
      maRsiNotMet = threshold != null && rsi > threshold;
    }

    if (ma0.alignmentEnabled) {
      const { maA, maB } = await getMAValuesForAlignment(
        supabase,
        historyCache,
        snapshotCache,
        portfolio,
      );
      maAlignmentNotMet = maA <= maB;
    }

    const holdings = calculateHoldings(portfolio);
    const lines: { section: 1 | 2 | 3; stock: string; quantity: number }[] = [];
    const checkPartial = async (sec: 1 | 2 | 3, config: any) => {
      if (!config?.takePartialProfit || config?.partialProfitTargetPct == null || config?.partialProfitTargetPct <= 0) return;
      const h = holdings.find((x) => x.stock === config.stock);
      if (!h || h.quantity <= 0 || h.avgPrice <= 0) return;
      const snapshot = await getStockSnapshot(supabase, historyCache, snapshotCache, config.stock);
      const currentPrice = snapshot.price ?? 0;
      if (currentPrice <= 0) return;
      const yieldPct = ((currentPrice - h.avgPrice) / h.avgPrice) * 100;
      if (yieldPct >= config.partialProfitTargetPct) {
        lines.push({ section: sec, stock: config.stock, quantity: h.quantity });
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

    const eligibleProfiles = (profiles ?? []).filter((p: UserProfileRow) => shouldSendTelegram(p));
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
      const portfolio = mapPortfolioRow(row);
      if (!portfolio) continue;
      if (!portfoliosByUser.has(row.user_id)) {
        portfoliosByUser.set(row.user_id, []);
      }
      portfoliosByUser.get(row.user_id)?.push(portfolio);
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
