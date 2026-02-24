import { useCallback, useEffect, useState } from 'react';
// 🚨 주의: 에러를 내던 타입 임포트를 지우고 TossAds 본체만 가져옵니다!
import { TossAds } from '@apps-in-toss/web-framework';

// 우리가 직접 안전하게 정의하는 타입들
export interface TossAdsAttachBannerOptions {
  theme?: 'auto' | 'light' | 'dark';
  tone?: 'blackAndWhite' | 'grey';
  variant?: 'card' | 'expanded';
  callbacks?: {
    onNoFill?: (payload?: any) => void;
    onAdFailedToRender?: (payload?: any) => void;
    [key: string]: any;
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

let isTossAdsInitialized = false;
let isTossAdsInitializing = false;

export function useTossBanner(): UseTossBannerResult {
  const [isSupported] = useState<boolean>(() => {
    try {
      const tossAdsAny = TossAds as any;
      return typeof tossAdsAny !== 'undefined' && typeof tossAdsAny.initialize?.isSupported === 'function' 
        ? tossAdsAny.initialize.isSupported() 
        : false;
    } catch {
      return false;
    }
  });

  const [isInitialized, setIsInitialized] = useState<boolean>(isTossAdsInitialized);

  useEffect(() => {
    if (!isSupported) return;
    if (isTossAdsInitialized) {
      if (!isInitialized) setIsInitialized(true);
      return;
    }
    if (isTossAdsInitializing) return;

    let cancelled = false;
    isTossAdsInitializing = true;

    try {
      TossAds.initialize({
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
  }, [isSupported, isInitialized]);

  const attachBanner = useCallback(
    (
      adGroupId: string,
      element: HTMLElement,
      options?: TossAdsAttachBannerOptions,
    ): TossAdsAttachBannerResult | undefined => {
      if (!isSupported || !isTossAdsInitialized || !isInitialized || !element) return undefined;

      const tossAdsAny = TossAds as any;
      try {
        if (typeof tossAdsAny.attachBanner?.isSupported === 'function' && !tossAdsAny.attachBanner.isSupported()) {
          return undefined;
        }
        if (typeof tossAdsAny.attachBanner !== 'function') {
          return undefined;
        }
        return tossAdsAny.attachBanner(adGroupId, element, options);
      } catch (error) {
        console.error('Toss Ads attachBanner failed:', error);
        return undefined;
      }
    },
    [isSupported, isInitialized],
  );

  return { isSupported, isInitialized, attachBanner };
}