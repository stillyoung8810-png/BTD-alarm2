import { supabase } from "../services/supabase";
import { getEffectiveSubscriptionState, type SubscriptionProfileSnapshot } from "../server/src/services/paymentFulfillment";

/**
 * 구독 및 광고 관련 유틸리티 함수
 */

/**
 * 사용자 프로필 인터페이스
 * Supabase user_profiles 테이블과 일치
 */
export interface UserProfile {
  id: string;
  subscription_tier: "free" | "pro" | "premium" | "enterprise";
  subscription_status: "active" | "cancelled" | "expired" | "trial" | "refunded" | null;
  subscription_started_at: string | null; // ISO date string
  subscription_expires_at: string | null; // ISO date string
  pending_plan?: "pro" | "premium" | null;
  pending_plan_effective_at?: string | null;
  stripe_customer_id: string | null;
  max_portfolios: number;
  max_alarms: number;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;

  // 알림 관련 설정 (user_profiles 확장 컬럼과 매핑)
  app_notification_enabled?: boolean; // 기본 앱 내 알림 사용 여부 (default true)
  telegram_enabled?: boolean; // 텔레그램 알림 사용 여부 (default false)
  telegram_chat_id?: string | null; // 연결된 텔레그램 chat_id
  telegram_last_error?: string | null; // 최근 텔레그램 에러 메시지 (옵션)
  telegram_connected_at?: string | null; // 텔레그램 연결 시각 (ISO, 옵션)

  // 언어 설정
  preferred_language?: "ko" | "en" | null; // 알림/기본 UI 언어
  timezone?: string | null; // 사용자 타임존 (IANA)

  // 사용량 추적 관련 (user_profiles 확장 컬럼과 매핑)
  ai_daily_usage?: number;
  ai_monthly_usage?: number;
  backtest_daily_usage?: number;
  last_usage_reset_at?: string | null;
}

/**
 * 간소화된 프로필 인터페이스 (기존 코드 호환)
 */
export interface SimpleUserProfile {
  subscription_tier: string;
  max_portfolios: number;
  max_alarms: number;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
}

/**
 * 유료 구독 티어 목록
 */
export const PAID_TIERS: readonly string[] = [
  "pro",
  "premium",
  "enterprise",
] as const;

function toSubscriptionSnapshot(
  profile: UserProfile | SimpleUserProfile | null,
): SubscriptionProfileSnapshot | null {
  if (!profile) return null;
  return {
    subscription_tier: profile.subscription_tier,
    subscription_status: "subscription_status" in profile ? profile.subscription_status ?? null : null,
    subscription_expires_at: "subscription_expires_at" in profile ? profile.subscription_expires_at ?? null : null,
    pending_plan: "pending_plan" in profile ? profile.pending_plan ?? null : null,
    pending_plan_effective_at: "pending_plan_effective_at" in profile ? profile.pending_plan_effective_at ?? null : null,
    max_portfolios: profile.max_portfolios,
    max_alarms: profile.max_alarms,
  };
}

export const getEffectiveSubscription = (
  profile: UserProfile | SimpleUserProfile | null,
) => getEffectiveSubscriptionState(toSubscriptionSnapshot(profile));

/**
 * 사용자가 유료 구독 중인지 확인
 * @param profile 사용자 프로필 (null 가능)
 * @returns 유료 구독 중이면 true
 */
export const isPaidSubscription = (
  profile: UserProfile | SimpleUserProfile | null,
): boolean => {
  if (!profile) return false;
  const tier = getEffectiveSubscription(profile).tier?.toLowerCase();
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
 * - 'refunded': 환불 완료
 */
export const isActiveSubscription = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  return getEffectiveSubscription(profile).isActive;
};

/**
 * 사용자의 구독이 만료되지 않았는지 확인
 * @param profile 사용자 프로필
 * @returns 구독이 만료되지 않았으면 true
 */
export const isNotExpired = (profile: UserProfile | null): boolean => {
  if (!profile) return true; // 프로필이 없으면 만료되지 않은 것으로 간주
  return !getEffectiveSubscription(profile).isExpired;
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
export const shouldShowAds = (
  profile: UserProfile | SimpleUserProfile | null,
): boolean => {
  if (!profile) return true; // 로그아웃 상태면 광고 노출

  // 유료 티어인지 확인
  const isPaidTier = isPaidSubscription(profile);

  // SimpleUserProfile인 경우 (기존 코드 호환)
  // subscription_status와 subscription_expires_at 정보가 없으므로
  // 유료 티어인지만 확인
  if (
    !("subscription_status" in profile) ||
    !("subscription_expires_at" in profile)
  ) {
    // 유료 티어면 광고 제거 (기본적으로 활성 상태로 간주)
    return !isPaidTier;
  }

  // UserProfile인 경우 (전체 정보 확인)
  const effective = getEffectiveSubscription(profile);

  // 유료 티어 + 활성 상태 + 만료되지 않음 = 광고 제거
  const shouldHideAds = isPaidTier && effective.isActive && !effective.isExpired;

  return !shouldHideAds;
};

/**
 * 사용자의 최대 포트폴리오 개수 가져오기
 * @param profile 사용자 프로필
 * @returns 최대 포트폴리오 개수
 *
 * 기본 규칙:
 * - 프로필 없음        →  Free 기본값 2개
 * - max_portfolios 있음 → 해당 값 사용
 * - Pro/Premium 티어   → 기본 5개
 * - 그 외(Free 등)     → 기본 2개
 */
export const getMaxPortfolios = (
  profile: UserProfile | SimpleUserProfile | null,
): number => {
  if (!profile) return 2; // Free 기본값
  const tier = getEffectiveSubscription(profile).tier;
  if (tier === "premium") return 20;
  if (tier === "pro") return 5;

  const explicit = profile.max_portfolios;
  if (typeof explicit === "number") return explicit;

  return 2;
};

/**
 * 사용자의 최대 알람 개수 가져오기
 * @param profile 사용자 프로필
 * @returns 최대 알람 개수
 *
 * 기본 규칙:
 * - 프로필 없음        → Free 기본값 2개
 * - max_alarms 있음    → 해당 값 사용
 * - Pro/Premium 티어   → 기본 5개
 * - 그 외(Free 등)     → 기본 2개
 */
export const getMaxAlarms = (
  profile: UserProfile | SimpleUserProfile | null,
): number => {
  if (!profile) return 2; // Free 기본값
  const tier = getEffectiveSubscription(profile).tier;
  if (tier === "premium") return 40;
  if (tier === "pro") return 10;

  const explicit = profile.max_alarms;
  if (typeof explicit === "number") return explicit;

  return 2;
};

/**
 * 티어별 일일/월간 사용량 한도 (AI·백테스트 사용량 RPC와 연동)
 */
export interface UsageLimits {
  aiDaily: number;
  aiMonthly?: number;
  backtestDaily: number;
}

// ---------------------------------------------------------------------------
// Rule 8 & 5: 정책 상수·티어 테이블 (docs2/increment-usage-usage-result-type-refactor-plan.md)
// ---------------------------------------------------------------------------
// 서버가 무제한을 처리하지 못해 보내는 실질적 상한값 (월 한도 미설정 티어의 p_max_monthly 등에 사용).
export const UNLIMITED_USAGE_QUOTA = 999;

// premium / pro / free 만 명시. enterprise 등 미등록 티어는 getUsageLimits에서 free로 폴백.
const TIER_USAGE_LIMITS: Record<string, UsageLimits> = {
  premium: { aiDaily: UNLIMITED_USAGE_QUOTA, backtestDaily: 10 },
  pro: {
    aiDaily: UNLIMITED_USAGE_QUOTA,
    aiMonthly: 50,
    backtestDaily: 5,
  },
  free: { aiDaily: 1, backtestDaily: 2 },
};

/**
 * 티어별 일일/월간 사용량 한도 가져오기
 */
export const getUsageLimits = (tier: string): UsageLimits => {
  const normalizedTier = tier?.toLowerCase() || "free";
  // enterprise 등 테이블에 없는 티어 → free와 동일. 추후 enterprise 행만 추가하면 됨.
  return TIER_USAGE_LIMITS[normalizedTier] ?? TIER_USAGE_LIMITS.free;
};

/**
 * `check_and_increment_usage` RPC는 한도 초과 시 사람이 읽기 쉬운 영문 문장을 반환한다.
 * AI 모달·백테스트 등 클라이언트 분기는 `DAILY_LIMIT_REACHED` / `MONTHLY_LIMIT_REACHED` 코드를 기대하므로 여기서 정규화한다.
 */
function normalizeRpcUsageLimitMessage(error: unknown): string | undefined {
  if (typeof error !== "string") {
    return undefined;
  }
  const trimmed = error.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "daily limit reached") {
    return "DAILY_LIMIT_REACHED";
  }
  if (lower === "monthly limit reached") {
    return "MONTHLY_LIMIT_REACHED";
  }
  return trimmed;
}

/** `incrementUsage` 성공 시에만 의미 있는 사용량 스냅샷. */
export interface UsageIncrementCurrentUsage {
  daily: number;
  monthly?: number | null;
}

export interface UsageResult {
  success: boolean;
  message?: string;
  currentUsage?: UsageIncrementCurrentUsage;
}

/** Supabase `check_and_increment_usage` RPC가 반환하는 JSON 구조 */
interface CheckAndIncrementUsageRpcRow {
  success: boolean;
  error?: string;
  current_daily?: number;
  current_monthly?: number | null;
}

/**
 * 사용량 확인 및 증가 (서버 RPC 호출)
 * @param usageType 'ai' 또는 'backtest'
 * @param tier 현재 사용자 티어
 * @returns 성공 여부 및 결과 메시지
 */
export const incrementUsage = async (
  usageType: "ai" | "backtest",
  tier: string,
): Promise<UsageResult> => {
  const limits = getUsageLimits(tier);
  const maxDaily = usageType === "ai" ? limits.aiDaily : limits.backtestDaily;
  const maxMonthly =
    usageType === "ai" ? limits.aiMonthly ?? UNLIMITED_USAGE_QUOTA : undefined;

  try {
    const { data, error } = await supabase.rpc("check_and_increment_usage", {
      p_usage_type: usageType,
      p_max_daily: maxDaily,
      p_max_monthly: maxMonthly,
    });

    if (error) {
      console.error(`[Usage] Error incrementing ${usageType} usage:`, error);
      return { success: false, message: error.message };
    }

    const result = data as CheckAndIncrementUsageRpcRow;

    if (!result.success) {
      return {
        success: false,
        message: normalizeRpcUsageLimitMessage(result.error) ?? result.error,
      };
    }

    return {
      success: true,
      currentUsage: {
        daily: result.current_daily ?? 0,
        monthly: result.current_monthly,
      },
    };
  } catch (err) {
    console.error(`[Usage] Unexpected error during ${usageType} usage:`, err);
    return { success: false, message: "Unexpected server error" };
  }
};

/**
 * 구독 티어의 표시 이름 가져오기
 * @param tier 구독 티어
 * @param lang 언어 ('ko' | 'en')
 * @returns 표시 이름
 */
export const getTierDisplayName = (
  tier: string,
  lang: "ko" | "en" = "ko",
): string => {
  const tierMap: Record<string, { ko: string; en: string }> = {
    free: { ko: "무료", en: "Free" },
    pro: { ko: "프로", en: "Pro" },
    premium: { ko: "프리미엄", en: "Premium" },
    enterprise: { ko: "엔터프라이즈", en: "Enterprise" },
  };

  const normalizedTier = tier?.toLowerCase() || "free";
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
 * - 'refunded': 환불 완료
 */
export const getStatusDisplayName = (
  status: string | null,
  lang: "ko" | "en" = "ko",
): string => {
  if (!status) return lang === "ko" ? "없음" : "None";

  const statusMap: Record<string, { ko: string; en: string }> = {
    active: { ko: "활성", en: "Active" },
    cancelled: { ko: "취소됨", en: "Cancelled" },
    expired: { ko: "만료됨", en: "Expired" },
    trial: { ko: "체험 중", en: "Trial" },
    refunded: { ko: "환불됨", en: "Refunded" },
  };

  return statusMap[status]?.[lang] || status;
};

/**
 * 티어별 종목 접근 권한 확인
 */
export const canAccessStock = (
  ticker: string,
  tier: string,
  paidStocks: string[],
): boolean => {
  const normalizedTier = tier?.toLowerCase() || "free";
  if (normalizedTier === "premium") return true;
  if (normalizedTier === "pro") return true; // Pro handles its own list in some components, but logically can access Pro tickers  // Free
  return !paidStocks.includes(ticker);
};
