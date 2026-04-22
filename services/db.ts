import Dexie, { Table } from 'dexie';
import type {
  IndicatorRequirements,
  NoStopIndicatorSnapshot,
  NoStopMovingAveragePeriod,
} from '../types';

// IndexedDB 디버그 로그 토글 (필요할 때만 true로 변경)
const DEBUG_DB_LOG = false;

/**
 * 주가 데이터 인터페이스
 * IndexedDB에 저장되는 주가 데이터 구조
 */
export interface StockPriceRecord {
  // 복합 키: symbol + date
  symbol: string;
  date: string; // YYYY-MM-DD 형식
  close: number; // 종가
  // 계산된 지표들 (선택적)
  ma20?: number;
  ma60?: number;
  ma120?: number;
  rsi?: number;
  // 메타데이터
  updatedAt: number; // timestamp
}

/**
 * 종목별 마지막 업데이트 정보
 */
export interface StockMetadata {
  symbol: string;
  lastUpdated: string; // YYYY-MM-DD 형식
  dataCount: number; // 저장된 데이터 개수
  updatedAt: number; // timestamp
  // 서버(Supabase)에 최신 데이터를 확인하러 간 마지막 기록 (UTC 기준)
  lastCheckedDate?: string; // YYYY-MM-DD 형식 (UTC 날짜)
  lastCheckedAt?: number; // timestamp (UTC 기준 now.getTime())
}

export interface IndicatorSnapshotCacheRecord {
  cacheKey: string;
  symbol: string;
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<NoStopMovingAveragePeriod, number>>;
  needsRsi: boolean;
  maPeriodsKey: string;
  sourceLastUpdated: string;
  updatedAt: number;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeMaPeriods(
  periods: readonly NoStopMovingAveragePeriod[],
): NoStopMovingAveragePeriod[] {
  return Array.from(new Set(periods)).sort((left, right) => left - right);
}

function serializeMaPeriods(
  periods: readonly NoStopMovingAveragePeriod[],
): string {
  return normalizeMaPeriods(periods).join(',');
}

/**
 * Dexie 데이터베이스 클래스
 */
class StockDatabase extends Dexie {
  // 주가 데이터 테이블
  stockPrices!: Table<StockPriceRecord>;
  
  // 종목별 메타데이터 테이블
  stockMetadata!: Table<StockMetadata, string>;

  // 요구사항별 파생 snapshot 캐시 테이블
  indicatorSnapshots!: Table<IndicatorSnapshotCacheRecord, string>;

  constructor() {
    super('StockDatabase');
    
    // 스키마 정의
    this.version(1).stores({
      // [symbol+date]를 복합 키로 사용, symbol과 date로 인덱싱
      stockPrices: '[symbol+date], symbol, date, updatedAt',
      // symbol을 키로 사용
      stockMetadata: 'symbol, lastUpdated, updatedAt'
    });

    this.version(2).stores({
      stockPrices: '[symbol+date], symbol, date, updatedAt',
      stockMetadata: 'symbol, lastUpdated, updatedAt',
      indicatorSnapshots: 'cacheKey, symbol, sourceLastUpdated, updatedAt',
    });
  }
}

// 싱글톤 인스턴스 생성
export const db = new StockDatabase();

/**
 * IndexedDB 초기화 및 에러 핸들링
 */
export const initDatabase = async (): Promise<void> => {
  try {
    await db.open();
    if (DEBUG_DB_LOG) {
      console.log('[IndexedDB] 데이터베이스 초기화 완료');
    }
  } catch (error) {
    console.error('[IndexedDB] 데이터베이스 초기화 실패:', error);
    throw error;
  }
};

/**
 * 종목별 데이터 존재 여부 및 최신 날짜 확인
 */
export const getStockMetadata = async (symbol: string): Promise<StockMetadata | null> => {
  try {
    const metadata = await db.stockMetadata.get(symbol);
    return metadata || null;
  } catch (error) {
    console.error(`[IndexedDB] 메타데이터 조회 실패 (${symbol}):`, error);
    return null;
  }
};

/**
 * 종목별 데이터 개수 확인
 */
export const getStockDataCount = async (symbol: string): Promise<number> => {
  try {
    const count = await db.stockPrices.where('symbol').equals(symbol).count();
    return count;
  } catch (error) {
    console.error(`[IndexedDB] 데이터 개수 조회 실패 (${symbol}):`, error);
    return 0;
  }
};

/**
 * 종목별 주가 데이터 조회 (날짜 범위)
 */
export const getStockPrices = async (
  symbol: string,
  days?: number
): Promise<StockPriceRecord[]> => {
  try {
    let query = db.stockPrices.where('symbol').equals(symbol);
    
    if (days) {
      // 최신 N일 데이터만 가져오기
      const allData = await query.sortBy('date');
      return allData.slice(-days);
    }
    
    // 전체 데이터 가져오기
    return await query.sortBy('date');
  } catch (error) {
    console.error(`[IndexedDB] 주가 데이터 조회 실패 (${symbol}):`, error);
    return [];
  }
};

/**
 * 주가 데이터 일괄 저장
 */
export const saveStockPrices = async (
  records: StockPriceRecord[]
): Promise<void> => {
  if (records.length === 0) {
    return;
  }

  try {
    const affectedSymbols = Array.from(
      new Set(records.map((record) => normalizeSymbol(record.symbol))),
    );

    await db.transaction(
      'rw',
      db.stockPrices,
      db.indicatorSnapshots,
      async () => {
        await db.stockPrices.bulkPut(records);

        await Promise.all(
          affectedSymbols.map((symbol) =>
            db.indicatorSnapshots.where('symbol').equals(symbol).delete(),
          ),
        );
      },
    );

    console.log(`[IndexedDB] ${records.length}개 주가 데이터 저장 완료`);
  } catch (error) {
    console.error('[IndexedDB] 주가 데이터 저장 실패:', error);
    throw error;
  }
};

/**
 * 종목별 메타데이터 업데이트
 */
export const updateStockMetadata = async (
  symbol: string,
  lastUpdated: string,
  dataCount: number
): Promise<void> => {
  try {
    await db.stockMetadata.put({
      symbol,
      lastUpdated,
      dataCount,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error(`[IndexedDB] 메타데이터 업데이트 실패 (${symbol}):`, error);
    throw error;
  }
};

/**
 * 종목별 "서버 확인 시간" 메타데이터 업데이트
 * - 실제로 Supabase에 접속해서 최신 데이터를 확인한 시점을 기록
 * - 주말/공휴일처럼 데이터가 바뀌지 않은 경우에도 호출되어야 함
 */
export const updateLastCheckedMetadata = async (
  symbol: string,
  lastCheckedDate: string,
  lastCheckedAt: number
): Promise<void> => {
  try {
    await db.stockMetadata.update(symbol, {
      lastCheckedDate,
      lastCheckedAt,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`[IndexedDB] lastChecked 메타데이터 업데이트 실패 (${symbol}):`, error);
    throw error;
  }
};

export const getIndicatorSnapshotCache = async (
  cacheKey: string,
  sourceLastUpdated?: string,
): Promise<IndicatorSnapshotCacheRecord | null> => {
  try {
    const record = await db.indicatorSnapshots.get(cacheKey);
    if (record == null) {
      return null;
    }

    if (
      sourceLastUpdated != null &&
      record.sourceLastUpdated !== sourceLastUpdated
    ) {
      return null;
    }

    return record;
  } catch (error) {
    console.error(`[IndexedDB] indicator snapshot 조회 실패 (${cacheKey}):`, error);
    return null;
  }
};

export const saveIndicatorSnapshotCache = async (args: {
  cacheKey: string;
  symbol: string;
  requirements: IndicatorRequirements;
  snapshot: NoStopIndicatorSnapshot;
  sourceLastUpdated: string;
}): Promise<void> => {
  try {
    const normalizedSymbol = normalizeSymbol(args.symbol);
    const normalizedPeriods = normalizeMaPeriods(args.requirements.maPeriods);

    await db.indicatorSnapshots.put({
      cacheKey: args.cacheKey,
      symbol: normalizedSymbol,
      currentPrice: args.snapshot.currentPrice,
      rsi: args.snapshot.rsi,
      maByPeriod: args.snapshot.maByPeriod,
      needsRsi: args.requirements.needsRsi,
      maPeriodsKey: serializeMaPeriods(normalizedPeriods),
      sourceLastUpdated: args.sourceLastUpdated,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(
      `[IndexedDB] indicator snapshot 저장 실패 (${args.cacheKey}):`,
      error,
    );
    throw error;
  }
};

export const deleteIndicatorSnapshotCacheBySymbol = async (
  symbol: string,
): Promise<void> => {
  try {
    await db.indicatorSnapshots
      .where('symbol')
      .equals(normalizeSymbol(symbol))
      .delete();
  } catch (error) {
    console.error(`[IndexedDB] indicator snapshot 삭제 실패 (${symbol}):`, error);
    throw error;
  }
};

/**
 * 특정 종목의 데이터 삭제 (필요시)
 */
export const deleteStockData = async (symbol: string): Promise<void> => {
  try {
    await db.stockPrices.where('symbol').equals(symbol).delete();
    await db.stockMetadata.where('symbol').equals(symbol).delete();
    await deleteIndicatorSnapshotCacheBySymbol(symbol);
    console.log(`[IndexedDB] ${symbol} 데이터 삭제 완료`);
  } catch (error) {
    console.error(`[IndexedDB] 데이터 삭제 실패 (${symbol}):`, error);
    throw error;
  }
};

/**
 * 모든 주가 데이터 삭제 (초기화용)
 */
export const clearAllStockData = async (): Promise<void> => {
  try {
    await db.stockPrices.clear();
    await db.stockMetadata.clear();
    await db.indicatorSnapshots.clear();
    console.log('[IndexedDB] 모든 주가 데이터 삭제 완료');
  } catch (error) {
    console.error('[IndexedDB] 데이터 삭제 실패:', error);
    throw error;
  }
};
