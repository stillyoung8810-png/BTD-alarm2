import { useCallback, useEffect, useRef, useState } from 'react';
import { saveUserFcmTokenSafe } from '../services/firebaseTokenService';
import type { ServiceErrorCode } from '../services/serviceUtils';
import { isTossApp } from '../services/tossAppBridge';
import { parseDeviceInfo } from '../utils/deviceInfo';
import { useMutexAction } from './useMutexAction';

export interface UseFCMTokenResult {
  saveFCMToken: (userId: string) => Promise<void>;
  lastErrorCode: ServiceErrorCode | null;
  /** 실패 1회마다 증가 — 호출부가 토스트 등 1회 알림에만 사용 */
  fcmSaveFailureTick: number;
  isSaveFcmTokenExecuting: boolean;
}

export function useFCMToken(): UseFCMTokenResult {
  const isMountedRef = useRef(true);
  const [lastErrorCode, setLastErrorCode] = useState<ServiceErrorCode | null>(null);
  const [fcmSaveFailureTick, setFcmSaveFailureTick] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const persistUserFcmTokenAction = useCallback(async (userId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isTossApp()) {
      return;
    }

    const trimmedUserId = userId.trim();
    if (trimmedUserId.length === 0) {
      if (isMountedRef.current) {
        setLastErrorCode('INVALID_INPUT');
        setFcmSaveFailureTick((tick) => tick + 1);
      }
      return;
    }

    if (isMountedRef.current) {
      setLastErrorCode(null);
    }

    const result = await saveUserFcmTokenSafe(trimmedUserId, parseDeviceInfo());

    if (!isMountedRef.current) {
      return;
    }

    if (!result.ok) {
      setLastErrorCode(result.error.code);
      setFcmSaveFailureTick((tick) => tick + 1);
    }
  }, []);

  const { run: runSaveFcmToken, isExecuting: isSaveFcmTokenExecuting } =
    useMutexAction(persistUserFcmTokenAction);

  const saveFCMToken = useCallback(
    async (userId: string): Promise<void> => {
      await runSaveFcmToken(userId);
    },
    [runSaveFcmToken],
  );

  return {
    saveFCMToken,
    lastErrorCode,
    fcmSaveFailureTick,
    isSaveFcmTokenExecuting,
  };
}
