import { useCallback, useEffect, useMemo, useState } from 'react';
import { TossAds as importedTossAds } from '@apps-in-toss/web-framework';

export interface TossAdsBannerCallbackPayload {
  reason?: string;
  message?: string;
}

export interface TossAdsAttachBannerOptions {
  theme?: 'auto' | 'light' | 'dark';
  tone?: 'blackAndWhite' | 'grey';
  variant?: 'card' | 'expanded';
  callbacks?: {
    onNoFill?: (payload?: TossAdsBannerCallbackPayload) => void;
    onAdFailedToRender?: (
      payload?: TossAdsBannerCallbackPayload,
    ) => void;
  };
}

export interface TossAdsAttachBannerResult {
  destroy: () => void;
}

export interface UseTossBannerResult {
  isSupported: boolean;
  isInitialized: boolean;
  attachBanner: (
    adGroupId: string,
    element: HTMLElement,
    options?: TossAdsAttachBannerOptions,
  ) => TossAdsAttachBannerResult | undefined;
}

interface TossAdsInitializeParams {
  callbacks: {
    onInitialized: () => void;
    onInitializationFailed: (error: unknown) => void;
  };
}

interface TossAdsInitializeMethod {
  (params: TossAdsInitializeParams): void;
  isSupported?: () => boolean;
}

interface TossAdsAttachBannerMethod {
  (
    adGroupId: string,
    element: HTMLElement,
    options?: TossAdsAttachBannerOptions,
  ): TossAdsAttachBannerResult;
  isSupported?: () => boolean;
}

interface TossAdsBridge {
  initialize: TossAdsInitializeMethod;
  attachBanner?: TossAdsAttachBannerMethod;
}

type GlobalWithOptionalTossAds = typeof globalThis & {
  TossAds?: unknown;
};

type WindowWithOptionalTossAds = Window & {
  TossAds?: unknown;
};

let isTossAdsInitialized = false;
let isTossAdsInitializing = false;

function resolveTossAdsBridge(candidate: unknown): TossAdsBridge | null {
  const candidateType = typeof candidate;
  if (
    candidate == null ||
    (candidateType !== 'object' && candidateType !== 'function')
  ) {
    return null;
  }

  const bridge = candidate as Partial<TossAdsBridge>;
  if (typeof bridge.initialize !== 'function') {
    return null;
  }

  if (
    bridge.attachBanner != null &&
    typeof bridge.attachBanner !== 'function'
  ) {
    return null;
  }

  return bridge as TossAdsBridge;
}

function getWindowTossAdsCandidate(): unknown {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const windowObject = window as WindowWithOptionalTossAds;
  return windowObject.TossAds;
}

function getGlobalTossAdsCandidate(): unknown {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  return (globalThis as GlobalWithOptionalTossAds).TossAds;
}

function getTossAdsBridgeCandidate(): TossAdsBridge | null {
  const candidates: readonly unknown[] = [
    importedTossAds as unknown,
    getWindowTossAdsCandidate(),
    getGlobalTossAdsCandidate(),
  ];

  for (const candidate of candidates) {
    const bridge = resolveTossAdsBridge(candidate);
    if (bridge != null) {
      return bridge;
    }
  }

  return null;
}

export function useTossBanner(): UseTossBannerResult {
  const tossAdsBridge = useMemo(() => getTossAdsBridgeCandidate(), []);

  const isSupported = useMemo(() => {
    try {
      return tossAdsBridge?.initialize.isSupported?.() ?? false;
    } catch {
      return false;
    }
  }, [tossAdsBridge]);

  const [isInitialized, setIsInitialized] = useState<boolean>(
    isTossAdsInitialized,
  );

  useEffect(() => {
    if (!isSupported || tossAdsBridge == null) return;
    if (isTossAdsInitialized) {
      if (!isInitialized) setIsInitialized(true);
      return;
    }
    if (isTossAdsInitializing) return;

    let cancelled = false;
    isTossAdsInitializing = true;

    try {
      tossAdsBridge.initialize({
        callbacks: {
          onInitialized: () => {
            isTossAdsInitialized = true;
            isTossAdsInitializing = false;
            if (!cancelled) setIsInitialized(true);
          },
          onInitializationFailed: (error) => {
            console.error('Toss Ads SDK initialization failed:', error);
            isTossAdsInitializing = false;
            if (!cancelled) setIsInitialized(false);
          },
        },
      });
    } catch (error) {
      console.error('Toss Ads SDK initialize threw:', error);
      isTossAdsInitializing = false;
      if (!cancelled) setIsInitialized(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isSupported, isInitialized, tossAdsBridge]);

  const attachBanner = useCallback(
    (
      adGroupId: string,
      element: HTMLElement,
      options?: TossAdsAttachBannerOptions,
    ): TossAdsAttachBannerResult | undefined => {
      if (
        !isSupported ||
        !isTossAdsInitialized ||
        !isInitialized ||
        !element ||
        tossAdsBridge == null
      ) {
        return undefined;
      }

      try {
        if (typeof tossAdsBridge.attachBanner !== 'function') {
          return undefined;
        }

        if (
          typeof tossAdsBridge.attachBanner.isSupported === 'function' &&
          !tossAdsBridge.attachBanner.isSupported()
        ) {
          return undefined;
        }

        return tossAdsBridge.attachBanner(adGroupId, element, options);
      } catch (error) {
        console.error('Toss Ads attachBanner failed:', error);
        return undefined;
      }
    },
    [isSupported, isInitialized, tossAdsBridge],
  );

  return { isSupported, isInitialized, attachBanner };
}