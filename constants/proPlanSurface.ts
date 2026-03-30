/**
 * PRO 플랜(라이트) 표면 스타일 — Pricing PRO 카드와 랜딩 히어로 라이트 카드의 단일 소스.
 * 다크는 화면별로 다름: Pricing은 PRO 티어용 톤, 랜딩은 기존 인디고 135° 그라디언트 유지.
 */

export const PRO_PLAN_LIGHT_GRADIENT_STOPS =
  'bg-gradient-to-br from-[#E0F2FE] via-[#F3E8FF] to-[#FFFFFF]';

export const PRO_PLAN_LIGHT_BORDER_SHADOW = 'border border-blue-200 shadow-xl';

/** 랜딩 히어로 카드 셸 — 보더는 `PRO_PLAN_LIGHT_BORDER_SHADOW`에 포함 */
export const HERO_CARD_BASE_CLASSES =
  'relative rounded-[3rem] p-10 md:p-14 overflow-hidden transition-all duration-500';

/** `Landing.tsx` 히어로 카드 다크: 오리지널 135° 인디고 그라디언트 */
export const LANDING_HERO_CARD_DARK_SURFACE_CLASSES =
  'dark:border-indigo-500/50 dark:shadow-2xl dark:bg-[linear-gradient(135deg,#4F46E5_0%,#3730A3_25%,#1E3A8A_50%,#1E40AF_75%,#2563EB_100%)]';

/** 랜딩 히어로 메인 카드 className (라이트 PRO 표면 + 다크 인디고 트랙) */
export const LANDING_HERO_CARD_SURFACE_CLASSES = [
  HERO_CARD_BASE_CLASSES,
  PRO_PLAN_LIGHT_GRADIENT_STOPS,
  PRO_PLAN_LIGHT_BORDER_SHADOW,
  LANDING_HERO_CARD_DARK_SURFACE_CLASSES,
].join(' ');

/** Pricing.tsx `tier.theme === 'pro'` 다크 표면 (랜딩 히어로 다크와 별도) */
export const PRICING_PRO_TIER_DARK_GRADIENT_STOPS =
  'dark:from-blue-900/40 dark:via-indigo-900/40 dark:to-slate-900';

export const PRICING_PRO_TIER_DARK_BORDER = 'dark:border-blue-500/30';

/** `Pricing.tsx` PRO 티어 카드용 className 조각 합성 */
export const PRICING_PRO_TIER_CARD_SURFACE_CLASSES = [
  PRO_PLAN_LIGHT_GRADIENT_STOPS,
  PRICING_PRO_TIER_DARK_GRADIENT_STOPS,
  PRO_PLAN_LIGHT_BORDER_SHADOW,
  PRICING_PRO_TIER_DARK_BORDER,
].join(' ');
