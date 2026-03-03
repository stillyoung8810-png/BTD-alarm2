# 실현손익 표시 로직 변경 계획 (수정안 v2)

**목표**: 포트폴리오 카드의 "실현손익"을 **역산 실현손익**(revenue − costBasis 누적)으로 표시하고, 정산·모달의 "기 회수금"은 **회수금(현금)**으로 유지한다.  
**비판 반영**: 함수 이름 기만 금지, 이중 연산 제거.

---

## 비판 반영 요약

| 비판 | 반영 내용 |
|------|-----------|
| **1. 이름만 남기고 알맹이 바꾸기** | `calculateAlreadyRealized`를 **삭제**. "순수익"은 별도 함수명으로 두지 않고, Dashboard에서 holdings 한 번 계산 후 `reduce`로 합산. |
| **2. 이중 연산** | `calculateTotalRealizedPnL(portfolio)` 같은 **신규 유틸을 만들지 않음**. Dashboard의 **메트릭 effect** 안에서 `calculateHoldings(portfolio)` **한 번만** 호출하고, 그 결과로 총 실현손익을 `holdings.reduce(...)` 로 구해 카드에 사용. |

---

## 현재 상태

- **calculateAlreadyRealized(portfolio)**: Σ(매도: price×qty − fee) = **회수금**.  
  사용처: Dashboard 카드 "실현손익", SettlementModals "기 회수금", usePortfolios 정산(totalReturn·result.alreadyRealized).
- **calculateHoldings(portfolio)** 반환의 **realizedPnL**: 종목별 역산 실현손익.  
  카드에는 미사용.

---

## 수정 설계 (Action Items)

### 1. 회수금 전용 함수 추가 (utils/portfolioCalculations.ts)

- **함수명**: `getTotalSellProceeds(portfolio: Portfolio): number`
- **수식**: 기존 calculateAlreadyRealized 본문과 동일  
  `portfolio.trades.filter(t => t.type === 'sell').reduce((sum, t) => sum + (t.price * t.quantity - Math.abs(t.fee)), 0)`
- **의미**: 매도로 이미 받은 **현금 합계**(회수금). 정산·모달 전용.

### 2. 레거시 함수 삭제 (utils/portfolioCalculations.ts)

- **calculateAlreadyRealized** 함수 **완전 삭제**.
- 이름을 남기고 반환 의미만 바꾸지 않음. "AlreadyRealized"는 레거시상 회수금 의미였으므로 제거.

### 3. Dashboard 수정 (components/Dashboard.tsx)

- **메트릭 계산 effect** (수익률/투자금/실현손익):
  - `calculateAlreadyRealized(current)` 호출 **제거**.
  - `const holdings = calculateHoldings(current);` **한 번만** 호출.
  - `const totalRealizedPnL = holdings.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);`
  - `setRealizedProfit(totalRealizedPnL);` 로 카드 "실현손익"에 **역산 실현손익**을 명시적으로 꽂음.
- **import**: `calculateAlreadyRealized` 제거, `calculateHoldings`는 기존 유지.
- **유틸 함수 추가 없음**: `calculateTotalRealizedPnL(portfolio)` 같은 함수는 만들지 않음. (이중 연산 방지)

### 4. 정산·모달에서 회수금 사용 (getTotalSellProceeds)

- **usePortfolios.ts** (정산 실행):
  - `const alreadyRealizedCash = getTotalSellProceeds(portfolio);`
  - `totalReturn = alreadyRealizedCash + finalSellAmount;`
  - `result.alreadyRealized = alreadyRealizedCash` (기 회수금 = 회수금 유지).
- **SettlementModals.tsx**:
  - 입력 단계 "기 회수금" 표시: `getTotalSellProceeds(portfolio)` 호출로 변경.
  - 정산 결과 모달의 `result.alreadyRealized`는 usePortfolios에서 이미 회수금으로 넣으므로 변경 없음.

### 5. App.tsx

- `calculateAlreadyRealized` import 및 사용처가 있으면 **삭제**하고, 해당 기능이 필요하면 **getTotalSellProceeds** 등 명확한 함수로 교체.

### 6. export 및 테스트

- `getTotalSellProceeds` export.
- `calculateAlreadyRealized`를 참조하는 코드 전부 제거·교체 후 빌드/테스트 통과 확인.

---

## 적용 순서

1. **portfolioCalculations.ts**: `getTotalSellProceeds` 추가, `calculateAlreadyRealized` **삭제**.
2. **usePortfolios.ts**: `getTotalSellProceeds(portfolio)` 사용, totalReturn·result.alreadyRealized에 회수금 반영.
3. **SettlementModals.tsx**: "기 회수금" 표시를 `getTotalSellProceeds(portfolio)`로 변경.
4. **Dashboard.tsx**: 메트릭 effect에서 `calculateHoldings` 1회 호출 후 `totalRealizedPnL = holdings.reduce(...)` 로 실현손익 설정, `calculateAlreadyRealized` 제거.
5. **App.tsx** (및 기타): `calculateAlreadyRealized` import/사용 제거.
6. **검증**: 카드는 역산 실현손익, 정산·모달은 회수금 기준 동작 확인.

---

## 요약

- **카드 "실현손익"**: Dashboard에서 `holdings = calculateHoldings(portfolio)` 한 번만 호출 후 `totalRealizedPnL = holdings.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0)` 로 계산해 표시. **신규 유틸 함수 없음.**
- **기 회수금 / totalReturn**: `getTotalSellProceeds(portfolio)` 사용. **calculateAlreadyRealized는 삭제.**

이 계획대로 적용하면 이름 기만 없이, 이중 연산 없이, 카드는 역산 실현손익으로만 표시되고 정산·모달은 회수금으로 유지된다.
