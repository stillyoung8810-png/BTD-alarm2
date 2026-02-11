/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 변경 시 이 파일만 수정하면 됩니다.
 */

export const AdPlacement = {
  REWARD_STRATEGY_SAVE: 'strategy_save',
  REWARD_TRADE_SAVE: 'trade_save',
  REWARD_ALARM_SAVE: 'alarm_save',
  INTERSTITIAL_SETTLEMENT_DETAIL: 'settlement_detail',
} as const;

export type AdPlacementKey = keyof typeof AdPlacement;
export type AdPlacementId = (typeof AdPlacement)[AdPlacementKey];
