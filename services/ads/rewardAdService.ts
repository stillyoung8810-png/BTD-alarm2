import { GoogleAdMob } from '@apps-in-toss/web-framework';
import { isTossApp } from '../toss/tossBridge';

const REWARD_AD_LOAD_TIMEOUT_MS = 10_000;
const REWARD_AD_SHOW_TIMEOUT_MS = 10_000;

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

function isRewardAdSupported(): boolean {
  try {
    return (
      typeof GoogleAdMob?.loadAppsInTossAdMob?.isSupported === 'function' &&
      GoogleAdMob.loadAppsInTossAdMob.isSupported() === true
    );
  } catch {
    return false;
  }
}

function waitForRewardAdLoad(adGroupId: string): Promise<() => void> {
  return executeWithTimeout<() => void>((resolve, reject, onCancel) => {
    let unregister: (() => void) | undefined;

    try {
      unregister = GoogleAdMob.loadAppsInTossAdMob({
        options: { adGroupId },
        onEvent: (event: { type: string }) => {
          if (event.type === 'loaded') {
            resolve(unregister ?? (() => {}));
          }
        },
        onError: (error: unknown) => {
          if (unregister != null) {
            unregister();
          }
          reject(error);
        },
      });
      onCancel(() => {
        unregister?.();
      });
    } catch (error: unknown) {
      reject(error);
    }
  }, REWARD_AD_LOAD_TIMEOUT_MS, 'reward_ad_load_timeout');
}

function showRewardAd(adGroupId: string): Promise<boolean> {
  return executeWithTimeout<boolean>((resolve, reject, onCancel) => {
    let unregister: (() => void) | undefined;
    let isRewardEarned = false;

    try {
      unregister = GoogleAdMob.showAppsInTossAdMob({
        options: { adGroupId },
        onEvent: (event: { type: string }) => {
          if (event.type === 'userEarnedReward') {
            isRewardEarned = true;
            return;
          }

          if (event.type === 'dismissed') {
            if (unregister != null) {
              unregister();
            }
            resolve(isRewardEarned);
            return;
          }

          if (event.type === 'failedToShow') {
            if (unregister != null) {
              unregister();
            }
            reject(new Error('Toss SDK failedToShow'));
          }
        },
        onError: (error: unknown) => {
          if (unregister != null) {
            unregister();
          }
          reject(error);
        },
      });
      onCancel(() => {
        unregister?.();
      });
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

  let loadUnregister: (() => void) | null = null;

  try {
    loadUnregister = await waitForRewardAdLoad(adGroupId);
    return await showRewardAd(adGroupId);
  } catch (error: unknown) {
    console.error('[RewardAdService] Reward Ad error:', error);
    return false;
  } finally {
    if (loadUnregister != null) {
      loadUnregister();
    }
  }
}
