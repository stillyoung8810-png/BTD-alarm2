# 전략별 Daily Execution 문구·로직 및 백테스트 점검

**작성일**: 2026-02-03  
**목적**: 각 전략의 daily execution에 올라가는 문구·로직을 모든 경우의 수로 정리하고, 백테스트 로직·설정창과의 일치 여부를 점검합니다.

---

## 1. 전략 구분

| 전략 ID | 전략명 (앱) | 전략 타입 |
|---------|-------------|-----------|
| `rsi_ma_interval` | RSI & 이동평균선 구간 매수 (이평선 구간매수) | `!portfolio.strategy.multiSplit` |
| `multi_split` | 다분할 매매법 | `portfolio.strategy.multiSplit` |

---

## 2. 이평선 구간매수 – Daily Execution 문구·로직 (모든 경우의 수)

**포맷터**: `utils/dailyExecutionSummary.ts` → `formatPortfolioDailyExecutionBlock`  
**조건**: `!portfolio.strategy.multiSplit`

### 2-1. 공통 (항상 출력)

| 순서 | 문구 (ko) | 문구 (en) | 비고 |
|------|-----------|-----------|------|
| 1 | `📌 {portfolio.name}` | 동일 | 포트폴리오 이름 |
| 2 | `- 이평선 구간매수` | `- Moving Average Strategy` | 전략 라벨 |
| 3 | `- 알람 시간 (KST): {hours \|\| '-'}` | `- Alarm times (KST): ...` | selectedHours join |
| 마지막 | `- 오늘 주문 요약은 앱에서 확인해 주세요.` | `- Please check today's orders in the app.` | noOrder |

### 2-2. 구간·매수 종목 (maActiveSection 1/2/3일 때만)

**입력**: `options.maActiveSection`, `options.maRsiNotMet`, `options.maAlignmentNotMet`  
**필터 활성화**: `ma0.rsiEnabled === true`일 때만 RSI 미충족 문구 출력. `ma0.alignmentEnabled === true`일 때만 정배열 미충족 문구 출력. 꺼져 있으면 미충족이더라도 매수/관망 로직만 따름.

**4가지 조합 시뮬레이션** (effectiveRsiNot = rsiEnabled && maRsiNotMet, effectiveAlignmentNot = alignmentEnabled && maAlignmentNotMet):

| # | ma0.rsiEnabled | ma0.alignmentEnabled | effectiveRsiNot | effectiveAlignmentNot | 출력 (ko) |
|---|----------------|----------------------|----------------|------------------------|-----------|
| 1 | * | * | false | false | `- 구간 N: {stock} 매수` |
| 2 | true | * | true | false | `- 구간 N: 관망 (RSI 조건 미충족)` |
| 3 | * | true | false | true | `- 구간 N: 관망 (정배열 미충족)` |
| 4 | true | true | true | true | `- 구간 N: 관망 (정배열 미충족, RSI 조건 미충족)` |

- N = 1 → `ma1.stock`, N = 2 → `ma2.stock`, N = 3 → `ma3.stock`. 이평선은 **ma0.maAPeriod / ma0.maBPeriod** 2개만 사용(백테스트와 동일).

### 2-3. 구간별 중간익절 (maPartialProfitLines)

**입력**: `options.maPartialProfitLines`. **이중 안전장치**: (1) 데이터가 있을 때만 라인 출력, (2) 해당 구간 `ma1/ma2/ma3.takePartialProfit === true`일 때만 출력. 익절 기능을 껐으면 데이터가 있어도 출력 안 함.

| 조건 | 출력 (ko) |
|------|-----------|
| `maPartialProfitLines.length > 0` 이고 해당 구간 `takePartialProfit === true` | `- 구간 N 중간익절: {stock} {qty}주` |
| 데이터 없음 또는 takePartialProfit false | (해당 라인 없음) |

- qty = `Math.round(quantity)`, 0 이하·stock 없음은 라인 생략.

### 2-4. 이평선 요약 (경우의 수)

| # | maActiveSection | effectiveRsiNot | effectiveAlignmentNot | maPartialProfitLines (takePartialProfit true) | 결과 |
|---|-----------------|-----------------|----------------------|------------------------------------------------|------|
| 1 | null/없음 | — | — | [] | 공통 3줄 + noOrder |
| 2 | 1/2/3 | false | false | [] | 공통 + "구간 N: {stock} 매수" + noOrder |
| 3 | 1/2/3 | true | false | [] | 공통 + "구간 N: 관망 (RSI 조건 미충족)" + noOrder |
| 4 | 1/2/3 | false | true | [] | 공통 + "구간 N: 관망 (정배열 미충족)" + noOrder |
| 5 | 1/2/3 | true | true | [] | 공통 + "구간 N: 관망 (정배열 미충족, RSI 조건 미충족)" + noOrder |
| 6 | 1/2/3 | * | * | 1개 이상 (해당 구간 takePartialProfit true) | 위 구간 라인 + "구간 N 중간익절: 종목 수량주" 라인들 + noOrder |

---

## 3. 다분할 매매법 – Daily Execution 문구·로직 (모든 경우의 수)

**조건**: `portfolio.strategy.multiSplit`

### 3-1. 공통 (항상 출력)

| 순서 | 문구 (ko) | 비고 |
|------|-----------|------|
| 1 | `📌 {portfolio.name}` | |
| 2 | `- 다분할 매매법` | |
| 3 | `- 알람 시간 (KST): {hours \|\| '-'}` | |

### 3-2. 총투자금 초과 (multiSplitOverLimit === true)

| 출력 (ko) | 비고 |
|-----------|------|
| `- 매매 내역을 확인하세요. 총투자금을 초과했습니다.` | 이후 LOC/지정가 등 없음 |

### 3-3. 쿼터 손절 모드 (isQuarterStopLossActive && quarterStopLossData)

| quarterStopLossData.hasMOC | 출력 |
|----------------------------|------|
| false | `- MOC 매도: {mocQuantity} 주`, `- MOC 매도 하여 쿼터 손절 모드 시작` |
| true | `- 1회 매수금: $...`, `- LOC 매수2: 가격/수량`, `- LOC 매도: ...`, `- 지정가 매도: ...` (있을 때만) |

### 3-4. 전반전 (multiSplitPhase === 'first')

- `- LOC 매수1: 가격/수량`
- `- LOC 매수2: 가격/수량`
- `- LOC 매도: 가격/수량`
- `- 지정가 매도: 가격/수량`  
(각 항목은 데이터 있을 때만)

### 3-5. 후반전 (multiSplitPhase === 'second')

- `- LOC 매수2: 가격/수량`
- `- LOC 매도: 가격/수량`
- `- 지정가 매도: 가격/수량`  
(각 항목은 데이터 있을 때만)

### 3-6. 그 외 (phase 없음, 쿼터 아님, 초과 아님)

- `- 오늘 주문 요약은 앱에서 확인해 주세요.`

### 3-7. 다분할 요약 (경우의 수)

| # | multiSplitOverLimit | isQuarterStopLossActive | quarterStopLossData | multiSplitPhase | 결과 |
|---|---------------------|-------------------------|---------------------|-----------------|------|
| 1 | true | — | — | — | 공통 + 총투자금 초과 문구 |
| 2 | false | true | hasMOC false | — | 공통 + MOC 매도 + 쿼터 힌트 |
| 3 | false | true | hasMOC true | — | 공통 + 1회 매수금 + LOC2 + LOC매도 + 지정가매도 |
| 4 | false | false | — | 'first' | 공통 + LOC매수1/2 + LOC매도 + 지정가매도 |
| 5 | false | false | — | 'second' | 공통 + LOC매수2 + LOC매도 + 지정가매도 |
| 6 | false | false | — | null/기타 | 공통 + noOrder |

---

## 4. 백테스트 vs 전략 로직 비교

### 4-1. 이평선 구간매수

| 항목 | 앱(전략)·Dashboard | 백테스트 (Backtest.tsx + backtest_ma.py) | 일치 |
|------|---------------------|------------------------------------------|------|
| 구간 판정 | `determineActiveSection`: ma0.maAPeriod, ma0.maBPeriod 2개만 사용. hi=max(maA,maB), lo=min(maA,maB) → 1: close>hi, 2: lo≤close≤hi, 3: close<lo | `determine_section(close, ma_a, ma_b)`: 동일 로직 | ✅ 동일 (2026-02-03 앱 단순화 반영) |
| RSI | ma0.rsiEnabled, ma1/2/3.rsiThreshold (기준 주식 RSI 이하만 매수) | rsiEnabled, rsiThreshold (RSI > thresh 시 관망) | ✅ 동일 (백테스트 기본값 30, 범위 10~60) |
| 정배열 | ma0.alignmentEnabled (MA a > MA b 일 때만 매수) | alignmentEnabled | ✅ 동일 |
| 중간 이익 실현 | ma1/2/3.takePartialProfit, partialProfitTargetPct | maATakeProfit, maBTakeProfit, ma3TakeProfit + Pct | ✅ 동일 |
| 기준 주식 | ma0.stock | baseStock | ✅ 동일 |
| 구간 1/2/3 종목 | ma1.stock, ma2.stock, ma3.stock | maAStock, maBStock, ma3Stock | ✅ 동일 |
| 이평선 기간 | ma0.maAPeriod (단기), ma0.maBPeriod (장기) 2개만 사용. ma1/2/3 period 제거됨 | maAPeriod, maBPeriod | ✅ 동일 (앱·백테스트 통합 변수) |
| 매수 조건 순서 | 정배열(maA>maB) → RSI(RSI≤thresh). 둘 다 만족 시만 매수. | backtest_ma.py: alignment 먼저, 그다음 RSI. 둘 다 만족 시만 매수 | ✅ 동일 |
| 관망 문구 (4가지 조합) | formatPortfolioDailyExecutionBlock: RSI/정배열 조합별 sectionWatch* 문구 | — | ✅ 2-2 시뮬레이션 표와 일치 |

### 4-2. 다분할 매매법

- 백테스트 UI/엔진: `Backtest.tsx`에 다분할 파라미터(targetReturnRate, totalSplitCount, oneTimeAmount, months, feeRate) 있음.  
- **백테스트 엔진**: `scripts/backtest_multi.py` — 지정가/LOC/MOC(쿼터) 체결 시 포지션 청산 → 총 현금을 a로 나눠 새 1회 매수금 → 다음 영업일 1회차 매수부터 재시작. (2026-02-03 반영)
- **프론트**: 다분할 선택 시 `VITE_BACKTEST_MULTI_URL` 설정 시 해당 API 호출, 미설정 시 목업(buildMockResult) 사용.
- 실제 백테스트 실행: 이평선은 backtest_ma.py, 다분할은 backtest_multi.py. handleRunBacktest에서 다분할 시 API 호출 후 결과 표시.  
- Daily execution 문구와의 일치: 다분할은 “문구 포맷”만 정리했고, 백테스트 연산 로직은 목업이라 추가 검증 대상.

---

## 5. 백테스트 설정창 vs 전략 변수 (빠진/다른 것)

### 5-1. 이평선 구간매수 (BacktestParamsMa vs Strategy)

| 전략(StrategyCreator)·타입 | 백테스트(Backtest) UI | 비고 |
|----------------------------|------------------------|------|
| ma0.stock (기준 주식) | baseStock | ✅ 있음 |
| ma0.rsiEnabled | rsiEnabled | ✅ 있음 |
| ma0.alignmentEnabled | alignmentEnabled | ✅ 있음 |
| ma1/2/3 공통 RSI (Step1 게이지 10~60) | rsiThreshold (10~60, 기본 30) | ✅ 2026-02-03 반영: 백테스트 UI·DEFAULT 10~60/30으로 통일 |
| ma0.maAPeriod, ma0.maBPeriod (단기/장기 이평선) | maAPeriod, maBPeriod | ✅ 있음 (2026-02-03 통합) |
| ma1.stock | maAStock | ✅ 있음 |
| ma1.takePartialProfit, partialProfitTargetPct | maATakeProfit, maATakeProfitPct | ✅ 있음 |

| ma2.stock | maBStock | ✅ 있음 |
| ma2.takePartialProfit, partialProfitTargetPct | maBTakeProfit, maBTakeProfitPct | ✅ 있음 |
| ma3.stock | ma3Stock | ✅ 있음 |

| ma3.takePartialProfit, partialProfitTargetPct | ma3TakeProfit, ma3TakeProfitPct | ✅ 있음 |
| dailyBuyAmount, feeRate, 기간(months) | dailyBuyAmount, feeRate, months | ✅ 있음 |

**정리**:  
- **2026-02-03 단순화**: 앱도 이평선 기간을 ma0.maAPeriod, ma0.maBPeriod 2개만 사용. ma1/ma2/ma3 개별 period 제거. 백테스트와 동일 변수로 매핑됨.

### 5-2. 다분할 매매법 (BacktestParamsMultiSplit vs Strategy.multiSplit)

| 전략 | 백테스트 UI | 비고 |
|------|-------------|------|
| targetStock | stock | ✅ 있음 |
| targetReturnRate | targetReturnRate | ✅ 있음 |
| totalSplitCount | totalSplitCount | ✅ 있음 |
| dailyBuyAmount (1회 매수금) | oneTimeAmount | ✅ 있음 |
| feeRate | feeRate | ✅ 있음 |
| 기간 | months | ✅ 있음 |

다분할은 설정창 변수 누락 없음. (실제 연산은 목업이라 별도 검증 필요.)

---

## 6. 백테스트 스크립트 버그 (backtest_ma.py) – 수정 반영

- **main()** 에서 `symbols = list({p["baseStock"], p["ma1Stock"], p["ma2Stock"], p["ma3Stock"]})` 사용하던 것을 **수정**: `maAStock`, `maBStock`, `ma3Stock` 사용하도록 변경함. (run_backtest 내부는 이미 maAStock, maBStock, ma3Stock 사용 중.)
- **RSI**: DEFAULT_PARAMS 및 Backtest UI 기본값 70 → **30**, 범위 **10~60** 으로 앱(StrategyCreator Step1 게이지)과 맞춤.

---

## 7. 권장 조치 요약 (반영된 것 포함)

| 우선순위 | 항목 | 조치 | 상태 |
|----------|------|------|------|
| 1 | backtest_ma.py main() | `ma1Stock`/`ma2Stock` → `maAStock`/`maBStock` | ✅ 반영 |
| 2 | 백테스트 RSI | 기본값 30, 범위 10~60 (앱과 동일) | ✅ 반영 |
| 3 | 구간2 MA | 앱은 period1/period2, 백테스트는 maBPeriod 1개 → “period2 = maB” 등 매핑 규칙 문서화 | 문서화만 (현재 로직 유지) |
| 4 | ma3.period | 백테스트에서 미사용이면 “구간 판정은 ma_a/ma_b만 사용” 명시 유지 | 문서 유지 |

---

## 8. Daily Execution 최종 조합 테스트 출력 결과물 (이평선 구간매수)

**포맷터**: `formatPortfolioDailyExecutionBlock`. 공통 상단 3줄: `📌 {name}`, `- 이평선 구간매수`, `- 알람 시간 (KST): ...` 생략하고 구간·익절·noOrder만 표기.

| # | ma0.rsiEnabled | ma0.alignmentEnabled | maRsiNotMet | maAlignmentNotMet | maActiveSection | maPartialProfitLines (takePartialProfit) | 출력 (ko) |
|---|----------------|----------------------|-------------|-------------------|-----------------|------------------------------------------|-----------|
| 1 | false | false | — | — | 1 | [] | `- 구간 1: {stock} 매수` + noOrder |
| 2 | true | false | false | — | 1 | [] | `- 구간 1: {stock} 매수` + noOrder |
| 3 | true | false | true | — | 1 | [] | `- 구간 1: 관망 (RSI 조건 미충족)` + noOrder |
| 4 | false | true | — | false | 1 | [] | `- 구간 1: {stock} 매수` + noOrder |
| 5 | false | true | — | true | 1 | [] | `- 구간 1: 관망 (정배열 미충족)` + noOrder |
| 6 | true | true | false | false | 1 | [] | `- 구간 1: {stock} 매수` + noOrder |
| 7 | true | true | true | false | 1 | [] | `- 구간 1: 관망 (RSI 조건 미충족)` + noOrder |
| 8 | true | true | false | true | 1 | [] | `- 구간 1: 관망 (정배열 미충족)` + noOrder |
| 9 | true | true | true | true | 1 | [] | `- 구간 1: 관망 (정배열 미충족, RSI 조건 미충족)` + noOrder |
| 10 | * | * | * | * | null | [] | 공통 3줄 + noOrder (구간 라인 없음) |
| 11 | * | * | * | * | 1 | [{ section:1, stock:'TQQQ', quantity:10 }], ma1.takePartialProfit true | 구간 라인 + `- 구간 1 중간익절: TQQQ 10주` + noOrder |
| 12 | * | * | * | * | 1 | [{ section:1, ... }], ma1.takePartialProfit **false** | 구간 라인만, 중간익절 라인 **없음** + noOrder |

- **에러 방지**: executionData/계산값 없을 때 항상 `- 오늘 주문 요약은 앱에서 확인해 주세요.` 출력. 다분할 first/second에서 LOC 등이 하나도 없으면 noOrder 추가 후 반환.

이 문서는 전략별 daily execution 모든 경우의 수와, 백테스트 로직·설정창과의 차이를 한곳에서 점검하기 위한 기준입니다.
