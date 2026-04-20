import React, { useCallback, useMemo } from 'react';
import type { AppLang, Portfolio } from '../types';
import { Calendar, CheckCircle2, ChevronRight, Trash2 } from 'lucide-react';
import { useTossApp } from '../contexts/TossAppContext';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { getHistoryMessages } from '../constants/messages/historyMessages';
import {
  formatSignedPercent,
  formatSignedUsdValue,
  formatUsdValue,
  getRounded,
} from '../src/utils/financialCalculations';
import {
  buildClosedStrategySettlementSummary,
  calculateAggregateHistoryRoi,
} from '../utils/portfolioSettlement';
import { getResolvedHistoryBannerAdGroupId } from '../services/ads/adPlacements';
import { TdsConfirmDialog } from './tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from './tds-adapter/useAsyncTdsConfirm';
import { showErrorToast } from './tds-adapter/showErrorToast';
import HistoryHeaderActions from './HistoryHeaderActions';
import { TossInlineBanner } from './TossInlineBanner';

const HISTORY_LIST_BANNER_CONTAINER_CLASS_NAME = 'h-[96px] min-h-[96px]';

interface HistoryProps {
  lang: AppLang;
  portfolios: Portfolio[];
  shouldShowAds: boolean;
  onOpenDetails: (id: string) => void;
  onDeleteHistory?: (portfolioId: string) => Promise<void> | void;
  onClearHistory?: () => Promise<void> | void;
}

interface HistoryRecordVm {
  id: string;
  name: string;
  startDateLabel: string;
  closedDateLabel: string;
  totalInvested: number;
  investedText: string;
  yieldText: string;
  profitText: string;
  yieldRate: number;
  profitAmount: number;
  isProfitPositive: boolean;
}

interface HistoryRecordCardProps {
  vm: HistoryRecordVm;
  isInTossApp: boolean;
  detailsLabel: string;
  totalInvestedLabel: string;
  totalYieldLabel: string;
  investedFormulaLabel: string;
  yieldFormulaLabel: string;
  deleteLabel: string;
  onOpenDetails: (id: string) => void;
  onRequestDelete?: (id: string) => void;
}

interface StatCardProps {
  label: string;
  value: string;
  color: string;
}

function buildHistoryRecordVm(
  portfolio: Portfolio,
  copy: ReturnType<typeof getHistoryMessages>,
): HistoryRecordVm {
  const settlement = buildClosedStrategySettlementSummary(portfolio);

  return {
    id: portfolio.id,
    name: portfolio.name,
    startDateLabel: copy.startDate(portfolio.startDate),
    closedDateLabel: copy.closedDate(portfolio.closedAt ?? ''),
    totalInvested: settlement.totalInvested,
    investedText: formatUsdValue(settlement.totalInvested),
    yieldText: formatSignedPercent(settlement.yieldRate),
    profitText: formatSignedUsdValue(settlement.profit),
    yieldRate: settlement.yieldRate,
    profitAmount: settlement.profit,
    isProfitPositive: getRounded(settlement.profit) >= 0,
  };
}

const HistoryRecordCard = React.memo(function HistoryRecordCard({
  vm,
  isInTossApp,
  detailsLabel,
  totalInvestedLabel,
  totalYieldLabel,
  investedFormulaLabel,
  yieldFormulaLabel,
  deleteLabel,
  onOpenDetails,
  onRequestDelete,
}: HistoryRecordCardProps): React.ReactElement {
  const profitClassName = vm.isProfitPositive
    ? 'text-emerald-500'
    : 'text-rose-500';

  const handleOpenDetailsClick = useCallback((): void => {
    onOpenDetails(vm.id);
  }, [onOpenDetails, vm.id]);

  const handleRequestDeleteClick = useCallback((): void => {
    onRequestDelete?.(vm.id);
  }, [onRequestDelete, vm.id]);

  if (isInTossApp) {
    return (
      <div className="bg-white dark:glass p-7 rounded-[2.5rem] flex flex-col gap-6 border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/20">
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-500/20 shrink-0">
              <CheckCircle2 size={28} />
            </div>
            <div className="min-w-0">
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                {vm.name}
              </h4>
              <div className="flex flex-col text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-widest mt-1">
                <span>{vm.startDateLabel}</span>
                <span>{vm.closedDateLabel}</span>
              </div>
            </div>
          </div>
          <p className={`text-xl font-black shrink-0 ${profitClassName}`}>
            {vm.profitText}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-12">
          <div>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
              {totalInvestedLabel}
            </span>
            <p className="text-lg font-black text-slate-900 dark:text-white">
              {vm.investedText}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              {investedFormulaLabel}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
              {totalYieldLabel}
            </span>
            <p className={`text-lg font-black ${profitClassName}`}>
              {vm.yieldText}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              {yieldFormulaLabel}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleOpenDetailsClick}
            className={[
              'text-sm font-semibold rounded-xl px-3 py-1.5',
              'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
              'hover:bg-blue-200 dark:hover:bg-blue-500/25 transition-colors',
            ].join(' ')}
          >
            {detailsLabel}{' '}
            <ChevronRight size={14} className="inline-block align-middle" />
          </button>
          {onRequestDelete != null ? (
            <button
              type="button"
              onClick={handleRequestDeleteClick}
              className={[
                'flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-1.5',
                'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
                'hover:bg-red-200 dark:hover:bg-red-500/25 transition-colors',
              ].join(' ')}
            >
              <Trash2 size={14} />
              {deleteLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:glass p-7 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:translate-x-1 transition-transform border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/20">
      <div className="flex items-center gap-5 min-w-[250px]">
        <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-500/20 shrink-0">
          <CheckCircle2 size={28} />
        </div>
        <div>
          <h4 className="text-lg font-black text-slate-900 dark:text-white">
            {vm.name}
          </h4>
          <div className="flex flex-col text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-widest mt-1">
            <span>{vm.startDateLabel}</span>
            <span>{vm.closedDateLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-2 gap-8 px-8 border-l border-slate-200 dark:border-white/5">
        <div>
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
            {totalInvestedLabel}
          </span>
          <p className="text-lg font-black text-slate-900 dark:text-white">
            {vm.investedText}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
            {investedFormulaLabel}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1">
            {totalYieldLabel}
          </span>
          <p className={`text-lg font-black ${profitClassName}`}>
            {vm.yieldText}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
            {yieldFormulaLabel}
          </p>
        </div>
      </div>

      <div className="text-right min-w-[150px] space-y-2">
        <p className={`text-xl font-black ${profitClassName}`}>{vm.profitText}</p>
        <div className="flex items-center justify-end gap-2">
          {onRequestDelete != null ? (
            <button
              type="button"
              onClick={handleRequestDeleteClick}
              className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase tracking-widest hover:text-rose-400"
            >
              <Trash2 size={10} />
              {deleteLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleOpenDetailsClick}
            className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1"
          >
            {detailsLabel} <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </div>
  );
});

HistoryRecordCard.displayName = 'HistoryRecordCard';

function StatCard({ label, value, color }: StatCardProps): React.ReactElement {
  return (
    <div className="bg-white dark:glass p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-md dark:bg-slate-900/30">
      <span className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">
        {label}
      </span>
      <p className={`text-3xl font-black mt-2 ${color}`}>{value}</p>
    </div>
  );
}

export default function History({
  lang,
  portfolios,
  shouldShowAds,
  onOpenDetails,
  onDeleteHistory,
  onClearHistory,
}: HistoryProps): React.ReactElement {
  const copy = getHistoryMessages(lang);
  const { isInTossApp } = useTossApp();
  const historyDialog = useAsyncTdsConfirm(lang);
  const historyBannerAdGroupId = getResolvedHistoryBannerAdGroupId();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const deleteLabel = TDS_DIALOG_MESSAGES[lang]?.history?.deleteRecordButton ?? '';

  const handleRequestDeleteRecord = useCallback(
    (portfolioId: string): void => {
      const messages = TDS_DIALOG_MESSAGES[lang]?.history;
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;

      if (messages == null || actionLabels == null || onDeleteHistory == null) {
        const errorMessage = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
        if (errorMessage != null && errorMessage !== '') {
          showErrorToast(errorMessage);
        }
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

  const sortedPortfolios = useMemo(
    () =>
      [...portfolios].sort((a, b) => {
        const aDate = a.closedAt != null ? new Date(a.closedAt).getTime() : 0;
        const bDate = b.closedAt != null ? new Date(b.closedAt).getTime() : 0;
        return bDate - aDate;
      }),
    [portfolios],
  );

  const recordVms = useMemo(
    () =>
      sortedPortfolios.map((portfolio) => buildHistoryRecordVm(portfolio, copy)),
    [copy, sortedPortfolios],
  );

  const totalProfit = useMemo(
    () => recordVms.reduce((sum, vm) => sum + vm.profitAmount, 0),
    [recordVms],
  );

  const aggregateRoi = useMemo(
    () =>
      calculateAggregateHistoryRoi(
        recordVms.map((vm) => ({
          totalInvested: vm.totalInvested,
          profit: vm.profitAmount,
        })),
      ),
    [recordVms],
  );

  const totalProfitColor =
    getRounded(totalProfit) >= 0 ? 'text-emerald-500' : 'text-rose-500';

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black dark:text-white uppercase tracking-tight">
            {copy.historyTitle}
          </h2>
          <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">
            {copy.historySubtitle}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          {onClearHistory != null ? (
            <HistoryHeaderActions
              lang={lang}
              canClearHistory
              onClearHistory={onClearHistory}
            />
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label={copy.totalProfitLabel}
          value={formatSignedUsdValue(totalProfit)}
          color={totalProfitColor}
        />
        <StatCard
          label={copy.yieldLabel}
          value={formatSignedPercent(aggregateRoi)}
          color="text-blue-500"
        />
        <StatCard
          label={copy.closedStrategiesLabel}
          value={recordVms.length.toString()}
          color="text-slate-500"
        />
      </div>

      <TossInlineBanner
        adGroupId={historyBannerAdGroupId}
        shouldShowAd={shouldShowAds}
        isInTossApp={isInTossApp}
        variant="card"
        containerClassName={HISTORY_LIST_BANNER_CONTAINER_CLASS_NAME}
      />

      <div className="space-y-4">
        {recordVms.length === 0 ? (
          <div className="text-center py-32 glass rounded-[3rem] border-2 border-dashed border-white/5">
            <Calendar className="mx-auto mb-6 opacity-10" size={64} />
            <p className="text-slate-500 font-bold uppercase tracking-widest">
              {copy.noHistoryLabel}
            </p>
          </div>
        ) : (
          recordVms.map((vm) => (
            <HistoryRecordCard
              key={vm.id}
              vm={vm}
              isInTossApp={isInTossApp}
              detailsLabel={copy.detailsLabel}
              totalInvestedLabel={copy.totalInvestedLabel}
              totalYieldLabel={copy.totalYieldLabel}
              investedFormulaLabel={copy.investedFormulaLabel}
              yieldFormulaLabel={copy.yieldFormulaLabel}
              deleteLabel={deleteLabel}
              onOpenDetails={onOpenDetails}
              onRequestDelete={
                onDeleteHistory != null ? handleRequestDeleteRecord : undefined
              }
            />
          ))
        )}
      </div>

      {labels != null ? (
        <TdsConfirmDialog {...historyDialog.dialogProps} labels={labels} />
      ) : null}
    </div>
  );
}
