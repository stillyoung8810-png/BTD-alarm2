import type { AppLang } from '../types';
import type { SubscriptionTier } from './userTier';

export const SUBSCRIPTION_STATUS_VALUES = [
  'active',
  'cancelled',
  'expired',
  'trial',
  'refunded',
] as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS_VALUES)[number];

export const PENDING_PLAN_VALUES = [
  'pro',
  'premium',
] as const;

export type PendingPlanId =
  (typeof PENDING_PLAN_VALUES)[number];

/**
 * App 전역 상태용 user_profiles 타입.
 * 프런트 상태가 서버 계약보다 느슨해지면 paid gating, 광고 제거, 멤버십 만료 처리가 전부 흔들리므로
 * 문자열 자유입력을 허용하지 않습니다.
 */
export interface AppUserProfile {
  subscription_tier: SubscriptionTier;
  max_portfolios: number;
  max_alarms: number;
  subscription_status?: SubscriptionStatus | null;
  subscription_expires_at?: string | null;
  pending_plan?: PendingPlanId | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean;
  telegram_connected_at?: string | null;
  telegram_last_error?: string | null;
  preferred_language?: AppLang | null;
  timezone?: string | null;
  ai_daily_usage?: number;
  ai_monthly_usage?: number;
  backtest_daily_usage?: number;
  last_usage_reset_at?: string | null;
}
