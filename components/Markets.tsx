
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { AVAILABLE_STOCKS, I18N, CUSTOM_GRADIENT_LOGOS } from '../constants';
import { TrendingUp, TrendingDown, Activity, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchStockPrices, fetchStockPriceHistory } from '../services/stockService';
import { StockData } from '../types';
import { getMarketStatus } from '../utils/marketUtils';

const Markets: React.FC<{lang: 'ko' | 'en'}> = ({ lang }) => {
  const [selectedStock, setSelectedStock] = useState('QQQ');
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [chartData, setChartData] = useState<Array<{ name: string; price: number; ma20: number; ma60: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = I18N[lang];

  // 마켓 상태 계산
  const marketStatus = useMemo(() => getMarketStatus(lang), [lang]);

  // 초기 주가 데이터 로드
  useEffect(() => {
    const loadStockData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchStockPrices(AVAILABLE_STOCKS);
        setStockData(data);
      } catch (error) {
        console.error('Error loading stock data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadStockData();
  }, []);

  // 선택된 종목의 차트 데이터 로드
  useEffect(() => {
    const loadChartData = async () => {
      if (!selectedStock) return;
      try {
        const history = await fetchStockPriceHistory(selectedStock, 90);
        // Recharts 형식으로 변환
        const formatted = history.map(item => {
          const date = new Date(item.date);
          return {
            name: date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }),
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
  }, [selectedStock, lang]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - 200 : scrollLeft + 200;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
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
        <div className="bg-white dark:bg-[#080B15] p-8 rounded-[2.5rem] overflow-hidden h-96 border border-slate-200 dark:border-white/5 shadow-xl relative">
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

          <ResponsiveContainer width="100%" height="70%">
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
                <YAxis domain={['dataMin - 20', 'dataMax + 20']} hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '20px', 
                    backgroundColor: '#080B15',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                    padding: '12px 16px'
                  }} 
                  itemStyle={{ color: '#2563eb', fontWeight: '900', fontSize: '14px' }}
                  labelStyle={{ display: 'none' }}
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
          <div className="flex items-center gap-2">
            <BarChart2 className="text-slate-500" size={16} />
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
              {lang === 'ko' ? '전일 종가 정보' : 'Previous Close Info'}
            </h3>
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
        
        <div className="relative group">
          {/* Gradient Masks for better focus on scrollable content */}
          <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-slate-50 dark:from-[#06090F] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-50 dark:from-[#06090F] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div 
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-8 pt-4 -mx-6 px-10 md:mx-0 md:px-4 scrollbar-hide snap-x snap-mandatory"
          >
            {AVAILABLE_STOCKS.map((ticker) => {
              const isSelected = selectedStock === ticker;
              const data = stockData[ticker];
              const rsiValue = data?.rsi || 50;
              const price = data?.price || 0;
              const changePct = data?.changePercent || 0;
              const isPositive = changePct >= 0;
              const rsiColor = rsiValue > 70 ? 'text-rose-500' : rsiValue < 30 ? 'text-emerald-500' : 'text-blue-400';
              const rsiBg = rsiValue > 70 ? 'bg-rose-500' : rsiValue < 30 ? 'bg-emerald-500' : 'bg-blue-500';
              const gradientInfo = CUSTOM_GRADIENT_LOGOS[ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };

              return (
                <button
                  key={ticker}
                  onClick={() => setSelectedStock(ticker)}
                  className={`flex-shrink-0 w-48 bg-white dark:bg-[#080B15] p-6 rounded-[2rem] border transition-all duration-300 text-left group flex flex-col gap-5 snap-center cursor-grab active:cursor-grabbing ${
                    isSelected 
                      ? 'border-blue-500 ring-4 ring-blue-500/15 shadow-xl -translate-y-2' 
                      : 'border-slate-200 dark:border-white/5 shadow-md hover:border-slate-300 dark:hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white shadow-lg overflow-hidden relative transition-all ${isSelected ? 'scale-110' : 'opacity-80'}`}
                      style={{ background: gradientInfo.gradient }}
                    >
                      <span className="text-[10px] font-black z-10 leading-none">{ticker}</span>
                      <span className="text-[5px] font-bold opacity-80 z-10 uppercase tracking-tighter mt-0.5">{gradientInfo.label.split(' ')[0]}</span>
                      <div className="absolute inset-0 bg-black/5"></div>
                    </div>
                    <span className={`font-black text-sm transition-colors ${isSelected ? 'text-blue-500' : 'dark:text-white'}`}>
                      {ticker}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Price</span>
                      <p className="text-lg font-black dark:text-white tracking-tighter">${price.toFixed(2)}</p>
                      <p className={`text-[10px] font-black mt-1 flex items-center gap-1 uppercase ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">RSI (14)</span>
                        <span className={`text-[10px] font-black ${rsiColor}`}>{Math.round(rsiValue)}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${rsiBg}`} 
                          style={{ width: `${Math.min(Math.max(rsiValue, 0), 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Markets;
