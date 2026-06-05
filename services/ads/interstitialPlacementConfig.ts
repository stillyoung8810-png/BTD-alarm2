/**
 * §7 Step 1: 전면 광고 — logical placement key와 adGroupId 분리 SSOT.
 * GlobalAdManager 도입 시 `getInterstitialPlacementDefinitions()` 결과를 주입한다 (docs2/ad-preload-architecture.md).
 *
 * adGroupId 선택: 프로덕션 빌드는 placement별 live ID, 그 외는 토스 문서 테스트 ID.
 * 강제로 테스트 ID를 쓰려면 `.env`에 `VITE_TOSS_INTERSTITIAL_USE_TEST=true` 설정.
 *
 * `getResolvedInterstitialAdGroupId`는 호출 시마다 env를 읽는다(모듈 로드 시 캐시 없음 — 테스트 모킹 유연성).
 */

import type { UserTier } from '@/types/userTier';
import {
  BENEFIT_INTERSTITIAL_LIVE_AD_GROUP_ID,
  INTERSTITIAL_LIVE_AD_GROUP_ID,
} from './adPlacements';
import { parseViteBooleanEnvFlag } from '@/utils/envViteFlags';
import {
  getViteImportMetaEnv,
  isViteProdBuild,
} from '@/utils/viteImportMetaEnv';

/** @see https://developers-apps-in-toss.toss.im/ads/develop.html — 테스트하기 */
export const TOSS_INTERSTITIAL_TEST_AD_GROUP_ID = 'ait-ad-test-interstitial-id';

export type AdRouteKey = 'dashboard' | 'history' | 'portfolio_details' | 'benefits';

export const INTERSTITIAL_PLACEMENT_KEYS = {
  STRATEGY_SAVE: 'strategy_save',
  TRADE_SAVE: 'trade_save',
  ALARM_SAVE: 'alarm_save',
  SETTLEMENT_DETAIL: 'settlement_detail',
  BENEFIT_MISSION_REWARD: 'benefit_mission_reward',
} as const;

export type InterstitialPlacementKey =
  (typeof INTERSTITIAL_PLACEMENT_KEYS)[keyof typeof INTERSTITIAL_PLACEMENT_KEYS];

export interface InterstitialPlacementDefinition {
  readonly key: InterstitialPlacementKey;
  readonly adGroupId: string;
  readonly preloadOnRoutes: readonly AdRouteKey[];
  readonly eligibleTiers: readonly UserTier[];
  readonly shouldDeferFirstAttempt: boolean;
}

type InterstitialPlacementDefinitionBase = Omit<
  InterstitialPlacementDefinition,
  'adGroupId'
>;

const INTERSTITIAL_PLACEMENT_DEFINITION_BASES: readonly InterstitialPlacementDefinitionBase[] =
  [
    {
      key: INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
      preloadOnRoutes: ['dashboard'],
      eligibleTiers: ['free'],
      shouldDeferFirstAttempt: true,
    },
    {
      key: INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
      preloadOnRoutes: ['dashboard', 'portfolio_details'],
      eligibleTiers: ['free'],
      shouldDeferFirstAttempt: true,
    },
    {
      key: INTERSTITIAL_PLACEMENT_KEYS.ALARM_SAVE,
      preloadOnRoutes: ['dashboard'],
      eligibleTiers: ['free'],
      shouldDeferFirstAttempt: true,
    },
    {
      key: INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL,
      preloadOnRoutes: ['history', 'portfolio_details'],
      eligibleTiers: ['free'],
      shouldDeferFirstAttempt: true,
    },
    {
      key: INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD,
      preloadOnRoutes: ['benefits'],
      eligibleTiers: ['free'],
      shouldDeferFirstAttempt: false,
    },
  ] as const;

/**
 * 현재 빌드·환경 변수에 맞는 전면 adGroupId.
 * 매 호출마다 `getViteImportMetaEnv()`를 읽는다.
 */
function resolveLiveInterstitialAdGroupId(liveAdGroupId: string): string {
  const env = getViteImportMetaEnv();
  const useTest = parseViteBooleanEnvFlag(
    env?.VITE_TOSS_INTERSTITIAL_USE_TEST,
  );
  if (useTest) {
    return TOSS_INTERSTITIAL_TEST_AD_GROUP_ID;
  }
  if (isViteProdBuild()) {
    return liveAdGroupId;
  }
  return TOSS_INTERSTITIAL_TEST_AD_GROUP_ID;
}

export function getResolvedInterstitialAdGroupId(): string {
  return resolveLiveInterstitialAdGroupId(INTERSTITIAL_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitInterstitialAdGroupId(): string {
  return resolveLiveInterstitialAdGroupId(BENEFIT_INTERSTITIAL_LIVE_AD_GROUP_ID);
}

function getResolvedInterstitialPlacementAdGroupId(
  key: InterstitialPlacementKey,
): string {
  if (key === INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD) {
    return getResolvedBenefitInterstitialAdGroupId();
  }

  return getResolvedInterstitialAdGroupId();
}

/**
 * 프리로드 매니저용 정의. 혜택 미션은 혜택 전용 전면 그룹을 가리키고,
 * 나머지 항목은 공용 전면 그룹(또는 테스트 ID)을 가리키되,
 * **key**는 슬롯·UI·로그에서만 쓰고 SDK에는 **adGroupId**만 넘긴다.
 * `adGroupId`는 호출 시점의 env를 반영한다.
 */
export function getInterstitialPlacementDefinitions(): readonly InterstitialPlacementDefinition[] {
  return INTERSTITIAL_PLACEMENT_DEFINITION_BASES.map((def) => ({
    ...def,
    adGroupId: getResolvedInterstitialPlacementAdGroupId(def.key),
  }));
}
