import { Portfolio, Trade } from '../types';
import { fetchStockPrices, fetchStockPriceHistory, calculateMA } from '../services/stockService';

/**
 * 포트폴리오의 현재 보유 내역을 계산합니다
 */
export interface Holdings {
  stock: string;
  quantity: number;
  totalCost: number; // 매수 금액 + 매수 수수료
  avgPrice: number;
}

/**
 * 포트폴리오의 보유 내역을 계산합니다 (매수만 고려)
 */
export const calculateHoldings = (portfolio: Portfolio): Holdings[] => {
  const holdingsMap: Record<string, { quantity: number; totalCost: number }> = {};

  portfolio.trades.forEach(trade => {
    if (trade.type === 'buy') {
      if (!holdingsMap[trade.stock]) {
        holdingsMap[trade.stock] = { quantity: 0, totalCost: 0 };
      }
      holdingsMap[trade.stock].quantity += trade.quantity;
      holdingsMap[trade.stock].totalCost += (trade.price * trade.quantity + trade.fee);
    } else if (trade.type === 'sell') {
      if (holdingsMap[trade.stock]) {
        holdingsMap[trade.stock].quantity -= trade.quantity;
        // 매도 시에는 평균 단가를 유지하기 위해 비례적으로 차감
        const avgPrice = holdingsMap[trade.stock].totalCost / (holdingsMap[trade.stock].quantity + trade.quantity);
        holdingsMap[trade.stock].totalCost = holdingsMap[trade.stock].quantity * avgPrice;
      }
    }
  });

  return Object.entries(holdingsMap)
    .filter(([_, data]) => data.quantity > 0)
    .map(([stock, data]) => ({
      stock,
      quantity: data.quantity,
      totalCost: data.totalCost,
      avgPrice: data.totalCost / data.quantity,
    }));
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
    .reduce((sum, t) => sum + (t.price * t.quantity + t.fee), 0);
};

/**
 * 포트폴리오의 기 회수금을 계산합니다 (기존 sell 타입 거래 합계)
 */
export const calculateAlreadyRealized = (portfolio: Portfolio): number => {
  return portfolio.trades
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + (t.price * t.quantity - t.fee), 0);
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

/**
 * 포트폴리오의 수익률을 계산합니다
 */
export const calculateYield = async (portfolio: Portfolio): Promise<number> => {
  const investedAmount = calculateInvestedAmount(portfolio);
  if (investedAmount === 0) return 0;

  const currentValuation = await calculateCurrentValuation(portfolio);
  return ((currentValuation / investedAmount) - 1) * 100;
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
  if (!history.length || period < 1) return 0;
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

/**
 * 현재 활성화된 구간을 판별합니다.
 * - 구간 0에서 선택한 **기준 주식(ma0.stock)** 하나만 사용합니다.
 * - 기준 주식의 **종가**와 **기준 주식의** 이동평균선(ma1.period, ma2.period1/period2, ma3.period)과의 관계로 구간 1~3을 정의합니다.
 * - 20/60/120일 이평선은 캐시(IndexedDB 등)의 ma20/ma60/ma120를 사용하고,
 *   그 외 기간(예: 30, 50일)은 가격 이력을 불러와 직접 계산한 뒤 비교에 사용합니다.
 */
export const determineActiveSection = async (portfolio: Portfolio): Promise<1 | 2 | 3 | null> => {
  try {
    const ma0Stock = portfolio.strategy.ma0.stock;
    const stockPrices = await fetchStockPrices([ma0Stock]);
    const baseData = stockPrices[ma0Stock];
    const ma0Price = baseData?.price;

    if (!ma0Price) return null;

    const p1 = portfolio.strategy.ma1.period;
    const p2a = portfolio.strategy.ma2.period1;
    const p2b = portfolio.strategy.ma2.period2;
    const p3 = portfolio.strategy.ma3.period;

    const needsHistory = [p1, p2a, p2b, p3].some(
      (period) => !STANDARD_MA_PERIODS.includes(period)
    );
    let historyCache: Array<{ price: number }> | null = null;
    if (needsHistory) {
      const maxPeriod = Math.max(p1, p2a, p2b, p3, 120);
      const history = await fetchStockPriceHistory(ma0Stock, maxPeriod + 30);
      historyCache = history.map((h) => ({ price: h.price }));
    }

    const ma1Price = await getMAForBaseStock(ma0Stock, p1, baseData, historyCache);
    const ma2Price1 = await getMAForBaseStock(ma0Stock, p2a, baseData, historyCache);
    const ma2Price2 = await getMAForBaseStock(ma0Stock, p2b, baseData, historyCache);
    const ma3Price = await getMAForBaseStock(ma0Stock, p3, baseData, historyCache);

    // 구간 3: 기준 주식이 ma3 이평선 **아래**
    if (ma3Price > 0 && ma0Price < ma3Price) {
      return 3;
    }
    // 구간 2: 기준 주식이 ma2 두 이평선 **사이** (period1/period2 순서 무관)
    const ma2Low = Math.min(ma2Price1, ma2Price2);
    const ma2High = Math.max(ma2Price1, ma2Price2);
    if (ma2Low > 0 && ma2High > 0 && ma0Price >= ma2Low && ma0Price <= ma2High) {
      return 2;
    }
    // 구간 1: 기준 주식이 ma1 이평선 **위**
    if (ma1Price > 0 && ma0Price >= ma1Price) {
      return 1;
    }

    return null;
  } catch (err) {
    console.error('Error determining active section:', err);
    return null;
  }
};
