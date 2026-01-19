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
 * 현재 활성화된 구간을 판별합니다
 * 구간 0 주식의 현재가를 각 구간의 이동평균선과 비교
 */
export const determineActiveSection = async (portfolio: Portfolio): Promise<1 | 2 | 3 | null> => {
  try {
    const ma0Stock = portfolio.strategy.ma0.stock;
    
    // 필요한 모든 주식의 가격 데이터 가져오기
    const neededStocks = [
      ma0Stock,
      portfolio.strategy.ma1.stock,
      portfolio.strategy.ma2.stock,
      portfolio.strategy.ma3.stock
    ];
    
    const stockPrices = await fetchStockPrices(neededStocks);
    const ma0Price = stockPrices[ma0Stock]?.price;

    if (!ma0Price) return null;

    // 각 구간의 이동평균선 가져오기
    // 구간 1: ma1.period 기간의 이동평균선 (기본값: ma20)
    const ma1Stock = portfolio.strategy.ma1.stock;
    const ma1StockData = stockPrices[ma1Stock];
    const ma1Price = ma1StockData?.ma20 || 0; // 실제로는 period에 맞는 MA를 계산해야 하지만, 현재는 ma20 사용

    // 구간 2: ma2.period1과 ma2.period2의 이동평균선 (기본값: ma20, ma60)
    const ma2Stock = portfolio.strategy.ma2.stock;
    const ma2StockData = stockPrices[ma2Stock];
    const ma2Price1 = ma2StockData?.ma20 || 0;
    const ma2Price2 = ma2StockData?.ma60 || 0;

    // 구간 3: ma3.period 기간의 이동평균선 (기본값: ma60)
    const ma3Stock = portfolio.strategy.ma3.stock;
    const ma3StockData = stockPrices[ma3Stock];
    const ma3Price = ma3StockData?.ma60 || 0;

    // 구간 판별 로직
    // 구간 1: ma0Price가 ma1Price 아래에 있을 때
    if (ma1Price > 0 && ma0Price < ma1Price) {
      return 1;
    }
    // 구간 2: ma0Price가 ma2Price1과 ma2Price2 사이에 있을 때
    if (ma2Price1 > 0 && ma2Price2 > 0 && ma0Price >= ma2Price1 && ma0Price <= ma2Price2) {
      return 2;
    }
    // 구간 3: ma0Price가 ma3Price 아래에 있을 때
    if (ma3Price > 0 && ma0Price < ma3Price) {
      return 3;
    }

    return null;
  } catch (err) {
    console.error('Error determining active section:', err);
    return null;
  }
};
