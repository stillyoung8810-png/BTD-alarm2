export const TIER_NAME_TRANSLATION_KEY = {
  FREE: 'TIER_NAME_FREE',
  PRO: 'TIER_NAME_PRO',
  PREMIUM: 'TIER_NAME_PREMIUM',
} as const;

export type TierNameTranslationKey =
  (typeof TIER_NAME_TRANSLATION_KEY)[keyof typeof TIER_NAME_TRANSLATION_KEY];