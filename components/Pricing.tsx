import React, { useCallback, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bell,
  Brain,
  Check,
  Lock,
  Star,
  Zap,
} from 'lucide-react';
import type { AppLang } from '@/types';
import {
  getPricingMessages,
  type PricingAiSectionCopy,
  type PricingMessageSet,
  type PricingTierId,
  type PricingTierPrice,
  type PricingTierRow,
  type PricingTierTheme,
} from '@/constants/messages/pricingMessages';
import { MembershipConfig } from '../constants/membership';
import { PRICING_PRO_TIER_CARD_SURFACE_CLASSES } from '../constants/proPlanSurface';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSButton, type TDSButtonProps } from './tds';
import { formatPriceKRW, formatPriceUSDForDisplay } from '../utils/currency';

const AI_PREVIEW_WIDTH_PX = 325;
const AI_PREVIEW_HEIGHT_PX = 375;
const AI_STACK_BACK_OFFSET_X_PX = 14;
const AI_STACK_BACK_OFFSET_Y_PX = 20;
const AI_STACK_MID_OFFSET_X_PX = 7;
const AI_STACK_MID_OFFSET_Y_PX = 10;
const AI_STACK_BACK_SCALE = 0.9;
const AI_STACK_MID_SCALE = 0.96;
const AI_STACK_BACK_ROTATE_DEG = -4;
const AI_STACK_MID_ROTATE_DEG = 2;
const AI_STACK_BACK_OPACITY = 0.55;
const AI_STACK_MID_OPACITY = 0.78;
/** 뒤 카드 피크가 잘리지 않도록 프레임보다 약간 넓은 히트 영역 */
const AI_STACK_CONTAINER_EXTRA_X_PX = 28;
const AI_STACK_CONTAINER_EXTRA_Y_PX = 36;

/**
 * PNG가 사각 캔버스라 모서리에 검정이 남는 경우, 라운드 밖은 표시하지 않도록 마스크합니다.
 * viewBox 100 기준 rx/ry — 카드 크기에 비례해 스케일됩니다.
 */
const AI_PREVIEW_STACK_MASK_RX_RY = 9.5;

const AI_PREVIEW_STACK_MASK_SVG_ENCODED = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" rx="${AI_PREVIEW_STACK_MASK_RX_RY}" ry="${AI_PREVIEW_STACK_MASK_RX_RY}" fill="white"/></svg>`,
);

const AI_PREVIEW_STACK_MASK_IMAGE_STYLES: CSSProperties = {
  WebkitMaskImage: `url("data:image/svg+xml,${AI_PREVIEW_STACK_MASK_SVG_ENCODED}")`,
  maskImage: `url("data:image/svg+xml,${AI_PREVIEW_STACK_MASK_SVG_ENCODED}")`,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
};

interface PricingProps {
  lang: AppLang;
  currentTier: string;
  onUpgrade?: (planId: 'pro') => void;
}

type TierCtaState =
  | { kind: 'current'; label: string; isDisabled: true }
  | { kind: 'included'; label: string; isDisabled: true }
  | { kind: 'extend'; label: string; isDisabled: false; planId: 'pro' }
  | { kind: 'upgrade'; label: string; isDisabled: false; planId: 'pro' };

const TIER_THEME_STYLES: Record<
  PricingTierTheme,
  {
    card: string;
    title: string;
    subtitle: string;
    price: string;
    priceNote: string;
    featureList: string;
    currentBadge: string;
    featureDot: string;
    featureCheck: string;
    tossButtonVariant: TDSButtonProps['variant'];
    webButton: string;
  }
> = {
  free: {
    card:
      'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 shadow-xl dark:shadow-2xl',
    title: 'text-slate-900 dark:text-slate-300',
    subtitle: 'text-slate-500 dark:text-slate-400',
    price: 'text-slate-900 dark:text-white',
    priceNote: 'text-slate-500 dark:text-slate-400',
    featureList: 'text-slate-600 dark:text-slate-300',
    currentBadge:
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-400/30',
    featureDot: 'border-emerald-400 bg-emerald-400/20',
    featureCheck: 'text-emerald-500',
    tossButtonVariant: 'tertiary',
    webButton:
      'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white',
  },
  pro: {
    card: PRICING_PRO_TIER_CARD_SURFACE_CLASSES,
    title: 'text-blue-900 dark:text-white',
    subtitle: 'text-blue-600/70 dark:text-slate-400',
    price: 'text-blue-950 dark:text-white',
    priceNote: 'text-blue-600/60 dark:text-slate-400',
    featureList: 'text-blue-900/80 dark:text-slate-200',
    currentBadge: 'bg-emerald-500 text-white border-emerald-400',
    featureDot: 'border-blue-400 bg-blue-400/20',
    featureCheck: 'text-blue-500',
    tossButtonVariant: 'primary',
    webButton:
      'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20',
  },
};

function getTierCtaState(input: {
  tierId: PricingTierId;
  currentTier: string;
  copy: PricingMessageSet;
}): TierCtaState {
  const { tierId, currentTier, copy } = input;

  if (tierId === 'pro' && currentTier === 'pro') {
    return {
      kind: 'extend',
      label: copy.extendPeriod,
      isDisabled: false,
      planId: 'pro',
    };
  }

  if (tierId === currentTier) {
    return {
      kind: 'current',
      label: copy.currentPlan,
      isDisabled: true,
    };
  }

  if (tierId === 'free') {
    return {
      kind: 'included',
      label: copy.basePlanIncluded,
      isDisabled: true,
    };
  }

  if (currentTier === 'premium' && tierId === 'pro') {
    return {
      kind: 'included',
      label: copy.basePlanIncluded,
      isDisabled: true,
    };
  }

  return {
    kind: 'upgrade',
    label: copy.upgradeNow,
    isDisabled: false,
    planId: 'pro',
  };
}

function handleKeyDownAsClick(
  event: React.KeyboardEvent<HTMLDivElement>,
  callback: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

function getNextPreviewIndex(currentIndex: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }

  return (currentIndex + 1) % totalCount;
}

type AiPreviewStackLayer = 'back' | 'mid' | 'front';

function getAiPreviewStackLayerStyle(layer: AiPreviewStackLayer): CSSProperties {
  const stackBodyByLayer: Record<AiPreviewStackLayer, string> = {
    back: `translate(${AI_STACK_BACK_OFFSET_X_PX}px, ${AI_STACK_BACK_OFFSET_Y_PX}px) scale(${AI_STACK_BACK_SCALE}) rotate(${AI_STACK_BACK_ROTATE_DEG}deg)`,
    mid: `translate(${AI_STACK_MID_OFFSET_X_PX}px, ${AI_STACK_MID_OFFSET_Y_PX}px) scale(${AI_STACK_MID_SCALE}) rotate(${AI_STACK_MID_ROTATE_DEG}deg)`,
    front: 'translate(0px, 0px) scale(1) rotate(0deg)',
  };

  switch (layer) {
    case 'back':
      return {
        zIndex: 10,
        opacity: AI_STACK_BACK_OPACITY,
        transform: `translate(-50%, -50%) ${stackBodyByLayer.back}`,
      };
    case 'mid':
      return {
        zIndex: 20,
        opacity: AI_STACK_MID_OPACITY,
        transform: `translate(-50%, -50%) ${stackBodyByLayer.mid}`,
      };
    case 'front':
      return {
        zIndex: 30,
        opacity: 1,
        transform: `translate(-50%, -50%) ${stackBodyByLayer.front}`,
      };
    default: {
      const exhaustive: never = layer;
      return exhaustive;
    }
  }
}

interface PricingImagePreviewStackCard {
  id: string;
  imageSrc: string;
  imageAlt: string;
}

const PricingImagePreviewStack = React.memo(function PricingImagePreviewStack({
  previewCards,
  activeIndex,
  onAdvance,
  ariaLabel,
  focusRing,
}: {
  previewCards: readonly PricingImagePreviewStackCard[];
  activeIndex: number;
  onAdvance: () => void;
  ariaLabel: string;
  focusRing: 'indigo' | 'blue';
}): React.ReactElement | null {
  const previewCount = previewCards.length;
  if (previewCount <= 0) {
    return null;
  }

  const stackLayers: { layer: AiPreviewStackLayer; cardIndex: number }[] = [
    { layer: 'back', cardIndex: (activeIndex + 2) % previewCount },
    { layer: 'mid', cardIndex: (activeIndex + 1) % previewCount },
    { layer: 'front', cardIndex: activeIndex % previewCount },
  ];

  const focusRingClassName =
    focusRing === 'indigo' ? 'focus:ring-indigo-500' : 'focus:ring-blue-500';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAdvance}
      onKeyDown={(event) => handleKeyDownAsClick(event, onAdvance)}
      aria-label={ariaLabel}
      className={`relative bg-transparent p-0 text-left cursor-pointer focus:outline-none focus:ring-2 ${focusRingClassName} rounded-[1.5rem]`}
    >
      <div
        className="relative mx-auto select-none transition-[transform,opacity] duration-500 ease-out"
        style={{
          width: AI_PREVIEW_WIDTH_PX + AI_STACK_CONTAINER_EXTRA_X_PX,
          height: AI_PREVIEW_HEIGHT_PX + AI_STACK_CONTAINER_EXTRA_Y_PX,
        }}
      >
        {stackLayers.map(({ layer, cardIndex }) => {
          const previewCard = previewCards[cardIndex];
          if (previewCard == null) {
            return null;
          }

          const isFront = layer === 'front';
          const layerStyle = getAiPreviewStackLayerStyle(layer);

          return (
            <div
              key={`${layer}-${previewCard.id}-${activeIndex}`}
              aria-hidden={!isFront}
              className="absolute left-1/2 top-1/2 w-fit h-fit overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/70 isolate transition-[transform,opacity] duration-500 ease-out pointer-events-none dark:bg-slate-900 dark:ring-white/10"
              style={{
                ...layerStyle,
                transformOrigin: 'center center',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <img
                src={previewCard.imageSrc}
                alt={isFront ? previewCard.imageAlt : ''}
                className="block h-auto w-auto"
                style={{
                  maxWidth: AI_PREVIEW_WIDTH_PX,
                  maxHeight: AI_PREVIEW_HEIGHT_PX,
                  ...AI_PREVIEW_STACK_MASK_IMAGE_STYLES,
                }}
                draggable={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

PricingImagePreviewStack.displayName = 'PricingImagePreviewStack';

function formatTierPriceLabel(
  price: PricingTierPrice,
  lang: AppLang,
  copy: PricingMessageSet,
): string {
  if (price.kind === 'static') {
    return price.label;
  }

  const config = MembershipConfig.byType?.[price.plan];
  if (config == null) {
    return copy.priceTba;
  }

  if (lang === 'ko') {
    return formatPriceKRW(config.rawAmount);
  }

  return formatPriceUSDForDisplay(config.rawAmount);
}

function renderTierIcon(theme: PricingTierTheme): React.ReactElement {
  switch (theme) {
    case 'pro':
      return (
        <div className="w-full h-full bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-400/30">
          <Star
            size={24}
            className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]"
          />
        </div>
      );
    case 'free':
      return (
        <div className="w-full h-full rounded-2xl flex items-center justify-center border border-slate-300 dark:border-white">
          <Zap size={22} className="text-slate-900 dark:text-slate-200" />
        </div>
      );
    default: {
      const exhaustiveCheck: never = theme;
      return exhaustiveCheck;
    }
  }
}

function getTierActionAdornment(input: {
  kind: TierCtaState['kind'];
  isInTossApp: boolean;
}): React.ReactElement | null {
  const { kind, isInTossApp } = input;

  switch (kind) {
    case 'extend':
    case 'upgrade':
      return (
        <ArrowRight
          size={16}
          className={
            isInTossApp ? 'ml-1' : 'transition-transform group-hover/btn:translate-x-1'
          }
        />
      );
    case 'current':
    case 'included':
      return null;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

const PricingHero = React.memo(function PricingHero({
  copy,
}: {
  copy: PricingMessageSet['hero'];
}): React.ReactElement {
  return (
    <div className="text-center space-y-4 mb-20">
      <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter uppercase italic">
        {copy.title}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
        {copy.description}
      </p>
    </div>
  );
});

PricingHero.displayName = 'PricingHero';

const TierActionButton = React.memo(function TierActionButton({
  theme,
  ctaKind,
  label,
  isInTossApp,
  isDisabled,
  onClick,
}: {
  theme: PricingTierTheme;
  ctaKind: TierCtaState['kind'];
  label: string;
  isInTossApp: boolean;
  isDisabled: boolean;
  onClick: () => void;
}): React.ReactElement {
  const styles = TIER_THEME_STYLES[theme];
  const adornment = getTierActionAdornment({
    kind: ctaKind,
    isInTossApp,
  });

  if (isInTossApp) {
    return (
      <TDSButton
        type="button"
        variant={styles.tossButtonVariant}
        fullWidth
        disabled={isDisabled}
        onClick={onClick}
        aria-label={label}
      >
        {label}
        {adornment}
      </TDSButton>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group/btn disabled:opacity-60 disabled:cursor-not-allowed ${styles.webButton}`}
    >
      <span>{label}</span>
      {adornment}
    </button>
  );
});

TierActionButton.displayName = 'TierActionButton';

const TierCard = React.memo(function TierCard({
  tier,
  lang,
  currentTier,
  copy,
  isInTossApp,
  onUpgrade,
}: {
  tier: PricingTierRow;
  lang: AppLang;
  currentTier: string;
  copy: PricingMessageSet;
  isInTossApp: boolean;
  onUpgrade?: (planId: 'pro') => void;
}): React.ReactElement {
  const isCurrentTier = currentTier === tier.id;
  const styles = TIER_THEME_STYLES[tier.theme];

  const ctaState = getTierCtaState({
    tierId: tier.id,
    currentTier,
    copy,
  });

  const ctaKind = ctaState.kind;
  const ctaLabel = ctaState.label;
  const isCtaDisabled = ctaState.isDisabled;
  const ctaPlanId =
    ctaState.kind === 'extend' || ctaState.kind === 'upgrade'
      ? ctaState.planId
      : null;

  const handleAction = useCallback((): void => {
    switch (ctaKind) {
      case 'current':
      case 'included':
        return;
      case 'extend':
      case 'upgrade':
        if (ctaPlanId != null) {
          onUpgrade?.(ctaPlanId);
        }
        return;
      default: {
        const exhaustiveCheck: never = ctaKind;
        void exhaustiveCheck;
      }
    }
  }, [ctaKind, ctaPlanId, onUpgrade]);

  const isActionMissingHandler =
    (ctaKind === 'extend' || ctaKind === 'upgrade') && onUpgrade == null;
  const isActionDisabled = isCtaDisabled || isActionMissingHandler;
  const priceLabel = formatTierPriceLabel(tier.price, lang, copy);

  return (
    <div
      className={`relative rounded-[2.2rem] p-6 md:p-8 flex flex-col justify-between overflow-hidden transition-all duration-300 ${styles.card}`}
    >
      <div className="relative mb-8 pt-4">
        {isCurrentTier ? (
          <div className="absolute -top-2 -left-2 z-20">
            <span
              className={`text-[9px] px-2.5 py-1 rounded-full border whitespace-nowrap font-black uppercase tracking-wider shadow-sm ${styles.currentBadge}`}
            >
              {copy.currentPlan}
            </span>
          </div>
        ) : null}

        {tier.badgeLabel != null ? (
          <div className="absolute -top-2 -right-2 z-20">
            <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border whitespace-nowrap shadow-sm bg-blue-600 text-white border-blue-400">
              {tier.badgeLabel}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 shrink-0">{renderTierIcon(tier.theme)}</div>
          <div className="text-left">
            <div className={`text-sm font-black tracking-[0.2em] uppercase ${styles.title}`}>
              {tier.label}
            </div>
            <div className={`text-[11px] font-medium ${styles.subtitle}`}>
              {tier.subtitle}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full">
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${styles.price}`}>
              {priceLabel}
            </span>
            <span className={`text-xs font-medium ${styles.priceNote}`}>
              {tier.price.note}
            </span>
          </div>
        </div>

        <ul className={`space-y-3 mb-8 text-xs ${styles.featureList}`}>
          {tier.features.map((feature) => (
            <li
              key={`${tier.id}-${feature.id}`}
              className={`flex items-start gap-2.5 ${feature.isLocked === true ? 'opacity-40' : ''}`}
            >
              <div className="mt-0.5 shrink-0">
                {feature.isLocked === true ? (
                  <Lock size={12} className="text-slate-500" />
                ) : (
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${styles.featureDot}`}
                  >
                    <Check size={9} className={styles.featureCheck} />
                  </div>
                )}
              </div>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>

        <TierActionButton
          theme={tier.theme}
          ctaKind={ctaKind}
          label={ctaLabel}
          isInTossApp={isInTossApp}
          isDisabled={isActionDisabled}
          onClick={handleAction}
        />
      </div>
    </div>
  );
});

TierCard.displayName = 'TierCard';

const PricingAiSection = React.memo(function PricingAiSection({
  copy,
  activeIndex,
  onAdvance,
}: {
  copy: PricingAiSectionCopy;
  activeIndex: number;
  onAdvance: () => void;
}): React.ReactElement {
  const hasPreviewCards = copy.previewCards.length > 0;

  return (
    <section className="mt-40 mb-20 p-8 md:p-16 rounded-[3rem] bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 transition-all">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">
            <Brain size={14} />
            <span>{copy.eyebrowLabel}</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight whitespace-pre-line">
            {copy.title}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-lg">
            {copy.description}
          </p>

          <div className="space-y-4">
            {copy.bulletItems.map((bulletItem) => (
              <div
                key={bulletItem.id}
                className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Check size={14} />
                </div>
                <span className="text-sm md:text-base">{bulletItem.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          {hasPreviewCards ? (
            <PricingImagePreviewStack
              previewCards={copy.previewCards}
              activeIndex={activeIndex}
              onAdvance={onAdvance}
              ariaLabel={copy.advancePreviewAriaLabel}
              focusRing="indigo"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
});

PricingAiSection.displayName = 'PricingAiSection';

const PricingTelegramSection = React.memo(function PricingTelegramSection({
  copy,
  activeIndex,
  onAdvance,
}: {
  copy: PricingMessageSet['sections']['telegram'];
  activeIndex: number;
  onAdvance: () => void;
}): React.ReactElement {
  const hasPreviewCards = copy.previewCards.length > 0;

  return (
    <section className="mt-40 mb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="relative flex justify-center lg:justify-start">
          {hasPreviewCards ? (
            <PricingImagePreviewStack
              previewCards={copy.previewCards}
              activeIndex={activeIndex}
              onAdvance={onAdvance}
              ariaLabel={copy.advancePreviewAriaLabel}
              focusRing="blue"
            />
          ) : null}
        </div>

        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest">
            <Bell size={14} />
            <span>{copy.eyebrowLabel}</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight whitespace-pre-line">
            {copy.title}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed">
            {copy.description}
          </p>
        </div>
      </div>
    </section>
  );
});

PricingTelegramSection.displayName = 'PricingTelegramSection';

export default function Pricing({
  lang,
  currentTier,
  onUpgrade,
}: PricingProps): React.ReactElement {
  const copy = getPricingMessages(lang);
  const { isInTossApp } = useTossApp();
  const [telegramPreviewIndex, setTelegramPreviewIndex] = useState(0);
  const [aiPreviewIndex, setAiPreviewIndex] = useState(0);

  const handleAdvanceTelegramPreview = useCallback((): void => {
    setTelegramPreviewIndex((currentIndex) =>
      getNextPreviewIndex(currentIndex, copy.sections.telegram.previewCards.length),
    );
  }, [copy.sections.telegram.previewCards.length]);

  const handleAdvanceAiPreview = useCallback((): void => {
    setAiPreviewIndex((currentIndex) =>
      getNextPreviewIndex(currentIndex, copy.sections.ai.previewCards.length),
    );
  }, [copy.sections.ai.previewCards.length]);

  const handleUpgrade = useCallback(
    (planId: 'pro'): void => {
      onUpgrade?.(planId);
    },
    [onUpgrade],
  );

  return (
    <div className="relative min-h-[70vh] pb-20 font-sans">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-32 -left-16 w-80 h-80 bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-transparent rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/25 via-amber-500/10 to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      <div className="max-w-5xl mx-auto px-4">
        <PricingHero copy={copy.hero} />

        <section className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {copy.tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              lang={lang}
              currentTier={currentTier}
              copy={copy}
              isInTossApp={isInTossApp}
              onUpgrade={handleUpgrade}
            />
          ))}
        </section>

        <PricingAiSection
          copy={copy.sections.ai}
          activeIndex={aiPreviewIndex}
          onAdvance={handleAdvanceAiPreview}
        />

        <PricingTelegramSection
          copy={copy.sections.telegram}
          activeIndex={telegramPreviewIndex}
          onAdvance={handleAdvanceTelegramPreview}
        />
      </div>
    </div>
  );
}
