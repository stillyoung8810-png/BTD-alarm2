import {
  HOLDINGS_QTY_EPSILON,
  floorToNonNegativeInt,
  roundMoney,
  roundShares4,
} from '../utils/financialMath';
import { validateFinancialArgs } from '../utils/vrBandStrategy';

const PERCENT_DENOMINATOR = 100;
const MAX_PROGRESS_PERCENT = 100;
const MIN_PROGRESS_PERCENT = 0;
const SAFETY_BUFFER_MULTIPLIER = 1.15;
const MONEY_DECIMAL_PLACES = 2;
const SHARE_DECIMAL_PLACES = 4;
const EMPTY_STRING = '';

const BUDGET_LOC_RATIO_BY_PRESET = {
  loc70: 70,
  balanced: 50,
  moc70: 30,
} as const;

const RSI_THRESHOLD_BY_PRESET = {
  rsi30: 30,
  rsi40: 40,
  rsi50: 50,
} as const;

const ALIGNMENT_PERIODS_BY_PRESET = {
  ma5_20: { shortPeriod: 5, longPeriod: 20 },
  ma20_60: { shortPeriod: 20, longPeriod: 60 },
  ma60_120: { shortPeriod: 60, longPeriod: 120 },
} as const;

type SimBudgetPresetId = keyof typeof BUDGET_LOC_RATIO_BY_PRESET;
type SimLocRatio = (typeof BUDGET_LOC_RATIO_BY_PRESET)[SimBudgetPresetId];
type SimRsiPresetId = keyof typeof RSI_THRESHOLD_BY_PRESET;
type SimAlignmentPresetId = keyof typeof ALIGNMENT_PERIODS_BY_PRESET;
type SimMovingAveragePeriod = 5 | 20 | 60 | 120;
type SimTradeType = 'buy' | 'sell';
type SimConfigSectionId =
  | 'baseLocRatioInput'
  | 'rsiCriterion'
  | 'rsiBudget'
  | 'alignmentCriterion'
  | 'alignmentBudget';

interface SimConditionDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: SimBudgetPresetId;
}

interface SimNoStopWizardDraft {
  targetStock: string;
  baseLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
  rsiCondition?: SimConditionDraft<SimRsiPresetId>;
  alignmentCondition?: SimConditionDraft<SimAlignmentPresetId>;
}

interface SimRsiRule {
  threshold: (typeof RSI_THRESHOLD_BY_PRESET)[SimRsiPresetId];
  locRatio: SimLocRatio;
}

interface SimAlignmentRule {
  shortPeriod: SimMovingAveragePeriod;
  longPeriod: SimMovingAveragePeriod;
  locRatio: SimLocRatio;
}

interface SimNoStopRuntimeStrategy {
  targetStock: string;
  baseLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
  rsiRule?: SimRsiRule;
  alignmentRule?: SimAlignmentRule;
}

interface SimTradeInput {
  type: SimTradeType;
  stock: string;
  price: number;
  quantity: number;
  fee: number;
}

interface SimHolding {
  stock: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
}

interface SimTechnicalIndicators {
  rsi?: number;
  ma?: Partial<Record<SimMovingAveragePeriod, number>>;
}

interface SimIndicatorSnapshot {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<SimMovingAveragePeriod, number>>;
}

interface SimSharedIndicatorMathPort {
  calculateMA: (prices: number[], period: SimMovingAveragePeriod) => number;
  calculateRSI: (prices: number[]) => number;
}

interface SimIndicatorRequirements {
  needsRsi: boolean;
  maPeriods: readonly SimMovingAveragePeriod[];
}

type SimIndicatorFetchTrigger =
  | 'draft-change'
  | 'step-submit'
  | 'saved-strategy-mount';

interface SimConfigSection {
  id: SimConfigSectionId;
  controlType: 'input' | 'chips';
  selectedOptionId?: string;
  optionIds?: readonly string[];
}

interface SimPricedOrder {
  price: number;
  quantity: number;
}

interface SimQuantityOnlyOrder {
  quantity: number;
}

interface SimNoStopExecutionResult {
  progressPct: number;
  appliedLocRatio: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: SimPricedOrder;
  mocBuy?: SimQuantityOnlyOrder;
  takeProfit?: SimPricedOrder;
}

type SimExecutionMessageId =
  | 'noStop.strategyProgress'
  | 'noStop.lowLoc'
  | 'noStop.mocBuy'
  | 'noStop.takeProfit'
  | 'noStop.firstBuyHint'
  | 'noStop.splitComplete'
  | 'common.sharesUnit';

interface SimExecutionLineMessageIds {
  strategyProgress: SimExecutionMessageId;
  lowLoc: SimExecutionMessageId;
  mocBuy: SimExecutionMessageId;
  takeProfit: SimExecutionMessageId;
  firstBuyHint: SimExecutionMessageId;
  splitComplete: SimExecutionMessageId;
  sharesUnit: SimExecutionMessageId;
}

type SimExecutionMessages = Record<SimExecutionMessageId, string>;

interface SimExecutionLineMessages {
  strategyProgress: string;
  lowLoc: string;
  mocBuy: string;
  takeProfit: string;
  firstBuyHint: string;
  splitComplete: string;
  sharesUnit: string;
}

const SIM_EXECUTION_LINE_MESSAGE_IDS: SimExecutionLineMessageIds = {
  strategyProgress: 'noStop.strategyProgress',
  lowLoc: 'noStop.lowLoc',
  mocBuy: 'noStop.mocBuy',
  takeProfit: 'noStop.takeProfit',
  firstBuyHint: 'noStop.firstBuyHint',
  splitComplete: 'noStop.splitComplete',
  sharesUnit: 'common.sharesUnit',
};

const SIM_EXECUTION_MESSAGES_KO: SimExecutionMessages = {
  'noStop.strategyProgress': '전략 진행률',
  'noStop.lowLoc': '평단가 매수 (LOC)',
  'noStop.mocBuy': '분할 매수 (MOC)',
  'noStop.takeProfit': '익절 목표',
  'noStop.firstBuyHint': '첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.',
  'noStop.splitComplete':
    '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유와 익절만 수행합니다.',
  'common.sharesUnit': '주',
};

const EMPTY_PRICE_HISTORY_ERROR =
  'Stock price history is empty. Cannot compute snapshot.';

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertTruthy(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`${label}: expected truthy condition`);
  }
}

function assertArrayEqual(
  actual: readonly unknown[],
  expected: readonly unknown[],
  label: string,
): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${label}: expected ${expectedText}, received ${actualText}`);
  }
}

function normalizeTickerSim(stock: string): string {
  return stock.trim().toUpperCase();
}

function normalizeMoneyLikeValueSim(value: number, context: string): number {
  const normalizedValue = Math.abs(Number(value));
  validateFinancialArgs(
    { normalizedValue },
    { normalizedValue: { min: 0 } },
    context,
  );
  return normalizedValue;
}

function formatUsdSim(value: number): string {
  return `$${roundMoney(value).toLocaleString('en-US', {
    minimumFractionDigits: MONEY_DECIMAL_PLACES,
    maximumFractionDigits: MONEY_DECIMAL_PLACES,
  })}`;
}

function formatPercentSim(value: number): string {
  const roundedValue = roundMoney(value);
  const fixed = roundedValue.toFixed(MONEY_DECIMAL_PLACES);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatShareQuantitySim(quantity: number): string {
  const roundedQuantity = roundShares4(quantity);
  if (Number.isInteger(roundedQuantity)) {
    return String(roundedQuantity);
  }

  return roundedQuantity
    .toFixed(SHARE_DECIMAL_PLACES)
    .replace(/0+$/, EMPTY_STRING)
    .replace(/\.$/, EMPTY_STRING);
}

function floorSafeSim(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return floorToNonNegativeInt(value + Number.EPSILON);
}

function buildBudgetChipOptionIdsSim(): readonly SimBudgetPresetId[] {
  return Object.keys(BUDGET_LOC_RATIO_BY_PRESET) as SimBudgetPresetId[];
}

function buildRsiChipOptionIdsSim(): readonly SimRsiPresetId[] {
  return Object.keys(RSI_THRESHOLD_BY_PRESET) as SimRsiPresetId[];
}

function buildAlignmentChipOptionIdsSim(): readonly SimAlignmentPresetId[] {
  return Object.keys(ALIGNMENT_PERIODS_BY_PRESET) as SimAlignmentPresetId[];
}

function buildNoStopConfigSectionsSim(
  draft: SimNoStopWizardDraft,
): SimConfigSection[] {
  const sections: SimConfigSection[] = [
    {
      id: 'baseLocRatioInput',
      controlType: 'input',
    },
  ];

  if (draft.rsiCondition?.isEnabled === true) {
    sections.push(
      {
        id: 'rsiCriterion',
        controlType: 'chips',
        selectedOptionId: draft.rsiCondition.criterionPreset,
        optionIds: buildRsiChipOptionIdsSim(),
      },
      {
        id: 'rsiBudget',
        controlType: 'chips',
        selectedOptionId: draft.rsiCondition.budgetPreset,
        optionIds: buildBudgetChipOptionIdsSim(),
      },
    );
  }

  if (draft.alignmentCondition?.isEnabled === true) {
    sections.push(
      {
        id: 'alignmentCriterion',
        controlType: 'chips',
        selectedOptionId: draft.alignmentCondition.criterionPreset,
        optionIds: buildAlignmentChipOptionIdsSim(),
      },
      {
        id: 'alignmentBudget',
        controlType: 'chips',
        selectedOptionId: draft.alignmentCondition.budgetPreset,
        optionIds: buildBudgetChipOptionIdsSim(),
      },
    );
  }

  return sections;
}

function buildNoStopStrategyFromDraftSim(
  draft: SimNoStopWizardDraft,
): SimNoStopRuntimeStrategy {
  validateFinancialArgs(
    {
      takeProfitPct: normalizeMoneyLikeValueSim(
        draft.takeProfitPct,
        'buildNoStopStrategyFromDraftSim.takeProfitPct',
      ),
      totalSplitCount: normalizeMoneyLikeValueSim(
        draft.totalSplitCount,
        'buildNoStopStrategyFromDraftSim.totalSplitCount',
      ),
    },
    {
      takeProfitPct: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'buildNoStopStrategyFromDraftSim',
  );

  const strategy: SimNoStopRuntimeStrategy = {
    targetStock: draft.targetStock.trim(),
    baseLocRatio: normalizeMoneyLikeValueSim(
      draft.baseLocRatio,
      'buildNoStopStrategyFromDraftSim.baseLocRatio',
    ),
    takeProfitPct: normalizeMoneyLikeValueSim(
      draft.takeProfitPct,
      'buildNoStopStrategyFromDraftSim.takeProfitPct.normalized',
    ),
    totalSplitCount: normalizeMoneyLikeValueSim(
      draft.totalSplitCount,
      'buildNoStopStrategyFromDraftSim.totalSplitCount.normalized',
    ),
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

function sanitizeOptionalRsiValueSim(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function sanitizeOptionalMovingAverageMapSim(
  maByPeriod: Partial<Record<SimMovingAveragePeriod, number>> | undefined,
): Partial<Record<SimMovingAveragePeriod, number>> | undefined {
  if (maByPeriod == null) {
    return undefined;
  }

  const sanitizedMap: Partial<Record<SimMovingAveragePeriod, number>> = {};
  const supportedPeriods: readonly SimMovingAveragePeriod[] = [5, 20, 60, 120];

  for (const period of supportedPeriods) {
    const value = maByPeriod[period];
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }

    sanitizedMap[period] = value;
  }

  return Object.keys(sanitizedMap).length > 0 ? sanitizedMap : undefined;
}

function composeNoStopIndicatorSnapshotSim(args: {
  currentPrice: number;
  technicalIndicators?: SimTechnicalIndicators | null;
}): SimIndicatorSnapshot {
  const rsi = sanitizeOptionalRsiValueSim(args.technicalIndicators?.rsi);
  const maByPeriod = sanitizeOptionalMovingAverageMapSim(args.technicalIndicators?.ma);

  validateFinancialArgs(
    {
      currentPrice: args.currentPrice,
    },
    {
      currentPrice: { strictPositive: true },
    },
    'composeNoStopIndicatorSnapshotSim',
  );

  return {
    currentPrice: args.currentPrice,
    rsi,
    maByPeriod,
  };
}

function collectIndicatorRequirementsSim(
  strategy: SimNoStopRuntimeStrategy,
): SimIndicatorRequirements {
  if (strategy.alignmentRule == null) {
    return {
      needsRsi: strategy.rsiRule != null,
      maPeriods: [],
    };
  }

  return {
    needsRsi: strategy.rsiRule != null,
    maPeriods: [
      strategy.alignmentRule.shortPeriod,
      strategy.alignmentRule.longPeriod,
    ],
  };
}

function buildIndicatorRequirementCacheKeySim(args: {
  symbol: string;
  requirements: SimIndicatorRequirements;
}): string {
  const normalizedSymbol = normalizeTickerSim(args.symbol);
  const normalizedPeriods = Array.from(new Set(args.requirements.maPeriods)).sort(
    (left, right) => left - right,
  );

  return [
    normalizedSymbol,
    args.requirements.needsRsi ? 'rsi:1' : 'rsi:0',
    `ma:${normalizedPeriods.join(',')}`,
  ].join('|');
}

function shouldFetchIndicatorsSim(args: {
  trigger: SimIndicatorFetchTrigger;
  previousCacheKey?: string;
  nextCacheKey: string;
}): boolean {
  if (args.trigger === 'draft-change') {
    return false;
  }

  return args.previousCacheKey !== args.nextCacheKey;
}

function buildServerSnapshotFromSharedMathSim(args: {
  prices: number[];
  requirements: SimIndicatorRequirements;
  sharedMath: SimSharedIndicatorMathPort;
}): SimIndicatorSnapshot {
  if (args.prices.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const latestPrice = args.prices[args.prices.length - 1];

  if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const ma: Partial<Record<SimMovingAveragePeriod, number>> = {};
  for (const period of args.requirements.maPeriods) {
    ma[period] = args.sharedMath.calculateMA(args.prices, period);
  }

  let technicalIndicators: SimTechnicalIndicators | undefined;
  const hasRsi = args.requirements.needsRsi;
  const hasMa = Object.keys(ma).length > 0;

  if (hasRsi || hasMa) {
    technicalIndicators = {};

    if (hasRsi) {
      technicalIndicators.rsi = args.sharedMath.calculateRSI(args.prices);
    }

    if (hasMa) {
      technicalIndicators.ma = ma;
    }
  }

  return composeNoStopIndicatorSnapshotSim({
    currentPrice: latestPrice,
    technicalIndicators,
  });
}

function hasAnyMovingAverageValuesSim(snapshot: SimIndicatorSnapshot): boolean {
  const maByPeriod = snapshot.maByPeriod;
  return maByPeriod != null && Object.keys(maByPeriod).length > 0;
}

function isValidIndicatorScalarSim(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveAppliedLocRatioSim(
  strategy: SimNoStopRuntimeStrategy,
  snapshot: SimIndicatorSnapshot,
): number {
  const matchedLocRatios: SimLocRatio[] = [];

  if (
    strategy.rsiRule != null &&
    isValidIndicatorScalarSim(snapshot.rsi) &&
    snapshot.rsi < strategy.rsiRule.threshold
  ) {
    matchedLocRatios.push(strategy.rsiRule.locRatio);
  }

  if (strategy.alignmentRule != null && hasAnyMovingAverageValuesSim(snapshot)) {
    const shortValue = snapshot.maByPeriod?.[strategy.alignmentRule.shortPeriod];
    const longValue = snapshot.maByPeriod?.[strategy.alignmentRule.longPeriod];

    if (
      isValidIndicatorScalarSim(shortValue) &&
      isValidIndicatorScalarSim(longValue)
    ) {
      if (shortValue > longValue) {
      matchedLocRatios.push(strategy.alignmentRule.locRatio);
      }
    }
  }

  if (matchedLocRatios.length === 0) {
    return strategy.baseLocRatio;
  }

  return matchedLocRatios.reduce<SimLocRatio>((currentMax, ratio) => {
    return ratio > currentMax ? ratio : currentMax;
  }, matchedLocRatios[0]);
}

function validateTradeInputSim(trade: SimTradeInput, context: string): void {
  validateFinancialArgs(
    {
      price: normalizeMoneyLikeValueSim(trade.price, `${context}.price`),
      quantity: normalizeMoneyLikeValueSim(trade.quantity, `${context}.quantity`),
      fee: normalizeMoneyLikeValueSim(trade.fee, `${context}.fee`),
    },
    {
      price: { strictPositive: true },
      quantity: { strictPositive: true },
      fee: { min: 0 },
    },
    context,
  );
}

function calcHoldingsSim(trades: readonly SimTradeInput[]): SimHolding[] {
  const holdingMap = new Map<
    string,
    { quantity: number; totalCost: number }
  >();

  for (const trade of trades) {
    validateTradeInputSim(trade, 'calcHoldingsSim.trade');
    const stock = normalizeTickerSim(trade.stock);
    if (stock.length === 0) {
      continue;
    }

    const quantity = normalizeMoneyLikeValueSim(
      trade.quantity,
      'calcHoldingsSim.trade.quantity',
    );
    const price = normalizeMoneyLikeValueSim(
      trade.price,
      'calcHoldingsSim.trade.price',
    );
    const fee = normalizeMoneyLikeValueSim(
      trade.fee,
      'calcHoldingsSim.trade.fee',
    );
    const previous = holdingMap.get(stock) ?? { quantity: 0, totalCost: 0 };

    if (trade.type === 'buy') {
      previous.quantity += quantity;
      previous.totalCost += price * quantity + fee;
      holdingMap.set(stock, previous);
      continue;
    }

    if (previous.quantity + HOLDINGS_QTY_EPSILON < quantity) {
      throw new Error(
        `[${stock}] oversell in simulation history: tried=${quantity}, current=${previous.quantity}`,
      );
    }

    const currentAvgPrice =
      previous.quantity > HOLDINGS_QTY_EPSILON
        ? previous.totalCost / previous.quantity
        : 0;

    previous.quantity -= quantity;
    if (previous.quantity <= HOLDINGS_QTY_EPSILON) {
      holdingMap.set(stock, { quantity: 0, totalCost: 0 });
      continue;
    }

    previous.totalCost = previous.quantity * currentAvgPrice;
    holdingMap.set(stock, previous);
  }

  return Array.from(holdingMap.entries()).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice:
      data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
  }));
}

function calculateTotalInvestedSim(trades: readonly SimTradeInput[]): number {
  return calcHoldingsSim(trades).reduce((sum, holding) => sum + holding.totalCost, 0);
}

function calculateStrategyProgressPctSim(args: {
  totalInvested: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  const totalInvested = normalizeMoneyLikeValueSim(
    args.totalInvested,
    'calculateStrategyProgressPctSim.totalInvested',
  );
  const oneTimeAmount = normalizeMoneyLikeValueSim(
    args.oneTimeAmount,
    'calculateStrategyProgressPctSim.oneTimeAmount',
  );
  const totalSplitCount = normalizeMoneyLikeValueSim(
    args.totalSplitCount,
    'calculateStrategyProgressPctSim.totalSplitCount',
  );

  validateFinancialArgs(
    {
      totalInvested,
      oneTimeAmount,
      totalSplitCount,
    },
    {
      totalInvested: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateStrategyProgressPctSim',
  );

  const totalSeed = oneTimeAmount * totalSplitCount;
  const rawProgress =
    MAX_PROGRESS_PERCENT -
    (totalInvested / totalSeed) * MAX_PROGRESS_PERCENT;

  return roundMoney(
    Math.min(
      MAX_PROGRESS_PERCENT,
      Math.max(MIN_PROGRESS_PERCENT, rawProgress),
    ),
  );
}

function createPricedOrderSim(
  price: number,
  quantity: number,
): SimPricedOrder | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  const finalQuantity = floorSafeSim(quantity);
  if (finalQuantity < 1) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: finalQuantity,
  };
}

function calculateMocQuantitySim(args: {
  mocBudget: number;
  currentPrice: number;
}): number {
  const mocBudget = normalizeMoneyLikeValueSim(
    args.mocBudget,
    'calculateMocQuantitySim.mocBudget',
  );
  const currentPrice = normalizeMoneyLikeValueSim(
    args.currentPrice,
    'calculateMocQuantitySim.currentPrice',
  );

  validateFinancialArgs(
    { mocBudget, currentPrice },
    {
      mocBudget: { min: 0 },
      currentPrice: { strictPositive: true },
    },
    'calculateMocQuantitySim',
  );

  return floorSafeSim(mocBudget / (currentPrice * SAFETY_BUFFER_MULTIPLIER));
}

function resolveExecutionLineMessagesSim(
  messages: SimExecutionMessages,
  ids: SimExecutionLineMessageIds = SIM_EXECUTION_LINE_MESSAGE_IDS,
): SimExecutionLineMessages {
  return {
    strategyProgress: messages[ids.strategyProgress],
    lowLoc: messages[ids.lowLoc],
    mocBuy: messages[ids.mocBuy],
    takeProfit: messages[ids.takeProfit],
    firstBuyHint: messages[ids.firstBuyHint],
    splitComplete: messages[ids.splitComplete],
    sharesUnit: messages[ids.sharesUnit],
  };
}

function calculateNoStopExecutionSim(args: {
  trades: readonly SimTradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  snapshot: SimIndicatorSnapshot;
  strategy: SimNoStopRuntimeStrategy;
}): SimNoStopExecutionResult {
  const oneTimeAmount = normalizeMoneyLikeValueSim(
    args.oneTimeAmount,
    'calculateNoStopExecutionSim.oneTimeAmount',
  );
  const feeRate = normalizeMoneyLikeValueSim(
    args.feeRate,
    'calculateNoStopExecutionSim.feeRate',
  );
  const currentPrice = normalizeMoneyLikeValueSim(
    args.snapshot.currentPrice,
    'calculateNoStopExecutionSim.currentPrice',
  );

  validateFinancialArgs(
    {
      oneTimeAmount,
      feeRate,
      currentPrice,
      takeProfitPct: normalizeMoneyLikeValueSim(
        args.strategy.takeProfitPct,
        'calculateNoStopExecutionSim.takeProfitPct',
      ),
      totalSplitCount: normalizeMoneyLikeValueSim(
        args.strategy.totalSplitCount,
        'calculateNoStopExecutionSim.totalSplitCount',
      ),
    },
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      currentPrice: { strictPositive: true },
      takeProfitPct: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'calculateNoStopExecutionSim',
  );

  const holdings = calcHoldingsSim(args.trades);
  const targetHolding =
    holdings.find(
      (holding) => normalizeTickerSim(holding.stock) === normalizeTickerSim(args.strategy.targetStock),
    ) ?? null;

  const totalInvested = targetHolding?.totalCost ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const progressPct = calculateStrategyProgressPctSim({
    totalInvested,
    oneTimeAmount,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const totalSeed = oneTimeAmount * args.strategy.totalSplitCount;
  const isFirstBuy = !(
    currentQuantity > HOLDINGS_QTY_EPSILON && avgPrice > HOLDINGS_QTY_EPSILON
  );
  const isSplitComplete = totalInvested + HOLDINGS_QTY_EPSILON >= totalSeed;
  const appliedLocRatio = resolveAppliedLocRatioSim(args.strategy, args.snapshot);
  const result: SimNoStopExecutionResult = {
    progressPct,
    appliedLocRatio,
    isFirstBuy,
    isSplitComplete,
  };

  if (isFirstBuy) {
    return result;
  }

  result.takeProfit = createPricedOrderSim(
    avgPrice * (1 + args.strategy.takeProfitPct / PERCENT_DENOMINATOR),
    currentQuantity,
  );

  if (isSplitComplete) {
    return result;
  }

  const lowBudget = oneTimeAmount * (appliedLocRatio / PERCENT_DENOMINATOR);
  const lowQuantity = floorSafeSim(
    lowBudget / (avgPrice * (1 + feeRate / PERCENT_DENOMINATOR)),
  );
  const usedLowBudget =
    lowQuantity * avgPrice * (1 + feeRate / PERCENT_DENOMINATOR);
  const mocBudget = Math.max(0, oneTimeAmount - usedLowBudget);
  const mocQuantity = calculateMocQuantitySim({
    mocBudget,
    currentPrice,
  });

  result.lowLoc = createPricedOrderSim(avgPrice, lowQuantity);
  if (mocQuantity > 0) {
    result.mocBuy = { quantity: mocQuantity };
  }

  return result;
}

function buildNoStopExecutionLinesSim(
  execution: SimNoStopExecutionResult,
  messages: SimExecutionMessages = SIM_EXECUTION_MESSAGES_KO,
  ids: SimExecutionLineMessageIds = SIM_EXECUTION_LINE_MESSAGE_IDS,
): string[] {
  const copy = resolveExecutionLineMessagesSim(messages, ids);
  const lines = [`${copy.strategyProgress}: ${formatPercentSim(execution.progressPct)}%`];

  if (execution.isFirstBuy) {
    lines.push(copy.firstBuyHint);
    return lines;
  }

  if (execution.lowLoc != null) {
    lines.push(
      `${copy.lowLoc}: ${formatUsdSim(execution.lowLoc.price)} / ${formatShareQuantitySim(execution.lowLoc.quantity)}${copy.sharesUnit}`,
    );
  }

  if (execution.mocBuy != null) {
    lines.push(
      `${copy.mocBuy}: ${formatShareQuantitySim(execution.mocBuy.quantity)}${copy.sharesUnit}`,
    );
  }

  if (execution.takeProfit != null) {
    lines.push(
      `${copy.takeProfit}: ${formatUsdSim(execution.takeProfit.price)} / ${formatShareQuantitySim(execution.takeProfit.quantity)}${copy.sharesUnit}`,
    );
  }

  if (execution.isSplitComplete) {
    lines.push(copy.splitComplete);
  }

  return lines;
}

export function simulateBaseLocRatioInputRemainsVisibleWhenTogglesOff(): void {
  const sections = buildNoStopConfigSectionsSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: false,
      criterionPreset: 'rsi40',
      budgetPreset: 'loc70',
    },
    alignmentCondition: {
      isEnabled: false,
      criterionPreset: 'ma20_60',
      budgetPreset: 'moc70',
    },
  });

  assertArrayEqual(
    sections.map((section) => section.id),
    ['baseLocRatioInput'],
    'base loc ratio input when toggles are off',
  );
  assertEqual(sections[0]?.controlType, 'input', 'base ratio uses manual input');
}

export function simulateChipSectionsShowConditionalGroupsWhenEnabled(): void {
  const sections = buildNoStopConfigSectionsSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi30',
      budgetPreset: 'loc70',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma20_60',
      budgetPreset: 'moc70',
    },
  });

  assertArrayEqual(
    sections.map((section) => section.id),
    [
      'baseLocRatioInput',
      'rsiCriterion',
      'rsiBudget',
      'alignmentCriterion',
      'alignmentBudget',
    ],
    'chip sections when conditional toggles are on',
  );
}

export function simulateRuntimeStrategyBuildUsesPresetIds(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: ' TQQQ ',
    baseLocRatio: 42,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi30',
      budgetPreset: 'loc70',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma20_60',
      budgetPreset: 'moc70',
    },
  });

  assertEqual(strategy.targetStock, 'TQQQ', 'strategy target stock trim');
  assertEqual(strategy.baseLocRatio, 42, 'base loc ratio from manual input');
  assertEqual(strategy.rsiRule?.threshold, 30, 'rsi threshold from preset');
  assertEqual(strategy.rsiRule?.locRatio, 70, 'rsi loc ratio from preset');
  assertEqual(strategy.alignmentRule?.shortPeriod, 20, 'alignment short period');
  assertEqual(strategy.alignmentRule?.longPeriod, 60, 'alignment long period');
  assertEqual(strategy.alignmentRule?.locRatio, 30, 'alignment loc ratio');
}

export function simulateIndicatorSnapshotKeepsCurrentPriceWithoutIndicators(): void {
  const baseOnlySnapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: null,
  });

  const partialSnapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 35,
      ma: {
        20: 100,
      },
    },
  });

  assertEqual(baseOnlySnapshot.currentPrice, 80, 'base-only snapshot keeps current price');
  assertEqual(baseOnlySnapshot.rsi, undefined, 'base-only snapshot omits rsi');
  assertEqual(baseOnlySnapshot.maByPeriod, undefined, 'base-only snapshot omits ma');
  assertEqual(partialSnapshot.rsi, 35, 'partial snapshot keeps optional rsi');
  assertEqual(partialSnapshot.maByPeriod?.[20], 100, 'partial snapshot keeps ma20');
  assertEqual(partialSnapshot.maByPeriod?.[5], undefined, 'partial snapshot does not invent ma5');
}

export function simulateSharedServerSnapshotRejectsEmptyHistoryAndLoadsOnlyRequiredIndicators(): void {
  const requestedPeriods: SimMovingAveragePeriod[] = [];
  let rsiRequestCount = 0;
  const sharedMath: SimSharedIndicatorMathPort = {
    calculateMA: (_prices, period) => {
      requestedPeriods.push(period);
      return 100 + period;
    },
    calculateRSI: () => {
      rsiRequestCount += 1;
      return 37;
    },
  };
  const baseOnlyStrategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  });
  const alignmentStrategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma5_20',
      budgetPreset: 'balanced',
    },
  });

  let didThrowForEmptyHistory = false;

  try {
    buildServerSnapshotFromSharedMathSim({
      prices: [],
      requirements: collectIndicatorRequirementsSim(baseOnlyStrategy),
      sharedMath,
    });
  } catch (error) {
    didThrowForEmptyHistory =
      error instanceof Error && error.message === EMPTY_PRICE_HISTORY_ERROR;
  }

  const baseOnlySnapshot = buildServerSnapshotFromSharedMathSim({
    prices: [95, 100, 101],
    requirements: collectIndicatorRequirementsSim(baseOnlyStrategy),
    sharedMath,
  });
  const alignmentSnapshot = buildServerSnapshotFromSharedMathSim({
    prices: [95, 100, 101],
    requirements: collectIndicatorRequirementsSim(alignmentStrategy),
    sharedMath,
  });

  assertTruthy(didThrowForEmptyHistory, 'empty price history must throw');
  assertEqual(baseOnlySnapshot.currentPrice, 101, 'base-only server snapshot latest price');
  assertEqual(baseOnlySnapshot.rsi, undefined, 'base-only server snapshot skips rsi');
  assertEqual(baseOnlySnapshot.maByPeriod, undefined, 'base-only server snapshot skips ma');
  assertArrayEqual(
    requestedPeriods,
    [5, 20],
    'shared math must request only required moving averages',
  );
  assertEqual(rsiRequestCount, 0, 'shared math skips rsi when strategy does not need it');
  assertEqual(alignmentSnapshot.currentPrice, 101, 'alignment server snapshot latest price');
  assertEqual(alignmentSnapshot.maByPeriod?.[5], 105, 'alignment server snapshot ma5');
  assertEqual(alignmentSnapshot.maByPeriod?.[20], 120, 'alignment server snapshot ma20');
}

export function simulateMissingIndicatorsFallbacksToBaseRatio(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 62,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi30',
      budgetPreset: 'moc70',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma5_20',
      budgetPreset: 'balanced',
    },
  });

  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      ma: {
        20: 95,
      },
    },
  });

  assertEqual(
    resolveAppliedLocRatioSim(strategy, snapshot),
    62,
    'missing indicators must degrade to base ratio',
  );
}

export function simulateRequirementAwareCacheKeysPreventSilentFallback(): void {
  const baseOnlyStrategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  });
  const alignmentStrategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma5_20',
      budgetPreset: 'balanced',
    },
  });

  const priceOnlyKey = buildIndicatorRequirementCacheKeySim({
    symbol: ' tqqq ',
    requirements: collectIndicatorRequirementsSim(baseOnlyStrategy),
  });
  const alignmentKey = buildIndicatorRequirementCacheKeySim({
    symbol: 'TQQQ',
    requirements: collectIndicatorRequirementsSim(alignmentStrategy),
  });
  const reorderedAlignmentKey = buildIndicatorRequirementCacheKeySim({
    symbol: 'TQQQ',
    requirements: {
      needsRsi: false,
      maPeriods: [20, 5],
    },
  });

  assertEqual(priceOnlyKey, 'TQQQ|rsi:0|ma:', 'price-only cache key');
  assertEqual(alignmentKey, 'TQQQ|rsi:0|ma:5,20', 'alignment cache key');
  assertTruthy(
    priceOnlyKey !== alignmentKey,
    'requirement-aware cache key must differ by indicator needs',
  );
  assertEqual(
    alignmentKey,
    reorderedAlignmentKey,
    'cache key must be stable regardless of ma period ordering',
  );
}

export function simulateIndicatorFetchOnlyRunsOnSubmitOrSavedStrategyChange(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma5_20',
      budgetPreset: 'balanced',
    },
  });
  const cacheKey = buildIndicatorRequirementCacheKeySim({
    symbol: 'TQQQ',
    requirements: collectIndicatorRequirementsSim(strategy),
  });

  assertEqual(
    shouldFetchIndicatorsSim({
      trigger: 'draft-change',
      nextCacheKey: cacheKey,
    }),
    false,
    'draft editing must not trigger network fetch',
  );
  assertEqual(
    shouldFetchIndicatorsSim({
      trigger: 'step-submit',
      nextCacheKey: cacheKey,
    }),
    true,
    'step submit should trigger initial validation fetch',
  );
  assertEqual(
    shouldFetchIndicatorsSim({
      trigger: 'saved-strategy-mount',
      previousCacheKey: cacheKey,
      nextCacheKey: cacheKey,
    }),
    false,
    'saved strategy mount should not refetch identical requirements',
  );
  assertEqual(
    shouldFetchIndicatorsSim({
      trigger: 'saved-strategy-mount',
      previousCacheKey: 'TQQQ|rsi:0|ma:',
      nextCacheKey: cacheKey,
    }),
    true,
    'saved strategy mount should fetch when requirements changed',
  );
}

export function simulateConditionMissFallsBackToBaseRatio(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 62,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi30',
      budgetPreset: 'moc70',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma20_60',
      budgetPreset: 'balanced',
    },
  });

  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 45,
      ma: {
        5: 90,
        20: 95,
        60: 100,
        120: 110,
      },
    },
  });

  assertEqual(
    resolveAppliedLocRatioSim(strategy, snapshot),
    62,
    'base loc ratio fallback',
  );
}

export function simulateStricterConditionWinsWhenBothMatch(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 42,
    takeProfitPct: 10,
    totalSplitCount: 40,
    rsiCondition: {
      isEnabled: true,
      criterionPreset: 'rsi40',
      budgetPreset: 'balanced',
    },
    alignmentCondition: {
      isEnabled: true,
      criterionPreset: 'ma20_60',
      budgetPreset: 'loc70',
    },
  });

  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 35,
      ma: {
        5: 90,
        20: 110,
        60: 100,
        120: 95,
      },
    },
  });

  assertEqual(
    resolveAppliedLocRatioSim(strategy, snapshot),
    70,
    'stricter loc ratio wins across matched conditions',
  );
}

export function simulateMocQuantityUsesSafetyBuffer(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  });
  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 55,
      ma: {
        5: 85,
        20: 90,
        60: 100,
        120: 110,
      },
    },
  });

  const execution = calculateNoStopExecutionSim({
    trades: [
      {
        type: 'buy',
        stock: 'TQQQ',
        price: 100,
        quantity: 10,
        fee: 0,
      },
    ],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    snapshot,
    strategy,
  });

  assertEqual(execution.appliedLocRatio, 50, 'balanced loc ratio');
  assertEqual(execution.lowLoc?.price, 100, 'low loc price uses avg price');
  assertEqual(execution.lowLoc?.quantity, 4, 'low loc quantity');
  assertEqual(execution.mocBuy?.quantity, 6, 'moc quantity uses 15 percent buffer');
  assertEqual(execution.takeProfit?.price, 110, 'take-profit price');
  assertEqual(execution.progressPct, 97.5, 'progress pct');
}

export function simulateFloorSafeAppliesEpsilonAtQuantityBoundary(): void {
  const quantityBeforeFloor = 2 - Number.EPSILON / 2;

  assertEqual(
    floorSafeSim(quantityBeforeFloor),
    2,
    'epsilon-safe floor preserves mathematically exact share count',
  );
}

export function simulateOnlyTargetHoldingCanDriveExecutionState(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  });
  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
  });

  const execution = calculateNoStopExecutionSim({
    trades: [
      {
        type: 'buy',
        stock: 'AAPL',
        price: 200,
        quantity: 3,
        fee: 0,
      },
    ],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    snapshot,
    strategy,
  });

  assertEqual(execution.isFirstBuy, true, 'non-target holdings must not cancel first-buy state');
  assertEqual(execution.lowLoc, undefined, 'non-target holdings must not create loc order');
  assertEqual(execution.mocBuy, undefined, 'non-target holdings must not create moc order');
  assertEqual(execution.takeProfit, undefined, 'non-target holdings must not create take-profit');
}

export function simulateOnlyTargetHoldingCanConsumeStrategySeed(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 2,
  });
  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
  });

  const execution = calculateNoStopExecutionSim({
    trades: [
      {
        type: 'buy',
        stock: 'TQQQ',
        price: 100,
        quantity: 1,
        fee: 0,
      },
      {
        type: 'buy',
        stock: 'AAPL',
        price: 900,
        quantity: 1,
        fee: 0,
      },
    ],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    snapshot,
    strategy,
  });

  assertEqual(execution.progressPct, 95, 'only target holding cost should drive progress');
  assertEqual(
    execution.isSplitComplete,
    false,
    'non-target holdings must not exhaust target strategy seed',
  );
  assertEqual(execution.takeProfit?.price, 110, 'target holding still drives take-profit');
}

export function simulateProgressGaugeClampsToZeroAtFullSeed(): void {
  const progressPct = calculateStrategyProgressPctSim({
    totalInvested: 45_000,
    oneTimeAmount: 1_000,
    totalSplitCount: 40,
  });

  assertEqual(progressPct, 0, 'progress clamp at exhausted seed');
}

export function simulateSummaryUsesNewLabelsAndMocQuantityOnly(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  });
  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 55,
      ma: {
        5: 85,
        20: 90,
        60: 100,
        120: 110,
      },
    },
  });

  const execution = calculateNoStopExecutionSim({
    trades: [
      {
        type: 'buy',
        stock: 'TQQQ',
        price: 100,
        quantity: 10,
        fee: 0,
      },
    ],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    snapshot,
    strategy,
  });
  const lines = buildNoStopExecutionLinesSim(execution, SIM_EXECUTION_MESSAGES_KO);

  assertTruthy(
    lines.includes('전략 진행률: 97.5%'),
    'summary includes progress gauge text',
  );
  assertTruthy(
    lines.includes('평단가 매수 (LOC): $100.00 / 4주'),
    'summary includes renamed loc line',
  );
  assertTruthy(
    lines.includes('분할 매수 (MOC): 6주'),
    'summary includes moc quantity only line',
  );
  assertTruthy(
    !lines.some((line) => line.includes('$80.00')),
    'moc line must not expose price',
  );
}

export function simulateSplitCompleteKeepsOnlyTakeProfit(): void {
  const strategy = buildNoStopStrategyFromDraftSim({
    targetStock: 'TQQQ',
    baseLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 1,
  });
  const snapshot = composeNoStopIndicatorSnapshotSim({
    currentPrice: 80,
    technicalIndicators: {
      rsi: 55,
      ma: {
        5: 85,
        20: 90,
        60: 100,
        120: 110,
      },
    },
  });

  const execution = calculateNoStopExecutionSim({
    trades: [
      {
        type: 'buy',
        stock: 'TQQQ',
        price: 100,
        quantity: 10,
        fee: 0,
      },
    ],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    snapshot,
    strategy,
  });

  assertEqual(execution.isSplitComplete, true, 'split completion state');
  assertEqual(execution.lowLoc, undefined, 'no low loc after split completion');
  assertEqual(execution.mocBuy, undefined, 'no moc after split completion');
  assertEqual(execution.takeProfit?.quantity, 10, 'take profit remains');
}
