# 실현손익(realizedPnL) 로직 수정 계획안 v3

비판 5건 + 추가 비판 3건 반영. 적용 대상: `utils/portfolioCalculations.ts`의 `calculateHoldings`, `utils/multiSplitCalc.ts`의 `calcHoldings`, 및 관련 검증/기술 부채.

---

## 1. 예외를 조용히 덮는 안티패턴 (Zero Division) 제거

### 문제
- 매도 시 `currentAvgPrice = quantity > 0 ? totalCost / quantity : 0` 로 두면, quantity ≤ 0 인 비정상(공매도/데이터 오류)에서 costBasis = 0이 되어 매도 금액 전액이 실현손익으로 잡힘.

### 수정 방향
- **비정상 상태를 삼항으로 0으로 덮지 않음.** 매도 처리 **진입 시점**에 다음 검사 추가:
  - `quantity < 0` 이거나
  - `quantity < sellQuantity` (매도 수량이 보유 수량 초과)
  → **명시적 예외 처리** 적용.
- **정책 옵션** (택일):
  - **A. throw**: `throw new Error('매도 수량이 보유 수량을 초과할 수 없습니다.')` (또는 도메인 전용 Error 클래스)
  - **B. 로깅 + throw**: `console.error(...)` 후 동일 throw
  - **C. 로깅 + 방어적 계산**: 로그만 남기고, costBasis는 `currentAvgPrice * Math.min(sellQuantity, quantity)` 등으로 상한 두기 (데이터 오염은 막되, throw는 하지 않음)
- **권장**: 금융 도메인에서는 **A 또는 B**로 명시적 실패를 권장. throw 시 해당 포트폴리오/거래 목록의 무결성 검증 실패로 상위에서 처리 가능.
- **적용 위치**:
  - 두 파일 모두, 매도 분기 **맨 앞**에서 `entry.quantity`(또는 `prev.quantity`)와 `trade.quantity` 비교 후, 조건 불만족 시 위 정책 실행.

---

## 2. 거래 수수료(fee) 검증 — 음수 방지

### 문제
- 클라이언트/입력 버그로 `fee < 0` 이 들어오면, 매수 비용이 줄고 매도 수익이 부풀어 회계 오류 발생.

### 수정 방향
- **모든 매수/매도 수수료 사용처에서 fee를 비음수로 강제.**
- **방법**: 계산에 쓰기 직전 `fee`를 `Math.abs(trade.fee)` (또는 `fee = Math.abs(fee)`)로 치환. 두 함수 내부에서:
  - 매수: `totalCost += price * quantity + Math.abs(trade.fee)`
  - 매도: `revenue = price * quantity - Math.abs(trade.fee)`  
  그리고 실현손익 공식의 `costBasis` 등 다른 곳에서 `trade.fee`를 쓴다면 동일하게 `Math.abs(trade.fee)` 사용.
- **적용 위치**:
  - `portfolioCalculations.ts`: `calculateHoldings` 내 buy/sell 분기에서 `trade.fee` 사용하는 모든 식.
  - `multiSplitCalc.ts`: `calcHoldings` 내 동일.

---

## 3. 새 포트폴리오 생성 시 fee 입력 — 양수만 허용 (이중 안전장치)

### 문제
- DB/클라이언트에 fee가 음수로 저장되면, 2번에서 계산 시 `Math.abs`로 막을 수 있으나, **입력 단계**에서 막는 것이 더 안전.

### 수정 방향 (이중 안전장치)
1. **UI/폼 검증 (1차)**  
   - 포트폴리오 생성/수정 폼에서 “수수료” 입력값이 **숫자이며 0 이상**인지 검사.  
   - 0 미만이면 제출 불가 또는 에러 메시지 표시 (예: "수수료는 0 이상이어야 합니다").
2. **저장/적용 직전 검증 (2차)**  
   - 포트폴리오 저장(API/상태 업데이트) 직전에 `feeRate`(또는 개별 거래 `fee`)가 0 미만이면  
     - 값을 0으로 클램프하거나,  
     - 저장을 거부하고 에러 반환/표시  
   - 정책에 따라 “0으로 클램프” vs “거부” 중 하나 선택.

### 적용 위치
- **1차**: 전략/포트폴리오 생성·수정 UI가 있는 컴포넌트 (예: `StrategyCreator.tsx`, 설정 모달 등)에서 수수료 필드에 `min={0}`, `type="number"` 및 onSubmit/onChange 시 검증.
- **2차**: 포트폴리오를 저장하는 함수/API 호출 직전 (예: `usePortfolios`의 update/create, 또는 서버 검증)에서 `feeRate >= 0` 및 필요 시 `trade.fee >= 0` 검사.

---

## 4. realizedPnL 부동소수점 오염 방지

### 문제
- `realizedPnL += currentTradePnL` 반복 시 IEEE 754 오차가 쌓여, UI에 `$150.000000000004` 같은 값이 노출될 수 있음.

### 수정 방향
- **반환 직전에만** 실현손익을 고정 소수점으로 정리.  
  **최종 map 단계**에서 `realizedPnL`을 **소수점 2자리**로 절사/반올림 후 반환.
- **구현**:  
  `realizedPnL: Number(data.realizedPnL.toFixed(2))`  
  (또는 서비스 정책에 따라 `toFixed(0)` 등 다른 자리수 사용.)
- **주의**: 내부 accumulator에서는 기존대로 `number`로 누적하고, **반환 시에만** toFixed 적용. (중간 연산마다 toFixed 하면 오차는 줄지만 반올림이 여러 번 적용될 수 있음; 단일 지점 정리로 정책 일치.)

### 적용 위치
- `portfolioCalculations.ts`: `calculateHoldings`의 `return ... .map(...)` 안에서 `realizedPnL: Number(data.realizedPnL.toFixed(2))`.
- `multiSplitCalc.ts`: `calcHoldings`의 동일 map에서 `realizedPnL: Number(data.realizedPnL.toFixed(2))`.

---

## 5. 본전 치기(Break-Even) 증발 버그 — 필터링 로직 변경

### 문제
- `data.quantity > 0 || data.realizedPnL !== 0` 조건은, 전량 매도 후 quantity=0 이고 realizedPnL=0 인 **본전 거래**를 제외시킴. 정상적으로 종료한 이력이 보고에서 사라짐.

### 수정 방향
- **“숫자 상태(0 여부)로 존재 여부를 판단하지 않는다”.**  
  **map에 한 번이라도 등장한 종목(거래 이력이 있는 종목)은 모두 반환**한다.
- **구체적 변경**:
  - 기존: `.filter(([_, data]) => data.quantity > 0 || data.realizedPnL !== 0)`
  - 변경: **filter 제거.** `Object.entries(map)` 결과를 그대로 `.map(...)` 하여 반환.
- **의미**: 매수만 있든, 매도만 있든(다른 종목에서 넘어온 경우 등), 매수+매도든, **해당 종목에 대한 거래가 1건이라도 있으면** 반환 배열에 포함. 본전 전량 매도(quantity=0, realizedPnL=0)도 이력으로 남음.

### 적용 위치
- `portfolioCalculations.ts`: `calculateHoldings`에서 `Object.entries(holdingsMap)` 뒤의 `.filter(...)` 삭제.
- `multiSplitCalc.ts`: `calcHoldings`에서 동일하게 `.filter(...)` 삭제.

---

## 6. DRY 위배 및 매도 블록 로직 중복 제거 (추가 비판 1)

### 문제
- `portfolioCalculations.ts`에서 매도 시 `currentAvgPrice`를 한 번 계산한 뒤, 비례 차감용 `avgPrice`를 **또** `oldQuantity`를 두고 `entry.totalCost / oldQuantity`로 재계산하고 있음. 동일한 나눗셈을 두 번 수행하는 불필요한 중복.
- 두 파일(portfolioCalculations.ts, multiSplitCalc.ts)의 매도(SELL) 블록이 미세하게 달라 **구조적 드리프트(Drifting)** 가 발생하면 유지보수 시 양쪽을 따로 맞춰야 함.

### 수정 방향
- **portfolioCalculations.ts**: 비례 차감에 쓰는 평단가는 `currentAvgPrice`를 재사용. `oldQuantity` 변수 및 `entry.totalCost / oldQuantity` 제거 → `const avgPrice = currentAvgPrice;` 로 통일.
- **두 함수의 SELL 블록을 토씨 하나 틀리지 않고 100% 동일한 구조로 맞춤.** 변수명만 각 파일의 컨텍스트(entry vs prev, holdingsMap vs map)에 맞게 유지하되, 계산 순서·조건·수식은 완전히 동일하게 작성.

### 적용 위치
- `portfolioCalculations.ts`: `calculateHoldings` 내 매도 분기에서 `avgPrice` 계산을 `currentAvgPrice` 재사용으로 교체.
- 두 파일의 매도 분기 전체를 대조하여 동일 구조인지 확인 후, 차이가 있으면 multiSplitCalc.ts 기준으로 portfolioCalculations.ts를 맞춤.

---

## 7. 나눗셈 분모의 '미세 먼지' 검증 (추가 비판 2)

### 문제
- 수량이 0으로 수렴할 때 `quantity`/`totalCost`를 0으로 초기화하는 방어는 있으나, **평단가 계산의 분모**에는 epsilon 검증이 없음.
- `prev.quantity`가 1e-14 수준(부동소수점 잔여)이면 `> 0` 조건을 통과해, `totalCost / quantity`가 비정상적으로 큰 “가격”으로 계산될 수 있음. 디지털 먼지끼리 나눗셈을 허용하면 안 됨.

### 수정 방향
- **평단가를 쓸 모든 나눗셈**에서 분모 조건을 `> 0` 이 아닌 **`> HOLDINGS_QTY_EPSILON`** 으로 통일.
- **수정안**:  
  `const currentAvgPrice = prev.quantity > HOLDINGS_QTY_EPSILON ? prev.totalCost / prev.quantity : 0;`  
  (portfolioCalculations에서는 `entry.quantity` 등 해당 컨텍스트에 맞게 적용.)

### 적용 위치
- `portfolioCalculations.ts`: `calculateHoldings` 내 `currentAvgPrice`(및 매도 블록 내 다른 평단가 사용처) 계산 시 `entry.quantity > HOLDINGS_QTY_EPSILON` 사용.
- `multiSplitCalc.ts`: `calcHoldings` 내 `currentAvgPrice` 계산 시 `prev.quantity > HOLDINGS_QTY_EPSILON` 사용.

---

## 8. calcIntermediateProfit O(N²) 성능 — 기술 부채 정리 (추가 비판 3)

### 문제
- `calcIntermediateProfit(trades, sinceDate)` 내부에서 `tradesAfter`를 순회하는 for 루프 **안에서** 매번 `calcHoldings(tempTrades)`를 호출함. 거래 N건이면 루프 N번 × calcHoldings O(N) → **O(N²)**. 거래가 많을 때 클라이언트 버벅임의 원인이 됨.

### 수정 방향 (추후 리팩토링)
- **당장 코드 변경하지 않음.** 이번 수정 범위 밖이므로, **기술 부채로 명시**하고 별도 리팩토링 일정을 두는 것으로 계획에 포함.
- **리팩토링 아이디어**: 이제 `calcHoldings`가 종목별 `realizedPnL`을 반환하므로, “sinceDate 이전까지의 realizedPnL”과 “전체 거래 기준 realizedPnL”의 **차액(Diff)** 으로 sinceDate 이후 실현손익을 구하면, **한 번의 calcHoldings(전체)** 또는 순차 누적만으로 O(N)에 계산 가능. 추후 해당 방식으로 `calcIntermediateProfit`을 O(N)으로 리팩토링할 수 있음.
- **계획서에 기록할 내용**:  
  - 기술 부채 항목: “multiSplitCalc.calcIntermediateProfit을 realizedPnL 차액 기반 O(N) 알고리즘으로 리팩토링.”  
  - 이번 v3 적용 시에는 **구현하지 않고**, 이 계획안 문서와 이슈/백로그에만 반영.

### 적용 위치
- 코드 수정 없음. 문서/이슈에 “calcIntermediateProfit O(N²) → O(N) 리팩토링” 항목 추가.

---

## 9. 적용 순서 및 검증

| 단계 | 내용 | 검증 |
|------|------|------|
| 1 | 매도 시 quantity < sellQty 검사 및 throw(또는 정책에 따른 처리) 추가 | 비정상 거래 입력 시 예외 발생 또는 로그 확인 |
| 2 | 매수/매도 수식에 Math.abs(trade.fee) 적용 | fee 음수 입력 시 비용/수익이 부풀어나지 않음 확인 |
| 3 | 포트폴리오 생성/수정 시 fee 양수만 허용 (폼 검증 + 저장 전 검증) | 음수 수수료 입력 시 제출 불가 또는 클램프/거부 확인 |
| 4 | 반환 map에서 realizedPnL을 toFixed(2)로 정리 | 다수 거래 누적 후 UI 값이 소수 2자리로만 나오는지 확인 |
| 5 | filter 제거 — map에 있는 모든 종목 반환 | 본전 전량 매도 케이스에서 해당 종목이 반환 배열에 포함되는지 확인 |
| 6 | portfolioCalculations 매도 블록에서 avgPrice = currentAvgPrice 재사용, 두 파일 SELL 블록 구조 100% 동일화 | 중복 나눗셈 제거, 두 파일 매도 로직 대조 시 동일 |
| 7 | 평단가 나눗셈 분모 조건을 quantity > HOLDINGS_QTY_EPSILON 으로 통일 | 극소 수량에서 평단가가 비정상 값으로 나오지 않음 |
| 8 | calcIntermediateProfit O(N²) → 기술 부채 등록 (이번 PR에서는 미구현) | 백로그/이슈에 리팩토링 항목 존재 |

---

## 10. 테스트 수정 예상

- **multiSplitCalc.test.ts**  
  - “매도 수량 > 보유 수량” 케이스: 현재는 방어적으로 0 클램프 후 반환하는데, **v3에서 throw 정책**을 택하면 해당 테스트는 “예외가 발생해야 함”으로 바꾸거나, 정책이 “로그+상한”이면 기대값 유지.
- **본전 전량 매도**  
  - quantity=0, realizedPnL=0 인 1건이 반환되는지 assertion 추가.
- **realizedPnL 소수점**  
  - 여러 번 매도해 누적한 뒤 `realizedPnL`이 소수 2자리 수인지 검사 (예: `expect(Number(h.realizedPnL.toFixed(2))).toBe(h.realizedPnL)` 또는 반올림 후 기대값 비교).
- **epsilon 분모**: quantity가 HOLDINGS_QTY_EPSILON 미만인 상태에서 매도가 들어오는 경계 테스트(있다면)에서 평단가 0 또는 예외 동작이 기대대로인지 확인.

이 계획안대로 적용하면 비판 1~5와 추가 비판 1~3을 모두 반영할 수 있습니다.
