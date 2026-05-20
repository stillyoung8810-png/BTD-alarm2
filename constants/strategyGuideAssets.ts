import type { StrategyType } from '@/src/components/StrategyCreator/utils';

export const STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY: Partial<
  Record<StrategyType, string>
> = {
  rsi_ma_interval: '/images/strategy-guides/ma-strategy-guide-overview.png',
  multi_split: '/images/strategy-guides/smart-split-guide-overview.png',
  no_stop_multi_split:
    '/images/strategy-guides/no-stop-multi-split-guide-overview.png',
  vr_band: '/images/strategy-guides/tvc-guide-overview.png',
};
