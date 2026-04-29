import { describe, expect, it } from 'vitest';
import {
  FREE_LAUNCH_MAX_ALARMS,
  FREE_LAUNCH_MAX_PORTFOLIOS,
  LEGACY_PREMIUM_MAX_ALARMS,
  LEGACY_PREMIUM_MAX_PORTFOLIOS,
  LEGACY_PRO_MAX_ALARMS,
  LEGACY_PRO_MAX_PORTFOLIOS,
  canAccessTickerDuringFreeLaunch,
  resolveCheckoutPlanDuringFreeLaunch,
  resolveFreeLaunchLimits,
  shouldSendTelegramDuringFreeLaunch,
  shouldShowMembershipSurfaceDuringFreeLaunch,
  type FreeLaunchProfileSim,
} from './free_launch_policy_refactor_simulation_snippets';

const SUPPORTED_TICKERS = [
  'SPY',
  'QQQ',
  'TQQQ',
  'TSLA',
  'NVDA',
  'PSQ',
  'TSLL',
  'NVDL',
] as const;

function makeProfile(
  overrides: Partial<FreeLaunchProfileSim> = {},
): FreeLaunchProfileSim {
  return {
    subscription_tier: 'free',
    subscription_status: null,
    subscription_expires_at: null,
    telegram_enabled: true,
    telegram_chat_id: '123456789',
    ...overrides,
  };
}

describe('free launch policy refactor simulation', () => {
  it('opens every supported ticker regardless of its previous paid/free bucket', () => {
    expect(canAccessTickerDuringFreeLaunch('SPY', SUPPORTED_TICKERS)).toBe(true);
    expect(canAccessTickerDuringFreeLaunch('TSLL', SUPPORTED_TICKERS)).toBe(true);
    expect(canAccessTickerDuringFreeLaunch(' nvdl ', SUPPORTED_TICKERS)).toBe(true);
    expect(canAccessTickerDuringFreeLaunch('UNKNOWN', SUPPORTED_TICKERS)).toBe(false);
    expect(canAccessTickerDuringFreeLaunch('   ', SUPPORTED_TICKERS)).toBe(false);
  });

  it('uses 3 portfolios / 4 alarms for free and non-selling tiers', () => {
    expect(resolveFreeLaunchLimits('free')).toEqual({
      maxPortfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
      maxAlarms: FREE_LAUNCH_MAX_ALARMS,
    });
    expect(resolveFreeLaunchLimits('enterprise')).toEqual({
      maxPortfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
      maxAlarms: FREE_LAUNCH_MAX_ALARMS,
    });
  });

  it('preserves legacy limits for existing paid pro and premium users', () => {
    expect(resolveFreeLaunchLimits('pro')).toEqual({
      maxPortfolios: LEGACY_PRO_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PRO_MAX_ALARMS,
    });
    expect(resolveFreeLaunchLimits('premium')).toEqual({
      maxPortfolios: LEGACY_PREMIUM_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PREMIUM_MAX_ALARMS,
    });
  });

  it('allows telegram for free users when the user explicitly enabled it and has a chat id', () => {
    expect(shouldSendTelegramDuringFreeLaunch(makeProfile())).toBe(true);
    expect(
      shouldSendTelegramDuringFreeLaunch(
        makeProfile({
          subscription_tier: 'free',
          subscription_status: 'refunded',
          subscription_expires_at: null,
        }),
      ),
    ).toBe(true);
    expect(
      shouldSendTelegramDuringFreeLaunch(
        makeProfile({
          subscription_tier: 'premium',
          subscription_status: 'expired',
          subscription_expires_at: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toBe(true);
  });

  it('does not send telegram when the user has not opted in or has no valid chat id', () => {
    expect(
      shouldSendTelegramDuringFreeLaunch(
        makeProfile({ telegram_enabled: false }),
      ),
    ).toBe(false);
    expect(
      shouldSendTelegramDuringFreeLaunch(
        makeProfile({ telegram_chat_id: null }),
      ),
    ).toBe(false);
    expect(
      shouldSendTelegramDuringFreeLaunch(
        makeProfile({ telegram_chat_id: '   ' }),
      ),
    ).toBe(false);
    expect(shouldSendTelegramDuringFreeLaunch(null)).toBe(false);
  });

  it('keeps membership and checkout surfaces hidden during the free launch window', () => {
    expect(shouldShowMembershipSurfaceDuringFreeLaunch()).toBe(false);
    expect(resolveCheckoutPlanDuringFreeLaunch('pro')).toBeNull();
    expect(resolveCheckoutPlanDuringFreeLaunch('premium')).toBeNull();
    expect(resolveCheckoutPlanDuringFreeLaunch(null)).toBeNull();
  });
});
