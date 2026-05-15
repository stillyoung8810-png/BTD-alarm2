import React from 'react';
import { Brain } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import type { BenefitQuizQuestionResponse } from '@/services/benefits/benefitQuestClient';
import { BenefitQuestCard } from './BenefitQuestCard';

interface StockQuizQuestCardProps {
  readonly copy: BenefitMessages;
  readonly statusLabel: string;
  readonly questionResponse: BenefitQuizQuestionResponse | null;
  readonly isLoading: boolean;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly canUnlockWithAd: boolean;
  readonly onRefreshQuestion: () => void;
  readonly onSelectChoice: (choiceId: string) => void;
  readonly onUnlockWithAd: () => void;
}

export function StockQuizQuestCard({
  copy,
  statusLabel,
  questionResponse,
  isLoading,
  isBusy,
  isDisabled,
  canUnlockWithAd,
  onRefreshQuestion,
  onSelectChoice,
  onUnlockWithAd,
}: StockQuizQuestCardProps): React.ReactElement {
  const question = questionResponse?.question ?? null;
  const hasSubmittableQuestion =
    question != null && questionResponse?.attemptSequence != null;
  const primaryCtaLabel = canUnlockWithAd
    ? copy.quizUnlockCta
    : copy.quizQuestionLoadCta;
  const handlePrimaryClick = canUnlockWithAd ? onUnlockWithAd : onRefreshQuestion;
  const shouldDisablePrimary = isBusy || isLoading || isDisabled;

  return (
    <BenefitQuestCard
      title={copy.quizTitle}
      subtitle={copy.quizSubtitle}
      ctaLabel={hasSubmittableQuestion ? undefined : primaryCtaLabel}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<Brain size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/20"
      isCtaLoading={isLoading || isBusy}
      isCtaDisabled={shouldDisablePrimary}
      onCtaClick={handlePrimaryClick}
      actions={
        hasSubmittableQuestion ? (
          <div className="mt-5 grid grid-cols-1 gap-2">
            {question.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelectChoice(choice.id)}
                disabled={isBusy || isDisabled}
                aria-label={`${copy.quizChoiceAriaPrefix} ${choice.label}`}
                className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left text-sm font-black text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100"
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {question == null ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
          {copy.quizNoQuestionMessage}
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-100 dark:bg-violet-400/10 dark:ring-violet-400/20">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-500">
            {question.category}
          </p>
          <p className="mt-2 text-sm font-black leading-6 text-slate-900 dark:text-white">
            {question.question}
          </p>
        </div>
      )}
    </BenefitQuestCard>
  );
}
