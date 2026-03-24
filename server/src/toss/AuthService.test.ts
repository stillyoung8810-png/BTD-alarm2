/**
 * Edge Case: 이미 가입된 유저가 다른 기기에서 로그인 시 프로필 중복 생성되지 않음.
 * @see docs/TOSS_LOGIN_TEST_SCENARIOS.md §1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        listUsers: (...args: unknown[]) => mockListUsers(...args),
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

function chain(impl: {
  maybeSingle?: () => Promise<{ data: { id: string } | null }>;
  update?: (values: Record<string, unknown>) => Promise<{ error: null }>;
  insert?: (values: Record<string, unknown>) => Promise<{ error: null }>;
}) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => (impl.maybeSingle ? impl.maybeSingle() : Promise.resolve({ data: null })),
      }),
    }),
    update: (values: Record<string, unknown>) => ({
      eq: () =>
        impl.update
          ? impl.update(values)
          : Promise.resolve<{ error: null }>({ error: null }),
    }),
    insert: (values: Record<string, unknown>) =>
      impl.insert
        ? impl.insert(values)
        : Promise.resolve<{ error: null }>({ error: null }),
  };
}

describe('ensureSessionForTossUserKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'toss_accounts') {
        // 이미 매핑된 auth_user_id 가 있는 상태
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve<{ data: { auth_user_id: string } | null }>({
                  data: { auth_user_id: 'existing-user-uuid' },
                }),
            }),
          }),
        };
      }
      if (table === 'user_profiles') {
        // 프로필도 이미 존재하는 상태
        return chain({
          maybeSingle: () =>
            Promise.resolve<{ data: { id: string } | null }>({
              data: { id: 'existing-user-uuid' },
            }),
          update: () =>
            Promise.resolve<{ error: null }>({
              error: null,
            }),
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
    mockCreateUser.mockReset();
    mockListUsers.mockResolvedValue({
      data: { users: [] },
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

  it('매핑 없을 때 listUsers 첫 행이 아니라 toss placeholder 이메일과 일치하는 유저만 사용한다', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'toss_accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve<{ data: { auth_user_id: string } | null }>({
                  data: null,
                }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'user_profiles') {
        return chain({
          maybeSingle: () => Promise.resolve({ data: null }),
          update: () => Promise.resolve({ error: null }),
          insert: () => Promise.resolve({ error: null }),
        });
      }
      return chain({});
    });

    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'wrong-first-user', email: 'human@example.com' },
          { id: 'correct-toss-user', email: 'toss_999@toss.placeholder' },
        ],
      },
      error: null,
    });

    mockSignIn.mockResolvedValue({
      data: {
        session: { access_token: 'at2', refresh_token: 'rt2' },
        user: { id: 'correct-toss-user', email: 'toss_999@toss.placeholder' },
      },
      error: null,
    });

    const result = await ensureSessionForTossUserKey('999', mockLog);

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('toss_accounts');
    expect(result.user.id).toBe('correct-toss-user');
  });
});