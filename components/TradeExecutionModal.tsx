
import React, { useState, useEffect, useMemo } from 'react';
import { Portfolio, Trade } from '../types';
import { I18N, CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
import { X, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import StockLogo from './StockLogo';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';

const CALENDAR_WEEKDAYS: Record<'ko' | 'en', string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const getDateKey = (value: Date): string => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateKeyToLocalDate = (dateKey: string): Date => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

interface TradeExecutionModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (trade: Trade) => void;
}

const TradeExecutionModal: React.FC<TradeExecutionModalProps> = ({ lang, portfolio, onClose, onSave }) => {
  const isNoStopMultiSplit = !!portfolio.strategy.noStopMultiSplit;
  const targetStock = portfolio.strategy.noStopMultiSplit?.targetStock ?? portfolio.strategy.ma1.stock;
  const strategyStocks = useMemo(
    () => Array.from(new Set(
      isNoStopMultiSplit
        ? [targetStock]
        : [
            portfolio.strategy.ma1.stock,
            portfolio.strategy.ma2.stock,
            portfolio.strategy.ma3.stock,
          ]
    )),
    [isNoStopMultiSplit, targetStock, portfolio.strategy.ma1.stock, portfolio.strategy.ma2.stock, portfolio.strategy.ma3.stock]
  );
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [selectedStock, setSelectedStock] = useState<string>(strategyStocks[0] || '');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [price, setPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);
  const [fee, setFee] = useState<number>(0);
  const [isMOC, setIsMOC] = useState<boolean>(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => dateKeyToLocalDate(new Date().toISOString().split('T')[0]));

  const t = I18N[lang];
  const feeRate = portfolio.feeRate || 0.25;
  const holdings = Array.from(new Set(portfolio.trades.map(t => t.stock)));
  const { executionData: noStopExecutionData } = useNoStopMultiSplitExecution(portfolio);

  useEffect(() => {
    const commission = price * quantity * (feeRate / 100);
    const secFee = type === 'sell' ? (price * quantity * 0.00003) : 0;
    setFee(Number((commission + secFee).toFixed(4)));
  }, [price, quantity, feeRate, type]);

  useEffect(() => {
    if (type === 'buy') {
      setSelectedStock(strategyStocks[0] || '');
      setIsMOC(false); // 매수일 때는 MOC 비활성화
    } else {
      setSelectedStock((isNoStopMultiSplit ? (holdings[0] || targetStock) : holdings[0]) || '');
    }
  }, [type, strategyStocks, holdings, isNoStopMultiSplit, targetStock]);

  useEffect(() => {
    setCalendarMonth(dateKeyToLocalDate(date));
  }, [date]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Array<Date | null> = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [calendarMonth]);

  const formattedDateLabel = useMemo(() => {
    const selected = dateKeyToLocalDate(date);
    return lang === 'ko'
      ? `${selected.getFullYear()}년 ${selected.getMonth() + 1}월 ${selected.getDate()}일`
      : selected.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [date, lang]);

  const handleSave = () => {
    if (price <= 0 || quantity <= 0) return;
    const trade: Trade = {
      id: Math.random().toString(36).substring(7),
      type,
      stock: selectedStock,
      date,
      price,
      quantity,
      fee,
      isMOC: type === 'sell' ? isMOC : undefined
    };
    onSave(trade);
  };

  const renderStockSelector = (ticker: string) => {
    const info = CUSTOM_GRADIENT_LOGOS[ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
    const isSelected = selectedStock === ticker;
    return (
      <button 
        key={ticker}
        onClick={() => setSelectedStock(ticker)}
        className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white relative overflow-hidden active:scale-95 transition-transform p-2 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 scale-105' : 'opacity-40 grayscale hover:grayscale-0'}`}
        style={{ background: info.gradient }}
      >
        <StockLogo
          ticker={ticker}
          size="full"
          shape="squircle2"
          paidAccent={PAID_STOCKS.includes(ticker)}
          className="absolute inset-0"
        />
        <span className="text-[10px] font-black z-10">{ticker}</span>
        <span className="text-[5px] font-bold z-10 uppercase tracking-tighter opacity-80">{info.label.split(' ')[0]}</span>
      </button>
    );
  };

  const totalSettlement = type === 'buy' ? (price * quantity + fee) : (price * quantity - fee);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-[#161d2a] rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-12 duration-300 max-h-[calc(100dvh-2rem)]"
        style={{ touchAction: 'pan-y' }}
      >
        
        {/* 헤더 - 고정 */}
        <div className="p-6 md:p-10 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
           <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t.tradeExecutionRecord}</h2>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"><X size={24} /></button>
        </div>

        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="p-6 md:p-10 space-y-8 md:space-y-10 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          
          <div className="flex p-1.5 bg-slate-100 dark:bg-slate-900 rounded-[1.5rem] border border-slate-200 dark:border-white/5">
            <button onClick={() => setType('buy')} className={`flex-1 py-5 rounded-2xl text-xs font-black transition-all ${type === 'buy' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.buy}</button>
            <button onClick={() => setType('sell')} className={`flex-1 py-5 rounded-2xl text-xs font-black transition-all ${type === 'sell' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.sell}</button>
          </div>

          {type === 'sell' && !isNoStopMultiSplit && (
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/5 gap-4">
              <div className="flex-1">
                <div className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.mocSell}</div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {lang === 'ko' 
                    ? '쿼터 손절 모드를 시작하는 보유량 25% 종가 매도입니다.' 
                    : 'Quarter stop-loss mode: 25% of holdings at closing price.'}
                </div>
              </div>
              <button
                onClick={() => setIsMOC(!isMOC)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                  isMOC ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                    isMOC ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {isNoStopMultiSplit && (
            <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/5">
              <div className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                {lang === 'ko' ? '전략 실행 가이드' : 'Strategy Execution Guide'}
              </div>
              {noStopExecutionData?.isFirstBuy ? (
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t.noStopFirstBuyHint}
                </div>
              ) : (
                <div className="space-y-2">
                  {noStopExecutionData?.lowLoc && (
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {t.lowLoc}: ${noStopExecutionData.lowLoc.price.toFixed(2)} / {noStopExecutionData.lowLoc.quantity}{lang === 'ko' ? '주' : ' shares'}
                    </div>
                  )}
                  {noStopExecutionData?.highLoc && (
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {t.highLoc}: ${noStopExecutionData.highLoc.price.toFixed(2)} / {noStopExecutionData.highLoc.quantity}{lang === 'ko' ? '주' : ' shares'}
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        {t.noStopGuaranteedDailyFill}
                      </div>
                    </div>
                  )}
                  {noStopExecutionData?.isSplitComplete && (
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {t.noStopSplitComplete}
                    </div>
                  )}
                  {noStopExecutionData?.takeProfit && (
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {t.noStopTakeProfitTarget}: {lang === 'ko'
                        ? `평단 대비 +${portfolio.strategy.noStopMultiSplit?.takeProfitPct || 0}% (전량 지정가 매도)`
                        : `Avg price +${portfolio.strategy.noStopMultiSplit?.takeProfitPct || 0}% (full limit sell)`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.stock}:</label>
             <div className="flex flex-wrap gap-4">
                {(type === 'buy' ? strategyStocks : holdings).map(renderStockSelector)}
             </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{type === 'buy' ? t.date : t.sellDate}:</label>
             <div className="relative">
                <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={20} />
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-slate-900 dark:text-white font-bold text-base outline-none focus:ring-2 focus:ring-blue-500/50 text-left"
                >
                  {formattedDateLabel}
                </button>
                {isCalendarOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[121]"
                      onClick={() => setIsCalendarOpen(false)}
                      aria-hidden
                    />
                    <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-[122] rounded-[2rem] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161d2a] shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                          className="p-2 rounded-full text-blue-500"
                          aria-label={lang === 'ko' ? '이전 달' : 'Previous month'}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <div className="text-lg font-black text-slate-900 dark:text-white">
                          {lang === 'ko'
                            ? `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`
                            : calendarMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                          className="p-2 rounded-full text-blue-500"
                          aria-label={lang === 'ko' ? '다음 달' : 'Next month'}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 px-4 pt-4 pb-2">
                        {CALENDAR_WEEKDAYS[lang].map((weekday) => (
                          <div key={weekday} className="h-8 flex items-center justify-center text-xs font-bold text-slate-400">
                            {weekday}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 px-4 pb-4">
                        {calendarDays.map((dayValue, index) => {
                          if (!dayValue) {
                            return <div key={`empty-${index}`} className="h-12" />;
                          }

                          const isWeekend = dayValue.getDay() === 0 || dayValue.getDay() === 6;
                          const dayKey = getDateKey(dayValue);
                          const isSelected = dayKey === date;

                          if (isWeekend) {
                            return (
                              <div
                                key={dayKey}
                                className="h-12 flex items-center justify-center text-gray-300 opacity-30 select-none"
                                aria-disabled="true"
                              >
                                {dayValue.getDate()}
                              </div>
                            );
                          }

                          return (
                            <button
                              key={dayKey}
                              type="button"
                              onClick={() => {
                                setDate(dayKey);
                                setIsCalendarOpen(false);
                              }}
                              className={`h-12 flex items-center justify-center rounded-full text-lg font-medium transition-colors active:scale-[0.97] ${
                                isSelected
                                  ? 'bg-blue-500 text-white'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {dayValue.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.executionPrice}:</label>
               <div className="relative">
                 <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 font-black text-lg">$</span>
                 <input 
                   type="number" 
                   value={price || ''}
                   onChange={(e) => setPrice(Number(e.target.value))}
                   placeholder="0.00"
                   className="w-full p-6 pl-12 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-slate-900 dark:text-white font-black text-xl outline-none" 
                 />
               </div>
            </div>
            <div className="space-y-3">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.quantity}:</label>
               <input 
                 type="number" 
                 value={quantity || ''}
                 onChange={(e) => setQuantity(Number(e.target.value))}
                 placeholder="0"
                 className="w-full p-6 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-slate-900 dark:text-white font-black text-xl outline-none" 
               />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
             <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.calculatedFee} ({type === 'sell' ? 'SEC 포함' : '수수료만'}):</label>
                <div className="relative">
                   <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 font-black text-lg">$</span>
                   <input 
                     type="number" 
                     value={fee || ''}
                     onChange={(e) => setFee(Number(e.target.value))}
                     className="w-full p-6 pl-12 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-slate-900 dark:text-white font-black text-xl outline-none" 
                   />
                </div>
             </div>
             <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.totalAmount}:</label>
                <div className="w-full p-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-start">
                   <span className="text-2xl font-black text-blue-500">${totalSettlement.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
             </div>
          </div>
        </div>

        {/* 버튼 영역 - 하단 고정 */}
        <div className="p-6 md:p-10 flex gap-4 md:gap-6 bg-slate-50 dark:bg-slate-900/30 shrink-0">
           <button onClick={onClose} className="p-3 md:p-4 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"><X size={20} /></button>
           <button 
             onClick={handleSave}
             className="flex-1 py-5 md:py-6 bg-blue-600 text-white rounded-2xl md:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-widest shadow-2xl dark:shadow-2xl dark:shadow-blue-500/30 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all"
           >
             {t.save} <ChevronRight size={20} />
           </button>
        </div>
      </div>
    </div>
  );
};

export default TradeExecutionModal;
