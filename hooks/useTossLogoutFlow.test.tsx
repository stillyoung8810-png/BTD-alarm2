import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockClearAuthStorage = vi.fn();
const mockFetchJsonWithTimeout = vi.fn();
const mockShowErrorToast = vi.fn();

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
  clearAuthStorage: (...args: unknown[]) => mockClearAuthStorage(...args),
}));

vi.mock('../components/tds-adapter/showErrorToast', () => ({
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
}));

vi.mock('../utils/viteImportMetaEnv', () => ({
  readFirstTrimmedViteEnv: vi.fn(() => 'https://mock-bff.local'),
  readTrimmedViteEnv: vi.fn(() => 'https://mock-bff.local'),
}));

vi.mock('../services/serviceUtils', async () => {
  const actual =
    await vi.importActual<typeof import('../services/serviceUtils')>(
      '../services/serviceUtils',
    );

  return {
    ...actual,
    fetchJsonWithTimeout: (...args: unknown[]) =>
      mockFetchJsonWithTimeout(...args),
  };
});

import { useTossLogoutFlow } from './useTossLogoutFlow';

interface HarnessProps {
  isInTossApp: boolean;
  onResetUiState: () => void;
}

let latestHookResult: ReturnType<typeof useTossLogoutFlow> | null = null;

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function TestHarness({
  isInTossApp,
  onResetUiState,
}: HarnessProps): React.ReactElement | null {
  latestHookResult = useTossLogoutFlow({
    lang: 'ko',
    isInTossApp,
    onResetUiState,
  });

  return null;
}

describe('useTossLogoutFlow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    latestHookResult = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockSignOut.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-access-token',
        },
      },
      error: null,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('토스 self-unlink 성공 시에만 로컬 세션과 UI 상태를 정리한다', async () => {
    const onResetUiState = vi.fn();
    mockFetchJsonWithTimeout.mockResolvedValue({
      ok: true,
      data: {
        action: 'unlinked',
      },
    });

    await act(async () => {
      root.render(
        <TestHarness
          isInTossApp
          onResetUiState={onResetUiState}
        />,
      );
    });

    await act(async () => {
      await latestHookResult?.handleLogout();
    });

    expect(mockFetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://mock-bff.local/auth/toss/self-unlink',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-access-token',
        }),
      }),
      null,
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
    expect(onResetUiState).toHaveBeenCalledTimes(1);
    expect(mockShowErrorToast).not.toHaveBeenCalled();
    expect(latestHookResult?.isLogoutPending).toBe(false);
  });

  it('official_unlink_failed 이면 로컬 세션 정리 없이 경고 토스트만 띄우고 중단한다', async () => {
    const onResetUiState = vi.fn();
    mockFetchJsonWithTimeout.mockResolvedValue({
      ok: true,
      data: {
        action: 'official_unlink_failed',
      },
    });

    await act(async () => {
      root.render(
        <TestHarness
          isInTossApp
          onResetUiState={onResetUiState}
        />,
      );
    });

    await act(async () => {
      await latestHookResult?.handleLogout();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockClearAuthStorage).not.toHaveBeenCalled();
    expect(onResetUiState).not.toHaveBeenCalled();
    expect(mockShowErrorToast).toHaveBeenCalledWith(
      '토스 서버 지연으로 연결을 끊지 못했습니다. 잠시 후 다시 시도해주세요.',
    );
    expect(latestHookResult?.isLogoutPending).toBe(false);
  });

  it('일반 웹 환경에서는 self-unlink 없이 로컬 로그아웃만 수행한다', async () => {
    const onResetUiState = vi.fn();

    await act(async () => {
      root.render(
        <TestHarness
          isInTossApp={false}
          onResetUiState={onResetUiState}
        />,
      );
    });

    await act(async () => {
      await latestHookResult?.handleLogout();
    });

    expect(mockFetchJsonWithTimeout).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
    expect(onResetUiState).toHaveBeenCalledTimes(1);
  });
});
