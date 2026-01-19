
import React, { useState, useEffect } from 'react';
import { Portfolio, Trade } from '../types';
import { I18N, CUSTOM_GRADIENT_LOGOS } from '../constants';
import { X, Calendar, ChevronRight } from 'lucide-react';

interface TradeExecutionModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (trade: Trade) => void;
}

const TradeExecutionModal: React.FC<TradeExecutionModalProps> = ({ lang, portfolio, onClose, onSave }) => {
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [selectedStock, setSelectedStock] = useState<string>(portfolio.strategy.ma1.stock);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [price, setPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);
  const [fee, setFee] = useState<number>(0);

  const t = I18N[lang];
  const feeRate = portfolio.feeRate || 0.25;

  const strategyStocks = Array.from(new Set([
    portfolio.strategy.ma1.stock, 
    portfolio.strategy.ma2.stock, 
    portfolio.strategy.ma3.stock
  ]));
  const holdings = Array.from(new Set(portfolio.trades.map(t => t.stock)));

  useEffect(() => {
    const commission = price * quantity * (feeRate / 100);
    const secFee = type === 'sell' ? (price * quantity * 0.00003) : 0;
    setFee(Number((commission + secFee).toFixed(4)));
  }, [price, quantity, feeRate, type]);

  useEffect(() => {
    if (type === 'buy') setSelectedStock(strategyStocks[0]);
    else setSelectedStock(holdings[0] || '');
  }, [type]);

  const handleSave = () => {
    if (price <= 0 || quantity <= 0) return;
    const trade: Trade = {
      id: Math.random().toString(36).substring(7),
      type,
      stock: selectedStock,
      date,
      price,
      quantity,
      fee
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
        <span className="text-[10px] font-black z-10">{ticker}</span>
        <span className="text-[5px] font-bold z-10 uppercase tracking-tighter opacity-80">{info.label.split(' ')[0]}</span>
      </button>
    );
  };

  const totalSettlement = type === 'buy' ? (price * quantity + fee) : (price * quantity - fee);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#161d2a] rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-12 duration-300">
        
        <div className="p-8 md:p-10 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
           <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t.tradeExecutionRecord}</h2>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"><X size={24} /></button>
        </div>

        <div className="p-8 md:p-10 space-y-10 flex-1 overflow-y-auto scrollbar-hide">
          
          <div className="flex p-1.5 bg-slate-100 dark:bg-slate-900 rounded-[1.5rem] border border-slate-200 dark:border-white/5">
            <button onClick={() => setType('buy')} className={`flex-1 py-5 rounded-2xl text-xs font-black transition-all ${type === 'buy' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.buy}</button>
            <button onClick={() => setType('sell')} className={`flex-1 py-5 rounded-2xl text-xs font-black transition-all ${type === 'sell' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-500'}`}>{t.sell}</button>
          </div>

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
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-slate-900 dark:text-white font-bold text-base outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none" 
                />
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

        <div className="p-8 md:p-10 flex gap-6 bg-slate-50 dark:bg-slate-900/30">
           <button onClick={onClose} className="p-4 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"><X size={24} /></button>
           <button 
             onClick={handleSave}
             className="flex-1 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl dark:shadow-2xl dark:shadow-blue-500/30 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all"
           >
             {t.save} <ChevronRight size={20} />
           </button>
        </div>
      </div>
    </div>
  );
};

export default TradeExecutionModal;
