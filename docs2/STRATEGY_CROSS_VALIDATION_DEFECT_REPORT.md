---
name: 전략 간 교차 검증 및 구조적 결함 색출 리포트
overview: MA 최적화에서 발견한 5가지 안티패턴을 기준으로 MA 외 전략과 공통 가격/요약 경로를 대조 점검한 결과입니다.
stage: pre-launch-audit
status: draft
---

# 전략 간 교차 검증 및 구조적 결함 색출 리포트

## 감사 범위

MA 전략에서 이미 수정한 패턴은 제외하고, 다른 전략과 공통 경로를 중심으로 확인했습니다.

- 클라이언트/UI: `components/Dashboard.tsx`, `components/TradeExecutionModal.tsx`, `components/QuickInputModal.tsx`, `components/portfolioDetails/usePortfolioDetailsController.ts`, `hooks/useMultiSplitExecution.ts`, `hooks/useNoStopMultiSplitExecution.ts`
- 공통 가격 서비스: `services/stockService.ts`, `utils/portfolioCalculations.ts`
- 서버/Edge Function: `supabase/functions/generate-daily-execution-summaries/index.ts`, `supabase/functions/refresh-vr-snapshots`, `supabase/functions/_shared/*`
- 대상 전략: 스마트 스플릿, 무손절 스마트 스플릿, VR/TVC

## 결론

**치명적 결함은 발견되지 않았습니다.** 특히 Edge 일별 요약 경로는 최근 MA 최적화의 효과로 히스토리 선로딩 상한, 요구사항 기반 지표 수집, in-flight 캐시가 대부분 공통 적용되어 있습니다.

다만 MA와 같은 유형의 구조적 비용이 **클라이언트 공통 가격 서비스와 스마트 스플릿/무손절 모달 경로**에 남아 있습니다. 출시 전 필수 차단 이슈는 아니지만, 트래픽과 포트폴리오 수가 늘면 체감 성능과 Supabase 비용에 영향을 줄 수 있습니다.

## 발견된 문제점

### 1. [High] 공통 가격 조회에서 `stock_prices` 다심볼 조회 상한이 없습니다

발견 위치:

- `services/stockService.ts`의 `fetchStockPrices`
- `services/stockService.ts`의 `fetchStockPricesWithPrev`
- 호출 예: `App.tsx`의 전체 평가액 계산, `utils/portfolioCalculations.ts`의 포트폴리오 메트릭, `components/portfolioDetails/usePortfolioDetailsController.ts`

원인 및 위험성:

- Edge Function의 `preloadStockHistoryCache`는 심볼별 `.limit(260)` 상한이 적용되어 있습니다.
- 반면 클라이언트 공통 서비스의 다심볼 조회는 `.in("symbol", symbols)` 후 `trade_date` 정렬만 하고 심볼별 최신 2행 또는 260행 상한을 DB 레벨에서 강제하지 않습니다.
- 특히 `fetchStockPricesWithPrev`는 현재가와 전일가 2개만 필요하지만, DB에는 해당 심볼의 전체 히스토리 행이 반환될 수 있습니다.
- 보유 종목 수가 늘거나 캐시 미스가 많은 신규 사용자에서는 불필요한 row 전송과 브라우저 후처리가 증가합니다.

권장 수정 방안:

- `fetchStockPricesWithPrev`는 심볼별 최신 2행만 가져오도록 RPC, 뷰, 또는 심볼 단위 제한 쿼리 + 제한 동시성으로 변경합니다.
- `fetchStockPrices`는 가격 스냅샷용 조회와 히스토리/지표 조회를 분리하고, DB miss 경로에서도 심볼별 필요한 행 수를 명시합니다.
- Edge의 `STOCK_HISTORY_PRELOAD_MAX_ROWS`처럼 클라이언트 가격 서비스에도 목적별 상한 상수를 둡니다.

### 2. [Medium] 가격만 필요한 경로에서도 RSI/MA 지표 스냅샷이 붙습니다

발견 위치:

- `services/stockService.ts`의 `fetchStockPrices`
- `utils/portfolioCalculations.ts`의 `buildPortfolioMetricsSnapshot`
- `components/portfolioDetails/usePortfolioDetailsController.ts`

원인 및 위험성:

- `fetchStockPrices`는 DB miss가 발생하면 `fetchIndicatorAwareSnapshot(symbol, STOCK_DATA_INDICATOR_REQUIREMENTS, ...)`를 호출합니다.
- `STOCK_DATA_INDICATOR_REQUIREMENTS`는 RSI와 MA 20/60/120을 고정 요구합니다.
- 그러나 포트폴리오 평가액, 상세 화면 보유 평가, 전체 평가액 계산은 대부분 현재가와 전일가만 필요합니다.
- 사용자가 스마트 스플릿/무손절에서 RSI나 정배열 조건을 꺼둔 경우에도, 공통 가격 경로가 별도로 표준 지표를 채우는 구조라 MA에서 발견했던 "비활성 지표 로딩"과 같은 유형의 비용이 남습니다.

권장 수정 방안:

- `fetchStockPrices`에 `indicatorRequirements` 또는 `mode: 'price-only' | 'with-standard-indicators'` 옵션을 추가합니다.
- 평가액/보유 상세/전체 평가액 경로는 price-only를 사용합니다.
- 전략 지표가 필요한 경로는 이미 `collectIndicatorRequirements`로 요구사항을 좁히는 `fetchIndicatorAwareSnapshot`을 직접 사용하도록 유지합니다.

### 3. [Medium] 매매 입력 모달에서 스마트 스플릿/무손절 실행 훅이 중복 실행됩니다

발견 위치:

- `components/Dashboard.tsx`의 카드 렌더링 경로
- `components/TradeExecutionModal.tsx`의 `useMultiSplitExecution`, `useNoStopMultiSplitExecution`

원인 및 위험성:

- 대시보드 카드가 이미 스마트 스플릿/무손절 실행 데이터를 계산하고 있습니다.
- 매매 입력 모달을 열면 `TradeExecutionModal` 내부에서 같은 포트폴리오에 대해 동일 훅을 다시 생성합니다.
- 훅 인스턴스가 분리되어 있어 같은 `indicatorCacheKey`라도 모달 오픈 시점에 `fetchIndicatorAwareSnapshot` 요청이 한 번 더 발생할 수 있습니다.
- in-flight 캐시가 서비스 레벨에서 막아주더라도, 훅 상태와 effect 실행은 중복됩니다.

권장 수정 방안:

- 카드에서 계산한 `multiSplitExecutionData`/`noStopExecutionData`를 모달로 전달하거나, 포트폴리오 단위 실행 데이터를 상위 컨텍스트/캐시로 공유합니다.
- 우선순위가 낮은 안전한 접근은 `TradeExecutionModal`에서 가이드 라인이 꼭 필요한 전략일 때만 훅을 호출하도록 분기하는 것입니다.

### 4. [Low] `useMultiSplitExecution`은 스냅샷 확정 후 effect가 한 번 더 실행됩니다

발견 위치:

- `hooks/useMultiSplitExecution.ts`

원인 및 위험성:

- `useEffect` 의존성 배열에 `networkSnapshot`이 포함되어 있습니다.
- 요청 성공 후 `setNetworkSnapshot`이 실행되면 effect가 재실행되고, 내부의 `shouldReuseResolvedSnapshot` 조건으로 fetch는 막지만 effect cleanup과 조기 return이 추가로 발생합니다.
- 무손절 훅은 `resolvedSnapshotCacheKeyRef`를 사용해 이 패턴을 더 좁게 제어하고 있어 두 훅 간 구조가 불일치합니다.

권장 수정 방안:

- `useNoStopMultiSplitExecution`처럼 resolved cache key ref를 별도로 두고 `networkSnapshot`을 effect 의존성에서 제거할 수 있는지 검토합니다.
- 같은 키에 대한 "데이터 존재 확인 후 skip" 원칙은 유지해야 합니다.

### 5. [Low] 무손절 훅의 indicator fetch 트리거 분기가 실제 사용과 맞지 않습니다

발견 위치:

- `hooks/useNoStopMultiSplitExecution.ts`의 `shouldFetchIndicators`

원인 및 위험성:

- `IndicatorFetchTrigger`는 `draft-change`, `step-submit`, `saved-strategy-mount`를 정의합니다.
- 현재 effect에서는 `saved-strategy-mount`만 전달하고 있어 `draft-change` 분기는 사실상 도달하지 않습니다.
- 런타임 비용은 작지만, 전략 훅을 비교하거나 유지보수할 때 실제 동작보다 넓은 모델을 암시합니다.

권장 수정 방안:

- 현재 훅 사용처 기준으로 트리거 타입과 분기를 단순화합니다.
- 전략 생성 드래프트 단계에서 이 helper를 재사용할 계획이 없다면 dead branch로 정리합니다.

## 체크리스트별 판정

### 1. 무제한 DB 조회

- Edge 일별 요약: **통과**. `generate-daily-execution-summaries`의 `preloadStockHistoryCache`는 심볼별 최대 260행 상한과 제한 동시성을 사용합니다.
- VR/TVC 스냅샷 갱신: **통과**. `refresh-vr-snapshots` 계열은 `stock_prices` 히스토리 조회 경로가 아닙니다.
- 클라이언트 공통 가격 서비스: **개선 필요**. `fetchStockPrices`, `fetchStockPricesWithPrev`의 다심볼 조회는 필요한 최신 행 수만 DB 레벨에서 제한하는 구조가 아닙니다.

### 2. 사용하지 않는 데이터의 불필요한 로딩

- 스마트 스플릿/무손절 전용 지표 훅: **통과**. `collectIndicatorRequirements`는 `rsiRule`과 `alignmentRule`이 있을 때만 지표 요구사항을 만듭니다.
- 공통 평가액/상세 가격 로딩: **개선 필요**. 가격만 필요한 경로에서도 `fetchStockPrices`가 표준 RSI/MA 스냅샷을 붙일 수 있습니다.

### 3. 서버 측 중복 연산

- Edge 일별 요약: **통과**. `historyCache`, `historyInflightCache`, `snapshotCache`, `snapshotInflightCache`로 동일 심볼/요구사항 중복 조회를 억제합니다.
- 스마트 스플릿/무손절 지표 요구: **통과**. 비활성 RSI/정배열 조건은 요구사항에 포함되지 않습니다.
- 주의점: 향후 260일을 초과하는 지표 요구가 생기면 프리로드 캐시와 개별 `getStockHistory` fallback 정책을 함께 재검토해야 합니다.

### 4. 불필요한 리렌더링 및 콜백 호출

- `Dashboard`의 `onDailyExecutionBlock`: **통과**. 동일 블록 문자열이면 `lastDailyExecutionBlockRef`로 상위 콜백을 생략합니다.
- `useMultiSplitExecution`: **경미한 개선 필요**. 스냅샷 확정 후 effect가 한 번 더 실행되는 구조가 남아 있습니다.

### 5. 빠른 입력 모달의 재계산 이슈

- MA 빠른 입력: **통과**. 이미 계산된 `maActiveSection`을 우선 재사용합니다.
- 스마트 스플릿/무손절 매매 입력 모달: **개선 필요**. 카드에서 계산한 실행 데이터를 모달에서 재사용하지 않고, 모달 내부 훅이 같은 계산/조회 파이프라인을 다시 탑니다.
- VR 주문 모달: **통과**. `VrOrderModal`은 전달받은 주문 배열을 표시하며 오픈 시 별도 가격/지표 API를 호출하지 않습니다.

## 전략별 요약

### 스마트 스플릿

- 지표 요구 수집은 정상입니다. RSI 규칙이 없으면 RSI를 요구하지 않고, 정배열 규칙이 없으면 MA 기간도 비웁니다.
- 개선 후보는 `TradeExecutionModal`에서 카드와 동일한 실행 훅을 다시 호출하는 부분입니다.
- `useMultiSplitExecution`의 effect 의존성은 무손절 훅과 맞춰 정리할 가치가 있습니다.

### 무손절 스마트 스플릿

- 지표 요구 수집과 Edge 일별 요약 경로는 정상입니다.
- 모달 중복 훅 문제는 스마트 스플릿과 동일하게 적용됩니다.
- `shouldFetchIndicators`의 미사용 트리거 분기는 기능 결함은 아니지만, 출시 후 유지보수 전에 정리할 수 있습니다.

### VR/TVC

- Edge 스냅샷 갱신과 일별 요약은 `stock_prices` 히스토리 무제한 조회 패턴에 해당하지 않습니다.
- 주문 모달은 전달받은 스냅샷/주문 데이터를 사용하므로 빠른 입력 재조회 문제는 확인되지 않았습니다.
- 다만 전체 평가액과 보유 상세처럼 공통 가격 서비스를 타는 화면에서는 `fetchStockPrices`의 price-only 분리 효과를 같이 받습니다.

## 권장 수정 우선순위

1. `services/stockService.ts`에서 price-only 조회 경로를 분리하고, `fetchStockPricesWithPrev`에 심볼별 최신 2행 상한을 적용합니다.
2. `TradeExecutionModal`이 대시보드 카드의 스마트 스플릿/무손절 실행 데이터를 재사용하도록 props 또는 상위 캐시 구조를 설계합니다.
3. `useMultiSplitExecution`의 effect 의존성과 resolved cache key 처리를 무손절 훅과 맞춰 정리합니다.
4. `useNoStopMultiSplitExecution`의 미사용 트리거 분기를 제거하거나 실제 사용처가 있는 이름으로 축소합니다.

## 최종 판정

- 출시 차단 수준의 P0/P1 결함: **없음**
- 출시 전 선택 개선 가치가 큰 항목: **공통 가격 서비스의 조회 상한 및 price-only 분리**
- 출시 후 기술부채로 넘겨도 되는 항목: **무손절 트리거 분기 정리, 스마트 스플릿 effect 미세 최적화**
