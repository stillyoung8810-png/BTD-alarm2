import type { CommonMessageSet } from '@/constants/messages/commonMessages';

export const ROUNDING = {
  MONEY_DECIMALS: 2,
  EPSILON: Number.EPSILON,
} as const;

export const PORTFOLIO_VALIDATION = {
  MIN_DAILY_BUY_AMOUNT_USD: 1,
  MAX_DAILY_BUY_AMOUNT_USD: 1_000_000,
  MIN_FEE_RATE_PERCENT: 0,
  MAX_FEE_RATE_PERCENT: 1,
  MAX_PORTFOLIO_NAME_LENGTH: 100,
  // 0·음수 기간은 이평 계산 파이프라인에 그대로 들어가면 분모 붕괴를 부를 수 있습니다.
  MIN_MA_PERIOD: 1,
  MAX_MA_PERIOD: 250,
  MIN_WITHDRAWAL_INPUT_USD: 0,
  MAX_WITHDRAWAL_AMOUNT_USD: 1_000_000,
} as const;

export const STRATEGY_DEFAULTS = {
  DAILY_BUY_AMOUNT_USD: 1_000,
  FEE_RATE_PERCENT: 0.25,
  MA_SHORT_PERIOD: 20,
  MA_LONG_PERIOD: 60,
  RSI_THRESHOLD: 30,
  PARTIAL_PROFIT_PERCENT: 10,
  TARGET_RETURN_PERCENT: 10,
  TOTAL_SPLIT_COUNT: 40,
  VR_INITIAL_CAPITAL: 10_000,
  VR_INITIAL_VALUE: 5_000,
  VR_G_VALUE: 10,
  VR_BASE_GROWTH_RATE_PERCENT: 10,
  VR_SMART_BRAKE_THRESHOLD_PERCENT: 10,
  VR_POOL_USAGE_PCT: 80,
} as const;

export const MUTEX_TIMEOUT_MS = 60_000;

export function roundMoney(value: number): number {
  const multiplier = 10 ** ROUNDING.MONEY_DECIMALS;
  return Math.round((value + ROUNDING.EPSILON) * multiplier) / multiplier;
}

export function normalizeWithdrawalAmount(rawAmount: number): number {
  return -Math.abs(rawAmount);
}

export function getSafeInitialOrderQty(
  shares: number,
  minOrderQty: number,
): number {
  if (shares <= 0) {
    return minOrderQty;
  }

  return Math.max(minOrderQty, shares);
}

export function validatePortfolioSetupInput(
  input: {
    name: string;
    dailyBuyAmount: number;
    feeRatePercent: number;
    maShortPeriod: number;
    maLongPeriod: number;
    withdrawalAmount: number;
  },
  copy: CommonMessageSet,
): string | null {
  const {
    name,
    dailyBuyAmount,
    feeRatePercent,
    maShortPeriod,
    maLongPeriod,
    withdrawalAmount,
  } = input;

  if (name.length === 0) {
    return copy.validationNameRequired;
  }

  if (name.length > PORTFOLIO_VALIDATION.MAX_PORTFOLIO_NAME_LENGTH) {
    return copy.validationNameLength;
  }

  if (
    !Number.isFinite(dailyBuyAmount) ||
    dailyBuyAmount < PORTFOLIO_VALIDATION.MIN_DAILY_BUY_AMOUNT_USD ||
    dailyBuyAmount > PORTFOLIO_VALIDATION.MAX_DAILY_BUY_AMOUNT_USD
  ) {
    return copy.validationDailyBuy;
  }

  if (
    !Number.isFinite(feeRatePercent) ||
    feeRatePercent < PORTFOLIO_VALIDATION.MIN_FEE_RATE_PERCENT ||
    feeRatePercent > PORTFOLIO_VALIDATION.MAX_FEE_RATE_PERCENT
  ) {
    return copy.validationFeeRate;
  }

  if (
    !Number.isFinite(maShortPeriod) ||
    maShortPeriod < PORTFOLIO_VALIDATION.MIN_MA_PERIOD ||
    maShortPeriod > PORTFOLIO_VALIDATION.MAX_MA_PERIOD ||
    !Number.isFinite(maLongPeriod) ||
    maLongPeriod < PORTFOLIO_VALIDATION.MIN_MA_PERIOD ||
    maLongPeriod > PORTFOLIO_VALIDATION.MAX_MA_PERIOD
  ) {
    return copy.validationMaPeriod;
  }

  if (!Number.isFinite(withdrawalAmount)) {
    return copy.validationWithdrawalNonFinite;
  }

  if (withdrawalAmount < PORTFOLIO_VALIDATION.MIN_WITHDRAWAL_INPUT_USD) {
    return copy.validationWithdrawalNegative;
  }

  if (withdrawalAmount > PORTFOLIO_VALIDATION.MAX_WITHDRAWAL_AMOUNT_USD) {
    return copy.validationWithdrawalTooLarge;
  }

  return null;
}
