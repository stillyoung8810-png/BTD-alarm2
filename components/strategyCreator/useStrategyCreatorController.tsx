import { useCallback, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Layers, Orbit, TrendingUp } from 'lucide-react';
import { ALL_STOCKS, PAID_STOCKS } from '@/constants';
import {
  STRATEGY_DEFAULTS,
  roundMoney,
  validatePortfolioSetupInput,
} from '@/constants/domain/financeRules';
import { STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY } from '@/constants/strategyGuideAssets';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import { getStrategyCreatorMessages } from '@/constants/messages/strategyCreatorMessages';
import {
  TVC_LIMITS,
  VR_BAND_WIDTH_PCT,
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '@/constants/vrConstants';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import type { AppLang, Portfolio, VrBandStrategyParams } from '@/types';
import {
  DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
  normalizeMultiSplitReturnRates,
} from '@/utils/multiSplitCalc';
import {
  ALIGNMENT_PERIODS_BY_PRESET,
  BUDGET_LOC_RATIO_BY_PRESET,
  DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
  DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
  DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
  MULTI_SPLIT_ALIGNMENT_PERIODS_BY_PRESET,
  MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET,
  MULTI_SPLIT_RSI_THRESHOLD_BY_PRESET,
  RSI_THRESHOLD_BY_PRESET,
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
  normalizeDraftNumberToBounds,
  type DraftNumberRoundingMode,
  type MultiSplitBudgetPresetId,
  type MultiSplitMaPresetId,
  type MultiSplitRsiPresetId,
  type NoStopBudgetPresetId,
  type NoStopMaPresetId,
  type NoStopRsiPresetId,
  safeNumber,
  sanitizeVrBandWidthPercent,
  safeTrim,
  type StrategyCreatorMetaDraftInput,
  type StrategyType,
  type StrategyWizardDraftInput,
} from '@/src/components/StrategyCreator/utils';
import type {
  StrategyDefinitionViewModel,
  StrategyGuideEntryLookup,
  StrategyStockOption,
  StrategyTier,
  StrategyWizardScreen,
} from './types/ui';

const DEFAULT_SECTION_ONE_STOCK = 'QQQ';
const DEFAULT_SECTION_TWO_STOCK = 'QLD';
const DEFAULT_SECTION_THREE_STOCK = 'TQQQ';
const DEFAULT_MULTI_SPLIT_STOCK = 'TQQQ';
const DEFAULT_REFERENCE_STOCK = 'QQQ';
const MAX_MA_PERIOD = 250;
const MIN_MA_PERIOD = 1;
const MIN_TOTAL_SPLIT_COUNT = 20;
const MAX_TOTAL_SPLIT_COUNT = 80;
const MIN_PERCENT_INPUT = 0;
const MIN_POSITIVE_INPUT = 1;
const MAX_PERCENT_INPUT = 100;
const DEFAULT_VR_MIN_ORDER_QTY = 1;
const DEFAULT_NO_STOP_BASE_LOC_RATIO = 50;
const DEFAULT_NO_STOP_TAKE_PROFIT_PCT = 10;
const DEFAULT_MULTI_SPLIT_RSI_PRESET: MultiSplitRsiPresetId = 'rsi40';
const DEFAULT_MULTI_SPLIT_ALIGNMENT_PRESET: MultiSplitMaPresetId = 'ma20_60';
const DEFAULT_MULTI_SPLIT_BUDGET_PRESET: MultiSplitBudgetPresetId = 'balanced';
const DEFAULT_NO_STOP_RSI_PRESET: NoStopRsiPresetId = 'rsi40';
const DEFAULT_NO_STOP_ALIGNMENT_PRESET: NoStopMaPresetId = 'ma20_60';
const DEFAULT_NO_STOP_BUDGET_PRESET: NoStopBudgetPresetId = 'balanced';

interface UseStrategyCreatorControllerParams {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
}

interface DraftNumberRules {
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: DraftNumberRoundingMode;
}

interface CommitClampedInputParams {
  rawValue: string;
  rules: DraftNumberRules;
  currentCommittedValue: number;
  outOfRangeToastMessage: string;
  invalidFormatToastMessage?: string;
  updateValue: (value: number) => void;
}

function buildInitialWizardState(): StrategyWizardDraftInput {
  return {
    meta: {
      name: '',
      dailyBuyAmount: STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD,
      startDate: new Date().toISOString().split('T')[0] ?? '',
      feeRatePercent: STRATEGY_DEFAULTS.FEE_RATE_PERCENT,
    },
    maInterval: {
      ma0Stock: DEFAULT_REFERENCE_STOCK,
      maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
      maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
      rsiEnabled: false,
      alignmentEnabled: false,
      ma1: {
        stock: DEFAULT_SECTION_ONE_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
      ma2: {
        stock: DEFAULT_SECTION_TWO_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
      ma3: {
        stock: DEFAULT_SECTION_THREE_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
    },
    multiSplit: {
      targetStock: DEFAULT_MULTI_SPLIT_STOCK,
      targetReturnRate: STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
      intermediateReturnRate: DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
      baseLocRatio: DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
      mainTakeProfitRatioPct: DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
      riskCutRatioPct: DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
      rsiCondition: {
        isEnabled: false,
        criterionPreset: DEFAULT_MULTI_SPLIT_RSI_PRESET,
        budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
      },
      alignmentCondition: {
        isEnabled: false,
        criterionPreset: DEFAULT_MULTI_SPLIT_ALIGNMENT_PRESET,
        budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
      },
    },
    noStopMultiSplit: {
      targetStock: DEFAULT_MULTI_SPLIT_STOCK,
      baseLocRatio: DEFAULT_NO_STOP_BASE_LOC_RATIO,
      takeProfitPct: DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
      rsiCondition: {
        isEnabled: false,
        criterionPreset: DEFAULT_NO_STOP_RSI_PRESET,
        budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
      },
      alignmentCondition: {
        isEnabled: false,
        criterionPreset: DEFAULT_NO_STOP_ALIGNMENT_PRESET,
        budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
      },
    },
    vrBand: {
      vrMode: 'lump_sum',
      initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
      initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
      minOrderQty: 1,
      bandUpperPct: VR_BAND_WIDTH_PCT.DEFAULT,
      bandLowerPct: VR_BAND_WIDTH_PCT.DEFAULT,
      g: STRATEGY_DEFAULTS.VR_G_VALUE,
      poolUsagePct: STRATEGY_DEFAULTS.VR_POOL_USAGE_PCT,
      deltaCash: 0,
      cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
      baseGrowthRatePct: STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
      smartBrakeThresholdPct:
        STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
    },
  };
}

const EMPTY_MA_INTERVAL_DRAFT: NonNullable<
  StrategyWizardDraftInput['maInterval']
> = {
  ma0Stock: DEFAULT_REFERENCE_STOCK,
  maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
  maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
  rsiEnabled: false,
  alignmentEnabled: false,
  ma1: {
    stock: DEFAULT_SECTION_ONE_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
  ma2: {
    stock: DEFAULT_SECTION_TWO_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
  ma3: {
    stock: DEFAULT_SECTION_THREE_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
};

const EMPTY_VR_BAND_DRAFT: NonNullable<StrategyWizardDraftInput['vrBand']> = {
  vrMode: 'lump_sum',
  initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
  initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
  minOrderQty: 1,
  bandUpperPct: VR_BAND_WIDTH_PCT.DEFAULT,
  bandLowerPct: VR_BAND_WIDTH_PCT.DEFAULT,
  g: STRATEGY_DEFAULTS.VR_G_VALUE,
  poolUsagePct: STRATEGY_DEFAULTS.VR_POOL_USAGE_PCT,
  deltaCash: 0,
  cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
  baseGrowthRatePct: STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
  smartBrakeThresholdPct: STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
};

const EMPTY_MULTI_SPLIT_DRAFT: NonNullable<
  StrategyWizardDraftInput['multiSplit']
> = {
  targetStock: DEFAULT_MULTI_SPLIT_STOCK,
  targetReturnRate: STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
  intermediateReturnRate: DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
  totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
  baseLocRatio: DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
  mainTakeProfitRatioPct: DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
  riskCutRatioPct: DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
  rsiCondition: {
    isEnabled: false,
    criterionPreset: DEFAULT_MULTI_SPLIT_RSI_PRESET,
    budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
  },
  alignmentCondition: {
    isEnabled: false,
    criterionPreset: DEFAULT_MULTI_SPLIT_ALIGNMENT_PRESET,
    budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
  },
};

const EMPTY_NO_STOP_MULTI_SPLIT_DRAFT: NonNullable<
  StrategyWizardDraftInput['noStopMultiSplit']
> = {
  targetStock: DEFAULT_MULTI_SPLIT_STOCK,
  baseLocRatio: DEFAULT_NO_STOP_BASE_LOC_RATIO,
  takeProfitPct: DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
  totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
  rsiCondition: {
    isEnabled: false,
    criterionPreset: DEFAULT_NO_STOP_RSI_PRESET,
    budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
  },
  alignmentCondition: {
    isEnabled: false,
    criterionPreset: DEFAULT_NO_STOP_ALIGNMENT_PRESET,
    budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
  },
};

function buildStockOptions(params: {
  baseStocks: readonly string[];
  disabledStocks?: readonly string[];
  canAccessPaidStocks: boolean;
  lockedTickerTooltip: string;
  duplicateSectionStockTooltip: string;
}): StrategyStockOption[] {
  const disabledSet = new Set(params.disabledStocks ?? []);

  return params.baseStocks.map((stock) => {
    const isPaidLocked =
      PAID_STOCKS.includes(stock) && !params.canAccessPaidStocks;
    const isDisabledByDuplicate = disabledSet.has(stock);

    let tooltip: string | undefined;
    if (isPaidLocked) {
      tooltip = params.lockedTickerTooltip;
    } else if (isDisabledByDuplicate) {
      tooltip = params.duplicateSectionStockTooltip;
    }

    return {
      value: stock,
      label: stock,
      disabled: isPaidLocked || isDisabledByDuplicate,
      badge: PAID_STOCKS.includes(stock) ? 'PRO+' : undefined,
      tooltip,
    };
  });
}

function getWizardScreen(
  selectedStrategy: StrategyType | null,
  step: number,
): StrategyWizardScreen {
  if (selectedStrategy == null || step === 0) {
    return 'strategy_select';
  }

  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      if (step === 1) {
        return 'ma_base';
      }
      if (step === 2) {
        return 'ma_sections';
      }
      return 'strategy_meta';
    case 'multi_split':
      return step === 1 ? 'multi_split_config' : 'strategy_meta';
    case 'no_stop_multi_split':
      return step === 1 ? 'no_stop_multi_split_config' : 'strategy_meta';
    case 'vr_band':
      return step === 1 ? 'vr_band_config' : 'strategy_meta';
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

function getTitleForScreen(
  screen: StrategyWizardScreen,
  copy: ReturnType<typeof getStrategyCreatorMessages>,
): string {
  switch (screen) {
    case 'strategy_select':
      return copy.titles.strategySelect;
    case 'ma_base':
      return copy.titles.maBase;
    case 'ma_sections':
      return copy.titles.maSections;
    case 'multi_split_config':
      return copy.titles.multiSplitConfig;
    case 'no_stop_multi_split_config':
      return copy.titles.noStopMultiSplitConfig;
    case 'vr_band_config':
      return copy.titles.vrBandConfig;
    case 'strategy_meta':
      return copy.titles.strategyMeta;
    default: {
      const exhaustiveCheck: never = screen;
      return exhaustiveCheck;
    }
  }
}

function getPrimaryActionLabel(params: {
  screen: StrategyWizardScreen;
  selectedStrategy: StrategyType | null;
  copy: ReturnType<typeof getStrategyCreatorMessages>;
}): string {
  if (params.screen !== 'strategy_meta') {
    return params.copy.actions.next;
  }

  if (
    params.selectedStrategy === 'multi_split' ||
    params.selectedStrategy === 'no_stop_multi_split' ||
    params.selectedStrategy === 'vr_band'
  ) {
    return params.copy.actions.startStrategy;
  }

  return params.copy.actions.save;
}

function buildStrategyDefinitions(
  copy: ReturnType<typeof getStrategyCreatorMessages>,
): StrategyDefinitionViewModel[] {
  const createDefinition = (
    id: StrategyType,
    tier: StrategyTier,
    icon: JSX.Element,
    gradientClassName: string,
  ): StrategyDefinitionViewModel => ({
    id,
    title: copy.strategyDefinitions[id].title,
    description: copy.strategyDefinitions[id].description,
    tier,
    tierLabel: copy.tierLabels[tier],
    icon,
    gradientClassName,
  });

  return [
    createDefinition(
      'rsi_ma_interval',
      'FREE',
      <TrendingUp size={24} />,
      'from-blue-500 to-violet-500',
    ),
    createDefinition(
      'multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-teal-500',
    ),
    createDefinition(
      'no_stop_multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-green-500',
    ),
    createDefinition(
      'vr_band',
      'FREE',
      <Orbit size={24} />,
      'from-indigo-500 to-sky-500',
    ),
  ];
}

function buildStrategyGuideEntries(args: {
  messages: ReturnType<typeof getStrategyCreatorMessages>['strategyGuide']['entries'];
  strategyDefinitions: readonly StrategyDefinitionViewModel[];
}): StrategyGuideEntryLookup {
  return args.strategyDefinitions.reduce<StrategyGuideEntryLookup>(
    (entries, definition) => {
      const message = args.messages[definition.id];
      const overviewImageSrc =
        STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY[definition.id];

      if (message == null || overviewImageSrc == null) {
        return entries;
      }

      return {
        ...entries,
        [definition.id]: {
          id: definition.id,
          title: message.title,
          openButtonAriaLabel: message.openButtonAriaLabel,
          overviewImageAlt: message.overviewImageAlt,
          overviewImageSrc,
        },
      };
    },
    {},
  );
}

export function useStrategyCreatorController({
  lang,
  onClose,
  onSave,
  canAccessPaidStocks,
  currentPortfolioCount,
  maxPortfolios,
}: UseStrategyCreatorControllerParams) {
  const copy = getStrategyCreatorMessages(lang);
  const commonCopy = getCommonMessages(lang);
  const [step, setStep] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(
    null,
  );
  const [wizardState, setWizardState] = useState<StrategyWizardDraftInput>(
    buildInitialWizardState,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVrShowErrors, setIsVrShowErrors] = useState(false);
  const [guideStrategyId, setGuideStrategyId] = useState<StrategyType | null>(
    null,
  );
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const screen = getWizardScreen(selectedStrategy, step);
  const title = getTitleForScreen(screen, copy);
  const primaryActionLabel = getPrimaryActionLabel({
    screen,
    selectedStrategy,
    copy,
  });

  const strategyDefinitions = useMemo(
    () => buildStrategyDefinitions(copy),
    [copy],
  );
  const guideEntriesByStrategy = useMemo(
    () =>
      buildStrategyGuideEntries({
        messages: copy.strategyGuide.entries,
        strategyDefinitions,
      }),
    [copy.strategyGuide.entries, strategyDefinitions],
  );
  const strategyGuideEntry =
    guideStrategyId == null
      ? null
      : guideEntriesByStrategy[guideStrategyId] ?? null;

  const updateMeta = useCallback(
    (patch: Partial<StrategyCreatorMetaDraftInput>) => {
      setWizardState((previous) => ({
        ...previous,
        meta: {
          ...previous.meta,
          ...patch,
        },
      }));
    },
    [],
  );

  const updateMultiSplit = useCallback(
    (patch: Partial<NonNullable<StrategyWizardDraftInput['multiSplit']>>) => {
      setWizardState((previous) => ({
        ...previous,
        multiSplit: {
          ...(previous.multiSplit ?? EMPTY_MULTI_SPLIT_DRAFT),
          ...patch,
        },
      }));
    },
    [],
  );

  const updateVrBand = useCallback(
    (patch: Partial<NonNullable<StrategyWizardDraftInput['vrBand']>>) => {
      setWizardState((previous) => ({
        ...previous,
        vrBand: {
          ...(previous.vrBand ?? EMPTY_VR_BAND_DRAFT),
          ...patch,
        },
      }));
    },
    [],
  );

  const updateMultiSplitCondition = useCallback(
    (
      key: 'rsiCondition' | 'alignmentCondition',
      patch: Partial<
        NonNullable<NonNullable<StrategyWizardDraftInput['multiSplit']>[typeof key]>
      >,
    ) => {
      setWizardState((previous) => {
        const currentDraft = previous.multiSplit ?? EMPTY_MULTI_SPLIT_DRAFT;
        const fallbackCondition =
          key === 'rsiCondition'
            ? {
                isEnabled: false,
                criterionPreset: DEFAULT_MULTI_SPLIT_RSI_PRESET,
                budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
              }
            : {
                isEnabled: false,
                criterionPreset: DEFAULT_MULTI_SPLIT_ALIGNMENT_PRESET,
                budgetPreset: DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
              };

        return {
          ...previous,
          multiSplit: {
            ...currentDraft,
            [key]: {
              ...(currentDraft[key] ?? fallbackCondition),
              ...patch,
            },
          },
        };
      });
    },
    [],
  );

  const updateNoStopMultiSplit = useCallback(
    (
      patch: Partial<NonNullable<StrategyWizardDraftInput['noStopMultiSplit']>>,
    ) => {
      setWizardState((previous) => ({
        ...previous,
        noStopMultiSplit: {
          ...(previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT),
          ...patch,
        },
      }));
    },
    [],
  );

  const updateMaSection = useCallback(
    (
      key: 'ma1' | 'ma2' | 'ma3',
      patch: Partial<
        NonNullable<NonNullable<StrategyWizardDraftInput['maInterval']>[typeof key]>
      >,
    ) => {
      setWizardState((previous) => {
        const currentMaInterval =
          previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
        return {
          ...previous,
          maInterval: {
            ...currentMaInterval,
            [key]: {
              ...currentMaInterval[key],
              ...patch,
            },
          },
        };
      });
    },
    [],
  );

  const commitClampedInput = useCallback(
    (params: CommitClampedInputParams): number => {
      const {
        rawValue,
        rules,
        currentCommittedValue,
        outOfRangeToastMessage,
        invalidFormatToastMessage,
        updateValue,
      } = params;
      const normalized = normalizeDraftNumberToBounds({
        rawValue,
        ...rules,
      });

      if (normalized.hasInvalidNumberConfig) {
        if (import.meta.env.DEV) {
          console.error('[StrategyCreator] invalid number bounds', rules);
        }
        updateValue(normalized.value);
        return normalized.value;
      }

      if (normalized.hasInvalidFormat || normalized.isEmptyTemporary) {
        if (
          normalized.hasInvalidFormat &&
          invalidFormatToastMessage !== undefined
        ) {
          showErrorToast(invalidFormatToastMessage);
        }
        return Number.isFinite(currentCommittedValue)
          ? currentCommittedValue
          : normalized.value;
      }

      updateValue(normalized.value);

      if (normalized.shouldShowOutOfRangeToast) {
        showErrorToast(outOfRangeToastMessage);
      }

      return normalized.value;
    },
    [],
  );

  const handleSelectStrategy = useCallback((strategy: StrategyType) => {
    setSelectedStrategy(strategy);
    setStep(1);
    setErrorMessage(null);
  }, []);

  const handleOpenStrategyGuide = useCallback((strategy: StrategyType) => {
    setGuideStrategyId(strategy);
  }, []);

  const handleCloseStrategyGuide = useCallback(() => {
    setGuideStrategyId(null);
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      updateMeta({ name: value });
    },
    [updateMeta],
  );

  const handleDailyBuyAmountChange = useCallback(
    (value: string) => {
      const committedValue = roundMoney(
        safeNumber(value, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
      );
      updateMeta({
        dailyBuyAmount: committedValue,
      });
      return committedValue;
    },
    [updateMeta],
  );

  const handleFeeRatePercentChange = useCallback(
    (value: string) => {
      const committedValue = roundMoney(
        safeNumber(value, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
      );
      updateMeta({
        feeRatePercent: committedValue,
      });
      return committedValue;
    },
    [updateMeta],
  );

  const handleStartDateChange = useCallback(
    (value: string) => {
      updateMeta({ startDate: safeTrim(value) });
    },
    [updateMeta],
  );

  const maInterval = wizardState.maInterval;
  const ma1 = maInterval?.ma1;
  const ma2 = maInterval?.ma2;
  const ma3 = maInterval?.ma3;

  const handleMa0StockChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          ma0Stock: value,
        },
      };
    });
  }, []);

  const handleMaShortPeriodChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
          min: MIN_MA_PERIOD,
          max: MAX_MA_PERIOD,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.maInterval?.maAPeriod,
          STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          setWizardState((previous) => {
            const currentMaInterval =
              previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
            return {
              ...previous,
              maInterval: {
                ...currentMaInterval,
                maAPeriod: committedValue,
              },
            };
          });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      wizardState.maInterval?.maAPeriod,
    ],
  );

  const handleMaLongPeriodChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
          min: MIN_MA_PERIOD,
          max: MAX_MA_PERIOD,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.maInterval?.maBPeriod,
          STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          setWizardState((previous) => {
            const currentMaInterval =
              previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
            return {
              ...previous,
              maInterval: {
                ...currentMaInterval,
                maBPeriod: committedValue,
              },
            };
          });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      wizardState.maInterval?.maBPeriod,
    ],
  );

  const handleRsiEnabledChange = useCallback((value: boolean) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          rsiEnabled: value,
        },
      };
    });
  }, []);

  const handleAlignmentEnabledChange = useCallback((value: boolean) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          alignmentEnabled: value,
        },
      };
    });
  }, []);

  const commitMultiSplitReturnRates = useCallback(
    (patch: {
      targetReturnRate?: number;
      intermediateReturnRate?: number;
    }) => {
      const currentTargetReturnRate = safeNumber(
        wizardState.multiSplit?.targetReturnRate,
        STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
      );
      const currentIntermediateReturnRate = safeNumber(
        wizardState.multiSplit?.intermediateReturnRate,
        DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
      );
      const normalizedReturnRates = normalizeMultiSplitReturnRates({
        targetReturnRate:
          patch.targetReturnRate ?? currentTargetReturnRate,
        intermediateReturnRate:
          patch.intermediateReturnRate ?? currentIntermediateReturnRate,
      });

      updateMultiSplit({
        targetReturnRate: normalizedReturnRates.targetReturnRate,
        intermediateReturnRate: normalizedReturnRates.intermediateReturnRate,
      });

      if (normalizedReturnRates.didClamp) {
        showErrorToast(copy.outOfRangeToast);
      }

      return normalizedReturnRates;
    },
    [
      copy.outOfRangeToast,
      updateMultiSplit,
      wizardState.multiSplit?.intermediateReturnRate,
      wizardState.multiSplit?.targetReturnRate,
    ],
  );

  const handleTargetReturnRateChange = useCallback(
    (value: string) => {
      const normalizedReturnRates = commitMultiSplitReturnRates({
        targetReturnRate: safeNumber(
          value,
          STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
        ),
      });
      return normalizedReturnRates.targetReturnRate;
    },
    [commitMultiSplitReturnRates],
  );

  const handleMultiSplitIntermediateReturnRateChange = useCallback(
    (value: string) => {
      const normalizedReturnRates = commitMultiSplitReturnRates({
        intermediateReturnRate: safeNumber(
          value,
          DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
        ),
      });
      return normalizedReturnRates.intermediateReturnRate;
    },
    [commitMultiSplitReturnRates],
  );

  const handleMultiSplitTotalCountChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
          min: MIN_TOTAL_SPLIT_COUNT,
          max: MAX_TOTAL_SPLIT_COUNT,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.multiSplit?.totalSplitCount,
          STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateMultiSplit({ totalSplitCount: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateMultiSplit,
      wizardState.multiSplit?.totalSplitCount,
    ],
  );

  const handleMultiSplitTargetStockChange = useCallback((value: string) => {
    updateMultiSplit({ targetStock: value });
  }, [updateMultiSplit]);

  const handleMultiSplitBaseLocRatioChange = useCallback(
    (value: string) => {
      return commitClampedInput({
        rawValue: value,
        rules: {
          fallback: DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
          min: MIN_PERCENT_INPUT,
          max: MAX_PERCENT_INPUT,
        },
        currentCommittedValue: safeNumber(
          wizardState.multiSplit?.baseLocRatio,
          DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateMultiSplit({ baseLocRatio: committedValue });
        },
      });
    },
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateMultiSplit,
      wizardState.multiSplit?.baseLocRatio,
    ],
  );

  const handleMultiSplitMainTakeProfitRatioPctChange = useCallback(
    (value: string) => {
      return commitClampedInput({
        rawValue: value,
        rules: {
          fallback: DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
          min: MIN_POSITIVE_INPUT,
          max: MAX_PERCENT_INPUT,
        },
        currentCommittedValue: safeNumber(
          wizardState.multiSplit?.mainTakeProfitRatioPct,
          DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateMultiSplit({ mainTakeProfitRatioPct: committedValue });
        },
      });
    },
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateMultiSplit,
      wizardState.multiSplit?.mainTakeProfitRatioPct,
    ],
  );

  const handleMultiSplitRiskCutRatioPctChange = useCallback(
    (value: string) => {
      return commitClampedInput({
        rawValue: value,
        rules: {
          fallback: DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
          min: MIN_PERCENT_INPUT,
          max: MAX_PERCENT_INPUT,
        },
        currentCommittedValue: safeNumber(
          wizardState.multiSplit?.riskCutRatioPct,
          DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateMultiSplit({ riskCutRatioPct: committedValue });
        },
      });
    },
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateMultiSplit,
      wizardState.multiSplit?.riskCutRatioPct,
    ],
  );

  const handleMultiSplitRsiConditionEnabledChange = useCallback(
    (value: boolean) => {
      updateMultiSplitCondition('rsiCondition', { isEnabled: value });
    },
    [updateMultiSplitCondition],
  );

  const handleMultiSplitRsiCriterionPresetChange = useCallback(
    (value: MultiSplitRsiPresetId) => {
      updateMultiSplitCondition('rsiCondition', {
        criterionPreset: value,
      });
    },
    [updateMultiSplitCondition],
  );

  const handleMultiSplitRsiBudgetPresetChange = useCallback(
    (value: MultiSplitBudgetPresetId) => {
      updateMultiSplitCondition('rsiCondition', {
        budgetPreset: value,
      });
    },
    [updateMultiSplitCondition],
  );

  const handleMultiSplitAlignmentConditionEnabledChange = useCallback(
    (value: boolean) => {
      updateMultiSplitCondition('alignmentCondition', { isEnabled: value });
    },
    [updateMultiSplitCondition],
  );

  const handleMultiSplitAlignmentCriterionPresetChange = useCallback(
    (value: MultiSplitMaPresetId) => {
      updateMultiSplitCondition('alignmentCondition', {
        criterionPreset: value,
      });
    },
    [updateMultiSplitCondition],
  );

  const handleMultiSplitAlignmentBudgetPresetChange = useCallback(
    (value: MultiSplitBudgetPresetId) => {
      updateMultiSplitCondition('alignmentCondition', {
        budgetPreset: value,
      });
    },
    [updateMultiSplitCondition],
  );

  const handleNoStopTargetStockChange = useCallback((value: string) => {
    updateNoStopMultiSplit({ targetStock: value });
  }, [updateNoStopMultiSplit]);

  const handleNoStopBaseLocRatioChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: DEFAULT_NO_STOP_BASE_LOC_RATIO,
          min: MIN_PERCENT_INPUT,
          max: MAX_PERCENT_INPUT,
        },
        currentCommittedValue: safeNumber(
          wizardState.noStopMultiSplit?.baseLocRatio,
          DEFAULT_NO_STOP_BASE_LOC_RATIO,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateNoStopMultiSplit({ baseLocRatio: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateNoStopMultiSplit,
      wizardState.noStopMultiSplit?.baseLocRatio,
    ],
  );

  const handleNoStopTakeProfitPctChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
          min: MIN_PERCENT_INPUT,
          max: MAX_PERCENT_INPUT,
        },
        currentCommittedValue: safeNumber(
          wizardState.noStopMultiSplit?.takeProfitPct,
          DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateNoStopMultiSplit({ takeProfitPct: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateNoStopMultiSplit,
      wizardState.noStopMultiSplit?.takeProfitPct,
    ],
  );

  const handleNoStopTotalSplitCountChange = useCallback(
    (value: string) =>
      commitClampedInput({
        rawValue: value,
        rules: {
          fallback: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
          min: MIN_TOTAL_SPLIT_COUNT,
          max: MAX_TOTAL_SPLIT_COUNT,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.noStopMultiSplit?.totalSplitCount,
          STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateNoStopMultiSplit({ totalSplitCount: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateNoStopMultiSplit,
      wizardState.noStopMultiSplit?.totalSplitCount,
    ],
  );

  const handleNoStopRsiConditionEnabledChange = useCallback(
    (value: boolean) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            rsiCondition: {
              ...(currentDraft.rsiCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_RSI_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              isEnabled: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleNoStopRsiCriterionPresetChange = useCallback(
    (value: NoStopRsiPresetId) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            rsiCondition: {
              ...(currentDraft.rsiCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_RSI_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              criterionPreset: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleNoStopRsiBudgetPresetChange = useCallback(
    (value: NoStopBudgetPresetId) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            rsiCondition: {
              ...(currentDraft.rsiCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_RSI_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              budgetPreset: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleNoStopAlignmentConditionEnabledChange = useCallback(
    (value: boolean) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            alignmentCondition: {
              ...(currentDraft.alignmentCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_ALIGNMENT_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              isEnabled: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleNoStopAlignmentCriterionPresetChange = useCallback(
    (value: NoStopMaPresetId) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            alignmentCondition: {
              ...(currentDraft.alignmentCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_ALIGNMENT_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              criterionPreset: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleNoStopAlignmentBudgetPresetChange = useCallback(
    (value: NoStopBudgetPresetId) => {
      setWizardState((previous) => {
        const currentDraft =
          previous.noStopMultiSplit ?? EMPTY_NO_STOP_MULTI_SPLIT_DRAFT;

        return {
          ...previous,
          noStopMultiSplit: {
            ...currentDraft,
            alignmentCondition: {
              ...(currentDraft.alignmentCondition ?? {
                isEnabled: false,
                criterionPreset: DEFAULT_NO_STOP_ALIGNMENT_PRESET,
                budgetPreset: DEFAULT_NO_STOP_BUDGET_PRESET,
              }),
              budgetPreset: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleVrModeChange = useCallback(
    (value: VrBandStrategyParams['vrMode']) => {
      updateVrBand({ vrMode: value });
    },
    [updateVrBand],
  );

  const handleVrBaseGrowthRatePctChange = useCallback(
    (rawValue: string) =>
      commitClampedInput({
        rawValue,
        rules: {
          fallback: STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
          min: TVC_LIMITS.BASE_GROWTH_RATE.MIN,
          max: TVC_LIMITS.BASE_GROWTH_RATE.MAX,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.vrBand?.baseGrowthRatePct,
          STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateVrBand({ baseGrowthRatePct: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateVrBand,
      wizardState.vrBand?.baseGrowthRatePct,
    ],
  );

  const handleVrSmartBrakeThresholdPctChange = useCallback(
    (rawValue: string) =>
      commitClampedInput({
        rawValue,
        rules: {
          fallback: STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
          min: TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN,
          max: TVC_LIMITS.SMART_BRAKE_THRESHOLD.MAX,
          roundingMode: 'integer',
        },
        currentCommittedValue: safeNumber(
          wizardState.vrBand?.smartBrakeThresholdPct,
          STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
        ),
        outOfRangeToastMessage: copy.outOfRangeToast,
        updateValue: (committedValue) => {
          updateVrBand({ smartBrakeThresholdPct: committedValue });
        },
      }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      updateVrBand,
      wizardState.vrBand?.smartBrakeThresholdPct,
    ],
  );

  const screenIsFinalSubmit = screen === 'strategy_meta';

  const handlePrimaryAction = useCallback(() => {
    if (!screenIsFinalSubmit) {
      setStep((previous) => previous + 1);
      return;
    }
  }, [screenIsFinalSubmit]);

  const handleBack = useCallback(() => {
    if (step <= 1) {
      setSelectedStrategy(null);
      setStep(0);
      setErrorMessage(null);
      return;
    }

    setStep((previous) => previous - 1);
  }, [step]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (selectedStrategy == null) {
      return;
    }

    if (isSavingRef.current) {
      return;
    }

    if (currentPortfolioCount >= maxPortfolios) {
      setErrorMessage(copy.portfolioLimitReached(maxPortfolios));
      return;
    }

    if (selectedStrategy === 'vr_band') {
      const vrBand = wizardState.vrBand;
      const initialCapital = safeNumber(
        vrBand?.initialCapital,
        STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
      );
      const initialV = safeNumber(
        vrBand?.initialV,
        STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
      );
      const minOrderQty = safeNumber(vrBand?.minOrderQty, 1);
      const deltaCashFailure = getVrDeltaCashInputValidationReason(
        safeNumber(vrBand?.deltaCash, 0),
      );
      const vrMode = vrBand?.vrMode ?? 'lump_sum';

      if (initialCapital <= 0 || initialV <= 0 || minOrderQty <= 0) {
        setIsVrShowErrors(true);
        return;
      }

      if (vrMode !== 'lump_sum' && deltaCashFailure != null) {
        setIsVrShowErrors(true);
        return;
      }
    }

    const draft = buildPortfolioDraftFromWizardState({
      selectedStrategy,
      wizardState,
    });

    const validationMessage = validatePortfolioSetupInput(
      draft.validationInput,
      commonCopy,
    );

    if (validationMessage != null) {
      setErrorMessage(validationMessage);
      return;
    }

    if (
      selectedStrategy === 'rsi_ma_interval' &&
      hasDuplicatedSectionStocks(draft.portfolio.strategy)
    ) {
      setErrorMessage(copy.duplicateSectionStocks);
      return;
    }

    setErrorMessage(null);

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(draft.portfolio));
      onClose();
    } catch (error: unknown) {
      setErrorMessage(commonCopy.saveFailed);
      console.error('[StrategyCreator] save failed:', error);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [
    commonCopy,
    copy,
    currentPortfolioCount,
    maxPortfolios,
    onClose,
    onSave,
    selectedStrategy,
    wizardState,
  ]);

  const handlePrimaryButtonClick = useCallback(() => {
    if (!screenIsFinalSubmit) {
      handlePrimaryAction();
      return;
    }

    void handleSubmit();
  }, [handlePrimaryAction, handleSubmit, screenIsFinalSubmit]);

  const fullStockOptions = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
    ],
  );

  const stockOptionsForMa1 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma2?.stock), safeTrim(ma3?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma2?.stock,
      ma3?.stock,
    ],
  );

  const stockOptionsForMa2 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma1?.stock), safeTrim(ma3?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma1?.stock,
      ma3?.stock,
    ],
  );

  const stockOptionsForMa3 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma1?.stock), safeTrim(ma2?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma1?.stock,
      ma2?.stock,
    ],
  );

  const multiSplitBudgetOptions = useMemo(
    () =>
      (
        Object.keys(
          MULTI_SPLIT_BUDGET_LOC_RATIO_BY_PRESET,
        ) as MultiSplitBudgetPresetId[]
      ).map((presetId) => ({
        id: presetId,
        label: copy.multiSplit.budgetPresets[presetId],
      })),
    [copy.multiSplit.budgetPresets],
  );

  const multiSplitRsiCriterionOptions = useMemo(
    () =>
      (
        Object.keys(
          MULTI_SPLIT_RSI_THRESHOLD_BY_PRESET,
        ) as MultiSplitRsiPresetId[]
      ).map((presetId) => ({
        id: presetId,
        label: copy.multiSplit.rsiCriteria[presetId],
      })),
    [copy.multiSplit.rsiCriteria],
  );

  const multiSplitAlignmentCriterionOptions = useMemo(
    () =>
      (
        Object.keys(
          MULTI_SPLIT_ALIGNMENT_PERIODS_BY_PRESET,
        ) as MultiSplitMaPresetId[]
      ).map((presetId) => ({
        id: presetId,
        label: copy.multiSplit.alignmentCriteria[presetId],
      })),
    [copy.multiSplit.alignmentCriteria],
  );

  const noStopBudgetOptions = useMemo(
    () =>
      (Object.keys(BUDGET_LOC_RATIO_BY_PRESET) as NoStopBudgetPresetId[]).map(
        (presetId) => ({
          id: presetId,
          label: copy.noStopMultiSplit.budgetPresets[presetId],
        }),
      ),
    [copy],
  );

  const noStopRsiCriterionOptions = useMemo(
    () =>
      (Object.keys(RSI_THRESHOLD_BY_PRESET) as NoStopRsiPresetId[]).map(
        (presetId) => ({
          id: presetId,
          label: copy.noStopMultiSplit.rsiCriteria[presetId],
        }),
      ),
    [copy],
  );

  const noStopAlignmentCriterionOptions = useMemo(
    () =>
      (Object.keys(ALIGNMENT_PERIODS_BY_PRESET) as NoStopMaPresetId[]).map(
        (presetId) => ({
          id: presetId,
          label: copy.noStopMultiSplit.alignmentCriteria[presetId],
        }),
      ),
    [copy],
  );

  const stepHandlers = useMemo(
    () => ({
      handleMa1StockChange: (value: string) => {
        updateMaSection('ma1', { stock: value });
      },
      handleMa2StockChange: (value: string) => {
        updateMaSection('ma2', { stock: value });
      },
      handleMa3StockChange: (value: string) => {
        updateMaSection('ma3', { stock: value });
      },
      handleMa1RsiThresholdChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.RSI_THRESHOLD,
            min: MIN_PERCENT_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma1?.rsiThreshold,
            STRATEGY_DEFAULTS.RSI_THRESHOLD,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma1', { rsiThreshold: committedValue });
          },
        });
      },
      handleMa2RsiThresholdChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.RSI_THRESHOLD,
            min: MIN_PERCENT_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma2?.rsiThreshold,
            STRATEGY_DEFAULTS.RSI_THRESHOLD,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma2', { rsiThreshold: committedValue });
          },
        });
      },
      handleMa3RsiThresholdChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.RSI_THRESHOLD,
            min: MIN_PERCENT_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma3?.rsiThreshold,
            STRATEGY_DEFAULTS.RSI_THRESHOLD,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma3', { rsiThreshold: committedValue });
          },
        });
      },
      handleMa1TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma1', { takePartialProfit: value });
      },
      handleMa2TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma2', { takePartialProfit: value });
      },
      handleMa3TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma3', { takePartialProfit: value });
      },
      handleMa1PartialProfitTargetPctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
            min: MIN_POSITIVE_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma1?.partialProfitTargetPct,
            STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma1', { partialProfitTargetPct: committedValue });
          },
        });
      },
      handleMa2PartialProfitTargetPctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
            min: MIN_POSITIVE_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma2?.partialProfitTargetPct,
            STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma2', { partialProfitTargetPct: committedValue });
          },
        });
      },
      handleMa3PartialProfitTargetPctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
            min: MIN_POSITIVE_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            ma3?.partialProfitTargetPct,
            STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateMaSection('ma3', { partialProfitTargetPct: committedValue });
          },
        });
      },
      handleVrInitialCapitalChange: (value: string) => {
        const committedValue = Math.max(
          0,
          safeNumber(value, STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL),
        );
        updateVrBand({
          initialCapital: committedValue,
        });
        return committedValue;
      },
      handleVrInitialVChange: (value: string) => {
        const committedValue = Math.max(
          0,
          safeNumber(value, STRATEGY_DEFAULTS.VR_INITIAL_VALUE),
        );
        updateVrBand({
          initialV: committedValue,
        });
        return committedValue;
      },
      handleVrMinOrderQtyChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: DEFAULT_VR_MIN_ORDER_QTY,
            min: MIN_POSITIVE_INPUT,
          },
          currentCommittedValue: safeNumber(
            wizardState.vrBand?.minOrderQty,
            DEFAULT_VR_MIN_ORDER_QTY,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateVrBand({ minOrderQty: committedValue });
          },
        });
      },
      handleVrBandUpperPctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: VR_BAND_WIDTH_PCT.DEFAULT,
            min: VR_BAND_WIDTH_PCT.MIN,
            max: VR_BAND_WIDTH_PCT.MAX,
          },
          currentCommittedValue: sanitizeVrBandWidthPercent(
            wizardState.vrBand?.bandUpperPct,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateVrBand({ bandUpperPct: committedValue });
          },
        });
      },
      handleVrBandLowerPctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: VR_BAND_WIDTH_PCT.DEFAULT,
            min: VR_BAND_WIDTH_PCT.MIN,
            max: VR_BAND_WIDTH_PCT.MAX,
          },
          currentCommittedValue: sanitizeVrBandWidthPercent(
            wizardState.vrBand?.bandLowerPct,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateVrBand({ bandLowerPct: committedValue });
          },
        });
      },
      handleVrGChange: (value: string) => {
        const committedValue = Math.max(1, safeNumber(value, 10));
        updateVrBand({ g: committedValue });
        return committedValue;
      },
      handleVrPoolUsagePctChange: (value: string) => {
        return commitClampedInput({
          rawValue: value,
          rules: {
            fallback: STRATEGY_DEFAULTS.VR_POOL_USAGE_PCT,
            min: MIN_PERCENT_INPUT,
            max: MAX_PERCENT_INPUT,
          },
          currentCommittedValue: safeNumber(
            wizardState.vrBand?.poolUsagePct,
            STRATEGY_DEFAULTS.VR_POOL_USAGE_PCT,
          ),
          outOfRangeToastMessage: copy.outOfRangeToast,
          updateValue: (committedValue) => {
            updateVrBand({ poolUsagePct: committedValue });
          },
        });
      },
      handleVrDeltaCashChange: (value: string) => {
        const committedValue = Math.max(0, safeNumber(value, 0));
        updateVrBand({ deltaCash: committedValue });
        return committedValue;
      },
      handleVrCycleWeeksChange: (value: number) => {
        updateVrBand({ cycleWeeks: value });
      },
    }),
    [
      commitClampedInput,
      copy.outOfRangeToast,
      ma1?.partialProfitTargetPct,
      ma1?.rsiThreshold,
      ma2?.partialProfitTargetPct,
      ma2?.rsiThreshold,
      ma3?.partialProfitTargetPct,
      ma3?.rsiThreshold,
      updateMaSection,
      updateVrBand,
      wizardState.vrBand?.bandLowerPct,
      wizardState.vrBand?.bandUpperPct,
      wizardState.vrBand?.minOrderQty,
      wizardState.vrBand?.poolUsagePct,
    ],
  );

  return {
    copy,
    noticeLabel: commonCopy.notice,
    acknowledgeLabel: commonCopy.acknowledge,
    closeLabel: commonCopy.close,
    processingLabel: commonCopy.processing,
    screen,
    title,
    primaryActionLabel,
    isSaving,
    errorMessage,
    selectedStrategy,
    handleBack,
    handleClose: onClose,
    handlePrimaryButtonClick,
    canGoBack: step > 0,
    isPrimaryDisabled: selectedStrategy == null || isSaving,
    strategyDefinitions,
    guideEntriesByStrategy,
    strategyGuideEntry,
    handleSelectStrategy,
    handleOpenStrategyGuide,
    handleCloseStrategyGuide,
    stockOptions: fullStockOptions,
    stockOptionsForMa1,
    stockOptionsForMa2,
    stockOptionsForMa3,
    meta: wizardState.meta ?? {},
    ma0Stock: safeTrim(maInterval?.ma0Stock),
    maShortPeriod: safeNumber(
      maInterval?.maAPeriod,
      STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
    ),
    maLongPeriod: safeNumber(
      maInterval?.maBPeriod,
      STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    ),
    isRsiEnabled: Boolean(maInterval?.rsiEnabled),
    isAlignmentEnabled: Boolean(maInterval?.alignmentEnabled),
    handleMa0StockChange,
    handleMaShortPeriodChange,
    handleMaLongPeriodChange,
    handleRsiEnabledChange,
    handleAlignmentEnabledChange,
    ma1Stock: safeTrim(ma1?.stock),
    ma2Stock: safeTrim(ma2?.stock),
    ma3Stock: safeTrim(ma3?.stock),
    ma1RsiThreshold: safeNumber(
      ma1?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma2RsiThreshold: safeNumber(
      ma2?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma3RsiThreshold: safeNumber(
      ma3?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    isMa1TakePartialProfit: Boolean(ma1?.takePartialProfit),
    isMa2TakePartialProfit: Boolean(ma2?.takePartialProfit),
    isMa3TakePartialProfit: Boolean(ma3?.takePartialProfit),
    ma1PartialProfitTargetPct: safeNumber(
      ma1?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma2PartialProfitTargetPct: safeNumber(
      ma2?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma3PartialProfitTargetPct: safeNumber(
      ma3?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ...stepHandlers,
    multiSplitTargetStock: safeTrim(wizardState.multiSplit?.targetStock),
    multiSplitTargetReturnRate: safeNumber(
      wizardState.multiSplit?.targetReturnRate,
      STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
    ),
    multiSplitIntermediateReturnRate: safeNumber(
      wizardState.multiSplit?.intermediateReturnRate,
      DEFAULT_MULTI_SPLIT_INTERMEDIATE_RETURN_RATE_PCT,
    ),
    multiSplitTotalSplitCount: safeNumber(
      wizardState.multiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    multiSplitBaseLocRatio: safeNumber(
      wizardState.multiSplit?.baseLocRatio,
      DEFAULT_MULTI_SPLIT_BASE_LOC_RATIO,
    ),
    multiSplitMainTakeProfitRatioPct: safeNumber(
      wizardState.multiSplit?.mainTakeProfitRatioPct,
      DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
    ),
    multiSplitIntermediateTakeProfitRatioPct:
      100 -
      safeNumber(
        wizardState.multiSplit?.mainTakeProfitRatioPct,
        DEFAULT_MULTI_SPLIT_MAIN_TAKE_PROFIT_RATIO_PCT,
      ),
    multiSplitRiskCutRatioPct: safeNumber(
      wizardState.multiSplit?.riskCutRatioPct,
      DEFAULT_MULTI_SPLIT_RISK_CUT_RATIO_PCT,
    ),
    multiSplitBudgetOptions,
    multiSplitRsiCriterionOptions,
    multiSplitAlignmentCriterionOptions,
    isMultiSplitRsiConditionEnabled:
      wizardState.multiSplit?.rsiCondition?.isEnabled === true,
    selectedMultiSplitRsiCriterionPreset:
      wizardState.multiSplit?.rsiCondition?.criterionPreset ??
      DEFAULT_MULTI_SPLIT_RSI_PRESET,
    selectedMultiSplitRsiBudgetPreset:
      wizardState.multiSplit?.rsiCondition?.budgetPreset ??
      DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
    isMultiSplitAlignmentConditionEnabled:
      wizardState.multiSplit?.alignmentCondition?.isEnabled === true,
    selectedMultiSplitAlignmentCriterionPreset:
      wizardState.multiSplit?.alignmentCondition?.criterionPreset ??
      DEFAULT_MULTI_SPLIT_ALIGNMENT_PRESET,
    selectedMultiSplitAlignmentBudgetPreset:
      wizardState.multiSplit?.alignmentCondition?.budgetPreset ??
      DEFAULT_MULTI_SPLIT_BUDGET_PRESET,
    handleMultiSplitTargetStockChange,
    handleTargetReturnRateChange,
    handleMultiSplitIntermediateReturnRateChange,
    handleMultiSplitTotalCountChange,
    handleMultiSplitBaseLocRatioChange,
    handleMultiSplitMainTakeProfitRatioPctChange,
    handleMultiSplitRiskCutRatioPctChange,
    handleMultiSplitRsiConditionEnabledChange,
    handleMultiSplitRsiCriterionPresetChange,
    handleMultiSplitRsiBudgetPresetChange,
    handleMultiSplitAlignmentConditionEnabledChange,
    handleMultiSplitAlignmentCriterionPresetChange,
    handleMultiSplitAlignmentBudgetPresetChange,
    noStopTargetStock: safeTrim(wizardState.noStopMultiSplit?.targetStock),
    noStopBaseLocRatio: safeNumber(
      wizardState.noStopMultiSplit?.baseLocRatio,
      DEFAULT_NO_STOP_BASE_LOC_RATIO,
    ),
    noStopTakeProfitPct: safeNumber(
      wizardState.noStopMultiSplit?.takeProfitPct,
      DEFAULT_NO_STOP_TAKE_PROFIT_PCT,
    ),
    noStopTotalSplitCount: safeNumber(
      wizardState.noStopMultiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    noStopBudgetOptions,
    noStopRsiCriterionOptions,
    noStopAlignmentCriterionOptions,
    isNoStopRsiConditionEnabled:
      wizardState.noStopMultiSplit?.rsiCondition?.isEnabled === true,
    selectedNoStopRsiCriterionPreset:
      wizardState.noStopMultiSplit?.rsiCondition?.criterionPreset ??
      DEFAULT_NO_STOP_RSI_PRESET,
    selectedNoStopRsiBudgetPreset:
      wizardState.noStopMultiSplit?.rsiCondition?.budgetPreset ??
      DEFAULT_NO_STOP_BUDGET_PRESET,
    isNoStopAlignmentConditionEnabled:
      wizardState.noStopMultiSplit?.alignmentCondition?.isEnabled === true,
    selectedNoStopAlignmentCriterionPreset:
      wizardState.noStopMultiSplit?.alignmentCondition?.criterionPreset ??
      DEFAULT_NO_STOP_ALIGNMENT_PRESET,
    selectedNoStopAlignmentBudgetPreset:
      wizardState.noStopMultiSplit?.alignmentCondition?.budgetPreset ??
      DEFAULT_NO_STOP_BUDGET_PRESET,
    handleNoStopTargetStockChange,
    handleNoStopBaseLocRatioChange,
    handleNoStopTakeProfitPctChange,
    handleNoStopTotalSplitCountChange,
    handleNoStopRsiConditionEnabledChange,
    handleNoStopRsiCriterionPresetChange,
    handleNoStopRsiBudgetPresetChange,
    handleNoStopAlignmentConditionEnabledChange,
    handleNoStopAlignmentCriterionPresetChange,
    handleNoStopAlignmentBudgetPresetChange,
    vrShowErrors: isVrShowErrors,
    vrMode: wizardState.vrBand?.vrMode ?? 'lump_sum',
    vrInitialCapital: safeNumber(
      wizardState.vrBand?.initialCapital,
      STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
    ),
    vrInitialV: safeNumber(
      wizardState.vrBand?.initialV,
      STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
    ),
    vrMinOrderQty: safeNumber(wizardState.vrBand?.minOrderQty, 1),
    vrBandUpperPct: sanitizeVrBandWidthPercent(wizardState.vrBand?.bandUpperPct),
    vrBandLowerPct: sanitizeVrBandWidthPercent(wizardState.vrBand?.bandLowerPct),
    vrG: safeNumber(wizardState.vrBand?.g, 10),
    vrBaseGrowthRatePct: safeNumber(
      wizardState.vrBand?.baseGrowthRatePct,
      STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
    ),
    vrSmartBrakeThresholdPct: safeNumber(
      wizardState.vrBand?.smartBrakeThresholdPct,
      STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
    ),
    vrPoolUsagePct: safeNumber(
      wizardState.vrBand?.poolUsagePct,
      STRATEGY_DEFAULTS.VR_POOL_USAGE_PCT,
    ),
    vrDeltaCash: safeNumber(wizardState.vrBand?.deltaCash, 0),
    vrCycleWeeks: safeNumber(
      wizardState.vrBand?.cycleWeeks,
      VR_CYCLE.DEFAULT_WEEKS,
    ),
    handleVrModeChange,
    handleVrBaseGrowthRatePctChange,
    handleVrSmartBrakeThresholdPctChange,
    handleNameChange,
    handleDailyBuyAmountChange,
    handleFeeRatePercentChange,
    handleStartDateChange,
  };
}