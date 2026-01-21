
import React, { useState, useMemo, useEffect } from 'react';
import { Portfolio, Trade } from '../types';
import { X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { CUSTOM_GRADIENT_LOGOS, I18N } from '../constants';
import { fetchStockPrices } from '../services/stockService';

interface PortfolioDetailsModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onDeleteTrade: (tradeId: string) => void;
  isHistory?: boolean;
}

const PortfolioDetailsModal: React.FC<PortfolioDetailsModalProps> = ({ lang, portfolio, onClose, onDeleteTrade, isHistory }) => {
  // Helper for consistent date keys (YYYY-MM-DD) based on Local Time
  const getDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getDateKey(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date()); 

  const t = I18N[lang];

  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});
  const isReadOnly = isHistory ?? !!portfolio.isClosed;

  // Group holdings by stock
  const holdingsSummary = useMemo(() => {
    const summary: Record<string, { quantity: number; totalCost: number }> = {};
    
    portfolio.trades.forEach(tr => {
      if (!summary[tr.stock]) {
        summary[tr.stock] = { quantity: 0, totalCost: 0 };
      }
      if (tr.type === 'buy') {
        summary[tr.stock].quantity += tr.quantity;
        summary[tr.stock].totalCost += (tr.price * tr.quantity + tr.fee);
      } else {
        summary[tr.stock].quantity -= tr.quantity;
        // 매도 시에는 평균 단가를 유지하기 위해 비례적으로 차감
        const avgPrice = summary[tr.stock].totalCost / (summary[tr.stock].quantity + tr.quantity);
        summary[tr.stock].totalCost = summary[tr.stock].quantity * avgPrice;
      }
    });

    return Object.entries(summary)
      .filter(([_, data]) => data.quantity > 0)
      .map(([ticker, data]) => ({
        ticker,
        quantity: data.quantity,
        avgPrice: data.totalCost / data.quantity,
        valuation: data.quantity * (stockPrices[ticker] || 0)
      }));
  }, [portfolio.trades, stockPrices]);

  // 주가 데이터 가져오기
  useEffect(() => {
    const fetchPrices = async () => {
      const holdingsEntries = Object.entries(
        portfolio.trades.reduce((acc, tr) => {
          if (tr.type === 'buy') {
            acc[tr.stock] = (acc[tr.stock] || 0) + tr.quantity;
          } else {
            acc[tr.stock] = (acc[tr.stock] || 0) - tr.quantity;
          }
          return acc;
        }, {} as Record<string, number>)
      ) as [string, number][];

      const holdings = holdingsEntries
        .filter(([, qty]) => qty > 0)
        .map(([ticker]) => ticker);

      if (holdings.length > 0) {
        const prices = await fetchStockPrices(holdings);
        const priceMap: Record<string, number> = {};
        Object.entries(prices).forEach(([symbol, data]) => {
          priceMap[symbol] = data.price;
        });
        setStockPrices(priceMap);
      }
    };

    fetchPrices();
  }, [portfolio.trades]);

  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // JS getDay(): 0 (Sun), 1 (Mon), ..., 4 (Thu), 5 (Fri), 6 (Sat)
    // We want a Mon-Fri grid (5 columns)
    const startDay = firstDay.getDay(); 
    
    // Calculate offset for Mon-Fri grid
    // If startDay is Sun(0), offset is -1 (shouldn't happen in 5-col grid logically, but for safety)
    // If startDay is Mon(1), offset is 0
    // If startDay is Thu(4), offset is 3
    let offset = startDay - 1;
    if (startDay === 0) offset = 6; // Sunday
    
    // For 5-column grid (Mon-Fri), if it starts on Sat/Sun, we skip to next Mon
    const days = [];
    // Adjust offset to be within 0-4 for the first week
    const initialOffset = offset > 4 ? 0 : offset;
    
    for (let i = 0; i < initialOffset; i++) days.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
        days.push(date);
      }
    }
    return days;
  }, [currentMonth]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  // Consistent date filtering logic - Match YYYY-MM-DD
  const tradesForDay = (dateStr: string) => {
    return portfolio.trades.filter(tr => tr.date === dateStr);
  };

  const selectedDayTrades = tradesForDay(selectedDate);

  const renderStockIcon = (ticker: string, size: 'sm' | 'md' = 'sm', index: number = 0) => {
    const info = CUSTOM_GRADIENT_LOGOS[ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
    const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
    const textClasses = size === 'sm' ? 'text-[7px]' : 'text-[10px]';
    const labelClasses = size === 'sm' ? 'text-[4px]' : 'text-[6px]';

    const stackStyle: React.CSSProperties = size === 'sm' ? {
      marginLeft: index > 0 ? '-1.2rem' : '0',
      zIndex: 10 + index, 
      transform: `rotate(${index * 3}deg) translateY(${index * 1}px)`,
    } : {};

    return (
      <div 
        key={`${ticker}-${index}`}
        className={`${sizeClasses} rounded-full flex flex-col items-center justify-center text-white shadow-lg relative overflow-hidden flex-shrink-0 border border-white/20`}
        style={{ ...stackStyle, background: info.gradient }}
      >
        <span className={`${textClasses} font-black leading-none z-10`}>{ticker}</span>
        <span className={`${labelClasses} font-bold opacity-80 mt-0.5 uppercase text-center px-0.5 z-10`}>{info.label.split(' ')[0]}</span>
        <div className="absolute inset-0 bg-white/5"></div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-4xl bg-white dark:bg-[#161d2a] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] animate-in zoom-in-95 duration-200"
        style={{ touchAction: 'pan-y' }}
      >
        
        {/* Header - 고정 */}
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/30 shrink-0">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>{portfolio.name}</span>
            {isReadOnly && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
                {lang === 'ko' ? '정산 완료' : 'Settled'}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
            <X size={24} />
          </button>
        </div>

        {/* Content - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8 space-y-8 md:space-y-10 scrollbar-hide bg-slate-50 dark:bg-transparent">
          
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '보유 자산 요약' : 'Holdings Summary'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {holdingsSummary.length === 0 ? (
                <div className="col-span-full p-8 bg-slate-100 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/5 text-center">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-600 uppercase tracking-widest">{lang === 'ko' ? '보유 자산이 없습니다.' : 'No holdings available.'}</p>
                </div>
              ) : (
                holdingsSummary.map((item, idx) => (
                  <div key={item.ticker} className="bg-white dark:bg-slate-900/40 p-6 rounded-[2rem] border border-slate-200 dark:border-white/5 flex items-center gap-6 relative overflow-hidden group shadow-md dark:shadow-lg backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
                    {renderStockIcon(item.ticker, 'md')}
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">{t.quantity}:</span>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{item.quantity.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">{lang === 'ko' ? '평균 단가:' : 'Avg Price:'}</span>
                        <p className="text-sm font-black text-slate-900 dark:text-white">${item.avgPrice.toFixed(2)}</p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-white/5">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">{t.totalValuation}:</span>
                        <p className="text-base font-black text-emerald-500">${item.valuation.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '평일 거래 달력' : 'Weekday Calendar'}</h3>
            <div className="bg-white dark:bg-slate-900/40 p-8 rounded-[2rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-md dark:shadow-inner backdrop-blur-sm">
              
              <div className="flex items-center justify-between mb-8">
                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronLeft size={24} /></button>
                <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">
                  {year}{lang === 'ko' ? '년 ' : '. '}{month + 1}{lang === 'ko' ? '월' : ''}
                </h4>
                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronRight size={24} /></button>
              </div>

              <div className="grid grid-cols-5 mb-4">
                {['월','화','수','목','금'].map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-slate-500 uppercase py-2 tracking-widest">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-5 gap-3">
                {calendarGrid.map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} className="min-h-[120px] bg-slate-100 dark:bg-white/5 rounded-3xl opacity-20"></div>;

                  const day = date.getDate();
                  const dateKey = getDateKey(date);
                  const dayTrades = tradesForDay(dateKey);
                  const isSelected = selectedDate === dateKey;
                  
                  const buys = dayTrades.filter(tr => tr.type === 'buy');
                  const sells = dayTrades.filter(tr => tr.type === 'sell');

                  return (
                    <button 
                      key={dateKey} 
                      onClick={() => setSelectedDate(dateKey)}
                      className={`relative min-h-[120px] rounded-3xl border transition-all flex flex-col items-center p-3 gap-3 group/day ${
                        isSelected 
                          ? 'bg-blue-50 dark:bg-blue-600/20 border-blue-500 shadow-xl scale-105 z-10' 
                          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 shadow-sm'
                      }`}
                    >
                      <span className={`text-[11px] font-black ${isSelected ? 'text-blue-500' : 'text-slate-500'}`}>{day}</span>
                      
                      <div className="flex flex-col gap-2 w-full items-center">
                        {buys.length > 0 && (
                          <div className="flex pl-3 items-center justify-center animate-in zoom-in-50 duration-300">
                            {buys.map((b, idx) => renderStockIcon(b.stock, 'sm', idx))}
                          </div>
                        )}
                        {sells.length > 0 && (
                          <div className="flex pl-3 items-center justify-center animate-in zoom-in-50 duration-300">
                            {sells.map((s, idx) => renderStockIcon(s.stock, 'sm', idx))}
                          </div>
                        )}
                        {dayTrades.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {buys.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>}
                            {sells.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '선택한 날짜 거래 내역' : 'Selected Date Transactions'}</h3>
            <div className="space-y-4">
              {selectedDayTrades.length === 0 ? (
                <div className="p-10 bg-slate-100 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/5 text-center backdrop-blur-sm">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-600 uppercase tracking-widest">{t.noHistory}</p>
                </div>
              ) : (
                selectedDayTrades.map(trade => {
                  const isFinalSell = trade.type === 'sell' && trade.id.startsWith('final-');
                  return (
                    <div key={trade.id} className="bg-white dark:bg-white/5 p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 relative overflow-hidden group shadow-md dark:shadow-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-all backdrop-blur-sm">
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${trade.type === 'buy' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      
                      <div className="flex items-center justify-between mb-6 pr-12">
                        <div className="flex items-center gap-4">
                          {renderStockIcon(trade.stock, 'md')}
                          <div>
                             <h4 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">
                               {isFinalSell ? `[${lang === 'ko' ? '최종 정산 매도' : 'Final Settlement Sell'}] ` : ''}
                               {trade.stock}
                             </h4>
                             <p className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">{trade.type === 'buy' ? t.buy : t.sell} 매매</p>
                          </div>
                        </div>
                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${trade.type === 'buy' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                           {trade.type === 'buy' ? t.buy : t.sell}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4">
                         <div>
                           <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t.executionPrice}:</span>
                           <p className="text-sm font-black text-slate-900 dark:text-white">${trade.price.toLocaleString()}</p>
                         </div>
                         <div>
                           <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t.quantity}:</span>
                           <p className="text-sm font-black text-slate-900 dark:text-white">{trade.quantity}</p>
                         </div>
                         <div>
                           <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t.fee}:</span>
                           <p className="text-sm font-black text-slate-900 dark:text-white">${trade.fee.toFixed(2)}</p>
                         </div>
                         <div className="text-right">
                           <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{lang === 'ko' ? '정산금:' : 'Settlement:'}</span>
                           <p className={`text-sm font-black ${trade.type === 'buy' ? 'text-emerald-500' : 'text-rose-500'}`}>
                             {(trade.type === 'buy'
                               ? (trade.price * trade.quantity + trade.fee)
                               : (trade.price * trade.quantity - trade.fee)
                             ).toLocaleString()}
                           </p>
                         </div>
                      </div>
                      
                      {!isReadOnly && (
                        <button 
                          onClick={() => {
                            if (confirm(lang === 'ko' ? '이 거래 기록을 삭제하시겠습니까?' : 'Are you sure you want to delete this record?')) {
                              onDeleteTrade(trade.id);
                            }
                          }}
                          className="absolute top-6 right-6 p-2.5 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-600 transition-all hover:text-white border border-rose-500/20 shadow-sm"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="p-8 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 flex gap-4">
           <button 
            onClick={onClose}
            className="w-full py-5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-300 dark:border-white/10 transition-all shadow-md"
           >
             {lang === 'ko' ? '닫기' : 'Close'}
           </button>
        </div>
      </div>
    </div>
  );
};

export default PortfolioDetailsModal;
