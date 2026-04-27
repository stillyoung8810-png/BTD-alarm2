import type { OrderLevel } from '../types';

export const VR_CYCLE = {
  DEFAULT_WEEKS: 2,
  MIN_WEEKS: 1,
  MAX_WEEKS: 12,
} as const;

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

/** 기본 수수료율 — 소수(0.0025 = 0.25%). UI 퍼센트 0.25와 혼동 금지. */
export const DEFAULT_FEE_RATE = 0.0025;

/** 루트 `Portfolio.feeRate` 퍼센트(%) 폴백 전용 — `DEFAULT_FEE_RATE`(소수)와 단위가 다름. */
export const LEGACY_FEE_RATE_PCT = 0.25;

/** 루트 `fee_rate`가 VR 소수율(예: 0.0025)로 잘못 저장된 경우 퍼센트로 치환할 때 broker %와 구분하는 상한 */
export const VR_ROOT_FEE_DECIMAL_HEAL_MAX = 0.05;

export const VR_ROOT_FEE_DECIMAL_MATCH_EPS = 1e-6;

export const VR_LIMITS = {
  MIN_G_VALUE: 0.1,
  MIN_CAPITAL: 1,
  MIN_ORDER_QTY: 1,
} as const;

export const VR_BAND_WIDTH_PCT = {
  MIN: 1,
  MAX: 100,
  DEFAULT: 5,
} as const;

export const TVC_LIMITS = {
  BASE_GROWTH_RATE: {
    MIN: 1,
    MAX: 20,
  },
  SMART_BRAKE_THRESHOLD: {
    MIN: 1,
    MAX: 99,
  },
} as const;

/**
 * VR 주기별 입·출금(`deltaCash`) — UI 입력 구간 (USD).
 * 사용자 입력은 0 이상만 허용; 인출 모드에서의 음수 의미는 저장 후 `getVrDeltaCashForNextV`가 부호를 강제한다.
 */
export const VR_DELTA_CASH_INPUT = {
  MIN_USD: 0,
  MAX_WITHDRAWAL_AMOUNT_USD: 1_000_000,
} as const;

export type VrDeltaCashInputValidationReason =
  | 'non_finite'
  | 'negative'
  | 'exceeds_max';

/** Rule 1: NaN·음수·상한 초과를 UI/저장 전에 차단 */
export function getVrDeltaCashInputValidationReason(
  value: number,
): VrDeltaCashInputValidationReason | null {
  if (!Number.isFinite(value)) {
    return 'non_finite';
  }
  if (value < VR_DELTA_CASH_INPUT.MIN_USD) {
    return 'negative';
  }
  if (value > VR_DELTA_CASH_INPUT.MAX_WITHDRAWAL_AMOUNT_USD) {
    return 'exceeds_max';
  }
  return null;
}

export const TIME_MS = {
  PER_DAY: 24 * 60 * 60 * 1000,
  PER_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/** 퍼센트 → 소수 비율 변환 시 부동소수점 오염 방지용 고정밀 배수 (StrategyCreator 등에서만 사용) */
export const RATE_PRECISION_MULTIPLIER = 1_000_000_000;

/** 빈 주문 폴백 — 런타임 변이는 freeze로 차단, 타입만 OrderLevel[]로 맞춤(§상수 한 줄 캐스팅 예외). */
export const EMPTY_VR_ORDERS: OrderLevel[] = Object.freeze([]) as unknown as OrderLevel[];
