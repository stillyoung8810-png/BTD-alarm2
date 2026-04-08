import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import {
  Plus,
  Zap,
  Info,
  TrendingUp,
  Layers,
  Camera,
  Target,
} from 'lucide-react';
import type { AppLang, Portfolio, Strategy } from '../types';
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
import { useTossApp } from '../contexts/TossAppContext';
import {
  calculateYield,
  calculateCurrentValuation,
  determineActiveSection,
  calculateHoldings,
  getMAValuesForAlignment,
} from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import {
  formatPortfolioDailyExecutionBlock,
  getVrDailyExecutionCycleHeaderLabel,
  joinDailyExecutionBlocks,
} from '../utils/dailyExecutionSummary';
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
  onUpdatePortfolio: (updated: Portfolio) => Promise<void> | void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (
    id: string,
    activeSection?: 1 | 2 | 3,
  ) => Promise<void> | void;
  onOpenExecution: (id: string) => void;
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
  onUpdatePortfolio: (updated: Portfolio) => Promise<void> | void;
  onOpenAlarm: (portfolioId: string) => void;
  onOpenDetails: (portfolioId: string) => void;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => void | Promise<void>;
  onOpenExecution: (portfolioId: string) => void;
  onOpenAIImage: (portfolioId: string) => void;
  onDailyExecutionBlock?: (id: string, block: string | null) => void;
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
  isYieldPositive: boolean;
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
  strategyKind: DashboardStrategyKind;
  strategy: Strategy;
  trades: Portfolio['trades'];
  vrSnapshot: Portfolio['vrSnapshot'];
  vrSettings: Portfolio['strategy']['vrBand'] | null;
  multiSplitCurrentRound: number;
  multiSplitPhase: 'first' | 'second' | 'quarter' | null;
  multiSplitIsInQuarterMode: boolean;
  multiSplitIsInQuarterModeByT: boolean;
  multiSplitInsufficientAmount: boolean;
  multiSplitQuarterStopLossData:
    ReturnType<typeof useMultiSplitExecution>['quarterStopLossData'];
  multiSplitExecutionData:
    ReturnType<typeof useMultiSplitExecution>['multiSplitExecutionData'];
  noStopCurrentRound: number;
  noStopExecutionData:
    ReturnType<typeof useNoStopMultiSplitExecution>['executionData'];
  maActiveSection: 1 | 2 | 3 | null;
  maPartialProfitLines: MaPartialProfitLine[];
  maRsiNotMet: boolean;
  maAlignmentNotMet: boolean;
  vrCycleHeaderLabel: string | null;
}

type PartialProfitSectionConfig =
  | Strategy['ma1']
  | Strategy['ma2']
  | Strategy['ma3'];

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

function getChangeTone(value: number): DashboardChangeTone {
  const rounded = getRounded(value);
  if (rounded > 0) {
    return 'positive';
  }
  if (rounded < 0) {
    return 'negative';
  }
  return 'neutral';
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
  holdings: ReturnType<typeof calculateHoldings>;
  prices: Awaited<ReturnType<typeof fetchStockPrices>>;
}): MaPartialProfitLine | null {
  const { section, config, holdings, prices } = input;

  if (
    config?.takePartialProfit !== true ||
    config.partialProfitTargetPct == null ||
    config.partialProfitTargetPct <= 0
  ) {
    return null;
  }

  const holding = holdings.find((item) => item.stock === config.stock);
  if (holding == null || holding.quantity <= 0 || holding.avgPrice <= 0) {
    return null;
  }

  const currentPrice = prices[config.stock]?.price ?? 0;
  if (currentPrice <= 0) {
    return null;
  }

  const yieldPct = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
  if (yieldPct < config.partialProfitTargetPct) {
    return null;
  }

  return {
    section,
    stock: config.stock,
    quantity: holding.quantity,
  };
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
    | 'copy'
    | 'multiSplitCurrentRound'
    | 'multiSplitPhase'
    | 'multiSplitIsInQuarterMode'
    | 'multiSplitQuarterStopLossData'
    | 'multiSplitExecutionData'
    | 'multiSplitInsufficientAmount'
  >,
): React.ReactNode {
  const {
    copy,
    multiSplitCurrentRound,
    multiSplitPhase,
    multiSplitIsInQuarterMode,
    multiSplitQuarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  } = input;
  const ex = copy.execution;

  if (multiSplitInsufficientAmount) {
    return (
      <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-500/30">
        {ex.insufficientAmount}
      </div>
    );
  }

  if (multiSplitIsInQuarterMode) {
    if (multiSplitQuarterStopLossData == null) {
      return <span>{ex.calculating}</span>;
    }

    if (!multiSplitQuarterStopLossData.hasMOC) {
      return (
        <div className="space-y-1">
          <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
            <span className="font-black">{ex.mocSellLabel}:</span>{' '}
            {formatShareQuantity(multiSplitQuarterStopLossData.mocQuantity ?? 0)}{' '}
            {ex.sharesUnit}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            {ex.startQuarterStopLoss}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
        <div>
          <span className="font-black">{ex.firstBuyAmountLabel}:</span>{' '}
          {multiSplitQuarterStopLossData.newOneTimeAmount != null
            ? formatUsdValue(multiSplitQuarterStopLossData.newOneTimeAmount)
            : formatUsdValue(0)}
        </div>
        {multiSplitQuarterStopLossData.locBuy != null ? (
          <div>
            <span className="font-black">{ex.locBuy1}:</span>{' '}
            {formatUsdValue(multiSplitQuarterStopLossData.locBuy.price)} /{' '}
            {multiSplitQuarterStopLossData.locBuy.quantity}
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              ({ex.avgPriceTimesPointNineMinusOffset})
            </div>
          </div>
        ) : null}
        {multiSplitQuarterStopLossData.locSell != null ? (
          <div>
            <span className="font-black">{ex.locSell}:</span>{' '}
            {formatUsdValue(multiSplitQuarterStopLossData.locSell.price)} /{' '}
            {multiSplitQuarterStopLossData.locSell.quantity}
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              ({ex.avgPriceTimesPointNine})
            </div>
          </div>
        ) : null}
        {multiSplitQuarterStopLossData.limitSell != null ? (
          <div>
            <span className="font-black">{ex.limitSell}:</span>{' '}
            {formatUsdValue(multiSplitQuarterStopLossData.limitSell.price)} /{' '}
            {multiSplitQuarterStopLossData.limitSell.quantity}
          </div>
        ) : null}
      </div>
    );
  }

  if (multiSplitExecutionData == null) {
    return (
      <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-medium">
        {multiSplitPhase == null ? ex.strategyPreparing : ex.calculating}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
      <div className="font-black">T = {multiSplitCurrentRound.toFixed(2)}</div>
      {multiSplitExecutionData.locBuy1 != null ? (
        <div>
          <span className="font-black">{ex.locBuy1}:</span>{' '}
          {formatUsdValue(multiSplitExecutionData.locBuy1.price)} /{' '}
          {multiSplitExecutionData.locBuy1.quantity}
        </div>
      ) : null}
      {multiSplitExecutionData.locBuy2 != null ? (
        <div>
          <span className="font-black">{ex.locBuy2}:</span>{' '}
          {formatUsdValue(multiSplitExecutionData.locBuy2.price)} /{' '}
          {multiSplitExecutionData.locBuy2.quantity}
        </div>
      ) : null}
      {multiSplitExecutionData.locSell != null ? (
        <div>
          <span className="font-black">{ex.locSell}:</span>{' '}
          {formatUsdValue(multiSplitExecutionData.locSell.price)} /{' '}
          {multiSplitExecutionData.locSell.quantity}
        </div>
      ) : (
        <div>
          {ex.locSell}: {ex.noHoldings}
        </div>
      )}
      {multiSplitExecutionData.limitSell != null ? (
        <div>
          <span className="font-black">{ex.limitSell}:</span>{' '}
          {formatUsdValue(multiSplitExecutionData.limitSell.price)} /{' '}
          {multiSplitExecutionData.limitSell.quantity}
        </div>
      ) : (
        <div>
          {ex.limitSell}: {ex.noHoldings}
        </div>
      )}
    </div>
  );
}

function renderNoStopExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'copy' | 'noStopCurrentRound' | 'noStopExecutionData'
  >,
): React.ReactNode {
  const { copy, noStopCurrentRound, noStopExecutionData } = input;
  const ex = copy.execution;

  if (noStopExecutionData == null) {
    return <span>{ex.calculating}</span>;
  }

  if (noStopExecutionData.isSplitComplete) {
    return (
      <div className="space-y-2">
        <div className="font-black text-blue-900 dark:text-white">
          {ex.noStopSplitComplete}
        </div>
        {noStopExecutionData.takeProfit != null ? (
          <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
            <span className="font-black">{ex.noStopTakeProfitTarget}:</span>{' '}
            {formatUsdValue(noStopExecutionData.takeProfit.price)} /{' '}
            {noStopExecutionData.takeProfit.quantity}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
      <div className="font-black">T = {noStopCurrentRound.toFixed(2)}</div>
      {noStopExecutionData.lowLoc != null ? (
        <div>
          <span className="font-black">{ex.lowLoc}:</span>{' '}
          {formatUsdValue(noStopExecutionData.lowLoc.price)} /{' '}
          {noStopExecutionData.lowLoc.quantity}
        </div>
      ) : null}
      {noStopExecutionData.highLoc != null ? (
        <div>
          <span className="font-black">{ex.highLoc}:</span>{' '}
          {formatUsdValue(noStopExecutionData.highLoc.price)} /{' '}
          {noStopExecutionData.highLoc.quantity}
        </div>
      ) : null}
      {noStopExecutionData.takeProfit != null ? (
        <div>
          <span className="font-black">{ex.noStopTakeProfitTarget}:</span>{' '}
          {formatUsdValue(noStopExecutionData.takeProfit.price)} /{' '}
          {noStopExecutionData.takeProfit.quantity}
        </div>
      ) : null}
    </div>
  );
}

function buildPortfolioExecutionSummary(
  input: PortfolioExecutionSummaryInput,
): React.ReactNode {
  switch (input.strategyKind) {
    case 'vr_band':
      return renderVrExecutionSummary(input);
    case 'multi_split':
      return renderMultiSplitExecutionSummary(input);
    case 'no_stop_multi_split':
      return renderNoStopExecutionSummary(input);
    case 'ma_interval':
      return renderMaExecutionSummary(input);
    default: {
      const exhaustiveCheck: never = input.strategyKind;
      return exhaustiveCheck;
    }
  }
}

function DashboardPortfolioCardHost({
  lang,
  portfolio,
  onClosePortfolio,
  onDeletePortfolio,
  onUpdatePortfolio,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  onDailyExecutionBlock,
}: DashboardPortfolioCardHostProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const copy = getDashboardMessages(lang);
  const portfolioId = portfolio.id;
  const portfolioName = portfolio.name;
  const isAlarmEnabled = portfolio.alarmconfig?.enabled === true;
  const strategyKind = getPortfolioStrategyKind(portfolio);
  const vrSettings = portfolio.strategy.vrBand ?? null;
  const vrCycleHeaderLabel = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);

  const multiSplitVm = useMultiSplitExecution(portfolio, lang);
  const noStopVm = useNoStopMultiSplitExecution(portfolio, lang);

  const multiSplitCurrentRound = multiSplitVm.currentRound;
  const multiSplitPhase = multiSplitVm.multiSplitPhase;
  const multiSplitIsInQuarterMode = multiSplitVm.isInQuarterMode;
  const multiSplitIsInQuarterModeByT = multiSplitVm.isInQuarterModeByT;
  const multiSplitInsufficientAmount = multiSplitVm.multiSplitInsufficientAmount;
  const multiSplitQuarterStopLossData = multiSplitVm.quarterStopLossData;
  const multiSplitExecutionData = multiSplitVm.multiSplitExecutionData;

  const noStopCurrentRound = noStopVm.currentRound;
  const noStopExecutionData = noStopVm.executionData;

  const [investedAmount, setInvestedAmount] = useState(0);
  const [yieldRate, setYieldRate] = useState(0);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);
  const [maActiveSection, setMaActiveSection] = useState<1 | 2 | 3 | null>(
    null,
  );
  const [maBlockVersion, setMaBlockVersion] = useState(0);
  const [maPartialProfitLines, setMaPartialProfitLines] = useState<
    MaPartialProfitLine[]
  >([]);
  const [maRsiNotMet, setMaRsiNotMet] = useState(false);
  const [maAlignmentNotMet, setMaAlignmentNotMet] = useState(false);
  const [isVrOrderModalOpen, setIsVrOrderModalOpen] = useState(false);
  const quarterModeUpdateSentRef = useRef(false);

  const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);

  const isMultiSplitStrategy = portfolio.strategy.multiSplit != null;
  const isNoStopMultiSplitStrategy =
    portfolio.strategy.noStopMultiSplit != null;
  const isVrStrategy = vrSettings != null;

  const ma0Ticker =
    portfolio.strategy.multiSplit?.targetStock ||
    portfolio.strategy.noStopMultiSplit?.targetStock ||
    (isVrStrategy ? 'TQQQ' : portfolio.strategy.ma0?.stock) ||
    'TQQQ';

  useEffect(() => {
    if (portfolio.isQuarterMode === false) {
      quarterModeUpdateSentRef.current = false;
    }
  }, [portfolio.isQuarterMode]);

  useEffect(() => {
    if (
      portfolio.strategy.multiSplit == null ||
      !multiSplitIsInQuarterModeByT ||
      portfolio.isQuarterMode === true ||
      quarterModeUpdateSentRef.current
    ) {
      return;
    }

    quarterModeUpdateSentRef.current = true;
    void Promise.resolve(
      onUpdatePortfolio({
        ...portfolio,
        isQuarterMode: true,
      }),
    );
  }, [
    portfolio,
    portfolio.isQuarterMode,
    portfolio.strategy.multiSplit,
    multiSplitIsInQuarterModeByT,
    onUpdatePortfolio,
  ]);

  useEffect(() => {
    if (isMultiSplitStrategy || isNoStopMultiSplitStrategy || isVrStrategy) {
      setMaActiveSection(null);
      setMaRsiNotMet(false);
      setMaAlignmentNotMet(false);
      setMaPartialProfitLines([]);
      return;
    }

    let isCancelled = false;

    const runAnalysis = async () => {
      try {
        const nextSection = await determineActiveSection(portfolio);
        if (isCancelled) {
          return;
        }

        setMaActiveSection((previous) =>
          previous === nextSection ? previous : nextSection,
        );

        if (nextSection != null) {
          setMaBlockVersion((previous) => previous + 1);
        }

        if (nextSection !== 1 && nextSection !== 2 && nextSection !== 3) {
          setMaRsiNotMet(false);
          setMaAlignmentNotMet(false);
          setMaPartialProfitLines([]);
          return;
        }

        const ma0 = portfolio.strategy.ma0;
        const ma1 = portfolio.strategy.ma1;
        const ma2 = portfolio.strategy.ma2;
        const ma3 = portfolio.strategy.ma3;
        const baseStock = ma0.stock;
        const symbolsToFetch = Array.from(
          new Set([baseStock, ma1.stock, ma2.stock, ma3.stock].filter(Boolean)),
        );

        const prices = await fetchStockPrices(symbolsToFetch);
        if (isCancelled) {
          return;
        }

        if (ma0.rsiEnabled) {
          const threshold =
            nextSection === 1
              ? ma1.rsiThreshold
              : nextSection === 2
              ? ma2.rsiThreshold
              : ma3.rsiThreshold;
          const currentRsi = prices[baseStock]?.rsi ?? 50;
          setMaRsiNotMet(threshold != null && currentRsi > threshold);
        } else {
          setMaRsiNotMet(false);
        }

        if (ma0.alignmentEnabled) {
          const { maA, maB } = await getMAValuesForAlignment(portfolio);
          if (!isCancelled) {
            setMaAlignmentNotMet(maA <= maB);
          }
        } else {
          setMaAlignmentNotMet(false);
        }

        const holdings = calculateHoldings(portfolio);
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
      } catch (error: unknown) {
        console.warn('[DashboardPortfolioCardHost:runAnalysis] failed', error);
      }
    };

    void runAnalysis();
    return () => {
      isCancelled = true;
    };
  }, [portfolio, isMultiSplitStrategy, isNoStopMultiSplitStrategy, isVrStrategy]);

  useEffect(() => {
    let isCancelled = false;

    const updateMetrics = async () => {
      setIsMetricsLoading(true);

      try {
        const holdings = calculateHoldings(portfolio);
        const [valuation, nextYield] = await Promise.all([
          calculateCurrentValuation(portfolio),
          calculateYield(portfolio),
        ]);
        const totalRealizedPnL = holdings.reduce(
          (sum, holding) => sum + (holding.realizedPnL ?? 0),
          0,
        );

        if (isCancelled) {
          return;
        }

        setInvestedAmount(valuation);
        setYieldRate(nextYield);
        setRealizedProfit(totalRealizedPnL);
      } catch (error: unknown) {
        console.error('[DashboardPortfolioCardHost:updateMetrics] failed', error);
      } finally {
        if (!isCancelled) {
          setIsMetricsLoading(false);
        }
      }
    };

    void updateMetrics();
    return () => {
      isCancelled = true;
    };
  }, [portfolio]);

  useEffect(() => {
    if (onDailyExecutionBlock == null) {
      return;
    }

    if (!isAlarmEnabled) {
      onDailyExecutionBlock(portfolioId, null);
      return;
    }

    const multiSplitOverLimit =
      portfolio.strategy.multiSplit != null &&
      portfolio.strategy.multiSplit.totalSplitCount > 0 &&
      multiSplitCurrentRound > portfolio.strategy.multiSplit.totalSplitCount;

    if (
      portfolio.strategy.multiSplit != null &&
      !multiSplitOverLimit &&
      multiSplitExecutionData == null &&
      !multiSplitInsufficientAmount
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
      maBlockVersion === 0
    ) {
      return;
    }

    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      quarterStopLossData: multiSplitQuarterStopLossData ?? undefined,
      noStopMultiSplitExecutionData: noStopExecutionData ?? undefined,
      multiSplitPhase: multiSplitPhase ?? null,
      isQuarterStopLossActive: multiSplitIsInQuarterMode,
      multiSplitOverLimit,
      multiSplitFirstRoundHint:
        portfolio.strategy.multiSplit != null &&
        multiSplitCurrentRound >= 0 &&
        multiSplitCurrentRound < 0.5,
      multiSplitInsufficientAmount:
        portfolio.strategy.multiSplit != null
          ? multiSplitInsufficientAmount
          : undefined,
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

    onDailyExecutionBlock(portfolioId, block);
  }, [
    onDailyExecutionBlock,
    isAlarmEnabled,
    portfolio,
    portfolioId,
    lang,
    multiSplitCurrentRound,
    multiSplitPhase,
    multiSplitIsInQuarterMode,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
    multiSplitQuarterStopLossData,
    noStopExecutionData,
    maActiveSection,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
    maBlockVersion,
    isMultiSplitStrategy,
    isNoStopMultiSplitStrategy,
    isVrStrategy,
  ]);

  const executionSummary = useMemo(
    () =>
      buildPortfolioExecutionSummary({
        lang,
        copy,
        strategyKind,
        strategy: portfolio.strategy,
        trades: portfolio.trades,
        vrSnapshot: portfolio.vrSnapshot,
        vrSettings,
        multiSplitCurrentRound,
        multiSplitPhase,
        multiSplitIsInQuarterMode,
        multiSplitIsInQuarterModeByT,
        multiSplitInsufficientAmount,
        multiSplitQuarterStopLossData,
        multiSplitExecutionData,
        noStopCurrentRound,
        noStopExecutionData,
        maActiveSection,
        maPartialProfitLines,
        maRsiNotMet,
        maAlignmentNotMet,
        vrCycleHeaderLabel,
      }),
    [
      lang,
      copy,
      strategyKind,
      portfolio.strategy,
      portfolio.trades,
      portfolio.vrSnapshot,
      vrSettings,
      multiSplitCurrentRound,
      multiSplitPhase,
      multiSplitIsInQuarterMode,
      multiSplitIsInQuarterModeByT,
      multiSplitInsufficientAmount,
      multiSplitQuarterStopLossData,
      multiSplitExecutionData,
      noStopCurrentRound,
      noStopExecutionData,
      maActiveSection,
      maPartialProfitLines,
      maRsiNotMet,
      maAlignmentNotMet,
      vrCycleHeaderLabel,
    ],
  );

  const handleOpenDetails = useCallback(() => {
    onOpenDetails(portfolioId);
  }, [onOpenDetails, portfolioId]);

  const handleOpenExecution = useCallback(() => {
    onOpenExecution(portfolioId);
  }, [onOpenExecution, portfolioId]);

  const isOpeningQuickInputRef = useRef(false);

  const handleOpenQuickInput = useCallback(async (): Promise<void> => {
    if (isOpeningQuickInputRef.current) {
      return;
    }
    isOpeningQuickInputRef.current = true;

    try {
      const activeSection = await determineActiveSection(portfolio);
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
  }, [copy.systemError, onOpenQuickInput, portfolio, portfolioId]);

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

  const loadingLabel = '...';
  const cardVm = {
    detailsAriaLabel: copy.openDetailsAria(portfolioName),
    executionAriaLabel: copy.openExecutionAria(portfolioName),
    valuationText: isMetricsLoading
      ? loadingLabel
      : formatUsdValue(investedAmount, 2),
    realizedProfitText: isMetricsLoading
      ? loadingLabel
      : formatSignedUsdValue(realizedProfit, 2),
    roiText: isMetricsLoading
      ? loadingLabel
      : formatSignedPercent(yieldRate, 1),
    isYieldPositive: isMetricsLoading ? true : getRounded(yieldRate, 1) >= 0,
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
        isYieldPositive={cardVm.isYieldPositive}
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
  isYieldPositive,
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
  const roiBadgeClassName = isYieldPositive
    ? 'bg-emerald-500 text-white'
    : 'bg-rose-500 text-white';

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
                className={isYieldPositive ? '' : 'rotate-180'}
              />
              <span className="text-[10px] font-black">
                {isMetricsLoading ? '...' : roiText}
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
            className={`text-2xl font-black tracking-tight leading-tight flex items-center gap-1 ${
              isYieldPositive ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            <span className="text-[11px]">{isYieldPositive ? '↑' : '↓'}</span>
            {realizedProfitText}
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
  onUpdatePortfolio,
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
    (portfolioId: string) => {
      onOpenExecution(portfolioId);
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
                    onUpdatePortfolio={onUpdatePortfolio}
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
                onUpdatePortfolio={onUpdatePortfolio}
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