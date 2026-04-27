export type Lang = 'ko' | 'en';

export type StrategyNameId =
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'ma_interval'
  | 'rsi_ma_interval'
  | 'vr_band';

export type DashboardStrategyNameId =
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'ma_interval'
  | 'vr_band';

type StrategyNameMap = Record<StrategyNameId, string>;
type DashboardStrategyNameMap = Record<DashboardStrategyNameId, string>;

export const STRATEGY_NAMES: Record<Lang, StrategyNameMap> = {
  ko: {
    multi_split: '스마트 스플릿',
    no_stop_multi_split: '무손절 다분할',
    ma_interval: '이평선 구간매수',
    rsi_ma_interval: '이평선 구간매수',
    vr_band: '타겟 밸류 채널',
  },
  en: {
    multi_split: 'Smart Split',
    no_stop_multi_split: 'No-Stop Multi-Split',
    ma_interval: 'MA Interval Buying',
    rsi_ma_interval: 'MA Interval Buying',
    vr_band: 'Target Value Channel',
  },
};

export function getStrategyNames(lang: Lang): StrategyNameMap {
  return STRATEGY_NAMES[lang] ?? STRATEGY_NAMES.ko;
}

export function getStrategyName(lang: Lang, id: StrategyNameId): string {
  return getStrategyNames(lang)[id];
}

export function getDashboardStrategyNames(
  lang: Lang,
): DashboardStrategyNameMap {
  const names = getStrategyNames(lang);
  return {
    multi_split: names.multi_split,
    no_stop_multi_split: names.no_stop_multi_split,
    ma_interval: names.ma_interval,
    vr_band: names.vr_band,
  };
}
