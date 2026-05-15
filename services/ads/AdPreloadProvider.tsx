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

const INSTANT_AD_NOT_READY_RETRY_DELAYS_MS = [400, 900, 1_400] as const;

function waitForInstantAdRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

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
        let result = await Promise.resolve(manager.showInstant(key));
        for (const delayMs of INSTANT_AD_NOT_READY_RETRY_DELAYS_MS) {
          if (result.shown || result.code !== 'skipped_not_ready') {
            return result.shown;
          }

          await waitForInstantAdRetry(delayMs);
          result = await Promise.resolve(manager.showInstant(key));
        }

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
