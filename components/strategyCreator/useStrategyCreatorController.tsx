import { useCallback, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Layers, Orbit, TrendingUp } from 'lucide-react';
import { ALL_STOCKS, PAID_STOCKS } from '@/constants';
import {
  STRATEGY_DEFAULTS,
  roundMoney,
  validatePortfolioSetupInput,
} from '@/constants/domain/financeRules';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import { getStrategyCreatorMessages } from '@/constants/messages/strategyCreatorMessages';
import {
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '@/constants/vrConstants';
import type { AppLang, Portfolio, VrBandStrategyParams } from '@/types';
import {
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
  safeNumber,
  safeTrim,
  type StrategyCreatorMetaDraftInput,
  type StrategyType,
  type StrategyWizardDraftInput,
} from '@/src/components/StrategyCreator/utils';
import type {
  StrategyDefinitionViewModel,
  StrategyStockOption,
  StrategyTier,
  StrategyWizardScreen,
} from './types/ui';

const DEFAULT_SECTION_ONE_STOCK = 'TQQQ';
const DEFAULT_SECTION_TWO_STOCK = 'QLD';
const DEFAULT_SECTION_THREE_STOCK = 'QQQ';
const DEFAULT_MULTI_SPLIT_STOCK = 'TQQQ';
const DEFAULT_REFERENCE_STOCK = 'QQQ';
const MAX_MA_PERIOD = 250;
const MIN_MA_PERIOD = 1;
const MIN_TARGET_RETURN_RATE = 5;
const MAX_TARGET_RETURN_RATE = 30;
const MIN_TOTAL_SPLIT_COUNT = 20;
const MAX_TOTAL_SPLIT_COUNT = 80;
const MIN_PERCENT_INPUT = 0;

interface UseStrategyCreatorControllerParams {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
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
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    },
    noStopMultiSplit: {
      targetStock: DEFAULT_MULTI_SPLIT_STOCK,
      lowLocBudgetRatio: 50,
      highLocPremiumPct: 15,
      takeProfitPct: 10,
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    },
    vrBand: {
      vrMode: 'lump_sum',
      initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
      initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
      minOrderQty: 1,
      bandUpperPct: 5,
      bandLowerPct: 5,
      g: 10,
      poolUsagePct: 50,
      deltaCash: 0,
      cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
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
  bandUpperPct: 5,
  bandLowerPct: 5,
  g: 10,
  poolUsagePct: 50,
  deltaCash: 0,
  cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
};

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

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
    isLaoerOriginal?: boolean,
  ): StrategyDefinitionViewModel => ({
    id,
    title: copy.strategyDefinitions[id].title,
    description: copy.strategyDefinitions[id].description,
    tier,
    tierLabel: copy.tierLabels[tier],
    icon,
    gradientClassName,
    isLaoerOriginal,
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
      true,
    ),
    createDefinition(
      'no_stop_multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-green-500',
      true,
    ),
    createDefinition(
      'vr_band',
      'FREE',
      <Orbit size={24} />,
      'from-indigo-500 to-sky-500',
      true,
    ),
  ];
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

  const shouldShowLaoerCreditBanner =
    selectedStrategy != null &&
    strategyDefinitions.some(
      (definition) =>
        definition.id === selectedStrategy &&
        definition.isLaoerOriginal === true,
    );

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

  const handleSelectStrategy = useCallback((strategy: StrategyType) => {
    setSelectedStrategy(strategy);
    setStep(1);
    setErrorMessage(null);
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      updateMeta({ name: value });
    },
    [updateMeta],
  );

  const handleDailyBuyAmountChange = useCallback(
    (value: string) => {
      updateMeta({
        dailyBuyAmount: roundMoney(
          safeNumber(value, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
        ),
      });
    },
    [updateMeta],
  );

  const handleFeeRatePercentChange = useCallback(
    (value: string) => {
      updateMeta({
        feeRatePercent: roundMoney(
          safeNumber(value, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
        ),
      });
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

  const handleMaShortPeriodChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          maAPeriod: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.MA_SHORT_PERIOD),
            MIN_MA_PERIOD,
            MAX_MA_PERIOD,
          ),
        },
      };
    });
  }, []);

  const handleMaLongPeriodChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          maBPeriod: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.MA_LONG_PERIOD),
            MIN_MA_PERIOD,
            MAX_MA_PERIOD,
          ),
        },
      };
    });
  }, []);

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

  const handleTargetReturnRateChange = useCallback(
    (value: string) => {
      setWizardState((previous) => ({
        ...previous,
        multiSplit: {
          ...previous.multiSplit,
          targetReturnRate: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT),
            MIN_TARGET_RETURN_RATE,
            MAX_TARGET_RETURN_RATE,
          ),
        },
      }));
    },
    [],
  );

  const handleMultiSplitTotalCountChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      multiSplit: {
        ...previous.multiSplit,
        totalSplitCount: clampNumber(
          safeNumber(value, STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT),
          MIN_TOTAL_SPLIT_COUNT,
          MAX_TOTAL_SPLIT_COUNT,
        ),
      },
    }));
  }, []);

  const handleMultiSplitTargetStockChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      multiSplit: {
        ...previous.multiSplit,
        targetStock: value,
      },
    }));
  }, []);

  const handleNoStopTargetStockChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        targetStock: value,
      },
    }));
  }, []);

  const handleNoStopLowLocBudgetRatioChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        lowLocBudgetRatio: clampNumber(
          safeNumber(value, 50),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopHighLocPremiumPctChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        highLocPremiumPct: clampNumber(
          safeNumber(value, 15),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopTakeProfitPctChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        takeProfitPct: clampNumber(
          safeNumber(value, 10),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopTotalSplitCountChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        totalSplitCount: clampNumber(
          safeNumber(value, STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT),
          MIN_TOTAL_SPLIT_COUNT,
          MAX_TOTAL_SPLIT_COUNT,
        ),
      },
    }));
  }, []);

  const handleVrModeChange = useCallback(
    (value: VrBandStrategyParams['vrMode']) => {
      updateVrBand({ vrMode: value });
    },
    [updateVrBand],
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
        updateMaSection('ma1', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
        });
      },
      handleMa2RsiThresholdChange: (value: string) => {
        updateMaSection('ma2', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
        });
      },
      handleMa3RsiThresholdChange: (value: string) => {
        updateMaSection('ma3', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
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
        updateMaSection('ma1', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleMa2PartialProfitTargetPctChange: (value: string) => {
        updateMaSection('ma2', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleMa3PartialProfitTargetPctChange: (value: string) => {
        updateMaSection('ma3', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleVrInitialCapitalChange: (value: number) => {
        updateVrBand({ initialCapital: Math.max(0, value) });
      },
      handleVrInitialVChange: (value: number) => {
        updateVrBand({ initialV: Math.max(0, value) });
      },
      handleVrMinOrderQtyChange: (value: number) => {
        updateVrBand({ minOrderQty: Math.max(0, value) });
      },
      handleVrBandUpperPctChange: (value: number) => {
        updateVrBand({ bandUpperPct: Math.max(0, value) });
      },
      handleVrBandLowerPctChange: (value: number) => {
        updateVrBand({ bandLowerPct: Math.max(0, value) });
      },
      handleVrGChange: (value: number) => {
        updateVrBand({ g: Math.max(0, value) });
      },
      handleVrPoolUsagePctChange: (value: number) => {
        updateVrBand({ poolUsagePct: Math.max(0, value) });
      },
      handleVrDeltaCashChange: (value: number) => {
        updateVrBand({ deltaCash: Math.max(0, value) });
      },
      handleVrCycleWeeksChange: (value: number) => {
        updateVrBand({ cycleWeeks: value });
      },
    }),
    [updateMaSection, updateVrBand],
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
    shouldShowLaoerCreditBanner,
    handleBack,
    handleClose: onClose,
    handlePrimaryButtonClick,
    canGoBack: step > 0,
    isPrimaryDisabled: selectedStrategy == null || isSaving,
    strategyDefinitions,
    handleSelectStrategy,
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
    multiSplitTotalSplitCount: safeNumber(
      wizardState.multiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleMultiSplitTargetStockChange,
    handleTargetReturnRateChange,
    handleMultiSplitTotalCountChange,
    noStopTargetStock: safeTrim(wizardState.noStopMultiSplit?.targetStock),
    noStopLowLocBudgetRatio: safeNumber(
      wizardState.noStopMultiSplit?.lowLocBudgetRatio,
      50,
    ),
    noStopHighLocPremiumPct: safeNumber(
      wizardState.noStopMultiSplit?.highLocPremiumPct,
      15,
    ),
    noStopTakeProfitPct: safeNumber(
      wizardState.noStopMultiSplit?.takeProfitPct,
      10,
    ),
    noStopTotalSplitCount: safeNumber(
      wizardState.noStopMultiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleNoStopTargetStockChange,
    handleNoStopLowLocBudgetRatioChange,
    handleNoStopHighLocPremiumPctChange,
    handleNoStopTakeProfitPctChange,
    handleNoStopTotalSplitCountChange,
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
    vrBandUpperPct: safeNumber(wizardState.vrBand?.bandUpperPct, 5),
    vrBandLowerPct: safeNumber(wizardState.vrBand?.bandLowerPct, 5),
    vrG: safeNumber(wizardState.vrBand?.g, 10),
    vrPoolUsagePct: safeNumber(wizardState.vrBand?.poolUsagePct, 50),
    vrDeltaCash: safeNumber(wizardState.vrBand?.deltaCash, 0),
    vrCycleWeeks: safeNumber(
      wizardState.vrBand?.cycleWeeks,
      VR_CYCLE.DEFAULT_WEEKS,
    ),
    handleVrModeChange,
    handleNameChange,
    handleDailyBuyAmountChange,
    handleFeeRatePercentChange,
    handleStartDateChange,
  };
}