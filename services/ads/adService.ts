/**
 * 토스 미니앱 광고: 리워드/전면 광고 표시 및 실패 정책 일원화.
 * 실패·타임아웃 시 진행 여부는 여기서만 결정 (DRY).
 */

import { isTossApp, loadWebFramework } from '../toss/tossBridge';
import { AdPlacement, type AdPlacementId } from './adPlacements';

const REWARD_TIMEOUT_MS = 10_000;
const INTERSTITIAL_TIMEOUT_MS = 8_000;

/** 실패 시 저장/진행 허용 (정책: 광고 실패해도 UX 방해하지 않음) */
const AD_FAILURE_POLICY: 'proceed' | 'block' = 'proceed';

export interface AdResult {
  shown: boolean;
  error?: string;
}

/**
 * 저장 직전 리워드 광고 표시. 토스 앱이 아니면 바로 성공으로 통과.
 * 실패 시 정책에 따라 진행(proceed) 또는 에러 throw(block).
 */
export async function showRewardBeforeAction(placementId: AdPlacementId): Promise<AdResult> {
  if (!isTossApp()) {
    return { shown: false };
  }
  const result = await showRewardAd(placementId);
  if (result.shown) return result;
  if (AD_FAILURE_POLICY === 'proceed') {
    if (result.error) console.warn('[Ad]', result.error);
    return { shown: false, error: result.error };
  }
  throw new Error(result.error ?? '광고를 불러오지 못했습니다.');
}

/**
 * 전면 광고 표시 (예: 정산 상세보기 진입 시).
 */
export async function showInterstitialBeforeAction(placementId: AdPlacementId): Promise<AdResult> {
  if (!isTossApp()) {
    return { shown: false };
  }
  return showInterstitialAd(placementId);
}

async function showRewardAd(placementId: string): Promise<AdResult> {
  try {
    const mod = await loadWebFramework();
    const bridge = typeof window !== 'undefined' ? window.TossApp : undefined;
    const showReward = bridge?.ads?.showReward ?? (mod as { partner?: { showReward?: (id: string) => Promise<void> } }).partner?.showReward;
    if (!showReward) {
      return { shown: false, error: '리워드 광고 API를 사용할 수 없습니다.' };
    }
    await withTimeout(showReward(placementId), REWARD_TIMEOUT_MS);
    return { shown: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '리워드 광고 실패';
    return { shown: false, error: msg };
  }
}

async function showInterstitialAd(placementId: string): Promise<AdResult> {
  try {
    const mod = await loadWebFramework();
    const bridge = typeof window !== 'undefined' ? window.TossApp : undefined;
    const showInterstitial = bridge?.ads?.showInterstitial ?? (mod as { partner?: { showInterstitial?: (id: string) => Promise<void> } }).partner?.showInterstitial;
    if (!showInterstitial) {
      return { shown: false, error: '전면 광고 API를 사용할 수 없습니다.' };
    }
    await withTimeout(showInterstitial(placementId), INTERSTITIAL_TIMEOUT_MS);
    return { shown: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '전면 광고 실패';
    return { shown: false, error: msg };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('광고 로드 시간이 초과되었습니다.')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export { AdPlacement };
