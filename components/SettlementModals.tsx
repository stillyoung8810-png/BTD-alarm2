
import React, { useState, useMemo } from 'react';
import { Portfolio } from '../types';
import { X } from 'lucide-react';
import { calculateHoldings, calculateTotalInvested, calculateAlreadyRealized } from '../utils/portfolioCalculations';
import { CUSTOM_GRADIENT_LOGOS } from '../constants';

export interface FinalSellInput {
  stock: string;
  quantity: number;
  price: number;
  fee: number;
}

interface TerminationInputProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (finalSells: FinalSellInput[], totalFee: number) => void;
}

const TerminationInput: React.FC<TerminationInputProps> = ({ lang, portfolio, onClose, onSave }) => {
  const holdings = useMemo(() => calculateHoldings(portfolio), [portfolio]);
  const [finalSells, setFinalSells] = useState<FinalSellInput[]>(
    holdings.map(h => ({
      stock: h.stock,
      quantity: h.quantity,
      price: 0,
      fee: 0
    }))
  );
  const [additionalFee, setAdditionalFee] = useState<string>('0');

  const updateFinalSell = (index: number, field: keyof FinalSellInput, value: number | string) => {
    const updated = [...finalSells];
    updated[index] = {
      ...updated[index],
      [field]: typeof value === 'string' ? parseFloat(value) || 0 : value
    };
    setFinalSells(updated);
  };

  const calculateFinalSellAmount = () => {
    return finalSells.reduce((sum, fs) => {
      const sellAmount = fs.price * fs.quantity;
      const netAmount = sellAmount - fs.fee;
      return sum + netAmount;
    }, 0);
  };

  const handleSave = () => {
    const totalFee = parseFloat(additionalFee) || 0;
    onSave(finalSells, totalFee);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#06090F]/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#161d2a] rounded-[1.5rem] shadow-2xl dark:shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-6 pb-2 flex justify-between items-center border-b border-slate-200 dark:border-white/5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lang === 'ko' ? '포트폴리오 종료' : 'Close Portfolio'}</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={20} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 기 회수금 및 총 투자금 표시 */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">{lang === 'ko' ? '기 회수금:' : 'Already Realized:'}</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ${calculateAlreadyRealized(portfolio).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">{lang === 'ko' ? '총 투자금:' : 'Total Invested:'}</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ${calculateTotalInvested(portfolio).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 보유 종목별 매도 입력 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ko' ? '보유 종목별 최종 매도 입력' : 'Final Sell by Holdings'}
            </h3>
            {finalSells.map((fs, index) => {
              const holding = holdings.find(h => h.stock === fs.stock);
              const gradientInfo = CUSTOM_GRADIENT_LOGOS[fs.stock] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
              const sellAmount = fs.price * fs.quantity;
              const netAmount = sellAmount - fs.fee;

              return (
                <div key={fs.stock} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white text-xs font-black"
                      style={{ background: gradientInfo.gradient }}
                    >
                      {fs.stock}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{fs.stock}</p>
                      <p className="text-xs text-slate-500">{lang === 'ko' ? `보유 수량: ${holding?.quantity || 0}` : `Holding: ${holding?.quantity || 0}`}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                        {lang === 'ko' ? '매도 단가' : 'Sell Price'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                        <input 
                          type="number"
                          value={fs.price || ''}
                          onChange={(e) => updateFinalSell(index, 'price', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-lg p-2 pl-7 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                        {lang === 'ko' ? '매도 수량' : 'Quantity'}
                      </label>
                      <input 
                        type="number"
                        value={fs.quantity || ''}
                        onChange={(e) => updateFinalSell(index, 'quantity', e.target.value)}
                        max={holding?.quantity || 0}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-lg p-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                        {lang === 'ko' ? '수수료' : 'Fee'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                        <input 
                          type="number"
                          value={fs.fee || ''}
                          onChange={(e) => updateFinalSell(index, 'fee', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-lg p-2 pl-7 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                        {lang === 'ko' ? '순 매도금' : 'Net Amount'}
                      </label>
                      <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/20 rounded-lg p-2 text-sm font-bold text-blue-600 dark:text-blue-400">
                        ${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 추가 수수료 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ko' ? '추가 수수료 (선택사항):' : 'Additional Fee (Optional):'}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input 
                type="number"
                value={additionalFee}
                onChange={(e) => setAdditionalFee(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-100/50 dark:bg-[#111827] border border-slate-200 dark:border-white/5 rounded-xl p-4 pl-8 text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* 최종 매도금 합계 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-500/20">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                {lang === 'ko' ? '최종 매도금 합계:' : 'Total Final Sell Amount:'}
              </span>
              <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                ${(calculateFinalSellAmount() - parseFloat(additionalFee || '0')).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-slate-200 dark:border-white/5 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            {lang === 'ko' ? '취소' : 'Cancel'}
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 active:scale-95 transition-transform"
          >
            {lang === 'ko' ? '저장' : 'Save'}
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
    alreadyRealized: number;
    finalSellAmount: number;
    totalReturn: number;
    profit: number;
    yieldRate: number;
  };
  onClose: () => void;
}

const Result: React.FC<ResultProps> = ({ lang, result, onClose }) => {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#06090F]/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#161d2a] rounded-[2rem] shadow-2xl dark:shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
        <div className="p-8 pb-2 flex justify-between items-center border-b border-slate-200 dark:border-white/5">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{lang === 'ko' ? '정산 결과' : 'Settlement Result'}</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={24} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="bg-slate-50 dark:bg-[#111827] p-8 rounded-[1.5rem] border border-slate-200 dark:border-white/5 space-y-6">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">{lang === 'ko' ? '정산 결과' : 'Settlement Result'}</h3>
             
             <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '총 투자금' : 'Total Invested'}</p>
                   <p className="text-xl font-black text-slate-900 dark:text-white">${result.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                   <p className="text-[9px] text-slate-500 italic">Σ(매수금 + 수수료)</p>
                </div>
                <div className="space-y-2">
                   <p
                     className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest"
                     title={lang === 'ko'
                       ? '운용 중 일부 매도하여 이미 실현된 수익이 포함된 금액입니다'
                       : 'Includes profits already realized from partial sells during the strategy'}
                   >
                     {lang === 'ko' ? '기 회수금' : 'Already Realized'}
                   </p>
                   <p className="text-xl font-black text-blue-600 dark:text-blue-400">${result.alreadyRealized.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                   <p className="text-[9px] text-slate-500 italic">Σ(기존 매도금 - 수수료)</p>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '최종 매도금' : 'Final Sell Amount'}</p>
                   <p className="text-xl font-black text-slate-900 dark:text-white">${result.finalSellAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                   <p className="text-[9px] text-slate-500 italic">Σ(최종 매도금 - 수수료)</p>
                </div>
                <div className="space-y-2">
                   <p
                     className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest"
                     title={lang === 'ko'
                       ? '운용 중 일부 매도하여 이미 실현된 수익이 포함된 금액입니다'
                       : 'Includes profits already realized from partial sells during the strategy'}
                   >
                     {lang === 'ko' ? '최종 회수금' : 'Total Return'}
                   </p>
                   <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">${result.totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                   <p className="text-[9px] text-slate-500 italic">기 회수금 + 최종 매도금</p>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '최종 수익금' : 'Total Profit'}</p>
                   <p className={`text-xl font-black ${result.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ${result.profit >= 0 ? '+' : ''}{result.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                   </p>
                   <p className="text-[9px] text-slate-500 italic">회수금 - 투자금</p>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '최종 수익률' : 'Yield Rate'}</p>
                   <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${result.yieldRate >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <p className={`text-xl font-black ${result.yieldRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                         {result.yieldRate >= 0 ? '+' : ''}{result.yieldRate.toFixed(2)}%
                      </p>
                   </div>
                   <p className="text-[9px] text-slate-500 italic">(회수금 / 투자금 - 1) × 100</p>
                </div>
             </div>

             {/* 수식 가이드 */}
             <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">
                  {lang === 'ko' ? '계산 수식' : 'Calculation Formula'}
                </p>
                <div className="space-y-2 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                  <p>• {lang === 'ko' ? '최종 회수금 = 기 매도금 + 최종 매도금 (수수료 차감 후)' : 'Total Return = Already Realized + Final Sell Amount (after fees)'}</p>
                  <p>• {lang === 'ko' ? '최종 수익금 = 최종 회수금 - 총 투자금' : 'Total Profit = Total Return - Total Invested'}</p>
                  <p>• {lang === 'ko' ? '최종 수익률 = (최종 회수금 / 총 투자금 - 1) × 100' : 'Yield Rate = (Total Return / Total Invested - 1) × 100'}</p>
                </div>
             </div>
          </div>
        </div>
        
        <div className="p-8 pt-4 border-t border-slate-200 dark:border-white/5">
          <button 
            onClick={onClose}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all"
          >
            {lang === 'ko' ? '닫기' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default { TerminationInput, Result };
