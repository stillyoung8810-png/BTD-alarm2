/**
 * 전략 백테스트 페이지: 전략 선택 → 파라미터 설정 → 결과 (UI 전용, 연산 엔진 연동 전)
 */

import React, { useCallback, useMemo, useState, Suspense, lazy } from 'react';
import { I18N, ALL_STOCKS } from '../constants';
import { BACKTEST_DEFAULTS } from '../constants/domain/backtestDefaults';
import {
  getBacktestMessages,
  type BacktestMessageSet,
} from '../constants/messages/backtestMessages';
import { getCommonMessages } from '../constants/messages/commonMessages';
import { useMutexAction } from '../hooks/useMutexAction';
import { showErrorToast } from './tds-adapter/showErrorToast';
import { TrendingUp, Layers, Zap, ChevronLeft, Calendar, DollarSign, Percent, Crown, Info } from 'lucide-react';
import CustomDropdown from './CustomDropdown';
import Toggle from './Toggle';
import { incrementUsage } from '../utils/subscriptionUtils';

const BacktestResultsCharts = lazy(() => import('./BacktestResultsCharts'));

export type BacktestStrategyId = 'rsi_ma_interval' | 'multi_split' | 'no_stop_multi_split';

type Step = 'strategy' | 'params' | 'results';

// 이평선 구간매수 파라미터 (백테스트용)
export interface BacktestParamsMa {
  baseStock: string;
  rsiEnabled: boolean;
  rsiThreshold: number;
  alignmentEnabled: boolean;
  // 구간 1 (이동평균선 a)
  maAPeriod: number;
  maAStock: string;
  maATakeProfit: boolean;
  maATakeProfitPct: number;
  // 구간 2 (이동평균선 b)
  maBPeriod: number;
  maBStock: string;
  maBTakeProfit: boolean;
  maBTakeProfitPct: number;
  // 구간 3 (이동평균선보다 아래)
  ma3Stock: string;
  ma3TakeProfit: boolean;
  ma3TakeProfitPct: number;
  dailyBuyAmount: number;
  months: number;
  feeRate: number;
}

// 다분할 매매법 파라미터 (백테스트용)
export interface BacktestParamsMultiSplit {
  stock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  oneTimeAmount: number;
  months: number;
  feeRate: number;
}

// 다분할 매매법(무손절) 파라미터 (백테스트용)
export interface BacktestParamsNoStopMultiSplit {
  stock: string;
  totalSplitCount: number;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  oneTimeAmount: number;
  months: number;
  feeRate: number;
}

// 결과 (목업)
export interface BacktestResult {
  totalReturnPct: number;
  cagrPct: number;
  mddPct: number;
  winRatePct: number;
  sharpeRatio: number;
  avgHoldingDays: number;
  equityCurve: { date: string; value: number }[];
  drawdownSeries: { date: string; drawdown: number }[];
}

type RemoteBacktestStrategyId = 'multi_split' | 'no_stop_multi_split';

export interface BacktestController {
  executeRemoteSimulation: (params: {
    months: number;
    amountUsd: number;
  }) => Promise<void>;
  notifyError: (message: string) => void;
}

const MIN_MONTHS = 6;
const MAX_MONTHS = 24;

function normalizeIntegerInput(
  raw: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizePositiveIntegerInput(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || raw.trim() === '') {
    return fallback;
  }
  return Math.trunc(parsed);
}

interface RemoteBacktestRequest {
  url: string | undefined;
  payload: Record<string, unknown>;
}

type RemoteBacktestResponse =
  | { kind: 'success'; result: BacktestResult }
  | { kind: 'error'; message: string };

const DEFAULT_PARAMS_MA: BacktestParamsMa = {
  baseStock: BACKTEST_DEFAULTS.MA.BASE_STOCK,
  rsiEnabled: false,
  rsiThreshold: BACKTEST_DEFAULTS.MA.RSI_THRESHOLD,
  alignmentEnabled: false,
  maAPeriod: BACKTEST_DEFAULTS.MA.SHORT_PERIOD_DAYS,
  maAStock: BACKTEST_DEFAULTS.MA.SHORT_PERIOD_STOCK,
  maATakeProfit: false,
  maATakeProfitPct: BACKTEST_DEFAULTS.MA.SHORT_PERIOD_TAKE_PROFIT_PERCENT,
  maBPeriod: BACKTEST_DEFAULTS.MA.LONG_PERIOD_DAYS,
  maBStock: BACKTEST_DEFAULTS.MA.LONG_PERIOD_STOCK,
  maBTakeProfit: false,
  maBTakeProfitPct: BACKTEST_DEFAULTS.MA.LONG_PERIOD_TAKE_PROFIT_PERCENT,
  ma3Stock: BACKTEST_DEFAULTS.MA.BELOW_MA_STOCK,
  ma3TakeProfit: false,
  ma3TakeProfitPct: BACKTEST_DEFAULTS.MA.BELOW_MA_TAKE_PROFIT_PERCENT,
  dailyBuyAmount: BACKTEST_DEFAULTS.MA.DAILY_BUY_AMOUNT_USD,
  months: BACKTEST_DEFAULTS.COMMON.MONTHS,
  feeRate: BACKTEST_DEFAULTS.COMMON.FEE_RATE_PERCENT,
};

const DEFAULT_PARAMS_MULTI: BacktestParamsMultiSplit = {
  stock: BACKTEST_DEFAULTS.MULTI_SPLIT.STOCK,
  targetReturnRate: BACKTEST_DEFAULTS.COMMON.TARGET_RETURN_RATE_PERCENT,
  totalSplitCount: BACKTEST_DEFAULTS.COMMON.TOTAL_SPLIT_COUNT,
  oneTimeAmount: BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
  months: BACKTEST_DEFAULTS.COMMON.MONTHS,
  feeRate: BACKTEST_DEFAULTS.COMMON.FEE_RATE_PERCENT,
};

const DEFAULT_PARAMS_NO_STOP_MULTI: BacktestParamsNoStopMultiSplit = {
  stock: BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.STOCK,
  totalSplitCount: BACKTEST_DEFAULTS.COMMON.TOTAL_SPLIT_COUNT,
  lowLocBudgetRatio:
    BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.LOW_LOC_BUDGET_RATIO_PERCENT,
  highLocPremiumPct:
    BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.HIGH_LOC_PREMIUM_PERCENT,
  takeProfitPct: BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.TAKE_PROFIT_PERCENT,
  oneTimeAmount: BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
  months: BACKTEST_DEFAULTS.COMMON.MONTHS,
  feeRate: BACKTEST_DEFAULTS.COMMON.FEE_RATE_PERCENT,
};

// 목업 결과 데이터
function buildMockResult(): BacktestResult {
  const eq: { date: string; value: number }[] = [];
  const dd: { date: string; drawdown: number }[] = [];
  let v = 100;
  const start = new Date();
  start.setMonth(start.getMonth() - BACKTEST_DEFAULTS.COMMON.MONTHS);
  for (let i = 0; i < 120; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.floor((i * 365) / 5));
    v *= 1 + (Math.random() * 0.02 - 0.003);
    eq.push({ date: d.toISOString().slice(0, 10), value: Math.round(v * 10) / 10 });
    const peak = Math.max(...eq.map((x) => x.value));
    dd.push({ date: eq[eq.length - 1].date, drawdown: peak > 0 ? -((peak - v) / peak) * 100 : 0 });
  }
  return {
    totalReturnPct: 156.4,
    cagrPct: 42.5,
    mddPct: -18.2,
    winRatePct: 68.5,
    sharpeRatio: 1.84,
    avgHoldingDays: 14,
    equityCurve: eq,
    drawdownSeries: dd,
  };
}

const stockOptions = ALL_STOCKS.map((s) => ({ value: s, label: s, disabled: false }));

function getUsageFailureMessage(
  copy: BacktestMessageSet,
  rawMessage: string | undefined,
): string {
  if (rawMessage === 'DAILY_LIMIT_REACHED') {
    return copy.dailyLimitReached;
  }

  return rawMessage?.trim() || copy.usageVerificationFailed;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toRemoteBody(value: unknown): Record<string, unknown> | null {
  const record = toRecord(value);
  if (record == null) {
    return null;
  }

  if (typeof record.body === 'string') {
    try {
      return toRecord(JSON.parse(record.body));
    } catch {
      return null;
    }
  }

  return record;
}

function toBacktestResult(body: Record<string, unknown>): BacktestResult | null {
  if (!Array.isArray(body.equityCurve)) {
    return null;
  }

  return {
    totalReturnPct: Number(body.totalReturnPct ?? 0),
    cagrPct: Number(body.cagrPct ?? 0),
    mddPct: Number(body.mddPct ?? 0),
    winRatePct: Number(body.winRatePct ?? 0),
    sharpeRatio: Number(body.sharpeRatio ?? 0),
    avgHoldingDays: Number(body.avgHoldingDays ?? 0),
    equityCurve: body.equityCurve as BacktestResult['equityCurve'],
    drawdownSeries: Array.isArray(body.drawdownSeries)
      ? (body.drawdownSeries as BacktestResult['drawdownSeries'])
      : [],
  };
}

function getRemoteBacktestRequest(
  strategyId: RemoteBacktestStrategyId,
  paramsMulti: BacktestParamsMultiSplit,
  paramsNoStopMulti: BacktestParamsNoStopMultiSplit,
): RemoteBacktestRequest {
  switch (strategyId) {
    case 'multi_split':
      return {
        url: import.meta.env.VITE_BACKTEST_MULTI_URL,
        payload: {
          stock: paramsMulti.stock,
          targetReturnRate: paramsMulti.targetReturnRate,
          totalSplitCount: paramsMulti.totalSplitCount,
          oneTimeAmount: paramsMulti.oneTimeAmount,
          months: paramsMulti.months,
          feeRate: paramsMulti.feeRate,
        },
      };
    case 'no_stop_multi_split':
      return {
        url: import.meta.env.VITE_BACKTEST_NO_STOP_MULTI_URL,
        payload: {
          stock: paramsNoStopMulti.stock,
          totalSplitCount: paramsNoStopMulti.totalSplitCount,
          lowLocBudgetRatio: paramsNoStopMulti.lowLocBudgetRatio,
          highLocPremiumPct: paramsNoStopMulti.highLocPremiumPct,
          takeProfitPct: paramsNoStopMulti.takeProfitPct,
          oneTimeAmount: paramsNoStopMulti.oneTimeAmount,
          months: paramsNoStopMulti.months,
          feeRate: paramsNoStopMulti.feeRate,
        },
      };
    default: {
      const exhaustiveCheck: never = strategyId;
      return exhaustiveCheck;
    }
  }
}

async function requestRemoteBacktestResult(
  strategyId: RemoteBacktestStrategyId,
  paramsMulti: BacktestParamsMultiSplit,
  paramsNoStopMulti: BacktestParamsNoStopMultiSplit,
): Promise<RemoteBacktestResponse | null> {
  const request = getRemoteBacktestRequest(
    strategyId,
    paramsMulti,
    paramsNoStopMulti,
  );

  if (request.url == null || request.url.trim() === '') {
    return null;
  }

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload),
    });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    const body = toRemoteBody(data);
    if (body == null) {
      return null;
    }

    if (body.error != null) {
      return {
        kind: 'error',
        message: String(body.error),
      };
    }

    const result = toBacktestResult(body);
    if (result == null) {
      return null;
    }

    return {
      kind: 'success',
      result,
    };
  } catch {
    return null;
  }
}

interface BacktestProps {
  lang: 'ko' | 'en';
  currentTier: string;
  controller?: BacktestController;
  onRequestUpgrade?: () => void;
}

const Backtest: React.FC<BacktestProps> = ({
  lang,
  currentTier,
  controller: controllerProp,
  onRequestUpgrade,
}) => {
  const t = I18N[lang];
  const commonCopy = getCommonMessages(lang);
  const backtestCopy = getBacktestMessages(lang);

  const notifyErrorFallback = useCallback((message: string) => {
    showErrorToast(message);
  }, []);

  const defaultController = useMemo<BacktestController>(
    () => ({
      executeRemoteSimulation: async () => {},
      notifyError: notifyErrorFallback,
    }),
    [notifyErrorFallback],
  );

  const resolvedController = controllerProp ?? defaultController;
  const [step, setStep] = useState<Step>('strategy');
  const [strategyId, setStrategyId] = useState<BacktestStrategyId | null>(null);
  const [paramsMa, setParamsMa] = useState<BacktestParamsMa>(DEFAULT_PARAMS_MA);
  const [paramsMulti, setParamsMulti] = useState<BacktestParamsMultiSplit>(DEFAULT_PARAMS_MULTI);
  const [paramsNoStopMulti, setParamsNoStopMulti] = useState<BacktestParamsNoStopMultiSplit>(DEFAULT_PARAMS_NO_STOP_MULTI);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const handleSelectStrategy = (id: BacktestStrategyId) => {
    setStrategyId(id);
    setStep('params');
  };

  const executeBacktest = useCallback(async () => {
    if (strategyId == null) {
      return;
    }

    const usageResult = await incrementUsage('backtest', currentTier);
    if (!usageResult.success) {
      setBacktestError(getUsageFailureMessage(backtestCopy, usageResult.message));
      setResult(null);
      setStep('results');
      return;
    }

    if (strategyId === 'multi_split' || strategyId === 'no_stop_multi_split') {
      const sanitizedMulti: BacktestParamsMultiSplit = {
        ...paramsMulti,
        months: normalizeIntegerInput(
          String(paramsMulti.months),
          BACKTEST_DEFAULTS.COMMON.MONTHS,
          MIN_MONTHS,
          MAX_MONTHS,
        ),
        oneTimeAmount: normalizePositiveIntegerInput(
          String(paramsMulti.oneTimeAmount),
          BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
        ),
      };
      const sanitizedNoStop: BacktestParamsNoStopMultiSplit = {
        ...paramsNoStopMulti,
        months: normalizeIntegerInput(
          String(paramsNoStopMulti.months),
          BACKTEST_DEFAULTS.COMMON.MONTHS,
          MIN_MONTHS,
          MAX_MONTHS,
        ),
        oneTimeAmount: normalizePositiveIntegerInput(
          String(paramsNoStopMulti.oneTimeAmount),
          BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
        ),
      };

      try {
        const remoteResponse = await requestRemoteBacktestResult(
          strategyId,
          sanitizedMulti,
          sanitizedNoStop,
        );

        if (remoteResponse == null) {
          resolvedController.notifyError(backtestCopy.errorRunFailed);
          setBacktestError(backtestCopy.errorRunFailed);
          setResult(null);
          setStep('results');
          return;
        }

        if (remoteResponse.kind === 'error') {
          setBacktestError(remoteResponse.message);
          setResult(null);
          setStep('results');
          return;
        }

        if (remoteResponse.kind === 'success') {
          setBacktestError(null);
          setResult(remoteResponse.result);
          setStep('results');
          return;
        }
      } catch (error) {
        console.error('[Backtest] Simulation failed:', error);
        resolvedController.notifyError(backtestCopy.errorRunFailed);
        setBacktestError(backtestCopy.errorRunFailed);
        setResult(null);
        setStep('results');
        return;
      }
    }

    setBacktestError(null);
    setResult(buildMockResult());
    setStep('results');
  }, [
    backtestCopy,
    currentTier,
    paramsMulti,
    paramsNoStopMulti,
    resolvedController,
    strategyId,
  ]);

  const { run: handleRunBacktest, isExecuting } =
    useMutexAction(executeBacktest);

  const handleNewSettings = () => {
    setStep('strategy');
    setStrategyId(null);
    setResult(null);
    setBacktestError(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 pb-28">
      {/* 공통 헤더 */}
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          {t.backtest}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t.backtestSubtitle}
        </p>
      </header>

      {/* Step 1: 전략 선택 */}
      {step === 'strategy' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => handleSelectStrategy('rsi_ma_interval')}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-lg hover:shadow-xl hover:border-blue-500/30 dark:hover:border-blue-400/30 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-4 group-hover:scale-105 transition-transform">
              <TrendingUp size={24} />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">
              {t.strategyMaTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.strategyMaDesc}
            </p>
          </button>
          <button
            type="button"
            onClick={() => handleSelectStrategy('multi_split')}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-lg hover:shadow-xl hover:border-emerald-500/30 dark:hover:border-emerald-400/30 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white mb-4 group-hover:scale-105 transition-transform">
              <Layers size={24} />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">
              {t.strategyMultiSplitTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.strategyMultiSplitDesc}
            </p>
          </button>
          <button
            type="button"
            onClick={() => handleSelectStrategy('no_stop_multi_split')}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-lg hover:shadow-xl hover:border-emerald-500/30 dark:hover:border-emerald-400/30 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white mb-4 group-hover:scale-105 transition-transform">
              <Layers size={24} />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">
              {t.strategyNoStopMultiSplitTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.strategyNoStopMultiSplitDesc}
            </p>
          </button>
        </div>
      )}

      {/* Step 2: 파라미터 설정 */}
      {step === 'params' && strategyId && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl">
          <button type="button" onClick={() => { setStep('strategy'); setStrategyId(null); }} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-bold mb-4 transition-colors">
            <ChevronLeft size={18} /> {backtestCopy.backToStrategy}
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {t.backtestParamsTitle}
              </h2>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {t.backtestParamsSubtitle}
              </p>
            </div>
          </div>

          {strategyId === 'rsi_ma_interval' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Zap size={12} /> {t.baseStock}
                  </label>
                  <CustomDropdown
                    value={paramsMa.baseStock}
                    options={stockOptions}
                    onChange={(v) => setParamsMa((p) => ({ ...p, baseStock: v }))}
                    header={backtestCopy.stockSelectionHeader}
                    infoModalBadgeLabel={commonCopy.notice}
                    infoModalCloseAriaLabel={commonCopy.closeDialog}
                    infoModalConfirmLabel={commonCopy.acknowledge}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Calendar size={12} /> {t.backtestPeriod}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      aria-label={backtestCopy.monthsInputAria}
                      min={MIN_MONTHS}
                      max={MAX_MONTHS}
                      step={1}
                      value={paramsMa.months}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          months: normalizeIntegerInput(
                            e.target.value,
                            BACKTEST_DEFAULTS.COMMON.MONTHS,
                            MIN_MONTHS,
                            MAX_MONTHS,
                          ),
                        }))
                      }
                      className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 accent-blue-600"
                    />
                    <span className="text-sm font-black text-slate-900 dark:text-white w-14">
                      {paramsMa.months}{t.months}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <DollarSign size={12} /> $ {t.dailyBuyAmount}
                  </label>
                  <input
                    type="number"
                    aria-label={backtestCopy.amountInputAria}
                    value={paramsMa.dailyBuyAmount}
                    onChange={(e) => setParamsMa((p) => ({ ...p, dailyBuyAmount: Number(e.target.value) || 0 }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Percent size={12} /> {t.feeRate} ({t.feeRateUnit})
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    value={paramsMa.feeRate}
                    onChange={(e) => setParamsMa((p) => ({ ...p, feeRate: Number(e.target.value) || 0 }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>
              {/* 구간 0: RSI / 정배열 사용 여부 */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                    {t.rsiUse}
                  </span>
                  <Toggle
                    checked={paramsMa.rsiEnabled}
                    onChange={(v) => setParamsMa((p) => ({ ...p, rsiEnabled: v }))}
                    aria-label={t.rsiUse}
                  />
                  {paramsMa.rsiEnabled && (
                    <input
                      type="number"
                      min={10}
                      max={60}
                      value={paramsMa.rsiThreshold}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          rsiThreshold: Math.min(
                            60,
                            Math.max(
                              10,
                              Number(e.target.value) ||
                                BACKTEST_DEFAULTS.MA.RSI_THRESHOLD,
                            ),
                          ),
                        }))
                      }
                      className="w-20 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-bold"
                    />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                    {t.alignmentUse}
                  </span>
                  <Toggle
                    checked={paramsMa.alignmentEnabled}
                    onChange={(v) => setParamsMa((p) => ({ ...p, alignmentEnabled: v }))}
                    aria-label={t.alignmentUse}
                  />
                </div>
              </div>
              {/* 구간 1 */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">{t.section1}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">
                      {t.maPeriod} A (일)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={paramsMa.maAPeriod}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          maAPeriod:
                            Number(e.target.value) ||
                            BACKTEST_DEFAULTS.MA.SHORT_PERIOD_DAYS,
                        }))
                      }
                      className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{t.stock}</label>
                    <CustomDropdown
                      value={paramsMa.maAStock}
                      options={stockOptions}
                      onChange={(v) => setParamsMa((p) => ({ ...p, maAStock: v }))}
                      header={t.stock}
                      infoModalBadgeLabel={commonCopy.notice}
                      infoModalCloseAriaLabel={commonCopy.closeDialog}
                      infoModalConfirmLabel={commonCopy.acknowledge}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={paramsMa.maATakeProfit}
                      onChange={(checked) =>
                        setParamsMa((p) => ({ ...p, maATakeProfit: checked }))
                      }
                      aria-label={t.takeProfit}
                    />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t.takeProfit}</span>
                  </label>
                  {paramsMa.maATakeProfit && (
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={paramsMa.maATakeProfitPct}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          maATakeProfitPct:
                            Number(e.target.value) ||
                            BACKTEST_DEFAULTS.MA.SHORT_PERIOD_TAKE_PROFIT_PERCENT,
                        }))
                      }
                      className="w-20 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-bold"
                    />
                  )}
                </div>
              </div>
              {/* 구간 2 */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">{t.section2}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">
                      {t.maPeriod} B (일)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={paramsMa.maBPeriod}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          maBPeriod:
                            Number(e.target.value) ||
                            BACKTEST_DEFAULTS.MA.LONG_PERIOD_DAYS,
                        }))
                      }
                      className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{t.stock}</label>
                    <CustomDropdown
                      value={paramsMa.maBStock}
                      options={stockOptions}
                      onChange={(v) => setParamsMa((p) => ({ ...p, maBStock: v }))}
                      header={t.stock}
                      infoModalBadgeLabel={commonCopy.notice}
                      infoModalCloseAriaLabel={commonCopy.closeDialog}
                      infoModalConfirmLabel={commonCopy.acknowledge}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={paramsMa.maBTakeProfit}
                      onChange={(checked) =>
                        setParamsMa((p) => ({ ...p, maBTakeProfit: checked }))
                      }
                      aria-label={t.takeProfit}
                    />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t.takeProfit}</span>
                  </label>
                  {paramsMa.maBTakeProfit && (
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={paramsMa.maBTakeProfitPct}
                      onChange={(e) =>
                        setParamsMa((p) => ({
                          ...p,
                          maBTakeProfitPct:
                            Number(e.target.value) ||
                            BACKTEST_DEFAULTS.MA.LONG_PERIOD_TAKE_PROFIT_PERCENT,
                        }))
                      }
                      className="w-20 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-bold"
                    />
                  )}
                </div>
              </div>
              {/* 구간 3 */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">{t.section3}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{t.stock}</label>
                    <CustomDropdown value={paramsMa.ma3Stock} options={stockOptions} onChange={(v) => setParamsMa((p) => ({ ...p, ma3Stock: v }))} header={t.stock} infoModalBadgeLabel={commonCopy.notice} infoModalCloseAriaLabel={commonCopy.closeDialog} infoModalConfirmLabel={commonCopy.acknowledge} />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle checked={paramsMa.ma3TakeProfit} onChange={(checked) => setParamsMa((p) => ({ ...p, ma3TakeProfit: checked }))} aria-label={t.takeProfit} />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t.takeProfit}</span>
                  </label>
                  {paramsMa.ma3TakeProfit && (
                    <input type="number" min={1} max={100} value={paramsMa.ma3TakeProfitPct} onChange={(e) => setParamsMa((p) => ({ ...p, ma3TakeProfitPct: Number(e.target.value) || BACKTEST_DEFAULTS.MA.BELOW_MA_TAKE_PROFIT_PERCENT }))} className="w-20 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-bold" />
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                <Info size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{t.backtestMocNote}</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setStep('strategy'); setStrategyId(null); }} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  {t.cancel}
                </button>
                <button type="button" onClick={() => void handleRunBacktest()} disabled={isExecuting} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed">
                  <Zap size={18} /> {isExecuting ? backtestCopy.processing : backtestCopy.startRun}
                </button>
              </div>
            </div>
          )}

          {strategyId === 'multi_split' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.stock}</label>
                  <CustomDropdown value={paramsMulti.stock} options={stockOptions} onChange={(v) => setParamsMulti((p) => ({ ...p, stock: v }))} header={t.stock} infoModalBadgeLabel={commonCopy.notice} infoModalCloseAriaLabel={commonCopy.closeDialog} infoModalConfirmLabel={commonCopy.acknowledge} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.backtestPeriod}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      aria-label={backtestCopy.monthsInputAria}
                      min={MIN_MONTHS}
                      max={MAX_MONTHS}
                      step={1}
                      value={paramsMulti.months}
                      onChange={(e) =>
                        setParamsMulti((p) => ({
                          ...p,
                          months: normalizeIntegerInput(
                            e.target.value,
                            BACKTEST_DEFAULTS.COMMON.MONTHS,
                            MIN_MONTHS,
                            MAX_MONTHS,
                          ),
                        }))
                      }
                      className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 accent-emerald-600"
                    />
                    <span className="text-sm font-black text-slate-900 dark:text-white w-14">{paramsMulti.months}{t.months}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.targetReturnRate} (%)</label>
                  <input type="number" min={1} max={50} value={paramsMulti.targetReturnRate} onChange={(e) => setParamsMulti((p) => ({ ...p, targetReturnRate: Number(e.target.value) || BACKTEST_DEFAULTS.COMMON.TARGET_RETURN_RATE_PERCENT }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.totalSplitCount}</label>
                  <input type="number" min={5} max={80} value={paramsMulti.totalSplitCount} onChange={(e) => setParamsMulti((p) => ({ ...p, totalSplitCount: Number(e.target.value) || BACKTEST_DEFAULTS.COMMON.TOTAL_SPLIT_COUNT }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">$ {t.oneTimeAmount}</label>
                  <input
                    type="number"
                    aria-label={backtestCopy.amountInputAria}
                    value={paramsMulti.oneTimeAmount}
                    onChange={(e) =>
                      setParamsMulti((p) => ({
                        ...p,
                        oneTimeAmount:
                          Number(e.target.value) ||
                          BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
                      }))
                    }
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.feeRate} (%)</label>
                  <input type="number" step={0.01} value={paramsMulti.feeRate} onChange={(e) => setParamsMulti((p) => ({ ...p, feeRate: Number(e.target.value) || 0 }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
                </div>
              </div>
              <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                <Info size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{t.backtestMocNote}</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setStep('strategy'); setStrategyId(null); }} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">{t.cancel}</button>
                <button type="button" onClick={() => void handleRunBacktest()} disabled={isExecuting} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed">
                  <Zap size={18} /> {isExecuting ? backtestCopy.processing : backtestCopy.startRun}
                </button>
              </div>
            </div>
          )}

          {strategyId === 'no_stop_multi_split' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.stock}</label>
                  <CustomDropdown
                    value={paramsNoStopMulti.stock}
                    options={stockOptions}
                    onChange={(v) => setParamsNoStopMulti((p) => ({ ...p, stock: v }))}
                    header={t.stock}
                    infoModalBadgeLabel={commonCopy.notice}
                    infoModalCloseAriaLabel={commonCopy.closeDialog}
                    infoModalConfirmLabel={commonCopy.acknowledge}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.backtestPeriod}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      aria-label={backtestCopy.monthsInputAria}
                      min={MIN_MONTHS}
                      max={MAX_MONTHS}
                      step={1}
                      value={paramsNoStopMulti.months}
                      onChange={(e) =>
                        setParamsNoStopMulti((p) => ({
                          ...p,
                          months: normalizeIntegerInput(
                            e.target.value,
                            BACKTEST_DEFAULTS.COMMON.MONTHS,
                            MIN_MONTHS,
                            MAX_MONTHS,
                          ),
                        }))
                      }
                      className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 accent-emerald-600"
                    />
                    <span className="text-sm font-black text-slate-900 dark:text-white w-14">
                      {paramsNoStopMulti.months}{t.months}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.totalSplitCount}</label>
                  <input
                    type="number"
                    min={10}
                    max={80}
                    value={paramsNoStopMulti.totalSplitCount}
                    onChange={(e) => setParamsNoStopMulti((p) => ({ ...p, totalSplitCount: Number(e.target.value) || 40 }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    {backtestCopy.lowLocBudgetRatioLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={paramsNoStopMulti.lowLocBudgetRatio}
                    onChange={(e) => setParamsNoStopMulti((p) => ({ ...p, lowLocBudgetRatio: Number(e.target.value) || BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.LOW_LOC_BUDGET_RATIO_PERCENT }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    {backtestCopy.highLocPremiumLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={paramsNoStopMulti.highLocPremiumPct}
                    onChange={(e) => setParamsNoStopMulti((p) => ({ ...p, highLocPremiumPct: Number(e.target.value) || BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.HIGH_LOC_PREMIUM_PERCENT }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {backtestCopy.highLocPremiumHint}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    {backtestCopy.takeProfitLabel}
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={paramsNoStopMulti.takeProfitPct}
                    onChange={(e) => setParamsNoStopMulti((p) => ({ ...p, takeProfitPct: Number(e.target.value) || BACKTEST_DEFAULTS.NO_STOP_MULTI_SPLIT.TAKE_PROFIT_PERCENT }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {backtestCopy.takeProfitHint}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    $ {t.oneTimeAmount}
                  </label>
                  <input
                    type="number"
                    aria-label={backtestCopy.amountInputAria}
                    value={paramsNoStopMulti.oneTimeAmount}
                    onChange={(e) =>
                      setParamsNoStopMulti((p) => ({
                        ...p,
                        oneTimeAmount:
                          Number(e.target.value) ||
                          BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
                      }))
                    }
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    {t.feeRate} (%)
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    value={paramsNoStopMulti.feeRate}
                    onChange={(e) => setParamsNoStopMulti((p) => ({ ...p, feeRate: Number(e.target.value) || 0 }))}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                <Info size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                  {t.backtestMocNote}
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setStep('strategy'); setStrategyId(null); }}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunBacktest()}
                  disabled={isExecuting}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Zap size={18} /> {isExecuting ? backtestCopy.processing : backtestCopy.startRun}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: 결과 (에러 시 메시지, 성공 시 KPI·차트) */}
      {step === 'results' && backtestError && (
        <div className="space-y-6">
          <div className="rounded-2xl p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/40">
            <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">
              {backtestCopy.backtestUnavailableTitle}
            </p>
            <p className="text-slate-700 dark:text-slate-300 font-medium">{backtestError}</p>
          </div>
          <button type="button" onClick={handleNewSettings} className="w-full py-4 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-black text-sm hover:bg-slate-200 dark:hover:bg-white/20 transition-colors flex items-center justify-center gap-2">
            <ChevronLeft size={18} /> {t.newBacktestSettings}
          </button>
        </div>
      )}
      {step === 'results' && result && !backtestError && (
        <div className="space-y-6">
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 dark:border-blue-400/30">
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.totalReturn}</p>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400">+{result.totalReturnPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.cagr}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{result.cagrPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.mdd}</p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 flex items-center gap-1">
                {result.mddPct.toFixed(1)}%
                <span className="text-rose-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg></span>
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{t.mddHint}</p>
            </div>
            <div className="rounded-2xl p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.winRate}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{result.winRatePct.toFixed(1)}%</p>
            </div>
          </div>

          {/* 자산 성장 곡선 + PRO 벤치마크 오버레이 */}
          <div className="relative">
            <Suspense fallback={<div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
              <BacktestResultsCharts
                result={result}
                chart="equity"
                assetGrowthCurveLabel={t.assetGrowthCurve}
                drawdownChartLabel={t.drawdownChart}
                drawdownHint={t.drawdownHint}
              />
            </Suspense>
            {(currentTier === 'free' || !currentTier) && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm pointer-events-none">
                <div className="pointer-events-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-2xl max-w-sm text-center">
                  <Crown size={32} className="mx-auto text-amber-500 mb-3" />
                  <h4 className="text-lg font-black text-slate-900 dark:text-white mb-2">
                    {backtestCopy.benchmarkCompare}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    {backtestCopy.benchmarkCompareUpgrade}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onRequestUpgrade != null) {
                        onRequestUpgrade();
                        return;
                      }
                      const pricingTab = document.querySelector(
                        '[data-tab="pricing"]',
                      );
                      if (pricingTab instanceof HTMLElement) {
                        pricingTab.click();
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    {backtestCopy.upgradeNow}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 낙폭 차트 */}
          <Suspense fallback={<div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
            <BacktestResultsCharts
              result={result}
              chart="drawdown"
              assetGrowthCurveLabel={t.assetGrowthCurve}
              drawdownChartLabel={t.drawdownChart}
              drawdownHint={t.drawdownHint}
            />
          </Suspense>

          {/* 샤프 & 평균 보유 기간 */}
          <div className="rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-5 shadow-lg grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.sharpeRatio}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{result.sharpeRatio.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">{t.avgHoldingPeriod}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{result.avgHoldingDays}{t.days}</p>
            </div>
          </div>

          <button type="button" onClick={handleNewSettings} className="w-full py-4 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-black text-sm hover:bg-slate-200 dark:hover:bg-white/20 transition-colors flex items-center justify-center gap-2">
            <ChevronLeft size={18} /> {t.newBacktestSettings}
          </button>
        </div>
      )}
    </div>
  );
};

export default Backtest;
