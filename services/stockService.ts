import { supabase } from './supabase';
import { StockData } from '../types';
import { 
  db, 
  initDatabase, 
  getStockMetadata, 
  getStockPrices, 
  saveStockPrices, 
  updateStockMetadata,
  updateLastCheckedMetadata,
  StockPriceRecord,
  StockMetadata,
} from './db';
import { AVAILABLE_STOCKS, PAID_STOCKS } from '../constants';

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
 * RSI 계산 (Wilder's Smoothing 방식)
 * 금융 사이트 수준의 정확도를 위한 표준 RSI 계산 방법
 * 
 * Wilder's Smoothing 알고리즘:
 * 1. 첫 번째 평균은 period 기간의 단순 평균
 * 2. 이후는 Wilder's Smoothing 공식 사용:
 *    - Average Gain = (Previous Avg Gain × (period - 1) + Current Gain) / period
 *    - Average Loss = (Previous Avg Loss × (period - 1) + Current Loss) / period
 * 3. RS = Average Gain / Average Loss
 * 4. RSI = 100 - (100 / (1 + RS))
 * 
 * @param prices 가격 배열 (가장 오래된 것부터 순서대로, 날짜 오름차순)
 * @param period RSI 기간 (기본값: 14일)
 * @returns RSI 값 (0-100)
 */
export const calculateRSI = (prices: number[], period: number = 14): number => {
  // 최소 period + 1개의 데이터가 필요 (변화량 계산을 위해)
  if (prices.length < period + 1) {
    return 50; // 데이터 부족 시 중립값 반환
  }

  // 가격 변화량 계산 (가장 오래된 것부터 순서대로)
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    changes.push(change);
  }

  // 첫 번째 평균 계산 (period 기간의 단순 평균)
  let avgGain = 0;
  let avgLoss = 0;
  
  // 첫 period 개의 변화량으로 초기 평균 계산
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain = avgGain / period;
  avgLoss = avgLoss / period;

  // Wilder's Smoothing으로 나머지 데이터 처리
  // period + 1번째부터 마지막까지 순차적으로 계산
  for (let i = period; i < changes.length; i++) {
    const currentChange = changes[i];
    let currentGain = 0;
    let currentLoss = 0;

    if (currentChange > 0) {
      currentGain = currentChange;
    } else {
      currentLoss = Math.abs(currentChange);
    }

    // Wilder's Smoothing 공식
    // Average = (Previous Average × (period - 1) + Current Value) / period
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  // RS 및 RSI 계산
  if (avgLoss === 0) {
    // 손실이 없으면 RSI = 100 (과매수 상태)
    return 100;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  // RSI 값 범위 제한 (0-100)
  return Math.max(0, Math.min(100, rsi));
};

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD, KST 기준)
 * - Supabase stock_prices.trade_date(KST 기반 스케줄링)와 비교용
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
 * UTC 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 * - lastCheckedDate 기록용
 */
const getTodayUtcDateString = (nowUtc: Date = new Date()): string => {
  return nowUtc.toISOString().slice(0, 10);
};

/**
 * 오늘 기준 UTC 22:15 (서버 데이터 최종 업데이트 가정 시각)
 */
const getTodayUtcCutoff = (nowUtc: Date): Date => {
  return new Date(
    Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      22,
      15,
      0,
    ),
  );
};

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * Supabase에 "최신 데이터 확인"을 할지 여부 판단
 *
 * 조건 (OR):
 * 1. 현재 시각이 UTC 22:15 이후이고, 아직 오늘 날짜(UTC)로 서버 확인을 하지 않은 경우
 * 2. 마지막 서버 확인 시점(lastCheckedAt)으로부터 24시간 이상 경과한 경우
 *
 * metadata가 없는 경우(최초 실행)에는 항상 true 반환
 */
const shouldCheckServerForSymbol = (
  metadata: StockMetadata | null,
  nowUtc: Date,
): boolean => {
  if (!metadata) return true;

  const nowTs = nowUtc.getTime();
  const todayUtc = getTodayUtcDateString(nowUtc);
  const cutoffUtc = getTodayUtcCutoff(nowUtc);
  const isAfterCutoff = nowUtc >= cutoffUtc;

  const lastCheckedAt = metadata.lastCheckedAt ?? 0;
  const msSinceLastCheck =
    lastCheckedAt > 0 ? nowTs - lastCheckedAt : MS_24H + 1;

  const cond1 = isAfterCutoff && metadata.lastCheckedDate !== todayUtc;
  const cond2 = msSinceLastCheck >= MS_24H;

  return cond1 || cond2;
};

/**
 * 초기 데이터 로딩: 모든 종목의 240일치 데이터를 Supabase에서 가져와서 IndexedDB에 저장
 */
export const loadInitialStockData = async (): Promise<void> => {
  try {
    // IndexedDB 초기화
    await initDatabase();
    
    const todayKst = getTodayDateString();
    const nowUtc = new Date();
    const todayUtc = getTodayUtcDateString(nowUtc);
    console.log('[loadInitialStockData] 초기 데이터 로딩 시작:', todayKst, '(UTC:', todayUtc, ')');
    
    // 무료 종목에 대해 병렬로 처리
    await Promise.all(
      AVAILABLE_STOCKS.map(async (symbol) => {
        try {
          const metadata = await getStockMetadata(symbol);
          const shouldCheck = shouldCheckServerForSymbol(metadata, nowUtc);

          // 1) 데이터가 충분(200일 이상)이고, 오늘/24시간 이내에 이미 확인했다면 서버에 다시 묻지 않고 캐시 사용
          if (metadata && metadata.dataCount >= 200 && !shouldCheck) {
            console.log(
              `[loadInitialStockData] ${symbol}: 캐시 데이터 사용 (dataCount=${metadata.dataCount}, lastUpdated=${metadata.lastUpdated}, lastCheckedDate=${metadata.lastCheckedDate})`,
            );
            return;
          }

          // 2) 데이터가 충분(200일 이상)이고, 서버 확인 조건을 충족한다면 최신 1일치만 부분 업데이트
          if (metadata && metadata.dataCount >= 200 && shouldCheck) {
            console.log(
              `[loadInitialStockData] ${symbol}: 부분 업데이트 조건 충족 → 최신 1일치 업데이트 시도`,
            );
            await updateLatestStockData(symbol);
            return;
          }

          // 3) 그 외(메타데이터가 없거나, 데이터가 부족한 경우): 전체 240일 데이터 로딩
          console.log(
            `[loadInitialStockData] ${symbol}: 메타데이터 없음 또는 데이터 부족 → Supabase에서 전체 240일 데이터 가져오는 중...`,
          );
          
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
          await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());

          // QQQ는 글로벌 기준일로 활용 (마지막 거래일 저장)
          if (typeof window !== 'undefined' && symbol === 'QQQ') {
            window.localStorage.setItem('LATEST_TRADE_DATE', latestDate);
          }
          
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
 * 유료 종목 데이터 로딩: PRO/PREMIUM 로그인 이후에만 호출
 * Supabase에서 240일치 데이터를 가져와 IndexedDB에 추가 저장
 */
export const loadPaidStockData = async (): Promise<void> => {
  try {
    await initDatabase();
    const todayKst = getTodayDateString();
    const nowUtc = new Date();
    const todayUtc = getTodayUtcDateString(nowUtc);
    console.log('[loadPaidStockData] 유료 종목 데이터 로딩 시작:', todayKst, '(UTC:', todayUtc, ')');

    await Promise.all(
      PAID_STOCKS.map(async (symbol) => {
        try {
          const metadata = await getStockMetadata(symbol);
          const shouldCheck = shouldCheckServerForSymbol(metadata, nowUtc);

          // 1) 데이터가 충분(200일 이상)이고, 오늘/24시간 이내에 이미 확인했다면 서버에 다시 묻지 않고 캐시 사용
          if (metadata && metadata.dataCount >= 200 && !shouldCheck) {
            console.log(
              `[loadPaidStockData] ${symbol}: 캐시 데이터 사용 (dataCount=${metadata.dataCount}, lastUpdated=${metadata.lastUpdated}, lastCheckedDate=${metadata.lastCheckedDate})`,
            );
            return;
          }

          // 2) 데이터가 충분(200일 이상)이고, 서버 확인 조건을 충족한다면 최신 1일치만 부분 업데이트
          if (metadata && metadata.dataCount >= 200 && shouldCheck) {
            console.log(
              `[loadPaidStockData] ${symbol}: 부분 업데이트 조건 충족 → 최신 1일치 업데이트 시도`,
            );
            await updateLatestStockData(symbol);
            return;
          }

          console.log(
            `[loadPaidStockData] ${symbol}: 메타데이터 없음 또는 데이터 부족 → Supabase에서 전체 240일 데이터 가져오는 중...`,
          );
          const { data, error } = await supabase
            .from('stock_prices')
            .select('close, trade_date')
            .eq('symbol', symbol)
            .order('trade_date', { ascending: true })
            .limit(240);

          if (error || !data || data.length === 0) {
            console.warn(`[loadPaidStockData] ${symbol}: 데이터 없음`, error);
            return;
          }

          const records: StockPriceRecord[] = data
            .map((row: any) => ({
              symbol,
              date: row.trade_date || '',
              close: row.close ?? 0,
              updatedAt: Date.now(),
            }))
            .filter((r: StockPriceRecord) => r.date && r.close > 0);

          if (records.length === 0) return;

          await calculateAndSaveIndicators(symbol, records);
          const latestDate = records[records.length - 1].date;
          await updateStockMetadata(symbol, latestDate, records.length);
          await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());

          // QQQ는 글로벌 기준일로 활용 (마지막 거래일 저장)
          if (typeof window !== 'undefined' && symbol === 'QQQ') {
            window.localStorage.setItem('LATEST_TRADE_DATE', latestDate);
          }
          console.log(`[loadPaidStockData] ${symbol}: ${records.length}일치 데이터 저장 완료`);
        } catch (err) {
          console.error(`[loadPaidStockData] ${symbol} 처리 실패:`, err);
        }
      })
    );

    console.log('[loadPaidStockData] 유료 종목 데이터 로딩 완료');
  } catch (err) {
    console.error('[loadPaidStockData] 유료 종목 데이터 로딩 실패:', err);
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
    const nowUtc = new Date();
    const todayUtc = getTodayUtcDateString(nowUtc);
    const nowTs = nowUtc.getTime();

    const metadata = await getStockMetadata(symbol);
    if (!metadata) {
      // 메타데이터가 없으면 상위 로직에서 전체 로딩을 수행하도록 위임
      console.warn(`[updateLatestStockData] ${symbol}: 메타데이터 없음, 상위 로직에서 전체 로딩 필요`);
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
      // 이미 최신 거래일 데이터가 있는 경우:
      // - 주말/공휴일/미국장 휴장일일 수 있음
      // - 데이터는 그대로 두되, "오늘 확인 완료" 기록만 갱신
      await updateLastCheckedMetadata(symbol, todayUtc, nowTs);
      return;
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
    await updateLastCheckedMetadata(symbol, todayUtc, nowTs);
    
    // QQQ는 글로벌 기준일로 활용 (마지막 거래일 저장)
    if (typeof window !== 'undefined' && symbol === 'QQQ') {
      window.localStorage.setItem('LATEST_TRADE_DATE', latestDate);
    }
    
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
