export type FreeLaunchSubscriptionTierSim =
  | 'free'
  | 'pro'
  | 'premium'
  | 'enterprise';

export type FreeLaunchSubscriptionStatusSim =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'trial'
  | 'refunded'
  | null;

export interface FreeLaunchProfileSim {
  subscription_tier: FreeLaunchSubscriptionTierSim;
  subscription_status: FreeLaunchSubscriptionStatusSim;
  subscription_expires_at: string | null;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
}

export interface FreeLaunchLimitsSim {
  maxPortfolios: number;
  maxAlarms: number;
}

export const FREE_LAUNCH_MAX_PORTFOLIOS = 3;
export const FREE_LAUNCH_MAX_ALARMS = 4;
export const LEGACY_PRO_MAX_PORTFOLIOS = 5;
export const LEGACY_PRO_MAX_ALARMS = 10;
export const LEGACY_PREMIUM_MAX_PORTFOLIOS = 20;
export const LEGACY_PREMIUM_MAX_ALARMS = 40;
export const MEMBERSHIP_SURFACE_ENABLED = false;

const FREE_LAUNCH_LIMITS: FreeLaunchLimitsSim = {
  maxPortfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
  maxAlarms: FREE_LAUNCH_MAX_ALARMS,
};

const LEGACY_PAID_LIMITS: Record<'pro' | 'premium', FreeLaunchLimitsSim> = {
  pro: {
    maxPortfolios: LEGACY_PRO_MAX_PORTFOLIOS,
    maxAlarms: LEGACY_PRO_MAX_ALARMS,
  },
  premium: {
    maxPortfolios: LEGACY_PREMIUM_MAX_PORTFOLIOS,
    maxAlarms: LEGACY_PREMIUM_MAX_ALARMS,
  },
};

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function resolveFreeLaunchLimits(
  tier: FreeLaunchSubscriptionTierSim,
): FreeLaunchLimitsSim {
  if (tier === 'pro' || tier === 'premium') {
    return LEGACY_PAID_LIMITS[tier];
  }

  return FREE_LAUNCH_LIMITS;
}

export function canAccessTickerDuringFreeLaunch(
  ticker: string,
  supportedTickers: readonly string[],
): boolean {
  const normalizedTicker = normalizeTicker(ticker);
  if (normalizedTicker === '') {
    return false;
  }

  return new Set(supportedTickers.map(normalizeTicker)).has(normalizedTicker);
}

export function shouldSendTelegramDuringFreeLaunch(
  profile: FreeLaunchProfileSim | null,
): boolean {
  if (profile == null) {
    return false;
  }

  if (profile.telegram_enabled !== true) {
    return false;
  }

  const chatId = profile.telegram_chat_id;
  return typeof chatId === 'string' && chatId.trim() !== '';
}

export function shouldShowMembershipSurfaceDuringFreeLaunch(): boolean {
  return MEMBERSHIP_SURFACE_ENABLED;
}

export function resolveCheckoutPlanDuringFreeLaunch(
  _requestedPlan: 'pro' | 'premium' | null,
): null {
  return null;
}
