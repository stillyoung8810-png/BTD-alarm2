import { parseViteBooleanEnvFlag } from '@/utils/envViteFlags';
import { getViteImportMetaEnv, isViteProdBuild } from '@/utils/viteImportMetaEnv';

/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 콘솔에서 발급한 광고 그룹 ID를 사용합니다. 변경 시 이 파일만 수정하면 됩니다.
 */

type BannerUseTestEnvKey =
  | 'VITE_TOSS_MARKET_BANNER_USE_TEST'
  | 'VITE_TOSS_HISTORY_BANNER_USE_TEST';

/** @see https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EA%B4%91%EA%B3%A0/BannerAd.html */
export const TOSS_LIST_BANNER_TEST_AD_GROUP_ID = 'ait-ad-test-banner-id';

/** 전면형 광고 그룹 ID (콘솔 전면형 · 운영 빌드) */
export const INTERSTITIAL_LIVE_AD_GROUP_ID = 'ait.v2.live.3f570e10ec374139';

/** 마켓 탭 배너 광고 그룹 ID (콘솔 배너형 - 이미지 강조 · 라이브) */
export const MARKET_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.b1d77d31f3b14d57';

/** 투자 이력 탭 배너 광고 그룹 ID (콘솔 배너형 - 문구 강조 · 라이브) */
export const HISTORY_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.59f9f0b02a5b4114';

/** 보상형 광고 AI인식 그룹 ID (콘솔 보상형 광고 AI인식) */
export const REWARD_UNLOCK_AI_AD_GROUP_ID = 'ait.v2.live.f71d668772bf4bf4';

function resolveBannerAdGroupId(
  liveAdGroupId: string,
  useTestEnvKey: BannerUseTestEnvKey,
): string {
  const env = getViteImportMetaEnv();
  const useTest = parseViteBooleanEnvFlag(env?.[useTestEnvKey]);

  if (useTest) {
    return TOSS_LIST_BANNER_TEST_AD_GROUP_ID;
  }

  if (isViteProdBuild()) {
    return liveAdGroupId;
  }

  return TOSS_LIST_BANNER_TEST_AD_GROUP_ID;
}

/**
 * 비프로덕션 빌드에서는 테스트 ID를 기본값으로 강제해 로컬/QA에서 라이브 광고를 호출하지 않도록 막습니다.
 * 필요 시 `.env`의 `VITE_TOSS_MARKET_BANNER_USE_TEST=true` 로 프로덕션에서도 테스트 ID를 강제할 수 있습니다.
 */
export function getResolvedMarketBannerAdGroupId(): string {
  return resolveBannerAdGroupId(
    MARKET_BANNER_LIVE_AD_GROUP_ID,
    'VITE_TOSS_MARKET_BANNER_USE_TEST',
  );
}

/**
 * 비프로덕션 빌드에서는 테스트 ID를 기본값으로 강제해 라이브 광고 트래픽 오염을 막습니다.
 * 필요 시 `.env`의 `VITE_TOSS_HISTORY_BANNER_USE_TEST=true` 로 프로덕션에서도 테스트 ID를 강제할 수 있습니다.
 */
export function getResolvedHistoryBannerAdGroupId(): string {
  return resolveBannerAdGroupId(
    HISTORY_BANNER_LIVE_AD_GROUP_ID,
    'VITE_TOSS_HISTORY_BANNER_USE_TEST',
  );
}
