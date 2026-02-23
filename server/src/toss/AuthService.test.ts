/**
 * Edge Case: 이미 가입된 유저가 다른 기기에서 로그인 시 프로필 중복 생성되지 않음.
 * @see docs/TOSS_LOGIN_TEST_SCENARIOS.md §1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
      },
    },
  },
}));

// vi.mock 호이스팅으로 supabaseClient 모킹 후 import
import { ensureSessionForTossUserKey } from './AuthService';

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function chain(impl: { maybeSingle?: () => Promise<{ data: { id: string } | null }> }) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => (impl.maybeSingle ? impl.maybeSingle() : Promise.resolve({ data: null })),
      }),
    }),
  };
}

describe('ensureSessionForTossUserKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return chain({
          maybeSingle: () => Promise.resolve({ data: { id: 'existing-user-uuid' } }),
        });
      }
      return chain({});
    });
    mockSignIn.mockResolvedValue({
      data: {
        session: { access_token: 'at', refresh_token: 'rt' },
        user: { id: 'existing-user-uuid', email: 'toss_123@toss.placeholder' },
      },
      error: null,
    });
  });

  it('기존 프로필이 있으면 signInWithPassword만 호출하고 createUser는 호출하지 않음', async () => {
    const result = await ensureSessionForTossUserKey('123', mockLog);

    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(result.access_token).toBe('at');
    expect(result.user.id).toBe('existing-user-uuid');
  });
});