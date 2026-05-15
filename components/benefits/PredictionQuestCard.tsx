import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import type {
  BenefitPredictionQuestionResponse,
  PredictionDirection,
} from '@/services/benefits/benefitQuestClient';
import type { AppLang } from '@/types';
import { BenefitQuestCard } from './BenefitQuestCard';

const BASE_PRICE_MAX_FRACTION_DIGITS = 2;
const PREDICTION_LOCALE_BY_LANG: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
} as const;

interface PredictionQuestCardProps {
  readonly copy: BenefitMessages;
  readonly lang: AppLang;
  readonly statusLabel: string;
  readonly lastAccuracyLabel: string;
  readonly questionResponse: BenefitPredictionQuestionResponse | null;
  readonly isLoading: boolean;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly canUnlockWithAd: boolean;
  readonly onRefreshQuestion: () => void;
  readonly onSelectDirection: (direction: PredictionDirection) => void;
  readonly onUnlockWithAd: () => void;
}

export function PredictionQuestCard({
  copy,
  lang,
  statusLabel,
  lastAccuracyLabel,
  questionResponse,
  isLoading,
  isBusy,
  isDisabled,
  canUnlockWithAd,
  onRefreshQuestion,
  onSelectDirection,
  onUnlockWithAd,
}: PredictionQuestCardProps): React.ReactElement {
  const question = questionResponse?.question ?? null;
  const hasSubmittableQuestion =
    question != null && questionResponse?.attemptSequence != null;
  const primaryCtaLabel = canUnlockWithAd
    ? copy.predictionUnlockCta
    : copy.predictionQuestionLoadCta;
  const handlePrimaryClick = canUnlockWithAd ? onUnlockWithAd : onRefreshQuestion;
  const shouldDisablePrimary = isBusy || isLoading || isDisabled;
  const unavailableMessage =
    questionResponse?.reason === 'no_unlocked_attempt_available'
      ? copy.missionNotUnlockedMessage
      : copy.predictionNoQuestionMessage;
  const basePriceText =
    question == null
      ? ''
      : question.baseClose.toLocaleString(PREDICTION_LOCALE_BY_LANG[lang], {
          maximumFractionDigits: BASE_PRICE_MAX_FRACTION_DIGITS,
        });

  return (
    <BenefitQuestCard
      title={copy.predictionTitle}
      subtitle={copy.predictionSubtitle}
      metaLabel={lastAccuracyLabel}
      ctaLabel={hasSubmittableQuestion ? undefined : primaryCtaLabel}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<TrendingUp size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
      isCtaLoading={isLoading || isBusy}
      isCtaDisabled={shouldDisablePrimary}
      onCtaClick={handlePrimaryClick}
      actions={
        hasSubmittableQuestion ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectDirection('up')}
              disabled={isBusy || isDisabled}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.predictionUpCta}
            </button>
            <button
              type="button"
              onClick={() => onSelectDirection('down')}
              disabled={isBusy || isDisabled}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {copy.predictionDownCta}
            </button>
          </div>
        ) : null
      }
    >
      {question == null ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
          {unavailableMessage}
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100 dark:bg-blue-400/10 dark:ring-blue-400/20">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-500">
            {question.symbol}
          </p>
          <p className="mt-2 text-sm font-black leading-6 text-slate-900 dark:text-white">
            {copy.predictionBasePriceLabel}: {basePriceText}
          </p>
        </div>
      )}
    </BenefitQuestCard>
  );
}
