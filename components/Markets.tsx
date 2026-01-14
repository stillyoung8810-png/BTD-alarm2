
import React, { useState, useRef } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { AVAILABLE_STOCKS, MOCK_PRICES, I18N, CUSTOM_GRADIENT_LOGOS } from '../constants';
import { TrendingUp, Activity, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';

const MOCK_CHART_DATA = Array.from({ length: 90 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (89 - i));
  return {
    name: date.toLocaleDateString('ko-KR', { month: 'short' }),
    price: 400 + Math.random() * 100,
    ma20: 410 + Math.random() * 50
  };
});

const MOCK_RSI: Record<string, number> = AVAILABLE_STOCKS.reduce((acc, ticker) => {
  acc[ticker] = Math.floor(Math.random() * 70) + 15;
  return acc;
}, {} as Record<string, number>);

const Markets: React.FC<{lang: 'ko' | 'en'}> = ({ lang }) => {
  const [selectedStock, setSelectedStock] = useState('QQQ');
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = I18N[lang];

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - 200 : scrollLeft + 200;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
            <Activity className="text-white" size={20} />
          </div>
          <h2 className="text-2xl font-black dark:text-white uppercase tracking-tight">{t.globalMarkets}</h2>
        </div>

        {/* Chart View */}
        <div className="bg-white dark:bg-[#080B15] p-8 rounded-[2.5rem] overflow-hidden h-96 border border-slate-200 dark:border-white/5 shadow-xl relative">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <h3 className="text-[10px] font-black text-slate-500 mb-1 uppercase tracking-[0.2em]">{selectedStock} Performance</h3>
              <p className="text-2xl font-black dark:text-white tracking-tighter">${MOCK_PRICES[selectedStock]?.toFixed(2)}</p>
            </div>
            <div className="bg-emerald-500/10 px-4 py-1.5 rounded-full text-emerald-500 text-[10px] font-black uppercase border border-emerald-500/20 flex items-center gap-1.5">
              <TrendingUp size={12} /> +1.2% Today
            </div>
          </div>
          
          <div className="absolute inset-x-0 bottom-0 h-64 opacity-50 pointer-events-none">
             <div className="absolute inset-0 bg-gradient-to-t from-blue-600/5 to-transparent"></div>
          </div>

          <ResponsiveContainer width="100%" height="70%">
            <AreaChart data={MOCK_CHART_DATA}>
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
                interval={30}
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
            </AreaChart>
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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => scroll('left')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        
        <div className="relative group">
          {/* Gradient Masks for better focus on scrollable content */}
          <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#06090F] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#06090F] to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div 
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-8 pt-4 -mx-6 px-10 md:mx-0 md:px-4 scrollbar-hide"
          >
            {AVAILABLE_STOCKS.map((ticker) => {
              const isSelected = selectedStock === ticker;
              const rsiValue = MOCK_RSI[ticker] || 50;
              const rsiColor = rsiValue > 70 ? 'text-rose-500' : rsiValue < 30 ? 'text-emerald-500' : 'text-blue-400';
              const rsiBg = rsiValue > 70 ? 'bg-rose-500' : rsiValue < 30 ? 'bg-emerald-500' : 'bg-blue-500';
              const gradientInfo = CUSTOM_GRADIENT_LOGOS[ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };

              return (
                <button
                  key={ticker}
                  onClick={() => setSelectedStock(ticker)}
                  className={`flex-shrink-0 w-48 bg-white dark:bg-[#080B15] p-6 rounded-[2rem] border transition-all duration-300 text-left group flex flex-col gap-5 ${
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
                      <p className="text-lg font-black dark:text-white tracking-tighter">${MOCK_PRICES[ticker]?.toFixed(2)}</p>
                      <p className="text-[10px] font-black text-emerald-500 mt-1 flex items-center gap-1 uppercase">
                        <TrendingUp size={10} /> +0.45%
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">RSI (14)</span>
                        <span className={`text-[10px] font-black ${rsiColor}`}>{rsiValue}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${rsiBg}`} 
                          style={{ width: `${rsiValue}%` }}
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
