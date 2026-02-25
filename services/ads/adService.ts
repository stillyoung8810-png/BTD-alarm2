/**
 * 토스 미니앱 광고: 전면 광고(Interstitial) 및 리워드(Reward) 파이프라인
 * 원칙 1: 웹 환경(isTossApp === false)에서는 절대 실행되지 않고 즉시 bypass.
 * 원칙 2: 메모리 누수 방지를 위해 load/show 리스너는 성공/실패 무관 즉시 unregister.
 * 원칙 3: 티어(Tier) 기반 라우팅을 통해 PRO/PREMIUM 유저의 광고 경험을 분리 통제.
 */

import { isTossApp } from '../toss/tossBridge';
import { AdPlacement, type AdPlacementId } from './adPlacements';
import * as WebFramework from '@apps-in-toss/web-framework';

const INTERSTITIAL_TIMEOUT_MS = 8_000;
const AD_FAILURE_POLICY: 'proceed' | 'block' = 'proceed';

export interface AdResult {
  shown: boolean;
  error?: string;
}

export type UserTier = 'free' | 'pro' | 'premium';

/** * SRP 1: 실패 정책에 따른 안전한 에러 핸들링 
 */
const createSafeResult = (errorMsg: string): AdResult => {
  if (AD_FAILURE_POLICY === 'proceed') {
    console.warn('[TossAds Interstitial] Skipped or Failed:', errorMsg);
    return { shown: false, error: errorMsg };
  }
  throw new Error(errorMsg);
};

/** * SRP 2: 타임아웃 제어 (Promise 래퍼) 
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ad flow timeout after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
};

/**
 * SRP 3: 광고 로드 대기 (이벤트 격리)
 */
const waitForAdLoad = (adGroupId: string, api: any): Promise<() => void> => {
  return new Promise((resolve, reject) => {
    let unregister: (() => void) | undefined;
    try {
      unregister = api.loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event: any) => {
          if (event.type === 'loaded') resolve(unregister || (() => {}));
        },
        onError: (error: any) => {
          if (unregister) unregister();
          reject(error);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * SRP 4: 로드된 광고 노출 및 종료 대기 (이벤트 격리)
 */
const displayLoadedAd = (adGroupId: string, api: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    let unregister: (() => void) | undefined;
    try {
      unregister = api.showFullScreenAd({
        options: { adGroupId },
        onEvent: (event: any) => {
          if (event.type === 'dismissed') {
            if (unregister) unregister();
            resolve();
          } else if (event.type === 'failedToShow') {
            if (unregister) unregister();
            reject(new Error('Toss SDK emitted failedToShow event'));
          }
        },
        onError: (error: any) => {
          if (unregister) unregister();
          reject(error);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * 파이프라인: 광고 로드 -> 노출 -> 닫힘 -> 메모리 해제
 */
const executeInterstitialFlow = async (adGroupId: string): Promise<AdResult> => {
  const api = WebFramework as any;

  if (typeof api.loadFullScreenAd?.isSupported !== 'function' || !api.loadFullScreenAd.isSupported()) {
    return createSafeResult('loadFullScreenAd is not supported in the current app version.');
  }

  let loadUnregister: (() => void) | null = null;
  
  try {
    loadUnregister = await waitForAdLoad(adGroupId, api);
    await displayLoadedAd(adGroupId, api);
    return { shown: true };
  } catch (error) {
    return createSafeResult(error instanceof Error ? error.message : String(error));
  } finally {
    if (loadUnregister) loadUnregister();
  }
};

/**
 * [Public API] 전면 광고 호출 함수
 * 앱 전환 시점 등 작업이 완료된 후 모달이 닫힐 때 1회 호출합니다.
 * @param placementId 광고 지면 ID
 * @param tier 유저의 현재 결제 티어 (기본값: 'free')
 */
export async function showInterstitialOnTransition(
  placementId: AdPlacementId, 
  tier: UserTier = 'free'
): Promise<AdResult> {
  // 웹 환경 가드
  if (!isTossApp()) return { shown: false };

  // 티어 가드: PRO / PREMIUM은 전면 광고 영구 면제
  if (tier === 'pro' || tier === 'premium') {
    return { shown: false };
  }

  try {
    return await withTimeout(executeInterstitialFlow(placementId), INTERSTITIAL_TIMEOUT_MS);
  } catch (err) {
    return createSafeResult(err instanceof Error ? err.message : String(err));
  }
}

/**
 * [Public API] 보상형 광고 요청 (자발적 시청 전용)
 * @returns 보상 획득(끝까지 시청 완료) 시 true, 실패/중도 이탈 시 false
 */
export async function requestRewardAd(placementId: AdPlacementId): Promise<boolean> {
  if (!isTossApp()) return true; // 웹 환경 테스트용 패스

  const api = WebFramework as any;
  if (typeof api.loadFullScreenAd?.isSupported !== 'function' || !api.loadFullScreenAd.isSupported()) {
    return false;
  }

  let loadUnregister: (() => void) | null = null;
  let isRewarded = false;

  try {
    loadUnregister = await waitForAdLoad(placementId, api);

    await new Promise<void>((resolve, reject) => {
      let showUnregister: (() => void) | undefined;
      showUnregister = api.showFullScreenAd({
        options: { adGroupId: placementId },
        onEvent: (event: any) => {
          if (event.type === 'userEarnedReward') {
            isRewarded = true;
          } else if (event.type === 'dismissed') {
            if (showUnregister) showUnregister();
            resolve();
          } else if (event.type === 'failedToShow') {
            if (showUnregister) showUnregister();
            reject(new Error('Toss SDK failedToShow'));
          }
        },
        onError: (error: any) => {
          if (showUnregister) showUnregister();
          reject(error);
        }
      });
    });

    return isRewarded;
  } catch (error) {
    console.error('[AdService] Reward Ad error:', error);
    return false;
  } finally {
    if (loadUnregister) loadUnregister();
  }
}

export { AdPlacement };