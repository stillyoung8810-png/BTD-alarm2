import { isTossApp } from '../toss/tossBridge';
import type {
  OfficialLoadFullScreenAd,
  OfficialShowFullScreenAd,
} from './globalAdManager';
import { tossIntegratedFullScreenAdApi } from './tossIntegratedFullScreenAdApi';

const REWARD_AD_LOAD_TIMEOUT_MS = 10_000;
const REWARD_AD_SHOW_TIMEOUT_MS = 120_000;

function executeWithTimeout<T>(
  executor: (
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
    onCancel: (cleanup: () => void) => void,
  ) => void,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelHandler: (() => void) | null = null;
    let isSettled = false;

    const settleOnce = (settler: () => void): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      if (timerId != null) {
        clearTimeout(timerId);
        timerId = null;
      }
      settler();
    };

    timerId = globalThis.setTimeout(() => {
      cancelHandler?.();
      settleOnce(() => {
        reject(new Error(timeoutMessage));
      });
    }, timeoutMs);

    try {
      executor(
        (value) => {
          settleOnce(() => {
            resolve(value);
          });
        },
        (reason) => {
          settleOnce(() => {
            reject(reason);
          });
        },
        (cleanup) => {
          cancelHandler = cleanup;
        },
      );
    } catch (error: unknown) {
      settleOnce(() => {
        reject(error);
      });
    }
  });
}

function createSafeUnregister(
  register: (cleanup: () => void) => () => void,
): () => void {
  let unregister: (() => void) | null = null;
  let shouldRunAfterAssign = false;
  let isConsumed = false;

  const cleanup = (): void => {
    if (isConsumed) {
      return;
    }

    if (unregister == null) {
      shouldRunAfterAssign = true;
      return;
    }

    isConsumed = true;
    const currentUnregister = unregister;
    unregister = null;
    currentUnregister();
  };

  unregister = register(cleanup);

  if (shouldRunAfterAssign) {
    cleanup();
  }

  return cleanup;
}

function hasSupportedLoadMethod(
  method: OfficialLoadFullScreenAd | undefined,
): method is OfficialLoadFullScreenAd {
  if (typeof method !== 'function') {
    return false;
  }

  if (typeof method.isSupported !== 'function') {
    return false;
  }

  try {
    return method.isSupported() === true;
  } catch {
    return false;
  }
}

function hasSupportedShowMethod(
  method: OfficialShowFullScreenAd | undefined,
): method is OfficialShowFullScreenAd {
  if (typeof method !== 'function') {
    return false;
  }

  if (typeof method.isSupported !== 'function') {
    return false;
  }

  try {
    return method.isSupported() === true;
  } catch {
    return false;
  }
}

function isRewardAdSupported(): boolean {
  return (
    hasSupportedLoadMethod(tossIntegratedFullScreenAdApi.loadFullScreenAd) &&
    hasSupportedShowMethod(tossIntegratedFullScreenAdApi.showFullScreenAd)
  );
}

function waitForRewardAdLoad(adGroupId: string): Promise<void> {
  const loadFullScreenAd = tossIntegratedFullScreenAdApi.loadFullScreenAd;
  if (!hasSupportedLoadMethod(loadFullScreenAd)) {
    return Promise.reject(new Error('reward_ad_unsupported'));
  }

  return executeWithTimeout<void>((resolve, reject, onCancel) => {
    try {
      const cleanup = createSafeUnregister((safeCleanup) => {
        onCancel(() => {
          safeCleanup();
        });

        return loadFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type === 'loaded') {
              safeCleanup();
              resolve();
            }
          },
          onError: (error: unknown) => {
            safeCleanup();
            reject(error);
          },
        });
      });

      void cleanup;
    } catch (error: unknown) {
      reject(error);
    }
  }, REWARD_AD_LOAD_TIMEOUT_MS, 'reward_ad_load_timeout');
}

function showRewardAd(adGroupId: string): Promise<boolean> {
  const showFullScreenAd = tossIntegratedFullScreenAdApi.showFullScreenAd;
  if (!hasSupportedShowMethod(showFullScreenAd)) {
    return Promise.reject(new Error('reward_ad_unsupported'));
  }

  return executeWithTimeout<boolean>((resolve, reject, onCancel) => {
    let isRewardEarned = false;

    try {
      const cleanup = createSafeUnregister((safeCleanup) => {
        onCancel(() => {
          safeCleanup();
        });

        return showFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            switch (event.type) {
              case 'requested':
              case 'show':
              case 'impression':
              case 'clicked':
                return;
              case 'userEarnedReward':
                isRewardEarned = true;
                return;
              case 'dismissed':
                safeCleanup();
                resolve(isRewardEarned);
                return;
              case 'failedToShow':
                safeCleanup();
                reject(new Error('reward_ad_failed_to_show'));
                return;
              default: {
                const neverEvent: never = event;
                void neverEvent;
              }
            }
          },
          onError: (error: unknown) => {
            safeCleanup();
            reject(error);
          },
        });
      });

      void cleanup;
    } catch (error: unknown) {
      reject(error);
    }
  }, REWARD_AD_SHOW_TIMEOUT_MS, 'reward_ad_show_timeout');
}

export async function requestRewardAd(adGroupId: string): Promise<boolean> {
  if (!isTossApp()) {
    return true;
  }

  if (!isRewardAdSupported()) {
    return false;
  }

  try {
    await waitForRewardAdLoad(adGroupId);
    return await showRewardAd(adGroupId);
  } catch (error: unknown) {
    console.error('[RewardAdService] Reward Ad error:', error);
    return false;
  }
}
