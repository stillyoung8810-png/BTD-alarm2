import { calcHoldings, type TradeInput } from './multiSplitCalc';
import {
  areFiniteNonNegativeScalars,
  areStrictPositiveFiniteScalars,
} from './financialScalarGuards';
import { floorToNonNegativeInt, roundMoney } from './financialMath';

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

function floorSafe(value: number): number {
  if (!areFiniteNonNegativeScalars(value)) {
    return 0;
  }

  return floorToNonNegativeInt(value);
}

function order(price: number, quantity: number): NoStopOrderEntry | undefined {
  const finalQty = floorSafe(quantity);
  if (!areStrictPositiveFiniteScalars(price) || finalQty < 1) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: finalQty,
  };
}

export function calcNoStopCurrentRound(trades: TradeInput[], oneTimeAmount: number): number {
  if (!areStrictPositiveFiniteScalars(oneTimeAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce((sum, holding) => sum + holding.totalCost, 0);
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

  if (isSplitComplete || !areStrictPositiveFiniteScalars(currentPrice, oneTimeAmount)) {
    return result;
  }

  const pLow = avgPrice;
  const lowBudgetMax = oneTimeAmount * (strategy.lowLocBudgetRatio / 100);
  const qtyLow = floorSafe(lowBudgetMax / (pLow * (1 + feeRate / 100)));
  const usedLow = qtyLow * pLow * (1 + feeRate / 100);
  const highBudget = Math.max(0, oneTimeAmount - usedLow);

  const pHigh = currentPrice * (1 + strategy.highLocPremiumPct / 100);
  const qtyHigh = floorSafe(highBudget / (pHigh * (1 + feeRate / 100)));

  result.lowLoc = order(pLow, qtyLow);
  result.highLoc = order(pHigh, qtyHigh);

  return result;
}
