/**
 * 토스 로그인: SDK appLogin으로 인증 코드 획득 → Railway BFF를 통해 세션 발급.
 * 모든 토스 서버 간 통신은 BFF(Railway)를 거칩니다.
 */

import { appLogin } from '@apps-in-toss/web-framework';
import { supabase } from '../supabase';
import { isTossApp } from './tossBridge';

const BFF_URL = import.meta.env.VITE_RAILWAY_BFF_URL as string | undefined;

export interface TossAuthResult {
  success: boolean;
  user?: { id: string; email: string };
  error?: string;
}

/**
 * 토스 앱 내에서 로그인: appLogin으로 code·referrer 획득 후 BFF /auth/toss/exchange 호출하여 Supabase 세션 설정.
 */
export async function loginWithToss(): Promise<TossAuthResult> {
  if (!isTossApp()) {
    return { success: false, error: '토스 앱 환경이 아닙니다.' };
  }

  if (!BFF_URL?.trim()) {
    console.error('[TossAuth] VITE_RAILWAY_BFF_URL이 설정되지 않았습니다.');
    return { success: false, error: '서버 설정이 올바르지 않습니다.' };
  }

  let code: string;
  let referrer: string;
  try {
    const { authorizationCode, referrer: referrerFromSdk } = await appLogin();
    code = authorizationCode?.trim();
    if (!code) {
      return { success: false, error: '토스 인증 코드를 받지 못했습니다.' };
    }
    // SDK: "DEFAULT" | "SANDBOX" → BFF 스펙: "DEFAULT" | "sandbox"
    referrer = referrerFromSdk === 'SANDBOX' ? 'sandbox' : referrerFromSdk;
  } catch (err) {
    const msg = toErrorMessage(err, '토스 로그인 요청 실패');
    console.warn('[TossAuth] appLogin 실패:', msg);
    return { success: false, error: msg };
  }

  try {
    const res = await fetch(`${BFF_URL.replace(/\/+$/, '')}/auth/toss/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode: code, referrer }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const serverMessage = (typeof data?.error === 'string' ? data.error : data?.message ?? data?.error) ?? '로그인에 실패했습니다.';
      return { success: false, error: serverMessage };
    }

    const accessToken = data.access_token ?? data.session?.access_token;
    const refreshToken = data.refresh_token ?? data.session?.refresh_token;
    if (!accessToken || !refreshToken) {
      return { success: false, error: '세션 정보를 받지 못했습니다.' };
    }

    const { error: setError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setError) {
      console.error('[TossAuth] setSession error:', setError.message);
      return { success: false, error: setError.message };
    }

    const user = data.user ?? (await supabase.auth.getUser()).data.user;
    const id = user?.id ?? '';
    const email = user?.email ?? user?.user_metadata?.email ?? '';
    return { success: true, user: { id, email } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, '네트워크 오류') };
  }
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
