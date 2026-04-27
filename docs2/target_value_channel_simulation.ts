import type {
  StrategyCreatorSummaryRowViewModel,
  StrategyCreatorSummaryViewModel,
  SummaryRowId,
} from './target_value_channel_summary_contract';
import type { TargetValueChannelDailyExecutionMessages } from './target_value_channel_messages';
import type { AlarmConfig, Strategy, Trade } from '../types';
import {
  PORTFOLIO_VALIDATION,
  STRATEGY_DEFAULTS,
} from '../constants/domain/financeRules';
import { validateFinancialArgs } from '../utils/vrBandStrategy';
import { validateWithSharedFinancialArgs } from './target_value_channel_validation_bridge';

const MONEY_DECIMAL_SCALE = 100;
const RATE_DECIMAL_SCALE = 1_000_000;
const PERCENT_DENOMINATOR = 100;
const ZERO_AMOUNT = 0;
const FULL_RATE = 1;
const MAX_BUFFER_ORDER_COUNT = 2;
const MAX_ORDER_STEPS = 20;

const MIN_INITIAL_CAPITAL = 1;
const MIN_INITIAL_ALLOCATION_PCT = 10;
const MAX_INITIAL_ALLOCATION_PCT = 100;
const MIN_BASE_GROWTH_RATE = 1;
const MAX_BASE_GROWTH_RATE = 20;
const MIN_SMART_BRAKE_THRESHOLD = 1;
const MAX_SMART_BRAKE_THRESHOLD = 99;
const MIN_BAND_WIDTH_PCT = 1;
const MAX_BAND_WIDTH_PCT = 100;
const MIN_FEE_RATE_PCT = PORTFOLIO_VALIDATION.MIN_FEE_RATE_PERCENT;
const MAX_FEE_RATE_PCT = PORTFOLIO_VALIDATION.MAX_FEE_RATE_PERCENT;
const MAX_FEE_RATE_DECIMAL_PLACES = 2;
const MIN_MIN_ORDER_QTY = 1;
const MIN_STRATEGY_PERIOD = PORTFOLIO_VALIDATION.MIN_MA_PERIOD;
const MAX_STRATEGY_PERIOD = PORTFOLIO_VALIDATION.MAX_MA_PERIOD;
const MIN_STRATEGY_SPLIT_COUNT = 1;
const MIN_CASH_USAGE_RATE_BUY = 1;
const MAX_CASH_USAGE_RATE_BUY = 100;
const MIN_CYCLE_WEEKS = 1;
const MAX_CYCLE_WEEKS = 12;
const MAX_ADJUSTMENT_AMOUNT = PORTFOLIO_VALIDATION.MAX_WITHDRAWAL_AMOUNT_USD;
const CURRENT_STATE_STEP = 0;
const TARGET_VALUE_CHANNEL_NORMALIZATION_WARNING_PREFIX =
  '[TVC_Normalize_Warning]';

export const ADJUSTMENT_MODE_VALUES = ['none', 'deposit', 'withdraw'] as const;
export type AdjustmentMode = (typeof ADJUSTMENT_MODE_VALUES)[number];
export type TargetValueChannelHeaderAdjustmentMode = Exclude<
  AdjustmentMode,
  'none'
>;
const DEFAULT_ADJUSTMENT_MODE: AdjustmentMode = 'none';
const EMPTY_TARGET_VALUE_CHANNEL_ORDERS: TargetValueChannelOrderLevel[] = [];

export interface TargetValueChannelOrderLevel {
  step: number;
  price: number;
  qty: number;
  isBuffer: boolean;
  sharesAfter: number;
  cashAfter: number;
}

export interface TargetValueChannelPersistedConfig {
  initialCapital: number;
  initialAllocationPct: number;
  initialTargetValue: number;
  initialAvailableCash: number;
  bandRateUpper: number;
  bandRateLower: number;
  feeRate: number;
  baseGrowthRate: number;
  smartBrakeThreshold: number;
  minOrderQty: number;
  cashUsageRateBuy: number;
  cycleWeeks: number;
  adjustmentMode: AdjustmentMode;
  adjustmentAmount: number;
}

export interface TargetValueChannelCreatorInput {
  initialCapital: number;
  initialAllocationPct: number;
  bandUpperPct: number;
  bandLowerPct: number;
  feeRatePct: number;
  baseGrowthRate: number;
  smartBrakeThreshold: number;
  minOrderQty: number;
  cashUsageRateBuyPct: number;
  cycleWeeks: number;
  adjustmentMode: AdjustmentMode;
  adjustmentAmount: number;
}

export interface TargetValueChannelWizardDraftInput
  extends Omit<TargetValueChannelCreatorInput, 'feeRatePct'> {}

export interface TargetValueChannelPortfolioMetaInput {
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRatePercent: number;
}

export interface TargetValueChannelStrategyFormProps {
  lang: 'ko' | 'en';
  showErrors: boolean;
  draft: TargetValueChannelWizardDraftInput;
  onDraftChange: (
    field: keyof TargetValueChannelWizardDraftInput,
    value: number | AdjustmentMode,
  ) => void;
}

export interface TargetValueChannelInitialSeed {
  initialCapital: number;
  initialAllocationPct: number;
  initialTargetValue: number;
  initialAvailableCash: number;
}

export interface TargetValueChannelSnapshot {
  currentT: number;
  availableCash: number;
  shares: number;
  avgPrice: number;
  bandLow: number;
  bandHigh: number;
  buyOrders: TargetValueChannelOrderLevel[];
  sellOrders: TargetValueChannelOrderLevel[];
  cycleIndex: number;
}

export interface NextCycleState {
  nextTargetValue: number;
  nextAvailableCash: number;
  nextBandLow: number;
  nextBandHigh: number;
  cashRatio: number;
  isSafetyMode: boolean;
  appliedGrowthRateDecimal: number;
  appliedAdjustmentAmount: number;
  nextCycleIndex: number;
}

export interface TargetValueChannelSafeOrders {
  safeBuyOrders: TargetValueChannelOrderLevel[];
  safeSellOrders: TargetValueChannelOrderLevel[];
}

export interface TargetValueChannelOrderModalViewModel {
  orders: TargetValueChannelOrderLevel[];
  hasExecutableOrders: boolean;
}

export interface TargetValueChannelHoldingState {
  shares: number;
  avgPrice: number;
}

export interface TargetValueChannelStrategySliceEnvelope {
  targetValueChannel: TargetValueChannelPersistedConfig;
}

export interface TargetValueChannelSliceEnvelope {
  strategy: TargetValueChannelStrategySliceEnvelope;
  targetValueChannelSnapshot: TargetValueChannelSnapshot;
}

export interface TargetValueChannelStrategyBase {
  ma0: {
    stock: string;
    rsiEnabled: boolean;
    alignmentEnabled: boolean;
    maAPeriod: number;
    maBPeriod: number;
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
}

export interface TargetValueChannelStrategyDefaultsAdapter {
  referenceStock: string;
  maShortPeriod: number;
  maLongPeriod: number;
  splitCount: number;
}

// Why: 아직 실제 owner module이 로컬에 없으므로 docs2에서는 샘플 이름으로 낮춰 두고,
// 구현 단계에서는 반드시 `constants/domain/targetValueChannelDefaults.ts` import로 교체합니다.
export const SIMULATION_SAMPLE_TARGET_VALUE_CHANNEL_DEFAULTS: TargetValueChannelStrategyDefaultsAdapter =
  {
    referenceStock: 'TQQQ',
    maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
    maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    splitCount: 1,
  };

export interface TargetValueChannelRuntimeStrategy
  extends TargetValueChannelStrategyBase {
  multiSplit?: Strategy['multiSplit'];
  noStopMultiSplit?: Strategy['noStopMultiSplit'];
  targetValueChannel: TargetValueChannelPersistedConfig;
}

export interface TargetValueChannelValidationInput {
  name: string;
  dailyBuyAmount: number;
  feeRatePercent: number;
  maShortPeriod: number;
  maLongPeriod: number;
  withdrawalAmount: number;
}

export interface TargetValueChannelRuntimePortfolioDraft {
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRate: number;
  strategy: TargetValueChannelRuntimeStrategy;
  trades: Trade[];
  isClosed: false;
  alarmconfig?: AlarmConfig;
  targetValueChannelSnapshot: TargetValueChannelSnapshot;
}

export interface TargetValueChannelPortfolioDraftResult {
  portfolio: TargetValueChannelRuntimePortfolioDraft;
  validationInput: TargetValueChannelValidationInput;
}

export interface TargetValueChannelPortfolioInsertEnvelope {
  strategy: TargetValueChannelRuntimeStrategy;
  targetValueChannelSnapshot: TargetValueChannelSnapshot;
}

export interface TargetValueChannelNormalizedPortfolio {
  id: string;
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRate: number;
  strategy: TargetValueChannelRuntimeStrategy;
  trades: Trade[];
  isClosed: boolean;
  closedAt?: string;
  finalSellAmount?: number;
  alarmconfig?: AlarmConfig;
  targetValueChannelSnapshot: TargetValueChannelSnapshot;
}

export interface TargetValueChannelRefreshPersistencePayload {
  target_value_channel_snapshot: TargetValueChannelSnapshot;
}

export interface TargetValueChannelPortfolioRow extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
  daily_buy_amount?: unknown;
  start_date?: unknown;
  fee_rate?: unknown;
  strategy?: unknown;
  trades?: unknown;
  is_closed?: unknown;
  closed_at?: unknown;
  final_sell_amount?: unknown;
  alarm_config?: unknown;
  target_value_channel_snapshot?: unknown;
  targetValueChannelSnapshot?: unknown;
}

export type TargetValueChannelOrderModalTab = 'buy' | 'sell';

const SUMMARY_ROW_ORDER: readonly SummaryRowId[] = [
  'initialTargetValue',
  'initialAvailableCash',
  'baseGrowthRate',
  'smartBrakeThreshold',
  'safetyMode',
  'normalMode',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function warnTargetValueChannelNormalization(
  context: string,
  message: string,
  rawValue?: unknown,
): void {
  console.warn(
    `${TARGET_VALUE_CHANNEL_NORMALIZATION_WARNING_PREFIX} ${context}: ${message}`,
    rawValue,
  );
}

function readFiniteNumber(
  rawValue: unknown,
  context: string,
  fieldName: string,
): number | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmedValue = rawValue.trim();
    if (trimmedValue.length > 0) {
      const parsedValue = Number(trimmedValue);
      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  warnTargetValueChannelNormalization(
    context,
    `${fieldName} must be a finite number.`,
    rawValue,
  );
  return null;
}

function readRequiredString(
  rawValue: unknown,
  context: string,
  fieldName: string,
): string | null {
  if (typeof rawValue === 'string') {
    const trimmedValue = rawValue.trim();
    if (trimmedValue.length > 0) {
      return trimmedValue;
    }
  }

  warnTargetValueChannelNormalization(
    context,
    `${fieldName} must be a non-empty string.`,
    rawValue,
  );
  return null;
}

function assertTargetValueChannelRequiredString(args: {
  rawValue: unknown;
  fieldName: string;
  context: string;
}): string {
  const requiredValue = readRequiredString(
    args.rawValue,
    args.context,
    args.fieldName,
  );

  if (requiredValue != null) {
    return requiredValue;
  }

  throw new Error(
    `[TVC_Config_Error] ${args.context}: ${args.fieldName} must be a non-empty string.`,
  );
}

function readOptionalString(rawValue: unknown): string | undefined {
  return typeof rawValue === 'string' ? rawValue : undefined;
}

function readBooleanWithFallback(rawValue: unknown, fallbackValue: boolean): boolean {
  return typeof rawValue === 'boolean' ? rawValue : fallbackValue;
}

function readOptionalFiniteNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmedValue = rawValue.trim();
    if (trimmedValue.length === 0) {
      return undefined;
    }

    const parsedValue = Number(trimmedValue);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return undefined;
}

function roundMoney(value: number): number {
  const roundedAbsoluteValue =
    Math.round((Math.abs(value) + Number.EPSILON) * MONEY_DECIMAL_SCALE) /
    MONEY_DECIMAL_SCALE;

  if (roundedAbsoluteValue === ZERO_AMOUNT) {
    return ZERO_AMOUNT;
  }

  return value < ZERO_AMOUNT ? -roundedAbsoluteValue : roundedAbsoluteValue;
}

function roundRate(value: number): number {
  const roundedAbsoluteValue =
    Math.round((Math.abs(value) + Number.EPSILON) * RATE_DECIMAL_SCALE) /
    RATE_DECIMAL_SCALE;

  if (roundedAbsoluteValue === ZERO_AMOUNT) {
    return ZERO_AMOUNT;
  }

  return value < ZERO_AMOUNT ? -roundedAbsoluteValue : roundedAbsoluteValue;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function percentToRate(percent: number): number {
  return roundRate(percent / PERCENT_DENOMINATOR);
}

export function isAdjustmentAmountInputEnabled(
  adjustmentMode: unknown,
): boolean {
  return normalizeTargetValueChannelAdjustmentMode(adjustmentMode) !== 'none';
}

export function normalizeTargetValueChannelAdjustmentMode(
  rawAdjustmentMode: unknown,
): AdjustmentMode {
  if (typeof rawAdjustmentMode !== 'string') {
    warnTargetValueChannelNormalization(
      'normalizeTargetValueChannelAdjustmentMode',
      'adjustmentMode is not a string. Falling back to none.',
      rawAdjustmentMode,
    );
    return DEFAULT_ADJUSTMENT_MODE;
  }

  const trimmedAdjustmentMode = rawAdjustmentMode.trim();

  switch (trimmedAdjustmentMode) {
    case 'none':
      return 'none';
    case 'deposit':
      return 'deposit';
    case 'withdraw':
      return 'withdraw';
    default:
      warnTargetValueChannelNormalization(
        'normalizeTargetValueChannelAdjustmentMode',
        'adjustmentMode is invalid. Falling back to none.',
        rawAdjustmentMode,
      );
      return DEFAULT_ADJUSTMENT_MODE;
  }
}

function toDecimalPercent(
  name: string,
  integerPercent: number,
  min: number,
  max: number,
): number {
  validateWithSharedFinancialArgs(
    {
      name,
      value: integerPercent,
      min,
      max,
      integer: true,
      context: 'toDecimalPercent',
    },
  );
  return percentToRate(integerPercent);
}

function validateTargetValueChannelCreatorInput(
  input: TargetValueChannelCreatorInput,
): void {
  const normalizedAdjustmentMode = normalizeTargetValueChannelAdjustmentMode(
    input.adjustmentMode,
  );
  const normalizedAdjustmentAmount = isAdjustmentAmountInputEnabled(
    normalizedAdjustmentMode,
  )
    ? input.adjustmentAmount
    : ZERO_AMOUNT;

  validateFinancialArgs(
    {
      initialCapital: input.initialCapital,
      adjustmentAmount: normalizedAdjustmentAmount,
    },
    {
      initialCapital: {
        min: MIN_INITIAL_CAPITAL,
      },
      adjustmentAmount: {
        min: ZERO_AMOUNT,
      },
    },
    'validateTargetValueChannelCreatorInput',
  );

  validateWithSharedFinancialArgs({
    name: 'initialAllocationPct',
    value: input.initialAllocationPct,
    min: MIN_INITIAL_ALLOCATION_PCT,
    max: MAX_INITIAL_ALLOCATION_PCT,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'bandUpperPct',
    value: input.bandUpperPct,
    min: MIN_BAND_WIDTH_PCT,
    max: MAX_BAND_WIDTH_PCT,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'bandLowerPct',
    value: input.bandLowerPct,
    min: MIN_BAND_WIDTH_PCT,
    max: MAX_BAND_WIDTH_PCT,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'feeRatePct',
    value: input.feeRatePct,
    min: MIN_FEE_RATE_PCT,
    max: MAX_FEE_RATE_PCT,
    maxDecimalPlaces: MAX_FEE_RATE_DECIMAL_PLACES,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'baseGrowthRate',
    value: input.baseGrowthRate,
    min: MIN_BASE_GROWTH_RATE,
    max: MAX_BASE_GROWTH_RATE,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'smartBrakeThreshold',
    value: input.smartBrakeThreshold,
    min: MIN_SMART_BRAKE_THRESHOLD,
    max: MAX_SMART_BRAKE_THRESHOLD,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'minOrderQty',
    value: input.minOrderQty,
    min: MIN_MIN_ORDER_QTY,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'cashUsageRateBuyPct',
    value: input.cashUsageRateBuyPct,
    min: MIN_CASH_USAGE_RATE_BUY,
    max: MAX_CASH_USAGE_RATE_BUY,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'cycleWeeks',
    value: input.cycleWeeks,
    min: MIN_CYCLE_WEEKS,
    max: MAX_CYCLE_WEEKS,
    integer: true,
    context: 'validateTargetValueChannelCreatorInput',
  });
  validateWithSharedFinancialArgs({
    name: 'adjustmentAmount',
    value: normalizedAdjustmentAmount,
    min: ZERO_AMOUNT,
    max: MAX_ADJUSTMENT_AMOUNT,
    context: 'validateTargetValueChannelCreatorInput',
  });
}

function resolveSignedAdjustmentAmount(
  adjustmentMode: unknown,
  adjustmentAmount: number,
): number {
  validateWithSharedFinancialArgs({
    name: 'adjustmentAmount',
    value: adjustmentAmount,
    min: ZERO_AMOUNT,
    max: MAX_ADJUSTMENT_AMOUNT,
    context: 'resolveSignedAdjustmentAmount',
  });
  const absoluteAmount = roundMoney(Math.abs(adjustmentAmount));
  const normalizedAdjustmentMode =
    normalizeTargetValueChannelAdjustmentMode(adjustmentMode);

  // Why: 입금/출금 방향은 중앙 한 곳에서만 강제해야 UI 입력 실수로 장부 부호가 뒤집히지 않습니다.
  switch (normalizedAdjustmentMode) {
    case 'none':
      return ZERO_AMOUNT;
    case 'deposit':
      return absoluteAmount;
    case 'withdraw':
      return -absoluteAmount;
    default: {
      const exhaustiveCheck: never = normalizedAdjustmentMode;
      return exhaustiveCheck;
    }
  }
}

export function deriveInitialTargetValueSeed(args: {
  initialCapital: number;
  initialAllocationPct: number;
}): TargetValueChannelInitialSeed {
  validateFinancialArgs(
    { initialCapital: args.initialCapital },
    {
      initialCapital: {
        strictPositive: true,
        min: MIN_INITIAL_CAPITAL,
      },
    },
    'deriveInitialTargetValueSeed',
  );

  const initialAllocationDecimal = toDecimalPercent(
    'initialAllocationPct',
    args.initialAllocationPct,
    MIN_INITIAL_ALLOCATION_PCT,
    MAX_INITIAL_ALLOCATION_PCT,
  );

  const initialTargetValue = roundMoney(args.initialCapital * initialAllocationDecimal);
  validateFinancialArgs(
    { initialTargetValue },
    { initialTargetValue: { strictPositive: true } },
    'deriveInitialTargetValueSeed',
  );

  const initialAvailableCash = roundMoney(args.initialCapital - initialTargetValue);
  validateFinancialArgs(
    { initialAvailableCash },
    { initialAvailableCash: { min: ZERO_AMOUNT } },
    'deriveInitialTargetValueSeed',
  );

  return {
    initialCapital: roundMoney(args.initialCapital),
    initialAllocationPct: args.initialAllocationPct,
    initialTargetValue,
    initialAvailableCash,
  };
}

export function buildTargetValueChannelPersistedConfig(
  input: TargetValueChannelCreatorInput,
): TargetValueChannelPersistedConfig {
  validateTargetValueChannelCreatorInput(input);

  const seed = deriveInitialTargetValueSeed({
    initialCapital: input.initialCapital,
    initialAllocationPct: input.initialAllocationPct,
  });
  const normalizedAdjustmentMode = normalizeTargetValueChannelAdjustmentMode(
    input.adjustmentMode,
  );
  const normalizedAdjustmentAmount = isAdjustmentAmountInputEnabled(
    normalizedAdjustmentMode,
  )
    ? roundMoney(input.adjustmentAmount)
    : ZERO_AMOUNT;

  const persistedConfig: TargetValueChannelPersistedConfig = {
    initialCapital: seed.initialCapital,
    initialAllocationPct: seed.initialAllocationPct,
    initialTargetValue: seed.initialTargetValue,
    initialAvailableCash: seed.initialAvailableCash,
    bandRateUpper: toDecimalPercent(
      'bandUpperPct',
      input.bandUpperPct,
      MIN_BAND_WIDTH_PCT,
      MAX_BAND_WIDTH_PCT,
    ),
    bandRateLower: toDecimalPercent(
      'bandLowerPct',
      input.bandLowerPct,
      MIN_BAND_WIDTH_PCT,
      MAX_BAND_WIDTH_PCT,
    ),
    feeRate: percentToRate(input.feeRatePct),
    baseGrowthRate: input.baseGrowthRate,
    smartBrakeThreshold: input.smartBrakeThreshold,
    minOrderQty: input.minOrderQty,
    cashUsageRateBuy: toDecimalPercent(
      'cashUsageRateBuyPct',
      input.cashUsageRateBuyPct,
      MIN_CASH_USAGE_RATE_BUY,
      MAX_CASH_USAGE_RATE_BUY,
    ),
    cycleWeeks: input.cycleWeeks,
    adjustmentMode: normalizedAdjustmentMode,
    adjustmentAmount: normalizedAdjustmentAmount,
  };

  validateTargetValueChannelPersistedConfig(
    persistedConfig,
    'buildTargetValueChannelPersistedConfig:result',
  );

  return persistedConfig;
}

export function getTargetValueChannelConfig(
  strategy: Strategy | TargetValueChannelRuntimeStrategy,
): TargetValueChannelPersistedConfig | null {
  if ('targetValueChannel' in strategy && strategy.targetValueChannel != null) {
    return strategy.targetValueChannel;
  }

  return null;
}

export function isTargetValueChannelStrategy(
  strategy: Strategy | TargetValueChannelRuntimeStrategy,
): strategy is TargetValueChannelRuntimeStrategy {
  return getTargetValueChannelConfig(strategy) != null;
}

export function getTargetValueChannelTrackedStocks(args: {
  strategy: Strategy | TargetValueChannelRuntimeStrategy;
}): string[] {
  if (!isTargetValueChannelStrategy(args.strategy)) {
    return [];
  }

  return [args.strategy.ma0.stock];
}

export function buildTargetValueChannelStrategyBase(
  defaults: TargetValueChannelStrategyDefaultsAdapter,
): TargetValueChannelStrategyBase {
  const referenceStock = assertTargetValueChannelRequiredString({
    rawValue: defaults.referenceStock,
    fieldName: 'referenceStock',
    context: 'buildTargetValueChannelStrategyBase',
  });

  validateWithSharedFinancialArgs({
    name: 'maShortPeriod',
    value: defaults.maShortPeriod,
    min: MIN_STRATEGY_PERIOD,
    max: MAX_STRATEGY_PERIOD,
    integer: true,
    context: 'buildTargetValueChannelStrategyBase',
  });
  validateWithSharedFinancialArgs({
    name: 'maLongPeriod',
    value: defaults.maLongPeriod,
    min: MIN_STRATEGY_PERIOD,
    max: MAX_STRATEGY_PERIOD,
    integer: true,
    context: 'buildTargetValueChannelStrategyBase',
  });
  validateWithSharedFinancialArgs({
    name: 'splitCount',
    value: defaults.splitCount,
    min: MIN_STRATEGY_SPLIT_COUNT,
    integer: true,
    context: 'buildTargetValueChannelStrategyBase',
  });

  return {
    ma0: {
      stock: referenceStock,
      rsiEnabled: false,
      alignmentEnabled: false,
      maAPeriod: defaults.maShortPeriod,
      maBPeriod: defaults.maLongPeriod,
    },
    ma1: {
      stock: referenceStock,
    },
    ma2: {
      stock: referenceStock,
      splitCount: defaults.splitCount,
    },
    ma3: {
      stock: referenceStock,
    },
  };
}

export function buildTargetValueChannelRuntimeStrategy(args: {
  baseStrategy: TargetValueChannelStrategyBase;
  persistedConfig: TargetValueChannelPersistedConfig;
}): TargetValueChannelRuntimeStrategy {
  return {
    ...args.baseStrategy,
    targetValueChannel: args.persistedConfig,
  };
}

function validateTargetValueChannelPersistedConfig(
  config: TargetValueChannelPersistedConfig,
  context: string,
): void {
  validateFinancialArgs(
    {
      initialCapital: config.initialCapital,
      initialTargetValue: config.initialTargetValue,
      initialAvailableCash: config.initialAvailableCash,
      minOrderQty: config.minOrderQty,
    },
    {
      initialCapital: { strictPositive: true },
      initialTargetValue: { strictPositive: true },
      initialAvailableCash: { min: ZERO_AMOUNT },
      minOrderQty: { strictPositive: true },
    },
    context,
  );

  validateWithSharedFinancialArgs({
    name: 'initialAllocationPct',
    value: config.initialAllocationPct,
    min: MIN_INITIAL_ALLOCATION_PCT,
    max: MAX_INITIAL_ALLOCATION_PCT,
    integer: true,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'bandRateUpper',
    value: config.bandRateUpper,
    min: percentToRate(MIN_BAND_WIDTH_PCT),
    max: FULL_RATE,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'bandRateLower',
    value: config.bandRateLower,
    min: percentToRate(MIN_BAND_WIDTH_PCT),
    max: FULL_RATE,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'feeRate',
    value: config.feeRate,
    min: ZERO_AMOUNT,
    max: percentToRate(MAX_FEE_RATE_PCT),
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'baseGrowthRate',
    value: config.baseGrowthRate,
    min: MIN_BASE_GROWTH_RATE,
    max: MAX_BASE_GROWTH_RATE,
    integer: true,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'smartBrakeThreshold',
    value: config.smartBrakeThreshold,
    min: MIN_SMART_BRAKE_THRESHOLD,
    max: MAX_SMART_BRAKE_THRESHOLD,
    integer: true,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'cashUsageRateBuy',
    value: config.cashUsageRateBuy,
    min: percentToRate(MIN_CASH_USAGE_RATE_BUY),
    max: FULL_RATE,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'cycleWeeks',
    value: config.cycleWeeks,
    min: MIN_CYCLE_WEEKS,
    max: MAX_CYCLE_WEEKS,
    integer: true,
    context,
  });
  validateWithSharedFinancialArgs({
    name: 'adjustmentAmount',
    value: config.adjustmentAmount,
    min: ZERO_AMOUNT,
    max: MAX_ADJUSTMENT_AMOUNT,
    context,
  });
}

function validateTargetValueChannelSnapshot(
  snapshot: TargetValueChannelSnapshot,
  context: string,
): void {
  validateFinancialArgs(
    {
      currentT: snapshot.currentT,
      availableCash: snapshot.availableCash,
      shares: snapshot.shares,
      avgPrice: snapshot.avgPrice,
      cycleIndex: snapshot.cycleIndex,
    },
    {
      currentT: { strictPositive: true },
      availableCash: { min: ZERO_AMOUNT },
      shares: { min: ZERO_AMOUNT },
      avgPrice: { min: ZERO_AMOUNT },
      cycleIndex: { min: ZERO_AMOUNT },
    },
    context,
  );

  validateWithSharedFinancialArgs({
    name: 'cycleIndex',
    value: snapshot.cycleIndex,
    min: ZERO_AMOUNT,
    integer: true,
    context,
  });
}

interface GenerateTargetValueChannelBuyOrdersArgs {
  shares: number;
  availableCash: number;
  bandLow: number;
  minOrderQty: number;
  feeRate: number;
  cashUsageRateBuy: number;
}

interface GenerateTargetValueChannelSellOrdersArgs {
  shares: number;
  availableCash: number;
  bandHigh: number;
  minOrderQty: number;
  feeRate: number;
}

export function generateTargetValueChannelBuyOrders(
  args: GenerateTargetValueChannelBuyOrdersArgs,
): TargetValueChannelOrderLevel[] {
  validateFinancialArgs(
    args,
    {
      shares: { min: ZERO_AMOUNT },
      availableCash: { min: ZERO_AMOUNT },
      bandLow: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: ZERO_AMOUNT },
      cashUsageRateBuy: { strictPositive: true },
    },
    'generateTargetValueChannelBuyOrders',
  );
  validateWithSharedFinancialArgs({
    name: 'feeRate',
    value: args.feeRate,
    min: ZERO_AMOUNT,
    max: FULL_RATE,
    context: 'generateTargetValueChannelBuyOrders',
  });
  validateWithSharedFinancialArgs({
    name: 'cashUsageRateBuy',
    value: args.cashUsageRateBuy,
    min: percentToRate(MIN_CASH_USAGE_RATE_BUY),
    max: FULL_RATE,
    context: 'generateTargetValueChannelBuyOrders',
  });

  if (args.availableCash <= ZERO_AMOUNT) {
    return [];
  }

  const maxBuyBudget = roundMoney(args.availableCash * args.cashUsageRateBuy);
  const orders: TargetValueChannelOrderLevel[] = [];
  let cumulativeShares = args.shares;
  let cumulativeCost = ZERO_AMOUNT;
  let bufferCount = ZERO_AMOUNT;

  for (let step = 1; step <= MAX_ORDER_STEPS; step += 1) {
    const effectiveShares =
      args.shares === ZERO_AMOUNT
        ? step * args.minOrderQty
        : args.shares + (step - 1) * args.minOrderQty;
    const targetPrice = args.bandLow / effectiveShares;
    if (!Number.isFinite(targetPrice) || targetPrice <= ZERO_AMOUNT) {
      break;
    }

    const price = roundMoney(targetPrice);
    if (price <= ZERO_AMOUNT) {
      break;
    }

    const qty = args.minOrderQty;
    const orderCost = roundMoney(price * qty * (FULL_RATE + args.feeRate));
    if (orderCost <= ZERO_AMOUNT) {
      break;
    }

    const nextCumulativeCost = roundMoney(cumulativeCost + orderCost);
    const isWithinBudget = nextCumulativeCost <= maxBuyBudget;
    if (!isWithinBudget) {
      bufferCount += 1;
    }

    cumulativeCost = nextCumulativeCost;
    cumulativeShares += qty;

    orders.push({
      step,
      price,
      qty,
      isBuffer: !isWithinBudget,
      sharesAfter: cumulativeShares,
      cashAfter: roundMoney(args.availableCash - cumulativeCost),
    });

    if (!isWithinBudget && bufferCount >= MAX_BUFFER_ORDER_COUNT) {
      break;
    }
  }

  return orders;
}

export function generateTargetValueChannelSellOrders(
  args: GenerateTargetValueChannelSellOrdersArgs,
): TargetValueChannelOrderLevel[] {
  validateFinancialArgs(
    args,
    {
      shares: { min: ZERO_AMOUNT },
      availableCash: { min: ZERO_AMOUNT },
      bandHigh: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: ZERO_AMOUNT },
    },
    'generateTargetValueChannelSellOrders',
  );
  validateWithSharedFinancialArgs({
    name: 'feeRate',
    value: args.feeRate,
    min: ZERO_AMOUNT,
    max: FULL_RATE,
    context: 'generateTargetValueChannelSellOrders',
  });

  if (args.shares <= ZERO_AMOUNT) {
    return [];
  }

  const orders: TargetValueChannelOrderLevel[] = [];
  let cumulativeSold = ZERO_AMOUNT;
  let cumulativeProceeds = ZERO_AMOUNT;

  for (let step = 1; step <= MAX_ORDER_STEPS; step += 1) {
    const sharesBefore = args.shares - (step - 1) * args.minOrderQty;
    if (sharesBefore <= ZERO_AMOUNT) {
      break;
    }

    const targetPrice = args.bandHigh / sharesBefore;
    if (!Number.isFinite(targetPrice) || targetPrice <= ZERO_AMOUNT) {
      break;
    }

    const price = roundMoney(targetPrice);
    if (price <= ZERO_AMOUNT) {
      break;
    }

    const qty = args.minOrderQty;
    cumulativeSold += qty;
    if (cumulativeSold > args.shares) {
      break;
    }

    const proceeds = roundMoney(price * qty * (FULL_RATE - args.feeRate));
    if (proceeds <= ZERO_AMOUNT) {
      break;
    }

    cumulativeProceeds = roundMoney(cumulativeProceeds + proceeds);
    const sharesAfter = args.shares - cumulativeSold;

    orders.push({
      step,
      price,
      qty,
      isBuffer: false,
      sharesAfter,
      cashAfter: roundMoney(args.availableCash + cumulativeProceeds),
    });

    if (sharesAfter <= ZERO_AMOUNT) {
      break;
    }
  }

  return orders;
}

export function calculateBandsFromTargetValue(args: {
  targetValue: number;
  bandRateUpper: number;
  bandRateLower: number;
}): { bandLow: number; bandHigh: number } {
  validateFinancialArgs(
    { targetValue: args.targetValue },
    { targetValue: { strictPositive: true } },
    'calculateBandsFromTargetValue',
  );
  validateWithSharedFinancialArgs({
    name: 'bandRateUpper',
    value: args.bandRateUpper,
    min: percentToRate(MIN_BAND_WIDTH_PCT),
    max: percentToRate(MAX_BAND_WIDTH_PCT),
    context: 'calculateBandsFromTargetValue',
  });
  validateWithSharedFinancialArgs({
    name: 'bandRateLower',
    value: args.bandRateLower,
    min: percentToRate(MIN_BAND_WIDTH_PCT),
    max: percentToRate(MAX_BAND_WIDTH_PCT),
    context: 'calculateBandsFromTargetValue',
  });

  const bandLow = roundMoney(args.targetValue * (FULL_RATE - args.bandRateLower));
  const bandHigh = roundMoney(args.targetValue * (FULL_RATE + args.bandRateUpper));

  validateFinancialArgs(
    { bandLow, bandHigh },
    {
      bandLow: { strictPositive: true },
      bandHigh: { strictPositive: true },
    },
    'calculateBandsFromTargetValue:derived',
  );

  return {
    bandLow,
    bandHigh,
  };
}

export function createInitialTargetValueChannelSnapshot(
  config: TargetValueChannelPersistedConfig,
): TargetValueChannelSnapshot {
  validateTargetValueChannelPersistedConfig(
    config,
    'createInitialTargetValueChannelSnapshot:config',
  );
  const bands = calculateBandsFromTargetValue({
    targetValue: config.initialTargetValue,
    bandRateUpper: config.bandRateUpper,
    bandRateLower: config.bandRateLower,
  });
  const initialShares = ZERO_AMOUNT;
  const buyOrders = generateTargetValueChannelBuyOrders({
    shares: initialShares,
    availableCash: config.initialAvailableCash,
    bandLow: bands.bandLow,
    minOrderQty: config.minOrderQty,
    feeRate: config.feeRate,
    cashUsageRateBuy: config.cashUsageRateBuy,
  });
  const sellOrders = generateTargetValueChannelSellOrders({
    shares: initialShares,
    availableCash: config.initialAvailableCash,
    bandHigh: bands.bandHigh,
    minOrderQty: config.minOrderQty,
    feeRate: config.feeRate,
  });

  const snapshot: TargetValueChannelSnapshot = {
    currentT: config.initialTargetValue,
    availableCash: config.initialAvailableCash,
    shares: initialShares,
    avgPrice: ZERO_AMOUNT,
    bandLow: bands.bandLow,
    bandHigh: bands.bandHigh,
    // Why: cycle 0의 예약매수 표는 총 원금이 아니라 실제 남은 가용 현금으로만 시딩해야
    // 초기 T와 현금이 분리된 새 TVC 장부가 첫 사이클부터 일관되게 유지됩니다.
    buyOrders,
    // Why: Creator 직후에는 보유 주식이 0주이므로 최초 예약매도 표는 빈 배열이 정상입니다.
    // step 0 현재 상태 행은 스냅샷에 저장하지 않고 주문표 렌더링 계층에서 붙입니다.
    sellOrders,
    cycleIndex: ZERO_AMOUNT,
  };

  validateTargetValueChannelSnapshot(
    snapshot,
    'createInitialTargetValueChannelSnapshot:result',
  );

  return snapshot;
}

export function createTargetValueChannelStepZeroOrderLevel(
  snapshot: Pick<TargetValueChannelSnapshot, 'shares' | 'availableCash'>,
): TargetValueChannelOrderLevel {
  validateFinancialArgs(
    {
      shares: snapshot.shares,
      availableCash: snapshot.availableCash,
    },
    {
      shares: { min: ZERO_AMOUNT },
      availableCash: { min: ZERO_AMOUNT },
    },
    'createTargetValueChannelStepZeroOrderLevel',
  );

  return {
    step: CURRENT_STATE_STEP,
    price: ZERO_AMOUNT,
    qty: ZERO_AMOUNT,
    isBuffer: false,
    sharesAfter: snapshot.shares,
    cashAfter: snapshot.availableCash,
  };
}

export function buildTargetValueChannelSafeOrders(
  snapshot: TargetValueChannelSnapshot | null | undefined,
): TargetValueChannelSafeOrders {
  if (snapshot == null) {
    return {
      safeBuyOrders: EMPTY_TARGET_VALUE_CHANNEL_ORDERS,
      safeSellOrders: EMPTY_TARGET_VALUE_CHANNEL_ORDERS,
    };
  }

  const stepZeroOrder = createTargetValueChannelStepZeroOrderLevel(snapshot);

  return {
    safeBuyOrders: [stepZeroOrder, ...snapshot.buyOrders],
    safeSellOrders: [
      stepZeroOrder,
      ...snapshot.sellOrders,
    ],
  };
}

export function getExecutableTargetValueChannelOrders(
  orders: TargetValueChannelOrderLevel[],
): TargetValueChannelOrderLevel[] {
  return orders.filter((order) => order.step !== CURRENT_STATE_STEP);
}

export function hasExecutableTargetValueChannelOrders(
  orders: TargetValueChannelOrderLevel[],
): boolean {
  return getExecutableTargetValueChannelOrders(orders).length > ZERO_AMOUNT;
}

export function buildTargetValueChannelOrderModalViewModel(args: {
  snapshot: TargetValueChannelSnapshot | null | undefined;
  activeTab: TargetValueChannelOrderModalTab;
}): TargetValueChannelOrderModalViewModel {
  const safeOrders = buildTargetValueChannelSafeOrders(args.snapshot);
  const orders =
    args.activeTab === 'buy'
      ? safeOrders.safeBuyOrders
      : safeOrders.safeSellOrders;

  return {
    orders,
    hasExecutableOrders: hasExecutableTargetValueChannelOrders(orders),
  };
}

export function resolveTargetValueChannelDailyExecutionAdjustmentHeader(args: {
  adjustmentMode: AdjustmentMode;
  adjustmentAmount: number;
  formatModeLabel: (mode: TargetValueChannelHeaderAdjustmentMode) => string;
}): string | null {
  validateFinancialArgs(
    {
      adjustmentAmount: args.adjustmentAmount,
    },
    {
      adjustmentAmount: { min: ZERO_AMOUNT },
    },
    'resolveTargetValueChannelDailyExecutionAdjustmentHeader',
  );

  if (args.adjustmentAmount <= ZERO_AMOUNT) {
    return null;
  }

  if (args.adjustmentMode === 'none') {
    return null;
  }

  return args.formatModeLabel(args.adjustmentMode);
}

export function buildTargetValueChannelDailyExecutionViewModel(args: {
  config: Pick<
    TargetValueChannelPersistedConfig,
    'adjustmentMode' | 'adjustmentAmount'
  >;
  messages: TargetValueChannelDailyExecutionMessages;
}): {
  adjustmentHeader: string | null;
} {
  return {
    adjustmentHeader: resolveTargetValueChannelDailyExecutionAdjustmentHeader({
      adjustmentMode: args.config.adjustmentMode,
      adjustmentAmount: args.config.adjustmentAmount,
      formatModeLabel: args.messages.formatAdjustmentHeader,
    }),
  };
}

export interface TargetValueChannelCreationArtifacts {
  persistedConfig: TargetValueChannelPersistedConfig;
  initialSnapshot: TargetValueChannelSnapshot;
}

export function buildTargetValueChannelCreationArtifacts(
  input: TargetValueChannelCreatorInput,
): TargetValueChannelCreationArtifacts {
  const persistedConfig = buildTargetValueChannelPersistedConfig(input);
  const initialSnapshot = createInitialTargetValueChannelSnapshot(persistedConfig);

  return {
    persistedConfig,
    initialSnapshot,
  };
}

export function buildTargetValueChannelSliceEnvelope(
  input: TargetValueChannelCreatorInput,
): TargetValueChannelSliceEnvelope {
  const creationArtifacts = buildTargetValueChannelCreationArtifacts(input);

  return {
    strategy: {
      targetValueChannel: creationArtifacts.persistedConfig,
    },
    targetValueChannelSnapshot: creationArtifacts.initialSnapshot,
  };
}

export function buildTargetValueChannelPortfolioInsertEnvelope(args: {
  meta: Pick<TargetValueChannelPortfolioMetaInput, 'feeRatePercent'>;
  draft: TargetValueChannelWizardDraftInput;
  baseStrategy: TargetValueChannelStrategyBase;
}): TargetValueChannelPortfolioInsertEnvelope {
  const creatorInput = buildTargetValueChannelCreatorInput({
    meta: args.meta,
    draft: args.draft,
  });
  const sliceEnvelope = buildTargetValueChannelSliceEnvelope(creatorInput);

  return {
    strategy: buildTargetValueChannelRuntimeStrategy({
      baseStrategy: args.baseStrategy,
      persistedConfig: sliceEnvelope.strategy.targetValueChannel,
    }),
    targetValueChannelSnapshot: sliceEnvelope.targetValueChannelSnapshot,
  };
}

export function buildTargetValueChannelCreatorInput(args: {
  meta: Pick<TargetValueChannelPortfolioMetaInput, 'feeRatePercent'>;
  draft: TargetValueChannelWizardDraftInput;
}): TargetValueChannelCreatorInput {
  return {
    ...args.draft,
    feeRatePct: args.meta.feeRatePercent,
  };
}

export function buildTargetValueChannelValidationInput(args: {
  meta: TargetValueChannelPortfolioMetaInput;
  persistedConfig: Pick<
    TargetValueChannelPersistedConfig,
    'adjustmentMode' | 'adjustmentAmount'
  >;
  baseStrategy: Pick<TargetValueChannelStrategyBase, 'ma0'>;
}): TargetValueChannelValidationInput {
  const withdrawalAmount =
    args.persistedConfig.adjustmentMode === 'withdraw'
      ? args.persistedConfig.adjustmentAmount
      : ZERO_AMOUNT;

  return {
    name: args.meta.name,
    dailyBuyAmount: args.meta.dailyBuyAmount,
    feeRatePercent: args.meta.feeRatePercent,
    maShortPeriod: args.baseStrategy.ma0.maAPeriod,
    maLongPeriod: args.baseStrategy.ma0.maBPeriod,
    withdrawalAmount,
  };
}

export function buildTargetValueChannelPortfolioDraft(args: {
  meta: TargetValueChannelPortfolioMetaInput;
  draft: TargetValueChannelWizardDraftInput;
  baseStrategy: TargetValueChannelStrategyBase;
}): TargetValueChannelPortfolioDraftResult {
  validateWithSharedFinancialArgs({
    name: 'feeRatePercent',
    value: args.meta.feeRatePercent,
    min: MIN_FEE_RATE_PCT,
    max: MAX_FEE_RATE_PCT,
    maxDecimalPlaces: MAX_FEE_RATE_DECIMAL_PLACES,
    context: 'buildTargetValueChannelPortfolioDraft',
  });

  const insertEnvelope = buildTargetValueChannelPortfolioInsertEnvelope({
    meta: args.meta,
    draft: args.draft,
    baseStrategy: args.baseStrategy,
  });

  return {
    portfolio: {
      name: args.meta.name,
      dailyBuyAmount: args.meta.dailyBuyAmount,
      startDate: args.meta.startDate,
      feeRate: args.meta.feeRatePercent,
      strategy: insertEnvelope.strategy,
      trades: [],
      isClosed: false,
      targetValueChannelSnapshot: insertEnvelope.targetValueChannelSnapshot,
    },
    validationInput: buildTargetValueChannelValidationInput({
      meta: args.meta,
      persistedConfig: insertEnvelope.strategy.targetValueChannel,
      baseStrategy: insertEnvelope.strategy,
    }),
  };
}

function requireTargetValueChannelSnapshot(
  snapshot: TargetValueChannelSnapshot | null | undefined,
  context: string,
): TargetValueChannelSnapshot {
  if (snapshot != null) {
    return snapshot;
  }

  throw new Error(
    `[TVC_Trade_Error] ${context}: current snapshot is required before trade mutation.`,
  );
}

function shouldRebuildTargetValueChannelOrdersAfterTrade(args: {
  tradeType: Trade['type'];
  previousShares: number;
  nextShares: number;
}): boolean {
  return (
    args.tradeType === 'buy' &&
    args.previousShares <= ZERO_AMOUNT &&
    args.nextShares > ZERO_AMOUNT
  );
}

export function assertTargetValueChannelTradeDoesNotOversell(args: {
  previousShares: number;
  trade: Pick<Trade, 'type' | 'quantity'>;
}): void {
  validateFinancialArgs(
    {
      previousShares: args.previousShares,
      quantity: args.trade.quantity,
    },
    {
      previousShares: { min: ZERO_AMOUNT },
      quantity: { strictPositive: true },
    },
    'assertTargetValueChannelTradeDoesNotOversell',
  );

  if (args.trade.type !== 'sell') {
    return;
  }

  if (args.trade.quantity <= args.previousShares) {
    return;
  }

  throw new Error(
    `[TVC_Trade_Error] sell quantity exceeds current shares: qty=${args.trade.quantity}, shares=${args.previousShares}`,
  );
}

export function computeHoldingStateAfterTrade(args: {
  previousShares: number;
  previousAvgPrice: number;
  trade: Pick<Trade, 'type' | 'price' | 'quantity'>;
}): TargetValueChannelHoldingState {
  validateFinancialArgs(
    {
      previousShares: args.previousShares,
      previousAvgPrice: args.previousAvgPrice,
      price: args.trade.price,
      quantity: args.trade.quantity,
    },
    {
      previousShares: { min: ZERO_AMOUNT },
      previousAvgPrice: { min: ZERO_AMOUNT },
      price: { strictPositive: true },
      quantity: { strictPositive: true },
    },
    'computeHoldingStateAfterTrade',
  );
  assertTargetValueChannelTradeDoesNotOversell({
    previousShares: args.previousShares,
    trade: args.trade,
  });

  switch (args.trade.type) {
    case 'buy': {
      const totalCost = roundMoney(args.trade.price * args.trade.quantity);
      const shares = args.previousShares + args.trade.quantity;
      if (shares <= ZERO_AMOUNT) {
        return {
          shares: ZERO_AMOUNT,
          avgPrice: ZERO_AMOUNT,
        };
      }

      const previousCostBasis = roundMoney(
        args.previousShares * args.previousAvgPrice,
      );

      return {
        shares,
        avgPrice: roundMoney((previousCostBasis + totalCost) / shares),
      };
    }
    case 'sell': {
      const remainingShares = args.previousShares - args.trade.quantity;

      return {
        shares: remainingShares,
        avgPrice:
          remainingShares <= ZERO_AMOUNT ? ZERO_AMOUNT : args.previousAvgPrice,
      };
    }
    default: {
      const exhaustiveCheck: never = args.trade.type;
      return exhaustiveCheck;
    }
  }
}

export function computeTargetValueChannelSnapshotAfterTrade(args: {
  currentSnapshot: TargetValueChannelSnapshot | null | undefined;
  trade: Pick<Trade, 'type' | 'price' | 'quantity'>;
  nextAvailableCash: number;
  config: TargetValueChannelPersistedConfig;
}): TargetValueChannelSnapshot {
  const baseSnapshot = requireTargetValueChannelSnapshot(
    args.currentSnapshot,
    'computeTargetValueChannelSnapshotAfterTrade',
  );
  validateTargetValueChannelPersistedConfig(
    args.config,
    'computeTargetValueChannelSnapshotAfterTrade:config',
  );
  validateFinancialArgs(
    {
      nextAvailableCash: args.nextAvailableCash,
    },
    {
      nextAvailableCash: { min: ZERO_AMOUNT },
    },
    'computeTargetValueChannelSnapshotAfterTrade',
  );

  const nextHoldings = computeHoldingStateAfterTrade({
    previousShares: baseSnapshot.shares,
    previousAvgPrice: baseSnapshot.avgPrice,
    trade: args.trade,
  });
  const shouldRebuildOrders = shouldRebuildTargetValueChannelOrdersAfterTrade({
    tradeType: args.trade.type,
    previousShares: baseSnapshot.shares,
    nextShares: nextHoldings.shares,
  });

  const nextSnapshotBase: TargetValueChannelSnapshot = {
    ...baseSnapshot,
    availableCash: roundMoney(args.nextAvailableCash),
    shares: nextHoldings.shares,
    avgPrice: nextHoldings.avgPrice,
  };

  if (!shouldRebuildOrders) {
    validateTargetValueChannelSnapshot(
      nextSnapshotBase,
      'computeTargetValueChannelSnapshotAfterTrade:result',
    );
    return nextSnapshotBase;
  }

  const nextSnapshot: TargetValueChannelSnapshot = {
    ...nextSnapshotBase,
    buyOrders: generateTargetValueChannelBuyOrders({
      shares: nextHoldings.shares,
      availableCash: nextSnapshotBase.availableCash,
      bandLow: baseSnapshot.bandLow,
      minOrderQty: args.config.minOrderQty,
      feeRate: args.config.feeRate,
      cashUsageRateBuy: args.config.cashUsageRateBuy,
    }),
    sellOrders: generateTargetValueChannelSellOrders({
      shares: nextHoldings.shares,
      availableCash: nextSnapshotBase.availableCash,
      bandHigh: baseSnapshot.bandHigh,
      minOrderQty: args.config.minOrderQty,
      feeRate: args.config.feeRate,
    }),
  };

  validateTargetValueChannelSnapshot(
    nextSnapshot,
    'computeTargetValueChannelSnapshotAfterTrade:result',
  );
  return nextSnapshot;
}

export function buildRefreshedTargetValueChannelSnapshot(args: {
  previous: TargetValueChannelSnapshot;
  config: TargetValueChannelPersistedConfig;
  targetCycleIndex: number;
}): TargetValueChannelSnapshot {
  validateTargetValueChannelSnapshot(
    args.previous,
    'buildRefreshedTargetValueChannelSnapshot:previous',
  );
  validateTargetValueChannelPersistedConfig(
    args.config,
    'buildRefreshedTargetValueChannelSnapshot:config',
  );
  validateFinancialArgs(
    {
      targetCycleIndex: args.targetCycleIndex,
    },
    {
      targetCycleIndex: { min: ZERO_AMOUNT },
    },
    'buildRefreshedTargetValueChannelSnapshot',
  );

  if (args.targetCycleIndex < args.previous.cycleIndex) {
    throw new Error(
      '[TVC_Refresh_Error] targetCycleIndex must not go backwards.',
    );
  }

  let refreshedSnapshot = args.previous;

  while (refreshedSnapshot.cycleIndex < args.targetCycleIndex) {
    const nextCycleState = calculateNextCycleState({
      config: args.config,
      snapshot: refreshedSnapshot,
    });

    if (nextCycleState.nextCycleIndex <= refreshedSnapshot.cycleIndex) {
      throw new Error(
        '[TVC_Refresh_Error] cycle advancement did not progress.',
      );
    }

    refreshedSnapshot = {
      ...refreshedSnapshot,
      currentT: nextCycleState.nextTargetValue,
      availableCash: nextCycleState.nextAvailableCash,
      bandLow: nextCycleState.nextBandLow,
      bandHigh: nextCycleState.nextBandHigh,
      buyOrders: generateTargetValueChannelBuyOrders({
        shares: refreshedSnapshot.shares,
        availableCash: nextCycleState.nextAvailableCash,
        bandLow: nextCycleState.nextBandLow,
        minOrderQty: args.config.minOrderQty,
        feeRate: args.config.feeRate,
        cashUsageRateBuy: args.config.cashUsageRateBuy,
      }),
      sellOrders: generateTargetValueChannelSellOrders({
        shares: refreshedSnapshot.shares,
        availableCash: nextCycleState.nextAvailableCash,
        bandHigh: nextCycleState.nextBandHigh,
        minOrderQty: args.config.minOrderQty,
        feeRate: args.config.feeRate,
      }),
      cycleIndex: nextCycleState.nextCycleIndex,
    };
  }

  validateTargetValueChannelSnapshot(
    refreshedSnapshot,
    'buildRefreshedTargetValueChannelSnapshot:result',
  );
  return refreshedSnapshot;
}

export function buildTargetValueChannelRefreshPersistencePayload(
  refreshedSnapshot: TargetValueChannelSnapshot,
): TargetValueChannelRefreshPersistencePayload {
  validateTargetValueChannelSnapshot(
    refreshedSnapshot,
    'buildTargetValueChannelRefreshPersistencePayload',
  );

  return {
    target_value_channel_snapshot: refreshedSnapshot,
  };
}

function normalizeTargetValueChannelOrderLevel(
  rawOrder: unknown,
  context: string,
): TargetValueChannelOrderLevel | null {
  if (!isRecord(rawOrder)) {
    warnTargetValueChannelNormalization(
      context,
      'order row must be an object.',
      rawOrder,
    );
    return null;
  }

  const step = readFiniteNumber(rawOrder.step, context, 'step');
  const price = readFiniteNumber(rawOrder.price, context, 'price');
  const qty = readFiniteNumber(rawOrder.qty, context, 'qty');
  const sharesAfter = readFiniteNumber(
    rawOrder.sharesAfter,
    context,
    'sharesAfter',
  );
  const cashAfter = readFiniteNumber(rawOrder.cashAfter, context, 'cashAfter');

  if (
    step == null ||
    price == null ||
    qty == null ||
    sharesAfter == null ||
    cashAfter == null ||
    typeof rawOrder.isBuffer !== 'boolean'
  ) {
    warnTargetValueChannelNormalization(
      context,
      'order row has invalid shape.',
      rawOrder,
    );
    return null;
  }

  const normalizedOrder: TargetValueChannelOrderLevel = {
    step,
    price,
    qty,
    isBuffer: rawOrder.isBuffer,
    sharesAfter,
    cashAfter,
  };

  try {
    validateFinancialArgs(
      {
        step: normalizedOrder.step,
        price: normalizedOrder.price,
        qty: normalizedOrder.qty,
        sharesAfter: normalizedOrder.sharesAfter,
        cashAfter: normalizedOrder.cashAfter,
      },
      {
        step: { min: ZERO_AMOUNT },
        price: { strictPositive: true },
        qty: { strictPositive: true },
        sharesAfter: { min: ZERO_AMOUNT },
        cashAfter: {},
      },
      context,
    );
  } catch (error: unknown) {
    warnTargetValueChannelNormalization(
      context,
      'order row validation failed.',
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  return normalizedOrder;
}

function readRequiredTargetValueChannelOrderLevels(
  rawOrders: unknown,
  context: string,
): TargetValueChannelOrderLevel[] | null {
  if (!Array.isArray(rawOrders)) {
    warnTargetValueChannelNormalization(
      context,
      'order rows must be an array.',
      rawOrders,
    );
    return null;
  }

  return rawOrders.reduce<TargetValueChannelOrderLevel[] | null>((orders, rawOrder, index) => {
    if (orders == null) {
      return null;
    }

    const normalizedOrder = normalizeTargetValueChannelOrderLevel(
      rawOrder,
      `${context}[${index}]`,
    );

    if (normalizedOrder == null) {
      return null;
    }

    orders.push(normalizedOrder);
    return orders;
  }, []);
}

function readTargetValueChannelAlarmConfig(
  rawAlarmConfig: unknown,
): AlarmConfig | undefined {
  if (!isRecord(rawAlarmConfig)) {
    return undefined;
  }

  if (typeof rawAlarmConfig.enabled !== 'boolean') {
    return undefined;
  }

  if (!Array.isArray(rawAlarmConfig.selectedHours)) {
    return undefined;
  }

  const selectedHours = rawAlarmConfig.selectedHours.filter(
    (hour): hour is string => typeof hour === 'string',
  );

  return {
    enabled: rawAlarmConfig.enabled,
    selectedHours,
    timezone: readOptionalString(rawAlarmConfig.timezone),
  };
}

function normalizeTargetValueChannelTrade(
  rawTrade: unknown,
  context: string,
): Trade | null {
  if (!isRecord(rawTrade)) {
    warnTargetValueChannelNormalization(
      context,
      'trade must be an object.',
      rawTrade,
    );
    return null;
  }

  const id = readRequiredString(rawTrade.id, context, 'id');
  const stock = readRequiredString(rawTrade.stock, context, 'stock');
  const date = readRequiredString(rawTrade.date, context, 'date');
  const price = readFiniteNumber(rawTrade.price, context, 'price');
  const quantity = readFiniteNumber(rawTrade.quantity, context, 'quantity');
  const fee = readFiniteNumber(rawTrade.fee, context, 'fee');
  const type =
    rawTrade.type === 'buy' || rawTrade.type === 'sell'
      ? rawTrade.type
      : null;

  if (
    id == null ||
    stock == null ||
    date == null ||
    price == null ||
    quantity == null ||
    fee == null ||
    type == null
  ) {
    warnTargetValueChannelNormalization(
      context,
      'trade row has invalid shape.',
      rawTrade,
    );
    return null;
  }

  const normalizedTrade: Trade = {
    id,
    type,
    stock,
    date,
    price,
    quantity,
    fee,
    metadata: isRecord(rawTrade.metadata) ? rawTrade.metadata : undefined,
  };

  try {
    validateFinancialArgs(
      {
        price: normalizedTrade.price,
        quantity: normalizedTrade.quantity,
        fee: normalizedTrade.fee,
      },
      {
        price: { strictPositive: true },
        quantity: { strictPositive: true },
        fee: { min: ZERO_AMOUNT },
      },
      context,
    );
  } catch (error) {
    warnTargetValueChannelNormalization(
      context,
      error instanceof Error
        ? error.message
        : 'trade row failed financial validation.',
      rawTrade,
    );
    return null;
  }

  return normalizedTrade;
}

function validateTargetValueChannelRuntimeStrategyBase(args: {
  maAPeriod: number;
  maBPeriod: number;
  splitCount: number;
  context: string;
}): void {
  validateWithSharedFinancialArgs({
    name: 'maAPeriod',
    value: args.maAPeriod,
    min: MIN_STRATEGY_PERIOD,
    max: MAX_STRATEGY_PERIOD,
    integer: true,
    context: args.context,
  });
  validateWithSharedFinancialArgs({
    name: 'maBPeriod',
    value: args.maBPeriod,
    min: MIN_STRATEGY_PERIOD,
    max: MAX_STRATEGY_PERIOD,
    integer: true,
    context: args.context,
  });
  validateWithSharedFinancialArgs({
    name: 'splitCount',
    value: args.splitCount,
    min: MIN_STRATEGY_SPLIT_COUNT,
    integer: true,
    context: args.context,
  });
}

function normalizeTargetValueChannelTrades(rawTrades: unknown): Trade[] {
  if (!Array.isArray(rawTrades)) {
    warnTargetValueChannelNormalization(
      'normalizeTargetValueChannelTrades',
      'trades must be an array.',
      rawTrades,
    );
    return [];
  }

  return rawTrades.reduce<Trade[]>((trades, rawTrade, index) => {
    const normalizedTrade = normalizeTargetValueChannelTrade(
      rawTrade,
      `normalizeTargetValueChannelTrades[${index}]`,
    );
    if (normalizedTrade != null) {
      trades.push(normalizedTrade);
    }
    return trades;
  }, []);
}

export function buildTargetValueChannelRuntimeStrategyFromRaw(args: {
  rawStrategy: unknown;
  persistedConfig: TargetValueChannelPersistedConfig;
}): TargetValueChannelRuntimeStrategy | null {
  if (!isRecord(args.rawStrategy)) {
    warnTargetValueChannelNormalization(
      'buildTargetValueChannelRuntimeStrategyFromRaw',
      'strategy must be an object.',
      args.rawStrategy,
    );
    return null;
  }

  const rawStrategy = args.rawStrategy;
  if (
    !isRecord(rawStrategy.ma0) ||
    !isRecord(rawStrategy.ma1) ||
    !isRecord(rawStrategy.ma2) ||
    !isRecord(rawStrategy.ma3)
  ) {
    warnTargetValueChannelNormalization(
      'buildTargetValueChannelRuntimeStrategyFromRaw',
      'ma0~ma3 runtime strategy fields must all exist.',
      rawStrategy,
    );
    return null;
  }

  const context = 'buildTargetValueChannelRuntimeStrategyFromRaw';
  const ma0Stock = readRequiredString(rawStrategy.ma0.stock, context, 'ma0.stock');
  const ma1Stock = readRequiredString(rawStrategy.ma1.stock, context, 'ma1.stock');
  const ma2Stock = readRequiredString(rawStrategy.ma2.stock, context, 'ma2.stock');
  const ma3Stock = readRequiredString(rawStrategy.ma3.stock, context, 'ma3.stock');
  const maAPeriod = readFiniteNumber(rawStrategy.ma0.maAPeriod, context, 'ma0.maAPeriod');
  const maBPeriod = readFiniteNumber(rawStrategy.ma0.maBPeriod, context, 'ma0.maBPeriod');
  const splitCount = readFiniteNumber(rawStrategy.ma2.splitCount, context, 'ma2.splitCount');

  if (
    ma0Stock == null ||
    ma1Stock == null ||
    ma2Stock == null ||
    ma3Stock == null ||
    maAPeriod == null ||
    maBPeriod == null ||
    splitCount == null ||
    typeof rawStrategy.ma0.rsiEnabled !== 'boolean' ||
    typeof rawStrategy.ma0.alignmentEnabled !== 'boolean'
  ) {
    warnTargetValueChannelNormalization(
      context,
      'runtime strategy base is incomplete.',
      rawStrategy,
    );
    return null;
  }

  try {
    validateTargetValueChannelRuntimeStrategyBase({
      maAPeriod,
      maBPeriod,
      splitCount,
      context,
    });
  } catch (error) {
    warnTargetValueChannelNormalization(
      context,
      error instanceof Error
        ? error.message
        : 'runtime strategy base failed shared validation.',
      rawStrategy,
    );
    return null;
  }

  const ma0 = {
    stock: ma0Stock,
    rsiEnabled: rawStrategy.ma0.rsiEnabled,
    alignmentEnabled: rawStrategy.ma0.alignmentEnabled,
    maAPeriod,
    maBPeriod,
  };

  const ma1 = {
    stock: ma1Stock,
    rsiThreshold: readOptionalFiniteNumber(rawStrategy.ma1.rsiThreshold),
    takePartialProfit: readBooleanWithFallback(
      rawStrategy.ma1.takePartialProfit,
      false,
    ),
    partialProfitTargetPct: readOptionalFiniteNumber(
      rawStrategy.ma1.partialProfitTargetPct,
    ),
  };

  const ma2 = {
    stock: ma2Stock,
    splitCount,
    rsiThreshold: readOptionalFiniteNumber(rawStrategy.ma2.rsiThreshold),
    takePartialProfit: readBooleanWithFallback(
      rawStrategy.ma2.takePartialProfit,
      false,
    ),
    partialProfitTargetPct: readOptionalFiniteNumber(
      rawStrategy.ma2.partialProfitTargetPct,
    ),
  };

  const ma3 = {
    stock: ma3Stock,
    rsiThreshold: readOptionalFiniteNumber(rawStrategy.ma3.rsiThreshold),
    takePartialProfit: readBooleanWithFallback(
      rawStrategy.ma3.takePartialProfit,
      false,
    ),
    partialProfitTargetPct: readOptionalFiniteNumber(
      rawStrategy.ma3.partialProfitTargetPct,
    ),
  };

  return {
    ma0,
    ma1,
    ma2,
    ma3,
    targetValueChannel: args.persistedConfig,
  };
}

export function normalizeTargetValueChannelStrategySlice(
  rawStrategy: unknown,
): TargetValueChannelPersistedConfig | undefined {
  if (!isRecord(rawStrategy)) {
    warnTargetValueChannelNormalization(
      'normalizeTargetValueChannelStrategySlice',
      'strategy must be an object.',
      rawStrategy,
    );
    return undefined;
  }

  const rawSlice = rawStrategy.targetValueChannel;
  if (!isRecord(rawSlice)) {
    warnTargetValueChannelNormalization(
      'normalizeTargetValueChannelStrategySlice',
      'targetValueChannel slice is missing.',
      rawSlice,
    );
    return undefined;
  }

  const context = 'normalizeTargetValueChannelStrategySlice';
  const initialCapital = readFiniteNumber(
    rawSlice.initialCapital,
    context,
    'initialCapital',
  );
  const initialAllocationPct = readFiniteNumber(
    rawSlice.initialAllocationPct,
    context,
    'initialAllocationPct',
  );
  const initialTargetValue = readFiniteNumber(
    rawSlice.initialTargetValue,
    context,
    'initialTargetValue',
  );
  const initialAvailableCash = readFiniteNumber(
    rawSlice.initialAvailableCash,
    context,
    'initialAvailableCash',
  );
  const bandRateUpper = readFiniteNumber(
    rawSlice.bandRateUpper,
    context,
    'bandRateUpper',
  );
  const bandRateLower = readFiniteNumber(
    rawSlice.bandRateLower,
    context,
    'bandRateLower',
  );
  const feeRate = readFiniteNumber(rawSlice.feeRate, context, 'feeRate');
  const baseGrowthRate = readFiniteNumber(
    rawSlice.baseGrowthRate,
    context,
    'baseGrowthRate',
  );
  const smartBrakeThreshold = readFiniteNumber(
    rawSlice.smartBrakeThreshold,
    context,
    'smartBrakeThreshold',
  );
  const minOrderQty = readFiniteNumber(
    rawSlice.minOrderQty,
    context,
    'minOrderQty',
  );
  const cashUsageRateBuy = readFiniteNumber(
    rawSlice.cashUsageRateBuy,
    context,
    'cashUsageRateBuy',
  );
  const cycleWeeks = readFiniteNumber(rawSlice.cycleWeeks, context, 'cycleWeeks');

  if (
    initialCapital == null ||
    initialAllocationPct == null ||
    initialTargetValue == null ||
    initialAvailableCash == null ||
    bandRateUpper == null ||
    bandRateLower == null ||
    feeRate == null ||
    baseGrowthRate == null ||
    smartBrakeThreshold == null ||
    minOrderQty == null ||
    cashUsageRateBuy == null ||
    cycleWeeks == null
  ) {
    return undefined;
  }

  const adjustmentMode = normalizeTargetValueChannelAdjustmentMode(
    rawSlice.adjustmentMode,
  );
  const adjustmentAmount = isAdjustmentAmountInputEnabled(adjustmentMode)
    ? readFiniteNumber(rawSlice.adjustmentAmount, context, 'adjustmentAmount')
    : ZERO_AMOUNT;

  if (adjustmentAmount == null) {
    return undefined;
  }

  const config: TargetValueChannelPersistedConfig = {
    initialCapital,
    initialAllocationPct,
    initialTargetValue,
    initialAvailableCash,
    bandRateUpper,
    bandRateLower,
    feeRate,
    baseGrowthRate,
    smartBrakeThreshold,
    minOrderQty,
    cashUsageRateBuy,
    cycleWeeks,
    adjustmentMode,
    adjustmentAmount: isAdjustmentAmountInputEnabled(adjustmentMode)
      ? roundMoney(adjustmentAmount)
      : ZERO_AMOUNT,
  };

  try {
    validateTargetValueChannelPersistedConfig(config, context);
    return config;
  } catch (error: unknown) {
    warnTargetValueChannelNormalization(
      context,
      'persisted config validation failed.',
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

export function readTargetValueChannelSnapshotFromRow(
  row: TargetValueChannelPortfolioRow,
): TargetValueChannelSnapshot | undefined {
  const rawSnapshot =
    row.target_value_channel_snapshot ?? row.targetValueChannelSnapshot;

  if (rawSnapshot == null) {
    return undefined;
  }

  if (!isRecord(rawSnapshot)) {
    warnTargetValueChannelNormalization(
      'readTargetValueChannelSnapshotFromRow',
      'snapshot must be an object.',
      rawSnapshot,
    );
    return undefined;
  }

  const context = 'readTargetValueChannelSnapshotFromRow';
  const currentT = readFiniteNumber(rawSnapshot.currentT, context, 'currentT');
  const availableCash = readFiniteNumber(
    rawSnapshot.availableCash,
    context,
    'availableCash',
  );
  const shares = readFiniteNumber(rawSnapshot.shares, context, 'shares');
  const avgPrice = readFiniteNumber(rawSnapshot.avgPrice, context, 'avgPrice');
  const bandLow = readFiniteNumber(rawSnapshot.bandLow, context, 'bandLow');
  const bandHigh = readFiniteNumber(rawSnapshot.bandHigh, context, 'bandHigh');
  const cycleIndex = readFiniteNumber(
    rawSnapshot.cycleIndex,
    context,
    'cycleIndex',
  );

  if (
    currentT == null ||
    availableCash == null ||
    shares == null ||
    avgPrice == null ||
    bandLow == null ||
    bandHigh == null ||
    cycleIndex == null
  ) {
    return undefined;
  }

  const buyOrders = readRequiredTargetValueChannelOrderLevels(
    rawSnapshot.buyOrders,
    `${context}:buyOrders`,
  );
  const sellOrders = readRequiredTargetValueChannelOrderLevels(
    rawSnapshot.sellOrders,
    `${context}:sellOrders`,
  );

  if (buyOrders == null || sellOrders == null) {
    return undefined;
  }

  const snapshot: TargetValueChannelSnapshot = {
    currentT,
    availableCash,
    shares,
    avgPrice,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex,
  };

  try {
    validateTargetValueChannelSnapshot(snapshot, context);
    return snapshot;
  } catch (error: unknown) {
    warnTargetValueChannelNormalization(
      context,
      'snapshot validation failed.',
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

export function normalizeTargetValueChannelPortfolioRow(
  row: TargetValueChannelPortfolioRow,
): TargetValueChannelNormalizedPortfolio | null {
  const context = 'normalizeTargetValueChannelPortfolioRow';
  const persistedConfig = normalizeTargetValueChannelStrategySlice(row.strategy);
  const id = readRequiredString(row.id, context, 'id');
  const name = readRequiredString(row.name, context, 'name');
  const startDate = readRequiredString(row.start_date, context, 'start_date');
  const dailyBuyAmount = readFiniteNumber(
    row.daily_buy_amount,
    context,
    'daily_buy_amount',
  );
  const feeRate = readFiniteNumber(row.fee_rate, context, 'fee_rate');
  const runtimeStrategy =
    persistedConfig == null
      ? null
      : buildTargetValueChannelRuntimeStrategyFromRaw({
          rawStrategy: row.strategy,
          persistedConfig,
        });
  const snapshot = readTargetValueChannelSnapshotFromRow(row);

  if (
    persistedConfig == null ||
    id == null ||
    name == null ||
    startDate == null ||
    dailyBuyAmount == null ||
    feeRate == null ||
    runtimeStrategy == null ||
    snapshot == null
  ) {
    return null;
  }

  return {
    id,
    name,
    dailyBuyAmount,
    startDate,
    feeRate,
    strategy: runtimeStrategy,
    trades: normalizeTargetValueChannelTrades(row.trades),
    isClosed: readBooleanWithFallback(row.is_closed, false),
    closedAt: row.closed_at == null ? undefined : String(row.closed_at),
    finalSellAmount:
      readFiniteNumber(
        row.final_sell_amount,
        'normalizeTargetValueChannelPortfolioRow',
        'final_sell_amount',
      ) ?? undefined,
    alarmconfig: readTargetValueChannelAlarmConfig(row.alarm_config),
    targetValueChannelSnapshot: snapshot,
  };
}

export function resolveTargetValueChannelTradeStartingAvailableCash(args: {
  snapshot: Pick<TargetValueChannelSnapshot, 'availableCash'> | null | undefined;
}): number {
  if (args.snapshot == null) {
    throw new Error(
      '[TVC_Trade_Error] resolveTargetValueChannelTradeStartingAvailableCash: current snapshot is required before trade mutation.',
    );
  }

  return args.snapshot.availableCash;
}

export function calculateTargetValueChannelMaxBuyStep(
  buyOrders: TargetValueChannelOrderLevel[],
): number {
  const nonBufferOrders = buyOrders.filter((order) => !order.isBuffer);
  if (nonBufferOrders.length === ZERO_AMOUNT) {
    return ZERO_AMOUNT;
  }

  return Math.max(...nonBufferOrders.map((order) => order.step));
}

export function calculateNextCycleState(args: {
  config: TargetValueChannelPersistedConfig;
  snapshot: TargetValueChannelSnapshot;
}): NextCycleState {
  const { config, snapshot } = args;

  validateTargetValueChannelPersistedConfig(
    config,
    'calculateNextCycleState:config',
  );
  validateTargetValueChannelSnapshot(
    snapshot,
    'calculateNextCycleState:snapshot',
  );

  const baseGrowthRateDecimal = toDecimalPercent(
    'baseGrowthRate',
    config.baseGrowthRate,
    MIN_BASE_GROWTH_RATE,
    MAX_BASE_GROWTH_RATE,
  );
  const smartBrakeThresholdDecimal = toDecimalPercent(
    'smartBrakeThreshold',
    config.smartBrakeThreshold,
    MIN_SMART_BRAKE_THRESHOLD,
    MAX_SMART_BRAKE_THRESHOLD,
  );

  const rawCashRatio = snapshot.availableCash / snapshot.currentT;
  validateFinancialArgs(
    { rawCashRatio },
    { rawCashRatio: { min: ZERO_AMOUNT } },
    'calculateNextCycleState:cashRatio',
  );

  // Why: 임계값 경계에서 0.25000000004 같은 찌꺼기가 남으면 안전모드 비교가 뒤집힐 수 있으므로,
  // threshold와 동일한 정밀도로 먼저 반올림한 뒤 분기합니다.
  const cashRatio = roundRate(rawCashRatio);
  const isSafetyMode = cashRatio <= smartBrakeThresholdDecimal;
  const growthInput = isSafetyMode ? cashRatio * cashRatio : cashRatio;
  const appliedGrowthRateDecimal = roundRate(baseGrowthRateDecimal * growthInput);
  const appliedAdjustmentAmount = resolveSignedAdjustmentAmount(
    config.adjustmentMode,
    config.adjustmentAmount,
  );

  const nextTargetValue = roundMoney(
    snapshot.currentT * (1 + appliedGrowthRateDecimal) + appliedAdjustmentAmount,
  );
  validateFinancialArgs(
    { nextTargetValue },
    { nextTargetValue: { strictPositive: true } },
    'calculateNextCycleState:nextTargetValue',
  );

  const nextAvailableCash = roundMoney(
    snapshot.availableCash + appliedAdjustmentAmount,
  );
  validateFinancialArgs(
    { nextAvailableCash },
    { nextAvailableCash: { min: ZERO_AMOUNT } },
    'calculateNextCycleState:nextAvailableCash',
  );

  const nextBands = calculateBandsFromTargetValue({
    targetValue: nextTargetValue,
    bandRateUpper: config.bandRateUpper,
    bandRateLower: config.bandRateLower,
  });

  return {
    nextTargetValue,
    nextAvailableCash,
    nextBandLow: nextBands.bandLow,
    nextBandHigh: nextBands.bandHigh,
    cashRatio,
    isSafetyMode,
    appliedGrowthRateDecimal,
    appliedAdjustmentAmount,
    nextCycleIndex: snapshot.cycleIndex + 1,
  };
}

export function buildStrategyCreatorSummaryViewModel(
  config: Pick<
    TargetValueChannelPersistedConfig,
    | 'initialCapital'
    | 'initialAllocationPct'
    | 'initialTargetValue'
    | 'initialAvailableCash'
    | 'baseGrowthRate'
    | 'smartBrakeThreshold'
  >,
): StrategyCreatorSummaryViewModel {
  const rowsById: Record<SummaryRowId, StrategyCreatorSummaryRowViewModel> = {
    initialTargetValue: {
      id: 'initialTargetValue',
      value: formatCurrency(config.initialTargetValue),
    },
    initialAvailableCash: {
      id: 'initialAvailableCash',
      value: formatCurrency(config.initialAvailableCash),
    },
    baseGrowthRate: {
      id: 'baseGrowthRate',
      value: formatPercent(config.baseGrowthRate),
    },
    smartBrakeThreshold: {
      id: 'smartBrakeThreshold',
      value: formatPercent(config.smartBrakeThreshold),
    },
    safetyMode: {
      id: 'safetyMode',
      formulaId: 'safetyMode',
    },
    normalMode: {
      id: 'normalMode',
      formulaId: 'normalMode',
    },
  };

  return {
    initialCapitalDisplay: formatCurrency(config.initialCapital),
    initialAllocationPct: config.initialAllocationPct,
    rows: SUMMARY_ROW_ORDER.map((rowId) => rowsById[rowId]),
  };
}

export function runSimulationExamples(): void {
  const strategyDefaultsAdapter =
    SIMULATION_SAMPLE_TARGET_VALUE_CHANNEL_DEFAULTS;
  const baseStrategy = buildTargetValueChannelStrategyBase(
    strategyDefaultsAdapter,
  );
  const wizardDraft: TargetValueChannelWizardDraftInput = {
    initialCapital: 1000,
    initialAllocationPct: 25,
    bandUpperPct: 5,
    bandLowerPct: 5,
    baseGrowthRate: 10,
    smartBrakeThreshold: 50,
    minOrderQty: 1,
    cashUsageRateBuyPct: 50,
    cycleWeeks: 2,
    adjustmentMode: 'deposit',
    adjustmentAmount: 100,
  };
  const creatorInput = buildTargetValueChannelCreatorInput({
    meta: {
      feeRatePercent: 0.25,
    },
    draft: wizardDraft,
  });
  const creationArtifacts = buildTargetValueChannelCreationArtifacts(creatorInput);
  const sliceEnvelope = buildTargetValueChannelSliceEnvelope(creatorInput);
  const insertEnvelope = buildTargetValueChannelPortfolioInsertEnvelope({
    meta: {
      feeRatePercent: 0.25,
    },
    draft: wizardDraft,
    baseStrategy,
  });
  const portfolioDraft = buildTargetValueChannelPortfolioDraft({
    meta: {
      name: 'TVC Demo',
      dailyBuyAmount: 100,
      startDate: '2026-04-23',
      feeRatePercent: 0.25,
    },
    draft: wizardDraft,
    baseStrategy,
  });
  const normalizedPortfolioRow = normalizeTargetValueChannelPortfolioRow({
    id: 'portfolio-1',
    name: 'TVC Demo',
    daily_buy_amount: 100,
    start_date: '2026-04-23',
    fee_rate: 0.25,
    strategy: insertEnvelope.strategy,
    trades: [],
    is_closed: false,
    target_value_channel_snapshot: insertEnvelope.targetValueChannelSnapshot,
  });
  const { persistedConfig: config, initialSnapshot } = creationArtifacts;
  const normalModeState = calculateNextCycleState({
    config,
    snapshot: initialSnapshot,
  });
  const tradeSnapshot = computeTargetValueChannelSnapshotAfterTrade({
    currentSnapshot: initialSnapshot,
    trade: {
      type: 'buy',
      price: 50,
      quantity: 1,
    },
    nextAvailableCash: 700,
    config,
  });
  const refreshedSnapshot = buildRefreshedTargetValueChannelSnapshot({
    previous: initialSnapshot,
    config,
    targetCycleIndex: 3,
  });
  const refreshPersistencePayload =
    buildTargetValueChannelRefreshPersistencePayload(refreshedSnapshot);
  const strategyAdapterExample: Strategy = {
    ma0: {
      stock: 'TQQQ',
      rsiEnabled: false,
    },
    ma1: {
      stock: 'TQQQ',
    },
    ma2: {
      stock: 'TQQQ',
      splitCount: 1,
    },
    ma3: {
      stock: 'TQQQ',
    },
    targetValueChannel: insertEnvelope.strategy.targetValueChannel,
  };
  const summaryViewModel = buildStrategyCreatorSummaryViewModel(config);

  console.log('[TargetValueChannelSimulation] creation pipeline example');
  console.log(creationArtifacts);
  console.log('[TargetValueChannelSimulation] one-way creator-input builder example');
  console.log(creatorInput);
  console.log('[TargetValueChannelSimulation] strategy defaults adapter example');
  console.log(strategyDefaultsAdapter);
  console.log('[TargetValueChannelSimulation] creator -> low-level slice envelope example');
  console.log(sliceEnvelope);
  console.log('[TargetValueChannelSimulation] creator -> insert envelope example');
  console.log(insertEnvelope);
  console.log('[TargetValueChannelSimulation] creator portfolio-draft envelope example');
  console.log(portfolioDraft);
  console.log('[TargetValueChannelSimulation] normalize row example');
  console.log(normalizedPortfolioRow);
  console.log('[TargetValueChannelSimulation] initial snapshot');
  console.log(initialSnapshot);
  console.log('[TargetValueChannelSimulation] adjustment input enabled example');
  console.log({
    none: isAdjustmentAmountInputEnabled('none'),
    deposit: isAdjustmentAmountInputEnabled('deposit'),
    withdraw: isAdjustmentAmountInputEnabled('withdraw'),
  });
  console.log('[TargetValueChannelSimulation] adjustment mode normalization example');
  console.log({
    trimmedDeposit: normalizeTargetValueChannelAdjustmentMode('deposit '),
    invalidValue: normalizeTargetValueChannelAdjustmentMode('unexpected-mode'),
    nonStringValue: normalizeTargetValueChannelAdjustmentMode(null),
  });
  console.log('[TargetValueChannelSimulation] trade available-cash resolve example');
  console.log(
    resolveTargetValueChannelTradeStartingAvailableCash({
      snapshot: initialSnapshot,
    }),
  );
  console.log('[TargetValueChannelSimulation] max buy step example');
  console.log(calculateTargetValueChannelMaxBuyStep(initialSnapshot.buyOrders));
  console.log('[TargetValueChannelSimulation] step 0 safe-order merge example');
  console.log(buildTargetValueChannelSafeOrders(initialSnapshot));
  console.log('[TargetValueChannelSimulation] executable-order separation example');
  console.log({
    executableBuyOrders: getExecutableTargetValueChannelOrders(
      buildTargetValueChannelSafeOrders(initialSnapshot).safeBuyOrders,
    ),
    hasExecutableBuyOrders: hasExecutableTargetValueChannelOrders(
      buildTargetValueChannelSafeOrders(initialSnapshot).safeBuyOrders,
    ),
  });
  console.log('[TargetValueChannelSimulation] order-modal view model example');
  console.log(
    buildTargetValueChannelOrderModalViewModel({
      snapshot: initialSnapshot,
      activeTab: 'buy',
    }),
  );
  console.log('[TargetValueChannelSimulation] trade snapshot example');
  console.log(tradeSnapshot);
  console.log('[TargetValueChannelSimulation] multi-cycle refresh snapshot example');
  console.log(refreshedSnapshot);
  console.log('[TargetValueChannelSimulation] refresh persistence payload example');
  console.log(refreshPersistencePayload);
  console.log('[TargetValueChannelSimulation] strategy adapter example');
  console.log(getTargetValueChannelConfig(strategyAdapterExample));
  console.log('[TargetValueChannelSimulation] tracked-stocks isolation example');
  console.log(getTargetValueChannelTrackedStocks({ strategy: insertEnvelope.strategy }));
  console.log('[TargetValueChannelSimulation] normal-mode example');
  console.log(normalModeState);
  console.log('[TargetValueChannelSimulation] summary view model example');
  console.log(summaryViewModel);
  console.log('[TargetValueChannelSimulation] summary snippet files');
  console.log({
    summaryContractFile: './target_value_channel_summary_contract.ts',
    validationBridgeFile: './target_value_channel_validation_bridge.ts',
    messagesFile: './target_value_channel_messages.ts',
    summaryCardFile: './target_value_channel_summary_card.tsx',
  });

  const safetySnapshot: TargetValueChannelSnapshot = {
    ...initialSnapshot,
    currentT: 500,
    availableCash: 250,
    cycleIndex: 3,
  };
  const safetyState = calculateNextCycleState({
    config: {
      ...config,
      adjustmentMode: 'none',
      adjustmentAmount: 0,
      smartBrakeThreshold: 50,
    },
    snapshot: safetySnapshot,
  });

  console.log('[TargetValueChannelSimulation] exact-threshold safety-mode example');
  console.log(safetyState);

  const highCashSnapshot: TargetValueChannelSnapshot = {
    ...initialSnapshot,
    currentT: 250,
    availableCash: 1250,
    cycleIndex: 1,
  };
  const highCashState = calculateNextCycleState({
    config: {
      ...config,
      adjustmentMode: 'deposit',
      adjustmentAmount: 300,
      baseGrowthRate: 12,
    },
    snapshot: highCashSnapshot,
  });

  console.log('[TargetValueChannelSimulation] no-cap cash-ratio example');
  console.log(highCashState);

  console.log('[TargetValueChannelSimulation] integer -> decimal conversion example');
  console.log({
    storedBaseGrowthRate: config.baseGrowthRate,
    baseGrowthRateDecimal: toDecimalPercent(
      'baseGrowthRate',
      config.baseGrowthRate,
      MIN_BASE_GROWTH_RATE,
      MAX_BASE_GROWTH_RATE,
    ),
    storedSmartBrakeThreshold: config.smartBrakeThreshold,
    smartBrakeThresholdDecimal: toDecimalPercent(
      'smartBrakeThreshold',
      config.smartBrakeThreshold,
      MIN_SMART_BRAKE_THRESHOLD,
      MAX_SMART_BRAKE_THRESHOLD,
    ),
  });

  try {
    computeHoldingStateAfterTrade({
      previousShares: 1,
      previousAvgPrice: 100,
      trade: {
        type: 'sell',
        price: 120,
        quantity: 2,
      },
    });
  } catch (error: unknown) {
    console.log('[TargetValueChannelSimulation] oversell fail-fast example');
    console.log(error instanceof Error ? error.message : error);
  }

  try {
    resolveTargetValueChannelTradeStartingAvailableCash({
      snapshot: null,
    });
  } catch (error: unknown) {
    console.log(
      '[TargetValueChannelSimulation] missing starting-cash snapshot fail-fast example',
    );
    console.log(error instanceof Error ? error.message : error);
  }

  try {
    computeTargetValueChannelSnapshotAfterTrade({
      currentSnapshot: null,
      trade: {
        type: 'buy',
        price: 10,
        quantity: 1,
      },
      nextAvailableCash: 100,
      config,
    });
  } catch (error: unknown) {
    console.log('[TargetValueChannelSimulation] missing snapshot fail-fast example');
    console.log(error instanceof Error ? error.message : error);
  }

  try {
    calculateNextCycleState({
      config,
      snapshot: {
        ...initialSnapshot,
        currentT: 0,
      },
    });
  } catch (error: unknown) {
    console.log('[TargetValueChannelSimulation] T <= 0 fail-fast example');
    console.log(error instanceof Error ? error.message : error);
  }
}
