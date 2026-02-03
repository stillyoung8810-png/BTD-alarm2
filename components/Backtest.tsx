/**
 * 전략 백테스트 페이지: 전략 선택 → 파라미터 설정 → 결과 (UI 전용, 연산 엔진 연동 전)
 */

import React, { useState, Suspense, lazy } from 'react';
import { I18N, ALL_STOCKS } from '../constants';
import { TrendingUp, Layers, Zap, ChevronLeft, Calendar, DollarSign, Percent, Crown, Info } from 'lucide-react';
import CustomDropdown from './CustomDropdown';
import Toggle from './Toggle';

const BacktestResultsCharts = lazy(() => import('./BacktestResultsCharts'));

export type BacktestStrategyId = 'rsi_ma_interval' | 'multi_split';

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

const DEFAULT_PARAMS_MA: BacktestParamsMa = {
  baseStock: 'QQQ',
  rsiEnabled: false,
  rsiThreshold: 30,
  alignmentEnabled: false,
  maAPeriod: 20,
  maAStock: 'TQQQ',
  maATakeProfit: false,
  maATakeProfitPct: 10,
  maBPeriod: 60,
  maBStock: 'QLD',
  maBTakeProfit: false,
  maBTakeProfitPct: 10,
  ma3Stock: 'QQQ',
  ma3TakeProfit: false,
  ma3TakeProfitPct: 10,
  dailyBuyAmount: 1000,
  months: 24,
  feeRate: 0.25,
};

const DEFAULT_PARAMS_MULTI: BacktestParamsMultiSplit = {
  stock: 'TQQQ',
  targetReturnRate: 10,
  totalSplitCount: 40,
  oneTimeAmount: 1000,
  months: 24,
  feeRate: 0.25,
};

// 목업 결과 데이터
function buildMockResult(): BacktestResult {
  const eq: { date: string; value: number }[] = [];
  const dd: { date: string; drawdown: number }[] = [];
  let v = 100;
  const start = new Date();
  start.setMonth(start.getMonth() - 24);
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

interface BacktestProps {
  lang: 'ko' | 'en';
}

const Backtest: React.FC<BacktestProps> = ({ lang }) => {
  const t = I18N[lang];
  const [step, setStep] = useState<Step>('strategy');
  const [strategyId, setStrategyId] = useState<BacktestStrategyId | null>(null);
  const [paramsMa, setParamsMa] = useState<BacktestParamsMa>(DEFAULT_PARAMS_MA);
  const [paramsMulti, setParamsMulti] = useState<BacktestParamsMultiSplit>(DEFAULT_PARAMS_MULTI);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const handleSelectStrategy = (id: BacktestStrategyId) => {
    setStrategyId(id);
    setStep('params');
  };

  const handleRunBacktest = async () => {
    if (strategyId === 'multi_split') {
      const apiUrl = (import.meta as any).env?.VITE_BACKTEST_MULTI_URL;
      if (apiUrl) {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stock: paramsMulti.stock,
              targetReturnRate: paramsMulti.targetReturnRate,
              totalSplitCount: paramsMulti.totalSplitCount,
              oneTimeAmount: paramsMulti.oneTimeAmount,
              months: paramsMulti.months,
              feeRate: paramsMulti.feeRate,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const body = typeof data.body === 'string' ? JSON.parse(data.body) : data;
            if (body.error) {
              setBacktestError(body.error);
              setResult(null);
              setStep('results');
              return;
            }
            if (body.equityCurve) {
              setBacktestError(null);
              setResult({
                totalReturnPct: body.totalReturnPct ?? 0,
                cagrPct: body.cagrPct ?? 0,
                mddPct: body.mddPct ?? 0,
                winRatePct: body.winRatePct ?? 0,
                sharpeRatio: body.sharpeRatio ?? 0,
                avgHoldingDays: body.avgHoldingDays ?? 0,
                equityCurve: body.equityCurve,
                drawdownSeries: body.drawdownSeries ?? [],
              });
              setStep('results');
              return;
            }
          }
        } catch (_e) {
          // fallback to mock
        }
      }
    }
    setBacktestError(null);
    setResult(buildMockResult());
    setStep('results');
  };

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
        </div>
      )}

      {/* Step 2: 파라미터 설정 */}
      {step === 'params' && strategyId && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl">
          <button type="button" onClick={() => { setStep('strategy'); setStrategyId(null); }} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-bold mb-4 transition-colors">
            <ChevronLeft size={18} /> {lang === 'ko' ? '전략 선택으로' : 'Back to strategy'}
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
                    header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Calendar size={12} /> {t.backtestPeriod}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={6}
                      max={24}
                      step={1}
                      value={paramsMa.months}
                      onChange={(e) => setParamsMa((p) => ({ ...p, months: Number(e.target.value) }))}
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
                          rsiThreshold: Math.min(60, Math.max(10, Number(e.target.value) || 30)),
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
                          maAPeriod: Number(e.target.value) || 20,
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
                          maATakeProfitPct: Number(e.target.value) || 10,
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
                          maBPeriod: Number(e.target.value) || 60,
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
                          maBTakeProfitPct: Number(e.target.value) || 10,
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
                    <CustomDropdown value={paramsMa.ma3Stock} options={stockOptions} onChange={(v) => setParamsMa((p) => ({ ...p, ma3Stock: v }))} header={t.stock} />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle checked={paramsMa.ma3TakeProfit} onChange={(checked) => setParamsMa((p) => ({ ...p, ma3TakeProfit: checked }))} aria-label={t.takeProfit} />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t.takeProfit}</span>
                  </label>
                  {paramsMa.ma3TakeProfit && (
                    <input type="number" min={1} max={100} value={paramsMa.ma3TakeProfitPct} onChange={(e) => setParamsMa((p) => ({ ...p, ma3TakeProfitPct: Number(e.target.value) || 10 }))} className="w-20 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-bold" />
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
                <button type="button" onClick={handleRunBacktest} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-transform">
                  <Zap size={18} /> {t.backtestRun}
                </button>
              </div>
            </div>
          )}

          {strategyId === 'multi_split' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.stock}</label>
                  <CustomDropdown value={paramsMulti.stock} options={stockOptions} onChange={(v) => setParamsMulti((p) => ({ ...p, stock: v }))} header={t.stock} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">{t.backtestPeriod}</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={6} max={24} step={1} value={paramsMulti.months} onChange={(e) => setParamsMulti((p) => ({ ...p, months: Number(e.target.value) }))} className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 accent-emerald-600" />
                    <span className="text-sm font-black text-slate-900 dark:text-white w-14">{paramsMulti.months}{t.months}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.targetReturnRate} (%)</label>
                  <input type="number" min={1} max={50} value={paramsMulti.targetReturnRate} onChange={(e) => setParamsMulti((p) => ({ ...p, targetReturnRate: Number(e.target.value) || 10 }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t.totalSplitCount}</label>
                  <input type="number" min={5} max={80} value={paramsMulti.totalSplitCount} onChange={(e) => setParamsMulti((p) => ({ ...p, totalSplitCount: Number(e.target.value) || 40 }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">$ {t.oneTimeAmount}</label>
                  <input type="number" value={paramsMulti.oneTimeAmount} onChange={(e) => setParamsMulti((p) => ({ ...p, oneTimeAmount: Number(e.target.value) || 1000 }))} className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white font-bold" />
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
                <button type="button" onClick={handleRunBacktest} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-transform">
                  <Zap size={18} /> {t.backtestRun}
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
              {lang === 'ko' ? '백테스트 실행 불가' : 'Backtest could not run'}
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
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm pointer-events-none">
              <div className="pointer-events-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-2xl max-w-sm text-center">
                <Crown size={32} className="mx-auto text-amber-500 mb-3" />
                <h4 className="text-lg font-black text-slate-900 dark:text-white mb-2">{t.benchmarkCompare}</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t.benchmarkCompareUpgrade}</p>
                <button type="button" className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-lg">
                  {t.upgradeNow}
                </button>
              </div>
            </div>
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
