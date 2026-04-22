import { calcHoldings, type TradeInput } from './multiSplitShared.ts';
import {
  HOLDINGS_QTY_EPSILON,
  floorToNonNegativeInt,
  roundMoney,
} from './financialMath.ts';
import type {
  IndicatorRequirements,
  NoStopIndicatorSnapshot,
  NoStopLocRatioPreset,
  NoStopMovingAveragePeriod,
  NoStopMultiSplitStrategy,
} from './types.ts';
import { validateFinancialArgs } from './vrBandStrategy.ts';

const PERCENT_DENOMINATOR = 100;
const MAX_PROGRESS_PERCENT = 100;
const MIN_PROGRESS_PERCENT = 0;
const MOC_SAFETY_BUFFER_MULTIPLIER = 1.15;

export const EMPTY_PRICE_HISTORY_ERROR =
  'Price history is empty. Cannot build no-stop indicator snapshot.';

/**
 * Legacy order-preview contract kept local to the shared helper layer only.
 * Persisted Strategy.noStopMultiSplit has already migrated to NoStopMultiSplitStrategy.
 */
export interface NoStopMultiSplitParams {
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
}

export type {
  IndicatorRequirements,
  NoStopAlignmentRule,
  NoStopIndicatorSnapshot,
  NoStopLocRatioPreset,
  NoStopMovingAveragePeriod,
  NoStopMultiSplitStrategy,
  NoStopRsiRule,
} from './types.ts';

export interface NoStopOrderEntry {
  price: number;
  quantity: number;
}

export interface NoStopMocOrderEntry {
  quantity: number;
}

export interface NoStopBudgetAllocation {
  finalLocQty: number;
  finalMocQty: number;
}

export interface NoStopExecutionData {
  appliedLocRatio: number;
  progressPct: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: NoStopOrderEntry;
  displayMocBuy?: NoStopMocOrderEntry;
  executableLowLoc?: NoStopOrderEntry;
  executableMocBuy?: NoStopMocOrderEntry;
  takeProfit?: NoStopOrderEntry;
}

export interface NoStopIndicatorMathPort {
  calculateMA: (
    prices: number[],
    period: NoStopMovingAveragePeriod,
  ) => number;
  calculateRSI: (prices: number[]) => number;
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

function normalizeTickerSymbol(stock: string): string {
  return stock.trim().toUpperCase();
}

function findTargetHolding(
  trades: TradeInput[],
  targetStock: string,
): ReturnType<typeof calcHoldings>[number] | null {
  const normalizedTargetStock = normalizeTickerSymbol(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  const holdings = calcHoldings(trades);
  return (
    holdings.find(
      (holding) =>
        normalizeTickerSymbol(holding.stock) === normalizedTargetStock,
    ) ?? null
  );
}

function buildRequiredMovingAveragePeriods(
  strategy: NoStopMultiSplitStrategy,
): NoStopMovingAveragePeriod[] {
  if (strategy.alignmentRule == null) {
    return [];
  }

  const periodSet = new Set<NoStopMovingAveragePeriod>();
  periodSet.add(strategy.alignmentRule.shortPeriod);
  periodSet.add(strategy.alignmentRule.longPeriod);

  return Array.from(periodSet).sort((left, right) => left - right);
}

function hasAnyMovingAverageValues(
  snapshot: NoStopIndicatorSnapshot,
): boolean {
  if (snapshot.maByPeriod == null) {
    return false;
  }

  return Object.values(snapshot.maByPeriod).some((value) =>
    isValidIndicatorScalar(value),
  );
}

function buildOrderEntry(
  price: number,
  quantity: number,
): NoStopOrderEntry | undefined {
  const finalQuantity = floorSafeQuantity(quantity);
  if (!areStrictPositiveFiniteScalars(price) || finalQuantity < 1) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: finalQuantity,
  };
}

export function buildDisplayOrderEntry(
  price: number,
  quantity: number,
): NoStopOrderEntry | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: Math.max(0, floorSafeQuantity(quantity)),
  };
}

export function buildDisplayQuantityOnlyOrder(
  quantity: number,
): NoStopMocOrderEntry {
  return {
    quantity: Math.max(0, floorSafeQuantity(quantity)),
  };
}

export function deriveExecutableOrder<T extends { quantity: number }>(
  displayOrder?: T,
): T | undefined {
  return displayOrder != null && displayOrder.quantity >= 1
    ? displayOrder
    : undefined;
}

function getMatchedLocRatios(args: {
  strategy: NoStopMultiSplitStrategy;
  snapshot: NoStopIndicatorSnapshot;
}): NoStopLocRatioPreset[] {
  const matchedLocRatios: NoStopLocRatioPreset[] = [];
  const { strategy, snapshot } = args;

  if (
    strategy.rsiRule != null &&
    isValidIndicatorScalar(snapshot.rsi) &&
    snapshot.rsi < strategy.rsiRule.threshold
  ) {
    matchedLocRatios.push(strategy.rsiRule.locRatio);
  }

  if (strategy.alignmentRule == null || !hasAnyMovingAverageValues(snapshot)) {
    return matchedLocRatios;
  }

  const shortValue =
    snapshot.maByPeriod?.[strategy.alignmentRule.shortPeriod];
  const longValue =
    snapshot.maByPeriod?.[strategy.alignmentRule.longPeriod];

  if (
    isValidIndicatorScalar(shortValue) &&
    isValidIndicatorScalar(longValue) &&
    shortValue > longValue
  ) {
    matchedLocRatios.push(strategy.alignmentRule.locRatio);
  }

  return matchedLocRatios;
}

export function floorSafeQuantity(value: number): number {
  if (!isFiniteNonNegativeNumber(value)) {
    return 0;
  }

  return floorToNonNegativeInt(value);
}

export function isValidIndicatorScalar(
  value: number | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function collectIndicatorRequirements(
  strategy: NoStopMultiSplitStrategy,
): IndicatorRequirements {
  return {
    needsRsi: strategy.rsiRule != null,
    maPeriods: buildRequiredMovingAveragePeriods(strategy),
  };
}

export function buildSummaryIndicatorSnapshot(args: {
  prices: number[];
  requirements: IndicatorRequirements;
  sharedMath: NoStopIndicatorMathPort;
}): NoStopIndicatorSnapshot {
  if (args.prices == null || args.prices.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const currentPrice = args.prices[args.prices.length - 1];
  validateFinancialArgs(
    { currentPrice },
    {
      currentPrice: { strictPositive: true },
    },
    'buildSummaryIndicatorSnapshot',
  );

  const snapshot: NoStopIndicatorSnapshot = {
    currentPrice,
  };

  if (args.requirements.needsRsi) {
    snapshot.rsi = args.sharedMath.calculateRSI(args.prices);
  }

  if (args.requirements.maPeriods.length > 0) {
    const maByPeriod: Partial<Record<NoStopMovingAveragePeriod, number>> = {};

    for (const period of args.requirements.maPeriods) {
      maByPeriod[period] = args.sharedMath.calculateMA(args.prices, period);
    }

    snapshot.maByPeriod = maByPeriod;
  }

  return snapshot;
}

export function resolveAppliedLocRatio(
  strategy: NoStopMultiSplitStrategy,
  snapshot: NoStopIndicatorSnapshot,
): number {
  const matchedLocRatios = getMatchedLocRatios({ strategy, snapshot });
  if (matchedLocRatios.length === 0) {
    return strategy.baseLocRatio;
  }

  return matchedLocRatios.reduce<NoStopLocRatioPreset>(
    (currentMax, locRatio) =>
      locRatio > currentMax ? locRatio : currentMax,
    matchedLocRatios[0],
  );
}

export function calculateMocQuantity(args: {
  mocBudget: number;
  currentPrice: number;
}): number {
  validateFinancialArgs(
    {
      mocBudget: args.mocBudget,
      currentPrice: args.currentPrice,
    },
    {
      mocBudget: { min: 0 },
      currentPrice: { strictPositive: true },
    },
    'calculateMocQuantity',
  );

  return floorSafeQuantity(
    args.mocBudget / (args.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER),
  );
}

export function calculateMocFirstRemainingToLocAllocation(args: {
  oneTimeAmount: number;
  feeRate: number;
  avgPrice: number;
  currentPrice: number;
  appliedLocRatio: number;
}): NoStopBudgetAllocation {
  validateFinancialArgs(
    args,
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      avgPrice: { strictPositive: true },
      currentPrice: { strictPositive: true },
      appliedLocRatio: { min: 0 },
    },
    'calculateMocFirstRemainingToLocAllocation',
  );

  // 중앙 validator가 max를 지원하기 전까지는 상한 가드를 명시적으로 유지합니다.
  if (args.appliedLocRatio > 100) {
    throw new Error(
      'calculateMocFirstRemainingToLocAllocation.appliedLocRatio must be <= 100',
    );
  }

  const locUnitCost = args.avgPrice * (1 + args.feeRate / PERCENT_DENOMINATOR);
  const mocUnitCost =
    args.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
  const baseLocBudget =
    args.oneTimeAmount * (args.appliedLocRatio / PERCENT_DENOMINATOR);
  const baseMocBudget = Math.max(0, args.oneTimeAmount - baseLocBudget);
  const finalMocQty = floorSafeQuantity(baseMocBudget / mocUnitCost);
  const usedMocCost = finalMocQty * mocUnitCost;
  const remainingForLoc = Math.max(0, args.oneTimeAmount - usedMocCost);
  const finalLocQty = floorSafeQuantity(remainingForLoc / locUnitCost);

  return {
    finalLocQty,
    finalMocQty,
  };
}

export function calculateNoStopProgressPct(args: {
  totalInvested: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  validateFinancialArgs(
    {
      totalInvested: args.totalInvested,
      oneTimeAmount: args.oneTimeAmount,
      totalSplitCount: args.totalSplitCount,
    },
    {
      totalInvested: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateNoStopProgressPct',
  );

  const totalSeed = args.oneTimeAmount * args.totalSplitCount;
  if (!areStrictPositiveFiniteScalars(totalSeed)) {
    return MIN_PROGRESS_PERCENT;
  }

  const rawProgressPct =
    (args.totalInvested / totalSeed) * PERCENT_DENOMINATOR;
  const boundedProgressPct = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, rawProgressPct),
  );

  return roundMoney(boundedProgressPct);
}

export function calculateNoStopExecution(args: {
  trades: TradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  snapshot: NoStopIndicatorSnapshot;
  strategy: NoStopMultiSplitStrategy;
}): NoStopExecutionData {
  validateFinancialArgs(
    {
      oneTimeAmount: args.oneTimeAmount,
      feeRate: args.feeRate,
      currentPrice: args.snapshot.currentPrice,
      baseLocRatio: args.strategy.baseLocRatio,
      takeProfitPct: args.strategy.takeProfitPct,
      totalSplitCount: args.strategy.totalSplitCount,
    },
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      currentPrice: { strictPositive: true },
      baseLocRatio: { min: 0 },
      takeProfitPct: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'calculateNoStopExecution',
  );

  const targetHolding = findTargetHolding(
    args.trades,
    args.strategy.targetStock,
  );
  const totalInvested = targetHolding?.totalCost ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const progressPct = calculateNoStopProgressPct({
    totalInvested,
    oneTimeAmount: args.oneTimeAmount,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const totalSeed = args.oneTimeAmount * args.strategy.totalSplitCount;
  const isFirstBuy =
    currentQuantity <= HOLDINGS_QTY_EPSILON || avgPrice <= HOLDINGS_QTY_EPSILON;
  const isSplitComplete =
    totalInvested + HOLDINGS_QTY_EPSILON >= totalSeed;
  const appliedLocRatio = resolveAppliedLocRatio(
    args.strategy,
    args.snapshot,
  );

  const result: NoStopExecutionData = {
    appliedLocRatio,
    progressPct,
    isFirstBuy,
    isSplitComplete,
  };

  if (isFirstBuy) {
    return result;
  }

  result.takeProfit = buildOrderEntry(
    avgPrice * (1 + args.strategy.takeProfitPct / PERCENT_DENOMINATOR),
    currentQuantity,
  );

  if (isSplitComplete || !areStrictPositiveFiniteScalars(avgPrice)) {
    return result;
  }

  const allocation = calculateMocFirstRemainingToLocAllocation({
    oneTimeAmount: args.oneTimeAmount,
    feeRate: args.feeRate,
    avgPrice,
    currentPrice: args.snapshot.currentPrice,
    appliedLocRatio,
  });
  const displayLowLoc = buildDisplayOrderEntry(avgPrice, allocation.finalLocQty);
  const displayMocBuy = buildDisplayQuantityOnlyOrder(allocation.finalMocQty);

  result.displayLowLoc = displayLowLoc;
  result.displayMocBuy = displayMocBuy;
  result.executableLowLoc = deriveExecutableOrder(displayLowLoc);
  result.executableMocBuy = deriveExecutableOrder(displayMocBuy);

  return result;
}

export function calcNoStopCurrentRound(
  trades: TradeInput[],
  oneTimeAmount: number,
  targetStock?: string,
): number {
  if (!areStrictPositiveFiniteScalars(oneTimeAmount)) {
    return 0;
  }

  const hasTargetStock =
    typeof targetStock === 'string' && targetStock.trim().length > 0;
  const totalInvested = hasTargetStock
    ? findTargetHolding(trades, targetStock)?.totalCost ?? 0
    : calcHoldings(trades).reduce(
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

  const targetHolding = findTargetHolding(trades, strategy.targetStock);
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const currentRound = calcNoStopCurrentRound(
    trades,
    oneTimeAmount,
    strategy.targetStock,
  );
  const isFirstBuy = !areStrictPositiveFiniteScalars(
    currentQuantity,
    avgPrice,
  );
  const isSplitComplete = currentRound >= strategy.totalSplitCount;

  const result: NoStopMultiSplitExecutionData = {
    currentRound,
    isFirstBuy,
    isSplitComplete,
  };

  if (isFirstBuy) {
    return result;
  }

  const takeProfitPrice =
    avgPrice * (1 + strategy.takeProfitPct / PERCENT_DENOMINATOR);
  result.takeProfit = buildOrderEntry(takeProfitPrice, currentQuantity);

  if (
    isSplitComplete ||
    !areStrictPositiveFiniteScalars(currentPrice, oneTimeAmount)
  ) {
    return result;
  }

  const lowPrice = avgPrice;
  const lowBudgetMax =
    oneTimeAmount * (strategy.lowLocBudgetRatio / PERCENT_DENOMINATOR);
  const lowQuantity = floorSafeQuantity(
    lowBudgetMax /
      (lowPrice * (1 + feeRate / PERCENT_DENOMINATOR)),
  );
  const usedLowBudget =
    lowQuantity * lowPrice * (1 + feeRate / PERCENT_DENOMINATOR);
  const highBudget = Math.max(0, oneTimeAmount - usedLowBudget);
  const highPrice =
    currentPrice *
    (1 + strategy.highLocPremiumPct / PERCENT_DENOMINATOR);
  const highQuantity = floorSafeQuantity(
    highBudget /
      (highPrice * (1 + feeRate / PERCENT_DENOMINATOR)),
  );

  result.lowLoc = buildOrderEntry(lowPrice, lowQuantity);
  result.highLoc = buildOrderEntry(highPrice, highQuantity);

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
