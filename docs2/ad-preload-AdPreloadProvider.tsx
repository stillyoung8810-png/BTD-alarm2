/**
 * Ad preload — React 연동 스니펫 (계획서 §3.1)
 *
 * Rule 2·10: useSyncExternalStore의 subscribe(및 getSnapshot)는 **인라인 함수 금지** — `useCallback(..., [manager])`로 참조 안정화.
 * Rule 6: 구독 티어는 **`manager.setCurrentTier(userTier)`** 로 매니저 SSOT에 동기화 — `showInstant`·드레인·재시도에 tier 인자를 넘기지 않는다(stale closure·드레인 루프 레이스 방지).
 * Rule 10: 배열 캐시는 매니저 내부 책임; 스냅샷만 Context로 노출.
 * Rule 11(React 보강): `isExecutingRef` 전역 one-flight·`Promise.resolve(showInstant)` 블록은 변경 금지.
 *
 * `useLayoutEffect`에서 ref + 매니저 티어를 함께 갱신해 페인트 전에 React 상태와 매니저 `currentTier`가 일치하게 한다.
 *
 * 운영: `manager`는 앱 최상단 싱글턴 1회 생성 시 **`initialTier`** 를 부트스트랩 티어와 맞출 것. 이후 티어는 본 Provider가 `setCurrentTier`로만 맞춘다.
 * 파기: `GlobalAdManager.tearDownForAppRoot(manager)` — 루트에서만.
 * 마이그레이션: 레거시 `loadAppsInTossAdMob` 경로 제거 후 본 Provider·`showInstantAd`만 사용(§7).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  GlobalAdManager,
  type AdSlotSnapshot,
  type InterstitialPlacementKey,
  type UserTier,
} from './ad-preload-simulation-snippets';

export interface AdPreloadContextValue {
  snapshots: ReadonlyArray<AdSlotSnapshot>;
  showInstantAd: (key: InterstitialPlacementKey) => Promise<boolean>;
}

const AdPreloadContext = createContext<AdPreloadContextValue | null>(null);

export interface AdPreloadProviderProps {
  children: React.ReactNode;
  manager: GlobalAdManager;
  userTier: UserTier;
}

export function AdPreloadProvider({
  children,
  manager,
  userTier,
}: AdPreloadProviderProps): React.ReactElement {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      manager.subscribe(() => {
        onStoreChange();
      }),
    [manager],
  );

  const getStoreSnapshot = useCallback(() => manager.getSnapshots(), [manager]);

  const snapshots = useSyncExternalStore(
    subscribe,
    getStoreSnapshot,
    getStoreSnapshot,
  );

  const isExecutingRef = useRef<boolean>(false);

  useLayoutEffect(() => {
    manager.setCurrentTier(userTier);
  }, [userTier, manager]);

  const showInstantAd = useCallback(
    async (key: InterstitialPlacementKey): Promise<boolean> => {
      if (isExecutingRef.current) {
        return false;
      }
      isExecutingRef.current = true;

      try {
        const result = await Promise.resolve(manager.showInstant(key));
        return result.shown;
      } catch (error: unknown) {
        console.error('[AdPreloadProvider] showInstantAd failed:', error);
        return false;
      } finally {
        isExecutingRef.current = false;
      }
    },
    [manager],
  );

  const contextValue = useMemo<AdPreloadContextValue>(
    () => ({
      snapshots,
      showInstantAd,
    }),
    [snapshots, showInstantAd],
  );

  return (
    <AdPreloadContext.Provider value={contextValue}>
      {children}
    </AdPreloadContext.Provider>
  );
}

export function useAdPreload(): AdPreloadContextValue {
  const context = useContext(AdPreloadContext);
  if (context == null) {
    throw new Error('useAdPreload must be used within an AdPreloadProvider');
  }
  return context;
}
