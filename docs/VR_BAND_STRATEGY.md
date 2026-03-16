## VR 밴드 전략 개요

이 문서는 TQQQ 장기 투자용 **VR 밴드 전략**을 정의하고, 서비스 내 구현 시 참고할 수 있는 스펙을 정리한 문서다.  
전략 설정 UI는 React + TypeScript, 주문/알람 계산은 Deno 기반 Supabase Edge Function(모두 TypeScript)에서 수행하며, 핵심 수식과 주문 계산은 공용 모듈로 분리하는 것을 전제로 한다.

---

## 1. 기본 개념 및 변수 정의

- **자산 대상**
  - 현재 기준: `TQQQ` 단일 종목 (향후 일반화 가능)

- **핵심 변수**
  - **V (Value)**  
    - 포트폴리오의 **가상의 목표 평가금(타겟 밸류)**.  
    - 실제 평가금이 따라가야 할 가이드 라인이며, **최소·최대 밴드**를 만드는 기준값이다.

  - **밴드폭 (비대칭 지원)**  
    - **상단 밴드폭 (`bandRateUpper`)**: 예: 0.15 → 상단은 V 대비 +15%.  
    - **하단 밴드폭 (`bandRateLower`)**: 예: 0.10 → 하단은 V 대비 -10%.  
    - 상/하단을 각각 다르게 설정 가능(예: 상단 +15%, 하단 -10%). 포트폴리오 생성 시 선택하며 이후 **고정**된다.

  - **최소·최대 밴드**
    - \(\text{bandLow} = V \times (1 - \text{bandRateLower})\)  
    - \(\text{bandHigh} = V \times (1 + \text{bandRateUpper})\)  
    - 실제 평가금이 이 구간을 벗어나면 **매수/매도 예약 주문**을 통해 다시 밴드 안으로 돌아오도록 설계한다.

  - **Pool**  
    - 수수료까지 반영한 뒤 남은 **현금**.  
    - 다음 사이클의 V 증가분과 매수 가능 여력을 동시에 결정한다.

  - **G (gradient)**  
    - \(\frac{Pool}{G}\) 의 분모로 들어가 **V 변화량의 기울기**를 조절한다.  
    - **G가 클수록** V 변동이 완만하여 보수적·안정적인 운용이 되고,  
      **G가 작을수록** V 변동이 가파른 공격적 운용이 된다.
    - 추천 기본값:
      - 적립식 VR / 거치식 VR: `G = 10`
      - 인출식 VR: `G = 20`

  - **`feeRate`**  
    - 전략 생성 시 설정하는 **거래 수수료율**.  
    - 모든 매매에서 `price × quantity × (1 + feeRate)` 형태로 수수료를 반영한다.

  - **전략 타입 (`vrMode`)**
    - `accumulate` (적립식 VR): 매 사이클마다 일정 금액을 추가 투입.
    - `lump_sum` (거치식 VR): 추가 투입/인출 없음.
    - `withdraw` (인출식 VR): 매 사이클마다 일정 금액을 인출.

---

## 2. 포트폴리오 생성 시 초기화

### 2.1 입력값

- `initialCapital`: 총 자본금 (USD)
- `initialV`: 최초 V 값 (가상의 목표 평가금)
- `bandRateUpper`: 상단 밴드폭 (예: 0.15)
- `bandRateLower`: 하단 밴드폭 (예: 0.10 또는 0.15로 대칭)
- `vrMode`: 적립식 / 거치식 / 인출식
- `G`: gradient (기본값은 모드별 추천값, 필요 시 사용자 수정 허용)
- `feeRate`: 수수료율 (예: 0.0005)
- `minOrderQty`: 최소 주문 단위(주 수) – 사용자 선택

### 2.2 초기 매수 및 Pool 설정

- 최초 V = `initialV`.
- 포트폴리오 생성 직후 **첫 매수는 “설정한 V 값 이내에서 최대한”** 수행한다.
  - 예: 현재 가격이 `p`, 수수료율이 `feeRate`라면 1주 매수에 필요한 금액은 `p * (1 + feeRate)` 이다.
  - `initialCapital` 중 **V를 넘지 않는 범위**에서 가능한 최대 수량을 매수한다.
- 첫 매수 체결 후:
  - `shares`: 현재 보유 주식 수.
  - `avgPrice`: 현재 평단.
  - `Pool`: 매수 및 수수료를 반영한 뒤 남은 현금.

이 이후 각 사이클에서 V 업데이트와 주문 생성 로직이 적용된다.

---

## 3. 사이클 및 V 업데이트 규칙

### 3.1 사이클 정의

- 기본 주기: **2주**마다 1회 (설정으로 조정 가능).
- 각 사이클 시작 시:
  - 직전 사이클 종료 시점의 `V_current`, `Pool`, `vrMode` 등을 사용해 **새 V**를 계산한다.
  - 이전 사이클의 **미체결 예약 주문은 모두 취소**하고, 새 V 기준으로 예약 주문표를 재생성한다.

### 3.2 전략 타입별 현금 흐름

- 적립식(`accumulate`): 매 사이클마다 일정 금액을 **추가 투입** (`deltaCash > 0`).
- 거치식(`lump_sum`): 추가 투입/인출 없음 (`deltaCash = 0`).
- 인출식(`withdraw`): 매 사이클마다 일정 금액을 **인출** (`deltaCash < 0`).

### 3.3 V 업데이트 공식

- \[
  V_{\text{next}} = V_{\text{current}} + \frac{Pool}{G} \pm |\text{deltaCash}|
  \]
- 적립식일 경우 `+ deltaCash`, 인출식일 경우 `- |deltaCash|` 를 적용한다.
- 새 V 기준으로 밴드를 다시 계산한다.
  - `bandLow = V_next * (1 - bandRateLower)`
  - `bandHigh = V_next * (1 + bandRateUpper)`

---

## 4. 밴드 기반 예약 주문 생성 공통 원칙

본 전략에서 사용하는 매수/매도는 **예약 주문**으로, 사용자가 원하는 방식(지정가 등)으로 실행해도 되며 특정 주문 유형에 종속되지 않는다.

### 4.1 목표

- **밴드 하단(매수)**  
  - 매수 예약 주문이 체결된 직후의 **순수 주식 평가금(보유 주식 평가금, Pool 제외)** 이
    - **밴드 하단 안쪽(또는 근처)** 로 들어오도록 주문 가격을 설계한다.

- **밴드 상단(매도)**  
  - 매도 예약 주문이 체결된 직후의 **순수 주식 평가금** 이
    - **밴드 상단 안쪽(또는 근처)** 로 들어오도록 주문 가격을 설계한다.

### 4.2 수수료 반영

- 매수:
  - 주문 1건당 Pool 감소액 = `price * qty * (1 + feeRate)`.
- 매도:
  - 주문 1건당 Pool 증가액 = `price * qty * (1 - feeRate)`.
  - 주문 가격 계산 시에는 **순수 주식 평가금이 밴드 값에 맞도록** 고려한다.

### 4.3 소수점 처리 및 주문 단위

- 모든 주문 가격은 **소수점 둘째 자리에서 반올림**하여 0.01 단위로 맞춘다.
- 모든 주문 수량은 `minOrderQty` 단위(1주, 2주 등)로 나간다.

---

## 5. 밴드 하단 기준 매수 주문 생성

### 5.1 입력 상태

- `shares`: 현재 보유 주식 수.
- `avgPrice`: 현재 보유 평단.
- `Pool`: 현재 현금.
- `bandLow`: 새 V 기준 밴드 하단 값.
- `minOrderQty`: 최소 주문 단위.
- `feeRate`: 수수료율.
- `poolUsageRateBuy`: 이번 사이클에서 매수에 사용할 Pool 비율 (예: 0.75, 0.5, 0.25).

### 5.2 Pool 사용 한도 및 버퍼 주문

- 매수에 사용할 수 있는 최대 예산:
  - `maxBuyBudget = Pool * poolUsageRateBuy`.
- 주문 생성 시:
  - 레벨을 `k = 1, 2, 3, ...` 순으로 늘려가며 주문 가격과 수량을 계산한다.
  - 각 레벨에 대해, **그 레벨까지의 누적 매수 비용(수수료 포함)** 을 계산한다.
  - 누적 매수 비용이 `maxBuyBudget` 이하인 레벨은 **실제 주문 레벨**로 사용한다.
  - 한도를 초과하는 순간:
    - 그 레벨부터 계속해 가격을 계산하되,
    - **추가로 2개 레벨까지만** “버퍼 주문 가격”을 표시한다.
    - 즉, Pool 매수 한도를 초과하지만, 앞으로 Pool 증가나 정책 변경 시 참고용으로 사용할 수 있는 가격 2개를 더 보여준다.

### 5.3 레벨별 매수 가격 개념

- 현재 보유 수량 `shares` 에서 시작해, 레벨 k에서
  - 체결 후 보유량: `sharesAfter = shares + k * minOrderQty`.
- 이상적인 목표는, 레벨 k까지 체결되었을 때의 **순수 주식 평가금(= sharesAfter × price_k)** 이 `bandLow` 에 가깝게 되는 가격 `price_k` 를 찾는 것이다.
- 직관적인 기본 형태는 다음과 같다.
  - \[
    \text{targetPrice}_k = \frac{\text{bandLow}}{\text{shares} + (k - 1) \times \text{minOrderQty}}
    \]
- 실제 구현에서는 위 식 그대로를 사용해 각 레벨의 주문 가격을 계산하고, `targetPrice_k` 를 소수점 둘째 자리에서 반올림한 값을 주문가로 사용한다.

### 5.4 Pool 고갈 시 처리

- Pool이 부족해 다음 레벨 주문 비용조차 감당할 수 없는 경우:
  - 그 이후 레벨은 생성하지 않는다.
  - 해당 사이클에서는 **추가 매수 없이 그대로 보유(존버)** 상태를 유지한다.

---

## 6. 밴드 상단 기준 매도 주문 생성

매도 주문 생성은 매수와 **대칭적인 구조**이며, 다음과 같은 차이점만 있다.

### 6.1 입력 상태

- `shares`, `avgPrice`, `Pool`, `bandHigh`, `minOrderQty`, `feeRate`.
- 필요 시 “최대 매도 비율” 같은 추가 설정으로 과도한 청산을 막을 수 있다.

### 6.2 레벨별 매도 가격 개념

- 레벨 k에서 매도 후 보유량:
  - `sharesAfter = shares - k * minOrderQty`.
- 목표는, 레벨 k까지 체결된 이후 **순수 주식 평가금(= sharesAfter × price_k)** 이 `bandHigh` 안쪽에 들어오도록 하는 가격 `price_k` 를 설정하는 것이다.
- 직관적인 기본 형태:
  - \[
    price_k = \frac{\text{bandHigh}}{\text{shares} - (k - 1) \times \text{minOrderQty}}
    \]
- 실제 구현에서는 위 식 그대로를 사용해 각 레벨의 매도 주문 가격을 계산하고, `price_k` 를 소수점 둘째 자리에서 반올림한 값을 주문가로 사용한다.

### 6.3 Pool 반영

- 매도 주문 1건 체결 시:
  - Pool 증가액 = `price * minOrderQty * (1 - feeRate)`.
- 예약 주문 체결이 진행될수록 Pool이 증가하며, 이 값은 다음 사이클의 V 업데이트와 차기 예약 주문표 생성에 사용된다.

---

## 7. 사이클 전환 및 주문 관리

### 7.1 사이클 중 체결 처리

- 시장 가격 변동에 따라, 미리 깔아 둔 매수/매도 예약 주문 일부가 체결될 수 있다.
- 예약 주문 체결 시마다:
  - `shares`, `avgPrice`, `Pool` 을 갱신한다.
  - 체결되지 않은 나머지 예약 주문은 여전히 유효하다.

### 7.2 새 사이클 시작 시

- 직전 상태를 기준으로:
  - `V_next = V_current + Pool / G ± deltaCash` 를 계산한다.
  - `bandLow`, `bandHigh` 를 갱신한다.
- 이전 사이클에서 남아 있던 **모든 미체결 예약 주문은 취소**한다.
- 새 밴드 기준으로 매수/매도 예약 주문표를 **처음부터 다시 생성**한다.

---

## 8. 구현 구조 가이드 (TypeScript)

- **전략 설정 UI (React + TypeScript)**
  - 예: `StrategyCreator.tsx` 내에서 `strategyType === 'vr_band'` 분기.
  - 관리해야 할 주요 상태:
    - `initialCapital`, `initialV`, `bandRateUpper`, `bandRateLower`, `vrMode`, `G`, `feeRate`, `minOrderQty`, 사이클당 `deltaCash`.

- **공용 계산 모듈 (클라/서버 공용, 순수 함수)**
  - 예: `utils/vrBandStrategy.ts` (실제 경로는 프로젝트 구조에 맞춰 조정).
  - 대표 함수 예시:
    - `calculateNextV(params): number`
    - `calculateBands(v, bandRateUpper, bandRateLower): { bandLow: number; bandHigh: number }`
    - `generateBuyOrders(params): OrderLevel[]`
    - `generateSellOrders(params): OrderLevel[]`
    - `simulateCycle(params): PortfolioState`

- **운영용 Edge Function (Deno + TypeScript)**
  - 예: `supabase/functions/generate-daily-execution-summaries/index.ts` 내에 VR 밴드 전략 분기 추가.
  - 역할:
    - 각 사이클 시작 시 포트폴리오 상태 로딩.
    - 공용 모듈의 계산 함수를 호출해 주문/알람 생성.
    - 체결 결과를 바탕으로 `shares`, `avgPrice`, `Pool`, `V` 갱신.

---

## 9. 기억용 요약

- **핵심 공식**  
  - \(V_{\text{next}} = V_{\text{current}} + \frac{Pool}{G} \pm (\text{적립/인출 금액})\)

- **밴드 (비대칭)**  
  - 하단: `V * (1 - bandRateLower)`  
  - 상단: `V * (1 + bandRateUpper)`

- **주문 가격**  
  - 주문 체결 후 **순수 주식 평가금이 밴드 안으로 들어오도록** 가격을 계산한다.
  - 밴드값 ÷ (체결 후 보유수량)을 기본 아이디어로 한다.

- **Pool 사용**  
  - 매수: Pool의 X%까지만 실제 주문을 생성하고, **추가로 2개 레벨에 대해 버퍼 가격을 표시**한다.
  - Pool 고갈 시: 해당 사이클에서는 추가 매수 없이 존버.

- **사이클**  
  - 2주(기본)마다 V 재계산 → 밴드 재설정 → 미체결 예약 주문 취소 → 새 예약 주문표 생성.

