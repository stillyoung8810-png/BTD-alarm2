import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import type {
  IntegratedAdApi,
  OfficialLoadFullScreenAd,
  OfficialShowFullScreenAd,
} from './globalAdManager';

// Rule 7: 타입 가드를 통한 안전한 지원 여부 확인
function checkIsSupported(fn: unknown): boolean {
  if (typeof fn !== 'function') return false;
  const withSupported = fn as { isSupported?: unknown };
  if (typeof withSupported.isSupported !== 'function') return false;
  try {
    return withSupported.isSupported() === true;
  } catch {
    return false;
  }
}

// Rule 6 & 11: 런타임 Undefined 및 타입 불일치 방어용 래퍼
function createSafeLoadAd(): OfficialLoadFullScreenAd {
  function wrapper(params: Parameters<OfficialLoadFullScreenAd>[0]): () => void {
    if (typeof loadFullScreenAd !== 'function') return () => {};
    return loadFullScreenAd(params as Parameters<typeof loadFullScreenAd>[0]);
  }
  wrapper.isSupported = () => checkIsSupported(loadFullScreenAd);
  return wrapper;
}

function createSafeShowAd(): OfficialShowFullScreenAd {
  function wrapper(params: Parameters<OfficialShowFullScreenAd>[0]): () => void {
    if (typeof showFullScreenAd !== 'function') return () => {};
    return showFullScreenAd(params as Parameters<typeof showFullScreenAd>[0]);
  }
  wrapper.isSupported = () => checkIsSupported(showFullScreenAd);
  return wrapper;
}

/** Toss SDK 전면 광고 심볼을 `IntegratedAdApi` 경계에서 타입·런타임 안전하게 감쌉니다. */
export const tossIntegratedFullScreenAdApi: IntegratedAdApi = {
  loadFullScreenAd: createSafeLoadAd(),
  showFullScreenAd: createSafeShowAd(),
};
