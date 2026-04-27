import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import {
  Plus,
  Zap,
  Info,
  TrendingUp,
  TrendingDown,
  Circle,
  Layers,
  Camera,
  Target,
} from 'lucide-react';
import type { AppLang, Portfolio, StockData, Strategy } from '../types';
import { I18N, PAID_STOCKS } from '../constants';
import { VR_SUMMARY } from '../constants/vrMessages';
import type {
  DashboardMessageSet,
  DashboardStrategyKind,
} from '../constants/messages/dashboardMessages';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';
import StockLogo from './StockLogo';
import VrBadge from './VrBadge';
import VrOrderModal from './VrOrderModal';
import VrPortfolioSummary from './VrPortfolioSummary';
import PortfolioCardActions from './portfolio/PortfolioCardActions';
import { TDSButton, TDSList, TDSListRow } from './tds';
import type { TradeExecutionGuideData } from './TradeExecutionModal';
import { useTossApp } from '../contexts/TossAppContext';
import {
  buildPortfolioMetricsSnapshot,
  determineActiveSection,
  calculateHoldingsFromTrades,
} from '../utils/portfolioCalculations';
import { fetchStockPriceHistory, fetchStockPrices } from '../services/stockService';
import { calculateMA } from '../utils/technicalIndicators';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import {
  formatPortfolioDailyExecutionBlock,
  getVrDailyExecutionCycleHeaderLabel,
  joinDailyExecutionBlocks,
} from '../utils/dailyExecutionSummary';
import {
  calculateMaAlignmentNotMet,
  calculateMaRsiNotMet,
  collectMaPartialProfitLine as collectSharedMaPartialProfitLine,
} from '../supabase/functions/_shared/maSummaryShared.ts';
import {
  buildNoStopExecutionSummaryLines,
} from '../supabase/functions/_shared/noStopExecutionMessages.ts';
import {
  buildMultiSplitExecutionSummaryLines,
  buildMultiSplitProgressVm,
} from '../supabase/functions/_shared/multiSplitExecutionMessages.ts';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import { useVrOrders } from '../hooks/useVrOrders';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';
import {
  formatSignedPercent,
  formatSignedUsdValue,
  formatUsdValue,
  getRounded,
} from '../src/utils/financialCalculations';
import { showErrorToast } from './tds-adapter/showErrorToast';
import {
  getConditionalTypographyStyle,
  getConditionalColor,
} from '../utils/tossStyleHelpers';

interface DashboardProps {
  lang: AppLang;
  portfolios: Portfolio[];
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => Promise<void> | void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (
    id: string,
    activeSection?: 1 | 2 | 3,
  ) => Promise<void> | void;
  onOpenExecution: (id: string, guideData?: TradeExecutionGuideData) => void;
  onOpenAIImage: (id: string) => void;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;
  onDailyExecutionSummaryChange?: (summaryText: string | null) => void;
}

interface MaPartialProfitLine {
  section: 1 | 2 | 3;
  stock: string;
  quantity: number;
}

interface DashboardPortfolioCardHostProps {
  lang: AppLang;
  portfolio: Portfolio;
  onClosePortfolio: (portfolioId: string) => void;
  onDeletePortfolio: (portfolioId: string) => Promise<void> | void;
  onOpenAlarm: (portfolioId: string) => void;
  onOpenDetails: (portfolioId: string) => void;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => void | Promise<void>;
  onOpenExecution: (
    portfolioId: string,
    guideData?: TradeExecutionGuideData,
  ) => void;
  onOpenAIImage: (portfolioId: string) => void;
  onDailyExecutionBlock?: (id: string, block: string | null) => void;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const STANDARD_MA_PERIODS = [20, 60, 120] as const;
const MIN_FALLBACK_HISTORY_DAYS = 120;
const MA_HISTORY_BUFFER_DAYS = 30;

type StandardMaPeriod = (typeof STANDARD_MA_PERIODS)[number];

const MA_PROPERTY_MAP: Record<StandardMaPeriod, keyof StockData> = {
  20: 'ma20',
  60: 'ma60',
  120: 'ma120',
};

type PartialProfitSectionConfig =
  | Strategy['ma1']
  | Strategy['ma2']
  | Strategy['ma3'];

interface MaAnalysisInputs {
  baseStock: string;
  priceMap: Record<string, StockData>;
  baseHistory: Array<{ price: number }> | null;
}

interface MaAnalysisViewModel {
  strategy: Pick<Strategy, 'ma0' | 'ma1' | 'ma2' | 'ma3'>;
  trades: Portfolio['trades'];
}

function isStandardMaPeriod(period: number): period is StandardMaPeriod {
  return (STANDARD_MA_PERIODS as readonly number[]).includes(period);
}

function isPartialProfitPriceRequired(
  config: PartialProfitSectionConfig | undefined,
): boolean {
  return (
    config?.takePartialProfit === true &&
    config.partialProfitTargetPct != null &&
    config.partialProfitTargetPct > 0 &&
    typeof config.stock === 'string' &&
    config.stock.trim().length > 0
  );
}

async function loadMaAnalysisInputs(
  viewModel: MaAnalysisViewModel,
  options: { signal?: AbortSignal } = {},
): Promise<MaAnalysisInputs> {
  const baseStock = viewModel.strategy.ma0.stock;
  const partialProfitSymbols = [
    viewModel.strategy.ma1,
    viewModel.strategy.ma2,
    viewModel.strategy.ma3,
  ]
    .filter(isPartialProfitPriceRequired)
    .map((config) => config.stock);
  const symbols = Array.from(
    new Set(
      [baseStock, ...partialProfitSymbols].filter(
        (symbol): symbol is string =>
          typeof symbol === 'string' && symbol.trim().length > 0,
      ),
    ),
  );

  const priceMap = await fetchStockPrices(symbols, options);
  const { maAPeriod, maBPeriod } = getMaPeriodsFromStrategy(viewModel.strategy);
  const shouldLoadHistory =
    !isStandardMaPeriod(maAPeriod) || !isStandardMaPeriod(maBPeriod);

  if (!shouldLoadHistory) {
    return {
      baseStock,
      priceMap,
      baseHistory: null,
    };
  }

  const history = await fetchStockPriceHistory(
    baseStock,
    Math.max(maAPeriod, maBPeriod, MIN_FALLBACK_HISTORY_DAYS) +
      MA_HISTORY_BUFFER_DAYS,
    options,
  );

  return {
    baseStock,
    priceMap,
    baseHistory: history.map((item) => ({ price: item.price })),
  };
}

function getMaValueFromLoadedData(
  period: number,
  baseData: StockData | undefined,
  baseHistory: Array<{ price: number }> | null,
): number {
  if (baseData == null) {
    return 0;
  }

  if (isStandardMaPeriod(period)) {
    const maKey = MA_PROPERTY_MAP[period];
    const mappedValue = baseData[maKey];
    return typeof mappedValue === 'number' ? mappedValue : 0;
  }

  if (baseHistory == null || baseHistory.length < period) {
    return 0;
  }

  const prices = baseHistory.map((item) => item.price);
  return calculateMA(prices.slice(-period), period);
}

function getMaPeriodsFromStrategy(
  strategy: Pick<Strategy, 'ma0' | 'ma1' | 'ma2' | 'ma3'>,
): { maAPeriod: number; maBPeriod: number } {
  const ma1 = strategy.ma1 as { period?: number };
  const ma2 = strategy.ma2 as { period2?: number };
  const ma3 = strategy.ma3 as { period?: number };

  return {
    maAPeriod: strategy.ma0.maAPeriod ?? ma1.period ?? 20,
    maBPeriod: strategy.ma0.maBPeriod ?? ma3.period ?? ma2.period2 ?? 60,
  };
}

function buildMaAnalysisKey(
  strategy: Pick<Strategy, 'ma0' | 'ma1' | 'ma2' | 'ma3'>,
): string {
  const ma1 = strategy.ma1 as { period?: number };
  const ma2 = strategy.ma2 as { period2?: number };
  const ma3 = strategy.ma3 as { period?: number };

  return [
    strategy.ma0.stock,
    strategy.ma0.rsiEnabled ? 1 : 0,
    strategy.ma0.alignmentEnabled ? 1 : 0,
    strategy.ma0.maAPeriod ?? '',
    strategy.ma0.maBPeriod ?? '',
    strategy.ma1.stock,
    strategy.ma1.rsiThreshold ?? '',
    strategy.ma1.takePartialProfit ? 1 : 0,
    strategy.ma1.partialProfitTargetPct ?? '',
    ma1.period ?? '',
    strategy.ma2.stock,
    strategy.ma2.rsiThreshold ?? '',
    strategy.ma2.takePartialProfit ? 1 : 0,
    strategy.ma2.partialProfitTargetPct ?? '',
    ma2.period2 ?? '',
    strategy.ma3.stock,
    strategy.ma3.rsiThreshold ?? '',
    strategy.ma3.takePartialProfit ? 1 : 0,
    strategy.ma3.partialProfitTargetPct ?? '',
    ma3.period ?? '',
  ].join('|');
}

function determineActiveSectionFromLoadedData(
  viewModel: MaAnalysisViewModel,
  inputs: MaAnalysisInputs,
): 1 | 2 | 3 | null {
  const baseData = inputs.priceMap[inputs.baseStock];
  const basePrice = baseData?.price ?? 0;

  if (!areStrictPositiveFiniteScalars(basePrice)) {
    return null;
  }

  const { maAPeriod, maBPeriod } = getMaPeriodsFromStrategy(
    viewModel.strategy,
  );
  const maA = getMaValueFromLoadedData(
    maAPeriod,
    baseData,
    inputs.baseHistory,
  );
  const maB = getMaValueFromLoadedData(
    maBPeriod,
    baseData,
    inputs.baseHistory,
  );

  if (!areStrictPositiveFiniteScalars(maA, maB)) {
    return null;
  }

  const high = Math.max(maA, maB);
  const low = Math.min(maA, maB);

  if (basePrice > high) {
    return 1;
  }

  if (basePrice < low) {
    return 3;
  }

  return 2;
}

interface PortfolioCardViewProps {
  lang: AppLang;
  portfolioName: string;
  ma0Ticker: string;
  strategyKind: DashboardStrategyKind;
  strategyName: string;
  isAlarmEnabled: boolean;
  isInTossApp: boolean;
  valuationLabel: string;
  realizedProfitLabel: string;
  realizedProfitAfterFees: string;
  valuationText: string;
  realizedProfitText: string;
  roiText: string;
  yieldTone: DashboardChangeTone;
  realizedProfitTone: DashboardChangeTone;
  isMetricsLoading: boolean;
  executionSummary: React.ReactNode;
  detailsAriaLabel: string;
  executionAriaLabel: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
  terminateLabel: string;
  isVrStrategy: boolean;
  canOpenVrOrders: boolean;
  vrOrderButtonLabel: string;
  onOpenDetails: () => void;
  onOpenExecution: () => void;
  onOpenQuickInput: () => Promise<void> | void;
  onOpenAIImage: () => void;
  onOpenVrOrders: () => void;
  onOpenAlarm: () => void;
  onClosePortfolio: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

type DashboardChangeTone = 'positive' | 'negative' | 'neutral';

const USD_DISPLAY_DECIMAL_PLACES = 2;
const ROI_DISPLAY_DECIMAL_PLACES = 1;
const LOADING_ELLIPSIS_LABEL = '...';
const PROGRESS_MIN_PERCENT = 0;
const PROGRESS_MAX_PERCENT = 100;

const TONE_TEXT_COLOR_MAP: Record<DashboardChangeTone, string> = {
  positive: 'text-emerald-500',
  negative: 'text-rose-500',
  neutral: 'text-slate-400 dark:text-slate-500',
};

const TONE_BADGE_CLASS_MAP: Record<DashboardChangeTone, string> = {
  positive: 'bg-emerald-500 text-white',
  negative: 'bg-rose-500 text-white',
  neutral: 'bg-slate-500 text-white',
};

const TONE_ROTATION_CLASS_MAP: Record<DashboardChangeTone, string> = {
  positive: '',
  negative: 'rotate-180',
  neutral: '',
};

const REALIZED_PROFIT_INDICATOR_KEY_MAP: Record<
  DashboardChangeTone,
  'up' | 'down' | 'none'
> = {
  positive: 'up',
  negative: 'down',
  neutral: 'none',
};

function getChangeTone(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): DashboardChangeTone {
  const rounded = getRounded(value, digits);
  if (rounded > 0) {
    return 'positive';
  }
  if (rounded < 0) {
    return 'negative';
  }
  return 'neutral';
}

function getRealizedProfitIndicatorKey(
  tone: DashboardChangeTone,
): 'up' | 'down' | 'none' {
  return REALIZED_PROFIT_INDICATOR_KEY_MAP[tone];
}

interface DashboardHeaderVm {
  title: string;
  subtitle: string;
  totalValuationText: string;
  totalValuationChangeText: string;
  totalValuationChangePctText: string;
  changeTone: DashboardChangeTone;
}

interface PortfolioExecutionSummaryInput {
  lang: AppLang;
  copy: DashboardMessageSet;
  strategy: Pick<Strategy, 'ma1' | 'ma2' | 'ma3'>;
  trades: Portfolio['trades'];
  vrSnapshot: Portfolio['vrSnapshot'];
  vrSettings: Portfolio['strategy']['vrBand'] | null;
  multiSplitExecutionData:
    ReturnType<typeof useMultiSplitExecution>['executionData'];
  multiSplitStatus: ReturnType<typeof useMultiSplitExecution>['status'];
  noStopStatus: ReturnType<typeof useNoStopMultiSplitExecution>['status'];
  noStopExecutionData:
    ReturnType<typeof useNoStopMultiSplitExecution>['executionData'];
  maActiveSection: 1 | 2 | 3 | null;
  maPartialProfitLines: MaPartialProfitLine[];
  maRsiNotMet: boolean;
  maAlignmentNotMet: boolean;
  vrCycleHeaderLabel: string | null;
}

function getPortfolioStrategyKind(
  portfolio: Portfolio,
): DashboardStrategyKind {
  if (portfolio.strategy.vrBand != null) {
    return 'vr_band';
  }
  if (portfolio.strategy.multiSplit != null) {
    return 'multi_split';
  }
  if (portfolio.strategy.noStopMultiSplit != null) {
    return 'no_stop_multi_split';
  }
  return 'ma_interval';
}

function formatShareQuantity(value: number, digits: number = 2): string {
  return getRounded(value, digits).toFixed(digits);
}

function renderStrategyIcon(
  strategyKind: DashboardStrategyKind,
): React.ReactElement {
  switch (strategyKind) {
    case 'vr_band':
      return <Target size={14} className="text-indigo-500" />;
    case 'multi_split':
    case 'no_stop_multi_split':
      return <Layers size={14} className="text-emerald-500" />;
    case 'ma_interval':
      return <TrendingUp size={14} className="text-blue-500" />;
    default: {
      const exhaustiveCheck: never = strategyKind;
      return exhaustiveCheck;
    }
  }
}

function collectPartialProfitLine(input: {
  section: 1 | 2 | 3;
  config: PartialProfitSectionConfig | undefined;
  holdings: ReturnType<typeof calculateHoldingsFromTrades>;
  prices: Awaited<ReturnType<typeof fetchStockPrices>>;
}): MaPartialProfitLine | null {
  return collectSharedMaPartialProfitLine(input);
}

function renderMaExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    | 'copy'
    | 'strategy'
    | 'maActiveSection'
    | 'maPartialProfitLines'
    | 'maRsiNotMet'
    | 'maAlignmentNotMet'
  >,
): React.ReactNode {
  const {
    copy,
    strategy,
    maActiveSection,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
  } = input;
  const ex = copy.execution;

  if (maActiveSection == null) {
    return (
      <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-medium">
        {ex.checkingSection}
      </div>
    );
  }

  let targetConfig: Strategy['ma1'] | Strategy['ma2'] | Strategy['ma3'] | undefined;
  if (maActiveSection === 1) {
    targetConfig = strategy.ma1;
  } else if (maActiveSection === 2) {
    targetConfig = strategy.ma2;
  } else {
    targetConfig = strategy.ma3;
  }

  if (targetConfig == null) {
    return null;
  }

  let actionText = `${ex.section} ${maActiveSection}: ${targetConfig.stock} ${ex.buy}`;
  if (maAlignmentNotMet && maRsiNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchBothNotMet}`;
  } else if (maAlignmentNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchAlignmentNotMet}`;
  } else if (maRsiNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchRsiNotMet}`;
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-black text-blue-900 dark:text-white">
        {actionText}
      </div>
      {maPartialProfitLines.map((line) => (
        <div
          key={`${line.section}-${line.stock}`}
          className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium"
        >
          {ex.section}
          {line.section} {ex.sectionPartialProfit}: {line.stock}{' '}
          {Math.round(line.quantity)}
          {ex.sharesUnit}
        </div>
      ))}
    </div>
  );
}

function renderVrExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'lang' | 'copy' | 'vrSettings' | 'vrSnapshot' | 'trades' | 'vrCycleHeaderLabel'
  >,
): React.ReactNode {
  const { lang, copy, vrSettings, vrSnapshot, trades, vrCycleHeaderLabel } =
    input;

  if (vrSettings == null) {
    return <span>{copy.execution.calculating}</span>;
  }

  const hasEverBought = trades.some((trade) => trade.type === 'buy');

  return (
    <div className="space-y-2">
      {vrCycleHeaderLabel != null && vrCycleHeaderLabel !== '' ? (
        <div className="flex items-center gap-2">
          <VrBadge mode={vrSettings.vrMode} lang={lang} />
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-md text-blue-800 dark:text-blue-200 bg-blue-100/60 dark:bg-blue-500/20"
            title={copy.cycleHeaderTitle}
          >
            {vrCycleHeaderLabel}
          </span>
        </div>
      ) : (
        <VrBadge mode={vrSettings.vrMode} lang={lang} />
      )}

      <VrPortfolioSummary
        vrSettings={vrSettings}
        vrSnapshot={vrSnapshot}
        lang={lang}
        hasEverBought={hasEverBought}
      />
    </div>
  );
}

function renderMultiSplitExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'lang' | 'copy' | 'multiSplitExecutionData' | 'multiSplitStatus'
  >,
): React.ReactNode {
  const { lang, copy, multiSplitExecutionData, multiSplitStatus } = input;
  const ex = copy.execution;

  if (multiSplitExecutionData == null) {
    if (multiSplitStatus === 'fetch_error') {
      return <span>{copy.systemError}</span>;
    }

    if (
      multiSplitStatus === 'invalid_strategy' ||
      multiSplitStatus === 'invalid_amount'
    ) {
      return <span>{ex.strategyPreparing}</span>;
    }

    return <span>{ex.calculating}</span>;
  }

  const progressVm = buildMultiSplitProgressVm({
    lang,
    cashUsagePct: multiSplitExecutionData.cashUsagePct,
  });
  const summaryLines = buildMultiSplitExecutionSummaryLines({
    lang,
    execution: multiSplitExecutionData,
  });

  return renderProgressExecutionSummary({
    progressLine: progressVm.labelText,
    progressWidth: progressVm.widthPct,
    progressBarAriaLabel: ex.multiSplitProgressBarAriaLabel,
    detailLines: summaryLines.slice(1),
  });
}

function renderProgressExecutionSummary(args: {
  progressLine: string;
  progressWidth: number;
  progressBarAriaLabel: string;
  detailLines: string[];
}): React.ReactNode {
  const boundedProgressWidth = Number.isFinite(args.progressWidth)
    ? Math.min(
        PROGRESS_MAX_PERCENT,
        Math.max(PROGRESS_MIN_PERCENT, args.progressWidth),
      )
    : PROGRESS_MIN_PERCENT;

  return (
    <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
      <div className="space-y-1.5">
        <div className="font-black text-blue-900 dark:text-white">
          {args.progressLine}
        </div>
        <div
          aria-label={args.progressBarAriaLabel}
          className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40"
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] dark:bg-blue-400"
            style={{ width: `${boundedProgressWidth}%` }}
          />
        </div>
      </div>
      {args.detailLines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function renderNoStopExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'lang' | 'copy' | 'noStopExecutionData' | 'noStopStatus'
  >,
): React.ReactNode {
  const { lang, copy, noStopExecutionData, noStopStatus } = input;
  const ex = copy.execution;

  if (noStopExecutionData == null) {
    if (noStopStatus === 'invalid_amount') {
      return <span>{ex.insufficientAmount}</span>;
    }

    if (noStopStatus === 'fetch_error') {
      return <span>{copy.systemError}</span>;
    }

    if (noStopStatus === 'invalid_strategy') {
      return <span>{ex.strategyPreparing}</span>;
    }

    return <span>{ex.calculating}</span>;
  }

  const summaryLines = buildNoStopExecutionSummaryLines({
    lang,
    execution: noStopExecutionData,
    formatPrice: (price) => formatUsdValue(price),
    formatQuantity: (quantity) => formatShareQuantity(quantity, 0),
  });
  const progressLine = summaryLines[0] ?? '';
  const detailLines = summaryLines.slice(1);

  return renderProgressExecutionSummary({
    progressLine,
    progressWidth: noStopExecutionData.progressPct,
    progressBarAriaLabel: ex.noStopProgressBarAriaLabel,
    detailLines,
  });
}

export function DashboardPortfolioCardHost({
  lang,
  portfolio,
  onClosePortfolio,
  onDeletePortfolio,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  onDailyExecutionBlock,
}: DashboardPortfolioCardHostProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const copy = getDashboardMessages(lang);
  const copyRef = useRef(copy);
  const portfolioId = portfolio.id;
  const portfolioName = portfolio.name;
  const isAlarmEnabled = portfolio.alarmconfig?.enabled === true;
  const strategyKind = getPortfolioStrategyKind(portfolio);
  const vrSettings = portfolio.strategy.vrBand ?? null;
  const vrCycleHeaderLabel = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);

  const multiSplitVm = useMultiSplitExecution(portfolio, lang);
  const noStopVm = useNoStopMultiSplitExecution(portfolio, lang);

  const multiSplitStatus = multiSplitVm.status;
  const multiSplitExecutionData = multiSplitVm.executionData;

  const noStopStatus = noStopVm.status;
  const noStopExecutionData = noStopVm.executionData;

  const [currentValuation, setCurrentValuation] = useState(0);
  const [investedAmount, setInvestedAmount] = useState(0);
  const [yieldRate, setYieldRate] = useState(0);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);
  const [maActiveSection, setMaActiveSection] = useState<1 | 2 | 3 | null>(
    null,
  );
  const [isMaAnalysisReady, setIsMaAnalysisReady] = useState(false);
  const [maPartialProfitLines, setMaPartialProfitLines] = useState<
    MaPartialProfitLine[]
  >([]);
  const [maRsiNotMet, setMaRsiNotMet] = useState(false);
  const [maAlignmentNotMet, setMaAlignmentNotMet] = useState(false);
  const [isVrOrderModalOpen, setIsVrOrderModalOpen] = useState(false);
  const lastDailyExecutionBlockRef = useRef<{
    portfolioId: string;
    block: string | null;
  } | null>(null);

  const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);

  const isMultiSplitStrategy = portfolio.strategy.multiSplit != null;
  const isNoStopMultiSplitStrategy =
    portfolio.strategy.noStopMultiSplit != null;
  const isVrStrategy = vrSettings != null;
  const maAnalysisKey = buildMaAnalysisKey(portfolio.strategy);
  const maAnalysisVm = useMemo<MaAnalysisViewModel>(
    () => ({
      strategy: {
        ma0: portfolio.strategy.ma0,
        ma1: portfolio.strategy.ma1,
        ma2: portfolio.strategy.ma2,
        ma3: portfolio.strategy.ma3,
      },
      trades: portfolio.trades,
    }),
    [maAnalysisKey, portfolio.trades],
  );

  const ma0Ticker =
    portfolio.strategy.multiSplit?.targetStock ||
    portfolio.strategy.noStopMultiSplit?.targetStock ||
    (isVrStrategy ? 'TQQQ' : portfolio.strategy.ma0?.stock) ||
    'TQQQ';

  useLayoutEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    if (isMultiSplitStrategy || isNoStopMultiSplitStrategy || isVrStrategy) {
      setMaActiveSection(null);
      setMaRsiNotMet(false);
      setMaAlignmentNotMet(false);
      setMaPartialProfitLines([]);
      setIsMaAnalysisReady(false);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const runAnalysis = async () => {
      try {
        const inputs = await loadMaAnalysisInputs(maAnalysisVm, {
          signal: abortController.signal,
        });

        if (!isMounted) {
          return;
        }

        const nextSection = determineActiveSectionFromLoadedData(
          maAnalysisVm,
          inputs,
        );
        const prices = inputs.priceMap;
        const baseData = inputs.priceMap[inputs.baseStock];
        const { maAPeriod, maBPeriod } = getMaPeriodsFromStrategy(
          maAnalysisVm.strategy,
        );
        const maA = getMaValueFromLoadedData(
          maAPeriod,
          baseData,
          inputs.baseHistory,
        );
        const maB = getMaValueFromLoadedData(
          maBPeriod,
          baseData,
          inputs.baseHistory,
        );

        setMaActiveSection((previous) =>
          previous === nextSection ? previous : nextSection,
        );

        if (nextSection !== 1 && nextSection !== 2 && nextSection !== 3) {
          setMaRsiNotMet(false);
          setMaAlignmentNotMet(false);
          setMaPartialProfitLines([]);
          setIsMaAnalysisReady((previous) => (previous ? previous : true));
          return;
        }

        const ma0 = maAnalysisVm.strategy.ma0;
        const ma1 = maAnalysisVm.strategy.ma1;
        const ma2 = maAnalysisVm.strategy.ma2;
        const ma3 = maAnalysisVm.strategy.ma3;
        const baseStock = ma0.stock;

        setMaRsiNotMet(
          calculateMaRsiNotMet({
            strategy: maAnalysisVm.strategy,
            section: nextSection,
            currentRsi: prices[baseStock]?.rsi,
          }),
        );

        setMaAlignmentNotMet(
          calculateMaAlignmentNotMet({
            isAlignmentEnabled: ma0.alignmentEnabled,
            maA,
            maB,
          }),
        );

        const holdings = calculateHoldingsFromTrades(maAnalysisVm.trades);
        const nextLines = [
          collectPartialProfitLine({
            section: 1,
            config: ma1,
            holdings,
            prices,
          }),
          collectPartialProfitLine({
            section: 2,
            config: ma2,
            holdings,
            prices,
          }),
          collectPartialProfitLine({
            section: 3,
            config: ma3,
            holdings,
            prices,
          }),
        ].filter((line): line is MaPartialProfitLine => line != null);

        setMaPartialProfitLines((previous) => {
          if (
            previous.length === nextLines.length &&
            previous.every(
              (item, index) =>
                item.section === nextLines[index].section &&
                item.stock === nextLines[index].stock &&
                item.quantity === nextLines[index].quantity,
            )
          ) {
            return previous;
          }

          return nextLines;
        });
        setIsMaAnalysisReady((previous) => (previous ? previous : true));
      } catch (error: unknown) {
        if (isAbortLikeError(error) || !isMounted) {
          return;
        }

        console.error('[Dashboard] Failed to load MA analysis inputs:', error);
        showErrorToast(copyRef.current.systemError);
      }
    };

    void runAnalysis();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [
    isMultiSplitStrategy,
    isNoStopMultiSplitStrategy,
    isVrStrategy,
    maAnalysisVm,
  ]);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const updateMetrics = async () => {
      setIsMetricsLoading(true);

      try {
        const nextMetrics = await buildPortfolioMetricsSnapshot(portfolio, {
          signal: abortController.signal,
        });

        if (!isMounted) {
          return;
        }

        setCurrentValuation(nextMetrics.currentValuation);
        setInvestedAmount(nextMetrics.investedAmount);
        setYieldRate(nextMetrics.yieldRate);
        setRealizedProfit(nextMetrics.realizedProfit);
      } catch (error: unknown) {
        if (isAbortLikeError(error) || !isMounted) {
          return;
        }

        console.error('[Dashboard] Failed to load metrics snapshot:', error);
        showErrorToast(copyRef.current.systemError);
      } finally {
        if (isMounted) {
          setIsMetricsLoading(false);
        }
      }
    };

    void updateMetrics();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [portfolio]);

  useEffect(() => {
    if (onDailyExecutionBlock == null) {
      return;
    }

    if (!isAlarmEnabled) {
      const lastBlock = lastDailyExecutionBlockRef.current;
      if (lastBlock?.portfolioId === portfolioId && lastBlock.block === null) {
        return;
      }

      lastDailyExecutionBlockRef.current = {
        portfolioId,
        block: null,
      };
      onDailyExecutionBlock(portfolioId, null);
      return;
    }

    if (
      portfolio.strategy.multiSplit != null &&
      multiSplitStatus === 'loading'
    ) {
      return;
    }

    if (
      portfolio.strategy.noStopMultiSplit != null &&
      noStopExecutionData == null
    ) {
      return;
    }

    if (
      !isMultiSplitStrategy &&
      !isNoStopMultiSplitStrategy &&
      !isVrStrategy &&
      !isMaAnalysisReady
    ) {
      return;
    }

    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      noStopMultiSplitExecutionData: noStopExecutionData ?? undefined,
      maActiveSection:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maActiveSection ?? undefined,
      maPartialProfitLines:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maPartialProfitLines.length > 0
          ? maPartialProfitLines
          : undefined,
      maRsiNotMet:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maRsiNotMet,
      maAlignmentNotMet:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maAlignmentNotMet,
    });

    const lastBlock = lastDailyExecutionBlockRef.current;
    if (lastBlock?.portfolioId === portfolioId && lastBlock.block === block) {
      return;
    }

    lastDailyExecutionBlockRef.current = {
      portfolioId,
      block,
    };
    onDailyExecutionBlock(portfolioId, block);
  }, [
    onDailyExecutionBlock,
    isAlarmEnabled,
    portfolio,
    portfolioId,
    lang,
    multiSplitStatus,
    multiSplitExecutionData,
    noStopExecutionData,
    maActiveSection,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
    isMaAnalysisReady,
    isMultiSplitStrategy,
    isNoStopMultiSplitStrategy,
    isVrStrategy,
  ]);

  const vrExecutionSummary = useMemo(
    () => {
      if (strategyKind !== 'vr_band') {
        return null;
      }

      return renderVrExecutionSummary({
        lang,
        copy,
        trades: portfolio.trades,
        vrSnapshot: portfolio.vrSnapshot,
        vrSettings,
        vrCycleHeaderLabel,
      });
    },
    [
      lang,
      copy,
      strategyKind,
      portfolio.trades,
      portfolio.vrSnapshot,
      vrSettings,
      vrCycleHeaderLabel,
    ],
  );

  const multiSplitExecutionSummary = useMemo(
    () => {
      if (strategyKind !== 'multi_split') {
        return null;
      }

      return renderMultiSplitExecutionSummary({
        lang,
        copy,
        multiSplitExecutionData,
        multiSplitStatus,
      });
    },
    [
      lang,
      copy,
      strategyKind,
      multiSplitExecutionData,
      multiSplitStatus,
    ],
  );

  const noStopExecutionSummary = useMemo(
    () => {
      if (strategyKind !== 'no_stop_multi_split') {
        return null;
      }

      return renderNoStopExecutionSummary({
        lang,
        copy,
        noStopStatus,
        noStopExecutionData,
      });
    },
    [
      lang,
      copy,
      strategyKind,
      noStopStatus,
      noStopExecutionData,
    ],
  );

  const maExecutionSummary = useMemo(
    () => {
      if (strategyKind !== 'ma_interval') {
        return null;
      }

      return renderMaExecutionSummary({
        copy,
        strategy: maAnalysisVm.strategy,
        maActiveSection,
        maPartialProfitLines,
        maRsiNotMet,
        maAlignmentNotMet,
      });
    },
    [
      copy,
      strategyKind,
      maAnalysisVm,
      maActiveSection,
      maPartialProfitLines,
      maRsiNotMet,
      maAlignmentNotMet,
    ],
  );

  const executionSummary = useMemo(() => {
    switch (strategyKind) {
      case 'vr_band':
        return vrExecutionSummary;
      case 'multi_split':
        return multiSplitExecutionSummary;
      case 'no_stop_multi_split':
        return noStopExecutionSummary;
      case 'ma_interval':
        return maExecutionSummary;
      default: {
        const exhaustiveCheck: never = strategyKind;
        return exhaustiveCheck;
      }
    }
  }, [
    strategyKind,
    vrExecutionSummary,
    multiSplitExecutionSummary,
    noStopExecutionSummary,
    maExecutionSummary,
  ]);

  const handleOpenDetails = useCallback(() => {
    onOpenDetails(portfolioId);
  }, [onOpenDetails, portfolioId]);

  const handleOpenExecution = useCallback(() => {
    onOpenExecution(portfolioId, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      noStopExecutionData: noStopExecutionData ?? undefined,
    });
  }, [
    multiSplitExecutionData,
    noStopExecutionData,
    onOpenExecution,
    portfolioId,
  ]);

  const isOpeningQuickInputRef = useRef(false);

  const handleOpenQuickInput = useCallback(async (): Promise<void> => {
    if (isOpeningQuickInputRef.current) {
      return;
    }
    isOpeningQuickInputRef.current = true;

    try {
      const activeSection =
        maActiveSection === 1 ||
        maActiveSection === 2 ||
        maActiveSection === 3
          ? maActiveSection
          : await determineActiveSection({
              ...portfolio,
              strategy: {
                ...portfolio.strategy,
                ...maAnalysisVm.strategy,
              },
              trades: maAnalysisVm.trades,
            });
      await Promise.resolve(
        onOpenQuickInput(portfolioId, activeSection ?? undefined),
      );
    } catch (error: unknown) {
      console.error(
        '[DashboardPortfolioCardHost:handleOpenQuickInput] failed',
        error,
      );
      showErrorToast(copy.systemError);
    } finally {
      isOpeningQuickInputRef.current = false;
    }
  }, [
    copy.systemError,
    maActiveSection,
    maAnalysisVm,
    onOpenQuickInput,
    portfolio,
    portfolioId,
  ]);

  const handleCloseVrOrders = useCallback(() => {
    setIsVrOrderModalOpen(false);
  }, []);

  const handleOpenAIImage = useCallback(() => {
    onOpenAIImage(portfolioId);
  }, [onOpenAIImage, portfolioId]);

  const handleOpenAlarm = useCallback(() => {
    onOpenAlarm(portfolioId);
  }, [onOpenAlarm, portfolioId]);

  const handleOpenVrOrders = useCallback(() => {
    setIsVrOrderModalOpen(true);
  }, []);

  const handleClosePortfolio = useCallback(() => {
    onClosePortfolio(portfolioId);
  }, [onClosePortfolio, portfolioId]);

  const handleDeletePortfolio = useCallback(() => {
    return onDeletePortfolio(portfolioId);
  }, [onDeletePortfolio, portfolioId]);

  const cardVm = {
    detailsAriaLabel: copy.openDetailsAria(portfolioName),
    executionAriaLabel: copy.openExecutionAria(portfolioName),
    valuationText: isMetricsLoading
      ? LOADING_ELLIPSIS_LABEL
      : formatUsdValue(currentValuation, USD_DISPLAY_DECIMAL_PLACES),
    realizedProfitText: isMetricsLoading
      ? LOADING_ELLIPSIS_LABEL
      : formatSignedUsdValue(realizedProfit, USD_DISPLAY_DECIMAL_PLACES),
    roiText: isMetricsLoading
      ? LOADING_ELLIPSIS_LABEL
      : formatSignedPercent(yieldRate, ROI_DISPLAY_DECIMAL_PLACES),
    yieldTone: isMetricsLoading
      ? 'neutral'
      : getChangeTone(yieldRate, ROI_DISPLAY_DECIMAL_PLACES),
    realizedProfitTone: isMetricsLoading
      ? 'neutral'
      : getChangeTone(realizedProfit, USD_DISPLAY_DECIMAL_PLACES),
    strategyName: copy.strategyName[strategyKind],
    canOpenVrOrders: portfolio.vrSnapshot != null,
  };

  return (
    <>
      <PortfolioCardView
        lang={lang}
        portfolioName={portfolioName}
        ma0Ticker={ma0Ticker}
        strategyKind={strategyKind}
        strategyName={cardVm.strategyName}
        isAlarmEnabled={isAlarmEnabled}
        isInTossApp={isInTossApp}
        valuationLabel={copy.valuationLabel}
        realizedProfitLabel={copy.realizedProfitLabel}
        realizedProfitAfterFees={copy.realizedProfitAfterFees}
        valuationText={cardVm.valuationText}
        realizedProfitText={cardVm.realizedProfitText}
        roiText={cardVm.roiText}
        yieldTone={cardVm.yieldTone}
        realizedProfitTone={cardVm.realizedProfitTone}
        isMetricsLoading={isMetricsLoading}
        executionSummary={executionSummary}
        detailsAriaLabel={cardVm.detailsAriaLabel}
        executionAriaLabel={cardVm.executionAriaLabel}
        aiTradeRecognitionAria={copy.aiTradeRecognitionAria}
        quickInputAria={copy.quickInputAria}
        terminateLabel={copy.terminate}
        isVrStrategy={isVrStrategy}
        canOpenVrOrders={cardVm.canOpenVrOrders}
        vrOrderButtonLabel={VR_SUMMARY[lang].viewOrderTable}
        onOpenDetails={handleOpenDetails}
        onOpenExecution={handleOpenExecution}
        onOpenQuickInput={handleOpenQuickInput}
        onOpenAIImage={handleOpenAIImage}
        onOpenVrOrders={handleOpenVrOrders}
        onOpenAlarm={handleOpenAlarm}
        onClosePortfolio={handleClosePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />

      {isVrStrategy ? (
        <VrOrderModal
          isOpen={isVrOrderModalOpen}
          onClose={handleCloseVrOrders}
          buyOrders={safeBuyOrders}
          sellOrders={safeSellOrders}
          lang={lang}
        />
      ) : null}
    </>
  );
}

const PortfolioCardView = React.memo(function PortfolioCardView({
  lang,
  portfolioName,
  ma0Ticker,
  strategyKind,
  strategyName,
  isAlarmEnabled,
  isInTossApp,
  valuationLabel,
  realizedProfitLabel,
  realizedProfitAfterFees,
  valuationText,
  realizedProfitText,
  roiText,
  yieldTone,
  realizedProfitTone,
  isMetricsLoading,
  executionSummary,
  detailsAriaLabel,
  executionAriaLabel,
  aiTradeRecognitionAria,
  quickInputAria,
  terminateLabel,
  isVrStrategy,
  canOpenVrOrders,
  vrOrderButtonLabel,
  onOpenDetails,
  onOpenExecution,
  onOpenQuickInput,
  onOpenAIImage,
  onOpenVrOrders,
  onOpenAlarm,
  onClosePortfolio,
  onDeletePortfolio,
}: PortfolioCardViewProps): React.ReactElement {
  const t = I18N[lang];
  const roiBadgeClassName = TONE_BADGE_CLASS_MAP[yieldTone];
  const roiIconClassName = TONE_ROTATION_CLASS_MAP[yieldTone];
  const realizedProfitTextClassName = TONE_TEXT_COLOR_MAP[realizedProfitTone];
  const realizedProfitIndicatorKey =
    getRealizedProfitIndicatorKey(realizedProfitTone);
  const realizedProfitIndicatorIconMap: Record<
    'up' | 'down' | 'none',
    React.ReactElement
  > = {
    up: <TrendingUp size={12} />,
    down: <TrendingDown size={12} />,
    none: <Circle size={4} className="fill-current" />,
  };
  const realizedProfitIndicatorIcon =
    realizedProfitIndicatorIconMap[realizedProfitIndicatorKey];

  return (
    <div className="glass light-card-depth p-7 rounded-[2.5rem] space-y-5 group hover:-translate-y-1 transition-all duration-500 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl">
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <PortfolioCardActions
          lang={lang}
          isAlarmEnabled={isAlarmEnabled}
          onOpenAlarm={onOpenAlarm}
          onDeletePortfolio={onDeletePortfolio}
        />
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-4">
          <div
            role="button"
            tabIndex={0}
            aria-label={detailsAriaLabel}
            onClick={onOpenDetails}
            onKeyDown={(event) => handlePressEnterOrSpace(event, onOpenDetails)}
            className="w-16 h-16 rounded-full overflow-visible relative cursor-pointer active:scale-95 transition-transform"
          >
            <div
              className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg ${roiBadgeClassName}`}
            >
              <TrendingUp
                size={10}
                className={roiIconClassName}
                aria-hidden="true"
              />
              <span className="text-[10px] font-black">
                {isMetricsLoading ? LOADING_ELLIPSIS_LABEL : roiText}
              </span>
            </div>

            <StockLogo
              ticker={ma0Ticker}
              size="xl"
              shape="circle"
              paidAccent={PAID_STOCKS.includes(ma0Ticker)}
              showFallbackText
              dashboardCardText
              className="w-16 h-16 border-2 border-white/30 shadow-xl"
            />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-1">
              {portfolioName}
            </h3>
            <div className="flex items-center gap-2">
              <span className="inline-flex">{renderStrategyIcon(strategyKind)}</span>
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {strategyName}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_50px] gap-x-4 gap-y-6 items-start relative z-10 min-h-[140px] mr-[3px]">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {valuationLabel}
            </span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">
            {valuationText}
          </p>
        </div>

        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={onOpenAIImage}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={aiTradeRecognitionAria}
            >
              <div className="w-[50px] h-[50px] rounded-[1.25rem] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-md dark:shadow-[0_0_17px_rgba(255,255,255,0.25)]">
                <Camera size={28} className="text-white" strokeWidth={2} />
              </div>
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={onOpenAIImage}
              aria-label={aiTradeRecognitionAria}
              title={aiTradeRecognitionAria}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-transparent flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <div className="w-[50px] h-[50px] rounded-[1.25rem] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-md dark:shadow-[0_0_17px_rgba(255,255,255,0.25)]">
                <Camera size={28} className="text-white" strokeWidth={2} />
              </div>
            </button>
          )}
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {realizedProfitLabel}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500">
              {realizedProfitAfterFees}
            </span>
          </div>
          <p
            className={`text-2xl font-black tracking-tight leading-tight flex items-center gap-1 ${realizedProfitTextClassName}`}
          >
            <span className="text-[11px] flex items-center" aria-hidden="true">
              {realizedProfitIndicatorIcon}
            </span>
            <span>{realizedProfitText}</span>
          </p>
        </div>

        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={() => void onOpenQuickInput()}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={quickInputAria}
            >
              <Zap size={20} className="fill-current" />
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={() => void onOpenQuickInput()}
              aria-label={quickInputAria}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-blue-600/20 dark:bg-white/20 flex items-center justify-center text-blue-700 dark:text-white backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              <Zap size={20} className="fill-current" />
            </button>
          )}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={executionAriaLabel}
        onClick={onOpenExecution}
        onKeyDown={(event) => handlePressEnterOrSpace(event, onOpenExecution)}
        className="bg-blue-50/50 dark:bg-blue-600/15 rounded-[1.5rem] flex items-center justify-between shadow-md dark:shadow-lg dark:shadow-blue-500/20 relative overflow-visible group/action cursor-pointer border border-blue-100 dark:border-blue-500/20 min-h-[80px] p-5"
      >
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-white/10 opacity-0 group-hover/action:opacity-100 transition-opacity rounded-[1.5rem]" />
        <div className="relative z-10 flex-1 overflow-visible">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5 opacity-80">
            <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
              {t.dailyExecution}
            </span>
            <Info size={10} className="text-blue-700 dark:text-blue-300 shrink-0" />
          </div>
          {executionSummary}
        </div>
      </div>

      {isVrStrategy ? (
        <button
          type="button"
          onClick={onOpenVrOrders}
          disabled={!canOpenVrOrders}
          className={`mt-3 w-full py-2.5 text-[11px] font-black rounded-2xl transition-colors ${
            canOpenVrOrders
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
              : 'bg-slate-100/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {vrOrderButtonLabel}
        </button>
      ) : null}

      {isInTossApp ? (
        <TDSButton
          variant="tertiary"
          onClick={onClosePortfolio}
          className="w-full relative z-10"
        >
          {terminateLabel}
        </TDSButton>
      ) : (
        <button
          type="button"
          onClick={onClosePortfolio}
          className="w-full py-4 text-[10px] font-black bg-slate-50 dark:bg-transparent text-slate-500 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5 uppercase tracking-[0.2em] border border-slate-200 dark:border-white/10 rounded-2xl transition-all relative z-10"
        >
          {terminateLabel}
        </button>
      )}
    </div>
  );
});

PortfolioCardView.displayName = 'PortfolioCardView';

function DashboardHeader({
  isInTossApp,
  headerVm,
  totalValuationLabel,
  totalValuationChangeLabel,
  createLabel,
  onOpenCreator,
}: {
  isInTossApp: boolean;
  headerVm: DashboardHeaderVm;
  totalValuationLabel: string;
  totalValuationChangeLabel: string;
  createLabel: string;
  onOpenCreator: () => void;
}): React.ReactElement {
  let changeClassName = 'text-slate-400';
  if (headerVm.changeTone === 'positive') {
    changeClassName = 'text-emerald-500';
  } else if (headerVm.changeTone === 'negative') {
    changeClassName = 'text-rose-500';
  }

  const tossTitleStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography2',
    'Bold',
  );
  const tossCaptionStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography7',
    'Regular',
  );
  const tossValueStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography2',
    'Bold',
  );
  const tossChangePositiveColor = getConditionalColor(isInTossApp, 'success');
  const tossChangeNegativeColor = getConditionalColor(isInTossApp, 'error');
  const tossTextSecondaryColor = getConditionalColor(
    isInTossApp,
    'textSecondary',
  );

  const valuationLabelStyle = tossCaptionStyle
    ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined }
    : undefined;
  const valuationValueStyle = tossValueStyle
    ? { ...tossValueStyle, color: undefined }
    : undefined;

  let changeValueStyle = tossValueStyle ?? undefined;
  if (tossValueStyle != null && headerVm.changeTone !== 'neutral') {
    changeValueStyle = {
      ...tossValueStyle,
      color:
        headerVm.changeTone === 'positive'
          ? tossChangePositiveColor ?? undefined
          : tossChangeNegativeColor ?? undefined,
    };
  }

  return (
    <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
      <div className="max-w-2xl">
        <h1
          className={
            !isInTossApp
              ? 'text-4xl md:text-5xl font-extrabold tracking-tight dark:text-white mb-4 leading-[1.1]'
              : 'mb-4'
          }
          style={tossTitleStyle ?? undefined}
        >
          {headerVm.title}
        </h1>
        <p
          className={
            !isInTossApp
              ? 'text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed'
              : ''
          }
          style={
            isInTossApp && tossCaptionStyle
              ? {
                  ...tossCaptionStyle,
                  color: tossTextSecondaryColor ?? undefined,
                }
              : undefined
          }
        >
          {headerVm.subtitle}
        </p>
      </div>

      <div className="flex flex-col items-end gap-6 min-w-[280px]">
        <div className="flex items-center gap-8 px-2">
          <div className="flex flex-col items-end">
            <span
              className={
                !isInTossApp
                  ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'
                  : 'mb-1'
              }
              style={valuationLabelStyle}
            >
              {totalValuationLabel}
            </span>
            <span
              className={
                !isInTossApp
                  ? 'text-3xl font-black dark:text-white tracking-tighter'
                  : ''
              }
              style={valuationValueStyle}
            >
              {headerVm.totalValuationText}
            </span>
          </div>
          <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800" />
          <div className="flex flex-col items-end">
            <span
              className={
                !isInTossApp
                  ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'
                  : 'mb-1'
              }
              style={valuationLabelStyle}
            >
              {totalValuationChangeLabel}
            </span>
            <span
              className={
                !isInTossApp
                  ? `text-3xl font-black tracking-tighter ${changeClassName}`
                  : ''
              }
              style={changeValueStyle}
            >
              {headerVm.totalValuationChangeText}
            </span>
            <span
              className={
                !isInTossApp
                  ? `text-xs font-bold mt-0.5 ${changeClassName}`
                  : 'mt-0.5'
              }
              style={changeValueStyle}
            >
              {headerVm.totalValuationChangePctText}
            </span>
          </div>
        </div>

        {isInTossApp ? (
          <TDSButton
            variant="primary"
            onClick={onOpenCreator}
            className="flex items-center justify-center gap-2 !px-10"
          >
            <Plus size={18} strokeWidth={3} /> {createLabel}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={onOpenCreator}
            className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={3} /> {createLabel}
          </button>
        )}
      </div>
    </section>
  );
}

const Dashboard: React.FC<DashboardProps> = ({
  lang,
  portfolios,
  onClosePortfolio,
  onDeletePortfolio,
  onOpenCreator,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
  onDailyExecutionSummaryChange,
}) => {
  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const copy = getDashboardMessages(lang);
  const [dailyExecutionBlocks, setDailyExecutionBlocks] = useState<
    Record<string, string>
  >({});
  const lastDailyExecutionSummaryRef = useRef<string | null>(null);

  const setDailyExecutionBlockForId = useCallback(
    (id: string, block: string | null) => {
      setDailyExecutionBlocks((previous) => {
        const nextValue = block ?? '';
        if (previous[id] === nextValue) {
          return previous;
        }

        return {
          ...previous,
          [id]: nextValue,
        };
      });
    },
    [],
  );

  const handleOpenAlarm = useCallback(
    (portfolioId: string) => {
      onOpenAlarm(portfolioId);
    },
    [onOpenAlarm],
  );

  const handleOpenDetails = useCallback(
    (portfolioId: string) => {
      onOpenDetails(portfolioId);
    },
    [onOpenDetails],
  );

  const handleOpenQuickInput = useCallback(
    (portfolioId: string, activeSection?: 1 | 2 | 3) => {
      onOpenQuickInput(portfolioId, activeSection);
    },
    [onOpenQuickInput],
  );

  const handleOpenExecution = useCallback(
    (portfolioId: string, guideData?: TradeExecutionGuideData) => {
      onOpenExecution(portfolioId, guideData);
    },
    [onOpenExecution],
  );

  const handleOpenAIImage = useCallback(
    (portfolioId: string) => {
      onOpenAIImage(portfolioId);
    },
    [onOpenAIImage],
  );

  const handleClosePortfolio = useCallback(
    (portfolioId: string) => {
      onClosePortfolio(portfolioId);
    },
    [onClosePortfolio],
  );

  const handleDeletePortfolio = useCallback(
    (portfolioId: string) => {
      return onDeletePortfolio(portfolioId);
    },
    [onDeletePortfolio],
  );

  const alarmIds = useMemo(
    () =>
      portfolios
        .filter(
          (portfolio) =>
            portfolio.alarmconfig?.enabled === true &&
            (portfolio.alarmconfig.selectedHours?.length ?? 0) > 0,
        )
        .map((portfolio) => portfolio.id),
    [portfolios],
  );

  useEffect(() => {
    if (onDailyExecutionSummaryChange == null) {
      return;
    }

    if (alarmIds.length === 0) {
      if (lastDailyExecutionSummaryRef.current !== null) {
        lastDailyExecutionSummaryRef.current = null;
        onDailyExecutionSummaryChange(null);
      }
      return;
    }

    const blocks = alarmIds
      .map((portfolioId) => dailyExecutionBlocks[portfolioId])
      .filter(Boolean);

    if (blocks.length !== alarmIds.length) {
      return;
    }

    const summary = joinDailyExecutionBlocks(blocks);
    const nextSummary = summary || null;

    if (lastDailyExecutionSummaryRef.current === nextSummary) {
      return;
    }

    lastDailyExecutionSummaryRef.current = nextSummary;
    onDailyExecutionSummaryChange(nextSummary);
  }, [alarmIds, dailyExecutionBlocks, onDailyExecutionSummaryChange]);

  const headerVm: DashboardHeaderVm = {
    title: copy.portfolioTitle,
    subtitle: copy.portfolioSubtitle,
    totalValuationText: formatUsdValue(totalValuation, 0),
    totalValuationChangeText: formatSignedUsdValue(totalValuationChange),
    totalValuationChangePctText: formatSignedPercent(totalValuationChangePct),
    changeTone: getChangeTone(totalValuationChange),
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <DashboardHeader
        isInTossApp={isInTossApp}
        headerVm={headerVm}
        totalValuationLabel={t.totalValuation}
        totalValuationChangeLabel={t.gain24h}
        createLabel={copy.createLabel}
        onOpenCreator={onOpenCreator}
      />

      {portfolios.length === 0 ? (
        <section
          className={
            isInTossApp ? 'block' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
          }
        >
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
            <p className="text-slate-500">{copy.emptyPortfolio}</p>
          </div>
        </section>
      ) : (
        <section
          className={
            isInTossApp ? '' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
          }
        >
          {isInTossApp ? (
            <TDSList className="list-none p-0 m-0 space-y-4">
              {portfolios.map((portfolio) => (
                <TDSListRow
                  key={portfolio.id}
                  border="none"
                  verticalPadding="large"
                >
                  <DashboardPortfolioCardHost
                    lang={lang}
                    portfolio={portfolio}
                    onClosePortfolio={handleClosePortfolio}
                    onDeletePortfolio={handleDeletePortfolio}
                    onOpenAlarm={handleOpenAlarm}
                    onOpenDetails={handleOpenDetails}
                    onOpenQuickInput={handleOpenQuickInput}
                    onOpenExecution={handleOpenExecution}
                    onOpenAIImage={handleOpenAIImage}
                    onDailyExecutionBlock={
                      onDailyExecutionSummaryChange != null
                        ? setDailyExecutionBlockForId
                        : undefined
                    }
                  />
                </TDSListRow>
              ))}
            </TDSList>
          ) : (
            portfolios.map((portfolio) => (
              <DashboardPortfolioCardHost
                key={portfolio.id}
                lang={lang}
                portfolio={portfolio}
                onClosePortfolio={handleClosePortfolio}
                onDeletePortfolio={handleDeletePortfolio}
                onOpenAlarm={handleOpenAlarm}
                onOpenDetails={handleOpenDetails}
                onOpenQuickInput={handleOpenQuickInput}
                onOpenExecution={handleOpenExecution}
                onOpenAIImage={handleOpenAIImage}
                onDailyExecutionBlock={
                  onDailyExecutionSummaryChange != null
                    ? setDailyExecutionBlockForId
                    : undefined
                }
              />
            ))
          )}
        </section>
      )}
    </div>
  );
};

export default Dashboard;