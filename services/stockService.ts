import { supabase } from "./supabase";
import type {
  IndicatorRequirements,
  NoStopIndicatorSnapshot,
  NoStopMovingAveragePeriod,
  StockData,
} from "../types";
import {
  getIndicatorSnapshotCache,
  getStockMetadata,
  getStockPrices,
  initDatabase,
  saveIndicatorSnapshotCache,
  saveStockPrices,
  StockMetadata,
  StockPriceRecord,
  updateLastCheckedMetadata,
  updateStockMetadata,
} from "./db";
import { AVAILABLE_STOCKS, PAID_STOCKS } from "../constants";
import { calculateMA, calculateRSI, calculateRollingIndicators } from "../utils/technicalIndicators";
import { LATEST_TRADE_DATE_KEY } from "../utils/marketUtils";
import { EMPTY_PRICE_HISTORY_ERROR } from "../supabase/functions/_shared/noStopMultiSplitShared.ts";
import {
  createServiceError,
  DEFAULT_FETCH_TIMEOUT_MS,
  failResult,
  isRecord,
  normalizeErrorMessage,
  okResult,
  readFiniteNumber,
  readString,
  type ServiceResult,
} from "./serviceUtils";

/** Supabase stock_prices 테이블 행 타입 */
interface SupabaseStockRow {
  close: number | null;
  trade_date: string | null;
  symbol?: string;
}

const DEFAULT_RSI = 50;
const DEFAULT_MA = 0;
const STOCK_SNAPSHOT_FETCH_LIMIT = 2;
const STOCK_FULL_LOAD_LIMIT = 240;
const STOCK_PRICE_PREV_FETCH_CONCURRENCY = 5;
const MIN_RSI_HISTORY = 15;
const INDEXED_DB_INIT_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;
const PRICE_ONLY_INDICATOR_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: false,
  maPeriods: [],
};
const STOCK_DATA_INDICATOR_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: true,
  maPeriods: [20, 60, 120],
};
type StockPriceFetchMode = 'price-only' | 'with-standard-indicators';

interface StockQueryOptions {
  mode?: StockPriceFetchMode;
  signal?: AbortSignal;
}

/** 글로벌 기준 거래일을 결정하는 대표 종목 */
const REFERENCE_SYMBOL = "QQQ";

type IndicatorSnapshotCacheEntry = {
  snapshot: NoStopIndicatorSnapshot;
  sourceLastUpdated: string;
};

type TechnicalIndicatorResult = Pick<
  NoStopIndicatorSnapshot,
  "rsi" | "maByPeriod"
>;
type IndicatorSnapshotResult = ServiceResult<NoStopIndicatorSnapshot | null>;
type StockPriceMap = Record<string, StockData>;
type StockPriceHistoryPoint = {
  date: string;
  price: number;
  ma20: number;
  ma60: number;
};

const indicatorSnapshotMemoryCache = new Map<
  string,
  IndicatorSnapshotCacheEntry
>();
const indicatorSnapshotInflightRequests = new Map<
  string,
  Promise<IndicatorSnapshotResult>
>();
const stockPriceInflightRequests = new Map<
  string,
  Promise<StockPriceMap>
>();
const stockHistoryInflightRequests = new Map<
  string,
  Promise<StockPriceHistoryPoint[]>
>();

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted');
  }

  return false;
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function resolveSharedRequestWithAbort<T>(
  request: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal == null) {
    return request;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let hasSettled = false;
    const handleAbort = () => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      signal.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };
    const handleResolve = (value: T) => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      signal.removeEventListener('abort', handleAbort);
      resolve(value);
    };
    const handleReject = (error: unknown) => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      signal.removeEventListener('abort', handleAbort);
      reject(error);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    request.then(handleResolve, handleReject);
  });
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];

  for (let index = 0; index < inputs.length; index += concurrency) {
    const batch = inputs.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }

  return results;
}

function normalizeTickerSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeTickerSymbols(symbols: readonly string[]): string[] {
  return Array.from(
    new Set(
      symbols
        .filter((symbol) => typeof symbol === "string")
        .map((symbol) => normalizeTickerSymbol(symbol))
        .filter((symbol) => symbol.length > 0),
    ),
  );
}

function buildStockPriceInflightKey(
  symbols: readonly string[],
  mode: StockPriceFetchMode,
): string {
  return `${mode}|${[...symbols].sort().join(",")}`;
}

function buildStockHistoryInflightKey(symbol: string, days: number): string {
  return `${symbol}|days:${days}`;
}

function isSupportedMovingAveragePeriod(
  value: number,
): value is NoStopMovingAveragePeriod {
  return value === 5 || value === 20 || value === 60 || value === 120;
}

function normalizeIndicatorRequirements(
  requirements: IndicatorRequirements,
): IndicatorRequirements {
  const maPeriods = Array.from(
    new Set(
      requirements.maPeriods.filter((period) =>
        isSupportedMovingAveragePeriod(period),
      ),
    ),
  ).sort((left, right) => left - right);

  return {
    needsRsi: requirements.needsRsi === true,
    maPeriods,
  };
}

function cloneIndicatorSnapshot(
  snapshot: NoStopIndicatorSnapshot,
): NoStopIndicatorSnapshot {
  return {
    currentPrice: snapshot.currentPrice,
    ...(snapshot.rsi !== undefined ? { rsi: snapshot.rsi } : {}),
    ...(snapshot.maByPeriod != null
      ? { maByPeriod: { ...snapshot.maByPeriod } }
      : {}),
  };
}

function buildRequestedMovingAverageMap(args: {
  latestRecord: StockPriceRecord;
  prices: number[];
  requirements: IndicatorRequirements;
}): Partial<Record<NoStopMovingAveragePeriod, number>> {
  const maByPeriod: Partial<Record<NoStopMovingAveragePeriod, number>> = {};

  for (const period of args.requirements.maPeriods) {
    if (args.prices.length < period) {
      continue;
    }

    const storedValue = readStoredMovingAverage(args.latestRecord, period);
    if (storedValue != null && storedValue > 0) {
      maByPeriod[period] = storedValue;
      continue;
    }

    const calculatedValue = calculateMA(args.prices, period);
    if (calculatedValue > 0) {
      maByPeriod[period] = calculatedValue;
    }
  }

  return maByPeriod;
}

function readRequestedRsi(args: {
  latestRecord: StockPriceRecord;
  prices: number[];
  requirements: IndicatorRequirements;
}): number | undefined {
  if (!args.requirements.needsRsi) {
    return undefined;
  }

  if (args.prices.length < MIN_RSI_HISTORY) {
    return undefined;
  }

  if (args.latestRecord.rsi != null && args.latestRecord.rsi >= 0) {
    return args.latestRecord.rsi;
  }

  const calculatedRsi = calculateRSI(args.prices);
  return Number.isFinite(calculatedRsi) ? calculatedRsi : undefined;
}

function getRequiredHistoryCount(requirements: IndicatorRequirements): number {
  const maxPeriod =
    requirements.maPeriods.length > 0
      ? Math.max(...requirements.maPeriods)
      : 1;
  const rsiHistoryCount = requirements.needsRsi ? MIN_RSI_HISTORY : 1;

  return Math.max(1, maxPeriod, rsiHistoryCount);
}

function readCurrentPriceFromRecords(records: StockPriceRecord[]): number {
  if (records.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const latestRecord = records[records.length - 1];
  const currentPrice = latestRecord?.close ?? 0;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  return currentPrice;
}

function extractRecentTradingDaysFromRecords(
  records: StockPriceRecord[],
  days: number,
): string[] {
  if (days <= 0 || records.length === 0) {
    return [];
  }

  const uniqueRecentDays = new Set<string>();
  const sortedRecords = [...records].sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  for (const record of sortedRecords) {
    if (record.date.length === 0) {
      continue;
    }

    uniqueRecentDays.add(record.date);
    if (uniqueRecentDays.size >= days) {
      break;
    }
  }

  return Array.from(uniqueRecentDays);
}

function readTechnicalIndicatorsFromRecords(
  records: StockPriceRecord[],
  requirements: IndicatorRequirements,
): TechnicalIndicatorResult {
  if (records.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const latestRecord = records[records.length - 1];
  const prices = records.map((record) => record.close);
  const normalizedRequirements = normalizeIndicatorRequirements(requirements);
  const indicators: TechnicalIndicatorResult = {};
  const rsi = readRequestedRsi({
    latestRecord,
    prices,
    requirements: normalizedRequirements,
  });
  const maByPeriod = buildRequestedMovingAverageMap({
    latestRecord,
    prices,
    requirements: normalizedRequirements,
  });

  if (rsi !== undefined) {
    indicators.rsi = rsi;
  }

  if (Object.keys(maByPeriod).length > 0) {
    indicators.maByPeriod = maByPeriod;
  }

  return indicators;
}

export function buildIndicatorRequirementCacheKey(args: {
  symbol: string;
  requirements: IndicatorRequirements;
}): string {
  const normalizedSymbol = normalizeTickerSymbol(args.symbol);
  const normalizedRequirements = normalizeIndicatorRequirements(
    args.requirements,
  );

  return [
    normalizedSymbol,
    normalizedRequirements.needsRsi ? "rsi:1" : "rsi:0",
    `ma:${normalizedRequirements.maPeriods.join(",")}`,
  ].join("|");
}

function readIndicatorSnapshotFromMemoryCache(
  cacheKey: string,
  sourceLastUpdated: string,
): NoStopIndicatorSnapshot | null {
  const cachedEntry = indicatorSnapshotMemoryCache.get(cacheKey);
  if (cachedEntry == null) {
    return null;
  }

  if (cachedEntry.sourceLastUpdated !== sourceLastUpdated) {
    indicatorSnapshotMemoryCache.delete(cacheKey);
    return null;
  }

  return cloneIndicatorSnapshot(cachedEntry.snapshot);
}

function writeIndicatorSnapshotToMemoryCache(args: {
  cacheKey: string;
  snapshot: NoStopIndicatorSnapshot;
  sourceLastUpdated: string;
}): void {
  indicatorSnapshotMemoryCache.set(args.cacheKey, {
    snapshot: cloneIndicatorSnapshot(args.snapshot),
    sourceLastUpdated: args.sourceLastUpdated,
  });
}

function clearIndicatorSnapshotMemoryCacheBySymbol(symbol: string): void {
  const normalizedSymbol = normalizeTickerSymbol(symbol);

  for (const cacheKey of indicatorSnapshotMemoryCache.keys()) {
    if (cacheKey.startsWith(`${normalizedSymbol}|`)) {
      indicatorSnapshotMemoryCache.delete(cacheKey);
    }
  }
}

async function withOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  try {
    return await Promise.race<T>([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(createAbortError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

async function isIndicatorSnapshotDatabaseReady(): Promise<boolean> {
  try {
    await withOperationTimeout(initDatabase(), INDEXED_DB_INIT_TIMEOUT_MS);
    return true;
  } catch (error) {
    console.error(
      '[stockService] IndexedDB unavailable for indicator snapshot fetch:',
      error,
    );
    return false;
  }
}

async function persistFetchedPriceHistory(args: {
  isDatabaseReady: boolean;
  symbol: string;
  records: StockPriceRecord[];
  latestTradeDate: string;
}): Promise<void> {
  clearIndicatorSnapshotMemoryCacheBySymbol(args.symbol);

  if (!args.isDatabaseReady) {
    return;
  }

  try {
    await saveStockPrices(args.records);
    await updateStockMetadata(
      args.symbol,
      args.latestTradeDate,
      args.records.length,
    );
  } catch (error) {
    console.error(
      `[stockService] Failed to persist price history (${args.symbol}):`,
      error,
    );
  }
}

async function persistIndicatorSnapshotCache(args: {
  isDatabaseReady: boolean;
  cacheKey: string;
  symbol: string;
  requirements: IndicatorRequirements;
  snapshot: NoStopIndicatorSnapshot;
  sourceLastUpdated: string;
}): Promise<void> {
  if (!args.isDatabaseReady) {
    return;
  }

  try {
    await saveIndicatorSnapshotCache({
      cacheKey: args.cacheKey,
      symbol: args.symbol,
      requirements: args.requirements,
      snapshot: args.snapshot,
      sourceLastUpdated: args.sourceLastUpdated,
    });
  } catch (error) {
    console.error(
      `[stockService] Failed to persist indicator snapshot (${args.cacheKey}):`,
      error,
    );
  }
}

function mapIndicatorSnapshotToStockData(args: {
  symbol: string;
  snapshot: NoStopIndicatorSnapshot;
}): StockData {
  return {
    symbol: args.symbol,
    price: args.snapshot.currentPrice,
    change: 0,
    changePercent: 0,
    rsi: args.snapshot.rsi ?? DEFAULT_RSI,
    ma20: args.snapshot.maByPeriod?.[20] ?? DEFAULT_MA,
    ma60: args.snapshot.maByPeriod?.[60] ?? DEFAULT_MA,
    ma120: args.snapshot.maByPeriod?.[120] ?? DEFAULT_MA,
  };
}

function createStockQueryServiceError(
  error: unknown,
  fallbackMessage: string,
  symbol: string,
) {
  const isAbortError =
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error
        ? error.name === 'AbortError' ||
          error.message.toLowerCase().includes('aborted')
        : false;

  return createServiceError(
    isAbortError ? 'TIMEOUT' : 'NETWORK',
    normalizeErrorMessage(error, fallbackMessage),
    {
      retryable: !isAbortError,
      cause: error,
      context: { symbol },
    },
  );
}

function createEmptyStockData(symbol: string): StockData {
  return {
    symbol,
    price: 0,
    change: 0,
    changePercent: 0,
    rsi: DEFAULT_RSI,
    ma20: DEFAULT_MA,
    ma60: DEFAULT_MA,
    ma120: DEFAULT_MA,
  };
}

function roundPercentWithSign(value: number): number {
  if (value === 0) {
    return 0;
  }

  return Math.round(
    (value + Math.sign(value) * Number.EPSILON) * 100,
  ) / 100;
}

function decodeSupabaseStockRow(value: unknown): SupabaseStockRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const tradeDate = readString(value, "trade_date");
  const close = readFiniteNumber(value, "close");
  const symbol = readString(value, "symbol") ?? undefined;
  if (tradeDate == null || close == null || close <= 0) {
    return null;
  }

  return {
    symbol,
    trade_date: tradeDate,
    close,
  };
}

function decodeSupabaseStockRows(value: unknown): SupabaseStockRow[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rows = value
    .map((item) => decodeSupabaseStockRow(item))
    .filter((item): item is SupabaseStockRow => item !== null);

  return rows.length > 0 ? rows : null;
}

function mapRowsToStockData(
  symbol: string,
  rows: SupabaseStockRow[],
): StockData {
  const currentRow = rows[0];
  const previousRow = rows[1] ?? currentRow;
  const currentPrice = currentRow.close ?? 0;
  const previousPrice = previousRow.close ?? currentPrice;
  const rawChangePercent =
    previousPrice > 0
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : 0;

  return {
    symbol,
    price: currentPrice,
    change: currentPrice - previousPrice,
    changePercent: roundPercentWithSign(rawChangePercent),
    rsi: DEFAULT_RSI,
    ma20: DEFAULT_MA,
    ma60: DEFAULT_MA,
    ma120: DEFAULT_MA,
  };
}

function mapDbRecordsToStockData(
  symbol: string,
  records: StockPriceRecord[],
): StockData {
  if (records.length === 0) {
    return createEmptyStockData(symbol);
  }

  const latestRecord = records[records.length - 1];
  const previousRecord = records.length > 1
    ? records[records.length - 2]
    : latestRecord;
  const rawChangePercent =
    previousRecord.close > 0
      ? ((latestRecord.close - previousRecord.close) / previousRecord.close) * 100
      : 0;

  return {
    symbol,
    price: latestRecord.close,
    change: latestRecord.close - previousRecord.close,
    changePercent: roundPercentWithSign(rawChangePercent),
    rsi: latestRecord.rsi ?? DEFAULT_RSI,
    ma20: latestRecord.ma20 ?? DEFAULT_MA,
    ma60: latestRecord.ma60 ?? DEFAULT_MA,
    ma120: latestRecord.ma120 ?? DEFAULT_MA,
  };
}

function mapRowsBySymbol(rows: SupabaseStockRow[]): Record<string, SupabaseStockRow[]> {
  return rows.reduce<Record<string, SupabaseStockRow[]>>((acc, row) => {
    const symbol = row.symbol?.trim();
    if (!symbol) {
      return acc;
    }

    if (acc[symbol] == null) {
      acc[symbol] = [];
    }

    acc[symbol].push(row);
    return acc;
  }, {});
}

function toStockPriceRecords(
  symbol: string,
  rows: SupabaseStockRow[],
): StockPriceRecord[] {
  const updatedAt = Date.now();

  return rows.map((row) => ({
    symbol,
    date: row.trade_date ?? "",
    close: row.close ?? 0,
    updatedAt,
  }));
}

function readStoredMovingAverage(
  record: StockPriceRecord | undefined,
  period: number,
): number | null {
  if (record == null) {
    return null;
  }

  switch (period) {
    case 20:
      return record.ma20 ?? null;
    case 60:
      return record.ma60 ?? null;
    case 120:
      return record.ma120 ?? null;
    default:
      return null;
  }
}

async function fetchPriceHistoryFromSupabase(args: {
  symbol: string;
  limit: number;
  options?: StockQueryOptions;
}): Promise<StockPriceRecord[]> {
  let query = supabase
    .from("stock_prices")
    .select("close, trade_date")
    .eq("symbol", args.symbol)
    .order("trade_date", { ascending: false })
    .limit(args.limit);

  if (args.options?.signal != null) {
    query = query.abortSignal(args.options.signal);
  }

  const { data, error } = await query;
  throwIfAborted(args.options?.signal);

  if (error != null) {
    if (isAbortLikeError(error)) {
      throw createAbortError();
    }
    throw error;
  }

  const decodedRows = decodeSupabaseStockRows(data);
  if (decodedRows == null) {
    return [];
  }

  return toStockPriceRecords(args.symbol, decodedRows)
    .filter((record) => record.date.length > 0 && record.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function getOrFetchPriceHistoryForRequirements(
  symbol: string,
  requirements: IndicatorRequirements,
  options: StockQueryOptions = {},
  isDatabaseReady: boolean = true,
): Promise<{
  records: StockPriceRecord[];
  latestTradeDate: string;
  source: "indexeddb" | "supabase";
}> {
  throwIfAborted(options.signal);

  const normalizedRequirements = normalizeIndicatorRequirements(requirements);
  const requiredHistoryCount = getRequiredHistoryCount(normalizedRequirements);
  const localRecords = isDatabaseReady
    ? await getStockPrices(symbol, requiredHistoryCount)
    : [];
  const latestLocalTradeDate = localRecords[localRecords.length - 1]?.date ?? "";

  if (
    localRecords.length >= requiredHistoryCount &&
    latestLocalTradeDate.length > 0
  ) {
    return {
      records: localRecords,
      latestTradeDate: latestLocalTradeDate,
      source: "indexeddb",
    };
  }

  const fetchedRecords = await fetchPriceHistoryFromSupabase({
    symbol,
    limit: Math.max(requiredHistoryCount, STOCK_SNAPSHOT_FETCH_LIMIT),
    options,
  });

  if (fetchedRecords.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const latestTradeDate =
    fetchedRecords[fetchedRecords.length - 1]?.date ?? "";
  if (latestTradeDate.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  await persistFetchedPriceHistory({
    isDatabaseReady,
    symbol,
    records: fetchedRecords,
    latestTradeDate,
  });

  return {
    records: fetchedRecords,
    latestTradeDate,
    source: "supabase",
  };
}

/**
 * 주가 데이터를 가져옵니다 (IndexedDB 우선 사용)
 * IndexedDB에 데이터가 없으면 Supabase에서 가져와서 저장
 */
const fetchStockPricesInternal = async (
  symbols: string[],
  options: StockQueryOptions = {},
): Promise<StockPriceMap> => {
  const { signal } = options;
  const mode = options.mode ?? 'with-standard-indicators';
  throwIfAborted(signal);

  const validSymbols = normalizeTickerSymbols(symbols);

  if (!validSymbols.length) {
    return {};
  }

  await initDatabase();
  const lookupResults = await Promise.all(
    validSymbols.map(async (symbol) => {
      throwIfAborted(signal);
      const dbRecords = await getStockPrices(symbol, STOCK_SNAPSHOT_FETCH_LIMIT);
      return { symbol, dbRecords };
    }),
  );

  throwIfAborted(signal);

  const results: Record<string, StockData> = {};
  const dbMissSymbols = lookupResults
    .filter((item) => item.dbRecords.length === 0)
    .map((item) => item.symbol);

  lookupResults.forEach((item) => {
    if (item.dbRecords.length === 0) {
      return;
    }

    results[item.symbol] = mapDbRecordsToStockData(item.symbol, item.dbRecords);
  });

  if (dbMissSymbols.length > 0) {
    let query = supabase
      .from("stock_prices")
      .select("symbol, close, trade_date")
      .in("symbol", dbMissSymbols)
      .order("symbol", { ascending: true })
      .order("trade_date", { ascending: false });

    if (signal != null) {
      query = query.abortSignal(signal);
    }

    const { data, error } = await query;
    throwIfAborted(signal);

    if (error != null) {
      if (isAbortLikeError(error)) {
        throw createAbortError();
      }
      throw error;
    }

    const decodedRows = decodeSupabaseStockRows(data);
    if (decodedRows == null) {
      dbMissSymbols.forEach((symbol) => {
        results[symbol] = createEmptyStockData(symbol);
      });
    } else {
      const fetchedMap = mapRowsBySymbol(decodedRows);
      await Promise.all(
        dbMissSymbols.map(async (symbol) => {
          throwIfAborted(signal);

          const rows = fetchedMap[symbol] ?? [];
          results[symbol] = mapRowsToStockData(symbol, rows);
        }),
      );
    }
  }

  if (mode === 'with-standard-indicators') {
    await Promise.all(
      validSymbols.map(async (symbol) => {
        throwIfAborted(signal);

        const baseData = results[symbol];
        if (baseData == null || baseData.price <= 0) {
          return;
        }

        const snapshotResult = await fetchIndicatorAwareSnapshot(
          symbol,
          STOCK_DATA_INDICATOR_REQUIREMENTS,
          options,
        );
        throwIfAborted(signal);

        if (!snapshotResult.ok || snapshotResult.data == null) {
          return;
        }

        results[symbol] = {
          ...baseData,
          ...mapIndicatorSnapshotToStockData({
            symbol,
            snapshot: snapshotResult.data,
          }),
          change: baseData.change,
          changePercent: baseData.changePercent,
        };
      }),
    );
  }

  return results;
};

export const fetchStockPrices = (
  symbols: string[],
  options: StockQueryOptions = {},
): Promise<StockPriceMap> => {
  const mode = options.mode ?? 'with-standard-indicators';
  const validSymbols = normalizeTickerSymbols(symbols);
  if (validSymbols.length === 0) {
    return Promise.resolve({});
  }

  throwIfAborted(options.signal);

  const cacheKey = buildStockPriceInflightKey(validSymbols, mode);
  const existingRequest = stockPriceInflightRequests.get(cacheKey);
  const request =
    existingRequest ??
    fetchStockPricesInternal(validSymbols, {
      ...options,
      signal: undefined,
    });

  if (existingRequest == null) {
    stockPriceInflightRequests.set(cacheKey, request);
    void request
      .finally(() => {
        stockPriceInflightRequests.delete(cacheKey);
      })
      .catch(() => undefined);
  }

  return resolveSharedRequestWithAbort(request, options.signal);
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
  const validSymbols = Array.from(
    new Set(
      symbols
        .filter((s) => s && typeof s === "string")
        .map((s) => normalizeTickerSymbol(s))
        .filter((s) => s.length > 0),
    ),
  );
  if (!validSymbols.length) {
    console.warn("No valid symbols provided to fetchStockPricesWithPrev");
    return {};
  }

  try {
    const entries = await mapWithConcurrency(
      validSymbols,
      STOCK_PRICE_PREV_FETCH_CONCURRENCY,
      async (symbol) => {
        const { data, error } = await supabase
          .from("stock_prices")
          .select("symbol, close, trade_date")
          .eq("symbol", symbol)
          .order("trade_date", { ascending: false })
          .limit(STOCK_SNAPSHOT_FETCH_LIMIT);

        if (error) {
          throw error;
        }

        const rows = decodeSupabaseStockRows(data);
        if (rows == null || rows.length === 0) {
          return null;
        }

        const currentPrice = rows[0]?.close ?? 0;
        const previousPrice = rows[1]?.close ?? currentPrice;
        return {
          symbol,
          price: {
            current: currentPrice,
            previous: previousPrice,
          },
        };
      },
    );

    const map: Record<string, { current: number; previous: number }> = {};
    for (const entry of entries) {
      if (entry == null) {
        continue;
      }
      map[entry.symbol] = entry.price;
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

function buildIndicatorSnapshotFailure(args: {
  error: unknown;
  trimmedSymbol: string;
  cacheKey: string;
}): IndicatorSnapshotResult {
  const isEmptyHistoryError =
    args.error instanceof Error &&
    args.error.message === EMPTY_PRICE_HISTORY_ERROR;
  const isAbortError = isAbortLikeError(args.error);

  return failResult(
    null,
    createServiceError(
      isEmptyHistoryError
        ? "NOT_FOUND"
        : isAbortError
          ? "TIMEOUT"
          : "NETWORK",
      isEmptyHistoryError
        ? "indicator_snapshot_price_history_not_found"
        : normalizeErrorMessage(
            args.error,
            "indicator_snapshot_fetch_failed",
          ),
      {
        retryable: !isEmptyHistoryError,
        cause: args.error,
        context: {
          symbol: args.trimmedSymbol,
          cacheKey: args.cacheKey,
        },
      },
    ),
    {
      symbol: args.trimmedSymbol,
      cacheKey: args.cacheKey,
    },
  );
}

function resolveIndicatorSnapshotWithAbort(args: {
  request: Promise<IndicatorSnapshotResult>;
  signal?: AbortSignal;
  trimmedSymbol: string;
  cacheKey: string;
}): Promise<IndicatorSnapshotResult> {
  if (args.signal == null) {
    return args.request;
  }

  if (args.signal.aborted) {
    return Promise.resolve(
      buildIndicatorSnapshotFailure({
        error: createAbortError(),
        trimmedSymbol: args.trimmedSymbol,
        cacheKey: args.cacheKey,
      }),
    );
  }

  const signal = args.signal;
  return new Promise((resolve) => {
    const handleAbort = () => {
      resolve(
        buildIndicatorSnapshotFailure({
          error: createAbortError(),
          trimmedSymbol: args.trimmedSymbol,
          cacheKey: args.cacheKey,
        }),
      );
    };
    const handleResult = (result: IndicatorSnapshotResult) => {
      signal.removeEventListener('abort', handleAbort);
      resolve(result);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    args.request.then(handleResult, (error: unknown) => {
      signal.removeEventListener('abort', handleAbort);
      resolve(
        buildIndicatorSnapshotFailure({
          error,
          trimmedSymbol: args.trimmedSymbol,
          cacheKey: args.cacheKey,
        }),
      );
    });
  });
}

async function fetchIndicatorAwareSnapshotInternal(args: {
  trimmedSymbol: string;
  normalizedRequirements: IndicatorRequirements;
  cacheKey: string;
}): Promise<IndicatorSnapshotResult> {
  try {
    const isDatabaseReady = await isIndicatorSnapshotDatabaseReady();
    const metadata = isDatabaseReady
      ? await getStockMetadata(args.trimmedSymbol)
      : null;
    const sourceLastUpdated = metadata?.lastUpdated ?? "";

    if (sourceLastUpdated.length > 0) {
      const memorySnapshot = readIndicatorSnapshotFromMemoryCache(
        args.cacheKey,
        sourceLastUpdated,
      );
      if (memorySnapshot != null) {
        return okResult(memorySnapshot, {
          symbol: args.trimmedSymbol,
          cacheKey: args.cacheKey,
          source: "memory",
        });
      }

      const dbSnapshot = await getIndicatorSnapshotCache(
        args.cacheKey,
        sourceLastUpdated,
      );
      if (dbSnapshot != null) {
        const snapshot = cloneIndicatorSnapshot({
          currentPrice: dbSnapshot.currentPrice,
          ...(dbSnapshot.rsi !== undefined ? { rsi: dbSnapshot.rsi } : {}),
          ...(dbSnapshot.maByPeriod != null
            ? { maByPeriod: dbSnapshot.maByPeriod }
            : {}),
        });

        writeIndicatorSnapshotToMemoryCache({
          cacheKey: args.cacheKey,
          snapshot,
          sourceLastUpdated,
        });

        return okResult(snapshot, {
          symbol: args.trimmedSymbol,
          cacheKey: args.cacheKey,
          source: "indexeddb",
        });
      }
    }

    const { records, latestTradeDate, source } =
      await getOrFetchPriceHistoryForRequirements(
        args.trimmedSymbol,
        args.normalizedRequirements,
        {},
        isDatabaseReady,
      );
    const currentPrice = readCurrentPriceFromRecords(records);
    const technicalIndicators =
      (await calculateTechnicalIndicators(
        args.trimmedSymbol,
        args.normalizedRequirements,
        {},
        records,
      )) ?? {};

    const snapshot = cloneIndicatorSnapshot({
      currentPrice,
      ...(technicalIndicators.rsi !== undefined
        ? { rsi: technicalIndicators.rsi }
        : {}),
      ...(technicalIndicators.maByPeriod != null
        ? { maByPeriod: technicalIndicators.maByPeriod }
        : {}),
    });

    writeIndicatorSnapshotToMemoryCache({
      cacheKey: args.cacheKey,
      snapshot,
      sourceLastUpdated: latestTradeDate,
    });
    await persistIndicatorSnapshotCache({
      isDatabaseReady,
      cacheKey: args.cacheKey,
      symbol: args.trimmedSymbol,
      requirements: args.normalizedRequirements,
      snapshot,
      sourceLastUpdated: latestTradeDate,
    });

    return okResult(snapshot, {
      symbol: args.trimmedSymbol,
      cacheKey: args.cacheKey,
      source,
    });
  } catch (error: unknown) {
    return buildIndicatorSnapshotFailure({
      error,
      trimmedSymbol: args.trimmedSymbol,
      cacheKey: args.cacheKey,
    });
  }
}

export function fetchIndicatorAwareSnapshot(
  symbol: string,
  requirements: IndicatorRequirements,
  options: StockQueryOptions = {},
): Promise<IndicatorSnapshotResult> {
  const trimmedSymbol = normalizeTickerSymbol(symbol);
  if (trimmedSymbol.length === 0) {
    return Promise.resolve(
      failResult(
        null,
        createServiceError("INVALID_INPUT", "stock_symbol_required", {
          context: { symbol: trimmedSymbol },
        }),
        { symbol: trimmedSymbol },
      ),
    );
  }

  const normalizedRequirements = normalizeIndicatorRequirements(requirements);
  const cacheKey = buildIndicatorRequirementCacheKey({
    symbol: trimmedSymbol,
    requirements: normalizedRequirements,
  });

  if (options.signal?.aborted) {
    return Promise.resolve(
      buildIndicatorSnapshotFailure({
        error: createAbortError(),
        trimmedSymbol,
        cacheKey,
      }),
    );
  }

  const existingRequest = indicatorSnapshotInflightRequests.get(cacheKey);
  const request =
    existingRequest ??
    fetchIndicatorAwareSnapshotInternal({
      trimmedSymbol,
      normalizedRequirements,
      cacheKey,
    });

  if (existingRequest == null) {
    indicatorSnapshotInflightRequests.set(cacheKey, request);
    void request.finally(() => {
      indicatorSnapshotInflightRequests.delete(cacheKey);
    });
  }

  return resolveIndicatorSnapshotWithAbort({
    request,
    signal: options.signal,
    trimmedSymbol,
    cacheKey,
  });
}

export async function fetchLatestStockSnapshot(
  symbol: string,
): Promise<ServiceResult<StockData>> {
  const trimmedSymbol = normalizeTickerSymbol(symbol);
  if (trimmedSymbol.length === 0) {
    return failResult(
      createEmptyStockData(trimmedSymbol),
      createServiceError('INVALID_INPUT', 'stock_symbol_required', {
        context: { symbol: trimmedSymbol },
      }),
      { symbol: trimmedSymbol },
    );
  }

  try {
    const snapshotResult = await fetchIndicatorAwareSnapshot(
      trimmedSymbol,
      PRICE_ONLY_INDICATOR_REQUIREMENTS,
    );
    if (!snapshotResult.ok) {
      return failResult(
        createEmptyStockData(trimmedSymbol),
        snapshotResult.error,
        snapshotResult.context,
      );
    }

    if (snapshotResult.data == null) {
      return failResult(
        createEmptyStockData(trimmedSymbol),
        createServiceError("NOT_FOUND", "stock_snapshot_not_found", {
          context: { symbol: trimmedSymbol },
        }),
        { symbol: trimmedSymbol },
      );
    }

    const latestRecords = await getStockPrices(
      trimmedSymbol,
      STOCK_SNAPSHOT_FETCH_LIMIT,
    );
    const baseData =
      latestRecords.length > 0
        ? mapDbRecordsToStockData(trimmedSymbol, latestRecords)
        : createEmptyStockData(trimmedSymbol);

    return okResult(
      {
        ...baseData,
        ...mapIndicatorSnapshotToStockData({
          symbol: trimmedSymbol,
          snapshot: snapshotResult.data,
        }),
        change: baseData.change,
        changePercent: baseData.changePercent,
      },
      {
        symbol: trimmedSymbol,
        source: "requirement-aware",
      },
    );
  } catch (error: unknown) {
    return failResult(
      createEmptyStockData(trimmedSymbol),
      createStockQueryServiceError(
        error,
        'stock_snapshot_fetch_failed',
        trimmedSymbol,
      ),
      { symbol: trimmedSymbol },
    );
  }
}

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

export async function getRecentTradingDaysFromDbSafe(
  symbol: string,
  days: number,
): Promise<ServiceResult<string[]>> {
  const trimmedSymbol = symbol.trim();
  if (trimmedSymbol.length === 0 || days <= 0) {
    return failResult(
      [],
      createServiceError('INVALID_INPUT', 'recent_trading_days_invalid_input', {
        context: { symbol: trimmedSymbol, days },
      }),
      { symbol: trimmedSymbol, days },
    );
  }

  try {
    const recentTradingDays = await getRecentTradingDaysFromDb(trimmedSymbol, days);
    if (recentTradingDays.length === 0) {
      const isDatabaseReady = await isIndicatorSnapshotDatabaseReady();
      const fetchedRecords = await fetchPriceHistoryFromSupabase({
        symbol: trimmedSymbol,
        limit: Math.max(days, STOCK_SNAPSHOT_FETCH_LIMIT),
      });
      const fetchedRecentTradingDays = extractRecentTradingDaysFromRecords(
        fetchedRecords,
        days,
      );

      if (fetchedRecentTradingDays.length === 0) {
        return failResult(
          [],
          createServiceError('NOT_FOUND', 'recent_trading_days_not_found', {
            context: { symbol: trimmedSymbol, days },
          }),
          { symbol: trimmedSymbol, days },
        );
      }

      const latestTradeDate = fetchedRecentTradingDays[0] ?? '';
      if (latestTradeDate.length > 0) {
        await persistFetchedPriceHistory({
          isDatabaseReady,
          symbol: trimmedSymbol,
          records: fetchedRecords,
          latestTradeDate,
        });
      }

      return okResult(fetchedRecentTradingDays, {
        symbol: trimmedSymbol,
        days,
        source: 'supabase',
      });
    }

    return okResult(recentTradingDays, {
      symbol: trimmedSymbol,
      days,
      source: 'indexeddb',
    });
  } catch (error: unknown) {
    return failResult(
      [],
      createStockQueryServiceError(
        error,
        'recent_trading_days_fetch_failed',
        trimmedSymbol,
      ),
      { symbol: trimmedSymbol, days },
    );
  }
}

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
 * 3. IndexedDB에 기록된 최종 종가일(lastUpdated)이 KST 기준 달력 "오늘"보다 이전인 경우
 *    (시간 규칙만으로는 며칠~몇 주 동안 캐시만 쓰는 경우를 막음 — 새로고침 시 서버와 재동기화)
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
  const todayKst = getTodayDateString();
  const cutoffUtc = getTodayUtcCutoff(nowUtc);
  const isAfterCutoff = nowUtc >= cutoffUtc;

  const lastCheckedAt = metadata.lastCheckedAt ?? 0;
  const msSinceLastCheck = lastCheckedAt > 0
    ? nowTs - lastCheckedAt
    : MS_24H + 1;

  const cond1 = isAfterCutoff && metadata.lastCheckedDate !== todayUtc;
  const cond2 = msSinceLastCheck >= MS_24H;
  const lastBar = metadata.lastUpdated?.trim() ?? '';
  const cond3 =
    lastBar.length >= 10 && lastBar.localeCompare(todayKst) < 0;

  return cond1 || cond2 || cond3;
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

    const nowUtc = new Date();
    const todayUtc = getTodayUtcDateString(nowUtc);

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const metadata = await getStockMetadata(symbol);
          const shouldCheck = shouldCheckServerForSymbol(metadata, nowUtc);

          // 1) 캐시 사용 가능
          if (metadata && metadata.dataCount >= 200 && !shouldCheck) {
            // 배지용 LATEST_TRADE_DATE가 예전에만 갱신되고 IDB 메타는 맞는 경우 동기화
            if (
              typeof window !== 'undefined' &&
              symbol === REFERENCE_SYMBOL &&
              metadata.lastUpdated != null &&
              metadata.lastUpdated.trim() !== ''
            ) {
              window.localStorage.setItem(
                LATEST_TRADE_DATE_KEY,
                metadata.lastUpdated.trim(),
              );
            }
            return;
          }

          // 2) 부분 업데이트
          if (metadata && metadata.dataCount >= 200 && shouldCheck) {
            await updateLatestStockData(symbol);
            return;
          }

          // 3) 전체 240일 로딩
          const { data, error } = await supabase
            .from("stock_prices")
            .select("close, trade_date")
            .eq("symbol", symbol)
            .order("trade_date", { ascending: false })
            .limit(STOCK_FULL_LOAD_LIMIT);

          const decodedRows = decodeSupabaseStockRows(data);
          if (error || decodedRows == null) {
            console.warn(`[${logTag}] ${symbol}: 데이터 없음`, error);
            return;
          }

          const records = toStockPriceRecords(symbol, decodedRows)
            .filter((record) => record.date.length > 0 && record.close > 0)
            .sort((a, b) => a.date.localeCompare(b.date));

          if (records.length === 0) return;

          await calculateAndSaveIndicators(symbol, records);

          const latestDate = records[records.length - 1].date;
          await updateStockMetadata(symbol, latestDate, records.length);
          await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());

          // 대표 종목의 마지막 거래일을 글로벌 기준일로 저장
          if (typeof window !== "undefined" && symbol === REFERENCE_SYMBOL) {
            window.localStorage.setItem(LATEST_TRADE_DATE_KEY, latestDate);
          }
        } catch (err) {
          console.error(`[${logTag}] ${symbol} 처리 실패:`, err);
        }
      }),
    );
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

let freeStockWarmupPromise: Promise<void> | null = null;
let paidStockWarmupPromise: Promise<void> | null = null;

function ensureWarmup(
  currentPromise: Promise<void> | null,
  setPromise: (nextPromise: Promise<void> | null) => void,
  loader: () => Promise<void>,
): Promise<void> {
  if (currentPromise != null) {
    return currentPromise;
  }

  const nextPromise = loader().finally(() => {
    setPromise(null);
  });

  setPromise(nextPromise);
  return nextPromise;
}

export function ensureInitialStockDataReady(): Promise<void> {
  return ensureWarmup(
    freeStockWarmupPromise,
    (nextPromise) => {
      freeStockWarmupPromise = nextPromise;
    },
    loadInitialStockData,
  );
}

export function ensurePaidStockDataReady(): Promise<void> {
  return ensureWarmup(
    paidStockWarmupPromise,
    (nextPromise) => {
      paidStockWarmupPromise = nextPromise;
    },
    loadPaidStockData,
  );
}

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
  clearIndicatorSnapshotMemoryCacheBySymbol(symbol);
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

    const decodedRows = decodeSupabaseStockRows(data);
    if (error || decodedRows == null) {
      console.warn(`[updateLatestStockData] ${symbol}: 최신 데이터 없음`);
      return;
    }

    const latestRow = decodedRows[0];
    const latestDate = latestRow.trade_date ?? '';
    if (latestDate.length === 0 || (latestRow.close ?? 0) <= 0) {
      console.warn(`[updateLatestStockData] ${symbol}: 최신 데이터 형식 오류`);
      return;
    }

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
  requirements: IndicatorRequirements = STOCK_DATA_INDICATOR_REQUIREMENTS,
  options: StockQueryOptions = {},
  preloadedRecords?: StockPriceRecord[],
): Promise<TechnicalIndicatorResult | null> => {
  const { signal } = options;
  const trimmedSymbol = normalizeTickerSymbol(symbol ?? "");
  if (!trimmedSymbol) {
    console.warn("Invalid symbol provided to calculateTechnicalIndicators");
    return null;
  }

  throwIfAborted(signal);

  try {
    const normalizedRequirements = normalizeIndicatorRequirements(requirements);
    if (
      !normalizedRequirements.needsRsi &&
      normalizedRequirements.maPeriods.length === 0
    ) {
      return {};
    }

    const records =
      preloadedRecords ??
      (
        await getOrFetchPriceHistoryForRequirements(
          trimmedSymbol,
          normalizedRequirements,
          options,
        )
      ).records;

    return readTechnicalIndicatorsFromRecords(
      records,
      normalizedRequirements,
    );
  } catch (err) {
    if (isAbortLikeError(err)) {
      throw createAbortError();
    }
    console.error("Error calculating technical indicators:", err);
    return null;
  }
};

/**
 * 특정 심볼의 최근 N일간 가격 데이터를 가져옵니다 (차트용)
 * IndexedDB 우선 사용, 계산된 MA20, MA60 값 반환
 */
const fetchStockPriceHistoryInternal = async (
  symbol: string,
  days: number = 90,
  options: StockQueryOptions = {},
): Promise<StockPriceHistoryPoint[]> => {
  const { signal } = options;
  const trimmedSymbol = normalizeTickerSymbol(symbol ?? "");
  if (!trimmedSymbol) {
    console.warn("Invalid symbol provided to fetchStockPriceHistory");
    return [];
  }

  throwIfAborted(signal);

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

    let query = supabase
      .from("stock_prices")
      .select("close, trade_date")
      .eq("symbol", trimmedSymbol)
      .order("trade_date", { ascending: false })
      .limit(days);

    if (signal != null) {
      query = query.abortSignal(signal);
    }

    const { data, error } = await query;
    throwIfAborted(signal);

    const decodedRows = decodeSupabaseStockRows(data);
    if (error || decodedRows == null) {
      if (isAbortLikeError(error)) {
        throw createAbortError();
      }
      console.error("Error fetching price history for chart:", symbol, error);
      return [];
    }

    const records = toStockPriceRecords(trimmedSymbol, decodedRows)
      .filter((r) => r.date && r.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (records.length === 0) return [];

    // calculateAndSaveIndicators가 롤링 윈도우로 모든 지표를 계산 + 저장
    throwIfAborted(signal);
    await calculateAndSaveIndicators(trimmedSymbol, records);
    const latestDate = records[records.length - 1]?.date || "";
    await updateStockMetadata(trimmedSymbol, latestDate, records.length);
    throwIfAborted(signal);

    // 저장된 데이터를 다시 읽어서 계산된 지표 포함 반환
    const savedRecords = await getStockPrices(trimmedSymbol, days);
    throwIfAborted(signal);
    return savedRecords.map((record) => ({
      date: record.date,
      price: record.close,
      ma20: record.ma20 || record.close,
      ma60: record.ma60 || record.close,
    }));
  } catch (err) {
    if (isAbortLikeError(err)) {
      throw createAbortError();
    }
    console.error("Unexpected error fetching price history:", err);
    return [];
  }
};

export const fetchStockPriceHistory = (
  symbol: string,
  days: number = 90,
  options: StockQueryOptions = {},
): Promise<StockPriceHistoryPoint[]> => {
  const trimmedSymbol = normalizeTickerSymbol(symbol ?? "");
  if (!trimmedSymbol) {
    console.warn("Invalid symbol provided to fetchStockPriceHistory");
    return Promise.resolve([]);
  }

  throwIfAborted(options.signal);

  const cacheKey = buildStockHistoryInflightKey(trimmedSymbol, days);
  const existingRequest = stockHistoryInflightRequests.get(cacheKey);
  const request =
    existingRequest ??
    fetchStockPriceHistoryInternal(trimmedSymbol, days, {
      ...options,
      signal: undefined,
    });

  if (existingRequest == null) {
    stockHistoryInflightRequests.set(cacheKey, request);
    void request
      .finally(() => {
        stockHistoryInflightRequests.delete(cacheKey);
      })
      .catch(() => undefined);
  }

  return resolveSharedRequestWithAbort(request, options.signal);
};
