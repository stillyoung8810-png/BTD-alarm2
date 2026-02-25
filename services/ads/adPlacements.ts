/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 변경 시 이 파일만 수정하면 됩니다.
 */

export const AdPlacement = {
  INTERSTITIAL_STRATEGY_SAVE: 'strategy_save',
  INTERSTITIAL_TRADE_SAVE: 'trade_save',
  INTERSTITIAL_ALARM_SAVE: 'alarm_save',
  INTERSTITIAL_SETTLEMENT_DETAIL: 'settlement_detail',
  REWARD_UNLOCK_AI: 'reward_unlock_ai',
} as const;

export type AdPlacementKey = keyof typeof AdPlacement;
export type AdPlacementId = (typeof AdPlacement)[AdPlacementKey];
