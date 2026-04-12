import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockDeleteUserData = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('./deleteUserData', () => ({
  deleteUserData: (...args: unknown[]) => mockDeleteUserData(...args),
}));

import { TossDisconnectError } from './errors';
import { handleTossDisconnect } from './tossDisconnectHandler';

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function mockTossAccountLookup(authUserId: string | null): void {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'toss_accounts') {
      throw new Error(`Unexpected table lookup in test: ${table}`);
    }

    return {
      select: (columns: string) => ({
        eq: (field: string, value: string) => ({
          maybeSingle: async () => {
            if (columns !== 'auth_user_id' || field !== 'toss_user_key') {
              throw new Error(`Unexpected toss_accounts query: ${columns} ${field} ${value}`);
            }

            return {
              data: authUserId == null ? null : { auth_user_id: authUserId },
              error: null,
            };
          },
        }),
      }),
    };
  });
}

describe('handleTossDisconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
    mockDeleteUserData.mockResolvedValue({
      deletedAuthUserId: 'withdraw-user-uuid',
      deletedTables: ['portfolio_history', 'portfolios'],
    });
  });

  it('UNLINK는 rpc_toss_self_unlink로 self-unlink와 동일한 정리를 수행한다', async () => {
    mockTossAccountLookup('unlink-user-uuid');

    const result = await handleTossDisconnect(
      {
        userKey: '123',
        referrer: 'UNLINK',
      },
      mockLog,
    );

    expect(mockRpc).toHaveBeenCalledWith('rpc_toss_self_unlink', {
      target_user_id: 'unlink-user-uuid',
    });
    expect(mockDeleteUserData).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'unlinked',
      authUserId: 'unlink-user-uuid',
    });
  });

  it('WITHDRAWAL_* 는 기존 deleteUserData 계약을 유지한다', async () => {
    mockTossAccountLookup('withdraw-user-uuid');

    const result = await handleTossDisconnect(
      {
        userKey: '456',
        referrer: 'WITHDRAWAL_TERMS',
      },
      mockLog,
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockDeleteUserData).toHaveBeenCalledWith('withdraw-user-uuid', mockLog);
    expect(result).toEqual({
      action: 'withdrawn',
      authUserId: 'withdraw-user-uuid',
    });
  });

  it('매핑이 없으면 noop으로 빠르게 종료한다', async () => {
    mockTossAccountLookup(null);

    const result = await handleTossDisconnect(
      {
        userKey: '789',
        referrer: 'WITHDRAWAL_TOSS',
      },
      mockLog,
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockDeleteUserData).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'noop' });
  });

  it('UNLINK RPC 실패는 삼키지 않고 TossDisconnectError로 올린다', async () => {
    mockTossAccountLookup('unlink-user-uuid');
    mockRpc.mockResolvedValue({
      error: {
        message: 'db unavailable',
      },
    });

    await expect(
      handleTossDisconnect(
        {
          userKey: '123',
          referrer: 'UNLINK',
        },
        mockLog,
      ),
    ).rejects.toBeInstanceOf(TossDisconnectError);
  });
});
