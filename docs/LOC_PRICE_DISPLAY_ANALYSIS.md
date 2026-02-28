# 일별 매매 실행 내역 – LOC 매수/매도 가격 미표시 원인 분석

**현상**: 다분할 매매법 전략으로 TQQQ 1주 매수 후, 일별 매매 실행에서  
- LOC 매수1 · LOC 매수2 → "계산 중..."  
- LOC 매도 → "보유 없음"  
- 지정가 매도 → $66.17 / 1 (정상 표시)

---

## 1. 표시 로직 요약

- **데이터 소스**: `useMultiSplitExecution` 훅 → `calcMultiSplitOrders()` (utils/multiSplitCalc.ts)
- **UI**: Dashboard.tsx에서 `multiSplitExecutionData.locBuy1` / `locBuy2` / `locSell` / `limitSell`이 **있으면** 가격/수량 표시, **없으면**  
  - LOC 매수 → "계산 중..."  
  - LOC 매도 · 지정가 매도 → "보유 없음"

즉, LOC 매수/매도에 “가격이 안 뜬다”는 것은 **해당 필드가 `undefined`로 내려와서** fallback 문구가 나오는 상태다.

---

## 2. 예상 원인

### 2-1. LOC 매수1 · LOC 매수2가 "계산 중..."인 경우

**원인**: `calcMultiSplitOrders()` 안에서 `safeOrder(price, qty)`가 **수량 0**이라 **null**을 반환하고, 그 결과 `locBuy1` / `locBuy2`가 `undefined`로 남는 경우.

- **safeOrder** (multiSplitCalc.ts):  
  `Math.floor(qty) <= 0` 이면 `null` 반환 → UI에서는 "계산 중..."으로 표시.

**수량이 0으로 나오는 조건**:

| 항목 | 설명 |
|------|------|
| **1회 매수금(dailyBuyAmount)** | 전반전에서는 `half = oneTimeAmount * 0.5`로 0.5회분 금액 사용. 이 금액으로 살 수 있는 **정수 주 수**가 0이면 LOC 매수 수량 0. |
| **계산식** | `locBuy1Qty = half / (basePrice * (1 + feeRate/100))` → `Math.floor(locBuy1Qty) === 0` 이면 표시 안 됨. |

**TQQQ 1주만 매수한 경우**:

- 보통 주가가 $60~70 구간이면, **1회 매수금이 1주 가격보다 작거나 비슷**한 설정이면  
  - half = (1회 매수금) × 0.5  
  - 0.5회분 금액으로는 1주도 못 사는 경우가 됨 → `locBuy1Qty`, `locBuy2Qty` < 1 → floor 0 → **LOC 매수1/2 모두 undefined** → "계산 중...".

**정리**:  
- **1회 매수금이 너무 작아서** 0.5회분(또는 1회분)으로 산 “정수 주 수”가 0이 되면, LOC 매수 가격/수량이 아예 계산 결과에서 빠지고, UI에는 "계산 중..."만 보인다.

---

### 2-2. LOC 매도가 "보유 없음"인 경우

**원인**: 보유 수량이 **1주**일 때, LOC 매도 비율 25% 적용 결과 수량이 0이 되는 **설계된 동작**에 해당.

- **calcSellSplitQuantities** (multiSplitCalc.ts):  
  `locSellQty = Math.floor(totalQty * LOC_SELL_RATIO)`  
  `LOC_SELL_RATIO = 0.25`
- 보유 1주 → `locSellQty = Math.floor(0.25) = 0`  
  → `safeOrder(locSellBasePrice, 0)` → **null**  
  → `locSell` 없음 → UI "보유 없음".

즉, **가격이 안 보이는 게 아니라**, “LOC 매도할 수량이 0”이라 항목 자체가 결과에서 제거되고, 그에 대한 fallback으로 "보유 없음"이 뜨는 것이다.  
지정가 매도는 `limitSellQty = 1 - 0 = 1`이라 1주로 정상 표시됨.

---

### 2-3. multiSplitExecutionData 자체가 null인 경우 (LOC 전부 안 나올 수 있음)

다음이면 `calcMultiSplitOrders`가 호출되지 않거나, 호출되더라도 **빈 결과**만 반환해 `multiSplitExecutionData`가 null/빈 객체가 될 수 있음.

- **useMultiSplitExecution** (hooks/useMultiSplitExecution.ts):  
  - `basePrice <= 0` 이면 `nextExecution`을 계산하지 않음.  
  - `basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0)`  
    → 평단가·현재가를 모두 못 쓰면 basePrice=0.
- **calcMultiSplitOrders** (multiSplitCalc.ts):  
  - `A <= 0 || a <= 0 || T <= 0 || basePrice <= 0` 이면 `return { phase }`만 반환  
  → locBuy1/locBuy2/locSell/limitSell 없음.

현재는 “지정가 매도 $66.17/1”이 보이므로, **실행 데이터는 존재하고**, 위 조건으로 인해 **전체가 null**인 상황은 아니다.  
다만, 다른 전략/설정에서는 **T=0, 1회 매수금 0, basePrice 0** 등으로 인해 데이터가 비어 LOC가 전혀 안 나올 수 있다.

---

## 3. 요약 표

| 표시 | 원인 |
|------|------|
| LOC 매수1 · LOC 매수2 "계산 중..." | 0.5회분(또는 1회분) 금액으로 산 **정수 주 수가 0** → `safeOrder`가 null 반환 → 필드 없음 → fallback "계산 중...". **1회 매수금이 1주 가격보다 작거나 비슷할 때** 자주 발생. |
| LOC 매도 "보유 없음" | 보유 수량 1주일 때 25% = 0.25주 → **floor 0** → LOC 매도 수량 0 → 필드 없음 → "보유 없음". 설계상 그렇게 동작하는 상태. |
| 지정가 매도만 정상 표시 | 잔량 100%가 지정가 매도로 가므로 1주 → 수량 1로 계산되어 정상 표시. |

---

## 4. 다음 확인 사항 (검증용)

1. **전략 설정의 1회 매수금(dailyBuyAmount)**  
   - TQQQ 1주 가격(예: 약 $66)보다 작게 되어 있지 않은지 확인.
2. **보유 수량이 1~3주처럼 적을 때**  
   - LOC 매도 25%가 floor 0이 되는 것은 현재 로직의 결과이므로, “소량 보유 시 LOC 매도는 비표시”가 기획과 맞는지 검토.
3. **LOC 매수도 “가격이라도” 보여줄지**  
   - 수량이 0이어도 **가격만** 표시하는 식으로 UI/계산 결과를 바꿀지 여부는 기획 결정이 필요.

이 문서는 **예상 원인 분석**이며, 실제 환경에서 1회 매수금·보유 수량·basePrice를 로그로 확인하면 위 추론를 그대로 검증할 수 있다.

---

## 5. 1회 매수금 $100인데 LOC 매수 가격이 안 뜨는 경우

**상황**: 1회 매수 금액이 $100으로 설정되어 있어 1회 매수 비용 부족이 아닌데도, 일별 매매 실행 내역에 LOC 매수 **가격**이 표시되지 않음 (또는 수량만 0으로 보임).

### 5-1. 예상 원인 요약

| 원인 | 설명 |
|------|------|
| **전반전은 0.5회분으로 계산** | 전반전에서 LOC 매수1·LOC 매수2는 **각각 0.5회분 금액**으로 수량을 계산함. 즉 1회 매수금 $100이어도 **half = $50**만 사용. |
| **수량 0 → (수정 전) 가격 미표시** | `locBuy1Qty = half / (basePrice × (1 + 수수료))` 에서 주가가 $50 초과면 50/주가 < 1 → `Math.floor` = 0. 수량 0이면 **수정 전 코드**에서는 `safeOrder`가 null을 반환해 **locBuy1/locBuy2 항목 자체가 없었고**, UI에는 "계산 중..."만 표시되어 **가격이 안 보였음**. |
| **수정 후** | `orderEntryForDisplay`로 수량 0이어도 가격은 반환하므로, **가격은 표시되고 수량만 0** (예: $55.14 / 0)으로 나와야 함. |

즉, **“1회 매수금이 부족하지 않다”($100)와 “LOC 매수 수량이 1주 이상 나온다”는 별개**이다.  
전반전에서는 **반쪽 금액($50)**으로 1주를 살 수 있을 때만 수량이 1 이상이 되고, 주가가 $50보다 크면 수량 0이 되는 것이 **현재 로직의 결과**이다.

### 5-2. 수정 후에도 가격이 아예 안 뜨는 경우

다음이면 `orderEntryForDisplay`까지 가더라도 **가격이 유효하지 않아** null이 반환될 수 있음.

- **basePrice = 0**  
  - `basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0)`  
  - 평단가(avgPrice)가 0이고, 현재가(currentPrice) 조회도 실패/0이면 basePrice가 0.
- **원인 후보**  
  - 보유 종목이 전략의 `targetStock`과 다르게 저장되어 `holdings.find(targetStock)`이 없고, `holdings[0]`이 다른 종목이거나 없음.  
  - 주가 API 실패·타임아웃으로 currentPrice가 0.  
  - `calcMultiSplitOrders`가 호출되지 않음: `multiSplitPhase`가 `'first'`/`'second'`가 아니거나, `basePrice <= 0`으로 위에서 `nextExecution`을 안 만드는 경우.

### 5-3. 검증 시 확인할 값

1. **전략의 1회 매수금**  
   - `portfolio.dailyBuyAmount`가 100으로 설정되어 있는지.
2. **전반전 수량 계산**  
   - `half = 50`, `locBuy1Qty = 50 / (basePrice × 1.0025)` → basePrice ≈ 55일 때 약 0.9 → floor 0. **수량 0은 정상 동작**.
3. **가격이 안 나올 때**  
   - `basePrice`가 0이 아닌지, `multiSplitPhase === 'first'`(또는 `'second'`)인지, 최신 빌드(수정 후 `orderEntryForDisplay` 적용)인지 확인.
