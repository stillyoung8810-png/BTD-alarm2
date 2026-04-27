# No-Stop Multi-Split Pre-Launch Audit

## 1. Executive Summary

이번 감사는 무손절 다분할(No-Stop Multi-Split)의 **수학/금융 계산식은 변경하지 않는 전제**로, 출시 전 정리 가치가 있는 최적화 항목만 확인했다. 핵심 결론은 다음과 같다.

- **Critical 수준의 계산 오류나 UI 붕괴 위험은 발견하지 못했다.** 현재 `calculateNoStopExecution` -> `useNoStopMultiSplitExecution` -> `Dashboard`/요약 빌더 경로는 display-safe 데이터(`displayLowLoc`, `displayMocBuy`) 중심으로 정리되어 있다.
- 출시 전 바로 정리할 가치가 가장 큰 영역은 **네트워크 중복 요청 방지**다. `fetchIndicatorAwareSnapshot`은 memory/IndexedDB cache를 사용하지만, 동일 `cacheKey`에 대한 **동시 실행 중인 Promise를 공유하지 않는다.** 여러 카드/모달/React Strict Mode 타이밍이 겹치면 같은 스냅샷을 중복으로 조회할 수 있다.
- 두 번째 우선순위는 **디버그 로그 제거 이후 남은 의존성/레거시 API 잔재 정리**다. `hooks/useNoStopMultiSplitExecution.ts`에는 더 이상 effect 내부에서 쓰지 않는 `portfolio.id`, `portfolio.name` 의존성이 남아 있고, shared 엔진에는 구형 `lowLoc/highLoc` preview API가 공식 엔진과 공존한다.
- React 렌더링 관점에서는 대규모 리렌더 폭탄은 보이지 않지만, `Dashboard`의 공통 summary input이 전략별로 필요 없는 dependency까지 끌고 가는 구조가 있다. 전략별 요약 VM을 분리하면 no-stop 카드의 불필요한 재계산을 줄일 수 있다.

### Improved Audit Method

원 프롬프트는 타깃 범위가 넓어 실제 수정까지 끌고 갈 위험이 있었다. 더 안전한 접근은 다음 순서다.

1. **No-stop 공식 경로만 먼저 고정:** `calculateNoStopExecution`, `useNoStopMultiSplitExecution`, `buildNoStopExecutionSummaryLines`, `fetchIndicatorAwareSnapshot`
2. **레거시/테스트 전용 경로 분리:** `calcNoStopMultiSplitOrders`, `NoStopMultiSplitParams`
3. **최적화는 관측 가능한 비용부터:** 중복 fetch, dependency 과팽창, dead export 순서

이 문서는 실제 `.ts`/`.tsx` 소스 코드를 수정하지 않고, 후속 리팩토링 계획과 후보 스니펫만 제시한다.

## 2. Identified Issues & Solutions

### A. Dead Code & Memory Leaks

#### A-1. Debug log 제거 후 남은 불필요한 Hook dependency

- **위치:** `hooks/useNoStopMultiSplitExecution.ts`
- **심각도:** Medium
- **유형:** Dead dependency / unnecessary effect invalidation
- **증상:** fetch effect 내부에서 `portfolio.id`, `portfolio.name`을 더 이상 사용하지 않지만 dependency array에는 남아 있다. 디버그 로그 제거 전에는 로그 payload에 필요했지만, 현재는 effect 재실행 조건을 불필요하게 넓힌다.
- **영향:** 포트폴리오 이름만 바뀌어도 no-stop indicator fetch effect가 cleanup/re-run될 수 있다. 실제 fetch는 cache key와 snapshot 상태로 일부 막히지만, effect lifecycle 비용은 남는다.

현재 형태:

```ts
useEffect(() => {
  // fetch lifecycle
}, [
  fetchIndicatorRequirements,
  indicatorCacheKey,
  isDailyBuyAmountValid,
  isNoStopMultiSplit,
  networkSnapshot,
  portfolio.id,
  portfolio.name,
  targetStock,
]);
```

권장 수정:

```ts
useEffect(() => {
  // fetch lifecycle
}, [
  fetchIndicatorRequirements,
  indicatorCacheKey,
  isDailyBuyAmountValid,
  isNoStopMultiSplit,
  networkSnapshot,
  targetStock,
]);
```

검증:

- `utils/noStopMultiSplitCrossValidation.test.ts`
- 포트폴리오 이름만 변경하는 rerender 테스트를 추가해 `fetchIndicatorAwareSnapshot` 호출 수가 증가하지 않는지 확인

#### A-2. Legacy no-stop order preview API가 공식 엔진과 같은 파일에 공존

- **위치:** `supabase/functions/_shared/noStopMultiSplitShared.ts`
- **심각도:** Medium
- **유형:** 이전 아키텍처 잔재 / public API surface 확장
- **증상:** 현재 공식 no-stop 경로는 `NoStopMultiSplitStrategy` + `calculateNoStopExecution` + `displayLowLoc/displayMocBuy`다. 같은 파일 하단에는 구형 `NoStopMultiSplitParams`, `calcNoStopMultiSplitOrders`, `calculateNoStopMultiSplitState`, `lowLoc/highLoc` 모델이 남아 있다.
- **영향:** 신규 구현자가 어떤 엔진이 공식인지 혼동할 수 있고, `utils/noStopMultiSplitCalc.ts`가 `export *`로 전체를 다시 노출해 레거시 API가 계속 퍼진다.

현재 레거시 예:

```ts
export interface NoStopMultiSplitParams {
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
}

export interface NoStopMultiSplitExecutionData {
  currentRound: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: NoStopOrderEntry;
  highLoc?: NoStopOrderEntry;
  takeProfit?: NoStopOrderEntry;
}
```

권장 해결책:

1. 출시 전 최소 조치: JSDoc을 강화해 `@deprecated` 또는 `Legacy` 용도를 명시한다.
2. 후속 조치: `legacyNoStopOrderPreview.ts` 같은 별도 파일로 분리한다.
3. 마지막 조치: 테스트와 Backtest 필요 여부를 확인한 뒤 공식 export에서 제거한다.

후보 스니펫:

```ts
/**
 * @deprecated Legacy 2-LOC preview model. The production no-stop flow uses
 * calculateNoStopExecution with displayLowLoc/displayMocBuy.
 */
export interface LegacyNoStopMultiSplitParams {
  // same fields
}
```

#### A-3. `NoStopMultiSplitExecutionData` 이름이 서로 다른 의미로 중복 사용됨

- **위치:** `supabase/functions/_shared/noStopMultiSplitShared.ts`, `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`
- **심각도:** Medium
- **유형:** 타입명 충돌 / cognitive overhead
- **증상:** shared 엔진의 `NoStopMultiSplitExecutionData`는 구형 `lowLoc/highLoc` 모델이고, summary 계층의 `NoStopMultiSplitExecutionData`는 `NoStopExecutionSummaryData`를 확장한 표시 DTO다.
- **영향:** import 실수나 리뷰 혼동 가능성이 있다. 특히 no-stop 리브랜딩/일반 다분할 확장 시 타입 이름만 보고 의미를 판단하기 어렵다.

권장 해결책:

```ts
// summary 계층
export interface NoStopExecutionSummaryViewModel
  extends NoStopExecutionSummaryData {
  currentRound: number;
}

// shared legacy 계층
export interface LegacyNoStopOrderPreviewData {
  currentRound: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: NoStopOrderEntry;
  highLoc?: NoStopOrderEntry;
  takeProfit?: NoStopOrderEntry;
}
```

#### A-4. No-stop 문구가 여러 사전에 중복 존재

- **위치:** `supabase/functions/_shared/noStopExecutionMessages.ts`, `constants.tsx`
- **심각도:** Low-Medium
- **유형:** i18n 중복 / 문구 drift
- **증상:** `noStopExecutionMessages.ts`의 분할 완료 문구와 `constants.tsx`의 `noStopSplitComplete` 문구가 다르다. 한쪽은 "보유와 익절", 다른 쪽은 "보유(존버)와 익절"을 사용한다.
- **영향:** 대시보드/알림/레거시 UI가 서로 다른 톤을 보여줄 수 있다.

권장 해결책:

- 실행 요약은 `noStopExecutionMessages.ts`를 SSOT로 유지한다.
- `constants.tsx`의 레거시 no-stop 문구가 실제 사용 중인지 확인한 뒤 삭제 또는 alias화한다.
- 테스트 문자열은 가능한 `getNoStopExecutionMessages`와 `formatNoStopProgressText`로 생성한다.

### B. React Rendering Performance

#### B-1. `networkSnapshot` dependency로 fetch effect가 성공 직후 한 번 더 돈다

- **위치:** `hooks/useNoStopMultiSplitExecution.ts`
- **심각도:** Medium
- **유형:** effect lifecycle overhead
- **증상:** fetch 성공 후 `setNetworkSnapshot(snapshotData)`가 실행되면 `networkSnapshot` dependency 변화로 effect가 다시 실행된다. 두 번째 실행은 `shouldReuseResolvedSnapshot`에서 바로 return되지만, cleanup과 effect 진입 비용은 발생한다.
- **현재 안전장치:** request id와 AbortController가 있어 stale fetch가 UI를 덮어쓰는 위험은 낮다.
- **개선 방향:** "동일 cache key에 대해 이미 resolved snapshot이 있는지"를 state dependency 대신 ref로 추적하면 성공 직후 재진입을 줄일 수 있다.

후보 스니펫:

```ts
const resolvedSnapshotCacheKeyRef = useRef<string | null>(null);

// success path
resolvedSnapshotCacheKeyRef.current = nextCacheKey;
setSnapshotFetchStatus('ready');
setNetworkSnapshot(snapshotData);

// effect guard
if (resolvedSnapshotCacheKeyRef.current === nextCacheKey && networkSnapshot != null) {
  return;
}
```

주의:

- Rule 11에 따라 "cache key만 같으면 skip"은 금지다. 반드시 `networkSnapshot != null` 같은 실제 payload 존재 확인과 같이 써야 한다.
- 이 변경은 UX 영향이 있으므로 테스트를 먼저 추가한다.

#### B-2. Dashboard summary memo가 no-stop에 불필요한 `portfolio.trades` dependency까지 포함

- **위치:** `components/Dashboard.tsx`
- **심각도:** Low-Medium
- **유형:** dependency 과팽창 / summary recomputation
- **증상:** `PortfolioExecutionSummaryInput`은 VR summary 때문에 `trades`를 포함한다. 그러나 no-stop summary는 `noStopExecutionData`만 사용한다. 현재 `executionSummary` memo dependency에는 `portfolio.trades`가 항상 들어가므로, no-stop 카드에서도 trades reference 변화가 summary 재계산을 유발한다.
- **영향:** 카드 수가 많고 거래 입력이 잦을 때 summary render 비용이 증가한다. 현재는 치명적이지 않지만 출시 전 구조 정리 가치가 있다.

권장 해결책:

- 전략별 summary input을 분리한다.
- 최소 수정으로는 `buildPortfolioExecutionSummary` 호출 전에 strategy별 VM을 구성해 해당 전략에 필요한 dependency만 포함한다.

후보 스니펫:

```ts
const executionSummary = useMemo(() => {
  if (strategyKind === 'no_stop_multi_split') {
    return renderNoStopExecutionSummary({
      lang,
      copy,
      noStopStatus,
      noStopExecutionData,
    });
  }

  return buildPortfolioExecutionSummary(/* existing */);
}, [lang, copy, strategyKind, noStopStatus, noStopExecutionData /* ... */]);
```

#### B-3. TradeExecutionModal이 smart split/no-stop 훅을 모두 호출함

- **위치:** `components/TradeExecutionModal.tsx`
- **심각도:** Low-Medium
- **유형:** unnecessary hook work / possible duplicate snapshot timing
- **증상:** `useMultiSplitExecution(portfolio, lang)`와 `useNoStopMultiSplitExecution(portfolio, lang)`를 모달에서 항상 호출한다. 각 훅 내부에서 전략 부재를 처리하므로 기능 문제는 작지만, 모달이 Dashboard와 동시에 열려 있으면 no-stop 스냅샷 계산 훅이 두 곳에서 동시에 동작할 수 있다.
- **영향:** in-flight dedupe가 없는 현재 service 구조에서는 같은 스냅샷 요청이 겹칠 가능성이 있다.

권장 해결책:

- hook을 조건부 호출하지 말고, 전략별 guide subcomponent로 분리한다.
- no-stop 모달 가이드 컴포넌트만 `useNoStopMultiSplitExecution`을 호출하게 한다.

후보 구조:

```tsx
function NoStopGuideLines(props: { portfolio: Portfolio; lang: AppLang }) {
  const noStopExecution = useNoStopMultiSplitExecution(props.portfolio, props.lang);
  return buildNoStopExecutionSummaryLines(/* ... */);
}
```

### C. Network & API Inefficiency

#### C-1. `fetchIndicatorAwareSnapshot`에 in-flight request dedupe가 없음

- **위치:** `services/stockService.ts`
- **심각도:** High
- **유형:** duplicate network/API work
- **증상:** memory cache와 IndexedDB cache는 "완료된 결과"만 저장한다. 같은 `cacheKey`에 대해 두 호출이 거의 동시에 들어오면 첫 호출이 cache를 쓰기 전까지 두 번째 호출도 Supabase/IndexedDB 경로를 따로 진행할 수 있다.
- **발생 가능 시나리오:**
  - Dashboard 카드와 TradeExecutionModal이 동시에 같은 no-stop 전략 스냅샷을 요청
  - React Strict Mode 개발 환경에서 mount/unmount/remount 타이밍이 겹침
  - 여러 포트폴리오가 같은 ticker/indicator requirements를 사용

권장 해결책:

- `cacheKey` 단위 in-flight Promise map을 추가한다.
- 성공/실패 모두 `finally`에서 map을 정리한다.
- AbortSignal이 서로 다를 수 있으므로, 첫 단계는 **signal이 없는 요청 또는 동일 signal 없는 service-level 요청만 dedupe**하는 보수적 정책이 안전하다. 더 적극적으로 하려면 abort propagation 정책을 별도로 설계한다.

후보 스니펫:

```ts
const indicatorSnapshotInflightRequests = new Map<
  string,
  Promise<ServiceResult<NoStopIndicatorSnapshot | null>>
>();

export async function fetchIndicatorAwareSnapshot(
  symbol: string,
  requirements: IndicatorRequirements,
  options: StockQueryOptions = {},
): Promise<ServiceResult<NoStopIndicatorSnapshot | null>> {
  const trimmedSymbol = normalizeTickerSymbol(symbol);
  const normalizedRequirements = normalizeIndicatorRequirements(requirements);
  const cacheKey = buildIndicatorRequirementCacheKey({
    symbol: trimmedSymbol,
    requirements: normalizedRequirements,
  });

  if (options.signal == null) {
    const inflight = indicatorSnapshotInflightRequests.get(cacheKey);
    if (inflight != null) {
      return inflight;
    }
  }

  const request = fetchIndicatorAwareSnapshotInternal(
    trimmedSymbol,
    normalizedRequirements,
    cacheKey,
    options,
  );

  if (options.signal == null) {
    indicatorSnapshotInflightRequests.set(cacheKey, request);
    request.finally(() => {
      indicatorSnapshotInflightRequests.delete(cacheKey);
    });
  }

  return request;
}
```

테스트 아이디어:

```ts
it('dedupes concurrent indicator snapshot requests by cache key', async () => {
  const [left, right] = await Promise.all([
    fetchIndicatorAwareSnapshot('TQQQ', requirements),
    fetchIndicatorAwareSnapshot('tqqq', requirements),
  ]);

  expect(left.ok).toBe(true);
  expect(right.ok).toBe(true);
  expect(supabaseFrom).toHaveBeenCalledTimes(1);
});
```

#### C-2. `fetchStockPrices` DB miss 후 indicator snapshot을 다시 요청하는 이중 경로

- **위치:** `services/stockService.ts`
- **심각도:** Medium
- **유형:** duplicated data path
- **증상:** `fetchStockPrices`는 DB miss symbol에 대해 Supabase에서 최신 가격 행을 가져온 뒤, 다시 `fetchIndicatorAwareSnapshot`을 호출해 지표 스냅샷을 보강한다. 이때 `fetchIndicatorAwareSnapshot`이 full history를 다시 조회할 수 있다.
- **영향:** 최초 로딩/캐시 miss 시 네트워크 및 IndexedDB 작업량이 늘어난다.
- **권장 해결책:** 기능 안전을 우선하면 C-1 in-flight dedupe를 먼저 적용한다. 그 후 `fetchStockPrices`에서 이미 가져온 rows를 indicator snapshot 경로에 preloaded data로 넘길 수 있는지 별도 설계한다.

주의:

- price-only snapshot과 RSI/MA snapshot은 필요한 history 길이가 다르므로 단순 병합은 위험하다.
- 수학/지표 계산 경로는 변경하지 않는 것이 이번 감사의 전제다.

#### C-3. IndexedDB readiness check가 snapshot 요청마다 수행됨

- **위치:** `services/stockService.ts`
- **심각도:** Low-Medium
- **유형:** repeated setup work
- **증상:** `fetchIndicatorAwareSnapshot`은 매 호출마다 `isIndicatorSnapshotDatabaseReady()`를 통해 `initDatabase()`를 timeout wrapper로 호출한다.
- **권장 해결책:** DB readiness Promise를 module-level로 캐시하되, 실패 시 재시도 가능하도록 `finally`/error reset 정책을 둔다.

후보 스니펫:

```ts
let indicatorDatabaseReadyPromise: Promise<boolean> | null = null;

function getIndicatorDatabaseReady(): Promise<boolean> {
  if (indicatorDatabaseReadyPromise != null) {
    return indicatorDatabaseReadyPromise;
  }

  indicatorDatabaseReadyPromise = isIndicatorSnapshotDatabaseReady().catch(() => false);
  return indicatorDatabaseReadyPromise;
}
```

## 3. Refactoring Action Plan

### Step 0. Baseline verification

목표: 문서 작성 이후 실제 리팩토링 전 현재 동작 기준선을 잡는다.

- 실행:
  - `yarn vitest run utils/noStopMultiSplitCalc.test.ts utils/noStopMultiSplitCrossValidation.test.ts utils/stockService.test.ts components/Dashboard.test.tsx`
- 확인:
  - no-stop 계산/훅/서비스/대시보드 테스트가 모두 green
  - 현재 working tree에 다른 사용자 변경이 있는지 확인

### Step 1. Safe dead dependency cleanup

목표: 동작에 영향이 없는 dependency 잔재부터 제거한다.

- `hooks/useNoStopMultiSplitExecution.ts`
  - fetch effect dependency array에서 미사용 `portfolio.id`, `portfolio.name` 제거
- 테스트:
  - `utils/noStopMultiSplitCrossValidation.test.ts`
  - 필요 시 rerender 기반 호출 수 테스트 추가

### Step 2. Network in-flight dedupe

목표: 같은 no-stop indicator snapshot 요청이 동시에 들어올 때 중복 Supabase/IndexedDB 작업을 줄인다.

- `services/stockService.ts`
  - `cacheKey` 단위 `indicatorSnapshotInflightRequests` 추가
  - abort signal 정책은 보수적으로 시작: `options.signal == null` 요청부터 dedupe
  - 이후 훅 호출부까지 dedupe하려면 abort 정책 별도 설계
- 테스트:
  - `utils/stockService.test.ts`에 concurrent request 테스트 추가
  - 실패 요청 후 map cleanup 확인

### Step 3. React summary dependency split

목표: no-stop 카드가 VR/MA/Smart Split 전용 dependency 변화에 덜 민감하도록 한다.

- `components/Dashboard.tsx`
  - `PortfolioExecutionSummaryInput`을 strategy별 input으로 분리
  - `renderNoStopExecutionSummary` 호출 경로는 `noStopStatus`, `noStopExecutionData`, `lang`, `copy`만 dependency로 유지
- 테스트:
  - `components/Dashboard.test.tsx`
  - no-stop 카드에서 trade reference만 바뀌는 경우 summary가 불필요하게 재생성되지 않는지 필요 시 profiler/spy test

### Step 4. Legacy no-stop API boundary cleanup

목표: 공식 엔진과 구형 preview API의 혼동을 줄인다.

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
  - `NoStopMultiSplitParams`, `NoStopMultiSplitExecutionData`, `calcNoStopMultiSplitOrders`, `calculateNoStopMultiSplitState`에 `Legacy`/`@deprecated` 명시
  - 가능하면 별도 legacy 파일로 분리
- `utils/noStopMultiSplitCalc.ts`
  - `export *`를 named export로 좁힐지 검토
- 테스트:
  - `utils/noStopMultiSplitCalc.test.ts`
  - import 경로 변경 시 전체 typecheck

### Step 5. i18n/message consolidation

목표: no-stop 실행 문구를 하나의 source로 통합한다.

- `supabase/functions/_shared/noStopExecutionMessages.ts`를 실행 요약 SSOT로 유지
- `constants.tsx`의 no-stop legacy 문구 사용처를 검색 후 제거/alias 결정
- 문자열 테스트는 hardcoded Korean text보다 message builder 기반 expectation으로 교체

## 4. Risk Notes

- 이번 감사에서 제안한 변경 중 **Step 1은 low risk**, **Step 2는 medium risk**, **Step 3~5는 구조 변경이므로 medium risk**다.
- `fetchIndicatorAwareSnapshot` dedupe는 가장 효과가 크지만 AbortSignal 정책을 잘못 잡으면 취소된 요청이 다른 소비자에게 영향을 줄 수 있다. 처음에는 signal 없는 요청만 dedupe하거나, request owner별 abort 분리를 설계해야 한다.
- `calcNoStopMultiSplitOrders` 계열은 테스트에서 사용 중이다. 바로 삭제하지 말고 deprecate -> import 축소 -> 삭제 순서로 진행해야 한다.

## 5. Recommended Priority

1. **P0:** `useNoStopMultiSplitExecution`의 미사용 dependency 정리
2. **P1:** `fetchIndicatorAwareSnapshot` in-flight dedupe 테스트와 구현
3. **P2:** Dashboard summary dependency split
4. **P3:** Legacy no-stop API rename/deprecate
5. **P4:** no-stop i18n 문구 통합

