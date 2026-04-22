import type { AppLang, Trade } from '@/types';
import { areStrictPositiveFiniteScalars } from '@/utils/financialScalarGuards';
import { floorToNonNegativeInt } from '@/utils/financialMath';
import { safeNumber } from '../components/StrategyCreator/utils';
import { roundMoneyToPlaces } from './financialCalculations';

const ZERO_AMOUNT = 0;
const DEFAULT_FEE_RATE_PERCENT = 0.25;
const PERCENT_DENOMINATOR = 100;
const MONEY_DECIMALS = 2;
const FEE_DECIMALS = 4;
const SHARE_DECIMALS = 1;
const SEC_FEE_RATE = 0.00003;
const MOC_SELL_RATIO = 0.25;
const MONTH_START_DAY = 1;

const DATE_LOCALE_MAP: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

export interface TradeFeePreviewInput {
  tradeType: Trade['type'];
  price: number;
  quantity: number;
  feeRatePercent: number;
}

export interface TradeSettlementPreviewInput {
  tradeType: Trade['type'];
  price: number;
  quantity: number;
  fee: number;
}

export interface TradeFeePreview {
  notional: number;
  commission: number;
  secFee: number;
  totalFee: number;
  totalSettlement: number;
}

export interface BudgetQuantityInput {
  price: number;
  dailyBuyAmount: number;
  feeRatePercent: number;
}

export interface BudgetWarningInput {
  tradeType: Trade['type'];
  totalSettlement: number;
  dailyBuyAmount: number;
}

function normalizeSignedZero(value: number): number {
  return value === 0 ? ZERO_AMOUNT : value;
}

function normalizeNonNegativeNumber(value: unknown): number {
  const parsed = safeNumber(value, ZERO_AMOUNT);
  if (!Number.isFinite(parsed)) {
    return ZERO_AMOUNT;
  }
  return Math.max(ZERO_AMOUNT, parsed);
}

export function roundTradeMoney(
  value: number,
  digits: number = MONEY_DECIMALS,
): number {
  return normalizeSignedZero(roundMoneyToPlaces(value, digits));
}

export function roundTradeQuantity(
  value: number,
  digits: number = SHARE_DECIMALS,
): number {
  return normalizeSignedZero(roundMoneyToPlaces(value, digits));
}

export function parseTradeNumericInput(raw: string): number {
  return normalizeNonNegativeNumber(raw);
}

export function formatUsd(
  value: number,
  digits: number = MONEY_DECIMALS,
): string {
  const rounded = roundTradeMoney(value, digits);
  return `$${rounded.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatShareQuantity(
  value: number,
  digits: number = SHARE_DECIMALS,
): string {
  return roundTradeQuantity(value, digits).toFixed(digits);
}

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, (month || MONTH_START_DAY) - 1, day || MONTH_START_DAY);
}

export function getMonthStartDateKey(dateKey: string): string {
  const date = dateKeyToLocalDate(dateKey);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function shiftMonthDateKey(
  monthStartDateKey: string,
  delta: number,
): string {
  const date = dateKeyToLocalDate(monthStartDateKey);
  const shifted = new Date(
    date.getFullYear(),
    date.getMonth() + delta,
    MONTH_START_DAY,
  );
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function formatTradeDateLabel(dateKey: string, lang: AppLang): string {
  const date = dateKeyToLocalDate(dateKey);
  return new Intl.DateTimeFormat(DATE_LOCALE_MAP[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatCalendarMonthLabel(
  monthStartDateKey: string,
  lang: AppLang,
): string {
  const date = dateKeyToLocalDate(monthStartDateKey);
  return new Intl.DateTimeFormat(DATE_LOCALE_MAP[lang], {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

export function buildTradeSettlementPreview(
  input: TradeSettlementPreviewInput,
): number {
  if (!areStrictPositiveFiniteScalars(input.price, input.quantity)) {
    return ZERO_AMOUNT;
  }

  const notional = roundTradeMoney(input.price * input.quantity, MONEY_DECIMALS);
  const normalizedFee = roundTradeMoney(
    normalizeNonNegativeNumber(input.fee),
    FEE_DECIMALS,
  );

  const rawSettlement =
    input.tradeType === 'buy'
      ? notional + normalizedFee
      : notional - normalizedFee;

  return roundTradeMoney(rawSettlement, MONEY_DECIMALS);
}

export function buildTradeFeePreview(
  input: TradeFeePreviewInput,
): TradeFeePreview {
  if (!areStrictPositiveFiniteScalars(input.price, input.quantity)) {
    return {
      notional: ZERO_AMOUNT,
      commission: ZERO_AMOUNT,
      secFee: ZERO_AMOUNT,
      totalFee: ZERO_AMOUNT,
      totalSettlement: ZERO_AMOUNT,
    };
  }

  const normalizedFeeRatePercent = normalizeNonNegativeNumber(
    input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT,
  );
  const notional = roundTradeMoney(input.price * input.quantity, MONEY_DECIMALS);
  const commission = roundTradeMoney(
    notional * (normalizedFeeRatePercent / PERCENT_DENOMINATOR),
    FEE_DECIMALS,
  );
  const secFee =
    input.tradeType === 'sell'
      ? roundTradeMoney(notional * SEC_FEE_RATE, FEE_DECIMALS)
      : ZERO_AMOUNT;
  const totalFee = roundTradeMoney(commission + secFee, FEE_DECIMALS);

  return {
    notional,
    commission,
    secFee,
    totalFee,
    totalSettlement: buildTradeSettlementPreview({
      tradeType: input.tradeType,
      price: input.price,
      quantity: input.quantity,
      fee: totalFee,
    }),
  };
}

export function shouldWarnTradeBudgetExceeded(
  input: BudgetWarningInput,
): boolean {
  if (input.tradeType !== 'buy') {
    return false;
  }

  if (
    !areStrictPositiveFiniteScalars(
      input.totalSettlement,
      input.dailyBuyAmount,
    )
  ) {
    return false;
  }

  const normalizedSettlement = roundTradeMoney(input.totalSettlement, MONEY_DECIMALS);
  const normalizedBudget = roundTradeMoney(input.dailyBuyAmount, MONEY_DECIMALS);

  return normalizedSettlement > normalizedBudget;
}

export function calculateBudgetBuyQuantity(input: BudgetQuantityInput): number {
  if (!areStrictPositiveFiniteScalars(input.price, input.dailyBuyAmount)) {
    return ZERO_AMOUNT;
  }

  const normalizedBudget = roundTradeMoney(input.dailyBuyAmount, MONEY_DECIMALS);
  const feeRatePercentNormalized = normalizeNonNegativeNumber(
    input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT,
  );
  const feeRateFraction = feeRatePercentNormalized / PERCENT_DENOMINATOR;
  const unitCostMultiplier = 1 + feeRateFraction;

  if (!Number.isFinite(unitCostMultiplier) || unitCostMultiplier <= 0) {
    return ZERO_AMOUNT;
  }

  const theoreticalQuantity = floorToNonNegativeInt(
    normalizedBudget / (input.price * unitCostMultiplier),
  );

  let quantity = theoreticalQuantity;
  while (quantity > 0) {
    const preview = buildTradeFeePreview({
      tradeType: 'buy',
      price: input.price,
      quantity,
      feeRatePercent: input.feeRatePercent,
    });

    if (preview.totalSettlement <= normalizedBudget) {
      return quantity;
    }

    quantity -= 1;
  }

  return ZERO_AMOUNT;
}

export function calculateMocSellQuantity(holdingQuantity: number): number {
  if (!areStrictPositiveFiniteScalars(holdingQuantity)) {
    return ZERO_AMOUNT;
  }

  return roundTradeQuantity(holdingQuantity * MOC_SELL_RATIO, SHARE_DECIMALS);
}

export function createTradeId(): string {
  return crypto.randomUUID();
}