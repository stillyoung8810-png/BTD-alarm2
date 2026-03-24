import type { AppLang, OrderLevel, VrBandStrategyParams, VrSnapshot, Trade } from './types.ts';
import { getVrDeltaCashForNextV } from './types.ts';
import { TIME_MS, VR_CYCLE } from './vrConstants.ts';

/**
 * VR 밴드 전략 — Pool 변동액·N번 계산·표시용 Guard (순수 함수).
 * 매매 실행 로직에서 DRY·Fail-Fast 원칙 적용.
 */

/** 부동소수점 오차 방어: 소수점 2자리까지 반올림 (금융 계산 전용). */
export const toFixedMoney = (val: number): number =>
  Math.round((val + Number.EPSILON) * 100) / 100;

/** 통화 표시 전용 (내부 금융 연산은 toFixedMoney). */
export function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 부동소수점 오차를 방어하며 4자리까지 표시하는 수량 포맷터 */
export const formatSharesDisplay = (val: number): string =>
  (Math.round((val + Number.EPSILON) * 10000) / 10000).toFixed(4);

/** vrMode에 따라 deltaCash 부호를 강제 정규화. 인출=음수, 적립=양수, 거치=0. */
export function getSanitizedDeltaCash(
  mode: VrBandStrategyParams['vrMode'],
  amount: number
): number {
  if (mode === 'lump_sum') return 0;
  return mode === 'withdraw' ? -Math.abs(amount) : Math.abs(amount);
}

/**
 * [DRY/SSOT] 두 날짜(UTC ms) 사이의 리밸런싱 사이클 인덱스를 계산.
 * 프론트엔드(getVrCyclePeriodText)와 백엔드(calculateNextCycleIndex) 공통 사용.
 * T+1 Forward Calculation: 사이클 마지막 날에 다음 회차로 미리 선행 판정.
 */
export function calculateCycleIndexFromDates(
  startDateMs: number,
  targetDateMs: number,
  cycleWeeks: number,
): number {
  if (cycleWeeks <= 0) return 0;
  const diffMs = targetDateMs - startDateMs;
  if (diffMs < 0) return 0;
  const cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK;
  return Math.floor((diffMs + TIME_MS.PER_DAY) / cycleLengthMs);
}

/**
 * 알 수 없는 입력을 1~12주 정수로 정규화 (SSOT). VR_CYCLE만 참조.
 */
export function sanitizeVrCycleWeeks(weeks: unknown): number {
  const parsed = Number(weeks);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return VR_CYCLE.DEFAULT_WEEKS;
  }
  return Math.max(
    VR_CYCLE.MIN_WEEKS,
    Math.min(VR_CYCLE.MAX_WEEKS, Math.floor(parsed)),
  );
}

export interface VrCycleTextOptions {
  startDate: string;
  cycleWeeks: number;
  currentCycleIndex?: number;
  lang?: AppLang;
  timezone?: string;
  cycleFormat?: (cycleIndex: number, start: string, end: string) => string;
}

/**
 * 리밸런싱 사이클 기간 표시 문자열. UI 문구는 cycleFormat 주입으로만 처리 (딕셔너리 import 금지).
 */
export function getVrCyclePeriodText({
  startDate,
  cycleWeeks,
  currentCycleIndex,
  lang = 'ko',
  timezone = 'UTC',
  cycleFormat,
}: VrCycleTextOptions): string {
  if (!startDate) return '-';
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '-';

  const safeWeeks = sanitizeVrCycleWeeks(cycleWeeks);

  let cycleIndex = 0;

  if (currentCycleIndex !== undefined && currentCycleIndex >= 0) {
    cycleIndex = currentCycleIndex;
  } else {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;

    if (!y || !m || !d) {
      console.error('[VR_Timezone_Error] Date formatting failed', { y, m, d });
      return '-';
    }

    const logicalToday = new Date(`${y}-${m}-${d}T00:00:00Z`);
    cycleIndex = calculateCycleIndexFromDates(
      start.getTime(),
      logicalToday.getTime(),
      safeWeeks,
    );
  }

  const cycleStart = new Date(
    start.getTime() + cycleIndex * safeWeeks * TIME_MS.PER_WEEK,
  );

  const cycleEnd = new Date(cycleStart.getTime());
  const DAYS_PER_WEEK = 7;
  cycleEnd.setUTCDate(
    cycleStart.getUTCDate() + safeWeeks * DAYS_PER_WEEK - 1,
  );

  const formatMD = (d: Date) => {
    try {
      const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
      }).format(d);
    } catch {
      console.warn(
        `[VR_Timezone_Error] Invalid timezone "${timezone}". Falling back to UTC.`,
      );
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'numeric',
        day: 'numeric',
      }).format(d);
    }
  };

  const defaultFormatter = (idx: number, s: string, e: string) =>
    `Cycle ${idx}: ${s} ~ ${e}`;
  const formatter = cycleFormat ?? defaultFormatter;
  return formatter(cycleIndex + 1, formatMD(cycleStart), formatMD(cycleEnd));
}

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
  return toFixedMoney(currentV + baseDelta + deltaCash);
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
    bandLow: toFixedMoney(v * (1 - bandRateLower)),
    bandHigh: toFixedMoney(v * (1 + bandRateUpper)),
  };
}

/**
 * 단일 Trade 이후 VR 스냅샷 갱신.
 * - currentSnapshot이 없을 때: 첫 진입으로 간주, shares/avgPrice는 0에서 시작.
 * - params.initialV / params.initialCapital을 기반으로 currentV, pool 기본값 설정.
 */
export function computeVrSnapshotAfterTrade(
  currentSnapshot: VrSnapshot | null | undefined,
  trade: Trade,
  newPool: number,
  params: VrBandStrategyParams,
): VrSnapshot {
  const prev: VrSnapshot | null = currentSnapshot ?? null;
  const prevShares = prev?.shares ?? 0;
  const prevAvgPrice = prev?.avgPrice ?? 0;

  const { type, price, quantity } = trade;
  validateFinancialArgs(
    {
      price,
      quantity,
      feeRate: params.feeRate,
      newPool,
    },
    {
      price: { strictPositive: true },
      quantity: { strictPositive: true },
      feeRate: { min: 0 },
      newPool: {},
    },
    'computeVrSnapshotAfterTrade',
  );

  let shares = prevShares;
  let avgPrice = prevAvgPrice;

  if (type === 'buy') {
    const totalCost = price * quantity;
    const newShares = prevShares + quantity;
    if (newShares > 0) {
      const prevCost = prevShares * prevAvgPrice;
      avgPrice = toFixedMoney((prevCost + totalCost) / newShares);
    } else {
      avgPrice = 0;
    }
    shares = newShares;
  } else if (type === 'sell') {
    const newShares = prevShares - quantity;
    shares = Math.max(0, newShares);
    if (shares <= 0) {
      avgPrice = 0;
    }
  }

  // [사이클 고정 원칙] 체결 시에는 pool/shares/avgPrice만 갱신하고,
  // currentV, 밴드, 주문표는 이전 스냅샷 값을 그대로 유지한다.
  if (!prev) {
    // prevSnapshot이 없는 경우에는 initial 값 기반의 최소 스냅샷을 생성한다.
    return {
      currentV: params.initialV,
      pool: newPool,
      shares,
      avgPrice,
      bandLow: toFixedMoney(
        params.initialV * (1 - params.bandRateLower),
      ),
      bandHigh: toFixedMoney(
        params.initialV * (1 + params.bandRateUpper),
      ),
      buyOrders: [],
      sellOrders: [],
    };
  }

  const isFirstBuy = type === 'buy' && prevShares <= 0 && shares > 0;

  let nextBuyOrders = prev.buyOrders;
  let nextSellOrders = prev.sellOrders;

  // [First Buy Exception] 최초 매수 체결 시에만 현재 보유량 기준으로 주문표를 1회 재생성
  if (isFirstBuy) {
    nextBuyOrders = generateBuyOrders({
      shares,
      pool: newPool,
      bandLow: prev.bandLow,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
      poolUsageRateBuy: params.poolUsageRateBuy,
    });

    nextSellOrders = generateSellOrders({
      shares,
      pool: newPool,
      bandHigh: prev.bandHigh,
      minOrderQty: params.minOrderQty,
      feeRate: params.feeRate,
    });
  }

  return {
    ...prev,
    pool: newPool,
    shares,
    avgPrice,
    currentV: prev.currentV,
    bandLow: prev.bandLow,
    bandHigh: prev.bandHigh,
    buyOrders: nextBuyOrders,
    sellOrders: nextSellOrders,
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

  const maxBuyBudget = toFixedMoney(pool * poolUsageRateBuy);
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

    const price = toFixedMoney(targetPrice);
    // 0달러(또는 이하) 호가 방어: 비용이 0이면 예산이 닳지 않아 무한 루프 위험
    if (price <= 0) break;
    const qty = minOrderQty;
    const orderCost = toFixedMoney(price * qty * (1 + feeRate));
    // OOM 방어: 비용 소모가 없으면 예산이 닳지 않아 무한 루프 위험 (minOrderQty 등 비정상 입력 최후 보루)
    if (orderCost <= 0) break;

    const nextCumulativeCost = toFixedMoney(cumulativeCost + orderCost);
    const isWithinBudget = nextCumulativeCost <= maxBuyBudget;
    if (!isWithinBudget) {
      bufferCount += 1;
    }

    cumulativeCost = nextCumulativeCost;
    cumulativeShares += qty;

    const poolAfter = toFixedMoney(pool - cumulativeCost);

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

    const price = toFixedMoney(targetPrice);
    // 0달러(또는 이하) 매도 호가 방어: 브로커가 수용할 수 없는 주문은 생성하지 않음
    if (price <= 0) break;
    const qty = minOrderQty;

    cumulativeSold += qty;
    if (cumulativeSold > shares) break;

    const proceeds = toFixedMoney(price * qty * (1 - feeRate));
    // OOM 방어: 대금이 0 이하면 Pool 누적이 멈추지 않거나 의미 없는 스텝만 반복될 수 있음
    if (proceeds <= 0) break;
    cumulativeProceeds = toFixedMoney(cumulativeProceeds + proceeds);

    const sharesAfter = shares - cumulativeSold;
    const poolAfter = toFixedMoney(pool + cumulativeProceeds);

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

/**
 * Cycle 0 시딩용 최초 VR 스냅샷. 밴드·주문표는 기존 유틸만 재사용.
 */
export function createInitialVrSnapshot(
  params: VrBandStrategyParams,
): VrSnapshot {
  const { bandLow, bandHigh } = calculateBands(
    params.initialV,
    params.bandRateUpper,
    params.bandRateLower,
  );

  const buyOrders = generateBuyOrders({
    bandLow,
    pool: params.initialCapital,
    shares: 0,
    ...params,
  });

  const sellOrders = generateSellOrders({
    bandHigh,
    pool: params.initialCapital,
    shares: 0,
    ...params,
  });

  return {
    cycleIndex: 0,
    currentV: params.initialV,
    pool: params.initialCapital,
    shares: 0,
    avgPrice: 0,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
  };
}
