import { supabase } from "./supabase";
import { StockData } from "../types";
import {
  db,
  getStockMetadata,
  getStockPrices,
  initDatabase,
  saveStockPrices,
  StockMetadata,
  StockPriceRecord,
  updateLastCheckedMetadata,
  updateStockMetadata,
} from "./db";
import { AVAILABLE_STOCKS, PAID_STOCKS } from "../constants";
import { calculateMA, calculateRSI, calculateRollingIndicators } from "../utils/technicalIndicators";
import { LATEST_TRADE_DATE_KEY } from "../utils/marketUtils";

/** Supabase stock_prices 테이블 행 타입 */
interface SupabaseStockRow {
  close: number | null;
  trade_date: string | null;
  symbol?: string;
}

// 주가/지표 관련 디버그 로그 토글 (필요할 때만 true로 변경)
const DEBUG_STOCK_LOG = false;

/** 글로벌 기준 거래일을 결정하는 대표 종목 */
const REFERENCE_SYMBOL = "QQQ";

// 중복 요청 방지를 위한 inflight 요청 캐시
const inflightStockRequests = new Map<string, Promise<StockData>>();

/**
 * 주가 데이터를 가져옵니다 (IndexedDB 우선 사용)
 * IndexedDB에 데이터가 없으면 Supabase에서 가져와서 저장
 */
export const fetchStockPrices = async (
  symbols: string[],
): Promise<Record<string, StockData>> => {
  const validSymbols = Array.from(
    new Set(
      symbols
        .filter((s) => s && typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );

  if (!validSymbols.length) {
    return {};
  }

  const results: Record<string, StockData> = {};
  const symbolsToFetch: string[] = [];

  // 1. 이미 진행 중인 요청이 있는지 확인
  for (const symbol of validSymbols) {
    if (inflightStockRequests.has(symbol)) {
      continue;
    }
    symbolsToFetch.push(symbol);
  }

  // 2. 새로운 요청들에 대해 Promise 생성 및 등록
  if (symbolsToFetch.length > 0) {
    symbolsToFetch.forEach((symbol) => {
      const fetchPromise = (async () => {
        try {
          await initDatabase();
          // IndexedDB에서 최신 데이터 가져오기
          const dbRecords = await getStockPrices(symbol, 2);

          if (dbRecords.length > 0) {
            const latestRecord = dbRecords[dbRecords.length - 1];
            const prevRecord = dbRecords.length > 1
              ? dbRecords[dbRecords.length - 2]
              : latestRecord;
            const currentPrice = latestRecord.close;
            const previousPrice = prevRecord.close;

            return {
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
            // Supabase fallback
            const { data, error } = await supabase
              .from("stock_prices")
              .select("symbol, close, trade_date")
              .eq("symbol", symbol)
              .order("trade_date", { ascending: false })
              .limit(2);

            if (error || !data || data.length === 0) {
              return {
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

            const currentRow = data[0] as SupabaseStockRow;
            const previousRow = (data[1] || data[0]) as SupabaseStockRow;
            const currentPrice = currentRow.close ?? 0;
            const previousPrice = previousRow.close ?? 0;

            const baseData: StockData = {
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

            const indicators = await calculateTechnicalIndicators(symbol);
            if (indicators) {
              baseData.rsi = indicators.rsi;
              baseData.ma20 = indicators.ma[20] || 0;
              baseData.ma60 = indicators.ma[60] || 0;
              baseData.ma120 = indicators.ma[120] || 0;
            }
            return baseData;
          }
        } catch (err) {
          console.warn(`[fetchStockPrices] ${symbol} 실패:`, err);
          return {
            symbol,
            price: 0,
            change: 0,
            changePercent: 0,
            rsi: 50,
            ma20: 0,
            ma60: 0,
            ma120: 0,
          };
        } finally {
          // 요청 완료 후 제거
          inflightStockRequests.delete(symbol);
        }
      })();

      inflightStockRequests.set(symbol, fetchPromise);
    });
  }

  // 3. 모든 요청 (신규 + 기존 진행중) 완료 대기
  const allPromises = validSymbols.map((s) => inflightStockRequests.get(s)!);
  const fetchedDataArray = await Promise.all(allPromises);

  fetchedDataArray.forEach((data) => {
    results[data.symbol] = data;
  });

  return results;
};

/**
 * 심볼별 현재가와 직전 일자의 종가를 함께 가져옵니다.
 * stock_prices 테이블에서 각 심볼에 대해 최신 2개 레코드를 조회하여
 * [0] = 현재, [1] = 전일 종가로 간주합니다.
 */
export const fetchStockPricesWithPrev = async (
  symbols: string[],
): Promise<Record<string, { current: number; previous: number }>> => {
  // 빈 배열이나 유효하지 않은 심볼 필터링 및 trim() 처리
  const validSymbols = symbols
    .filter((s) => s && typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!validSymbols.length) {
    console.warn("No valid symbols provided to fetchStockPricesWithPrev");
    return {};
  }

  try {
    // Supabase 라이브러리의 .in() 메서드를 사용하여 안전하게 쿼리
    // 실제 컬럼명: close (종가), trade_date (거래일)
    const { data, error } = await supabase
      .from("stock_prices")
      .select("symbol, close, trade_date")
      .in("symbol", validSymbols)
      .order("symbol", { ascending: true })
      .order("trade_date", { ascending: false });

    if (error) {
      console.error("Error fetching stock prices with prev:", error);
      return {};
    }

    const map: Record<string, { current: number; previous: number }> = {};

    if (data) {
      for (const row of data as SupabaseStockRow[]) {
        const sym = row.symbol;
        if (!sym) continue;
        const symbol = sym;
        const price = row.close ?? 0;

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
    console.error("Unexpected error in fetchStockPricesWithPrev:", err);
    return {};
  }
};

/**
 * 특정 심볼의 주가 데이터를 가져옵니다
 */
export const fetchStockPrice = async (
  symbol: string,
): Promise<StockData | null> => {
  const prices = await fetchStockPrices([symbol]);
  return prices[symbol] || null;
};

/**
 * IndexedDB에서 해당 종목의 최신 거래일(YYYY-MM-DD)을 반환합니다.
 * UI에서 db를 직접 import하지 않고 이 API만 사용하세요.
 * 데이터가 없으면 null을 반환합니다.
 */
export const getLatestLocalTradeDateFromDb = async (
  symbol: string,
): Promise<string | null> => {
  const trimmed = symbol?.trim();
  if (!trimmed) return null;
  try {
    await initDatabase();
    const records = await getStockPrices(trimmed, 1);
    if (records.length > 0) {
      return records[records.length - 1].date;
    }
    return null;
  } catch (err) {
    console.warn("[getLatestLocalTradeDateFromDb]", trimmed, err);
    return null;
  }
};

/**
 * IndexedDB에서 해당 종목의 최근 거래일 목록(날짜 내림차순, 최대 days개)을 반환합니다.
 * UI/훅에서 db를 직접 import하지 않고 이 API만 사용하세요.
 */
export const getRecentTradingDaysFromDb = async (
  symbol: string,
  days: number,
): Promise<string[]> => {
  const trimmed = symbol?.trim();
  if (!trimmed || days <= 0) return [];
  try {
    await initDatabase();
    const records = await getStockPrices(trimmed, days * 2);
    if (records.length === 0) return [];
    const sorted = records.sort((a, b) => b.date.localeCompare(a.date));
    return sorted.slice(0, days).map((r) => r.date);
  } catch (err) {
    console.warn("[getRecentTradingDaysFromDb]", trimmed, err);
    return [];
  }
};

// calculateMA, calculateRSI, calculateRollingIndicators → utils/technicalIndicators.ts에서 import
// 하위 호환성을 위해 re-export
export { calculateMA, calculateRSI } from "../utils/technicalIndicators";

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD, KST 기준)
 * - Supabase stock_prices.trade_date(KST 기반 스케줄링)와 비교용
 */
const getTodayDateString = (): string => {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = String(nowKst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(nowKst.getUTCDate()).padStart(2, "0");
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
  const msSinceLastCheck = lastCheckedAt > 0
    ? nowTs - lastCheckedAt
    : MS_24H + 1;

  const cond1 = isAfterCutoff && metadata.lastCheckedDate !== todayUtc;
  const cond2 = msSinceLastCheck >= MS_24H;

  return cond1 || cond2;
};

/**
 * 종목 리스트에 대해 240일치 데이터를 Supabase → IndexedDB로 로딩하는 공통 로직
 * loadInitialStockData / loadPaidStockData가 이 함수를 공유합니다.
 */
const loadStockDataForSymbols = async (
  symbols: readonly string[],
  logTag: string,
): Promise<void> => {
  try {
    await initDatabase();

    const todayKst = getTodayDateString();
    const nowUtc = new Date();
    const todayUtc = getTodayUtcDateString(nowUtc);

    if (DEBUG_STOCK_LOG) {
      console.log(`[${logTag}] 데이터 로딩 시작:`, todayKst, "(UTC:", todayUtc, ")");
    }

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const metadata = await getStockMetadata(symbol);
          const shouldCheck = shouldCheckServerForSymbol(metadata, nowUtc);

          // 1) 캐시 사용 가능
          if (metadata && metadata.dataCount >= 200 && !shouldCheck) {
            if (DEBUG_STOCK_LOG) {
              console.log(
                `[${logTag}] ${symbol}: 캐시 데이터 사용 (dataCount=${metadata.dataCount})`,
              );
            }
            return;
          }

          // 2) 부분 업데이트
          if (metadata && metadata.dataCount >= 200 && shouldCheck) {
            if (DEBUG_STOCK_LOG) {
              console.log(`[${logTag}] ${symbol}: 부분 업데이트 시도`);
            }
            await updateLatestStockData(symbol);
            return;
          }

          // 3) 전체 240일 로딩
          if (DEBUG_STOCK_LOG) {
            console.log(`[${logTag}] ${symbol}: Supabase에서 전체 240일 데이터 가져오는 중...`);
          }

          const { data, error } = await supabase
            .from("stock_prices")
            .select("close, trade_date")
            .eq("symbol", symbol)
            .order("trade_date", { ascending: true })
            .limit(240);

          if (error || !data || data.length === 0) {
            console.warn(`[${logTag}] ${symbol}: 데이터 없음`, error);
            return;
          }

          const records: StockPriceRecord[] = (data as SupabaseStockRow[])
            .map((row) => ({
              symbol,
              date: row.trade_date || "",
              close: row.close ?? 0,
              updatedAt: Date.now(),
            }))
            .filter((r) => r.date && r.close > 0);

          if (records.length === 0) return;

          await calculateAndSaveIndicators(symbol, records);

          const latestDate = records[records.length - 1].date;
          await updateStockMetadata(symbol, latestDate, records.length);
          await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());

          // 대표 종목의 마지막 거래일을 글로벌 기준일로 저장
          if (typeof window !== "undefined" && symbol === REFERENCE_SYMBOL) {
            window.localStorage.setItem(LATEST_TRADE_DATE_KEY, latestDate);
          }

          if (DEBUG_STOCK_LOG) {
            console.log(`[${logTag}] ${symbol}: ${records.length}일치 데이터 저장 완료`);
          }
        } catch (err) {
          console.error(`[${logTag}] ${symbol} 처리 실패:`, err);
        }
      }),
    );

    if (DEBUG_STOCK_LOG) {
      console.log(`[${logTag}] 데이터 로딩 완료`);
    }
  } catch (err) {
    console.error(`[${logTag}] 데이터 로딩 실패:`, err);
  }
};

/**
 * 초기 데이터 로딩: 무료 종목 240일치
 */
export const loadInitialStockData = (): Promise<void> =>
  loadStockDataForSymbols(AVAILABLE_STOCKS, "loadInitialStockData");

/**
 * 유료 종목 데이터 로딩: PRO/PREMIUM 로그인 이후에만 호출
 */
export const loadPaidStockData = (): Promise<void> =>
  loadStockDataForSymbols(PAID_STOCKS, "loadPaidStockData");

/**
 * 지표 계산 및 IndexedDB에 저장
 * calculateRollingIndicators로 MA20/60/120, RSI를 일괄 계산
 */
const calculateAndSaveIndicators = async (
  symbol: string,
  records: StockPriceRecord[],
): Promise<void> => {
  if (records.length === 0) return;

  const prices = records.map((r) => r.close);
  const indicators = calculateRollingIndicators(prices);

  const updatedRecords = records.map((record, index) => ({
    ...record,
    ma20: indicators[index].ma20,
    ma60: indicators[index].ma60,
    ma120: indicators[index].ma120,
    rsi: indicators[index].rsi,
  }));

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
      console.warn(
        `[updateLatestStockData] ${symbol}: 메타데이터 없음, 상위 로직에서 전체 로딩 필요`,
      );
      return;
    }

    // Supabase에서 최신 데이터 가져오기
    const { data, error } = await supabase
      .from("stock_prices")
      .select("close, trade_date")
      .eq("symbol", symbol)
      .order("trade_date", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      console.warn(`[updateLatestStockData] ${symbol}: 최신 데이터 없음`);
      return;
    }

    const latestRow = data[0];
    const latestDate = latestRow.trade_date;

    // 이미 해당 날짜 데이터가 있는지 확인
    const existingData = await getStockPrices(symbol, 1);
    if (
      existingData.length > 0 &&
      existingData[existingData.length - 1].date === latestDate
    ) {
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
      updatedAt: Date.now(),
    };

    // 기존 데이터 가져오기 (지표 계산용)
    const allRecords = await getStockPrices(symbol);
    const updatedRecords = [...allRecords, newRecord];

    // 지표 재계산 및 저장
    await calculateAndSaveIndicators(symbol, updatedRecords);

    // 메타데이터 업데이트
    await updateStockMetadata(symbol, latestDate, updatedRecords.length);
    await updateLastCheckedMetadata(symbol, todayUtc, nowTs);

    // 대표 종목의 마지막 거래일을 글로벌 기준일로 저장
    if (typeof window !== "undefined" && symbol === REFERENCE_SYMBOL) {
      window.localStorage.setItem(LATEST_TRADE_DATE_KEY, latestDate);
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
  maPeriods: number[] = [20, 60, 120],
): Promise<{ ma: Record<number, number>; rsi: number } | null> => {
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn("Invalid symbol provided to calculateTechnicalIndicators");
    return null;
  }

  try {
    // IndexedDB에서 데이터 가져오기
    const dbRecords = await getStockPrices(trimmedSymbol, 200);

    if (dbRecords.length >= 120) {
      // IndexedDB에 충분한 데이터가 있으면 사용
      const latestRecord = dbRecords[dbRecords.length - 1];

      // 이미 계산된 지표가 있으면 사용
      if (
        latestRecord.ma20 && latestRecord.ma60 && latestRecord.ma120 &&
        latestRecord.rsi
      ) {
        return {
          ma: {
            20: latestRecord.ma20,
            60: latestRecord.ma60,
            120: latestRecord.ma120,
          },
          rsi: latestRecord.rsi,
        };
      }

      // 계산된 지표가 없으면 일괄 계산 후 저장
      await calculateAndSaveIndicators(trimmedSymbol, dbRecords);

      // 저장된 최신 레코드에서 결과 반환
      const savedRecords = await getStockPrices(trimmedSymbol, 200);
      const latest = savedRecords[savedRecords.length - 1];
      const prices = savedRecords.map((r) => r.close);
      const ma: Record<number, number> = {};
      for (const period of maPeriods) {
        ma[period] = latest?.[`ma${period}` as keyof typeof latest] as number || calculateMA(prices, period);
      }

      return { ma, rsi: latest?.rsi || calculateRSI(prices) };
    }

    // IndexedDB에 데이터가 부족하면 Supabase에서 가져오기
    console.log(
      `[calculateTechnicalIndicators] ${trimmedSymbol}: IndexedDB 데이터 부족, Supabase에서 가져오기`,
    );

    const { data, error } = await supabase
      .from("stock_prices")
      .select("close, trade_date")
      .eq("symbol", trimmedSymbol)
      .order("trade_date", { ascending: true })
      .limit(240);

    if (error || !data || data.length === 0) {
      console.error("Error fetching price history for", symbol, error);
      return null;
    }

    // 기본 레코드 생성 (지표 없이)
    const records: StockPriceRecord[] = (data as SupabaseStockRow[])
      .map((row) => ({
        symbol: trimmedSymbol,
        date: row.trade_date || "",
        close: row.close ?? 0,
        updatedAt: Date.now(),
      }))
      .filter((r) => r.date && r.close > 0);

    if (records.length === 0) return null;

    // calculateAndSaveIndicators가 롤링 윈도우로 모든 지표를 계산 + 저장
    await calculateAndSaveIndicators(trimmedSymbol, records);
    const latestDate = records[records.length - 1]?.date || "";
    await updateStockMetadata(trimmedSymbol, latestDate, records.length);

    // 최종 결과 생성
    const prices = records.map((r) => r.close);
    const ma: Record<number, number> = {};
    for (const period of maPeriods) {
      ma[period] = calculateMA(prices, period);
    }
    const rsi = calculateRSI(prices);

    return { ma, rsi };
  } catch (err) {
    console.error("Error calculating technical indicators:", err);
    return null;
  }
};

/**
 * 특정 심볼의 최근 N일간 가격 데이터를 가져옵니다 (차트용)
 * IndexedDB 우선 사용, 계산된 MA20, MA60 값 반환
 */
export const fetchStockPriceHistory = async (
  symbol: string,
  days: number = 90,
): Promise<
  Array<{ date: string; price: number; ma20: number; ma60: number }>
> => {
  const trimmedSymbol = symbol?.trim();
  if (!trimmedSymbol) {
    console.warn("Invalid symbol provided to fetchStockPriceHistory");
    return [];
  }

  try {
    // IndexedDB에서 데이터 가져오기
    const dbRecords = await getStockPrices(trimmedSymbol, days);

    if (dbRecords.length > 0) {
      // IndexedDB에 데이터가 있으면 사용 (이미 계산된 지표 포함)
      return dbRecords.map((record) => ({
        date: record.date,
        price: record.close,
        ma20: record.ma20 || record.close, // 계산값이 없으면 현재가 사용
        ma60: record.ma60 || record.close,
      }));
    }

    // IndexedDB에 데이터가 없으면 Supabase에서 가져오기
    console.log(
      `[fetchStockPriceHistory] ${trimmedSymbol}: IndexedDB 데이터 없음, Supabase에서 가져오기`,
    );

    const { data, error } = await supabase
      .from("stock_prices")
      .select("close, trade_date")
      .eq("symbol", trimmedSymbol)
      .order("trade_date", { ascending: false })
      .limit(days);

    if (error || !data || data.length === 0) {
      console.error("Error fetching price history for chart:", symbol, error);
      return [];
    }

    // 날짜 오름차순으로 정렬된 레코드 생성
    const records: StockPriceRecord[] = (data as SupabaseStockRow[])
      .map((row) => ({
        symbol: trimmedSymbol,
        date: row.trade_date || "",
        close: row.close ?? 0,
        updatedAt: Date.now(),
      }))
      .filter((r) => r.date && r.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (records.length === 0) return [];

    // calculateAndSaveIndicators가 롤링 윈도우로 모든 지표를 계산 + 저장
    await calculateAndSaveIndicators(trimmedSymbol, records);
    const latestDate = records[records.length - 1]?.date || "";
    await updateStockMetadata(trimmedSymbol, latestDate, records.length);

    // 저장된 데이터를 다시 읽어서 계산된 지표 포함 반환
    const savedRecords = await getStockPrices(trimmedSymbol, days);
    return savedRecords.map((record) => ({
      date: record.date,
      price: record.close,
      ma20: record.ma20 || record.close,
      ma60: record.ma60 || record.close,
    }));
  } catch (err) {
    console.error("Unexpected error fetching price history:", err);
    return [];
  }
};
