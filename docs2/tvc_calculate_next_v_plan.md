# TVC `calculateNextV` 교체 1:1 배선 계획서

## 목표
기존 VR/TVC 수학 엔진의 `calculateNextV`를 아래 새 수식으로 교체하기 전에, 정밀도 방어와 함수 배선을 문서로 고정합니다.

- `CR = pool / V_current`
- 일반 구간: `CR > smartBrakeThresholdPct / 100`
- 안전 모드: `CR <= smartBrakeThresholdPct / 100`
- 일반 구간:
  - `V_next = V_current + (pool * (baseGrowthRatePct / 100)) + deltaCash`
- 안전 모드:
  - `V_next = V_current * (1 + (baseGrowthRatePct / 100) * (CR^2)) + deltaCash`

이번 단계는 **계획서 + 시뮬레이션 스니펫**만 작성합니다.  
프로덕션 함수 본체와 호출부는 아직 수정하지 않습니다.

## 현재 프로덕션 위치

### 1. 클라이언트/공용 수학 함수
기존 `calculateNextV` 본체는 `utils/vrBandStrategy.ts`에 있습니다.

```294:315:utils/vrBandStrategy.ts
/**
 * V_next = V_current + Pool / G ± |deltaCash|
 * 적립식: +deltaCash, 인출식: -|deltaCash|, 거치식: 0.
 */
export function calculateNextV(
  currentV: number,
  pool: number,
  params: VrBandStrategyParams
): number {
  ...
  const baseDelta = pool / params.G;
  const deltaCash = getVrDeltaCashForNextV(params);
  return toFixedMoney(currentV + baseDelta + deltaCash);
}
```

### 2. 서버 미러 함수
동일한 로직이 `supabase/functions/_shared/vrBandStrategy.ts`에도 복제되어 있습니다.

```294:315:supabase/functions/_shared/vrBandStrategy.ts
export function calculateNextV(
  currentV: number,
  pool: number,
  params: VrBandStrategyParams
): number {
  ...
  const baseDelta = pool / params.G;
  const deltaCash = getVrDeltaCashForNextV(params);
  return toFixedMoney(currentV + baseDelta + deltaCash);
}
```

### 3. 현재 호출부
사이클 리프레시 시 `buildRefreshedVrSnapshot`가 `calculateNextV(prev.currentV, prev.pool, params)`를 그대로 호출합니다.

```107:115:supabase/functions/_shared/vrSnapshotRefresh.ts
  const nextV = calculateNextV(prev.currentV, prev.pool, params);
  const { bandLow, bandHigh } = calculateBands(
    nextV,
    params.bandRateUpper,
    params.bandRateLower,
  );
```

즉, **호출 시그니처는 유지**하고 `calculateNextV` 내부 수식만 교체하면, 상위 호출 흐름은 그대로 재사용할 수 있습니다.

## 1:1 변수 매핑

| 새 수식 변수 | 현재 코드 원천 | 최종 적용 방식 |
|---|---|---|
| `V_current` | `calculateNextV(currentV, ...)` 첫 번째 인자 | 그대로 사용 |
| `pool` | `calculateNextV(..., pool, ...)` 두 번째 인자 | 그대로 사용 |
| `deltaCash` | `getVrDeltaCashForNextV(params)` | 기존 함수 재사용 |
| `baseGrowthRatePct` | `params.baseGrowthRatePct` | 내부에서 `/ 100` 후 소수 비율로 사용 |
| `smartBrakeThresholdPct` | `params.smartBrakeThresholdPct` | 내부에서 `/ 100` 후 소수 비율로 사용 |
| `CR` | `pool / currentV` | 비교 전 `roundRate`로 반올림 |

## 정밀도 방어 계획

### 1. 비교 전 정밀도 통일
`CR`과 `smartBrakeThresholdPct / 100`은 부동소수점 찌꺼기 때문에 경계 비교가 뒤집힐 수 있습니다.  
따라서 두 값 모두 동일한 스케일(`RATE_DECIMAL_SCALE`)로 `roundRate(...)` 처리한 뒤 비교합니다.

계획된 비교 순서:

1. `currentCRDecimal = roundRate(pool / currentV)`
2. `smartBrakeThresholdDecimal = roundRate(smartBrakeThresholdPct / 100)`
3. `isSafetyMode = currentCRDecimal <= smartBrakeThresholdDecimal`

### 2. 안전 모드의 `CR^2`
안전 모드에서는 `CR^2` 자체도 소수 오차를 만들 수 있으므로, 아래처럼 한 번 더 비율 단위로 반올림합니다.

1. `squaredCurrentCR = roundRate(currentCRDecimal * currentCRDecimal)`
2. `safetyGrowthRateDecimal = roundRate(baseGrowthRateDecimal * squaredCurrentCR)`

### 3. 최종 금액 반올림
`V_next`는 중간 계산이 아니라 **최종 결과만** `roundMoney(...)` 처리합니다.

- 일반 구간:
  - `roundMoney(currentV + pool * baseGrowthRateDecimal + deltaCash)`
- 안전 모드:
  - `roundMoney(currentV * (1 + safetyGrowthRateDecimal) + deltaCash)`

Why:

- 중간 금액을 먼저 반올림하면 일반 구간/안전 모드에서 누적 오차 규칙이 달라질 수 있습니다.
- 최종 산출값만 통화 반올림하면 기존 `roundMoney` 계약과도 가장 잘 맞습니다.

## 입력 검증 계획

### 1. `currentV`, `pool`, `deltaCash`
- `currentV`: `strictPositive`
- `pool`: `min: 0`
- `deltaCash`: 유한수만 허용, 부호는 별도 제한하지 않음

Why:

- 적립/인출/거치에 따른 부호 강제는 이미 프로덕션에서 `getVrDeltaCashForNextV(params)`가 담당합니다.
- 이번 수학 함수는 들어온 `deltaCash`를 그대로 더하는 순수 수학 계층으로 유지합니다.

### 2. 퍼센트 입력
`baseGrowthRatePct`, `smartBrakeThresholdPct`는 **정수 퍼센트 입력**으로 간주하고, 내부에서 반드시 `/ 100` 처리합니다.

시뮬레이션 스니펫에서는 `validateWithSharedFinancialArgs(...)`로 아래를 검증합니다.

- `integer: true`
- `baseGrowthRatePct`: 현재 repo SSOT인 `TVC_LIMITS.BASE_GROWTH_RATE` 범위 사용
- `smartBrakeThresholdPct`: 현재 repo SSOT인 `TVC_LIMITS.SMART_BRAKE_THRESHOLD` 범위 사용

주의:

- 사용자 요구의 핵심은 “정수 퍼센트 입력 후 내부에서 `/ 100` 처리”입니다.
- 실제 최대값은 현재 제품 SSOT를 따르므로, `baseGrowthRatePct`는 지금 기준 `1..20`, `smartBrakeThresholdPct`는 `1..99`입니다.

## 프로덕션 교체 계획

### A. 실제 교체 대상 함수
이후 실제 구현 단계에서 아래 두 함수의 본체를 **동일한 수식으로 동시에 교체**합니다.

- `utils/vrBandStrategy.ts::calculateNextV`
- `supabase/functions/_shared/vrBandStrategy.ts::calculateNextV`

### B. 시그니처 유지
함수 시그니처는 바꾸지 않습니다.

```ts
calculateNextV(currentV: number, pool: number, params: VrBandStrategyParams): number
```

Why:

- 현재 호출부(`buildRefreshedVrSnapshot`)를 건드리지 않아도 됩니다.
- UI, 스냅샷 생성, 주문표 생성 로직까지 연쇄 수정되는 오버코딩을 막을 수 있습니다.

### C. 내부 1:1 치환
기존 본체:

```ts
const baseDelta = pool / params.G;
const deltaCash = getVrDeltaCashForNextV(params);
return toFixedMoney(currentV + baseDelta + deltaCash);
```

교체 후 내부 구조:

```ts
const deltaCash = getVrDeltaCashForNextV(params);
const baseGrowthRateDecimal = roundRate(params.baseGrowthRatePct / 100);
const smartBrakeThresholdDecimal = roundRate(
  params.smartBrakeThresholdPct / 100,
);
const currentCRDecimal = roundRate(pool / currentV);

if (currentCRDecimal <= smartBrakeThresholdDecimal) {
  const squaredCurrentCR = roundRate(currentCRDecimal * currentCRDecimal);
  const safetyGrowthRateDecimal = roundRate(
    baseGrowthRateDecimal * squaredCurrentCR,
  );
  return roundMoney(
    currentV * (1 + safetyGrowthRateDecimal) + deltaCash,
  );
}

return roundMoney(currentV + pool * baseGrowthRateDecimal + deltaCash);
```

### D. `G` 파라미터 처리
새 `calculateNextV` 수식은 `params.G`를 직접 사용하지 않습니다.

이번 단계 계획:

- **`VrBandStrategyParams`에서 `G`를 제거하지 않습니다.**
- **`calculateNextV` 교체와 `G` 정리는 분리합니다.**

Why:

- 지금 `G`까지 제거하면 타입/폼/저장 스키마/주문표 관련 리뷰 범위가 커집니다.
- 이번 작업의 핵심은 `calculateNextV` 수학 엔진 교체 검증이며, YAGNI 원칙상 계약 축소는 별도 작업으로 분리하는 편이 안전합니다.

## 시뮬레이션 스니펫 계획 (`docs2/tvc_engine_simulation.ts`)

### 목표
프로덕션 `params` 유니온/스냅샷/DB를 배제하고, 순수 수학만 검증하는 전용 파일로 유지합니다.

### 포함할 것

- `calculateTvcNextVPreview(...)`
- `runTvcNextVSimulationExamples()`
- `roundRate(...)`
- 정수 퍼센트 검증용 얇은 변환 함수

### 포함하지 않을 것

- React UI
- 상태 관리
- Supabase 저장 로직
- 주문표 생성
- 밴드 계산
- 사이클 리프레시 루프

### 시뮬레이션 입력 형식
프로덕션은 `params`에서 `deltaCash`를 읽지만, 스니펫은 수학만 보므로 아래처럼 평탄한 입력을 사용합니다.

```ts
{
  currentV: number;
  pool: number;
  deltaCash: number;
  baseGrowthRatePct: number;
  smartBrakeThresholdPct: number;
}
```

이 매핑은 이후 실제 구현 시 아래처럼 연결됩니다.

```text
simulation.input.deltaCash
  <- production.getVrDeltaCashForNextV(params)

simulation.input.baseGrowthRatePct
  <- production.params.baseGrowthRatePct

simulation.input.smartBrakeThresholdPct
  <- production.params.smartBrakeThresholdPct
```

### Example 러너 검증값

#### 1. 일반 모드
- 입력:
  - `currentV = 1000`
  - `pool = 400`
  - `deltaCash = 50`
  - `baseGrowthRatePct = 10`
  - `smartBrakeThresholdPct = 20`
- 계산:
  - `CR = 0.4`
  - `0.4 > 0.2` → 일반 모드
  - `V_next = 1000 + (400 * 0.1) + 50 = 1090`

#### 2. 안전 모드
- 입력:
  - `currentV = 1000`
  - `pool = 200`
  - `deltaCash = 50`
  - `baseGrowthRatePct = 10`
  - `smartBrakeThresholdPct = 25`
- 계산:
  - `CR = 0.2`
  - `0.2 <= 0.25` → 안전 모드
  - `CR^2 = 0.04`
  - `V_next = 1000 * (1 + 0.1 * 0.04) + 50 = 1054`

`runTvcNextVSimulationExamples()`는 위 두 케이스가 기대값과 다르면 즉시 throw 하도록 구성합니다.

## 비범위

- `calculateBands` 교체
- `generateBuyOrders` / `generateSellOrders` 교체
- `VrBandStrategyForm` UI 변경
- `StrategyCreator` 상태 관리 변경
- Supabase 저장 payload 구조 변경
- `G` 제거

## 완료 판정 기준

- `docs2/tvc_engine_simulation.ts`가 새 수식 전용 순수 함수만 포함합니다.
- 일반 모드와 안전 모드 예제가 모두 기대값으로 self-check 됩니다.
- 프로덕션 교체 시 수정 대상 함수와 유지 대상 호출 시그니처가 문서에 1:1로 명시되어 있습니다.
