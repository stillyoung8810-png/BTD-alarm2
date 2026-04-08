import { areStrictPositiveFiniteScalars } from '@/utils/financialScalarGuards';

const DECIMAL_BASE = 10;
const MIN_DECIMAL_PLACES = 0;
const ZERO_AMOUNT = 0;
const DEFAULT_DISPLAY_DECIMAL_PLACES = 2;
const EN_US_LOCALE = 'en-US';
export const TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES = 2;

function normalizeDecimalPlaces(places: number): number {
  if (!Number.isFinite(places)) {
    return DEFAULT_DISPLAY_DECIMAL_PLACES;
  }

  return Math.max(MIN_DECIMAL_PLACES, Math.trunc(places));
}

function isRoundedZero(value: number): boolean {
  return Object.is(value, -0) || value === ZERO_AMOUNT;
}

export interface TradeBudgetExceededInput {
  tradeType: 'buy' | 'sell';
  price: number;
  quantity: number;
  dailyBuyAmount: number;
}

export function getRounded(
  value: number,
  places: number = TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
): number {
  if (!Number.isFinite(value)) {
    return ZERO_AMOUNT;
  }

  const normalizedPlaces = normalizeDecimalPlaces(places);
  const factor = DECIMAL_BASE ** normalizedPlaces;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatUsdValue(
  value: number,
  places: number = DEFAULT_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedPlaces = normalizeDecimalPlaces(places);
  const rounded = getRounded(value, normalizedPlaces);
  const displayValue = isRoundedZero(rounded) ? ZERO_AMOUNT : rounded;

  return `$${displayValue.toLocaleString(EN_US_LOCALE, {
    minimumFractionDigits: normalizedPlaces,
    maximumFractionDigits: normalizedPlaces,
  })}`;
}

export function formatSignedPercent(
  value: number,
  places: number = DEFAULT_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedPlaces = normalizeDecimalPlaces(places);
  const rounded = getRounded(value, normalizedPlaces);

  if (isRoundedZero(rounded)) {
    return `${ZERO_AMOUNT.toFixed(normalizedPlaces)}%`;
  }

  if (rounded > 0) {
    return `+${rounded.toFixed(normalizedPlaces)}%`;
  }

  return `${rounded.toFixed(normalizedPlaces)}%`;
}

export function formatSignedUsdValue(
  value: number,
  places: number = DEFAULT_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedPlaces = normalizeDecimalPlaces(places);
  const rounded = getRounded(value, normalizedPlaces);

  if (isRoundedZero(rounded)) {
    return formatUsdValue(ZERO_AMOUNT, normalizedPlaces);
  }

  if (rounded > 0) {
    return `+${formatUsdValue(rounded, normalizedPlaces)}`;
  }

  return `-${formatUsdValue(Math.abs(rounded), normalizedPlaces)}`;
}

export function roundMoneyToPlaces(value: number, places: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(places)) {
    return ZERO_AMOUNT;
  }

  return getRounded(value, places);
}

export function calculateTotalTradeAmount(
  price: number,
  quantity: number,
): number {
  if (!areStrictPositiveFiniteScalars(price, quantity)) {
    return ZERO_AMOUNT;
  }

  const rawTradeAmount = price * quantity;

  return roundMoneyToPlaces(
    rawTradeAmount,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );
}

export function shouldWarnBudgetExceeded(
  input: TradeBudgetExceededInput,
): boolean {
  if (input.tradeType !== 'buy') {
    return false;
  }

  if (
    !areStrictPositiveFiniteScalars(
      input.price,
      input.quantity,
      input.dailyBuyAmount,
    )
  ) {
    return false;
  }

  const tradeAmount = calculateTotalTradeAmount(
    input.price,
    input.quantity,
  );
  const budgetAmount = roundMoneyToPlaces(
    input.dailyBuyAmount,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );

  return tradeAmount > budgetAmount;
}