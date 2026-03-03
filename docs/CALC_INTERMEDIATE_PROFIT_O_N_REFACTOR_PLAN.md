# calcIntermediateProfit O(N²) → O(N) 리팩토링 계획

**출처**: REALIZED_PNL_REVISION_PLAN_V3.md §8 (기술 부채)  
**상태**: 구현 완료 (사전 정렬·부동소수점 클렌징 반영, 테스트 통과)

---

## 1. 문제

### 현재 알고리즘 (O(N²))

```
calcIntermediateProfit(trades, sinceDate):
  tradesUpTo   = trades.filter(t => t.date <= sinceDate)
  tradesAfter  = trades.filter(t => t.date > sinceDate && t.type === 'sell')

  tempTrades = [...tradesUpTo]
  for each sellTrade in tradesAfter:
    holdings = calcHoldings(tempTrades)   // ← 루프마다 O(N) 호출
    profit += (매도가 - 평단가) × 수량 - 수수료
    tempTrades.push(sellTrade)
  return profit
```

- `tradesAfter`가 K건이면 `calcHoldings`가 K번 호출됨.
- `calcHoldings`는 O(N). → **총 O(N × K) ≈ O(N²)**.
- 거래가 많을 때 클라이언트 버벅임 원인.

### 기존 로직의 결함 (Hidden State Change)

- 기존 로직은 sinceDate **이후** 거래 중 **매도(sell)만** 필터링하여 `tempTrades`에 넣고 계산함.
- 즉, sinceDate 이후에 발생한 **매수(buy)** 는 **완전히 무시**됨. 평단가는 sinceDate 시점에서 **고정**된 채로 이후 매도 수익만 계산됨.
- sinceDate 이후 유저가 **물타기(추가 매수)** 를 하면 평단가가 바뀌어야 하나, 기존 로직은 이를 반영하지 못함. **비즈니스 로직상 버그**로 간주함.
- 이번 리팩토링에서 **개선A**를 채택: "기존 로직이 sinceDate 이후 매수를 무시한 것 자체가 버그였다. 평단가가 정상 반영되도록 고치는 것이 맞다." 따라서 **새 O(N) 로직은 sinceDate 이후 매수까지 포함한 전체 거래 기준**으로 실현손익을 계산하며, sinceDate 이후 매수가 있는 경우 **기존 O(N²) 로직과 수치가 다르게 나올 수 있음**. 그 차이는 새 로직이 올바른 동작임.

---

## 2. 해결 방향: realizedPnL 차액 기반 O(N)

### 핵심 아이디어

`calcHoldings`가 이미 종목별 `realizedPnL`을 반환하므로:

- `calcHoldings(전체 trades)` → **전체 기간** 실현손익 합
- `calcHoldings(tradesUpTo)` → **sinceDate 이전까지** 실현손익 합
- **차액** = sinceDate **이후** 매도에서 발생한 실현손익

수식:

```
sinceDate 이후 실현손익
  = Σ(전체 거래 기준 종목별 realizedPnL)
  - Σ(sinceDate 이전 거래 기준 종목별 realizedPnL)
```

### 계산량

- `calcHoldings(trades)` 1회: O(N)
- `calcHoldings(tradesUpTo)` 1회: O(N)
- reduce 합산: O(종목 수) ≈ O(N) 상한
- **총 O(N)**.

---

## 3. 수정 방향 상세

### 3.1 새 구현 (의사코드) 및 필수 요건

**필수 1 — 사전 정렬(Sorting) 방어**: `calcHoldings`는 거래 순서에 민감하므로, 계산 전에 `trades`의 **복사본**을 아래 기준으로 정렬한 뒤 사용한다.
- 1차: `date` 오름차순 (과거 → 최신)
- 2차: `date`가 동일하면 `type === 'buy'`가 `type === 'sell'`보다 **앞**에 오도록 (공매도 에러 방지)

**필수 2 — 부동소수점 클렌징**: 차액 반환 직전 `Number((totalRealized - realizedUpTo).toFixed(2))` 적용.

```ts
const sorted = [...trades].sort((a, b) => {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  if (a.type === 'buy' && b.type === 'sell') return -1;
  if (a.type === 'sell' && b.type === 'buy') return 1;
  return 0;
});
const tradesUpTo = sorted.filter((t) => t.date <= sinceDate);
const holdingsFull = calcHoldings(sorted);
const holdingsUpTo = calcHoldings(tradesUpTo);
const totalRealized = holdingsFull.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);
const realizedUpTo = holdingsUpTo.reduce((sum, h) => sum + (h.realizedPnL ?? 0), 0);
return Number((totalRealized - realizedUpTo).toFixed(2));
```

### 3.2 정확성 및 기존 로직과의 차이

- `holdingsFull.realizedPnL`: **전체 거래**(sinceDate 이후 매수 포함)에 대한 종목별 실현손익.
- `holdingsUpTo.realizedPnL`: sinceDate 이전 거래만 포함한 종목별 실현손익.
- 차액 = sinceDate **이후**에 추가된 실현손익. 단, **이후 매수(물타기)가 있으면** 그 매수가 반영된 **변경된 평단가** 기준으로 계산됨.
- **"기존 for 루프와 결과가 동일하다"는 주장은 틀림.** sinceDate 이후 매수가 있으면 두 알고리즘은 서로 다른 금액을 반환함. 기존 로직은 이후 매수를 무시한 버그였으므로, **새 로직(평단가 정상 반영)이 올바른 동작**이다. 테스트 기대값은 새 로직 기준으로 조정할 수 있으며, sinceDate 이후 매수가 없는 기존 테스트 케이스는 수치가 그대로 유지될 수 있음.

---

## 4. 적용 단계

| 단계 | 내용 | 검증 |
|------|------|------|
| 1 | `multiSplitCalc.ts`의 `calcIntermediateProfit`를 위 O(N) 알고리즘으로 교체 | — |
| 2 | `multiSplitCalc.test.ts`의 `calcIntermediateProfit` describe 블록 실행 | **테스트가 깨질 수 있음**: sinceDate 이후 매수 포함 케이스는 기대값을 새 로직(평단가 정상 반영) 기준으로 수정. sinceDate 이후 매수 없는 기존 3케이스는 통과 가능성 높음 |
| 3 | `calcIntermediateProfit`를 사용하는 호출부 (있으면) 동작 확인 | sinceDate 이후 매수 없는 흐름은 기존과 동일; 이후 매수 있는 경우 새 수치(정상 반영) 적용됨 |

---

## 5. 테스트 전략

### 5.1 기존 테스트와의 호환

- `매도 거래 없음 → 0`, `이익 매도 → 양수` (99), `손실 매도 → 음수` (-101): **sinceDate 이후 매수가 없으므로** 새 로직과 기존 로직의 결과가 같아 **수정 없이 통과할 가능성이 높음**.
- **단, sinceDate 이후에 매수(buy)가 포함된 거래 시나리오**에서는 기존 로직(버그)과 새 로직(평단가 정상 반영)의 결과가 다름. 그런 케이스가 테스트에 있으면 **기대값을 새 로직 기준으로 수정**해야 하며, "기존과 동일"을 전제로 한 회귀 검증은 적용하지 않음.

### 5.2 추가 테스트 (선택)

- **다종목**: AAPL, MSFT 등 여러 종목 거래 후 sinceDate 이후 매도 → 기대값과 일치
- **동일일 매수·매도**: sinceDate 경계에 걸친 케이스
- **빈 trades**: `calcIntermediateProfit([], '2026-01-01')` → 0

---

## 6. 사용처 확인

| 위치 | 용도 |
|------|------|
| `multiSplitCalc.test.ts` | 테스트 |
| `docs/MULTI_SPLIT_CODE_REVIEW_AND_REFACTOR_PLAN.md` | 문서 참조 |

실제 비즈니스 로직 호출부는 별도 grep 검색 권장. 호출부가 있다면 리팩토링 후 회귀 테스트 수행.

---

## 7. 부동소수점 오차 방어 (Floating Point Accumulation)

### 비판

- 금융 도메인에서 "대충 오차가 있겠지만 넘어갑시다"는 마인드는 대형 사고의 씨앗이 됨.
- `calcHoldings`는 내부적으로 `.toFixed(2)`가 적용된(소수점이 잘려나간) 숫자를 반환함.
- 잘려나간 숫자들을 `reduce`로 모두 더하고, 또 다른 잘려나간 숫자들의 합을 빼면 (`totalRealized - realizedUpTo`) **오차는 최대 종목 수만큼 증폭**됨.

### 방어 조치

- "어쩔 수 없다"고 타협하지 않음.
- **최종 반환하기 직전** 다시 한 번 방어벽을 쳐서 디지털 먼지를 제거:
  - `return Number((totalRealized - realizedUpTo).toFixed(2));`
- 이 한 줄로 클렌징된 정수·소수 2자리 수가 반환됨.

---

## 8. 완료 기준

1. `calcIntermediateProfit` 구현이 O(N) 알고리즘으로 교체됨.
2. `npm test` (또는 해당 테스트 스크립트)에서 `calcIntermediateProfit` 관련 테스트 전부 통과. (sinceDate 이후 매수 포함 케이스는 기대값을 새 로직에 맞게 수정한 뒤 통과)
3. sinceDate 이후 매수 없는 경우 기존과 동일한 수치; sinceDate 이후 매수가 있는 경우 **새 로직(평단가 정상 반영)** 이 적용된 수치가 나옴을 확인.
