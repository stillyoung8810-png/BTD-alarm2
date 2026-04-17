# 포트폴리오 요청 효율 리팩토링 시뮬레이션 계획서

> 목적: `Dashboard`, `Markets`, `History`, `App`, `utils/portfolioCalculations.ts`, `services/stockService.ts` 경로에서 확인된 불필요한 중복 요청을 최소 범위로 정리합니다.  
> 원칙: 실제 프로덕션 코드는 아직 바꾸지 않고, 먼저 요청 수(call-count) 불변식을 시뮬레이션으로 고정한 뒤 구현에 들어갑니다.  
> 실행 하네스: `docs2/request-efficiency-refactor-simulation-snippets.ts`  
> 자동 실행 게이트: `docs2/request-efficiency-refactor-simulation.test.ts`

## 0. 범위와 비범위

### 0.1 이번 단계에서 해결할 범위
1. `calculateHoldingsFromTrades()`가 최신순 거래 배열을 그대로 읽어 매도를 조용히 누락하는 계산 정확성 문제를 먼저 막습니다.
2. `Dashboard` 카드 지표 계산에서 같은 포트폴리오에 대해 `fetchStockPrices()`가 중복 호출되는 구조를 제거합니다.
3. `Dashboard` MA 분석에서 `fetchStockPrices()`와 `fetchStockPriceHistory()`가 한 사이클 안에서 반복 호출되는 구조를 제거합니다.
4. `Markets` 탭에서 앱 preload와 탭 진입 fetch가 콜드 스타트에서 겹치는 구조를 제어합니다.
5. `Markets` 탭에서 `lang` 변경만으로 차트 히스토리를 다시 가져오는 구조를 제거합니다.
6. `Markets` 탭에서 빠른 탭 전환, 빠른 종목 전환 시 컴포넌트 소유 in-flight 요청을 실제로 abort합니다.
7. `History` 탭은 요청 hotspot이 아님을 명시하고, 이번 단계에서는 적극적인 분해 없이 freeze합니다.

### 0.2 이번 단계에서 하지 않을 것
1. `React Query`, `SWR`, 전역 데이터 store, 새 context를 도입하지 않습니다.
2. `fetchPortfoliosByUserSafe()`를 활성/종결 포트폴리오 전용 API로 쪼개지 않습니다.
3. `Dashboard` 전용 문제를 해결하기 위해 범용 `usePortfolioRuntimeQuery` 같은 큰 추상화를 만들지 않습니다.
4. `handleOpenQuickInput`의 on-demand `determineActiveSection()` 호출은 사용자 액션 기반이라 이번 단계 최적화 대상에서 제외합니다.
5. effect dependency를 전역 serializer나 해시 함수로 일반화하지 않습니다. 1차에서는 중복 I/O 제거가 우선입니다.

## 1. 현재 병목 요약

### 1.1 `Dashboard` 카드 지표
`DashboardPortfolioCardHost.updateMetrics`는 `calculateCurrentValuation(portfolio)`와 `calculateYield(portfolio)`를 동시에 호출하지만, `calculateYield()`가 내부에서 다시 `calculateCurrentValuation()`를 호출합니다. 결과적으로 한 번의 카드 갱신에 같은 보유 종목 가격을 두 번 읽습니다.

### 1.2 `Dashboard` MA 분석
MA 카드 분석은 현재 아래 흐름으로 네트워크를 탑니다.

1. `determineActiveSection(portfolio)`
2. `fetchStockPrices(symbolsToFetch)`
3. `getMAValuesForAlignment(portfolio)`

이 과정에서 기준 종목 스냅샷과 이력 조회가 한 사이클 안에서 중복될 수 있습니다. 특히 비표준 MA 기간이 켜진 경우 `fetchStockPriceHistory()`가 중복될 가능성이 큽니다.

### 1.3 거래 순서 정확성
현재 `calculateHoldingsFromTrades()`는 입력 배열을 그대로 `forEach` 순회합니다. 로컬 코드 기준으로 매도 분기는 `holdingsMap[trade.stock]`가 이미 있을 때만 동작하므로, **최신 거래가 앞에 오는 배열**이 들어오면 과거 매수보다 최신 매도를 먼저 읽고 조용히 건너뛸 수 있습니다. 이 경우 보유 수량과 총원가가 실제보다 크게 남아, 이후 `Dashboard`, `Markets`, 상세 모달이 모두 잘못된 보유 상태를 기반으로 계산하게 됩니다.

### 1.4 `Markets` 콜드 스타트
`App.tsx`는 마운트 시 `loadInitialStockData()`를 호출하고, `Markets.tsx`도 진입 직후 `fetchStockPrices()`를 호출합니다. preload가 아직 끝나지 않은 시점에 마켓 탭에 진입하면, 같은 심볼에 대한 서버 조회가 겹칠 수 있습니다.

### 1.5 `Markets` 언어 전환
차트 데이터 fetch effect가 `[selectedStock, lang, canAccessPaidStocks]`에 묶여 있어 `lang`만 바뀌어도 `fetchStockPriceHistory()`가 다시 호출됩니다. 이는 데이터 fetch와 표시 포맷팅이 섞여 있다는 신호입니다.

### 1.6 `History`
`History` 탭 자체는 추가 fetch를 만들지 않습니다. 닫힌 포트폴리오 목록은 이미 메모리상의 `portfolios`에서 필터링하고, 읽기 전용 상세 모달도 `isHistory`일 때 가격 fetch를 건너뜁니다.  
다만 로그인 직후 내려받는 `portfolios` payload에 닫힌 포트폴리오가 함께 포함되므로, 훗날 히스토리 데이터가 아주 커지면 payload 분리 검토는 필요할 수 있습니다. 이 이슈는 "요청 수 낭비"보다 "응답 크기" 문제에 가깝기 때문에 지금은 보류합니다.

## 2. 통과 게이트

아래 조건이 모두 맞아야 구현을 시작합니다.

1. 카드 지표 1회 갱신당 `fetchStockPrices()` 호출 수는 최대 1회입니다.
2. `Dashboard` 카드 지표 커밋은 `currentValuation`과 `investedAmount`를 의미에 맞는 별도 state에 정확히 매핑해야 합니다.
3. 최신순 거래 배열이 들어와도 보유 수량/원가 계산은 시간순 기준으로 안정적으로 동일해야 합니다.
4. 같은 날짜(`YYYY-MM-DD`) 거래는 입력 순서를 보존한 채 계산되어야 합니다.
5. MA 분석 1회 갱신당 `fetchStockPrices()`는 최대 1회, `fetchStockPriceHistory()`는 최대 1회입니다.
6. `Dashboard`에서 `portfolio`가 빠르게 연속 갱신되면 이전 in-flight 요청은 `abort()`로 취소되어야 합니다.
7. `Markets`에서 `lang`만 바뀌면 차트 데이터는 재포맷만 되고, 히스토리 재조회는 0회입니다.
8. `App` preload와 `Markets` preload가 동시에 시작돼도 실제 preload 작업은 1회만 실행됩니다.
9. `Markets` 서비스 쿼리는 `signal`을 실제 query에 바인딩해야 합니다.
10. `Markets`에서 언마운트/종목 변경으로 abort가 발생하면 해당 요청은 커밋 0회여야 합니다.
11. `Markets`에서 일시적 fetch 실패가 나도 기존 `stockData`와 기존 차트 데이터는 유지되어야 합니다.
12. 다중 종목 로컬 조회와 warmup은 직렬 대기 없이 병렬 처리되어야 합니다.
13. `App` warmup과 `Dashboard` 비동기 로딩은 rejection을 반드시 `catch`로 소비해야 합니다.
14. 언어가 런타임에 바뀌어도, `App`과 `Dashboard` 토스트는 최신 언어 메시지를 사용해야 합니다.
15. 최신 언어 참조를 위해 data-loading effect에 `lang`이나 copy 객체를 의존성으로 넣지 않습니다.
16. `App` 토스트는 `APP_SHELL_MESSAGES`, `Dashboard` 토스트는 `getDashboardMessages(lang)`에서 가져와야 합니다.
17. `History` 읽기 전용 상세는 계속 0회 fetch를 유지합니다.
18. 이번 단계 구현으로 새 라이브러리, 새 전역 store, 새 endpoint는 추가하지 않습니다.

## 3. 리팩토링 계획

### 3.0 Phase 0 - 거래 시간순 정규화 선행

이 단계는 요청 최적화보다 먼저 적용해야 하는 계산 정확성 보정입니다.  
원칙은 단순합니다. **원본 `trades` 배열은 건드리지 않고**, 계산 함수 내부에서만 시간순 복사본을 만들어 사용합니다.

#### 대상 파일
1. `utils/portfolioCalculations.ts`

#### 스니펫 - `utils/portfolioCalculations.ts`

```ts
function getChronologicalTrades(trades: Trade[]): Trade[] {
  return [...trades]
    .reverse()
    .sort((left, right) => left.date.localeCompare(right.date));
}

export const calculateHoldingsFromTrades = (trades: Trade[]): Holdings[] => {
  const chronologicalTrades = getChronologicalTrades(trades);
  const holdingsMap: Record<
    string,
    { quantity: number; totalCost: number; realizedPnL: number }
  > = {};

  chronologicalTrades.forEach((trade) => {
    if (trade.type === 'buy') {
      if (!holdingsMap[trade.stock]) {
        holdingsMap[trade.stock] = {
          quantity: 0,
          totalCost: 0,
          realizedPnL: 0,
        };
      }

      holdingsMap[trade.stock].quantity += trade.quantity;
      holdingsMap[trade.stock].totalCost +=
        trade.price * trade.quantity + Math.abs(trade.fee);
      return;
    }

    if (!holdingsMap[trade.stock]) {
      return;
    }

    const entry = holdingsMap[trade.stock];

    if (entry.quantity < 0 || entry.quantity < trade.quantity) {
      throw new Error(
        `[${trade.stock}] 초과 매도 에러: 시도수량=${trade.quantity}, 보유수량=${entry.quantity}`,
      );
    }

    const currentAvgPrice =
      entry.quantity > HOLDINGS_QTY_EPSILON
        ? entry.totalCost / entry.quantity
        : 0;
    const revenue = trade.price * trade.quantity - Math.abs(trade.fee);
    const costBasis = currentAvgPrice * trade.quantity;
    entry.realizedPnL += revenue - costBasis;

    const avgPrice = currentAvgPrice;
    entry.quantity -= trade.quantity;
    entry.totalCost = entry.quantity * avgPrice;

    // 전량 매도와 부동소수점 잔여치를 함께 정리해 원금 찌꺼기를 남기지 않습니다.
    if (entry.quantity <= 0 || Math.abs(entry.quantity) < HOLDINGS_QTY_EPSILON) {
      entry.quantity = 0;
      entry.totalCost = 0;
    }
  });

  return Object.entries(holdingsMap).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice:
      data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
    realizedPnL: roundMoney(data.realizedPnL),
  }));
};
```

#### Phase 0 메모
1. 원본 배열을 직접 정렬하지 않습니다. UI가 최신순 렌더링을 기대하는 다른 경로를 건드리지 않기 위해서입니다.
2. `reverse().sort(localeCompare)`를 같이 쓰는 이유는, 같은 날짜 문자열에서는 reverse가 먼저 입력 순서를 뒤집어 두고 stable sort가 그 순서를 보존하게 하기 위함입니다.
3. 이 변경은 성능 최적화가 아니라 계산 정확성 복구입니다. 따라서 다른 최적화보다 먼저 적용합니다.

### 3.1 Phase A - `Dashboard` 카드 지표 단일 fetch화

핵심은 "한 번 읽은 가격으로 평가액, 수익률, 실현손익을 함께 계산"하는 것입니다.  
이 단계에서는 새 파일을 만들지 않고, 기존 `utils/portfolioCalculations.ts`에 최소 helper 하나만 추가합니다.

#### 대상 파일
1. `utils/portfolioCalculations.ts`
2. `components/Dashboard.tsx`

#### 스니펫 A - `utils/portfolioCalculations.ts`

```ts
export interface PortfolioMetricsSnapshot {
  currentValuation: number;
  investedAmount: number;
  yieldRate: number;
  realizedProfit: number;
}

export async function buildPortfolioMetricsSnapshot(
  portfolio: Portfolio,
  options: { signal?: AbortSignal } = {},
): Promise<PortfolioMetricsSnapshot> {
  const holdings = calculateHoldings(portfolio);
  const investedAmount = calculateInvestedAmount(portfolio);
  const realizedProfit = holdings.reduce(
    (sum, holding) => sum + (holding.realizedPnL ?? 0),
    0,
  );

  if (holdings.length === 0) {
    return {
      currentValuation: 0,
      investedAmount,
      yieldRate: 0,
      realizedProfit,
    };
  }

  const symbols = Array.from(
    new Set(
      holdings
        .map((holding) => holding.stock.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  const priceMap = await fetchStockPrices(symbols, options);
  const currentValuation = holdings.reduce((sum, holding) => {
    const currentPrice = priceMap[holding.stock]?.price ?? 0;
    return sum + holding.quantity * currentPrice;
  }, 0);

  return {
    currentValuation,
    investedAmount,
    yieldRate: calculateYieldPercent(currentValuation, investedAmount),
    realizedProfit,
  };
}
```

#### 스니펫 B - `components/Dashboard.tsx`

```ts
import { useLayoutEffect, useRef, useState } from 'react';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';
import { showErrorToast } from './tds-adapter/showErrorToast';

const [currentValuation, setCurrentValuation] = useState(0);
const [investedAmount, setInvestedAmount] = useState(0);

const currentDashboardCopy = getDashboardMessages(lang);
const copyRef = useRef(currentDashboardCopy);

useLayoutEffect(() => {
  copyRef.current = currentDashboardCopy;
}, [currentDashboardCopy]);

useEffect(() => {
  let isMounted = true;
  const abortController = new AbortController();

  const loadMetrics = async () => {
    try {
      const nextMetrics = await buildPortfolioMetricsSnapshot(portfolio, {
        signal: abortController.signal,
      });

      if (!isMounted) {
        return;
      }

      setCurrentValuation(nextMetrics.currentValuation);
      setInvestedAmount(nextMetrics.investedAmount);
      setYieldRate(nextMetrics.yieldRate);
      setRealizedProfit(nextMetrics.realizedProfit);
    } catch (error: unknown) {
      if (isAbortLikeError(error) || !isMounted) {
        return;
      }

      console.error('[Dashboard] Failed to load metrics snapshot:', error);
      showErrorToast(copyRef.current.systemError);
    }
  };

  void loadMetrics();

  return () => {
    isMounted = false;
    abortController.abort();
  };
}, [portfolio]);

const cardVm = {
  valuationText: isMetricsLoading
    ? loadingLabel
    : formatUsdValue(currentValuation, 2),
  // ... 나머지 필드는 기존 구조 유지
};
```

#### Phase A 메모
1. `calculateYield()` 자체 시그니처를 바꾸지 않습니다. 다른 호출부 churn을 만들 수 있기 때문입니다.
2. `isMounted`는 stale state 커밋 방지용으로만 남기고, 실제 네트워크 취소는 `AbortController`가 담당합니다.
3. 이 단계는 "중복 가격 조회 제거"와 함께, 카드 state 시맨틱도 바로잡습니다. `currentValuation`과 `investedAmount`를 같은 state에 섞어 두는 계획은 허용하지 않습니다.

### 3.2 Phase B - `Dashboard` MA 분석 입력 단일 로드

핵심은 `runAnalysis` 1회당 "가격 맵 1번 + 필요 시 이력 1번"만 로드하고, 나머지 판단은 모두 로컬 데이터로 계산하는 것입니다.  
이 단계는 `Dashboard.tsx` 파일 스코프 helper로 한정합니다. 새 범용 MA 서비스는 만들지 않습니다.

#### 대상 파일
1. `components/Dashboard.tsx`

#### 스니펫 A - 한 번만 로드하는 입력 묶음

```ts
const STANDARD_MA_PERIODS = [20, 60, 120] as const;
const MIN_FALLBACK_HISTORY_DAYS = 120;
const MA_HISTORY_BUFFER_DAYS = 30;
type StandardMaPeriod = (typeof STANDARD_MA_PERIODS)[number];
const MA_PROPERTY_MAP: Record<StandardMaPeriod, keyof StockData> = {
  20: 'ma20',
  60: 'ma60',
  120: 'ma120',
};

interface MaAnalysisInputs {
  baseStock: string;
  priceMap: Record<string, StockData>;
  baseHistory: Array<{ price: number }> | null;
}

function isStandardMaPeriod(
  period: number,
): period is StandardMaPeriod {
  return (STANDARD_MA_PERIODS as readonly number[]).includes(period);
}

async function loadMaAnalysisInputs(
  portfolio: Portfolio,
  options: { signal?: AbortSignal } = {},
): Promise<MaAnalysisInputs> {
  const baseStock = portfolio.strategy.ma0.stock;
  const symbols = Array.from(
    new Set(
      [
        baseStock,
        portfolio.strategy.ma1.stock,
        portfolio.strategy.ma2.stock,
        portfolio.strategy.ma3.stock,
      ].filter(
        (symbol): symbol is string =>
          typeof symbol === 'string' && symbol.trim().length > 0,
      ),
    ),
  );

  const priceMap = await fetchStockPrices(symbols, options);
  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const shouldLoadHistory =
    !isStandardMaPeriod(maAPeriod) || !isStandardMaPeriod(maBPeriod);

  if (!shouldLoadHistory) {
    return {
      baseStock,
      priceMap,
      baseHistory: null,
    };
  }

  const history = await fetchStockPriceHistory(
    baseStock,
    Math.max(maAPeriod, maBPeriod, MIN_FALLBACK_HISTORY_DAYS) +
      MA_HISTORY_BUFFER_DAYS,
    options,
  );

  return {
    baseStock,
    priceMap,
    baseHistory: history.map((item) => ({ price: item.price })),
  };
}
```

#### 스니펫 B - 로드된 입력만 쓰는 순수 계산

```ts
function getMaValueFromLoadedData(
  period: number,
  baseData: StockData | undefined,
  baseHistory: Array<{ price: number }> | null,
): number {
  if (baseData == null) {
    return 0;
  }

  if (isStandardMaPeriod(period)) {
    const maKey = MA_PROPERTY_MAP[period];
    const mappedValue = baseData[maKey];
    return typeof mappedValue === 'number' ? mappedValue : 0;
  }

  if (baseHistory == null || baseHistory.length < period) {
    return 0;
  }

  const prices = baseHistory.map((item) => item.price);
  return calculateMA(prices.slice(-period), period);
}

function determineActiveSectionFromLoadedData(
  portfolio: Portfolio,
  inputs: MaAnalysisInputs,
): 1 | 2 | 3 | null {
  const baseData = inputs.priceMap[inputs.baseStock];
  const basePrice = baseData?.price ?? 0;

  if (!areStrictPositiveFiniteScalars(basePrice)) {
    return null;
  }

  const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
  const maA = getMaValueFromLoadedData(
    maAPeriod,
    baseData,
    inputs.baseHistory,
  );
  const maB = getMaValueFromLoadedData(
    maBPeriod,
    baseData,
    inputs.baseHistory,
  );

  if (!areStrictPositiveFiniteScalars(maA, maB)) {
    return null;
  }

  const high = Math.max(maA, maB);
  const low = Math.min(maA, maB);

  if (basePrice > high) {
    return 1;
  }
  if (basePrice < low) {
    return 3;
  }
  return 2;
}
```

#### 스니펫 C - `runAnalysis` 적용 방향

```ts
import { useLayoutEffect, useRef } from 'react';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';
import { showErrorToast } from './tds-adapter/showErrorToast';

const currentDashboardCopy = getDashboardMessages(lang);
const copyRef = useRef(currentDashboardCopy);

useLayoutEffect(() => {
  copyRef.current = currentDashboardCopy;
}, [currentDashboardCopy]);

useEffect(() => {
  let isMounted = true;
  const abortController = new AbortController();

  const loadMaAnalysis = async () => {
    try {
      const inputs = await loadMaAnalysisInputs(portfolio, {
        signal: abortController.signal,
      });

      if (!isMounted) {
        return;
      }

      const nextSection = determineActiveSectionFromLoadedData(portfolio, inputs);
      const baseData = inputs.priceMap[inputs.baseStock];
      const { maAPeriod, maBPeriod } = getMaPeriods(portfolio);
      const maA = getMaValueFromLoadedData(
        maAPeriod,
        baseData,
        inputs.baseHistory,
      );
      const maB = getMaValueFromLoadedData(
        maBPeriod,
        baseData,
        inputs.baseHistory,
      );

      // 이후 기존 UI state 커밋 로직 연결
      void nextSection;
      void maA;
      void maB;
    } catch (error: unknown) {
      if (isAbortLikeError(error) || !isMounted) {
        return;
      }

      console.error('[Dashboard] Failed to load MA analysis inputs:', error);
      showErrorToast(copyRef.current.systemError);
    }
  };

  void loadMaAnalysis();

  return () => {
    isMounted = false;
    abortController.abort();
  };
}, [portfolio]);
```

#### Phase B 메모
1. 1차에서는 effect dependency를 억지로 해시 문자열로 바꾸지 않습니다. 중복 I/O 제거가 먼저입니다.
2. `handleOpenQuickInput`는 유저 액션 기반 1회성 호출이므로 이번 PR의 핵심 병목에서 제외합니다.
3. `determineActiveSection`과 `getMAValuesForAlignment`를 즉시 지우기보다, 먼저 `FromLoadedData` 경로를 붙여 검증한 뒤 정리합니다.

### 3.3 Phase C - `Markets` preload 공유와 차트 fetch 분리

핵심은 아래 두 축을 분리하는 것입니다.

1. 앱 전역 warmup은 `App`과 `Markets`가 동시에 호출해도 한 번만 돌도록 공유합니다.
2. `Markets` 컴포넌트가 직접 소유하는 목록/차트 조회는 `AbortController`로 즉시 취소합니다.

기존 request-id 방식은 "늦게 온 응답 무시"에는 도움이 되지만, 네트워크 연결과 서버 비용 자체를 끊지 못합니다. 따라서 이번 계획서에서는 request-id 단독안을 폐기하고, 컴포넌트 소유 fetch에는 `AbortController`를 필수로 반영합니다.

#### 대상 파일
1. `services/stockService.ts`
2. `App.tsx`
3. `components/Markets.tsx`

#### 스니펫 A - `services/stockService.ts`

```ts
interface StockQueryOptions {
  signal?: AbortSignal;
}

let freeStockWarmupPromise: Promise<void> | null = null;
let paidStockWarmupPromise: Promise<void> | null = null;

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  return error instanceof Error && error.name === 'AbortError';
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export async function fetchStockPrices(
  symbols: string[],
  options: StockQueryOptions = {},
): Promise<Record<string, StockData>> {
  const { signal } = options;
  if (signal?.aborted) {
    throw createAbortError();
  }

  const validSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  const lookupResults = await Promise.all(
    validSymbols.map(async (symbol) => {
      if (signal?.aborted) {
        throw createAbortError();
      }

      const dbRecords = await getStockPrices(symbol, STOCK_SNAPSHOT_FETCH_LIMIT);
      return {
        symbol,
        dbRecords,
      };
    }),
  );

  if (signal?.aborted) {
    throw createAbortError();
  }

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

  if (dbMissSymbols.length === 0) {
    return results;
  }

  let query = supabase
    .from('stock_prices')
    .select('symbol, close, trade_date')
    .in('symbol', dbMissSymbols)
    .order('symbol', { ascending: true })
    .order('trade_date', { ascending: false });

  if (signal != null) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (error != null) {
    if (isAbortLikeError(error)) {
      throw createAbortError();
    }
    throw error;
  }

  const decodedRows = decodeSupabaseStockRows(data);
  if (decodedRows == null) {
    return results;
  }

  const fetchedMap = mapRowsBySymbol(decodedRows);
  dbMissSymbols.forEach((symbol) => {
    results[symbol] = mapRowsToStockData(symbol, fetchedMap[symbol] ?? []);
  });

  return results;
}

export async function fetchStockPriceHistory(
  symbol: string,
  days: number = 90,
  options: StockQueryOptions = {},
): Promise<Array<{ date: string; price: number; ma20: number; ma60: number }>> {
  const { signal } = options;
  const trimmedSymbol = symbol.trim();
  if (trimmedSymbol.length === 0) {
    return [];
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const dbRecords = await getStockPrices(trimmedSymbol, days);
  if (dbRecords.length > 0) {
    return dbRecords.map((record) => ({
      date: record.date,
      price: record.close,
      ma20: record.ma20 || record.close,
      ma60: record.ma60 || record.close,
    }));
  }

  let query = supabase
    .from('stock_prices')
    .select('close, trade_date')
    .eq('symbol', trimmedSymbol)
    .order('trade_date', { ascending: false })
    .limit(days);

  if (signal != null) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (error != null) {
    if (isAbortLikeError(error)) {
      throw createAbortError();
    }
    throw error;
  }

  const decodedRows = decodeSupabaseStockRows(data);
  const records = toStockPriceRecords(trimmedSymbol, decodedRows ?? [])
    .filter((record) => record.date.length > 0 && record.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return records.map((record) => ({
    date: record.date,
    price: record.close,
    ma20: record.ma20 || record.close,
    ma60: record.ma60 || record.close,
  }));
}

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
```

#### 스니펫 B - `App.tsx`

```ts
import { useLayoutEffect, useRef } from 'react';
import { showErrorToast } from './components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from './constants/messages/appShellMessages';

const currentShellCopy = APP_SHELL_MESSAGES[lang];
const shellCopyRef = useRef(currentShellCopy);

useLayoutEffect(() => {
  shellCopyRef.current = currentShellCopy;
}, [currentShellCopy]);

useEffect(() => {
  ensureInitialStockDataReady().catch((error: unknown) => {
    console.error('[App] Initial stock warmup failed:', error);
    showErrorToast(shellCopyRef.current.dailySummaryNetworkError);
  });
}, []);

useEffect(() => {
  if (!canAccessPaidStocks) {
    return;
  }

  ensurePaidStockDataReady().catch((error: unknown) => {
    console.error('[App] Paid stock warmup failed:', error);
    showErrorToast(shellCopyRef.current.dailySummaryNetworkError);
  });
}, [canAccessPaidStocks]);
```

#### 스니펫 C - `components/Markets.tsx`

```ts
const MARKET_CHART_DAYS = 90;

interface RawMarketChartPoint {
  date: string;
  price: number;
  ma20: number;
  ma60: number;
}

function formatMarketChartDate(rawDate: string, lang: AppLang): string {
  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }

  return date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const [rawChartData, setRawChartData] = useState<RawMarketChartPoint[]>([]);

useEffect(() => {
  const abortController = new AbortController();

  const loadStockData = async () => {
    setIsLoading(true);

    try {
      const warmups = [ensureInitialStockDataReady()];
      if (canAccessPaidStocks) {
        warmups.push(ensurePaidStockDataReady());
      }
      await Promise.all(warmups);

      const symbolsToFetch = canAccessPaidStocks ? ALL_STOCKS : AVAILABLE_STOCKS;
      const data = await fetchStockPrices(symbolsToFetch, {
        signal: abortController.signal,
      });

      setStockData(data);
    } catch (error: unknown) {
      if (isAbortLikeError(error)) {
        return;
      }

      console.error('[Markets] Failed to sync latest prices:', error);
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  void loadStockData();

  return () => {
    abortController.abort();
  };
}, [canAccessPaidStocks]);

useEffect(() => {
  const stockSymbol = selectedStock;
  if (!stockSymbol || (!canAccessPaidStocks && PAID_STOCKS.includes(stockSymbol))) {
    setRawChartData([]);
    return;
  }

  const abortController = new AbortController();

  const loadChartData = async () => {
    try {
      const history = await fetchStockPriceHistory(
        stockSymbol,
        MARKET_CHART_DAYS,
        { signal: abortController.signal },
      );

      setRawChartData(
        history.map((item) => ({
          date: item.date,
          price: item.price,
          ma20: item.ma20,
          ma60: item.ma60,
        })),
      );
    } catch (error: unknown) {
      if (isAbortLikeError(error)) {
        return;
      }

      console.error('[Markets] Failed to load chart history:', error);
    }
  };

  void loadChartData();

  return () => {
    abortController.abort();
  };
}, [selectedStock, canAccessPaidStocks]);

const chartData = useMemo(
  () =>
    rawChartData.map((item) => ({
      name: formatMarketChartDate(item.date, lang),
      date: item.date,
      price: item.price,
      ma20: item.ma20,
      ma60: item.ma60,
    })),
  [lang, rawChartData],
);
```

#### Phase C 메모
1. `lang`은 fetch effect dependency에서 제거하고, 순수 포맷팅 경로에서만 사용합니다.
2. warmup은 앱 전역 공유 작업이므로 dedupe만 하고, `Markets`가 직접 소유한 fetch만 `AbortController`로 취소합니다.
3. 목록/차트 fetch는 "request-id로 무시"가 아니라 "signal로 네트워크 자체를 단락"하는 것을 1차 계약으로 고정합니다.
4. `App.tsx`의 warmup 호출은 `void` fire-and-forget로 끝내지 않고 `.catch(...)`를 붙여 unhandled rejection을 차단합니다.
5. 다중 심볼 로컬 조회와 free/paid warmup은 `Promise.all()`로 병렬 처리해 직렬 await 병목을 제거합니다.
6. `Markets` 전용 상태는 계속 컴포넌트 내부에 둡니다. App로 올리거나 전역 store로 빼지 않습니다.

### 3.4 Phase D - `History`는 freeze, payload 이슈만 기록

이번 단계에서 `History`는 요청 효율 refactor 대상이 아닙니다.

1. `History` 탭 목록 렌더는 메모리 데이터만 씁니다.
2. 읽기 전용 상세는 `isHistory`일 때 가격 fetch를 건너뛰는 현재 guard를 유지합니다.
3. `fetchPortfoliosByUserSafe()`의 payload 분리는 "요청 수 낭비"가 아니라 "응답 크기 증가" 문제라서, 실제 데이터 규모가 커질 때 2차로 검토합니다.

## 4. 시뮬레이션 시나리오

실행 가능한 전체 하네스는 `docs2/request-efficiency-refactor-simulation-snippets.ts`에 둡니다.  
이 하네스는 비즈니스 수학 전체를 재구현하지 않고, 이번 PR의 요청 효율 불변식만 검증합니다.

### 4.1 확인할 불변식
1. `simulateDashboardMetrics()`  
   - 보유 종목이 중복돼도 심볼은 dedupe됩니다.  
   - 평가액/수익률/실현손익 계산에 가격 fetch는 1회만 발생합니다.
2. `simulateDashboardAbort()`  
   - 빠른 포트폴리오 연속 갱신 시 이전 in-flight metrics 요청은 abort됩니다.  
   - abort된 요청은 커밋 0회입니다.
3. `simulateMaAnalysis()`  
   - 표준 MA 기간이면 가격 fetch 1회, 이력 fetch 0회입니다.  
   - 비표준 MA 기간이면 가격 fetch 1회, 이력 fetch 1회입니다.
4. `simulateMarkets()`  
   - concurrent preload는 1회만 실행됩니다.  
   - `lang` 변경은 raw chart 재포맷만 수행하고 history fetch는 증가하지 않습니다.
5. `simulateMarketsAbort()`  
   - abort된 차트 요청은 커밋 0회입니다.  
   - "stale response 무시"가 아니라 AbortError 경로를 통과합니다.
6. `simulateAbortBindingContract()`  
   - 서비스 query는 `abortSignal(signal)`이 실제로 바인딩됩니다.
7. `simulateParallelLookupSafety()`  
   - 다중 종목 로컬 조회는 직렬 대기가 아니라 병렬로 시작됩니다.
8. `simulateParallelWarmupSafety()`  
   - free/paid warmup은 병렬로 시작됩니다.
9. `simulateWarmupCatchSafety()`  
   - warmup rejection은 정확히 한 번 catch되고, `APP_SHELL_MESSAGES` 기반 토스트가 1회 발생합니다.
10. `simulateDashboardCatchSafety()`  
   - dashboard async rejection은 정확히 한 번 catch되고, `getDashboardMessages(lang)` 기반 토스트가 1회 발생합니다.
11. `simulateLatestLangRefSafety()`  
   - 초기 언어와 다른 최신 언어로 바뀐 뒤에도, 재요청 없이 최신 언어 토스트가 사용됩니다.
12. `simulateHistoryFreeze()`  
   - 읽기 전용 상세는 가격 fetch 대상이 아닙니다.

### 4.2 실행 하네스 요약

```ts
await simulateDashboardMetrics();
await simulateDashboardAbort();
await simulateDashboardCatchSafety();
await simulateMaAnalysis();
await simulateMarkets();
await simulateMarketsAbort();
await simulateAbortBindingContract();
await simulateParallelLookupSafety();
await simulateParallelWarmupSafety();
await simulateWarmupCatchSafety();
await simulateLatestLangRefSafety();
simulateHistoryFreeze();
```

### 4.3 실행 방법

저장소에는 `vitest`가 이미 있으므로, 이번 단계에서는 아래 경로로 바로 확인합니다.

1. 하네스 본체: `docs2/request-efficiency-refactor-simulation-snippets.ts`
2. 자동 실행 게이트: `docs2/request-efficiency-refactor-simulation.test.ts`
3. 전용 설정: `docs2/request-efficiency-vitest.config.ts`
4. 실행 예시: `npx vitest run --config docs2/request-efficiency-vitest.config.ts`

문서만 두고 끝내지 않고 얇은 Vitest 게이트까지 붙이는 이유는, 구현 전 합의된 요청 수 불변식을 실제로 PASS/FAIL로 고정하기 위해서입니다. 다만 프로덕션 코드까지 함께 수정하지는 않으므로 과한 선행 구현은 아닙니다.

## 5. 오버코딩 방지 체크

이번 계획은 아래 선을 넘지 않아야 합니다.

1. `Dashboard` 문제를 풀기 위해 범용 런타임 엔진이나 새 서비스 레이어를 만들지 않습니다.
2. `Markets` preload dedupe는 모듈 내부 in-flight promise까지만 허용합니다. 전역 캐시 프레임워크는 도입하지 않습니다.
3. 거래 순서 버그는 `calculateHoldingsFromTrades()` 내부 복사본 정렬로만 닫습니다. 저장 포맷이나 UI 배열 방향은 바꾸지 않습니다.
4. `History` payload 분리를 당장 하지 않습니다. 실제 병목이 "응답 크기"로 확인될 때만 2차로 갑니다.
5. effect dependency를 해시 문자열이나 범용 serializer로 일반화하지 않습니다.
6. 새 helper는 "중복 I/O 제거", "중복 계산 제거", 또는 "계산 정확성 복구"가 분명한 곳에만 둡니다.
7. 1차 PR에서는 state rename, UI polish, unrelated cleanup을 함께 하지 않습니다.

## 6. Core Principles 정합성 체크

1. 금융 수학 변경은 하지 않고, 기존 `calculateYieldPercent()`와 보유 수량 계산을 재사용합니다.
2. 스니펫은 `any`, non-null assertion, 3중 중첩 삼항 없이 작성합니다.
3. 사용자 노출용 새 하드코딩 문구는 추가하지 않습니다.
4. 비동기 경로는 guard clause, `AbortController`, 명시적 `catch`로 in-flight 요청과 rejection을 모두 통제합니다.
5. state는 필요한 컴포넌트 안에 유지하고, App 전역으로 올리지 않습니다.
6. 시뮬레이션 하네스도 `Number.EPSILON`, 상수 추출, 중복 제거 같은 규칙을 따릅니다.
7. 토스트/에러 문구는 실제 저장소 SSOT 경로(`showErrorToast`, `APP_SHELL_MESSAGES`, `getDashboardMessages`)만 사용합니다.
8. 최신 다국어 문구는 `useLayoutEffect + ref`로 동기화하고, 네트워크 effect 의존성에는 넣지 않습니다.

## 7. 구현 착수 조건

아래 두 가지가 만족되면 실제 코드 구현으로 넘어갑니다.

1. `docs2/request-efficiency-refactor-simulation.test.ts`가 PASS합니다.
2. 코드 리뷰 관점에서 "새 라이브러리 없음, 새 전역 store 없음, 새 endpoint 없음"이 유지됩니다.
