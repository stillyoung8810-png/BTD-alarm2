/**
 * 다분할 매매법(Multi-Split Trading) 공용 계산 모듈.
 *
 * 프론트엔드 `utils/multiSplitCalc.ts`를 SSOT로 삼아
 * 클라이언트 훅과 서버 요약기가 동일한 순수 함수를 공유합니다.
 */

export const LOC_SELL_RATIO = 0.25;
export const QUARTER_LOC_PRICE_FACTOR = 0.9;
export const LOC_PRICE_OFFSET = 0.01;
export const QUARTER_SPLIT_COUNT = 10;
export const RECENT_TRADING_DAYS_COUNT = 11;
export const FIRST_HALF_BUY_RATIO = 0.5;
export const MIN_PRICE = 0.01;
export const HOLDINGS_QTY_EPSILON = 1e-10;

export interface TradeInput {
  type: 'buy' | 'sell';
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean;
}

export interface HoldingsResult {
  stock: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
  realizedPnL?: number;
}

export interface MultiSplitParams {
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
}

export interface OrderEntry {
  price: number;
  quantity: number;
}

export interface QuarterStopLossResult {
  hasMOC: boolean;
  mocQuantity?: number;
  newOneTimeAmount?: number;
  locBuy?: OrderEntry;
  locSell?: OrderEntry;
  limitSell?: OrderEntry;
}

export type MultiSplitPhase = 'first' | 'second' | 'quarter' | null;

export interface MultiSplitExecutionResult {
  phase: MultiSplitPhase;
  locBuy1?: OrderEntry;
  locBuy2?: OrderEntry;
  locSell?: OrderEntry;
  limitSell?: OrderEntry;
  mocSell?: { quantity: number };
}

export interface MOCSellCheckResult {
  hasMOC: boolean;
  mocDate?: string;
}

export interface MultiSplitStrategyState {
  currentRound: number;
  multiSplitPhase: MultiSplitPhase;
  isInQuarterMode: boolean;
  isInQuarterModeByT: boolean;
  quarterStopLossData: QuarterStopLossResult | null;
  multiSplitExecutionData: MultiSplitExecutionResult | null;
  multiSplitInsufficientAmount: boolean;
  currentQuantity: number;
  avgPrice: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isStrictPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function areStrictPositiveFiniteScalars(...values: unknown[]): boolean {
  return values.every(isStrictPositiveFiniteNumber);
}

function areFiniteNonNegativeScalars(...values: unknown[]): boolean {
  return values.every(isFiniteNonNegativeNumber);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ceilToTwoDecimals(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

function floorToNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value + Number.EPSILON));
}

export function calcHoldings(trades: TradeInput[]): HoldingsResult[] {
  const map: Record<
    string,
    { quantity: number; totalCost: number; realizedPnL: number }
  > = {};

  for (const trade of trades) {
    if (trade.type === 'buy') {
      if (!map[trade.stock]) {
        map[trade.stock] = { quantity: 0, totalCost: 0, realizedPnL: 0 };
      }
      map[trade.stock].quantity += trade.quantity;
      map[trade.stock].totalCost +=
        trade.price * trade.quantity + Math.abs(trade.fee);
      continue;
    }

    if (!map[trade.stock]) {
      continue;
    }

    const prev = map[trade.stock];
    if (prev.quantity < 0 || prev.quantity < trade.quantity) {
      throw new Error(
        `[${trade.stock}] 초과 매도 에러: 시도수량=${trade.quantity}, 보유수량=${prev.quantity}`,
      );
    }

    const currentAvgPrice =
      prev.quantity > HOLDINGS_QTY_EPSILON ? prev.totalCost / prev.quantity : 0;
    const revenue = trade.price * trade.quantity - Math.abs(trade.fee);
    const costBasis = currentAvgPrice * trade.quantity;
    prev.realizedPnL += revenue - costBasis;

    prev.quantity -= trade.quantity;
    if (
      prev.quantity <= 0 ||
      Math.abs(prev.quantity) < HOLDINGS_QTY_EPSILON
    ) {
      prev.quantity = 0;
      prev.totalCost = 0;
      continue;
    }

    prev.totalCost = prev.quantity * currentAvgPrice;
  }

  return Object.entries(map).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice:
      data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
    realizedPnL: roundMoney(data.realizedPnL),
  }));
}

export function calcT(trades: TradeInput[], dailyBuyAmount: number): number {
  if (!areStrictPositiveFiniteScalars(dailyBuyAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce((sum, holding) => sum + holding.totalCost, 0);
  if (!areStrictPositiveFiniteScalars(totalInvested)) {
    return 0;
  }

  return ceilToTwoDecimals(totalInvested / dailyBuyAmount);
}

export function getPhase(T: number, a: number): MultiSplitPhase {
  if (T >= 0.5 && T < a / 2) return 'first';
  if (T >= a / 2 && T <= a - 1) return 'second';
  if (T > a - 1 && T <= a) return 'quarter';
  return null;
}

export function checkRecentMOCSell(
  trades: TradeInput[],
  recentTradingDays: string[],
): MOCSellCheckResult {
  if (recentTradingDays.length === 0) {
    return { hasMOC: false };
  }

  const mocSells = trades.filter(
    (trade) =>
      trade.type === 'sell' &&
      trade.isMOC === true &&
      recentTradingDays.includes(trade.date),
  );

  if (mocSells.length === 0) {
    return { hasMOC: false };
  }

  const sorted = [...mocSells].sort((a, b) => b.date.localeCompare(a.date));
  return { hasMOC: true, mocDate: sorted[0].date };
}

export function calcIntermediateProfit(
  trades: TradeInput[],
  sinceDate: string,
): number {
  const sorted = [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.type === 'buy' && b.type === 'sell') return -1;
    if (a.type === 'sell' && b.type === 'buy') return 1;
    return 0;
  });

  const tradesUpTo = sorted.filter((trade) => trade.date <= sinceDate);
  const holdingsFull = calcHoldings(sorted);
  const holdingsUpTo = calcHoldings(tradesUpTo);
  const totalRealized = holdingsFull.reduce(
    (sum, holding) => sum + (holding.realizedPnL ?? 0),
    0,
  );
  const realizedUpTo = holdingsUpTo.reduce(
    (sum, holding) => sum + (holding.realizedPnL ?? 0),
    0,
  );

  return roundMoney(totalRealized - realizedUpTo);
}

export function calcNewOneTimeAmount(
  trades: TradeInput[],
  dailyBuyAmount: number,
  totalSplitCount: number,
  _mocDate: string,
): number {
  if (!areStrictPositiveFiniteScalars(dailyBuyAmount, totalSplitCount)) {
    return 0;
  }

  const initialCapital = dailyBuyAmount * totalSplitCount;
  const sumBuy = trades
    .filter((trade) => trade.type === 'buy')
    .reduce(
      (sum, trade) => sum + trade.price * trade.quantity + Math.abs(trade.fee),
      0,
    );
  const sells = trades.filter((trade) => trade.type === 'sell');
  const sumSellNonMOC = sells
    .filter((trade) => !trade.isMOC)
    .reduce(
      (sum, trade) => sum + trade.price * trade.quantity - Math.abs(trade.fee),
      0,
    );
  const mocSellAmount = sells
    .filter((trade) => trade.isMOC)
    .reduce(
      (sum, trade) => sum + trade.price * trade.quantity - Math.abs(trade.fee),
      0,
    );

  const cashBeforeMoc = initialCapital - sumBuy + sumSellNonMOC;
  const newOneTimeAmount = (cashBeforeMoc + mocSellAmount) / QUARTER_SPLIT_COUNT;

  return roundMoney(Math.max(0, newOneTimeAmount));
}

export function calcSellSplitQuantities(totalQty: number): {
  locSellQty: number;
  limitSellQty: number;
} {
  const safeTotalQty = floorToNonNegativeInt(totalQty);
  const locSellQty = floorToNonNegativeInt(safeTotalQty * LOC_SELL_RATIO);
  const limitSellQty = safeTotalQty - locSellQty;

  return { locSellQty, limitSellQty };
}

export function safeOrder(price: number, qty: number): OrderEntry | null {
  if (!areStrictPositiveFiniteScalars(price, qty)) {
    return null;
  }

  const finalQty = floorToNonNegativeInt(qty);
  if (finalQty <= 0) {
    return null;
  }

  return {
    price: roundMoney(price),
    quantity: finalQty,
  };
}

function orderEntryForDisplay(price: number, qty: number): OrderEntry | null {
  if (!areStrictPositiveFiniteScalars(price)) {
    return null;
  }

  return {
    price: roundMoney(price),
    quantity: floorToNonNegativeInt(qty),
  };
}

export function calcQuarterStopLossOrders(params: {
  trades: TradeInput[];
  dailyBuyAmount: number;
  multiSplit: MultiSplitParams;
  feeRate: number;
  recentTradingDays: string[];
  avgPrice: number;
  currentQuantity: number;
}): QuarterStopLossResult | null {
  const {
    trades,
    dailyBuyAmount,
    multiSplit,
    feeRate,
    recentTradingDays,
    avgPrice,
    currentQuantity,
  } = params;

  const mocCheck = checkRecentMOCSell(trades, recentTradingDays);

  if (!mocCheck.hasMOC) {
    return {
      hasMOC: false,
      mocQuantity: roundMoney(currentQuantity * LOC_SELL_RATIO),
    };
  }

  if (
    !mocCheck.mocDate ||
    !areStrictPositiveFiniteScalars(avgPrice, currentQuantity)
  ) {
    return null;
  }

  const newOneTimeAmount = calcNewOneTimeAmount(
    trades,
    dailyBuyAmount,
    multiSplit.totalSplitCount,
    mocCheck.mocDate,
  );
  const locBuyPrice = Math.max(
    MIN_PRICE,
    avgPrice * QUARTER_LOC_PRICE_FACTOR - LOC_PRICE_OFFSET,
  );
  const locBuyQty =
    newOneTimeAmount > 0 && locBuyPrice > 0
      ? floorToNonNegativeInt(
          newOneTimeAmount / (locBuyPrice * (1 + feeRate / 100)),
        )
      : 0;
  const { locSellQty, limitSellQty } = calcSellSplitQuantities(currentQuantity);
  const locSellPrice = avgPrice * QUARTER_LOC_PRICE_FACTOR;
  const limitSellPrice = avgPrice * (1 + multiSplit.targetReturnRate / 100);

  return {
    hasMOC: true,
    newOneTimeAmount,
    locBuy: safeOrder(locBuyPrice, locBuyQty) ?? undefined,
    locSell: orderEntryForDisplay(locSellPrice, locSellQty) ?? undefined,
    limitSell:
      orderEntryForDisplay(limitSellPrice, limitSellQty) ?? undefined,
  };
}

export function calcMultiSplitOrders(params: {
  phase: 'first' | 'second';
  A: number;
  a: number;
  T: number;
  basePrice: number;
  currentQuantity: number;
  oneTimeAmount: number;
  feeRate: number;
}): MultiSplitExecutionResult {
  const { phase, A, a, T, basePrice, currentQuantity, oneTimeAmount, feeRate } =
    params;

  if (!areStrictPositiveFiniteScalars(A, a, T, basePrice)) {
    return { phase };
  }

  if (!areFiniteNonNegativeScalars(currentQuantity, oneTimeAmount, feeRate)) {
    return { phase };
  }

  const locFactor = 1 + (A * (1 - (2 * T) / a)) / 100;
  const locSellBasePrice = Math.max(MIN_PRICE, basePrice * locFactor);
  const locBuyBasePrice = Math.max(MIN_PRICE, locSellBasePrice - LOC_PRICE_OFFSET);
  const { locSellQty, limitSellQty } = calcSellSplitQuantities(currentQuantity);
  const result: MultiSplitExecutionResult = { phase };

  if (phase === 'first') {
    const half = oneTimeAmount * FIRST_HALF_BUY_RATIO;
    const locBuy1Price = basePrice;
    const qtyWithHalf =
      half > 0 && locBuy1Price > 0
        ? half / (locBuy1Price * (1 + feeRate / 100))
        : 0;
    const qtyWithFull =
      oneTimeAmount > 0 && locBuy1Price > 0
        ? oneTimeAmount / (locBuy1Price * (1 + feeRate / 100))
        : 0;
    const locBuy1Qty =
      floorToNonNegativeInt(qtyWithHalf) < 1 &&
      floorToNonNegativeInt(qtyWithFull) >= 1
        ? 1
        : qtyWithHalf;

    result.locBuy1 = orderEntryForDisplay(locBuy1Price, locBuy1Qty) ?? undefined;

    const finalLocBuy1Qty = floorToNonNegativeInt(locBuy1Qty);
    const locBuy1OrderAmount =
      locBuy1Price * finalLocBuy1Qty * (1 + feeRate / 100);
    const remainingForLoc2 = Math.max(0, oneTimeAmount - locBuy1OrderAmount);
    const locBuy2Qty =
      locBuyBasePrice > 0
        ? remainingForLoc2 / (locBuyBasePrice * (1 + feeRate / 100))
        : 0;

    result.locBuy2 = orderEntryForDisplay(locBuyBasePrice, locBuy2Qty) ?? undefined;
  } else {
    const locBuyQty =
      oneTimeAmount > 0 && locBuyBasePrice > 0
        ? oneTimeAmount / (locBuyBasePrice * (1 + feeRate / 100))
        : 0;

    result.locBuy2 = orderEntryForDisplay(locBuyBasePrice, locBuyQty) ?? undefined;
  }

  result.locSell = orderEntryForDisplay(locSellBasePrice, locSellQty) ?? undefined;
  result.limitSell =
    orderEntryForDisplay(basePrice * (1 + A / 100), limitSellQty) ?? undefined;

  return result;
}

export function calculateMultiSplitStrategyState(params: {
  trades: TradeInput[];
  dailyBuyAmount: number;
  feeRate: number;
  multiSplit: MultiSplitParams;
  isQuarterMode: boolean;
  currentPrice: number;
  recentTradingDays: string[];
}): MultiSplitStrategyState {
  const {
    trades,
    dailyBuyAmount,
    feeRate,
    multiSplit,
    isQuarterMode,
    currentPrice,
    recentTradingDays,
  } = params;

  const isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount);
  const currentRound = isDailyBuyAmountValid ? calcT(trades, dailyBuyAmount) : 0;
  const hasValidSplitCount = multiSplit.totalSplitCount > 0;
  const multiSplitPhase = hasValidSplitCount
    ? getPhase(currentRound, multiSplit.totalSplitCount)
    : null;
  const holdings = calcHoldings(trades);
  const targetHolding =
    holdings.find((holding) => holding.stock === multiSplit.targetStock) ?? null;
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const isTargetReturnRateValid =
    areStrictPositiveFiniteScalars(multiSplit.targetReturnRate);
  const hasValidStrategyInputs =
    isDailyBuyAmountValid && hasValidSplitCount && isTargetReturnRateValid;
  const multiSplitInsufficientAmount =
    currentPrice > 0 && dailyBuyAmount < currentPrice;
  let quarterStopLossData: QuarterStopLossResult | null = null;

  if (isQuarterMode && recentTradingDays.length > 0 && hasValidStrategyInputs) {
    quarterStopLossData = calcQuarterStopLossOrders({
      trades,
      dailyBuyAmount,
      multiSplit,
      feeRate,
      recentTradingDays,
      avgPrice,
      currentQuantity,
    });
  }

  let multiSplitExecutionData: MultiSplitExecutionResult | null = null;
  if (
    !isQuarterMode &&
    hasValidStrategyInputs &&
    (multiSplitPhase === 'first' || multiSplitPhase === 'second')
  ) {
    const basePrice = avgPrice > 0 ? avgPrice : currentPrice;
    if (basePrice > 0) {
      multiSplitExecutionData = calcMultiSplitOrders({
        phase: multiSplitPhase,
        A: multiSplit.targetReturnRate,
        a: multiSplit.totalSplitCount,
        T: currentRound,
        basePrice,
        currentQuantity,
        oneTimeAmount: dailyBuyAmount,
        feeRate,
      });
    }
  }

  return {
    currentRound,
    multiSplitPhase,
    isInQuarterMode: isQuarterMode,
    isInQuarterModeByT: multiSplitPhase === 'quarter',
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
    currentQuantity,
    avgPrice,
  };
}
