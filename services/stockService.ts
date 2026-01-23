import { supabase } from './supabase';
import { StockData } from '../types';
import { 
  db, 
  initDatabase, 
  getStockMetadata, 
  getStockPrices, 
  saveStockPrices, 
  updateStockMetadata,
  StockPriceRecord 
} from './db';
import { AVAILABLE_STOCKS } from '../constants';

/**
 * 주가 데이터를 가져옵니다 (IndexedDB 우선 사용)
 * IndexedDB에 데이터가 없으면 Supabase에서 가져와서 저장
 */
export const fetchStockPrices = async (symbols: string[]): Promise<Record<string, StockData>> => {
  const validSymbols = symbols
    .filter(s => s && typeof s === 'string')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (!validSymbols.length) {
    console.warn('No valid symbols provided to fetchStockPrices');
    return {};
  }

  try {
    // IndexedDB 초기화
    await initDatabase();
    
    const latestPrices: Record<string, StockData> = {};
    
    // 각 심볼별로 병렬 처리
    await Promise.all(
      validSymbols.map(async (symbol) => {
        try {
          // IndexedDB에서 최신 데이터 가져오기
          const dbRecords = await getStockPrices(symbol, 2); // 최신 2일치 (현재가, 전일가)
          
          if (dbRecords.length > 0) {
            const latestRecord = dbRecords[dbRecords.length - 1];
            const prevRecord = dbRecords.length > 1 ? dbRecords[dbRecords.length - 2] : latestRecord;
            
            const currentPrice = latestRecord.close;
            const previousPrice = prevRecord.close;
            
            latestPrices[symbol] = {
              symbol,
              price: currentPrice,
              change: currentPrice - previousPrice,
              changePercent: previousPrice > 0 
                ? ((currentPrice - previousPrice) / previousPrice) * 100 
                : 0,
              rsi: latestRecord.rsi || 50,
              ma20: latestRecord.ma20 || 0,
              ma60: latestRecord.ma60 || 0,
              ma120: latestRecord.ma120 || 0,
            };
          } else {
            // IndexedDB에 데이터가 없으면 Supabase에서 가져오기
            console.log(`[fetchStockPrices] ${symbol}: IndexedDB 데이터 없음, Supabase에서 가져오기`);
            
            const { data, error } = await supabase
              .from('stock_prices')
              .select('symbol, close, trade_date')
              .eq('symbol', symbol)
              .order('trade_date', { ascending: false })
              .limit(2);
            
            if (error || !data || data.length === 0) {
              console.warn(`[fetchStockPrices] ${symbol}: Supabase 데이터 없음`);
              latestPrices[symbol] = {
                symbol,
                price: 0,
                change: 0,
                changePercent: 0,
                rsi: 50,
                ma20: 0,
                ma60: 0,
                ma120: 0,
              };
              return;
            }
            
            const currentRow = data[0];
            const previousRow = data[1] || data[0];
            
            const currentPrice = (currentRow as any).close ?? 0;
            const previousPrice = (previousRow as any).close ?? 0;
            
            latestPrices[symbol] = {
              symbol,
              price: currentPrice,
              change: currentPrice - previousPrice,
              changePercent: previousPrice > 0 
                ? ((currentPrice - previousPrice) / previousPrice) * 100 
                : 0,
              rsi: 50,
              ma20: 0,
              ma60: 0,
              ma120: 0,
            };
            
            // 지표 계산 및 저장
            const indicators = await calculateTechnicalIndicators(symbol);
            if (indicators) {
              latestPrices[symbol].rsi = indicators.rsi;
              latestPrices[symbol].ma20 = indicators.ma[20] || 0;
              latestPrices[symbol].ma60 = indicators.ma[60] || 0;
              latestPrices[symbol].ma120 = indicators.ma[120] || 0;
            }
          }
        } catch (err) {
          console.warn(`[fetchStockPrices] ${symbol} 처리 실패:`, err);
          latestPrices[symbol] = {
            symbol,
            price: 0,
            change: 0,
            changePercent: 0,
            rsi: 50,
            ma20: 0,
            ma60: 0,
            ma120: 0,
          };
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
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD, KST 기준)
 */
const getTodayDateString = (): string => {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = String(nowKst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nowKst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 초기 데이터 로딩: 모든 종목의 240일치 데이터를 Supabase에서 가져와서 IndexedDB에 저장
 */
export const loadInitialStockData = async (): Promise<void> => {
  try {
    // IndexedDB 초기화
    await initDatabase();
    
    const today = getTodayDateString();
    console.log('[loadInitialStockData] 초기 데이터 로딩 시작:', today);
    
    // 모든 종목에 대해 병렬로 처리
    await Promise.all(
      AVAILABLE_STOCKS.map(async (symbol) => {
        try {
          const metadata = await getStockMetadata(symbol);
          
          // 이미 오늘 날짜의 데이터가 있으면 스킵
          if (metadata && metadata.lastUpdated === today && metadata.dataCount >= 200) {
            console.log(`[loadInitialStockData] ${symbol}: 이미 최신 데이터 있음 (${metadata.dataCount}일)`);
            return;
          }
          
          console.log(`[loadInitialStockData] ${symbol}: Supabase에서 데이터 가져오는 중...`);
          
          // Supabase에서 240일치 데이터 가져오기
          const { data, error } = await supabase
            .from('stock_prices')
            .select('close, trade_date')
            .eq('symbol', symbol)
            .order('trade_date', { ascending: true })
            .limit(240);
          
          if (error || !data || data.length === 0) {
            console.warn(`[loadInitialStockData] ${symbol}: 데이터 없음`, error);
            return;
          }
          
          // IndexedDB 형식으로 변환
          const records: StockPriceRecord[] = data.map((row: any) => ({
            symbol,
            date: row.trade_date || '',
            close: row.close ?? 0,
            updatedAt: Date.now()
          })).filter((r: StockPriceRecord) => r.date && r.close > 0);
          
          if (records.length === 0) return;
          
          // 지표 계산 및 저장
          await calculateAndSaveIndicators(symbol, records);
          
          // 메타데이터 업데이트
          const latestDate = records[records.length - 1].date;
          await updateStockMetadata(symbol, latestDate, records.length);
          
          console.log(`[loadInitialStockData] ${symbol}: ${records.length}일치 데이터 저장 완료`);
        } catch (err) {
          console.error(`[loadInitialStockData] ${symbol} 처리 실패:`, err);
        }
      })
    );
    
    console.log('[loadInitialStockData] 초기 데이터 로딩 완료');
  } catch (err) {
    console.error('[loadInitialStockData] 초기 데이터 로딩 실패:', err);
  }
};

/**
 * 지표 계산 및 IndexedDB에 저장
 */
const calculateAndSaveIndicators = async (
  symbol: string,
  records: StockPriceRecord[]
): Promise<void> => {
  if (records.length === 0) return;
  
  // 가격 배열 추출
  const prices = records.map(r => r.close);
  
  // 각 레코드에 대해 지표 계산 (rolling window)
  const updatedRecords = records.map((record, index) => {
    const updated: StockPriceRecord = { ...record };
    
    // MA20 계산
    if (index >= 19) {
      const pricesForMa20 = prices.slice(index - 19, index + 1);
      updated.ma20 = calculateMA(pricesForMa20, 20);
    } else if (index > 0) {
      const pricesForMa20 = prices.slice(0, index + 1);
      updated.ma20 = calculateMA(pricesForMa20, pricesForMa20.length);
    }
    
    // MA60 계산
    if (index >= 59) {
      const pricesForMa60 = prices.slice(index - 59, index + 1);
      updated.ma60 = calculateMA(pricesForMa60, 60);
    } else if (index > 0) {
      const pricesForMa60 = prices.slice(0, index + 1);
      updated.ma60 = calculateMA(pricesForMa60, pricesForMa60.length);
    }
    
    // MA120 계산
    if (index >= 119) {
      const pricesForMa120 = prices.slice(index - 119, index + 1);
      updated.ma120 = calculateMA(pricesForMa120, 120);
    } else if (index > 0) {
      const pricesForMa120 = prices.slice(0, index + 1);
      updated.ma120 = calculateMA(pricesForMa120, pricesForMa120.length);
    }
    
    // RSI 계산 (최근 14일 이상 데이터 필요)
    if (index >= 14) {
      const pricesForRsi = prices.slice(0, index + 1);
      updated.rsi = calculateRSI(pricesForRsi);
    } else {
      updated.rsi = 50; // 기본값
    }
    
    return updated;
  });
  
  // IndexedDB에 저장
  await saveStockPrices(updatedRecords);
};

/**
 * 부분 업데이트: 최신 1일치 데이터만 추가
 */
export const updateLatestStockData = async (symbol: string): Promise<void> => {
  try {
    const metadata = await getStockMetadata(symbol);
    if (!metadata) {
      // 메타데이터가 없으면 전체 로딩
      await loadInitialStockData();
      return;
    }
    
    const today = getTodayDateString();
    
    // 이미 오늘 데이터가 있으면 스킵
    if (metadata.lastUpdated === today) {
      return;
    }
    
    // Supabase에서 최신 데이터 가져오기
    const { data, error } = await supabase
      .from('stock_prices')
      .select('close, trade_date')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) {
      console.warn(`[updateLatestStockData] ${symbol}: 최신 데이터 없음`);
      return;
    }
    
    const latestRow = data[0];
    const latestDate = latestRow.trade_date;
    
    // 이미 해당 날짜 데이터가 있는지 확인
    const existingData = await getStockPrices(symbol, 1);
    if (existingData.length > 0 && existingData[existingData.length - 1].date === latestDate) {
      return; // 이미 있음
    }
    
    // 새 레코드 생성
    const newRecord: StockPriceRecord = {
      symbol,
      date: latestDate,
      close: latestRow.close ?? 0,
      updatedAt: Date.now()
    };
    
    // 기존 데이터 가져오기 (지표 계산용)
    const allRecords = await getStockPrices(symbol);
    const updatedRecords = [...allRecords, newRecord];
    
    // 지표 재계산 및 저장
    await calculateAndSaveIndicators(symbol, updatedRecords);
    
    // 메타데이터 업데이트
    await updateStockMetadata(symbol, latestDate, updatedRecords.length);
    
    console.log(`[updateLatestStockData] ${symbol}: 최신 데이터 추가 완료`);
  } catch (err) {
    console.error(`[updateLatestStockData] ${symbol} 업데이트 실패:`, err);
  }
};

/**
 * 특정 심볼의 과거 가격 데이터를 가져와서 기술 지표를 계산합니다
 * IndexedDB 우선 사용, 없으면 Supabase에서 가져와서 저장
 */
export const calculateTechnicalIndicators = async (
  symbol: string,
  maPeriods: number[] = [20, 60, 120]
): Promise<{ ma: Record<number, number>; rsi: number } | null> => {
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn('Invalid symbol provided to calculateTechnicalIndicators');
    return null;
  }

  try {
    // IndexedDB에서 데이터 가져오기
    const dbRecords = await getStockPrices(trimmedSymbol, 200);
    
    if (dbRecords.length >= 120) {
      // IndexedDB에 충분한 데이터가 있으면 사용
      const latestRecord = dbRecords[dbRecords.length - 1];
      
      // 이미 계산된 지표가 있으면 사용
      if (latestRecord.ma20 && latestRecord.ma60 && latestRecord.ma120 && latestRecord.rsi) {
        return {
          ma: {
            20: latestRecord.ma20,
            60: latestRecord.ma60,
            120: latestRecord.ma120
          },
          rsi: latestRecord.rsi
        };
      }
      
      // 계산된 지표가 없으면 계산
      const prices = dbRecords.map(r => r.close);
      const ma: Record<number, number> = {};
      for (const period of maPeriods) {
        ma[period] = calculateMA(prices, period);
      }
      const rsi = calculateRSI(prices);
      
      // 계산된 지표를 저장
      const updatedRecords = dbRecords.map((record, index) => {
        if (index === dbRecords.length - 1) {
          return {
            ...record,
            ma20: ma[20],
            ma60: ma[60],
            ma120: ma[120],
            rsi
          };
        }
        return record;
      });
      await saveStockPrices(updatedRecords);
      
      return { ma, rsi };
    }
    
    // IndexedDB에 데이터가 부족하면 Supabase에서 가져오기
    console.log(`[calculateTechnicalIndicators] ${trimmedSymbol}: IndexedDB 데이터 부족, Supabase에서 가져오기`);
    
    const { data, error } = await supabase
      .from('stock_prices')
      .select('close, trade_date')
      .eq('symbol', trimmedSymbol)
      .order('trade_date', { ascending: true })
      .limit(240);

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for', symbol, error);
      return null;
    }

    const prices = data.map(row => (row as any).close).filter(p => p != null && p > 0) as number[];
    if (prices.length === 0) return null;

    const ma: Record<number, number> = {};
    for (const period of maPeriods) {
      ma[period] = calculateMA(prices, period);
    }

    const rsi = calculateRSI(prices);
    
    // IndexedDB에 저장
    const records: StockPriceRecord[] = data.map((row: any, index: number) => {
      const record: StockPriceRecord = {
        symbol: trimmedSymbol,
        date: row.trade_date || '',
        close: row.close ?? 0,
        updatedAt: Date.now()
      };
      
      // 지표 계산
      if (index >= 19) {
        const pricesForMa20 = prices.slice(index - 19, index + 1);
        record.ma20 = calculateMA(pricesForMa20, 20);
      }
      if (index >= 59) {
        const pricesForMa60 = prices.slice(index - 59, index + 1);
        record.ma60 = calculateMA(pricesForMa60, 60);
      }
      if (index >= 119) {
        const pricesForMa120 = prices.slice(index - 119, index + 1);
        record.ma120 = calculateMA(pricesForMa120, 120);
      }
      if (index >= 14) {
        const pricesForRsi = prices.slice(0, index + 1);
        record.rsi = calculateRSI(pricesForRsi);
      }
      
      return record;
    }).filter(r => r.date && r.close > 0);
    
    await calculateAndSaveIndicators(trimmedSymbol, records);
    const latestDate = records[records.length - 1]?.date || '';
    await updateStockMetadata(trimmedSymbol, latestDate, records.length);

    return { ma, rsi };
  } catch (err) {
    console.error('Error calculating technical indicators:', err);
    return null;
  }
};

/**
 * 특정 심볼의 최근 N일간 가격 데이터를 가져옵니다 (차트용)
 * IndexedDB 우선 사용, 계산된 MA20, MA60 값 반환
 */
export const fetchStockPriceHistory = async (
  symbol: string,
  days: number = 90
): Promise<Array<{ date: string; price: number; ma20: number; ma60: number }>> => {
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn('Invalid symbol provided to fetchStockPriceHistory');
    return [];
  }

  try {
    // IndexedDB에서 데이터 가져오기
    const dbRecords = await getStockPrices(trimmedSymbol, days);
    
    if (dbRecords.length > 0) {
      // IndexedDB에 데이터가 있으면 사용 (이미 계산된 지표 포함)
      return dbRecords.map(record => ({
        date: record.date,
        price: record.close,
        ma20: record.ma20 || record.close, // 계산값이 없으면 현재가 사용
        ma60: record.ma60 || record.close
      }));
    }
    
    // IndexedDB에 데이터가 없으면 Supabase에서 가져오기
    console.log(`[fetchStockPriceHistory] ${trimmedSymbol}: IndexedDB 데이터 없음, Supabase에서 가져오기`);
    
    const { data, error } = await supabase
      .from('stock_prices')
      .select('close, trade_date')
      .eq('symbol', trimmedSymbol)
      .order('trade_date', { ascending: false })
      .limit(days);

    if (error || !data || data.length === 0) {
      console.error('Error fetching price history for chart:', symbol, error);
      return [];
    }

    // 날짜 오름차순으로 재정렬
    const prices = data
      .map((row: any) => ({
        date: row.trade_date || '',
        price: row.close ?? 0,
      }))
      .filter(item => item.price > 0 && item.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (prices.length === 0) return [];

    // 가격 배열 추출
    const priceArray = prices.map(p => p.price);

    // 각 데이터 포인트에 대해 MA20, MA60 계산
    const result = prices.map((item, index) => {
      let ma20 = item.price;
      if (index >= 19) {
        const pricesForMa20 = priceArray.slice(index - 19, index + 1);
        ma20 = calculateMA(pricesForMa20, 20);
      } else if (index > 0) {
        const pricesForMa20 = priceArray.slice(0, index + 1);
        ma20 = calculateMA(pricesForMa20, pricesForMa20.length);
      }

      let ma60 = item.price;
      if (index >= 59) {
        const pricesForMa60 = priceArray.slice(index - 59, index + 1);
        ma60 = calculateMA(pricesForMa60, 60);
      } else if (index > 0) {
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
    
    // IndexedDB에 저장 (지표 포함)
    const records: StockPriceRecord[] = result.map((item, index) => {
      const record: StockPriceRecord = {
        symbol: trimmedSymbol,
        date: item.date,
        close: item.price,
        ma20: item.ma20,
        ma60: item.ma60,
        updatedAt: Date.now()
      };
      
      // RSI 계산 (14일 이상 데이터 필요)
      if (index >= 14) {
        const pricesForRsi = priceArray.slice(0, index + 1);
        record.rsi = calculateRSI(pricesForRsi);
      } else {
        record.rsi = 50;
      }
      
      return record;
    });
    
    await saveStockPrices(records);
    const latestDate = records[records.length - 1]?.date || '';
    await updateStockMetadata(trimmedSymbol, latestDate, records.length);

    return result;
  } catch (err) {
    console.error('Unexpected error fetching price history:', err);
    return [];
  }
};
