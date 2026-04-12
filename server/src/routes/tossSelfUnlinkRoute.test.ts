import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptStoredRefreshToken } from '../toss/storedRefreshTokenCrypto';

const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockGetRefreshedTossAccessToken = vi.fn();
const mockRemoveTossAccessByUserKey = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => mockAuthGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('../toss/TossProvider', () => ({
  getRefreshedTossAccessToken: (...args: unknown[]) =>
    mockGetRefreshedTossAccessToken(...args),
  removeTossAccessByUserKey: (...args: unknown[]) =>
    mockRemoveTossAccessByUserKey(...args),
}));

import {
  SELF_UNLINK_RESPONSE,
  TOSS_SELF_UNLINK_PATH,
  tossSelfUnlinkRoute,
} from './tossSelfUnlinkRoute';

const originalRefreshTokenSecretEnv = process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET;
const ROUTE_TEST_TIMEOUT_MS = 15000;

function mockStoredLinkRecord(data: {
  toss_user_key: string;
  encrypted_refresh_token: string;
} | null): void {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'toss_auth_links') {
      throw new Error(`Unexpected table access in test: ${table}`);
    }

    return {
      select: (columns: string) => ({
        eq: (field: string, value: string) => ({
          maybeSingle: async () => {
            if (columns !== 'toss_user_key, encrypted_refresh_token' || field !== 'auth_user_id') {
              throw new Error(`Unexpected toss_auth_links query: ${columns} ${field} ${value}`);
            }

            return {
              data,
              error: null,
            };
          },
        }),
      }),
    };
  });
}

describe('tossSelfUnlinkRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET =
      '0123456789abcdef0123456789abcdef';

    mockAuthGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-uuid',
        },
      },
      error: null,
    });
    mockGetRefreshedTossAccessToken.mockResolvedValue('fresh-access-token');
    mockRemoveTossAccessByUserKey.mockResolvedValue(undefined);
    mockRpc.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (originalRefreshTokenSecretEnv == null) {
      delete process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET;
      return;
    }

    process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET =
      originalRefreshTokenSecretEnv;
  });

  it('공식 unlink와 RPC 정리가 모두 성공해야 unlinked를 반환한다', async () => {
    mockStoredLinkRecord({
      toss_user_key: '123',
      encrypted_refresh_token: encryptStoredRefreshToken('refresh-token-plain'),
    });

    const app = Fastify({ logger: false });
    await app.register(tossSelfUnlinkRoute);

    const response = await app.inject({
      method: 'POST',
      url: TOSS_SELF_UNLINK_PATH,
      headers: {
        authorization: 'Bearer valid-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      action: SELF_UNLINK_RESPONSE.UNLINKED,
    });
    expect(mockGetRefreshedTossAccessToken).toHaveBeenCalledWith(
      'refresh-token-plain',
      expect.objectContaining({
        info: expect.any(Function),
        warn: expect.any(Function),
        error: expect.any(Function),
      }),
    );
    expect(mockRemoveTossAccessByUserKey).toHaveBeenCalledWith(
      'fresh-access-token',
      '123',
      expect.objectContaining({
        info: expect.any(Function),
        warn: expect.any(Function),
        error: expect.any(Function),
      }),
    );
    expect(mockRpc).toHaveBeenCalledWith('rpc_toss_self_unlink', {
      target_user_id: 'auth-user-uuid',
    });

  }, ROUTE_TEST_TIMEOUT_MS);

  it('저장된 refresh token이 없으면 official_unlink_failed를 반환한다', async () => {
    mockStoredLinkRecord(null);

    const app = Fastify({ logger: false });
    await app.register(tossSelfUnlinkRoute);

    const response = await app.inject({
      method: 'POST',
      url: TOSS_SELF_UNLINK_PATH,
      headers: {
        authorization: 'Bearer valid-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      action: SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED,
    });
    expect(mockGetRefreshedTossAccessToken).not.toHaveBeenCalled();
    expect(mockRemoveTossAccessByUserKey).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();

  }, ROUTE_TEST_TIMEOUT_MS);

  it('공식 unlink 호출이 실패하면 성공으로 위장하지 않고 official_unlink_failed를 반환한다', async () => {
    mockStoredLinkRecord({
      toss_user_key: '123',
      encrypted_refresh_token: encryptStoredRefreshToken('refresh-token-plain'),
    });
    mockGetRefreshedTossAccessToken.mockRejectedValue(
      new Error('toss refresh failed'),
    );

    const app = Fastify({ logger: false });
    await app.register(tossSelfUnlinkRoute);

    const response = await app.inject({
      method: 'POST',
      url: TOSS_SELF_UNLINK_PATH,
      headers: {
        authorization: 'Bearer valid-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      action: SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED,
    });
    expect(mockRpc).not.toHaveBeenCalled();

  }, ROUTE_TEST_TIMEOUT_MS);
});
