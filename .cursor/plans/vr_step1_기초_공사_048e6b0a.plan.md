---
name: VR Step1 기초 공사
overview: "[types.ts](types.ts), [constants/vrConstants.ts](constants/vrConstants.ts), [utils/vrBandStrategy.ts](utils/vrBandStrategy.ts)에 계획서 및 미션 요구를 반영하고, `roundPrice2` 제거·금융 멸균·누락된 SSOT 함수를 한 번에 맞춘 뒤 `tsc`/린트로 안정성을 확인한다."
todos:
  - id: types-cycle-portfolio-row
    content: "types.ts: VrBandStrategyBase.cycleWeeks, VrSnapshot.cycleIndex?, export PortfolioRow §2.1.4"
    status: completed
  - id: constants-legacy-empty
    content: "vrConstants.ts: LEGACY_FEE_RATE_PCT, EMPTY_VR_ORDERS (Zero-as 패턴), OrderLevel import"
    status: completed
  - id: vr-utils-core
    content: "vrBandStrategy.ts: sanitizeVrCycleWeeks, calculateCycleIndexFromDates 가드, formatCurrency, getVrCyclePeriodText, createInitialVrSnapshot"
    status: completed
  - id: vr-utils-orders
    content: "vrBandStrategy.ts: roundPrice2 제거, generateBuy/Sell toFixedMoney 멸균(§9.8.12), 선택적 calculateNextV/calculateBands/computeVrSnapshotAfterTrade"
    status: completed
  - id: strategy-creator-cycleweeks
    content: "StrategyCreator.tsx: vrParams에 cycleWeeks 반영 (타입 필수화 시 컴파일용)"
    status: completed
  - id: verify-tsc
    content: tsc --noEmit 및 수정 파일 린트로 안정성 확인
    status: completed
isProject: false
---

# VR Step 1: 타입·상수·vrBandStrategy 기초 공사

## 현재 상태 (로컬 팩트)


| 항목                                                   | 상태                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [types.ts](types.ts) `VrBandStrategyBase`            | `cycleWeeks` **없음**                                                                                                                                                                                                                            |
| [types.ts](types.ts) `VrSnapshot`                    | `cycleIndex` **없음** (계획서 §2.1.3)                                                                                                                                                                                                               |
| [types.ts](types.ts) `PortfolioRow`                  | **미정의** — Edge/정규화는 로컬에 각자 `interface` 중복                                                                                                                                                                                                      |
| [constants/vrConstants.ts](constants/vrConstants.ts) | `VR_CYCLE`, `DEFAULT_FEE_RATE`, `RATE_PRECISION_MULTIPLIER`, `TIME_MS` 있음 / `**LEGACY_FEE_RATE_PCT`, `EMPTY_VR_ORDERS` 없음**                                                                                                                    |
| [utils/vrBandStrategy.ts](utils/vrBandStrategy.ts)   | `toFixedMoney` 있음 / `**roundPrice2` 존재** (281–283행) 및 generateBuy/Sell에서 사용 / `**calculateCycleIndexFromDates`에 `cycleWeeks <= 0` 가드 없음** / `**sanitizeVrCycleWeeks`, `formatCurrency`, `createInitialVrSnapshot`, `getVrCyclePeriodText` 없음** |


참고 명세: [docs/VR_CYCLE_REFACTORING_PLAN.md](docs/VR_CYCLE_REFACTORING_PLAN.md) §2.1.3–2.1.4, §2.2, §2.5–2.6, §9.8.12(주문 루프 Dust).

---

## 정책 충돌: Zero `as` vs 계획서 `EMPTY_VR_ORDERS`

계획서 §2.2는 `Object.freeze([]) as unknown as OrderLevel[]`를 제시하지만, 미션 **Zero `as` Policy**와 정면 충돌한다.

**권장 (캐스팅 없음):** 빈 배열을 먼저 `OrderLevel[]`로 선언한 뒤 `Object.freeze`만 적용하고 export한다.

```ts
const emptyVrOrders: OrderLevel[] = [];
export const EMPTY_VR_ORDERS: readonly OrderLevel[] = Object.freeze(emptyVrOrders);
```

소비처가 `OrderLevel[]`만 받는다면 `ReadonlyArray` 호환성을 확인하거나, 동일 패턴으로 `as const` 없이 타입만 맞춘다.

---

## 1. [types.ts](types.ts)

1. `**VrBandStrategyBase**`: `cycleWeeks: number` 추가 → `VrBandAccumulate` / `Withdraw` / `LumpSum` 모두 필수 상속.
2. `**VrSnapshot**`: `cycleIndex?: number` 추가 (기존 스냅샷 호환).
3. `**PortfolioRow**`: 계획서 §2.1.4 스니펫대로 `export interface PortfolioRow extends Record<string, unknown> { ... }` 추가 (필드는 문서와 동일; `Strategy`·`Trade`·`VrSnapshot`·`AlarmConfig` 이미 동일 파일에 존재).

**파급:** [components/StrategyCreator.tsx](components/StrategyCreator.tsx)의 `vrParams` 객체에 `cycleWeeks`가 없으면 **즉시 타입 에러** → Step 1에서 `vrCycleWeeks` 상태를 `vrParams`에 넣거나, 최소한 `sanitizeVrCycleWeeks` 결과를 할당해 컴파일 통과시킨다. (미션이 “utils만”이 아니라면 동 파일 최소 수정이 필요함.)

---

## 2. [constants/vrConstants.ts](constants/vrConstants.ts)

- `import type { OrderLevel } from '../types'` 추가.
- `**LEGACY_FEE_RATE_PCT = 0.25`** 추가 (계획서: 루트 `Portfolio.feeRate` 퍼센트 폴백 전용).
- `**EMPTY_VR_ORDERS`**: 위 Zero-`as` 패턴으로 구현.
- 기존 `VR_CYCLE`, `DEFAULT_FEE_RATE`, `RATE_PRECISION_MULTIPLIER`는 유지; 값 중복 정의 금지.

---

## 3. [utils/vrBandStrategy.ts](utils/vrBandStrategy.ts)

### 3.1 `calculateCycleIndexFromDates`

- 함수 **최상단**에 Zero-tolerance: `if (cycleWeeks <= 0) return 0;` ([docs/VR_CYCLE_REFACTORING_PLAN.md](docs/VR_CYCLE_REFACTORING_PLAN.md) §9.8.5).
- 이후 `diffMs < 0` 가드 유지.

### 3.2 신규/이전 함수 (계획 §2.5–2.6)

- `**sanitizeVrCycleWeeks`**: `VR_CYCLE`만 참조 ([docs/VR_CYCLE_REFACTORING_PLAN.md](docs/VR_CYCLE_REFACTORING_PLAN.md) 748–757행 로직).
- `**formatCurrency`**: 계획 §2.6 시그니처 `number | null | undefined` — `toFixed`/로캘 규칙은 문서 스니펫 준수; **금액 표시만** 담당 (내부 금융 연산은 `toFixedMoney`).
- `**getVrCyclePeriodText`**: 계획 §2.5.2 전체 이전 — `AppLang`, `calculateCycleIndexFromDates`, `sanitizeVrCycleWeeks`, `TIME_MS` 의존; utils에서 UI 딕셔너리 import **금지**, `cycleFormat` 주입만.
- `**createInitialVrSnapshot`**: 계획 §2.6.3 — `calculateBands` + `generateBuyOrders` / `generateSellOrders` + `cycleIndex: 0` 반환. `VrSnapshot`에 `cycleIndex` 추가 후 타입 일치.

### 3.3 `roundPrice2` 제거 및 금융 멸균 (미션 + §9.8.12)

- `roundPrice2` 함수 삭제; 호출부를 `**toFixedMoney`**로 교체.
- `**generateBuyOrders` / `generateSellOrders`**: 계획서와 동일하게 최소한 다음을 `toFixedMoney`로 멸균:
  - 매수: `maxBuyBudget`, `orderCost`, `nextCumulativeCost`, `poolAfter` (및 push에 넣는 `price`는 이미 `toFixedMoney` 경유).
  - 매도: `proceeds`, 누적/잔액 관련 값.
- 기존 `**orderCost <= 0` / `proceeds <= 0` / `MAX_ORDER_STEPS` 가드 유지**.

### 3.4 기타 정합 (Step 1 범위 내에서 권장)

- `**calculateNextV` / `calculateBands` 반환**: 미션 “금융 연산은 toFixedMoney 경유”에 맞춰 결과를 `toFixedMoney`로 감싸는지 검토 (문서는 주문 루프를 강조; 일관성을 위해 여기서도 적용 가능).
- `**computeVrSnapshotAfterTrade`**: 매수 분기 `avgPrice` 등은 계획 §9.8.1 예시대로 `**toFixedMoney`** (현재는 나눗셈만 있음).

### 3.5 `!` / `as` 사용

- 미션 Zero `as`/`!`에 맞추어, 본 파일에서 **새 코드에 `as`/`!` 추가 금지**. 기존 코드에 `as`가 있다면 Step 1에서 건드리지 않거나, 같은 PR에서 제거 가능한 소규모만 정리 (범위 폭주 시 Step 2로 분리 명시).

---

## 4. 컴파일·안정성 확인

- `npx tsc --noEmit` (또는 프로젝트 표준 스크립트).
- `cycleWeeks` 추가로 깨지는 생성지점: **최소** [StrategyCreator.tsx](components/StrategyCreator.tsx) `vrParams`, 이후 Step에서 다룰 목/mock은 별도.

**Step 1에서 파일을 건드리지 않으면:** 타입만 바꿀 경우 StrategyCreator가 깨지므로, **“타입 + StrategyCreator 한 블록”**을 Step 1 필수 후속으로 명시하거나, 사용자 확인이 필요함.

---

## 5. 의사결정 (구현 전 확인 권장)

미션 문구는 types/constants/utils만 열거했으나, `**VrBandStrategyBase.cycleWeeks` 필수화는 모든 `VrBandStrategyParams` 리터럴에 영향**을 준다. 다음 중 하나를 선택해야 한다.

- **A (권장):** Step 1에 [StrategyCreator.tsx](components/StrategyCreator.tsx) VR 분기에서 `cycleWeeks: vrCycleWeeks`(또는 `sanitizeVrCycleWeeks(vrCycleWeeks)`)를 `vrParams`에 추가해 즉시 컴파일 녹색.
- **B:** `cycleWeeks`를 당분간 `VrBandStrategyBase`에서 optional로 두기 — **계획서 SSOT와 불일치**하므로 비권장.

---

## 작업 순서 제안

1. `types.ts` — `cycleWeeks`, `cycleIndex?`, `PortfolioRow`.
2. `vrConstants.ts` — `LEGACY_FEE_RATE_PCT`, `EMPTY_VR_ORDERS` (Zero-`as` 패턴).
3. `vrBandStrategy.ts` — 가드 → 신규 함수들 → `roundPrice2` 제거 및 주문 루프 멸균 → `createInitialVrSnapshot`.
4. (필수) `StrategyCreator.tsx` VR `vrParams`에 `cycleWeeks` 1줄.
5. `tsc` + 영향 파일 린트.

이후 Step 2에서 `portfolioNormalize`, 중복 `formatCurrency` 제거, Edge `PortfolioRow` 통합 등을 진행.