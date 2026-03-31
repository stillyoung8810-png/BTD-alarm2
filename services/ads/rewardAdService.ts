import { GoogleAdMob } from '@apps-in-toss/web-framework';
import { isTossApp } from '../toss/tossBridge';

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
  return new Promise((resolve, reject) => {
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
    } catch (error: unknown) {
      reject(error);
    }
  });
}

function showRewardAd(adGroupId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
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
    } catch (error: unknown) {
      reject(error);
    }
  });
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
