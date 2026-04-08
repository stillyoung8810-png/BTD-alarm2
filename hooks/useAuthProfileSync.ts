import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';
import { getDeviceTimeZone } from '../utils/dateUtils';
import {
  fetchUserProfileSafe,
  syncUserProfileClientFactsSafe,
  type PendingConsentSnapshot,
} from '../services/authProfileService';
import { isRecord, readString } from '../services/serviceUtils';

const APP_SHELL_DEFAULT_LANG: AppLang = 'ko';
const EMPTY_PROFILE: AppUserProfile | null = null;
const PENDING_CONSENT_STORAGE_KEY = 'btd_pending_consent';

interface UseAuthProfileSyncArgs {
  lang: AppLang;
  setUserProfile: Dispatch<SetStateAction<AppUserProfile | null>>;
  profileSyncRequestIdRef: MutableRefObject<number>;
}

interface UseAuthProfileSyncResult {
  fetchUserProfile: (userId: string) => Promise<void>;
}

function parsePendingConsent(
  rawValue: unknown,
): PendingConsentSnapshot | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const termsConsentAt = readString(rawValue, 'terms_consent_at');
  const privacyConsentAt = readString(rawValue, 'privacy_consent_at');

  if (termsConsentAt == null && privacyConsentAt == null) {
    return null;
  }

  const pendingConsent: PendingConsentSnapshot = {};
  if (termsConsentAt != null) {
    pendingConsent.terms_consent_at = termsConsentAt;
  }
  if (privacyConsentAt != null) {
    pendingConsent.privacy_consent_at = privacyConsentAt;
  }

  return pendingConsent;
}

function readPendingConsentFromStorage(): PendingConsentSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const pendingConsentRaw = localStorage.getItem(PENDING_CONSENT_STORAGE_KEY);
  if (pendingConsentRaw == null) {
    return null;
  }

  try {
    const parsed = parsePendingConsent(JSON.parse(pendingConsentRaw) as unknown);
    if (parsed != null) {
      return parsed;
    }
  } catch {
    // 손상된 동의 캐시는 반복 재시도 가치가 없어 즉시 폐기합니다.
  }

  localStorage.removeItem(PENDING_CONSENT_STORAGE_KEY);
  return null;
}

function clearPendingConsentFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(PENDING_CONSENT_STORAGE_KEY);
}

export function useAuthProfileSync({
  lang,
  setUserProfile,
  profileSyncRequestIdRef,
}: UseAuthProfileSyncArgs): UseAuthProfileSyncResult {
  const fetchUserProfile = useCallback(
    async (userId: string): Promise<void> => {
      const trimmedUserId = (userId ?? '').trim();
      if (trimmedUserId.length === 0) {
        profileSyncRequestIdRef.current += 1;
        setUserProfile(EMPTY_PROFILE);
        return;
      }

      const syncRequestId = profileSyncRequestIdRef.current + 1;
      profileSyncRequestIdRef.current = syncRequestId;

      const detectedTimezone = getDeviceTimeZone();
      const profileResult = await fetchUserProfileSafe(trimmedUserId);

      if (profileSyncRequestIdRef.current !== syncRequestId) {
        return;
      }

      if (!profileResult.ok || profileResult.data == null) {
        setUserProfile(EMPTY_PROFILE);
        return;
      }

      const fetchedUserProfile = profileResult.data;
      const nextUserProfile: AppUserProfile = {
        ...fetchedUserProfile,
        timezone: (fetchedUserProfile.timezone ?? '').trim() || detectedTimezone,
      };

      setUserProfile(nextUserProfile);

      const pendingConsent = readPendingConsentFromStorage();
      const syncResult = await syncUserProfileClientFactsSafe({
        userId: trimmedUserId,
        profileTimezone: fetchedUserProfile.timezone ?? null,
        detectedTimezone,
        pendingConsent,
      });

      if (profileSyncRequestIdRef.current !== syncRequestId) {
        return;
      }

      if (!syncResult.ok) {
        showErrorToast(
          APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ??
            APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError,
        );
        return;
      }

      if (syncResult.data.consumedPendingConsent) {
        clearPendingConsentFromStorage();
      }
    },
    [lang, profileSyncRequestIdRef, setUserProfile],
  );

  return {
    fetchUserProfile,
  };
}
