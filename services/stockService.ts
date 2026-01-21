import { supabase } from './supabase';
import { StockData } from '../types';

/**
 * Supabase에서 주가 데이터를 가져옵니다 (최근 종가 기준)
 * 실제 컬럼명만 select하고, 계산 지표는 로컬에서 계산합니다.
 */
export const fetchStockPrices = async (symbols: string[]): Promise<Record<string, StockData>> => {
  // 빈 배열이나 유효하지 않은 심볼 필터링 및 trim() 처리
  const validSymbols = symbols
    .filter(s => s && typeof s === 'string')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (!validSymbols.length) {
    console.warn('No valid symbols provided to fetchStockPrices');
    return {};
  }

  try {
    // Supabase 라이브러리의 .in() 메서드를 사용하여 안전하게 쿼리
    // 실제 컬럼명만 select: symbol, close (종가), trade_date (거래일)
    const { data, error } = await supabase
      .from('stock_prices')
      .select('symbol, close, trade_date')
      .in('symbol', validSymbols)
      .order('trade_date', { ascending: false });

    if (error) {
      console.error('Error fetching stock prices:', error);
      return {};
    }

    const latestPrices: Record<string, StockData> = {};
    const seenSymbols = new Set<string>();

    if (data) {
      for (const row of data) {
        const symbol = (row as any).symbol as string;
        if (!symbol || seenSymbols.has(symbol)) continue;
        seenSymbols.add(symbol);

        const r = row as any;
        // 실제 컬럼명: close 사용
        const price = (r.close ?? 0) as number;

        // 기본값으로 초기화 (나중에 계산 지표로 업데이트)
        latestPrices[symbol] = {
          symbol,
          price,
          change: 0,
          changePercent: 0,
          rsi: 50,
          ma20: 0,
          ma60: 0,
          ma120: 0,
        };
      }
    }

    // 계산 지표를 동기적으로 가져오기 위한 개선된 로직
    // 각 심볼별로 최신 데이터와 과거 데이터를 병렬로 가져와서 계산
    const symbolsToProcess = Object.keys(latestPrices);
    await Promise.all(
      symbolsToProcess.map(async (symbol) => {
        try {
          // 과거 데이터 가져오기 (RSI, MA 계산용)
          const indicators = await calculateTechnicalIndicators(symbol);
          if (indicators) {
            latestPrices[symbol].rsi = indicators.rsi;
            latestPrices[symbol].ma20 = indicators.ma[20] || 0;
            latestPrices[symbol].ma60 = indicators.ma[60] || 0;
            latestPrices[symbol].ma120 = indicators.ma[120] || 0;
          }

          // 전일 종가 가져오기 (changePercent 계산용)
          const prevData = await fetchStockPricesWithPrev([symbol]);
          if (prevData[symbol]) {
            const currentPrice = latestPrices[symbol].price;
            const previousPrice = prevData[symbol].previous;
            if (previousPrice > 0 && currentPrice > 0 && previousPrice !== currentPrice) {
              latestPrices[symbol].change = currentPrice - previousPrice;
              latestPrices[symbol].changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
            }
          }
        } catch (err) {
          console.warn(`Failed to calculate indicators for ${symbol}:`, err);
          // 기본값 유지
        }
      })
    );

    return latestPrices;
  } catch (err) {
    console.error('Unexpected error fetching stock prices:', err);
    return {};
  }
};

/**
 * 심볼별 현재가와 직전 일자의 종가를 함께 가져옵니다.
 * stock_prices 테이블에서 각 심볼에 대해 최신 2개 레코드를 조회하여
 * [0] = 현재, [1] = 전일 종가로 간주합니다.
 */
export const fetchStockPricesWithPrev = async (
  symbols: string[]
): Promise<Record<string, { current: number; previous: number }>> => {
  // 빈 배열이나 유효하지 않은 심볼 필터링 및 trim() 처리
  const validSymbols = symbols
    .filter(s => s && typeof s === 'string')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (!validSymbols.length) {
    console.warn('No valid symbols provided to fetchStockPricesWithPrev');
    return {};
  }

  try {
    // Supabase 라이브러리의 .in() 메서드를 사용하여 안전하게 쿼리
    // 실제 컬럼명: close (종가), trade_date (거래일)
    const { data, error } = await supabase
      .from('stock_prices')
      .select('symbol, close, trade_date')
      .in('symbol', validSymbols)
      .order('symbol', { ascending: true })
      .order('trade_date', { ascending: false });

    if (error) {
      console.error('Error fetching stock prices with prev:', error);
      return {};
    }

    const map: Record<string, { current: number; previous: number }> = {};

    if (data) {
      for (const row of data as any[]) {
        const symbol: string | undefined = row.symbol;
        if (!symbol) continue;
        // 실제 컬럼명: close 사용
        const price = (row.close ?? 0) as number;

        if (!map[symbol]) {
          // 첫 번째 레코드 = 최신가, 이전가는 우선 같은 값으로 초기화
          map[symbol] = { current: price, previous: price };
        } else if (map[symbol].previous === map[symbol].current) {
          // 두 번째로 등장하는 레코드 = 직전 일자 가격으로 사용
          map[symbol].previous = price;
        }
      }
    }

    return map;
  } catch (err) {
    console.error('Unexpected error in fetchStockPricesWithPrev:', err);
    return {};
  }
};

/**
 * 특정 심볼의 주가 데이터를 가져옵니다
 */
export const fetchStockPrice = async (symbol: string): Promise<StockData | null> => {
  const prices = await fetchStockPrices([symbol]);
  return prices[symbol] || null;
};

/**
 * 이동평균선(MA) 계산
 */
export const calculateMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const recentPrices = prices.slice(-period);
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
};

/**
 * RSI 계산
 */
export const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / period : 0;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

/**
 * 특정 심볼의 과거 가격 데이터를 가져와서 기술 지표를 계산합니다
 */
export const calculateTechnicalIndicators = async (
  symbol: string,
  maPeriods: number[] = [20, 60, 120]
): Promise<{ ma: Record<number, number>; rsi: number } | null> => {
  // 심볼 trim 처리
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn('Invalid symbol provided to calculateTechnicalIndicators');
    return null;
  }

  try {
    // 실제 컬럼명: close (종가), trade_date (거래일)
    const { data, error } = await supabase
      .from('stock_prices')
      .select('close, trade_date')
      .eq('symbol', trimmedSymbol)
      .order('trade_date', { ascending: true })
      .limit(200); // 최근 200일 데이터

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for', symbol, error);
      return null;
    }

    // 실제 컬럼명: close 사용
    const prices = data.map(row => (row as any).close).filter(p => p != null && p > 0) as number[];
    if (prices.length === 0) return null;

    const ma: Record<number, number> = {};
    for (const period of maPeriods) {
      ma[period] = calculateMA(prices, period);
    }

    const rsi = calculateRSI(prices);

    return { ma, rsi };
  } catch (err) {
    console.error('Error calculating technical indicators:', err);
    return null;
  }
};

/**
 * 특정 심볼의 최근 N일간 가격 데이터를 가져옵니다 (차트용)
 * 로컬에서 MA20, MA60을 계산하여 반환합니다.
 */
export const fetchStockPriceHistory = async (
  symbol: string,
  days: number = 90
): Promise<Array<{ date: string; price: number; ma20: number; ma60: number }>> => {
  // 심볼 trim 처리
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn('Invalid symbol provided to fetchStockPriceHistory');
    return [];
  }

  try {
    // 실제 컬럼명: close (종가), trade_date (거래일)만 select
    // 최신 데이터부터 가져온 후 날짜순으로 재정렬
    const { data, error } = await supabase
      .from('stock_prices')
      .select('close, trade_date')
      .eq('symbol', trimmedSymbol)
      .order('trade_date', { ascending: false })  // 최신 날짜부터 가져옴
      .limit(days);

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for chart:', symbol, error);
      return [];
    }

    // 실제 컬럼명: close, trade_date 사용
    // 데이터를 날짜 오름차순으로 재정렬 (차트 표시용)
    const prices = data
      .map((row: any) => {
        const price = row.close ?? 0;
        const tradeDate = row.trade_date || '';
        return {
          date: tradeDate,
          price,
        };
      })
      .filter(item => item.price > 0 && item.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());  // 날짜 오름차순 정렬

    if (prices.length === 0) return [];

    // 가격 배열 추출
    const priceArray = prices.map(p => p.price);

    // 각 데이터 포인트에 대해 MA20, MA60 계산 (rolling window 방식)
    const result = prices.map((item, index) => {
      // MA20 계산: 과거 20일간의 평균 (20일 미만이면 사용 가능한 데이터만)
      let ma20 = item.price; // 기본값은 현재 가격
      if (index >= 19) {
        // 20일 이상 데이터가 있으면 과거 20일 평균
        const pricesForMa20 = priceArray.slice(index - 19, index + 1);
        ma20 = calculateMA(pricesForMa20, 20);
      } else if (index > 0) {
        // 20일 미만이면 지금까지의 평균
        const pricesForMa20 = priceArray.slice(0, index + 1);
        ma20 = calculateMA(pricesForMa20, pricesForMa20.length);
      }

      // MA60 계산: 과거 60일간의 평균 (60일 미만이면 사용 가능한 데이터만)
      let ma60 = item.price; // 기본값은 현재 가격
      if (index >= 59) {
        // 60일 이상 데이터가 있으면 과거 60일 평균
        const pricesForMa60 = priceArray.slice(index - 59, index + 1);
        ma60 = calculateMA(pricesForMa60, 60);
      } else if (index > 0) {
        // 60일 미만이면 지금까지의 평균
        const pricesForMa60 = priceArray.slice(0, index + 1);
        ma60 = calculateMA(pricesForMa60, pricesForMa60.length);
      }

      return {
        date: item.date,
        price: item.price,
        ma20,
        ma60,
      };
    });

    return result;
  } catch (err) {
    console.error('Unexpected error fetching price history:', err);
    return [];
  }
};
