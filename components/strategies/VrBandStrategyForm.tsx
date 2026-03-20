import React from 'react';
import { VrBandStrategyParams } from '../../types';
import { Orbit, Wallet, Target, Percent } from 'lucide-react';
import { VR_CREATOR_LABELS } from '../../constants/vrMessages';
import { VR_LIMITS } from '../../constants/vrConstants';

export interface VrBandFormValues {
  vrMode: VrBandStrategyParams['vrMode'];
  vrInitialCapital: number;
  vrInitialV: number;
  vrMinOrderQty: number;
  vrBandUpperPct: number;
  vrBandLowerPct: number;
  vrG: number;
  vrPoolUsagePct: number;
  vrDeltaCash: number;
}

export interface VrBandFormCallbacks {
  setVrMode: (mode: VrBandStrategyParams['vrMode']) => void;
  setVrInitialCapital: (v: number) => void;
  setVrInitialV: (v: number) => void;
  setVrMinOrderQty: (v: number) => void;
  setVrBandUpperPct: (v: number) => void;
  setVrBandLowerPct: (v: number) => void;
  setVrG: (v: number) => void;
  setVrPoolUsagePct: (v: number) => void;
  setVrDeltaCash: (v: number) => void;
}

interface VrBandStrategyFormProps {
  lang: 'ko' | 'en';
  values: VrBandFormValues;
  callbacks: VrBandFormCallbacks;
  showErrors: boolean;
}

const VrBandStrategyForm: React.FC<VrBandStrategyFormProps> = ({ lang, values, callbacks, showErrors }) => {
  const vrT = VR_CREATOR_LABELS[lang];
  const {
    vrMode, vrInitialCapital, vrInitialV, vrMinOrderQty,
    vrBandUpperPct, vrBandLowerPct, vrG, vrPoolUsagePct, vrDeltaCash,
  } = values;
  const {
    setVrMode, setVrInitialCapital, setVrInitialV, setVrMinOrderQty,
    setVrBandUpperPct, setVrBandLowerPct, setVrG, setVrPoolUsagePct, setVrDeltaCash,
  } = callbacks;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="bg-gradient-to-br from-indigo-500/5 via-sky-500/5 to-violet-500/5 dark:from-indigo-500/10 dark:via-sky-500/10 dark:to-violet-600/20 border border-indigo-500/30 dark:border-indigo-500/40 p-8 rounded-[2rem] space-y-6 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600/20 rounded-full flex items-center justify-center border border-indigo-500/60">
            <Orbit className="text-indigo-600 dark:text-indigo-400" size={20} />
          </div>
          <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-widest">
            {vrT.sectionTitle}
          </h3>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
            {vrT.modeLabel}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['lump_sum', 'accumulate', 'withdraw'] as VrBandStrategyParams['vrMode'][]).map((mode) => {
              const isActive = vrMode === mode;
              const rawLabel =
                mode === 'lump_sum'
                  ? vrT.modes.lump_sum
                  : mode === 'accumulate'
                  ? vrT.modes.accumulate
                  : vrT.modes.withdraw;
              const [title, subtitleRaw] = rawLabel.split('(');
              const subtitle = subtitleRaw ? `(${subtitleRaw}` : '';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setVrMode(mode)}
                  className={`flex flex-col items-center justify-center text-center gap-1 px-4 py-3 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-md shadow-indigo-500/10 dark:bg-indigo-500/20 dark:border-indigo-400 dark:text-indigo-300'
                      : 'border-slate-200 bg-white/60 text-slate-500 hover:border-indigo-300 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-400'
                  }`}
                >
                  <span className="text-sm font-black tracking-widest">{title.trim()}</span>
                  {subtitle && (
                    <span className="text-[10px] font-semibold opacity-80">{subtitle.trim()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.initialCapital}
            </label>
            <div className="relative">
              <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="number"
                min={1}
                value={vrInitialCapital}
                onChange={(e) => setVrInitialCapital(Math.max(0, Number(e.target.value)))}
                className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
              />
            </div>
            {showErrors && (!vrInitialCapital || vrInitialCapital <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '초기 투자 원금은 0보다 커야 합니다.' : 'Initial capital must be greater than 0.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.initialV}
            </label>
            <div className="relative">
              <Target className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="number"
                min={1}
                value={vrInitialV}
                onChange={(e) => setVrInitialV(Math.max(0, Number(e.target.value)))}
                className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
              />
            </div>
            {showErrors && (!vrInitialV || vrInitialV <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '초기 V 값은 0보다 커야 합니다.' : 'Initial V must be greater than 0.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.bandUpper}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="number"
                min={0}
                step="0.01"
                value={vrBandUpperPct}
                onChange={(e) => setVrBandUpperPct(Math.max(0, Number(e.target.value)))}
                className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.bandLower}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="number"
                min={0}
                step="0.01"
                value={vrBandLowerPct}
                onChange={(e) => setVrBandLowerPct(Math.max(0, Number(e.target.value)))}
                className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500/60 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.minOrderQty}
            </label>
            <input
              type="number"
              min={1}
              value={vrMinOrderQty}
              onChange={(e) => setVrMinOrderQty(Math.max(1, Number(e.target.value)))}
              className="w-full p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
            />
            {showErrors && (!vrMinOrderQty || vrMinOrderQty <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '최소 주문 수량은 1주 이상이어야 합니다.' : 'Minimum order quantity must be at least 1 share.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.G}
            </label>
            <input
              type="number"
              min={VR_LIMITS.MIN_G_VALUE}
              step="0.1"
              value={vrG}
              onChange={(e) => setVrG(Math.max(VR_LIMITS.MIN_G_VALUE, Number(e.target.value)))}
              className="w-full p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              {vrT.poolUsage}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={vrPoolUsagePct}
                onChange={(e) => setVrPoolUsagePct(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
              />
            </div>
          </div>

          {vrMode !== 'lump_sum' && (
            <div className="space-y-3 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                {vrT.deltaCash}
              </label>
              <div className="relative max-w-xs">
                <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="number"
                  step="1"
                  value={vrDeltaCash}
                  onChange={(e) => setVrDeltaCash(Number(e.target.value))}
                  className="w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VrBandStrategyForm;
