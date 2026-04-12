/**
 * 파서 SSOT 회귀 방지.
 * login-me 계약이 깨졌을 때 조용히 보정하지 않고 fail-closed 되는지 검증한다.
 */

import { describe, expect, it } from 'vitest';
import { parseLoginMeResponse, parseTokenResponse, userKeyToString } from './responseParsers';

describe('userKeyToString', () => {
  it('1 → "1"', () => {
    expect(userKeyToString(1)).toBe('1');
  });

  it('Number.MAX_SAFE_INTEGER → 정확한 문자열', () => {
    expect(userKeyToString(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991');
  });

  it('일반 큰 숫자(10자리) → 동일 문자열', () => {
    expect(userKeyToString(1234567890)).toBe('1234567890');
  });
});

describe('parseLoginMeResponse', () => {
  it('성공 payload에서 userKey, agreedTerms, email을 정규화해 추출한다', () => {
    const parsed = parseLoginMeResponse({
      resultType: 'SUCCESS',
      success: {
        userKey: Number.MAX_SAFE_INTEGER,
        agreedTerms: ['  service.required ', 'privacy.required  '],
        email: '  encrypted@example.com  ',
      },
    });

    expect(parsed).not.toBeNull();
    if (parsed == null) {
      throw new Error('parsed login-me payload should not be null');
    }

    expect(parsed).toEqual({
      userKey: Number.MAX_SAFE_INTEGER,
      agreedTerms: ['service.required', 'privacy.required'],
      email: 'encrypted@example.com',
    });
    expect(userKeyToString(parsed.userKey)).toBe('9007199254740991');
  });

  it('email이 null이어도 성공으로 처리한다', () => {
    const parsed = parseLoginMeResponse({
      resultType: 'SUCCESS',
      success: {
        userKey: 123456,
        agreedTerms: ['service.required'],
        email: null,
      },
    });

    expect(parsed).toEqual({
      userKey: 123456,
      agreedTerms: ['service.required'],
      email: null,
    });
  });

  it('resultType이 SUCCESS가 아니면 null을 반환한다', () => {
    expect(
      parseLoginMeResponse({
        resultType: 'FAIL',
        success: {
          userKey: 1,
          agreedTerms: ['service.required'],
          email: null,
        },
      }),
    ).toBeNull();
  });

  it('agreedTerms가 배열이 아니면 null을 반환한다', () => {
    expect(
      parseLoginMeResponse({
        resultType: 'SUCCESS',
        success: {
          userKey: 123,
          agreedTerms: 'service.required',
          email: null,
        },
      }),
    ).toBeNull();
  });

  it('agreedTerms 내부 값이 문자열이 아니면 null을 반환한다', () => {
    expect(
      parseLoginMeResponse({
        resultType: 'SUCCESS',
        success: {
          userKey: 123,
          agreedTerms: ['service.required', 42],
          email: null,
        },
      }),
    ).toBeNull();
  });

  it('userKey가 양의 safe integer가 아니면 null을 반환한다', () => {
    expect(
      parseLoginMeResponse({
        resultType: 'SUCCESS',
        success: {
          userKey: 0,
          agreedTerms: ['service.required'],
          email: null,
        },
      }),
    ).toBeNull();

    expect(
      parseLoginMeResponse({
        resultType: 'SUCCESS',
        success: {
          userKey: Number.MAX_SAFE_INTEGER + 1,
          agreedTerms: ['service.required'],
          email: null,
        },
      }),
    ).toBeNull();
  });

  it('email 타입이 잘못되면 null을 반환한다', () => {
    expect(
      parseLoginMeResponse({
        resultType: 'SUCCESS',
        success: {
          userKey: 123,
          agreedTerms: ['service.required'],
          email: { cipher: 'abc' },
        },
      }),
    ).toBeNull();
  });
});

describe('parseTokenResponse', () => {
  it('필수 필드만 있으면 성공한다', () => {
    const parsed = parseTokenResponse({
      resultType: 'SUCCESS',
      success: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
      },
    });

    expect(parsed).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
    });
  });

  it('expiresIn이 문자열이어도 number로 정규화한다', () => {
    const parsed = parseTokenResponse({
      resultType: 'SUCCESS',
      success: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: '7200',
      },
    });

    expect(parsed).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 7200,
    });
  });

  it('잘못된 형태면 null을 반환한다', () => {
    expect(parseTokenResponse(null)).toBeNull();
    expect(parseTokenResponse({})).toBeNull();
    expect(parseTokenResponse({ resultType: 'SUCCESS', success: null })).toBeNull();
  });
});
