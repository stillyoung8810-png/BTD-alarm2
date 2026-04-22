import {
  STRATEGY_DEFAULTS,
  roundMoney,
} from '@/constants/domain/financeRules';
import {
  RATE_PRECISION_MULTIPLIER,
  VR_BAND_WIDTH_PCT,
} from '@/constants/vrConstants';
import type {
  MultiSplitStrategy,
  NoStopMultiSplitStrategy,
  Portfolio,
  Strategy,
  VrBandStrategyParams,
  VrSnapshot,
} from '@/types';
import {
  createInitialVrSnapshot,
  sanitizeVrCycleWeeks,
} from '@/utils/vrBandStrategy';

const PERCENT_DENOMINATOR = 100;
const SECTION_TWO_SPLIT_COUNT = 1;
const DEFAULT_VR_REFERENCE_STOCK = 'TQQQ';
const ZERO_AMOUNT = 0;
const EMPTY_STRING = '';
export const DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO = 50;
export const DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT = 65;
export const DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT = 20;
const DEFAULT_NO_STOP_BASE_LOC_RATIO = 50;
const DEFAULT_NO_STOP_TAKE_PROFIT_PCT = 10;

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

export const MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET = BUDGET_LOC_RATIO_BY_PRESET;
export const MULTI_SPLIT_RSI_THRESHOLD_BY_PRESET = RSI_THRESHOLD_BY_PRESET;
export const MULTI_SPLIT_ALIGNMENT_PERIODS_BY_PRESET =
  ALIGNMENT_PERIODS_BY_PRESET;

export type NoStopBudgetPresetId = keyof typeof BUDGET_LOC_RATIO_BY_PRESET;
export type NoStopRsiPresetId = keyof typeof RSI_THRESHOLD_BY_PRESET;
export type NoStopMaPresetId = keyof typeof ALIGNMENT_PERIODS_BY_PRESET;
export type MultiSplitBudgetPresetId =
  keyof typeof MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET;
export type MultiSplitRsiPresetId =
  keyof typeof MULTI_SPLIT_RSI_THRESHOLD_BY_PRESET;
export type MultiSplitMaPresetId =
  keyof typeof MULTI_SPLIT_ALIGNMENT_PERIODS_BY_PRESET;

export interface NoStopConditionPresetDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: NoStopBudgetPresetId;
}

export interface MultiSplitConditionPresetDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: MultiSplitBudgetPresetId;
}

export type StrategyType =
  | 'rsi_ma_interval'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';

export interface StrategyCreatorMetaDraftInput {
  name?: string;
  /** 폼/controlled input에서 `string`으로 올 수 있음 — `safeNumber`가 파싱 */
  dailyBuyAmount?: number | string;
  startDate?: string;
  /** 빈 문자열 `""`는 `Number("") === 0` 맹점이 있으므로 `safeNumber(..., STRATEGY_DEFAULTS.FEE_RATE_PERCENT)`로만 정규화 */
  feeRatePercent?: number | string;
}

export interface MaIntervalSectionDraftInput {
  stock?: string;
  rsiThreshold?: number;
  takePartialProfit?: boolean;
  partialProfitTargetPct?: number;
}

export interface MaIntervalWizardDraftInput {
  ma0Stock?: string;
  maAPeriod?: number;
  maBPeriod?: number;
  rsiEnabled?: boolean;
  alignmentEnabled?: boolean;
  ma1?: MaIntervalSectionDraftInput;
  ma2?: MaIntervalSectionDraftInput;
  ma3?: MaIntervalSectionDraftInput;
}

export interface MultiSplitWizardDraftInput {
  targetStock?: string;
  targetReturnRate?: number;
  totalSplitCount?: number;
  baseLocRatio?: number;
  mainTakeProfitRatioPct?: number;
  riskCutRatioPct?: number;
  rsiCondition?: MultiSplitConditionPresetDraft<MultiSplitRsiPresetId>;
  alignmentCondition?: MultiSplitConditionPresetDraft<MultiSplitMaPresetId>;
}

export interface NoStopMultiSplitWizardDraftInput {
  targetStock?: string;
  baseLocRatio?: number;
  takeProfitPct?: number;
  totalSplitCount?: number;
  rsiCondition?: NoStopConditionPresetDraft<NoStopRsiPresetId>;
  alignmentCondition?: NoStopConditionPresetDraft<NoStopMaPresetId>;
}

export interface VrBandWizardDraftInput {
  vrMode?: VrBandStrategyParams['vrMode'];
  initialCapital?: number;
  initialV?: number;
  minOrderQty?: number;
  bandUpperPct?: number;
  bandLowerPct?: number;
  g?: number;
  poolUsagePct?: number;
  deltaCash?: number;
  cycleWeeks?: number;
}

export interface StrategyWizardDraftInput {
  meta?: StrategyCreatorMetaDraftInput;
  maInterval?: MaIntervalWizardDraftInput;
  multiSplit?: MultiSplitWizardDraftInput;
  noStopMultiSplit?: NoStopMultiSplitWizardDraftInput;
  vrBand?: VrBandWizardDraftInput;
}

export interface PortfolioSetupValidationInput {
  name: string;
  dailyBuyAmount: number;
  feeRatePercent: number;
  maShortPeriod: number;
  maLongPeriod: number;
  withdrawalAmount: number;
}

export interface PortfolioDraftBuildResult {
  portfolio: Omit<Portfolio, 'id'>;
  validationInput: PortfolioSetupValidationInput;
}

interface StrategyBuildResult {
  strategy: Strategy;
  initialVrSnapshot: VrSnapshot | null;
}

interface NormalizedMetaDraft {
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRatePercent: number;
}

interface NormalizedMaSectionDraft {
  stock: string;
  rsiThreshold: number;
  takePartialProfit: boolean;
  partialProfitTargetPct: number;
}

export function safeTrim(val: unknown): string {
  return typeof val === 'string' ? val.trim() : EMPTY_STRING;
}

/**
 * Rule 1 & 6: `Number("") === 0` 맹점 — 빈 문자열은 유효한 숫자 0이 아니라 **미입력**으로 보고 `fallback`을 쓴다.
 * (공백만 있는 문자열은 `trim()` 후 빈 문자열과 동일하게 처리한다. `Number("  ")`는 `NaN`이지만, 여기서는 일관되게 fallback으로 보낸다.)
 */
export function safeNumber(val: unknown, fallback: number = ZERO_AMOUNT): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === EMPTY_STRING) {
      return fallback;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function safeBoolean(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

export function sanitizeVrBandWidthPercent(value: unknown): number {
  const parsedValue = safeNumber(value, VR_BAND_WIDTH_PCT.DEFAULT);

  if (parsedValue < VR_BAND_WIDTH_PCT.MIN) {
    return VR_BAND_WIDTH_PCT.MIN;
  }

  if (parsedValue > VR_BAND_WIDTH_PCT.MAX) {
    return VR_BAND_WIDTH_PCT.MAX;
  }

  return parsedValue;
}

function toDecimalRate(percent: number): number {
  if (!Number.isFinite(percent)) {
    return ZERO_AMOUNT;
  }

  const rawRate = percent / PERCENT_DENOMINATOR;

  return (
    Math.round((rawRate + Number.EPSILON) * RATE_PRECISION_MULTIPLIER) /
    RATE_PRECISION_MULTIPLIER
  );
}

function normalizeMetaDraft(
  meta: StrategyCreatorMetaDraftInput | undefined,
): NormalizedMetaDraft {
  return {
    name: safeTrim(meta?.name),
    dailyBuyAmount: roundMoney(
      safeNumber(meta?.dailyBuyAmount, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
    ),
    startDate: safeTrim(meta?.startDate),
    // 수수료: 빈 문자열·미입력이 0%로 떨어지면 정산 오류 — 도메인 기본값을 명시 fallback으로 전달
    feeRatePercent: roundMoney(
      safeNumber(meta?.feeRatePercent, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
    ),
  };
}

function normalizeMaSectionDraft(
  section: MaIntervalSectionDraftInput | undefined,
): NormalizedMaSectionDraft {
  return {
    stock: safeTrim(section?.stock),
    rsiThreshold: safeNumber(section?.rsiThreshold),
    takePartialProfit: safeBoolean(section?.takePartialProfit),
    partialProfitTargetPct: safeNumber(section?.partialProfitTargetPct),
  };
}

export function buildValidationInput(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
): PortfolioSetupValidationInput {
  const meta = normalizeMetaDraft(wizardState.meta);

  switch (selectedStrategy) {
    case 'rsi_ma_interval': {
      const maIntervalDraft = wizardState.maInterval;
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: safeNumber(maIntervalDraft?.maAPeriod),
        maLongPeriod: safeNumber(maIntervalDraft?.maBPeriod),
        withdrawalAmount: ZERO_AMOUNT,
      };
    }
    case 'multi_split':
    case 'no_stop_multi_split':
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: ZERO_AMOUNT,
      };
    case 'vr_band': {
      const vrBandDraft = wizardState.vrBand;
      const vrMode = vrBandDraft?.vrMode ?? 'lump_sum';
      const normalizedWithdrawalAmount =
        vrMode === 'withdraw'
          ? roundMoney(Math.abs(safeNumber(vrBandDraft?.deltaCash)))
          : ZERO_AMOUNT;

      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: normalizedWithdrawalAmount,
      };
    }
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

function buildMaIntervalStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const maDraft = wizardState.maInterval;
  const ma1 = normalizeMaSectionDraft(maDraft?.ma1);
  const ma2 = normalizeMaSectionDraft(maDraft?.ma2);
  const ma3 = normalizeMaSectionDraft(maDraft?.ma3);
  const isRsiEnabled = safeBoolean(maDraft?.rsiEnabled);

  return {
    strategy: {
      ma0: {
        stock: safeTrim(maDraft?.ma0Stock),
        rsiEnabled: isRsiEnabled,
        alignmentEnabled: safeBoolean(maDraft?.alignmentEnabled),
        maAPeriod: safeNumber(maDraft?.maAPeriod),
        maBPeriod: safeNumber(maDraft?.maBPeriod),
      },
      ma1: {
        stock: ma1.stock,
        rsiThreshold: isRsiEnabled ? ma1.rsiThreshold : undefined,
        takePartialProfit: ma1.takePartialProfit,
        partialProfitTargetPct: ma1.takePartialProfit
          ? ma1.partialProfitTargetPct
          : undefined,
      },
      ma2: {
        stock: ma2.stock,
        splitCount: SECTION_TWO_SPLIT_COUNT,
        rsiThreshold: isRsiEnabled ? ma2.rsiThreshold : undefined,
        takePartialProfit: ma2.takePartialProfit,
        partialProfitTargetPct: ma2.takePartialProfit
          ? ma2.partialProfitTargetPct
          : undefined,
      },
      ma3: {
        stock: ma3.stock,
        rsiThreshold: isRsiEnabled ? ma3.rsiThreshold : undefined,
        takePartialProfit: ma3.takePartialProfit,
        partialProfitTargetPct: ma3.takePartialProfit
          ? ma3.partialProfitTargetPct
          : undefined,
      },
    },
    initialVrSnapshot: null,
  };
}

function buildSingleStockStrategyBase(targetStock: string): Pick<
  Strategy,
  'ma0' | 'ma1' | 'ma2' | 'ma3'
> {
  return {
    ma0: {
      stock: targetStock,
      rsiEnabled: false,
      alignmentEnabled: false,
      maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
      maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    },
    ma1: { stock: targetStock },
    ma2: { stock: targetStock, splitCount: SECTION_TWO_SPLIT_COUNT },
    ma3: { stock: targetStock },
  };
}

function buildMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.multiSplit;
  const targetStock = safeTrim(draft?.targetStock);
  const runtimeMultiSplitStrategy: MultiSplitStrategy = {
    targetStock,
    targetReturnRate: safeNumber(draft?.targetReturnRate),
    totalSplitCount: safeNumber(draft?.totalSplitCount),
    baseLocRatio: safeNumber(
      draft?.baseLocRatio,
      DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
    ),
    mainTakeProfitRatioPct: safeNumber(
      draft?.mainTakeProfitRatioPct,
      DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
    ),
    riskCutRatioPct: safeNumber(
      draft?.riskCutRatioPct,
      DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
    ),
  };

  if (draft?.rsiCondition?.isEnabled === true) {
    runtimeMultiSplitStrategy.rsiRule = {
      threshold:
        MULTI_SPLIT_RSI_THRESHOLD_BY_PRESET[draft.rsiCondition.criterionPreset],
      locRatio:
        MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET[draft.rsiCondition.budgetPreset],
    };
  }

  if (draft?.alignmentCondition?.isEnabled === true) {
    const alignmentPeriods =
      MULTI_SPLIT_ALIGNMENT_PERIODS_BY_PRESET[
        draft.alignmentCondition.criterionPreset
      ];
    runtimeMultiSplitStrategy.alignmentRule = {
      shortPeriod: alignmentPeriods.shortPeriod,
      longPeriod: alignmentPeriods.longPeriod,
      locRatio:
        MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET[
          draft.alignmentCondition.budgetPreset
        ],
    };
  }

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      multiSplit: runtimeMultiSplitStrategy,
    },
    initialVrSnapshot: null,
  };
}

function buildNoStopMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.noStopMultiSplit;
  const targetStock = safeTrim(draft?.targetStock);
  const runtimeNoStopStrategy: NoStopMultiSplitStrategy = {
    targetStock,
    baseLocRatio: safeNumber(
      draft?.baseLocRatio,
      DEFAULT_NO_STOP_BASE_LOC_RATIO,
    ),
    takeProfitPct: safeNumber(
      draft?.takeProfitPct,
      DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
    ),
    totalSplitCount: safeNumber(draft?.totalSplitCount),
  };

  if (draft?.rsiCondition?.isEnabled === true) {
    runtimeNoStopStrategy.rsiRule = {
      threshold: RSI_THRESHOLD_BY_PRESET[draft.rsiCondition.criterionPreset],
      locRatio: BUDGET_LOC_RATIO_BY_PRESET[draft.rsiCondition.budgetPreset],
    };
  }

  if (draft?.alignmentCondition?.isEnabled === true) {
    const alignmentPeriods =
      ALIGNMENT_PERIODS_BY_PRESET[draft.alignmentCondition.criterionPreset];
    runtimeNoStopStrategy.alignmentRule = {
      shortPeriod: alignmentPeriods.shortPeriod,
      longPeriod: alignmentPeriods.longPeriod,
      locRatio: BUDGET_LOC_RATIO_BY_PRESET[draft.alignmentCondition.budgetPreset],
    };
  }

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      noStopMultiSplit: runtimeNoStopStrategy,
    },
    initialVrSnapshot: null,
  };
}

function buildVrBandStrategy(
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  const draft = wizardState.vrBand;
  const vrMode = draft?.vrMode ?? 'lump_sum';
  // `feeRatePercent`는 `buildValidationInput` → `normalizeMetaDraft`를 거친 UI 퍼센트(%) — 여기서 `safeNumber`·`Number.isFinite`로 이중 방어하지 않는다(Rule 6 데드코드 제거).
  const normalizedFeeRate = toDecimalRate(feeRatePercent);
  const absoluteDeltaCash = roundMoney(Math.abs(safeNumber(draft?.deltaCash)));

  const vrBaseParams = {
    initialCapital: safeNumber(draft?.initialCapital),
    initialV: safeNumber(draft?.initialV),
    minOrderQty: safeNumber(draft?.minOrderQty),
    feeRate: normalizedFeeRate,
    bandRateUpper: toDecimalRate(
      sanitizeVrBandWidthPercent(draft?.bandUpperPct),
    ),
    bandRateLower: toDecimalRate(
      sanitizeVrBandWidthPercent(draft?.bandLowerPct),
    ),
    G: safeNumber(draft?.g),
    poolUsageRateBuy: toDecimalRate(safeNumber(draft?.poolUsagePct)),
    cycleWeeks: sanitizeVrCycleWeeks(draft?.cycleWeeks),
  };

  let vrParams: VrBandStrategyParams;

  switch (vrMode) {
    case 'accumulate':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'accumulate',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'withdraw':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'withdraw',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'lump_sum':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'lump_sum',
        deltaCash: ZERO_AMOUNT,
      };
      break;
    default: {
      const exhaustiveCheck: never = vrMode;
      return exhaustiveCheck;
    }
  }

  return {
    strategy: {
      ...buildSingleStockStrategyBase(DEFAULT_VR_REFERENCE_STOCK),
      vrBand: vrParams,
    },
    initialVrSnapshot: createInitialVrSnapshot(vrParams),
  };
}

function buildStrategyFromWizardState(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      return buildMaIntervalStrategy(wizardState);
    case 'multi_split':
      return buildMultiSplitStrategy(wizardState);
    case 'no_stop_multi_split':
      return buildNoStopMultiSplitStrategy(wizardState);
    case 'vr_band':
      return buildVrBandStrategy(wizardState, feeRatePercent);
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

export function buildPortfolioDraftFromWizardState(input: {
  selectedStrategy: StrategyType;
  wizardState: StrategyWizardDraftInput;
}): PortfolioDraftBuildResult {
  const validationInput = buildValidationInput(
    input.selectedStrategy,
    input.wizardState,
  );
  const strategyBuildResult = buildStrategyFromWizardState(
    input.selectedStrategy,
    input.wizardState,
    validationInput.feeRatePercent,
  );
  const meta = normalizeMetaDraft(input.wizardState.meta);

  return {
    portfolio: {
      name: validationInput.name,
      dailyBuyAmount: validationInput.dailyBuyAmount,
      startDate: meta.startDate,
      feeRate: validationInput.feeRatePercent,
      isClosed: false,
      trades: [],
      strategy: strategyBuildResult.strategy,
      ...(strategyBuildResult.initialVrSnapshot != null
        ? { vrSnapshot: strategyBuildResult.initialVrSnapshot }
        : {}),
    },
    validationInput,
  };
}

export function hasDuplicatedSectionStocks(
  strategy: Partial<Pick<Strategy, 'ma1' | 'ma2' | 'ma3'>>,
): boolean {
  const sectionStocks = [
    safeTrim(strategy.ma1?.stock),
    safeTrim(strategy.ma2?.stock),
    safeTrim(strategy.ma3?.stock),
  ].filter((stock) => stock.length > 0);

  if (sectionStocks.length === 0) {
    return false;
  }

  return new Set(sectionStocks).size !== sectionStocks.length;
}