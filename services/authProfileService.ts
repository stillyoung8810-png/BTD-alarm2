import type { AppLang } from '../types';
import type {
  AppUserProfile,
  PendingPlanId,
  SubscriptionStatus,
} from '../types/appUserProfile';
import {
  PENDING_PLAN_VALUES,
  SUBSCRIPTION_STATUS_VALUES,
} from '../types/appUserProfile';
import {
  SUBSCRIPTION_TIER_VALUES,
  type SubscriptionTier,
} from '../types/userTier';
import { supabase } from './supabase';
import {
  createServiceError,
  failResult,
  isRecord,
  normalizeErrorMessage,
  okResult,
  readFiniteNumber,
  readString,
  type ServiceResult,
} from './serviceUtils';

const EMPTY_PROFILE: AppUserProfile | null = null;
const DEFAULT_PROFILE_LIMIT = 3;
const DEFAULT_ALARM_LIMIT = 4;
const DEFAULT_AI_USAGE = 0;
const DEFAULT_BACKTEST_USAGE = 0;
const PROFILE_SELECT_FIELDS =
  'subscription_tier, max_portfolios, max_alarms, subscription_status, subscription_expires_at, pending_plan, pending_plan_effective_at, telegram_enabled, telegram_connected_at, telegram_last_error, preferred_language, timezone, ai_daily_usage, ai_monthly_usage, backtest_daily_usage, last_usage_reset_at';

export interface PendingConsentSnapshot {
  terms_consent_at?: string;
  privacy_consent_at?: string;
}

export interface SyncUserProfileClientFactsInput {
  userId: string;
  profileTimezone: string | null | undefined;
  detectedTimezone: string;
  pendingConsent: PendingConsentSnapshot | null;
}

export interface SyncUserProfileClientFactsResult {
  consumedPendingConsent: boolean;
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  return error.message.toLowerCase().includes('aborted');
}

function createAuthProfileServiceError(
  error: unknown,
  fallbackMessage: string,
  userId: string,
) {
  const isAbortError = isAbortLikeError(error);
  return createServiceError(
    isAbortError ? 'TIMEOUT' : 'NETWORK',
    normalizeErrorMessage(error, fallbackMessage),
    {
      retryable: !isAbortError,
      cause: error,
      context: { userId },
    },
  );
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : null;
}

function isSubscriptionTier(value: string): value is SubscriptionTier {
  return SUBSCRIPTION_TIER_VALUES.includes(value as SubscriptionTier);
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUS_VALUES.includes(value as SubscriptionStatus);
}

function isPendingPlanId(value: string): value is PendingPlanId {
  return PENDING_PLAN_VALUES.includes(value as PendingPlanId);
}

function isAppLang(value: string): value is AppLang {
  return value === 'ko' || value === 'en';
}

function normalizeUserProfile(
  profileRow: Record<string, unknown>,
): AppUserProfile {
  const subscriptionTierRaw = readString(profileRow, 'subscription_tier');
  const subscriptionStatusRaw = readString(profileRow, 'subscription_status');
  const pendingPlanRaw = readString(profileRow, 'pending_plan');
  const preferredLanguageRaw = readString(profileRow, 'preferred_language');

  return {
    subscription_tier:
      subscriptionTierRaw != null && isSubscriptionTier(subscriptionTierRaw)
        ? subscriptionTierRaw
        : 'free',
    max_portfolios:
      readFiniteNumber(profileRow, 'max_portfolios') ?? DEFAULT_PROFILE_LIMIT,
    max_alarms:
      readFiniteNumber(profileRow, 'max_alarms') ?? DEFAULT_ALARM_LIMIT,
    subscription_status:
      subscriptionStatusRaw != null && isSubscriptionStatus(subscriptionStatusRaw)
        ? subscriptionStatusRaw
        : null,
    subscription_expires_at:
      readString(profileRow, 'subscription_expires_at') ?? null,
    pending_plan:
      pendingPlanRaw != null && isPendingPlanId(pendingPlanRaw)
        ? pendingPlanRaw
        : null,
    pending_plan_effective_at:
      readString(profileRow, 'pending_plan_effective_at') ?? null,
    telegram_enabled: readBoolean(profileRow, 'telegram_enabled') ?? false,
    telegram_connected_at: readString(profileRow, 'telegram_connected_at') ?? null,
    telegram_last_error: readString(profileRow, 'telegram_last_error') ?? null,
    preferred_language:
      preferredLanguageRaw != null && isAppLang(preferredLanguageRaw)
        ? preferredLanguageRaw
        : 'ko',
    timezone: readString(profileRow, 'timezone') ?? null,
    ai_daily_usage:
      readFiniteNumber(profileRow, 'ai_daily_usage') ?? DEFAULT_AI_USAGE,
    ai_monthly_usage:
      readFiniteNumber(profileRow, 'ai_monthly_usage') ?? DEFAULT_AI_USAGE,
    backtest_daily_usage:
      readFiniteNumber(profileRow, 'backtest_daily_usage') ??
      DEFAULT_BACKTEST_USAGE,
    last_usage_reset_at: readString(profileRow, 'last_usage_reset_at') ?? null,
  };
}

export async function fetchUserProfileSafe(
  userId: string,
): Promise<ServiceResult<AppUserProfile | null>> {
  const safeUserId = userId.trim();
  if (safeUserId.length === 0) {
    return failResult(
      EMPTY_PROFILE,
      createServiceError('INVALID_INPUT', 'auth_profile_user_id_required', {
        context: { userId: safeUserId },
      }),
      { userId: safeUserId },
    );
  }

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(PROFILE_SELECT_FIELDS)
      .eq('id', safeUserId)
      .single();

    if (error != null) {
      return failResult(
        EMPTY_PROFILE,
        createAuthProfileServiceError(
          error,
          'auth_profile_fetch_failed',
          safeUserId,
        ),
        { userId: safeUserId },
      );
    }

    if (!isRecord(data)) {
      return failResult(
        EMPTY_PROFILE,
        createServiceError('INVALID_RESPONSE', 'auth_profile_invalid_shape', {
          context: { userId: safeUserId },
        }),
        { userId: safeUserId },
      );
    }

    return okResult(normalizeUserProfile(data), { userId: safeUserId });
  } catch (error: unknown) {
    return failResult(
      EMPTY_PROFILE,
      createAuthProfileServiceError(error, 'auth_profile_fetch_failed', safeUserId),
      { userId: safeUserId },
    );
  }
}

export async function syncUserProfileClientFactsSafe({
  userId,
  profileTimezone,
  detectedTimezone,
  pendingConsent,
}: SyncUserProfileClientFactsInput): Promise<
  ServiceResult<SyncUserProfileClientFactsResult>
> {
  const safeUserId = userId.trim();
  if (safeUserId.length === 0) {
    return failResult(
      { consumedPendingConsent: false },
      createServiceError('INVALID_INPUT', 'auth_profile_sync_user_id_required', {
        context: { userId: safeUserId },
      }),
      { userId: safeUserId },
    );
  }

  const trimmedProfileTimezone = (profileTimezone ?? '').trim();
  const trimmedDetectedTimezone = detectedTimezone.trim();
  const updatePayload: Record<string, string> = {};
  const termsConsentAt = (pendingConsent?.terms_consent_at ?? '').trim();
  const privacyConsentAt = (pendingConsent?.privacy_consent_at ?? '').trim();

  if (
    trimmedDetectedTimezone.length > 0 &&
    trimmedProfileTimezone !== trimmedDetectedTimezone
  ) {
    updatePayload.timezone = trimmedDetectedTimezone;
  }

  if (termsConsentAt.length > 0) {
    updatePayload.terms_consent_at = termsConsentAt;
  }

  if (privacyConsentAt.length > 0) {
    updatePayload.privacy_consent_at = privacyConsentAt;
  }

  if (Object.keys(updatePayload).length === 0) {
    return okResult(
      { consumedPendingConsent: false },
      { userId: safeUserId, updated: false },
    );
  }

  try {
    const { error } = await supabase
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', safeUserId);

    if (error != null) {
      return failResult(
        { consumedPendingConsent: false },
        createAuthProfileServiceError(error, 'auth_profile_sync_failed', safeUserId),
        { userId: safeUserId, updated: true },
      );
    }

    return okResult(
      { consumedPendingConsent: pendingConsent != null },
      { userId: safeUserId, updated: true },
    );
  } catch (error: unknown) {
    return failResult(
      { consumedPendingConsent: false },
      createAuthProfileServiceError(error, 'auth_profile_sync_failed', safeUserId),
      { userId: safeUserId, updated: true },
    );
  }
}
