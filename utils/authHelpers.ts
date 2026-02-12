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

/**
 * 베이스 URL과 경로를 안전하게 합쳐서 슬래시 중복/누락 방지
 */
export function buildRedirectUrl(path: string): string {
  const rawBase =
    import.meta.env.VITE_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const base = rawBase.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
