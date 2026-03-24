/**
 * 인증 관련 유틸 (DRY)
 * 리다이렉트 URL, 세션 에러 판별 등 AuthModals·App 등에서 재사용
 */

/**
 * 세션 복구 불가(재로그인 필요)로 볼 수 있는 에러인지 판별.
 * checkUser, onAuthStateChange, handleAuthError 등에서 동일 조건 제거용.
 */
export function isSessionRecoverableError(err: unknown): boolean {
  const name = err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : '';
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message).toLowerCase()
      : '';
  return (
    name === 'AuthApiError' ||
    message.includes('refresh token') ||
    message.includes('invalid') ||
    message.includes('expired') ||
    message.includes('not found')
  );
}

const HTTP_PROTOCOL_RE = /^https?:\/\//i;

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * OAuth/이메일 인증 redirect 베이스 URL.
 * 토스 WebView 등에서는 window.location.origin을 최우선해 빌드 시점 VITE_SITE_URL에 묶이지 않게 합니다.
 */
export function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined') {
    const runtimeOrigin = window.location.origin?.trim();
    if (
      runtimeOrigin &&
      runtimeOrigin !== 'null' &&
      HTTP_PROTOCOL_RE.test(runtimeOrigin)
    ) {
      return normalizeBaseUrl(runtimeOrigin);
    }
  }

  const envOrigin = import.meta.env.VITE_SITE_URL?.trim();
  if (envOrigin && HTTP_PROTOCOL_RE.test(envOrigin)) {
    return normalizeBaseUrl(envOrigin);
  }

  throw new Error('Auth redirect base URL could not be resolved.');
}

/**
 * 베이스 URL과 경로를 안전하게 합쳐서 슬래시 중복/누락 방지
 */
export function buildRedirectUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getRuntimeOrigin()}/`).toString();
}
