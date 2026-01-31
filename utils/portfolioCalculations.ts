import { Portfolio, Trade } from '../types';
import { fetchStockPrices } from '../services/stockService';

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

/**
 * StockData에서 period에 해당하는 MA 값 반환 (20/60/120만 지원, 그 외는 20일선 폴백)
 */
function getMAForPeriod(data: { ma20?: number; ma60?: number; ma120?: number } | undefined, period: number): number {
  if (!data) return 0;
  if (period <= 20) return data.ma20 ?? 0;
  if (period <= 60) return data.ma60 ?? 0;
  if (period <= 120) return data.ma120 ?? 0;
  return data.ma20 ?? 0;
}

/**
 * 현재 활성화된 구간을 판별합니다.
 * - 구간 0에서 선택한 **기준 주식(ma0.stock)** 하나만 사용합니다.
 * - 기준 주식의 **종가**와 **기준 주식의** 이동평균선(ma1.period, ma2.period1/period2, ma3.period)과의 관계로 구간 1~3을 정의합니다.
 * - 각 구간에서 선택한 주식(ma1.stock, ma2.stock, ma3.stock)은 해당 구간일 때 매수할 종목일 뿐, 이평선 계산에는 사용하지 않습니다.
 *
 * 구간 정의 (예: 기준주식 QQQ, 이평선 20·60일):
 * - 구간 1: QQQ 종가가 QQQ의 20일 이평선 **위**에 있음
 * - 구간 2: QQQ 종가가 QQQ의 20~60일 이평선 **사이**에 있음
 * - 구간 3: QQQ 종가가 QQQ의 60일 이평선 **아래**에 있음
 */
export const determineActiveSection = async (portfolio: Portfolio): Promise<1 | 2 | 3 | null> => {
  try {
    const ma0Stock = portfolio.strategy.ma0.stock;
    const stockPrices = await fetchStockPrices([ma0Stock]);
    const baseData = stockPrices[ma0Stock];
    const ma0Price = baseData?.price;

    if (!ma0Price) return null;

    // 모든 이평선은 기준 주식(ma0.stock)의 값만 사용
    const ma1Price = getMAForPeriod(baseData, portfolio.strategy.ma1.period);
    const ma2Price1 = getMAForPeriod(baseData, portfolio.strategy.ma2.period1);
    const ma2Price2 = getMAForPeriod(baseData, portfolio.strategy.ma2.period2);
    const ma3Price = getMAForPeriod(baseData, portfolio.strategy.ma3.period);

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
