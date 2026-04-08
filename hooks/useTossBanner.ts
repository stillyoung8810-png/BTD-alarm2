import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attachTossAdsBanner,
  getTossAdsBridgeCandidate,
  getTossAdsGlobalInitialized,
  isTossAdsInitializeSupported,
  subscribeTossAdsInitialization,
  type TossAdsAttachBannerOptions,
  type TossAdsAttachBannerResult,
} from '../services/tossBannerService';

export type {
  TossAdsAttachBannerOptions,
  TossAdsAttachBannerResult,
  TossAdsBannerCallbackPayload,
} from '../services/tossBannerService';

export interface UseTossBannerResult {
  isSupported: boolean;
  isInitialized: boolean;
  attachBanner: (
    adGroupId: string,
    element: HTMLElement,
    options?: TossAdsAttachBannerOptions,
  ) => TossAdsAttachBannerResult | undefined;
}

export function useTossBanner(): UseTossBannerResult {
  const bridge = useMemo(() => getTossAdsBridgeCandidate(), []);

  const isSupported = useMemo(
    () => (bridge != null ? isTossAdsInitializeSupported(bridge) : false),
    [bridge],
  );

  const [isInitialized, setIsInitialized] = useState<boolean>(
    () => getTossAdsGlobalInitialized(),
  );

  useEffect(() => {
    if (!isSupported || bridge == null) {
      return;
    }

    if (getTossAdsGlobalInitialized()) {
      setIsInitialized(true);
      return;
    }

    let cancelled = false;

    subscribeTossAdsInitialization(bridge, {
      onInitialized: () => {
        if (!cancelled) {
          setIsInitialized(true);
        }
      },
      onInitializationFailed: () => {
        if (!cancelled) {
          setIsInitialized(false);
        }
      },
    });

    return () => {
      cancelled = true;
    };
  }, [isSupported, bridge]);

  const attachBanner = useCallback(
    (
      adGroupId: string,
      element: HTMLElement,
      options?: TossAdsAttachBannerOptions,
    ): TossAdsAttachBannerResult | undefined => {
      if (!isSupported || !isInitialized || bridge == null) {
        return undefined;
      }

      return attachTossAdsBanner(bridge, adGroupId, element, options);
    },
    [isSupported, isInitialized, bridge],
  );

  return { isSupported, isInitialized, attachBanner };
}
