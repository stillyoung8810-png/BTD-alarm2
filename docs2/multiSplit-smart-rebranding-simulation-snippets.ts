import { calcHoldings, type TradeInput } from '../utils/multiSplitCalc';
import {
  HOLDINGS_QTY_EPSILON,
  floorToNonNegativeInt,
  roundMoney,
} from '../utils/financialMath';
import { validateFinancialArgs } from '../utils/vrBandStrategy';

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
const MONEY_DECIMAL_PLACES = 2;
const MIN_VALID_UNIT_COST = Number.EPSILON;

export const BUDGET_LOC_RATIO_BY_PRESET = {
  loc70: 70,
  balanced: 50,
  moc70: 30,
} as const;

export const RSI_THRESHOLD_BY_PRESET = {
  rsi30: 30,
  rsi40: 40,
  rsi50: 50,
} as const;

export const ALIGNMENT_PERIODS_BY_PRESET = {
  ma5_20: { shortPeriod: 5, longPeriod: 20 },
  ma20_60: { shortPeriod: 20, longPeriod: 60 },
  ma60_120: { shortPeriod: 60, longPeriod: 120 },
} as const;

export type MultiSplitSimulationLang = 'ko' | 'en';
export type MultiSplitBudgetPresetId = keyof typeof BUDGET_LOC_RATIO_BY_PRESET;
export type MultiSplitRsiPresetId = keyof typeof RSI_THRESHOLD_BY_PRESET;
export type MultiSplitAlignmentPresetId =
  keyof typeof ALIGNMENT_PERIODS_BY_PRESET;
export type MultiSplitMovingAveragePeriod = 5 | 20 | 60 | 120;

type MultiSplitSimulationMessageId =
  | 'multiSplit.cashUsage'
  | 'multiSplit.locBuy'
  | 'multiSplit.mocBuy'
  | 'multiSplit.mainTakeProfit'
  | 'multiSplit.intermediateTakeProfit'
  | 'multiSplit.riskCut'
  | 'format.percentLabel'
  | 'format.priceQuantity'
  | 'format.quantityOnly'
  | 'common.sharesUnit';

type MultiSplitSimulationMessageMap = Record<
  MultiSplitSimulationMessageId,
  string
>;

const MULTI_SPLIT_SIMULATION_MESSAGES: Record<
  MultiSplitSimulationLang,
  MultiSplitSimulationMessageMap
> = {
  ko: {
    'multiSplit.cashUsage': '현금 사용률',
    'multiSplit.locBuy': '평단가 매수 (LOC)',
    'multiSplit.mocBuy': '분할 매수 (MOC)',
    'multiSplit.mainTakeProfit': '메인 익절',
    'multiSplit.intermediateTakeProfit': '중간 익절',
    'multiSplit.riskCut': '리스크 컷',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': '주',
  },
  en: {
    'multiSplit.cashUsage': 'Cash Usage',
    'multiSplit.locBuy': 'Average-price buy (LOC)',
    'multiSplit.mocBuy': 'Split buy (MOC)',
    'multiSplit.mainTakeProfit': 'Main take profit',
    'multiSplit.intermediateTakeProfit': 'Intermediate take profit',
    'multiSplit.riskCut': 'Risk cut',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': ' shares',
  },
};

export interface MultiSplitConditionPresetDraftSim<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: MultiSplitBudgetPresetId;
}

export interface MultiSplitStrategyDraftSim {
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
  rsiCondition?: MultiSplitConditionPresetDraftSim<MultiSplitRsiPresetId>;
  alignmentCondition?: MultiSplitConditionPresetDraftSim<MultiSplitAlignmentPresetId>;
}

export interface MultiSplitRsiRuleSim {
  threshold: number;
  locRatio: number;
}

export interface MultiSplitAlignmentRuleSim {
  shortPeriod: MultiSplitMovingAveragePeriod;
  longPeriod: MultiSplitMovingAveragePeriod;
  locRatio: number;
}

export interface MultiSplitRuntimeStrategySim {
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
  rsiRule?: MultiSplitRsiRuleSim;
  alignmentRule?: MultiSplitAlignmentRuleSim;
}

export interface MultiSplitIndicatorSnapshotSim {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<MultiSplitMovingAveragePeriod, number>>;
}

export interface MultiSplitSellGuideSim {
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  riskCutQty: number;
}

export interface MultiSplitDisplayOrderSim {
  price: number;
  quantity: number;
}

export interface MultiSplitDisplayQuantityOnlyOrderSim {
  quantity: number;
}

export interface MultiSplitBuyGuideSim {
  appliedLocRatioPct: number;
  displayLocBuy?: MultiSplitDisplayOrderSim;
  displayMocBuy?: MultiSplitDisplayQuantityOnlyOrderSim;
}

export interface MultiSplitGuideStateSim {
  cashUsagePct: number;
  totalInvested: number;
  totalSeed: number;
  remainingBudget: number;
  currentQuantity: number;
  avgPrice: number;
  isFirstBuy: boolean;
  isSeedExhausted: boolean;
  appliedLocRatioPct: number;
  displayLocBuy?: MultiSplitDisplayOrderSim;
  displayMocBuy?: MultiSplitDisplayQuantityOnlyOrderSim;
  sellGuide: MultiSplitSellGuideSim;
}

export function validatePercentRangeSim(args: {
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
  // 문서/시뮬레이션에서는 상한 가드를 한 곳으로만 집중시킵니다.
  if (args.value > args.max) {
    throw new Error(
      `${args.context}.${args.name} must be <= ${args.max}. Received: ${args.value}`,
    );
  }
}

export function floorSafeQuantitySim(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return floorToNonNegativeInt(value);
}

function roundSafeQuantitySim(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.max(0, Math.round(value + Number.EPSILON));
}

export function normalizeTickerSymbolSim(stock: string): string {
  return stock.trim().toUpperCase();
}

export function findTargetHoldingSim(
  trades: TradeInput[],
  targetStock: string,
): ReturnType<typeof calcHoldings>[number] | null {
  const normalizedTargetStock = normalizeTickerSymbolSim(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  const holdings = calcHoldings(trades);
  return (
    holdings.find(
      (holding) =>
        normalizeTickerSymbolSim(holding.stock) === normalizedTargetStock,
    ) ?? null
  );
}

export function deriveMultiSplitIntermediateTakeProfitRatioPctSim(
  mainTakeProfitRatioPct: number,
): number {
  validatePercentRangeSim({
    name: 'mainTakeProfitRatioPct',
    value: mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'deriveMultiSplitIntermediateTakeProfitRatioPctSim',
  });

  return PERCENT_DENOMINATOR - mainTakeProfitRatioPct;
}

export function buildMultiSplitStrategyFromDraftSim(
  draft: MultiSplitStrategyDraftSim,
): MultiSplitRuntimeStrategySim {
  validateFinancialArgs(
    {
      targetReturnRate: draft.targetReturnRate,
      totalSplitCount: draft.totalSplitCount,
    },
    {
      targetReturnRate: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'buildMultiSplitStrategyFromDraftSim',
  );
  validatePercentRangeSim({
    name: 'baseLocRatio',
    value: draft.baseLocRatio,
    min: MIN_LOC_RATIO_PCT,
    max: MAX_LOC_RATIO_PCT,
    context: 'buildMultiSplitStrategyFromDraftSim',
  });
  validatePercentRangeSim({
    name: 'mainTakeProfitRatioPct',
    value: draft.mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'buildMultiSplitStrategyFromDraftSim',
  });
  validatePercentRangeSim({
    name: 'riskCutRatioPct',
    value: draft.riskCutRatioPct,
    min: MIN_RISK_CUT_RATIO_PCT,
    max: MAX_RISK_CUT_RATIO_PCT,
    context: 'buildMultiSplitStrategyFromDraftSim',
  });

  const strategy: MultiSplitRuntimeStrategySim = {
    targetStock: draft.targetStock.trim(),
    targetReturnRate: roundMoney(draft.targetReturnRate),
    totalSplitCount: floorSafeQuantitySim(draft.totalSplitCount),
    baseLocRatio: roundMoney(draft.baseLocRatio),
    mainTakeProfitRatioPct: roundMoney(draft.mainTakeProfitRatioPct),
    riskCutRatioPct: roundMoney(draft.riskCutRatioPct),
  };

  if (draft.rsiCondition?.isEnabled === true) {
    strategy.rsiRule = {
      threshold: RSI_THRESHOLD_BY_PRESET[draft.rsiCondition.criterionPreset],
      locRatio: BUDGET_LOC_RATIO_BY_PRESET[draft.rsiCondition.budgetPreset],
    };
  }

  if (draft.alignmentCondition?.isEnabled === true) {
    const periods =
      ALIGNMENT_PERIODS_BY_PRESET[draft.alignmentCondition.criterionPreset];
    strategy.alignmentRule = {
      shortPeriod: periods.shortPeriod,
      longPeriod: periods.longPeriod,
      locRatio: BUDGET_LOC_RATIO_BY_PRESET[draft.alignmentCondition.budgetPreset],
    };
  }

  return strategy;
}

export function isValidIndicatorScalarSim(
  value: number | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getMatchedLocRatiosSim(args: {
  strategy: MultiSplitRuntimeStrategySim;
  snapshot: MultiSplitIndicatorSnapshotSim;
}): number[] {
  const matchedLocRatios: number[] = [];
  const { strategy, snapshot } = args;

  if (
    strategy.rsiRule != null &&
    isValidIndicatorScalarSim(snapshot.rsi) &&
    snapshot.rsi < strategy.rsiRule.threshold
  ) {
    matchedLocRatios.push(strategy.rsiRule.locRatio);
  }

  if (strategy.alignmentRule == null || snapshot.maByPeriod == null) {
    return matchedLocRatios;
  }

  const shortValue =
    snapshot.maByPeriod?.[strategy.alignmentRule.shortPeriod];
  const longValue =
    snapshot.maByPeriod?.[strategy.alignmentRule.longPeriod];

  if (
    isValidIndicatorScalarSim(shortValue) &&
    isValidIndicatorScalarSim(longValue) &&
    shortValue > longValue
  ) {
    matchedLocRatios.push(strategy.alignmentRule.locRatio);
  }

  return matchedLocRatios;
}

export function resolveAppliedLocRatioSim(
  strategy: MultiSplitRuntimeStrategySim,
  snapshot: MultiSplitIndicatorSnapshotSim,
): number {
  validatePercentRangeSim({
    name: 'baseLocRatio',
    value: strategy.baseLocRatio,
    min: MIN_LOC_RATIO_PCT,
    max: MAX_LOC_RATIO_PCT,
    context: 'resolveAppliedLocRatioSim',
  });

  const matchedLocRatios = getMatchedLocRatiosSim({ strategy, snapshot });
  if (matchedLocRatios.length === 0) {
    return strategy.baseLocRatio;
  }

  return Math.max(...matchedLocRatios);
}

export function calculateMultiSplitCashUsagePctSim(args: {
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
    'calculateMultiSplitCashUsagePctSim',
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

export function calculateRemainingBudgetSim(args: {
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
    'calculateRemainingBudgetSim',
  );

  const totalSeed = roundMoney(args.oneTimeAmount * args.totalSplitCount);
  return roundMoney(Math.max(0, totalSeed - args.totalInvested));
}

export function buildDisplayOrderSim(
  price: number,
  quantity: number,
): MultiSplitDisplayOrderSim | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  const safeQuantity = Math.max(0, floorSafeQuantitySim(quantity));
  if (safeQuantity <= 0) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: safeQuantity,
  };
}

export function buildDisplayQuantityOnlyOrderSim(
  quantity: number,
): MultiSplitDisplayQuantityOnlyOrderSim | undefined {
  const safeQuantity = Math.max(0, floorSafeQuantitySim(quantity));
  if (safeQuantity <= 0) {
    return undefined;
  }

  return {
    quantity: safeQuantity,
  };
}

export function calculateMultiSplitBuyGuideSim(args: {
  buyTrancheBudget: number;
  feeRate: number;
  avgPrice: number;
  snapshot: MultiSplitIndicatorSnapshotSim;
  strategy: MultiSplitRuntimeStrategySim;
}): MultiSplitBuyGuideSim {
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
    'calculateMultiSplitBuyGuideSim',
  );

  const appliedLocRatioPct = resolveAppliedLocRatioSim(
    args.strategy,
    args.snapshot,
  );
  const locUnitCost =
    args.avgPrice * (1 + args.feeRate / PERCENT_DENOMINATOR);
  // [의도된 생략] MOC_SAFETY_BUFFER_MULTIPLIER(1.15)가 이미 15% 버퍼를 제공하므로,
  // 통상적인 feeRate(0.25% 등) 때문에 예산 초과가 나지 않아 MOC 쪽 feeRate는 더하지 않습니다.
  const mocUnitCost =
    args.snapshot.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
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
  // floorSafeQuantitySim -> floorToNonNegativeInt already adds Number.EPSILON,
  // so integer-share boundaries like 0.3 / 0.1 ~= 2.9999999999999996 do not drop a share.
  const finalMocQty = floorSafeQuantitySim(baseMocBudget / mocUnitCost);
  const usedMocCost = finalMocQty * mocUnitCost;
  const remainingForLoc = Math.max(0, args.buyTrancheBudget - usedMocCost);
  const finalLocQty = floorSafeQuantitySim(remainingForLoc / locUnitCost);

  return {
    appliedLocRatioPct,
    displayLocBuy: buildDisplayOrderSim(args.avgPrice, finalLocQty),
    displayMocBuy: buildDisplayQuantityOnlyOrderSim(finalMocQty),
  };
}

export function calculateMultiSplitSellGuideSim(args: {
  currentQuantity: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}): MultiSplitSellGuideSim {
  validateFinancialArgs(
    {
      currentQuantity: args.currentQuantity,
    },
    {
      currentQuantity: { min: 0 },
    },
    'calculateMultiSplitSellGuideSim',
  );
  validatePercentRangeSim({
    name: 'mainTakeProfitRatioPct',
    value: args.mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuideSim',
  });
  validatePercentRangeSim({
    name: 'riskCutRatioPct',
    value: args.riskCutRatioPct,
    min: MIN_RISK_CUT_RATIO_PCT,
    max: MAX_RISK_CUT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuideSim',
  });

  const safeQuantity = floorSafeQuantitySim(args.currentQuantity);
  if (safeQuantity <= 0) {
    return {
      mainTakeProfitQty: 0,
      intermediateTakeProfitQty: 0,
      riskCutQty: 0,
    };
  }

  const rawMainTakeProfitQty =
    safeQuantity * (args.mainTakeProfitRatioPct / PERCENT_DENOMINATOR);
  const roundedMainTakeProfitQty = roundSafeQuantitySim(rawMainTakeProfitQty);
  const mainTakeProfitQty = Math.min(
    safeQuantity,
    roundedMainTakeProfitQty,
  );
  // 정수 수량으로 떨어질 때는 더 가까운 비율 쪽으로 반올림해 한 주 왜곡을 줄입니다.
  const intermediateTakeProfitQty = Math.max(
    0,
    safeQuantity - mainTakeProfitQty,
  );
  // 리스크 컷은 익절과 동시 집행이 아니라 대체 시나리오이므로 별도 수량으로 계산합니다.
  const riskCutQty = floorSafeQuantitySim(
    safeQuantity * (args.riskCutRatioPct / PERCENT_DENOMINATOR),
  );

  return {
    mainTakeProfitQty,
    intermediateTakeProfitQty,
    riskCutQty,
  };
}

export function calculateMultiSplitGuideStateSim(args: {
  trades: TradeInput[];
  strategy: MultiSplitRuntimeStrategySim;
  oneTimeAmount: number;
  feeRate: number;
  snapshot: MultiSplitIndicatorSnapshotSim;
}): MultiSplitGuideStateSim {
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
    'calculateMultiSplitGuideStateSim',
  );

  const targetHolding = findTargetHoldingSim(
    args.trades,
    args.strategy.targetStock,
  );
  const totalInvested = roundMoney(Math.max(0, targetHolding?.totalCost ?? 0));
  const currentQuantity = Math.max(0, targetHolding?.quantity ?? 0);
  const avgPrice = Math.max(0, targetHolding?.avgPrice ?? 0);
  const totalSeed = roundMoney(
    args.oneTimeAmount * args.strategy.totalSplitCount,
  );
  const cashUsagePct = calculateMultiSplitCashUsagePctSim({
    investedCost: totalInvested,
    oneTimeAmount: args.oneTimeAmount,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const remainingBudget = calculateRemainingBudgetSim({
    oneTimeAmount: args.oneTimeAmount,
    totalInvested,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const isFirstBuy =
    currentQuantity <= HOLDINGS_QTY_EPSILON || avgPrice <= MIN_VALID_UNIT_COST;
  const isSeedExhausted = totalInvested >= totalSeed;
  const appliedLocRatioPct = resolveAppliedLocRatioSim(
    args.strategy,
    args.snapshot,
  );
  const sellGuide = calculateMultiSplitSellGuideSim({
    currentQuantity,
    mainTakeProfitRatioPct: args.strategy.mainTakeProfitRatioPct,
    riskCutRatioPct: args.strategy.riskCutRatioPct,
  });

  const baseState: MultiSplitGuideStateSim = {
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

  const buyTrancheBudget = roundMoney(
    Math.min(args.oneTimeAmount, remainingBudget),
  );

  const buyGuide = calculateMultiSplitBuyGuideSim({
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

export function getMultiSplitSimulationMessages(
  lang: MultiSplitSimulationLang,
): MultiSplitSimulationMessageMap {
  return (
    MULTI_SPLIT_SIMULATION_MESSAGES[lang] ??
    MULTI_SPLIT_SIMULATION_MESSAGES.ko
  );
}

export function formatCurrencySim(
  value: number,
  currencyCode = 'USD',
): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  return roundMoney(value).toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: MONEY_DECIMAL_PLACES,
    maximumFractionDigits: MONEY_DECIMAL_PLACES,
  });
}

export function formatPercentTextSim(value: number): string {
  const boundedValue = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, value),
  );
  return String(roundMoney(boundedValue));
}

export function applyTemplateSim(args: {
  template: string;
  replacements: Record<string, string>;
}): string {
  let formattedText = args.template;

  for (const [key, value] of Object.entries(args.replacements)) {
    formattedText = formattedText.replaceAll(`{${key}}`, value);
  }

  return formattedText;
}

function formatQuantityLineSim(args: {
  template: string;
  label: string;
  quantity: number;
  sharesUnit: string;
}): string {
  return applyTemplateSim({
    template: args.template,
    replacements: {
      label: args.label,
      quantity: String(args.quantity),
      unit: args.sharesUnit,
    },
  });
}

function formatPriceQuantityLineSim(args: {
  template: string;
  label: string;
  price: number;
  quantity: number;
  sharesUnit: string;
}): string {
  return applyTemplateSim({
    template: args.template,
    replacements: {
      label: args.label,
      price: formatCurrencySim(args.price),
      quantity: String(args.quantity),
      unit: args.sharesUnit,
    },
  });
}

export function buildMultiSplitSummaryLinesSim(args: {
  lang: MultiSplitSimulationLang;
  state: MultiSplitGuideStateSim;
}): string[] {
  const messages = getMultiSplitSimulationMessages(args.lang);
  const sharesUnit = messages['common.sharesUnit'];
  const lines = [
    applyTemplateSim({
      template: messages['format.percentLabel'],
      replacements: {
        label: messages['multiSplit.cashUsage'],
        value: formatPercentTextSim(args.state.cashUsagePct),
      },
    }),
  ];

  if (
    args.state.displayLocBuy != null &&
    args.state.displayLocBuy.quantity > 0
  ) {
    lines.push(
      formatPriceQuantityLineSim({
        template: messages['format.priceQuantity'],
        label: messages['multiSplit.locBuy'],
        price: args.state.displayLocBuy.price,
        quantity: args.state.displayLocBuy.quantity,
        sharesUnit,
      }),
    );
  }

  if (
    args.state.displayMocBuy != null &&
    args.state.displayMocBuy.quantity > 0
  ) {
    lines.push(
      formatQuantityLineSim({
        template: messages['format.quantityOnly'],
        label: messages['multiSplit.mocBuy'],
        quantity: args.state.displayMocBuy.quantity,
        sharesUnit,
      }),
    );
  }

  if (args.state.sellGuide.mainTakeProfitQty > 0) {
    lines.push(
      formatQuantityLineSim({
        template: messages['format.quantityOnly'],
        label: messages['multiSplit.mainTakeProfit'],
        quantity: args.state.sellGuide.mainTakeProfitQty,
        sharesUnit,
      }),
    );
  }

  if (args.state.sellGuide.intermediateTakeProfitQty > 0) {
    lines.push(
      formatQuantityLineSim({
        template: messages['format.quantityOnly'],
        label: messages['multiSplit.intermediateTakeProfit'],
        quantity: args.state.sellGuide.intermediateTakeProfitQty,
        sharesUnit,
      }),
    );
  }

  if (args.state.sellGuide.riskCutQty > 0) {
    lines.push(
      formatQuantityLineSim({
        template: messages['format.quantityOnly'],
        label: messages['multiSplit.riskCut'],
        quantity: args.state.sellGuide.riskCutQty,
        sharesUnit,
      }),
    );
  }

  return lines;
}
