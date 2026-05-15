import React from 'react';
import { Gift } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import { BenefitQuestCard } from './BenefitQuestCard';

interface TossPointReceiveCardProps {
  readonly copy: BenefitMessages;
  readonly statusLabel: string;
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly onRedeem: () => void;
}

export function TossPointReceiveCard({
  copy,
  statusLabel,
  isLoading,
  isDisabled,
  onRedeem,
}: TossPointReceiveCardProps): React.ReactElement {
  return (
    <BenefitQuestCard
      title={copy.tossPointTitle}
      subtitle={copy.tossPointSubtitle}
      ctaLabel={copy.tossPointCta}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<Gift size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20"
      isCtaLoading={isLoading}
      isCtaDisabled={isDisabled}
      onCtaClick={onRedeem}
    />
  );
}
