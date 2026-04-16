import React from 'react';
import { DraftNumberInput } from '@/components/common/DraftNumberInput';
import { VrBandStrategyParams } from '../../types';
import { Orbit, Wallet, Target, Percent } from 'lucide-react';
import {
  VR_CREATOR_LABELS,
  VR_DELTA_CASH_VALIDATION_MESSAGES,
  VR_MODE_KEYS,
} from '../../constants/vrMessages';
import {
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '../../constants/vrConstants';

export interface VrBandStrategyFormProps {
  lang: 'ko' | 'en';
  showErrors: boolean;
  vrMode: VrBandStrategyParams['vrMode'];
  onVrModeChange: (mode: VrBandStrategyParams['vrMode']) => void;
  vrInitialCapital: number;
  onVrInitialCapitalChange: (rawValue: string) => number;
  vrInitialV: number;
  onVrInitialVChange: (rawValue: string) => number;
  vrMinOrderQty: number;
  onVrMinOrderQtyChange: (rawValue: string) => number;
  vrBandUpperPct: number;
  onVrBandUpperPctChange: (rawValue: string) => number;
  vrBandLowerPct: number;
  onVrBandLowerPctChange: (rawValue: string) => number;
  vrG: number;
  onVrGChange: (rawValue: string) => number;
  vrPoolUsagePct: number;
  onVrPoolUsagePctChange: (rawValue: string) => number;
  vrDeltaCash: number;
  onVrDeltaCashChange: (rawValue: string) => number;
  vrCycleWeeks: number;
  onVrCycleWeeksChange: (v: number) => void;
}

const VR_LABEL_CLASS_NAME =
  'text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest';
const VR_INPUT_CLASS_NAME =
  'w-full p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm';
const VR_ICON_INPUT_CLASS_NAME =
  'w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm';
const VR_ICON_INPUT_SUCCESS_CLASS_NAME =
  'w-full p-4 pl-12 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500/60 transition-all shadow-sm';

const VrBandStrategyForm: React.FC<VrBandStrategyFormProps> = ({
  lang,
  showErrors,
  vrMode,
  onVrModeChange,
  vrInitialCapital,
  onVrInitialCapitalChange,
  vrInitialV,
  onVrInitialVChange,
  vrMinOrderQty,
  onVrMinOrderQtyChange,
  vrBandUpperPct,
  onVrBandUpperPctChange,
  vrBandLowerPct,
  onVrBandLowerPctChange,
  vrG,
  onVrGChange,
  vrPoolUsagePct,
  onVrPoolUsagePctChange,
  vrDeltaCash,
  onVrDeltaCashChange,
  vrCycleWeeks,
  onVrCycleWeeksChange,
}) => {
  const vrT = VR_CREATOR_LABELS[lang];
  const deltaCashValidationCopy = VR_DELTA_CASH_VALIDATION_MESSAGES[lang];
  const deltaCashFailure = getVrDeltaCashInputValidationReason(vrDeltaCash);

  const cycleWeekOptions = React.useMemo(
    () =>
      Array.from(
        { length: VR_CYCLE.MAX_WEEKS - VR_CYCLE.MIN_WEEKS + 1 },
        (_, i) => VR_CYCLE.MIN_WEEKS + i
      ),
    []
  );

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
            {VR_MODE_KEYS.map((mode) => {
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
                  onClick={() => onVrModeChange(mode)}
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

        <div className="space-y-3 max-w-xs">
          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
            {vrT.cycleWeeks}
          </label>
          <select
            value={vrCycleWeeks}
            onChange={(e) => onVrCycleWeeksChange(Number(e.target.value))}
            className="w-full p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black text-slate-900 dark:text-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all shadow-sm"
          >
            {cycleWeekOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label htmlFor="vr-initial-capital" className={VR_LABEL_CLASS_NAME}>
              {vrT.initialCapital}
            </label>
            <div className="relative">
              <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-initial-capital"
                value={vrInitialCapital}
                onCommit={onVrInitialCapitalChange}
                className={VR_ICON_INPUT_CLASS_NAME}
                ariaLabel={vrT.initialCapital}
              />
            </div>
            {showErrors && (!vrInitialCapital || vrInitialCapital <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '초기 투자 원금은 0보다 커야 합니다.' : 'Initial capital must be greater than 0.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-initial-v" className={VR_LABEL_CLASS_NAME}>
              {vrT.initialV}
            </label>
            <div className="relative">
              <Target className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-initial-v"
                value={vrInitialV}
                onCommit={onVrInitialVChange}
                className={VR_ICON_INPUT_CLASS_NAME}
                ariaLabel={vrT.initialV}
              />
            </div>
            {showErrors && (!vrInitialV || vrInitialV <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '초기 V 값은 0보다 커야 합니다.' : 'Initial V must be greater than 0.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-band-upper" className={VR_LABEL_CLASS_NAME}>
              {vrT.bandUpper}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-band-upper"
                value={vrBandUpperPct}
                onCommit={onVrBandUpperPctChange}
                allowDecimal={false}
                className={VR_ICON_INPUT_CLASS_NAME}
                ariaLabel={vrT.bandUpper}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-band-lower" className={VR_LABEL_CLASS_NAME}>
              {vrT.bandLower}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-band-lower"
                value={vrBandLowerPct}
                onCommit={onVrBandLowerPctChange}
                allowDecimal={false}
                className={VR_ICON_INPUT_SUCCESS_CLASS_NAME}
                ariaLabel={vrT.bandLower}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-min-order-qty" className={VR_LABEL_CLASS_NAME}>
              {vrT.minOrderQty}
            </label>
            <DraftNumberInput
              id="vr-min-order-qty"
              value={vrMinOrderQty}
              onCommit={onVrMinOrderQtyChange}
              className={VR_INPUT_CLASS_NAME}
              ariaLabel={vrT.minOrderQty}
            />
            {showErrors && (!vrMinOrderQty || vrMinOrderQty <= 0) && (
              <p className="text-[10px] text-red-500 font-medium">
                {lang === 'ko' ? '최소 주문 수량은 1주 이상이어야 합니다.' : 'Minimum order quantity must be at least 1 share.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-g" className={VR_LABEL_CLASS_NAME}>
              {vrT.G}
            </label>
            <DraftNumberInput
              id="vr-g"
              value={vrG}
              onCommit={onVrGChange}
              allowDecimal={false}
              className={VR_INPUT_CLASS_NAME}
              ariaLabel={vrT.G}
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="vr-pool-usage" className={VR_LABEL_CLASS_NAME}>
              {vrT.poolUsage}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-pool-usage"
                value={vrPoolUsagePct}
                onCommit={onVrPoolUsagePctChange}
                allowDecimal={false}
                className={VR_ICON_INPUT_CLASS_NAME}
                ariaLabel={vrT.poolUsage}
              />
            </div>
          </div>

          {vrMode !== 'lump_sum' && (
            <div className="space-y-3 md:col-span-2">
              <label htmlFor="vr-delta-cash" className={VR_LABEL_CLASS_NAME}>
                {vrT.deltaCash}
              </label>
              <div className="relative max-w-xs">
                <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <DraftNumberInput
                  id="vr-delta-cash"
                  value={vrDeltaCash}
                  onCommit={onVrDeltaCashChange}
                  className={VR_ICON_INPUT_CLASS_NAME}
                  ariaLabel={vrT.deltaCash}
                />
              </div>
              {showErrors && deltaCashFailure != null && (
                <p className="text-[10px] text-red-500 font-medium">
                  {deltaCashValidationCopy[deltaCashFailure]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VrBandStrategyForm;
