import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { clearAuthStorage, supabase } from '../services/supabase';
import type { Portfolio } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';
import { isSessionRecoverableError } from '../utils/authHelpers';
import { getDeviceTimeZone } from '../utils/dateUtils';

type AuthModalState =
  | 'login'
  | 'signup'
  | 'profile'
  | 'reset-password'
  | 'change-password'
  | null;

type AuthUser = {
  id: string;
  email: string;
};

interface UseAuthSessionSyncArgs {
  setPortfolios: (value: SetStateAction<Portfolio[]>) => void;
  fetchPortfoliosRef: MutableRefObject<(userId: string) => void>;
  saveFCMToken: (userId: string) => Promise<void>;
  fetchUserProfile: (userId: string) => Promise<void>;
  setUser: Dispatch<SetStateAction<AuthUser | null>>;
  setUserProfile: Dispatch<SetStateAction<AppUserProfile | null>>;
  setAuthModal: Dispatch<SetStateAction<AuthModalState>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setHasSessionExpired: Dispatch<SetStateAction<boolean>>;
  justLoggedInRef: MutableRefObject<boolean>;
  userIdRef: MutableRefObject<string | null>;
  lastHandledSessionFingerprintRef: MutableRefObject<string | null>;
  unhandledRejectionHandlerRef: MutableRefObject<
    ((event: PromiseRejectionEvent) => void) | null
  >;
  profileSyncRequestIdRef: MutableRefObject<number>;
}

function getSessionFingerprint(session: Session | null): string | null {
  if (session?.user == null) {
    return null;
  }

  return session.access_token != null && session.access_token !== ''
    ? `${session.user.id}:${session.access_token}`
    : session.user.id;
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

function createPendingUserProfile(): AppUserProfile {
  return {
    subscription_tier: 'free',
    max_portfolios: 2,
    max_alarms: 2,
    preferred_language: 'ko',
    timezone: getDeviceTimeZone(),
  };
}

export function useAuthSessionSync({
  setPortfolios,
  fetchPortfoliosRef,
  saveFCMToken,
  fetchUserProfile,
  setUser,
  setUserProfile,
  setAuthModal,
  setIsLoading,
  setHasSessionExpired,
  justLoggedInRef,
  userIdRef,
  lastHandledSessionFingerprintRef,
  unhandledRejectionHandlerRef,
  profileSyncRequestIdRef,
}: UseAuthSessionSyncArgs): void {
  useEffect(() => {
    let isMounted = true;

    const resetSignedOutState = (): void => {
      profileSyncRequestIdRef.current += 1;
      lastHandledSessionFingerprintRef.current = null;
      setUser(null);
      setUserProfile(null);
      setPortfolios([]);
    };

    const fetchUserData = async (
      sessionUser: { id: string; email?: string | null },
    ): Promise<void> => {
      if (!isMounted || sessionUser.id.trim().length === 0) {
        return;
      }

      const currentUser = {
        id: sessionUser.id,
        email: sessionUser.email ?? '',
      };

      setUser(currentUser);
      setUserProfile(createPendingUserProfile());

      void fetchUserProfile(currentUser.id);
      fetchPortfoliosRef.current?.(currentUser.id);
    };

    const clearAuthState = async (shouldShowAlert: boolean): Promise<void> => {
      if (!isMounted) {
        return;
      }

      clearAuthStorage();

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error: unknown) {
        console.warn('[Auth] signOut during clearAuthState failed:', error);
      }

      if (!isMounted) {
        return;
      }

      resetSignedOutState();
      if (shouldShowAlert) {
        setHasSessionExpired(true);
      }
    };

    const applySession = async (
      session: Session | null,
      event: AuthChangeEvent | 'CHECK_USER',
    ): Promise<void> => {
      if (!isMounted) {
        return;
      }

      if (session?.user == null) {
        resetSignedOutState();
        return;
      }

      setHasSessionExpired(false);

      const fingerprint = getSessionFingerprint(session);
      if (
        fingerprint != null &&
        lastHandledSessionFingerprintRef.current === fingerprint
      ) {
        if (event === 'SIGNED_IN') {
          justLoggedInRef.current = false;
        }

        if (event === 'PASSWORD_RECOVERY') {
          setAuthModal('reset-password');
        }
        return;
      }

      lastHandledSessionFingerprintRef.current = fingerprint;
      await fetchUserData(session.user);

      if (event === 'SIGNED_IN') {
        justLoggedInRef.current = false;
      }

      if (session.user.id.trim().length > 0) {
        void saveFCMToken(session.user.id).catch((error: unknown) => {
          console.debug('[FCM] token save on auth sync:', error);
        });
      }

      if (event === 'PASSWORD_RECOVERY') {
        setAuthModal('reset-password');
      }
    };

    const handleRecoverableError = async (
      error: unknown,
      shouldShowAlert: boolean,
    ): Promise<void> => {
      if (!isMounted || isAbortLikeError(error)) {
        return;
      }

      if (isSessionRecoverableError(error)) {
        await clearAuthState(shouldShowAlert);
      }
    };

    const checkUser = async (): Promise<void> => {
      if (!isMounted) {
        return;
      }

      try {
        setIsLoading(true);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (sessionError != null && !isAbortLikeError(sessionError)) {
          console.error('[checkUser] Session error:', sessionError);
          if (isSessionRecoverableError(sessionError)) {
            await clearAuthState(false);
            return;
          }
        }

        await applySession(session, 'CHECK_USER');
      } catch (error: unknown) {
        await handleRecoverableError(error, false);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void checkUser();

    let initialSessionResolved = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) {
          return;
        }

        try {
          if (event === 'TOKEN_REFRESHED') {
            return;
          }

          if (event === 'INITIAL_SESSION') {
            initialSessionResolved = true;
            await applySession(session, event);
            if (isMounted) {
              setIsLoading(false);
            }
            return;
          }

          if (!initialSessionResolved) {
            initialSessionResolved = true;
          }

          if (event === 'SIGNED_OUT') {
            await applySession(null, event);
            return;
          }

          if (
            event === 'SIGNED_IN' &&
            justLoggedInRef.current &&
            session?.user?.id === userIdRef.current
          ) {
            justLoggedInRef.current = false;
            lastHandledSessionFingerprintRef.current =
              getSessionFingerprint(session);
            return;
          }

          if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
            const cleanUrl = `${window.location.pathname}${window.location.search}`;
            window.history.replaceState(null, '', cleanUrl);
          }

          await applySession(session, event);
        } catch (error: unknown) {
          await handleRecoverableError(error, true);
        }
      },
    );

    const handleAuthError = async (
      event: PromiseRejectionEvent,
    ): Promise<void> => {
      if (!isMounted) {
        return;
      }

      if (isSessionRecoverableError(event.reason)) {
        event.preventDefault();
        await clearAuthState(true);
      }
    };

    unhandledRejectionHandlerRef.current = handleAuthError;

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleAuthError);
    }

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();

      if (
        typeof window !== 'undefined' &&
        unhandledRejectionHandlerRef.current != null
      ) {
        window.removeEventListener(
          'unhandledrejection',
          unhandledRejectionHandlerRef.current,
        );
        unhandledRejectionHandlerRef.current = null;
      }
    };
  }, [
    fetchPortfoliosRef,
    fetchUserProfile,
    justLoggedInRef,
    lastHandledSessionFingerprintRef,
    profileSyncRequestIdRef,
    saveFCMToken,
    setAuthModal,
    setHasSessionExpired,
    setIsLoading,
    setPortfolios,
    setUser,
    setUserProfile,
    unhandledRejectionHandlerRef,
    userIdRef,
  ]);
}
