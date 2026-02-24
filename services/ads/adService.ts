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
export async function showInterstitialBeforeAction(
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
 * [Public API] 리워드 광고 호출 함수 (DEPRECATED & FUTURE-PROOFING)
 * 향후 PRO 유저 대상 선택적 보상형 광고 도입을 위한 구조적 게이트 유지.
 * @param placementId 광고 지면 ID
 * @param tier 유저의 현재 결제 티어 (기본값: 'free')
 */
export async function showRewardBeforeAction(
  _placementId: AdPlacementId, 
  tier: UserTier = 'free'
): Promise<AdResult> {
  // 웹 환경 가드
  if (!isTossApp()) return { shown: false };

  // 티어 가드: PREMIUM은 모든 광고 면제
  if (tier === 'premium') {
    return { shown: false };
  }

  // TODO: PRO 또는 FREE 유저를 위한 리워드 연동부. (현재는 UX 정책상 비활성)
  return { shown: false };
}

export { AdPlacement };