/**
 * 토스 미니앱 전용 로그인 뷰.
 * 클릭 이벤트만 받아 Toss exchange 결과를 상위 coordinator로 전달합니다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FALLBACK_AUTH_MESSAGES,
} from '../constants/messages/authMessages';
import { loginWithToss, type TossAuthSuccessResult } from '../services/toss/tossAuth';
import type { AppLang } from '../types';
import { normalizeErrorMessage } from '../services/serviceUtils';
import { TDSButton } from './tds';

export interface TossLoginViewProps {
  lang: AppLang;
  onSuccess: (exchangeResult: TossAuthSuccessResult) => Promise<void> | void;
  onError: (message: string | null) => void;
}

const TossLoginView: React.FC<TossLoginViewProps> = ({
  lang,
  onSuccess,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);
  const fallbackCopy = FALLBACK_AUTH_MESSAGES[lang] ?? FALLBACK_AUTH_MESSAGES.ko;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleTossLogin = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoading(true);
      onError(null);
    }

    try {
      const result = await Promise.resolve(loginWithToss());
      if (!isMountedRef.current) {
        return;
      }

      if (result.success) {
        await Promise.resolve(onSuccess(result));
        return;
      }

      onError(result.error || fallbackCopy.tossLoginFailed);
    } catch (error: unknown) {
      if (!isMountedRef.current) {
        return;
      }

      onError(
        normalizeErrorMessage(error, fallbackCopy.tossLoginUnexpectedError),
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    fallbackCopy.tossLoginFailed,
    fallbackCopy.tossLoginUnexpectedError,
    onError,
    onSuccess,
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm font-bold text-slate-600 dark:text-slate-400 text-center">
        {fallbackCopy.tossLoginDescription}
      </p>
      <TDSButton
        type="button"
        fullWidth
        loading={isLoading}
        disabled={isLoading}
        onClick={handleTossLogin}
      >
        {isLoading
          ? fallbackCopy.tossLoginLoadingAction
          : fallbackCopy.tossLoginAction}
      </TDSButton>
    </div>
  );
};

export default TossLoginView;
