# TVC 변수 2개 추가 계획

## 목적
이번 문서는 **TVC 전용 폼에 변수 2개를 추가하고 UI를 바꾸는 1단계 계획서**입니다.

추가 대상:
1. `smartBrakeThresholdPct`
2. `baseGrowthRatePct`

이번 단계는 **입력/타입/드래프트/저장 wiring까지만** 다룹니다.  
실제 refresh 엔진, 스냅샷 재계산, 서버 배치 로직 변경은 **이번 문서 범위에서 제외**합니다.

## 범위

### 포함
- 타입에 새 필드 2개 추가
- TVC 드래프트에 새 필드 2개 추가
- 컨트롤러 기본값/핸들러 추가
- 폼 라벨과 입력칸 추가
- 기존 `G` 입력 UI 숨김 또는 교체
- 저장 시 `strategy.vrBand` JSON 내부에 새 필드 포함
- 레거시 row read 시 기본값 fallback

### 제외
- `calculateNextV()` 수식 변경
- `vrSnapshotRefresh` 변경
- 주문표 생성 로직 변경
- trade 체결 후 snapshot mutation 변경
- `currentV`, `pool`, `vrSnapshot` 같은 런타임 이름 변경

## 최소 변경 원칙
- 새 변수 2개는 **`strategy.vrBand` 내부 필드**로만 추가합니다.
- SQL migration은 하지 않습니다.
  - Why: 현재 write path는 `strategy` JSON 전체 저장 구조라 nested field 2개 추가가 가장 작습니다.
- 기존 `G`는 **타입/저장 구조에서는 유지**하고, UI에서만 숨깁니다.
  - Why: 바로 삭제하면 read path, normalize, 기존 저장 row와 충돌 범위가 커집니다.
- 숨겨진 `G`는 **UI 미입력 상태에서도 값이 절대 비지 않도록** 기본값을 하드 주입합니다.
  - `EMPTY_VR_BAND_DRAFT` 기본값
  - `buildVrBandStrategy()` 조립 경계의 fallback
- 새 abstraction이나 별도 form schema는 만들지 않습니다.
  - Why: 현재 `DraftNumberInput + controller handler` 패턴만 재사용하는 것이 가장 단순합니다.

## 수정 파일 목록

| 단계 | 파일 | 변경 내용 |
|---|---|---|
| Types | `types.ts` | `VrBandStrategyBase`에 `baseGrowthRatePct`, `smartBrakeThresholdPct` 추가 |
| Shared Types | `supabase/functions/_shared/types.ts` | Edge 경로도 같은 shape를 읽도록 동일 필드 추가 |
| Defaults | `constants/domain/financeRules.ts` | `STRATEGY_DEFAULTS.VR_G_VALUE`, `STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT`, `STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT` 추가 |
| Limits | `constants/vrConstants.ts` | `TVC_LIMITS.BASE_GROWTH_RATE`, `TVC_LIMITS.SMART_BRAKE_THRESHOLD` 추가 |
| Draft | `src/components/StrategyCreator/utils.ts` | `VrBandWizardDraftInput`에 2개 필드 추가, `buildVrBandStrategy()`에서 `strategy.vrBand`로 전달 |
| Controller default | `components/strategyCreator/useStrategyCreatorController.tsx` | `EMPTY_VR_BAND_DRAFT`에 새 필드 기본값 추가 + 숨겨진 `G` 기본값 유지 |
| Controller handler | `components/strategyCreator/useStrategyCreatorController.tsx` | `handleVrBaseGrowthRatePctChange`, `handleVrSmartBrakeThresholdPctChange` 추가. 정수 전용 입력을 전제로 `safeNumber()` + clamp + toast 피드백 적용 |
| Controller submit guard | `components/strategyCreator/useStrategyCreatorController.tsx` | submit 직전 범위 검증 추가 |
| UI labels | `constants/vrMessages.ts` | `VR_CREATOR_LABELS.baseGrowthRatePct`, `VR_CREATOR_LABELS.smartBrakeThresholdPct`, `VR_TVC_VALIDATION_MESSAGES.outOfRangeToast` 추가 |
| UI form | `components/strategies/VrBandStrategyForm.tsx` | `G` 입력칸 교체 + 새 입력칸 추가 + 정수 입력 유도(`allowDecimal={false}`) |
| Prop wiring | `components/strategyCreator/StrategyCreator.tsx` | `vrBaseGrowthRatePct`, `onVrBaseGrowthRatePctChange`, `vrSmartBrakeThresholdPct`, `onVrSmartBrakeThresholdPctChange`를 `VrBandStrategyForm`으로 전달 |
| Read normalize | `utils/portfolioNormalize.ts` | 기존 row에 새 필드가 없으면 기본값으로 보정 |

## 타입 추가안

### `types.ts`
```ts
export interface VrBandStrategyBase {
  initialV: number;
  initialCapital: number;
  bandRateUpper: number;
  bandRateLower: number;
  feeRate: number;
  G: number; // legacy 유지
  minOrderQty: number;
  poolUsageRateBuy: number;
  cycleWeeks: number;
  baseGrowthRatePct: number;
  smartBrakeThresholdPct: number;
}
```

### `src/components/StrategyCreator/utils.ts`
```ts
export interface VrBandWizardDraftInput {
  vrMode?: VrBandStrategyParams['vrMode'];
  initialCapital?: number;
  initialV?: number;
  minOrderQty?: number;
  bandUpperPct?: number;
  bandLowerPct?: number;
  g?: number;
  poolUsagePct?: number;
  deltaCash?: number;
  cycleWeeks?: number;
  baseGrowthRatePct?: number;
  smartBrakeThresholdPct?: number;
}
```

### `constants/domain/financeRules.ts`
```ts
export const STRATEGY_DEFAULTS = {
  // ...existing defaults
  VR_G_VALUE: 10,
  VR_BASE_GROWTH_RATE_PERCENT: 10,
  VR_SMART_BRAKE_THRESHOLD_PERCENT: 50,
} as const;
```

### `constants/vrConstants.ts`
```ts
export const TVC_LIMITS = {
  BASE_GROWTH_RATE: {
    MIN: 1,
    MAX: 20,
  },
  SMART_BRAKE_THRESHOLD: {
    MIN: 1,
    MAX: 99,
  },
} as const;
```

## UI 변경 계획

### 현재 입력 구성
```text
초기 투자 원금 | 초기 T 값
상단 밴드 폭   | 하단 밴드 폭
최소 주문 수량 | G
예수금 사용 비율
```

### 변경 후 구성
```text
초기 투자 원금           | 초기 T 값
상단 밴드 폭             | 하단 밴드 폭
최소 주문 수량           | 기본 목표 성장률 (%)
매수 시 예수금 사용 비율 | 스마트 브레이크 임계치 (%)
```

### 구체적인 교체 방식
- `VrBandStrategyForm.tsx`의 기존 `vr-g` 입력 블록을 **삭제하지 말고 교체**
  - `label`: `기본 목표 성장률 (%)`
  - `value`: `vrBaseGrowthRatePct`
  - `onCommit`: `onVrBaseGrowthRatePctChange`
  - 입력 컴포넌트: 기존 `DraftNumberInput` 그대로 사용
  - `allowDecimal={false}`로 **정수만 입력 가능**하도록 고정
- `smartBrakeThresholdPct`는 `poolUsagePct`와 같은 패턴으로 새 블록 추가
- 새 문자열과 범위 이탈 toast는 JSX 하드코드가 아니라 `constants/vrMessages.ts`에 두고, toast는 `VR_TVC_VALIDATION_MESSAGES`로 고정합니다
- 현재 `DraftNumberInput`는 `type="text"` 기반이라 `step="1"` 속성은 실효가 없습니다.
  - 따라서 TVC 두 필드는 `allowDecimal={false}`로 소수점 문자 자체를 입력 단계에서 차단합니다.
- `DraftNumberInput`는 **포커스 중 로컬 draft 문자열을 유지하고, blur 시점에만 `onCommit(rawValue: string)`를 호출**합니다.
  - 따라서 새 TVC 필드도 기존 숫자 필드와 동일하게 **문자열 commit 계약**을 유지합니다.

## 기본값 / 범위

권장 기본값:
- `baseGrowthRatePct`: `STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT`
- `smartBrakeThresholdPct`: `STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT`
- `G`: `STRATEGY_DEFAULTS.VR_G_VALUE` (숨김 유지용 legacy default)

권장 범위:
- `baseGrowthRatePct`: `TVC_LIMITS.BASE_GROWTH_RATE.MIN ~ TVC_LIMITS.BASE_GROWTH_RATE.MAX`
- `smartBrakeThresholdPct`: `TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN ~ TVC_LIMITS.SMART_BRAKE_THRESHOLD.MAX`

핸들러에서는:
- `safeNumber()`로 파싱
- 기존 `clampNumber()`로 범위 clamp
- 보정이나 clamp가 발생하면 toast 피드백
- submit 직전 한 번 더 fail-fast 검사

## 컨트롤러 / 저장 파이프라인 보강

### 숨겨진 `G` 값 보존
`G` 입력은 UI에서 숨기더라도, 저장 파이프라인에서는 절대 `undefined`가 되면 안 됩니다.

필수 보강:
- `useStrategyCreatorController.tsx`의 `EMPTY_VR_BAND_DRAFT`에 `g: STRATEGY_DEFAULTS.VR_G_VALUE` 유지
- `buildVrBandStrategy()`에서 최종 `vrBaseParams` 조립 시 아래처럼 fallback을 한 번 더 강제

```ts
G: safeNumber(draft?.g, STRATEGY_DEFAULTS.VR_G_VALUE),
```

Why:
- 화면에서 입력을 제거하면 사용자가 `G`를 직접 수정할 수 없으므로, 조립 경계에서 값을 다시 보장해야 Zero Assumption을 만족합니다.
- 컨트롤러 기본값만 믿고 조립 경계 fallback이 없으면, 추후 draft shape 변경이나 외부 주입 경로에서 `G`가 비는 순간 런타임 저장 실패 위험이 생깁니다.

### 새 TVC 입력 2개 처리
새 TVC 필드는 **정수 전용 입력**으로 고정합니다. 즉, 소수점은 controller에서 반올림하지 않고 **입력 단계에서 차단**합니다.

계획:
- `handleVrBaseGrowthRatePctChange`
- `handleVrSmartBrakeThresholdPctChange`

공통 처리 순서:
1. `rawValue: string`를 받음 (`DraftNumberInput`와 동일 계약)
2. `safeNumber(rawValue, STRATEGY_DEFAULTS...)`로 숫자 파싱
3. 기존 `clampNumber()`로 허용 범위 clamp
4. 범위 clamp가 발생하면 `constants/vrMessages.ts`의 TVC 전용 `outOfRangeToast` 노출
5. `updateVrBand({ ... })`

문서상 정책:
- blur 시 입력이 비어 있으면 이번 단계에서는 **기본값 fallback 복구**를 유지합니다.
- 사용자가 중간 편집 UX를 더 세밀하게 제어하는 로직은 이번 단계 범위에서 제외합니다.

예시:

```ts
const parsedValue = safeNumber(
  rawValue,
  STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
);
const clampedValue = clampNumber(
  parsedValue,
  TVC_LIMITS.BASE_GROWTH_RATE.MIN,
  TVC_LIMITS.BASE_GROWTH_RATE.MAX,
);

if (clampedValue !== parsedValue) {
  showErrorToast(VR_TVC_VALIDATION_MESSAGES[lang].outOfRangeToast);
}

updateVrBand({ baseGrowthRatePct: clampedValue });
return clampedValue;
```

Why:
- 폼 정책 자체를 정수 전용으로 고정하면 `10.5 -> 105` 같은 왜곡 경로를 아예 만들지 않습니다.
- controller는 반올림 책임을 지지 않고 `safeNumber()` + clamp만 수행하므로 유지보수 경계가 더 단순합니다.
- 경고 문구 owner를 `constants/vrMessages.ts`로 고정하면 TVC 폼의 라벨/검증 문구가 같은 규정집을 참조하게 됩니다.
- 사용자가 범위를 넘겨도 컨트롤러에서 즉시 잡아 UX 피드백을 줄 수 있습니다.
- submit guard는 마지막 방어선으로만 남깁니다.

## AST 1:1 배선 체크리스트
이번 단계는 “대충 prop wiring” 수준이 아니라, 아래 AST 노드가 **정확히 같은 이름으로 끝까지 연결되는지**를 기준으로 검토합니다.

1. `types.ts`
   - `VrBandStrategyBase.baseGrowthRatePct`
   - `VrBandStrategyBase.smartBrakeThresholdPct`
2. `supabase/functions/_shared/types.ts`
   - `VrBandStrategyBase.baseGrowthRatePct`
   - `VrBandStrategyBase.smartBrakeThresholdPct`
3. `constants/domain/financeRules.ts`
   - `STRATEGY_DEFAULTS.VR_G_VALUE`
   - `STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT`
   - `STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT`
4. `constants/vrConstants.ts`
   - `TVC_LIMITS.BASE_GROWTH_RATE.MIN`
   - `TVC_LIMITS.BASE_GROWTH_RATE.MAX`
   - `TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN`
   - `TVC_LIMITS.SMART_BRAKE_THRESHOLD.MAX`
5. `constants/vrMessages.ts`
   - `VR_CREATOR_LABELS[lang].baseGrowthRatePct`
   - `VR_CREATOR_LABELS[lang].smartBrakeThresholdPct`
   - `VR_TVC_VALIDATION_MESSAGES[lang].outOfRangeToast`
6. `src/components/StrategyCreator/utils.ts`
   - `VrBandWizardDraftInput.baseGrowthRatePct`
   - `VrBandWizardDraftInput.smartBrakeThresholdPct`
   - `buildVrBandStrategy()`의 `vrParams.baseGrowthRatePct`
   - `buildVrBandStrategy()`의 `vrParams.smartBrakeThresholdPct`
   - `buildVrBandStrategy()`의 `G: safeNumber(draft?.g, STRATEGY_DEFAULTS.VR_G_VALUE)`
7. `components/strategyCreator/useStrategyCreatorController.tsx`
   - `buildInitialWizardState().vrBand.baseGrowthRatePct`
   - `buildInitialWizardState().vrBand.smartBrakeThresholdPct`
   - `EMPTY_VR_BAND_DRAFT.baseGrowthRatePct`
   - `EMPTY_VR_BAND_DRAFT.smartBrakeThresholdPct`
   - `handleVrBaseGrowthRatePctChange`
   - `handleVrSmartBrakeThresholdPctChange`
   - return surface의 `vrBaseGrowthRatePct`
   - return surface의 `vrSmartBrakeThresholdPct`
   - return surface의 `handleVrBaseGrowthRatePctChange`
   - return surface의 `handleVrSmartBrakeThresholdPctChange`
8. `components/strategyCreator/StrategyCreator.tsx`
   - `vrBaseGrowthRatePct={controller.vrBaseGrowthRatePct}`
   - `onVrBaseGrowthRatePctChange={controller.handleVrBaseGrowthRatePctChange}`
   - `vrSmartBrakeThresholdPct={controller.vrSmartBrakeThresholdPct}`
   - `onVrSmartBrakeThresholdPctChange={controller.handleVrSmartBrakeThresholdPctChange}`
9. `components/strategies/VrBandStrategyForm.tsx`
   - `VrBandStrategyFormProps.vrBaseGrowthRatePct`
   - `VrBandStrategyFormProps.onVrBaseGrowthRatePctChange`
   - `VrBandStrategyFormProps.vrSmartBrakeThresholdPct`
   - `VrBandStrategyFormProps.onVrSmartBrakeThresholdPctChange`
   - 기존 `vr-g` 입력 블록 교체
   - 새 `smartBrakeThresholdPct` 입력 블록 추가
10. `utils/portfolioNormalize.ts`
   - `vrRecord.baseGrowthRatePct ?? STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT`
   - `vrRecord.smartBrakeThresholdPct ?? STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT`
   - `vrRecord.G ?? STRATEGY_DEFAULTS.VR_G_VALUE`
11. `docs2/tvc_engine_simulation.ts`
   - `import { STRATEGY_DEFAULTS } from '../constants/domain/financeRules'`
   - `import { TVC_LIMITS } from '../constants/vrConstants'`
   - `STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT`
   - `STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT`
   - `TVC_LIMITS.BASE_GROWTH_RATE.MIN`
   - `TVC_LIMITS.BASE_GROWTH_RATE.MAX`
   - `TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN`
   - `TVC_LIMITS.SMART_BRAKE_THRESHOLD.MAX`

왜 이렇게 적는가:
- 이번 변경은 prop 이름 하나만 어긋나도 바로 TypeScript compile error 또는 저장 누락으로 이어집니다.
- 따라서 계획서 단계에서도 **파일명 수준이 아니라 symbol 수준**으로 적어 두어야 멘탈 컴파일이 가능합니다.

### Fat Interface 대응
현재 구조는 이미 `buildSingleStockStrategyBase(targetStock)`가 `ma0 ~ ma3` 기본 구조를 채워 넣고 있습니다.

즉, 이번 계획에서는 아래 방식으로 갑니다.
- `...STRATEGY_DEFAULTS`를 strategy 전체에 스프레드하지 않음
- 기존 `buildSingleStockStrategyBase(DEFAULT_VR_REFERENCE_STOCK)` 호출을 그대로 유지
- 그 위에 `vrBand`만 덮어씌움

```ts
return {
  strategy: {
    ...buildSingleStockStrategyBase(DEFAULT_VR_REFERENCE_STOCK),
    vrBand: vrParams,
  },
  initialVrSnapshot: createInitialVrSnapshot(vrParams),
};
```

Why:
- 현재 코드 기준으로 MA 기본 골격 주입은 이미 이 helper가 담당합니다.
- `STRATEGY_DEFAULTS` 객체 전체를 스프레드하는 방식은 실제 `Strategy` shape와 1:1 대응하지 않으므로, 오히려 과한 결합과 오버코딩을 유발할 수 있습니다.
- 따라서 이번 계획서는 **기존 helper 재사용**을 명시적으로 고정합니다.

## 저장 방식
- 최종 저장은 기존과 동일하게 `strategy.vrBand` JSON에 포함합니다.
- 예시:

```ts
vrBand: {
  vrMode: 'lump_sum',
  initialCapital: 10000,
  initialV: 5000,
  minOrderQty: 1,
  bandRateUpper: 0.05,
  bandRateLower: 0.05,
  G: STRATEGY_DEFAULTS.VR_G_VALUE,
  poolUsageRateBuy: 0.5,
  cycleWeeks: 2,
  baseGrowthRatePct: STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT,
  smartBrakeThresholdPct: STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT,
  feeRate: 0.0025,
  deltaCash: 0,
}
```

## 레거시 데이터 대응
- 기존 row에는 새 필드가 없으므로 `utils/portfolioNormalize.ts`에서 기본값 fallback이 필요합니다.
- 이번 단계에서는 **필드가 없으면 기본값을 넣는 정도만** 수행합니다.

예:
```ts
baseGrowthRatePct: n(
  vrRecord.baseGrowthRatePct ?? STRATEGY_DEFAULTS.VR_BASE_GROWTH_RATE_PERCENT
),
smartBrakeThresholdPct: n(
  vrRecord.smartBrakeThresholdPct ??
    STRATEGY_DEFAULTS.VR_SMART_BRAKE_THRESHOLD_PERCENT
),
G: n(vrRecord.G ?? STRATEGY_DEFAULTS.VR_G_VALUE),
```

## Core Rules 점검
- **SSOT**: 라벨은 `vrMessages.ts`, 저장 shape는 `VrBandStrategyBase`, 드래프트는 `VrBandWizardDraftInput`
- **Fail-fast**: 입력 범위는 handler + submit guard에서 이중 방어
- **No any / no non-null assertion**: 기존 타입 패턴 유지
- **No over-engineering**: 새 hook, 새 schema, 새 테이블 없이 기존 구조 확장만 수행

## 시뮬레이션 검증 원칙
- `docs2/tvc_engine_simulation.ts`는 min/max/integer 검증을 위해 **인라인 `if (...) throw` 분기**를 늘리지 않습니다.
- 현재 `utils/vrBandStrategy.ts`의 `validateFinancialArgs()`는 `min` / `strictPositive`만 직접 지원하므로, 시뮬레이션에서는 `docs2/target_value_channel_validation_bridge.ts`의 `validateWithSharedFinancialArgs()`를 사용해 `max` / `integer`까지 중앙 경로로 검증합니다.
- 즉, simulation 단계에서도 상한 검증을 로컬 임시 분기로 복제하지 않고, 이미 존재하는 shared validation bridge에 위임합니다.
- TVC 폼 정책이 **정수 전용 입력**이므로, simulation도 소수점을 반올림해 통과시키지 않고 `integer: true` 검증 실패를 그대로 오류로 봅니다.
- **엄격한 1:1 노선 채택**: simulation은 더 이상 `SIMULATION_TVC_LIMITS` 같은 로컬 mirror 상수를 두지 않습니다.
- simulation은 반드시 실제 production 경로인 `constants/domain/financeRules.ts`의 `STRATEGY_DEFAULTS`와 `constants/vrConstants.ts`의 `TVC_LIMITS`를 import해 사용합니다.
- 즉, planning 단계에서 snippet이 아직 실행되지 않더라도 “실제 SSOT export가 준비되지 않으면 시뮬레이션도 fail-fast로 깨진다”는 결합을 유지합니다.
- simulation에서는 `unknown`, `Record<string, unknown>`, 런타임 `isRecord()` 파서, 모듈 캐스팅(`as unknown as ...`)을 사용하지 않습니다.
- 필요한 export가 없으면 런타임 예외로 우회하지 않고 **TypeScript compile error**로 바로 깨지게 유지합니다. 이것이 strict 1:1의 의도된 동작입니다.

## 이번 단계 최종 결론
이번 1단계는 **“변수 2개를 기존 `vrBand` 구조에 추가하고, TVC 폼 UI를 바꾸는 작업”**으로 한정합니다.

즉, 지금 필요한 최소 변경은 아래뿐입니다.
- 타입 추가
- 드래프트 추가
- 컨트롤러 추가
- 폼 교체
- 저장 JSON 추가
- 레거시 fallback 추가

엔진/refresh/snapshot 계산 변경은 **다음 단계**로 분리합니다.
