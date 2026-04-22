/**
 * Smart Split 공용 계산 모듈.
 *
 * 프론트엔드 `utils/multiSplitCalc.ts`를 SSOT로 삼아
 * 클라이언트 훅과 서버 요약기가 동일한 순수 함수를 공유합니다.
 */

import type {
  IndicatorRequirements,
  MultiSplitIndicatorSnapshot,
  MultiSplitMovingAveragePeriod,
  MultiSplitStrategy,
} from './types.ts';
import { validateFinancialArgs } from './vrBandStrategy.ts';

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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export const PERCENT_DENOMINATOR = 100;
export const MIN_PROGRESS_PERCENT = 0;
export const MAX_PROGRESS_PERCENT = 100;
export const MOC_SAFETY_BUFFER_MULTIPLIER = 1.15;
export const MIN_MAIN_TAKE_PROFIT_RATIO_PCT = 1;
export const MAX_MAIN_TAKE_PROFIT_RATIO_PCT = 100;
export const MIN_RISK_CUT_RATIO_PCT = 0;
export const MAX_RISK_CUT_RATIO_PCT = 100;
export const MIN_LOC_RATIO_PCT = 0;
export const MAX_LOC_RATIO_PCT = 100;
export const DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT = 5;
export const MIN_MAIN_RETURN_RATE_PCT = 10;
export const MAX_MAIN_RETURN_RATE_PCT = 100;
export const MIN_INTERMEDIATE_RETURN_RATE_PCT = 1;
export const MAX_INTERMEDIATE_RETURN_RATE_PCT = 10;
const MIN_VALID_UNIT_COST = Number.EPSILON;

export interface MultiSplitRsiConditionPresetDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: string;
}

export interface MultiSplitDisplayOrder {
  price: number;
  quantity: number;
}

export interface MultiSplitDisplayQuantityOnlyOrder {
  quantity: number;
}

export interface NormalizedMultiSplitReturnRates {
  targetReturnRate: number;
  intermediateReturnRate: number;
  didClamp: boolean;
}

export interface MultiSplitBuyGuide {
  appliedLocRatioPct: number;
  displayLocBuy?: MultiSplitDisplayOrder;
  displayMocBuy?: MultiSplitDisplayQuantityOnlyOrder;
}

export interface MultiSplitSellGuide {
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  riskCutQty: number;
  displayMainTakeProfit?: MultiSplitDisplayOrder;
  displayIntermediateTakeProfit?: MultiSplitDisplayOrder;
}

export interface MultiSplitGuideState {
  cashUsagePct: number;
  totalInvested: number;
  totalSeed: number;
  remainingBudget: number;
  currentQuantity: number;
  avgPrice: number;
  isFirstBuy: boolean;
  isSeedExhausted: boolean;
  appliedLocRatioPct: number;
  displayLocBuy?: MultiSplitDisplayOrder;
  displayMocBuy?: MultiSplitDisplayQuantityOnlyOrder;
  sellGuide: MultiSplitSellGuide;
}

export function validatePercentRange(args: {
  name: string;
  value: number;
  min: number;
  max: number;
  context: string;
}): void {
  validateFinancialArgs(
    { [args.name]: args.value },
    { [args.name]: { min: args.min } },
    args.context,
  );

  // 중앙 validator가 상한(max)을 아직 지원하지 않으므로
  // production 경로에서도 상한 가드를 이 helper 한 곳으로만 집중시킵니다.
  if (args.value > args.max) {
    throw new Error(
      `${args.context}.${args.name} must be <= ${args.max}. Received: ${args.value}`,
    );
  }
}

export function validateMultiSplitReturnRates(args: {
  targetReturnRate: number;
  intermediateReturnRate: number;
  context: string;
}): void {
  validatePercentRange({
    name: 'targetReturnRate',
    value: args.targetReturnRate,
    min: MIN_MAIN_RETURN_RATE_PCT,
    max: MAX_MAIN_RETURN_RATE_PCT,
    context: args.context,
  });
  validatePercentRange({
    name: 'intermediateReturnRate',
    value: args.intermediateReturnRate,
    min: MIN_INTERMEDIATE_RETURN_RATE_PCT,
    max: MAX_INTERMEDIATE_RETURN_RATE_PCT,
    context: args.context,
  });
}

function clampFiniteNumberToRange(args: {
  value: number;
  min: number;
  max: number;
  context: string;
}): { value: number; didClamp: boolean } {
  validateFinancialArgs(
    {
      min: args.min,
      max: args.max,
    },
    {
      min: { min: 0 },
      max: { strictPositive: true },
    },
    args.context,
  );

  if (!Number.isFinite(args.value)) {
    throw new Error(
      `${args.context}.value must be a finite number. Received: ${args.value}`,
    );
  }

  if (args.min > args.max) {
    throw new Error(
      `${args.context}.min must be <= max. Received: ${args.min} > ${args.max}`,
    );
  }

  const clampedValue = Math.min(args.max, Math.max(args.min, args.value));
  return {
    value: clampedValue,
    didClamp: clampedValue !== args.value,
  };
}

export function normalizeMultiSplitReturnRates(args: {
  targetReturnRate: number;
  intermediateReturnRate: number;
}): NormalizedMultiSplitReturnRates {
  const normalizedTargetReturnRate = clampFiniteNumberToRange({
    value: args.targetReturnRate,
    min: MIN_MAIN_RETURN_RATE_PCT,
    max: MAX_MAIN_RETURN_RATE_PCT,
    context: 'normalizeMultiSplitReturnRates.targetReturnRate',
  });
  const normalizedIntermediateReturnRate = clampFiniteNumberToRange({
    value: args.intermediateReturnRate,
    min: MIN_INTERMEDIATE_RETURN_RATE_PCT,
    max: MAX_INTERMEDIATE_RETURN_RATE_PCT,
    context: 'normalizeMultiSplitReturnRates.intermediateReturnRate',
  });

  return {
    targetReturnRate: normalizedTargetReturnRate.value,
    intermediateReturnRate: normalizedIntermediateReturnRate.value,
    didClamp:
      normalizedTargetReturnRate.didClamp ||
      normalizedIntermediateReturnRate.didClamp,
  };
}

export function floorSafeQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return floorToNonNegativeInt(value);
}

function roundSafeQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.max(0, Math.round(value + Number.EPSILON));
}

export function normalizeTickerSymbol(stock: string): string {
  return stock.trim().toUpperCase();
}

export function findTargetHolding(
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
      (holding) => normalizeTickerSymbol(holding.stock) === normalizedTargetStock,
    ) ?? null
  );
}

export function isValidIndicatorScalar(
  value: number | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildRequiredMovingAveragePeriods(
  strategy: MultiSplitStrategy,
): MultiSplitMovingAveragePeriod[] {
  if (strategy.alignmentRule == null) {
    return [];
  }

  return [
    strategy.alignmentRule.shortPeriod,
    strategy.alignmentRule.longPeriod,
  ];
}

export function collectIndicatorRequirements(
  strategy: MultiSplitStrategy,
): IndicatorRequirements {
  return {
    needsRsi: strategy.rsiRule != null,
    maPeriods: buildRequiredMovingAveragePeriods(strategy),
  };
}

export function getMatchedLocRatios(args: {
  strategy: MultiSplitStrategy;
  snapshot: MultiSplitIndicatorSnapshot;
}): number[] {
  const matchedLocRatios: number[] = [];
  const { strategy, snapshot } = args;

  if (
    strategy.rsiRule != null &&
    isValidIndicatorScalar(snapshot.rsi) &&
    snapshot.rsi < strategy.rsiRule.threshold
  ) {
    matchedLocRatios.push(strategy.rsiRule.locRatio);
  }

  if (strategy.alignmentRule == null || snapshot.maByPeriod == null) {
    return matchedLocRatios;
  }

  const shortValue = snapshot.maByPeriod?.[strategy.alignmentRule.shortPeriod];
  const longValue = snapshot.maByPeriod?.[strategy.alignmentRule.longPeriod];

  if (
    isValidIndicatorScalar(shortValue) &&
    isValidIndicatorScalar(longValue) &&
    shortValue > longValue
  ) {
    matchedLocRatios.push(strategy.alignmentRule.locRatio);
  }

  return matchedLocRatios;
}

export function resolveAppliedLocRatio(
  strategy: MultiSplitStrategy,
  snapshot: MultiSplitIndicatorSnapshot,
): number {
  validatePercentRange({
    name: 'baseLocRatio',
    value: strategy.baseLocRatio,
    min: MIN_LOC_RATIO_PCT,
    max: MAX_LOC_RATIO_PCT,
    context: 'resolveAppliedLocRatio',
  });

  const matchedLocRatios = getMatchedLocRatios({ strategy, snapshot });
  if (matchedLocRatios.length === 0) {
    return strategy.baseLocRatio;
  }

  return Math.max(...matchedLocRatios);
}

export function calculateMultiSplitCashUsagePct(args: {
  investedCost: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  validateFinancialArgs(
    {
      investedCost: args.investedCost,
      oneTimeAmount: args.oneTimeAmount,
      totalSplitCount: args.totalSplitCount,
    },
    {
      investedCost: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateMultiSplitCashUsagePct',
  );

  const totalSeed = roundMoney(args.oneTimeAmount * args.totalSplitCount);
  if (totalSeed <= 0) {
    return MIN_PROGRESS_PERCENT;
  }

  const rawUsagePct = (args.investedCost / totalSeed) * PERCENT_DENOMINATOR;
  const boundedUsagePct = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, rawUsagePct),
  );

  return roundMoney(boundedUsagePct);
}

export function calculateRemainingBudget(args: {
  oneTimeAmount: number;
  totalInvested: number;
  totalSplitCount: number;
}): number {
  validateFinancialArgs(
    {
      oneTimeAmount: args.oneTimeAmount,
      totalInvested: args.totalInvested,
      totalSplitCount: args.totalSplitCount,
    },
    {
      oneTimeAmount: { strictPositive: true },
      totalInvested: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'calculateRemainingBudget',
  );

  const totalSeed = roundMoney(args.oneTimeAmount * args.totalSplitCount);
  return roundMoney(Math.max(0, totalSeed - args.totalInvested));
}

export function buildDisplayOrder(
  price: number,
  quantity: number,
): MultiSplitDisplayOrder | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  const safeQuantity = Math.max(0, floorSafeQuantity(quantity));
  return {
    price: roundMoney(price),
    quantity: safeQuantity,
  };
}

export function buildDisplayQuantityOnlyOrder(
  quantity: number,
): MultiSplitDisplayQuantityOnlyOrder {
  const safeQuantity = Math.max(0, floorSafeQuantity(quantity));

  return {
    quantity: safeQuantity,
  };
}

function buildTakeProfitPrice(args: {
  avgPrice: number;
  returnRate: number;
  context: string;
}): number {
  validateFinancialArgs(
    {
      avgPrice: args.avgPrice,
      returnRate: args.returnRate,
    },
    {
      avgPrice: { strictPositive: true },
      returnRate: { min: 0 },
    },
    args.context,
  );

  return roundMoney(
    args.avgPrice * (1 + args.returnRate / PERCENT_DENOMINATOR),
  );
}

function buildTakeProfitDisplayOrder(args: {
  avgPrice: number;
  returnRate: number;
  quantity: number;
  context: string;
}): MultiSplitDisplayOrder | undefined {
  if (args.avgPrice <= MIN_VALID_UNIT_COST) {
    return undefined;
  }

  const takeProfitPrice = buildTakeProfitPrice({
    avgPrice: args.avgPrice,
    returnRate: args.returnRate,
    context: args.context,
  });

  return buildDisplayOrder(takeProfitPrice, args.quantity);
}

export function calculateMultiSplitBuyGuide(args: {
  buyTrancheBudget: number;
  feeRate: number;
  avgPrice: number;
  snapshot: MultiSplitIndicatorSnapshot;
  strategy: MultiSplitStrategy;
}): MultiSplitBuyGuide {
  validateFinancialArgs(
    {
      buyTrancheBudget: args.buyTrancheBudget,
      feeRate: args.feeRate,
      avgPrice: args.avgPrice,
      currentPrice: args.snapshot.currentPrice,
    },
    {
      buyTrancheBudget: { min: 0 },
      feeRate: { min: 0 },
      avgPrice: { strictPositive: true },
      currentPrice: { strictPositive: true },
    },
    'calculateMultiSplitBuyGuide',
  );

  const appliedLocRatioPct = resolveAppliedLocRatio(
    args.strategy,
    args.snapshot,
  );
  const locUnitCost = args.avgPrice * (1 + args.feeRate / PERCENT_DENOMINATOR);
  // [의도된 생략] MOC_SAFETY_BUFFER_MULTIPLIER(1.15)가 이미 15% 버퍼를 제공하므로,
  // 통상적인 feeRate(0.25% 등) 때문에 예산 초과가 나지 않아 MOC 쪽 feeRate는 더하지 않습니다.
  const mocUnitCost = args.snapshot.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
  // Corrupted near-zero price inputs must not reach a division path.
  if (
    locUnitCost <= MIN_VALID_UNIT_COST ||
    mocUnitCost <= MIN_VALID_UNIT_COST
  ) {
    return {
      appliedLocRatioPct,
    };
  }
  const baseLocBudget =
    args.buyTrancheBudget * (appliedLocRatioPct / PERCENT_DENOMINATOR);
  const baseMocBudget = Math.max(0, args.buyTrancheBudget - baseLocBudget);
  // floorSafeQuantity -> floorToNonNegativeInt already adds Number.EPSILON,
  // so integer-share boundaries like 0.3 / 0.1 ~= 2.9999999999999996 do not drop a share.
  const finalMocQty = floorSafeQuantity(baseMocBudget / mocUnitCost);
  const usedMocCost = finalMocQty * mocUnitCost;
  const remainingForLoc = Math.max(0, args.buyTrancheBudget - usedMocCost);
  const finalLocQty = floorSafeQuantity(remainingForLoc / locUnitCost);

  return {
    appliedLocRatioPct,
    displayLocBuy: buildDisplayOrder(args.avgPrice, finalLocQty),
    displayMocBuy: buildDisplayQuantityOnlyOrder(finalMocQty),
  };
}

export function calculateMultiSplitSellGuide(args: {
  currentQuantity: number;
  avgPrice: number;
  targetReturnRate: number;
  intermediateReturnRate: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}): MultiSplitSellGuide {
  validateFinancialArgs(
    {
      currentQuantity: args.currentQuantity,
    },
    {
      currentQuantity: { min: 0 },
    },
    'calculateMultiSplitSellGuide',
  );
  validatePercentRange({
    name: 'mainTakeProfitRatioPct',
    value: args.mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuide',
  });
  validatePercentRange({
    name: 'riskCutRatioPct',
    value: args.riskCutRatioPct,
    min: MIN_RISK_CUT_RATIO_PCT,
    max: MAX_RISK_CUT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuide',
  });
  validateMultiSplitReturnRates({
    targetReturnRate: args.targetReturnRate,
    intermediateReturnRate: args.intermediateReturnRate,
    context: 'calculateMultiSplitSellGuide',
  });

  const safeQuantity = floorSafeQuantity(args.currentQuantity);
  if (safeQuantity <= 0) {
    return {
      mainTakeProfitQty: 0,
      intermediateTakeProfitQty: 0,
      riskCutQty: 0,
    };
  }

  const rawMainTakeProfitQty =
    safeQuantity * (args.mainTakeProfitRatioPct / PERCENT_DENOMINATOR);
  const roundedMainTakeProfitQty = roundSafeQuantity(rawMainTakeProfitQty);
  const mainTakeProfitQty = Math.min(safeQuantity, roundedMainTakeProfitQty);
  // 정수 수량으로 떨어질 때는 더 가까운 비율 쪽으로 반올림해 한 주 왜곡을 줄입니다.
  const intermediateTakeProfitQty = Math.max(
    0,
    safeQuantity - mainTakeProfitQty,
  );
  // 리스크 컷은 익절과 동시 집행이 아니라 대체 시나리오이므로 별도 수량으로 계산합니다.
  const riskCutQty = floorSafeQuantity(
    safeQuantity * (args.riskCutRatioPct / PERCENT_DENOMINATOR),
  );

  return {
    mainTakeProfitQty,
    intermediateTakeProfitQty,
    riskCutQty,
    displayMainTakeProfit: buildTakeProfitDisplayOrder({
      avgPrice: args.avgPrice,
      returnRate: args.targetReturnRate,
      quantity: mainTakeProfitQty,
      context: 'calculateMultiSplitSellGuide.displayMainTakeProfit',
    }),
    displayIntermediateTakeProfit: buildTakeProfitDisplayOrder({
      avgPrice: args.avgPrice,
      returnRate: args.intermediateReturnRate,
      quantity: intermediateTakeProfitQty,
      context: 'calculateMultiSplitSellGuide.displayIntermediateTakeProfit',
    }),
  };
}

export function calculateMultiSplitGuideState(args: {
  trades: TradeInput[];
  strategy: MultiSplitStrategy;
  oneTimeAmount: number;
  feeRate: number;
  snapshot: MultiSplitIndicatorSnapshot;
}): MultiSplitGuideState {
  const normalizedReturnRates = normalizeMultiSplitReturnRates({
    targetReturnRate: isFiniteNumber(args.strategy.targetReturnRate)
      ? args.strategy.targetReturnRate
      : MIN_MAIN_RETURN_RATE_PCT,
    intermediateReturnRate: isFiniteNumber(args.strategy.intermediateReturnRate)
      ? args.strategy.intermediateReturnRate
      : DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
  });
  validateMultiSplitReturnRates({
    targetReturnRate: normalizedReturnRates.targetReturnRate,
    intermediateReturnRate: normalizedReturnRates.intermediateReturnRate,
    context: 'calculateMultiSplitGuideState',
  });
  validateFinancialArgs(
    {
      oneTimeAmount: args.oneTimeAmount,
      totalSplitCount: args.strategy.totalSplitCount,
      feeRate: args.feeRate,
      currentPrice: args.snapshot.currentPrice,
    },
    {
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
      feeRate: { min: 0 },
      currentPrice: { strictPositive: true },
    },
    'calculateMultiSplitGuideState',
  );

  const targetHolding = findTargetHolding(args.trades, args.strategy.targetStock);
  const totalInvested = roundMoney(Math.max(0, targetHolding?.totalCost ?? 0));
  const currentQuantity = Math.max(0, targetHolding?.quantity ?? 0);
  const avgPrice = Math.max(0, targetHolding?.avgPrice ?? 0);
  const totalSeed = roundMoney(
    args.oneTimeAmount * args.strategy.totalSplitCount,
  );
  const cashUsagePct = calculateMultiSplitCashUsagePct({
    investedCost: totalInvested,
    oneTimeAmount: args.oneTimeAmount,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const remainingBudget = calculateRemainingBudget({
    oneTimeAmount: args.oneTimeAmount,
    totalInvested,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const isFirstBuy =
    currentQuantity <= HOLDINGS_QTY_EPSILON || avgPrice <= MIN_VALID_UNIT_COST;
  const isSeedExhausted = totalInvested >= totalSeed;
  const appliedLocRatioPct = resolveAppliedLocRatio(
    args.strategy,
    args.snapshot,
  );
  const sellGuide = calculateMultiSplitSellGuide({
    currentQuantity,
    avgPrice,
    targetReturnRate: normalizedReturnRates.targetReturnRate,
    intermediateReturnRate: normalizedReturnRates.intermediateReturnRate,
    mainTakeProfitRatioPct: args.strategy.mainTakeProfitRatioPct,
    riskCutRatioPct: args.strategy.riskCutRatioPct,
  });

  const baseState: MultiSplitGuideState = {
    cashUsagePct,
    totalInvested,
    totalSeed,
    remainingBudget,
    currentQuantity,
    avgPrice,
    isFirstBuy,
    isSeedExhausted,
    appliedLocRatioPct,
    sellGuide,
  };

  if (isFirstBuy || isSeedExhausted) {
    return baseState;
  }

  // remainingBudget은 전체 시드 잔액(totalSeed - 투입 원가)이지만, LOC/MOC는 매 회차마다
  // 1회 매수금(oneTimeAmount) 한도 내에서만 집행·표시되어야 한다(마지막 회차만 잔액 미만 가능).
  const buyTrancheBudget = roundMoney(
    Math.min(args.oneTimeAmount, remainingBudget),
  );

  const buyGuide = calculateMultiSplitBuyGuide({
    buyTrancheBudget,
    feeRate: args.feeRate,
    avgPrice,
    snapshot: args.snapshot,
    strategy: args.strategy,
  });

  return {
    ...baseState,
    appliedLocRatioPct: buyGuide.appliedLocRatioPct,
    displayLocBuy: buyGuide.displayLocBuy,
    displayMocBuy: buyGuide.displayMocBuy,
  };
}
