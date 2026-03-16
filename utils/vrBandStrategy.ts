import type { OrderLevel, VrBandStrategyParams } from '../types';
import { getVrDeltaCashForNextV } from '../types';

/**
 * VR 밴드 전략 — Pool 변동액·N번 계산·표시용 Guard (순수 함수).
 * 매매 실행 로직에서 DRY·Fail-Fast 원칙 적용.
 */

/** 표시용 숫자 검증. 유효하지 않으면 console.error 후 null 반환(에러 은폐 없음). */
export function toDisplayNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    console.error('[VR] toDisplayNumber: invalid value received.', { value });
    return null;
  }
  return value;
}

/**
 * '예약 매수는 표의 N번까지 주문하세요'의 N. buyOrders 중 isBuffer === false 인 항목의 최대 step.
 * 비즈니스 연산은 UI가 아닌 유틸에서만 수행 (SRP).
 */
export function calculateMaxBuyStep(buyOrders: OrderLevel[]): number {
  const nonBuffer = buyOrders.filter((o) => !o.isBuffer);
  if (nonBuffer.length === 0) return 0;
  return Math.max(...nonBuffer.map((o) => toDisplayNumber(o.step) ?? 0));
}

/** 통합 검증 규칙: 각 키별로 min(이상) 또는 strictPositive(초과 0) 적용. */
export type FinancialArgRule = { min?: number; strictPositive?: boolean };

/**
 * 금융 인자 통합 밸리데이터. 객체 단위로 한 번에 검증하여 인지 복잡도·확장 비용을 낮춤.
 * @param args 검증할 키-숫자 쌍
 * @param rules 키별 규칙 (min: 이상, strictPositive: 0 초과)
 * @param context 에러 메시지 접두사(예: 'calculatePoolDelta')
 */
export function validateFinancialArgs(
  args: Record<string, number>,
  rules: Record<string, FinancialArgRule>,
  context: string
): void {
  const prefix = `[VR_Math_Error] ${context}: `;

  for (const key of Object.keys(rules)) {
    if (!(key in args)) {
      throw new Error(`${prefix}Required argument "${key}" is missing.`);
    }
  }

  for (const [name, value] of Object.entries(args)) {
    if (!(name in rules)) {
      throw new Error(
        `${prefix}Missing rule for "${name}". Every key in args must have a corresponding rule. Received args keys: ${Object.keys(args).join(', ')}.`
      );
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `${prefix}${name} must be a finite number. Received: ${JSON.stringify(args)}`
      );
    }
    const rule = rules[name];
    if (rule?.strictPositive && value <= 0) {
      throw new Error(
        `${prefix}${name} must be positive. Received: ${name}=${value}, full args: ${JSON.stringify(args)}`
      );
    }
    if (rule?.min !== undefined && value < rule.min) {
      throw new Error(
        `${prefix}${name} must be >= ${rule.min}. Received: ${name}=${value}, full args: ${JSON.stringify(args)}`
      );
    }
  }
}

/**
 * VR Pool 변동액(Delta). 매수 시 음수(비용), 매도 시 양수(수령액).
 * newPool = currentPool + calculatePoolDelta(...)
 *
 * Invariant Guard: price > 0, quantity > 0, feeRate >= 0. 통합 밸리데이터로 단일 검증.
 */
export function calculatePoolDelta(
  type: 'buy' | 'sell',
  price: number,
  quantity: number,
  feeRate: number
): number {
  const args = { price, quantity, feeRate };
  validateFinancialArgs(
    args,
    {
      price: { strictPositive: true },
      quantity: { strictPositive: true },
      feeRate: { min: 0 },
    },
    'calculatePoolDelta'
  );

  if (type === 'buy') {
    return -(price * quantity * (1 + feeRate));
  }
  return price * quantity * (1 - feeRate);
}

/**
 * V_next = V_current + Pool / G ± |deltaCash|
 * 적립식: +deltaCash, 인출식: -|deltaCash|, 거치식: 0.
 */
export function calculateNextV(
  currentV: number,
  pool: number,
  params: VrBandStrategyParams
): number {
  validateFinancialArgs(
    { currentV, pool, G: params.G },
    {
      currentV: {},
      pool: {},
      G: { strictPositive: true },
    },
    'calculateNextV'
  );

  const baseDelta = pool / params.G;
  const deltaCash = getVrDeltaCashForNextV(params);
  return currentV + baseDelta + deltaCash;
}

/** 비대칭 밴드 계산: bandLow = V * (1 - bandRateLower), bandHigh = V * (1 + bandRateUpper) */
export function calculateBands(
  v: number,
  bandRateUpper: number,
  bandRateLower: number
): { bandLow: number; bandHigh: number } {
  validateFinancialArgs(
    { v },
    { v: { strictPositive: true } },
    'calculateBands'
  );

  return {
    bandLow: v * (1 - bandRateLower),
    bandHigh: v * (1 + bandRateUpper),
  };
}

const MAX_ORDER_STEPS = 20;

type GenerateBuyOrdersParams = {
  shares: number;
  pool: number;
  bandLow: number;
  minOrderQty: number;
  feeRate: number;
  poolUsageRateBuy: number;
};

type GenerateSellOrdersParams = {
  shares: number;
  pool: number;
  bandHigh: number;
  minOrderQty: number;
  feeRate: number;
};

function roundPrice2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 밴드 하단(bandLow) 기준 매수 예약 주문 생성.
 * - 문서 §5.2, §5.3 규칙 준수
 * - Pool 사용 한도: Pool * poolUsageRateBuy, 버퍼 2개까지 isBuffer=true
 */
export function generateBuyOrders({
  shares,
  pool,
  bandLow,
  minOrderQty,
  feeRate,
  poolUsageRateBuy,
}: GenerateBuyOrdersParams): OrderLevel[] {
  validateFinancialArgs(
    { shares, pool, bandLow, minOrderQty, feeRate, poolUsageRateBuy },
    {
      shares: { min: 0 },
      pool: { min: 0 },
      bandLow: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: 0 },
      poolUsageRateBuy: { strictPositive: true },
    },
    'generateBuyOrders'
  );

  // Pool이 없으면 살 돈이 없으므로 빈 배열 반환
  if (pool <= 0) return [];

  const maxBuyBudget = pool * poolUsageRateBuy;
  const orders: OrderLevel[] = [];

  let cumulativeShares = shares;
  let cumulativeCost = 0;
  let bufferCount = 0;

  for (let k = 1; ; k += 1) {
    if (k > MAX_ORDER_STEPS) break;
    // 0주 보유 시 중복 가격 버그(Flat Spot)를 막기 위한 수학적 분기
    const effectiveShares =
      shares === 0 ? k * minOrderQty : shares + (k - 1) * minOrderQty;

    const targetPrice = bandLow / effectiveShares;
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) break;

    const price = roundPrice2(targetPrice);
    // 0달러(또는 이하) 호가 방어: 비용이 0이면 예산이 닳지 않아 무한 루프 위험
    if (price <= 0) break;
    const qty = minOrderQty;
    const orderCost = price * qty * (1 + feeRate);

    const nextCumulativeCost = cumulativeCost + orderCost;
    const isWithinBudget = nextCumulativeCost <= maxBuyBudget;
    if (!isWithinBudget) {
      bufferCount += 1;
    }

    cumulativeCost = nextCumulativeCost;
    cumulativeShares += qty;

    const poolAfter = pool - cumulativeCost;

    orders.push({
      step: k,
      price,
      qty,
      isBuffer: !isWithinBudget,
      sharesAfter: cumulativeShares,
      poolAfter,
    });

    if (!isWithinBudget && bufferCount >= 2) break;
  }

  return orders;
}

/**
 * 밴드 상단(bandHigh) 기준 매도 예약 주문 생성.
 * - 문서 §6.2, §6.3 규칙 준수
 * - 보유 주식이 소진되면 중단
 */
export function generateSellOrders({
  shares,
  pool,
  bandHigh,
  minOrderQty,
  feeRate,
}: GenerateSellOrdersParams): OrderLevel[] {
  validateFinancialArgs(
    { shares, pool, bandHigh, minOrderQty, feeRate },
    {
      shares: { min: 0 }, // 0주 보유 허용, 이후 로직에서 조용히 빈 배열 반환
      pool: { min: 0 },
      bandHigh: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: 0 },
    },
    'generateSellOrders'
  );

  // 0주이거나 최소 주문 수량이 유효하지 않으면 조용히 빈 배열 반환
  if (shares <= 0 || minOrderQty <= 0) return [];

  const orders: OrderLevel[] = [];

  let cumulativeSold = 0;
  let cumulativeProceeds = 0;

  for (let k = 1; ; k += 1) {
    if (k > MAX_ORDER_STEPS) break;
    const sharesBefore = shares - (k - 1) * minOrderQty;
    if (sharesBefore <= 0) break;

    const targetPrice = bandHigh / sharesBefore;
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) break;

    const price = roundPrice2(targetPrice);
    // 0달러(또는 이하) 매도 호가 방어: 브로커가 수용할 수 없는 주문은 생성하지 않음
    if (price <= 0) break;
    const qty = minOrderQty;

    cumulativeSold += qty;
    if (cumulativeSold > shares) break;

    const proceeds = price * qty * (1 - feeRate);
    cumulativeProceeds += proceeds;

    const sharesAfter = shares - cumulativeSold;
    const poolAfter = pool + cumulativeProceeds;

    orders.push({
      step: k,
      price,
      qty,
      isBuffer: false,
      sharesAfter,
      poolAfter,
    });

    if (sharesAfter <= 0) break;
  }

  return orders;
}
