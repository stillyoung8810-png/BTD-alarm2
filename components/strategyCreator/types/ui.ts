import type { ReactNode } from 'react';
import type { AppLang } from '@/types';
import type {
  StrategyCreatorMetaDraftInput,
  StrategyType,
} from '@/src/components/StrategyCreator/utils';

export type StrategyWizardScreen =
  | 'strategy_select'
  | 'ma_base'
  | 'ma_sections'
  | 'multi_split_config'
  | 'no_stop_multi_split_config'
  | 'vr_band_config'
  | 'strategy_meta';

export type StrategyTier = 'FREE' | 'PRO' | 'PREMIUM';

export interface StrategyStockOption {
  value: string;
  label: string;
  disabled?: boolean;
  badge?: string;
  tooltip?: string;
}

export interface StrategyDefinitionViewModel {
  id: StrategyType;
  title: string;
  description: string;
  tier: StrategyTier;
  tierLabel: string;
  icon: ReactNode;
  gradientClassName: string;
  isLaoerOriginal?: boolean;
}

export interface StrategyCreatorLayoutProps {
  title: string;
  closeAriaLabel: string;
  cancelLabel: string;
  backLabel: string;
  primaryActionLabel: string;
  processingLabel: string;
  errorMessage: string | null;
  isSaving: boolean;
  isPrimaryDisabled: boolean;
  canGoBack: boolean;
  onClose: () => void;
  onBack: () => void;
  onPrimaryAction: () => void;
  children: ReactNode;
}

export interface DropdownInfoModalLabels {
  badgeLabel: string;
  closeAriaLabel: string;
  confirmLabel: string;
  title: string;
  defaultMessage: string;
}

export interface StrategySelectionStepViewProps {
  lang: AppLang;
  heading: string;
  description: string;
  definitions: readonly StrategyDefinitionViewModel[];
  selectedStrategy: StrategyType | null;
  onSelectStrategy: (strategy: StrategyType) => void;
}

export interface MaBaseStepViewProps {
  stockOptions: readonly StrategyStockOption[];
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  referenceStockLabel: string;
  referenceStockHelper: string;
  shortPeriodLabel: string;
  longPeriodLabel: string;
  rsiEnabledLabel: string;
  rsiEnabledHelper: string;
  alignmentEnabledLabel: string;
  alignmentEnabledHelper: string;
  ma0Stock: string;
  maShortPeriod: number;
  maLongPeriod: number;
  isRsiEnabled: boolean;
  isAlignmentEnabled: boolean;
  onMa0StockChange: (value: string) => void;
  onMaShortPeriodChange: (value: string) => number;
  onMaLongPeriodChange: (value: string) => number;
  onRsiEnabledChange: (value: boolean) => void;
  onAlignmentEnabledChange: (value: boolean) => void;
}

export interface MaSectionsStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  section1Title: string;
  section1Helper: string;
  section2Title: string;
  section2Helper: string;
  section3Title: string;
  section3Helper: string;
  sectionStockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptionsForMa1: readonly StrategyStockOption[];
  stockOptionsForMa2: readonly StrategyStockOption[];
  stockOptionsForMa3: readonly StrategyStockOption[];
  ma1Stock: string;
  ma2Stock: string;
  ma3Stock: string;
  ma1RsiThreshold: number;
  ma2RsiThreshold: number;
  ma3RsiThreshold: number;
  isRsiEnabled: boolean;
  isMa1TakePartialProfit: boolean;
  isMa2TakePartialProfit: boolean;
  isMa3TakePartialProfit: boolean;
  ma1PartialProfitTargetPct: number;
  ma2PartialProfitTargetPct: number;
  ma3PartialProfitTargetPct: number;
  onMa1StockChange: (value: string) => void;
  onMa2StockChange: (value: string) => void;
  onMa3StockChange: (value: string) => void;
  onMa1RsiThresholdChange: (value: string) => number;
  onMa2RsiThresholdChange: (value: string) => number;
  onMa3RsiThresholdChange: (value: string) => number;
  onMa1TakePartialProfitChange: (value: boolean) => void;
  onMa2TakePartialProfitChange: (value: boolean) => void;
  onMa3TakePartialProfitChange: (value: boolean) => void;
  onMa1PartialProfitTargetPctChange: (value: string) => number;
  onMa2PartialProfitTargetPctChange: (value: string) => number;
  onMa3PartialProfitTargetPctChange: (value: string) => number;
}

export interface MultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  targetReturnRateLabel: string;
  totalSplitCountLabel: string;
  highlightedHint: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onTargetReturnRateChange: (value: string) => number;
  onTotalSplitCountChange: (value: string) => number;
}

export interface NoStopMultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  lowLocBudgetRatioLabel: string;
  highLocPremiumPctLabel: string;
  takeProfitPctLabel: string;
  totalSplitCountLabel: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onLowLocBudgetRatioChange: (value: string) => number;
  onHighLocPremiumPctChange: (value: string) => number;
  onTakeProfitPctChange: (value: string) => number;
  onTotalSplitCountChange: (value: string) => number;
}

export interface StrategyMetaStepViewProps {
  metaLabels: {
    portfolioName: string;
    dailyBuyAmount: string;
    startDate: string;
    feeRatePercent: string;
  };
  meta: StrategyCreatorMetaDraftInput;
  isVrStrategy: boolean;
  onNameChange: (value: string) => void;
  onDailyBuyAmountChange: (value: string) => number;
  onStartDateChange: (value: string) => void;
  onFeeRatePercentChange: (value: string) => number;
}