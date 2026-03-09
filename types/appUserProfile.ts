/**
 * App 전역 상태용 user_profiles 타입
 * Supabase user_profiles 조회 결과 및 setUserProfile 호출 시 사용
 */
export interface AppUserProfile {
  subscription_tier: string;
  max_portfolios: number;
  max_alarms: number;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean;
  telegram_connected_at?: string | null;
  telegram_last_error?: string | null;
  preferred_language?: 'ko' | 'en' | null;
  timezone?: string | null;
  ai_daily_usage?: number;
  ai_monthly_usage?: number;
  backtest_daily_usage?: number;
  last_usage_reset_at?: string | null;
}
