import React, { useCallback, useMemo } from 'react';
import type { AppLang, Portfolio } from '../types';
import { I18N } from '../constants';
import { Calendar, CheckCircle2, ChevronRight, Trash2 } from 'lucide-react';
import { calculateTotalInvested } from '../utils/portfolioCalculations';
import { useTossApp } from '../contexts/TossAppContext';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { TdsConfirmDialog } from './tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from './tds-adapter/useAsyncTdsConfirm';

/** 포트폴리오 1건의 invested / profit / yieldRate 계산 */
const calcPortfolioStats = (p: Portfolio) => {
  const invested = calculateTotalInvested(p);
  const profit = (p.finalSellAmount || 0) - invested;
  const yieldRate = invested > 0 ? (profit / invested) * 100 : 0;
  return { invested, profit, yieldRate };
};

interface HistoryProps {
  lang: AppLang;
  portfolios: Portfolio[];
  onOpenDetails: (id: string) => void;
  onDeleteHistory?: (portfolioId: string) => void;
  onClearHistory?: () => void;
}

const History: React.FC<HistoryProps> = ({ lang, portfolios, onOpenDetails, onDeleteHistory, onClearHistory }) => {
  const t = I18N[lang];
  const { isInTossApp } = useTossApp();
  const historyDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;

  const handleRequestClearHistory = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.history;
    if (messages == null || onClearHistory == null) {
      return;
    }
    historyDialog.open({
      title: messages.clearTitle ?? '',
      body: messages.clearBody ?? '',
      confirmLabel: messages.clearConfirm ?? '',
      tone: 'danger',
      action: () => Promise.resolve(onClearHistory()),
    });
  }, [historyDialog.open, lang, onClearHistory]);

  const handleRequestDeleteRecord = useCallback(
    (portfolioId: string) => {
      const messages = TDS_DIALOG_MESSAGES[lang]?.history;
      if (messages == null || onDeleteHistory == null) {
        return;
      }
      historyDialog.open({
        title: messages.deleteRecordTitle ?? '',
        body: messages.deleteRecordBody ?? '',
        confirmLabel: messages.deleteRecordConfirm ?? '',
        tone: 'danger',
        action: () => Promise.resolve(onDeleteHistory(portfolioId)),
      });
    },
    [historyDialog.open, lang, onDeleteHistory],
  );

  // 종료일 기준 내림차순 정렬
  const sortedPortfolios = useMemo(() =>
    [...portfolios].sort((a, b) => {
      const aDate = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bDate = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bDate - aDate;
    }),
    [portfolios]
  );

  // 전체 통계 (한 번만 계산)
  const { totalProfit, averageYield } = useMemo(() => {
    let profitSum = 0;
    let yieldSum = 0;
    for (const p of sortedPortfolios) {
      const { profit, yieldRate } = calcPortfolioStats(p);
      profitSum += profit;
      yieldSum += yieldRate;
    }
    return {
      totalProfit: profitSum,
      averageYield: sortedPortfolios.length > 0 ? yieldSum / sortedPortfolios.length : 0,
    };
  }, [sortedPortfolios]);
  
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
              type="button"
              onClick={handleRequestClearHistory}
              className="glass px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-rose-500 border border-rose-500/40 hover:bg-rose-500/10 flex flex-row items-center justify-center gap-2"
            >
              <Trash2 size={14} className="shrink-0" />
              <span className="leading-none">
                {TDS_DIALOG_MESSAGES[lang]?.history?.clearHistoryButton ?? ''}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label={t.totalProfit}
          value={`${totalProfit >= 0 ? '+' : '-'}$${Math.abs(totalProfit).toLocaleString()}`}
          color={totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}
        />
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
            const { invested, profit, yieldRate } = calcPortfolioStats(p);

            /* 토스 미니앱 전용: 헤더(총 손익금 우측), Body(넉넉한 gap), Footer(TDS weak 스타일 버튼) */
            if (isInTossApp) {
              return (
                <div key={p.id} className="bg-white dark:glass p-7 rounded-[2.5rem] flex flex-col gap-6 border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/20">
                  {/* 1. Header: justify-between, items-start — 좌측(이름/기간), 우측(총 손익금) */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-500/20 shrink-0">
                        <CheckCircle2 size={28} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-lg font-black text-slate-900 dark:text-white">{p.name}</h4>
                        <div className="flex flex-col text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-widest mt-1">
                          <span>{lang === 'ko' ? '시작: ' : 'Start: '}{p.startDate}</span>
                          <span>{lang === 'ko' ? '종료: ' : 'End: '}{new Date(p.closedAt || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <p className={`text-xl font-black shrink-0 ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {profit >= 0 ? '+' : '-'}${Math.abs(profit).toLocaleString()}
                    </p>
                  </div>

                  {/* 2. Body: 총 투자금 / 총 수익률 — 넉넉한 좌우 간격(gap-12) */}
                  <div className="grid grid-cols-2 gap-12">
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

                  {/* 3. Footer: TDS weak variant 모방
                      - Primary Weak: 연한 파란 배경 + 쨍한 파란 텍스트 (반투명·덜 강렬한 액션)
                      - Danger Weak: 연한 붉은 배경 + 쨍한 붉은 텍스트
                      - 사이즈: text-sm, px-3 py-1.5, rounded-xl, font-semibold */}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDetails(p.id)}
                      className={[
                        'text-sm font-semibold rounded-xl px-3 py-1.5',
                        'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
                        'hover:bg-blue-200 dark:hover:bg-blue-500/25 transition-colors',
                      ].join(' ')}
                    >
                      {t.viewSettlement} <ChevronRight size={14} className="inline-block align-middle" />
                    </button>
                    {onDeleteHistory && (
                      <button
                        type="button"
                        onClick={() => handleRequestDeleteRecord(p.id)}
                        className={[
                          'flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-1.5',
                          'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
                          'hover:bg-red-200 dark:hover:bg-red-500/25 transition-colors',
                        ].join(' ')}
                      >
                        <Trash2 size={14} />{' '}
                        {TDS_DIALOG_MESSAGES[lang]?.history?.deleteRecordButton ?? ''}
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            /* 일반 웹: 기존 레이아웃 유지 */
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
                        type="button"
                        onClick={() => handleRequestDeleteRecord(p.id)}
                        className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase tracking-widest hover:text-rose-400"
                      >
                        <Trash2 size={10} />{' '}
                        {TDS_DIALOG_MESSAGES[lang]?.history?.deleteRecordButton ?? ''}
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

      {labels != null ? (
        <TdsConfirmDialog {...historyDialog.dialogProps} labels={labels} />
      ) : null}
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
