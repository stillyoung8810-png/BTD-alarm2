import { supabase } from './supabase';
import { StockData } from '../types';

/**
 * Supabase에서 주가 데이터를 가져옵니다 (최근 종가 기준)
 */
export const fetchStockPrices = async (symbols: string[]): Promise<Record<string, StockData>> => {
  if (!symbols.length) return {};

  try {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('*')
      .in('symbol', symbols)
      .order('date', { ascending: false });

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
        const price = (r.price ?? r.close_price) ?? 0;
        const change = (r.change ?? r.change_amount) ?? 0;
        const changePercent = (r.change_percent ?? 0) as number;
        const rsi = (r.rsi ?? r.rsi_14) ?? 50;
        const ma20 = (r.ma20 ?? r.ma_20) ?? 0;
        const ma60 = (r.ma60 ?? r.ma_60) ?? 0;
        const ma120 = (r.ma120 ?? r.ma_120) ?? 0;

        latestPrices[symbol] = {
          symbol,
          price,
          change,
          changePercent,
          rsi,
          ma20,
          ma60,
          ma120,
        };
      }
    }

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
  if (!symbols.length) return {};

  try {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('symbol, price, date, close_price')
      .in('symbol', symbols)
      .order('symbol', { ascending: true })
      .order('date', { ascending: false });

    if (error) {
      echoerror('Error fetching stock prices with prev:', error);
      return {};
    }

    const map: Record<string, { current: number; previous: number }> = {};

    if (data) {
      for (const row of data as any[]) {
        const symbol: string | undefined = row.symbol;
        if (!symbol) continue;
        const price = (row.price ?? row.close_price) ?? 0;

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
  try {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('price, date')
      .eq('symbol', symbol)
      .order('date', { ascending: true })
      .limit(200); // 최근 200일 데이터

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for', symbol, error);
      return null;
    }

    const prices = data.map(row => row.price).filter(p => p != null) as number[];
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
 */
export const fetchStockPriceHistory = async (
  symbol: string,
  days: number = 90
): Promise<Array<{ date: string; price: number; ma20: number; ma60: number }>> => {
  try {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('price, date, ma20, ma60, ma_20, ma_60')
      .eq('symbol', symbol)
      .order('date', { ascending: true })
      .limit(days);

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for chart:', symbol, error);
      return [];
    }

    return data.map((row: any) => {
      const price = row.price ?? row.close_price ?? 0;
      const ma20 = row.ma20 ?? row.ma_20 ?? 0;
      const ma60 = row.ma60 ?? row.ma_60 ?? 0;
      return {
        date: row.date || '',
        price,
        ma20,
        ma60,
      };
    }).filter(item => item.price > 0);
  } catch (err) {
    console.error('Unexpected error fetching price history:', err);
    return [];
  }
};
