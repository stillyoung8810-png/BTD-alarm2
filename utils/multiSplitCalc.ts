/**
 * 다분할 매매법(Multi-Split Trading) 공용 계산 모듈
 *
 * Dashboard.tsx(클라이언트)와 generate-daily-execution-summaries/index.ts(서버)에서
 * 동일한 순수 함수를 사용하여 로직 불일치를 방지합니다.
 *
 * 모든 함수는 **순수 함수**입니다 (side effect 없음, 입력만으로 출력 결정).
 */

import {
  areFiniteNonNegativeScalars,
  areStrictPositiveFiniteScalars,
} from './financialScalarGuards';
import {
  ceilToTwoDecimals,
  floorToNonNegativeInt,
  roundMoney,
} from './financialMath';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** LOC 매도 비율 (보유 수량 중 LOC 매도에 할당할 비율) */
export const LOC_SELL_RATIO = 0.25;

/** 쿼터모드 LOC 매수/매도 가격 계수 (평단가 대비 비율) */
export const QUARTER_LOC_PRICE_FACTOR = 0.9;

/** LOC 매수가 오프셋 ($) - LOC 매도가에서 이만큼 차감 */
export const LOC_PRICE_OFFSET = 0.01;

/** 쿼터모드 분할 횟수 (MOC 매도 후 잔금을 이 수로 나눔) */
export const QUARTER_SPLIT_COUNT = 10;

/** MOC 매도 기록 확인 기간 (최근 N 영업일) */
export const RECENT_TRADING_DAYS_COUNT = 11;

/** 전반전 매수 분할 비율 (0.5 + 0.5) */
export const FIRST_HALF_BUY_RATIO = 0.5;

/** 최소 가격 ($) */
export const MIN_PRICE = 0.01;

// ---------------------------------------------------------------------------
// 타입 (클라이언트/서버 공용 — 외부 타입 의존 없이 자체 정의)
// ---------------------------------------------------------------------------

/** 거래 데이터 (Portfolio.trades 요소와 호환) */
export interface TradeInput {
  type: 'buy' | 'sell';
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean;
}

/** 수량/원가가 이 값 미만이면 0으로 간주 (부동소수점 방어) */
const HOLDINGS_QTY_EPSILON = 1e-10;

/** 보유 내역 */
export interface HoldingsResult {
  stock: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
  /** 매도 시 역산한 누적 실현손익 (이동평균법 기반). 전량 매도된 종목도 포함. */
  realizedPnL?: number;
}

/** 다분할 전략 파라미터 */
export interface MultiSplitParams {
  targetStock: string;
  targetReturnRate: number; // A (%)
  totalSplitCount: number;  // a
}

/** 주문 데이터 (가격 + 수량) */
export interface OrderEntry {
  price: number;
  quantity: number;
}

/** 쿼터 손절 모드 데이터 */
export interface QuarterStopLossResult {
  hasMOC: boolean;
  mocQuantity?: number;
  newOneTimeAmount?: number;
  locBuy?: OrderEntry;
  locSell?: OrderEntry;
  limitSell?: OrderEntry;
}

/** 전반전/후반전 주문 실행 데이터 */
export interface MultiSplitExecutionResult {
  phase: 'first' | 'second' | 'quarter' | null;
  locBuy1?: OrderEntry;
  locBuy2?: OrderEntry;
  locSell?: OrderEntry;
  limitSell?: OrderEntry;
  mocSell?: { quantity: number };
}

/** MOC 매도 기록 확인 결과 */
export interface MOCSellCheckResult {
  hasMOC: boolean;
  mocDate?: string;
}

// ---------------------------------------------------------------------------
// 순수 함수: 보유 내역 계산
// ---------------------------------------------------------------------------

/**
 * 거래 목록에서 현재 보유 내역을 계산합니다.
 * 매수 시 총비용에 수수료 포함, 매도 시 평균단가 비례 차감.
 * 매도 시 실현손익을 역산하여 종목별 realizedPnL에 누적합니다.
 */
export function calcHoldings(trades: TradeInput[]): HoldingsResult[] {
  const map: Record<string, { quantity: number; totalCost: number; realizedPnL: number }> = {};

  for (const trade of trades) {
    if (trade.type === 'buy') {
      if (!map[trade.stock]) {
        map[trade.stock] = { quantity: 0, totalCost: 0, realizedPnL: 0 };
      }
      map[trade.stock].quantity += trade.quantity;
      map[trade.stock].totalCost += trade.price * trade.quantity + Math.abs(trade.fee);
    } else if (trade.type === 'sell') {
      if (map[trade.stock]) {
        const prev = map[trade.stock];
        if (prev.quantity < 0 || prev.quantity < trade.quantity) {
          throw new Error(`[${trade.stock}] 초과 매도 에러: 시도수량=${trade.quantity}, 보유수량=${prev.quantity}`);
        }
        const currentAvgPrice = prev.quantity > HOLDINGS_QTY_EPSILON ? prev.totalCost / prev.quantity : 0;
        const revenue = trade.price * trade.quantity - Math.abs(trade.fee);
        const costBasis = currentAvgPrice * trade.quantity;
        prev.realizedPnL += revenue - costBasis;

        const avgPrice = currentAvgPrice;
        prev.quantity -= trade.quantity;
        if (prev.quantity <= 0 || Math.abs(prev.quantity) < HOLDINGS_QTY_EPSILON) {
          prev.quantity = 0;
          prev.totalCost = 0;
        } else {
          prev.totalCost = prev.quantity * avgPrice;
        }
      }
    }
  }

  return Object.entries(map).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice: data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
    realizedPnL: roundMoney(data.realizedPnL),
  }));
}

// ---------------------------------------------------------------------------
// 순수 함수: T (현재 시행 회차) 계산
// ---------------------------------------------------------------------------

/**
 * 현재 시행 회차(T)를 계산합니다.
 * T = ceil(총 보유 투자금 / 1회 매수금 * 100) / 100
 */
export function calcT(trades: TradeInput[], dailyBuyAmount: number): number {
  if (!areStrictPositiveFiniteScalars(dailyBuyAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  if (!areStrictPositiveFiniteScalars(totalInvested)) {
    return 0;
  }

  return ceilToTwoDecimals(totalInvested / dailyBuyAmount);
}

// ---------------------------------------------------------------------------
// 순수 함수: 구간 판별
// ---------------------------------------------------------------------------

/**
 * T와 a를 기준으로 현재 구간을 판별합니다.
 * - 전반전: 0.5 <= T < a/2
 * - 후반전: a/2 <= T <= a-1
 * - 쿼터: a-1 < T <= a
 */
export function getPhase(T: number, a: number): 'first' | 'second' | 'quarter' | null {
  if (T >= 0.5 && T < a / 2) return 'first';
  if (T >= a / 2 && T <= a - 1) return 'second';
  if (T > a - 1 && T <= a) return 'quarter';
  return null;
}

// ---------------------------------------------------------------------------
// 순수 함수: MOC 매도 기록 확인
// ---------------------------------------------------------------------------

/**
 * 최근 영업일 내 MOC 매도 기록이 있는지 확인합니다.
 * @returns hasMOC: 여부, mocDate: 가장 최근 MOC 매도 날짜
 */
export function checkRecentMOCSell(
  trades: TradeInput[],
  recentTradingDays: string[],
): MOCSellCheckResult {
  if (recentTradingDays.length === 0) return { hasMOC: false };

  const mocSells = trades.filter(
    (t) => t.type === 'sell' && t.isMOC === true && recentTradingDays.includes(t.date),
  );

  if (mocSells.length === 0) return { hasMOC: false };

  const sorted = [...mocSells].sort((a, b) => b.date.localeCompare(a.date));
  return { hasMOC: true, mocDate: sorted[0].date };
}

// ---------------------------------------------------------------------------
// 순수 함수: 중간 매매 손익 계산
// ---------------------------------------------------------------------------

/**
 * 특정 날짜(sinceDate) 이후에 추가된 실현손익을 계산합니다 (O(N)).
 * calcHoldings(전체)와 calcHoldings(sinceDate 이전)의 realizedPnL 합 차액으로 구합니다.
 * sinceDate 이후 매수(물타기)가 있으면 변경된 평단가가 반영됩니다.
 *
 * - 사전 정렬: date 오름차순, 동일일 시 buy → sell 순 (calcHoldings 순서 민감도 대비).
 * - 부동소수점 방어: 반환 직전 `roundMoney(...)` 적용.
 * 음수(손실)도 포함됩니다.
 */
export function calcIntermediateProfit(
  trades: TradeInput[],
  sinceDate: string,
): number {
  const sorted = [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.type === 'buy' && b.type === 'sell') return -1;
    if (a.type === 'sell' && b.type === 'buy') return 1;
    return 0;
  });

  const tradesUpTo = sorted.filter((t) => t.date <= sinceDate);
  const holdingsFull = calcHoldings(sorted);
  const holdingsUpTo = calcHoldings(tradesUpTo);

  const totalRealized = holdingsFull.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);
  const realizedUpTo = holdingsUpTo.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);

  return roundMoney(totalRealized - realizedUpTo);
}

// ---------------------------------------------------------------------------
// 순수 함수: 쿼터모드 1회 매수금 재계산
// ---------------------------------------------------------------------------

/**
 * 쿼터 손절 모드에서 MOC 매도 후 새로운 1회 매수금을 계산합니다.
 * 새로운 1회 매수금 = [잔금 + MOC 매도 금액] / 10
 *
 * 잔금 C_current = C_init - Σ(E_buy) + Σ(E_sell)
 * - C_init: 초기 자본금 = 1회 매수금 × a
 * - E_buy: 매수 체결 금액 (주가×수량 + 수수료)
 * - E_sell: 매도 체결 금액 (주가×수량 - 수수료)
 *
 * 구현: 잔금 = C_init - Σ(E_buy) + Σ(MOC 제외 E_sell), MOC 매도 금액 = Σ(MOC인 E_sell)
 * → (잔금 + MOC 매도 금액) / 10 = C_current / 10
 */
export function calcNewOneTimeAmount(
  trades: TradeInput[],
  dailyBuyAmount: number,
  totalSplitCount: number,
  _mocDate: string,
): number {
  if (!areStrictPositiveFiniteScalars(dailyBuyAmount, totalSplitCount)) {
    return 0;
  }

  const C_init = dailyBuyAmount * totalSplitCount;

  const sumEbuy = trades
    .filter((t) => t.type === 'buy')
    .reduce((sum, t) => sum + t.price * t.quantity + Math.abs(t.fee), 0);

  const sells = trades.filter((t) => t.type === 'sell');
  const sumEsellNonMOC = sells
    .filter((t) => !t.isMOC)
    .reduce((sum, t) => sum + t.price * t.quantity - Math.abs(t.fee), 0);
  const mocSellAmount = sells
    .filter((t) => t.isMOC)
    .reduce((sum, t) => sum + t.price * t.quantity - Math.abs(t.fee), 0);

  const cashBeforeMOC = C_init - sumEbuy + sumEsellNonMOC;
  const newOneTimeAmount = (cashBeforeMOC + mocSellAmount) / QUARTER_SPLIT_COUNT;
  return roundMoney(Math.max(0, newOneTimeAmount));
}

// ---------------------------------------------------------------------------
// 순수 함수: 매도 수량 분할 (25% LOC / 잔량 지정가)
// ---------------------------------------------------------------------------

/**
 * 보유 수량을 LOC 매도(25%)와 지정가 매도(잔량)로 분할합니다.
 * LOC 수량을 먼저 정수화한 뒤 잔량을 지정가로 배정하여 누락을 방지합니다.
 */
export function calcSellSplitQuantities(totalQty: number): {
  locSellQty: number;
  limitSellQty: number;
} {
  const safeTotalQty = floorToNonNegativeInt(totalQty);
  const locSellQty = floorToNonNegativeInt(safeTotalQty * LOC_SELL_RATIO);
  const limitSellQty = safeTotalQty - locSellQty;
  return { locSellQty, limitSellQty };
}

// ---------------------------------------------------------------------------
// 순수 함수: 안전한 주문 데이터 생성
// ---------------------------------------------------------------------------

/**
 * 가격과 수량으로 OrderEntry를 생성합니다.
 * 가격이 0 이하이거나 정수화한 수량이 0 이하이면 null을 반환합니다.
 */
export function safeOrder(price: number, qty: number): OrderEntry | null {
  if (!areStrictPositiveFiniteScalars(price, qty)) {
    return null;
  }

  const finalQty = floorToNonNegativeInt(qty);
  if (finalQty <= 0) {
    return null;
  }

  return { price: roundMoney(price), quantity: finalQty };
}

/**
 * 표시용 OrderEntry. 수량이 0이어도 가격만 유효하면 반환합니다.
 * (LOC 매수: 수량 0이어도 가격 표시, LOC 매도: 보유 1~3주일 때 가격 표시·수량 0)
 */
function orderEntryForDisplay(price: number, qty: number): OrderEntry | null {
  if (!areStrictPositiveFiniteScalars(price)) {
    return null;
  }

  const finalQty = floorToNonNegativeInt(qty);
  return { price: roundMoney(price), quantity: finalQty };
}

// ---------------------------------------------------------------------------
// 순수 함수: 쿼터 손절 모드 주문 계산
// ---------------------------------------------------------------------------

/**
 * 쿼터 손절 모드의 주문 데이터를 계산합니다.
 *
 * MOC 기록 없음 → MOC 매도 수량(보유량 × 25%) 표시
 * MOC 기록 있음 → 새 1회 매수금 기반 LOC 매수, LOC 매도(25%), 지정가 매도(잔량)
 */
export function calcQuarterStopLossOrders(params: {
  trades: TradeInput[];
  dailyBuyAmount: number;
  multiSplit: MultiSplitParams;
  feeRate: number;
  recentTradingDays: string[];
  /** 대상 종목의 보유 평단가 (외부에서 계산해서 전달) */
  avgPrice: number;
  /** 대상 종목의 보유 수량 (외부에서 계산해서 전달) */
  currentQuantity: number;
}): QuarterStopLossResult | null {
  const { trades, dailyBuyAmount, multiSplit, feeRate, recentTradingDays, avgPrice, currentQuantity } = params;

  const mocCheck = checkRecentMOCSell(trades, recentTradingDays);

  if (!mocCheck.hasMOC) {
    // MOC 매도 기록 없음 → MOC 매도 수량 표시
    const mocQuantity = currentQuantity * LOC_SELL_RATIO;
    return {
      hasMOC: false,
      mocQuantity: roundMoney(mocQuantity),
    };
  }

  // MOC 기록 있음
  if (
    !mocCheck.mocDate ||
    !areStrictPositiveFiniteScalars(avgPrice, currentQuantity)
  ) {
    return null;
  }

  const newOneTimeAmount = calcNewOneTimeAmount(
    trades,
    dailyBuyAmount,
    multiSplit.totalSplitCount,
    mocCheck.mocDate,
  );
  const A = multiSplit.targetReturnRate;

  // LOC 매수: 평단가 × 0.9 - 0.01
  const locBuyPrice = Math.max(MIN_PRICE, avgPrice * QUARTER_LOC_PRICE_FACTOR - LOC_PRICE_OFFSET);
  const locBuyQty =
    newOneTimeAmount > 0 && locBuyPrice > 0
      ? floorToNonNegativeInt(
          newOneTimeAmount / (locBuyPrice * (1 + feeRate / 100)),
        )
      : 0;

  // LOC 매도 / 지정가 매도: 25% 먼저 → 잔량
  const { locSellQty, limitSellQty } = calcSellSplitQuantities(currentQuantity);
  const locSellPrice = avgPrice * QUARTER_LOC_PRICE_FACTOR;
  const limitSellPrice = avgPrice * (1 + A / 100);

  return {
    hasMOC: true,
    newOneTimeAmount,
    locBuy: safeOrder(locBuyPrice, locBuyQty) ?? undefined,
    locSell: safeOrder(locSellPrice, locSellQty) ?? undefined,
    limitSell: safeOrder(limitSellPrice, limitSellQty) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// 순수 함수: 전반전/후반전 주문 계산
// ---------------------------------------------------------------------------

/**
 * 전반전/후반전의 주문 데이터를 계산합니다.
 *
 * 전반전: LOC 매수 2회 (0.5회분씩), LOC 매도(25%), 지정가 매도(잔량)
 * 후반전: LOC 매수 1회 (1회분), LOC 매도(25%), 지정가 매도(잔량)
 */
export function calcMultiSplitOrders(params: {
  phase: 'first' | 'second';
  A: number;          // 목표 수익률 (%)
  a: number;          // 총 분할 횟수
  T: number;          // 현재 시행 회차
  basePrice: number;  // 기준가 (평단가 또는 현재가)
  currentQuantity: number;
  oneTimeAmount: number;
  feeRate: number;
}): MultiSplitExecutionResult {
  const { phase, A, a, T, basePrice, currentQuantity, oneTimeAmount, feeRate } = params;

  // 유효성 검사: 핵심 파라미터가 유효하지 않으면 빈 결과 반환
  if (!areStrictPositiveFiniteScalars(A, a, T, basePrice)) {
    return { phase };
  }

  if (!areFiniteNonNegativeScalars(currentQuantity, oneTimeAmount, feeRate)) {
    return { phase };
  }

  // LOC 기준 계산
  const locFactor = 1 + (A * (1 - (2 * T) / a)) / 100;
  const locSellBasePrice = Math.max(MIN_PRICE, basePrice * locFactor);
  const locBuyBasePrice = Math.max(MIN_PRICE, locSellBasePrice - LOC_PRICE_OFFSET);

  // 매도 수량 분할: 25% 먼저, 잔량
  const { locSellQty, limitSellQty } = calcSellSplitQuantities(currentQuantity);

  const result: MultiSplitExecutionResult = { phase };

  if (phase === 'first') {
    // 전반전: LOC 매수1 (평단가 0.5회분), LOC 매수2 (LOC가 0.5회분) — 수량 0이어도 가격 표시
    const half = oneTimeAmount * FIRST_HALF_BUY_RATIO;

    const locBuy1Price = basePrice;
    const qtyWithHalf =
      half > 0 && locBuy1Price > 0
        ? half / (locBuy1Price * (1 + feeRate / 100))
        : 0;
    const qtyWithFull =
      oneTimeAmount > 0 && locBuy1Price > 0
        ? oneTimeAmount / (locBuy1Price * (1 + feeRate / 100))
        : 0;
    // 0.5회분으로는 1주 미만이지만 1회분이면 1주 이상 가능한 경우 → LOC 매수1 수량 1로 표시
    const locBuy1Qty =
      floorToNonNegativeInt(qtyWithHalf) < 1 &&
      floorToNonNegativeInt(qtyWithFull) >= 1
        ? 1
        : qtyWithHalf;
    result.locBuy1 = orderEntryForDisplay(locBuy1Price, locBuy1Qty) ?? undefined;

    // LOC 매수2: (1회 매수 금액) - (LOC 매수1 주문 금액) 으로 남은 금액 기준 수량 계산
    const finalLocBuy1Qty = floorToNonNegativeInt(locBuy1Qty);
    const locBuy1OrderAmount = locBuy1Price * finalLocBuy1Qty * (1 + feeRate / 100);
    const remainingForLoc2 = Math.max(0, oneTimeAmount - locBuy1OrderAmount);
    const locBuy2Qty =
      locBuyBasePrice > 0
        ? remainingForLoc2 / (locBuyBasePrice * (1 + feeRate / 100))
        : 0;
    result.locBuy2 = orderEntryForDisplay(locBuyBasePrice, locBuy2Qty) ?? undefined;
  } else {
    // 후반전: LOC 매수 1회분 — 수량 0이어도 가격 표시
    const locBuyQty =
      oneTimeAmount > 0 && locBuyBasePrice > 0
        ? oneTimeAmount / (locBuyBasePrice * (1 + feeRate / 100))
        : 0;
    result.locBuy2 = orderEntryForDisplay(locBuyBasePrice, locBuyQty) ?? undefined;
  }

  // LOC 매도 — 보유 1~3주 등 수량 0이어도 가격 표시·수량 0으로 표기
  result.locSell = orderEntryForDisplay(locSellBasePrice, locSellQty) ?? undefined;

  // 지정가 매도: 평단가 × (1 + A/100) — 수량 0이어도 가격 표시
  const limitSellPrice = basePrice * (1 + A / 100);
  result.limitSell = orderEntryForDisplay(limitSellPrice, limitSellQty) ?? undefined;

  return result;
}
