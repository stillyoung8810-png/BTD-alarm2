/**
 * 토스 응답 파싱: raw payload는 여기서만 좁힌다.
 * 라우터/서비스 계층은 unknown payload를 직접 열어보지 않는다.
 */

import type { TossLoginMeSuccessDto, TossTokenSuccessDto } from './types';

const RESULT_SUCCESS = 'SUCCESS';
const DECIMAL_RADIX = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function readSuccessPayload(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) {
    return null;
  }

  const resultType = data.resultType;
  const success = data.success;

  if (resultType !== RESULT_SUCCESS || !isRecord(success)) {
    return null;
  }

  return success;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedValues = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalizedValues.length === value.length ? normalizedValues : null;
}

function readNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** generate-token 성공 응답에서 필요한 필드만 추출 */
export function parseTokenResponse(data: unknown): TossTokenSuccessDto | null {
  const success = readSuccessPayload(data);
  if (success == null) {
    return null;
  }

  const accessToken = success.accessToken;
  const refreshToken = success.refreshToken;
  const expiresIn = success.expiresIn;

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return null;
  }

  const parsedExpiresIn =
    typeof expiresIn === 'number'
      ? expiresIn
      : typeof expiresIn === 'string'
        ? Number.parseInt(expiresIn, DECIMAL_RADIX)
        : Number.NaN;

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : 0,
  };
}

/**
 * login-me는 agreedTerms가 찢어졌다면 조용히 빈 배열로 보정하지 않는다.
 * 잘못된 동의 상태를 성공으로 처리하면 이후 unlink/re-login 정책 전체가 오염된다.
 */
export function parseLoginMeResponse(data: unknown): TossLoginMeSuccessDto | null {
  const success = readSuccessPayload(data);
  if (success == null) {
    return null;
  }

  const userKey = success.userKey;
  const agreedTerms = readStringArray(success.agreedTerms);
  const email = readNullableString(success.email);

  if (typeof userKey !== 'number' || !Number.isSafeInteger(userKey) || userKey <= 0) {
    return null;
  }

  if (agreedTerms == null) {
    return null;
  }

  if (success.email != null && typeof success.email !== 'string') {
    return null;
  }

  return {
    userKey,
    agreedTerms,
    email,
  };
}

/** userKey를 DB 저장용 string으로 정규화 (JS Number 범위 이슈 방지) */
export function userKeyToString(userKey: number): string {
  return String(userKey);
}
