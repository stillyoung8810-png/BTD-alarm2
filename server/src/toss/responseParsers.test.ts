/**
 * Edge Case: userKey가 매우 큰 숫자로 들어올 때 DB 저장용 문자열로 정확히 변환되는지 검증.
 * @see docs/TOSS_LOGIN_TEST_SCENARIOS.md §3
 */

import { describe, it, expect } from 'vitest';
import {
  userKeyToString,
  parseLoginMeResponse,
  parseTokenResponse,
} from './responseParsers';

describe('userKeyToString', () => {
  it('0 → "0"', () => {
    expect(userKeyToString(0)).toBe('0');
  });

  it('1 → "1"', () => {
    expect(userKeyToString(1)).toBe('1');
  });

  it('Number.MAX_SAFE_INTEGER → 정확한 문자열', () => {
    expect(userKeyToString(Number.MAX_SAFE_INTEGER)).toBe(
      '9007199254740991'
    );
  });

  it('일반 큰 숫자(10자리) → 동일 문자열', () => {
    const n = 1234567890;
    expect(userKeyToString(n)).toBe('1234567890');
  });
});

describe('parseLoginMeResponse', () => {
  it('userKey가 number일 때 추출 후 string 변환 가능', () => {
    const data = {
      resultType: 'SUCCESS',
      success: { userKey: Number.MAX_SAFE_INTEGER },
    };
    const parsed = parseLoginMeResponse(data);
    expect(parsed).not.toBeNull();
    expect(parsed!.userKey).toBe(Number.MAX_SAFE_INTEGER);
    expect(userKeyToString(parsed!.userKey)).toBe('9007199254740991');
  });

  it('resultType이 SUCCESS가 아니면 null', () => {
    expect(parseLoginMeResponse({ resultType: 'FAIL', success: { userKey: 1 } })).toBeNull();
  });

  it('userKey가 없거나 number가 아니면 null', () => {
    expect(parseLoginMeResponse({ resultType: 'SUCCESS', success: {} })).toBeNull();
    expect(parseLoginMeResponse({ resultType: 'SUCCESS', success: { userKey: '123' } })).toBeNull();
  });
});

describe('parseTokenResponse', () => {
  it('필수 필드만 있으면 성공', () => {
    const data = {
      resultType: 'SUCCESS',
      success: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
      },
    };
    const parsed = parseTokenResponse(data);
    expect(parsed).not.toBeNull();
    expect(parsed!.accessToken).toBe('at');
    expect(parsed!.refreshToken).toBe('rt');
    expect(parsed!.expiresIn).toBe(3600);
  });

  it('잘못된 형태면 null', () => {
    expect(parseTokenResponse(null)).toBeNull();
    expect(parseTokenResponse({})).toBeNull();
    expect(parseTokenResponse({ resultType: 'SUCCESS', success: null })).toBeNull();
  });
});
