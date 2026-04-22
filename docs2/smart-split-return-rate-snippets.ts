/**
 * Smart Split return-rate expansion — simulation-only snippets.
 * 목적: Step 2에서 타입/검증/I18N 구조를 안전하게 검증하기 위한 최소 단위.
 */

import { roundMoney } from '../constants/domain/financeRules';
import { validateFinancialArgs } from '../utils/vrBandStrategy';

const MIN_MAIN_RETURN_RATE_PCT = 10;
const MAX_MAIN_RETURN_RATE_PCT = 100;
const MIN_INTERMEDIATE_RETURN_RATE_PCT = 1;
const MAX_INTERMEDIATE_RETURN_RATE_PCT = 10;
const PERCENT_DENOMINATOR = 100;
const MIN_VALID_PRICE = Number.EPSILON;
const MIN_DISPLAY_QUANTITY = 0;

export type SmartSplitSnippetLang = 'ko' | 'en';

export interface MultiSplitStrategyDraftSnippet {
  targetStock: string;
  targetReturnRate: number;
  intermediateReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}

export interface MultiSplitStrategyRuntimeSnippet {
  targetStock: string;
  targetReturnRate: number;
  intermediateReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}

export interface NormalizedMultiSplitReturnRatesSnippet {
  targetReturnRate: number;
  intermediateReturnRate: number;
  didClamp: boolean;
}

export function validateMultiSplitReturnRates(args: {
  targetReturnRate: number;
  intermediateReturnRate: number;
  context: string;
}): void {
  validateFinancialArgs(
    {
      targetReturnRate: args.targetReturnRate,
      intermediateReturnRate: args.intermediateReturnRate,
    },
    {
      targetReturnRate: { min: MIN_MAIN_RETURN_RATE_PCT },
      intermediateReturnRate: { min: MIN_INTERMEDIATE_RETURN_RATE_PCT },
    },
    args.context,
  );

  if (args.targetReturnRate > MAX_MAIN_RETURN_RATE_PCT) {
    throw new Error(
      `${args.context}.targetReturnRate must be <= ${MAX_MAIN_RETURN_RATE_PCT}. Received: ${args.targetReturnRate}`,
    );
  }

  if (args.intermediateReturnRate > MAX_INTERMEDIATE_RETURN_RATE_PCT) {
    throw new Error(
      `${args.context}.intermediateReturnRate must be <= ${MAX_INTERMEDIATE_RETURN_RATE_PCT}. Received: ${args.intermediateReturnRate}`,
    );
  }
}

function clampFiniteNumberToRange(args: {
  value: number;
  min: number;
  max: number;
  context: string;
}): { value: number; didClamp: boolean } {
  validateFinancialArgs(
    {
      min: args.min,
      max: args.max,
    },
    {
      min: { min: MIN_DISPLAY_QUANTITY },
      max: { strictPositive: true },
    },
    args.context,
  );

  if (!Number.isFinite(args.value)) {
    throw new Error(
      `${args.context}.value must be a finite number. Received: ${args.value}`,
    );
  }

  if (args.min > args.max) {
    throw new Error(
      `${args.context}.min must be <= max. Received: ${args.min} > ${args.max}`,
    );
  }

  const clampedValue = Math.min(args.max, Math.max(args.min, args.value));
  return {
    value: clampedValue,
    didClamp: clampedValue !== args.value,
  };
}

export function normalizeMultiSplitReturnRates(args: {
  targetReturnRate: number;
  intermediateReturnRate: number;
}): NormalizedMultiSplitReturnRatesSnippet {
  const normalizedTargetReturnRate = clampFiniteNumberToRange({
    value: args.targetReturnRate,
    min: MIN_MAIN_RETURN_RATE_PCT,
    max: MAX_MAIN_RETURN_RATE_PCT,
    context: 'normalizeMultiSplitReturnRates.targetReturnRate',
  });
  const normalizedIntermediateReturnRate = clampFiniteNumberToRange({
    value: args.intermediateReturnRate,
    min: MIN_INTERMEDIATE_RETURN_RATE_PCT,
    max: MAX_INTERMEDIATE_RETURN_RATE_PCT,
    context: 'normalizeMultiSplitReturnRates.intermediateReturnRate',
  });
  const didClamp =
    normalizedTargetReturnRate.didClamp ||
    normalizedIntermediateReturnRate.didClamp;

  return {
    targetReturnRate: normalizedTargetReturnRate.value,
    intermediateReturnRate: normalizedIntermediateReturnRate.value,
    didClamp,
  };
}

export interface MultiSplitDisplayQuantityOnlySnippet {
  quantity: number;
}

export interface MultiSplitDisplayPriceQuantitySnippet {
  price: number;
  quantity: number;
}

export interface MultiSplitExecutionEmptyStateSnippet {
  kind: 'empty';
  message: string;
}

export interface MultiSplitExecutionReadyStateSnippet {
  kind: 'ready';
  mainTakeProfit: MultiSplitDisplayPriceQuantitySnippet | undefined;
  intermediateTakeProfit: MultiSplitDisplayPriceQuantitySnippet | undefined;
}

function floorSafeQuantitySnippet(value: number): number {
  if (!Number.isFinite(value) || value < MIN_DISPLAY_QUANTITY) {
    return MIN_DISPLAY_QUANTITY;
  }

  return Math.max(
    MIN_DISPLAY_QUANTITY,
    Math.floor(value + Number.EPSILON),
  );
}

export function buildDisplayQuantityOnlyAllowZero(
  quantity: number,
): MultiSplitDisplayQuantityOnlySnippet {
  return {
    quantity: floorSafeQuantitySnippet(quantity),
  };
}

export function buildDisplayPriceQuantityAllowZero(args: {
  price: number;
  quantity: number;
  context: string;
}): MultiSplitDisplayPriceQuantitySnippet | undefined {
  validateFinancialArgs(
    {
      price: args.price,
      quantity: args.quantity,
    },
    {
      price: { strictPositive: true },
      quantity: { min: MIN_DISPLAY_QUANTITY },
    },
    args.context,
  );

  if (args.price <= MIN_VALID_PRICE) {
    return undefined;
  }

  const roundedPrice = roundMoney(args.price);
  if (roundedPrice <= MIN_DISPLAY_QUANTITY) {
    return undefined;
  }

  return {
    price: roundedPrice,
    quantity: floorSafeQuantitySnippet(args.quantity),
  };
}

export function buildTakeProfitPrice(args: {
  avgPrice: number;
  returnRate: number;
  context: string;
}): number {
  validateFinancialArgs(
    {
      avgPrice: args.avgPrice,
      returnRate: args.returnRate,
    },
    {
      avgPrice: { strictPositive: true },
      returnRate: { min: MIN_DISPLAY_QUANTITY },
    },
    args.context,
  );

  const rawPrice =
    args.avgPrice * (1 + args.returnRate / PERCENT_DENOMINATOR);
  return Math.max(MIN_VALID_PRICE, rawPrice);
}

export function buildTakeProfitDisplays(args: {
  avgPrice: number;
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  targetReturnRate: number;
  intermediateReturnRate: number;
}): {
  mainTakeProfit: MultiSplitDisplayPriceQuantitySnippet | undefined;
  intermediateTakeProfit: MultiSplitDisplayPriceQuantitySnippet | undefined;
} {
  validateMultiSplitReturnRates({
    targetReturnRate: args.targetReturnRate,
    intermediateReturnRate: args.intermediateReturnRate,
    context: 'buildTakeProfitDisplays',
  });

  const mainPrice = buildTakeProfitPrice({
    avgPrice: args.avgPrice,
    returnRate: args.targetReturnRate,
    context: 'buildTakeProfitDisplays.main',
  });
  const intermediatePrice = buildTakeProfitPrice({
    avgPrice: args.avgPrice,
    returnRate: args.intermediateReturnRate,
    context: 'buildTakeProfitDisplays.intermediate',
  });

  return {
    mainTakeProfit: buildDisplayPriceQuantityAllowZero({
      price: mainPrice,
      quantity: args.mainTakeProfitQty,
      context: 'buildTakeProfitDisplays.main',
    }),
    intermediateTakeProfit: buildDisplayPriceQuantityAllowZero({
      price: intermediatePrice,
      quantity: args.intermediateTakeProfitQty,
      context: 'buildTakeProfitDisplays.intermediate',
    }),
  };
}

export function buildSmartSplitExecutionState(args: {
  lang: SmartSplitSnippetLang;
  currentQuantity: number;
  avgPrice: number;
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  targetReturnRate: number;
  intermediateReturnRate: number;
}):
  | MultiSplitExecutionEmptyStateSnippet
  | MultiSplitExecutionReadyStateSnippet {
  if (
    args.currentQuantity <= MIN_DISPLAY_QUANTITY ||
    args.avgPrice <= MIN_VALID_PRICE
  ) {
    return {
      kind: 'empty',
      message: SMART_SPLIT_I18N_COPY[args.lang].noHoldings,
    };
  }

  const normalizedReturnRates = normalizeMultiSplitReturnRates({
    targetReturnRate: args.targetReturnRate,
    intermediateReturnRate: args.intermediateReturnRate,
  });
  validateMultiSplitReturnRates({
    targetReturnRate: normalizedReturnRates.targetReturnRate,
    intermediateReturnRate: normalizedReturnRates.intermediateReturnRate,
    context: 'buildSmartSplitExecutionState',
  });
  const takeProfitDisplays = buildTakeProfitDisplays({
    avgPrice: args.avgPrice,
    mainTakeProfitQty: args.mainTakeProfitQty,
    intermediateTakeProfitQty: args.intermediateTakeProfitQty,
    targetReturnRate: normalizedReturnRates.targetReturnRate,
    intermediateReturnRate: normalizedReturnRates.intermediateReturnRate,
  });

  return {
    kind: 'ready',
    mainTakeProfit: takeProfitDisplays.mainTakeProfit,
    intermediateTakeProfit: takeProfitDisplays.intermediateTakeProfit,
  };
}

export const SMART_SPLIT_I18N_COPY: Record<
  SmartSplitSnippetLang,
  {
    targetReturnRate: string;
    intermediateReturnRate: string;
    baseLocRatio: string;
    riskCutRatioPctHelper: string;
    outOfRangeToast: string;
    noHoldings: string;
  }
> = {
  ko: {
    targetReturnRate: '목표 수익률 (A %)',
    intermediateReturnRate: '중간 익절 수익률 (B %)',
    baseLocRatio: '평단가 매수 비율 (LOC 주문) (%)',
    riskCutRatioPctHelper: '현금 소진시, 손절할 보유 물량 비율',
    outOfRangeToast: '설정 범위를 벗어 났어요.',
    noHoldings: '보유 수량이 없습니다.',
  },
  en: {
    targetReturnRate: 'Target Return Rate (A %)',
    intermediateReturnRate: 'Intermediate Take-Profit Return (B %)',
    baseLocRatio: 'Average Price Buy Ratio (LOC Order) (%)',
    riskCutRatioPctHelper: 'Ratio of holdings to cut when cash is exhausted.',
    outOfRangeToast: 'The value is outside the allowed range.',
    noHoldings: 'There is no holding quantity.',
  },
} as const;
