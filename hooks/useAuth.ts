import { useState, useEffect, useRef, useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppUserProfile } from '../types/appUserProfile';
import type { AppLang, Portfolio } from '../types';
import { useAuthProfileSync } from './useAuthProfileSync';
import { useAuthSessionSync } from './useAuthSessionSync';

export interface UseAuthOptions {
  lang: AppLang;
  setPortfolios: (value: SetStateAction<Portfolio[]>) => void;
  /** App에서 정의한 fetchPortfolios. ref로 전달해 순환 의존성 회피. */
  fetchPortfoliosRef: MutableRefObject<(userId: string) => void>;
  saveFCMToken: (userId: string) => Promise<void>;
}

export interface UseAuthReturn {
  user: { id: string; email: string } | null;
  setUser: Dispatch<SetStateAction<{ id: string; email: string } | null>>;
  userProfile: AppUserProfile | null;
  setUserProfile: Dispatch<SetStateAction<AppUserProfile | null>>;
  authModal: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password' | null;
  setAuthModal: Dispatch<SetStateAction<'login' | 'signup' | 'profile' | 'reset-password' | 'change-password' | null>>;
  isLoading: boolean;
  fetchUserProfile: (userId: string) => Promise<void>;
  justLoggedInRef: MutableRefObject<boolean>;
  hasSessionExpired: boolean;
  handleDismissSessionExpired: () => void;
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
  const [hasSessionExpired, setHasSessionExpired] = useState(false);

  const justLoggedInRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const profileSyncRequestIdRef = useRef(0);
  const lastHandledSessionFingerprintRef = useRef<string | null>(null);
  const unhandledRejectionHandlerRef = useRef<((e: PromiseRejectionEvent) => void) | null>(null);

  const handleDismissSessionExpired = useCallback(() => {
    setHasSessionExpired(false);
  }, []);

  const { fetchUserProfile } = useAuthProfileSync({
    lang,
    setUserProfile,
    profileSyncRequestIdRef,
  });

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    return () => {
      profileSyncRequestIdRef.current += 1;
    };
  }, []);

  useAuthSessionSync({
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
  });

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
    hasSessionExpired,
    handleDismissSessionExpired,
  };
}
