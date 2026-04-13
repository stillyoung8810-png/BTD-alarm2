/**
 * AuthService 회귀 방지.
 * userKey 중심 매핑, 약관 검증, refresh token 저장, managed 계정 세션 발급 흐름을 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();
const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        listUsers: (...args: unknown[]) => mockListUsers(...args),
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
        updateUserById: (...args: unknown[]) => mockUpdateUserById(...args),
      },
    },
  },
}));

import { ensureSessionForTossUserKey, finalizeTossLoginExchange } from './AuthService';

interface MockProfileRow {
  id: string;
  toss_user_key: string | null;
}

interface MockAuthUserState {
  user_metadata: Record<string, unknown>;
}

interface MockFilter {
  operator: 'eq' | 'neq';
  field: string;
  value: string;
}

interface MockUpsertCall {
  table: string;
  values: Record<string, unknown>;
  options?: { onConflict?: string };
}

interface MockMutationCall {
  table: string;
  values?: Record<string, unknown>;
  filters: MockFilter[];
}

interface MockTossAuthLinkRow {
  auth_user_id: string;
  toss_user_key: string;
  encrypted_refresh_token: string;
}

interface MockState {
  tossAccountsByKey: Record<string, { auth_user_id: string }>;
  tossAuthLinksRows: MockTossAuthLinkRow[];
  userProfilesById: Record<string, MockProfileRow>;
  authUsersById: Record<string, MockAuthUserState>;
  upserts: MockUpsertCall[];
  updates: MockMutationCall[];
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  deletes: MockMutationCall[];
}

const originalTermsEnv = process.env.TOSS_REQUIRED_TERMS_TAGS;
const originalRefreshTokenSecretEnv = process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET;
const originalLoginSecretEnv = process.env.TOSS_LOGIN_USER_SECRET;

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

let state: MockState;

function createMockState(): MockState {
  return {
    tossAccountsByKey: {},
    tossAuthLinksRows: [],
    userProfilesById: {},
    authUsersById: {},
    upserts: [],
    updates: [],
    inserts: [],
    deletes: [],
  };
}

function findProfileByTossUserKey(tossUserKey: string): MockProfileRow | null {
  const matchedProfile = Object.values(state.userProfilesById).find(
    (profile) => profile.toss_user_key === tossUserKey,
  );

  return matchedProfile ?? null;
}

function applyProfileUpdate(authUserId: string, values: Record<string, unknown>): void {
  const currentProfile = state.userProfilesById[authUserId] ?? {
    id: authUserId,
    toss_user_key: null,
  };

  const nextTossUserKey =
    'toss_user_key' in values
      ? typeof values.toss_user_key === 'string'
        ? values.toss_user_key
        : null
      : currentProfile.toss_user_key;

  state.userProfilesById[authUserId] = {
    id: authUserId,
    toss_user_key: nextTossUserKey,
  };
}

function createTossAccountsTableMock() {
  return {
    select: (columns: string) => ({
      eq: (field: string, value: string) => ({
        maybeSingle: async () => {
          if (columns !== 'auth_user_id' || field !== 'toss_user_key') {
            throw new Error(`Unexpected toss_accounts select chain: ${columns} ${field}`);
          }

          return {
            data: state.tossAccountsByKey[value] ?? null,
            error: null,
          };
        },
      }),
    }),
    delete: () => ({
      eq: (field: string, value: string) => ({
        neq: async (neqField: string, neqValue: string) => {
          state.deletes.push({
            table: 'toss_accounts',
            filters: [
              { operator: 'eq', field, value },
              { operator: 'neq', field: neqField, value: neqValue },
            ],
          });

          return { error: null };
        },
      }),
    }),
    upsert: async (values: Record<string, unknown>, options?: { onConflict?: string }) => {
      state.upserts.push({
        table: 'toss_accounts',
        values,
        options,
      });

      const tossUserKey = values.toss_user_key;
      const authUserId = values.auth_user_id;
      if (typeof tossUserKey === 'string' && typeof authUserId === 'string') {
        state.tossAccountsByKey[tossUserKey] = { auth_user_id: authUserId };
      }

      return { error: null };
    },
  };
}

function createTossAuthLinksTableMock() {
  return {
    select: (columns: string) => ({
      eq: (field: string, value: string) => ({
        maybeSingle: async () => {
          if (columns !== 'toss_user_key, encrypted_refresh_token') {
            throw new Error(`Unexpected toss_auth_links select columns: ${columns}`);
          }

          if (field === 'auth_user_id') {
            const row = state.tossAuthLinksRows.find((entry) => entry.auth_user_id === value);
            return {
              data:
                row == null
                  ? null
                  : {
                      toss_user_key: row.toss_user_key,
                      encrypted_refresh_token: row.encrypted_refresh_token,
                    },
              error: null,
            };
          }

          if (field === 'toss_user_key') {
            const row = state.tossAuthLinksRows.find((entry) => entry.toss_user_key === value);
            return {
              data:
                row == null
                  ? null
                  : {
                      toss_user_key: row.toss_user_key,
                      encrypted_refresh_token: row.encrypted_refresh_token,
                    },
              error: null,
            };
          }

          throw new Error(`Unexpected toss_auth_links select field: ${field}`);
        },
      }),
    }),
    delete: () => ({
      eq: async (field: string, value: string) => {
        state.deletes.push({
          table: 'toss_auth_links',
          filters: [{ operator: 'eq', field, value }],
        });

        if (field === 'auth_user_id') {
          state.tossAuthLinksRows = state.tossAuthLinksRows.filter((row) => row.auth_user_id !== value);
        } else if (field === 'toss_user_key') {
          state.tossAuthLinksRows = state.tossAuthLinksRows.filter((row) => row.toss_user_key !== value);
        }

        return { error: null };
      },
    }),
    insert: async (values: Record<string, unknown>) => {
      state.inserts.push({
        table: 'toss_auth_links',
        values,
      });

      const authUserId = values.auth_user_id;
      const tossUserKey = values.toss_user_key;
      const encryptedRefreshToken = values.encrypted_refresh_token;
      if (
        typeof authUserId === 'string' &&
        typeof tossUserKey === 'string' &&
        typeof encryptedRefreshToken === 'string'
      ) {
        state.tossAuthLinksRows = state.tossAuthLinksRows.filter(
          (row) => row.auth_user_id !== authUserId && row.toss_user_key !== tossUserKey,
        );
        state.tossAuthLinksRows.push({
          auth_user_id: authUserId,
          toss_user_key: tossUserKey,
          encrypted_refresh_token: encryptedRefreshToken,
        });
      }

      return { error: null };
    },
  };
}

function createUserProfilesTableMock() {
  return {
    select: (columns: string) => ({
      eq: (field: string, value: string) => ({
        maybeSingle: async () => {
          if (field === 'toss_user_key' && columns === 'id') {
            const matchedProfile = findProfileByTossUserKey(value);
            return {
              data: matchedProfile == null ? null : { id: matchedProfile.id },
              error: null,
            };
          }

          if (field === 'id' && columns === 'id, toss_user_key') {
            const profile = state.userProfilesById[value];
            return {
              data:
                profile == null
                  ? null
                  : {
                      id: profile.id,
                      toss_user_key: profile.toss_user_key,
                    },
              error: null,
            };
          }

          if (field === 'id' && columns === 'toss_user_key') {
            const profile = state.userProfilesById[value];
            return {
              data:
                profile == null
                  ? null
                  : {
                      toss_user_key: profile.toss_user_key,
                    },
              error: null,
            };
          }

          throw new Error(`Unexpected user_profiles select chain: ${columns} ${field}`);
        },
      }),
    }),
    update: (values: Record<string, unknown>) => ({
      eq: (field: string, value: string) => {
        if (field === 'id') {
          state.updates.push({
            table: 'user_profiles',
            values,
            filters: [{ operator: 'eq', field, value }],
          });

          applyProfileUpdate(value, values);
          return Promise.resolve({ error: null });
        }

        return {
          neq: async (neqField: string, neqValue: string) => {
            state.updates.push({
              table: 'user_profiles',
              values,
              filters: [
                { operator: 'eq', field, value },
                { operator: 'neq', field: neqField, value: neqValue },
              ],
            });

            if (field === 'toss_user_key' && values.toss_user_key === null) {
              Object.values(state.userProfilesById).forEach((profile) => {
                if (profile.id !== neqValue && profile.toss_user_key === value) {
                  profile.toss_user_key = null;
                }
              });
            }

            return { error: null };
          },
        };
      },
    }),
    insert: async (values: Record<string, unknown>) => {
      state.inserts.push({
        table: 'user_profiles',
        values,
      });

      const authUserId = values.id;
      if (typeof authUserId !== 'string') {
        throw new Error('user_profiles insert requires string id');
      }

      applyProfileUpdate(authUserId, values);
      return { error: null };
    },
  };
}

function createFromMock(table: string): unknown {
  switch (table) {
    case 'toss_accounts':
      return createTossAccountsTableMock();
    case 'toss_auth_links':
      return createTossAuthLinksTableMock();
    case 'user_profiles':
      return createUserProfilesTableMock();
    default:
      throw new Error(`Unexpected table mock requested: ${table}`);
  }
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.TOSS_REQUIRED_TERMS_TAGS = 'service.required,privacy.required';
    process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';
    process.env.TOSS_LOGIN_USER_SECRET = 'unit-test-managed-login-secret';

    state = createMockState();
    mockFrom.mockImplementation((table: string) => createFromMock(table));

    mockCreateUser.mockImplementation(async (payload: { user_metadata?: Record<string, unknown> }) => {
      const createdUserId = 'created-user-uuid';
      state.authUsersById[createdUserId] = {
        user_metadata: payload.user_metadata ?? {},
      };

      return {
        data: {
          user: {
            id: createdUserId,
          },
        },
        error: null,
      };
    });

    mockListUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });

    mockGetUserById.mockImplementation(async (authUserId: string) => ({
      data: {
        user: {
          user_metadata: state.authUsersById[authUserId]?.user_metadata ?? {},
        },
      },
      error: null,
    }));

    mockUpdateUserById.mockImplementation(
      async (authUserId: string, payload: { user_metadata?: Record<string, unknown> }) => {
        state.authUsersById[authUserId] = {
          user_metadata: payload.user_metadata ?? {},
        };

        return {
          data: {
            user: {
              id: authUserId,
            },
          },
          error: null,
        };
      },
    );

    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
        user: {
          id: 'default-user-uuid',
          email: 'toss_default@toss.placeholder',
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    if (originalTermsEnv == null) {
      delete process.env.TOSS_REQUIRED_TERMS_TAGS;
    } else {
      process.env.TOSS_REQUIRED_TERMS_TAGS = originalTermsEnv;
    }

    if (originalRefreshTokenSecretEnv == null) {
      delete process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET;
    } else {
      process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET = originalRefreshTokenSecretEnv;
    }

    if (originalLoginSecretEnv == null) {
      delete process.env.TOSS_LOGIN_USER_SECRET;
    } else {
      process.env.TOSS_LOGIN_USER_SECRET = originalLoginSecretEnv;
    }
  });

  describe('finalizeTossLoginExchange', () => {
    it('약관 검증 후 refresh token을 저장하고 기존 userKey 매핑으로 세션을 발급한다', async () => {
      state.tossAccountsByKey['123'] = { auth_user_id: 'existing-user-uuid' };
      state.userProfilesById['existing-user-uuid'] = {
        id: 'existing-user-uuid',
        toss_user_key: '123',
      };
      state.authUsersById['existing-user-uuid'] = {
        user_metadata: { existing: true },
      };

      mockSignIn.mockResolvedValue({
        data: {
          session: {
            access_token: 'at',
            refresh_token: 'rt',
          },
          user: {
            id: 'existing-user-uuid',
            email: 'toss_123@toss.placeholder',
          },
        },
        error: null,
      });

      const result = await finalizeTossLoginExchange(
        '123',
        'encrypted@example.com',
        ['service.required', 'privacy.required'],
        'refresh-token-plain',
        mockLog,
      );

      expect(result).toEqual({
        access_token: 'at',
        refresh_token: 'rt',
        user: {
          id: 'existing-user-uuid',
          email: 'toss_123@toss.placeholder',
        },
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockGetUserById).toHaveBeenCalledWith('existing-user-uuid');
      expect(mockUpdateUserById).toHaveBeenCalledTimes(1);

      const refreshLinkInsert = state.inserts.find((entry) => entry.table === 'toss_auth_links');
      expect(refreshLinkInsert).toBeDefined();
      if (refreshLinkInsert == null) {
        throw new Error('refresh token insert should exist');
      }

      expect(refreshLinkInsert.values.auth_user_id).toBe('existing-user-uuid');
      expect(refreshLinkInsert.values.toss_user_key).toBe('123');
      expect(typeof refreshLinkInsert.values.encrypted_refresh_token).toBe('string');
      expect(refreshLinkInsert.values.encrypted_refresh_token).not.toBe('refresh-token-plain');

      const linkDeletes = state.deletes.filter((entry) => entry.table === 'toss_auth_links');
      expect(linkDeletes.length).toBeGreaterThanOrEqual(2);
      expect(linkDeletes.some((d) => d.filters.some((f) => f.field === 'auth_user_id'))).toBe(true);
      expect(linkDeletes.some((d) => d.filters.some((f) => f.field === 'toss_user_key'))).toBe(true);

      const metadata = state.authUsersById['existing-user-uuid']?.user_metadata ?? {};
      expect(metadata.toss_user_key).toBe('123');
      expect(metadata.toss_email_encrypted).toBe('encrypted@example.com');
    });

    it('필수 약관이 하나라도 없으면 DB 작업 전에 fail-closed 한다', async () => {
      await expect(
        finalizeTossLoginExchange(
          '123',
          null,
          ['service.required'],
          'refresh-token-plain',
          mockLog,
        ),
      ).rejects.toThrow('Required Toss terms are missing from login-me response');

      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockSignIn).not.toHaveBeenCalled();
    });
  });

  describe('ensureSessionForTossUserKey', () => {
    it('기존 매핑이 있으면 createUser 없이 managed 계정으로 세션을 발급한다', async () => {
      state.tossAccountsByKey['123'] = { auth_user_id: 'existing-user-uuid' };
      state.userProfilesById['existing-user-uuid'] = {
        id: 'existing-user-uuid',
        toss_user_key: '123',
      };
      state.authUsersById['existing-user-uuid'] = {
        user_metadata: {},
      };

      mockSignIn.mockResolvedValue({
        data: {
          session: {
            access_token: 'at',
            refresh_token: 'rt',
          },
          user: {
            id: 'existing-user-uuid',
            email: 'toss_123@toss.placeholder',
          },
        },
        error: null,
      });

      const result = await ensureSessionForTossUserKey('123', mockLog);

      expect(result.access_token).toBe('at');
      expect(result.user.id).toBe('existing-user-uuid');
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockListUsers).not.toHaveBeenCalled();
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'toss_123@toss.placeholder',
        password: expect.any(String),
      });

      const tossAccountUpsert = state.upserts.find((entry) => entry.table === 'toss_accounts');
      expect(tossAccountUpsert).toBeDefined();
    });

    it('managed 이메일 unique 충돌이면 listUsers에서 정확히 일치하는 계정만 골라서 재사용한다', async () => {
      state.authUsersById['correct-toss-user'] = {
        user_metadata: { provider: 'toss' },
      };

      mockCreateUser.mockResolvedValue({
        data: { user: null },
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
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
          session: {
            access_token: 'at2',
            refresh_token: 'rt2',
          },
          user: {
            id: 'correct-toss-user',
            email: 'toss_999@toss.placeholder',
          },
        },
        error: null,
      });

      const result = await ensureSessionForTossUserKey('999', mockLog);

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(mockListUsers).toHaveBeenCalledTimes(1);
      expect(result.user.id).toBe('correct-toss-user');
      expect(state.userProfilesById['correct-toss-user']).toEqual({
        id: 'correct-toss-user',
        toss_user_key: '999',
      });
    });
  });
});