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
} from './globalAdManager';
import type { UserTier } from '@/types/userTier';
import type { InterstitialPlacementKey } from './interstitialPlacementConfig';

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
