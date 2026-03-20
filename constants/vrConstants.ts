export const VR_CYCLE = {
  DEFAULT_WEEKS: 2,
  MIN_WEEKS: 1,
  MAX_WEEKS: 12,
} as const;

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

/** 기본 수수료율 — 소수(0.0025 = 0.25%). UI 퍼센트 0.25와 혼동 금지. */
export const DEFAULT_FEE_RATE = 0.0025;

export const VR_LIMITS = {
  MIN_G_VALUE: 0.1,
  MIN_CAPITAL: 1,
  MIN_ORDER_QTY: 1,
} as const;

export const TIME_MS = {
  PER_DAY: 24 * 60 * 60 * 1000,
  PER_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/** 퍼센트 → 소수 비율 변환 시 부동소수점 오염 방지용 고정밀 배수 (StrategyCreator 등에서만 사용) */
export const RATE_PRECISION_MULTIPLIER = 1_000_000_000;

