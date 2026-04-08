# PHASE B3: Hooks Layer Simulation

> 목적: 실제 소스 코드를 수정하기 전에 `hooks/` 내부의 **React 상태 조립, 비동기 오케스트레이션, 파생 데이터 공급**을 어떻게 재구성할지 가상 런타임 기준으로 검증하는 문서입니다.  
> 원칙: 이 문서는 계획과 시뮬레이션만 다루며, **시뮬 스니펫 작성 시점**에는 저장소 훅을 선행 변경하지 않는다는 뜻으로 읽습니다. **§3.14(Step 1.5)** 는 `App.tsx`·`useMutexAction`·`usePortfolioMutations`에 **이미 반영된 오케스트레이션·토스트 계약**을 본 문서에 편입한 절입니다.

### 0.0 [POLICY FREEZE] 회장님 지시 — **[Option A] 기조 최종 채택·동결**

**회장님 지시에 따라 본 문서 전반이 [Option A] 기조로 최종 채택되었으며, 실제 코드 구현 시(`hooks/*.ts` 및 이 시뮬이 참조하는 B1/B2 경계) 이를 엄격히 따릅니다.** 여기서 말하는 **[Option A]** 는 (1) **B1 경계 전용 어댑터**(`Trade[]` → `TradeInput[]`)와 (2) **매매 내역 전용 holdings 계산기**(`calculateHoldingsFromTrades(trades)` — **`Portfolio` 통객체 비전달**)를 **한 세트**로 동결합니다. 구현 PR은 **본 문서의 본문 규칙·타입스크립트 스니펫·§4 체크리스트**를 계약으로 삼고, 동결 내용을 바꿀 때는 **본 문서 개정과 아키텍처 리뷰를 선행**합니다. (시뮬 문서만 수정하고 프로덕션 소스를 선행 변경하지 않는 단계적 접근을 유지합니다.)

**[Option A] — 본 문서에서의 정의(합의된 A안의 구조·안전장치):**

| 축 | 내용 |
|----|------|
| **B1 경계(전용 어댑터)** | `Trade[]` → B1 입력은 **`toTradeInputsForMultiSplit` 등 순수 어댑터**로만 연결. **`as TradeInput[]` 등 강제 캐스팅 금지**, B1 코어 **시그니처를 `Trade[]`에 맞게 바꾸는 Option B 금지**. |
| **Holdings — [Option A: 매매 내역 전용 계산기]** | 종목별 **`avgPrice`·`currentQuantity`** 는 **`utils/portfolioCalculations.calculateHoldingsFromTrades(trades: Trade[])`** 만 호출해 산출. **`calculateHoldings(portfolio)`** 또는 **`Portfolio` 통객체를 holdings 함수에 넘기는 경로**는 §3.8 파생에서 **금지**(통객체 참조·무관 필드 변경으로 인한 **Rule 10 헛바퀴** 방지). `useMemo` deps는 **`[trades, targetStock]`** 만. |
| **§3.8 네트워크 스냅샷·I/O/CPU 분리** | 병렬 B2(최근 거래일 + 시세)는 유지하되, §3.8 **동결**에서는 **양 축 모두 `ok`일 때만 `networkSnapshot`을 커밋**하고, **한 축 실패 시 `null` + 범용 토스트 1회**(과거 「한 축만 성공해도 커밋」보다 **이종 결합·잘못된 조합 노출** 방지 우선). **`fetch` 전용 `useEffect`와 동기 B1(`calcQuarterStopLossOrders` 등)은 분리**해 **`tradeInputs`·`dailyBuyAmount` 변경이 시세 재요청을 유발하지 않게** 함. |
| **1-B·2-A·스냅샷 무효** | §3.8 **[정책 1-B]**(비정상 시세)·**[정책 2-A]**(`catch`)는 **`setNetworkSnapshot(null)` + 동일 범용 토스트**로 차단(과거 스냅샷 잔상 금지). |
| **토스트·문구 SSOT** | 신규 사용자 대면 문구 남발 금지(Rule 3). 합의 범위에서는 **`dailySummaryNetworkError`** 등 **기존 앱 셸 키 재사용**. **마스터 플랜 동결:** `lang` 은 **`'ko' \| 'en'`(`AppLang`)으로만 통제**되므로 §3.8 등 해당 훅에서는 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독** — **`?.`·`?? APP_SHELL_MESSAGES.ko`** 는 **도달 불가 데드 코드(Rule 6)** 로 **쓰지 않는다**. **§3.6·§3.10·§3.13 등**은 본 문서 스니펫 단계에서 **`?.` + `APP_SHELL_DEFAULT_LANG` 폴백**을 유지할 수 있으나, **`AppLang` 엄격 통제로 이관 시 동일하게 철거**한다(`PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` [lang·앱 셸 딕셔너리]). |
| **Silent Failure 금지** | `console.error`/`console.warn`만으로 끝내는 경로 금지 — **Rule 11·B3 성공 기준**: 사용자 피드백(토스트·상태)을 **최소 한 경로**로 보장(§3.6 `sync` 실패 포함). |
| **React·성능 안전장치** | effect deps에 **통 객체(`strategy` 등) 금지**·**원시값 분해**; §3.8 I/O effect에는 **`tradeInputs`·`dailyBuyAmount`·`totalSplitCount`·`isTargetReturnRateValid`·`isDailyBuyAmountValid`·`avgPrice` 등 금지**(입력 변경 → **시세 스팸**); **I/O deps는 `targetStock`만** 동결(**`lang`·`networkErrorMsg`는 deps 금지**); 비동기 **`showErrorToast`는 `networkErrorMsgRef.current`** — ref는 **`useLayoutEffect([networkErrorMsg])`에서만 갱신(Rule 2·렌더 페이즈 ref 변이 금지)** — 또는 **effect/`catch` 내 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 직접 조회**(§3.8·`AppLang` 통제 전제)로 Stale 방지. holdings 파생은 **전용 계산기** **`calculateHoldingsFromTrades(trades ?? EMPTY_TRADES)` + `useMemo([trades, targetStock])`** 만(Rule 10·**`portfolio` deps 금지**); **blind `useMemo` 금지**(`networkErrorMsg` 등 O(1) 포함)는 §3.8·§3.12 등 본문과 동일. |
| **Rule 1·입력 방어** | **`isDailyBuyAmountValid`·`isTargetReturnRateValid`** 는 **`areStrictPositiveFiniteScalars`**(`utils/financialScalarGuards`, B1·`calcT`와 **동일 SSOT**) — **인라인 `> 0` 산재 금지**; 그때만 **쿼터·다분할 파생(`useMemo`)·`calcT`/`getPhase` 의미**; **`targetStock`** 은 **회장님 불변식: 포트폴리오 파이프라인에서 필수**(§3.8 훅은 **null/`trim` 중복 방어 생략**); **I/O deps는 `targetStock`만**(종목 **전환** 시에만 fetch); **`toTradeInputsForMultiSplit`** 는 **`trades` nullish/비배열/빈 배열 시 공용 `EMPTY_TRADE_INPUTS`**. |

**§3.8 다분할 실행 훅**은 위 [Option A] 표와 **해당 절의 POLICY FREEZE**를 함께 따르는 **하위 동결 블록**입니다.

## 0. Mental Compile 전제

- Phase B3는 **B1 순수 수학 안정화**와 **B2 서비스 경계 봉인**이 끝났다는 전제를 강하게 가정합니다.
- 따라서 B3의 훅은 더 이상 아래 책임을 직접 지면 안 됩니다.
  - 외부 응답 shape 디코딩
  - `fetch` / Supabase / SDK 실패 분류
  - 금융 수학 보정 로직 재구현
- B3 훅의 책임은 아래 셋으로 한정합니다.
  - **입력 선택:** 현재 사용자, 현재 포트폴리오, 현재 전략 등 UI 문맥을 읽습니다.
  - **서비스 조립:** B2의 `ServiceResult<T>`를 소비해 상태로 변환합니다.
  - **화면 공급:** 컴포넌트가 바로 소비할 수 있는 얇은 view-model과 command를 반환합니다.
- 성공 기준은 아래 8가지입니다.
  - 훅이 **raw `supabase` / SDK / 동적 import**를 직접 다루지 않고, B2 서비스 함수만 소비합니다.
  - 훅이 `console.error`만 찍고 끝나는 **Silent Failure**를 남기지 않습니다.
  - 훅 내부의 query 상태와 mutation 상태가 분리됩니다.
  - 오래 걸린 응답이 최신 입력을 덮어쓰지 않도록 **request id ref / abort / cleanup** 중 최소 하나로 stale response를 봉인합니다.
  - 금융/결제/삭제/저장 같은 mutation은 **1-tick 중복 제출 방지**를 전제로 설계합니다.
  - 액션 콜백은 `useState`에 저장하지 않고 `useRef` 또는 고정 callback으로만 유지합니다.
  - 계산만으로 얻을 수 있는 값은 가능하면 state로 저장하지 않고 파생합니다.
  - **1차 마이그레이션에서는 공개 훅 시그니처를 최대한 유지**해 컴파일 에러 0건을 지킵니다.

### 0.1 Core Principles (1~11) - B3 `hooks/` 시뮬레이션 정렬

| # | 원칙 | B3 `hooks/` 시뮬레이션에서의 의미 |
|---|------|------------------------------------|
| **1** | Financial Math | 훅은 계산식을 다시 쓰지 않습니다. `yieldRate`, `VR pool`, 다분할 round, 주문 산출은 B1 유틸만 호출합니다. 훅 안에서 `price > 0`, divide-by-zero, EPSILON 반올림 규칙을 복붙하지 않습니다. |
| **2** | React / UI Anti-Patterns | 렌더 중 `ref.current` 변이 금지, 3중 중첩 삼항 금지, 맹목적 `useMemo` 금지. effect는 query/mutation 경계에만 두고, effect 하나가 읽기/쓰기/파생상태/토스트까지 다 하지 않게 분리합니다. |
| **3** | I18n / 하드코딩 | 훅은 사용자 노출 문구를 직접 반환하지 않습니다. 가능하면 `error.code`, `tierKey`, `status` 같은 의미 값만 반환하고, 문구 결정은 상위 컴포넌트 SSOT에 맡깁니다. |
| **4** | A11y | 훅이 직접 DOM을 만들지는 않지만, 상위가 접근성 완전한 UI를 만들 수 있도록 `isLoading`, `isDisabled`, `errorCode` 같은 상태를 명시적으로 제공합니다. |
| **5** | Architecture / DRY / OCP | 동일한 `ServiceResult -> HookState` 변환, stale response 방지, mutex 진입 방지, view-model 계산은 훅마다 제각각 쓰지 않고 공통 패턴으로 정렬합니다. |
| **6** | Clean Code / SRP | `useAuth`, `usePortfolios` 같은 메가 훅은 읽기/쓰기/부수효과/파생계산을 분리합니다. Early return을 적극 사용하고, effect 내부 중첩 `if/else`를 눌러 평탄화합니다. |
| **7** | Strict TS | `any`, `!` 금지. 훅이 `ServiceErrorCode`를 분기할 때는 `switch` + `never` exhaustiveness를 사용합니다. nullable 입력은 조기 반환으로 닫습니다. |
| **8** | Naming / Magic Numbers | `isLoading`, `hasSessionExpired`, `shouldHydrateCache` 같은 불린 네이밍을 유지합니다. timeout, request id sentinel, fallback count 등은 상수로 승격합니다. |
| **9** | Comments | 훅 주석은 "왜 이 effect가 stale response를 버리는지", "왜 query와 mutation state를 분리했는지"만 설명합니다. |
| **10** | Performance / State | state는 최소화합니다. 계산으로 얻는 값은 파생하고, `map` 루프에 인라인 함수/객체를 공급하는 구조를 훅 레벨에서 만들지 않습니다. `useMemo`는 referential stability가 실제로 필요한 경우에만 둡니다. |
| **11** | Async UI Safety / Mutex | 금융·결제·삭제·저장 mutation은 `disabled`만 믿지 않습니다. B3 설계부터 `useMutexAction` 또는 동등 ref mutex를 전제로 command shape를 맞춥니다. 콜백 함수는 state에 저장하지 않고 ref에 둡니다. |

### 0.2 B3의 공개 API 원칙 (컴파일 에러 0건 우선)

Phase B3의 1차 목표는 **내부 구조 정리**이지, 컴포넌트 호출부를 한 번에 깨뜨리는 API 혁명은 아닙니다.

- `usePortfolios`, `useAuth`는 우선 **기존 반환 shape를 유지**합니다.
- 내부에서 `usePortfolioQuery`, `usePortfolioMutations`, `useAuthSessionSync`, `useProfileSync` 같은 서브 훅으로 쪼개더라도, 바깥 `return` 계약은 1차 PR에서 그대로 유지합니다.
- 새로운 상태(`errorCode`, `queryStatus`, `lastSyncedAt`)는 **추가**는 가능하지만, 기존 필드 삭제는 2차 이후에만 검토합니다.
- 컴포넌트가 이미 `try-catch` 기반으로 훅 mutation을 소비한다면, B3에서는 내부 서비스가 `ServiceResult`를 반환하더라도 훅에서 **기존 도메인 에러로 다시 승격**해 호출부 churn을 줄입니다.

---

## 1. B3 레이어 진단

### 1.1 B3 범위 분류

| 경로 | 현재 성격 | B3 포함 여부 | 판단 |
|---|---|---|---|
| `hooks/usePortfolios.ts` | 캐시 + Supabase query + 포트폴리오 mutation + 정산 계산 + VR 보정 + 쿼터모드 처리 | 포함 | B3 최대 핵심 타겟입니다. 훅이 서비스/수학/상태를 모두 들고 있어 SRP 위반 반경이 큽니다. |
| `hooks/useAuth.ts` | 세션 조회 + auth listener + 프로필 fetch + timezone/동의 동기화 + FCM 연동 | 포함 | B3 핵심 타겟입니다. 초기 세션 동기화와 부수효과가 한 effect 안에 과밀합니다. |
| `hooks/useMultiSplitExecution.ts` | 파생 계산 + 시세 fetch + 최근 거래일 fetch + 비동기 orchestration | 포함 | B1/B2 결과를 조립하는 전형적인 B3 대상입니다. 현재 중복 fetch와 파생 state 분리가 어색합니다. |
| `hooks/useNoStopMultiSplitExecution.ts` | 파생 계산 + 시세 fetch | 포함 | `useMultiSplitExecution`과 패턴이 같으므로 공통 orchestration 규칙으로 정렬해야 합니다. |
| `hooks/useFCMToken.ts` | 브라우저 환경 분기 + Firebase 동적 import + Supabase upsert | 포함 | 훅이 서비스 경계를 직접 침범하고 있어 B2 결과를 충분히 소비하지 못합니다. |
| `hooks/useTossBanner.ts` | SDK 브리지 해석 + 초기화 + attach command | 부분 포함 | 훅이 너무 서비스에 가깝습니다. B2/B3 교차 영역이라 1차는 bridge 해석을 서비스로 내리고, 훅은 상태 orchestration만 남겨야 합니다. |
| `hooks/useVrOrders.ts` | 순수 파생 view-model | 포함(경량) | 구조는 비교적 좋습니다. 다만 leaf hook 기준으로 "정말 필요한 `useMemo`인가"만 재확인하면 됩니다. |
| `hooks/useTierDisplay.ts` | tier 표시용 view-model | 포함(경량) | 구조는 작지만 `tierLabel` 하드코딩, UI 텍스트 반환이 있어 Rule 3 관점에서 손볼 여지가 있습니다. |
| `hooks/useMutexAction.ts` | ref mutex + stable command 래퍼 | 포함(B3/B4 교차) | 이미 방향은 좋습니다. B3에서는 이 훅의 **계약을 표준 mutation 진입점**으로 굳히는 역할이 더 큽니다. |

### 1.2 치명 리스크 진단표

| 파일 | 현재 패턴 | 리스크 | 왜 위험한가 | B3 조치 |
|---|---|---|---|---|
| `usePortfolios.ts` | 훅 내부에서 `supabase` 직접 query/mutation | **B2 경계 누수** | 훅이 외부 I/O shape와 실패 semantics를 다시 책임지면 B2의 `ServiceResult` 의미가 깨집니다. | `portfolioServicesSafe` 계층 소비만 허용 |
| `usePortfolios.ts` | `handleAddTrade`가 trade 정규화 + VR snapshot 계산 + DB 업데이트 + quarter mode update까지 수행 | **SRP 붕괴 / partial failure** | 수학(B1), 통신(B2), hook orchestration(B3)이 한 함수에 섞여 회귀 반경이 너무 큽니다. | `applyTradeToPortfolioDraft`(순수) + `persistTradeMutationSafe`(서비스) + hook state commit으로 분리 |
| `usePortfolios.ts` | fetch/caching이 localStorage와 Supabase를 직접 다룸 | **stale overwrite / silent cache error** | 캐시 read 성공 후 늦게 온 오래된 응답이 최신 상태를 덮어쓸 수 있습니다. | request id ref + cache/remote 분리 query 훅 |
| `useAuth.ts` | 하나의 대형 `useEffect`가 세션 초기화, listener, profile fetch, FCM 저장, unhandled rejection까지 담당 | **인지 복잡도 과다 / race** | 로그인 직후, 세션 만료, 복구 가능 오류가 서로 다른 경로로 흩어져 있어 재진입 조건이 어렵습니다. | `useAuthSessionSync`, `useUserProfileSync`, `useSessionRecoveryGuard`로 분리 |
| `useAuth.ts` | `fetchUserProfile` 안에서 조회 + timezone 동기화 + 동의 flush 수행 | **읽기/쓰기 혼합** | 읽기 성공 여부와 side effect 성공 여부가 섞여, 실패 semantics가 흐려집니다. | `fetchUserProfileSafe`와 `syncUserProfileClientFactsSafe` 분리 |
| `useMultiSplitExecution.ts` | 같은 effect 안에서 `fetchStockPrices`를 두 번 호출 | **불필요한 네트워크 / state drift** | basePrice 계산과 insufficientAmount 판단이 서로 다른 시점의 가격을 볼 수 있습니다. | 단일 quote snapshot fetch 후 로컬 변수 재사용 |
| `useMultiSplitExecution.ts` | `portfolio.strategy.multiSplit!` non-null assertion | **Rule 7 위반** | effect 진입 조건이 바뀌면 런타임 가정이 깨질 수 있습니다. | 조기 반환 + 지역 `const strategy = portfolio.strategy.multiSplit; if (strategy == null) return;` |
| `useNoStopMultiSplitExecution.ts` | 비동기 effect + direct fetch + `!` | **패턴 중복 / stale update** | `useMultiSplitExecution`과 거의 같은 취약점이 중복됩니다. | 공통 quote loader 또는 동일 stale-response 패턴으로 정렬 |
| `useFCMToken.ts` | 훅이 Firebase import와 Supabase upsert를 직접 수행 | **서비스 계층 우회** | B2의 Firebase/Supabase safe wrapper가 있어도 훅이 그 보호막 밖에서 동작하게 됩니다. | `saveUserFcmTokenSafe()` 소비 훅으로 전환 |
| `useTossBanner.ts` | bridge 후보 해석과 SDK initialize를 훅 내부가 직접 수행 | **B2/B3 경계 혼선** | SDK shape 검증과 React 상태 오케스트레이션이 한 파일에 섞입니다. | bridge decode/init은 서비스로 내리고, 훅은 `isSupported/isInitialized/attachBanner` 상태만 유지 |
| `useTierDisplay.ts` | `tierLabel: 'PREMIUM' | 'PRO' | 'FREE'` 하드코딩 | **Rule 3 위반 가능성** | tier 표시 텍스트가 훅 안에 박히면 언어/표시 정책 변경 시 hook과 UI를 같이 고쳐야 합니다. | `tierKey` 또는 `copyKey` 반환으로 전환 |

### 1.3 공통 냄새(Smells)

1. **훅이 서비스 경계를 아직 충분히 신뢰하지 못하고 있습니다.**
   - `supabase` 직접 import
   - Firebase 동적 import 직접 수행
   - SDK bridge shape 확인을 훅에서 처리

2. **query state와 mutation state가 섞여 있습니다.**
   - 읽기와 쓰기가 같은 훅, 같은 effect, 같은 callback에 얹혀 있습니다.
   - 실패를 `console.warn`으로만 끝내는 경로가 남아 있습니다.

3. **파생값을 위한 비동기 상태가 중복됩니다.**
   - 다분할 훅은 동일한 주가 snapshot을 두 번 읽습니다.
   - leaf hook은 작은 계산에도 `useMemo`가 습관적으로 들어갈 위험이 있습니다.

4. **stale response 방지 패턴이 통일되어 있지 않습니다.**
   - 어떤 곳은 `cancelled` boolean만 씁니다.
   - 어떤 곳은 abort controller를 씁니다.
   - 어떤 곳은 중복 실행 자체를 막지 못합니다.

5. **Rule 11이 일부 mutation 호출부에만 존재합니다.**
   - `useMutexAction`은 생겼지만, 훅 설계 자체가 이를 기본 진입점으로 가정하고 있지는 않습니다.

### 1.4 B3에서 먼저 고정할 공용 훅 규약

| 후보 | 역할 | 이유 |
|---|---|---|
| `QueryState<T>` | `status`, `data`, `errorCode`를 한 번에 들고 가는 최소 query state | `isLoading + null + console.warn` 조합보다 훨씬 추적이 쉽습니다. |
| `reduceServiceQueryState()` | `ServiceResult<T>`를 hook state로 변환 | 훅마다 `if (result.ok)` 분기를 복붙하지 않게 합니다. |
| `requestIdRef` 패턴 | 가장 늦게 끝난 요청만 반영 | cache/remote, strategy quote, auth sync에서 stale overwrite를 막습니다. |
| `useMutexAction` | mutation command 표준 진입점 | Rule 11을 hook 설계 계약으로 승격합니다. |
| `buildXxxViewModel()` | hook 내부에서 JSX 친화형 데이터를 만드는 순수 helper | 훅은 orchestration만, 계산/매핑은 순수 함수로 분리합니다. |

### 1.5 시뮬 문서 리뷰 교정 (치명 결함 → 스니펫 반영)

아래는 초판 `§3` 스니펫에 대해 **외부 리뷰로 발견된 치명 이슈**와, 본 문서에 반영한 **교정 방향**입니다. (실제 코드 변경 없음.)

| # | 주제 | 문제 | 문서 반영 |
|---|------|------|-----------|
| A | `useMultiSplitExecution` §3.8 | `ServiceResult`에 `.ok` 가드 없이 `quoteResult.data.price` 접근 시 런타임 TypeError·WSOD 위험 | **Zero-Trust `.ok` 가드** 유지. **§3.8 동결:** **I/O(`runFetch`) vs CPU(B1 파생 `useMemo`) 분리**·**양 축 `ok`일 때만 `networkSnapshot`**. **[정책 1-B]** 비정상 `price` → **`setNetworkSnapshot(null)` + `dailySummaryNetworkError`**. **[정책 2-A]** `catch` → 동일. 그 외 `!ok`는 범용 토스트만(신규 문구 금지). |
| B | `useAuth.fetchUserProfile` §3.6 | stale 방어만 있고 **`!profileResult.ok`일 때 `setUserProfile(profileResult.data)`로 `data` 맹신** → WSOD 위험; 언마운트 후 `setState` 무방비 | **확정:** 조회 실패 시 프로필 **비움** — **`!profileResult.ok` → `setUserProfile(EMPTY_PROFILE)`** (에러 `data` 금지) + **`profileSyncRequestIdRef` cleanup** + `fetch`/`sync` 직후 **2회** stale 검증 |
| I | `useAuth` §3.6 `syncUserProfileClientFactsSafe` | **`!syncResult.ok`일 때 `console.error`만** → **Silent Failure**(B3 성공 기준·Rule 11 위반) | **`showErrorToast`** 에 **안전 SSOT 해석**(`?.` + **`APP_SHELL_DEFAULT_LANG` 폴백**) — 신규 문구 금지; 훅은 **`useAuth(lang)`** 등으로 `lang` 확보 |
| C | `useFCMToken` §3.10 | 수동 in-flight ref + 언마운트 후 `setState` 위험, 뮤텍스 패턴 파편화 | `useMutexAction` 단일 경로 + `isMountedRef` — **도메인 실패는 `lastErrorCode`**, 예기치 않은 throw는 **`useMutexAction`의 토스트(내부 try/catch) + rethrow** |
| D | `useMutexAction` §3.13 | `void run()` 등으로 미처리 rejection·무피드백 위험; 토스트 조회 중 throw 시 **도메인 `error` 삼킴(Swallowed)** | `catch`에서 **내부 `try { showErrorToast(...) } catch { console.error }`** 후 **`throw error`(원본 유지)** , `finally`에서 **`isMountedRef` 가드 후 `setIsExecuting(false)`** — 문구는 `getMutationFailureToastMessage()`(본인도 `?.`+폴백 권장) |
| E | §3.8·§3.10·§3.4 교차 | effect 비동기 `run`에 cleanup 없음·`0.25` 매직 넘버·FCM 인라인 액션·거래 mutation mutex 미적용 | §3.8: cleanup에서 **`requestIdRef.current += 1`** + **`DEFAULT_PORTFOLIO_FEE_RATE`** / §3.10: **`useCallback` 액션** / §3.4: **`useMutexAction(handleAddTradeCore)`** + **Option A 확정:** **`dailySummaryNetworkError` 범용만**(Rule 3) |
| F | `usePortfolioQuery` §3.2·`useTierDisplay` §3.12 | remote 실패 시에도 **`setPortfolios(result.data)`** 로 캐시 덮어씀; tier에 **blind `useMemo`** | §3.2: **`result.ok === true`일 때만** `setPortfolios` + **`requestIdRef` cleanup** / §3.12: **`useMemo` 제거**·즉시 `switch` 반환 |
| G | `reduceServiceQueryState` §3.0·`useMultiSplitExecution` §3.8 | 실패 시 **`data: result.data`** 로 **`previous.data` 파괴**·WSOD; effect에 **`portfolio` 통째**·**`as TradeInput[]`**; effect 안 **`calculateHoldings(portfolio)`** 만 두고 **`portfolio` deps 누락** → Stale closure; **`toTradeInputsForMultiSplit` 중복 호출** | §3.0: **`data: previous.data`** / §3.8: **`tradeInputs` 단일 `useMemo`** + **[Option A]** **`calculateHoldingsFromTrades(trades)`만** + **`useMemo([trades, targetStock])`**(`[portfolio]`·통객체 holdings 금지) + **I/O effect deps는 `targetStock`만** + **`networkErrorMsgRef` + `useLayoutEffect([networkErrorMsg])` 갱신**·**`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독**(마스터 플랜·데드 폴백 금지)·**`areStrictPositiveFiniteScalars`·`EMPTY_TRADE_INPUTS`** 로 Rule 1·10 준수 + B1은 **`networkSnapshot` 기반 파생 `useMemo`** + **순수 어댑터 → B1**(`as`·B1 시그니처 변경 금지) |
| H | `useMultiSplitExecution` §3.8 effect deps·파생 계산 | effect deps에 **`multiSplit`/`strategy` 통 객체** 또는 **`tradeInputs`·`dailyBuyAmount`·`totalSplitCount`·`isTargetReturnRateValid` 등** → **불필요·과도한 `fetch` 반복**(통신 스팸·비용); 동기 B1을 effect에 넣으면 동일; **`calcT`·`getPhase`를 `useMemo`로 감싼 blind 최적화**(Rule 2) | **I/O `useEffect` deps는 `targetStock`만**(§3.8 동결·**`lang`/`networkErrorMsg` deps 금지**); **`networkErrorMsgRef`는 `useLayoutEffect([networkErrorMsg])`에서만 갱신**(렌더 바디 ref 대입 금지·Rule 2); 토스트는 **`networkErrorMsgRef.current`** 또는 **동등한 현장 `APP_SHELL_MESSAGES` 조회**; **`isTargetReturnRateValid`·`isDailyBuyAmountValid`·`totalSplitCount` 검증은 파생 `useMemo`·`calcT`/`getPhase` 경계**; B1 `multiSplit` 인자는 **`MultiSplitParams` 3필드 `safeStrategyObj`**; **`currentRound`·`multiSplitPhase`는 `useMemo` 없이 즉시 계산**; **§3.8 본문·스니펫 정책 동결(Freeze)** |
| M | `useMultiSplitExecution` §3.8 `networkErrorMsgRef` | **렌더 바디**에서 **`networkErrorMsgRef.current = networkErrorMsg`** → **Rule 2 위반**·Concurrent **티어링**·상태 꼬임 위험 | **`useLayoutEffect(() => { networkErrorMsgRef.current = networkErrorMsg; }, [networkErrorMsg])`** — **`useMutexAction` `actionRef` 갱신 정책과 동일** |
| J | `useMultiSplitExecution` §3.8 금융·알림·어댑터 | **`dailyBuyAmount <= 0`** 시 **`calcT`** 무방비; **`targetReturnRate <= 0`** 방어 누락; 축 실패+1-B에서 **토스트 2회**; **`trades` undefined** 시 **`toTradeInputsForMultiSplit`·`map` WSOD**; **`return []`로 `tradeInputs` 참조 매 렌더 신규 생성** | **Rule 1:** **`areStrictPositiveFiniteScalars`**·**파생 `useMemo`·`calcT`/`getPhase`** 가드; **Rule 6:** **`targetStock`은 도메인 SSOT**(훅에서 `trim`/null 중복 방어 생략)·`isQuoteInvalid`+**단일** `showErrorToast`; **어댑터:** **`EMPTY_TRADE_INPUTS`**·**`EMPTY_TRADES`** |
| K | `useAuth` / `usePortfolioQuery` §3.2·§3.6 | **`userId.trim()`** 등 **널러블 인자 무방비** → `null`/`undefined` 시 즉시 WSOD | **`(userId ?? '').trim()`**·빈 문자열이면 **조기 반환**(`EMPTY_PROFILE` / 빈 포트폴리오 등)·**ref stale 무효화** 유지 |
| L | `useMultiSplitExecution` §3.8 `setNetworkSnapshot(null)` | 가드·fetch 직전 **무조건 null 덮어쓰기** → 이미 `null`일 때도 **불필요 리렌더**(Rule 10) | **`setNetworkSnapshot((prev) => (prev !== null ? null : prev))`** 로 **bailout**; **`networkErrorMsg`는 즉시 평가(blind `useMemo` 금지)**·**`networkErrorMsgRef`는 `useLayoutEffect([networkErrorMsg])`에서만 갱신(Rule 2)**·**I/O deps는 `targetStock`만** |

---

## 2. 액션 플랜

### 2.1 리팩토링 원칙

### 2.1.1 훅은 "서비스 재구현기"가 아니라 "상태 조립기"여야 합니다

- 훅 안에서 금지:
  - `supabase.from(...).select(...)`
  - SDK shape decoder
  - `fetch` / `Response` 직접 처리
  - B1 금융 수학 재작성
- 훅 안에서 허용:
  - 서비스 함수 호출
  - `ServiceResult<T>`를 UI 친화 상태로 변환
  - 최신 요청만 커밋하는 stale-response 방어
  - 컴포넌트가 쓰기 쉬운 command/view-model 제공

### 2.1.2 Query는 `ServiceResult<T>`를 상태로 번역하고, Mutation은 도메인 명령으로 노출합니다

B3의 기본 구도는 아래입니다.

1. **서비스**
   - `Promise<ServiceResult<T>>`
2. **훅**
   - query면 `QueryState<T>`로 변환해 state 보유
   - mutation이면 성공 시 local state commit, 실패 시 도메인 에러로 승격 또는 `errorCode` 갱신
3. **컴포넌트**
   - query state를 렌더
   - mutation command를 `useMutexAction`으로 감싸거나, 이미 감싸진 command를 호출

### 2.1.3 Mutation은 내부 구현을 바꿔도 공개 시그니처는 1차에서 유지합니다

예시:

- 현재 `handleAddPortfolio(): Promise<void>` 를 바로 `Promise<ServiceResult<Portfolio>>`로 바꾸면, 호출부 churn이 커집니다.
- 1차 B3에서는 내부에서 `createPortfolioSafe()`를 호출하더라도, 훅은 기존처럼 `Promise<void>`를 유지하고 실패 시 기존 `createPortfolioMutationError(...)`로 throw 합니다.
- 2차 이후에 컴포넌트가 `error.code` 기반 분기를 준비한 뒤 공개 계약 변경을 검토합니다.

### 2.1.4 Stale response는 "cleanup boolean만"으로 끝내지 않고, request identity를 명시합니다

아래 둘 중 하나는 최소 계약으로 둡니다.

- **request id ref**
  - 가장 단순하고 query 훅에 잘 맞습니다.
- **AbortController**
  - 실제 I/O 취소가 의미 있을 때 사용합니다.

권장:

- cache hydrate + remote refresh 같이 **둘 이상의 응답 원천**이 있는 경우에는 request id ref를 우선 둡니다.
- 서비스가 abort signal을 받는다면 abort까지 연결합니다.

### 2.1.5 파생값은 state보다 먼저 "순수 helper" 후보인지 검사합니다

- `currentRound`, `multiSplitPhase`, `isInQuarterModeByT` 같은 값은 비동기 의존이 없으면 state가 아니라 파생값이어야 합니다.
- `quarterStopLossData`, `multiSplitExecutionData`처럼 외부 시세가 필요해 비동기 경계가 있는 값만 state 후보입니다.
- leaf hook의 `useMemo`는 참조 안정성이 실제로 필요한 경우에만 유지합니다.

### 2.1.6 Rule 11 - 훅 설계 단계에서부터 mutex 진입점을 맞춥니다

- 금융/삭제/결제 command는 아래 중 하나를 만족해야 합니다.
  - 호출부가 `useMutexAction`으로 감싼다.
  - 훅이 이미 mutex command를 반환한다.
- **금지:** `isSaving` boolean만 두고 command 자체는 중복 실행 가능한 구조
- **금지:** 실행할 action을 `useState`에 저장
- **권장:** mutation core는 순수 async 함수, mutex는 wrapper 훅에서 담당
- **`useMutexAction` 옵션:** `getMutationFailureToastMessage`는 **`(error: unknown) => string | null`** 로 **에러별 토스트 여부**를 결정하고, **`useCallback`으로 안정화**해 전달합니다. (내부에서는 `optionsRef`로 최신 참조 유지 — §3.13·§3.14)
- **호출 규약:** 훅 내부에서 토스트까지 띄우더라도 **`throw error`로 rethrow** 하므로, 호출부는 추가 로깅·상태 정리가 필요하면 `await run()` / `.catch(...)` 로 **rejection을 소비**합니다. `void run()`은 지양합니다.

### 2.2 구현 순서

1. **`usePortfolios` 분해**
   - `usePortfolioQuery`
   - `usePortfolioMutations`
   - 순수 helper: payload mapper, settlement draft builder, trade patch builder

2. **`useAuth` 분해**
   - `useAuthSessionSync`
   - `useUserProfileSync`
   - `useSessionRecoveryGuard`

3. **전략 실행 훅 정렬**
   - `useMultiSplitExecution`
   - `useNoStopMultiSplitExecution`
   - 단일 quote fetch + request id ref + 단일 state object

4. **서비스 경계 누수 제거**
   - `useFCMToken`
   - `useTossBanner`

5. **leaf hook 정리**
   - `useVrOrders`
   - `useTierDisplay`
   - `useMutexAction` 공개 계약 재확인

6. **`App.tsx` 오케스트레이션 (Step 1.5)**
   - `usePortfolioMutations` command에 대한 **이중 `useMutexAction` 제거**
   - **`getMutationFailureToastMessage` error-aware** + 도메인 에러 시 **`null`(침묵)**
   - 순수 저장 경로 **`runPortfolioMutation` 제거**, 도메인 모달은 **필요 경로만** (§3.14)

### 2.3 검증 전략

| 레벨 | 검증 내용 |
|---|---|
| 로그인/로그아웃 race | 빠른 로그인-로그아웃-로그인 전환 시 오래된 profile 응답이 최신 user를 덮지 않는지 — `fetchUserProfile`·`syncUserProfileClientFactsSafe` 경로에 **동일 `profileSyncRequestIdRef`** 로 stale 커밋을 막았는지 |
| 포트폴리오 query | cache hydrate 후 remote refresh가 순서 역전돼도 최신 request만 반영되는지 |
| 금융 mutation | 저장/삭제/정산 버튼을 연속 클릭해도 1회만 반영되는지 |
| 전략 훅 | 같은 가격 snapshot으로 `basePrice`와 `insufficientAmount`를 계산하는지 |
| stale response | portfolio 입력이 바뀐 뒤 늦게 끝난 quote fetch가 이전 결과를 setState하지 않는지 |
| service error mapping | `AUTH_REQUIRED`, `FORBIDDEN`, `TIMEOUT`, `NETWORK`가 훅에서 서로 다른 상태로 노출되는지 |
| i18n | `useTierDisplay` 같은 leaf hook이 표시 문자열 대신 semantic key를 반환하는지 |
| WSOD 방지 | query 실패 시 `null`만 던지지 않고 safe fallback state가 유지되는지 |

### 2.4 B3 완료 정의(Definition of Done)

- `hooks/` 내부에서 raw `supabase`, raw `fetch`, raw SDK 호출이 사라지거나 최소한 B2 safe wrapper 뒤로 숨겨집니다.
- `usePortfolios`, `useAuth`의 메가 effect / 메가 callback이 역할별로 분해됩니다.
- query는 `status + data + errorCode`를 갖고, mutation은 `useMutexAction`과 정합된 command shape를 가집니다.
- 훅이 외부 실패를 `console.*`만 찍고 삼키지 않습니다.
- `ServiceErrorCode` 분기는 `switch` + `never` exhaustiveness를 적용할 준비가 됩니다.
- non-null assertion(`!`)이 훅에서 제거 가능한 구조가 됩니다.
- 파생값은 순수 helper 또는 `useMemo`로, 비동기 결과만 state로 남습니다.
- 1차 마이그레이션 후에도 **주요 공개 훅 시그니처는 유지**되어 컴파일 에러 0건을 지킵니다.

---

## 3. 시뮬레이션용 코드 스니펫

아래 코드는 실제 저장소를 즉시 덮어쓰는 최종본이 아니라, 현재 훅 패턴을 안전하게 재설계했을 때 어떤 구조가 되어야 하는지 보여주는 **AST 레벨 대응 시뮬레이션**입니다.

### 3.0 공용 B3 query 상태 계약 (시뮬 SSOT)

```ts
import type { ServiceErrorCode, ServiceResult } from '../services/serviceUtils';

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface QueryState<T> {
  status: QueryStatus;
  data: T;
  errorCode: ServiceErrorCode | null;
}

export function createInitialQueryState<T>(data: T): QueryState<T> {
  return {
    status: 'idle',
    data,
    errorCode: null,
  };
}

export function reduceServiceQueryState<T>(
  previous: QueryState<T>,
  result: ServiceResult<T>,
): QueryState<T> {
  if (result.ok) {
    return {
      status: 'success',
      data: result.data,
      errorCode: null,
    };
  }

  return {
    status: 'error',
    data: previous.data,
    errorCode: result.error.code,
  };
}
```

핵심:

- `isLoading` 단일 boolean만으로는 `idle/loading/success/error`를 구분하기 어렵습니다.
- 훅은 `ServiceResult<T>`를 직접 들고 다니기보다, **UI가 필요한 최소 상태로 번역**해 노출하는 편이 안정적입니다.
- **Rule 6·7:** 실패 분기에서 **`result.data`로 `previous.data`를 덮어쓰지 않습니다.** `ok === false`일 때 `data`는 없거나 불완전할 수 있어, **`queryState.data.map(...)` 등이 `undefined`에 접근하며 WSOD**가 납니다. 에러는 **`status`·`errorCode`만 갱신**하고 **마지막으로 성공했거나 캐시에서 온 `previous.data`를 유지**합니다(§3.2의 `setPortfolios` 가드와 합치면 이중 방어).
- B3는 이 추상화 하나만으로도 `usePortfolios`, `useAuth`, 전략 훅의 실패 semantics를 크게 정리할 수 있습니다.

### 3.1 Before: `usePortfolios`는 cache + remote fetch + state commit을 한 callback에 직접 묶습니다

```ts
const fetchPortfolios = useCallback((userId: string): void => {
  loadPortfoliosFromCache(userId);
  fetchPortfoliosFromSupabase(userId).catch((err) =>
    console.error('[fetchPortfolios] 백그라운드 업데이트 실패:', err)
  );
}, [loadPortfoliosFromCache, fetchPortfoliosFromSupabase]);
```

문제:

- cache hydrate와 remote refresh의 **요청 identity**가 없습니다.
- remote fetch가 오래 걸리면, 이미 사용자/포트폴리오 문맥이 바뀐 뒤에도 늦게 state를 덮을 수 있습니다.
- 훅이 `supabase` query, localStorage read/write, normalize, setState를 모두 직접 들고 있습니다.

### 3.2 After: `usePortfolios`는 query 서브 훅이 cache/remote를 순서 있게 조립합니다

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Portfolio } from '../types';
import {
  fetchPortfoliosByUserSafe,
  readPortfolioCacheSafe,
} from '../services/portfolioService';

interface UsePortfolioQueryArgs {
  userId: string | null;
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
}

const EMPTY_PORTFOLIOS: Portfolio[] = [];

export function usePortfolioQuery({
  userId,
  setPortfolios,
}: UsePortfolioQueryArgs) {
  const requestIdRef = useRef(0);
  const [queryState, setQueryState] = useState(
    createInitialQueryState<Portfolio[]>(EMPTY_PORTFOLIOS),
  );

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const loadPortfoliosFromCache = useCallback((targetUserId: string): boolean => {
    const cacheResult = readPortfolioCacheSafe(targetUserId);
    if (!cacheResult.ok) {
      return false;
    }

    setPortfolios(cacheResult.data);
    setQueryState((previous) => ({
      ...previous,
      data: cacheResult.data,
      errorCode: null,
    }));
    return true;
  }, [setPortfolios]);

  const fetchPortfolios = useCallback(
    async (targetUserId: string | null | undefined): Promise<void> => {
    const safeUserId = (targetUserId ?? '').trim();
    if (safeUserId.length === 0) {
      setPortfolios([]);
      setQueryState(createInitialQueryState<Portfolio[]>(EMPTY_PORTFOLIOS));
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    loadPortfoliosFromCache(safeUserId);
    setQueryState((previous) => ({
      ...previous,
      status: 'loading',
      errorCode: null,
    }));

    const result = await fetchPortfoliosByUserSafe(safeUserId);
    if (requestIdRef.current !== requestId) {
      return;
    }

    setQueryState((previous) => reduceServiceQueryState(previous, result));

    if (result.ok) {
      setPortfolios(result.data);
    }
  }, [loadPortfoliosFromCache, setPortfolios]);

  return {
    queryState,
    fetchPortfolios,
    loadPortfoliosFromCache,
  };
}
```

핵심:

- **request id ref**로 stale response를 버립니다.
- **Rule 6:** `fetchPortfolios` 인자는 **`string | null | undefined`** 허용·**`(targetUserId ?? '').trim()`** 후 빈 문자열이면 **조기 반환** — **`null`/`undefined`에서 `.trim()` WSOD** 금지.
- **Rule 6·7:** `fetchPortfoliosByUserSafe` 이후 **`result.ok === true`일 때만** `setPortfolios(result.data)` — 실패 시에는 **이미 hydrate된 캐시 목록을 원치 않게 `undefined`/빈 값으로 덮어쓰지 않습니다.** `setQueryState(reduceServiceQueryState(...))` 는 §3.0 계약대로 **`queryState.data`를 `previous.data`로 보존**하고 에러 메타만 반영합니다.
- **Rule 2·10:** 마운트 해제 시 **`requestIdRef.current += 1` cleanup**으로 진행 중인 remote 응답이 돌아와도 **`requestIdRef.current !== requestId`로 커밋을 폐기**해 언마운트 뒤 `setState`를 막습니다.
- query 서브 훅이 cache/remote orchestration만 책임지고, raw I/O는 서비스로 내립니다.
- 상위 `usePortfolios`는 기존 공개 API를 유지하면서 내부 구현만 교체할 수 있습니다.

### 3.3 Before: `handleAddTrade`는 수학, 상태, DB 업데이트를 한 번에 처리합니다

```ts
const handleAddTrade = useCallback(
  async (portfolioId: string, trade: Trade) => {
    const target = portfolios.find((p) => p.id === portfolioId);
    if (!target) {
      throw createPortfolioMutationError(
        PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
      );
    }

    const normalizedTrade: Trade = {
      ...trade,
      price: Number(trade.price),
      quantity: Number(trade.quantity),
      fee: trade.fee !== undefined ? Number(trade.fee) : trade.fee,
    };

    // ... VR snapshot 계산 ...
    // ... quarter mode 계산 ...
    // ... supabase update ...
    // ... setPortfolios ...
  },
  [portfolios, setPortfolios],
);
```

문제:

- trade 정규화, VR 계산, quarter mode 전환, DB write가 모두 한 함수에 있습니다.
- 실패 지점이 너무 많아 partial failure가 생겨도 책임 경계를 나누기 어렵습니다.
- B1 수학과 B2 서비스 경계가 B3 hook에 역류합니다.

### 3.4 After: `handleAddTrade`는 draft·persist 분리 + Rule 11 mutex + Option A(범용 토스트) 확정

금융 mutation은 **“호출부가 `useMutexAction`으로 감쌀 것”** 에만 기대지 않습니다. 훅이 반환하는 command 자체가 **이미 mutex로 포장**된 상태여야 합니다(Zero-Trust·Rule 11).

**회장님 확정 — Option A(범용 안내문 재사용):** `useMutexAction`의 **`getMutationFailureToastMessage`** 는 **신규 커스텀 문구·포트폴리오/거래 전용 i18n 키를 새로 만들지 않습니다.** 앱 셸 **`dailySummaryNetworkError`** 만 참조하되, **Rule 6·11:** **`APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ?? APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError`** 로 **강제 첨자 금지**(`lang` 지연 시 WSOD 방지). **`AppLang` 엄격 통제** 시에는 §0.0·§3.8과 같이 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독**으로 정렬할 수 있습니다. **`APP_SHELL_DEFAULT_LANG`** 는 제품 기본 언어와 동일한 **`AppLang` 상수 한 곳**. 훅·컴포넌트 본문에 한글/영문 문자열을 하드코딩하는 것은 **Rule 3 위반**으로 금지됩니다. **Step 1.5:** 동일 콜백이 **`(error: unknown) => string | null`** 로 **도메인 에러 시 `null`(침묵)** 을 반환할 수 있습니다(§3.14).

아래 조각은 상위 `usePortfolios`가 **`lang: AppLang`**(또는 동등 SSOT)을 이미 갖고 있다고 가정합니다.

```ts
import { useCallback } from 'react';
import {
  createPortfolioMutationError,
  isPortfolioMutationErrorCode,
  PORTFOLIO_MUTATION_ERROR_CODES,
} from '../constants/portfolioMutationErrors';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang } from '../types';

/** Rule 8: 제품 기본 언어 — `appShellMessages` 기본 로캘과 동일 */
const APP_SHELL_DEFAULT_LANG: AppLang = 'ko';
import {
  persistPortfolioTradeMutationSafe,
  toPortfolioMutationError,
} from '../services/portfolioMutationService';
import { useMutexAction } from './useMutexAction';

interface PreparedTradeMutation {
  nextPortfolio: Portfolio;
  nextIsQuarterMode: boolean;
}

function buildPreparedTradeMutation(
  portfolio: Portfolio,
  trade: Trade,
): PreparedTradeMutation {
  const normalizedTrade = normalizeTradeInput(trade);
  const portfolioWithTrade = applyTradeToPortfolioDraft(portfolio, normalizedTrade);
  const nextIsQuarterMode = deriveQuarterModeAfterTrade(
    portfolio,
    portfolioWithTrade,
    normalizedTrade,
  );

  return {
    nextPortfolio: {
      ...portfolioWithTrade,
      isQuarterMode: nextIsQuarterMode,
    },
    nextIsQuarterMode,
  };
}

// Option A + Step 1.5: 범용 네트워크 문구만 SSOT — 도메인 에러(예: 한도 초과)는 토스트 침묵(null).
const getAddTradeMutationFailureToastMessage = useCallback(
  (error: unknown): string | null => {
    if (
      error instanceof Error &&
      isPortfolioMutationErrorCode(error.message) &&
      error.message === PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached
    ) {
      return null;
    }

    return (
      APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ??
      APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError
    );
  },
  [lang],
);

const handleAddTradeCore = useCallback(
  async (portfolioId: string, trade: Trade): Promise<void> => {
    const target = portfolios.find((portfolio) => portfolio.id === portfolioId);
    if (target == null) {
      throw createPortfolioMutationError(
        PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
      );
    }

    const prepared = buildPreparedTradeMutation(target, trade);
    const result = await persistPortfolioTradeMutationSafe({
      portfolioId,
      nextPortfolio: prepared.nextPortfolio,
    });

    if (!result.ok) {
      throw toPortfolioMutationError(result.error);
    }

    setPortfolios((previous) =>
      previous.map((portfolio) =>
        portfolio.id === portfolioId ? prepared.nextPortfolio : portfolio,
      ),
    );
  },
  [portfolios, setPortfolios],
);

const { run: handleAddTrade } = useMutexAction(handleAddTradeCore, {
  getMutationFailureToastMessage: getAddTradeMutationFailureToastMessage,
});
```

핵심:

- hook은 **"어떤 portfolio를 어떤 다음 상태로 만들지"** 까지만 결정합니다.
- 실제 write는 서비스가 담당하고, 실패는 서비스 에러를 도메인 에러로 승격합니다.
- `applyTradeToPortfolioDraft`, `deriveQuarterModeAfterTrade`는 순수 helper로 분리돼 B1 계산과 B3 orchestration이 섞이지 않습니다.
- **`handleAddTrade`는 `useMutexAction`이 반환한 `run`** — 컴포넌트가 실수로 mutex 없이 호출할 여지를 줄입니다(§3.13의 `catch` 토스트 + rethrow 계약 포함).
- **Option A 확정:** 실패 토스트는 **`dailySummaryNetworkError`** 만 — **도메인 전용 안내문 신규 등록·교체 계획 없음**(회장님 정책).
- **`getMutationFailureToastMessage`는 `(error: unknown) => string | null`** — **`portfolioLimitReached` 등 모달 전용 도메인 에러는 `null`** 로 **Toast + Modal 이중 알림 방지**(§3.14).
- `getMutationFailureToastMessage`는 **`useCallback` + `[lang]`** 으로 안정화해 `useMutexAction`의 `optionsRef` churn을 줄입니다.

### 3.5 Before: `useAuth.fetchUserProfile`은 read와 side effect를 섞습니다

```ts
const fetchUserProfile = useCallback(async (userId: string): Promise<void> => {
  if (!userId) return;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('subscription_tier, max_portfolios, ...')
      .eq('id', userId)
      .single();

    if (!profileError && profileData) {
      const detectedTimezone = getDeviceTimeZone();
      const profileTimezone = (profileData.timezone ?? '').trim();
      const updatePayload: Record<string, string> = {};

      if (!profileTimezone || profileTimezone !== detectedTimezone) {
        updatePayload.timezone = detectedTimezone;
      }

      const pendingConsent = localStorage.getItem('btd_pending_consent');
      // ... 동의 flush ...

      if (Object.keys(updatePayload).length > 0) {
        await supabase.from('user_profiles').update(updatePayload).eq('id', userId);
      }

      setUserProfile({ ... });
    }
  } catch (err) {
    console.warn('[fetchUserProfile] 조회 실패:', err);
  }
}, []);
```

문제:

- 프로필 read와 timezone/동의 동기화 write가 한 callback에 섞입니다.
- 실패 시 `console.warn`만 남고, 상위 state는 왜 비었는지 알기 어렵습니다.
- 훅이 B2에서 봉인해야 할 `supabase` query와 update를 직접 수행합니다.

### 3.6 After: `useAuth`는 profile query와 client fact sync를 분리합니다

`export function useAuth(...)` **본문 최상단**(다른 `useRef`/`useState`와 함께)에 아래를 둡니다.

```ts
const profileSyncRequestIdRef = useRef(0);
```

`fetchUserProfile` callback 안에서는 **`fetchUserProfileSafe` 직후 1회**, **`syncUserProfileClientFactsSafe` 직후 1회** — 총 **2회** `syncRequestId` 일치 검사로 Stale Overwrite를 폐기합니다. 빈 `userId`로 들어오면 **진행 중인 비동기 묶음을 무효화**하기 위해 ref를 증가시킵니다.

**Rule 6·7 (Zero-Trust) — 확정 정책:** 프로필 정보를 가져오지 못하면(`!profileResult.ok`) **`profileResult.data`를 맹신하지 않고** **`setUserProfile(EMPTY_PROFILE)`** 으로 프로필 상태를 비웁니다. 실패 응답의 `data`는 없거나 불완전할 수 있어 WSOD를 유발할 수 있습니다. **“이전에 보이던 프로필을 유지”하는 폴백은 채택하지 않습니다.**

**Rule 2·10:** 훅 마운트 해제 시 **`profileSyncRequestIdRef.current += 1`** cleanup을 두어, 진행 중인 `fetch`/`sync`가 끝나도 stale 검사에서 커밋이 폐기되게 합니다.

**Rule 11·B3 성공 기준 — Silent Failure 금지:** `syncUserProfileClientFactsSafe`가 **`!syncResult.ok`** 이면 **`console.error`만 남기고 끝내지 않습니다.** 사용자에게 **`showErrorToast`** 로 피드백하되, 문구는 **`APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ?? APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError`**(신규 토스트 문구 등록 금지·Rule 3·6). 프로필 **조회는 성공했으나** 동기화만 실패한 경우에도 **조용히 넘어가면** 타임존·동의 상태 괴리 등 **CS 리스크**가 커집니다.

```ts
import { useCallback, useEffect, useRef } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang } from '../types';
import {
  fetchUserProfileSafe,
  syncUserProfileClientFactsSafe,
} from '../services/authProfileService';

/** Rule 8: 제품 기본 언어 — `appShellMessages` 기본 로캘과 동일 */
const APP_SHELL_DEFAULT_LANG: AppLang = 'ko';

// export function useAuth(lang: AppLang) { … }
// useAuth 훅 본문 최상단(다른 ref/state 선언부): `const profileSyncRequestIdRef = useRef(0);`

const EMPTY_PROFILE: AppUserProfile | null = null;

useEffect(() => {
  return () => {
    profileSyncRequestIdRef.current += 1;
  };
}, []);

const fetchUserProfile = useCallback(async (userId: string | null | undefined): Promise<void> => {
  const trimmedUserId = (userId ?? '').trim();
  if (trimmedUserId.length === 0) {
    profileSyncRequestIdRef.current += 1;
    setUserProfile(EMPTY_PROFILE);
    return;
  }

  const syncRequestId = profileSyncRequestIdRef.current + 1;
  profileSyncRequestIdRef.current = syncRequestId;

  const profileResult = await fetchUserProfileSafe(trimmedUserId);

  if (profileSyncRequestIdRef.current !== syncRequestId) {
    return;
  }

  if (!profileResult.ok) {
    setUserProfile(EMPTY_PROFILE);
    return;
  }

  setUserProfile(profileResult.data);

  const syncResult = await syncUserProfileClientFactsSafe({
    userId: trimmedUserId,
    detectedTimezone: getDeviceTimeZone(),
    pendingConsentRaw: readPendingConsentFromStorage(),
  });

  if (profileSyncRequestIdRef.current !== syncRequestId) {
    return;
  }

  if (!syncResult.ok) {
    showErrorToast(
      APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ??
        APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError,
    );
  }
}, [lang]);
```

핵심:

- 조회와 후처리 write를 **서로 다른 서비스 command**로 나눕니다.
- hook은 더 이상 profile row shape를 모르고, B2 서비스 결과만 소비합니다.
- **`profileSyncRequestIdRef`는 훅 본문 최상단 선언** + `fetch` 완료 직후·`sync` 완료 직후 **두 번** stale 검증으로, 탭/세션 전환·로그인 연타 시 과거 응답이 최신 상태를 덮지 않게 합니다.
- **`!profileResult.ok` → `EMPTY_PROFILE`** — 에러 응답의 `data` 맹신 금지.
- **`!syncResult.ok` → `showErrorToast`** with **`?.` + `APP_SHELL_DEFAULT_LANG` 폴백** — `console.error`만으로 Silent Failure 방치 금지(Rule 11·B3)·**강제 `APP_SHELL_MESSAGES[lang].` 금지**(Rule 6).
- **effect cleanup**으로 언마운트 뒤 `setUserProfile` 좀비 커밋 방지.
- 빈 `userId` 진입 시 **ref 증가**로 이전에 떠 있는 profile/sync 비동기 체인이 끝나도 커밋되지 않게 합니다.
- 1차에서는 `setUserProfile`과 기존 공개 API를 유지하면서 내부 구현만 정리할 수 있습니다. **`useAuth(lang: AppLang)`** 로 `lang`을 받아 토스트 SSOT에 연결합니다(호출부 `App` 등에서 `lang` 전달).

### 3.7 Before: `useMultiSplitExecution`은 같은 가격을 두 번 fetch합니다

```ts
if (multiSplitPhase === 'first' || multiSplitPhase === 'second') {
  let currentPrice = 0;
  try {
    const stockPrices = await fetchStockPrices([targetStock]);
    currentPrice = stockPrices[targetStock]?.price || 0;
  } catch (err) {
    console.warn('[useMultiSplitExecution] fetchStockPrices 실패:', targetStock, err);
  }

  const basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0);
  // ... calcMultiSplitOrders ...
}

let nextInsufficient = false;
try {
  const stockPrices = await fetchStockPrices([targetStock]);
  const cp = stockPrices[targetStock]?.price ?? 0;
  nextInsufficient = cp > 0 && portfolio.dailyBuyAmount < cp;
} catch (err) {
  console.warn('[useMultiSplitExecution] insufficientAmount 체크용 주가 fetch 실패:', err);
}
```

문제:

- 같은 effect 안에서 같은 symbol을 두 번 조회합니다.
- `basePrice`와 `insufficientAmount`가 **서로 다른 시점의 가격**을 볼 수 있습니다.
- `multiSplit!` non-null assertion도 남아 있습니다.

### 3.8 After: 전략 실행 훅 — [Option A: 전용 어댑터]·[I/O/CPU 분리]·네트워크 스냅샷·에러 정책 동결

**[POLICY FREEZE — §3.8 다분할 실행 훅]:** 본 절 **본문 규칙·타입스크립트 스니펫·하단 핵심 불릿**은 회장님 최종 정책에 따라 **B3 구현의 단일 소스(SSoT)** 로 **동결**합니다. 변경이 필요하면 **아키텍처 리뷰·본 문서 개정**을 선행합니다.

**회장님 최종 결정 — `targetStock` 도메인 불변식:** 포트폴리오 **생성·편집 경로**에서 **종목(`targetStock`) 선택이 강제**되므로, 본 훅이 마운트되는 런타임에서는 **`targetStock`이 `null`/빈 문자열일 수 없다**는 **무결성**을 전제합니다. §3.8 스니펫은 **`targetStock == null` 분기·`strategy?.targetStock?.trim() || null` 등 중복 방어를 두지 않고** 평탄화합니다. **레거시·마이그레이션 데이터**만 별도 **어댑터/백필**로 정리하고, 훅 내부에서 빈 심볼 fetch를 막기 위한 **방어적 `trim`** 은 **책임 경계 밖**(포트폴리오 파이프라인 SSOT)으로 둡니다.

B2 `ServiceResult<T>` 는 **`.ok` 검증 전에는 `data` 필드를 맹목 접근하지 않습니다.** (Zero-Trust)

**Rule 2·10 — 이종(Heterogeneous) 결합 금지·I/O vs CPU 분리 (DDoS 스팸 원천 차단):** **`tradeInputs`·`dailyBuyAmount`·`avgPrice`·`currentQuantity`·`multiSplitPhase`·`totalSplitCount`·`isTargetReturnRateValid`·`isDailyBuyAmountValid` 등이 바뀔 때마다** 시세·거래일 **네트워크를 재호출하면 안 됩니다.** 이전 스니펫처럼 **B1 동기 계산(`calcQuarterStopLossOrders` 등)과 `fetchLatestStockSnapshot`을 동일 `useEffect`에 넣고**, 그 effect deps에 위 변수를 **끌어들인 것은 Rule 2·10 위반**입니다(예산·분할 횟수·수익률만 바꿔도 **거래소 재요청**). **확정:** **`useEffect`는 I/O만** 수행하고 **`MultiSplitNetworkSnapshot` 등 “통신 결과만” state에 기록**합니다. **쿼터·다분할 표시값**은 **`networkSnapshot` + `tradeInputs`·`dailyBuyAmount`·holdings 등을 입력으로 하는 `useMemo`(동기 B1 조립)** 에서만 파생합니다. **I/O effect deps는 극소화:** **`[targetStock]`만** — **`lang` 전환이 fetch를 재트리거하면 안 되며** **`networkErrorMsg` 문자열도 deps에 넣지 않습니다.** **비동기 완료 시 토스트 Stale closure**는 **`useLayoutEffect(() => { networkErrorMsgRef.current = networkErrorMsg; }, [networkErrorMsg])`** 로 **렌더 페이즈 밖에서** ref를 갱신하거나 **`showErrorToast` 직전에 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError`를 현장 조회**합니다(`AppLang` 통제·**`?.`/`??` 폴백 데드 코드 없음** — 마스터 플랜 [lang·앱 셸 딕셔너리])(**렌더 바디에서 `ref.current = …` 금지** — Rule 2·Concurrent 티어링 방지). **향후 deps에 추가할 수 있는 원시 불린은 사용자 입력·`lang`과 무관한 전역 I/O 게이트**(예: 기능 플래그)**에 한정**하고, **`isTargetReturnRateValid`·`totalSplitCount`·`isDailyBuyAmountValid` 등 입력 유효성 불린은 절대 I/O deps에 넣지 않음** — 해당 검증은 **파생 `useMemo` 입구**로만 이관합니다.

**트레이드오프(동결):** **`targetStock`은 도메인 불변식으로 항상 유효**하며, **예산·분할·수익률만 일시적으로 무효**인 동안에도 **`networkSnapshot`은 이전 fetch 결과를 유지**할 수 있습니다(통신은 **종목 전환** 시에만 갱신). **UI·B1 노출은 파생 `useMemo`가 `null`로 막으므로** 잘못된 조합 표시는 나가지 않습니다. **불필요 fetch 1회**를 허용해 **타이핑마다 DDoS** 를 막는 쪽이 우선순위입니다.

**[Option A] 네트워크 스냅샷 정책 (이종 분리 우선):** 병렬 **`Promise.all`** 은 유지하되, **스냅샷은 “최근 거래일·시세 양 축 모두 `ok`”일 때만** 설정합니다. **한 축만 실패**하면 **스냅샷 `null`**·**범용 토스트 1회**로 단순화합니다(과거 “한 축만 성공해도 커밋”보다 **불필요 통신·잘못된 조합 노출**을 막는 **동결 우선순위**). 알림은 **`showErrorToast(networkErrorMsgRef.current)`**(또는 **동등한 현장 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError`**) 만 — §3.8에서 **`networkErrorMsg`** 는 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독**(마스터 플랜·Rule 6 데드 코드 금지)·**`useMemo` 금지**. **Double Toast 금지**는 **`isQuoteInvalid` + 단일 조건** 유지.

**스냅샷 무효·1-B·2-A(전면 무효 + 동일 범용 토스트):**  
- **[정책 1-B]** `quoteResult.ok === true`인데 **`price`가 비유한(`!Number.isFinite`)이거나 `<= 0`** → **functional `setNetworkSnapshot` 무효화**·**`showErrorToast`**(위 단일 조건에서 1회).  
- **[정책 2-A]** `try/catch` **예외** → **`setNetworkSnapshot` 무효화 + `showErrorToast`**. **심볼 전환·재요청 시작 시**에도 **이전 스냅샷 잔상 방지**를 위해 effect 유효 진입 직후 **스냅샷을 끊되**, **Rule 10:** **`setNetworkSnapshot((prev) => (prev !== null ? null : prev))`** 로 **이미 `null`이면 bailout** 합니다.

**회장님 최종 결정 — [Option A: 전용 어댑터 패턴](B1 경계 보호):** B1 핵심 엔진(계산기)을 보호하기 위해 **`as TradeInput[]` 등 강제 캐스팅은 전면 금지**입니다. **`toTradeInputsForMultiSplit(trades)`** 같은 **순수 어댑터 함수**로 `Trade[]` → B1 규격 `TradeInput[]`를 **명시 매핑**한 뒤 `calcT`·`calcQuarterStopLossOrders` 등에 주입합니다. **Option B 절대 금지:** B1 시그니처를 `Trade[]`에 맞게 **수정해 타입 불일치를 덮는 것**은 **채택하지 않습니다**(수학·회귀 반경 보호). `calcMultiSplitOrders`에는 **검증된 양의 유한 가격**만 전달합니다.

**회장님 최종 결정 — 분할 횟수 `0` 원천 차단:** 다분할 매매에서 **`totalSplitCount === 0`** 은 `getPhase`의 **`a / 2`·`a - 1`** 등으로 **수학적 치명상(0 나눗셈·역전 구간)** 을 유발하는 **비정상 상태**입니다. **`multiSplitPhase`는 `null`** 로 두고, **파생 `useMemo` 입구**에서 **`totalSplitCount === 0`** 을 **명시 차단**해 B1 쿼터·다분할 출력을 내지 않습니다. **I/O effect는 이 플래그로 스냅샷을 비우지 않습니다**(종목만 바뀔 때 통신).

**Rule 1 — `dailyBuyAmount`(1회·일일 매수 예산) 양수 가드:** `calcT`는 B1에서 **`areStrictPositiveFiniteScalars(dailyBuyAmount)`** 로 내부 방어합니다. 훅에서는 **동일 SSOT** 로 **`isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount)`** (`utils/financialScalarGuards`) — **인라인 `dailyBuyAmount > 0` 단독 검사 금지**. **`dailyBuyAmount = portfolio.dailyBuyAmount ?? 0`** 정규화 후 적용합니다. **`isDailyBuyAmountValid === false`** 이면 **`currentRound`·`multiSplitPhase`·파생 출력이 비활성**됩니다.

**Rule 1 — 목표 수익률 `[선택 A]` 차단:** **`targetReturnRate`** 는 **`isTargetReturnRateValid = areStrictPositiveFiniteScalars(targetReturnRate)`** 로 **파생 `useMemo`·의미 있는 B1 노출을 원천 차단**합니다(`null`/`undefined`/비유한/`<= 0` 일괄 false)(**I/O effect deps에는 넣지 않음**). **`validateFinancialArgs`**(VR용 throw API)는 **본 훅 boolean 가드에 쓰지 않습니다**.

**Rule 6 — 종목 식별자(도메인 SSOT):** **`targetStock` 유효성(비어 있지 않은 종목 코드)** 은 **포트폴리오 생성·편집·검증기**에서 보장합니다. §3.8 훅은 **`trim`·`null` 가드로 fetch 인자를 재검증하지 않습니다**(위 **회장님 최종 결정 — `targetStock` 도메인 불변식** 과 동일).

**Rule 6 — Double Toast 금지:** `!recentDaysResult.ok || !quoteResult.ok` 에서 토스트를 띄운 뒤, **[정책 1-B]** 비정상 시세에서 **다시 토스트**하면 **한 틱에 알림이 2회** 나갈 수 있습니다(예: 거래일 축 실패 + 시세 축은 `ok`이나 `price` 비정상). **확정:** `quoteResult.ok`일 때만 검사한 **`isQuoteInvalid`** 를 두고, **`!recentDaysResult.ok || !quoteResult.ok || isQuoteInvalid`** 를 **단일 조건**으로 **`showErrorToast`를 최대 1회** 호출한 뒤, `isQuoteInvalid`이면 **EMPTY + return** 합니다.

**Rule 6·7·10 — 어댑터 방어:** **`toTradeInputsForMultiSplit`** 는 **`trades`가 `undefined`/`null`**·**비배열**·**`length === 0`** 이면 **공용 `EMPTY_TRADE_INPUTS`** 를 반환해 **`trades.map` WSOD**·**`tradeInputs` 참조 흔들림**을 차단합니다(매 렌더 `return []` 금지). 시그니처는 **`Trade[] | undefined | null`** 을 받습니다. holdings는 **`calculateHoldingsFromTrades(trades ?? EMPTY_TRADES)`** 처럼 **모듈 상수 빈 배열**을 써서 `undefined`일 때 **deps 안정성**을 유지합니다.

**[Option A: 매매 내역 전용 holdings 계산기] (회장님 동결):** `avgPrice`·`currentQuantity` 파생은 **`calculateHoldingsFromTrades(trades: Trade[])` 단일 진입점**만 사용합니다. **`calculateHoldings(portfolio)`** 를 훅에서 직접 호출하거나, **`useMemo(..., [portfolio])`** 로 **통객체를 deps에 묶는 패턴**은 **금지**입니다 — 매매와 무관한 필드(전략 객체 참조·메타데이터) 변경만으로 **holdings 헛바퀴·Stale 위험**이 커지기 때문(Rule 10). 구현·배치는 **`utils/portfolioCalculations`** 사전 조치 문단을 따릅니다.

**타입 정합(B2 ↔ 스냅샷 ↔ B1):** `MultiSplitNetworkSnapshot.recentTradingDays` 는 문서·스니펫에서 **`TradingDay[]`** 로 표기합니다. **동결 시점 제품 B2**(`getRecentTradingDaysFromDb` 등)는 **`string[]`(YYYY-MM-DD)** 를 반환하므로 **`type TradingDay = string`** 별칭으로 **런타임·B1 `calcQuarterStopLossOrders`의 `string[]` 인자**와 충돌 없이 연결합니다. B2 payload가 향후 구조화되면 **어댑터에서 `TradingDay[]` → B1 규격**을 맞추거나 본 문서를 **재동결**합니다.

**B1 엔진 규격 정밀 매핑 (`MultiSplitParams`):** `utils/multiSplitCalc.ts`에 정의된 **`MultiSplitParams`** 는 **딱 세 필드**만 갖습니다 — `targetStock: string`, `targetReturnRate: number`, `totalSplitCount: number`. **`calcQuarterStopLossOrders`** 의 `multiSplit` 인자 타입이 **`MultiSplitParams`** 이므로, 훅에서는 **`portfolio.strategy.multiSplit` 통 객체를 그대로 넘기지 않습니다.** **파생 `useMemo` 내부**에서 위 **원시값 3개만**으로 **`safeStrategyObj: MultiSplitParams`** 를 **핀셋 조립**합니다. B1에 없는 필드를 실어 보내거나, 참조 불안정한 상위 객체를 그대로 전달하는 것은 **금지**입니다. **`calcMultiSplitOrders`** 는 객체가 아니라 **`A`·`a`·`T` 등 이미 풀린 스칼라**를 받으므로 동일 원시값을 그대로 전달합니다.

**Rule 2·10 — 무한 통신 폭격(DDoS) 경고(명문화, 필수 문구):** **객체(`strategy` 등)를 I/O `useEffect` deps에 넣지 말 것.** **`tradeInputs`·`dailyBuyAmount`·`totalSplitCount`·`isTargetReturnRateValid`·`isDailyBuyAmountValid`·holdings 파생을 I/O effect deps에 넣지 말 것.** **I/O deps는 `targetStock`만** — **`networkErrorMsg`·`lang`은 deps에 넣지 않음**(본 절 동결). 상세는 본 절 첫 단락 **이종 결합 금지**·**토스트 ref/현장 조회**와 동일.

**Rule 2·10 — effect cleanup:** `useEffect`는 **`void runFetch()`만 두고 끝내지 않습니다.** cleanup에서 **`requestIdRef.current += 1`** 을 호출해, **언마운트 또는 의존성 재실행 시점**에 이전 비동기 `runFetch`의 `requestId`와 ref가 어긋나게 하여, I/O 완료 후에도 **`requestIdRef.current !== requestId` 가드가 좀비 `setNetworkSnapshot`을 차단**합니다.

**Rule 6 — effect `run` 내부 중첩·알림:** `if (quoteResult.ok)` 안에 또 `if (!Number.isFinite…)` 안에 `if (requestIdRef…)`처럼 **3-Depth 이상 중첩**은 금지입니다. **비정상 시세**는 **`isQuoteInvalid` 선계산** 후 **early return**으로 평탄화합니다. **축 실패 토스트**와 **1-B 토스트**를 **분리 호출하지 말고** 한 조건으로 **1회만** 호출합니다(Double Toast 금지).

**Rule 2·10 — Stale closure 차단 + Rule 10(CPU 헛바퀴 차단):** holdings는 **`calculateHoldingsFromTrades(trades ?? EMPTY_TRADES)` + `useMemo([trades, targetStock])`** 만 사용합니다. **`avgPrice`·`currentQuantity`는 I/O effect deps에 넣지 않습니다**(이종 결합·통신 스팸 방지). 네트워크 스냅샷이 없을 때는 파생 `useMemo`가 **null 출력**만 하면 됩니다.

**Rule 2·10 — effect deps에 `strategy` 통 객체 금지(위 DDoS 경고와 동일 원칙):** deps에 **`portfolio.strategy.multiSplit` 참조**를 두지 않습니다. **I/O effect**에는 **`targetStock`만** deps에 둡니다(**`networkErrorMsgRef`는 `useLayoutEffect([networkErrorMsg])`로만 갱신**). B1 **`safeStrategyObj: MultiSplitParams`** 는 **파생 `useMemo` 내부**에서만 조립합니다.

**Rule 2 — blind `useMemo` 금지 + 렌더 페이즈 ref 변이 금지:** `calcT`·`getPhase`·**`networkErrorMsg`(딕셔너리에서 문자열 한 줄 꺼내기)** 수준의 **O(1)** 연산은 **`useMemo` 없이** 매 렌더 즉시 계산합니다. **`networkErrorMsgRef.current` 갱신은 렌더 바디에서 하지 않습니다** — **`useLayoutEffect(() => { networkErrorMsgRef.current = networkErrorMsg; }, [networkErrorMsg])`** 만 허용(`useMutexAction`의 **`actionRef`** 정책과 동일). 대안으로 **`catch`/실패 분기에서 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 직접 조회**(`AppLang` 통제 전제)해 **Stale closure**를 막을 수 있으며, **`networkErrorMsg`를 I/O `useEffect` deps에 올리지는 않습니다.** **예외:** **`networkSnapshot`을 입력으로 쿼터·다분할 B1 전체를 한 번에 조립**하는 블록은 **의도적 `useMemo`**(다수 입력 동기화·렌더 비용)로 둡니다. **`tradeInputs`·holdings** 는 기존과 같이 **`useMemo([trades])` / `[trades, targetStock]`** 만 사용합니다.

**Rule 5·10 — [Option A: 전용 어댑터] DRY:** **`toTradeInputsForMultiSplit`** 는 **`useMemo([trades])` 한 번**으로 **`tradeInputs`** 를 만들고, **`calcT`·파생 `useMemo` 내 `calcQuarterStopLossOrders`** 가 **동일 참조를 재사용**합니다(I/O effect 안에서는 **B1 호출 금지**).

**Rule 7:** 훅 본문에 **`as TradeInput[]`를 두지 않습니다.** **`toTradeInputsForMultiSplit`**(또는 동등 SSOT 이름) **한 경로**만 B1 입력으로 연결합니다.

**구현 PR 사전 조치 — `utils/portfolioCalculations` ([Option A: 매매 내역 전용 계산기]):** 스니펫의 **`calculateHoldingsFromTrades(trades: Trade[])`** 는 **신규 추가 또는 기존 holdings 로직에서 분리**해 **`utils/portfolioCalculations`** 에 **단일 SSOT** 로 둡니다. 시그니처는 **`Trade[]`만** 받고 **`Portfolio`·통객체 인자는 받지 않습니다.** 기존 **`calculateHoldings(portfolio)`** 가 **`portfolio.trades`만** 사용한다면, 그 **순수 코어를 `calculateHoldingsFromTrades`로 추출**하고 **`calculateHoldings`는 얇은 래퍼**(내부에서 `calculateHoldingsFromTrades(portfolio.trades)` 호출)로 정리하는 것이 **동결된 권장 형태**입니다. 훅(§3.8)은 **래퍼가 아닌 전용 함수만** 직접 import 합니다.

```ts
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang, Portfolio, Trade } from '../types';
import type {
  MultiSplitExecutionResult,
  MultiSplitParams,
  QuarterStopLossResult,
  TradeInput,
} from '../utils/multiSplitCalc';
import {
  calcMultiSplitOrders,
  calcQuarterStopLossOrders,
  calcT,
  getPhase,
  RECENT_TRADING_DAYS_COUNT,
} from '../utils/multiSplitCalc';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import { calculateHoldingsFromTrades } from '../utils/portfolioCalculations';
import {
  fetchLatestStockSnapshot,
  getRecentTradingDaysFromDbSafe,
} from '../services/stockService';

/**
 * B2 최근 거래일 payload — `MultiSplitNetworkSnapshot.recentTradingDays` 와 1:1 정합.
 * 현재 제품 `stockService`의 최근 거래일 API 성공 값은 **ISO 날짜 `string`(YYYY-MM-DD) 배열**이며,
 * B1 `calcQuarterStopLossOrders`의 `recentTradingDays: string[]` 와 구조 동일합니다.
 * 향후 B2가 행 단위 레코드 배열로 승격되면 **본 별칭·어댑터·(필요 시) B1 시그니처**를 별도 합의로 개정(본 문서 재동결).
 */
type TradingDay = string;

/** Rule 8: 기본 수수료율은 제품 상수와 동일한 단일 소스를 가정(하드코딩 산재 금지) */
const DEFAULT_PORTFOLIO_FEE_RATE = 0.25;

/** `trades`가 undefined일 때 useMemo deps·holdings 계산용 참조 안정 빈 배열 */
const EMPTY_TRADES: Trade[] = [];

/** Rule 10: 어댑터 빈 결과·`tradeInputs` 참조 안정(매 렌더 `[]` 신규 생성 금지) */
const EMPTY_TRADE_INPUTS: TradeInput[] = [];

/**
 * [Option A: 전용 어댑터 패턴] `Trade[]` → B1 엔진 규격 `TradeInput[]`.
 * Rule 6·7·10: nullish/비배열/빈 배열 → 공용 `EMPTY_TRADE_INPUTS` — WSOD·참조 흔들림 방지.
 */
function toTradeInputsForMultiSplit(
  trades: Trade[] | undefined | null,
): TradeInput[] {
  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return EMPTY_TRADE_INPUTS;
  }
  return trades.map((trade) => ({
    type: trade.type,
    stock: trade.stock,
    date: trade.date,
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    ...(trade.isMOC !== undefined ? { isMOC: trade.isMOC } : {}),
  }));
}

/** Rule 10: I/O effect가 state에 남기는 것은 “통신 결과”만 */
interface MultiSplitNetworkSnapshot {
  currentPrice: number;
  recentTradingDays: TradingDay[];
}

export function useMultiSplitExecution(
  portfolio: Portfolio,
  lang: AppLang,
): MultiSplitHookResult {
  // 도메인 불변식: 다분할 포트는 생성·편집 시 종목 필수 — multiSplit·targetStock 존재는 파이프라인 SSOT.
  const { targetStock, targetReturnRate, totalSplitCount } =
    portfolio.strategy.multiSplit;
  const { trades, dailyBuyAmount: dailyBuyAmountRaw, isQuarterMode, feeRate } =
    portfolio;

  const dailyBuyAmount = dailyBuyAmountRaw ?? 0;
  const isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount);
  const isTargetReturnRateValid =
    areStrictPositiveFiniteScalars(targetReturnRate);

  const tradeInputs = useMemo(
    () => toTradeInputsForMultiSplit(trades),
    [trades],
  );

  const { avgPrice, currentQuantity } = useMemo(() => {
    const holdings = calculateHoldingsFromTrades(trades ?? EMPTY_TRADES);
    const targetHolding = holdings.find((h) => h.stock === targetStock);
    return {
      avgPrice: targetHolding?.avgPrice ?? 0,
      currentQuantity: targetHolding?.quantity ?? 0,
    };
  }, [trades, targetStock]);

  const requestIdRef = useRef(0);

  // Rule 2·6: O(1) 문자열 — blind useMemo 금지. lang은 AppLang 통제 — ?. / ?? 폴백 데드 코드 없음.
  const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;

  const networkErrorMsgRef = useRef(networkErrorMsg);

  // Rule 2: 렌더 바디에서 ref.current 대입 금지 — Concurrent 렌더 티어링 방지. useMutexAction actionRef와 동일 원칙.
  useLayoutEffect(() => {
    networkErrorMsgRef.current = networkErrorMsg;
  }, [networkErrorMsg]);

  const [networkSnapshot, setNetworkSnapshot] =
    useState<MultiSplitNetworkSnapshot | null>(null);

  /*
   * Rule 2·10 [완전 I/O 격리]: 통신 useEffect deps는 targetStock만 — lang·networkErrorMsg 금지.
   * 토스트 문구: networkErrorMsgRef는 useLayoutEffect([networkErrorMsg])로만 갱신(또는 catch/분기 내 APP_SHELL_MESSAGES[lang].dailySummaryNetworkError 직접 조회).
   * 분할·예산·수익률 검증은 파생 useMemo로 이관 — 타이핑마다 시세 재요청(DDoS) 금지.
   */
  useEffect(() => {
    setNetworkSnapshot((prev) => (prev !== null ? null : prev));

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const runFetch = async () => {
      try {
        const [recentDaysResult, quoteResult] = await Promise.all([
          getRecentTradingDaysFromDbSafe(
            targetStock,
            RECENT_TRADING_DAYS_COUNT,
          ),
          fetchLatestStockSnapshot(targetStock),
        ]);

        if (requestIdRef.current !== requestId) {
          return;
        }

        let isQuoteInvalid = false;
        if (quoteResult.ok) {
          const p = quoteResult.data.price;
          if (!Number.isFinite(p) || p <= 0) {
            isQuoteInvalid = true;
          }
        }

        if (!recentDaysResult.ok || !quoteResult.ok || isQuoteInvalid) {
          if (requestIdRef.current !== requestId) {
            return;
          }
          showErrorToast(networkErrorMsgRef.current);
        }

        if (isQuoteInvalid || !quoteResult.ok || !recentDaysResult.ok) {
          if (requestIdRef.current === requestId) {
            setNetworkSnapshot((prev) => (prev !== null ? null : prev));
          }
          return;
        }

        if (requestIdRef.current !== requestId) {
          return;
        }

        setNetworkSnapshot({
          currentPrice: quoteResult.data.price,
          recentTradingDays: recentDaysResult.data,
        });
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setNetworkSnapshot((prev) => (prev !== null ? null : prev));
        if (requestIdRef.current !== requestId) {
          return;
        }
        showErrorToast(networkErrorMsgRef.current);
      }
    };

    void runFetch();

    return () => {
      requestIdRef.current += 1;
    };
  }, [targetStock]);

  const currentRound = !isDailyBuyAmountValid
    ? 0
    : calcT(tradeInputs, dailyBuyAmount);
  const multiSplitPhase =
    totalSplitCount == null ||
    totalSplitCount === 0 ||
    !isDailyBuyAmountValid
      ? null
      : getPhase(currentRound, totalSplitCount);

  const {
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  } = useMemo(() => {
    if (
      networkSnapshot == null ||
      !isTargetReturnRateValid ||
      totalSplitCount == null ||
      totalSplitCount === 0 ||
      !isDailyBuyAmountValid
    ) {
      return {
        quarterStopLossData: null,
        multiSplitExecutionData: null,
        multiSplitInsufficientAmount: false,
      };
    }

    const { currentPrice, recentTradingDays } = networkSnapshot;
    const basePrice = avgPrice > 0 ? avgPrice : currentPrice;
    const insufficient = dailyBuyAmount < currentPrice;

    const safeStrategyObj: MultiSplitParams = {
      targetStock,
      targetReturnRate,
      totalSplitCount,
    };

    let qslData: QuarterStopLossResult | null = null;
    if ((isQuarterMode ?? false) && recentTradingDays.length > 0) {
      qslData = calcQuarterStopLossOrders({
        trades: tradeInputs,
        dailyBuyAmount,
        multiSplit: safeStrategyObj,
        feeRate: feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
        recentTradingDays,
        avgPrice,
        currentQuantity,
      });
    }

    let mseData: MultiSplitExecutionResult | null = null;
    if (
      (multiSplitPhase === 'first' || multiSplitPhase === 'second') &&
      basePrice > 0
    ) {
      mseData = calcMultiSplitOrders({
        phase: multiSplitPhase,
        A: targetReturnRate,
        a: totalSplitCount,
        T: currentRound,
        basePrice,
        currentQuantity,
        oneTimeAmount: dailyBuyAmount,
        feeRate: feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
      });
    }

    return {
      quarterStopLossData: qslData,
      multiSplitExecutionData: mseData,
      multiSplitInsufficientAmount: insufficient,
    };
  }, [
    networkSnapshot,
    isQuarterMode,
    tradeInputs,
    dailyBuyAmount,
    targetStock,
    targetReturnRate,
    totalSplitCount,
    feeRate,
    avgPrice,
    currentQuantity,
    multiSplitPhase,
    currentRound,
    isTargetReturnRateValid,
    isDailyBuyAmountValid,
  ]);

  return {
    currentRound,
    multiSplitPhase,
    isInQuarterMode: isQuarterMode === true,
    isInQuarterModeByT: multiSplitPhase === 'quarter',
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  };
}
```

핵심:

- `Promise.all`로 **최근 거래일 + 시세**를 병렬 로드합니다.
- **I/O vs CPU 분리:** **`useEffect`는 fetch만**·**`networkSnapshot`만 state**; **`calcQuarterStopLossOrders`·`calcMultiSplitOrders`는 파생 `useMemo`** 에서만 호출. **I/O deps는 `targetStock`만** — **`lang`·`networkErrorMsg`는 deps 금지**·토스트는 **`networkErrorMsgRef.current`**(또는 **현장 `APP_SHELL_MESSAGES` 조회**); **`totalSplitCount`·`isTargetReturnRateValid`·`isDailyBuyAmountValid`·`tradeInputs`·`dailyBuyAmount`·`avgPrice` 등은 넣지 않음** → 예산·분할·수익률·언어 전환 시 **통신 스팸 방지**.
- **네트워크 스냅샷:** **양 축 모두 `ok`** 일 때만 스냅샷 설정·그 외 **`null` + 토스트 1회**(이종 분리 우선). **Double Toast 금지**(`isQuoteInvalid` + 단일 조건).
- **[정책 1-B]:** 비정상 시세 → **functional `setNetworkSnapshot` 무효화**(토스트는 단일 조건 **1회**).
- **[정책 2-A]:** `catch` → **functional 무효화 + 범용 토스트**.
- **Rule 1:** **`isTargetReturnRateValid`·`isDailyBuyAmountValid`·`totalSplitCount`** 검증은 **파생 `useMemo`·`calcT`/`getPhase`** 에만 적용; **I/O 트리거는 `targetStock`만** — **토스트는 ref/현장 조회**로 **`lang` 전환 시에도 fetch 없이** 문구만 최신화.
- **Rule 2·10:** `useEffect` **cleanup**에서 `requestIdRef.current += 1` 로 이전 `runFetch` 무효화. **`requestIdRef.current !== requestId` 가드로 좀비 `setNetworkSnapshot` 차단**.
- **Rule 8:** 수수료 기본값은 **`DEFAULT_PORTFOLIO_FEE_RATE`** 한 곳만 두고, 분해된 **`feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE`** 로 병합합니다.
- **Rule 2·10 및 Rule 10:** effect deps에 **`portfolio` 통 객체를 넣지 않습니다.** **[Option A: 매매 내역 전용 계산기]** holdings는 **`calculateHoldingsFromTrades(trades ?? EMPTY_TRADES)` + `useMemo([trades, targetStock])`** 만 — **`calculateHoldings(portfolio)`·`[portfolio]` deps 금지** — 로 **`avgPrice`·`currentQuantity`** 를 파생해 **Stale closure**와 **무관 필드 변경 시 CPU 헛바퀴**를 끊습니다. I/O deps는 **`targetStock`만** — **토스트 문구는 `networkErrorMsgRef`(`useLayoutEffect([networkErrorMsg])`로만 갱신)** 로 **비동기 Stale**을 별도 차단합니다.
- **Rule 1:** **`isDailyBuyAmountValid`·`isTargetReturnRateValid`** 는 **`areStrictPositiveFiniteScalars`** 로 산출 — **`dailyBuyAmount`는 `?? 0` 정규화 후** 검사; 그때만 **`calcT`·쿼터/다분할 파생**.
- **Rule 6:** **`isQuoteInvalid` 선계산 + 단일 토스트 조건**으로 **Double Toast 방지**; **early return** 유지.
- **Rule 11 (토스트 도배·stale 요청):** `Promise.all` 직후 **`requestId` 가드**에 더해, **`showErrorToast` 호출 직전에 동일 `requestId`를 한 번 더 검증**해 종목을 연속 변경할 때 **이전 in-flight 요청의 실패 토스트**가 겹쳐 나오지 않게 한다(단일 스레드라도 이후 유지보수에서 `await`가 끼면 방어가 무너질 수 있어 **직전 재검증**을 둔다).
- **Rule 1·쿼터(T) 경계:** `isInQuarterModeByT`는 **`getPhase`와 별도 부등식으로 중복 정의하지 않는다** — B1 `getPhase(T,a)`가 정의하는 **쿼터 구간**과 **단일 SSOT**로 맞추기 위해 **`multiSplitPhase === 'quarter'`** 로만 노출한다(`calcT`의 `ceilToTwoDecimals` 산출과 **구간 판정 불일치**·미세 부동 소수 이중 해석을 끊음). **`Number.EPSILON`만 `totalSplitCount` 정수 경계에 덧대는 패턴**은 척도가 맞지 않아 **문서 동결 스니펫에 채택하지 않는다**.
- **Rule 2·10 (LOW — `lang` prop):** 리뷰에서 제안된 **`useMemo([lang])`로 `networkErrorMsg`를 만들고 I/O effect deps에 넣는 방식**은 **blind `useMemo`(O(1) 룩업)** 이자 **`lang` 변경 시 불필요 fetch 재트리거**로 **본 문서 동결(완전 I/O 격리·ref 토스트)** 과 **충돌**하므로 **채택하지 않는다**. **`lang` 인자를 훅에서 제거**하려면 호출부에서 **토스트/문구 레이어로 `lang` 소비를 이전**하는 별도 리팩터가 필요하다.
- **Rule 2·10 (DDoS·이종 결합, 필수 문구):** **I/O `useEffect` deps는 `targetStock`만** — **`networkErrorMsg`·`lang` deps 금지.** **`tradeInputs`·`dailyBuyAmount`·`totalSplitCount`·`isTargetReturnRateValid`·`isDailyBuyAmountValid`를 I/O deps에 넣지 말 것.**
- **Rule 2·3·6·11:** §3.8에서 **`networkErrorMsg`** 는 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독** 즉시 평가 — **`?.`/`??` 폴백 데드 코드 금지**(마스터 플랜 [lang·앱 셸 딕셔너리])·**`useMemo` 금지**(blind 최적화)·**`networkErrorMsgRef.current`는 렌더 바디가 아닌 `useLayoutEffect([networkErrorMsg])`에서만 갱신**·**비동기 분기에서는 `networkErrorMsgRef.current` 또는 현장 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 조회**로 **문구 Stale 방지**.
- **Rule 1·10:** **`isDailyBuyAmountValid`·`isTargetReturnRateValid`** 는 **`areStrictPositiveFiniteScalars`** (`utils/financialScalarGuards`, B1·`calcT`와 **동일 SSOT**) — **인라인 `> 0` 산재 금지**; **`toTradeInputsForMultiSplit`** 는 **빈·무효 입력 시 `EMPTY_TRADE_INPUTS` 공용 참조** 반환.
- **Rule 10:** 스냅샷 클리어는 **`setNetworkSnapshot((prev) => (prev !== null ? null : prev))`** 로 **불필요 리렌더 bailout**.
- **트레이드오프:** 입력만 깨진 상태에서 **`networkSnapshot`은 유지**될 수 있으나 **파생이 전부 `null`** 로 막음.
- **B1 규격:** `calcQuarterStopLossOrders`의 `multiSplit`은 **`utils/multiSplitCalc.ts`의 `MultiSplitParams` 3필드만** — **`safeStrategyObj: MultiSplitParams`** 핀셋 조립, **통 객체 그대로 전달 금지**.
- **분할 횟수 0:** **`totalSplitCount === 0`** 이면 **`multiSplitPhase`는 `null`**·**파생 `useMemo` 입구에서 차단** — I/O로 스냅샷을 비우지 않음.
- **Rule 2:** **`calcT`·`getPhase` 결과(`currentRound`·`multiSplitPhase`)는 blind `useMemo` 없이** 매 렌더 즉시 계산합니다.
- **Rule 5·10:** **`tradeInputs = useMemo(() => toTradeInputsForMultiSplit(trades), [trades])`** 로 **어댑터 단일화** — **`trades` nullish/비배열/빈 배열 → `EMPTY_TRADE_INPUTS`**(WSOD·참조 흔들림 방지). effect 내부 재호출 금지.
- **금융·성능(요약):** Stale `trades`/holdings는 **오래된 평단·수량**으로 쿼터/다분할을 돌려 **무에러 오판**을 유발할 수 있습니다. **`useMemo([portfolio, …])`** ·**`calculateHoldings(portfolio)`** 는 **[Option A] 금지** — **`trades`·전용 계산기만** Rule 10에 부합합니다.
- **[Option A: 전용 어댑터 패턴]:** **`toTradeInputsForMultiSplit` → `tradeInputs`** 로 `calcT` / `calcQuarterStopLossOrders` 주입 — **`as TradeInput[]` 전면 금지**, **B1 시그니처 변경(Option B) 절대 금지**.
- **`setNetworkSnapshot` 직전**에 **request id 재검사**로 stale 커밋을 막습니다.
- Rule 3·6: §3.8 토스트는 **`dailySummaryNetworkError` SSOT** — **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError`** 단독(§3.6·§3.13 등 타 절 스니펫은 문서 단계에서 **`?.`+폴백** 유지 가능, `AppLang` 통제 이관 시 동일 철거).
- **`targetStock`** 은 **도메인 불변식(포트폴리오 생성 시 필수)** — 훅은 **`null`/`trim` 재방어 없이** **`[targetStock]` deps로 종목 전환 시에만 I/O**; **`isTargetReturnRateValid` / `totalSplitCount` / `isDailyBuyAmountValid`** 는 **파생·`calcT`/`getPhase`** 에서만 막습니다.
- 공개 시그니처에 `lang`이 추가되므로 **1차 PR에서 호출부(`Dashboard` 등)에 `lang` 전달**이 필요합니다.
- `useNoStopMultiSplitExecution`도 **동일 §3.8 동결 패턴**: **`networkSnapshot` + I/O·CPU 분리**, **`calculateHoldingsFromTrades(trades)`·`[trades, targetStock]`만**([Option A] 통객체 holdings 금지), **`targetStock` 도메인 SSOT**(훅 내부 `trim`/null 가드 생략), **`areStrictPositiveFiniteScalars`·`totalSplitCount`는 파생만**, **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` + `networkErrorMsgRef` + `useLayoutEffect([networkErrorMsg])` 갱신(Rule 2)**, **I/O deps `targetStock`만**, **`EMPTY_TRADES`·`EMPTY_TRADE_INPUTS`**, **Double Toast 금지**·**`showErrorToast` 직전 `requestId` 재검증**, **파생 `useMemo`에서만 B1 호출**, **`isInQuarterModeByT`는 `getPhase` SSOT(`multiSplitPhase === 'quarter'`)**, **`totalSplitCount === 0` CPU 차단**, request id, cleanup, **`DEFAULT_PORTFOLIO_FEE_RATE`**.

### 3.9 Before: `useFCMToken`은 서비스 경계를 직접 침범합니다

```ts
const saveFCMToken = useCallback(async (userId: string): Promise<void> => {
  if (isTossApp()) {
    saveFCMTokenInProgressRef.current = null;
    return;
  }

  const { getNotificationPermission, requestForToken } =
    await import('../services/firebase');
  const token = await requestForToken();
  const deviceInfo = parseDeviceInfo();

  const { error } = await supabase
    .from('user_devices')
    .upsert({
      user_id: userId,
      fcm_token: token,
      device_type: deviceInfo.deviceType,
      // ...
    });

  if (error) {
    console.error('[FCM] Failed to save FCM token:', error);
  }
}, []);
```

문제:

- 훅이 Firebase import와 Supabase upsert를 모두 직접 수행합니다.
- in-progress ref는 있지만, 실패 코드가 UI/상위 훅에 노출되지 않습니다.
- B2 서비스 계층의 실패 분류를 우회합니다.

### 3.10 After: `useFCMToken`은 서비스 command를 감싼 얇은 hook으로 축소됩니다

수동 `userIdInFlightRef` 뮤텍스는 **삭제**하고, B3 표준 **`useMutexAction` 단일 경로**만 둡니다.  
`await` 이후 **`setLastErrorCode`는 `isMountedRef` 가드**로 언마운트 누수를 차단합니다. (Rule 2·6)

**도메인 실패(`ServiceResult`, 권한·네트워크 코드):** `lastErrorCode`만 갱신하고 **토스트는 상위(예: `useAuth`/`App`)가 `lastErrorCode`를 구독**해 SSOT 문구로 표시합니다.  
**예기치 않은 throw:** §3.13 계약에 따라 **`useMutexAction`이 토스트(내부 `try/catch`) + `throw error`(원본 유지)** 합니다.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppLang } from '../types';
import type { ServiceErrorCode } from '../services/serviceUtils';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import { saveUserFcmTokenSafe } from '../services/firebaseTokenService';
import { isTossApp } from '../services/tossAppBridge';
import { useMutexAction } from './useMutexAction';

/** Rule 8: 제품 기본 언어 — `appShellMessages` 기본 로캘과 동일 */
const APP_SHELL_DEFAULT_LANG: AppLang = 'ko';

export function useFCMToken(lang: AppLang) {
  const isMountedRef = useRef(true);
  const [lastErrorCode, setLastErrorCode] = useState<ServiceErrorCode | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getMutationFailureToastMessage = useCallback(
    () =>
      APP_SHELL_MESSAGES[lang]?.dailySummaryNetworkError ??
      APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].dailySummaryNetworkError,
    [lang],
  );

  const persistUserFcmTokenAction = useCallback(async (userId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isTossApp()) {
      return;
    }

    const trimmedUserId = userId.trim();
    if (trimmedUserId.length === 0) {
      if (isMountedRef.current) {
        setLastErrorCode('INVALID_INPUT');
      }
      return;
    }

    if (isMountedRef.current) {
      setLastErrorCode(null);
    }

    const result = await saveUserFcmTokenSafe(
      trimmedUserId,
      parseDeviceInfo(),
    );

    if (!isMountedRef.current) {
      return;
    }

    if (!result.ok) {
      setLastErrorCode(result.error.code);
    }
  }, []);

  const { run: runSaveFcmToken, isExecuting: isSaveFcmTokenExecuting } =
    useMutexAction(persistUserFcmTokenAction, {
      getMutationFailureToastMessage,
    });

  const saveFCMToken = useCallback(
    async (userId: string): Promise<void> => {
      await runSaveFcmToken(userId);
    },
    [runSaveFcmToken],
  );

  return {
    saveFCMToken,
    lastErrorCode,
    isSaveFcmTokenExecuting,
  };
}
```

핵심:

- 훅은 서비스 command의 **실행 상태 + 도메인 에러 코드 스냅샷**을 관리합니다.
- direct Supabase/Firebase import가 사라집니다.
- **`useMutexAction`** 으로 1-tick 중복 저장을 막고, **수동 in-flight ref는 사용하지 않습니다.**
- **Rule 10:** mutex에 넘기는 액션 본문은 **인라인 `async (...) => {}`로 두지 않고** **`useCallback`으로 참조를 고정**해 `useMutexAction` 내부 `useLayoutEffect`(액션 ref 동기화)의 불필요한 재실행을 줄입니다. (`parseDeviceInfo`·`saveUserFcmTokenSafe` 등 모듈 import + `setLastErrorCode` + ref는 **의존 배열 `[]`** 가 일반적으로 안전합니다.)
- **`isMountedRef`** 로 언마운트 이후 `setLastErrorCode` 커밋을 차단합니다.
- `saveUserFcmTokenSafe`의 **`!result.ok`** 는 **토스트 없이 `lastErrorCode`만** — 알림은 **호출부 책임**(Rule 3·SRP). 예기치 않은 throw만 §3.13 토스트.
- 공개 시그니처에 `lang`이 추가되면 **`useFCMToken(userProfile.preferred_language)`** 등 호출부 정렬이 필요합니다.

### 3.11 Before: `useTierDisplay`는 UI 텍스트를 직접 반환합니다

```ts
return {
  tierLabel: isPremium ? 'PREMIUM' : isPro ? 'PRO' : 'FREE',
  tierClassName: isPremium
    ? 'shimmer-text-premium'
    : isPro
    ? 'shimmer-text-pro'
    : 'text-free-matte',
  TierIcon: isPremium ? Crown : isPro ? Star : Zap,
};
```

문제:

- 훅이 semantic value가 아니라 **표시 문자열**을 직접 반환합니다.
- 중첩 삼항도 깊지는 않지만, leaf hook 기준으로 더 평평하게 만들 수 있습니다.

### 3.12 After: `useTierDisplay`는 semantic key와 스타일 metadata만 반환합니다

**Rule 2:** `tier`는 원시값이고 분기·객체 구성만 있으므로 **`useMemo`로 감싸지 않습니다**(blind `useMemo` 금지 — 오버헤드만 커질 수 있음). `React.memo` 자식에 참조 동일성을 보장해야 한다는 **명시적 요구가 있을 때만** 별도 설계합니다.

```ts
import { Crown, Star, Zap } from 'lucide-react';

type TierDisplayKey = 'free' | 'pro' | 'premium';

interface TierDisplay {
  tierKey: TierDisplayKey;
  tierClassName: string;
  TierIcon: typeof Crown;
  tierIconClassName: string;
}

function normalizeTierKey(tier: TierValue): TierDisplayKey {
  const normalized = (typeof tier === 'string' ? tier : 'free').toLowerCase();

  if (normalized === 'premium' || normalized === 'enterprise') {
    return 'premium';
  }

  if (normalized === 'pro') {
    return 'pro';
  }

  return 'free';
}

export function useTierDisplay(tier: TierValue): TierDisplay {
  const tierKey = normalizeTierKey(tier);

  switch (tierKey) {
    case 'premium':
      return {
        tierKey,
        tierClassName: 'shimmer-text-premium',
        TierIcon: Crown,
        tierIconClassName: 'premium-icon-breath',
      };
    case 'pro':
      return {
        tierKey,
        tierClassName: 'shimmer-text-pro',
        TierIcon: Star,
        tierIconClassName: 'pro-icon-twinkle',
      };
    case 'free':
      return {
        tierKey,
        tierClassName: 'text-free-matte',
        TierIcon: Zap,
        tierIconClassName: 'free-icon-zap',
      };
    default: {
      const exhaustiveCheck: never = tierKey;
      return exhaustiveCheck;
    }
  }
}
```

핵심:

- 훅은 더 이상 번역 가능한 표시 문자열을 직접 소유하지 않습니다.
- 상위 컴포넌트는 `tierKey`로 i18n dictionary를 조회하면 됩니다.
- `switch + never`로 Rule 7 완전성 검사를 만족합니다.
- **가벼운 파생 로직은 매 렌더 즉시 계산** — Rule 2의 blind `useMemo` 안티패턴을 피합니다.

### 3.13 After: `useMutexAction`은 B3/B4의 표준 mutation 래퍼로 고정합니다

`try` 안의 `await Promise.resolve(actionRef.current(...args))`만으로도 rejection은 **이론상** 호출자에게 전파되지만, 호출부가 `void run()`을 쓰면 **미처리 rejection + 무토스트**가 동시에 터질 수 있습니다.  
따라서 **`catch`에서** (옵션으로) **`showErrorToast`로 공통 피드백을 보장한 뒤 `throw error`로 반드시 rethrow** 하고, **`finally`의 `setIsExecuting(false)`는 `isMountedRef` 뒤에서만** 호출합니다.

**Rule 3·6·11 (Step 1.5 보강 — error-aware 토스트):** `getMutationFailureToastMessage`는 **`(error: unknown) => string | null`** 형태로 **실패 객체를 입력으로 받아** 토스트 문구를 결정합니다. 반환값이 **`null`** 이면 **토스트를 생략**합니다(도메인 에러는 상위 모달 등 다른 UX가 담당할 때 **Double Feedback 방지**). 토스트 문자열 자체는 하드코딩하지 않고 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError`** 등 SSOT에서만 가져옵니다. **`catch` 안에서 `showErrorToast`가 throw** 하면 **도메인 `error`가 삼켜지므로**, 토스트 호출은 **내부 `try/catch`로 감싸고 `console.error`만 남긴 뒤 `throw error`로 원본을 반드시 유지**합니다.

```ts
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';

export interface UseMutexActionOptions<Result> {
  getMutationFailureToastMessage?: (error: unknown) => string | null;
  lockedReturnValue?: Result;
}

export interface UseMutexActionResult<Args extends unknown[], Result> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

export function useMutexAction<Args extends unknown[], Result>(
  action: (...args: Args) => Result | Promise<Result>,
  options?: UseMutexActionOptions<Awaited<Result>>,
): UseMutexActionResult<Args, Awaited<Result>> {
  const isExecutingRef = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  const isMountedRef = useRef(true);

  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);

  useLayoutEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<Awaited<Result>> => {
      if (isExecutingRef.current) {
        return optionsRef.current?.lockedReturnValue as Awaited<Result>;
      }

      try {
        isExecutingRef.current = true;
        if (isMountedRef.current) {
          setIsExecuting(true);
        }
        return await Promise.resolve(actionRef.current(...args));
      } catch (error: unknown) {
        const toastMessage =
          optionsRef.current?.getMutationFailureToastMessage?.(error);

        if (toastMessage != null && toastMessage.trim().length > 0) {
          try {
            showErrorToast(toastMessage);
          } catch (toastError: unknown) {
            console.error('[useMutexAction] toast failed:', toastError);
          }
        }

        throw error;
      } finally {
        isExecutingRef.current = false;
        if (isMountedRef.current) {
          setIsExecuting(false);
        }
      }
    },
    [],
  );

  return useMemo(() => ({ run, isExecuting }), [isExecuting, run]);
}
```

핵심:

- **`catch`에서 Silent Failure 금지:** 토스트를 띄울 때는 **내부 `try/catch`** 로 감싸 **i18n/토스트 계열 throw가 도메인 `error`를 삼키지 않게** 하고, **`throw error`로 원본을 반드시** 상위까지 전달합니다.
- **`finally` + `isMountedRef`:** 언마운트 뒤 `setIsExecuting(false)`로 인한 경고·누수를 차단합니다.
- `actionRef`·`optionsRef` 갱신은 **`useLayoutEffect`** — Rule 2(렌더 중 ref 변이 금지)와 정합합니다.
- `getMutationFailureToastMessage`는 **`useCallback` 안정화** 권장 — **에러 종류별로 `null`(침묵) 또는 범용 네트워크 문구**를 반환해 **도메인 모달과 토스트가 동시에 뜨는 이중 알림**을 막습니다(§3.14).
- `lockedReturnValue`는 **이중 실행 시 조기 반환**에 사용할 수 있습니다(예: `null` 반환형 mutation).
- 호출부는 `void run()` 지양, 필요 시 `run().catch(...)`로 **rethrow된 rejection을 추가 처리**합니다.

### 3.14 `App.tsx` 오케스트레이션 정렬 (Step 1.5 — 구현 동기화)

`usePortfolios` 분해(`usePortfolioQuery`·`usePortfolioMutations`) 이후에도 **`App.tsx`** 에 남아 있던 **이중 `useMutexAction`** 과 **`runPortfolioMutation` + 하위 훅 토스트** 가 겹치면 **Double Lock·Double Feedback** 이 발생합니다. Step 1.5는 **근본 원인을 `App.tsx` 필터가 아니라 하위 엔진(`useMutexAction`·`usePortfolioMutations`)에서 먼저 교정**하고, 셸은 **얇은 오케스트레이터**만 남기는 계약입니다.

**사전 판정**

- `usePortfolioMutations`가 반환하는 `handleUpdatePortfolio`, `deletePortfolioById`, `handleDeleteHistory`, `handleClearHistory`, `handleAddTrade` 등은 이미 **내부 `useMutexAction` command**이다. `App.tsx`에서 다시 `useMutexAction`으로 감싸면 **이중 잠금**이다.
- `getMutationFailureToastMessage`가 에러 종류를 보지 않고 항상 **`dailySummaryNetworkError`** 만 반환하면, `portfolioLimitReached` 같은 **도메인 에러**에서도 **네트워크 토스트**가 먼저 뜨고 이어 **도메인 모달**이 뜰 수 있다 — **토스트 정책은 훅에서 error-aware 하게** 둔다.

**도메인 에러 식별 (저장소 SSOT)**

- `createPortfolioMutationError(...)` 는 코드를 **`Error.message`** 에 넣는다. **`error.code` 가 아닌** `error instanceof Error` + **`isPortfolioMutationErrorCode(error.message)`** 축으로 판별한다.

**`usePortfolioMutations` — 토스트 침묵(최소 동의)**

- **`PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached`** 는 **`getMutationFailureToastMessage(error)` 가 `null`** 을 반환해 **범용 네트워크 토스트를 침묵**한다. 그 외 인프라 실패는 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError`** 로 토스트한다.

**`App.tsx` — 이중 뮤텍스 제거**

- 제거 대상(예시): `handleUpdatePortfolioForDashboard`, `handleDeletePortfolio`, `handleSafeDeleteHistory`, `handleSafeClearHistory` 를 감싸던 **`useMutexAction`** 4개.
- 위 핸들러는 **`useCallback` + try/catch** 만 두고, 실패 시 **하위 훅 토스트를 신뢰**하며 상위에서는 **`console.error`** 만 남긴다(이미 훅에서 피드백이 나간 경우).

**`App.tsx` — 순수 저장 경로에서 `runPortfolioMutation` 제거**

- **`handleSaveTrade`:** `handleAddTrade` 직접 호출 후 광고 스케줄 등 후속만 수행.
- **알람 저장·AI 이미지 다중 거래·종료 저장** 등도 동일하게 **훅 command 직접 호출**로 정렬한다.

**`runPortfolioMutation` 잔존 범위**

- **전면 삭제가 아니라**, **도메인 모달이 제품 UX로 필요한 경로에만** 남긴다(예: 포트폴리오 생성).
- 래퍼 내부에서는 **`portfolioLimitReached`** 등 **모달을 열 도메인 에러만** `openPortfolioMutationNotice`로 연결하고, **네트워크 실패만으로는 범용 모달을 띄우지 않도록** `shouldOpenPortfolioMutationNotice(error)` 로 **`Error.message` + `isPortfolioMutationErrorCode`** 기준 필터를 둔다.

**상세 거래 삭제(상세 모달)**

- `handleDeleteTrade` 실패 시 **상위에서 다시 도메인 모달을 열지 않고** 로그만 남긴다 — 훅 토스트가 SSOT.

**Mental Compile (Step 1.5)**

- **Rule 11:** 하위 훅이 mutex SSOT, 셸은 이중 잠금 금지.
- **Rule 10:** 셸에 불필요한 `useMutexAction` 인스턴스·`isExecuting` churn 제거.
- **Rule 3·6:** 한도 초과는 **모달(또는 전용 공지) 중심**, 인프라 실패는 **토스트 중심** — 역할 침범 금지.

**구현 점검 체크리스트**

- `App.tsx`에서 제거한 wrapper가 하위 훅 command와 1:1 대응하는가.
- `runPortfolioMutation`이 **전략 생성 등 도메인 모달 경로** 외에는 남아 있지 않은가.
- `usePortfolioMutations`의 토스트 억제 목록(`portfolioLimitReached` 최소)이 합의와 일치하는가.
- `useMutexAction` 시그니처 변경이 다른 호출부와 충돌하지 않는가.

**결론(한 줄 동결)**

> `useMutexAction` 과 `usePortfolioMutations` 가 에러를 읽고 토스트 노출 여부를 먼저 결정한다. `App.tsx` 는 mutex·범용 모달을 중복 구현하지 않으며 순수 저장 경로의 `runPortfolioMutation` 을 제거한다. 도메인 공지가 필요한 경로만 예외적으로 모달 UX를 유지한다.

---

## 4. 실제 적용 시 체크리스트

### 4.0 [Option A] 동결 검증(필수)

- 본 구현이 **`§0.0 [Option A]` 표** 및 **§3.8·§3.6 등 본문에 적힌 A안**과 어긋나는 지름길(예: `as` 캐스팅, B1 Option B, 통 객체 effect deps, Silent Failure)이 없는가
- **[Option A: 매매 내역 전용 holdings 계산기]:** `useMultiSplitExecution`(및 동 패턴 훅)이 **`calculateHoldingsFromTrades(trades)`** 만 사용하고 **`calculateHoldings(portfolio)`·`Portfolio` 통객체를 holdings 산출에 넘기지 않는가**, holdings `useMemo` deps가 **`[trades, targetStock]`** 만인가( **`[portfolio]` 금지** ), **`utils/portfolioCalculations`** 에 전용 함수가 **SSOT** 로 존재하는가(§3.8)
- **B2↔스냅샷 타입 정합:** `networkSnapshot.recentTradingDays` 가 **B2 성공 `data`와 1:1**이며, 문서상 **`TradingDay[]`**(`= string[]` 별칭)과 B1 `calcQuarterStopLossOrders`의 **`string[]`** 요구가 **충돌 없이** 연결되는가(§3.8)
- **전용 어댑터:** `useMultiSplitExecution` 등이 **`toTradeInputsForMultiSplit` 단일 경로**로 B1에 연결되고 **Option B( B1 시그니처 변경 )** 가 없는가
- **어댑터 방어:** **`toTradeInputsForMultiSplit`** 가 **`trades` nullish/비배열/빈 배열** 에 **`EMPTY_TRADE_INPUTS`** 를 반환하고, holdings가 **`trades ?? EMPTY_TRADES`** 를 쓰는가(§3.8)
- **Rule 1:** **`isDailyBuyAmountValid`·`isTargetReturnRateValid`** 가 **`areStrictPositiveFiniteScalars`**(`utils/financialScalarGuards`)로 산출되고, 그때만 **`calcT`·쿼터/다분할 파생**·**파생 B1 노출**인가 — **인라인 `> 0` 산재 없음**(§3.8)
- **네트워크 스냅샷·I/O/CPU 분리:** **`networkSnapshot`은 양 축 `ok`일 때만** 커밋하는가; **I/O effect deps가 `targetStock`만**인가(`lang`·`networkErrorMsg`·`totalSplitCount`·`isDailyBuyAmountValid`·`isTargetReturnRateValid` **미포함**); **`networkErrorMsgRef`는 `useLayoutEffect([networkErrorMsg])`에서만 갱신**(렌더 바디 `ref.current` 대입 **금지**, Rule 2)인가; **토스트는 `networkErrorMsgRef.current` 또는 동등 현장 조회**인가; **[정책 1-B]·[정책 2-A]** 에서 스냅샷이 **functional update로 무효화**(bailout 포함)되는가(§3.8)
- **Double Toast 금지:** **`isQuoteInvalid`** 와 축 실패를 **단일 조건**으로 묶어 **`showErrorToast`가 틱당 1회**인가(§3.8)
- **토스트 SSOT·I18N 안전 접근:** 실패 알림이 **신규 하드코딩 문구 없이** **`dailySummaryNetworkError`** 만 쓰는가, **`APP_SHELL_MESSAGES[lang]?. … ?? APP_SHELL_MESSAGES[APP_SHELL_DEFAULT_LANG].…`** 패턴을 **`useMutexAction`·§3.6·§3.10** 등에 적용했는가(§3.8 동결: **`AppLang` 통제 전제로 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독** — 데드 `?.`/`??` 폴백 금지), **`useMutexAction` `catch`에서 토스트 실패 시에도 `throw error`(원본)** 가 유지되는가(§3.13)
- **널러블 userId:** `fetchUserProfile`·`fetchPortfolios` 등이 **`(id ?? '').trim()`** 으로 **`.trim()` WSOD** 를 막는가(§3.2·§3.6)
- **Rule 10·스냅샷:** §3.8에서 **`setNetworkSnapshot` 클리어가 functional update bailout** 인가
- **Silent Failure:** 프로필 **sync 실패·기타 부수 I/O 실패**에 **`console.*`만** 남는 경로가 없는가

### 4.1 일반 항목

- 훅이 raw `supabase` / raw SDK / raw `fetch`를 직접 import하지 않는가
- `ServiceResult<T>`를 훅 상태로 변환하는 패턴이 훅마다 제각각 복붙되지 않는가
- `usePortfolios`, `useAuth`의 메가 callback이 query / mutation / side effect / pure helper로 분리되는가
- `handleAddTrade`, `handleAddPortfolio`, `handleClosePortfolio` 같은 금융 mutation에 Rule 11 진입점을 확보했는가
- §3.4 `handleAddTrade`의 `getMutationFailureToastMessage`가 **Option A 확정**대로 **`dailySummaryNetworkError` 범용 재사용**을 하고 **`?.` + `APP_SHELL_DEFAULT_LANG` 폴백**(또는 **`AppLang` 통제 시 `APP_SHELL_MESSAGES[lang]` 단독**)을 포함하는가, **`(error: unknown) => string | null`** 로 **한도 초과 등 도메인 에러 시 `null`** 인가(포트폴리오 전용 안내문 신규 등록 없음·문자열 하드코딩 없음·§3.14)
- query 훅이 stale response를 request id ref 또는 abort로 막는가
- `usePortfolioQuery`가 remote **`result.ok` 가드 없이 `setPortfolios(result.data)`를 호출하지 않는가**, **effect cleanup으로 `requestIdRef` 무효화**가 있는가 (§3.2)
- `useAuth.fetchUserProfile`이 **`!profileResult.ok`일 때 `EMPTY_PROFILE`로 비우는 확정 정책**을 따르는가(`profileResult.data` 맹신 금지), **`!syncResult.ok`일 때 `dailySummaryNetworkError` 범용 토스트(`?.` + `APP_SHELL_DEFAULT_LANG` 폴백)**(Silent Failure·Rule 11 금지), **`(userId ?? '').trim()`** 로 널러블 방어, **`profileSyncRequestIdRef` cleanup**이 있는가 (§3.6)
- `useTierDisplay`가 **blind `useMemo` 없이** 가벼운 `switch`를 쓰는가 (§3.12)
- `useMultiSplitExecution`, `useNoStopMultiSplitExecution`이 같은 symbol price를 한 effect에서 중복 fetch하지 않는가
- `useMultiSplitExecution` 비동기 effect에 **cleanup(`requestIdRef` 무효화)** 과 **기본 수수료율 상수**가 스니펫·구현 모두 반영되었는가 (§3.8)
- `useFCMToken`이 `useMutexAction`에 **인라인 액션 대신 `useCallback` 고정 액션**을 넘기는가 (§3.10)
- 전략 실행 훅이 **`ServiceResult` `ok` 가드·양 축 성공 시 `networkSnapshot` 커밋·[정책 1-B]·[정책 2-A] 시 스냅샷 functional 무효화·`networkErrorMsgRef`를 `useLayoutEffect([networkErrorMsg])`로만 갱신·§3.8에서 **`APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독**(데드 `?.`+폴백 금지) 및 **즉시 평가** 토스트를 빠짐없이 만족하는가 (§3.8)
- `reduceServiceQueryState`가 실패 시 **`previous.data`를 보존**하는가 (§3.0)
- `useMultiSplitExecution`이 **`as TradeInput[]` 없이** **`tradeInputs` 단일 `useMemo` + `toTradeInputsForMultiSplit`(nullish·비배열·빈 배열 → `EMPTY_TRADE_INPUTS`)** 를 쓰는가, **[Option A]** **`calculateHoldingsFromTrades(trades ?? EMPTY_TRADES)` + `useMemo([trades, targetStock])`** 로만 holdings 파생·**`calculateHoldings(portfolio)`·`[portfolio]` deps 미사용**인가(Rule 10·Stale 방지), **`areStrictPositiveFiniteScalars`로 `isDailyBuyAmountValid`·`isTargetReturnRateValid` 산출**·**`dailyBuyAmount ?? 0`**·**`targetStock` 도메인 SSOT(훅 내부 null/`trim` 재방어 생략)** 로 Rule 1·6 가드하는가, **`networkErrorMsg`에 blind `useMemo` 없음**인가, **`isQuoteInvalid`+단일 토스트**로 Double Toast가 없는가, **I/O effect deps가 `targetStock`만**인가·**`networkErrorMsgRef`를 `useLayoutEffect([networkErrorMsg])`로만 갱신**(렌더 페이즈 ref 변이 금지)인가·**현장 조회로 토스트 Stale 방지**인가(DDoS·이종 결합·`lang` 재fetch 방지), B1은 **`networkSnapshot` + 파생 입력으로 `useMemo`에서만** 조립하는가, **`MultiSplitNetworkSnapshot.recentTradingDays: TradingDay[]`** 가 B2·B1과 정합되는가, **`safeStrategyObj`가 `MultiSplitParams` 3필드 핀셋**인가, **`totalSplitCount === 0`** 을 **파생·`getPhase` 경계에서 차단**하는가, **`currentRound`/`multiSplitPhase`에 blind `useMemo` 없이** 즉시 계산하는가, **`isInQuarterModeByT`가 `multiSplitPhase === 'quarter'`로 `getPhase` SSOT와 정합**인가, 실패 분기 **`showErrorToast` 직전 `requestId` 재검증**이 있는가, B1 시그니처 **Option B** 를 쓰지 않는가 (§3.8 **동결 정책**)
- `useAuth.fetchUserProfile` 경로에 **`profileSyncRequestIdRef`** stale 방어가 있는가 (§3.6)
- `useFCMToken`이 수동 in-flight ref 대신 **`useMutexAction`** 을 쓰고, `setState`에 **`isMountedRef`** 가드가 있는가 (§3.10)
- `useMutexAction`이 `catch`에서 **토스트 내부 `try/catch` + `throw error`(원본 유지)** , `finally`에서 **`isMountedRef` 가드 후 `setIsExecuting(false)`** 를 갖추었는가, `getMutationFailureToastMessage`가 **`(error: unknown) => string | null`** 이며 **`null`일 때 토스트 생략**인가, 범용 문구는 **`APP_SHELL_MESSAGES[lang]`** SSOT인가 (§3.13)
- **`App.tsx` (Step 1.5):** `usePortfolioMutations` command를 다시 `useMutexAction`으로 감싸 **이중 잠금**을 만들지 않았는가, **거래·알람·AI·종료 저장** 등에서 **`runPortfolioMutation` 중복**이 없는가, **한도 초과**는 **도메인 모달 중심·토스트 침묵**·그 외는 **범용 네트워크 토스트**로 정렬되었는가, 도메인 코드는 **`Error.message` + `isPortfolioMutationErrorCode`** 축인가 (§3.14)
- non-null assertion(`!`)이 hook 로직에서 제거되는가
- `useTierDisplay` 같은 leaf hook이 semantic key를 반환하고, 표시 문자열 하드코딩을 줄였는가
- `useVrOrders`의 `useMemo`가 실제 referential stability 목적에 부합하는가
- 훅이 실패를 `console.*`만 남기고 UI·토스트에 아무 신호도 주지 않는 경로가 없는가(§3.6 `syncUserProfileClientFactsSafe` 포함)
- 공개 훅 시그니처 변경 없이 1차 내부 마이그레이션이 가능한가
- B3가 B1 수학 helper와 B2 service result를 다시 우회하지 않는가

---

## 5. 최종 결론

**[Option A] 동결 재확인:** 회장님 지시에 따라 B3 설계는 **`§0.0`의 [Option A] 기조로 최종 채택**되었습니다. 이후 구현은 **본 문서를 단일 계약**으로 삼고, 변경은 **문서 개정 후**에만 반영합니다.

Phase B3의 본질은 `hooks/`를 예쁘게 정리하는 작업이 아닙니다.  
핵심은 **React 훅을 "서비스 재구현기"에서 "상태 조립기"로 되돌리는 것**입니다.

1. B1은 계산을 봉인했고, B2는 외부 경계를 봉인했습니다. B3는 이제 **그 둘을 다시 섞지 않고 연결만** 해야 합니다.
2. `usePortfolios`, `useAuth` 같은 메가 훅은 반드시 쪼개야 하지만, **공개 API는 1차에서 최대한 유지**해야 컴파일 에러 0건을 지킬 수 있습니다.
3. 전략 실행 훅은 **`networkSnapshot`(통신 결과만 state) + 단일 fetch 경로 + stale response 방어**로 정렬해야 하며(§3.8 **동결**), **I/O effect와 동기 B1은 분리**하고 **양 축 `ok`일 때만 스냅샷 커밋**; **I/O deps는 `targetStock`만**·**`lang`/`networkErrorMsg` deps 금지**·**`networkErrorMsg`는 즉시 평가(blind `useMemo` 금지) + `useLayoutEffect([networkErrorMsg])`로 `networkErrorMsgRef`만 갱신**(렌더 바디 ref 대입 금지, Rule 2)(또는 **effect/`catch` 내 `APP_SHELL_MESSAGES` 직접 조회**); **[정책 1-B]·[정책 2-A]** 에서 **`setNetworkSnapshot` functional bailout + `showErrorToast(networkErrorMsgRef.current)`**(또는 동등)** — **범용 토스트는 틱당 1회(Double Toast 금지)**. **Rule 1 가드(`isDailyBuyAmountValid`·`isTargetReturnRateValid`·`totalSplitCount`)는 파생 `useMemo`·`calcT`/`getPhase`만**. **[Option A: 전용 어댑터]** 로 **`toTradeInputsForMultiSplit`(nullish 방어)·`EMPTY_TRADES`**, **[Option A: 매매 내역 전용 계산기]** 로 **`utils/portfolioCalculations.calculateHoldingsFromTrades` + `useMemo([trades, targetStock])`만**·**`Portfolio` 통객체 holdings 경로 금지**, **`recentTradingDays: TradingDay[]`** B2·B1 정합, **Rule 6 `targetStock` 도메인 SSOT(훅에서 null/`trim` 중복 방어 생략)**, **`isQuoteInvalid` 평탄화**, **`safeStrategyObj`는 `MultiSplitParams` 3필드**, **`totalSplitCount === 0` CPU 차단**, **`calcT`/`getPhase`는 blind `useMemo` 없이 즉시 평가**, **Option B 금지**.
4. 금융/삭제/결제 mutation은 B3 설계 단계부터 **`useMutexAction`과 정합된 command shape**를 가져야 합니다. **`handleAddTrade`는 Option A 확정:** `getMutationFailureToastMessage`는 **`dailySummaryNetworkError` 범용 재사용 + `?.` + `APP_SHELL_DEFAULT_LANG` 폴백**(또는 `AppLang` 통제 시 단독 첨자)에 **`(error: unknown) => string | null`** 로 **도메인 에러 토스트 침묵**을 더한다(신규 도메인 전용 안내문 없음, Rule 3·6·§3.14). **`useMutexAction`** 은 **토스트 내부 `try/catch` 후 `throw error`(원본)** (Rule 11).
5. leaf hook도 예외가 아닙니다. `useTierDisplay`는 semantic key를, `useVrOrders`는 순수 view-model을, `useFCMToken`은 서비스 command wrapper를 반환해야 합니다.

이 기준대로 진행하면 B3 실제 수정 대상의 우선순위는 아래 순서가 됩니다.

- `hooks/usePortfolios.ts`
- `hooks/useAuth.ts`
- `hooks/useMultiSplitExecution.ts`
- `hooks/useNoStopMultiSplitExecution.ts`
- `hooks/useFCMToken.ts`
- `hooks/useTossBanner.ts`
- `hooks/useTierDisplay.ts`
- `hooks/useVrOrders.ts`
- `hooks/useMutexAction.ts` (계약 고정 — **error-aware 토스트**, §3.13·§3.14)
- `App.tsx` (셸 오케스트레이션 — **Step 1.5**, §3.14)

### 5.1 차기 아키텍처 통합 계획 (Phase C 예정)

**[기술 부채 상환 공지]:** 현재 §3.8 등에서 사용 중인 `areStrictPositiveFiniteScalars`는 Phase B3의 작업 범위(Scope) 통제를 위한 **의도된 임시 인터페이스**입니다. **당분간 현 상태를 유지**하고, 중앙 엔진 통합은 **마스터 플랜 Step C10**에서 수행합니다.

1. **통합 방향:** Phase C(Step C10)에서 B1 핵심 금융 검증(`validateFinancialArgs` 계열)에 **`safe` 모드**(및 필요 시 기존 Throw 경로를 **`strict` 모드**로 명시)를 두어, 훅 레이어의 Boolean 가드 요구를 **동일 엔진**으로 흡수·대체할 예정입니다. (통합 목표 모듈·파일 배치는 C10 PR에서 확정하며, `PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` Step C10 **범위** 행을 따릅니다.)
2. **영향도 제어:** 훅 레이어는 **`boolean`을 반환받는 현재의 호출 규약**을 유지하되, **내부 구현체만** 중앙 엔진으로 교체함으로써 상위 컴포넌트와 훅의 **공개 시그니처 연쇄 변동을 최소화**합니다.
3. **무결성 보장:** 이를 통해 금융 스칼라 규칙(예: 엄격 양의 유한값)이 시스템 전체에서 **단일 소스(SSoT)** 로 관리되도록 완성하는 것이 목표입니다.

**기술적 핵심 — Safe Parse 패턴(Step C10 구현 시):** 엔진의 심장은 하나이되, 호출 맥락에 따라 응답 방식만 달리합니다.

- **Strict 모드(B1·코어 계산용):** 검증 실패 시 즉시 에러를 발생시켜 잘못된 금융 계산이 진행되는 것을 물리적으로 차단합니다.
- **Safe 모드(B3·UI 가드용):** 에러를 가로채 **조용히 `false`**(또는 합의된 실패 값)를 반환함으로써, 사용자 화면이 멈추지 않고 입력을 거부·파생 계산을 차단합니다.

이 설계는 **인터페이스는 고정하고 내부 구현만 바꾼다**는 원칙에 맞추어, 상위 레이어의 불필요한 연쇄 리스크를 줄이는 방향으로 문서화합니다.

---

## 문서 동결 선언 (Freeze Notice)

**회장님 지시에 따라 본 문서(`PHASE_B3_HOOKS_SIMULATION.md`)는 [Option A] 기조로 최종 채택·동결되었습니다.** 구현 단계에서는 **`hooks/*.ts` 및 B1/B2 경계**가 본문·스니펫·§4 체크리스트와 **불일치하지 않게** 적용합니다. **[Option A]** 에 포함되는 필수 축은 (1) **전용 어댑터**로 B1에 `Trade[]`를 연결하고 (2) **매매 내역 전용 `calculateHoldingsFromTrades(trades)`** 로만 holdings를 산출하며 **`Portfolio` 통객체 의존을 holdings 경로에서 제거**하고 (3) §3.8 **I/O/CPU 분리·`networkSnapshot`·`TradingDay[]` 타입 정합**을 유지하는 것입니다. 추가로 **Rule 6·11:** **`dailySummaryNetworkError`는** §3.6·§3.10·§3.13 등에서는 **`?.` + `APP_SHELL_DEFAULT_LANG` 폴백**을 문서 단계에서 유지할 수 있으나, **§3.8 동결 훅은 `AppLang` 통제 전제로 `APP_SHELL_MESSAGES[lang].dailySummaryNetworkError` 단독**(데드 폴백 금지); **`useMutexAction`은 `getMutationFailureToastMessage(error)` 가 `null`이 아닐 때만 토스트**하고 **내부 `try/catch` 후 원본 `throw`**, **널러블 `userId`는 `(id ?? '').trim()`**, **§3.8 스냅샷 클리어는 functional bailout**, **§3.8 I/O deps는 `targetStock`만**이며, **토스트는 `networkErrorMsgRef`(갱신은 `useLayoutEffect`만)·현장 조회**로 Stale을 방지합니다. **`App.tsx` 셸은 §3.14(Step 1.5)** 대로 **이중 mutex·저장 경로 `runPortfolioMutation` 중복**을 두지 않습니다. **`targetStock`은 포트폴리오 파이프라인 불변식으로 보장** — §3.8 훅 스니펫은 **`null`/`trim` 중복 방어를 두지 않으며**, **`networkErrorMsgRef.current`는 렌더 바디에서 대입하지 않습니다(Rule 2).** **동결 변경은 본 문서 개정과 아키텍처 리뷰 선행 후**에만 허용합니다.
