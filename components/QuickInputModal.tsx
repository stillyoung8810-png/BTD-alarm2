
import React, { useState, useEffect } from 'react';
import { Portfolio, Trade } from '../types';
import { I18N, CUSTOM_GRADIENT_LOGOS } from '../constants';
import { X, Zap, ChevronRight, AlertCircle } from 'lucide-react';

interface QuickInputModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (trade: Trade) => void;
}

const QuickInputModal: React.FC<QuickInputModalProps> = ({ lang, portfolio, onClose, onSave }) => {
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [activeSection, setActiveSection] = useState<1 | 2 | 3>(1); // 1, 2, 3 sections
  const [price, setPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);
  const [selectedStock, setSelectedStock] = useState<string>(portfolio.strategy.ma1.stock);
  
  const t = I18N[lang];
  const feeRate = portfolio.feeRate || 0.25;

  const holdings = Array.from(new Set(portfolio.trades.map(t => t.stock)));

  // Update selected stock based on active section for buy
  useEffect(() => {
    if (type === 'buy') {
      if (activeSection === 1) setSelectedStock(portfolio.strategy.ma1.stock);
      else if (activeSection === 2) setSelectedStock(portfolio.strategy.ma2.stock);
      else setSelectedStock(portfolio.strategy.ma3.stock);
    }
  }, [activeSection, type, portfolio.strategy]);

  useEffect(() => {
    if (type === 'buy' && price > 0) {
      const availableFunds = portfolio.dailyBuyAmount;
      const feePerUnit = price * (feeRate / 100);
      const totalCostPerUnit = price + feePerUnit;
      const qty = Math.floor(availableFunds / totalCostPerUnit);
      setQuantity(qty);
    }
  }, [type, price, portfolio.dailyBuyAmount, feeRate]);

  const commission = price * quantity * (feeRate / 100);
  const secFee = type === 'sell' ? (price * quantity * 0.00003) : 0;
  
  const totalAmount = type === 'buy' 
    ? (price * quantity + commission) 
    : (price * quantity - commission - secFee);

  const handleSave = () => {
    if (price <= 0 || quantity <= 0) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const newTrade: Trade = {
      id: Math.random().toString(36).substring(7),
      type,
      stock: selectedStock,
      date: dateStr,
      price,
      quantity,
      fee: commission + secFee
    };
    onSave(newTrade);
  };

  const renderStockLogo = (ticker: string) => {
    const info = CUSTOM_GRADIENT_LOGOS[ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
    const isSelected = selectedStock === ticker;
    return (
      <button 
        key={ticker}
        onClick={() => setSelectedStock(ticker)}
        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-white relative overflow-hidden transition-all ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-60 grayscale hover:grayscale-0'}`}
        style={{ background: info.gradient }}
      >
        <span className="text-[10px] font-black z-10">{ticker}</span>
        <span className="text-[5px] font-bold z-10 uppercase tracking-tighter opacity-80">{info.label.split(' ')[0]}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        <div className="p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Zap size={20} className="text-white fill-white" />
             </div>
             <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t.quickInput}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"><X size={20} /></button>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
            <AlertCircle className="text-amber-500 shrink-0" size={18} />
            <p className="text-[11px] font-bold text-amber-500 leading-snug">
              {type === 'buy' 
                ? (lang === 'ko' ? '기준주가 위치에 따른 구간별 종목을 자동 선택합니다.' : 'Automatically selects stock based on section.') 
                : (lang === 'ko' ? '보유 수량 내에서 지정가 매도를 진행합니다.' : 'Sells specific quantity from holdings.')}
              <br/>
              <span className="opacity-80">{lang === 'ko' ? `수수료율 ${feeRate}% 적용` : `${feeRate}% fee applied`}</span>
            </p>
          </div>

          <div className="flex p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5">
            <button onClick={() => setType('buy')} className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${type === 'buy' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.buy}</button>
            <button onClick={() => setType('sell')} className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${type === 'sell' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.sell}</button>
          </div>

          {type === 'buy' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.activeSection}:</span>
              <div className="flex gap-2">
                {[1, 2, 3].map(sec => (
                  <button 
                    key={sec}
                    onClick={() => setActiveSection(sec as 1|2|3)}
                    className={`flex-1 py-3 rounded-xl text-xs font-black border transition-all ${activeSection === sec ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-500'}`}
                  >
                    {t.section} {sec}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.stock}:</span>
            <div className="flex flex-wrap gap-4">
              {type === 'buy' ? renderStockLogo(selectedStock) : (holdings.length > 0 ? holdings.map(renderStockLogo) : <p className="text-slate-600 text-xs font-bold italic">No holdings</p>)}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.executionPrice}</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                <input 
                  type="number" 
                  value={price || ''}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full p-5 pl-10 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-black text-lg focus:ring-2 focus:ring-blue-500/50 outline-none" 
                />
              </div>
            </div>

            {type === 'sell' && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.quantity}</label>
                <input 
                  type="number" 
                  value={quantity || ''}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  placeholder="0"
                  className="w-full p-5 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-black text-lg focus:ring-2 focus:ring-blue-500/50 outline-none" 
                />
              </div>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-200 dark:border-white/5 space-y-4">
             <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
               <span className="text-[11px] font-bold uppercase tracking-widest">{t.calculatedQty}:</span>
               <span className="text-lg font-black text-slate-900 dark:text-white">{quantity || '0'}</span>
             </div>
             <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
               <span className="text-[11px] font-bold uppercase tracking-widest">{t.calculatedFee}:</span>
               <span className="text-sm font-black text-slate-900 dark:text-white">${commission.toFixed(2)}</span>
             </div>
             {type === 'sell' && (
               <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 animate-in fade-in duration-300">
                 <span className="text-[11px] font-bold uppercase tracking-widest">{t.secFee}</span>
                 <span className="text-sm font-black text-slate-900 dark:text-white">${secFee.toFixed(4)}</span>
               </div>
             )}
             <div className="h-[1px] bg-slate-200 dark:bg-white/5"></div>
             <div className="flex justify-between items-center">
               <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{t.totalAmount}:</span>
               <span className="text-xl font-black text-blue-500">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
             </div>
          </div>
        </div>

        <div className="p-8 border-t border-slate-200 dark:border-white/5 flex gap-4 bg-slate-50 dark:bg-slate-900/30">
          <button onClick={onClose} className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">{t.cancel}</button>
          <button onClick={handleSave} className="flex-[2] py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl dark:shadow-xl dark:shadow-blue-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all">
            {t.save} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickInputModal;
