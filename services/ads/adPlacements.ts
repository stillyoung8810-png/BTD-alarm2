import { isViteProdBuild } from '@/utils/viteImportMetaEnv';

/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 콘솔에서 발급한 광고 그룹 ID를 사용합니다. 변경 시 이 파일만 수정하면 됩니다.
 */

/** 전면형 광고 그룹 ID (콘솔 전면형 · 운영 빌드) */
export const INTERSTITIAL_LIVE_AD_GROUP_ID = 'ait.v2.live.3f570e10ec374139';

/** 마켓 탭 배너 광고 그룹 ID (콘솔 배너형 - 이미지 강조 · 라이브) */
export const MARKET_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.b1d77d31f3b14d57';

/** 투자 이력 탭 배너 광고 그룹 ID (콘솔 배너형 - 문구 강조 · 라이브) */
export const HISTORY_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.59f9f0b02a5b4114';

/** 보상형 광고 AI인식 그룹 ID (콘솔 보상형 광고 AI인식) */
export const REWARD_UNLOCK_AI_AD_GROUP_ID = 'ait.v2.live.f71d668772bf4bf4';

function resolveBannerAdGroupId(liveAdGroupId: string): string {
  if (isViteProdBuild()) {
    return liveAdGroupId;
  }

  return '';
}

/**
 * 비프로덕션 빌드에서는 빈 ID를 반환해 라이브 광고 호출을 막습니다.
 */
export function getResolvedMarketBannerAdGroupId(): string {
  return resolveBannerAdGroupId(MARKET_BANNER_LIVE_AD_GROUP_ID);
}

/**
 * 비프로덕션 빌드에서는 빈 ID를 반환해 라이브 광고 호출을 막습니다.
 */
export function getResolvedHistoryBannerAdGroupId(): string {
  return resolveBannerAdGroupId(HISTORY_BANNER_LIVE_AD_GROUP_ID);
}
