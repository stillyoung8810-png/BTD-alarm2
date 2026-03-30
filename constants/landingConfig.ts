/**
 * 랜딩 피처 칩 구조 설정 — 로케일과 무관하게 1회만 선언 (DRY).
 * 라벨 문자열은 `constants/landingMessages.ts`의 `featureLabels`에서만 제공한다.
 */

export type LandingFeatureId =
  | 'secureAssetManagement'
  | 'quickTradeEntry'
  | 'realTimeMarketData'
  | 'customAlertSettings';

export type LandingFeatureIconKey = 'shield' | 'zap' | 'trendingUp' | 'bell';

export interface LandingFeatureConfigItem {
  id: LandingFeatureId;
  icon: LandingFeatureIconKey;
}

export const LANDING_FEATURES_CONFIG: readonly LandingFeatureConfigItem[] = [
  { id: 'secureAssetManagement', icon: 'shield' },
  { id: 'quickTradeEntry', icon: 'zap' },
  { id: 'realTimeMarketData', icon: 'trendingUp' },
  { id: 'customAlertSettings', icon: 'bell' },
] as const;
