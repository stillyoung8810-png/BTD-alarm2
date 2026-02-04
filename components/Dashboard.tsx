
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Portfolio } from '../types';
import { I18N, CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
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
  Camera
} from 'lucide-react';
import { calculateInvestedAmount, calculateYield, determineActiveSection, calculateAlreadyRealized, calculateHoldings, getMaPeriods, getMAValuesForAlignment } from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import HoverTip from './HoverTip';
import { getStockPrices, initDatabase } from '../services/db';
import { formatPortfolioDailyExecutionBlock, joinDailyExecutionBlocks } from '../utils/dailyExecutionSummary';

interface DashboardProps {
  lang: 'ko' | 'en';
  portfolios: Portfolio[];
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

  const t = I18N[lang];
  const isPositiveChange = totalValuationChange >= 0;
  const changeColor = totalValuationChange === 0 ? 'text-slate-400' : (isPositiveChange ? 'text-emerald-500' : 'text-rose-500');

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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.totalValuation}</span>
                <span className="text-3xl font-black dark:text-white tracking-tighter">
                  ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800"></div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.gain24h}</span>
                <span className={`text-3xl font-black tracking-tighter ${changeColor}`}>
                  {totalValuationChange === 0
                    ? '$0.00'
                    : `${isPositiveChange ? '+' : '-'}$${Math.abs(totalValuationChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                </span>
                <span className={`text-xs font-bold mt-0.5 ${changeColor}`}>
                  {Number.isNaN(totalValuationChangePct)
                    ? '-'
                    : `${totalValuationChangePct >= 0 ? '+' : ''}${totalValuationChangePct.toFixed(2)}%`}
                </span>
            </div>
          </div>
          
          <button 
            onClick={onOpenCreator}
            className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {portfolios.length === 0 ? (
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
             <p className="text-slate-500">{lang === 'ko' ? '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.' : 'No portfolios. Please add a portfolio.'}</p>
          </div>
        ) : (
          portfolios.map(p => (
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
              onDailyExecutionBlock={
                onDailyExecutionSummaryChange ? setDailyExecutionBlockForId : undefined
              }
            />
          ))
        )}
      </section>
    </div>
  );
};

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
  const t = I18N[lang];
  // 다분할 매매법일 때는 multiSplit.targetStock을 사용, 아니면 ma0.stock 사용
  const ma0Ticker = portfolio.strategy.multiSplit?.targetStock || portfolio.strategy.ma0.stock;
  const gradientInfo = CUSTOM_GRADIENT_LOGOS[ma0Ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
  const isAlarmEnabled = portfolio.alarmconfig?.enabled;

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
      portfolio.strategy.multiSplit
        ? ''
        : `${portfolio.id}-${portfolio.strategy.ma0?.stock}-${maAPeriod}-${maBPeriod}`,
    [portfolio.id, !!portfolio.strategy.multiSplit, portfolio.strategy.ma0?.stock, maAPeriod, maBPeriod]
  );

  // 이평선 구간매수: 구간 분석, RSI, 정배열, 익절 라인 체크 통합 로직
  useEffect(() => {
    if (portfolio.strategy.multiSplit) {
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
  }, [portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, maSectionDepsKey]);

  // 쿼터 손절 모드: DB 플래그 또는 T > a-1 (신규 진입 시 플래그 갱신)
  const T = portfolio.strategy.multiSplit
    ? (() => {
        const holdings = calculateHoldings(portfolio);
        const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
        const oneTime = portfolio.dailyBuyAmount;
        if (oneTime === 0) return 0;
        return Math.ceil((totalInvested / oneTime) * 100) / 100;
      })()
    : 0;
  const a = portfolio.strategy.multiSplit?.totalSplitCount ?? 0;
  const isInQuarterModeByT = T > a - 1 && T <= a; // 신규 쿼터 진입 조건 (플래그 갱신용)
  const isInQuarterMode = portfolio.isQuarterMode === true; // 표시/계산은 DB 플래그만 사용 (해제 후 복귀 시 T>a-1이어도 false)

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
    } else {
      return {
        name: lang === 'ko' ? '이평선 구간매수' : 'MA Interval Buying',
        icon: <TrendingUp size={14} className="text-blue-500" />
      };
    }
  };

  const strategyInfo = getStrategyInfo();

  // 다분할 매매법의 현재 시행 회차(T) – 포트폴리오가 바뀔 때만 계산
  const currentRound = useMemo(() => {
    if (!portfolio.strategy.multiSplit) return 0;

    // 현재 보유 중인 종목의 매수금액만 계산 (매도된 부분은 제외)
    const holdings = calculateHoldings(portfolio);
    const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);

    const oneTimeAmount = portfolio.dailyBuyAmount;
    if (oneTimeAmount === 0) return 0;

    // T = 현재 보유 중인 매수금액 / 1회 매수액, 소수점 둘째 자리 올림
    return Math.ceil((totalInvested / oneTimeAmount) * 100) / 100;
  }, [portfolio]);

  // 다분할 매매법의 현재 구간 판별 (전반전: T >= 0.5)
  const getMultiSplitPhase = (): 'first' | 'second' | 'quarter' | null => {
    if (!portfolio.strategy.multiSplit) return null;
    
    const T = currentRound;
    const a = portfolio.strategy.multiSplit.totalSplitCount;
    
    if (T >= 0.5 && T < a / 2) return 'first';
    if (T >= a / 2 && T < a - 1) return 'second';
    if (T > a - 1 && T <= a) return 'quarter';
    
    return null;
  };

  const multiSplitPhase = getMultiSplitPhase();

  // IndexedDB에서 최근 N 영업일 가져오기 (실제 거래가 있었던 날짜만)
  const getRecentTradingDays = async (days: number): Promise<string[]> => {
    if (!portfolio.strategy.multiSplit) return [];
    
    try {
      await initDatabase();
      const targetStock = portfolio.strategy.multiSplit.targetStock;
      
      // IndexedDB에서 최근 데이터 가져오기 (충분히 많은 날짜를 가져와서 필터링)
      const records = await getStockPrices(targetStock, days * 2); // 여유있게 가져오기
      
      if (records.length === 0) return [];
      
      // 날짜 기준으로 정렬 (최신순)
      const sortedRecords = records.sort((a, b) => b.date.localeCompare(a.date));
      
      // 최근 N개 날짜만 반환
      return sortedRecords.slice(0, days).map(r => r.date);
    } catch (error) {
      console.error('Error fetching recent trading days from IndexedDB:', error);
      return [];
    }
  };

  // 최근 11 영업일 동안 MOC 매도 기록 확인
  const [recentTradingDays, setRecentTradingDays] = useState<string[]>([]);
  
  useEffect(() => {
    if (!portfolio.strategy.multiSplit) return;

    let cancelled = false;

    const fetchTradingDays = async () => {
      const days = await getRecentTradingDays(11);
      if (cancelled) return;

      // 이전 값과 완전히 동일하면 setState 생략 → 불필요한 재렌더 및 루프 방지
      setRecentTradingDays((prev) => {
        if (prev.length === days.length && prev.every((d, i) => d === days[i])) {
          return prev;
        }
        return days;
      });
    };

    fetchTradingDays();

    return () => {
      cancelled = true;
    };
  }, [portfolio.id, portfolio.strategy.multiSplit?.targetStock]);

  const checkRecentMOCSell = (): { hasMOC: boolean; mocDate?: string } => {
    if (!portfolio.strategy.multiSplit || recentTradingDays.length === 0) return { hasMOC: false };
    
    const mocSells = portfolio.trades.filter(t => 
      t.type === 'sell' && 
      t.isMOC === true && 
      recentTradingDays.includes(t.date)
    );

    if (mocSells.length > 0) {
      // 가장 최근 MOC 매도 날짜 반환
      const sortedMOCSells = mocSells.sort((a, b) => b.date.localeCompare(a.date));
      return { hasMOC: true, mocDate: sortedMOCSells[0].date };
    }

    return { hasMOC: false };
  };

  // 쿼터 손절 모드 활성화 시 새로운 1회 매수금 계산
  const calculateNewOneTimeAmount = (mocDate: string): number => {
    if (!portfolio.strategy.multiSplit) return portfolio.dailyBuyAmount;

    const a = portfolio.strategy.multiSplit.totalSplitCount;
    
    // MOC 매도가 이루어진 시점의 T 계산
    const tradesBeforeMOC = portfolio.trades.filter(t => t.date <= mocDate);
    const portfolioBeforeMOC = { ...portfolio, trades: tradesBeforeMOC };
    const holdingsBeforeMOC = calculateHoldings(portfolioBeforeMOC);
    const totalInvestedBeforeMOC = holdingsBeforeMOC.reduce((sum, h) => sum + h.totalCost, 0);
    const T_atMOC = portfolio.dailyBuyAmount > 0 
      ? Math.ceil((totalInvestedBeforeMOC / portfolio.dailyBuyAmount) * 100) / 100 
      : 0;

    // 남은 회차
    const remainingRounds = a - T_atMOC;

    // 중간 수익금 계산 (MOC 매도 이후의 모든 매도 거래)
    // MOC 매도 시점까지의 거래로 포트폴리오 상태 재구성
    const tradesUpToMOC = portfolio.trades.filter(t => t.date <= mocDate);
    const portfolioUpToMOC = { ...portfolio, trades: tradesUpToMOC };
    
    // MOC 매도 이후의 매도 거래들
    const tradesAfterMOC = portfolio.trades.filter(t => t.date > mocDate && t.type === 'sell');
    
    // 각 매도 거래의 수익/손실 계산
    let intermediateProfit = 0;
    const tempPortfolio = { ...portfolio, trades: [...tradesUpToMOC] };
    
    tradesAfterMOC.forEach(sellTrade => {
      // 매도 시점의 평단가 계산
      const holdingsAtSell = calculateHoldings(tempPortfolio);
      const holdingAtSell = holdingsAtSell.find(h => h.stock === sellTrade.stock);
      const avgPriceAtSell = holdingAtSell?.avgPrice || 0;
      
      if (avgPriceAtSell > 0) {
        // 수익/손실 = (매도가 - 평단가) * 수량 - 수수료
        const profit = (sellTrade.price - avgPriceAtSell) * sellTrade.quantity - sellTrade.fee;
        intermediateProfit += profit;
      }
      
      // 임시 포트폴리오에 매도 거래 추가 (다음 계산을 위해)
      tempPortfolio.trades.push(sellTrade);
    });

    // 잔금 계산
    const remainingFunds = portfolio.dailyBuyAmount * remainingRounds;

    // 새로운 1회 매수금 = (잔금 + 중간 수익금) / 10
    const newOneTimeAmount = (remainingFunds + intermediateProfit) / 10;

    return Math.max(0, newOneTimeAmount);
  };

  // 쿼터 손절 모드 활성화 시 계산 데이터
  const [quarterStopLossData, setQuarterStopLossData] = useState<{
    hasMOC: boolean;
    mocQuantity?: number;
    newOneTimeAmount?: number;
    locBuy?: { price: number; quantity: number };
    locSell?: { price: number; quantity: number };
    limitSell?: { price: number; quantity: number };
  } | null>(null);

  // 쿼터 손절 모드 계산
  useEffect(() => {
    if (!portfolio.strategy.multiSplit || !isInQuarterMode || recentTradingDays.length === 0) {
      setQuarterStopLossData(null);
      return;
    }

    const calculateQuarterStopLoss = async () => {
      const mocCheck = checkRecentMOCSell();
      const holdings = calculateHoldings(portfolio);
      const targetStock = portfolio.strategy.multiSplit.targetStock;
      const targetHolding = holdings.find(h => h.stock === targetStock);
      const avgPrice = targetHolding?.avgPrice || 0;
      const currentQuantity = targetHolding?.quantity || 0;
      const feeRate = portfolio.feeRate || 0.25;

      if (!mocCheck.hasMOC) {
        // MOC 매도 기록 없음
        const mocQuantity = currentQuantity * 0.25;
        const next = {
          hasMOC: false,
          mocQuantity: Math.round(mocQuantity * 100) / 100, // 소수점 2자리
        };
        setQuarterStopLossData((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      } else {
        // MOC 매도 기록 있음
        if (!mocCheck.mocDate || avgPrice <= 0 || currentQuantity <= 0) {
          setQuarterStopLossData((prev) => (prev === null ? prev : null));
          return;
        }

        const newOneTimeAmount = calculateNewOneTimeAmount(mocCheck.mocDate);
        const A = portfolio.strategy.multiSplit.targetReturnRate;

        // LOC 매수: 현재 평균 단가 * 0.9 - 0.01
        const locBuyPrice = Math.max(0.01, avgPrice * 0.9 - 0.01);
        const locBuyQty =
          newOneTimeAmount > 0 && locBuyPrice > 0
            ? Math.floor(newOneTimeAmount / (locBuyPrice * (1 + feeRate / 100)))
            : 0;

        // LOC 매도: 현재 평균 단가 * 0.9, 보유 수량의 25%
        const locSellPrice = avgPrice * 0.9;
        const locSellQty = Math.floor(currentQuantity * 0.25);

        // 지정가 매도: 현재 평균 단가 * (1 + A/100), 보유 수량의 75%
        const limitSellPrice = avgPrice * (1 + A / 100);
        const limitSellQty = Math.floor(currentQuantity * 0.75);

        const next = {
          hasMOC: true as const,
          newOneTimeAmount,
          locBuy:
            locBuyQty > 0
              ? { price: Math.round(locBuyPrice * 100) / 100, quantity: locBuyQty }
              : undefined,
          locSell:
            locSellQty > 0
              ? { price: Math.round(locSellPrice * 100) / 100, quantity: locSellQty }
              : undefined,
          limitSell:
            limitSellQty > 0
              ? { price: Math.round(limitSellPrice * 100) / 100, quantity: limitSellQty }
              : undefined,
        };

        setQuarterStopLossData((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      }
    };

    calculateQuarterStopLoss();
  }, [portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit?.targetStock, portfolio.feeRate, isInQuarterMode, recentTradingDays]);

  // 다분할 매매법의 일별 매매 실행 계산 (effect 의존성에 multiSplitExecutionData 넣지 않음 → setState→블록 effect→report→부모 리렌더 시 재실행/무한루프 방지)
  const [multiSplitExecutionData, setMultiSplitExecutionData] = useState<{
    phase: 'first' | 'second' | 'quarter' | null;
    locBuy1?: { price: number; quantity: number };
    locBuy2?: { price: number; quantity: number };
    locSell?: { price: number; quantity: number };
    limitSell?: { price: number; quantity: number };
    mocSell?: { quantity: number };
  } | null>(null);
  /** 다분할: 1회 매수금 < 1주 가격이면 true → 주문 생성 불가 알림 */
  const [multiSplitInsufficientAmount, setMultiSplitInsufficientAmount] = useState(false);

  const lastMultiSplitExecutionKeyRef = useRef<string | null>(null);

  // 다분할 매매법: 1회 매수금이 1주 가격보다 적은지 확인 (알림/요약 문구용)
  useEffect(() => {
    if (!portfolio.strategy.multiSplit) {
      setMultiSplitInsufficientAmount(false);
      return;
    }
    const targetStock = portfolio.strategy.multiSplit.targetStock;
    const oneTimeAmount = portfolio.dailyBuyAmount;
    let cancelled = false;
    fetchStockPrices([targetStock]).then((prices) => {
      if (cancelled) return;
      const currentPrice = prices[targetStock]?.price ?? 0;
      setMultiSplitInsufficientAmount(currentPrice > 0 && oneTimeAmount < currentPrice);
    }).catch(() => {
      if (!cancelled) setMultiSplitInsufficientAmount(false);
    });
    return () => { cancelled = true; };
  }, [portfolio.id, !!portfolio.strategy.multiSplit, portfolio.strategy.multiSplit?.targetStock, portfolio.dailyBuyAmount]);

  useEffect(() => {
    const calculateMultiSplitExecution = async () => {
      if (!portfolio.strategy.multiSplit || !multiSplitPhase) {
        setMultiSplitExecutionData((prev) => (prev === null ? prev : null));
        return;
      }

      try {
        // multiSplit 파라미터 매핑
        const { targetReturnRate, totalSplitCount, targetStock } = portfolio.strategy.multiSplit;
        const A = targetReturnRate;      // 목표 수익률 (%)
        const a = totalSplitCount;      // 총 분할 횟수
        const T = currentRound;
        
        // LOC 계산 전 유효성 검사
        if (A <= 0 || a <= 0 || T <= 0) {
          setMultiSplitExecutionData(null);
          return;
        }

        // 현재 보유 내역 및 평단가 계산
        const holdings = calculateHoldings(portfolio);
        let targetHolding = holdings.find(h => h.stock === targetStock);
        
        // targetStock이 없으면 첫 번째 보유 종목 사용 (fallback)
        if (!targetHolding && holdings.length > 0) {
          targetHolding = holdings[0];
          console.warn(`[Multi-Split] Target stock "${targetStock}" not found in holdings. Using first holding: ${targetHolding.stock}`);
        }
        
        const avgPrice = targetHolding?.avgPrice || 0;
        const currentQuantity = targetHolding?.quantity || 0;
        
        // 현재 주가 가져오기
        const stockPrices = await fetchStockPrices([targetStock]);
        const currentPrice = stockPrices[targetStock]?.price || 0;
        
        // 평단가가 없으면 현재 주가 사용, 그것도 없으면 계산 불가
        const basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0);
        if (basePrice <= 0) {
          setMultiSplitExecutionData(null);
          return;
        }
        
        const oneTimeAmount = portfolio.dailyBuyAmount;
        const feeRate = portfolio.feeRate || 0.25;
        
        // LOC 기준점 공통 계산
        // LOC 매도 가격 = 평단가 × ( 1 + A × (1 - 2T/a) / 100 )
        // LOC 매수 가격 = LOC 매도 가격 - 0.01
        const locFactor = 1 + (A * (1 - (2 * T) / a)) / 100;
        const rawLocSellPrice = basePrice * locFactor;
        const locSellBasePrice = Math.max(0.01, rawLocSellPrice);
        const locBuyBasePrice = Math.max(0.01, locSellBasePrice - 0.01);

        // 유효성 검사 헬퍼 함수 (수량이 0이어도 가격은 계산 가능하도록 수정)
        const safeCalculate = (price: number, qty: number) => {
          if (isNaN(price) || isNaN(qty) || price <= 0) return null;
          // 수량이 0이어도 가격은 반환 (매수는 가능, 매도는 수량이 0이면 null)
          const finalQty = Math.max(0, Math.floor(qty));
          if (finalQty <= 0) return null; // 수량이 0 이하면 null 반환
          return { price: Number(price.toFixed(2)), quantity: finalQty };
        };
        
        const result: typeof multiSplitExecutionData = {
          phase: multiSplitPhase,
        };

        if (multiSplitPhase === 'first') {
          // 전반전
          // LOC 매수 1: 현재 평단가(0% LOC)에 0.5회분
          const locBuy1Price = basePrice;
          const locBuy1Qty = oneTimeAmount > 0 && locBuy1Price > 0 
            ? (oneTimeAmount * 0.5) / (locBuy1Price * (1 + feeRate / 100))
            : 0;
          result.locBuy1 = safeCalculate(locBuy1Price, locBuy1Qty) || undefined;

          // LOC 매수 2: LOC 매수 공식 적용가 (LOC 매도 기준 -0.01$), 0.5회분
          const locBuy2Price = locBuyBasePrice;
          const locBuy2Qty = oneTimeAmount > 0 && locBuy2Price > 0
            ? (oneTimeAmount * 0.5) / (locBuy2Price * (1 + feeRate / 100))
            : 0;
          result.locBuy2 = safeCalculate(locBuy2Price, locBuy2Qty) || undefined;

          // LOC 매도: 현재 보유 물량의 25%
          const locSellPrice = locSellBasePrice;
          const locSellQty = currentQuantity * 0.25;
          result.locSell = safeCalculate(locSellPrice, locSellQty) || undefined;

          // 지정가 매도: 현재 보유 물량의 75%, 평단가 기준 A% 상방
          const limitSellPrice = basePrice * (1 + A / 100);
          const limitSellQty = currentQuantity * 0.75;
          result.limitSell = safeCalculate(limitSellPrice, limitSellQty) || undefined;
        } else if (multiSplitPhase === 'second') {
          // 후반전
          // LOC 매수: LOC 매수 공식 적용가 (LOC 매도 기준 -0.01$), 1회분
          const locBuyPrice = locBuyBasePrice;
          const locBuyQty = oneTimeAmount > 0 && locBuyPrice > 0
            ? oneTimeAmount / (locBuyPrice * (1 + feeRate / 100))
            : 0;
          result.locBuy2 = safeCalculate(locBuyPrice, locBuyQty) || undefined;

          // LOC 매도: 현재 보유 물량의 25%
          const locSellPrice = locSellBasePrice;
          const locSellQty = currentQuantity * 0.25;
          result.locSell = safeCalculate(locSellPrice, locSellQty) || undefined;

          // 지정가 매도: 현재 보유 물량의 75%, 평단가 기준 A% 상방
          const limitSellPrice = basePrice * (1 + A / 100);
          const limitSellQty = currentQuantity * 0.75;
          result.limitSell = safeCalculate(limitSellPrice, limitSellQty) || undefined;
        }

        // 동일한 입력 조합에 대해 이미 계산했다면 다시 계산/업데이트하지 않음
        const inputKey = [
          portfolio.id,
          portfolio.strategy.multiSplit.targetStock,
          portfolio.strategy.multiSplit.totalSplitCount,
          portfolio.dailyBuyAmount,
          portfolio.feeRate,
          portfolio.trades.length,
          multiSplitPhase,
          currentRound,
        ].join('|');

        if (lastMultiSplitExecutionKeyRef.current === inputKey) {
          return;
        }
        lastMultiSplitExecutionKeyRef.current = inputKey;

        setMultiSplitExecutionData((prev) => {
          const prevJson = prev ? JSON.stringify(prev) : null;
          const nextJson = result ? JSON.stringify(result) : null;
          if (prevJson === nextJson) return prev;
          return result;
        });
      } catch (err) {
        console.error('Error calculating multi-split execution:', err);
        setMultiSplitExecutionData((prev) => (prev === null ? prev : null));
      }
    };

    if (portfolio.strategy.multiSplit) {
      calculateMultiSplitExecution();
    }
  }, [
    portfolio.id,
    portfolio.strategy.multiSplit?.targetStock,
    portfolio.strategy.multiSplit?.totalSplitCount,
    portfolio.dailyBuyAmount,
    portfolio.feeRate,
    portfolio.trades.length,
    multiSplitPhase,
  ]);

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

    // 이평선 구간매수: 구간 계산(maBlockVersion)이 끝나기 전에는 report 안 함 → 알람 켜는 순간 report→부모 리렌더→effect 재실행 무한루프 방지
    if (!portfolio.strategy.multiSplit && isAlarmEnabled && maBlockVersion === 0) return;

    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      quarterStopLossData: quarterStopLossData ?? undefined,
      multiSplitPhase: multiSplitPhase ?? null,
      isQuarterStopLossActive: isInQuarterMode,
      multiSplitOverLimit: multiSplitOverLimit ?? false,
      multiSplitFirstRoundHint: portfolio.strategy.multiSplit && currentRound >= 0 && currentRound < 0.5,
      multiSplitInsufficientAmount: portfolio.strategy.multiSplit ? multiSplitInsufficientAmount : undefined,
      maActiveSection: portfolio.strategy.multiSplit ? undefined : maActiveSection ?? undefined,
      maPartialProfitLines: portfolio.strategy.multiSplit ? undefined : (maPartialProfitLines.length ? maPartialProfitLines : undefined),
      maRsiNotMet: portfolio.strategy.multiSplit ? undefined : maRsiNotMet,
      maAlignmentNotMet: portfolio.strategy.multiSplit ? undefined : maAlignmentNotMet,
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
        const invested = calculateInvestedAmount(current);
        const yieldValue = await calculateYield(current);
        const realized = calculateAlreadyRealized(current);
        if (cancelled) return;
        setInvestedAmount(invested);
        setYieldRate(yieldValue);
        setRealizedProfit(realized);
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
        portfolio.strategy.multiSplit ? 'px-4 py-5' : ''
      }`}
    >
      
      {/* Visual background layers */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50 dark:hidden"></div>
      <div className="absolute -right-12 -top-12 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* 우측 상단 버튼 그룹 */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* 알람 버튼 */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenAlarm();
          }}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
            isAlarmEnabled 
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30' 
              : 'bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title={lang === 'ko' ? '알람 설정' : 'Alarm settings'}
        >
          {isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}
        </button>

        {/* 삭제 버튼 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 active:scale-95"
          title={lang === 'ko' ? '포트폴리오 삭제' : 'Delete portfolio'}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
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

      {/* 좌측 지표 + 우측 AI 스캔 버튼 (flex): 버튼은 투자금액·실현손익 공간의 수직 중앙에 정렬 */}
      <div className={`flex gap-4 relative z-10 min-h-[140px] items-center ${portfolio.strategy.multiSplit ? 'mt-3' : ''}`}>
        <div className="flex-1 flex flex-col justify-center min-w-0 space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.invested}</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">
                {lang === 'ko' ? '(수수료 포함)' : '(Fee included)'}
              </span>
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">
              {isLoading ? '...' : `$${investedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="space-y-1">
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
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAIImage();
          }}
          className="shrink-0 w-24 h-24 rounded-[2.5rem] bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 shadow-md dark:shadow-lg flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          title={lang === 'ko' ? 'AI 매매 인식' : 'AI Trade Recognition'}
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
            <Camera size={24} className="text-white" strokeWidth={2} />
          </div>
        </button>
      </div>

      <div 
        onClick={onOpenExecution}
        className={`bg-blue-50/50 dark:bg-blue-600/15 rounded-[1.5rem] flex items-center justify-between shadow-md dark:shadow-lg dark:shadow-blue-500/20 relative overflow-visible group/action cursor-pointer border border-blue-100 dark:border-blue-500/20 min-h-[80px] ${portfolio.strategy.multiSplit ? 'p-4 mt-3' : 'p-5'}`}
      >
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-white/10 opacity-0 group-hover/action:opacity-100 transition-opacity rounded-[1.5rem]"></div>
        <div className="relative z-10 flex-1 overflow-visible">
          <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
             <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">{t.dailyExecution}</span>
             <Info size={10} className="text-blue-700 dark:text-blue-300" />
             {portfolio.strategy.multiSplit && multiSplitPhase && (
               <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                 multiSplitPhase === 'first' 
                   ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-500/20' 
                   : multiSplitPhase === 'second'
                   ? 'text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-500/20'
                   : 'text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-500/20'
               }`}>
                 {multiSplitPhase === 'first' 
                   ? t.firstHalf
                   : multiSplitPhase === 'second'
                   ? t.secondHalf
                   : t.quarterStopLoss
                 }
               </span>
             )}
             {portfolio.strategy.multiSplit && (
                <HoverTip
                  text={isInQuarterMode ? t.quarterReturnTip : t.quarterEntryTip}
                  className="ml-auto"
                >
                  <span className="text-[9px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                    {t.quarterStopLoss}
                  </span>
                </HoverTip>
             )}
          </div>
          {portfolio.strategy.multiSplit ? (
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
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuickInput();
          }}
          className="w-10 h-10 rounded-xl bg-blue-600/20 dark:bg-white/20 flex items-center justify-center text-blue-700 dark:text-white backdrop-blur-md hover:scale-110 active:scale-95 transition-all shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.2)] shrink-0"
        >
           <Zap size={20} className="fill-current" />
        </button>
      </div>

      <button 
        onClick={onClose}
        className="w-full py-4 text-[10px] font-black bg-slate-50 dark:bg-transparent text-slate-500 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5 uppercase tracking-[0.2em] border border-slate-200 dark:border-white/10 rounded-2xl transition-all relative z-10"
      >
        {t.terminate}
      </button>
    </div>
  );
};

export default Dashboard;
