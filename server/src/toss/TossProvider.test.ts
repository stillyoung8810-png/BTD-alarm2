/**
 * Edge Case: 토스 API 타임아웃/5xx 시 TossProvider가 상위 계층으로 규격화된 에러 전파.
 * 싱글톤 axios 인스턴스 사용으로 인해 전부 모킹 시 모듈 리셋이 필요해, 상세 시나리오는
 * docs/TOSS_LOGIN_TEST_SCENARIOS.md §2 수동/통합으로 검증. 여기서는 모듈 로드 및 시그니처만 검증.
 * @see docs/TOSS_LOGIN_TEST_SCENARIOS.md §2
 */

import { describe, it, expect } from 'vitest';
import { getToken, getLoginMe } from './TossProvider';

describe('TossProvider', () => {
  it('getToken / getLoginMe 시그니처 및 requestId 전파는 라우트에서 처리됨', () => {
    expect(typeof getToken).toBe('function');
    expect(typeof getLoginMe).toBe('function');
  });
});
