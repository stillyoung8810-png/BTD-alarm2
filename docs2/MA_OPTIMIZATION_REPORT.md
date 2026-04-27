# MA_OPTIMIZATION_REPORT

## 검토 범위

- 클라이언트 MA 전략 경로: `components/Dashboard.tsx`, `utils/portfolioCalculations.ts`, `services/stockService.ts`, `utils/dailyExecutionSummary.ts`
- 서버/Edge Function MA 전략 경로: `supabase/functions/generate-daily-execution-summaries/index.ts`, `supabase/functions/_shared/maSummaryShared.ts`
- 검토 기준: Dead Code & Legacy Debt, Memory Leaks & Render Thrashing, Network & Server Abuse
- 실제 코드 수정 전 검토 리포트입니다. 아래 항목은 코드 근거가 확인된 내용만 포함합니다.

## 발견 1. 높음 - MA 대시보드 분석이 부분익절 미사용 구간 종목까지 항상 조회함

### 발견 위치

- `components/Dashboard.tsx`
- 함수: `loadMaAnalysisInputs`
- 관련 흐름: `DashboardPortfolioCardHost`의 MA 분석 `useEffect`

### 원인 및 위험성

`loadMaAnalysisInputs`는 MA 기준 종목(`ma0.stock`)뿐 아니라 `ma1.stock`, `ma2.stock`, `ma3.stock`을 항상 `fetchStockPrices`에 전달합니다.

하지만 활성 구간 판정, RSI 조건, 정배열 조건은 기준 종목 데이터만 필요합니다. 구간별 종목 현재가는 `takePartialProfit`이 켜져 있고 목표 수익률 체크가 필요한 경우에만 사용됩니다.

현재 구조에서는 부분익절을 전혀 사용하지 않는 포트폴리오도 대시보드 렌더링 때 섹션 종목 가격/지표까지 함께 조회합니다. `fetchStockPrices`는 캐시가 비어 있으면 각 심볼에 대해 지표 스냅샷 계산(`RSI`, `MA 20/60/120`)까지 이어질 수 있어, 초기 진입이나 캐시 미스 상황에서 불필요한 IndexedDB/Supabase 작업이 커질 수 있습니다.

### 최적화 해결 방안

- `loadMaAnalysisInputs`에서 기본 조회 대상은 `ma0.stock`으로 제한합니다.
- `ma1/ma2/ma3`는 해당 구간의 `takePartialProfit === true`이고 `partialProfitTargetPct > 0`일 때만 추가합니다.
- 부분익절 라인 계산은 지금처럼 순수 함수 `collectMaPartialProfitLine`을 사용하되, 필요한 가격 데이터만 전달합니다.
- 회귀 테스트: 부분익절 미사용 MA 포트폴리오는 `fetchStockPrices`가 기준 종목만 받는지 검증합니다.

## 발견 2. 높음 - 일별 요약 Edge Function의 stock history 선로딩 쿼리에 행 수 상한이 없음

### 발견 위치

- `supabase/functions/generate-daily-execution-summaries/index.ts`
- 함수: `preloadStockHistoryCache`

### 원인 및 위험성

`preloadStockHistoryCache`는 필요한 심볼을 모은 뒤 `stock_prices`에 `.in("symbol", symbols)`를 호출하지만, 쿼리 자체에는 전체 행 수 상한이나 날짜 범위 제한이 없습니다.

함수 내부에서 심볼별 필요한 최대 개수만큼만 `rowsBySymbol`에 push하고 있지만, DB에서 내려오는 결과 자체는 모든 대상 심볼의 전체 히스토리입니다. 현재 데이터가 240일 수준이면 문제가 작아 보일 수 있으나, 테이블이 장기간 누적되거나 심볼 수가 늘어나면 Edge Function 메모리 사용량, 네트워크 페이로드, 실행 시간이 같이 커질 수 있습니다.

### 최적화 해결 방안

- 선로딩 쿼리를 심볼별 최대 필요 개수만 가져오도록 바꿉니다.
- Supabase/PostgREST에서 심볼별 top-N을 한 번에 안정적으로 표현하기 어렵다면, 전체 무제한 1회 조회 대신 제한된 동시성으로 심볼별 `.limit(maxLimit)` 조회를 수행합니다.
- 이미 존재하는 `mapWithConcurrency` 또는 별도 상수로 동시성 제한을 적용합니다.
- 실패 시 현재처럼 개별 `getStockHistory` 폴백은 유지하되, 선로딩 단계가 과도한 전체 테이블 스캔이 되지 않도록 합니다.

## 발견 3. 중간 - 서버 MA 경로에서 RSI와 MA 값을 조건과 무관하게 일부 재계산함

### 발견 위치

- `supabase/functions/generate-daily-execution-summaries/index.ts`
- 함수: `addMaPortfolioHistoryRequirements`, `buildPortfolioBlock`, `determineActiveSection`, `getMAValuesForAlignment`

### 원인 및 위험성

MA 포트폴리오 선로딩 요구사항에 `RSI_ONLY_REQUIREMENTS`가 항상 추가됩니다. 실제 표시 여부는 `ma0.rsiEnabled`가 true일 때만 의미가 있으므로, RSI 미사용 포트폴리오에서는 불필요한 스냅샷 계산 후보가 됩니다.

또한 `determineActiveSection`에서 이미 `maA`, `maB`를 계산한 뒤, `alignmentEnabled`가 true이면 `getMAValuesForAlignment`가 같은 값을 다시 요청합니다. 현재는 snapshot/history 캐시가 있어 DB 중복은 대부분 줄어들지만, 코드 경로상 중복 계산 의도가 남아 있고 캐시 키가 달라지는 설정에서는 불필요한 작업이 늘어날 수 있습니다.

### 최적화 해결 방안

- `RSI_ONLY_REQUIREMENTS`는 `portfolio.strategy.ma0.rsiEnabled === true`일 때만 선로딩합니다.
- `determineActiveSection`이 `section`, `maA`, `maB`, `baseSnapshot`을 함께 반환하는 작은 내부 결과 타입을 만들거나, `buildPortfolioBlock`에서 한 번 계산한 `maA/maB`를 정배열 판단에 재사용합니다.
- 기능 결과는 유지하고 계산 파이프라인의 중복만 제거합니다.

## 발견 4. 중간 - MA 분석 완료 시 `maBlockVersion`이 값 변화와 무관하게 증가함

### 발견 위치

- `components/Dashboard.tsx`
- 상태: `maBlockVersion`
- 관련 흐름: MA 분석 `useEffect`와 `onDailyExecutionBlock` effect

### 원인 및 위험성

MA 분석이 성공하고 `nextSection != null`이면 실제 구간, RSI 상태, 정배열 상태, 부분익절 라인이 동일해도 `maBlockVersion`이 증가합니다. 이 값은 일별 실행 블록 전달 effect의 의존성에 포함되어 있어, 같은 결과 문자열을 다시 조립하고 상위 상태 갱신 콜백을 호출할 수 있습니다.

현재는 네트워크 무한 루프나 메모리 누수로 보이지는 않습니다. 다만 포트폴리오 객체 참조가 자주 바뀌는 렌더 경로에서는 작은 재렌더 비용이 누적될 수 있습니다.

### 최적화 해결 방안

- `maBlockVersion`은 “첫 MA 분석 완료 여부”를 나타내는 boolean 상태로 축소하거나, 계산 결과가 실제로 달라질 때만 증가시킵니다.
- `maActiveSection`, `maRsiNotMet`, `maAlignmentNotMet`, `maPartialProfitLines`가 모두 동일하면 일별 실행 블록 effect를 재실행하지 않도록 합니다.
- 상위 콜백 `onDailyExecutionBlock`이 같은 문자열에 대해 no-op 처리하는지도 함께 확인합니다.

## 발견 5. 낮음 - 빠른 입력 모달 오픈 시 이미 계산된 MA 구간을 재사용하지 않고 재조회함

### 발견 위치

- `components/Dashboard.tsx`
- 함수: `handleOpenQuickInput`
- 호출 함수: `determineActiveSection` in `utils/portfolioCalculations.ts`

### 원인 및 위험성

대시보드 카드의 MA 분석 effect가 이미 `maActiveSection`을 계산해 둔 상태에서도, 빠른 입력 모달을 열면 `determineActiveSection(portfolio)`를 다시 호출합니다. 이 함수는 `fetchStockPrices`와 조건부 `fetchStockPriceHistory`를 수행할 수 있습니다.

사용자 클릭 시점의 최신성을 확보하려는 의도는 이해되지만, 대부분의 경우 같은 화면에서 이미 계산된 구간을 재사용할 수 있습니다. 특히 사용자가 여러 포트폴리오를 빠르게 열어보는 경우 불필요한 재조회가 발생할 수 있습니다.

### 최적화 해결 방안

- `maActiveSection`이 이미 `1 | 2 | 3`이면 우선 재사용합니다.
- 값이 아직 없거나 MA 분석 실패 상태일 때만 `determineActiveSection(portfolio)`를 fallback으로 호출합니다.
- 최신 가격 강제 갱신이 필요한 UX라면 버튼 클릭 시 재계산 사유를 명확히 주석으로 남깁니다.

## 발견 6. 낮음 - MA 관련 Dead Export가 남아 있음

### 발견 위치

- `utils/portfolioCalculations.ts`
  - `getMAValuesForAlignment`
- `supabase/functions/_shared/maSummaryShared.ts`
  - `collectMaPartialProfitLines`

### 원인 및 위험성

저장소 검색 기준으로 위 export들은 실제 앱 코드에서 호출되지 않습니다. 테스트 또는 과거 리팩터링 과정에서 남은 보조 함수로 보이며, 지금 당장 런타임 비용을 만들지는 않습니다.

다만 공개 export로 남아 있으면 “사용 가능한 공식 API”처럼 보이고, 이후 수정 시 불필요한 호환성 부담과 테스트 범위를 늘릴 수 있습니다.

### 최적화 해결 방안

- 실제 호출처가 없다면 제거합니다.
- 제거 전 `maStrategyParity.test.ts`, `maStrategyCrossValidation.test.ts` 등 테스트에서 간접 의존이 없는지 확인합니다.
- 향후 재사용 예정이면 파일 내부 주석이 아니라 테스트로 의도를 고정합니다.

## 문제없음으로 확인한 영역

- `components/Dashboard.tsx`의 MA 분석 effect는 `AbortController`와 `isMounted` 플래그로 언마운트 후 상태 업데이트를 방어하고 있습니다.
- `services/stockService.ts`의 `fetchIndicatorAwareSnapshot`은 cache key 기반 in-flight request map을 사용해 동일 지표 스냅샷 중복 요청을 합칩니다.
- `fetchStockPrices`는 입력 심볼을 정규화하고 중복 제거한 뒤 조회합니다.
- `check-and-trigger-alarms` / `send-alarm` 계열은 MA 계산을 직접 수행하지 않고 저장된 daily execution summary를 사용하는 구조로 확인됩니다.
- `maSummaryShared.ts`의 핵심 계산/포맷 함수는 I/O 없이 순수 함수 중심으로 구성되어 있습니다.

## 권장 수정 순서

1. `preloadStockHistoryCache`의 무제한 `stock_prices` 조회 제한부터 적용합니다. 서버 비용과 타임아웃 리스크가 가장 큽니다.
2. `loadMaAnalysisInputs`에서 부분익절 미사용 섹션 종목 조회를 제거합니다. 사용자가 가장 자주 밟는 대시보드 경로입니다.
3. 서버 MA 경로의 RSI/MA 중복 계산을 정리합니다.
4. `maBlockVersion`과 빠른 입력 재조회는 회귀 테스트를 붙여 낮은 위험으로 정리합니다.
5. Dead Export는 마지막에 제거하고 타입체크/MA 테스트를 실행합니다.

