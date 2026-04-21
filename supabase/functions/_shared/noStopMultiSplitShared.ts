import { calcHoldings, type TradeInput } from './multiSplitShared.ts';

export interface NoStopMultiSplitParams {
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
}

export interface NoStopOrderEntry {
  price: number;
  quantity: number;
}

export interface NoStopMultiSplitExecutionData {
  currentRound: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: NoStopOrderEntry;
  highLoc?: NoStopOrderEntry;
  takeProfit?: NoStopOrderEntry;
}

export interface NoStopMultiSplitState {
  currentRound: number;
  executionData: NoStopMultiSplitExecutionData;
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

function areFiniteNonNegativeScalars(...values: unknown[]): boolean {
  return values.every(isFiniteNonNegativeNumber);
}

function areStrictPositiveFiniteScalars(...values: unknown[]): boolean {
  return values.every(isStrictPositiveFiniteNumber);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function floorToNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value + Number.EPSILON));
}

function floorSafe(value: number): number {
  if (!areFiniteNonNegativeScalars(value)) {
    return 0;
  }

  return floorToNonNegativeInt(value);
}

function order(
  price: number,
  quantity: number,
): NoStopOrderEntry | undefined {
  const finalQty = floorSafe(quantity);
  if (!areStrictPositiveFiniteScalars(price) || finalQty < 1) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: finalQty,
  };
}

export function calcNoStopCurrentRound(
  trades: TradeInput[],
  oneTimeAmount: number,
): number {
  if (!areStrictPositiveFiniteScalars(oneTimeAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce(
    (sum, holding) => sum + holding.totalCost,
    0,
  );
  if (!areStrictPositiveFiniteScalars(totalInvested)) {
    return 0;
  }

  return roundMoney(totalInvested / oneTimeAmount);
}

export function calcNoStopMultiSplitOrders(params: {
  trades: TradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  currentPrice: number;
  strategy: NoStopMultiSplitParams;
}): NoStopMultiSplitExecutionData {
  const { trades, oneTimeAmount, feeRate, currentPrice, strategy } = params;

  if (
    !areFiniteNonNegativeScalars(
      oneTimeAmount,
      feeRate,
      currentPrice,
      strategy.lowLocBudgetRatio,
      strategy.highLocPremiumPct,
      strategy.takeProfitPct,
      strategy.totalSplitCount,
    )
  ) {
    return {
      currentRound: 0,
      isFirstBuy: true,
      isSplitComplete: false,
    };
  }

  const holdings = calcHoldings(trades);
  const targetHolding =
    holdings.find((holding) => holding.stock === strategy.targetStock) ??
    holdings.find((holding) => holding.quantity > 0) ??
    null;

  const avgPrice = targetHolding?.avgPrice ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const currentRound = calcNoStopCurrentRound(trades, oneTimeAmount);
  const isFirstBuy = !areStrictPositiveFiniteScalars(currentQuantity, avgPrice);
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
  result.takeProfit = order(takeProfitPrice, currentQuantity);

  if (
    isSplitComplete ||
    !areStrictPositiveFiniteScalars(currentPrice, oneTimeAmount)
  ) {
    return result;
  }

  const lowPrice = avgPrice;
  const lowBudgetMax = oneTimeAmount * (strategy.lowLocBudgetRatio / 100);
  const lowQuantity = floorSafe(
    lowBudgetMax / (lowPrice * (1 + feeRate / 100)),
  );
  const usedLowBudget = lowQuantity * lowPrice * (1 + feeRate / 100);
  const highBudget = Math.max(0, oneTimeAmount - usedLowBudget);
  const highPrice = currentPrice * (1 + strategy.highLocPremiumPct / 100);
  const highQuantity = floorSafe(
    highBudget / (highPrice * (1 + feeRate / 100)),
  );

  result.lowLoc = order(lowPrice, lowQuantity);
  result.highLoc = order(highPrice, highQuantity);

  return result;
}

export function calculateNoStopMultiSplitState(params: {
  trades: TradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  currentPrice: number;
  strategy: NoStopMultiSplitParams;
}): NoStopMultiSplitState {
  const executionData = calcNoStopMultiSplitOrders(params);

  return {
    currentRound: executionData.currentRound,
    executionData,
  };
}
