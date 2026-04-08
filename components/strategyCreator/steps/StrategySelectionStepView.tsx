import React from 'react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type { StrategySelectionStepViewProps } from '../types/ui';

export function StrategySelectionStepView({
  heading,
  description,
  definitions,
  selectedStrategy,
  onSelectStrategy,
}: StrategySelectionStepViewProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          {heading}
        </h3>
        <p className={STRATEGY_CREATOR_STYLES.helperText}>{description}</p>
      </div>

      <div className="space-y-4">
        {definitions.map((definition) => {
          const isSelected = selectedStrategy === definition.id;

          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => onSelectStrategy(definition.id)}
              className={`w-full rounded-[2rem] border p-6 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10'
                  : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${definition.gradientClassName}`}
                >
                  {definition.icon}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                      {definition.title}
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {definition.tierLabel}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {definition.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}