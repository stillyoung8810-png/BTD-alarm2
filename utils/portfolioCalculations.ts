import { Portfolio, Trade } from '../types';
import { fetchStockPrices, fetchStockPriceHistory } from '../services/stockService';
import { calculateMA } from './technicalIndicators';
import {
  areFiniteNonNegativeScalars,
  areStrictPositiveFiniteScalars,
  isFiniteNumber,
  isStrictPositiveInteger,
} from './financialScalarGuards';
import { roundMoney } from './financialMath';

/** Trade.metadata.pool_after 접근 표준화. VR 체결 직후 Pool 기록용. 유효하지 않으면 undefined. */
export function getTradePoolAfter(trade: Trade): number | undefined {
  const v = trade.metadata?.pool_after;
  if (!isFiniteNumber(v)) return undefined;
  return v;
}

/** 수량/원가가 이 값 미만이면 0으로 간주 (부동소수점 방어) */
const HOLDINGS_QTY_EPSILON = 1e-10;

/**
 * 포트폴리오의 현재 보유 내역을 계산합니다
 */
export interface Holdings {
  stock: string;
  quantity: number;
  totalCost: number; // 매수 금액 + 매수 수수료
  avgPrice: number;
  /** 매도 시 역산한 누적 실현손익 (이동평균법 기반). 전량 매도된 종목도 포함. */
  realizedPnL?: number;
}

/**
 * 거래 목록만으로 현재 보유 내역을 계산합니다.
 * [Option A] 훅 계층은 통객체 대신 이 함수만 직접 사용합니다.
 */
export const calculateHoldingsFromTrades = (trades: Trade[]): Holdings[] => {
  const holdingsMap: Record<string, { quantity: number; totalCost: number; realizedPnL: number }> = {};

  trades.forEach(trade => {
    if (trade.type === 'buy') {
      if (!holdingsMap[trade.stock]) {
        holdingsMap[trade.stock] = { quantity: 0, totalCost: 0, realizedPnL: 0 };
      }
      holdingsMap[trade.stock].quantity += trade.quantity;
      holdingsMap[trade.stock].totalCost += trade.price * trade.quantity + Math.abs(trade.fee);
    } else if (trade.type === 'sell') {
      if (holdingsMap[trade.stock]) {
        const entry = holdingsMap[trade.stock];
        if (entry.quantity < 0 || entry.quantity < trade.quantity) {
          throw new Error(`[${trade.stock}] 초과 매도 에러: 시도수량=${trade.quantity}, 보유수량=${entry.quantity}`);
        }
        const currentAvgPrice = entry.quantity > HOLDINGS_QTY_EPSILON ? entry.totalCost / entry.quantity : 0;
        const revenue = trade.price * trade.quantity - Math.abs(trade.fee);
        const costBasis = currentAvgPrice * trade.quantity;
        entry.realizedPnL += revenue - costBasis;

        const avgPrice = currentAvgPrice;
        entry.quantity -= trade.quantity;
        entry.totalCost = entry.quantity * avgPrice;

        if (entry.quantity <= 0 || Math.abs(entry.quantity) < HOLDINGS_QTY_EPSILON) {
          entry.quantity = 0;
          entry.totalCost = 0;
        }
      }
    }
  });

  return Object.entries(holdingsMap).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice: data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
    realizedPnL: roundMoney(data.realizedPnL),
  }));
};

/**
 * 포트폴리오의 보유 내역을 계산합니다 (매수만 고려).
 * 매도 시 실현손익을 역산하여 종목별 realizedPnL에 누적합니다.
 */
export const calculateHoldings = (portfolio: Portfolio): Holdings[] => {
  return calculateHoldingsFromTrades(portfolio.trades);
};

/**
 * 포트폴리오의 총 투자 금액을 계산합니다 (보유 내역만)
 */
export const calculateInvestedAmount = (portfolio: Portfolio): number => {
  const holdings = calculateHoldings(portfolio);
  return holdings.reduce((sum, h) => sum + h.totalCost, 0);
};

/**
 * 포트폴리오의 총 투자 금액을 계산합니다 (모든 buy 타입 거래 합계)
 */
export const calculateTotalInvested = (portfolio: Portfolio): number => {
  return portfolio.trades
    .filter(t => t.type === 'buy')
    .reduce((sum, t) => sum + (t.price * t.quantity + Math.abs(t.fee)), 0);
};

/**
 * 포트폴리오의 매도 회수금 합계를 계산합니다 (정산·모달용).
 * Σ(매도: price×qty − 수수료)
 */
export const getTotalSellProceeds = (portfolio: Portfolio): number => {
  return portfolio.trades
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + (t.price * t.quantity - Math.abs(t.fee)), 0);
};

/**
 * 포트폴리오의 현재 총 평가액을 계산합니다
 */
export const calculateCurrentValuation = async (portfolio: Portfolio): Promise<number> => {
  const holdings = calculateHoldings(portfolio);
  if (holdings.length === 0) return 0;

  const symbols = holdings.map(h => h.stock);
  const stockPrices = await fetchStockPrices(symbols);

  let totalValuation = 0;
  holdings.forEach(holding => {
    const stockData = stockPrices[holding.stock];
    const currentPrice = stockData?.price || 0;
    totalValuation += holding.quantity * currentPrice;
  });

  return totalValuation;
};

export function calculateYieldPercent(
  currentValuation: number,
  investedAmount: number,
): number {
  if (!areFiniteNonNegativeScalars(currentValuation)) {
    return 0;
  }

  if (!areStrictPositiveFiniteScalars(investedAmount)) {
    return 0;
  }

  const rawYield = (currentValuation / investedAmount - 1) * 100;
  return roundMoney(rawYield);
}

/**
 * 포트폴리오의 수익률을 계산합니다
 */
export const calculateYield = async (portfolio: Portfolio): Promise<number> => {
  const investedAmount = calculateInvestedAmount(portfolio);
  if (!areStrictPositiveFiniteScalars(investedAmount)) {
    return 0;
  }

  const currentValuation = await calculateCurrentValuation(portfolio);
  return calculateYieldPercent(currentValuation, investedAmount);
};

/** 캐시(StockData)에 있는 표준 이평선 기간. 이 기간은 fetchStockPrices 결과의 ma20/ma60/ma120를 그대로 사용 */
const STANDARD_MA_PERIODS = [20, 60, 120];

/**
 * StockData에서 period에 해당하는 MA 값 반환 (20/60/120만 사용, 그 외는 0 – 별도 계산 필요)
 */
function getCachedMA(data: { ma20?: number; ma60?: number; ma120?: number } | undefined, period: number): number {
  if (!data) return 0;
  if (period === 20) return data.ma20 ?? 0;
  if (period === 60) return data.ma60 ?? 0;
  if (period === 120) return data.ma120 ?? 0;
  return 0;
}

/**
 * 가격 이력 배열에서 최신 N일 종가로 이동평균을 직접 계산합니다.
 * 이력은 날짜 오름차순(과거→최신)이어야 하며, IndexedDB/Supabase 캐시 데이터를 사용합니다.
 */
function computeMAFromHistory(
  history: Array<{ price: number }>,
  period: number
): number {
  if (!history.length || !isStrictPositiveInteger(period)) return 0;
  const prices = history.map((h) => h.price);
  const lastN = prices.slice(-period);
  return calculateMA(lastN, period);
}

/**
 * 기준 주식의 특정 기간 이평선 값을 반환합니다.
 * 20/60/120일은 캐시(StockData)에서 사용하고, 그 외 기간은 가격 이력을 불러와 직접 계산합니다.
 */
async function getMAForBaseStock(
  symbol: string,
  period: number,
  baseData: { ma20?: number; ma60?: number; ma120?: number } | undefined,
  historyCache: Array<{ price: number }> | null
): Promise<number> {
  if (STANDARD_MA_PERIODS.includes(period)) {
    const cached = getCachedMA(baseData, period);
    if (cached > 0) return cached;
  }
  // 20/60/120이 아니거나 캐시에 없으면 가격 이력으로 계산
  const needed = historyCache ?? (await fetchStockPriceHistory(symbol, Math.max(period + 30, 120)));
  const pricesOnly = needed.map((h) => ({ price: h.price }));
  return computeMAFromHistory(pricesOnly, period);
}

/** 구간 판정용 단기/장기 이평선 기간 읽기 (구 스키마 호환: ma0.maAPeriod 없으면 ma1.period 등 사용). Dashboard/백테스트 연동용. */
export function getMaPeriods(portfolio: Portfolio): { maAPeriod: number; maBPeriod: number } {
  const s = portfolio.strategy;
  const ma1 = s.ma1 as { period?: number };
  const ma2 = s.ma2 as { period1?: number; period2?: number };
  const ma3 = s.ma3 as { period?: number };
  return {
    maAPeriod: s.ma0.maAPeriod ?? ma1.period ?? 20,
    maBPeriod: s.ma0.maBPeriod ?? ma3.period ?? ma2.period2 ?? 60,
  };
}

/**
 * 정배열 판정용 단기(maA)·장기(maB) 이평선 값을 반환합니다.
 * 백테스트와 동일: 정배열 = maA > maB. Dashboard에서 maAlignmentNotMet 계산용.
 */
export async function getMAValuesForAlignment(portfolio: Portfolio): Promise<{ maA: number; maB: number }> {
  const ma0Stock = portfolio.strategy.ma0.stock;
  const stockPrices = await fetchStockPrices([ma0Stock]);
  const baseData = stockPrices[ma0Stock];
  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const needsHistory = [maAPeriod, maBPeriod].some((p) => !STANDARD_MA_PERIODS.includes(p));
  let historyCache: Array<{ price: number }> | null = null;
  if (needsHistory) {
    const maxPeriod = Math.max(maAPeriod, maBPeriod, 120);
    const history = await fetchStockPriceHistory(ma0Stock, maxPeriod + 30);
    historyCache = history.map((h) => ({ price: h.price }));
  }
  const maA = await getMAForBaseStock(ma0Stock, maAPeriod, baseData, historyCache);
  const maB = await getMAForBaseStock(ma0Stock, maBPeriod, baseData, historyCache);
  return { maA, maB };
}

/**
 * 현재 활성화된 구간을 판별합니다.
 * - 기준 주식(ma0.stock) 종가와 **단기(maAPeriod)·장기(maBPeriod)** 2개 이평선만 사용.
 * - 백테스트 엔진(determine_section)과 동일:
 *   구간 1: 현재가 > Max(maA, maB)
 *   구간 2: Min(maA, maB) ≤ 현재가 ≤ Max(maA, maB)
 *   구간 3: 현재가 < Min(maA, maB)
 */
export const determineActiveSection = async (portfolio: Portfolio): Promise<1 | 2 | 3 | null> => {
  try {
    const ma0Stock = portfolio.strategy.ma0.stock;
    const stockPrices = await fetchStockPrices([ma0Stock]);
    const baseData = stockPrices[ma0Stock];
    const ma0Price = baseData?.price;

    if (!areStrictPositiveFiniteScalars(ma0Price)) return null;

    const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);

    const needsHistory = [maAPeriod, maBPeriod].some(
      (period) => !STANDARD_MA_PERIODS.includes(period)
    );
    let historyCache: Array<{ price: number }> | null = null;
    if (needsHistory) {
      const maxPeriod = Math.max(maAPeriod, maBPeriod, 120);
      const history = await fetchStockPriceHistory(ma0Stock, maxPeriod + 30);
      historyCache = history.map((h) => ({ price: h.price }));
    }

    const maA = await getMAForBaseStock(ma0Stock, maAPeriod, baseData, historyCache);
    const maB = await getMAForBaseStock(ma0Stock, maBPeriod, baseData, historyCache);

    const hi = Math.max(maA, maB);
    const lo = Math.min(maA, maB);

    if (!areStrictPositiveFiniteScalars(hi, lo)) return null;

    if (ma0Price > hi) return 1;
    if (ma0Price < lo) return 3;
    return 2;
  } catch (err) {
    console.error('Error determining active section:', err);
    return null;
  }
};
