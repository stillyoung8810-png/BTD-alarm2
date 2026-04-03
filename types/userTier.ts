/**
 * 구독 도메인 전체가 공유하는 실질 티어.
 * 광고 노출, 멤버십 권한, 서버 정산 규칙이 모두 이 집합을 기준으로 파생됩니다.
 */
export const SUBSCRIPTION_TIER_VALUES = [
  'free',
  'pro',
  'premium',
  'enterprise',
] as const;

export type SubscriptionTier =
  (typeof SUBSCRIPTION_TIER_VALUES)[number];

/**
 * 광고 시스템은 현재 3개 티어 버킷만 이해합니다.
 * enterprise는 상위 유료 플랜이므로 premium 버킷으로 수렴시킵니다.
 */
export const AD_USER_TIER_VALUES = [
  'free',
  'pro',
  'premium',
] as const;

export type UserTier = (typeof AD_USER_TIER_VALUES)[number];

export function toAdUserTier(subscriptionTier: SubscriptionTier): UserTier {
  switch (subscriptionTier) {
    case 'free':
      return 'free';
    case 'pro':
      return 'pro';
    case 'premium':
    case 'enterprise':
      return 'premium';
    default: {
      const exhaustiveCheck: never = subscriptionTier;
      return exhaustiveCheck;
    }
  }
}
