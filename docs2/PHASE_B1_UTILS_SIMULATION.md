# PHASE B1: Utils Layer Simulation

> 목적: 실제 소스 코드를 수정하기 전에 `utils/` 내부의 **순수 도메인 수학 및 유틸리티 함수**를 어떻게 분리·보강할지 가상 런타임 기준으로 검증하는 문서입니다.  
> 원칙: 이 문서는 계획과 시뮬레이션만 다루며, 현재 저장소의 실제 파일은 수정하지 않습니다.

## 0. Mental Compile 전제

- Phase B1은 Phase B 전체 중 **가장 낮은 위험도**의 마이크로 스텝입니다.
- 단, `utils/` 폴더에는 이미 **순수 계산 함수**와 **외부 I/O 의존 유틸**이 섞여 있으므로, 폴더 이름만 보고 일괄 리팩토링하면 안 됩니다.
- B1에서 실제로 다룰 대상은 아래 조건을 모두 만족하는 함수입니다.
  - React 훅, DOM, `window`, `localStorage`에 직접 의존하지 않습니다.
  - `services/*`, Supabase, 브리지, 토스트 호출에 직접 의존하지 않습니다.
  - 입력만으로 출력이 결정되는 순수 수학·파싱·포맷 함수이거나, 최소한 해당 파일 안에서 **순수 부분만 분리 추출 가능**합니다.
- **Core Principles 11항**은 §0.1 표로 본 문서 전체와 정렬합니다. 그중 B1에서 코드로 직접 증명하기 쉬운 **Rule 1 (Financial Math)**, **Rule 7 (Strict TS)** 을 구현 스니펫에서 특히 엄격히 둡니다.
  - 나눗셈 전 분모 0·음수·비유한값을 반드시 가드합니다.
  - 반올림·올림·내림에서 `Number.EPSILON` 보정 방향을 **연산 종류에 맞게** 씁니다. (아래 §2.1.1)
  - `typeof`, `Number.isFinite`, `unknown` 좁히기를 통해 느슨한 숫자 입력을 차단합니다.
  - 사용자 입력·외부 데이터에서 **문자열 → 숫자**로 넘기기 전 **`trim()`** 으로 공백으로 인한 `NaN` 을 방지합니다(§2.1.4).
- 성공 기준은 아래 6가지입니다.
  - 순수 수학 함수에 **divide-by-zero** 진입 경로가 남지 않습니다.
  - 통화/수익률/평단/주문 가격 계산이 `Number.EPSILON` 기반으로 일관되게 반올림됩니다.
  - **날짜·기간(일수·주차·사이클 몫 등) 산술 뒤 정수로 내릴 때** `Math.floor(x + Number.EPSILON)` 을 **예외 없이** 적용합니다(§2.1.2).
  - `isNaN`, `toFixed` 남용, 암묵적 숫자 강제 변환 같은 느슨한 패턴이 제거됩니다. 금융 스칼라·**정수 period**·**가격 배열**·**UTC ms(`>= 0` 계약, `areFiniteNonNegativeScalars`)** 검증은 §3.0·§2.1.3 SSOT로 **산재 인라인 가드를 제거**합니다.
  - 외부 I/O 의존 함수는 B1 대상에서 분리되고, B2 경계로 명시 이관됩니다.
  - After 스니펫이 실제 함수 시그니처와 1:1로 대응되어, "가상 런타임 시뮬레이션"이 가능해집니다.

### 0.1 Core Principles (11) — 본 시뮬레이션 문서 정렬

워크스페이스 **Core Principles** 전체를 B1 시뮬레이션 범위에 맞게 아래처럼 적용·한정합니다.

| # | 원칙 | B1 `utils/` 시뮬레이션에서의 의미 |
|---|------|-------------------------------------|
| **1** | Financial Math | 분모 가드, 주문 루프 `price > 0` / 비용·대금 `> 0` `break`, 부호 강제(`-Math.abs` 등), `Number.EPSILON`의 **연산별 방향**(§2.1.1·§2.1.2). **검증 이원화**(§2.1.3): VR **`validateFinancialArgs`(Record·규칙·`throw`)** + B1 SSOT **`areStrictPositiveFiniteScalars` / `areFiniteNonNegativeScalars` / `isStrictPositiveInteger` / `areAllFiniteNumbers`**(§3.0). **주식·백테스트 UTC ms**(`startDateMs` 등)는 제품 계약상 **`>= 0` 만** — **`areFiniteNonNegativeScalars`** 로 음수·비유한을 원천 차단(§3.16). 선택적으로 **`areFiniteScalars`**(음수 유한 허용 스칼라)는 ms 외 도메인용. **사용자·외부 `string` → 숫자**는 **`trim()` 후 파싱**(§2.1.4·§3.0)으로 `NaN`·오동작을 줄입니다. |
| **2** | React / 렌더 이펙트 | B1 스니펫은 **순수 TS 함수만** 다룹니다. `useRef` 변이·렌더 중 사이드 이펙트는 **문서 범위 밖**(Phase B3). |
| **3** | I18n / 하드코딩 | 순수 유틸에 **사용자 노출 문구를 박지 않습니다.** 날짜·금액 **표시**는 `cycleFormat` 주입·formatter 인자 등 기존 패턴을 유지하고, 본 문서 스니펫의 한글/영문은 **설명용 의사코드**가 아니라 **주입 계약 예시**로만 씁니다. |
| **4** | Accessibility | `utils/` 단독 레이어에서는 직접 적용 대상이 거의 없습니다. 상호작용 가능한 비시맨틱 요소는 **Phase C**에서 검증합니다. |
| **5** | Architecture / DRY / OCP | 금융·날짜·지표 **반올림·floor·ceil primitive** 를 SSOT로 두고, 파일별 `toFixed` 난립을 끊습니다. 전략별 특수 분기는 **설정/모듈 분리**로 확장합니다. |
| **6** | Clean code / SRP / 복잡도 | 검증·반올림·순수 계산·I/O 래퍼를 한 함수에 섞지 않습니다. 중첩 `if` 2단 초과 금지, 조기 반환. **종가 배열 등 동일 도메인 검증**은 파일마다 `every(Number.isFinite)` 로 파편화하지 않고 §3.0 **`areAllFiniteNumbers`** 로 DRY 유지. **외부 문자열 숫자 파싱**은 §3.0 `parseNumberFromTrimmedExternalString` 등 SSOT로 DRY 유지. |
| **7** | Strict TS | `any` 금지, `unknown`은 `typeof`/`Array.isArray` 등으로 좁힌 뒤만 처리. **`string`이면 `trim()` 후 `Number`** (§2.1.4·§3.17). `switch` 시 `never` 배타, `!` 비단언. 스칼라·정수·배열 검증은 §3.0과 조합합니다. |
| **8** | 네이밍 / 매직 넘버 | `DAY_MS`, `HOLDINGS_QTY_EPSILON` 등 의미 있는 상수명으로 승격; 불린은 `is`/`has`/`should` 접두사. |
| **9** | 주석 | "무엇"이 아니라 **왜**(금융·부동소수점·규제 이유)만 남깁니다. |
| **10** | 성능 / 상태 위치 | B1은 대개 O(n) 순회 수준; 맹목적 `useMemo`는 해당 없음. **호출마다 새로 만들 필요 없는 순수 포맷터**는 모듈 스코프로 격리해 GC 부담을 줄입니다(§3.12 `formatParts`). 상태는 사용처에 최대한 근접. |
| **11** | 비동기 UI / 뮤텍스 / 브릿지 | **Phase B4·B2** 범위입니다. B1 시뮬레이션은 이들을 **도입하지 않되**, 순수 계산 결과가 이후 레이어에서 안전히 소비된다는 전제만 유지합니다. (서비스·폼에서 넘어오는 문자열 숫자는 B2에서도 **§2.1.4 `trim`** 계약을 공유합니다.) |

---

## 1. B1 레이어 진단

### 1.1 B1 범위 분류

| 경로 | 현재 성격 | B1 포함 여부 | 판단 |
|---|---|---|---|
| `utils/technicalIndicators.ts` | MA/RSI 순수 수학 | 포함 | 핵심 수학 레이어입니다. divide-by-zero, period 검증, 반올림 일관성이 중요합니다. |
| `utils/vrBandStrategy.ts` | VR 밴드 수학 + 일부 날짜/표시 | **부분 포함** | `calculatePoolDelta`, `calculateNextV`, `calculateBands`, `generateBuyOrders`, `generateSellOrders`는 B1 핵심입니다. `Intl.DateTimeFormat` 기반 표시 문자열은 B1에서 최소 유지 또는 별도 보조 대상으로 둡니다. |
| `utils/multiSplitCalc.ts` | 다분할 주문 수학 | 포함 | `calcT`, `calcNewOneTimeAmount`, `safeOrder`, `calcMultiSplitOrders`는 금융 수학 리스크가 큽니다. |
| `utils/noStopMultiSplitCalc.ts` | 무손절 다분할 수학 | 포함 | 현재 round 계산, 가격 반올림, 수량 안전화 로직이 B1 대상입니다. |
| `utils/currency.ts` | 통화 포맷·금액 계산 | 포함 | KRW/USD 표시와 총액 계산은 반올림·NaN 방어 SSOT가 필요합니다. |
| `utils/dateHelpers.ts` | 날짜 문자열 생성 | 포함 | 순수 날짜 포맷 유틸입니다. |
| `utils/dateUtils.ts` | 날짜 계산·표시 | **부분 포함** | KST 날짜 계산과 `addDays`는 포함합니다. 런타임 timezone 조회는 B1 보조 범위입니다. |
| `utils/marketUtils.ts` | 휴장일 계산 + `window.localStorage` 메시지 조합 | **부분 포함** | 휴장일 계산은 순수 함수입니다. `getMarketStatus`는 브라우저 의존이 있어 B1 순수 코어와 분리 필요합니다. |
| `utils/portfolioCalculations.ts` | 보유내역 계산 + 서비스 fetch 혼합 | **부분 포함** | `calculateHoldings`, `calculateInvestedAmount`, `calculateTotalInvested`, `getTotalSellProceeds`는 B1 후보입니다. fetch 기반 valuation/yield는 B2 경계입니다. |
| `utils/portfolioNormalize.ts` | 외부 row 정규화 | 제외 | Supabase 응답 경계에 해당하므로 B2에서 다룹니다. |
| `utils/getDictionaryCopy.ts` | 토스트·사전 fallback | 제외 | UI/토스트 side effect가 있어 B1 범위가 아닙니다. |
| `utils/subscriptionUtils.ts`, `utils/authHelpers.ts`, `utils/supabaseAuthStorage.ts`, `utils/appEntryHelpers.ts` | 외부 I/O·브라우저·인증 | 제외 | B2 또는 B3 범위입니다. |

### 1.2 치명 리스크 진단표

| 파일 | 함수 | 현재 리스크 | 왜 위험한가 | B1 조치 |
|---|---|---|---|---|
| `utils/technicalIndicators.ts` | `calculateMA` | `period <= 0` 가드 부재 | 현재 `prices.length < period`만 검사하므로 `period === 0`이면 `sum / 0`으로 진입할 수 있습니다. | §3.0 **`isStrictPositiveInteger(period)`** + **`areAllFiniteNumbers(prices)`** 후 실패 시 `0` 반환 (§3.2) |
| `utils/technicalIndicators.ts` | `calculateRSI` | `period <= 0`, `avgGain /= period`, `avgLoss /= period` | 잘못된 period가 들어오면 Wilder smoothing 전체가 무너집니다. | §3.0 **`isStrictPositiveInteger`**, **`areAllFiniteNumbers`** — invalid period면 중립값 `50` 반환, 계산 중 모든 분기에서 finite 보장 (§3.4) |
| `utils/multiSplitCalc.ts` | `calcT` | `dailyBuyAmount === 0`만 검사 + **`Math.ceil`에 `+ EPSILON` 오용 시 상향 드리프트** + **인라인 finite/부등호 산재** | `NaN`, 음수, 비정상 소수 입력이 들어오면 수식이 왜곡됩니다. 2자리 `ceil`에서 `(value + EPSILON) * 100`은 정확히 `1.00`에 가까운 비율을 **101/100으로 과올림**할 수 있습니다. | §3.0 **`areStrictPositiveFiniteScalars`** + **`Math.ceil((value - Number.EPSILON) * 100) / 100`** (§3.6) |
| `utils/noStopMultiSplitCalc.ts` | `calcNoStopCurrentRound` | 분모 방어 약함 | `oneTimeAmount`가 `NaN`, 음수, 무한대면 round 계산이 깨집니다. | `calcT`와 동일한 안전 규칙으로 통일 |
| `utils/multiSplitCalc.ts` | `safeOrder`, `orderEntryForDisplay` | `isNaN` 사용, `toFixed(2)` 직접 사용 + **`Math.floor(qty)` 하향 드리프트** + **가격·수량 인라인 검증 산재** | 나눗셈으로 나온 수량이 `1.9999999999999998`이면 정당한 1주가 0으로 떨어질 수 있습니다. | §3.0 **`areStrictPositiveFiniteScalars(price, qty)`** + `roundMoney` + **`Math.floor(quantity + Number.EPSILON)`** (§3.8) |
| `utils/multiSplitCalc.ts` | `calcNewOneTimeAmount` | 최종 금액 반올림 정책 부재 | 이후 주문 수량 계산에 미세한 소수 오차가 누적될 수 있습니다. | 반환 직전 `roundMoney` 적용 |
| `utils/portfolioCalculations.ts` | `calculateYield` | 순수 계산과 fetch 혼합 | 수익률 수학을 B1에서 검증하기 어렵고, 서비스 실패와 수학 오류가 섞입니다. | `calculateYieldPercent(currentValuation, investedAmount)` 순수 함수 추출 후 fetch wrapper는 B2로 분리 |
| `utils/portfolioCalculations.ts` | `calculateHoldings` | `toFixed(2)` 직접 반올림, 타입/수학 SSOT 분산 | realizedPnL, avgPrice 반올림 규칙이 다른 파일과 어긋날 수 있습니다. | `roundMoney` 공용화 후 이동 |
| `utils/vrBandStrategy.ts` | `calculateCycleIndexFromDates` | 날짜 입력 finite 검증 부재 + **quotient 후 `Math.floor` 하향 드리프트** | 잘못된 UTC ms가 들어오면 `Math.floor` 결과가 오염됩니다. 나눗셈 결과가 수학적으로 정수에 가깝더라도 `1.9999999999999998`처럼 표현되면 사이클 인덱스가 1 박자 어긋날 수 있습니다. | `startDateMs`·`targetDateMs` 는 **`areFiniteNonNegativeScalars`**(주식·백테스트는 1970 이전·음수 ms 비취급), `cycleWeeks` 는 **`areStrictPositiveFiniteScalars`** + **나눗셈 직후 `Math.floor(exactCycles + Number.EPSILON)`** (§3.16) |
| `utils/vrBandStrategy.ts` | `calculateNextV` | `pool / params.G` 직접 계산 | 현재 validator가 있긴 하지만, 수학 코어 차원에서 분모 보호를 더 명시적으로 유지해야 합니다. | validator + guard clause를 문서상 명문화 |
| `utils/vrBandStrategy.ts` | `generateBuyOrders`, `generateSellOrders` | 루프 내부 가격/비용 0 이하 방어는 있으나 반올림 SSOT가 파일 로컬 | 금융 수학 규칙이 다른 파일과 분산되어 drift 가능성이 있습니다. | `roundMoney`/`roundShares`/`safeUnitPrice` 개념을 공용화 |
| `utils/currency.ts` | `formatPriceUSDForDisplay` | 환산 후 표시만 하고 수학 규칙이 분산 | display 포맷과 금액 계산의 기준이 혼재됩니다. | display용 formatter와 수학용 환산 helper 분리 |
| `utils/dateUtils.ts` | `getServicePeriodDisplay` / `sanitizeCalendarDays` | `totalDays` 유효성 검증 부재 + **`Math.floor(totalDays)` 하향 드리프트** | 음수/비유한값이 들어오면 기간 표시가 깨집니다. 부동소수 `29.999999999999996` 일수가 29일로 떨어질 수 있습니다. | **`areFiniteNonNegativeScalars(totalDays)`** 로 정규화 + **`Math.floor(totalDays + Number.EPSILON)`** (§3.12) |
| `utils/vrBandStrategy.ts` | `sanitizeVrCycleWeeks` | `Math.floor(parsed)`만 사용 시 **주차 정수화 하향 드리프트** + **`unknown`에 대한 맹목적 `Number(weeks)`** + **문자열 `trim` 생략** | `Number(true)`, `Number([])` 등으로 비즈니스가 붕괴될 수 있습니다. `" 4 "` 는 `trim` 없이 `NaN`이 됩니다. | `typeof` 분기 → **`string`이면 `trim` 후 `Number`** → §3.0 스칼라 검증 + `Math.floor(+ EPSILON)` + 클램프 (**§2.1.4**, **§3.17**) |
| `utils/marketUtils.ts` | `getUSSelectionHolidays` | 계산 자체는 순수하나 날짜 상수 산재 | 재사용 가능한 날짜 math helper가 없습니다. | `DAY_MS` 상수화 및 순수 holiday helper 유지 |

### 1.3 공통 냄새(Smells)

1. **반올림·올림·내림 SSOT가 없고, `EPSILON` 방향을 혼동하기 쉽습니다.**
   - **반올림(`Math.round`)**: `Math.round((val + Number.EPSILON) * 100) / 100` — `.5` 근처 하향 드리프트 완화용으로 **덧셈**이 일반적입니다.
   - **2자리 올림(`Math.ceil`)**: `Math.ceil((val + Number.EPSILON) * 100) / 100`는 경계에서 **과올림(Upward Drift)** 을 키울 수 있어 **`val - Number.EPSILON`** 을 씁니다(§3.6).
   - **정수 내림(`Math.floor`)**: 나눗셈·기간 환산 직후 값은 `1.999…` / `29.999…` 형태가 되기 쉬우므로 **`Math.floor(val + Number.EPSILON)`** 로 하향 드리프트를 완화합니다. **날짜·기간 관련 floor는 100% 이 패턴**을 따릅니다(§2.1.2, §3.8, §3.12, §3.16, §3.17).
   - `Number(price.toFixed(2))`, `Number(realized.toFixed(2))` 등 `toFixed` 직접 사용도 파일마다 섞여 있습니다.

2. **나눗셈·스칼라 금융 가드가 함수마다 제각각입니다.**
   - 어떤 함수는 `=== 0`만 검사합니다.
   - 어떤 함수는 VR `validateFinancialArgs`(A층)에만 의존합니다.
   - 스칼라 분모·가격·수량·**정수 period**·**종가 배열**은 §3.0 **B층 헬퍼**로 통일하고, 객체 단위 규칙은 A층에만 둡니다(§2.1.3). 동일 파일 내 `hasOnlyFiniteNumbers` vs `prices.every(Number.isFinite)` 같은 **이중 구현은 금지**합니다.
   - 어떤 함수는 아예 `period <= 0`, `NaN`, `Infinity` 검사가 없습니다.

3. **순수 수학과 외부 의존성이 같은 파일에 섞여 있습니다.**
   - `portfolioCalculations.ts`는 보유내역 계산과 `fetchStockPrices()`가 공존합니다.
   - `marketUtils.ts`는 휴장일 계산과 `window.localStorage` 메시지 조합이 공존합니다.

4. **Strict TS는 대체로 나쁘지 않지만, 숫자 계약(contract)이 약합니다.**
   - `any`는 거의 없지만, `number`라고 선언된 값이 실제로는 비유한값일 수 있다는 전제를 모든 함수가 동일하게 처리하지 않습니다.

5. **외부·사용자 문자열을 `Number(x)` 만으로 파싱하는 패턴**이 남아 있으면, 앞뒤 공백만으로 `NaN` 이 되어 기본값·에러 경로로 떨어집니다. **§2.1.4·§3.0** 으로 `trim` SSOT를 둡니다.

### 1.4 B1에서 먼저 분리할 순수 코어 후보

| 후보 | 현재 위치 | B1 산출물 방향 |
|---|---|---|
| `roundMoney` | `utils/vrBandStrategy.ts` 내부 `toFixedMoney` | 범용 금융 반올림 SSOT로 승격 |
| `roundPrice2`, `roundRatio2`, `roundShares4` | 파일별 산재 | 의미별 반올림 함수로 분리 |
| `calculateYieldPercent` | `portfolioCalculations.ts` 내부 수식 | fetch 없는 순수 수익률 함수로 추출 |
| `safeDivide` 또는 문맥별 guard helper | 파일별 인라인 | 무조건 helper 남발은 금지, 다만 반복되는 금융 나눗셈은 명시적 중앙화 검토 |
| `isFinitePositiveNumber`, `isFiniteNonNegativeNumber` | 없음 | Rule 7 숫자 계약 강화용 보조 가드 |
| `sanitizeCalendarDays`, `sanitizePositivePeriod` | 없음 | 날짜/지표 period 입력 표준화; **정수 일수·주차로 내릴 때는 항상 `floor(+ EPSILON)`** (§2.1.2) |
| `areStrictPositiveFiniteScalars`, `areFiniteNonNegativeScalars`, `parseNumberFromTrimmedExternalString`, **`isStrictPositiveInteger`**, **`areAllFiniteNumbers`**, **`areFiniteScalars`**(선택) | 없음 (신규) | `utils/financialScalarGuards.ts` SSOT — 스칼라·**양의 정수**·**종가 배열**·**UTC ms(`>= 0` 계약, §3.16 `areFiniteNonNegativeScalars`)** 를 한곳에서 통제. **`areFiniteScalars`** 는 ms 외 **음수 유한이 의미 있는** 스칼라용 선택 헬퍼 (§3.0) |

---

## 2. 액션 플랜

### 2.1 리팩토링 원칙

### 2.1.1 Rule 1 — `Number.EPSILON`과 `round` / `ceil` / `floor` (시뮬레이션 확정)

동일한 "부동소수점 보정"이라도 **목표 연산**에 따라 부호가 달라집니다. B1 스니펫·실제 구현 모두 아래를 기본 계약으로 둡니다.

| 목표 | 권장 패턴 (개념) | 이유 |
|---|---|---|
| 2자리 **반올림** (금액 등) | `Math.round((x + EPSILON) * 100) / 100` | `x.499999…` 가 잘못 아래로 떨어지는 경우를 완화합니다. |
| 2자리 **올림** (`calcT` 등) | `Math.ceil((x - EPSILON) * 100) / 100` | `x`가 정확히 경계(예: 비율 1.00)인데 미세하게 커진 표현(`100.000…03`)이 `ceil` 한 칸 위로 올라가는 것을 막습니다. |
| **정수 내림** (주식 수량, 사이클 인덱스, **일수·주차** 등) | `Math.floor(x + EPSILON)` (또는 나눗셈 직후 동일) | `1.999999…`·`29.999999…` 가 정수 경계에 가깝다면 한 단계 올려 잘라내 하향 드리프트를 완화합니다. |

### 2.1.2 Rule 1 — 날짜·기간 산술 후 `Math.floor` 100% 규칙 (시뮬레이션 확정)

아래에 해당하는 **모든** 내림은 예외 없이 **`Math.floor(x + Number.EPSILON)`** 형태로 통일합니다. (`x`가 이미 정수이면 결과는 동일하게 유지됩니다.)

- **달력 일수**를 부동소수로 받아 정수 일로 쓰는 경우(예: `sanitizeCalendarDays`, 멤버십 `totalDays` 파이프라인).
- **기간을 ms·주·일로 나눈 몫**을 사이클 인덱스·정수 단계로 쓰는 경우(예: `calculateCycleIndexFromDates`의 `exactCycles`).
- **주차(weeks)** 를 `unknown` → `number`로 파싱한 뒤 정수 주로 내리는 경우(예: `sanitizeVrCycleWeeks`의 `Math.floor(parsed)`).
- 동일 파일·모듈 안에서 위와 같은 의미의 `Math.floor`를 새로 추가할 때도 동일 계약을 따릅니다.

**범위 밖(본 규칙의 적용 대상이 아님):** 이미 정수 타입·정수 연산만으로 보장되는 인덱스, 또는 **금융 주식 수량**은 §3.8의 `toSafeIntegerQuantity`와 동일 **패턴**을 쓰되, 문서상 "날짜·기간" 열과 별도로 검토합니다(의미는 동일: `floor` 직전 `+ EPSILON`).

1. **순수 코어를 먼저 분리하고, 외부 의존 래퍼는 건드리지 않습니다.**
   - 예: `calculateYield` 전체를 바로 고치지 않고, 먼저 `calculateYieldPercent`를 추출합니다.
   - 예: `getMarketStatus` 전체를 바로 바꾸지 않고, 휴장일 계산 순수 부분만 분리합니다.

2. **숫자 입력은 "타입"만 믿지 않고 "계약"까지 검증합니다.**
   - `number`라도 `NaN`, `Infinity`, `-Infinity`는 거부합니다.
   - 필요 시 `unknown` 입력은 B1 순수 함수로 직접 넣지 않고, 바깥쪽에서 좁힌 뒤 전달합니다.

3. **반올림은 의미별 SSOT로 통일합니다.**
   - 돈: 2자리
   - 수량 표시: 4자리
   - 회차/비율: 제품 정책에 맞는 자리수
   - 모든 함수가 같은 반올림 primitive를 사용해야 합니다.

4. **분모 가드는 반드시 연산 직전 함수 내부에 둡니다.**
   - 호출자가 이미 검증했더라도, 금융 코어 함수는 자기 방어를 유지합니다.

5. **실패 정책도 함수 목적에 맞게 고정합니다.**
   - 순수 계산 함수: 안전한 fallback 값 반환
   - 계약 위반 탐지 함수: `throw` 또는 명시적 실패
   - 표시용 포맷 함수: 절대 throw 하지 않고 fallback 문자열/숫자 반환

### 2.1.3 Rule 1 — 금융 검증 **이원화**: VR `validateFinancialArgs` vs B1 스칼라 가드

워크스페이스 Rule 1의 “중앙 `validateFinancialArgs`”는 현재 저장소에서 **`Record<string, number>` + 규칙 테이블 + `throw`** 인 **`utils/vrBandStrategy.ts`의 `validateFinancialArgs`** 를 가리킵니다.  
B1 시뮬에서 `calcT`·`safeOrder` 등이 반복하던 **`typeof` + `Number.isFinite` + 부등호** 뭉치는, 그 API에 억지로 넣기 어렵고(키·규칙 객체 부담), 오히려 가독성을 해칩니다.

따라서 B1 계획은 **역할을 층으로 나눕니다.**

| 층 | 용도 | 시뮬 스니펫 이름(가칭) | 비고 |
|---|---|---|---|
| **A** | 키가 있는 금융 인자, 실패 시 예외·로그가 맞는 경로 | 기존 **`validateFinancialArgs(args, rules, context)`** | VR 밴드·Pool 등 **그대로 유지** |
| **B** | 스칼라·정수 period·가격 배열·UTC ms 등 | **`areStrictPositiveFiniteScalars`**, **`areFiniteNonNegativeScalars`**, **`isStrictPositiveInteger`**, **`areAllFiniteNumbers`**, **`areFiniteScalars`**(선택) | §3.0 — **`unknown`에는 타입 가드 + (문자열이면 §2.1.4 `trim`) 후 `Number`** (§3.17). **주식·백테스트** 도메인의 **`startDateMs`·`targetDateMs`** 는 **`areFiniteNonNegativeScalars`** 로 음수 ms·비유한을 차단 — 1970 이전 데이터는 취급하지 않음(§3.16). |

산재된 인라인 `if (!Number.isFinite(x) || x <= 0)` 는 **B 계층 헬퍼 호출로 치환**하고, 객체 단위 규칙 검증은 **A 계층**에만 둡니다. 실제 파일 병합 시 **심볼 이름이 VR `validateFinancialArgs`와 겹치지 않게** `utils/financialScalarGuards.ts` 등으로 분리하는 것을 권장합니다.

### 2.1.4 Rule 6·7 — 사용자·외부 문자열 → 숫자 파싱 전 **`trim()`** (시뮬레이션 확정)

**사용자 입력, 폼, JSON 필드, 쿼리스트링, Supabase 텍스트 컬럼 등**에서 오는 값이 `string` (또는 `unknown`을 `string`으로 좁힌 뒤) 숫자로 쓰이는 **모든 구간**에서, `Number(x)` 또는 `parseFloat` 호출 **직전**에 **`String.prototype.trim()`** 을 적용합니다.

| 규칙 | 내용 |
|---|---|
| **적용** | `sanitizeVrCycleWeeks`, 포트폴리오·VR·결제 등 **숫자로 파싱하는 모든 외부 문자열 경로**(B1·B2 경계 포함, 본 문서는 `utils/` 시뮬에 해당하는 예를 스니펫으로 고정). |
| **이미 `number`** | `trim` 불필요. |
| **`trim` 후 빈 문자열** | 유효한 숫자 없음 → 도메인별 fallback(기본 상수, `0`, 검증 실패 등). §3.0 헬퍼는 **`NaN`** 을 돌려 호출부가 동일 계약으로 처리하게 할 수 있음. |
| **DRY** | 반복 방지를 위해 **`parseNumberFromTrimmedExternalString`**(§3.0) 같은 단일 진입점을 권장합니다. |

### 2.2 구현 순서

1. **공용 숫자/반올림·스칼라 검증·외부 파싱 코어 확정**
   - §3.0 **`areStrictPositiveFiniteScalars`**, **`areFiniteNonNegativeScalars`**(주식·백테스트 **ms** 포함), **`areFiniteScalars`**(선택, ms 외), **`isStrictPositiveInteger`**, **`areAllFiniteNumbers`**, **`parseNumberFromTrimmedExternalString`**
   - `roundMoney` (반올림: `+ EPSILON`)
   - `ceilMoney2` 또는 `ceilToTwoDecimals` (올림: `- EPSILON` — §3.6)
   - `floorToNonNegativeInt` / `floorCalendarOrPeriodInt` (내림: `+ EPSILON` — §3.8·§3.12·§3.16·§3.17·§2.1.2와 정합)
   - `roundShares4`
   - `isFiniteNumber`
   - `sanitizePositiveInteger`
   - `sanitizeNonNegativeInteger`

2. **기술지표 계층 보강**
   - `calculateMA`
   - `calculateRSI`
   - `calculateRollingIndicators` — §3.2·§3.4와 **동일한** `isStrictPositiveInteger`·`areAllFiniteNumbers`·§3.0 패턴으로 일괄 적용(반쪽짜리 이행 금지)

3. **수익률/평가/보유 계산의 순수 부분 추출**
   - `calculateHoldings`
   - `calculateInvestedAmount`
   - `calculateYieldPercent`

4. **다분할/무손절 수학 계층 보강**
   - `calcT`
   - `calcNoStopCurrentRound`
   - `safeOrder`
   - `calcNewOneTimeAmount`
   - `calcMultiSplitOrders`

5. **VR 밴드 수학 계층 보강**
   - `calculatePoolDelta`
   - `calculateNextV`
   - `calculateBands`
   - `generateBuyOrders`
   - `generateSellOrders`

6. **날짜 순수 유틸 보강**
   - `getLocalTodayString`
   - `getCurrentKSTDateString`
   - `addDays`
   - `getServicePeriodDisplay`
   - `getUSSelectionHolidays`

### 2.3 검증 전략

| 레벨 | 검증 내용 |
|---|---|
| 단위 테스트 | `0`, `NaN`, `Infinity`, 음수, 초소수, 극단적으로 큰 값 |
| 타임스탬프(ms) | **음수 ms·`NaN`·`Infinity`** 입력 시 §3.16 이 **조기 `0`** 으로 닫히는지 — 제품 계약은 **`>= 0` 유한**만 허용(`areFiniteNonNegativeScalars`) |
| 날짜·기간 floor | `29.999999999999996` 일수 → `30`일, `3.9999999999999996` 주 → `4`주, 사이클 몫 `1.9999999999999998` → 인덱스 `2` 등 **경계 하향 드리프트** 회귀 |
| 외부 문자열 파싱 | `" 4 "`, `"  12\n"` 등 **trim 후** 기대 숫자와 동일; 공백만 `""` → fallback·`NaN` 처리 |
| 골든 테스트 | 동일 입력에 대한 before/after 숫자 일치 여부 |
| 속성 기반 사고 실험 | 수량은 음수가 되지 않는가, 주문 가격은 항상 `> 0` 인가, 수익률은 분모 0이면 안전하게 `0`으로 닫히는가 |
| 회귀 차단 | `portfolioCalculations`처럼 B2 경계와 섞인 파일은 순수 함수 결과만 고정하고 fetch wrapper는 B1에서 건드리지 않음 |

### 2.4 B1 완료 정의(Definition of Done)

- 순수 수학 함수에서 `toFixed()` 직접 호출이 사라지거나 최소한 중앙 반올림 helper 뒤로 숨겨집니다.
- 지표/수익률/주문 수학에서 분모 0 가능성이 코드상 명시적으로 차단됩니다.
- 금융 스칼라·**정수 period**·**가격 배열**·**주식·백테스트 UTC ms(`>= 0`, `areFiniteNonNegativeScalars`)** 검증은 §3.0 헬퍼(또는 VR `validateFinancialArgs` A층)로 **산재 인라인 가드를 제거**합니다(§2.1.3). §3.2·§3.4·§3.12·§3.16 및 동일 모듈의 나머지 export에 **동일 SSOT를 확장**합니다(반쪽짜리 이행 금지).
- 사용자·외부 **`string` → 숫자** 경로에 **`trim()`** 이 빠지지 않습니다(§2.1.4·§3.0).
- `isNaN()` 대신 `Number.isFinite()` 기반 방어로 통일됩니다.
- `portfolioCalculations.ts`, `marketUtils.ts`처럼 혼합 파일은 **순수 코어**와 **외부 의존 래퍼**의 경계가 문서상 명확해집니다.
- B1 PR은 UI/서비스/브리지 동작을 바꾸지 않고, 숫자 무결성만 교정합니다.
- **날짜·기간**을 계산한 뒤 정수로 내리는 모든 경로에 **`Math.floor(x + Number.EPSILON)`** 이 빠짐없이 적용됩니다(§2.1.2).

---

## 3. 시뮬레이션용 코드 스니펫

아래 코드는 실제 저장소를 즉시 덮어쓰는 최종본이 아니라, 현재 코드 패턴을 안전하게 재설계했을 때 어떤 구조가 되어야 하는지 보여주는 **AST 레벨 대응 시뮬레이션**입니다.

### 3.0 공용 스칼라 금융 가드 (B1 시뮬 SSOT)

`utils/financialScalarGuards.ts` 등 **전용 모듈**에 두는 것을 권장합니다. 이름은 **`utils/vrBandStrategy.ts`의 `validateFinancialArgs`(객체·규칙·`throw`)와 혼동되지 않게** 유지합니다.

```ts
/**
 * Rule 1: 스칼라 인자가 모두 실제 `number` 타입이고 유한하며 > 0인지.
 * `Number([])`, `Number(true)` 같은 기괴한 강제 변환을 쓰지 않으려면, 호출부에서 `unknown`은 §3.17처럼 `typeof`로 좁힌 뒤 넘깁니다.
 */
export function areStrictPositiveFiniteScalars(...values: unknown[]): boolean {
  return values.every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
}

/** Rule 1: 스칼라 인자가 모두 `number`·유한·`>= 0` 인지 (평가액 0 허용 등). */
export function areFiniteNonNegativeScalars(...values: unknown[]): boolean {
  return values.every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
  );
}

/**
 * Rule 1 (선택): 스칼라가 모두 실제 `number` 타입이고 유한한지 (**음수 허용**).
 * 주식·백테스트 **UTC ms** 는 제품 계약상 `>= 0` 만 — `startDateMs`·`targetDateMs` 등에는 **`areFiniteNonNegativeScalars`** 사용(§3.16).
 */
export function areFiniteScalars(...values: unknown[]): boolean {
  return values.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Rule 1: `period`·`count` 등 **양의 정수** 전용 중앙 검증기. */
export function isStrictPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Rule 6: 배열이 존재하고 요소가 모두 유한한 `number` 인지 (종가 시계열 등).
 * `typeof v === 'number'` 로 `Number([])` 같은 느슨한 소비와 구분.
 */
export function areAllFiniteNumbers(values: unknown[]): boolean {
  return (
    Array.isArray(values) &&
    values.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

/**
 * Rule 6·7: 사용자·외부에서 온 문자열을 숫자로 바꿀 때 공백으로 인한 NaN 방지.
 * trim 후 빈 문자열이면 NaN — 호출부에서 fallback.
 */
export function parseNumberFromTrimmedExternalString(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return Number.NaN;
  }
  return Number(trimmed);
}
```

핵심:

- 리뷰에서 제안한 단일 `validateFinancialArgs(...unknown[])` **의도(중앙 집중)** 는 수용하되, 저장소 기존 API와의 **이름 충돌**을 피하기 위해 위 식별자로 둡니다.
- **정수·배열**까지 §3.0으로 끌어올려 동일 모듈 내 `hasOnlyFiniteNumbers` vs `prices.every(Number.isFinite)` 같은 **파편화를 금지**합니다.
- **주식·백테스트 UTC ms** 는 **음수(1970 이전)·비유한**을 취급하지 않으므로 **`areFiniteNonNegativeScalars`** 로 원천 차단합니다(§3.16).
- **`unknown` → 숫자**는 **`typeof`로 좁힌 뒤**, `string`이면 **§2.1.4대로 `trim` 후 `Number`** — §3.17·`parseNumberFromTrimmedExternalString` 참고. 스칼라 가드만으로는 객체·불리언 입력을 걸러내지 못합니다.

### 3.1 Before: `calculateMA`는 `period === 0`을 막지 못합니다

```ts
export const calculateMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const recentPrices = prices.slice(-period);
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
};
```

문제:

- `period === 0`이면 `prices.length < period`가 거짓이므로 `sum / 0`으로 진입할 수 있습니다.
- `period`가 정수가 아니라도 계산이 진행됩니다.
- 입력 price 배열 원소의 `NaN`/`Infinity`를 막지 않습니다.

### 3.2 After: `calculateMA`는 period·price 계약을 먼저 봉쇄합니다

```ts
// import { isStrictPositiveInteger, areAllFiniteNumbers } from './financialScalarGuards';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const calculateMA = (prices: number[], period: number): number => {
  if (!isStrictPositiveInteger(period)) {
    return 0;
  }

  if (!areAllFiniteNumbers(prices) || prices.length < period) {
    return 0;
  }

  const recentPrices = prices.slice(-period);
  const sum = recentPrices.reduce((acc, price) => acc + price, 0);
  return roundMoney(sum / period);
};
```

핵심:

- 분모 `period`는 §3.0 **`isStrictPositiveInteger`** 로만 검사합니다(인라인 `Number.isInteger` 제거).
- 종가 배열은 **`areAllFiniteNumbers`** 로 통일합니다(지역 `hasOnlyFiniteNumbers` 제거).
- 최종 MA 값도 금융 rounding 정책과 같은 primitive를 사용합니다.

### 3.3 Before: `calculateRSI`는 `period <= 0` 계약이 없습니다

```ts
export const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) {
    return 50;
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const currentGain = changes[i] > 0 ? changes[i] : 0;
    const currentLoss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.max(0, Math.min(100, rsi));
};
```

### 3.4 After: `calculateRSI`는 중립값 fallback과 분모 방어를 고정합니다

```ts
// import { isStrictPositiveInteger, areAllFiniteNumbers } from './financialScalarGuards';

const DEFAULT_RSI = 50;
const MAX_RSI = 100;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const calculateRSI = (
  prices: number[],
  period: number = 14,
): number => {
  if (!isStrictPositiveInteger(period)) {
    return DEFAULT_RSI;
  }

  if (!areAllFiniteNumbers(prices) || prices.length < period + 1) {
    return DEFAULT_RSI;
  }

  const changes: number[] = [];

  for (let index = 1; index < prices.length; index += 1) {
    changes.push(prices[index] - prices[index - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 0; index < period; index += 1) {
    const change = changes[index];
    if (change > 0) {
      avgGain += change;
      continue;
    }

    avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  for (let index = period; index < changes.length; index += 1) {
    const change = changes[index];
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss <= 0) {
    return MAX_RSI;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  if (!Number.isFinite(rsi)) {
    return DEFAULT_RSI;
  }

  return Math.max(0, Math.min(MAX_RSI, roundMoney(rsi)));
};
```

핵심:

- RSI의 "중립값 50" 정책을 계약으로 고정합니다.
- `calculateMA` 와 동일하게 **`isStrictPositiveInteger`**·**`areAllFiniteNumbers`** 로 입력 검증을 SSOT화합니다.
- `avgLoss === 0`뿐 아니라 비정상 계산 결과 전체를 막습니다.

### 3.5 Before: `calcT`는 `=== 0`만 검사합니다

```ts
export function calcT(trades: TradeInput[], dailyBuyAmount: number): number {
  if (dailyBuyAmount === 0) return 0;
  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  return Math.ceil((totalInvested / dailyBuyAmount) * 100) / 100;
}
```

문제:

- `dailyBuyAmount`가 `NaN`, 음수, `Infinity`여도 통과합니다.
- 반올림 SSOT 없이 직접 `Math.ceil(... * 100) / 100`를 사용합니다.

### 3.6 After: `calcT`는 strict number 계약과 의도적 올림 정책을 함께 가집니다

```ts
// import { areStrictPositiveFiniteScalars } from './financialScalarGuards';

// Rule 1: Math.ceil 상향 오차(Upward Drift) 방어
function ceilToTwoDecimals(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export function calcT(trades: TradeInput[], dailyBuyAmount: number): number {
  if (!areStrictPositiveFiniteScalars(dailyBuyAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce(
    (sum, holding) => sum + holding.totalCost,
    0,
  );

  if (!areStrictPositiveFiniteScalars(totalInvested)) {
    return 0;
  }

  return ceilToTwoDecimals(totalInvested / dailyBuyAmount);
}
```

핵심:

- 산재 인라인 `Number.isFinite`·부등호 대신 §3.0 **`areStrictPositiveFiniteScalars`** 로 스칼라 계약을 한곳에서 바꿀 수 있게 합니다.
- `Math.round`용 `+ EPSILON`을 `Math.ceil`에 그대로 복붙하면 경계값이 **한 틱 과올림**될 수 있으므로, 2자리 `ceil` 전용으로 **`- EPSILON`** 을 씁니다.

### 3.7 Before: `safeOrder`는 `isNaN`과 `toFixed`에 직접 의존합니다

```ts
export function safeOrder(price: number, qty: number): OrderEntry | null {
  if (isNaN(price) || isNaN(qty) || price <= 0) return null;
  const finalQty = Math.max(0, Math.floor(qty));
  if (finalQty <= 0) return null;
  return { price: Number(price.toFixed(2)), quantity: finalQty };
}
```

문제:

- `isNaN`은 느슨합니다.
- `Infinity`는 걸러지지 않습니다.
- 반올림 primitive가 파일별로 제각각입니다.

### 3.8 After: `safeOrder`는 finite·양수·반올림 규칙을 중앙화합니다

```ts
// import { areStrictPositiveFiniteScalars } from './financialScalarGuards';

function toSafeIntegerQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return 0;
  }

  // Rule 1: Math.floor 하향 오차(Downward Drift) 방어
  return Math.max(0, Math.floor(quantity + Number.EPSILON));
}

export function safeOrder(price: number, qty: number): OrderEntry | null {
  if (!areStrictPositiveFiniteScalars(price, qty)) {
    return null;
  }

  const finalQty = toSafeIntegerQuantity(qty);
  if (finalQty <= 0) {
    return null;
  }

  return {
    price: roundMoney(price),
    quantity: finalQty,
  };
}
```

핵심:

- 가격·수량의 **타입·유한·양수** 계약은 §3.0으로 모읍니다. (이미 `number` 시그니처라도 런타임 오염에 대비.)
- 나눗셈으로 만든 수량은 `1.999…` 패턴이 흔하므로, 정수 주문 수량에는 **`floor` 직전 `+ Number.EPSILON`** 을 기본으로 둡니다.

### 3.9 Before: `calculateYield`는 순수 수학과 fetch가 섞여 있습니다

```ts
export const calculateYield = async (portfolio: Portfolio): Promise<number> => {
  const investedAmount = calculateInvestedAmount(portfolio);
  if (investedAmount === 0) return 0;

  const currentValuation = await calculateCurrentValuation(portfolio);
  return ((currentValuation / investedAmount) - 1) * 100;
};
```

문제:

- 순수 수익률 계산을 단독으로 테스트하기 어렵습니다.
- fetch 실패와 divide-by-zero 방어가 같은 함수 안에 있어 책임이 섞입니다.

### 3.10 After: 순수 수익률 함수를 추출하고 async wrapper는 유지합니다

```ts
// import {
//   areFiniteNonNegativeScalars,
//   areStrictPositiveFiniteScalars,
// } from './financialScalarGuards';

export function calculateYieldPercent(
  currentValuation: number,
  investedAmount: number,
): number {
  if (!areFiniteNonNegativeScalars(currentValuation)) {
    return 0;
  }

  if (!areStrictPositiveFiniteScalars(investedAmount)) {
    return 0;
  }

  const rawYield = (currentValuation / investedAmount - 1) * 100;
  return roundMoney(rawYield);
}

export const calculateYield = async (
  portfolio: Portfolio,
): Promise<number> => {
  const investedAmount = calculateInvestedAmount(portfolio);
  if (!areStrictPositiveFiniteScalars(investedAmount)) {
    return 0;
  }

  const currentValuation = await calculateCurrentValuation(portfolio);
  return calculateYieldPercent(currentValuation, investedAmount);
};
```

핵심:

- 평가액은 **0 이상**(`areFiniteNonNegativeScalars`), 투자금(분모)은 **0 초과**(`areStrictPositiveFiniteScalars`)로 계약을 분리합니다.
- B1은 `calculateYieldPercent`까지만 책임집니다.
- `calculateCurrentValuation` 같은 외부 가격 조회는 B2에서 별도 관리합니다.

### 3.11 Before: 날짜 표시 함수는 입력 검증이 없습니다

```ts
export function getServicePeriodDisplay(totalDays: number, lang: 'ko' | 'en'): string {
  const start = getKSTTodayParts();
  const end = addCalendarDays(start.year, start.month, start.day, totalDays);
  const fmt = (y: number, m: number, d: number) => ({
    ymd: `${y}.${String(m + 1).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    mdy: `${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`,
  });
  const s = fmt(start.year, start.month, start.day);
  const e = fmt(end.year, end.month, end.day);
  return lang === 'ko' ? `${s.ymd} ~ ${e.ymd}` : `${s.mdy} - ${e.mdy}`;
}
```

### 3.12 After: 날짜 유틸도 비유한값과 음수 입력을 표준화합니다

```ts
// import { areFiniteNonNegativeScalars } from './financialScalarGuards';

// Rule 10: 클로저를 쓰지 않는 순수 포맷터는 모듈 스코프에 두어 호출마다 함수 객체를 새로 만들지 않습니다.
const formatServicePeriodParts = (year: number, month: number, day: number) => ({
  ymd: `${year}.${String(month + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`,
  mdy: `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
});

function sanitizeCalendarDays(totalDays: number): number {
  if (!areFiniteNonNegativeScalars(totalDays)) {
    return 0;
  }

  // Rule 1 + §2.1.2: 일수·기간 산술 후 정수 내림은 항상 하향 드리프트 방어
  return Math.floor(totalDays + Number.EPSILON);
}

export function getServicePeriodDisplay(
  totalDays: number,
  lang: 'ko' | 'en',
): string {
  const safeTotalDays = sanitizeCalendarDays(totalDays);
  const start = getKSTTodayParts();
  const end = addCalendarDays(
    start.year,
    start.month,
    start.day,
    safeTotalDays,
  );

  const startText = formatServicePeriodParts(start.year, start.month, start.day);
  const endText = formatServicePeriodParts(end.year, end.month, end.day);

  if (lang === 'ko') {
    return `${startText.ymd} ~ ${endText.ymd}`;
  }

  return `${startText.mdy} - ${endText.mdy}`;
}
```

핵심:

- `totalDays`가 곱셈·나눗셈·API에서 부동소수로 들어오면 `29.999…` → `29` 로 떨어질 수 있으므로, **달력 일수 floor는 §2.1.2대로 100% `+ Number.EPSILON`** 을 적용합니다.
- **Rule 10:** `formatServicePeriodParts` 를 함수 본문 안에 두지 않고 **모듈 최상단**에 둡니다.

### 3.13 Before: `calcNoStopCurrentRound`도 동일한 분모 리스크가 있습니다

```ts
export function calcNoStopCurrentRound(trades: TradeInput[], oneTimeAmount: number): number {
  if (oneTimeAmount <= 0) return 0;
  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce((sum, holding) => sum + holding.totalCost, 0);
  return totalInvested / oneTimeAmount;
}
```

### 3.14 After: round 계산 정책과 안전 계약을 `calcT`와 맞춥니다

```ts
// import { areStrictPositiveFiniteScalars } from './financialScalarGuards';

export function calcNoStopCurrentRound(
  trades: TradeInput[],
  oneTimeAmount: number,
): number {
  if (!areStrictPositiveFiniteScalars(oneTimeAmount)) {
    return 0;
  }

  const holdings = calcHoldings(trades);
  const totalInvested = holdings.reduce(
    (sum, holding) => sum + holding.totalCost,
    0,
  );

  if (!areStrictPositiveFiniteScalars(totalInvested)) {
    return 0;
  }

  return roundMoney(totalInvested / oneTimeAmount);
}
```

### 3.15 Before: `calculateCycleIndexFromDates`는 finite 검증이 약합니다

```ts
export function calculateCycleIndexFromDates(
  startDateMs: number,
  targetDateMs: number,
  cycleWeeks: number,
): number {
  if (cycleWeeks <= 0) return 0;
  const diffMs = targetDateMs - startDateMs;
  if (diffMs < 0) return 0;
  const cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK;
  return Math.floor((diffMs + TIME_MS.PER_DAY) / cycleLengthMs);
}
```

### 3.16 After: 날짜 산술도 숫자 계약을 먼저 잠급니다

```ts
// import {
//   areFiniteNonNegativeScalars,
//   areStrictPositiveFiniteScalars,
// } from './financialScalarGuards';

export function calculateCycleIndexFromDates(
  startDateMs: number,
  targetDateMs: number,
  cycleWeeks: number,
): number {
  // 제품 계약: 주식·백테스트 ms 는 항상 >= 0 유한 — 음수(1970 이전)·비유한 원천 차단
  if (!areFiniteNonNegativeScalars(startDateMs, targetDateMs)) {
    return 0;
  }

  if (!areStrictPositiveFiniteScalars(cycleWeeks)) {
    return 0;
  }

  const diffMs = targetDateMs - startDateMs;
  if (diffMs < 0) {
    return 0;
  }

  const cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK;
  if (cycleLengthMs <= 0) {
    return 0;
  }

  // Rule 1: 나눗셈 후 하향 오차로 인한 사이클 누락 방지 (EPSILON 보정 후 버림)
  const exactCycles = (diffMs + TIME_MS.PER_DAY) / cycleLengthMs;
  return Math.floor(exactCycles + Number.EPSILON);
}
```

핵심:

- **`startDateMs`·`targetDateMs`** 는 **`areFiniteNonNegativeScalars`** 로 검사합니다. 주식·백테스트 도메인에서 **1970 이전(음수 ms) 데이터는 취급하지 않는다**는 계약을 코드로 고정합니다.
- `cycleWeeks`는 **양의 유한**이어야 하므로 **`areStrictPositiveFiniteScalars`** 로 통일합니다.
- `cycleWeeks`가 정수가 아닐 수 있는 경로까지 가정하면, 몫은 부동소수점입니다. **정수 사이클 인덱스로 내릴 때는 §3.8과 동일하게 `floor(+ EPSILON)`** 을 적용합니다.

### 3.17 After: `sanitizeVrCycleWeeks` — 주차 정수화에도 동일 `floor` 계약

`utils/vrBandStrategy.ts`의 주기(주) 정규화는 **기간 도메인**이므로 `parsed`를 정수 주로 내릴 때도 §2.1.2를 따릅니다.

```ts
// import {
//   areStrictPositiveFiniteScalars,
//   parseNumberFromTrimmedExternalString,
// } from './financialScalarGuards';
// VR_CYCLE은 constants/vrConstants.ts SSOT를 가정합니다.

export function sanitizeVrCycleWeeks(weeks: unknown): number {
  // Rule 7: Coercion 전 타입 가드 — Number(true), Number([]) 등 차단
  let candidate: number;

  if (typeof weeks === 'number') {
    candidate = weeks;
  } else if (typeof weeks === 'string') {
    // Rule 6·7: 사용자·외부 문자열은 trim 후 파싱 (공백만 있는 입력 → NaN → fallback)
    candidate = parseNumberFromTrimmedExternalString(weeks);
  } else {
    return VR_CYCLE.DEFAULT_WEEKS;
  }

  if (!areStrictPositiveFiniteScalars(candidate)) {
    return VR_CYCLE.DEFAULT_WEEKS;
  }

  const flooredWeeks = Math.floor(candidate + Number.EPSILON);

  return Math.max(
    VR_CYCLE.MIN_WEEKS,
    Math.min(VR_CYCLE.MAX_WEEKS, flooredWeeks),
  );
}
```

핵심:

- `unknown`은 **`typeof`로 분기**한 뒤에만 숫자 후보를 만듭니다.
- **`string` 경로는 반드시 `trim` 뒤 `Number`** — §2.1.4·`parseNumberFromTrimmedExternalString`.
- 양수·유한 검증은 §3.0 **`areStrictPositiveFiniteScalars(candidate)`** 로 통일합니다.
- `MIN`/`MAX` 클램프 **전에** `floor(+ EPSILON)` 을 적용해 정수 주를 확정합니다.

---

## 4. 실제 적용 시 체크리스트

- B1 PR이 `utils/` 전체가 아니라 **순수 수학/파싱/포맷 함수만** 대상으로 삼았는가
- `services/*`, `window`, `localStorage`, 토스트, 브리지 호출이 B1 변경 범위에 섞이지 않았는가
- `calculateMA`, `calculateRSI`, `calcT`, `calcNoStopCurrentRound`, `calculateYieldPercent`에 **분모 0 guard**가 있는가
- 금융 스칼라(분모·가격·수량·합계 등)의 반복 검증이 §3.0 **`areStrictPositiveFiniteScalars` / `areFiniteNonNegativeScalars`** 로 모였는가; **정수 period**는 **`isStrictPositiveInteger`**, **종가 배열**은 **`areAllFiniteNumbers`**, **주식·백테스트 UTC ms**(`startDateMs`·`targetDateMs` 등)는 **`areFiniteNonNegativeScalars`**(음수 ms 원천 차단)를 쓰는가 (VR **`validateFinancialArgs`와 심볼 충돌 없음** — §2.1.3)
- `unknown` 입력에 `Number(x)` 만 때리지 않고 **`typeof` 가드**가 앞서는가 (§3.17)
- **`string` → 숫자** 파싱 전 **`trim()`**(또는 §3.0 `parseNumberFromTrimmedExternalString`)이 **모든 사용자·외부 문자열 경로**에 적용되는가 (§2.1.4)
- 순수 포맷 헬퍼가 **호출마다 함수 본문 안에서 재생성**되지 않고 모듈 스코프에 있는가 (§3.12, Rule 10)
- `Math.ceil` 2자리 보정은 **`(value - Number.EPSILON) * 100`** 인가 (`+ EPSILON` 과올림 금지)
- 정수 `Math.floor`(수량·사이클 인덱스)는 **`floor(x + Number.EPSILON)`** 패턴을 따르는가
- **날짜·기간**(일수·사이클 몫·VR 주차 등) 산술 후 내림은 §2.1.2대로 **빠짐없이** `Math.floor(x + Number.EPSILON)` 인가 (`sanitizeCalendarDays`, `calculateCycleIndexFromDates`, `sanitizeVrCycleWeeks` 및 동일 의미 신규 코드)
- 순수 유틸에 사용자 노출 문구를 새로 넣지 않았는가(Rule 3); 스니펫의 문자열은 주입 계약 예시에만 쓰였는가
- §0.1 **Core Principles (11)** 표와 본 PR 범위가 모순되지 않는가
- 반올림(`Math.round`)·올림(`ceil`)·내림(`floor`) 각각에 맞는 `EPSILON` 방향이 문서(§2.1.1)와 코드가 일치하는가
- 반올림이 `Number.EPSILON` 기반 helper로 통일되었는가
- `toFixed()` 직접 호출이 도메인 계산 함수 안에 남아 있지 않은가
- `isNaN()` 대신 `Number.isFinite()`를 사용했는가
- 입력이 `number`여도 `NaN`/`Infinity`/음수 가능성을 함수 내부에서 다시 봉쇄했는가
- `portfolioCalculations.ts`에서 순수 계산과 외부 fetch가 분리되었는가
- `marketUtils.ts`에서 휴장일 순수 계산과 브라우저 메시지 조합이 분리되었는가
- 주문 생성 루프에서 `price <= 0` 또는 `cost/proceeds <= 0` 시 즉시 `break` 하는가
- sign enforcement가 필요한 금액은 `Math.abs` 기반으로 중앙화되어 있는가
- 모든 변경이 UI·서비스 경계가 아닌 **순수 함수 레벨**에서 끝나는가

---

## 5. 최종 결론

Phase B1의 본질은 `utils/`를 예쁘게 정리하는 작업이 아닙니다.  
핵심은 **수학적 무결성을 가진 순수 함수 코어를 먼저 봉인**하는 것입니다.

1. `utils/` 내부에서 **순수 계산 코어**와 **외부 의존 경계**를 분리합니다.
2. 모든 금융/지표/주문 수학은 **분모 가드 + `Number.EPSILON` 반올림 + §3.0 finite·정수·배열 검증**을 기본 계약으로 삼습니다.
3. **날짜·기간** 도메인은 정수로 내릴 때마다 **`Math.floor(x + Number.EPSILON)`** 을 빠짐없이 적용해, 달력·사이클·주차 표시가 한 박자 어긋나지 않게 합니다(§2.1.2).
4. **사용자·외부 문자열 → 숫자**는 **`trim()` SSOT** 로 공백 `NaN` 을 차단합니다(§2.1.4·§3.0).
5. B1이 끝나면 B2에서는 같은 계산식을 다시 만지지 않고, **서비스 경계 안정화**에만 집중할 수 있어야 합니다.

이 기준대로 진행하면 B1 실제 수정 대상은 우선 아래가 됩니다.

- `utils/financialScalarGuards.ts`(가칭) — §3.0 스칼라·정수·배열·ms용 가드 SSOT
- `utils/technicalIndicators.ts`
- `utils/multiSplitCalc.ts`
- `utils/noStopMultiSplitCalc.ts`
- `utils/vrBandStrategy.ts`의 순수 수학 부분
- `utils/currency.ts`
- `utils/dateHelpers.ts`
- `utils/dateUtils.ts`의 순수 날짜 계산 부분
- `utils/portfolioCalculations.ts`의 순수 계산 부분
