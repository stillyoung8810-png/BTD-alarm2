import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';

type SettlementLang = 'ko' | 'en';
type SettlementMetricKey =
  | 'totalInvested'
  | 'alreadyRealized'
  | 'profit'
  | 'yieldRate';

const SETTLEMENT_METRIC_KEYS: readonly SettlementMetricKey[] = [
  'totalInvested',
  'alreadyRealized',
  'profit',
  'yieldRate',
];

interface ResultProps {
  lang: SettlementLang;
  result: {
    totalInvested: number;
    alreadyRealized: number;
    profit: number;
    yieldRate: number;
  };
  onClose: () => void;
}

interface SettlementMetricConfig {
  label: string;
  helperText: string;
  title?: string;
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedMoney(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${formatMoney(value)}`;
}

function formatSignedPercent(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function getProfitToneClassName(value: number): string {
  if (value >= 0) {
    return 'text-emerald-500';
  }

  return 'text-rose-500';
}

function getYieldIndicatorClassName(value: number): string {
  if (value >= 0) {
    return 'bg-emerald-500';
  }

  return 'bg-rose-500';
}

function getSettlementMetricConfig(
  lang: SettlementLang,
  metricKey: SettlementMetricKey,
): SettlementMetricConfig {
  switch (metricKey) {
    case 'totalInvested':
      return {
        label: lang === 'ko' ? '총 투자금' : 'Total Invested',
        helperText:
          lang === 'ko' ? 'Σ(매수금 + 수수료)' : 'Σ(Buy amount + fees)',
      };
    case 'alreadyRealized':
      return {
        label: lang === 'ko' ? '기 회수금' : 'Already Realized',
        helperText:
          lang === 'ko'
            ? 'Σ(기존 매도금 - 수수료)'
            : 'Σ(Realized sells - fees)',
        title:
          lang === 'ko'
            ? '운용 중 일부 매도하여 이미 실현된 수익이 포함된 금액입니다'
            : 'Includes profits already realized from partial sells during the strategy',
      };
    case 'profit':
      return {
        label: lang === 'ko' ? '최종 수익금' : 'Total Profit',
        helperText:
          lang === 'ko'
            ? '기 회수금 - 총 투자금'
            : 'Already Realized - Total Invested',
      };
    case 'yieldRate':
      return {
        label: lang === 'ko' ? '최종 수익률' : 'Yield Rate',
        helperText:
          lang === 'ko'
            ? '(최종 수익금 / 총 투자금) × 100'
            : '(Total Profit / Total Invested) × 100',
      };
    default: {
      const exhaustiveCheck: never = metricKey;
      return exhaustiveCheck;
    }
  }
}

function renderSettlementMetricValue(
  metricKey: SettlementMetricKey,
  result: ResultProps['result'],
): React.ReactElement {
  switch (metricKey) {
    case 'totalInvested':
      return (
        <p className="text-xl font-black text-slate-900 dark:text-white">
          {formatMoney(result.totalInvested)}
        </p>
      );
    case 'alreadyRealized':
      return (
        <p className="text-xl font-black text-blue-600 dark:text-blue-400">
          {formatMoney(result.alreadyRealized)}
        </p>
      );
    case 'profit':
      return (
        <p
          className={`text-xl font-black ${getProfitToneClassName(
            result.profit,
          )}`}
        >
          {formatSignedMoney(result.profit)}
        </p>
      );
    case 'yieldRate':
      return (
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${getYieldIndicatorClassName(
              result.yieldRate,
            )}`}
          />
          <p
            className={`text-xl font-black ${getProfitToneClassName(
              result.yieldRate,
            )}`}
          >
            {formatSignedPercent(result.yieldRate)}
          </p>
        </div>
      );
    default: {
      const exhaustiveCheck: never = metricKey;
      return exhaustiveCheck;
    }
  }
}

function SettlementMetricCard({
  lang,
  metricKey,
  result,
}: {
  lang: SettlementLang;
  metricKey: SettlementMetricKey;
  result: ResultProps['result'];
}): React.ReactElement {
  const config = getSettlementMetricConfig(lang, metricKey);

  return (
    <div className="space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500"
        title={config.title}
      >
        {config.label}
      </p>
      {renderSettlementMetricValue(metricKey, result)}
      <p className="text-[9px] italic text-slate-500">{config.helperText}</p>
    </div>
  );
}

const Result: React.FC<ResultProps> = ({ lang, result, onClose }) => {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={lang === 'ko' ? '정산 결과 닫기' : 'Close settlement result'}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md dark:bg-[#06090F]/90"
      />
      <div
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#161d2a] dark:shadow-2xl"
        style={{ touchAction: 'pan-y' }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-6 pb-2 md:p-8 dark:border-white/5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white md:text-2xl">
            {lang === 'ko' ? '정산 결과' : 'Settlement Result'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
            aria-label={lang === 'ko' ? '정산 결과 닫기' : 'Close settlement result'}
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8">
          <div className="space-y-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 dark:border-white/5 dark:bg-[#111827]">
            <h3 className="mb-6 text-lg font-bold text-slate-900 dark:text-white">
              {lang === 'ko' ? '정산 결과' : 'Settlement Result'}
            </h3>

            <div className="grid grid-cols-2 gap-6">
              {SETTLEMENT_METRIC_KEYS.map((metricKey) => (
                <SettlementMetricCard
                  key={metricKey}
                  lang={lang}
                  metricKey={metricKey}
                  result={result}
                />
              ))}
            </div>

            <div className="mt-8 space-y-3 border-t border-slate-200 pt-6 dark:border-white/5">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                {lang === 'ko' ? '계산 수식' : 'Calculation Formula'}
              </p>
              <div className="space-y-2 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                <p>
                  •{' '}
                  {lang === 'ko'
                    ? '기 회수금 = 기존 매도금 합계 - 매도 수수료 합계'
                    : 'Already Realized = Total realized sells - total sell fees'}
                </p>
                <p>
                  •{' '}
                  {lang === 'ko'
                    ? '최종 수익금 = 기 회수금 - 총 투자금'
                    : 'Total Profit = Already Realized - Total Invested'}
                </p>
                <p>
                  •{' '}
                  {lang === 'ko'
                    ? '최종 수익률 = (최종 수익금 / 총 투자금) × 100'
                    : 'Yield Rate = (Total Profit / Total Invested) × 100'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-8 pt-4 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-blue-600 py-5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-500"
          >
            {lang === 'ko' ? '닫기' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export { Result };
