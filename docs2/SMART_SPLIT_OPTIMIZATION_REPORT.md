# 스마트 스플릿 런치 레디니스 최적화 리포트

작성일: 2026-04-27

## 감사 범위

- React hooks: `hooks/useMultiSplitExecution.ts`, `hooks/multiSplitExecutionShared.ts`
- 공유 계산/I18N: `supabase/functions/_shared/multiSplitShared.ts`, `supabase/functions/_shared/multiSplitExecutionMessages.ts`, `utils/multiSplitCalc.ts`
- UI: `components/Dashboard.tsx`, `components/TradeExecutionModal.tsx`, `utils/dailyExecutionSummary.ts`
- 서버/DB: `supabase/functions/generate-daily-execution-summaries/index.ts`, `services/stockService.ts`

## 요약

스마트 스플릿 계산과 문구 조립은 대부분 공유 순수 함수로 모여 있어 큰 구조는 좋습니다. `useMultiSplitExecution`은 `AbortController`, 요청 ID, 타임아웃 해제를 사용해 기본적인 메모리 누수 방어가 되어 있고, `TradeExecutionModal`의 저장 액션도 `useRef` mutex로 중복 저장을 막고 있습니다.

다만 런치 전 우선 확인할 문제는 3가지입니다.

1. **높음**: 스마트 스플릿 공유 보유 계산이 거래 날짜순을 보장하지 않아 최신순 저장 배열에서 매도 반영이 누락될 수 있습니다.
2. **중간**: `useMultiSplitExecution`의 fetch effect가 동일 cache key에서도 strategy 객체/언어 변경에 의해 in-flight 요청을 불필요하게 취소·재시작할 수 있습니다.
3. **중간**: Edge Function 일별 요약 생성이 사용자/포트폴리오를 완전 순차 처리해 유저 수 증가 시 실행 시간이 커질 수 있습니다.

데드 코드 관점에서 `quarter`, `phase` 등은 검색되었지만, 스마트 스플릿 런타임 찌꺼기가 아니라 광고 상태 머신, 리서치 보드 차트, 테스트 주석/문서에 해당했습니다. 스마트 스플릿 프로덕션 경로에서 제거해야 할 명확한 `phase/quarter-mode` 잔재는 발견하지 못했습니다.

---

## 발견 1. [높음] 스마트 스플릿 보유 계산이 거래 날짜순을 보장하지 않음

### 발견 위치

- `supabase/functions/_shared/multiSplitShared.ts`
  - `calcHoldings(trades: TradeInput[])`
  - `calculateMultiSplitGuideState(...)`
- `hooks/usePortfolioMutations.ts`
  - 신규 거래 저장 시 `trades: [nextTrade, ...portfolio.trades]`
- `hooks/multiSplitExecutionShared.ts`
  - `toTradeInputsForMultiSplit(...)`는 입력 배열 순서를 그대로 보존

### 원인 및 위험성

스마트 스플릿의 `calcHoldings`는 전달받은 `trades` 배열을 그대로 순회합니다. 반면 포트폴리오 저장 경로는 신규 거래를 배열 앞에 붙이는 최신순 저장 구조입니다.

이 조합에서는 아래 상황이 발생할 수 있습니다.

- 실제 시간순: 1월 매수 → 4월 매도
- 저장 배열: 4월 매도 → 1월 매수
- `calcHoldings` 처리: 매도 시점에 보유 맵이 없어 매도를 건너뛰고, 이후 매수만 반영

결과적으로 스마트 스플릿의 `totalInvested`, `currentQuantity`, `avgPrice`, `cashUsagePct`, `isLowBudget`, `isSeedExhausted`, `sellGuide`가 실제 장부보다 크게/작게 왜곡될 수 있습니다. 이 문제는 최근 대화에서 확인한 날짜 역전 매도 문제와 같은 계열입니다.

### 최적화 해결 방안

- `multiSplitShared.ts` 내부에 `getChronologicalTradeInputs` 같은 작은 순수 함수를 추가합니다.
- 기준은 `date` 오름차순이며, 같은 날짜 입력 순서 안정성까지 필요하면 기존 배열 인덱스를 보조 키로 사용합니다.
- `calcHoldings` 시작 지점에서 정렬된 배열을 사용하거나, `calculateMultiSplitGuideState` 진입 전에 정렬합니다.
- 테스트 추가:
  - 최신순 저장 배열(`[sell(4월), buy(1월)]`)에서도 시간순 계산과 동일한 보유 수량/평단이 나와야 합니다.
  - 과거일자 매도가 해당 시점 보유보다 앞서면 무시가 아니라 정책에 맞는 오류/경고로 처리할지 별도 결정이 필요합니다.

---

## 발견 2. [중간] `useMultiSplitExecution` fetch effect가 같은 indicator cache key에서도 취소/재시작될 수 있음

### 발견 위치

- `hooks/useMultiSplitExecution.ts`
  - `useEffect` 의존성: `fetchIndicatorRequirements`, `hasMultiSplitStrategy`, `indicatorCacheKey`, `isDailyBuyAmountValid`, `lang`, `networkSnapshot`, `runtimeStrategy`, `targetStock`
  - effect 내부에서 `previousCacheKeyRef`와 `networkSnapshot`로 reuse 판단
- 비교 대상:
  - `hooks/useNoStopMultiSplitExecution.ts`
  - `networkErrorMsgRef`, `shouldFetchIndicators(...)` 패턴

### 원인 및 위험성

`useMultiSplitExecution`은 네트워크 fetch effect 안에서 `lang`을 에러 토스트 메시지 용도로 직접 참조합니다. 또한 `runtimeStrategy` 객체 자체가 effect 의존성에 들어가 있습니다.

이미 `indicatorCacheKey`가 실제 fetch 입력의 핵심 식별자인데, 같은 cache key라도 아래 상황에서 effect cleanup이 발생할 수 있습니다.

- 언어가 바뀌는 중 in-flight 요청이 있을 때
- 포트폴리오가 갱신되어 `savedStrategy` 객체 참조가 바뀌지만 indicator 요구사항은 동일할 때
- `networkSnapshot`이 아직 `null`인 로딩 중에 상위 props가 재생성될 때

cleanup은 `AbortController.abort()`를 호출하므로, 동일 데이터 요청이 불필요하게 취소되고 다시 시작될 수 있습니다. Toss 미니앱 WebView 환경에서는 네트워크가 느리거나 앱 전환이 잦아 이런 재시작이 체감 지연으로 보일 수 있습니다.

현재 코드가 무한 루프를 만드는 것은 아닙니다. `requestIdRef`, `AbortController`, 타이머 해제는 잘 되어 있습니다. 문제는 누수보다는 **중복 fetch/불필요한 abort** 쪽입니다.

### 최적화 해결 방안

- `useNoStopMultiSplitExecution`처럼 에러 메시지는 `useRef`로 보관하고, fetch effect에서 `lang` 직접 의존성을 제거합니다.
- effect의 실제 fetch 트리거는 `indicatorCacheKey`, `targetStock`, `isDailyBuyAmountValid`, 전략 존재 여부 중심으로 줄입니다.
- `runtimeStrategy` 객체 전체 대신 cache key 또는 primitive 값으로 의존성을 좁힙니다.
- 회귀 테스트:
  - 동일 cache key에서 portfolio 객체만 새로 만들어 rerender해도 in-flight fetch를 재시작하지 않아야 합니다.
  - 언어 변경 중 fetch가 abort/retry되지 않고, 에러 토스트만 최신 언어를 참조해야 합니다.

---

## 발견 3. [중간] Edge Function 일별 요약 생성이 포트폴리오별 완전 순차 처리

### 발견 위치

- `supabase/functions/generate-daily-execution-summaries/index.ts`
  - `serve(...)`
  - `for (const profile of eligibleProfiles)`
  - 내부 `for (const portfolio of userPortfolios)`
  - `buildPortfolioBlock(...)`
  - `getStockSnapshot(...)`, `getStockHistory(...)`

### 원인 및 위험성

현재 Edge Function은 대상 유저를 순회하고, 유저별 포트폴리오도 순차적으로 `await buildPortfolioBlock(...)`합니다. `historyCache`, `snapshotCache`가 전역 Map으로 공유되어 같은 심볼/요구사항 반복 요청은 줄이고 있으므로 단순 N+1은 어느 정도 방지되어 있습니다.

하지만 유저/포트폴리오 수가 늘어나면 전체 실행 시간이 아래 구조로 선형 증가합니다.

- 프로필 1명 처리 완료
- 그 유저의 포트폴리오 1개 처리 완료
- 다음 포트폴리오 처리
- 다음 유저 처리

스마트 스플릿 자체는 보통 대상 종목 1개만 조회하지만, 여러 유저가 다양한 종목을 쓰면 `stock_prices` 조회가 순차로 누적됩니다. Edge Function 실행 시간 제한이나 스케줄 알람 지연으로 이어질 수 있습니다.

### 최적화 해결 방안

- 즉시 전체 병렬화는 권장하지 않습니다. 현재 cache Map은 값 캐시라 동시 miss 시 중복 fetch가 생길 수 있습니다.
- 1차 개선:
  - 유저 단위 또는 포트폴리오 단위 `Promise.all`이 아니라, 작은 concurrency limit(예: 5~10)로 `buildPortfolioBlock`를 처리합니다.
  - `getStockHistory`/`getStockSnapshot`에 in-flight Promise cache를 추가해 동시 요청 중복을 막습니다.
- 2차 개선:
  - `portfolio.strategy.multiSplit.targetStock` 및 indicator requirements를 사전 수집해 unique key 단위로 먼저 snapshot을 준비합니다.
  - 이후 포트폴리오 블록은 준비된 snapshot으로 순수 계산만 수행합니다.

---

## 발견 4. [낮음] `fetchStockPrices`의 batch query 이후 indicator snapshot 보강이 심볼별 병렬 호출

### 발견 위치

- `services/stockService.ts`
  - `fetchStockPrices(symbols, options)`
  - Supabase `.in("symbol", dbMissSymbols)` batch query 이후 `validSymbols.map(...)`에서 `fetchIndicatorAwareSnapshot(...)`를 심볼별 호출

### 원인 및 위험성

기본 가격 조회는 `.in("symbol", dbMissSymbols)`로 묶여 있어 좋습니다. 다만 이후 RSI/MA 보강을 위해 각 심볼마다 `fetchIndicatorAwareSnapshot`을 병렬 호출합니다. 스마트 스플릿 전략 자체는 대상 종목이 하나라 큰 문제는 아니지만, 대시보드 지표/보유 종목이 많아지면 각 심볼별 IndexedDB/Supabase fallback이 늘 수 있습니다.

현재는 memory cache, IndexedDB cache, Supabase fallback이 있어 즉각적인 서버 abuse로 보기는 어렵습니다. 다만 런치 이후 보유 종목 수가 많은 포트폴리오에서 초기 진입 시 burst 형태의 요청이 발생할 수 있습니다.

### 최적화 해결 방안

- 스마트 스플릿 단일 대상 경로는 현상 유지 가능.
- 대시보드 전체 보유 평가 경로에서 문제가 관측되면:
  - indicator snapshot 요구사항을 심볼별로 모아 한 단계에서 prefetch
  - 같은 cache key에 대한 in-flight Promise dedupe 추가
  - fetch 동시성 제한 적용

---

## 문제없음으로 확인한 영역

### 메모리 누수 방어

- `hooks/useMultiSplitExecution.ts`
  - `AbortController` 사용
  - `window.setTimeout` 해제
  - `requestIdRef`로 stale response 차단
- `Dashboard.tsx`
  - MA/metrics 비동기 effect에서 `isMounted`와 `AbortController` 사용
- `TradeExecutionModal.tsx`
  - 저장 중복 방지를 위한 `isExecutingTradeRef` mutex 사용

즉, 스마트 스플릿 주요 런타임 경로에서 명확한 unmounted state update 누수는 발견하지 못했습니다.

### 공유 문구/I18N

- 스마트 스플릿 일별 실행 문구는 `multiSplitExecutionMessages.ts`로 모여 있고, `Dashboard`, `TradeExecutionModal`, `dailyExecutionSummary`, 서버 summary 경로가 같은 builder를 사용합니다.
- 최근 추가된 `매수금 부족`, 첫 매수 안내, `위험 관리 손절`도 공유 builder를 통해 노출됩니다.

### Legacy `phase` / `quarter-mode` 잔재

- 검색 결과 `phase`는 광고 preload 상태 머신 또는 테스트 주석에서 발견되었습니다.
- `quarter`는 리서치 보드 차트 데이터에서 발견되었습니다.
- 스마트 스플릿 런타임에 남은 `quarter-mode`, 구형 phase 전략 상태 필드는 확인되지 않았습니다.

---

## 권장 수정 순서

1. **거래 날짜순 정렬 보장**  
   스마트 스플릿 보유 계산의 정확성 문제라 가장 먼저 처리해야 합니다.

2. **`useMultiSplitExecution` fetch effect 안정화**  
   `useNoStopMultiSplitExecution`의 패턴을 참고해 동일 cache key에서 불필요한 abort/retry를 줄입니다.

3. **Edge Function 처리량 개선 설계**  
   런치 직후 트래픽 규모를 보고, 필요하면 concurrency limit + in-flight cache를 적용합니다.

4. **stock snapshot batch/prefetch 관측 후 개선**  
   실제 사용량 로그에서 burst 요청이 확인될 때 적용해도 늦지 않습니다.

