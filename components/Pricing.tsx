import React, { useCallback, useMemo } from 'react';
import type { AppLang } from '@/types';
import {
  getPricingMessages,
  type PricingTierId,
  type PricingTierRow,
  type PricingTierTheme,
} from '@/constants/messages/pricingMessages';

type TierCtaState =
  | { kind: 'current'; label: string; isDisabled: true }
  | { kind: 'upgrade'; label: string; isDisabled: false }
  | { kind: 'notify'; label: string; isDisabled: false };

function getTierCtaState(input: {
  tierId: PricingTierId;
  currentTier: string;
  copy: ReturnType<typeof getPricingMessages>;
}): TierCtaState {
  const { tierId, currentTier, copy } = input;

  if (tierId === currentTier) {
    return { kind: 'current', label: copy.currentPlan, isDisabled: true };
  }

  if (tierId === 'premium') {
    return {
      kind: 'notify',
      label: copy.notifyWhenReleased,
      isDisabled: false,
    };
  }

  return { kind: 'upgrade', label: copy.upgradeNow, isDisabled: false };
}

function getTierThemeClassName(theme: PricingTierTheme): string {
  switch (theme) {
    case 'free':
      return 'bg-white border-slate-200';
    case 'pro':
      return 'bg-blue-50 border-blue-200';
    case 'premium':
      return 'bg-black border-amber-500/30';
    default: {
      const exhaustiveCheck: never = theme;
      return exhaustiveCheck;
    }
  }
}

const TierCard = React.memo(function TierCard({
  tier,
  currentTier,
  copy,
  onUpgrade,
  onNotifyPremium,
}: {
  tier: PricingTierRow;
  currentTier: string;
  copy: ReturnType<typeof getPricingMessages>;
  onUpgrade: (planId: 'pro') => void;
  onNotifyPremium: () => void;
}): React.ReactElement {
  const ctaState = getTierCtaState({
    tierId: tier.id,
    currentTier,
    copy,
  });

  const handleClick = useCallback((): void => {
    if (ctaState.kind === 'upgrade') {
      onUpgrade('pro');
      return;
    }

    if (ctaState.kind === 'notify') {
      onNotifyPremium();
    }
  }, [ctaState.kind, onNotifyPremium, onUpgrade]);

  return (
    <article
      className={`rounded-[2rem] border p-8 ${getTierThemeClassName(tier.theme)}`}
    >
      <h2>{tier.label}</h2>
      <p>{tier.subtitle}</p>
      <button type="button" disabled={ctaState.isDisabled} onClick={handleClick}>
        {ctaState.label}
      </button>
    </article>
  );
});

TierCard.displayName = 'TierCard';

interface PricingProps {
  lang: AppLang;
  currentTier: string;
  onUpgrade?: (planId: 'pro' | 'premium') => void;
  onNotifyPremium?: () => void;
}

export default function Pricing({
  lang,
  currentTier,
  onUpgrade,
  onNotifyPremium = () => {},
}: PricingProps): React.ReactElement {
  const copy = useMemo(() => getPricingMessages(lang), [lang]);
  const tiers = copy.tiers;

  const handleUpgradePro = useCallback(
    (planId: 'pro') => {
      onUpgrade?.(planId);
    },
    [onUpgrade],
  );

  return (
    <section className="grid gap-6 md:grid-cols-3">
      {tiers.map((tier) => (
        <TierCard
          key={tier.id}
          tier={tier}
          currentTier={currentTier}
          copy={copy}
          onUpgrade={handleUpgradePro}
          onNotifyPremium={onNotifyPremium}
        />
      ))}
    </section>
  );
}
