import React, { useCallback } from 'react';
import { Info } from 'lucide-react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  StrategyDefinitionViewModel,
  StrategyGuideEntryViewModel,
  StrategySelectionStepViewProps,
} from '../types/ui';
import type { StrategyType } from '@/src/components/StrategyCreator/utils';
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

function getStrategyCardClassName(isSelected: boolean): string {
  if (isSelected) {
    return 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10';
  }

  return 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70';
}

interface StrategyDefinitionCardProps {
  definition: StrategyDefinitionViewModel;
  guideEntry: StrategyGuideEntryViewModel | null;
  isSelected: boolean;
  onSelectStrategy: (strategy: StrategyType) => void;
  onOpenStrategyGuide: (strategy: StrategyType) => void;
}

function StrategyDefinitionCard({
  definition,
  guideEntry,
  isSelected,
  onSelectStrategy,
  onOpenStrategyGuide,
}: StrategyDefinitionCardProps): React.ReactElement {
  const handleSelectStrategy = useCallback(() => {
    onSelectStrategy(definition.id);
  }, [definition.id, onSelectStrategy]);

  const handleOpenStrategyGuide = useCallback(() => {
    onOpenStrategyGuide(definition.id);
  }, [definition.id, onOpenStrategyGuide]);

  return (
    <div
      className={`relative rounded-[2rem] border transition-all ${getStrategyCardClassName(
        isSelected,
      )}`}
    >
      <button
        type="button"
        onClick={handleSelectStrategy}
        className="w-full p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${definition.gradientClassName}`}
          >
            {definition.icon}
          </div>
          <div className="space-y-2 pr-10">
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

      {guideEntry != null && (
        <button
          type="button"
          onClick={handleOpenStrategyGuide}
          aria-label={guideEntry.openButtonAriaLabel}
          className={STRATEGY_CREATOR_STYLES.strategyGuideInfoButton}
        >
          <Info size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function StrategySelectionStepView({
  lang,
  heading,
  description,
  definitions,
  selectedStrategy,
  guideEntriesByStrategy,
  onSelectStrategy,
  onOpenStrategyGuide,
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
        {definitions.map((definition) => (
          <StrategyDefinitionCard
            key={definition.id}
            definition={definition}
            guideEntry={guideEntriesByStrategy[definition.id] ?? null}
            isSelected={selectedStrategy === definition.id}
            onSelectStrategy={onSelectStrategy}
            onOpenStrategyGuide={onOpenStrategyGuide}
          />
        ))}
      </div>

      <LegalDisclaimer
        lang={lang}
        variant="accent"
        layoutClassName="pt-2 text-center"
      />
    </div>
  );
}