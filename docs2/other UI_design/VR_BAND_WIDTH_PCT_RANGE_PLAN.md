# VR 밴드 상·하단 폭(%) 입력 범위 1~100 적용 계획서

## 1. 목표

- VR 전략 설정의 `bandUpperPct`, `bandLowerPct`를 **정수 1~100%**로 제한합니다.
- 변경 범위는 **입력 정규화와 최종 빌드 방어**에만 한정합니다.
- React 상태 구조, JSX 흐름, 저장 스키마(`bandRateUpper`, `bandRateLower`는 소수 비율)는 바꾸지 않습니다.

## 2. 설계 원칙

- **SSOT**: 최소/최대/기본값은 한 곳에서만 정의합니다.
- **DRY**: 컨트롤러와 빌드 유틸이 같은 정규화 함수를 사용합니다.
- **No Magic Number**: `1`, `100`, `5`를 흩뿌리지 않고 상수로 승격합니다.
- **Guard First**: 저장 직전에도 다시 한 번 정규화해 우회 입력을 막습니다.

## 3. 변경 방향

### 3.1 `constants/vrConstants.ts`에 밴드 폭 상수 추가

현재 `5`가 여러 군데에 퍼져 있어서, 이후 범위가 바뀌면 실수 가능성이 큽니다. 밴드 폭 정책을 한 곳에 모읍니다.

```ts
export const VR_BAND_WIDTH_PCT = {
  MIN: 1,
  MAX: 100,
  DEFAULT: 5,
} as const;
```

- `DEFAULT`를 같이 두면 `buildInitialWizardState`, `EMPTY_VR_BAND_DRAFT`, 정규화 fallback이 전부 같은 값을 씁니다.
- 이 상수는 **UI 퍼센트 단위** 전용입니다.

### 3.2 `src/components/StrategyCreator/utils.ts`에 공용 정규화 함수 추가

컨트롤러에서 따로 clamp하고, 빌드 유틸에서 또 다른 helper를 만들면 DRY가 깨집니다.  
이미 이 파일은 `safeNumber`와 최종 빌드 로직을 같이 가지고 있으므로, 여기서 공용 정규화 함수를 export하는 편이 가장 깔끔합니다.

#### import 확장

```ts
import {
  RATE_PRECISION_MULTIPLIER,
  VR_BAND_WIDTH_PCT,
} from '@/constants/vrConstants';
```

#### 추가 스니펫

`safeNumber()` 아래, `toDecimalRate()` 위에 두는 형태가 자연스럽습니다.

```ts
export function sanitizeVrBandWidthPercent(value: unknown): number {
  const parsedValue = safeNumber(value, VR_BAND_WIDTH_PCT.DEFAULT);

  if (parsedValue < VR_BAND_WIDTH_PCT.MIN) {
    return VR_BAND_WIDTH_PCT.MIN;
  }

  if (parsedValue > VR_BAND_WIDTH_PCT.MAX) {
    return VR_BAND_WIDTH_PCT.MAX;
  }

  return parsedValue;
}
```

- `unknown`을 받아도 `safeNumber()`로 안전하게 좁힙니다.
- 중첩 없는 guard 스타일이라 규칙과 맞습니다.
- 이 함수 하나로 **컨트롤러 표시값**, **커밋값**, **최종 저장값**을 모두 통일할 수 있습니다.
- 로컬 `utils.ts`에는 공용 `clampNumber()`가 없으므로, 여기서는 `Math.min(Math.max(...))`보다 **명시적인 guard return**이 현재 파일 스타일과 더 잘 맞습니다.

### 3.3 `buildVrBandStrategy()`는 공용 정규화 함수를 사용

최종 빌드 직전에도 같은 함수를 써야, 향후 다른 경로에서 드래프트가 채워져도 저장 결과가 흔들리지 않습니다.

#### 현재

```ts
const vrBaseParams = {
  initialCapital: safeNumber(draft?.initialCapital),
  initialV: safeNumber(draft?.initialV),
  minOrderQty: safeNumber(draft?.minOrderQty),
  feeRate: normalizedFeeRate,
  bandRateUpper: toDecimalRate(safeNumber(draft?.bandUpperPct)),
  bandRateLower: toDecimalRate(safeNumber(draft?.bandLowerPct)),
  G: safeNumber(draft?.g),
  poolUsageRateBuy: toDecimalRate(safeNumber(draft?.poolUsagePct)),
  cycleWeeks: sanitizeVrCycleWeeks(draft?.cycleWeeks),
};
```

#### 변경 후

```ts
const vrBaseParams = {
  initialCapital: safeNumber(draft?.initialCapital),
  initialV: safeNumber(draft?.initialV),
  minOrderQty: safeNumber(draft?.minOrderQty),
  feeRate: normalizedFeeRate,
  bandRateUpper: toDecimalRate(
    sanitizeVrBandWidthPercent(draft?.bandUpperPct),
  ),
  bandRateLower: toDecimalRate(
    sanitizeVrBandWidthPercent(draft?.bandLowerPct),
  ),
  G: safeNumber(draft?.g),
  poolUsageRateBuy: toDecimalRate(safeNumber(draft?.poolUsagePct)),
  cycleWeeks: sanitizeVrCycleWeeks(draft?.cycleWeeks),
};
```

- `toDecimalRate()`는 숫자 변환 책임만 유지하고, 범위 정책은 `sanitizeVrBandWidthPercent()`에 몰아줍니다.
- 별도 임시 변수를 만들지 않아도 의미가 충분히 명확하므로, 이 구간은 **인라인 정규화**가 더 간결합니다.

### 3.4 `useStrategyCreatorController.tsx`는 기본값·표시값·커밋값 모두 공용 함수 사용

#### import 확장

```ts
import {
  VR_BAND_WIDTH_PCT,
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '@/constants/vrConstants';
import {
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
  safeNumber,
  sanitizeVrBandWidthPercent,
  safeTrim,
  type StrategyCreatorMetaDraftInput,
  type StrategyType,
  type StrategyWizardDraftInput,
} from '@/src/components/StrategyCreator/utils';
```

#### 기본 드래프트의 매직 넘버 제거

현재는 `5`가 두 번 들어가 있습니다.

```ts
vrBand: {
  vrMode: 'lump_sum',
  initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
  initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
  minOrderQty: 1,
  bandUpperPct: 5,
  bandLowerPct: 5,
  g: 10,
  poolUsagePct: 50,
  deltaCash: 0,
  cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
},
```

아래처럼 바꿉니다.

```ts
vrBand: {
  vrMode: 'lump_sum',
  initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
  initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
  minOrderQty: 1,
  bandUpperPct: VR_BAND_WIDTH_PCT.DEFAULT,
  bandLowerPct: VR_BAND_WIDTH_PCT.DEFAULT,
  g: 10,
  poolUsagePct: 50,
  deltaCash: 0,
  cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
},
```

`EMPTY_VR_BAND_DRAFT`도 같은 방식으로 맞춥니다.

#### 커밋 핸들러

현재는 하한만 0으로 막고 있습니다.

```ts
handleVrBandUpperPctChange: (value: string) => {
  const committedValue = Math.max(0, safeNumber(value, 5));
  updateVrBand({ bandUpperPct: committedValue });
  return committedValue;
},
handleVrBandLowerPctChange: (value: string) => {
  const committedValue = Math.max(0, safeNumber(value, 5));
  updateVrBand({ bandLowerPct: committedValue });
  return committedValue;
},
```

이를 공용 함수 기반으로 바꿉니다.

```ts
handleVrBandUpperPctChange: (value: string) => {
  const committedValue = sanitizeVrBandWidthPercent(value);
  updateVrBand({ bandUpperPct: committedValue });
  return committedValue;
},
handleVrBandLowerPctChange: (value: string) => {
  const committedValue = sanitizeVrBandWidthPercent(value);
  updateVrBand({ bandLowerPct: committedValue });
  return committedValue;
},
```

- `Math.max(0, ...)`를 없애고 정책 함수를 직접 씁니다.
- fallback도 `VR_BAND_WIDTH_PCT.DEFAULT` 하나로 정리됩니다.

#### 폼에 넘기는 표시값도 정규화

현재는 저장된 레거시 값이 0이나 500이어도 그대로 보일 수 있습니다.

```ts
vrBandUpperPct: safeNumber(wizardState.vrBand?.bandUpperPct, 5),
vrBandLowerPct: safeNumber(wizardState.vrBand?.bandLowerPct, 5),
```

아래처럼 바꾸면 첫 렌더부터 정책 범위 안으로 들어옵니다.

```ts
vrBandUpperPct: sanitizeVrBandWidthPercent(wizardState.vrBand?.bandUpperPct),
vrBandLowerPct: sanitizeVrBandWidthPercent(wizardState.vrBand?.bandLowerPct),
```

## 4. 건드리지 않는 영역

### 4.1 `components/strategies/VrBandStrategyForm.tsx`

이 폼은 `DraftNumberInput`에 `onCommit`을 넘기는 구조입니다.  
`DraftNumberInput` 내부는 `type="text"`이므로 HTML의 `min`/`max` 속성으로 해결하는 방식은 맞지 않습니다.

즉, 이 파일은 **표시와 입력 UI만 담당**하고, 범위 정책은 부모 컨트롤러와 빌드 유틸이 책임지는 현재 구조를 유지하는 편이 SRP에 맞습니다.

### 4.2 `types.ts` / `VrBandStrategyParams`

저장 모델은 여전히 `bandRateUpper`, `bandRateLower`를 **소수 비율**로 보관합니다.  
이번 변경은 입력 정책만 바꾸는 것이므로 타입 계약은 그대로 둡니다.

## 5. 테스트 계획

현재 이 영역에 대응하는 테스트 파일이 보이지 않으므로, **정규화 함수 하나만 타겟 테스트**하는 작은 단위 테스트가 가장 효율적입니다.

### 5.1 새 테스트 파일 제안

`src/components/StrategyCreator/utils.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { VR_BAND_WIDTH_PCT } from '@/constants/vrConstants';
import { sanitizeVrBandWidthPercent } from './utils';

describe('sanitizeVrBandWidthPercent', () => {
  it('빈 값은 기본값으로 되돌린다', () => {
    expect(sanitizeVrBandWidthPercent('')).toBe(VR_BAND_WIDTH_PCT.DEFAULT);
  });

  it('최소값보다 작으면 최소값으로 올린다', () => {
    expect(sanitizeVrBandWidthPercent(0)).toBe(VR_BAND_WIDTH_PCT.MIN);
  });

  it('최대값보다 크면 최대값으로 내린다', () => {
    expect(sanitizeVrBandWidthPercent(101)).toBe(VR_BAND_WIDTH_PCT.MAX);
  });

  it('유효한 범위 값은 그대로 유지한다', () => {
    expect(sanitizeVrBandWidthPercent(25)).toBe(25);
  });
});
```

- 테스트는 구현 상세보다 **정책 계약**만 검증합니다.
- 컨트롤러/빌드 양쪽이 같은 함수를 쓰므로, 이 테스트 하나로 회귀 위험을 꽤 줄일 수 있습니다.

## 6. 선택 사항

사용자에게 범위를 더 명확히 보여주고 싶다면, `constants/vrMessages.ts`에 헬퍼 문구를 추가하고 `VrBandStrategyForm`에서 렌더할 수 있습니다.  
다만 이번 요구의 본질은 **입력 정책 통일**이므로, 1차 변경에서는 제외해도 충분합니다.

예시:

```ts
bandWidthHint: '1~100% 범위로 입력해 주세요.',
```

이 경우에도 JSX에 문자열 하드코딩은 하지 않습니다.

## 7. 검증 체크리스트

1. 상단 밴드 폭에 `0` 입력 후 blur 시 `1`로 보정되는지 확인합니다.
2. 하단 밴드 폭에 `101` 입력 후 blur 시 `100`으로 보정되는지 확인합니다.
3. 기존 드래프트에 `0` 또는 `999`가 있어도 폼 표시값이 즉시 `1~100`으로 정리되는지 확인합니다.
4. 저장 결과의 `strategy.vrBand.bandRateUpper`, `bandRateLower`가 `0.01 ~ 1.0` 구간으로 들어가는지 확인합니다.

## 8. 결론

core-principles 기준으로 보면, 가장 안전한 방식은 **상수 1개 + 공용 정규화 함수 1개**를 만들고,  
컨트롤러와 `buildVrBandStrategy()`가 그 함수를 같이 쓰도록 바꾸는 것입니다.

이렇게 하면:

- 매직 넘버가 사라지고
- 중복 클램프가 없어지며
- 입력/표시/저장 정책이 한 줄기로 통일되고
- 테스트도 작은 단위로 붙일 수 있습니다.

## 9. 리뷰 반영 메모

이번 리뷰 제안에 대해서는 아래처럼 반영합니다.

- **동의**: `buildVrBandStrategy()`에서 `bandUpperPct`, `bandLowerPct` 임시 변수를 따로 두지 않고, `sanitizeVrBandWidthPercent()`를 `toDecimalRate()` 안에서 바로 호출하는 방식은 충분히 읽기 쉽고 더 간결합니다.
- **부분 비동의**: `sanitizeVrBandWidthPercent()` 구현을 `Math.min(Math.max(...))`로 바꾸는 안은 가능하지만, 현재 프로젝트 문맥에서는 guard clause가 더 명시적이고 기존 스타일과도 잘 맞습니다. 따라서 계획서는 guard return 기반 구현을 유지합니다.
