import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Portfolio } from '../types';
import { I18N, PAID_STOCKS } from '../constants';
import StockLogo from './StockLogo';
import {
  Plus,
  Zap,
  Info,
  Bell,
  BellOff,
  Trash2,
  TrendingUp,
  Layers,
  Camera,
} from 'lucide-react';
import { calculateInvestedAmount, calculateYield, determineActiveSection, calculateAlreadyRealized, calculateHoldings, getMaPeriods, getMAValuesForAlignment } from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import HoverTip from './HoverTip';
import { formatPortfolioDailyExecutionBlock, joinDailyExecutionBlocks } from '../utils/dailyExecutionSummary';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSButton, TDSList, TDSListRow } from './tds';
import { getConditionalTypographyStyle, getConditionalColor } from '../utils/tossStyleHelpers';
// 🚀 스마트 배너 컴포넌트 임포트
import { TossInlineBanner } from './TossInlineBanner';

interface DashboardProps {
  lang: 'ko' | 'en';
  portfolios: Portfolio[];
  currentTier: 'free' | 'pro' | 'premium';
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => void;
  onUpdatePortfolio: (updated: Portfolio) => void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (id: string, activeSection?: 1 | 2 | 3) => void;
  onOpenExecution: (id: string) => void;
  onOpenAIImage: (id: string) => void;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;
  onDailyExecutionSummaryChange?: (summaryText: string | null) => void;
}

interface DashboardViewProps extends DashboardProps {
  isInTossApp: boolean;
  normalizedTier: 'free' | 'pro' | 'premium';
  setDailyExecutionBlockForId?: (id: string, block: string | null) => void;
}

const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    lang,
    portfolios,
    currentTier,
    totalValuation,
    totalValuationChange,
    totalValuationChangePct,
    onDailyExecutionSummaryChange,
    ...rest
  } = props;

  const [dailyExecutionBlocks, setDailyExecutionBlocks] = useState<Record<string, string>>({});
  const lastDailyExecutionSummaryRef = useRef<string | null>(null);

  const setDailyExecutionBlockForId = useCallback((id: string, block: string | null) => {
    setDailyExecutionBlocks((prev) => {
      const nextValue = block ?? '';
      if (prev[id] === nextValue) return prev;
      return { ...prev, [id]: nextValue };
    });
  }, []);

  const alarmIds = useMemo(
    () =>
      portfolios
        .filter((p) => p.alarmconfig?.enabled && (p.alarmconfig.selectedHours?.length || 0) > 0)
        .map((p) => p.id),
    [portfolios]
  );

  const alarmIdsKey = useMemo(() => alarmIds.join(','), [alarmIds]);

  useEffect(() => {
    if (!onDailyExecutionSummaryChange) return;
    if (alarmIds.length === 0) {
      if (lastDailyExecutionSummaryRef.current !== null) {
        lastDailyExecutionSummaryRef.current = null;
        onDailyExecutionSummaryChange(null);
      }
      return;
    }
    const blocks = alarmIds.map((id) => dailyExecutionBlocks[id]).filter(Boolean);
    if (blocks.length !== alarmIds.length) return;

    const summary = joinDailyExecutionBlocks(blocks);
    const next = summary || null;

    if (lastDailyExecutionSummaryRef.current === next) return;
    lastDailyExecutionSummaryRef.current = next;
    onDailyExecutionSummaryChange(next);
  }, [alarmIdsKey, dailyExecutionBlocks, onDailyExecutionSummaryChange]);

  const { isInTossApp } = useTossApp();
  const normalizedTier = (currentTier ?? 'free') as 'free' | 'pro' | 'premium';

  const viewProps: DashboardViewProps = {
    ...rest,
    lang,
    portfolios,
    currentTier,
    totalValuation,
    totalValuationChange,
    totalValuationChangePct,
    onDailyExecutionSummaryChange,
    isInTossApp,
    normalizedTier,
    setDailyExecutionBlockForId: onDailyExecutionSummaryChange ? setDailyExecutionBlockForId : undefined,
  };

  return isInTossApp ? <DashboardToss {...viewProps} /> : <DashboardWeb {...viewProps} />;
};

const DashboardWeb: React.FC<DashboardViewProps> = ({
  lang,
  portfolios,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
  onOpenCreator,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  onClosePortfolio,
  onDeletePortfolio,
  onUpdatePortfolio,
  setDailyExecutionBlockForId,
}) => {
  const t = I18N[lang];
  const isPositiveChange = totalValuationChange >= 0;
  const changeColor =
    totalValuationChange === 0
      ? 'text-slate-400'
      : isPositiveChange
      ? 'text-emerald-500'
      : 'text-rose-500';

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight dark:text-white mb-4 leading-[1.1]">
            {t.portfolioMgmt}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed">
            {t.systematicAccumulation}
          </p>
        </div>

        <div className="flex flex-col items-end gap-6 min-w-[280px]">
          <div className="flex items-center gap-8 px-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t.totalValuation}
              </span>
              <span className="text-3xl font-black dark:text-white tracking-tighter">
                ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t.gain24h}
              </span>
              <span className={`text-3xl font-black tracking-tighter ${changeColor}`}>
                {totalValuationChange === 0
                  ? '$0.00'
                  : `${isPositiveChange ? '+' : '-'}$${Math.abs(totalValuationChange).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </span>
              <span className={`text-xs font-bold mt-0.5 ${changeColor}`}>
                {Number.isNaN(totalValuationChangePct)
                  ? '-'
                  : `${totalValuationChangePct >= 0 ? '+' : ''}${totalValuationChangePct.toFixed(2)}%`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCreator}
            className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
          </button>
        </div>
      </section>

      {portfolios.length === 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
            <p className="text-slate-500">
              {lang === 'ko'
                ? '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.'
                : 'No portfolios. Please add a portfolio.'}
            </p>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {portfolios.map((p) => (
            <PortfolioCard
              key={p.id}
              portfolio={p}
              lang={lang}
              onOpenAlarm={() => onOpenAlarm(p.id)}
              onOpenDetails={() => onOpenDetails(p.id)}
              onOpenQuickInput={async () => {
                const activeSection = await determineActiveSection(p);
                onOpenQuickInput(p.id, activeSection || undefined);
              }}
              onOpenExecution={() => onOpenExecution(p.id)}
              onOpenAIImage={() => onOpenAIImage(p.id)}
              onClose={() => onClosePortfolio(p.id)}
              onDelete={() => onDeletePortfolio(p.id)}
              onUpdatePortfolio={onUpdatePortfolio}
              onDailyExecutionBlock={setDailyExecutionBlockForId}
            />
          ))}
        </section>
      )}
    </div>
  );
};

const DashboardToss: React.FC<DashboardViewProps> = ({
  lang,
  portfolios,
  currentTier,
  normalizedTier,
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
  setDailyExecutionBlockForId,
}) => {
  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const isPositiveChange = totalValuationChange >= 0;
  const changeColor =
    totalValuationChange === 0
      ? 'text-slate-400'
      : isPositiveChange
      ? 'text-emerald-500'
      : 'text-rose-500';

  const isFreeTier = normalizedTier === 'free';

  const shouldRenderBetweenBanner = isInTossApp && isFreeTier && portfolios.length >= 2;
  const shouldRenderBottomBanner = isInTossApp && isFreeTier;

  type PortfolioListItem =
    | { type: 'portfolio'; portfolio: Portfolio }
    | { type: 'banner'; id: 'between' | 'bottom' };

  const listItems: PortfolioListItem[] = useMemo(() => {
    if (!isInTossApp || !isFreeTier) {
      return portfolios.map((p) => ({ type: 'portfolio', portfolio: p }));
    }

    if (portfolios.length === 0) return [];

    const items: PortfolioListItem[] = [];
    portfolios.forEach((p, index) => {
      items.push({ type: 'portfolio', portfolio: p });
      if (index === 0 && shouldRenderBetweenBanner) {
        items.push({ type: 'banner', id: 'between' });
      }
    });

    if (shouldRenderBottomBanner) {
      items.push({ type: 'banner', id: 'bottom' });
    }
    return items;
  }, [isInTossApp, isFreeTier, portfolios, shouldRenderBetweenBanner, shouldRenderBottomBanner]);

  const tossTitleStyle = getConditionalTypographyStyle(isInTossApp, 'Typography2', 'Bold');
  const tossCaptionStyle = getConditionalTypographyStyle(isInTossApp, 'Typography7', 'Regular');
  const tossValueStyle = getConditionalTypographyStyle(isInTossApp, 'Typography2', 'Bold');
  const tossChangePositiveColor = getConditionalColor(isInTossApp, 'success');
  const tossChangeNegativeColor = getConditionalColor(isInTossApp, 'error');
  const tossTextSecondaryColor = getConditionalColor(isInTossApp, 'textSecondary');

  const valuationLabelStyle = tossCaptionStyle
    ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined }
    : undefined;
  const valuationValueStyle = tossValueStyle ? { ...tossValueStyle, color: undefined } : undefined;
  const changeValueStyle =
    tossValueStyle && totalValuationChange !== 0
      ? {
          ...tossValueStyle,
          color: isPositiveChange
            ? tossChangePositiveColor ?? undefined
            : tossChangeNegativeColor ?? undefined,
        }
      : tossValueStyle;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
        <div className="max-w-2xl">
          <h1 className="mb-4" style={tossTitleStyle ?? undefined}>
            {t.portfolioMgmt}
          </h1>
          <p
            className=""
            style={
              isInTossApp && tossCaptionStyle
                ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined }
                : undefined
            }
          >
            {t.systematicAccumulation}
          </p>
        </div>

        <div className="flex flex-col items-end gap-6 min-w-[280px]">
          <div className="flex items-center gap-8 px-2">
            <div className="flex flex-col items-end">
              <span className="mb-1" style={valuationLabelStyle}>
                {t.totalValuation}
              </span>
              <span style={valuationValueStyle}>
                ${totalValuation.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800" />
            <div className="flex flex-col items-end">
              <span className="mb-1" style={valuationLabelStyle}>
                {t.gain24h}
              </span>
              <span style={changeValueStyle}>
                {totalValuationChange === 0
                  ? '$0.00'
                  : `${isPositiveChange ? '+' : '-'}$${Math.abs(totalValuationChange).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}`}
              </span>
              <span style={changeValueStyle}>
                {Number.isNaN(totalValuationChangePct)
                  ? '-'
                  : `${totalValuationChangePct >= 0 ? '+' : ''}${totalValuationChangePct.toFixed(2)}%`}
              </span>
            </div>
          </div>

          <TDSButton
            variant="primary"
            onClick={() => onOpenCreator()}
            className="flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
          </TDSButton>
        </div>
      </section>

      {portfolios.length === 0 ? (
        <section className="block">
          <div className="glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
            <p className="text-slate-500">
              {lang === 'ko'
                ? '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.'
                : 'No portfolios. Please add a portfolio.'}
            </p>
          </div>
          <TossInlineBanner currentTier={currentTier} isInTossApp={isInTossApp} variant="card" />
        </section>
      ) : (
        <section>
          <TDSList className="list-none p-0 m-0 space-y-4">
            {listItems.map((item) => {
              if (item.type === 'portfolio') {
                const p = item.portfolio;
                return (
                  <TDSListRow key={p.id} border="none" verticalPadding="large">
                    <PortfolioCard
                      portfolio={p}
                      lang={lang}
                      onOpenAlarm={() => onOpenAlarm(p.id)}
                      onOpenDetails={() => onOpenDetails(p.id)}
                      onOpenQuickInput={async () => {
                        const activeSection = await determineActiveSection(p);
                        onOpenQuickInput(p.id, activeSection || undefined);
                      }}
                      onOpenExecution={() => onOpenExecution(p.id)}
                      onOpenAIImage={() => onOpenAIImage(p.id)}
                      onClose={() => onClosePortfolio(p.id)}
                      onDelete={() => onDeletePortfolio(p.id)}
                      onUpdatePortfolio={onUpdatePortfolio}
                      onDailyExecutionBlock={setDailyExecutionBlockForId}
                    />
                  </TDSListRow>
                );
              }

              return (
                <TDSListRow
                  key={item.id === 'between' ? 'ad-slot-between' : 'ad-slot-bottom'}
                  border="none"
                  verticalPadding="small"
                >
                  <TossInlineBanner currentTier={currentTier} isInTossApp={isInTossApp} variant="card" />
                </TDSListRow>
              );
            })}
          </TDSList>
        </section>
      )}
    </div>
  );
};

// PortfolioCard 컴포넌트 내부의 TDSButton onClick 타입 에러도 모두 수정했습니다.
const PortfolioCard: React.FC<{ 
  portfolio: Portfolio; 
  onClose: () => void;
  onDelete: () => void;
  onOpenAlarm: () => void;
  onOpenDetails: () => void;
  onOpenQuickInput: () => void;
  onOpenExecution: () => void;
  onOpenAIImage: () => void;
  onUpdatePortfolio: (updated: Portfolio) => void;
  lang: 'ko' | 'en';
  onDailyExecutionBlock?: (id: string, block: string | null) => void;
}> = ({ portfolio, onClose, onDelete, onOpenAlarm, onOpenDetails, onOpenQuickInput, onOpenExecution, onOpenAIImage, onUpdatePortfolio, lang, onDailyExecutionBlock }) => {
  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const ma0Ticker = portfolio.strategy.multiSplit?.targetStock || portfolio.strategy.ma0.stock;
  const isAlarmEnabled = portfolio.alarmconfig?.enabled;

  const onDailyExecutionBlockRef = useRef(onDailyExecutionBlock);
  onDailyExecutionBlockRef.current = onDailyExecutionBlock;
  
  const [investedAmount, setInvestedAmount] = useState<number>(0);
  const [yieldRate, setYieldRate] = useState<number>(0);
  const [realizedProfit, setRealizedProfit] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dailyExecutionText, setDailyExecutionText] = useState<string | null>(null);

  const [maActiveSection, setMaActiveSection] = useState<1 | 2 | 3 | null>(null);
  const [maBlockVersion, setMaBlockVersion] = useState(0);
  const [maPartialProfitLines, setMaPartialProfitLines] = useState<{ section: 1 | 2 | 3; stock: string; quantity: number }[]>([]);
  const [maRsiNotMet, setMaRsiNotMet] = useState(false);
  const [maAlignmentNotMet, setMaAlignmentNotMet] = useState(false);
  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maSectionDepsKey = React.useMemo(() => portfolio.strategy.multiSplit ? '' : `${portfolio.id}-${portfolio.strategy.ma0?.stock}-${maAPeriod}-${maBPeriod}`, [portfolio.id, !!portfolio.strategy.multiSplit, portfolio.strategy.ma0?.stock, maAPeriod, maBPeriod]);

  useEffect(() => {
    if (portfolio.strategy.multiSplit) return;
    let cancelled = false;
    const runAnalysis = async () => {
      const section = await determineActiveSection(portfolio);
      if (cancelled) return;
      setMaActiveSection(prev => prev === section ? prev : section);
      if (section) setMaBlockVersion(v => v + 1);
      if (section !== 1 && section !== 2 && section !== 3) return;
      const ma0 = portfolio.strategy.ma0;
      const symbolsToFetch = Array.from(new Set([ma0.stock, portfolio.strategy.ma1?.stock, portfolio.strategy.ma2?.stock, portfolio.strategy.ma3?.stock].filter(Boolean) as string[]));
      try {
        const prices = await fetchStockPrices(symbolsToFetch);
        if (cancelled) return;
        if (ma0.rsiEnabled) {
          const threshold = section === 1 ? portfolio.strategy.ma1.rsiThreshold : (section === 2 ? portfolio.strategy.ma2.rsiThreshold : portfolio.strategy.ma3.rsiThreshold);
          const rsi = prices[ma0.stock]?.rsi ?? 50;
          setMaRsiNotMet(threshold != null && rsi > threshold);
        }
        if (ma0.alignmentEnabled) {
          const { maA, maB } = await getMAValuesForAlignment(portfolio);
          if (!cancelled) setMaAlignmentNotMet(maA <= maB);
        }
      } catch (err) { console.warn(err); }
    };
    runAnalysis();
    return () => { cancelled = true; };
  }, [portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, maSectionDepsKey]);

  const { currentRound, multiSplitPhase, isInQuarterMode, multiSplitExecutionData, multiSplitInsufficientAmount, quarterStopLossData } = useMultiSplitExecution(portfolio);

  const getStrategyInfo = () => portfolio.strategy.multiSplit ? { name: lang === 'ko' ? '다분할 매매법' : 'Multi-Split', icon: <Layers size={14} className="text-emerald-500" /> } : { name: lang === 'ko' ? '이평선 구간매수' : 'MA Interval', icon: <TrendingUp size={14} className="text-blue-500" /> };
  const strategyInfo = getStrategyInfo();

  useEffect(() => {
    if (!onDailyExecutionBlock || !isAlarmEnabled || (!portfolio.strategy.multiSplit && maBlockVersion === 0)) return;
    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      multiSplitPhase: multiSplitPhase ?? null,
      isQuarterStopLossActive: isInQuarterMode,
      maActiveSection: maActiveSection ?? undefined,
    });
    setDailyExecutionText(block);
    onDailyExecutionBlockRef.current?.(portfolio.id, block);
  }, [isAlarmEnabled, lang, multiSplitExecutionData, multiSplitPhase, isInQuarterMode, maBlockVersion, maActiveSection]);

  useEffect(() => {
    let cancelled = false;
    const updateMetrics = async () => {
      setIsLoading(true);
      const invested = calculateInvestedAmount(portfolio);
      const yieldValue = await calculateYield(portfolio);
      const realized = calculateAlreadyRealized(portfolio);
      if (cancelled) return;
      setInvestedAmount(invested);
      setYieldRate(yieldValue);
      setRealizedProfit(realized);
      setIsLoading(false);
    };
    updateMetrics();
    return () => { cancelled = true; };
  }, [portfolio.id, portfolio.trades.length]);

  return (
    <div className={`glass light-card-depth p-7 rounded-[2.5rem] space-y-5 group hover:-translate-y-1 transition-all duration-500 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl`}>
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {isInTossApp ? (
          <>
            <TDSButton variant="tertiary" size="small" onClick={() => onOpenAlarm()} className={`w-9 h-9 min-w-0 p-0 rounded-lg flex items-center justify-center ${isAlarmEnabled ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' : ''}`}>
              {isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}
            </TDSButton>
            <TDSButton variant="tertiary" size="small" onClick={() => onDelete()} className="w-9 h-9 min-w-0 p-0 rounded-lg flex items-center justify-center text-slate-500">
              <Trash2 size={16} strokeWidth={2} />
            </TDSButton>
          </>
        ) : (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenAlarm(); }} className="w-9 h-9 border rounded-lg flex items-center justify-center">{isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}</button>
        )}
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-4">
          <div onClick={onOpenDetails} className="w-16 h-16 rounded-full relative cursor-pointer active:scale-95 transition-transform">
            <StockLogo ticker={ma0Ticker} size="xl" shape="circle" className="w-16 h-16 border-2 border-white/30 shadow-xl" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-1">{portfolio.name}</h3>
            <div className="flex items-center gap-2">{strategyInfo.icon}<span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{strategyInfo.name}</span></div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 relative z-10 min-h-[140px] items-center">
        <div className="flex-1 flex flex-col justify-center space-y-6">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {t.invested}
            </span>
            <p className="text-2xl font-black">
              ${investedAmount.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {lang === 'ko' ? '실현손익' : 'Realized P/L'}
            </span>
            <p
              className={`text-2xl font-black ${
                realizedProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              ${realizedProfit.toLocaleString()}
            </p>
          </div>
        </div>
        {isInTossApp ? (
          <TDSButton
            variant="tertiary"
            size="medium"
            onClick={() => onOpenAIImage()}
            className="w-24 h-24 rounded-[2.5rem] flex items-center justify-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
              <Camera size={24} className="text-white" />
            </div>
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={onOpenAIImage}
            className="w-24 h-24 rounded-[2.5rem] bg-slate-100 flex items-center justify-center"
          >
            <Camera size={24} />
          </button>
        )}
      </div>

      <div
        onClick={onOpenExecution}
        className="bg-blue-50 dark:bg-blue-600/15 rounded-[1.5rem] p-5 flex items-center justify-between cursor-pointer border border-blue-100"
      >
        <div className="flex-1">
          <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
            {t.dailyExecution}
          </span>
          <div className="text-lg font-black">
            {dailyExecutionText?.trim() || t.strategyPreparing}
          </div>
        </div>
        {isInTossApp ? (
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={() => onOpenQuickInput()}
            className="w-10 h-10 min-w-0 p-0 rounded-xl flex items-center justify-center"
          >
            <Zap size={20} className="fill-current" />
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenQuickInput();
            }}
            className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center"
          >
            <Zap size={20} />
          </button>
        )}
      </div>

      {isInTossApp ? (
        <TDSButton variant="tertiary" onClick={() => onClose()} className="w-full">{t.terminate}</TDSButton>
      ) : (
        <button type="button" onClick={onClose} className="w-full py-4 text-[10px] font-black">{t.terminate}</button>
      )}
    </div>
  );
};

export default Dashboard;