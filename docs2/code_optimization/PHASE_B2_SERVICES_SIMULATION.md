# PHASE B2: Services Layer Simulation

> 목적: 실제 소스 코드를 수정하기 전에 `services/` 내부의 **외부 I/O, SDK 브릿지, 데이터 페칭, 로컬 저장소 경계**를 어떻게 봉인할지 가상 런타임 기준으로 검증하는 문서입니다.  
> 원칙: 이 문서는 계획과 시뮬레이션만 다루며, 현재 저장소의 실제 서비스 코드는 수정하지 않습니다.

## 0. Mental Compile 전제

- Phase B2는 Phase B 전체 중 **순수 수학(B1)** 다음 단계이며, 앱과 외부 세계가 만나는 **국경 검문소**를 봉인하는 단계입니다.
- B2의 타겟은 `services/` 내부에서 아래 둘 중 하나라도 만족하는 경계입니다.
  - 네트워크 I/O: `fetch`, Supabase, Edge Function, BFF, Firebase, Toss SDK 서버 연동
  - 로컬 I/O 또는 SDK I/O: IndexedDB, `window.open`, Toss web-framework, 광고 SDK, FCM Service Worker
- B2에서는 **"외부 응답은 항상 실패할 수 있고, 타입은 항상 거짓일 수 있다"** 를 전제로 합니다.
  - `res.ok === true` 여도 `res.json()` payload shape은 깨질 수 있습니다.
  - SDK 타입 선언이 맞아도 런타임 객체가 `undefined`, 함수 누락, sync throw, double-callback일 수 있습니다.
  - `Promise<void>` 라고 선언된 함수도 내부에서 rejection이 삼켜지거나, 반대로 호출부에서 `void someAsync()`로 유실될 수 있습니다.
- 성공 기준은 아래 8가지입니다.
  - 서비스 경계에서 **raw `unknown` → 런타임 디코딩 → 도메인 매핑** 순서를 강제합니다.
  - `as DomainType`, `as unknown as DomainType`, `data[0] as RowType`, `get(... )!` 같은 **무근거 단축 캐스팅**을 제거할 설계가 준비됩니다.
  - 외부 호출은 전부 `try-catch`와 **규격화된 실패 객체 또는 튜플**로 닫힙니다.
  - 외부 Promise 체인은 **절대 fire-and-forget로 증발하지 않으며**, 필요한 경우 `Promise.resolve(...)`와 `catch`로 봉인됩니다.
  - import 시점의 env 누락이 앱 전체 크래시로 번지지 않도록 **import-time throw**를 줄입니다.
  - timeout, abort, unsupported environment, malformed JSON, empty payload를 **서로 다른 에러 코드**로 구분할 수 있습니다.
  - fallback은 단순 `null`/`[]` 남발이 아니라, **도메인적으로 의도가 있는 안전값**으로 통일됩니다.
  - B2가 끝나면 B3 훅 레이어는 **"서비스 결과를 소비"** 하는 책임만 가지며, 통신 방어로직을 다시 쓰지 않아야 합니다.

### 0.1 Core Principles (1~11) — B2 시뮬레이션 정렬

| # | 원칙 | B2 `services/` 시뮬레이션에서의 의미 |
|---|------|---------------------------------------|
| **1** | Financial Math | 시세·결제·수량 payload를 서비스에서 받는 순간에도 `NaN`, 음수, 0 분모 위험을 닫습니다. 외부 숫자는 "이미 number니까 안전"이 아니라 **디코딩 후 검증 대상**입니다. |
| **2** | React / 렌더 이펙트 | B2는 React 렌더 로직을 다루지 않지만, `services/`가 UI 상태를 몰래 바꾸거나 side effect를 숨기지 않도록 **SRP**를 지킵니다. |
| **3** | I18n / 하드코딩 | 서비스는 사용자 노출 문자열을 직접 조합하지 않고, 가능하면 **에러 코드·메타 정보**만 반환합니다. UI 문구는 상위 레이어 SSOT에서 결정합니다. |
| **4** | A11y | 직접 대상은 적지만, 브릿지 실패를 조용히 삼켜 UI가 멈추는 구조를 금지합니다. |
| **5** | Architecture / DRY / OCP | `safeFetchJson`, `wrapBridgeCall`, `createServiceError`, `decodeXxx` 같은 **공용 경계 도구**를 SSOT로 두고 파일별 임시 방어를 중단합니다. |
| **6** | Error & Edge Resilience | 모든 외부 호출은 `try-catch`, timeout, fallback, structured error를 기본 계약으로 둡니다. HTTP 실패는 §0.2 분류·`createHttpResponseError`로 일관되게 닫습니다. `catch { return null; }` 같은 **원인 소실형 Silent Failure**를 금지합니다. |
| **7** | Strict TypeScript | 외부 payload는 `unknown`으로 받고 타입 가드로 좁힙니다. `as SupabaseStockRow[]`, `as { text?: string }` 같은 즉시 신뢰 캐스팅을 제거하는 계획을 세웁니다. |
| **8** | Naming / Magic Numbers | timeout, retry, cutoff는 `SCREAMING_SNAKE_CASE` 상수로 승격합니다. `300`, `10_000`, `24 * 60 * 60 * 1000` 같은 값은 의미 이름을 가집니다. |
| **9** | Comments | 서비스 경계 코멘트는 "왜 이 fallback을 쓰는지", "왜 sync throw까지 Promise.resolve로 감싸는지"처럼 이유만 설명합니다. |
| **10** | Performance / State | 서비스는 불필요한 중복 fetch, 중복 bridge load, 중복 indicator 계산을 줄이되, 캐시와 동시성 제어는 **의도적으로** 중앙화합니다. |
| **11** | Async Flow Safety | SDK/브릿지/동적 import는 `await Promise.resolve(...)`로 sync throw와 async reject를 한곳에서 받습니다. callback 기반 API는 **double settle**, **never settle**, **swallowed rejection**까지 방어합니다. |

### 0.2 HTTP 응답 실패 분류·재시도 규약 (B2 확정)

| HTTP 상태(범위) | `ServiceErrorCode` | `retryable` (HTTP 계층 기본값) | 비고 |
|---|---|---|---|
| `401` | `AUTH_REQUIRED` | `false` | 재인증·세션 갱신은 별 플로우 |
| `403` | `FORBIDDEN` | `false` | 권한/정책 거절 |
| `404` | `NOT_FOUND` | `false` | 리소스 부재·잘못된 경로 |
| `429` | `RATE_LIMIT` | `true` | 백오프·재시도 허용 |
| `500`–`599` | `SERVER_ERROR` | `true` | 일시적 서버 장애 가정 |
| 그 외 `4xx` | `HTTP_ERROR` | `false` | 클라이언트/계약 오류 일반 |

- **단일 진입점:** `fetch` 기반 경계는 `createHttpResponseError(status)`(또는 동등 헬퍼)로 **`code`·`retryable`·`httpStatus`를 한 번에** 채웁니다(Rule 5 DRY, Rule 6 일관성).
- **재시도 SSOT:** HTTP 응답에 대해 `retryable: true`는 **`429`와 `5xx`만** 허용합니다. `isHttpStatusRetryable(status)`가 이 규칙의 유일한 근거가 되도록 하고, **다른 4xx에 임의로 `retryable: true`를 붙이지 않습니다**(Rule 8·Rule 6).
- **SDK 재사용:** Supabase/PostgREST 등에서 **HTTP status를 추출할 수 있으면** 동일한 `mapHttpStatusToErrorCode` / `isHttpStatusRetryable`를 호출해 **fetch와 동일 분류**를 유지합니다. status를 알 수 없을 때만 `HTTP_ERROR` + `retryable: false` 등 별도 계약을 둡니다.

### 0.3 본 시뮬레이션 문서 ↔ Core Principles (11) 교차 매핑

| # | 원칙 | 본 문서에서의 대응 위치(요약) |
|---|------|-------------------------------|
| **1** | Financial Math | §3.2 `changePercent`는 **부호 있는** `Math.sign(raw) * Number.EPSILON` 보정 후 반올림(음수에 `+EPSILON`만 더하면 대칭 붕괴); 외부 `close`는 decoder에서 `> 0` 검증 |
| **2** | React / JSX 삼항 | §3.0 HTTP 분기 **중첩 삼항 금지**, `switch`·헬퍼로 평탄화 |
| **3** | I18n | 서비스는 `message`를 기계적 키·로그용으로 두고, 사용자 문구는 B3·`vrMessages` 등에서 조합 |
| **4** | A11y | 서비스 직접 해당은 적음; 실패를 삼켜 UI가 멈추지 않도록 structured result 유지 |
| **5** | DRY / OCP | §3.0 `createHttpResponseError`, `mapHttpStatusToErrorCode`, decoder 패턴으로 경계 확장 |
| **6** | Error / Resilience | `try-catch`, timeout, fallback, HTTP·네트워크 코드 분리, Silent failure 금지; §3.12 **`typeof import.meta !== 'undefined'`** + `getViteImportMetaEnv()` SSOT 후 **`env?.KEY`** 로 ReferenceError·크래시 완화 |
| **7** | Strict TS | `isRecord` + `!Array.isArray`, 외부 payload `unknown` 디코딩; `wrapBridgeCall`의 **`T`와 `fallback` 일치**(디코딩 전 브릿지는 `wrapBridgeCall<unknown>(..., null, ...)`) |
| **8** | 매직 넘버 | §3.0 HTTP 상태 상수, §3.2 `DEFAULT_RSI` 등; §0.2 재시도 규칙 수치 범위 명시 |
| **9** | Comments | 스니펫 내 주석은 **왜**(재시도 정책, 배열 제외)만 |
| **10** | Performance | inflight·배치 fetch는 §1·§2.1.7; 본 페이즈는 정확성·계약 우선 |
| **11** | Async / 브릿지 | §3.0 `wrapBridgeCall`, `Promise.resolve`; §3.6 `appLogin`도 동일 SSOT; SDK callback은 IAP 등 별 절 시뮬 |

---

## 1. B2 레이어 진단

### 1.1 B2 범위 분류

| 경로 | 현재 성격 | B2 포함 여부 | 판단 |
|---|---|---|---|
| `services/stockService.ts` | Supabase + IndexedDB + 기술지표 + `localStorage` 혼합 | 포함 | 시세 조회, 캐시, fallback, 타입 캐스팅, 비동기 fan-out이 한 파일에 섞여 있어 B2 핵심 타겟입니다. |
| `services/supabase.ts` | 클라이언트 생성 + 세션 검증 + 저장소 정리 | 포함 | import-time env throw, boolean 기반 오류 축약, 인증 저장소 side effect가 있어 B2 핵심입니다. |
| `services/geminiService.ts` | Edge Function fetch + JSON 파싱 | 포함 | `res.json() as ...` 신뢰 캐스팅과 throw/fallback 정책 불일치가 있습니다. |
| `services/toss/tossAuth.ts` | Toss SDK 로그인 + BFF 교환 + Supabase 세션 설정 | 포함 | SDK 호출, BFF 응답 파싱, 토큰 shape 신뢰, 네트워크 실패 처리까지 외부 경계가 밀집된 파일입니다. |
| `services/payment/tossIapService.ts` | Toss IAP SDK + BFF 검증 + 주문 복원 | 포함 | SDK bridge 감지, callback async, grant 완료, pending order 복원 등 Rule 11 리스크가 큽니다. |
| `services/tossAppBridge.ts` | 동적 import + 브릿지 래퍼 + `window.open` 폴백 | 포함 | `catch {}` 기반 silent fallback, sync throw 방어, unsupported env 처리 규격화가 필요합니다. |
| `services/ads/tossIntegratedFullScreenAdApi.ts` | Toss 광고 SDK 심볼 래퍼 | 포함 | 런타임 함수 존재 검사는 있으나, 캐스팅과 실패 규격화가 더 강화되어야 합니다. |
| `services/ads/rewardAdService.ts` | 광고 SDK 이벤트 기반 Promise 래핑 | 포함 | timeout 부재로 pending Promise 영구 대기가 가능해 B2 범위입니다. |
| `services/ads/globalAdManager.ts` | 광고 오케스트레이션 + timeout + backoff | 부분 포함 | 이미 구조가 비교적 좋지만, SDK bridge boundary SSOT와 에러 코드 통합 면에서 B2 교차 검토가 필요합니다. |
| `services/db.ts` | IndexedDB local I/O | 포함 | 네트워크는 아니지만 외부 저장소 경계이므로 B2에서 result/fallback 일관성을 맞춰야 합니다. |
| `services/firebase.ts` | Firebase init + messaging + service worker | 포함 | 모듈 초기화 side effect, `null` 기반 실패 축약, 브라우저 capability 분기 표준화가 필요합니다. |
| `services/toss/tossBridge.ts` | re-export only | 제외 | 런타임 로직이 없어 직접 수술 대상은 아닙니다. |
| `services/payment/paymentService.ts` | 빈 파일 | 제외 | 런타임 경계가 없습니다. |

### 1.2 치명 리스크 진단표

| 파일 | 현재 패턴 | 리스크 | 왜 위험한가 | B2 조치 |
|---|---|---|---|---|
| `services/supabase.ts` | `getRequiredClientEnv()` 가 import 시점에 `throw` | **WSOD/앱 부팅 실패** | env 누락 한 건이 서비스 계층을 넘어 앱 전체 초기화 실패로 번집니다. | lazy init 또는 `ServiceResult` 기반 env 로더로 전환, import-time crash 제거 |
| `services/supabase.ts` | `ensureValidSession(): Promise<boolean>` | **에러 원인 소실** | `false`만 반환하면 `expired`, `network`, `storage_corruption`, `refresh_failed`를 구분할 수 없습니다. | `SessionCheckResult` 또는 `ServiceResult<SessionState>`로 원인 보존 |
| `services/stockService.ts` | `data[0] as SupabaseStockRow`, `(data as SupabaseStockRow[])` | **거짓 타입 신뢰** | Supabase 결과 shape가 깨져도 컴파일러를 우회해 잘못된 값이 계산에 들어갑니다. | `unknown` row validator + `mapSupabaseStockRows()` 디코더 도입 |
| `services/stockService.ts` | `inflightStockRequests.get(s)!` | **non-null assertion 런타임 리스크** | 맵 상태 불일치나 race가 생기면 즉시 throw 합니다. | `getInflightOrCreate()` 헬퍼로 non-null assertion 제거 |
| `services/stockService.ts` | `Promise.all` 내부 심볼별 `catch` 후 zero-data fallback | **부분 실패 원인 은닉** | 호출자는 성공처럼 보이는 `{ price: 0 }`만 받고, 네트워크 실패인지 실제 0인지 구분하지 못합니다. | `source`, `isStale`, `errorCode` 메타를 포함한 fallback 구조로 승격 |
| `services/stockService.ts` | IndexedDB 조회, Supabase fetch, indicator 계산, `localStorage` 기록이 한 함수에 공존 | **SRP 위반 / 회귀 반경 확대** | 캐시 정책 수정이 지표 계산과 로컬 저장 side effect까지 함께 흔듭니다. | `reader`, `decoder`, `cacheWriter`, `syncCoordinator` 로 계층 분리 |
| `services/geminiService.ts` | `(await res.json()) as { text?: string }`, `(await res.json()) as { trades?: RecognizedTradeItem[] }` | **응답 shape 무검증** | malformed JSON 또는 예상 외 필드가 도메인 객체처럼 통과합니다. | `decodeAdvisorResponse()`, `decodeRecognizedTradesResponse()` 도입 |
| `services/geminiService.ts` | `getStrategyAdvisor`는 fallback 문자열 반환, `analyzeTradeScreenshot`는 sentinel error throw | **실패 계약 불일치** | 같은 서비스인데 호출자가 두 가지 에러 모델을 따로 기억해야 합니다. | B2 표준 결과 모델로 통일, legacy adapter는 상위에서만 유지 |
| `services/geminiService.ts` | timeout/abort 부재 | **무한 대기 / 느린 네트워크 잠김** | Edge Function이 멈추면 서비스 Promise가 오래 붙잡힐 수 있습니다. | `fetchJsonWithTimeout` + `AbortController` 도입 |
| `services/toss/tossAuth.ts` | `res.json().catch(() => ({}))` 후 unknown payload 직접 접근 | **silent parse fallback + shape 신뢰** | 서버가 HTML/빈 본문을 보내도 `{}`로 삼켜져 근본 원인을 잃습니다. | `safeReadJsonUnknown()` + `decodeTossExchangeResponse()` 도입 |
| `services/toss/tossAuth.ts` | `appLogin()` 반환값 구조 맹신 + 인라인 `try`/`Promise.resolve` | **Rule 7 Zero-Trust 위반·Rule 5 DRY 위반** | SDK가 `null`/비객체를 반환하면 필드 접근에서 `TypeError`로 추락합니다. 브릿지 보일러플레이트가 파일마다 달라집니다. | §3.0 `wrapBridgeCall` + `decodeAppLoginResponse`(런타임 decode)로 일괄 정렬 |
| `services/payment/tossIapService.ts` | `candidate as Partial<TossIapBridge>` 후 `return bridge as TossIapBridge` | **브릿지 shape 과신** | 함수 시그니처만 맞아도 내부 contract가 깨진 객체가 통과할 수 있습니다. | method별 runtime validator 강화 및 error result 반환 |
| `services/payment/tossIapService.ts` | callback 내부 async 흐름에서 `Promise.resolve` 미사용 | **swallowed rejection / double settle** | SDK callback이 sync/async 혼합일 때 reject가 settle 경계를 새어 나갈 수 있습니다. | `settleOnce()` + `void Promise.resolve(handler()).catch(...)` 패턴 도입 |
| `services/payment/tossIapService.ts` | `restorePendingIapOrders(): Promise<void>` | **실패 요약 정보 상실** | 어떤 주문이 성공했고 무엇이 실패했는지 호출자가 전혀 알 수 없습니다. | `RestorePendingOrdersResult` 반환으로 승격 |
| `services/tossAppBridge.ts` | `catch { return DEFAULT }`, `catch { return () => {} }` | **silent failure** | unsupported와 bridge bug, timeout, permission issue가 모두 같은 fallback으로 뭉개집니다. | `BridgeResult<T>` 표준화 + fallback 유지하되 `errorCode` 동반 |
| `services/tossAppBridge.ts` | `(import.meta as unknown as { env?: { DEV?: boolean } })` | **과도한 캐스팅** | 환경값 읽기조차 타입 우회가 필요하다는 신호이며, 향후 drift를 숨깁니다. | **`getViteImportMetaEnv()`** 등 SSOT + contract 타입으로 정렬(§3.12·`utils/viteImportMetaEnv.ts`) |
| `services/ads/rewardAdService.ts` | 이벤트 기반 `new Promise()`에 timeout 없음 | **never-settle 위험** | 광고 SDK가 `loaded`, `dismissed`, `failedToShow`, `onError` 중 아무 것도 안 보내면 Promise가 영구 대기합니다. | `withTimeout()` 래핑 도입 |
| `services/db.ts` | 일부 함수는 `throw`, 일부는 `return [] | null | 0` | **로컬 I/O 실패 계약 불일치** | 동일 계층인데 호출자가 함수마다 다른 실패 semantics를 알아야 합니다. | IndexedDB 서비스 결과 모델 통일 |
| `services/firebase.ts` | 모듈 최상단에서 Firebase init 시도 | **초기화 side effect** | import만으로 브라우저 capability와 env에 따라 로그/실패가 발생합니다. | lazy singleton init로 이동 |

### 1.3 공통 냄새(Smells)

1. **응답 타입을 너무 빨리 믿습니다.**
   - `as SupabaseStockRow[]`
   - `as { text?: string }`
   - `as number`
   - `as Error`
   - 외부 응답은 최소한 한 번은 `unknown`으로 받은 뒤 디코딩해야 합니다.

2. **실패는 막는데, 실패 이유를 보존하지 못합니다.**
   - `return null`
   - `return []`
   - `return {}`
   - `return false`
   - 이것만으로는 UX fallback은 가능해도, 로그/재시도/분기 결정이 어렵습니다.

3. **서비스 함수의 실패 계약이 제각각입니다.**
   - 어떤 함수는 throw 합니다.
   - 어떤 함수는 fallback 값을 반환합니다.
   - 어떤 함수는 콘솔만 찍고 끝납니다.
   - B2 이후에는 최소한 "structured result" 혹은 "error tuple" 둘 중 하나로 통일되어야 합니다.

4. **callback 기반 SDK 경계에서 Rule 11 방어가 부족합니다.**
   - `new Promise((resolve) => { ... async callback ... })`
   - `onEvent`, `onError`, `processProductGrant` 내부에서 sync throw와 async reject가 한 패턴으로 봉인되지 않습니다.

5. **timeout과 abort가 부족합니다.**
   - `fetch`
   - 광고 SDK 대기
   - pending order 복원
   - 브릿지 동적 import
   - "실패는 해도 좋지만, 영원히 안 끝나는 것"은 더 위험합니다.

6. **SRP가 약한 파일이 존재합니다.**
   - `stockService.ts`는 reader + decoder + cache + indicator + localStorage + orchestration이 섞여 있습니다.
   - `firebase.ts`는 init + capability detection + token request + listener registration이 섞여 있습니다.

### 1.4 B2에서 먼저 봉인할 공용 경계 후보

| 후보 | 역할 | 이유 |
|---|---|---|
| `ServiceError` | 표준 에러 코드 / retryable / cause / context | `null`·`false`만으로는 원인 추적이 불가합니다. |
| `ServiceResult<T>` | 성공/실패 + fallback + meta | B2 전역 실패 계약 SSOT가 필요합니다. |
| `toServiceTuple()` | `[error, data]` 호환 어댑터 | 기존 호출부 점진 이행을 위해 튜플 호환이 필요합니다. |
| `isRecord()` | `unknown` **plain object** narrowing (`Array` 제외) | JS에서 배열은 `object`이므로 `[]`가 `Record`로 오인되면 키 접근이 조용히 실패합니다. **`!Array.isArray(value)`** 가 필수입니다. |
| `readString`, `readFiniteNumber`, `readBoolean` | 필드 단위 안전 읽기 | raw payload shape를 믿지 않기 위한 최소 도구입니다. |
| `safeReadJsonUnknown()` | `Response` 본문을 `unknown`으로 안전 파싱 | `res.json().catch(() => ({}))` 같은 원인 소실 패턴을 대체합니다. |
| `fetchJsonWithTimeout()` | timeout + abort + HTTP status + decode | 네트워크 공통 보일러플레이트를 제거합니다. |
| `mapHttpStatusToErrorCode()` / `isHttpStatusRetryable()` | HTTP → 코드·재시도 SSOT | `404`→`NOT_FOUND`, `5xx`→`SERVER_ERROR`, 재시도는 `429`·`5xx`만 |
| `createHttpResponseError()` | `ServiceError` 조립 단일 진입 | `code`·`retryable`·`httpStatus` drift 방지(Rule 5·6) |
| `wrapBridgeCall()` | `Promise.resolve` + unsupported fallback + error result | Toss **`appLogin`**, IAP, `openURL` 등 브릿지형 호출의 Rule 11 SSOT — 파일별 인라인 `try`/`Promise.resolve` 금지. |
| `decodeSupabaseStockRows()` | 시세 row array 디코더 | `stockService.ts`의 과도한 cast를 제거합니다. |
| `decodeTossExchangeResponse()` | Toss BFF 응답 디코더 | access/refresh token shape를 런타임에서 봉인합니다. |
| `decodeAppLoginResponse()` | `appLogin()` SDK 반환 디코더 | `authorizationCode`·`referrer`를 `isRecord`/`readString`으로 검증 후 BFF용 `referrer`로 정규화합니다. |
| `decodeRecognizedTradesResponse()` | Gemini 응답 디코더 | `RecognizedTradeItem[]`를 실제로 검증합니다. |

---

## 2. 액션 플랜

### 2.1 리팩토링 원칙

### 2.1.1 B2 표준 실패 계약: `ServiceResult<T>` + 튜플 어댑터

Phase B2에서는 서비스 계층의 표준 실패 계약을 아래 둘로 정렬합니다.

1. **주 계약:** `ServiceResult<T>`
   - 가독성이 높고, `ok` 분기·fallback·meta를 함께 담을 수 있습니다.

2. **호환 계약:** `readonly [ServiceError | null, T]`
   - 기존 호출부를 한 번에 못 바꾸는 경우에만 어댑터로 제공합니다.

원칙:

- 서비스 함수는 **도메인적으로 유효한 fallback이 존재하면** 실패 시에도 fallback을 같이 반환합니다.
- fallback이 존재하지 않는 경우에도 `throw` 대신 **실패 result**를 우선 사용합니다.
- 오직 정말 치명적인 개발자 오류(예: 내부 invariant breach)만 최종 `throw` 후보로 남깁니다.

### 2.1.2 Zero Trust 런타임 디코딩 규칙

- 외부 응답은 모두 `unknown`으로 받습니다.
- 키-값 객체 payload는 **`typeof value === 'object' && value !== null && !Array.isArray(value)`** 로 좁힙니다. (`isRecord` SSOT)
- 배열 payload는 `Array.isArray()` 확인 후 원소 단위로 검증합니다.
- 숫자는 반드시 `typeof v === 'number' && Number.isFinite(v)`로 확인합니다.
- 문자열은 `trim()` 후 빈 문자열을 별도 처리합니다.
- shape가 맞지 않으면 **조용히 캐스팅하지 않고** `INVALID_RESPONSE` 등 규격 코드로 닫습니다.
- B3에서 `ServiceErrorCode`를 `switch`로 분기할 때는 **`default` + `never` exhaustiveness**로 누락 케이스를 컴파일 타임에 잡습니다(Rule 7). (`NOT_FOUND`·`SERVER_ERROR` 추가 시 동일 규칙 적용)

### 2.1.3 네트워크 표준: timeout + abort + decode + fallback

HTTP 상태 코드 → `ServiceErrorCode` 매핑은 **중첩 삼항 금지**(Rule 2·6). `mapHttpStatusToErrorCode` + `default` 분기 내 `5xx` 판별로 유지합니다.

**재시도(`retryable`) 규칙 (HTTP 응답 한정):** `isHttpStatusRetryable(status)`가 **`true`인 경우는 `429`와 `500`–`599`뿐**입니다. `401`/`403`/`404`/기타 `4xx`는 `false`입니다. 네트워크 계열(`NETWORK`, `TIMEOUT`)은 별도 §3.0 스니펫대로 `retryable: true`를 유지할 수 있습니다(성격이 다르므로 HTTP 규칙과 혼동하지 않음).

모든 `fetch`는 아래 순서를 공통으로 가집니다.

1. 입력 검증
2. `AbortController` 생성
3. timeout 설정
4. `try-catch`
5. `Response.ok` 검사
6. 본문을 `unknown`으로 읽기
7. decoder로 도메인 매핑
8. 실패 시 `ServiceError` + fallback 반환

이 규칙은 다음에 동일 적용됩니다.

- `services/geminiService.ts`
- `services/toss/tossAuth.ts`
- `services/payment/tossIapService.ts`의 BFF 검증
- 향후 `services/` 하위의 신규 외부 API

### 2.1.4 SDK / 브릿지 표준: `await Promise.resolve(...)`

Rule 11에 따라 아래 경계는 전부 `Promise.resolve`로 감쌉니다.

- `appLogin()` 등 Toss SDK 진입점: **`wrapBridgeCall`** 로 감싼 뒤, 반환 payload는 **`decodeAppLoginResponse`** 같은 decoder로 검증(Rule 5·7·11)
- `iap.completeProductGrant(...)`
- `iap.getPendingOrders()`
- `mod.openURL(...)`
- 동적 import 이후 bridge method 실행
- SDK callback 안에서 호출되는 async 함수

이유:

- SDK 구현이 sync throw로 바뀌어도 동일한 `catch`에서 받기 위함입니다.
- callback이 `void | Promise<void>` 혼합 시그니처여도 rejection을 표준 패턴으로 회수하기 위함입니다.

### 2.1.5 Fallback은 "침묵"이 아니라 "의도된 안전값"이어야 합니다

| 도메인 | 금지 패턴 | 허용 패턴 |
|---|---|---|
| 시세 조회 | 이유 없는 `{ price: 0 }` | `fallback: EMPTY_STOCK_DATA`, `error.code`, `meta.source` 포함 |
| Gemini advisor | 무조건 throw | fallback text 또는 빈 결과를 주되 `error.code` 보존 |
| Gemini screenshot 분석 | raw throw | `{ trades: [] }` fallback + structured error |
| Toss auth | `{ success: false, error: '네트워크 오류' }`만 | code/message/retryable 분리 |
| IAP 복원 | `Promise<void>` | 성공/실패 order 수, 실패 orderId 목록, lastErrorCode 포함 |
| 브릿지 openURL | `catch {}` | unsupported / bridge_error / popup_fallback_used 구분 |
| IndexedDB | `return []` | empty fallback + storage failure reason 분리 |

### 2.1.6 B2 로깅 규칙

- `console.error`는 남길 수 있지만, **로깅만 하고 실패 계약을 숨기면 안 됩니다.**
- 로그 키는 최소한 아래를 포함합니다.
  - 서비스명
  - 액션명
  - 심볼 또는 orderId 등 식별자
  - error code
- 동일 실패를 상위 레이어에서도 또 로그할 수 있으므로, B2에서는 **원인 보존**이 우선이고 중복 로그는 후순위입니다.

### 2.1.7 동시성 / fan-out 규칙

- `Promise.all()`은 모든 항목이 같은 실패 정책을 공유할 때만 사용합니다.
- 심볼별 부분 실패가 허용되는 시세 로딩은 `Promise.allSettled()` 또는 **per-item result 수집기**가 더 적합합니다.
- inflight 캐시는 `Map<string, Promise<Result>>` 형태로 유지하되, 조회 시 `!`를 사용하지 않습니다.
- callback SDK는 `settleOnce()`로 double resolve/reject를 방지합니다.

### 2.1.8 import-time side effect 최소화

- `services/supabase.ts`의 env 읽기
- `services/firebase.ts`의 initializeApp
- 기타 브라우저 전역 접근

이 세 가지는 가능하면 **lazy singleton**으로 이동합니다.

이유:

- 단순 import만으로 앱 부팅이 깨지는 것을 막기 위함입니다.
- 테스트 환경, SSR/preview, sandbox에서 동일 코드가 더 안전하게 동작합니다.

### 2.2 구현 순서

1. **B2 공용 경계 코어 확정**
   - `ServiceError`
   - `ServiceResult<T>`
   - `toServiceTuple`
   - `isRecord`
   - `safeReadJsonUnknown`
   - `mapHttpStatusToErrorCode` / `isHttpStatusRetryable` / `createHttpResponseError`
   - `fetchJsonWithTimeout`
   - `wrapBridgeCall`

2. **Supabase / 시세 경계 봉인**
   - `services/supabase.ts`
   - `services/stockService.ts`
   - row decoder, fallback meta, inflight 안전화

3. **Gemini Edge 경계 봉인**
   - advisor / screenshot 분석 모두 같은 결과 모델로 정렬
   - malformed JSON, 401, 403, 429, timeout, network 분리

4. **Toss 인증 / IAP / 브릿지 봉인**
   - `tossAuth.ts` — `appLogin` → `wrapBridgeCall` + `decodeAppLoginResponse`; BFF → `fetchJsonWithTimeout` + `decodeTossExchangeResponse`
   - `tossIapService.ts`
   - `tossAppBridge.ts`
   - `ads/tossIntegratedFullScreenAdApi.ts`
   - `ads/rewardAdService.ts`

5. **Local I/O 봉인**
   - `db.ts`
   - `firebase.ts`
   - local storage / service worker / IndexedDB 실패 semantics 통일

### 2.3 검증 전략

| 레벨 | 검증 내용 |
|---|---|
| 네트워크 실패 | offline, DNS 실패, CORS, timeout, aborted |
| HTTP 실패 | 400, 401, 403, 404, 429, 500 |
| malformed payload | JSON shape 누락, 타입 불일치, 빈 배열, null row |
| SDK 실패 | unsupported environment, 함수 누락, sync throw, callback error |
| async flow | callback double fire, never settle, partial settle, swallowed rejection |
| local storage | IndexedDB open 실패, service worker 등록 실패, Notification 권한 거부 |
| partial success | 시세 batch 중 일부 symbol만 실패, pending order 일부만 복원 성공 |
| fallback integrity | fallback 값이 UI/훅에서 즉시 사용돼도 WSOD가 나지 않는지 |

### 2.4 B2 완료 정의(Definition of Done)

- `services/` 내부의 외부 응답 파싱은 **즉시 cast**가 아니라 **decoder**를 거칩니다.
- `isRecord()` 등 객체 가드는 **`[]`를 Record로 오인하지 않도록** `!Array.isArray`를 포함합니다.
- `fetch`는 전부 timeout/abort/structured error 계약을 가지며, HTTP 분기에 **중첩 삼항**을 쓰지 않습니다.
- HTTP 실패는 `NOT_FOUND` / `SERVER_ERROR` 등 **코드가 분리**되고, **`retryable`은 `429`·`5xx`만 true**인 규칙이 `isHttpStatusRetryable`에 모입니다.
- SDK/브릿지 호출은 전부 `Promise.resolve(...)` 또는 동등한 safe wrapper를 거칩니다.
- **`tossAuth` 확정(§3.6.2):** `supabase.auth.setSession`은 **독립 `try-catch`** 로 유지하고 `wrapBridgeCall`에 흡수하지 않으며, **`referrer`는 `SANDBOX`→`sandbox` / 그 외 `DEFAULT`** 제품 계약을 유지합니다.
- `null`/`[]`/`false` fallback에는 최소한 `error.code` 또는 상위 전달 가능한 이유가 남습니다.
- `stockService.ts`의 row cast, non-null assertion, 혼합 책임이 B2 계획대로 분리 가능한 상태가 됩니다.
- `supabase.ts`와 `firebase.ts`의 import-time side effect가 줄어듭니다.
- B3 훅은 서비스의 structured result를 소비할 뿐, 네트워크 디코딩을 다시 하지 않습니다.

---

## 3. 시뮬레이션용 코드 스니펫

아래 코드는 실제 저장소를 즉시 덮어쓰는 최종본이 아니라, 현재 코드 패턴을 안전하게 재설계했을 때 어떤 구조가 되어야 하는지 보여주는 **AST 레벨 대응 시뮬레이션**입니다.

### 3.0 공용 B2 경계 코어 (시뮬 SSOT)

```ts
export type ServiceErrorCode =
  | 'INVALID_INPUT'
  | 'MISSING_ENV'
  | 'UNSUPPORTED_ENV'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'INVALID_RESPONSE'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR'
  | 'STORAGE_ERROR'
  | 'SDK_ERROR'
  | 'UNKNOWN';

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
  httpStatus?: number;
  context?: Record<string, string | number | boolean>;
}

export type ServiceResult<T> =
  | {
      ok: true;
      data: T;
      error: null;
      meta?: Record<string, string | number | boolean>;
    }
  | {
      ok: false;
      data: T;
      error: ServiceError;
      meta?: Record<string, string | number | boolean>;
    };

export function createServiceError(
  code: ServiceErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    cause?: unknown;
    httpStatus?: number;
    context?: Record<string, string | number | boolean>;
  },
): ServiceError {
  return {
    code,
    message,
    retryable: options?.retryable ?? false,
    cause: options?.cause,
    httpStatus: options?.httpStatus,
    context: options?.context,
  };
}

export function okResult<T>(
  data: T,
  meta?: Record<string, string | number | boolean>,
): ServiceResult<T> {
  return { ok: true, data, error: null, meta };
}

export function failResult<T>(
  fallback: T,
  error: ServiceError,
  meta?: Record<string, string | number | boolean>,
): ServiceResult<T> {
  return { ok: false, data: fallback, error, meta };
}

export function toServiceTuple<T>(
  result: ServiceResult<T>,
): readonly [ServiceError | null, T] {
  return [result.error, result.data] as const;
}

// Rule 7: 배열은 typeof 'object' 이므로 Record 오인 방지에 Array.isArray 제외가 필수
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Rule 8: HTTP 상태 리터럴은 상수로 고정 (매직 넘버 산재 방지)
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_RATE_LIMIT = 429;
const HTTP_STATUS_SERVER_ERROR_MIN = 500;
const HTTP_STATUS_SERVER_ERROR_MAX = 599;

// Rule 2 & 6: HTTP → 코드 매핑은 중첩 삼항 금지; 5xx는 default 분기에서 구간 판별
export function mapHttpStatusToErrorCode(status: number): ServiceErrorCode {
  if (!Number.isFinite(status) || status < 100 || status > 599) {
    return 'HTTP_ERROR';
  }

  switch (status) {
    case HTTP_STATUS_UNAUTHORIZED:
      return 'AUTH_REQUIRED';
    case HTTP_STATUS_FORBIDDEN:
      return 'FORBIDDEN';
    case HTTP_STATUS_NOT_FOUND:
      return 'NOT_FOUND';
    case HTTP_STATUS_RATE_LIMIT:
      return 'RATE_LIMIT';
    default:
      if (
        status >= HTTP_STATUS_SERVER_ERROR_MIN &&
        status <= HTTP_STATUS_SERVER_ERROR_MAX
      ) {
        return 'SERVER_ERROR';
      }
      return 'HTTP_ERROR';
  }
}

/**
 * HTTP 응답 기준 재시도 허용: 429(Rate Limit) 및 5xx(SERVER_ERROR)만 true.
 * 그 외 4xx(404·403 등)는 false — 잘못된 재시도 루프 방지(Rule 6).
 */
export function isHttpStatusRetryable(status: number): boolean {
  if (!Number.isFinite(status)) {
    return false;
  }

  if (status === HTTP_STATUS_RATE_LIMIT) {
    return true;
  }

  return (
    status >= HTTP_STATUS_SERVER_ERROR_MIN &&
    status <= HTTP_STATUS_SERVER_ERROR_MAX
  );
}

/** fetch 등 Raw HTTP 실패 시 code·retryable·httpStatus를 한 규약으로 조립 (Rule 5 DRY) */
export function createHttpResponseError(status: number): ServiceError {
  return createServiceError(
    mapHttpStatusToErrorCode(status),
    `http_${status}`,
    {
      retryable: isHttpStatusRetryable(status),
      httpStatus: status,
    },
  );
}

export function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function safeReadJsonUnknown(
  response: Response,
): Promise<ServiceResult<unknown>> {
  try {
    const payload = await response.json();
    return okResult(payload);
  } catch (error: unknown) {
    return failResult(
      null,
      createServiceError(
        'INVALID_RESPONSE',
        'response_json_parse_failed',
        { cause: error },
      ),
    );
  }
}

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

export async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ServiceResult<unknown>> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      return failResult(null, createHttpResponseError(response.status));
    }

    return await safeReadJsonUnknown(response);
  } catch (error: unknown) {
    const isAbortError =
      error instanceof DOMException && error.name === 'AbortError';

    return failResult(
      null,
      createServiceError(
        isAbortError ? 'TIMEOUT' : 'NETWORK',
        isAbortError ? 'request_timed_out' : 'network_request_failed',
        {
          retryable: true,
          cause: error,
        },
      ),
    );
  } finally {
    window.clearTimeout(timerId);
  }
}

export async function wrapBridgeCall<T>(
  action: () => Promise<T> | T,
  fallback: T,
  context: Record<string, string | number | boolean>,
): Promise<ServiceResult<T>> {
  try {
    const data = await Promise.resolve(action());
    return okResult(data, context);
  } catch (error: unknown) {
    return failResult(
      fallback,
      createServiceError('SDK_ERROR', 'bridge_call_failed', {
        retryable: false,
        cause: error,
        context,
      }),
      context,
    );
  }
}
```

**Rule 7 (`wrapBridgeCall` 제네릭·fallback):** `fallback` 타입은 반드시 `T`와 동일해야 합니다. SDK가 배열·객체 등을 반환하는데 `undefined`를 넣으면 **`strictNullChecks`에서 TS2345**가 납니다. 반환을 디코딩 전 `unknown`으로 두려면 **`wrapBridgeCall<unknown>(..., null, context)`** 처럼 **`T = unknown` + `null` fallback**을 명시합니다(§3.8·§3.10).

핵심:

- B2에서 서비스는 **성공 데이터만 반환하는 함수**가 아니라, **성공/실패 + fallback + 이유**를 함께 가진 경계 함수가 됩니다.
- `isRecord()`는 **`!Array.isArray(value)`** 로 배열을 Record에서 배제합니다(Rule 7 type hole 방지).
- `mapHttpStatusToErrorCode()`는 **`404`→`NOT_FOUND`**, **`5xx`→`SERVER_ERROR`**, 기타 명시 케이스 외 **`HTTP_ERROR`** 로 분리합니다(Rule 2·6·8).
- `isHttpStatusRetryable()`는 **`429`·`5xx`만 `true`** — HTTP 계층 재시도 정책의 단일 SSOT입니다(Rule 6·8).
- `createHttpResponseError()`로 **`code`·`retryable`·`httpStatus` drift**를 막습니다(Rule 5·6).
- `safeReadJsonUnknown()`는 `res.json().catch(() => ({}))`를 대체합니다.
- `fetchJsonWithTimeout()`는 HTTP 실패는 `createHttpResponseError`, 전송 계열은 `TIMEOUT`/`NETWORK`로 분리합니다.
- `wrapBridgeCall()`은 Rule 11의 `Promise.resolve` 패턴을 공용화합니다. **제네릭·fallback 불일치(`undefined` vs 배열 등)로 타입이 깨지지 않게** §3.8·§3.10 패턴을 따릅니다(Rule 7).

### 3.1 Before: `stockService`는 Supabase row를 즉시 신뢰합니다

```ts
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
```

문제:

- `data[0]`이 실제 row shape라는 보장이 없습니다.
- 실패 fallback은 있지만, **왜 실패했는지** 사라집니다.
- 동일한 zero-data 객체가 너무 자주 중복됩니다.

### 3.2 After: `stockService`는 row decoder와 fallback meta를 사용합니다

```ts
// §3.0과 동일 모듈 가정: isRecord, mapHttpStatusToErrorCode, isHttpStatusRetryable, createServiceError, failResult, okResult, supabase

// Rule 8: 시세 스냅샷 fallback·쿼리 한도의 비즈니스 의미를 상수로 고정
const DEFAULT_RSI = 50;
const DEFAULT_MA = 0;
const STOCK_SNAPSHOT_FETCH_LIMIT = 2;

interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  rsi: number;
  ma20: number;
  ma60: number;
  ma120: number;
}

interface SupabaseStockRow {
  symbol: string;
  close: number;
  trade_date: string;
}

const EMPTY_STOCK_DATA = (symbol: string): StockData => ({
  symbol,
  price: 0,
  change: 0,
  changePercent: 0,
  rsi: DEFAULT_RSI,
  ma20: DEFAULT_MA,
  ma60: DEFAULT_MA,
  ma120: DEFAULT_MA,
});

function decodeSupabaseStockRow(value: unknown): SupabaseStockRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const symbol = readString(value, 'symbol');
  const tradeDate = readString(value, 'trade_date');
  const close = readFiniteNumber(value, 'close');

  if (symbol == null || tradeDate == null || close == null || close <= 0) {
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
    .filter((row): row is SupabaseStockRow => row !== null);

  return rows.length > 0 ? rows : null;
}

function mapRowsToStockData(
  symbol: string,
  rows: SupabaseStockRow[],
): StockData {
  const currentRow = rows[0];
  const previousRow = rows[1] ?? currentRow;
  const currentPrice = currentRow.close;
  const previousPrice = previousRow.close;

  const rawChangePercent =
    previousPrice > 0
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : 0;

  // Rule 1: 퍼센트가 음수일 때 +EPSILON만 더하면 0 쪽으로 당겨져 반올림 대칭이 깨짐 → 부호에 따라 ±EPSILON
  const safeChangePercent =
    rawChangePercent !== 0
      ? Math.round(
          (rawChangePercent +
            Math.sign(rawChangePercent) * Number.EPSILON) *
            100,
        ) / 100
      : 0;

  return {
    symbol,
    price: currentPrice,
    change: currentPrice - previousPrice,
    changePercent: safeChangePercent,
    rsi: DEFAULT_RSI,
    ma20: DEFAULT_MA,
    ma60: DEFAULT_MA,
    ma120: DEFAULT_MA,
  };
}

/**
 * Supabase/PostgREST 클라이언트 에러에서 HTTP status 추출 (시뮬).
 * 실제 구현 시 `@supabase/supabase-js`가 노출하는 필드명에 맞춤(Rule 7 narrow).
 */
function tryGetPostgrestHttpStatusFromSupabaseError(
  error: unknown,
): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

export async function fetchLatestStockSnapshot(
  symbol: string,
): Promise<ServiceResult<StockData>> {
  const trimmedSymbol = symbol.trim();
  if (trimmedSymbol.length === 0) {
    return failResult(
      EMPTY_STOCK_DATA(''),
      createServiceError('INVALID_INPUT', 'stock_symbol_required'),
    );
  }

  try {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('symbol, close, trade_date')
      .eq('symbol', trimmedSymbol)
      .order('trade_date', { ascending: false })
      .limit(STOCK_SNAPSHOT_FETCH_LIMIT);

    if (error) {
      const httpStatus = tryGetPostgrestHttpStatusFromSupabaseError(error);
      if (httpStatus != null) {
        return failResult(
          EMPTY_STOCK_DATA(trimmedSymbol),
          createServiceError(
            mapHttpStatusToErrorCode(httpStatus),
            `http_${httpStatus}`,
            {
              retryable: isHttpStatusRetryable(httpStatus),
              httpStatus,
              cause: error,
              context: { symbol: trimmedSymbol },
            },
          ),
          { source: 'supabase' },
        );
      }

      return failResult(
        EMPTY_STOCK_DATA(trimmedSymbol),
        createServiceError('HTTP_ERROR', 'supabase_stock_query_failed', {
          retryable: false,
          cause: error,
          context: { symbol: trimmedSymbol },
        }),
        { source: 'supabase' },
      );
    }

    const rows = decodeSupabaseStockRows(data);
    if (rows == null) {
      return failResult(
        EMPTY_STOCK_DATA(trimmedSymbol),
        createServiceError('INVALID_RESPONSE', 'invalid_stock_rows_payload', {
          context: { symbol: trimmedSymbol },
        }),
        { source: 'supabase' },
      );
    }

    return okResult(
      mapRowsToStockData(trimmedSymbol, rows),
      { source: 'supabase' },
    );
  } catch (error: unknown) {
    return failResult(
      EMPTY_STOCK_DATA(trimmedSymbol),
      createServiceError('NETWORK', 'stock_snapshot_fetch_failed', {
        retryable: true,
        cause: error,
        context: { symbol: trimmedSymbol },
      }),
      { source: 'supabase' },
    );
  }
}
```

핵심:

- row decoder가 **shape를 검증한 뒤** 도메인으로 매핑합니다.
- `changePercent` 반올림은 Rule 1에 따라 **퍼센트 부호와 같은 방향으로 EPSILON**을 더해 음수 구간에서도 반올림 대칭을 유지합니다.
- RSI·MA 기본값·스냅샷 `limit`은 **Rule 8**에 따라 `DEFAULT_RSI`, `DEFAULT_MA`, `STOCK_SNAPSHOT_FETCH_LIMIT`로 상수화합니다(제품 SSOT는 향후 `constants/`와 병합 가능).
- Supabase `error`에서 **HTTP status를 뽑을 수 있으면** §3.0의 `mapHttpStatusToErrorCode`·`isHttpStatusRetryable`을 재사용해 fetch와 **동일 분류·동일 재시도 규칙**을 적용합니다(Rule 5·6). status를 알 수 없으면 `HTTP_ERROR` + `retryable: false`로 닫습니다.
- fallback은 그대로 유지하되, 이제는 `error.code`와 `meta.source`가 함께 남습니다.
- 이후 `fetchStockPrices()` 배치 함수는 `Promise.allSettled()` 또는 `ServiceResult` 수집기를 통해 부분 실패를 보존할 수 있습니다.

### 3.3 Before: `geminiService`는 JSON을 즉시 캐스팅합니다

```ts
const res = await fetch(EDGE_BASE_URL, {
  method: "POST",
  headers,
  body: JSON.stringify({
    mode: "analyze-trades",
    imageBase64,
    mimeType,
    tier: getTier(!!options?.isPaidUser),
  }),
});

if (!res.ok) {
  const text = await res.text();
  console.error("[Gemini] analyze worker error:", res.status, text);
  if (res.status === 429) {
    throw new Error("RATE_LIMIT");
  }
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }
  if (res.status === 403) {
    throw new Error("FORBIDDEN");
  }
  return { trades: [] };
}

const data = (await res.json()) as { trades?: RecognizedTradeItem[] };
if (!data || !Array.isArray(data.trades)) {
  return { trades: [] };
}
return { trades: data.trades };
```

문제:

- `trades` 내부 원소 shape는 전혀 검증하지 않습니다.
- `401/403/429`는 throw, 그 외는 fallback이라 **실패 모델이 이중화**되어 있습니다.
- timeout이 없습니다.

### 3.4 After: `geminiService`는 HTTP/JSON/도메인 디코딩을 분리합니다

```ts
interface RecognizedTradeItem {
  type: 'buy' | 'sell';
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee?: number;
  isMOC?: boolean;
}

interface RecognizedTradesPayload {
  trades: RecognizedTradeItem[];
}

const EMPTY_RECOGNIZED_TRADES: RecognizedTradesPayload = { trades: [] };
const GEMINI_TIMEOUT_MS = 12_000;

function decodeRecognizedTradeItem(value: unknown): RecognizedTradeItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, 'type');
  const stock = readString(value, 'stock');
  const date = readString(value, 'date');
  const price = readFiniteNumber(value, 'price');
  const quantity = readFiniteNumber(value, 'quantity');

  if (
    (type !== 'buy' && type !== 'sell') ||
    stock == null ||
    date == null ||
    price == null ||
    quantity == null ||
    price <= 0 ||
    quantity <= 0
  ) {
    return null;
  }

  const feeValue = value.fee;
  const fee =
    typeof feeValue === 'number' && Number.isFinite(feeValue) && feeValue >= 0
      ? feeValue
      : undefined;

  const isMOCValue = value.isMOC;
  const isMOC = typeof isMOCValue === 'boolean' ? isMOCValue : undefined;

  return {
    type,
    stock,
    date,
    price,
    quantity,
    fee,
    isMOC,
  };
}

function decodeRecognizedTradesResponse(
  payload: unknown,
): ServiceResult<RecognizedTradesPayload> {
  if (!isRecord(payload) || !Array.isArray(payload.trades)) {
    return failResult(
      EMPTY_RECOGNIZED_TRADES,
      createServiceError('INVALID_RESPONSE', 'gemini_trades_payload_invalid'),
    );
  }

  const trades = payload.trades
    .map((item) => decodeRecognizedTradeItem(item))
    .filter((item): item is RecognizedTradeItem => item !== null);

  return okResult({ trades });
}

export async function analyzeTradeScreenshotSafe(
  imageBase64: string,
  mimeType: string = 'image/png',
  options?: { isPaidUser?: boolean },
): Promise<ServiceResult<RecognizedTradesPayload>> {
  if (EDGE_BASE_URL.trim() === '') {
    return failResult(
      EMPTY_RECOGNIZED_TRADES,
      createServiceError('MISSING_ENV', 'gemini_edge_url_missing'),
    );
  }

  const headersResult = await getAuthHeadersSafe();
  const headers = headersResult.data;

  const fetchResult = await fetchJsonWithTimeout(
    EDGE_BASE_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'analyze-trades',
        imageBase64,
        mimeType,
        tier: getTier(options?.isPaidUser === true),
      }),
    },
    GEMINI_TIMEOUT_MS,
  );

  if (!fetchResult.ok) {
    return failResult(
      EMPTY_RECOGNIZED_TRADES,
      fetchResult.error,
    );
  }

  const decodedResult = decodeRecognizedTradesResponse(fetchResult.data);
  if (!decodedResult.ok) {
    return failResult(
      EMPTY_RECOGNIZED_TRADES,
      decodedResult.error,
    );
  }

  return okResult(decodedResult.data);
}
```

핵심:

- `RecognizedTradeItem[]`도 외부 응답이므로 원소 단위로 검증합니다.
- HTTP 실패와 payload 실패를 서로 다른 코드로 구분합니다.
- 상위 훅은 이제 `throw`/`null`/`[]` 혼합 규칙을 기억하지 않아도 됩니다.

### 3.5 Before: `tossAuth`는 서버 응답을 `{}`로 삼킨 뒤 직접 읽습니다

```ts
const { authorizationCode, referrer: referrerFromSdk } = await appLogin();
code = authorizationCode?.trim();

const res = await fetch(`${BFF_URL.replace(/\/+$/, '')}/auth/toss/exchange`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorizationCode: code, referrer }),
});

const data = await res.json().catch(() => ({}));

if (!res.ok) {
  const serverMessage =
    (typeof data?.error === 'string' ? data.error : data?.message ?? data?.error) ??
    '로그인에 실패했습니다.';
  return { success: false, error: serverMessage };
}

const accessToken = data.access_token ?? data.session?.access_token;
const refreshToken = data.refresh_token ?? data.session?.refresh_token;
```

문제:

- `res.json()` 실패가 `{}`로 뭉개집니다.
- 성공 payload의 token shape를 검증하지 않습니다.
- `appLogin()` 반환을 구조 분해·옵셔널 체이닝으로 맹신하면, 런타임이 깨졌을 때 `TypeError`로만 떨어질 수 있습니다(Rule 7).
- SDK 호출이 §3.0 `wrapBridgeCall` SSOT를 거치지 않고 인라인 `try`/`Promise.resolve`로만 처리됩니다(Rule 5·11).

### 3.6 After: `tossAuth`는 SDK/BFF/Supabase 세 경계를 각각 봉인합니다

```ts
// 토스 가이드라인: 로그인 등은 공식 @apps-in-toss/web-framework API만 사용
import { appLogin } from '@apps-in-toss/web-framework';

// §3.0과 동일 모듈 가정: wrapBridgeCall, fetchJsonWithTimeout, isRecord, readString,
// createServiceError, okResult, failResult, isTossApp, supabase, BFF_URL

interface TossExchangePayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
  } | null;
}

interface AppLoginPayload {
  authorizationCode: string;
  referrer: string;
}

function decodeAppLoginResponse(payload: unknown): ServiceResult<AppLoginPayload> {
  // Rule 7: SDK 반환도 런타임에서 plain object인지·필드가 있는지 검증 (Zero-Trust)
  if (!isRecord(payload)) {
    return failResult(
      { authorizationCode: '', referrer: 'DEFAULT' },
      createServiceError('INVALID_RESPONSE', 'toss_app_login_payload_invalid'),
    );
  }

  const authorizationCode = readString(payload, 'authorizationCode') ?? '';
  if (authorizationCode.length === 0) {
    return failResult(
      { authorizationCode: '', referrer: 'DEFAULT' },
      createServiceError('INVALID_RESPONSE', 'toss_authorization_code_missing'),
    );
  }

  const referrerFromSdk = readString(payload, 'referrer');
  const referrer = referrerFromSdk === 'SANDBOX' ? 'sandbox' : 'DEFAULT';

  return okResult({ authorizationCode, referrer });
}

function decodeTossExchangeResponse(
  payload: unknown,
): ServiceResult<TossExchangePayload> {
  if (!isRecord(payload)) {
    return failResult(
      {
        accessToken: '',
        refreshToken: '',
        user: null,
      },
      createServiceError('INVALID_RESPONSE', 'toss_exchange_payload_invalid'),
    );
  }

  const accessToken =
    readString(payload, 'access_token') ??
    (isRecord(payload.session) ? readString(payload.session, 'access_token') : null);
  const refreshToken =
    readString(payload, 'refresh_token') ??
    (isRecord(payload.session) ? readString(payload.session, 'refresh_token') : null);

  if (accessToken == null || refreshToken == null) {
    return failResult(
      {
        accessToken: '',
        refreshToken: '',
        user: null,
      },
      createServiceError('INVALID_RESPONSE', 'toss_exchange_tokens_missing'),
    );
  }

  const userRecord = isRecord(payload.user) ? payload.user : null;
  const user =
    userRecord == null
      ? null
      : {
          id: readString(userRecord, 'id') ?? '',
          email: readString(userRecord, 'email') ?? '',
        };

  return okResult({
    accessToken,
    refreshToken,
    user,
  });
}

export async function loginWithTossSafe(): Promise<
  ServiceResult<{ id: string; email: string } | null>
> {
  if (!isTossApp()) {
    return failResult(
      null,
      createServiceError('UNSUPPORTED_ENV', 'toss_app_required'),
    );
  }

  if (!BFF_URL?.trim()) {
    return failResult(
      null,
      createServiceError('MISSING_ENV', 'railway_bff_url_missing'),
    );
  }

  // Rule 5·11: 브릿지 호출은 wrapBridgeCall SSOT (내부에서 Promise.resolve로 sync/async 수렴)
  const loginCallResult = await wrapBridgeCall<unknown>(
    () => appLogin(),
    null,
    { action: 'appLogin' },
  );

  if (!loginCallResult.ok) {
    return failResult(null, loginCallResult.error);
  }

  const loginPayloadResult = decodeAppLoginResponse(loginCallResult.data);
  if (!loginPayloadResult.ok) {
    return failResult(null, loginPayloadResult.error);
  }

  const { authorizationCode, referrer } = loginPayloadResult.data;

  const fetchResult = await fetchJsonWithTimeout(
    `${BFF_URL.replace(/\/+$/, '')}/auth/toss/exchange`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationCode,
        referrer,
      }),
    },
  );

  if (!fetchResult.ok) {
    return failResult(null, fetchResult.error);
  }

  const payloadResult = decodeTossExchangeResponse(fetchResult.data);
  if (!payloadResult.ok) {
    return failResult(null, payloadResult.error);
  }

  try {
    const { accessToken, refreshToken, user } = payloadResult.data;
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionError) {
      return failResult(
        null,
        createServiceError('AUTH_REQUIRED', 'supabase_set_session_failed', {
          cause: setSessionError,
        }),
      );
    }

    return okResult(user);
  } catch (error: unknown) {
    return failResult(
      null,
      createServiceError('UNKNOWN', 'toss_login_finalize_failed', {
        cause: error,
      }),
    );
  }
}
```

핵심:

- **`appLogin` 반환값**도 `unknown` 취급 후 `decodeAppLoginResponse`로 검증합니다 — SDK 타입 선언과 런타임 불일치 시에도 필드 접근 전에 실패를 `ServiceResult`로 닫습니다(Rule 7·Zero-Trust).
- **`wrapBridgeCall`** 으로 Toss SDK 호출을 §3.0과 동일한 브릿지 SSOT에 올려 Rule 5·11을 맞춥니다.
- BFF fetch는 `fetchJsonWithTimeout` + `decodeTossExchangeResponse`로 봉인합니다.
- **`supabase.auth.setSession`은 별도 `try-catch` 구역으로 격리 유지(확정·비가역):** 토스/BFF 성공 이후 **자체 DB(세션) 기록 실패**를 `AUTH_REQUIRED` / `supabase_set_session_failed`로 추적해야 하므로, `wrapBridgeCall` 등 브릿지 SSOT와 **합치지 않습니다**(원인 분리·Rule 6).
- `res.json().catch(() => ({}))` 패턴은 BFF 경로에서 제거된 상태를 유지합니다.

#### 3.6.1 토스 공식 가이드라인과의 정합성

- **공식 API만 사용**: `appLogin`은 [앱인토스 문서](https://developers-apps-in-toss.toss.im)에서 안내하는 것과 같이 `@apps-in-toss/web-framework`에서 import합니다. 비공식 엔드포인트나 문서에 없는 우회 호출을 추가하지 않습니다.
- **Zero-Trust는 스펙 위반이 아님**: 런타임 decode는 SDK **계약 필드**(`authorizationCode`, `referrer` 등)를 검증하는 클라이언트 방어층일 뿐, 토스 로그인 플로우를 바꾸거나 대체하지 않습니다.
- **Rule 11**: `wrapBridgeCall` 구현이 내부에서 `Promise.resolve(action())`을 쓰는 전제와 합치되므로, 문서의 Toss·브릿지 예외 처리 원칙과 충돌하지 않습니다.
- **BFF `referrer` 계약(확정·비가역)**: SDK `referrer === 'SANDBOX'` → BFF 페이로드 `sandbox`, 그 외 → `DEFAULT`. 기존 `services/toss/tossAuth.ts` 제품 계약과 동일하며 **변경하지 않습니다.**

### 3.6.2 확정 정책 (비가역)

팀이 아래를 **최종 확정**했습니다. B2 구현·리뷰·QA는 이를 위반하지 않습니다.

1. **`setSession` 격리 유지**  
   - `supabase.auth.setSession`은 §3.6 After 스니펫과 같이 **독립된 `try-catch` 블록**에만 둡니다.  
   - **금지:** 이 구간을 `wrapBridgeCall`로 흡수하거나 Toss 브릿지 레이어와 단일화하는 것.  
   - **이유:** 토스 인증·BFF 교환은 성공했으나 **앱 자체 세션(Supabase 클라이언트) 기록**이 실패한 경우를 `AUTH_REQUIRED` + `supabase_set_session_failed`로 구체 추적해야 하며, SDK/네트워크 실패와 **원인·재시도 정책을 분리**하기 위함입니다(Rule 6·SRP).

2. **`referrer` 매핑**  
   - **확정:** `SANDBOX` → BFF용 `sandbox`, 그 외 → `DEFAULT` (현 제품 계약 그대로).  
   - `decodeAppLoginResponse` 및 BFF 요청 본문은 이 매핑만 사용합니다.

### 3.7 Before: `restorePendingIapOrders`는 결과를 잃어버립니다

```ts
export async function restorePendingIapOrders(): Promise<void> {
  const iap = getIapBridge();
  if (!iap) {
    return;
  }

  try {
    const pendingResponse = await iap.getPendingOrders();
    const pendingOrders = getPendingOrderList(pendingResponse);

    for (const order of pendingOrders) {
      if (!order?.orderId) {
        continue;
      }
      const isGranted = await verifyAndGrantProductOnServer(
        order.orderId,
        TOSS_IAP_FIXED_PLAN_ID,
        1,
      );
      if (isGranted) {
        await iap.completeProductGrant({ orderId: order.orderId });
      }
    }
  } catch (error) {
    console.error('[IAP] 미결 주문 복원 실패:', error);
  }
}
```

문제:

- 성공/실패 order 수가 없습니다.
- `getPendingOrders`, `completeProductGrant` 호출이 Rule 11 표준 wrapper를 거치지 않습니다.
- order 하나 실패 시 어떤 order가 실패했는지 상위에서 알 수 없습니다.

### 3.8 After: `restorePendingIapOrders`는 summary result를 반환합니다

```ts
interface RestorePendingOrdersSummary {
  restoredOrderIds: string[];
  failedOrderIds: string[];
  skippedOrderIds: string[];
}

const EMPTY_RESTORE_SUMMARY: RestorePendingOrdersSummary = {
  restoredOrderIds: [],
  failedOrderIds: [],
  skippedOrderIds: [],
};

function decodePendingOrder(value: unknown): { orderId: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const orderId = readString(value, 'orderId');
  if (orderId == null) {
    return null;
  }

  return { orderId };
}

function decodePendingOrdersPayload(
  payload: unknown,
): ServiceResult<Array<{ orderId: string }>> {
  if (Array.isArray(payload)) {
    const orders = payload
      .map((item) => decodePendingOrder(item))
      .filter((item): item is { orderId: string } => item !== null);
    return okResult(orders);
  }

  if (isRecord(payload) && Array.isArray(payload.orders)) {
    const orders = payload.orders
      .map((item) => decodePendingOrder(item))
      .filter((item): item is { orderId: string } => item !== null);
    return okResult(orders);
  }

  return failResult(
    [],
    createServiceError('INVALID_RESPONSE', 'iap_pending_orders_invalid'),
  );
}

export async function restorePendingIapOrdersSafe(): Promise<
  ServiceResult<RestorePendingOrdersSummary>
> {
  const iap = getIapBridge();
  if (iap == null) {
    return failResult(
      EMPTY_RESTORE_SUMMARY,
      createServiceError('UNSUPPORTED_ENV', 'iap_bridge_unavailable'),
    );
  }

  const summary: RestorePendingOrdersSummary = {
    restoredOrderIds: [],
    failedOrderIds: [],
    skippedOrderIds: [],
  };

  const pendingOrdersResult = await wrapBridgeCall<unknown>(
    () => iap.getPendingOrders(),
    null,
    { action: 'getPendingOrders' },
  );

  if (!pendingOrdersResult.ok) {
    return failResult(EMPTY_RESTORE_SUMMARY, pendingOrdersResult.error);
  }

  const decodedOrdersResult = decodePendingOrdersPayload(
    pendingOrdersResult.data,
  );

  if (!decodedOrdersResult.ok) {
    return failResult(EMPTY_RESTORE_SUMMARY, decodedOrdersResult.error);
  }

  for (const order of decodedOrdersResult.data) {
    const verifyResult = await verifyAndGrantProductOnServerSafe(
      order.orderId,
      TOSS_IAP_FIXED_PLAN_ID,
      1,
    );

    if (!verifyResult.ok) {
      summary.failedOrderIds.push(order.orderId);
      continue;
    }

    if (verifyResult.data !== true) {
      summary.skippedOrderIds.push(order.orderId);
      continue;
    }

    const completeResult = await wrapBridgeCall<unknown>(
      () => iap.completeProductGrant({ orderId: order.orderId }),
      null,
      { action: 'completeProductGrant', orderId: order.orderId },
    );

    if (!completeResult.ok) {
      summary.failedOrderIds.push(order.orderId);
      continue;
    }

    summary.restoredOrderIds.push(order.orderId);
  }

  return okResult(summary);
}
```

핵심:

- `Promise<void>`가 아니라 복원 summary를 반환해야 B3/B4에서 후속 분기가 가능합니다.
- `wrapBridgeCall<unknown>(..., null, ...)`로 SDK 호출의 **타입·fallback 정합성**을 맞춥니다(Rule 7); 이후 payload는 `decodePendingOrdersPayload`로만 소비합니다.
- 부분 실패가 더 이상 사라지지 않습니다.

### 3.9 Before: `tossAppBridge`는 silent fallback이 많습니다

```ts
export const loadWebFramework = async (): Promise<WebFrameworkModule | null> => {
  if (_cachedModule) return _cachedModule;
  if (!isTossApp()) return null;

  try {
    const mod = await import('@apps-in-toss/web-framework');
    _cachedModule = mod as WebFrameworkModule;
    return _cachedModule;
  } catch (error) {
    console.warn('[TossApp] web-framework 로드 실패:', (error as Error).message);
    return null;
  }
};

export const openExternalUrl = async (url: string): Promise<void> => {
  if (!url) return;
  if (isTossApp()) {
    const mod = await loadWebFramework();
    if (typeof mod?.openURL === 'function') {
      try {
        await mod.openURL(url);
        return;
      } catch (e) {
        console.warn('[TossApp] openURL 실패, window.open 폴백:', (e as Error).message);
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
```

문제:

- `null`은 unsupported인지 import failure인지 구분하지 못합니다.
- `mod as WebFrameworkModule` 역시 런타임 shape를 신뢰합니다.
- `openURL` 실패 후 fallback은 좋지만, 호출자는 fallback이 발생했는지 알 수 없습니다.

### 3.10 After: `tossAppBridge`는 bridge result를 반환합니다

```ts
interface WebFrameworkModule {
  openURL?: (url: string) => Promise<unknown>;
}

interface OpenExternalUrlResult {
  used: 'toss_open_url' | 'window_open' | 'noop';
}

function decodeWebFrameworkModule(value: unknown): WebFrameworkModule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.openURL !== undefined &&
    typeof value.openURL !== 'function'
  ) {
    return null;
  }

  return {
    openURL:
      typeof value.openURL === 'function'
        ? value.openURL
        : undefined,
  };
}

export async function loadWebFrameworkSafe(): Promise<
  ServiceResult<WebFrameworkModule | null>
> {
  if (!isTossApp()) {
    return failResult(
      null,
      createServiceError('UNSUPPORTED_ENV', 'toss_app_not_detected'),
    );
  }

  try {
    const importedModule = await Promise.resolve(import('@apps-in-toss/web-framework'));
    const decodedModule = decodeWebFrameworkModule(importedModule);

    if (decodedModule == null) {
      return failResult(
        null,
        createServiceError('INVALID_RESPONSE', 'web_framework_shape_invalid'),
      );
    }

    return okResult(decodedModule);
  } catch (error: unknown) {
    return failResult(
      null,
      createServiceError('SDK_ERROR', 'web_framework_import_failed', {
        cause: error,
      }),
    );
  }
}

export async function openExternalUrlSafe(
  url: string,
): Promise<ServiceResult<OpenExternalUrlResult>> {
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return failResult(
      { used: 'noop' },
      createServiceError('INVALID_INPUT', 'external_url_required'),
    );
  }

  if (isTossApp()) {
    const moduleResult = await loadWebFrameworkSafe();
    if (moduleResult.ok && typeof moduleResult.data?.openURL === 'function') {
      const openResult = await wrapBridgeCall<unknown>(
        () => moduleResult.data?.openURL?.(trimmedUrl),
        null,
        { action: 'openURL' },
      );

      if (openResult.ok) {
        return okResult({ used: 'toss_open_url' });
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.open(trimmedUrl, '_blank', 'noopener,noreferrer');
    return failResult(
      { used: 'window_open' },
      createServiceError('SDK_ERROR', 'toss_open_url_fallback_used'),
    );
  }

  return failResult(
    { used: 'noop' },
    createServiceError('UNSUPPORTED_ENV', 'window_open_unavailable'),
  );
}
```

핵심:

- fallback은 유지하되, 이제 호출자는 **fallback이 사용되었는지** 알 수 있습니다.
- dynamic import도 decoder를 거친 뒤 사용합니다.

### 3.11 Before: `supabase.ts`는 env 누락 시 import-time throw를 발생시킵니다

```ts
function getRequiredClientEnv(key: RequiredClientEnvKey): string {
  const value = import.meta.env[key];
  if (value != null && value.trim() !== '') {
    return value;
  }

  throw new Error(`[Supabase] Missing required env: ${key}`);
}

const supabaseUrl = getRequiredClientEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getRequiredClientEnv('VITE_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { ... });
```

문제:

- 서비스 경계의 env 누락이 앱 전체 부팅 실패로 이어집니다.
- B2의 목표는 "크래시 대신 구조화된 실패"입니다.

### 3.12 After: `supabase.ts`는 lazy singleton + env result를 사용합니다

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseClientEnv {
  url: string;
  anonKey: string;
}

let supabaseSingleton: SupabaseClient | null = null;

/**
 * 프로덕션 SSOT: `utils/viteImportMetaEnv.ts` — 시뮬 요약(동일 로직).
 * `import.meta?.env` 금지(Phase A·TS 파싱). 상위 메타는 `typeof` 가드만 사용.
 */
function getViteImportMetaEnv(): ImportMetaEnv | undefined {
  if (typeof import.meta === 'undefined') {
    return undefined;
  }
  const env = import.meta.env;
  if (env == null || typeof env !== 'object') {
    return undefined;
  }
  return env;
}

function readSupabaseClientEnv(): ServiceResult<SupabaseClientEnv> {
  const env = getViteImportMetaEnv();
  const rawUrl = env?.VITE_SUPABASE_URL;
  const rawAnonKey = env?.VITE_SUPABASE_ANON_KEY;

  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const anonKey = typeof rawAnonKey === 'string' ? rawAnonKey.trim() : '';

  if (url.length === 0 || anonKey.length === 0) {
    return failResult(
      { url: '', anonKey: '' },
      createServiceError('MISSING_ENV', 'supabase_client_env_missing'),
    );
  }

  return okResult({ url, anonKey });
}

export function getSupabaseClientSafe(): ServiceResult<SupabaseClient | null> {
  if (supabaseSingleton != null) {
    return okResult(supabaseSingleton);
  }

  const envResult = readSupabaseClientEnv();
  if (!envResult.ok) {
    return failResult(null, envResult.error);
  }

  const client = createClient(envResult.data.url, envResult.data.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: authStorage,
      storageKey: 'sb-auth-token',
    },
  });

  supabaseSingleton = client;
  return okResult(client);
}
```

핵심:

- env 누락이 더 이상 import-time crash를 만들지 않습니다.
- **`typeof import.meta !== 'undefined'`** 로 **메타 객체 부재 ReferenceError**를 막은 뒤, **`getViteImportMetaEnv()`** 가 준 env에 대해서만 **`?.VITE_*`** 를 사용합니다. 구현 SSOT는 **`utils/viteImportMetaEnv.ts`** (`import.meta?.env` 는 Phase A와 같이 **금지**).
- 상위 레이어는 `supabase unavailable` 상태를 명시적으로 다룰 수 있습니다.

---

## 4. 실제 적용 시 체크리스트

- 외부 응답에 `as DomainType`, `as RowType[]`, `as Error`가 남아 있지 않은가
- `isRecord()`가 **`!Array.isArray(value)`** 로 배열 오인을 막는가
- HTTP 상태 → 에러 코드 매핑에 **중첩 삼항**이 없고 `switch`/헬퍼로 평탄한가
- `404`→`NOT_FOUND`, `5xx`→`SERVER_ERROR`가 분리되어 있고, HTTP 응답 기준 **`retryable`은 `429`·`5xx`만** `true`인가 (`isHttpStatusRetryable` SSOT)
- `fetch` 실패가 `createHttpResponseError` 등 **단일 조립 경로**를 거치는가
- 시세·결제 등 도메인 의미가 있는 숫자(RSI 기본, MA 기본, 쿼리 limit 등)가 **매직 넘버 없이** 상수화되는가
- `res.json().catch(() => ({}))` 같은 parse-swallow 패턴이 제거되는가
- `fetch`에 timeout/abort가 빠지지 않는가
- 서비스 함수가 `null`, `[]`, `{}`만 던지고 실패 이유를 잃지 않는가
- Toss/광고/Firebase/브릿지 호출이 `Promise.resolve(...)` 또는 동등 래퍼를 거치는가
- `wrapBridgeCall`에서 **`fallback` 타입이 `T`와 일치**하는가(배열 반환 SDK에 `undefined` fallback 금지; 디코딩 전에는 `wrapBridgeCall<unknown>(..., null, ...)`)
- `stockService` `changePercent`가 **부호 있는 EPSILON** 보정을 쓰는가(Rule 1)
- Supabase·기타 서비스가 **`getViteImportMetaEnv()`**(또는 동등한 `typeof import.meta !== 'undefined'` 가드) 뒤 **`env?.VITE_*`** 만 읽는가(`import.meta?.env` 미사용)
- `appLogin` 등 Toss SDK 진입이 **`wrapBridgeCall`** 과 **`decodeAppLoginResponse`**(또는 동등 decoder)를 거치는가
- `setSession`이 **`wrapBridgeCall`과 분리**된 `try-catch`에 있고, 실패 시 `supabase_set_session_failed` 등으로 **세션 기록 실패만** 추적 가능한가 (§3.6.2)
- Toss BFF 요청 `referrer`가 **확정 매핑**(`SANDBOX`→`sandbox`, 그 외 `DEFAULT`)을 위반하지 않는가
- callback 기반 SDK Promise가 double settle / never settle / swallowed rejection을 막는가
- `stockService.ts`의 `!` non-null assertion이 제거 가능한 구조인가
- `stockService.ts`에서 row decoder, inflight coordinator, cache writer, localStorage writer 책임이 분리되는가
- `supabase.ts`와 `firebase.ts`의 import-time side effect가 줄어드는가
- `db.ts`의 local I/O 실패 계약이 다른 서비스와 같은 결과 모델로 정렬되는가
- fallback 값이 도메인적으로 안전한가
- B2 문서의 structured error code를 B3 훅에서 그대로 소비할 수 있는가

---

## 5. 최종 결론

Phase B2의 본질은 `services/` 파일을 예쁘게 정리하는 작업이 아닙니다.  
핵심은 **외부 세계의 거짓말을 서비스 경계에서 전부 흡수하는 것**입니다.

1. 외부 응답은 모두 `unknown`으로 받고, 런타임 디코더로 도메인 모델로 승격합니다.
2. 모든 네트워크/SDK/브릿지 호출은 `try-catch`, timeout, fallback, structured error를 기본 계약으로 가집니다.
3. `null`/`[]`/`false` fallback은 유지할 수 있지만, 반드시 **이유가 함께 남아야** 합니다.
4. Rule 11에 따라 브릿지와 callback 기반 SDK는 `Promise.resolve(...)`와 `settleOnce()` 패턴으로 봉인합니다.
5. B2가 끝나면 B3는 더 이상 통신 실패와 타입 거짓말을 직접 상대하지 않고, **서비스 결과를 조립하는 훅 레이어**에만 집중할 수 있어야 합니다.
6. HTTP 실패는 `NOT_FOUND`·`SERVER_ERROR` 등 **의미별 코드**로 나뉘고, 재시도 가능 여부는 **`isHttpStatusRetryable`** 한곳에 모여 Core Principles **Rule 5·6·8**과 충돌하지 않습니다.
7. 토스 로그인 후처리는 **확정 정책(§3.6.2)** 을 따릅니다: `setSession`은 **별도 `try-catch`로 격리**하여 `supabase_set_session_failed` 추적을 유지하고, **`referrer`는 `SANDBOX`/`DEFAULT` 제품 계약**을 변경하지 않습니다.
8. Node·테스트 등에서 **`import.meta` 부재 ReferenceError**를 막기 위해 env 읽기는 **`typeof import.meta !== 'undefined'`** 가드가 들어간 **`utils/viteImportMetaEnv.ts`(`getViteImportMetaEnv`)** 로 수렴합니다; 나머지 `services/*.ts`·컴포넌트의 직접 `import.meta.env` 접근은 B2 범위에서 점진 이전합니다.

이 기준대로 진행하면 B2 실제 수정 대상의 우선순위는 아래 순서가 됩니다.

- `services/supabase.ts`
- `services/stockService.ts`
- `services/geminiService.ts`
- `services/toss/tossAuth.ts`
- `services/payment/tossIapService.ts`
- `services/tossAppBridge.ts`
- `services/ads/tossIntegratedFullScreenAdApi.ts`
- `services/ads/rewardAdService.ts`
- `services/db.ts`
- `services/firebase.ts`
