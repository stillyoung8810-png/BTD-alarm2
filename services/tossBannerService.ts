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

export interface TossAdsBridge {
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

type TossAdsInitListener = {
  onInitialized: () => void;
  onInitializationFailed: (error: unknown) => void;
};

const pendingInitListeners: TossAdsInitListener[] = [];

function notifyInitSuccess(): void {
  while (pendingInitListeners.length > 0) {
    const listener = pendingInitListeners.shift();
    listener?.onInitialized();
  }
}

function notifyInitFailure(error: unknown): void {
  while (pendingInitListeners.length > 0) {
    const listener = pendingInitListeners.shift();
    listener?.onInitializationFailed(error);
  }
}

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

export function getTossAdsBridgeCandidate(): TossAdsBridge | null {
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

export function isTossAdsInitializeSupported(bridge: TossAdsBridge): boolean {
  try {
    return bridge.initialize.isSupported?.() ?? false;
  } catch {
    return false;
  }
}

export function getTossAdsGlobalInitialized(): boolean {
  return isTossAdsInitialized;
}

/**
 * SDK 전역 초기화 1회. Strict Mode 이중 effect·언마운트에도 대기 리스너가 성공/실패를 받도록 큐를 둡니다.
 */
export function subscribeTossAdsInitialization(
  bridge: TossAdsBridge,
  callbacks: TossAdsInitListener,
): void {
  if (isTossAdsInitialized) {
    callbacks.onInitialized();
    return;
  }

  pendingInitListeners.push(callbacks);

  if (isTossAdsInitializing) {
    return;
  }

  isTossAdsInitializing = true;

  try {
    bridge.initialize({
      callbacks: {
        onInitialized: () => {
          isTossAdsInitialized = true;
          isTossAdsInitializing = false;
          notifyInitSuccess();
        },
        onInitializationFailed: (error) => {
          console.error('Toss Ads SDK initialization failed:', error);
          isTossAdsInitializing = false;
          notifyInitFailure(error);
        },
      },
    });
  } catch (error) {
    console.error('Toss Ads SDK initialize threw:', error);
    isTossAdsInitializing = false;
    notifyInitFailure(error);
  }
}

export function attachTossAdsBanner(
  bridge: TossAdsBridge,
  adGroupId: string,
  element: HTMLElement,
  options?: TossAdsAttachBannerOptions,
): TossAdsAttachBannerResult | undefined {
  if (
    !isTossAdsInitialized ||
    !element ||
    typeof bridge.attachBanner !== 'function'
  ) {
    return undefined;
  }

  try {
    if (
      typeof bridge.attachBanner.isSupported === 'function' &&
      !bridge.attachBanner.isSupported()
    ) {
      return undefined;
    }

    return bridge.attachBanner(adGroupId, element, options);
  } catch (error) {
    console.error('Toss Ads attachBanner failed:', error);
    return undefined;
  }
}
