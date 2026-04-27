---
name: TVC 사이클 전환 Pool 정산 계획
overview: 사이클 전환 시 V_next는 적립 전 pool로 계산하고, 그 뒤 nextPool을 별도로 정산해 스냅샷과 주문표까지 일관되게 갱신하는 1:1 배선 계획서입니다.
stage: simulation-only
status: draft
---

# TVC 사이클 전환 Pool 정산 계획

## 문서 목적
- `buildRefreshedVrSnapshot`의 현재 누락점은 **적립/인출(`Adjustment`)이 `V_next`에는 반영되지만 `pool`에는 반영되지 않는 것**입니다.
- 이번 단계에서는 프로덕션 코드를 바로 수정하지 않고, **배선 순서와 변수 책임**을 문서와 시뮬레이션으로 먼저 고정합니다.
- 핵심은 아래 한 줄입니다.
  - `V_next`의 성장률 판정용 `CR`은 반드시 `Pool_current`를 사용한다.
  - 그 다음에만 `Pool_next = Pool_current + Adjustment`를 계산한다.

## UI 제어 전략
- **엔진 유지:** `withdraw` 수학 로직은 엔진 내부에서 계속 지원하며, 사이클 정산·초과 인출 방어·주문표 배선 테스트를 통과해야 합니다.
- **표현 계층 필터링:** 전략 생성 폼(React)에서는 `withdraw` 옵션을 타입에서 제거하지 않고, 렌더링 옵션 목록에서만 데이터 주도 방식으로 제외합니다.
- **참조 동일성 유지:** UI 표시용 모드 목록은 렌더 함수 안에서 `MODES.filter(...)`를 매번 호출하지 않고, 모듈 스코프의 정적 상수(`VISIBLE_TVC_VR_MODES`)로 한 번만 계산해 하위 select/dropdown 컴포넌트의 불필요한 리렌더링을 방지합니다.
- **사유:** 서비스 출시 초기에는 거치식/적립식 중심으로 사용성 집중도를 높이고, 추후 연금형 인출 서비스 확장성을 위해 엔진 로직과 타입 다형성은 보존합니다.

```ts
// Why: React 렌더링 사이클에서 하위 컴포넌트의 불필요한 리렌더링(참조 변경)을 막기 위해
// 앱 로드 시 단 1회만 계산되어 고정된 메모리 주소를 갖는 상수로 노출합니다.
// Why: 인출 모드는 코어 엔진에서 지원되나(잔액 부족 방어 완료),
// UI단 잔액 부족 에러 핸들링 및 복구 기획 복잡도를 제거하여 빠른 MVP 출시(Time-to-Market)를 달성하기 위해 렌더링에서 제외함. (하위 호환성 위해 타입은 유지)
```
- 출시 전 전제에 따라 기존 포트폴리오 마이그레이션 이슈는 이번 계획 범위에서 제외합니다.
- 금지 사항:
  - `types.ts` 또는 shared 타입에서 `'withdraw'`를 삭제하지 않습니다.
  - `getVrDeltaCashForNextV` 또는 `calculateNextV`의 withdraw 경로를 제거하지 않습니다.
  - UI 필터링을 이유로 엔진 테스트에서 withdraw 케이스를 제거하지 않습니다.

## 현재 프로덕션 문제 요약

현재 `buildRefreshedVrSnapshot`는 다음 흐름으로 동작합니다.

1. `calculateNextV(prev.currentV, prev.pool, params)`로 `nextV` 계산
2. `prev.pool`로 주문표 재생성
3. `...prev` 복사 후 `currentV`, 밴드, 주문표, `cycleIndex`만 덮어씀

즉, `pool` 필드는 명시적으로 갱신되지 않습니다.

```101:141:supabase/functions/_shared/vrSnapshotRefresh.ts
export function buildRefreshedVrSnapshot(
  portfolio: Portfolio,
  targetCycleIndex: number,
): VrSnapshot | null {
  const params = portfolio.strategy.vrBand;
  const prev = portfolio.vrSnapshot;
  if (!params || !prev) return null;

  const nextV = calculateNextV(prev.currentV, prev.pool, params);
  const { bandLow, bandHigh } = calculateBands(
    nextV,
    params.bandRateUpper,
    params.bandRateLower,
  );

  const buyOrders = generateBuyOrders({
    shares: prev.shares,
    pool: prev.pool,
    bandLow,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
    poolUsageRateBuy: params.poolUsageRateBuy,
  });

  return {
    ...prev,
    currentV: nextV,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex: targetCycleIndex,
  };
}
```

### 왜 이 상태가 문제인가
- 적립식이면 다음 사이클 장부의 `pool`도 커져야 하는데, 현재는 이전 cycle의 `pool`이 그대로 남습니다.
- 더 큰 문제는 `pool`만 나중에 바꾸고 주문표는 계속 `prev.pool`로 만들면, **스냅샷 숫자와 주문표가 서로 다른 장부**가 됩니다.
- 따라서 이번 수정은 `pool` 필드 한 줄만 덮는 패치가 아니라, **정산 순서 전체를 맞추는 배선 수정**이어야 합니다.

## 고정할 비즈니스 순서

### 1. 상태 판정과 `V_next`
- 성장률 판정용 `CR`은 반드시 **적립/인출 전** 상태의 `Pool_current`를 사용합니다.
- 사이클 전환 함수는 `V_next` 수학 공식을 직접 재구현하지 않고, 기존 수학 엔진(`calculateNextV`, 시뮬레이션에서는 `calculateTvcNextVPreview`)에 위임합니다.
- 단, 초과 인출 여부는 수학 엔진 호출 전에 `nextPool = roundMoney(Pool_current + Adjustment)`로 먼저 선검증합니다.
- 수식:
  - 일반 구간: `V_next = V_current + (Pool_current * baseGrowthRateDecimal) + Adjustment`
  - 안전 모드: `V_next = V_current * (1 + baseGrowthRateDecimal * CR^2) + Adjustment`
- 여기서 `CR = Pool_current / V_current`

### 2. 현금 정산과 `Pool_next`
- `V_next` 계산이 끝난 뒤에만 `Pool_next`를 정산합니다.
- 수식:
  - `Pool_next = roundMoney(Pool_current + Adjustment)`
- 단, 정산 결과가 음수이면 스냅샷 생성을 중단해야 합니다.
  - `if (nextPool < 0) throw ...`
  - 음수 `pool`은 `generateBuyOrders`/`generateSellOrders`로 흘려보내지 않습니다.
  - 상위 계층이 `Adjustment` 부호를 정해오더라도, 이 함수는 **최종 장부 값의 건전성**을 다시 검증합니다.

### 3. 최종 스냅샷
- 최종 스냅샷에는 아래 값이 동시에 들어가야 합니다.
  - `currentV: nextV`
  - `pool: nextPool`
  - `bandLow`, `bandHigh`
  - `buyOrders`, `sellOrders`
  - `cycleIndex: previousCycleIndex + 1` 또는 scheduler가 계산한 `targetCycleIndex`

Why:
- 실제 프로덕션 함수는 scheduler가 넘긴 `targetCycleIndex`를 받지만, 시뮬레이션은 상태 변화가 보이도록 `previousCycleIndex + 1`을 사용합니다.
- 사이클 전환의 핵심은 단순 전달이 아니라 “이전 장부에서 다음 장부로 전진한다”는 상태 변화입니다.
- `previousCycleIndex`는 0 이상의 safe integer만 허용합니다. 소수 회차나 안전 정수 범위를 벗어난 값은 장부 도메인을 깨뜨리므로 시뮬레이션과 실제 구현 계획에서 모두 거부합니다.

## 1:1 변수 매핑

| 비즈니스 변수 | 현재 코드 원천 | 배선 원칙 |
|---|---|---|
| `V_current` | `prev.currentV` | 그대로 사용 |
| `Pool_current` | `prev.pool` | 성장률 판정과 `calculateNextV` 입력은 반드시 이 값 사용 |
| `Adjustment` | `getVrDeltaCashForNextV(params)` | 프로덕션에서는 기존 SSOT 재사용 |
| `V_next` | `calculateNextV(prev.currentV, prev.pool, params)` | 시그니처 유지, post-adjustment pool 금지 |
| `Pool_next` | `roundMoney(prev.pool + adjustment)` | 새로 추가되는 정산 값 |
| `bandLow`, `bandHigh` | `calculateBands(nextV, ...)` | 반드시 `prev.currentV`가 아니라 `nextV` 사용 |
| 주문표용 pool | 현재는 `prev.pool` | 수정 후에는 `nextPool` 사용 |
| `cycleIndex` | `targetCycleIndex` 또는 `previousCycleIndex + 1` | 프로덕션은 scheduler 값, 시뮬레이션은 +1 변화 검증 |

## 배선 변경 계획

### A. `buildRefreshedVrSnapshot` 내부 순서
실제 구현 단계에서는 아래 순서로만 계산합니다.

1. `const currentPool = prev.pool;`
2. `const adjustment = getVrDeltaCashForNextV(params);`
3. `const nextPool = roundMoney(currentPool + adjustment);`
4. `if (nextPool < 0) throw new Error(...)`
5. `const nextV = calculateNextV(prev.currentV, currentPool, params);`
6. `const { bandLow, bandHigh } = calculateBands(nextV, ...)`
7. `generateBuyOrders(... pool: nextPool ...)`
8. `generateSellOrders(... pool: nextPool ...)`
9. 반환 객체에서 `pool: nextPool`을 명시적으로 덮어씀

Why:
- 초과 인출이면 `calculateNextV`와 밴드/주문표 생성을 호출하지 않고 즉시 실패해야 합니다.
- 이 Fail-Fast 순서는 불필요한 수학 엔진 실행을 막고, 에러 원인을 “잔고 부족”으로 단순하게 고정합니다.
- `calculateNextV`는 선검증 이후에도 반드시 적립 전 `currentPool`을 받아 성장률 판정을 수행합니다.
- 이 순서가 바뀌면 초과 인출이 음수 장부로 저장되거나, 적립 후 현금이 `CR` 판정에 섞일 수 있습니다.
- 사이클 갱신 함수는 오케스트레이터이므로, `calculateNextV` 내부 수학을 복사하지 않습니다.

### B. 왜 `calculateNextV`에 `nextPool`을 넣으면 안 되는가
- `nextPool`은 적립/인출이 반영된 **사후 상태**입니다.
- 이 값을 `CR` 계산에 넣으면, 사용자가 이번 cycle 종료 시점에 넣은 현금이 **이미 성장률 판정에 선반영**됩니다.
- 결과적으로 일반 구간/안전 모드 분기 자체가 뒤집힐 수 있습니다.

예시:
- `V_current = 1000`
- `Pool_current = 200`
- `Adjustment = 100`
- `baseGrowthRatePct = 10`
- `smartBrakeThresholdPct = 25`

정상:
- `CR = 200 / 1000 = 0.20`
- `0.20 <= 0.25` 이므로 안전 모드
- `V_next = 1000 * (1 + 0.1 * 0.2^2) + 100 = 1104`
- `Pool_next = 300`

오류:
- `CR = 300 / 1000 = 0.30`
- `0.30 > 0.25` 이므로 일반 구간으로 오판
- `V_next = 1000 + 300 * 0.1 + 100 = 1130`

즉, `Adjustment`는 `V_next`의 마지막 합산 항과 `Pool_next` 정산에는 들어가되, **CR 계산 분모/분자에는 사후 반영되면 안 됩니다.**

### C. 주문표도 `nextPool`로 맞춰야 하는 이유
- 스냅샷 `pool`만 `nextPool`로 바꾸고 주문표는 `prev.pool`로 유지하면, 다음 cycle 카드의 현금과 주문표의 현금 기준이 달라집니다.
- 그러므로 `buyOrders`와 `sellOrders`는 둘 다 **정산된 `nextPool` 기준**으로 다시 생성해야 합니다.
- 이 수정은 단순 표시 보정이 아니라, **다음 cycle 장부의 내부 일관성 복구**입니다.

시뮬레이션에서는 실제 주문 생성 함수를 호출하지 않고, 아래 배선만 mock preview로 검증합니다.

- 밴드 계산은 반드시 `nextV`에서 출발해야 합니다.
- 매수 주문 preview는 반드시 `nextPool`과 `bandLow`를 받아야 합니다.
- 매도 주문 preview는 반드시 `nextPool`과 `bandHigh`를 받아야 합니다.

Why:
- `calculateBands`에 `prev.currentV`가 들어가는 실수와 `generateBuyOrders`에 `prev.pool`이 들어가는 실수를 시뮬레이션 단계에서 잡기 위함입니다.
- DB/실제 주문 생성까지 포함하면 시뮬레이션의 책임이 커지므로, pure mock preview로 배선만 검증합니다.

### D. 주문 생성 함수 방어 로직 확인
실제 구현에 들어가기 전, `generateBuyOrders`와 `generateSellOrders`의 현재 방어 로직을 먼저 리뷰해야 합니다.

현재 클라이언트/서버 미러 함수 모두 아래 방어를 갖고 있습니다.

- `pool`은 `validateFinancialArgs(... pool: { min: 0 })`로 음수 입력을 거부합니다.
- `generateBuyOrders`는 `pool <= 0`이면 빈 배열을 반환합니다.
- 매수/매도 루프는 `MAX_ORDER_STEPS`로 상한을 두고, `price <= 0`, `orderCost <= 0`, `proceeds <= 0`이면 즉시 중단합니다.
- `generateSellOrders`는 `shares <= 0`이면 빈 배열을 반환합니다.

로컬 확인 코드:

```532:554:utils/vrBandStrategy.ts
export function generateBuyOrders({
  shares,
  pool,
  bandLow,
  minOrderQty,
  feeRate,
  poolUsageRateBuy,
}: GenerateBuyOrdersParams): OrderLevel[] {
  validateFinancialArgs(
    { shares, pool, bandLow, minOrderQty, feeRate, poolUsageRateBuy },
    {
      shares: { min: 0 },
      pool: { min: 0 },
      bandLow: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: 0 },
      poolUsageRateBuy: { strictPositive: true },
    },
    'generateBuyOrders'
  );

  // Pool이 없으면 살 돈이 없으므로 빈 배열 반환
  if (pool <= 0) return [];
```

```611:631:utils/vrBandStrategy.ts
export function generateSellOrders({
  shares,
  pool,
  bandHigh,
  minOrderQty,
  feeRate,
}: GenerateSellOrdersParams): OrderLevel[] {
  validateFinancialArgs(
    { shares, pool, bandHigh, minOrderQty, feeRate },
    {
      shares: { min: 0 }, // 0주 보유 허용, 이후 로직에서 조용히 빈 배열 반환
      pool: { min: 0 },
      bandHigh: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: 0 },
    },
    'generateSellOrders'
  );

  // 0주이거나 최소 주문 수량이 유효하지 않으면 조용히 빈 배열 반환
  if (shares <= 0 || minOrderQty <= 0) return [];
```

구현 전 검토 결론:
- 음수 `nextPool`은 주문 생성 함수까지 보내면 안 됩니다.
- `nextPool === 0`은 허용 가능하며, 매수 주문은 빈 배열이 됩니다.
- 매도 주문은 `pool === 0`이어도 보유 수량이 있으면 생성될 수 있으므로, `pool: nextPool` 배선은 유지합니다.
- 테스트에는 최소한 `nextPool === 0`, `nextPool < 0`, 정상 적립, 정상 인출 케이스를 포함합니다.

## 기존 `...prev` 복사 방식의 수정 포인트

현재 반환 객체는 `...prev` 이후 `currentV` 등 일부 필드만 덮습니다.  
실제 구현 단계에서는 아래처럼 `pool`도 명시적으로 덮어써야 합니다.

```ts
return {
  ...prev,
  currentV: nextV,
  pool: nextPool,
  bandLow,
  bandHigh,
  buyOrders,
  sellOrders,
  cycleIndex: targetCycleIndex,
};
```

Why:
- `...prev` 복사에 의존하면 이전 cycle의 `pool`이 그대로 남습니다.
- 이번 작업의 본질은 바로 그 누락을 제거하는 것입니다.

## 프로덕션 수정 범위

### 직접 수정 대상
- `supabase/functions/_shared/vrSnapshotRefresh.ts`

### 간접 영향 확인 대상
- `utils/vrSnapshotRefresh.test.ts`
  - 누적 적립/인출이 `nextV`와 `nextPool`에 동시에 반영되는지 검증 필요
  - 거치식(`lump_sum`)에서 `Adjustment = 0`일 때 `pool`이 유지되고 cycle만 전진하는지 검증 필요
  - 초과 인출 시 음수 `pool` 스냅샷을 만들지 않고 실패하는지 검증 필요
  - `nextPool === 0`일 때 매수 주문은 빈 배열, 매도 주문은 보유 수량 기준으로 안전하게 생성되는지 검증 필요
- `VrPortfolioSummary`, `formatPortfolioDailyExecutionBlock`
  - 표시 자체는 스냅샷 읽기만 하므로 로직 수정은 거의 없지만, **스냅샷 값이 달라졌는지**만 확인하면 됩니다.

## 시뮬레이션 스니펫 배치 계획

새 파일 `docs2/tvc_cycle_refresh_simulation.ts`에는 아래만 둡니다.

- `buildRefreshedTvcSnapshotPreview(...)`
- `runCycleRefreshSimulation()`
- `VISIBLE_TVC_VR_MODES`
- 얇은 assertion helper
- `assertPreviewState(...)` 통합 검증 helper
- `roundMoney()`를 사용하는 최소한의 반올림 방어
- 초과 인출 방어 케이스
- 거치식(`lump_sum`)의 `Adjustment = 0` 방어 케이스
- `calculateTvcNextVPreview(...)` 호출을 통한 수학 엔진 재사용
- `bandLow`/`bandHigh` mock preview
- `buyOrderPreview`/`sellOrderPreview` mock preview
- `previousCycleIndex + 1` 검증
- `withdraw`를 UI 옵션 목록에서 제외하지만 엔진 시뮬레이션에는 유지하는 케이스
- `previousCycleIndex`의 0 이상 safe integer 검증

추가 코딩 원칙:
- 반복 assertion은 `assertPreviewState(...)`로 모아, 새 필드가 추가될 때 테스트 케이스별 복사-붙여넣기를 줄입니다.
- `buildMockBuyOrderPreview`의 `isGenerated`는 `maxBuyBudget >= minimumOrderCost`만 사용합니다. `minimumOrderCost > 0`이 보장되므로 이 조건이 참이면 `nextPool > 0`도 수학적으로 보장됩니다.

포함하지 않을 것:
- React UI
- DB 저장
- Supabase 호출
- 실제 주문 생성 로직(`generateBuyOrders`, `generateSellOrders`)
- `calculateNextV` 수학 공식 복사본
- `types.ts`에서 `'withdraw'`를 제거하는 타입 축소

## Mental Compile 체크리스트

- `withdraw`가 타입/엔진 모드 목록에는 남아 있는가?
- UI 표시용 모드 목록에서만 `withdraw`가 데이터 주도 방식으로 제외되는가?
- UI 표시용 모드 목록이 렌더마다 새 배열을 만들지 않고 모듈 스코프 정적 상수로 고정되는가?
- withdraw 엔진 검증 케이스가 시뮬레이션에 남아 있는가?
- lump_sum 엔진 검증 케이스가 `Adjustment = 0`으로 시뮬레이션에 남아 있는가?
- `previousCycleIndex`가 0 이상 safe integer로 검증되는가?
- 반복 assertion이 `assertPreviewState(...)`로 모여 있는가?
- 매수 preview의 `isGenerated` 조건에서 중복된 `nextPool > 0` 체크가 제거되었는가?
- 초과 인출 검사가 `calculateTvcNextVPreview` 또는 `calculateNextV` 호출보다 먼저 실행되는가?
- `nextV` 계산에 들어가는 pool은 끝까지 `currentPool`인가?
- 사이클 리프레시 스니펫이 `calculateTvcNextVPreview`를 호출하고, 수학 공식을 복사하지 않는가?
- `nextPool`은 `roundMoney(currentPool + adjustment)`로 별도 정산되는가?
- `nextPool < 0`이면 스냅샷/주문표 생성 전 실패하는가?
- 밴드 preview가 `previousV`가 아니라 `nextV`에서 계산되는가?
- 주문 preview가 `previousPool`이 아니라 `nextPool`을 받는가?
- 반환 스냅샷이 `pool: nextPool`을 명시적으로 덮는가?
- 주문표 생성도 `nextPool`로 재정렬되는가?
- 시뮬레이션이 "post-adjustment pool을 CR에 넣으면 값이 달라진다"는 회귀 케이스를 포함하는가?
- 구현 전 `generateBuyOrders`/`generateSellOrders` 방어 로직을 코드로 제시하고 테스트 계획에 반영했는가?
- 시뮬레이션의 `cycleIndex`가 입력값 단순 복사가 아니라 `previousCycleIndex + 1` 상태 변화를 보여주는가?

위 항목들이 동시에 만족되어야 이번 수정은 부분 패치가 아니라 **장부 일관성 복구**가 됩니다.
