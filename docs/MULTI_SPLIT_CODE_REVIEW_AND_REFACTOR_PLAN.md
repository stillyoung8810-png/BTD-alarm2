# 다분할 매매법 코드 리뷰 및 리팩토링 계획

**작성일**: 2026-02-06
**목적**: 다분할 매매법(Multi-Split Trading) 관련 코드의 품질 문제를 정리하고, 리팩토링 계획을 세분화합니다. **코드 수정은 포함하지 않습니다.**

---

## Part 1: 코드 리뷰 — 발견된 문제점 (중요도 순)

---

### [Critical-1] 클라이언트-서버 완전 복제 (DRY 위반)

**위치**:
- `components/Dashboard.tsx`
- `supabase/functions/generate-daily-execution-summaries/index.ts`

**문제**:
동일한 비즈니스 로직이 두 파일에 **통째로 복사**되어 있음.
- `calculateHoldings` 호출
- `getCurrentRound` / `currentRound` useMemo (T 계산)
- `getMultiSplitPhase` (구간 판별)
- `checkRecentMOCSell` (MOC 기록 확인)
- `calculateNewOneTimeAmount` (쿼터모드 1회 매수금 재계산, ~50줄)
- `calculateQuarterStopLossData` (쿼터 손절 데이터)
- `calculateMultiSplitExecutionData` (전반전/후반전 주문 계산)

**위험**: 한쪽만 수정하고 다른 쪽을 빠뜨리면 **실거래에서 클라이언트-서버 불일치** 발생.

---

### [Critical-2] Dashboard.tsx God Object (1290줄+)

**위치**: `components/Dashboard.tsx`

**문제**:
하나의 컴포넌트 안에 다음이 전부 포함:
- 쿼터모드 판별 / T 계산 / MOC 확인
- 새 1회 매수금 계산 / LOC·지정가 수량 계산
- IndexedDB 접근 / 최근 영업일 조회
- 이평선 구간매수 로직
- 알람/텔레그램 블록 생성
- UI 렌더링

**위험**: 단일 책임 원칙(SRP) 완전 위반. 수정 시 의도치 않은 사이드이펙트 발생 확률 높음.

---

### [High-1] T 계산 3중 복제 (같은 파일 내)

**위치**: `components/Dashboard.tsx`
- L325-332: 쿼터모드 판별용 즉시 실행
- L365-377: `currentRound` useMemo
- L654: calculateMultiSplitExecution 내부에서 `currentRound` 참조

**문제**: L325는 즉시 실행, L365는 useMemo. **렌더링 타이밍에 따라 값이 다를 수 있음.**

---

### [High-2] 25%/75% 매도 분할 — 파일마다 다른 계산

| 위치 | 방식 |
|------|------|
| Dashboard.tsx 쿼터모드 (L576-580) | `floor(qty*0.25)` + `floor(qty*0.75)` |
| Dashboard.tsx 전반전/후반전 (L726-752) | `qty*0.25` → `safeCalculate`에서 `floor` |
| index.ts 서버 (L501-505) | `floor(qty*0.25)` + `floor(qty*0.75)` |
| backtest_multi.py (L170-171) | `int(qty*0.75)` + `qty - result` (잔량) |

**문제**: 99주 보유 시 `floor(24.75)+floor(74.25) = 24+74 = 98`. **1주 누락.**
백테스트는 잔량 방식이라 `int(74.25)=74` + `99-74=25` = 99주. **앱과 백테스트 결과 불일치.**

---

### [High-3] Cascade useEffect 안티패턴

**위치**: `components/Dashboard.tsx`

4개 이상의 useEffect가 연쇄적으로 의존:
1. `recentTradingDays` fetch (L422-445)
2. `quarterStopLossData` 계산 (L531-607)
3. `multiSplitExecutionData` 계산 (L642-795)
4. `onDailyExecutionBlock` 전달 (L801-838)

**문제**: state A → effect B → state C → effect D 패턴. 무한루프 방지용 `JSON.stringify` 비교, `useRef` 플래그가 곳곳에 있는 것 자체가 **설계 결함의 증거**.

---

### [High-4] 백테스트-앱 로직 불일치

| 항목 | 백테스트 (backtest_multi.py) | 앱 (Dashboard.tsx) |
|------|------|------|
| T=0 시 1회 매수금 | `cash / a` 재계산 | `portfolio.dailyBuyAmount` 고정 |
| 쿼터 진입 시 MOC | 전량 매도 | 25% 매도 표시 |
| 25%/75% 분할 | `int(75%)` + 잔량 | `floor(25%)` + `floor(75%)` |

**위험**: 백테스트 결과를 신뢰하고 실운영하면 **다른 결과 발생**.

---

### [Medium-1] 렌더링 중 부수효과

**위치**: `Dashboard.tsx` L325-332

렌더링 본문에서 `calculateHoldings` 호출 후 reduce 합산. useMemo가 아닌 **즉시 실행**. 매 렌더링마다 O(n) 거래 순회.

L338-345에서 `onUpdatePortfolio` 호출 가능. `useEffect` 안이지만 `ref` 기반 가드는 **StrictMode/Concurrent Mode에서 불안정**.

---

### [Medium-2] JSON.stringify 기반 동등성 비교

**위치**: Dashboard.tsx L554, L600, L773 등

`JSON.stringify(prev) === JSON.stringify(next)` 사용.
- 성능 비효율 (매번 직렬화)
- 객체 키 순서 다르면 false positive

---

### [Medium-3] 매직 넘버 산재

`0.25`, `0.75`, `0.9`, `0.01`, `0.5`, `10`, `11` 등이 **상수 선언 없이** 하드코딩. 의미 파악 불가.

---

### [Medium-4] 에러 핸들링 부재

- `fetchStockPrices` 실패 → `currentPrice=0` → 이후 계산이 조용히 진행
- `calculateHoldings` 빈 배열 → `avgPrice=0`, `currentQuantity=0` → 의미 없는 데이터 생성 후 null 반환
- 명시적 에러가 아닌 **0 전파** 패턴

---

### [Low-1] 미사용/중복 변수

- L485 `tradesBeforeMOC`와 L486 `tradesUpToMOC`은 **동일 필터**(동일 결과). 변수명만 다름.
- L493 `tempPortfolio`는 `portfolioUpToMOC`과 사실상 동일. 2줄 위에서 같은 걸 만들어놓고 또 만듦.

---

### [Low-2] 사용되지 않는 분기

`getMultiSplitPhase`에서 `'quarter'` 반환하지만, `calculateMultiSplitExecution`에서 `'quarter'` case 처리가 없음. 쿼터모드 계산은 별도 경로(`quarterStopLossData`)로 처리.

---

## Part 2: 리팩토링 계획 (세분화)

---

### Phase 1: 비즈니스 로직 추출 및 단일화

**목표**: 클라이언트-서버 중복 제거, 순수 함수로 분리

#### Step 1-1: 공용 계산 모듈 생성
- **신규 파일**: `utils/multiSplitCalc.ts`
- **추출 대상 함수**:
  - `calcT(trades, dailyBuyAmount)` → T 값 계산
  - `getPhase(T, a)` → 'first' | 'second' | 'quarter' | null
  - `calcNewOneTimeAmount(portfolio, mocDate)` → 쿼터모드 1회 매수금
  - `calcSplitQuantities(totalQty)` → `{ locSellQty, limitSellQty }` (25% 먼저, 잔량 75%)
  - `calcQuarterStopLossOrders(...)` → 쿼터모드 주문 데이터
  - `calcMultiSplitOrders(...)` → 전반전/후반전 주문 데이터
  - `checkMOCSell(trades, recentDays)` → MOC 매도 기록 확인
- **원칙**: 모든 함수는 **순수 함수** (side effect 없음, 입력만으로 출력 결정)
- **영향 파일**: 신규 생성만, 기존 파일 미수정

#### Step 1-2: 상수 정의
- **신규 또는 기존 파일**: `utils/multiSplitCalc.ts` 상단 또는 `constants/multiSplit.ts`
- **상수화 대상**:
  ```
  LOC_SELL_RATIO = 0.25       // LOC 매도 비율
  LOC_PRICE_DISCOUNT = 0.9    // 쿼터모드 LOC 가격 계수
  LOC_PRICE_OFFSET = 0.01     // LOC 매수가 오프셋
  QUARTER_SPLIT_COUNT = 10    // 쿼터모드 분할 횟수
  RECENT_TRADING_DAYS = 11    // MOC 확인 기간
  FIRST_HALF_BUY_RATIO = 0.5  // 전반전 매수 분할 비율
  ```

#### Step 1-3: Dashboard.tsx에서 계산 로직 제거
- `calculateNewOneTimeAmount`, `checkRecentMOCSell`, `getMultiSplitPhase` 등을 **import로 교체**
- T 계산을 **단일 useMemo**로 통합 (L325 즉시실행 제거)
- `calculateMultiSplitExecution` 내부 로직을 `calcMultiSplitOrders` 호출로 교체

#### Step 1-4: 서버 함수에서 계산 로직 제거
- `index.ts`의 `getCurrentRound`, `getMultiSplitPhase`, `checkRecentMOCSell`, `calculateNewOneTimeAmount`, `calculateQuarterStopLossData`, `calculateMultiSplitExecutionData`를 **공용 모듈 import로 교체**
- Edge Function에서 `utils/` import가 가능한지 확인 (번들링 방식에 따라 경로 조정 필요)

---

### Phase 2: 요구사항 반영 (로직 변경)

**목표**: 사용자 요청 4가지 반영

#### Step 2-1: 쿼터모드 조기 진입 예외 추가
- **위치**: `utils/multiSplitCalc.ts` → `shouldEnterQuarterMode(T, a, dailyBuyAmount, intermediateProfit)` 신규 함수
- **조건 추가**:
  - 기존: `T > a - 1`
  - 신규: `(a - T) * dailyBuyAmount + intermediateProfit(음수만) < dailyBuyAmount`
- **중간 손익 계산**: 기존 `calculateNewOneTimeAmount` 내부의 중간 손익 계산을 **별도 함수로 분리** → `calcIntermediateProfit(portfolio, sinceDate)`
  - "LOC 매도만" 필터링 여부 결정 필요 (현재는 MOC 이후 모든 매도 포함)
- **영향**: Dashboard.tsx의 `isInQuarterModeByT` 조건 확장, 서버 함수 동기화

#### Step 2-2: 쿼터모드 내 재-MOC 조건 추가
- **위치**: `utils/multiSplitCalc.ts` → `calcQuarterStopLossOrders` 수정
- **현재**: MOC 기록 없으면 → MOC 25% 표시. MOC 기록 있으면 → LOC/지정가 표시.
- **추가**: MOC 기록 있고 **새 1회 매수금 기준 T > 9**이면 → **새 MOC 25% 표시**
- **계산**: 쿼터모드 T = 현재 보유 총비용 / newOneTimeAmount
- **영향**: `calcQuarterStopLossOrders` 분기 추가, daily execution 표시 분기 추가

#### Step 2-3: 25%/75% 분할 방식 통일
- **위치**: `utils/multiSplitCalc.ts` → `calcSplitQuantities(totalQty)` 함수
- **규칙**: LOC 25% 먼저 정수화 → 잔량이 지정가 75%
  ```
  locSellQty = floor(totalQty * 0.25)
  limitSellQty = totalQty - locSellQty
  ```
- **적용 범위**: 전반전, 후반전, 쿼터모드 **모두** 이 함수 사용
- **영향**: Dashboard.tsx, index.ts, backtest_multi.py 모두 동일 규칙 적용

#### Step 2-4: 중간 손익 음수 포함 확인 및 LOC 필터링
- **현재 상태**: 음수 포함됨 (확인 완료), 단 **모든 매도**(LOC+지정가)를 포함
- **변경 여부 결정 필요**: "LOC 매도만" 필터링하려면 거래 데이터에 **LOC/지정가 식별 필드**가 필요
  - 현재 `isMOC` 필드는 있지만 `isLOC` 필드는 없음
  - 방법 A: 새 필드 `orderType: 'LOC' | 'LIMIT' | 'MOC' | 'MARKET'` 추가
  - 방법 B: "MOC가 아닌 매도"를 LOC로 간주 (근사치)

---

### Phase 3: Cascade useEffect 제거

**목표**: 연쇄 effect를 단일 계산 흐름으로 통합

#### Step 3-1: 커스텀 훅 분리
- **신규 파일**: `hooks/useMultiSplitExecution.ts`
- **통합 대상**:
  - recentTradingDays fetch
  - quarterStopLossData 계산
  - multiSplitExecutionData 계산
  - dailyExecutionBlock 생성
- **구조**: 단일 useEffect 안에서 async 함수로 순차 실행, 중간 결과는 로컬 변수로 전달 (state 체이닝 제거)

#### Step 3-2: JSON.stringify 비교 제거
- 구조적 비교 유틸 함수 도입 또는 `lodash.isEqual` 사용
- 또는 입력 조합 키(inputKey) 기반 메모이제이션으로 대체 (L756-770 패턴 확장)

---

### Phase 4: 백테스트 동기화 (선택)

#### Step 4-1: backtest_multi.py 규칙 통일
- T=0 시 1회 매수금: `cash/a` (이미 구현됨, 앱과 맞출지 결정)
- 쿼터 MOC: 전량 → 25%로 변경 (앱 기준에 맞출 경우)
- 25%/75%: 잔량 방식으로 통일 (이미 잔량 방식이므로 유지)

#### Step 4-2: 앱에서 T=0 시 1회 매수금 재계산
- 현재 앱은 `portfolio.dailyBuyAmount` 고정
- 백테스트와 맞추려면 T=0 감지 시 `dailyBuyAmount`를 DB에 업데이트하는 로직 필요
- **주의**: 이건 UX 변경이므로 사용자 확인 필요

---

### Phase 5: 정리/문서화

#### Step 5-1: Dead code 제거
- `tradesUpToMOC` / `tradesBeforeMOC` 중복 제거
- `getMultiSplitPhase`의 `'quarter'` 반환값이 실제 사용되는지 확인 후 정리

#### Step 5-2: 에러 핸들링 강화
- `fetchStockPrices` 실패 시 명시적 에러 전파 또는 사용자 알림
- `avgPrice=0` / `currentQuantity=0`일 때 early return + 사유 로깅

#### Step 5-3: 테스트 추가
- `utils/multiSplitCalc.ts`의 순수 함수들에 대한 유닛 테스트
- 엣지 케이스: 99주 분할, T=0 재계산, 중간 손익 음수, 쿼터 재진입

---

## 실행 순서 요약

| 순서 | Phase | 예상 영향 범위 | 난이도 |
|------|-------|---------------|--------|
| 1 | Phase 1: Step 1-1, 1-2 | 신규 파일만 | 낮음 |
| 2 | Phase 2: Step 2-3 | 계산 함수 1개 | 낮음 |
| 3 | Phase 1: Step 1-3, 1-4 | Dashboard.tsx, index.ts | 중간 |
| 4 | Phase 2: Step 2-1 | 계산 함수 + 진입 조건 | 중간 |
| 5 | Phase 2: Step 2-2 | 쿼터모드 분기 + 표시 | 중간 |
| 6 | Phase 2: Step 2-4 | 거래 데이터 필드 검토 | 중간~높음 |
| 7 | Phase 3 | Dashboard.tsx 훅 분리 | 높음 |
| 8 | Phase 4 (선택) | backtest_multi.py | 중간 |
| 9 | Phase 5 | 전체 정리 | 낮음 |

---

## 미결정 사항 (작업 전 확인 필요)

1. **중간 손익 필터링**: "LOC 매도만" vs "MOC 제외 모든 매도" — 거래 데이터에 `orderType` 필드 추가 여부
2. **T=0 시 1회 매수금 재계산**: 앱에서도 `cash/a`로 갱신할지, 현재처럼 고정할지
3. **쿼터 MOC 매도량**: 25% vs 전량 — 백테스트(전량)와 앱(25%)의 기준 통일
4. **Edge Function 번들링**: 서버 함수에서 `utils/multiSplitCalc.ts` import 가능 여부 확인 필요
