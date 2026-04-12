# 미국 주식 종가 동기화 리팩토링 계획서

## 현재 코드 분석 (가상 점검)
현재 구현에서 가장 위험한 지점은 `services/stockService.ts`가 **서버 체크 기준 시간(UTC 22:15)**, **로컬 거래일 비교(KST today vs `lastUpdated`)**, **UI 배지 기준(`utils/marketUtils.ts`의 KST 07:20)** 을 서로 다른 축으로 섞어 쓰고 있다는 점입니다. 이 구조는 같은 거래일에 대해 "이미 오늘 체크했는가"와 "로컬 마지막 종가가 오늘보다 과거인가"를 동시에 참으로 만들기 쉬워서, 미국장 휴장일이나 한국 시간 기준 새벽 구간에서 **불필요한 Supabase 재조회가 반복**될 수 있습니다. 여기에 `fetchStockPricesWithPrev`, `calculateTechnicalIndicators`, `fetchStockPriceHistory`, `fetchStockPrices` 같은 보조 경로가 중앙 동기화 파이프라인을 우회해 **직접 Supabase를 찌르는 누수 경로**까지 남아 있어, Egress 비용과 캐시 일관성 모두에 취약합니다.

## 리팩토링 계획서

### 1. Negative Caching: KST 07:15 Sliding Boundary
1. `utils/marketUtils.ts`에 **공통 키/시간 상수**를 모읍니다.
   - `LAST_SERVER_CHECK_TIME_KEY`
   - `KST_SERVER_CHECK_HOUR`
   - `KST_SERVER_CHECK_MINUTE`
   - `getKstServerCheckBoundaryTime()`
2. `services/stockService.ts`의 `shouldCheckServerForSymbol`를 **시간 판정 전용 함수**로 단순화합니다.
   - 현재처럼 `cond1`, `cond2`, `cond3`를 혼합하지 않습니다.
   - `localStorage[LAST_SERVER_CHECK_TIME_KEY]`를 읽고, 현재 시점에서 계산한 "유효한 최근 서버 체크 경계값"보다 최근이면 **무조건 `false`** 를 반환합니다.
3. `loadStockDataForSymbols` 시작 시 **한 번만** `shouldCheckServerForSymbol(nowUtc)`를 평가합니다.
   - 이 값이 `false`이면 종목별 Supabase 요청을 모두 건너뜁니다.
   - 이 값이 `true`이면 해당 세션의 서버 동기화가 허용됩니다.
4. 종목별 동기화가 정상 종료되면 `LAST_SERVER_CHECK_TIME_KEY`를 **현재 timestamp** 로 갱신합니다.
   - 반환 행이 0개여도, "휴장일이라 서버에 새 데이터가 없음을 확인"한 것이므로 성공으로 간주합니다.
   - 네트워크 에러로 실패한 경우에는 이 키를 갱신하지 않습니다.

### 2. Partial Fetch: `trade_date > localLastUpdated`
1. `loadStockDataForSymbols`의 종목별 분기를 아래처럼 재정의합니다.
   - `metadata == null` 또는 `metadata.dataCount < MIN_LOCAL_HISTORY_TO_SKIP_FULL_SYNC` 또는 `lastUpdated` 비어 있음
     -> **전체 240일 초기 적재**
   - 그 외
     -> **부분 업데이트** (`trade_date > metadata.lastUpdated`)
2. 부분 업데이트 전용 함수(`syncMissingStockDataFromServer`)를 신설합니다.
   - `Supabase.from("stock_prices").gt("trade_date", localLastUpdated).order("trade_date", { ascending: true }).limit(STOCK_PARTIAL_FETCH_LIMIT)`
   - 결과를 `toStockPriceRecords`로 변환한 뒤 **기존 IDB 배열과 merge/upsert** 합니다.
3. 병합 뒤에는 항상 `calculateAndSaveIndicators`를 다시 돌려서 MA/RSI를 재계산합니다.
   - 부분 업데이트라도 지표는 최신 구간까지 이어져야 합니다.
4. 결과 행이 0개면 `updateLastCheckedMetadata`만 갱신합니다.
   - 이 분기가 있어야 공휴일/주말에 같은 질의를 반복하지 않습니다.

### 3. Strict IDB Fallback: 보조 경로의 직접 Supabase 호출 차단
1. `fetchStockPrices`, `fetchStockPricesWithPrev`, `calculateTechnicalIndicators`, `fetchStockPriceHistory`를 **Strict IDB Only** 정책으로 통일합니다.
2. 이 함수들은 **절대 Supabase를 직접 호출하지 않도록** 바꿉니다.
   - 데이터가 비어 있으면 `createEmptyStockData`, `{}`, `null`, `[]` 같은 안전한 fallback만 반환합니다.
3. 실제 서버 접속은 `loadStockDataForSymbols`와 그 하위 함수(`loadFullStockDataFromServer`, `syncMissingStockDataFromServer`)로만 제한합니다.
4. 이 변경 후 `inflightStockRequests` 같은 "조회 시 네트워크 중복 방지" 캐시는 제거해도 됩니다.
   - 중앙 파이프라인만 네트워크를 타므로 의미가 줄어듭니다.

### 4. 적용 순서
1. `utils/marketUtils.ts`에 키/시간 상수와 KST 경계 헬퍼를 추가합니다.
2. `services/db.ts`에 IDB만 쓰는 조회 헬퍼를 추가합니다.
3. `services/stockService.ts`에서
   - 음수 캐싱 헬퍼 추가
   - 전체 로드 함수 / 부분 로드 함수 분리
   - `loadStockDataForSymbols` 교체
   - 보조 함수들의 Supabase fallback 제거
4. 시나리오 검증:
   - 평일 KST 07:00 이전 재접속: 서버 재조회 없음
   - 평일 KST 07:16 첫 접속: 종목별 1회만 서버 확인
   - 같은 날 새로고침 반복: `LAST_SERVER_CHECK_TIME` 때문에 서버 재조회 없음
   - 미국 휴장일: 0행 응답 후 그 날은 더 이상 조회 없음
   - 로컬에 240행 미만: 전체 240일 초기 적재
   - 로컬에 200행 이상 + `lastUpdated` 존재: `gt(lastUpdated)` 부분 적재

## 코드 스니펫

### 파일: `utils/marketUtils.ts`
아래 상수/헬퍼를 파일 상단에 추가하고, `getMarketStatus`는 공통 상수를 사용하도록 교체합니다.

```ts
export const LATEST_TRADE_DATE_KEY = 'LATEST_TRADE_DATE';
export const LAST_SERVER_CHECK_TIME_KEY = 'LAST_SERVER_CHECK_TIME';

const KST_OFFSET_HOURS = 9;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
const KST_OFFSET_MS = KST_OFFSET_HOURS * MS_PER_HOUR;

export const KST_SERVER_CHECK_HOUR = 7;
export const KST_SERVER_CHECK_MINUTE = 15;
export const KST_BADGE_READY_HOUR = 7;
export const KST_BADGE_READY_MINUTE = 20;

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function getKstNow(nowUtc: Date = new Date()): Date {
  return new Date(nowUtc.getTime() + KST_OFFSET_MS);
}

export function getKstDateKey(nowUtc: Date = new Date()): string {
  const nowKst = getKstNow(nowUtc);
  const year = nowKst.getUTCFullYear();
  const month = padDatePart(nowKst.getUTCMonth() + 1);
  const day = padDatePart(nowKst.getUTCDate());
  return `${year}-${month}-${day}`;
}

export function getKstServerCheckBoundaryTime(nowUtc: Date = new Date()): number {
  const nowKst = getKstNow(nowUtc);
  const boundaryKst = new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      KST_SERVER_CHECK_HOUR,
      KST_SERVER_CHECK_MINUTE,
      0,
      0,
    ),
  );

  if (nowKst.getTime() < boundaryKst.getTime()) {
    boundaryKst.setUTCDate(boundaryKst.getUTCDate() - 1);
  }

  // boundaryKst는 "KST 시각을 UTC getter/setter로 표현한 shifted date"이므로
  // 실제 UTC epoch 비교에 쓰려면 KST offset을 다시 빼서 원래 timeline으로 되돌린다.
  return boundaryKst.getTime() - KST_OFFSET_MS;
}
```

```ts
export const getMarketStatus = (
  lang: 'ko' | 'en' = 'ko',
): { isOpen: boolean; message: string } => {
  const nowUtc = new Date();
  const nowKst = getKstNow(nowUtc);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth() + 1;
  const day = nowKst.getUTCDate();
  const hours = nowKst.getUTCHours();
  const minutes = nowKst.getUTCMinutes();

  const todayStr = `${year}-${padDatePart(month)}-${padDatePart(day)}`;
  const kstDayOfWeek = nowKst.getUTCDay();
  const minutesOfDay = hours * MINUTES_PER_HOUR + minutes;
  const badgeReadyMinutes =
    KST_BADGE_READY_HOUR * MINUTES_PER_HOUR + KST_BADGE_READY_MINUTE;
  const isAfterBadgeReady = minutesOfDay >= badgeReadyMinutes;

  const usHolidays = getUSSelectionHolidays(year);
  const isHolidayToday = usHolidays.includes(todayStr);
  const isWeekend = kstDayOfWeek === 0 || kstDayOfWeek === 6;

  if (isWeekend) {
    return {
      isOpen: false,
      message:
        lang === 'ko'
          ? '현재 미국 시장 휴장일 (주말)'
          : 'US Market Closed (Weekend)',
    };
  }

  if (isHolidayToday) {
    return {
      isOpen: false,
      message:
        lang === 'ko'
          ? '현재 미국 시장 휴장일 (공휴일)'
          : 'US Market Closed (Holiday)',
    };
  }

  if (kstDayOfWeek >= 2 && kstDayOfWeek <= 6 && isAfterBadgeReady) {
    let latestLabel = '';

    if (typeof window !== 'undefined') {
      const latest = window.localStorage.getItem(LATEST_TRADE_DATE_KEY);
      if (latest != null && latest.trim() !== '') {
        const parsed = new Date(`${latest}T00:00:00Z`);
        if (!Number.isNaN(parsed.getTime())) {
          if (lang === 'ko') {
            latestLabel = `${parsed.getUTCMonth() + 1}월 ${parsed.getUTCDate()}일 종가`;
          } else {
            latestLabel =
              parsed.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }) + ' close';
          }
        }
      }
    }

    if (lang === 'ko') {
      return {
        isOpen: true,
        message:
          latestLabel !== ''
            ? `데이터 기준: ${latestLabel}`
            : '데이터 기준: 미국장 전일 종가',
      };
    }

    return {
      isOpen: true,
      message:
        latestLabel !== ''
          ? `Data as of: ${latestLabel}`
          : 'Data as of: previous US close',
    };
  }

  return {
    isOpen: false,
    message:
      lang === 'ko'
        ? '데이터 업데이트 대기 중'
        : 'Waiting for Data Update',
  };
};
```

### 파일: `services/db.ts`
스키마 변경은 필수가 아니므로 `StockMetadata` 구조는 그대로 두고, Strict IDB 조회를 위한 헬퍼만 추가합니다.

```ts
export const getLatestStoredPricePair = async (
  symbol: string,
): Promise<{
  latest: StockPriceRecord | null;
  previous: StockPriceRecord | null;
}> => {
  const records = await getStockPrices(symbol, 2);

  if (records.length === 0) {
    return {
      latest: null,
      previous: null,
    };
  }

  const latest = records[records.length - 1];
  const previous = records.length > 1 ? records[records.length - 2] : latest;

  return {
    latest,
    previous,
  };
};
```

### 파일: `services/stockService.ts`
아래 스니펫은 **정확히 이 순서대로** 적용하는 것을 전제로 작성했습니다.

#### 1) import 교체
기존 import에 아래 symbol을 추가합니다.

```ts
import {
  KST_SERVER_CHECK_HOUR,
  KST_SERVER_CHECK_MINUTE,
  LAST_SERVER_CHECK_TIME_KEY,
  LATEST_TRADE_DATE_KEY,
  getKstDateKey,
  getKstServerCheckBoundaryTime,
} from '../utils/marketUtils';
import { getLatestStoredPricePair } from './db';
```

#### 2) 상수 블록 추가/교체

```ts
const DEBUG_STOCK_LOG = false;
const DEFAULT_RSI = 50;
const DEFAULT_MA = 0;
const STOCK_SNAPSHOT_FETCH_LIMIT = 2;
const STOCK_FULL_LOAD_LIMIT = 240;
const STOCK_PARTIAL_FETCH_LIMIT = 3;
const MIN_INDICATOR_HISTORY = 120;
const INDICATOR_DB_READ_LIMIT = 200;
const MIN_LOCAL_HISTORY_TO_SKIP_FULL_SYNC = 200;
const EMPTY_TIMESTAMP = 0;

/** 글로벌 기준 거래일을 결정하는 대표 종목 */
const REFERENCE_SYMBOL = 'QQQ';
```

#### 3) 로컬 캐시 헬퍼 추가

```ts
function readLocalStorageTimestamp(key: string): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue == null || rawValue.trim() === '') {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= EMPTY_TIMESTAMP) {
    return null;
  }

  return parsed;
}

function writeLocalStorageTimestamp(key: string, timestamp: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedTimestamp = Math.trunc(timestamp);
  if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= EMPTY_TIMESTAMP) {
    return;
  }

  window.localStorage.setItem(key, String(normalizedTimestamp));
}

function writeLatestTradeDateCache(dateKey: string | null): void {
  if (typeof window === 'undefined' || dateKey == null || dateKey.trim() === '') {
    return;
  }

  window.localStorage.setItem(LATEST_TRADE_DATE_KEY, dateKey.trim());
}
```

#### 4) `shouldCheckServerForSymbol` 전체 교체

```ts
const shouldCheckServerForSymbol = (nowUtc: Date): boolean => {
  const lastServerCheckTime = readLocalStorageTimestamp(LAST_SERVER_CHECK_TIME_KEY);
  if (lastServerCheckTime == null) {
    return true;
  }

  const boundaryTime = getKstServerCheckBoundaryTime(nowUtc);
  return lastServerCheckTime < boundaryTime;
};
```

#### 5) 부분 업데이트 / 전체 로드 헬퍼 추가

```ts
function mergeStockPriceRecords(
  existingRecords: StockPriceRecord[],
  incomingRecords: StockPriceRecord[],
): StockPriceRecord[] {
  const mergedMap = new Map<string, StockPriceRecord>();

  existingRecords.forEach((record) => {
    mergedMap.set(`${record.symbol}:${record.date}`, record);
  });

  incomingRecords.forEach((record) => {
    mergedMap.set(`${record.symbol}:${record.date}`, record);
  });

  return Array.from(mergedMap.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

async function loadFullStockDataFromServer(
  symbol: string,
  nowUtc: Date,
): Promise<void> {
  const todayUtc = getTodayUtcDateString(nowUtc);

  const { data, error } = await supabase
    .from('stock_prices')
    .select('close, trade_date')
    .eq('symbol', symbol)
    .order('trade_date', { ascending: false })
    .limit(STOCK_FULL_LOAD_LIMIT);

  if (error) {
    throw error;
  }

  const decodedRows = decodeSupabaseStockRows(data) ?? [];
  const records = toStockPriceRecords(symbol, decodedRows)
    .filter((record) => record.date.length > 0 && record.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (records.length === 0) {
    await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());
    return;
  }

  await calculateAndSaveIndicators(symbol, records);

  const latestDate = records[records.length - 1]?.date ?? '';
  if (latestDate !== '') {
    await updateStockMetadata(symbol, latestDate, records.length);
    await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());
    if (symbol === REFERENCE_SYMBOL) {
      writeLatestTradeDateCache(latestDate);
    }
  }
}

async function syncMissingStockDataFromServer(
  symbol: string,
  localLastUpdated: string,
  nowUtc: Date,
): Promise<void> {
  const todayUtc = getTodayUtcDateString(nowUtc);

  const { data, error } = await supabase
    .from('stock_prices')
    .select('close, trade_date')
    .eq('symbol', symbol)
    .gt('trade_date', localLastUpdated)
    .order('trade_date', { ascending: true })
    .limit(STOCK_PARTIAL_FETCH_LIMIT);

  if (error) {
    throw error;
  }

  const decodedRows = decodeSupabaseStockRows(data) ?? [];
  const incomingRecords = toStockPriceRecords(symbol, decodedRows).filter(
    (record) => record.date.length > 0 && record.close > 0,
  );

  if (incomingRecords.length === 0) {
    await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());
    if (symbol === REFERENCE_SYMBOL) {
      writeLatestTradeDateCache(localLastUpdated);
    }
    return;
  }

  const existingRecords = await getStockPrices(symbol);
  const mergedRecords = mergeStockPriceRecords(existingRecords, incomingRecords);
  if (mergedRecords.length === 0) {
    await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());
    return;
  }

  await calculateAndSaveIndicators(symbol, mergedRecords);

  const latestDate = mergedRecords[mergedRecords.length - 1]?.date ?? localLastUpdated;
  await updateStockMetadata(symbol, latestDate, mergedRecords.length);
  await updateLastCheckedMetadata(symbol, todayUtc, nowUtc.getTime());

  if (symbol === REFERENCE_SYMBOL) {
    writeLatestTradeDateCache(latestDate);
  }
}
```

#### 6) `loadStockDataForSymbols` 전체 교체

```ts
const loadStockDataForSymbols = async (
  symbols: readonly string[],
  logTag: string,
): Promise<void> => {
  try {
    await initDatabase();

    const nowUtc = new Date();
    const todayKst = getKstDateKey(nowUtc);
    const shouldCheckServer = shouldCheckServerForSymbol(nowUtc);

    if (DEBUG_STOCK_LOG) {
      console.log(
        `[${logTag}] 데이터 로딩 시작: ${todayKst} (KST ${KST_SERVER_CHECK_HOUR}:${String(
          KST_SERVER_CHECK_MINUTE,
        ).padStart(2, '0')} boundary)`,
      );
    }

    if (!shouldCheckServer) {
      const referenceMetadata = await getStockMetadata(REFERENCE_SYMBOL);
      const latestReferenceDate = referenceMetadata?.lastUpdated?.trim() ?? '';
      if (latestReferenceDate !== '') {
        writeLatestTradeDateCache(latestReferenceDate);
      }
      return;
    }

    await Promise.all(
      symbols.map(async (symbol) => {
        const metadata = await getStockMetadata(symbol);
        const lastUpdated = metadata?.lastUpdated?.trim() ?? '';
        const hasEnoughLocalHistory =
          (metadata?.dataCount ?? 0) >= MIN_LOCAL_HISTORY_TO_SKIP_FULL_SYNC;

        if (hasEnoughLocalHistory && lastUpdated !== '') {
          await syncMissingStockDataFromServer(symbol, lastUpdated, nowUtc);
          return;
        }

        await loadFullStockDataFromServer(symbol, nowUtc);
      }),
    );

    // 휴장일이라 0행이 내려와도 "오늘 boundary는 이미 확인했다"는 사실을 저장해야
    // 같은 날 새로고침마다 서버를 다시 치지 않는다.
    writeLocalStorageTimestamp(LAST_SERVER_CHECK_TIME_KEY, nowUtc.getTime());
  } catch (error: unknown) {
    console.error(`[${logTag}] 데이터 로딩 실패:`, error);
  }
};
```

#### 7) Strict IDB Fallback: `fetchStockPrices` 전체 교체

```ts
export const fetchStockPrices = async (
  symbols: string[],
): Promise<Record<string, StockData>> => {
  const validSymbols = Array.from(
    new Set(
      symbols
        .filter((symbol) => typeof symbol === 'string')
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  if (validSymbols.length === 0) {
    return {};
  }

  await initDatabase();

  const entries = await Promise.all(
    validSymbols.map(async (symbol) => {
      const records = await getStockPrices(symbol, STOCK_SNAPSHOT_FETCH_LIMIT);
      return [symbol, mapDbRecordsToStockData(symbol, records)] as const;
    }),
  );

  return Object.fromEntries(entries);
};
```

#### 8) Strict IDB Fallback: `fetchStockPricesWithPrev` 전체 교체

```ts
export const fetchStockPricesWithPrev = async (
  symbols: string[],
): Promise<Record<string, { current: number; previous: number }>> => {
  const validSymbols = Array.from(
    new Set(
      symbols
        .filter((symbol) => typeof symbol === 'string')
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  if (validSymbols.length === 0) {
    return {};
  }

  await initDatabase();

  const entries = await Promise.all(
    validSymbols.map(async (symbol) => {
      const pair = await getLatestStoredPricePair(symbol);
      const currentPrice = pair.latest?.close ?? 0;
      const previousPrice = pair.previous?.close ?? currentPrice;

      return [
        symbol,
        {
          current: currentPrice,
          previous: previousPrice,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
};
```

#### 9) Strict IDB Fallback: `calculateTechnicalIndicators` 전체 교체

```ts
export const calculateTechnicalIndicators = async (
  symbol: string,
  maPeriods: number[] = [20, 60, 120],
): Promise<{ ma: Record<number, number>; rsi: number } | null> => {
  const trimmedSymbol = symbol.trim();
  if (trimmedSymbol.length === 0) {
    console.warn('Invalid symbol provided to calculateTechnicalIndicators');
    return null;
  }

  try {
    await initDatabase();
    const dbRecords = await getStockPrices(trimmedSymbol, INDICATOR_DB_READ_LIMIT);

    if (dbRecords.length < MIN_INDICATOR_HISTORY) {
      return null;
    }

    const latestRecord = dbRecords[dbRecords.length - 1];
    if (
      latestRecord?.ma20 != null &&
      latestRecord.ma60 != null &&
      latestRecord.ma120 != null &&
      latestRecord.rsi != null
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

    await calculateAndSaveIndicators(trimmedSymbol, dbRecords);

    const savedRecords = await getStockPrices(trimmedSymbol, INDICATOR_DB_READ_LIMIT);
    const latestSavedRecord = savedRecords[savedRecords.length - 1];
    if (latestSavedRecord == null) {
      return null;
    }

    const prices = savedRecords.map((record) => record.close);
    const ma: Record<number, number> = {};

    for (const period of maPeriods) {
      ma[period] =
        readStoredMovingAverage(latestSavedRecord, period) ??
        calculateMA(prices, period);
    }

    return {
      ma,
      rsi: latestSavedRecord.rsi ?? calculateRSI(prices),
    };
  } catch (error: unknown) {
    console.error('Error calculating technical indicators:', error);
    return null;
  }
};
```

#### 10) Strict IDB Fallback: `fetchStockPriceHistory` 전체 교체

```ts
export const fetchStockPriceHistory = async (
  symbol: string,
  days: number = 90,
): Promise<Array<{ date: string; price: number; ma20: number; ma60: number }>> => {
  const trimmedSymbol = symbol.trim();
  if (trimmedSymbol.length === 0) {
    console.warn('Invalid symbol provided to fetchStockPriceHistory');
    return [];
  }

  try {
    await initDatabase();
    const records = await getStockPrices(trimmedSymbol, days);

    if (records.length === 0) {
      return [];
    }

    return records.map((record) => ({
      date: record.date,
      price: record.close,
      ma20: record.ma20 ?? record.close,
      ma60: record.ma60 ?? record.close,
    }));
  } catch (error: unknown) {
    console.error('Unexpected error fetching price history:', error);
    return [];
  }
};
```

## 적용 후 기대 효과
- **Egress 급감:** 하루 KST 07:15 boundary 당 최대 1회만 서버 체크
- **Infinite Fetch Loop 차단:** 휴장일에도 `LAST_SERVER_CHECK_TIME`와 `updateLastCheckedMetadata`가 같이 남아 같은 날 재조회 차단
- **로컬 우선 일관성 확보:** 모든 읽기 함수가 IDB만 보므로 `LATEST_TRADE_DATE`, 차트, 스냅샷의 기준이 한 축으로 수렴
- **부분 업데이트 최적화:** 보통은 `gt(lastUpdated)`로 0~3행만 받고, 초기 진입 시에만 240행 전체 적재

## 머릿속 컴파일 체크
- `LAST_SERVER_CHECK_TIME_KEY`, `getKstDateKey`, `getKstServerCheckBoundaryTime`는 `utils/marketUtils.ts`에서 export되므로 `stockService.ts` import 충돌이 없습니다.
- `getLatestStoredPricePair`는 `services/db.ts`에서 신규 export되며 반환 타입이 명시적이라 `fetchStockPricesWithPrev`에서 `any`가 생기지 않습니다.
- `loadStockDataForSymbols`는 `shouldCheckServerForSymbol(nowUtc)`를 한 번만 계산하므로, 루프 중 localStorage 변경으로 조건이 흔들리지 않습니다.
- `syncMissingStockDataFromServer`는 `0행 응답`과 `에러`를 분리합니다. 0행은 성공 처리, 에러는 throw이므로 negative cache가 실패를 숨기지 않습니다.
- `fetchStockPrices`, `fetchStockPricesWithPrev`, `calculateTechnicalIndicators`, `fetchStockPriceHistory`는 더 이상 Supabase를 직접 호출하지 않아 중앙 동기화 파이프라인 외 누수 경로가 사라집니다.
