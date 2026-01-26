
import React from 'react';
import { Portfolio } from '../types';
import { I18N } from '../constants';
import { Calendar, CheckCircle2, ChevronRight, Trash2 } from 'lucide-react';

interface HistoryProps {
  lang: 'ko' | 'en';
  portfolios: Portfolio[];
  onOpenDetails: (id: string) => void;
  onDeleteHistory?: (portfolioId: string) => void;
  onClearHistory?: () => void;
}

const History: React.FC<HistoryProps> = ({ lang, portfolios, onOpenDetails, onDeleteHistory, onClearHistory }) => {
  const t = I18N[lang];

  // 종료일 기준 내림차순 정렬 (최근 종료된 포트폴리오가 맨 위로 오도록)
  const sortedPortfolios = [...portfolios].sort((a, b) => {
    const aDate = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const bDate = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return bDate - aDate;
  });

  // Calculate overall stats (using sorted list so it matches visible items)
  const totalProfit = sortedPortfolios.reduce((sum, p) => {
    const invested = p.trades.reduce((tSum, tr) => tSum + (tr.price * tr.quantity + tr.fee), 0);
    const profit = (p.finalSellAmount || 0) - invested;
    return sum + profit;
  }, 0);

  const averageYield = sortedPortfolios.length > 0 
    ? sortedPortfolios.reduce((sum, p) => {
        const invested = p.trades.reduce((tSum, tr) => tSum + (tr.price * tr.quantity + tr.fee), 0);
        const profit = (p.finalSellAmount || 0) - invested;
        return sum + (invested > 0 ? (profit / invested) * 100 : 0);
      }, 0) / sortedPortfolios.length
    : 0;
  
  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h2 className="text-3xl font-black dark:text-white uppercase tracking-tight">{t.history}</h2>
           <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">{lang === 'ko' ? '완료된 투자 전략 성과' : 'Performance of completed strategies'}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          {onClearHistory && (
            <button
              onClick={() => {
                const msg = lang === 'ko'
                  ? '삭제되면 되돌릴 수 없습니다. 삭제하시겠습니까?'
                  : 'Clear all history records? This will not delete the original portfolios.';
                if (window.confirm(msg)) {
                  onClearHistory();
                }
              }}
              className="glass px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-rose-500 border border-rose-500/40 hover:bg-rose-500/10 flex flex-row items-center justify-center gap-2"
            >
              <Trash2 size={14} className="shrink-0" />
              <span className="leading-none">{lang === 'ko' ? '내역 초기화' : 'Clear History'}</span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label={t.totalProfit} value={`+$${totalProfit.toLocaleString()}`} color="text-emerald-500" />
        <StatCard label={t.yield} value={`${averageYield.toFixed(2)}%`} color="text-blue-500" />
        <StatCard label={t.closedStrategies} value={portfolios.length.toString()} color="text-slate-500" />
      </div>

      <div className="space-y-4">
        {sortedPortfolios.length === 0 ? (
          <div className="text-center py-32 glass rounded-[3rem] border-2 border-dashed border-white/5">
            <Calendar className="mx-auto mb-6 opacity-10" size={64} />
            <p className="text-slate-500 font-bold uppercase tracking-widest">{t.noHistory}</p>
          </div>
        ) : (
          sortedPortfolios.map(p => {
            const invested = p.trades.reduce((tSum, tr) => tSum + (tr.price * tr.quantity + tr.fee), 0);
            const profit = (p.finalSellAmount || 0) - invested;
            const yieldRate = invested > 0 ? (profit / invested) * 100 : 0;

            return (
              <div key={p.id} className="bg-white dark:glass p-7 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:translate-x-1 transition-transform border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/20">
                <div className="flex items-center gap-5 min-w-[250px]">
                  <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-500/20 shrink-0">
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white">{p.name}</h4>
                    <div className="flex flex-col text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-widest mt-1">
                      <span>{lang === 'ko' ? '시작: ' : 'Start: '} {p.startDate}</span>
                      <span>{lang === 'ko' ? '종료: ' : 'End: '} {new Date(p.closedAt || '').toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-2 gap-8 px-8 border-l border-slate-200 dark:border-white/5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                      {lang === 'ko' ? '총 투자금' : 'Total Invested'}
                    </span>
                    <p className="text-lg font-black text-slate-900 dark:text-white">
                      ${invested.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      [Σ(Buy + Fee)]
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
                      {lang === 'ko' ? '총 수익률' : 'Total Yield'}
                    </span>
                    <p className={`text-lg font-black ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {profit >= 0 ? '+' : ''}{yieldRate.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      [(Total Return / Total Invested - 1) * 100]
                    </p>
                  </div>
                </div>

                <div className="text-right min-w-[150px] space-y-2">
                  <p className={`text-xl font-black ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {profit >= 0 ? '+' : '-'}${Math.abs(profit).toLocaleString()}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    {onDeleteHistory && (
                      <button
                        onClick={() => {
                          const msg = lang === 'ko'
                            ? '삭제되면 되돌릴 수 없습니다. 삭제하시겠습니까?'
                            : 'Delete this history record? (This will also delete it from Supabase and cannot be undone.)';
                          if (window.confirm(msg)) {
                            onDeleteHistory(p.id);
                          }
                        }}
                        className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase tracking-widest hover:text-rose-400"
                      >
                        <Trash2 size={10} /> {lang === 'ko' ? '기록 삭제' : 'Delete'}
                      </button>
                    )}
                    <button 
                      onClick={() => onOpenDetails(p.id)}
                      className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1"
                    >
                      {t.viewSettlement} <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="bg-white dark:glass p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/30">
    <span className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">{label}</span>
    <p className={`text-3xl font-black mt-2 ${color}`}>{value}</p>
  </div>
);

export default History;
