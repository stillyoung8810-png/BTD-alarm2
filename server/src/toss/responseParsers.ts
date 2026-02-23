/**
 * 토스 응답 파싱: Selective Picking만 사용. .strict() 미적용 (Postel's Law).
 * 필요한 필드만 검증·추출하고 나머지는 무시.
 */

import type { TossTokenSuccessDto, TossLoginMeSuccessDto } from './types';

const RESULT_SUCCESS = 'SUCCESS';

/** generate-token 성공 응답에서 필요한 필드만 추출 */
export function parseTokenResponse(data: unknown): TossTokenSuccessDto | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { resultType?: string; success?: unknown };
  if (d.resultType !== RESULT_SUCCESS || !d.success || typeof d.success !== 'object') return null;
  const s = d.success as Record<string, unknown>;
  const accessToken = s.accessToken;
  const refreshToken = s.refreshToken;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  const expiresIn = s.expiresIn;
  const expiresInNum =
    typeof expiresIn === 'number' ? expiresIn : typeof expiresIn === 'string' ? parseInt(String(expiresIn), 10) : 0;
  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isNaN(expiresInNum) ? 0 : expiresInNum,
  };
}

/** login-me 성공 응답에서 userKey만 추출 (나머지 필드 무시) */
export function parseLoginMeResponse(data: unknown): TossLoginMeSuccessDto | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { resultType?: string; success?: unknown };
  if (d.resultType !== RESULT_SUCCESS || !d.success || typeof d.success !== 'object') return null;
  const s = d.success as Record<string, unknown>;
  const userKey = s.userKey;
  if (typeof userKey !== 'number') return null;
  return { userKey };
}

/** userKey를 DB 저장용 string으로 정규화 (JS Number 범위 이슈 방지) */
export function userKeyToString(userKey: number): string {
  return String(userKey);
}
