import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, clearAuthStorage } from '../services/supabase';
import { isSessionRecoverableError } from '../utils/authHelpers';
import { getDeviceTimeZone } from '../utils/dateUtils';
import type { AppUserProfile } from '../types/appUserProfile';

export interface UseAuthOptions {
  lang: 'ko' | 'en';
  setPortfolios: (value: React.SetStateAction<any[]>) => void;
  /** App에서 정의한 fetchPortfolios. ref로 전달해 순환 의존성 회피. */
  fetchPortfoliosRef: React.MutableRefObject<(userId: string) => void>;
  saveFCMToken: (userId: string) => Promise<void>;
}

export interface UseAuthReturn {
  user: { id: string; email: string } | null;
  setUser: React.Dispatch<React.SetStateAction<{ id: string; email: string } | null>>;
  userProfile: AppUserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<AppUserProfile | null>>;
  authModal: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password' | null;
  setAuthModal: React.Dispatch<React.SetStateAction<'login' | 'signup' | 'profile' | 'reset-password' | 'change-password' | null>>;
  isLoading: boolean;
  fetchUserProfile: (userId: string) => Promise<void>;
  justLoggedInRef: React.MutableRefObject<boolean>;
}

export function useAuth({
  lang,
  setPortfolios,
  saveFCMToken,
  fetchPortfoliosRef,
}: UseAuthOptions): UseAuthReturn {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [userProfile, setUserProfile] = useState<AppUserProfile | null>(null);
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'profile' | 'reset-password' | 'change-password' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authModalRef = useRef(authModal);
  const justLoggedInRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const unhandledRejectionHandlerRef = useRef<((e: PromiseRejectionEvent) => void) | null>(null);

  const fetchUserProfile = useCallback(async (userId: string): Promise<void> => {
    if (!userId) return;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('subscription_tier, max_portfolios, max_alarms, subscription_status, subscription_expires_at, telegram_enabled, telegram_connected_at, telegram_last_error, preferred_language, timezone, ai_daily_usage, ai_monthly_usage, backtest_daily_usage, last_usage_reset_at')
        .eq('id', userId)
        .single();
      if (!profileError && profileData) {
        const detectedTimezone = getDeviceTimeZone();
        const profileTimezone = (profileData.timezone ?? '').trim();
        const updatePayload: Record<string, string> = {};
        if (!profileTimezone || profileTimezone !== detectedTimezone) {
          updatePayload.timezone = detectedTimezone;
        }
        const pendingConsent = localStorage.getItem('btd_pending_consent');
        if (pendingConsent) {
          try {
            const consent = JSON.parse(pendingConsent);
            if (consent.terms_consent_at) updatePayload.terms_consent_at = consent.terms_consent_at;
            if (consent.privacy_consent_at) updatePayload.privacy_consent_at = consent.privacy_consent_at;
          } catch { /* ignore */ }
          localStorage.removeItem('btd_pending_consent');
        }
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from('user_profiles').update(updatePayload).eq('id', userId);
        }
        setUserProfile({
          subscription_tier: profileData.subscription_tier || 'free',
          max_portfolios: profileData.max_portfolios,
          max_alarms: profileData.max_alarms,
          subscription_status: profileData.subscription_status ?? null,
          subscription_expires_at: profileData.subscription_expires_at ?? null,
          telegram_enabled: profileData.telegram_enabled ?? false,
          telegram_connected_at: profileData.telegram_connected_at ?? null,
          telegram_last_error: profileData.telegram_last_error ?? null,
          preferred_language: profileData.preferred_language ?? 'ko',
          timezone: profileTimezone || detectedTimezone,
          ai_daily_usage: profileData.ai_daily_usage ?? 0,
          ai_monthly_usage: profileData.ai_monthly_usage ?? 0,
          backtest_daily_usage: profileData.backtest_daily_usage ?? 0,
          last_usage_reset_at: profileData.last_usage_reset_at ?? null,
        });
      }
    } catch (err) {
      console.warn('[fetchUserProfile] 조회 실패:', err);
    }
  }, []);

  useEffect(() => {
    authModalRef.current = authModal;
  }, [authModal]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const fetchUserData = async (sessionUser: { id: string; email?: string | null }) => {
      if (!sessionUser?.id || !isMounted) return;
      try {
        const currentUser = { id: sessionUser.id, email: sessionUser.email || '' };
        if (!isMounted) return;
        setUser(currentUser);
        setUserProfile({
          subscription_tier: 'free',
          max_portfolios: 2,
          max_alarms: 2,
          preferred_language: 'ko',
          timezone: getDeviceTimeZone(),
        });
        fetchUserProfile(currentUser.id);
        fetchPortfoliosRef.current?.(currentUser.id);
      } catch (err) {
        console.error('[fetchUserData] catch 에러:', err);
      }
    };

    const clearAuthState = async (showAlert: boolean = true) => {
      if (!isMounted) return;
      console.log('[Auth] Clearing auth state due to session error');
      clearAuthStorage();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        console.warn('[Auth] signOut during clearAuthState failed (expected):', e);
      }
      setUser(null);
      setUserProfile(null);
      setPortfolios([]);
      if (showAlert) {
        alert(lang === 'ko' ? '세션이 만료되었습니다. 다시 로그인해 주세요.' : 'Session expired. Please log in again.');
      }
    };

    const checkUser = async () => {
      if (!isMounted) return;
      try {
        setIsLoading(true);
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (sessionError && sessionError.name !== 'AbortError') {
          console.error('[checkUser] Session error:', sessionError);
          if (isSessionRecoverableError(sessionError)) {
            await clearAuthState(false);
            return;
          }
        }
        if (session?.user) {
          await fetchUserData(session.user);
          if (session.user.id) {
            saveFCMToken(session.user.id).catch((err) =>
              console.debug('[FCM] token save on session restore:', err)
            );
          }
        } else {
          setUser(null);
          setUserProfile(null);
          setPortfolios([]);
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name !== 'AbortError' && isMounted && isSessionRecoverableError(err)) {
          await clearAuthState(false);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkUser();

    let initialSessionLoaded = false;
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      try {
        const currentUser = session?.user ?? null;
        if (event === 'INITIAL_SESSION') {
          initialSessionLoaded = true;
          return;
        }
        if (event === 'TOKEN_REFRESHED') return;
        if (event === 'SIGNED_IN') {
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          if (!initialSessionLoaded || justLoggedInRef.current) return;
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserProfile(null);
          setPortfolios([]);
          return;
        }
        if (currentUser && initialSessionLoaded) {
          if (justLoggedInRef.current) {
            justLoggedInRef.current = false;
          } else if (event === 'SIGNED_IN' && currentUser.id === userIdRef.current) {
            return;
          } else {
            await fetchUserData(currentUser);
          }
          if (event === 'SIGNED_IN' && currentUser.id) {
            saveFCMToken(currentUser.id).catch(() => {});
          }
          if (event === 'PASSWORD_RECOVERY' && isMounted) setAuthModal('reset-password');
          if (event === 'USER_UPDATED' && isMounted && authModalRef.current === 'reset-password') {
            setAuthModal(null);
            alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다.' : 'Password updated successfully.');
          }
        } else if (initialSessionLoaded && !currentUser) {
          setUser(null);
          setUserProfile(null);
          setPortfolios([]);
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name !== 'AbortError' && isMounted && isSessionRecoverableError(err)) {
          await clearAuthState(true);
        }
      }
    });

    const handleAuthError = async (event: PromiseRejectionEvent) => {
      if (!isMounted) return;
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
      if (typeof window !== 'undefined' && unhandledRejectionHandlerRef.current) {
        window.removeEventListener('unhandledrejection', unhandledRejectionHandlerRef.current);
        unhandledRejectionHandlerRef.current = null;
      }
    };
  }, [lang, saveFCMToken, fetchUserProfile, setPortfolios]);

  return {
    user,
    setUser,
    userProfile,
    setUserProfile,
    authModal,
    setAuthModal,
    isLoading,
    fetchUserProfile,
    justLoggedInRef,
  };
}
