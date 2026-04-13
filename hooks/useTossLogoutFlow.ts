import { useCallback, useEffect, useRef, useState } from 'react';
import { FALLBACK_AUTH_MESSAGES } from '../constants/messages/authMessages';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import {
  fetchJsonWithTimeout,
  isRecord,
  normalizeErrorMessage,
  readString,
} from '../services/serviceUtils';
import { clearAuthStorage, supabase } from '../services/supabase';
import type { AppLang } from '../types';
import { readTrimmedViteEnv } from '../utils/viteImportMetaEnv';

const BFF_URL = readTrimmedViteEnv('VITE_RAILWAY_BFF_URL');
const TOSS_SELF_UNLINK_PATH = '/auth/toss/self-unlink';
/** Fastify는 Content-Type이 application/json일 때 빈 바디를 400(FST_ERR_CTP_EMPTY_JSON_BODY)으로 거부한다. */
const EMPTY_JSON_OBJECT_BODY = JSON.stringify({});

type TossSelfUnlinkAction = 'unlinked' | 'noop' | 'official_unlink_failed';

interface UseTossLogoutFlowArgs {
  lang: AppLang;
  isInTossApp: boolean;
  onResetUiState: () => void;
}

interface UseTossLogoutFlowResult {
  handleLogout: () => Promise<void>;
  isLogoutPending: boolean;
}

function parseTossSelfUnlinkAction(value: unknown): TossSelfUnlinkAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = readString(value, 'action');
  switch (action) {
    case 'unlinked':
    case 'noop':
    case 'official_unlink_failed':
      return action;
    default:
      return null;
  }
}

export function useTossLogoutFlow({
  lang,
  isInTossApp,
  onResetUiState,
}: UseTossLogoutFlowArgs): UseTossLogoutFlowResult {
  const copy = FALLBACK_AUTH_MESSAGES[lang] ?? FALLBACK_AUTH_MESSAGES.ko;
  const isMountedRef = useRef(true);
  const isExecutingLogoutRef = useRef(false);
  const [isLogoutPending, setIsLogoutPending] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const finalizeLocalLogout = useCallback(async (): Promise<void> => {
    let signOutError: unknown = null;

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error != null) {
        signOutError = error;
      }
    } catch (error: unknown) {
      signOutError = error;
    } finally {
      clearAuthStorage();
    }

    if (isMountedRef.current) {
      onResetUiState();
    }

    if (signOutError != null) {
      console.error(
        '[TossLogout] Supabase sign-out failed during local cleanup',
        signOutError,
      );
      if (isMountedRef.current) {
        showErrorToast(copy.tossLogoutNetworkError);
      }
    }
  }, [copy.tossLogoutNetworkError, onResetUiState]);

  const requestTossSelfUnlink = useCallback(
    async (accessToken: string): Promise<TossSelfUnlinkAction | null> => {
      const trimmedBffUrl = BFF_URL.trim();
      if (trimmedBffUrl.length === 0) {
        console.error(
          '[TossLogout] Missing VITE_RAILWAY_BFF_URL during self-unlink',
        );
        if (isMountedRef.current) {
          showErrorToast(copy.tossLogoutNetworkError);
        }
        return null;
      }

      try {
        const unlinkResult = await fetchJsonWithTimeout<null>(
          `${trimmedBffUrl.replace(/\/+$/, '')}${TOSS_SELF_UNLINK_PATH}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: EMPTY_JSON_OBJECT_BODY,
          },
          null,
          { context: { action: 'toss_self_unlink' } },
        );

        if (!unlinkResult.ok) {
          console.error(
            '[TossLogout] self-unlink request failed',
            unlinkResult.error,
          );
          if (isMountedRef.current) {
            showErrorToast(copy.tossLogoutNetworkError);
          }
          return null;
        }

        const action = parseTossSelfUnlinkAction(unlinkResult.data);
        if (action == null) {
          console.error(
            '[TossLogout] Invalid self-unlink response payload',
            unlinkResult.data,
          );
          if (isMountedRef.current) {
            showErrorToast(copy.tossLogoutNetworkError);
          }
          return null;
        }

        if (action === 'official_unlink_failed') {
          if (isMountedRef.current) {
            showErrorToast(copy.tossLogoutUnlinkDelayedWarning);
          }
          return null;
        }

        return action;
      } catch (error: unknown) {
        const normalizedMessage = normalizeErrorMessage(
          error,
          copy.tossLogoutNetworkError,
        );
        console.error(
          '[TossLogout] Unexpected self-unlink failure',
          normalizedMessage,
          error,
        );
        if (isMountedRef.current) {
          showErrorToast(copy.tossLogoutNetworkError);
        }
        return null;
      }
    },
    [copy.tossLogoutNetworkError, copy.tossLogoutUnlinkDelayedWarning],
  );

  const handleLogout = useCallback(async (): Promise<void> => {
    if (isExecutingLogoutRef.current) {
      return;
    }
    isExecutingLogoutRef.current = true;

    if (isMountedRef.current) {
      setIsLogoutPending(true);
    }

    try {
      if (isInTossApp) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError != null) {
          console.error('[TossLogout] Failed to read current session', sessionError);
          if (isMountedRef.current) {
            showErrorToast(copy.tossLogoutNetworkError);
          }
          return;
        }

        const sessionAccessToken = session?.access_token?.trim() ?? '';
        if (sessionAccessToken.length === 0) {
          console.error('[TossLogout] Missing access token for self-unlink');
          if (isMountedRef.current) {
            showErrorToast(copy.tossLogoutNetworkError);
          }
          return;
        }

        // apps-in-toss 공식 클라이언트 logout API는 없으므로, 토스 토큰 폐기는 BFF self-unlink가 서버 측에서 수행합니다.
        const unlinkAction = await requestTossSelfUnlink(sessionAccessToken);
        if (unlinkAction == null) {
          return;
        }
      }

      await finalizeLocalLogout();
    } catch (error: unknown) {
      const normalizedMessage = normalizeErrorMessage(
        error,
        copy.tossLogoutNetworkError,
      );
      console.error(
        '[TossLogout] Unexpected error during logout flow',
        normalizedMessage,
        error,
      );
      if (isMountedRef.current) {
        showErrorToast(copy.tossLogoutNetworkError);
      }
    } finally {
      isExecutingLogoutRef.current = false;
      if (isMountedRef.current) {
        setIsLogoutPending(false);
      }
    }
  }, [
    copy.tossLogoutNetworkError,
    finalizeLocalLogout,
    isInTossApp,
    requestTossSelfUnlink,
  ]);

  return {
    handleLogout,
    isLogoutPending,
  };
}
