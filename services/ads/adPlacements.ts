import { isViteProdBuild } from '@/utils/viteImportMetaEnv';

/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 콘솔에서 발급한 광고 그룹 ID를 사용합니다. 변경 시 이 파일만 수정하면 됩니다.
 */
export const INTERSTITIAL_LIVE_AD_GROUP_ID = 'ait.v2.live.3f570e10ec374139';
export const BENEFIT_INTERSTITIAL_LIVE_AD_GROUP_ID =
  'ait.v2.live.a1ee350b4d584249';
export const MARKET_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.b1d77d31f3b14d57';
export const DASHBOARD_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.0d485bfb975c4091';
export const DASHBOARD_FEED_BANNER_LIVE_AD_GROUP_ID =
  'ait.v2.live.ebb12374e2df495f';
export const HISTORY_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.59f9f0b02a5b4114';
export const BENEFIT_ATTENDANCE_BANNER_LIVE_AD_GROUP_ID =
  'ait.v2.live.2c637851e1224b67';
export const BENEFIT_PREDICTION_BANNER_LIVE_AD_GROUP_ID =
  'ait.v2.live.ee94e7f9c3114207';
export const BENEFIT_QUIZ_BANNER_LIVE_AD_GROUP_ID =
  'ait.v2.live.6af36fb221644c70';
export const BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.a13a724ed4f94512';
export const REWARD_UNLOCK_AI_AD_GROUP_ID = 'ait.v2.live.f71d668772bf4bf4';
export const BENEFIT_QUIZ_REWARD_LIVE_AD_GROUP_ID =
  'ait.v2.live.3e7b4370425b4621';
export const BENEFIT_REWARD_LIVE_AD_GROUP_ID = 'ait.v2.live.3e7b4370425b4621';
export const TOSS_REWARD_TEST_AD_GROUP_ID = 'ait-ad-test-rewarded-id';

function resolveBannerAdGroupId(liveAdGroupId: string): string {
  if (isViteProdBuild()) {
    return liveAdGroupId;
  }

  return '';
}

function resolveRewardAdGroupId(liveAdGroupId: string): string {
  if (isViteProdBuild()) {
    return liveAdGroupId;
  }

  return TOSS_REWARD_TEST_AD_GROUP_ID;
}

export function getResolvedMarketBannerAdGroupId(): string {
  return resolveBannerAdGroupId(MARKET_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedDashboardBannerAdGroupId(): string {
  return resolveBannerAdGroupId(DASHBOARD_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedDashboardFeedBannerAdGroupId(): string {
  return resolveBannerAdGroupId(DASHBOARD_FEED_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedHistoryBannerAdGroupId(): string {
  return resolveBannerAdGroupId(HISTORY_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitAttendanceBannerAdGroupId(): string {
  return resolveBannerAdGroupId(BENEFIT_ATTENDANCE_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitPredictionBannerAdGroupId(): string {
  return resolveBannerAdGroupId(BENEFIT_PREDICTION_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitQuizBannerAdGroupId(): string {
  return resolveBannerAdGroupId(BENEFIT_QUIZ_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitFeedBannerAdGroupId(): string {
  return resolveBannerAdGroupId(BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedRewardUnlockAiAdGroupId(): string {
  return resolveRewardAdGroupId(REWARD_UNLOCK_AI_AD_GROUP_ID);
}

export function getResolvedBenefitQuizRewardAdGroupId(): string {
  return resolveRewardAdGroupId(BENEFIT_QUIZ_REWARD_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitRewardAdGroupId(): string {
  return resolveRewardAdGroupId(BENEFIT_REWARD_LIVE_AD_GROUP_ID);
}
