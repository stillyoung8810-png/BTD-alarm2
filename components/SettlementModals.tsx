
import React, { useState } from 'react';
import { Portfolio } from '../types';
import { X } from 'lucide-react';

interface TerminationInputProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (sellAmount: number, fee: number) => void;
}

const TerminationInput: React.FC<TerminationInputProps> = ({ lang, onClose, onSave }) => {
  const [sellAmount, setSellAmount] = useState<string>('');
  const [fee, setFee] = useState<string>('');

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#06090F]/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-[#161d2a] rounded-[1.5rem] shadow-2xl dark:shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 animate-in zoom-in-95 duration-200">
        <div className="p-6 pb-2 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lang === 'ko' ? 'Close Portfolio' : 'Close Portfolio'}</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ko' ? 'Sell Amount:' : 'Sell Amount:'}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input 
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={lang === 'ko' ? '예: 10000' : 'e.g., 10000'}
                className="w-full bg-slate-100/50 dark:bg-[#111827] border border-slate-200 dark:border-white/5 rounded-xl p-4 pl-8 text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ko' ? 'Fee:' : 'Fee:'}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input 
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder={lang === 'ko' ? '예: 50' : 'e.g., 50'}
                className="w-full bg-slate-100/50 dark:bg-[#111827] border border-slate-200 dark:border-white/5 rounded-xl p-4 pl-8 text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
        <div className="p-6 pt-2">
          <button 
            onClick={() => onSave(Number(sellAmount), Number(fee))}
            className="w-24 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 active:scale-95 transition-transform"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

interface ResultProps {
  lang: 'ko' | 'en';
  result: {
    portfolio: Portfolio;
    totalInvested: number;
    profit: number;
    yieldRate: number;
    finalSellAmount: number;
  };
  onClose: () => void;
}

const Result: React.FC<ResultProps> = ({ lang, result, onClose }) => {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#06090F]/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white dark:bg-[#161d2a] rounded-[2rem] shadow-2xl dark:shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 animate-in slide-in-from-bottom-4 duration-300">
        <div className="p-8 pb-2 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{lang === 'ko' ? '정산 결과' : 'Settlement Result'}</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={24} /></button>
        </div>
        <div className="p-8">
          <div className="bg-slate-50 dark:bg-[#111827] p-8 rounded-[1.5rem] border border-slate-200 dark:border-white/5">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-8">{lang === 'ko' ? '정산 결과' : 'Settlement Result'}</h3>
             
             <div className="grid grid-cols-2 gap-y-10">
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '누적 매수금' : 'Cumulative Buy'}</p>
                   <p className="text-xl font-black text-slate-900 dark:text-white">${result.totalInvested.toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '정산 손익' : 'Settlement P&L'}</p>
                   <p className={`text-xl font-black ${result.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ${result.profit >= 0 ? '+' : ''}{result.profit.toLocaleString()}
                   </p>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '수익률' : 'Yield'}</p>
                   <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${result.yieldRate >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <p className={`text-xl font-black ${result.yieldRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                         이평 {result.yieldRate >= 0 ? '+' : ''}{result.yieldRate.toFixed(1)}%
                      </p>
                   </div>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '최종 매도금액' : 'Final Sell'}</p>
                   <p className="text-xl font-black text-slate-900 dark:text-white">${result.finalSellAmount.toLocaleString()}</p>
                </div>
             </div>
          </div>
        </div>
        <div className="p-8 pt-0">
          <button 
            onClick={onClose}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all"
          >
            {lang === 'ko' ? 'Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default { TerminationInput, Result };
