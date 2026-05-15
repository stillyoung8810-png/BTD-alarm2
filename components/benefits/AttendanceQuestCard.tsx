import React from 'react';
import { CalendarCheck } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import { getResolvedHistoryBannerAdGroupId } from '@/services/ads/adPlacements';
import { TossInlineBanner } from '../TossInlineBanner';
import { BenefitQuestCard } from './BenefitQuestCard';

interface AttendanceQuestCardProps {
  readonly copy: BenefitMessages;
  readonly statusLabel: string;
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly shouldShowBannerAd: boolean;
  readonly isInTossApp: boolean;
  readonly onCheckIn: () => void;
}

export function AttendanceQuestCard({
  copy,
  statusLabel,
  isLoading,
  isDisabled,
  shouldShowBannerAd,
  isInTossApp,
  onCheckIn,
}: AttendanceQuestCardProps): React.ReactElement {
  const attendanceBannerAdGroupId = getResolvedHistoryBannerAdGroupId();
  const shouldRenderBannerAd =
    shouldShowBannerAd &&
    isInTossApp &&
    attendanceBannerAdGroupId.trim() !== '';

  return (
    <BenefitQuestCard
      title={copy.attendanceTitle}
      subtitle={copy.attendanceSubtitle}
      ctaLabel={copy.attendanceCta}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<CalendarCheck size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
      isCtaLoading={isLoading}
      isCtaDisabled={isDisabled}
      onCtaClick={onCheckIn}
    >
      {shouldRenderBannerAd ? (
        <TossInlineBanner
          adGroupId={attendanceBannerAdGroupId}
          shouldShowAd
          isInTossApp
          containerClassName="h-[96px] min-h-[96px]"
          variant="card"
        />
      ) : null}
    </BenefitQuestCard>
  );
}
