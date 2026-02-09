
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { AVAILABLE_STOCKS, ALL_STOCKS, PAID_STOCKS, I18N } from '../constants';
import { TrendingUp, TrendingDown, Activity, BarChart2, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { fetchStockPrices, fetchStockPriceHistory } from '../services/stockService';
import { StockData, Portfolio } from '../types';
import { getMarketStatus } from '../utils/marketUtils';
import { calculateHoldings } from '../utils/portfolioCalculations';
import StockLogo from './StockLogo';
import HoverTip from './HoverTip';
import InfoModal from './InfoModal';

// ---------------------------------------------------------------------------
// 날짜 포맷 헬퍼 (CustomTooltip 용)
// ---------------------------------------------------------------------------
const formatDateKR = (raw: string | undefined): string => {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return raw;
  }
};

// ---------------------------------------------------------------------------
// 1배수 종목 상수 (모듈 레벨)
// ---------------------------------------------------------------------------
const ONE_X_STOCKS: readonly string[] = [
  'SPY', 'QQQ', 'SOXX', 'USD', 'STRC', 'BIL', 'ICSH', 'SGOV',
  'TSLA', 'NVDA', 'GOOGL', 'PLTR', 'COIN', 'MSTR', 'BMNR',
] as const;

// ---------------------------------------------------------------------------
// Recharts Tooltip Payload 타입
// ---------------------------------------------------------------------------
interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload?: { date?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

// Custom Tooltip 컴포넌트
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const priceData = payload.find((p) => p.dataKey === 'price');
  const formattedDate = formatDateKR(priceData?.payload?.date ?? label);
  const ma20Data = payload.find((p) => p.dataKey === 'ma20');
  const ma60Data = payload.find((p) => p.dataKey === 'ma60');

  const price = priceData?.value || 0;
  const ma20 = ma20Data?.value || 0;
  const ma60 = ma60Data?.value || 0;

  return (
    <div className="bg-[#080B15] backdrop-blur-md opacity-90 border border-white/10 rounded-2xl p-4 shadow-2xl">
      {formattedDate && (
        <div className="text-white font-black text-sm mb-3 tracking-tight">
          {formattedDate}
        </div>
      )}
      <div className="space-y-2">
        {/* PRICE */}
        {price > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PRICE</span>
            <span className="text-sm font-black text-white ml-auto">${price.toFixed(2)}</span>
          </div>
        )}
        {/* MA 20 */}
        {ma20 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f59e0b]"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MA 20</span>
            <span className="text-sm font-black text-white ml-auto">${ma20.toFixed(2)}</span>
          </div>
        )}
        {/* MA 60 */}
        {ma60 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#8b5cf6]"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MA 60</span>
            <span className="text-sm font-black text-white ml-auto">${ma60.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 토글 스위치 (보유 종목만 보기, 1배수만 보기 공용)
// ---------------------------------------------------------------------------
interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, checked, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
      {label}
    </span>
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
        checked
          ? 'bg-blue-500 shadow-lg shadow-blue-500/50'
          : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// StockCard 하위 컴포넌트
// ---------------------------------------------------------------------------
/** 채권형 ETF 목록 */
const BOND_ETFS = ['STRC', 'SGOV', 'BIL', 'ICSH'] as const;

interface StockCardProps {
  ticker: string;
  data: StockData | undefined;
  isSelected: boolean;
  isLocked: boolean;
  isPaidOnly: boolean;
  lang: 'ko' | 'en';
  lockedTooltip: string;
  isTouch: boolean;
  onSelect: (ticker: string) => void;
  onLockedTouch: () => void;
}

const StockCard: React.FC<StockCardProps> = ({
  ticker, data, isSelected, isLocked, isPaidOnly, lang,
  lockedTooltip, isTouch, onSelect, onLockedTouch,
}) => {
  const rsiValue = data?.rsi || 50;
  const rsiBarValue = isLocked ? 0 : rsiValue;
  const price = data?.price || 0;
  const changePct = data?.changePercent || 0;
  const isPositive = changePct >= 0;
  const isBondEtf = (BOND_ETFS as readonly string[]).includes(ticker);
  const paidAccent = isPaidOnly && !isLocked;

  const baseRsiColor =
    rsiValue > 70 ? 'text-rose-500' : rsiValue < 30 ? 'text-emerald-500' : 'text-blue-400';
  const rsiColor = isBondEtf ? 'text-slate-400' : baseRsiColor;
  const baseRsiBg =
    rsiValue > 70 ? 'bg-rose-500' : rsiValue < 30 ? 'bg-emerald-500' : 'bg-blue-500';
  const rsiBg = isLocked ? 'bg-slate-500/30' : isBondEtf ? 'bg-slate-500/50' : baseRsiBg;

  return (
    <button
      onClick={() => {
        if (isLocked) { if (isTouch) onLockedTouch(); return; }
        onSelect(ticker);
      }}
      className={`relative flex-shrink-0 w-48 bg-white light-card-depth dark:bg-[#080B15] p-6 rounded-[2rem] border transition-all duration-300 text-left group flex flex-col gap-5 snap-center ${
        isLocked
          ? 'border-slate-200 dark:border-white/5 opacity-55 grayscale cursor-not-allowed'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected && !isLocked
          ? 'border-blue-500 ring-4 ring-blue-500/15 shadow-xl -translate-y-2'
          : 'border-slate-200 dark:border-white/5 shadow-md hover:border-slate-300 dark:hover:border-white/10'
      }`}
    >
      {/* Lock 배지 */}
      {isLocked && (
        <div className="absolute top-4 right-4">
          <HoverTip text={lockedTooltip}>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/60 dark:bg-white/10 border border-slate-300/40 dark:border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
              <Lock size={12} /><span>PRO+</span>
            </span>
          </HoverTip>
        </div>
      )}

      {/* 로고 + 티커 */}
      <div className="flex items-center gap-3">
        <div className={`transition-all ${isSelected ? 'scale-110' : 'opacity-80'}`}>
          <StockLogo ticker={ticker} size="md" shape="squircle" paidAccent={paidAccent} dimmed={isLocked} className="w-10 h-10 shadow-lg" />
        </div>
        <div className="flex flex-col">
          <span className={`font-black text-sm transition-colors ${isSelected && !isLocked ? 'text-blue-500' : 'text-slate-900 dark:text-white'}`}>
            {ticker}
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
              <Lock size={12} /> PRO/PREMIUM 전용
            </span>
          )}
        </div>
      </div>

      {/* 가격 */}
      <div className="space-y-4">
        <div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Price</span>
          {isLocked ? (
            <p className="text-lg font-black text-slate-400 dark:text-slate-600 tracking-tighter">—</p>
          ) : (
            <>
              <p className="text-lg font-black dark:text-white tracking-tighter">${price.toFixed(2)}</p>
              <p className={`text-[10px] font-black mt-1 flex items-center gap-1 uppercase ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
              </p>
            </>
          )}
        </div>

        {/* RSI */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <span>RSI (14)</span>
              {isBondEtf && (
                <span
                  className="inline-flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-400/40 px-1.5 py-0.5 text-[8px] font-bold text-amber-400"
                  title={lang === 'ko'
                    ? '해당 종목은 초단기/채권형 ETF로, 가격 변동폭이 작아 RSI 지표의 신뢰도가 낮을 수 있습니다.'
                    : 'This is a short-duration/bond ETF; very small price moves can make RSI less reliable.'
                  }
                >
                  ⚠︎ {lang === 'ko' ? '주의' : 'Info'}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {isLocked ? (
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-600">—</span>
              ) : (
                <span className={`text-[10px] font-black ${rsiColor}`}>{Math.round(rsiValue)}</span>
              )}
              {isBondEtf && (
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                  {lang === 'ko' ? '참고용' : 'Info Only'}
                </span>
              )}
            </div>
          </div>
          <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${rsiBg}`}
              style={{ width: `${Math.min(Math.max(rsiBarValue, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

interface MarketsProps {
  lang: 'ko' | 'en';
  portfolios?: Portfolio[];
  canAccessPaidStocks?: boolean;
}

const Markets: React.FC<MarketsProps> = ({ lang, portfolios = [], canAccessPaidStocks = false }) => {
  const [selectedStock, setSelectedStock] = useState('QQQ');
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [chartData, setChartData] = useState<Array<{ name: string; price: number; ma20: number; ma60: number; date: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHoldingsOnly, setShowHoldingsOnly] = useState(false);
  const [show1xOnly, setShow1xOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const t = I18N[lang];
  const [proInfoOpen, setProInfoOpen] = useState(false);

  const lockedTooltip =
    lang === 'ko' ? 'PRO/PREMIUM 전용 종목입니다.' : 'This ticker is PRO/PREMIUM only.';

  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      (window.matchMedia && window.matchMedia('(hover: none)').matches) ||
      (navigator && (navigator.maxTouchPoints || 0) > 0)
    );
  }, []);

  // 1배수 종목 → 모듈 상수 ONE_X_STOCKS 참조

  // 마켓 상태 계산
  const marketStatus = useMemo(() => getMarketStatus(lang), [lang]);

  // 보유 종목 계산 (활성 포트폴리오만)
  const holdingsSet = useMemo(() => {
    const activePortfolios = portfolios.filter(p => !p.isClosed);
    const holdings: Set<string> = new Set();
    
    activePortfolios.forEach(portfolio => {
      const portfolioHoldings = calculateHoldings(portfolio);
      portfolioHoldings.forEach(h => {
        if (h.quantity > 0) {
          holdings.add(h.stock);
        }
      });
    });
    
    return holdings;
  }, [portfolios]);

  // 필터링된 종목 리스트 (기본 리스트)
  const filteredStocks = useMemo(() => {
    let filtered = ALL_STOCKS;
    
    // 보유 종목만 보기 필터
    if (showHoldingsOnly) {
      filtered = filtered.filter(ticker => holdingsSet.has(ticker));
    }
    
    // 1배수만 보기 필터
    if (show1xOnly) {
      filtered = filtered.filter(ticker => ONE_X_STOCKS.includes(ticker));
    }
    
    return filtered;
  }, [showHoldingsOnly, show1xOnly, holdingsSet]);

  // 무한 루프용 3중 리스트 (끝/처음 자연 연결). 보유 종목만 보기 시에는 중복 노출 방지를 위해 3중 반복하지 않음
  const loopEnabled = filteredStocks.length >= 2 && !showHoldingsOnly;
  const loopedStocks = useMemo(() => {
    if (!loopEnabled) return filteredStocks;
    return [...filteredStocks, ...filteredStocks, ...filteredStocks];
  }, [filteredStocks, loopEnabled]);

  const getCardStep = (): { step: number; startOffset: number } => {
    const el = scrollRef.current;
    if (!el) return { step: 200, startOffset: 0 };
    const children = el.children as unknown as HTMLElement[];
    const first = children?.[0];
    const second = children?.[1];
    if (!first) return { step: 200, startOffset: 0 };
    const startOffset = first.offsetLeft || 0;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth || 200;
    return { step: step > 0 ? step : 200, startOffset };
  };

  // 무한 루프 초기 위치: 가운데(2번째) 리스트로 점프
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!loopEnabled) {
      el.scrollTo({ left: 0 });
      return;
    }
    const baseLen = filteredStocks.length;
    const raf = window.requestAnimationFrame(() => {
      const children = el.children as unknown as HTMLElement[];
      const target = children?.[baseLen]; // 가운데 리스트의 첫 카드
      if (target) el.scrollLeft = target.offsetLeft;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loopEnabled, filteredStocks]);

  // 초기 주가 데이터 로드
  useEffect(() => {
    const loadStockData = async () => {
      setIsLoading(true);
      try {
        const symbolsToFetch = canAccessPaidStocks ? ALL_STOCKS : AVAILABLE_STOCKS;
        const data = await fetchStockPrices(symbolsToFetch);
        setStockData(data);
      } catch (error) {
        console.error('Error loading stock data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadStockData();
  }, [canAccessPaidStocks]);

  // 무료 티어에서 유료 종목이 선택된 상태가 되지 않도록 보정
  useEffect(() => {
    if (canAccessPaidStocks) return;
    if (PAID_STOCKS.includes(selectedStock)) {
      setSelectedStock('QQQ');
      setChartData([]);
    }
  }, [canAccessPaidStocks, selectedStock]);

  // 선택된 종목의 차트 데이터 로드
  useEffect(() => {
    const loadChartData = async () => {
      if (!selectedStock) return;
      if (!canAccessPaidStocks && PAID_STOCKS.includes(selectedStock)) return;
      try {
        const history = await fetchStockPriceHistory(selectedStock, 90);
        // Recharts 형식으로 변환 (날짜 정보 포함)
        const formatted = history.map(item => {
          const date = new Date(item.date);
          return {
            name: date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }),
            date: item.date, // 원본 날짜 저장 (tooltip용)
            price: item.price,
            ma20: item.ma20,
            ma60: item.ma60,
          };
        });
        setChartData(formatted);
      } catch (error) {
        console.error('Error loading chart data:', error);
        setChartData([]);
      }
    };
    loadChartData();
  }, [selectedStock, lang, canAccessPaidStocks]);

  // 차트 Y축 범위 (useMemo — chartData가 바뀔 때만 재계산)
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'] as const;

    const allValues: number[] = [];
    for (const item of chartData) {
      if (item.price > 0) allValues.push(item.price);
      if (item.ma20 > 0) allValues.push(item.ma20);
      if (item.ma60 > 0) allValues.push(item.ma60);
    }
    if (allValues.length === 0) return ['auto', 'auto'] as const;

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const padding = (dataMax - dataMin) * 0.1;
    return [dataMin - padding, dataMax + padding] as const;
  }, [chartData]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { step } = getCardStep();
      scrollRef.current.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
    }
  };

  const handleLoopScroll = () => {
    if (!loopEnabled) return;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const baseLen = filteredStocks.length;
      if (baseLen < 2) return;

      const children = el.children as unknown as HTMLElement[];
      if (!children || children.length < baseLen * 3) return;

      const { step } = getCardStep();
      const middleStart = children?.[baseLen]?.offsetLeft ?? 0; // 가운데 리스트 시작
      const thirdStart = children?.[baseLen * 2]?.offsetLeft ?? 0; // 3번째 리스트 시작
      // 왼쪽: 한 카드 이상 들어갔을 때만 점프 (한 칸 왼쪽에서 마지막 종목 SGOV 보이도록)
      const thresholdLeft = step;
      const thresholdRight = step * 0.5; // 오른쪽: 살짝 넘어갔을 때 점프

      // 가운데 범위를 벗어나면 같은 카드 위치를 유지한 채 가운데로 되돌림
      if (el.scrollLeft < middleStart - thresholdLeft) {
        el.scrollLeft += baseLen * step;
      } else if (el.scrollLeft >= thirdStart + thresholdRight) {
        el.scrollLeft -= baseLen * step;
      }
    });
  };

  const selectedStockData = stockData[selectedStock];
  const changePercent = selectedStockData?.changePercent || 0;
  const isPositiveChange = changePercent >= 0;
  const changeColor = isPositiveChange ? 'text-emerald-500' : 'text-rose-500';
  const changeBg = isPositiveChange ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20';

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
              <Activity className="text-white" size={20} />
            </div>
            <h2 className="text-2xl font-black dark:text-white uppercase tracking-tight">{t.globalMarkets}</h2>
          </div>
          {/* 마켓 상태 배지 */}
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1.5 ${
            marketStatus.isOpen 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}>
            <Activity size={10} className={marketStatus.isOpen ? 'text-emerald-500' : 'text-slate-400'} />
            {marketStatus.message}
          </div>
        </div>

        {/* Chart View */}
        <div className="bg-white light-card-depth dark:bg-[#080B15] p-8 rounded-[2.5rem] overflow-hidden h-96 border border-slate-200 dark:border-white/5 shadow-xl relative">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <h3 className="text-[10px] font-black text-slate-500 mb-1 uppercase tracking-[0.2em]">{selectedStock} Performance</h3>
              <p className="text-2xl font-black dark:text-white tracking-tighter">
                ${selectedStockData?.price?.toFixed(2) || '0.00'}
              </p>
            </div>
            {selectedStockData && (
              <div className={`${changeBg} px-4 py-1.5 rounded-full ${changeColor} text-[10px] font-black uppercase border flex items-center gap-1.5`}>
                {isPositiveChange ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}% Today
              </div>
            )}
          </div>
          
          <div className="absolute inset-x-0 bottom-0 h-64 opacity-50 pointer-events-none">
             <div className="absolute inset-0 bg-gradient-to-t from-blue-600/5 to-transparent"></div>
          </div>

          <ResponsiveContainer width="100%" height="70%" minHeight={200}>
            {chartData.length > 0 ? (
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.3} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis 
                  domain={yAxisDomain as [number | string, number | string]}
                  allowDataOverflow={true}
                  hide 
                />
                <Tooltip 
                  content={<CustomTooltip />}
                  cursor={{ stroke: '#2563eb', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#2563eb" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorPrice)" 
                  animationDuration={1500}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb' }}
                />
                {chartData[0]?.ma20 > 0 && (
                  <Line 
                    type="monotone" 
                    dataKey="ma20" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    dot={false}
                    strokeDasharray="5 5"
                  />
                )}
                {chartData[0]?.ma60 > 0 && (
                  <Line 
                    type="monotone" 
                    dataKey="ma60" 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    dot={false}
                    strokeDasharray="5 5"
                  />
                )}
              </ComposedChart>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm font-bold">
                {isLoading ? (lang === 'ko' ? '차트 데이터 로딩 중...' : 'Loading chart data...') : (lang === 'ko' ? '차트 데이터 없음' : 'No chart data')}
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Horizontal Scrolling Stock Cards with Navigation Arrows */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="text-slate-500" size={16} />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                {lang === 'ko' ? '종목 정보' : 'Stock Info'}
              </h3>
            </div>
            {/* 보유 종목 필터 스위치 */}
            <ToggleSwitch
              label={lang === 'ko' ? '보유 종목만 보기' : 'Holdings Only'}
              checked={showHoldingsOnly}
              onChange={() => setShowHoldingsOnly(!showHoldingsOnly)}
            />
            {/* 1배수만 보기 필터 스위치 */}
            <ToggleSwitch
              label={lang === 'ko' ? '1배수만 보기' : '1x Only'}
              checked={show1xOnly}
              onChange={() => setShow1xOnly(!show1xOnly)}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={() => scroll('left')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              aria-label={lang === 'ko' ? '왼쪽으로 스크롤' : 'Scroll left'}
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              aria-label={lang === 'ko' ? '오른쪽으로 스크롤' : 'Scroll right'}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        
        <div className="relative">
          <div 
            ref={scrollRef}
            onScroll={loopEnabled ? handleLoopScroll : undefined}
            className="flex gap-6 overflow-x-auto pb-8 pt-4 -mx-6 px-10 md:mx-0 md:px-4 scrollbar-hide snap-x snap-mandatory"
          >
            {filteredStocks.length === 0 ? (
              <div className="flex items-center justify-center w-full py-12 text-slate-400 text-sm font-bold">
                {lang === 'ko' ? '보유 중인 종목이 없습니다.' : 'No holdings available.'}
              </div>
            ) : (
              loopedStocks.map((ticker, idx) => {
                const isPaidOnly = PAID_STOCKS.includes(ticker);
                return (
                  <StockCard
                    key={`${ticker}-${idx}`}
                    ticker={ticker}
                    data={stockData[ticker]}
                    isSelected={selectedStock === ticker}
                    isLocked={isPaidOnly && !canAccessPaidStocks}
                    isPaidOnly={isPaidOnly}
                    lang={lang}
                    lockedTooltip={lockedTooltip}
                    isTouch={isTouch}
                    onSelect={setSelectedStock}
                    onLockedTouch={() => setProInfoOpen(true)}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>

      <InfoModal
        open={proInfoOpen}
        title="PRO/PREMIUM 전용"
        message={lockedTooltip}
        onClose={() => setProInfoOpen(false)}
      />
    </div>
  );
};

export default Markets;
