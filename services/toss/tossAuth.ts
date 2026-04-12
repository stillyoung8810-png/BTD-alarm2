/**
 * 토스 로그인: SDK appLogin으로 인증 코드 획득 → Railway BFF를 통해 세션 발급.
 * 모든 토스 서버 간 통신은 BFF(Railway)를 거칩니다.
 */

import { appLogin } from '@apps-in-toss/web-framework';
import {
  fetchJsonWithTimeout,
  isRecord,
  normalizeErrorMessage,
  readString,
  wrapBridgeCall,
} from '../serviceUtils';
import { readTrimmedViteEnv } from '../../utils/viteImportMetaEnv';
import { isTossApp } from './tossBridge';

const BFF_URL = readTrimmedViteEnv('VITE_RAILWAY_BFF_URL');

export interface TossAuthSuccessResult {
  success: true;
  session: {
    accessToken: string;
    refreshToken: string;
  };
  user?: { id: string; email: string };
}

/**
 * 토스 앱 내에서 로그인: appLogin으로 code·referrer 획득 후 BFF /auth/toss/exchange 응답만 반환합니다.
 */
export type TossAuthResult =
  | TossAuthSuccessResult
  | {
      success: false;
      error: string;
    };

export async function loginWithToss(): Promise<TossAuthResult> {
  if (!isTossApp()) {
    return { success: false, error: '토스 앱 환경이 아닙니다.' };
  }

  if (!BFF_URL?.trim()) {
    console.error('[TossAuth] VITE_RAILWAY_BFF_URL이 설정되지 않았습니다.');
    return { success: false, error: '서버 설정이 올바르지 않습니다.' };
  }

  const loginCallResult = await wrapBridgeCall<unknown>(
    () => appLogin(),
    null,
    { action: 'appLogin' },
  );
  if (!loginCallResult.ok) {
    const message = normalizeErrorMessage(
      loginCallResult.error.cause,
      '토스 로그인 요청 실패',
    );
    console.warn('[TossAuth] appLogin 실패:', message);
    return { success: false, error: message };
  }

  const decodedAppLogin = decodeAppLoginResponse(loginCallResult.data);
  if (decodedAppLogin == null) {
    return { success: false, error: '토스 인증 코드를 받지 못했습니다.' };
  }

  const exchangeResult = await fetchJsonWithTimeout<null>(
    `${BFF_URL.replace(/\/+$/, '')}/auth/toss/exchange`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationCode: decodedAppLogin.authorizationCode,
        referrer: decodedAppLogin.referrer,
      }),
    },
    null,
    { context: { action: 'toss_exchange' } },
  );
  if (!exchangeResult.ok) {
    return {
      success: false,
      error: extractServerMessage(
        exchangeResult.error.cause,
        toAuthFailureMessage(exchangeResult.error.code),
      ),
    };
  }

  const decodedSession = decodeExchangeSession(exchangeResult.data);
  if (decodedSession == null) {
    return { success: false, error: '세션 정보를 받지 못했습니다.' };
  }

  return {
    success: true,
    session: {
      accessToken: decodedSession.accessToken,
      refreshToken: decodedSession.refreshToken,
    },
    user: decodedSession.user,
  };
}

function decodeAppLoginResponse(
  value: unknown,
): { authorizationCode: string; referrer: 'DEFAULT' | 'sandbox' } | null {
  if (!isRecord(value)) {
    return null;
  }

  const authorizationCode = readString(value, 'authorizationCode');
  if (authorizationCode == null) {
    return null;
  }

  const rawReferrer = readString(value, 'referrer');
  return {
    authorizationCode,
    referrer: rawReferrer === 'SANDBOX' ? 'sandbox' : 'DEFAULT',
  };
}

function decodeExchangeSession(
  value: unknown,
): { accessToken: string; refreshToken: string; user?: { id: string; email: string } } | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionRecord = isRecord(value.session) ? value.session : null;
  const accessToken =
    readString(value, 'access_token') ??
    (sessionRecord != null ? readString(sessionRecord, 'access_token') : null);
  const refreshToken =
    readString(value, 'refresh_token') ??
    (sessionRecord != null ? readString(sessionRecord, 'refresh_token') : null);

  if (accessToken == null || refreshToken == null) {
    return null;
  }

  const userRecord = isRecord(value.user) ? value.user : null;
  const userId = userRecord != null ? readString(userRecord, 'id') : null;
  const userEmail =
    userRecord != null
      ? readString(userRecord, 'email') ??
        (isRecord(userRecord.user_metadata)
          ? readString(userRecord.user_metadata, 'email')
          : null)
      : null;

  return {
    accessToken,
    refreshToken,
    user:
      userId != null && userEmail != null
        ? { id: userId, email: userEmail }
        : undefined,
  };
}

function extractServerMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  return (
    readString(payload, 'error') ??
    readString(payload, 'message') ??
    fallback
  );
}

function toAuthFailureMessage(code: string): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return '인증이 필요합니다.';
    case 'FORBIDDEN':
      return '로그인에 실패했습니다.';
    case 'TIMEOUT':
    case 'NETWORK':
      return '네트워크 오류';
    default:
      return '로그인에 실패했습니다.';
  }
}
