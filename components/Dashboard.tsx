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
import { calculateInvestedAmount, calculateYield, calculateCurrentValuation, determineActiveSection, calculateHoldings, getMaPeriods, getMAValuesForAlignment } from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import HoverTip from './HoverTip';
import { formatPortfolioDailyExecutionBlock, joinDailyExecutionBlocks } from '../utils/dailyExecutionSummary';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSButton, TDSList, TDSListRow } from './tds';
import { getConditionalTypographyStyle, getConditionalColor } from '../utils/tossStyleHelpers';
import Toast from './Toast';

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

const Dashboard: React.FC<DashboardProps> = ({ 
  lang, 
  portfolios, 
  currentTier,
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
  const [dailyExecutionBlocks, setDailyExecutionBlocks] = useState<Record<string, string>>({});
  const lastDailyExecutionSummaryRef = useRef<string | null>(null);

  // 안정적인 콜백: 매 렌더마다 새 함수를 넘기면 자식 effect가 반복 실행될 수 있음(다분할 알람 무한루프 원인)
  const setDailyExecutionBlockForId = useCallback((id: string, block: string | null) => {
    setDailyExecutionBlocks((prev) => {
      const nextValue = block ?? '';
      if (prev[id] === nextValue) return prev;
      return { ...prev, [id]: nextValue };
    });
  }, []);

  // 알람이 켜진 포트폴리오 id 목록 (파생 배열) – 포트폴리오가 바뀔 때만 재계산
  const alarmIds = useMemo(
    () =>
      portfolios
        .filter((p) => p.alarmconfig?.enabled && (p.alarmconfig.selectedHours?.length || 0) > 0)
        .map((p) => p.id),
    [portfolios]
  );

  // 의존성을 문자열로 고정 → 동일 id 집합이면 effect 재실행 방지 (알람 설정 시 연쇄 리렌더/무한루프 방지)
  const alarmIdsKey = useMemo(() => alarmIds.join(','), [alarmIds]);

  useEffect(() => {
    if (!onDailyExecutionSummaryChange) return;
    // 알람이 없으면 null로 한 번만 전달
    if (alarmIds.length === 0) {
      if (lastDailyExecutionSummaryRef.current !== null) {
        lastDailyExecutionSummaryRef.current = null;
        onDailyExecutionSummaryChange(null);
      }
      return;
    }
    // 모든 알람 포트폴리오의 블록이 준비된 경우에만 요약 전달 → 저장 직후 불완전 요약으로 인한 연쇄 리렌더/무한루프 방지
    const blocks = alarmIds.map((id) => dailyExecutionBlocks[id]).filter(Boolean);
    if (blocks.length !== alarmIds.length) return;

    const summary = joinDailyExecutionBlocks(blocks);
    const next = summary || null;

    if (lastDailyExecutionSummaryRef.current === next) return;
    lastDailyExecutionSummaryRef.current = next;
    onDailyExecutionSummaryChange(next);
  }, [alarmIdsKey, dailyExecutionBlocks, onDailyExecutionSummaryChange]);

  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const isPositiveChange = totalValuationChange >= 0;
  const changeColor = totalValuationChange === 0 ? 'text-slate-400' : (isPositiveChange ? 'text-emerald-500' : 'text-rose-500');

  // Phase 2: 토스 환경에서만 TDS Typography/색상 적용 (웹은 기존 className 유지)
  const tossTitleStyle = getConditionalTypographyStyle(isInTossApp, 'Typography2', 'Bold');
  const tossCaptionStyle = getConditionalTypographyStyle(isInTossApp, 'Typography7', 'Regular');
  const tossValueStyle = getConditionalTypographyStyle(isInTossApp, 'Typography2', 'Bold');
  const tossChangePositiveColor = getConditionalColor(isInTossApp, 'success');
  const tossChangeNegativeColor = getConditionalColor(isInTossApp, 'error');
  const tossTextSecondaryColor = getConditionalColor(isInTossApp, 'textSecondary');

  const valuationLabelStyle = tossCaptionStyle ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined } : undefined;
  const valuationValueStyle = tossValueStyle ? { ...tossValueStyle, color: undefined } : undefined;
  const changeValueStyle = tossValueStyle && (totalValuationChange !== 0)
    ? { ...tossValueStyle, color: isPositiveChange ? (tossChangePositiveColor ?? undefined) : (tossChangeNegativeColor ?? undefined) }
    : tossValueStyle;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
        <div className="max-w-2xl">
          <h1
            className={!isInTossApp ? 'text-4xl md:text-5xl font-extrabold tracking-tight dark:text-white mb-4 leading-[1.1]' : 'mb-4'}
            style={tossTitleStyle ?? undefined}
          >
            {t.portfolioMgmt}
          </h1>
          <p
            className={!isInTossApp ? 'text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed' : ''}
            style={isInTossApp && tossCaptionStyle ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined } : undefined}
          >
            {t.systematicAccumulation}
          </p>
        </div>

        <div className="flex flex-col items-end gap-6 min-w-[280px]">
          <div className="flex items-center gap-8 px-2">
            <div className="flex flex-col items-end">
              <span
                className={!isInTossApp ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1' : 'mb-1'}
                style={valuationLabelStyle}
              >
                {t.totalValuation}
              </span>
              <span
                className={!isInTossApp ? 'text-3xl font-black dark:text-white tracking-tighter' : ''}
                style={valuationValueStyle}
              >
                ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800" />
            <div className="flex flex-col items-end">
              <span
                className={!isInTossApp ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1' : 'mb-1'}
                style={valuationLabelStyle}
              >
                {t.gain24h}
              </span>
              <span
                className={!isInTossApp ? `text-3xl font-black tracking-tighter ${changeColor}` : ''}
                style={changeValueStyle}
              >
                {totalValuationChange === 0
                  ? '$0.00'
                  : `${isPositiveChange ? '+' : '-'}$${Math.abs(totalValuationChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span
                className={!isInTossApp ? `text-xs font-bold mt-0.5 ${changeColor}` : 'mt-0.5'}
                style={changeValueStyle}
              >
                {Number.isNaN(totalValuationChangePct)
                  ? '-'
                  : `${totalValuationChangePct >= 0 ? '+' : ''}${totalValuationChangePct.toFixed(2)}%`}
              </span>
            </div>
          </div>

          {isInTossApp ? (
            <TDSButton variant="primary" onClick={onOpenCreator} className="flex items-center justify-center gap-2 !px-10">
              <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={onOpenCreator}
              className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
            </button>
          )}
        </div>
      </section>

      {portfolios.length === 0 ? (
        <section className={isInTossApp ? 'block' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'}>
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
            <p className="text-slate-500">{lang === 'ko' ? '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.' : 'No portfolios. Please add a portfolio.'}</p>
          </div>
        </section>
      ) : (
        <section className={isInTossApp ? '' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'}>
          {isInTossApp ? (
            <TDSList className="list-none p-0 m-0 space-y-4">
              {portfolios.map((p) => (
                <TDSListRow key={p.id} border="none" verticalPadding="large">
                  <PortfolioCard
                    portfolio={p}
                    currentTier={currentTier}
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
                    onDailyExecutionBlock={onDailyExecutionSummaryChange ? setDailyExecutionBlockForId : undefined}
                  />
                </TDSListRow>
              ))}
            </TDSList>
          ) : (
            portfolios.map((p) => (
              <PortfolioCard
                key={p.id}
                portfolio={p}
                currentTier={currentTier}
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
                onDailyExecutionBlock={onDailyExecutionSummaryChange ? setDailyExecutionBlockForId : undefined}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
};

const PortfolioCard: React.FC<{ 
  portfolio: Portfolio; 
  currentTier: 'free' | 'pro' | 'premium';
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
}> = ({ portfolio, currentTier, onClose, onDelete, onOpenAlarm, onOpenDetails, onOpenQuickInput, onOpenExecution, onOpenAIImage, onUpdatePortfolio, lang, onDailyExecutionBlock }) => {
  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const isMultiSplitStrategy = !!portfolio.strategy.multiSplit;
  const isNoStopMultiSplitStrategy = !!portfolio.strategy.noStopMultiSplit;
  // 다분할 매매법일 때는 multiSplit.targetStock을 사용, 아니면 ma0.stock 사용
  const ma0Ticker = portfolio.strategy.multiSplit?.targetStock || portfolio.strategy.noStopMultiSplit?.targetStock || portfolio.strategy.ma0.stock;
  const isAlarmEnabled = portfolio.alarmconfig?.enabled;

  const [freeAlarmToastSeq, setFreeAlarmToastSeq] = useState(0);

  const openFreeAlarmToast = useCallback(() => {
    setFreeAlarmToastSeq((prev) => prev + 1);
  }, []);

  const handleAlarmButtonClick = useCallback(() => {
    if (currentTier === 'free') {
      openFreeAlarmToast();
      return;
    }
    onOpenAlarm();
  }, [currentTier, onOpenAlarm, openFreeAlarmToast]);

  const handleAlarmButtonClickWeb = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handleAlarmButtonClick();
    },
    [handleAlarmButtonClick]
  );

  // 콜백을 ref에 보관해 effect 의존성에서 제외 → 부모 리렌더 시 콜백 참조 변경으로 인한 반복 실행 방지
  const onDailyExecutionBlockRef = useRef(onDailyExecutionBlock);
  onDailyExecutionBlockRef.current = onDailyExecutionBlock;
  
  const [investedAmount, setInvestedAmount] = useState<number>(0);
  const [yieldRate, setYieldRate] = useState<number>(0);
  const [realizedProfit, setRealizedProfit] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 이평선 구간매수: 최신 종가·이평선 기준 활성 구간 (일별 매매 실행 표시용)
  const [maActiveSection, setMaActiveSection] = useState<1 | 2 | 3 | null>(null);
  // 구간이 바뀔 때만 블록 effect를 한 번 돌리기 위한 버전 (maActiveSection을 의존성에 넣으면 report→부모 리렌더→무한루프 위험)
  const [maBlockVersion, setMaBlockVersion] = useState(0);
  // 이평선 구간매수: 구간별 목표 수익률 도달 시 "구간N 익절: 종목 수량주" 표시용
  const [maPartialProfitLines, setMaPartialProfitLines] = useState<{ section: 1 | 2 | 3; stock: string; quantity: number }[]>([]);
  // 이평선 구간매수 + RSI 사용 시: RSI 조건 미충족이면 true → "구간 N: 관망 (RSI 조건 미충족)" 표시
  const [maRsiNotMet, setMaRsiNotMet] = useState(false);
  // 이평선 구간매수 + 정배열 사용 시: maA ≤ maB 이면 true → "구간 N: 관망 (정배열 미충족)" 표시
  const [maAlignmentNotMet, setMaAlignmentNotMet] = useState(false);
  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maSectionDepsKey = React.useMemo(
    () =>
      portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit
        ? ''
        : `${portfolio.id}-${portfolio.strategy.ma0?.stock}-${maAPeriod}-${maBPeriod}`,
    [portfolio.id, !!portfolio.strategy.multiSplit, !!portfolio.strategy.noStopMultiSplit, portfolio.strategy.ma0?.stock, maAPeriod, maBPeriod]
  );

  // 이평선 구간매수: 구간 분석, RSI, 정배열, 익절 라인 체크 통합 로직
  useEffect(() => {
    if (portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit) {
      setMaActiveSection(null);
      setMaRsiNotMet(false);
      setMaAlignmentNotMet(false);
      setMaPartialProfitLines([]);
      return;
    }

    let cancelled = false;
    
    const runAnalysis = async () => {
      // 1. 활성 구간 판정 (현재가 vs 이평선)
      const section = await determineActiveSection(portfolio);
      if (cancelled) return;
      
      setMaActiveSection(prev => prev === section ? prev : section);
      
      // 구간 판정 완료 후 블록 업데이트를 위한 버전업 (DailyExecution에서 사용)
      if (section) setMaBlockVersion(v => v + 1);

      if (section !== 1 && section !== 2 && section !== 3) {
        setMaRsiNotMet(false);
        setMaAlignmentNotMet(false);
        setMaPartialProfitLines([]);
        return;
      }

      const ma0 = portfolio.strategy.ma0;
      const baseStock = ma0.stock;
      const ma1 = portfolio.strategy.ma1;
      const ma2 = portfolio.strategy.ma2;
      const ma3 = portfolio.strategy.ma3;
      
      // 2. 통합 데이터 fetching (중복 호출 방지 위해 한 번에 모든 심볼 요청)
      const symbolsToFetch = Array.from(new Set([baseStock, ma1?.stock, ma2?.stock, ma3?.stock].filter(Boolean) as string[]));
      
      try {
        const prices = await fetchStockPrices(symbolsToFetch);
        if (cancelled) return;

        // RSI 조건 체크
        if (ma0.rsiEnabled) {
          const threshold = section === 1 ? ma1.rsiThreshold : (section === 2 ? ma2.rsiThreshold : ma3.rsiThreshold);
          const rsi = prices[baseStock]?.rsi ?? 50;
          setMaRsiNotMet(threshold != null && rsi > threshold);
        } else {
          setMaRsiNotMet(false);
        }

        // 정배열 조건 체크
        if (ma0.alignmentEnabled) {
          const { maA, maB } = await getMAValuesForAlignment(portfolio);
          if (!cancelled) setMaAlignmentNotMet(maA <= maB);
        } else {
          setMaAlignmentNotMet(false);
        }

        // 구간별 부분 익절 라인 체크
        const holdings = calculateHoldings(portfolio);
        const lines: { section: 1 | 2 | 3; stock: string; quantity: number }[] = [];
        const checkPartial = (sec: 1 | 2 | 3, config: any) => {
          if (!config?.takePartialProfit || config?.partialProfitTargetPct == null || config?.partialProfitTargetPct <= 0) return;
          const h = holdings.find(x => x.stock === config.stock);
          if (!h || h.quantity <= 0 || h.avgPrice <= 0) return;
          const currentPrice = prices[config.stock]?.price ?? 0;
          if (currentPrice <= 0) return;
          const yieldPct = ((currentPrice - h.avgPrice) / h.avgPrice) * 100;
          if (yieldPct >= config.partialProfitTargetPct) lines.push({ section: sec, stock: config.stock, quantity: h.quantity });
        };
        checkPartial(1, ma1);
        checkPartial(2, ma2);
        checkPartial(3, ma3);
        
        setMaPartialProfitLines(prev => {
          if (prev.length === lines.length && prev.every((p, i) => p.section === lines[i].section && p.stock === lines[i].stock)) return prev;
          return lines;
        });

      } catch (err) {
        console.warn('[PortfolioCard:Analysis] failed:', err);
      }
    };

    runAnalysis();
    return () => { cancelled = true; };
  }, [portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, portfolio.strategy.noStopMultiSplit, maSectionDepsKey]);

  // 다분할 매매법 통합 계산 훅 (cascade useEffect 제거)
  const {
    currentRound,
    multiSplitPhase,
    isInQuarterMode,
    isInQuarterModeByT,
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  } = useMultiSplitExecution(portfolio);
  const {
    currentRound: noStopCurrentRound,
    executionData: noStopExecutionData,
  } = useNoStopMultiSplitExecution(portfolio);

  // T > a-1 이고 플래그가 아직 false면 DB에 true로 갱신 (신규 쿼터 진입, 1회만)
  const quarterModeUpdateSentRef = React.useRef(false);
  if (portfolio.isQuarterMode === false) quarterModeUpdateSentRef.current = false;
  useEffect(() => {
    if (!portfolio.strategy.multiSplit || !isInQuarterModeByT || portfolio.isQuarterMode === true || quarterModeUpdateSentRef.current) return;
    quarterModeUpdateSentRef.current = true;
    onUpdatePortfolio({ ...portfolio, isQuarterMode: true });
  }, [portfolio.id, isInQuarterModeByT, portfolio.isQuarterMode]);

  // 전략 이름 및 아이콘 결정
  const getStrategyInfo = () => {
    if (portfolio.strategy.multiSplit) {
      return {
        name: lang === 'ko' ? '다분할 매매법' : 'Multi-Split Trading',
        icon: <Layers size={14} className="text-emerald-500" />
      };
    } else if (portfolio.strategy.noStopMultiSplit) {
      return {
        name: lang === 'ko' ? '다분할 매매법(무손절)' : 'No-Stop Multi-Split',
        icon: <Layers size={14} className="text-emerald-500" />
      };
    } else {
      return {
        name: lang === 'ko' ? '이평선 구간매수' : 'MA Interval Buying',
        icon: <TrendingUp size={14} className="text-blue-500" />
      };
    }
  };

  const strategyInfo = getStrategyInfo();

  // recentTradingDays, quarterStopLossData, multiSplitExecution: useMultiSplitExecution 훅에서 통합 계산


  // 마지막으로 전달한 daily execution 블록을 기억 (동일 문자열 반복 전달 방지)
  const lastDailyExecutionBlockRef = React.useRef<string | null>(null);

  // 알람 켜진 포트폴리오용: 상세 daily execution 블록 생성 후 상위로 전달 (텔레그램 메시지에 LOC/MOC 등 반영)
  useEffect(() => {
    if (!onDailyExecutionBlock) return;

    const report = onDailyExecutionBlockRef.current;
    if (!report) return;

    // 알람이 꺼져 있으면 블록을 비우고 더 이상 올리지 않음
    if (!isAlarmEnabled) {
      if (lastDailyExecutionBlockRef.current !== null) {
        lastDailyExecutionBlockRef.current = null;
        report(portfolio.id, null);
      }
      return;
    }

    const a = portfolio.strategy.multiSplit?.totalSplitCount ?? 0;
    const multiSplitOverLimit = portfolio.strategy.multiSplit && a > 0 && currentRound > a;

    // 다분할 매매법: 총투자금 초과(T > a)일 때는 multiSplitExecutionData 없이도 "총투자금 초과" 블록 전달
    // 금액 부족 알림이 있으면 데이터 없어도 블록 전달. 그 외에는 비동기 데이터 준비 전까지 대기
    if (portfolio.strategy.multiSplit && !multiSplitOverLimit && multiSplitExecutionData == null && !multiSplitInsufficientAmount) return;
    if (portfolio.strategy.noStopMultiSplit && noStopExecutionData == null) return;

    // 이평선 구간매수: 구간 계산(maBlockVersion)이 끝나기 전에는 report 안 함 → 알람 켜는 순간 report→부모 리렌더→effect 재실행 무한루프 방지
    if (!portfolio.strategy.multiSplit && !portfolio.strategy.noStopMultiSplit && isAlarmEnabled && maBlockVersion === 0) return;

    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      quarterStopLossData: quarterStopLossData ?? undefined,
      noStopMultiSplitExecutionData: noStopExecutionData ?? undefined,
      multiSplitPhase: multiSplitPhase ?? null,
      isQuarterStopLossActive: isInQuarterMode,
      multiSplitOverLimit: multiSplitOverLimit ?? false,
      multiSplitFirstRoundHint: portfolio.strategy.multiSplit && currentRound >= 0 && currentRound < 0.5,
      multiSplitInsufficientAmount: portfolio.strategy.multiSplit ? multiSplitInsufficientAmount : undefined,
      maActiveSection: portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit ? undefined : maActiveSection ?? undefined,
      maPartialProfitLines: portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit ? undefined : (maPartialProfitLines.length ? maPartialProfitLines : undefined),
      maRsiNotMet: portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit ? undefined : maRsiNotMet,
      maAlignmentNotMet: portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit ? undefined : maAlignmentNotMet,
    });

    // 내용이 이전과 동일하면 상위로 전달하지 않음
    if (lastDailyExecutionBlockRef.current === block) {
      return;
    }
    lastDailyExecutionBlockRef.current = block;
    report(portfolio.id, block);
  }, [
    isAlarmEnabled,
    lang,
    multiSplitExecutionData,
    quarterStopLossData,
    multiSplitPhase,
    isInQuarterMode,
    currentRound,
    noStopCurrentRound,
    noStopExecutionData,
    maBlockVersion,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
    multiSplitInsufficientAmount,
    portfolio.id,
    portfolio.name,
    portfolio.alarmconfig?.enabled,
    (portfolio.alarmconfig?.selectedHours ?? []).join(','),
    // 객체 참조 대신 원시값 사용 → 부모 리렌더 시 참조만 바뀌어도 effect 재실행되는 무한루프 방지
    !!portfolio.strategy.multiSplit,
    !!portfolio.strategy.noStopMultiSplit,
  ]);

  // 최신 portfolio를 참조하기 위한 ref (metrics 계산용) — 의존성은 원시값만 사용해 불필요한 재실행·무한루프 위험 축소
  const portfolioRef = useRef(portfolio);
  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio.id, portfolio.trades.length]);

  // 수익률/투자금/실현손익 계산
  // - portfolio.id 또는 매매 개수(trades.length)가 바뀔 때만 재계산 (매매 추가/삭제 시 즉시 반영)
  useEffect(() => {
    let cancelled = false;

    const updateMetrics = async () => {
      setIsLoading(true);
      try {
        const current = portfolioRef.current;
        const holdings = calculateHoldings(current);
        const [invested, valuation, yieldValue] = await (async () => {
          const investedAmount = calculateInvestedAmount(current);
          const currentValuation = await calculateCurrentValuation(current);
          const yieldRate = await calculateYield(current);
          return [investedAmount, currentValuation, yieldRate] as const;
        })();
        const totalRealizedPnL = holdings.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);
        if (cancelled) return;
        // investedAmount state는 이제 "평가금액"을 표시하기 위해 사용됩니다.
        setInvestedAmount(valuation);
        setYieldRate(yieldValue);
        setRealizedProfit(totalRealizedPnL);
      } catch (err) {
        console.error('Error calculating portfolio metrics:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    updateMetrics();

    return () => {
      cancelled = true;
    };
  }, [portfolio.id, portfolio.trades.length]);

  return (
    <div
      className={`glass light-card-depth p-7 rounded-[2.5rem] space-y-5 group hover:-translate-y-1 transition-all duration-500 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl ${
        isMultiSplitStrategy || isNoStopMultiSplitStrategy ? 'px-4 py-5' : ''
      }`}
    >
      
      {/* Visual background layers */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50 dark:hidden"></div>
      <div className="absolute -right-12 -top-12 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* 우측 상단 버튼 그룹 — Phase 2: 토스에서만 TDSButton */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {isInTossApp ? (
          <>
            <TDSButton
              variant="tertiary"
              size="small"
              onClick={handleAlarmButtonClick}
              className={`w-9 h-9 min-w-0 p-0 rounded-lg flex items-center justify-center ${
                isAlarmEnabled ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500' : ''
              }`}
              aria-label={lang === 'ko' ? '알람 설정' : 'Alarm settings'}
            >
              {isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}
            </TDSButton>
            <TDSButton
              variant="tertiary"
              size="small"
              onClick={() => {
                onDelete();
              }}
              className="w-9 h-9 min-w-0 p-0 rounded-lg flex items-center justify-center text-slate-500"
              aria-label={lang === 'ko' ? '포트폴리오 삭제' : 'Delete portfolio'}
            >
              <Trash2 size={16} strokeWidth={2} />
            </TDSButton>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleAlarmButtonClickWeb}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                isAlarmEnabled
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30'
                  : 'bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={lang === 'ko' ? '알람 설정' : 'Alarm settings'}
            >
              {isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 active:scale-95"
              title={lang === 'ko' ? '포트폴리오 삭제' : 'Delete portfolio'}
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </>
        )}
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-4">
          <div 
            onClick={onOpenDetails}
            className="w-16 h-16 rounded-full overflow-visible relative cursor-pointer active:scale-95 transition-transform"
          >
            {/* 플로팅 ROI 배지 */}
            <div className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg ${
              yieldRate >= 0 
                ? 'bg-emerald-500 text-white' 
                : 'bg-rose-500 text-white'
            }`}>
              <TrendingUp 
                size={10} 
                className={yieldRate < 0 ? 'rotate-180' : ''}
              />
              <span className="text-[10px] font-black">
                {isLoading ? '...' : `${yieldRate >= 0 ? '+' : ''}${yieldRate.toFixed(1)}%`}
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
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-1">{portfolio.name}</h3>
            <div className="flex items-center gap-2">
              {strategyInfo.icon}
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {strategyInfo.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 좌측 지표 + 우측 AI/퀵 입력 버튼 — 그리드로 퀵입력 상단=실현손익 상단, 버튼 세로축=알람·삭제 사이 */}
      <div className={`grid grid-cols-[1fr_50px] gap-x-4 gap-y-6 items-start relative z-10 min-h-[140px] mr-[3px] ${isMultiSplitStrategy || isNoStopMultiSplitStrategy ? 'mt-3' : ''}`}>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {lang === 'ko' ? '평가금액' : 'Valuation'}
            </span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">
            {isLoading ? '...' : `$${investedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={() => {
                onOpenAIImage();
              }}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={lang === 'ko' ? 'AI 매매 인식' : 'AI Trade Recognition'}
            >
              <div className="w-[50px] h-[50px] rounded-[1.25rem] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-md dark:shadow-[0_0_17px_rgba(255,255,255,0.25)]">
                <Camera size={28} className="text-white" strokeWidth={2} />
              </div>
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={() => {
                onOpenAIImage();
              }}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-transparent dark:bg-transparent flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              title={lang === 'ko' ? 'AI 매매 인식' : 'AI Trade Recognition'}
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
              {lang === 'ko' ? '실현손익' : 'Realized P/L'}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500">
              {lang === 'ko' ? '(제비용 반영)' : '(After fees)'}
            </span>
          </div>
          <p className={`text-2xl font-black tracking-tight leading-tight flex items-center gap-1 ${realizedProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span className="text-[11px]">{realizedProfit >= 0 ? '↑' : '↓'}</span>
            {isLoading ? '...' : `${realizedProfit >= 0 ? '+' : ''}$${realizedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={() => {
                onOpenQuickInput();
              }}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={lang === 'ko' ? '퀵 입력' : 'Quick input'}
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
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-blue-600/20 dark:bg-white/20 flex items-center justify-center text-blue-700 dark:text-white backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              <Zap size={20} className="fill-current" />
            </button>
          )}
        </div>
      </div>

      {freeAlarmToastSeq > 0 && (
        <Toast
          key={freeAlarmToastSeq}
          message={
            lang === 'ko'
              ? '무료 회원을 위한 알림도 곧 만날 수 있어요.'
              : 'Alerts for free members are coming soon.'
          }
          onDone={() => setFreeAlarmToastSeq(0)}
        />
      )}

      <div 
        onClick={onOpenExecution}
        className={`bg-blue-50/50 dark:bg-blue-600/15 rounded-[1.5rem] flex items-center justify-between shadow-md dark:shadow-lg dark:shadow-blue-500/20 relative overflow-visible group/action cursor-pointer border border-blue-100 dark:border-blue-500/20 min-h-[80px] ${isMultiSplitStrategy || isNoStopMultiSplitStrategy ? 'p-4 mt-3' : 'p-5'}`}
      >
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-white/10 opacity-0 group-hover/action:opacity-100 transition-opacity rounded-[1.5rem]"></div>
        <div className="relative z-10 flex-1 overflow-visible">
          <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
             <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">{t.dailyExecution}</span>
             <Info size={10} className="text-blue-700 dark:text-blue-300" />
             {isMultiSplitStrategy && (multiSplitPhase || isInQuarterMode) && (
               <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                 isInQuarterMode
                   ? 'text-amber-500 dark:text-amber-300 bg-amber-200/50 dark:bg-amber-500/25'
                   : multiSplitPhase === 'first' 
                   ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-500/20' 
                   : 'text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/20'
               }`}>
                 {isInQuarterMode
                   ? t.quarterStopLoss
                   : multiSplitPhase === 'first'
                   ? t.firstHalf
                   : t.secondHalf}
               </span>
             )}
          </div>
          {isMultiSplitStrategy ? (
            <div className="text-sm font-black text-blue-900 dark:text-white space-y-2">
              {multiSplitInsufficientAmount && (
                <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-500/30">
                  {lang === 'ko' ? '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.' : 'Notice: 1st buy amount is too low to place orders. Please check your settings.'}
                </div>
              )}
              {isInQuarterMode ? (
                // 쿼터 손절 모드 활성화 시
                quarterStopLossData ? (
                  !quarterStopLossData.hasMOC ? (
                    // MOC 매도 기록 없음
                    <>
                      <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                        <span className="font-black">{lang === 'ko' ? 'MOC 매도:' : 'MOC Sell:'}</span>{' '}
                        {quarterStopLossData.mocQuantity?.toFixed(2) || '0.00'} {lang === 'ko' ? '주' : 'shares'}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        {lang === 'ko' ? 'MOC 매도 하여 쿼터 손절 모드 시작하세요' : 'Start quarter stop-loss mode by executing MOC sell'}
                      </div>
                    </>
                  ) : (
                    // MOC 매도 기록 있음
                    <>
                      <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium mb-2">
                        <span className="font-black">{lang === 'ko' ? '1회 매수금:' : '1st Buy Amount:'}</span>{' '}
                        ${quarterStopLossData.newOneTimeAmount?.toFixed(2) || '0.00'}
                      </div>
                      {quarterStopLossData.locBuy && (
                        <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                          <span className="font-black">{t.locBuy1}:</span>{' '}
                          ${quarterStopLossData.locBuy.price.toFixed(2)} / {quarterStopLossData.locBuy.quantity}
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-2">
                            ({lang === 'ko' ? '현재 평균 단가 × 0.9 - 0.01' : 'Avg Price × 0.9 - 0.01'})
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                        {quarterStopLossData.locSell && (
                          <div>
                            <span className="font-black">{t.locSell}:</span>{' '}
                            ${quarterStopLossData.locSell.price.toFixed(2)} / {quarterStopLossData.locSell.quantity}
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              ({lang === 'ko' ? '현재 평균 단가 × 0.9' : 'Avg Price × 0.9'})
                            </div>
                          </div>
                        )}
                        {quarterStopLossData.limitSell && (
                          <div>
                            <span className="font-black">{t.limitSell}:</span>{' '}
                            ${quarterStopLossData.limitSell.price.toFixed(2)} / {quarterStopLossData.limitSell.quantity}
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              ({lang === 'ko' ? `현재 평균 단가 × (1 + ${portfolio.strategy.multiSplit?.targetReturnRate || 0}/100)` : `Avg Price × (1 + ${portfolio.strategy.multiSplit?.targetReturnRate || 0}/100)`})
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <div className="text-[9px] text-blue-600/70 dark:text-blue-400/70 font-medium">
                    {lang === 'ko' ? '계산 중...' : 'Calculating...'}
                  </div>
                )
              ) : (
                // 쿼터 손절 모드 비활성화 시 (기존 로직)
                <>
              {multiSplitPhase === 'first' && multiSplitExecutionData && (
                <>
                  {/* LOC 매수 1, 2를 좌우로 배치 */}
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                    {multiSplitExecutionData.locBuy1 ? (
                      <div>
                        <span className="font-black">{t.locBuy1}:</span>{' '}
                        ${multiSplitExecutionData.locBuy1.price.toFixed(2)} / {multiSplitExecutionData.locBuy1.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.locBuy1}: {lang === 'ko' ? '계산 중...' : 'Calculating...'}
                      </div>
                    )}
                    {multiSplitExecutionData.locBuy2 ? (
                      <div>
                        <span className="font-black">{t.locBuy2}:</span>{' '}
                        ${multiSplitExecutionData.locBuy2.price.toFixed(2)} / {multiSplitExecutionData.locBuy2.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.locBuy2}: {lang === 'ko' ? '계산 중...' : 'Calculating...'}
                      </div>
                    )}
                  </div>
                  {/* LOC 매도, 지정가를 좌우로 배치 */}
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                    {multiSplitExecutionData.locSell ? (
                      <div>
                        <span className="font-black">{t.locSell}:</span>{' '}
                        ${multiSplitExecutionData.locSell.price.toFixed(2)} / {multiSplitExecutionData.locSell.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.locSell}: {lang === 'ko' ? '보유 없음' : 'No holdings'}
                      </div>
                    )}
                    {multiSplitExecutionData.limitSell ? (
                      <div>
                        <span className="font-black">{t.limitSell}:</span>{' '}
                        ${multiSplitExecutionData.limitSell.price.toFixed(2)} / {multiSplitExecutionData.limitSell.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.limitSell}: {lang === 'ko' ? '보유 없음' : 'No holdings'}
                      </div>
                    )}
                  </div>
                </>
              )}
              {multiSplitPhase === 'second' && multiSplitExecutionData && (
                <>
                  {/* LOC 매수 (후반전은 1개만) */}
                  <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium mb-2">
                    {multiSplitExecutionData.locBuy2 ? (
                      <div>
                        <span className="font-black">{t.locBuy2}:</span>{' '}
                        ${multiSplitExecutionData.locBuy2.price.toFixed(2)} / {multiSplitExecutionData.locBuy2.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.locBuy2}: {lang === 'ko' ? '계산 중...' : 'Calculating...'}
                      </div>
                    )}
                  </div>
                  {/* LOC 매도, 지정가를 좌우로 배치 */}
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                    {multiSplitExecutionData.locSell ? (
                      <div>
                        <span className="font-black">{t.locSell}:</span>{' '}
                        ${multiSplitExecutionData.locSell.price.toFixed(2)} / {multiSplitExecutionData.locSell.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.locSell}: {lang === 'ko' ? '보유 없음' : 'No holdings'}
                      </div>
                    )}
                    {multiSplitExecutionData.limitSell ? (
                      <div>
                        <span className="font-black">{t.limitSell}:</span>{' '}
                        ${multiSplitExecutionData.limitSell.price.toFixed(2)} / {multiSplitExecutionData.limitSell.quantity}
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 text-[10px]">
                        {t.limitSell}: {lang === 'ko' ? '보유 없음' : 'No holdings'}
                      </div>
                    )}
                  </div>
                </>
              )}
              {multiSplitPhase === 'quarter' && (
                <>
                  <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium space-y-2">
                    <div className="font-black">{t.mocSell}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>{t.locBuy1} -10%</div>
                      <div>{t.locSell} -10%</div>
                    </div>
                    <div>{t.limitSell} +A%</div>
                  </div>
                </>
              )}
              {!multiSplitPhase && (
                <div className="text-[12px] text-blue-600/70 dark:text-blue-400/70 font-medium">
                  {currentRound < 0.5 
                    ? t.firstRoundStartHint 
                    : (currentRound > (portfolio.strategy.multiSplit?.totalSplitCount ?? 0) 
                        ? t.overLimit 
                        : t.strategyPreparing)}
                </div>
              )}
                </>
              )}
            </div>
          ) : isNoStopMultiSplitStrategy ? (
            <div className="text-sm font-black text-blue-900 dark:text-white space-y-2">
              {noStopExecutionData?.isFirstBuy ? (
                <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                  {t.noStopFirstBuyHint}
                </div>
              ) : (
                <>
                  {noStopExecutionData?.lowLoc ? (
                    <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                      <span className="font-black">{t.lowLoc}:</span>{' '}
                      ${noStopExecutionData.lowLoc.price.toFixed(2)} / {noStopExecutionData.lowLoc.quantity}
                    </div>
                  ) : null}
                  {noStopExecutionData?.highLoc ? (
                    <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                      <span className="font-black">{t.highLoc}:</span>{' '}
                      ${noStopExecutionData.highLoc.price.toFixed(2)} / {noStopExecutionData.highLoc.quantity}
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {t.noStopGuaranteedDailyFill}
                      </div>
                    </div>
                  ) : null}
                  {noStopExecutionData?.isSplitComplete ? (
                    <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                      {t.noStopSplitComplete}
                    </div>
                  ) : null}
                  {noStopExecutionData?.takeProfit ? (
                    <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
                      <span className="font-black">{t.noStopTakeProfitTarget}:</span>{' '}
                      {lang === 'ko'
                        ? `평단 대비 +${portfolio.strategy.noStopMultiSplit?.takeProfitPct || 0}% (전량 지정가 매도)`
                        : `Avg price +${portfolio.strategy.noStopMultiSplit?.takeProfitPct || 0}% (full limit sell)`}
                    </div>
                  ) : null}
                  {!noStopExecutionData?.lowLoc && !noStopExecutionData?.highLoc && !noStopExecutionData?.takeProfit && (
                    <div className="text-[12px] text-blue-600/70 dark:text-blue-400/70 font-medium">
                      {t.noOrder}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-lg font-black text-blue-900 dark:text-white leading-tight space-y-1">
              {maActiveSection === 1 && (maAlignmentNotMet && maRsiNotMet ? `${t.section} 1: ${t.sectionWatchBothNotMet}` : maAlignmentNotMet ? `${t.section} 1: ${t.sectionWatchAlignmentNotMet}` : maRsiNotMet ? `${t.section} 1: ${t.sectionWatchRsiNotMet}` : `${t.section} 1: ${portfolio.strategy.ma1.stock} ${t.buy}`)}
              {maActiveSection === 2 && (maAlignmentNotMet && maRsiNotMet ? `${t.section} 2: ${t.sectionWatchBothNotMet}` : maAlignmentNotMet ? `${t.section} 2: ${t.sectionWatchAlignmentNotMet}` : maRsiNotMet ? `${t.section} 2: ${t.sectionWatchRsiNotMet}` : `${t.section} 2: ${portfolio.strategy.ma2.stock} ${t.buy}`)}
              {maActiveSection === 3 && (maAlignmentNotMet && maRsiNotMet ? `${t.section} 3: ${t.sectionWatchBothNotMet}` : maAlignmentNotMet ? `${t.section} 3: ${t.sectionWatchAlignmentNotMet}` : maRsiNotMet ? `${t.section} 3: ${t.sectionWatchRsiNotMet}` : `${t.section} 3: ${portfolio.strategy.ma3.stock} ${t.buy}`)}
              {maActiveSection === null && (
                <span className="text-[12px] text-blue-600/70 dark:text-blue-400/70 font-medium">
                  {lang === 'ko' ? '구간 확인 중…' : 'Checking section…'}
                </span>
              )}
              {maPartialProfitLines.length > 0 && maPartialProfitLines
                .filter(({ section }) => (section === 1 && portfolio.strategy.ma1?.takePartialProfit) || (section === 2 && portfolio.strategy.ma2?.takePartialProfit) || (section === 3 && portfolio.strategy.ma3?.takePartialProfit))
                .map(({ section, stock, quantity }) => (
                  <div key={`${section}-${stock}`} className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {t.section}{section} {t.sectionPartialProfit}: {stock} {Math.round(quantity)}{lang === 'ko' ? '주' : ' shares'}
                  </div>
                ))}
            </div>
          )}
        </div>
        {/* 빠른 입력 버튼은 상단 섹션으로 이동하여, 일별 매매 실행 텍스트 폭을 침범하지 않도록 분리함 */}
      </div>

      {isInTossApp ? (
        <TDSButton variant="tertiary" onClick={onClose} className="w-full relative z-10">
          {t.terminate}
        </TDSButton>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="w-full py-4 text-[10px] font-black bg-slate-50 dark:bg-transparent text-slate-500 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5 uppercase tracking-[0.2em] border border-slate-200 dark:border-white/10 rounded-2xl transition-all relative z-10"
        >
          {t.terminate}
        </button>
      )}
    </div>
  );
};

export default Dashboard;
