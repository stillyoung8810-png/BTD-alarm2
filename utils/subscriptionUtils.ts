/**
 * 구독 및 광고 관련 유틸리티 함수
 */

/**
 * 사용자 프로필 인터페이스
 * Supabase user_profiles 테이블과 일치
 */
export interface UserProfile {
  id: string;
  subscription_tier: 'free' | 'pro' | 'premium' | 'enterprise';
  subscription_status: 'active' | 'cancelled' | 'expired' | 'trial' | null;
  subscription_started_at: string | null; // ISO date string
  subscription_expires_at: string | null; // ISO date string
  stripe_customer_id: string | null;
  max_portfolios: number;
  max_alarms: number;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * 간소화된 프로필 인터페이스 (기존 코드 호환)
 */
export interface SimpleUserProfile {
  subscription_tier: string;
  max_portfolios: number;
  max_alarms: number;
}

/**
 * 유료 구독 티어 목록
 */
export const PAID_TIERS: readonly string[] = ['pro', 'premium', 'enterprise'] as const;

/**
 * 사용자가 유료 구독 중인지 확인
 * @param profile 사용자 프로필 (null 가능)
 * @returns 유료 구독 중이면 true
 */
export const isPaidSubscription = (profile: UserProfile | SimpleUserProfile | null): boolean => {
  if (!profile) return false;
  
  const tier = profile.subscription_tier?.toLowerCase();
  return PAID_TIERS.includes(tier);
};

/**
 * 사용자의 구독이 활성 상태인지 확인
 * @param profile 사용자 프로필
 * @returns 구독이 활성 상태면 true
 * 
 * 참고: subscription_status 가능한 값
 * - 'active': 활성 구독
 * - 'cancelled': 취소됨
 * - 'expired': 만료됨
 * - 'trial': trial 기간 중
 */
export const isActiveSubscription = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  
  // SimpleUserProfile에는 subscription_status가 없으므로 tier만 확인
  if (!('subscription_status' in profile)) {
    return isPaidSubscription(profile);
  }
  
  // 'active' 또는 'trial' 상태를 활성으로 간주
  return profile.subscription_status === 'active' || profile.subscription_status === 'trial';
};

/**
 * 사용자의 구독이 만료되지 않았는지 확인
 * @param profile 사용자 프로필
 * @returns 구독이 만료되지 않았으면 true
 */
export const isNotExpired = (profile: UserProfile | null): boolean => {
  if (!profile) return true; // 프로필이 없으면 만료되지 않은 것으로 간주
  
  // SimpleUserProfile에는 subscription_expires_at이 없으므로 true 반환
  if (!('subscription_expires_at' in profile)) {
    return true;
  }
  
  if (!profile.subscription_expires_at) {
    // 만료일이 없으면 무한 유지로 간주 (또는 비즈니스 로직에 따라 조정)
    return true;
  }
  
  const expiresAt = new Date(profile.subscription_expires_at);
  const now = new Date();
  return expiresAt > now;
};

/**
 * 사용자가 광고를 봐야 하는지 판단
 * @param profile 사용자 프로필 (null 가능)
 * @returns 광고를 표시해야 하면 true
 * 
 * 광고 제거 조건:
 * - 유료 티어 (pro, premium, enterprise)
 * - 구독 상태가 활성 (active 또는 trial)
 * - 구독이 만료되지 않음 (subscription_expires_at이 없거나 미래 날짜)
 */
export const shouldShowAds = (profile: UserProfile | SimpleUserProfile | null): boolean => {
  if (!profile) return true; // 로그아웃 상태면 광고 노출
  
  // 유료 티어인지 확인
  const isPaidTier = isPaidSubscription(profile);
  
  // SimpleUserProfile인 경우 (기존 코드 호환)
  // subscription_status와 subscription_expires_at 정보가 없으므로
  // 유료 티어인지만 확인
  if (!('subscription_status' in profile) || !('subscription_expires_at' in profile)) {
    // 유료 티어면 광고 제거 (기본적으로 활성 상태로 간주)
    return !isPaidTier;
  }
  
  // UserProfile인 경우 (전체 정보 확인)
  const isActive = isActiveSubscription(profile);
  const isNotExpiredSubscription = isNotExpired(profile);
  
  // 유료 티어 + 활성 상태 + 만료되지 않음 = 광고 제거
  const shouldHideAds = isPaidTier && isActive && isNotExpiredSubscription;
  
  return !shouldHideAds;
};

/**
 * 사용자의 최대 포트폴리오 개수 가져오기
 * @param profile 사용자 프로필
 * @returns 최대 포트폴리오 개수 (기본값: 3)
 */
export const getMaxPortfolios = (profile: UserProfile | SimpleUserProfile | null): number => {
  if (!profile) return 3; // 기본값
  return profile.max_portfolios ?? 3;
};

/**
 * 사용자의 최대 알람 개수 가져오기
 * @param profile 사용자 프로필
 * @returns 최대 알람 개수 (기본값: 2)
 */
export const getMaxAlarms = (profile: UserProfile | SimpleUserProfile | null): number => {
  if (!profile) return 2; // 기본값
  return profile.max_alarms ?? 2;
};

/**
 * 구독 티어의 표시 이름 가져오기
 * @param tier 구독 티어
 * @param lang 언어 ('ko' | 'en')
 * @returns 표시 이름
 */
export const getTierDisplayName = (tier: string, lang: 'ko' | 'en' = 'ko'): string => {
  const tierMap: Record<string, { ko: string; en: string }> = {
    free: { ko: '무료', en: 'Free' },
    pro: { ko: '프로', en: 'Pro' },
    premium: { ko: '프리미엄', en: 'Premium' },
    enterprise: { ko: '엔터프라이즈', en: 'Enterprise' }
  };
  
  const normalizedTier = tier?.toLowerCase() || 'free';
  return tierMap[normalizedTier]?.[lang] || tier;
};

/**
 * 구독 상태의 표시 이름 가져오기
 * @param status 구독 상태
 * @param lang 언어 ('ko' | 'en')
 * @returns 표시 이름
 * 
 * 참고: subscription_status 가능한 값
 * - 'active': 활성 구독
 * - 'cancelled': 취소됨
 * - 'expired': 만료됨
 * - 'trial': trial 기간 중
 */
export const getStatusDisplayName = (status: string | null, lang: 'ko' | 'en' = 'ko'): string => {
  if (!status) return lang === 'ko' ? '없음' : 'None';
  
  const statusMap: Record<string, { ko: string; en: string }> = {
    active: { ko: '활성', en: 'Active' },
    cancelled: { ko: '취소됨', en: 'Cancelled' },
    expired: { ko: '만료됨', en: 'Expired' },
    trial: { ko: '체험 중', en: 'Trial' }
  };
  
  return statusMap[status]?.[lang] || status;
};
