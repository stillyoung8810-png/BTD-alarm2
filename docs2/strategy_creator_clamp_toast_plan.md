# 전략 설정창 클램프 토스트 적용 계획서

## 목표

전략 생성/설정 위저드에서 현재 **값만 자동 보정되고 사용자 피드백이 없는 숫자 입력**에 대해, 기존 멀티스플릿 수익률 입력에서 쓰는 동일한 범위 초과 토스트를 적용합니다.

이번 단계는 **계획서 + 스니펫/시뮬레이션만 작성**합니다.  
프로덕션 코드(`components`, `constants`, `src`, `utils`)는 아직 수정하지 않습니다.

## 리뷰 반영 사항

이번 수정은 아래 리뷰에 동의하고 반영합니다.

- 정규화 유틸은 UI side effect를 호출하지 않습니다. 숫자 계산은 순수 함수가 담당하고, `showErrorToast(...)`는 컨트롤러 계층에서만 호출합니다.
- `ZERO_AMOUNT`, `EMPTY_STRING`처럼 언어 구조적 리터럴을 감싸는 상수는 쓰지 않습니다. 도메인 경계값처럼 의미가 있는 숫자만 상수화합니다.
- 정규화 유틸은 잘못된 bounds 입력 때문에 런타임 `throw`를 던지지 않습니다. 오염된 설정값은 방어적으로 보정해 WSOD를 막습니다.
- TVC 기본 성장률/스마트 브레이크 입력은 현재 `DraftNumberInput allowDecimal={false}`로 `.`이 제거되므로, 스니펫의 검증값도 실제 UI 경로에 맞춰 정수 문자열만 사용합니다.
- UI에서 범위 초과 입력 경로가 사실상 없는 TVC 초기 투자 원금, 초기 T, 입출금 금액은 토스트 적용 대상에서 제외합니다.
- `showErrorToast`는 현재 `components/tds-adapter/showErrorToast.ts`에서 import하는 모듈 함수이므로 React Hook dependency에 넣을 런타임 클로저 값이 아닙니다. 이후 `useToast()` 같은 hook 제공 함수로 바뀌면 그때 dependency에 포함합니다.
- `DraftNumberInput`은 별도 `draftValue` state를 갖고 `onCommit`은 blur 시점에만 호출합니다. 따라서 빈 문자열 commit 시 fallback을 반환하는 현재 계약은 입력 중 백스페이스를 막지 않습니다.
- 정수 반올림 스니펫은 `Math.round(value + Number.EPSILON)`을 사용해 Core Principles의 부동소수점 방어 규칙을 따릅니다.
- `commitClampedInput`은 이번 범위에서 `StrategyCreator` 전용 로컬 헬퍼로 둡니다. 아직 두 번째 실제 사용처가 없으므로 공용 `useClampedNumberCommit` 훅 추출은 YAGNI이며, 재사용 요구가 생길 때 콜백 주입형 훅으로 승격합니다.
- 현재 `DraftNumberInput`은 붙여넣은 `"50USD"`도 `"50"`으로 sanitize하므로 비숫자 문자열은 실제 사용자 경로가 아닙니다. 다만 직접 핸들러 호출 방어와 미래 raw text 입력을 위해 정규화 결과에 `hasInvalidFormat` 플래그를 추가합니다.
- invalid format은 fallback으로 조용히 상태를 덮어쓰지 않습니다. 컨트롤러 헬퍼는 `updateValue(...)` 전에 `hasInvalidFormat`을 가드하고, 선택적으로 주입된 invalid format 토스트만 띄운 뒤 상태 업데이트를 건너뜁니다.
- `DraftNumberInput`은 `onCommit` 반환값으로 draft 표시값을 다시 세팅하므로, invalid format에서는 fallback이 아니라 현재 커밋값(`currentCommittedValue`)을 반환합니다.
- `commitClampedInput`은 로컬 헬퍼로 유지하되, 토스트 문구와 현재 커밋값은 호출 지점에서 1-depth parameter object로 주입합니다. `options` 같은 중첩 객체는 만들지 않아 접근 경로와 인지 비용을 줄입니다.

## 기준 메시지

현재 실제로 동작하는 기준 토스트는 `copy.multiSplit.outOfRangeToast`입니다.

- `ko`: `설정 범위를 벗어 났어요.`
- `en`: `The value is outside the allowed range.`

구현 단계에서는 이 문구를 전략별 하위 키에 흩뿌리지 않고, 전략 생성 위저드 공통 메시지로 승격합니다.

예상 방향:

```ts
interface StrategyCreatorMessageSet {
  outOfRangeToast: string;
  // ... existing fields
}
```

Why:

- RSI/MA, 멀티스플릿, 무손절 다분할, TVC가 같은 사용자 피드백을 공유하므로 `multiSplit` 하위 키를 계속 참조하면 도메인 경계가 어긋납니다.
- 현재 VR/TVC 핸들러는 `copy.vrBand?.outOfRangeToast`를 보지만 메시지 딕셔너리에 해당 키가 없어 토스트가 실제로 나가지 않는 구조입니다.
- 공통 키 하나를 사용하면 i18n single source of truth를 유지하고 누락 키로 인한 silent failure를 막을 수 있습니다.

## 현재 동작 요약

### 이미 토스트가 있는 입력

| 입력 | 범위 | 현재 동작 |
|---|---:|---|
| 멀티스플릿 목표 수익률 A | `10..100` | `normalizeMultiSplitReturnRates(...).didClamp`이면 토스트 |
| 멀티스플릿 중간 익절 수익률 B | `1..10` | 위와 동일 |
| TVC 기본 성장률 | `1..20` | 코드상 토스트 호출 경로는 있으나, 메시지 키 누락으로 실제 표시 불안정 |
| TVC 스마트 브레이크 임계값 | `1..99` | 위와 동일 |

### 이번 적용 대상: 클램프만 있는 입력

| 전략/화면 | 입력 | 범위 | 현재 보정 |
|---|---|---:|---|
| RSI+이평 기본 | 단기 이평 기간 | `1..250` | `clampNumber` |
| RSI+이평 기본 | 장기 이평 기간 | `1..250` | `clampNumber` |
| RSI+이평 구간 | MA1/MA2/MA3 RSI 기준값 | `0..100` | `clampNumber` |
| RSI+이평 구간 | MA1/MA2/MA3 부분 익절 목표 | `1..100` | `clampNumber` |
| 멀티스플릿 | 총 분할 횟수 | `20..80` | `clampNumber` |
| 멀티스플릿 | 평단가 매수 비율 | `0..100` | `clampNumber` |
| 멀티스플릿 | 메인 익절 비중 | `1..100` | `clampNumber` |
| 멀티스플릿 | 리스크 컷 비중 | `0..100` | `clampNumber` |
| 무손절 다분할 | 평단가 매수 비율 | `0..100` | `clampNumber` |
| 무손절 다분할 | 익절 목표 수익률 | `0..100` | `clampNumber` |
| 무손절 다분할 | 총 분할 횟수 | `20..80` | `clampNumber` |
| TVC | 최소 주문 수량 | `min 1` | `Math.max(1, ...)` |
| TVC | 밴드 상단/하단 폭 | `1..100` | `sanitizeVrBandWidthPercent` |
| TVC | 풀 사용률 | `0..100` | `clampNumber` |

### 제외 대상

| 입력 | 제외 이유 |
|---|---|
| TVC 주기(주) | `<select>` 옵션이 `VR_CYCLE.MIN_WEEKS..MAX_WEEKS`만 렌더링하므로 사용자가 범위 밖 값을 입력할 경로가 없습니다. |
| TVC 초기 투자 원금 | 현재 UI에서 음수 입력 경로가 없고, `0`은 입력 중 클램프가 아니라 제출 단계 `> 0` 검증으로 처리합니다. |
| TVC 초기 T | 현재 UI에서 음수 입력 경로가 없고, `0`은 입력 중 클램프가 아니라 제출 단계 `> 0` 검증으로 처리합니다. |
| TVC 입출금 금액 | 현재 UI에서 음수 입력 경로가 없고, 상한 초과는 클램프가 아니라 모드별 제출 검증 메시지로 처리합니다. |
| `handleVrGChange` | 컨트롤러에는 있으나 현재 `VrBandStrategyForm`에 연결되지 않아 실제 설정창 입력이 아닙니다. 이후 UI에 노출할 경우 동일 헬퍼를 적용합니다. |
| 이름/일일 매수 금액/수수료율 | 입력 중 클램프가 아니라 제출 시 `validatePortfolioSetupInput`으로 에러 메시지를 띄우는 흐름입니다. 이번 요청의 “클램프만 있는 경우”와 다릅니다. |

## 설계 원칙

1. **순수 정규화와 UI side effect 분리**
   - 도메인 유틸은 `{ value, didClamp, shouldShowOutOfRangeToast }`만 반환합니다.
   - 도메인 유틸은 `showErrorToast`, React state updater, i18n copy를 알지 못합니다.
   - `showErrorToast(...)`는 이벤트 핸들러/컨트롤러 계층에서만 호출합니다.

2. **공통 토스트 키 사용**
   - 모든 클램프 토스트는 `copy.outOfRangeToast`로 통일합니다.
   - 기존 멀티스플릿 수익률도 같은 키로 이동합니다.

3. **빈 입력은 토스트 제외**
   - `DraftNumberInput`은 입력 중 `draftValue`를 별도 state로 유지하고, `onCommit`은 blur 시점에만 호출합니다.
   - 따라서 사용자는 입력 중 백스페이스로 필드를 비울 수 있고, blur commit 시에는 기존 숫자 fallback 계약에 따라 fallback 값으로 복구됩니다.
   - 빈 문자열은 “범위 초과”가 아니므로 토스트를 띄우지 않습니다.

4. **비숫자 입력은 무음 상태 변조 금지**
   - 현재 `DraftNumberInput`은 `rawValue.replace(/[^0-9.]/g, '')`로 비숫자 문자를 제거한 뒤 commit하므로 `"abc"`, `"50USD"` 같은 문자열은 실제 UI commit 경로가 아닙니다.
   - 직접 핸들러 호출 또는 미래 raw text 입력을 대비해 비숫자 입력은 `hasInvalidFormat: true`로 표시합니다.
   - `hasInvalidFormat`이면 컨트롤러는 기존 전략 상태를 fallback 값으로 덮어쓰지 않습니다.
   - `DraftNumberInput`의 blur 로직이 `onCommit` 반환값으로 draft를 다시 포맷하므로, 이 경우 반환값도 fallback이 아니라 `currentCommittedValue`로 유지합니다.
   - 이번 범위에서는 invalid format 전용 i18n 키를 추가하지 않습니다. 호출 지점에서 `invalidFormatToastMessage`가 주입된 경우에만 토스트를 띄웁니다.
   - 실제 유한 숫자가 범위를 벗어나 경계값으로 바뀐 경우만 토스트 대상입니다.

5. **반올림 후 클램프 판정**
   - TVC 기본 성장률/스마트 브레이크처럼 현재 UI가 `allowDecimal={false}`인 필드는 실제 사용자 입력 경로에서는 정수 문자열만 commit됩니다.
   - `roundingMode: 'integer'`는 직접 핸들러 호출, 테스트, 미래 UI 변경에 대한 방어적 정규화로만 유지합니다.
   - 정수 반올림은 `Math.round(value + Number.EPSILON)`으로 수행합니다.
   - 스니펫 검증값은 실제 UI 경로와 맞추기 위해 `10.4` 같은 소수 문자열이 아니라 `10`, `21`, `100` 같은 정수 문자열을 사용합니다.

6. **잘못된 bounds는 크래시 없이 보정**
   - `min > max`면 `safeMax = safeMin`으로 고정합니다.
   - `max`가 명시됐지만 유한수가 아니면 `safeMax = safeMin`으로 고정합니다.
   - `min`이 유한수가 아니면 유한 fallback 값을 `safeMin`으로 사용합니다.
   - 내부 설정 오류는 사용자 입력 범위 초과가 아니므로 `showErrorToast(copy.outOfRangeToast)`를 띄우지 않고, 컨트롤러에서 개발자 진단 경로로만 보고합니다.

7. **추상화 범위**
   - `normalizeDraftNumberToBounds`는 순수 유틸로 분리합니다.
   - `commitClampedInput`은 이번 구현에서는 `useStrategyCreatorController` 내부 로컬 헬퍼로 둡니다.
   - 공용 `useClampedNumberCommit` 훅은 현재 요구 범위 밖입니다. 두 번째 실제 화면에서 같은 commit 정책이 필요해질 때 `outOfRangeToastMessage`, `onInvalidConfig`, `onInvalidFormat`을 주입받는 훅으로 승격합니다.

## 구현 계획

### 1. 메시지 키 정리

`constants/messages/strategyCreatorMessages.ts`

- `StrategyCreatorMessageSet`에 `outOfRangeToast: string` 추가
- `ko`, `en` 메시지에 기존 문구 그대로 추가
- 컨트롤러는 `copy.multiSplit.outOfRangeToast`와 `copy.vrBand?.outOfRangeToast` 대신 `copy.outOfRangeToast` 사용
- `multiSplit.outOfRangeToast`는 `rg`로 외부 참조가 없음을 확인한 뒤 제거하거나, 호환이 필요하면 같은 상수에서 공급하되 컨트롤러 참조는 공통 키로 이동

권장 스니펫:

```ts
const STRATEGY_CREATOR_OUT_OF_RANGE_TOAST = {
  ko: '설정 범위를 벗어 났어요.',
  en: 'The value is outside the allowed range.',
} as const;
```

### 2. 순수 숫자 정규화 유틸 추가

위치 후보:

- 범위가 `StrategyCreator` 입력 commit 전용이면 `src/components/StrategyCreator/utils.ts`
- 다른 화면에서도 재사용할 계획이 확정되면 별도 공용 유틸 파일

이번 요구 범위에서는 `StrategyCreator` 입력에만 쓰므로, 우선 `src/components/StrategyCreator/utils.ts`가 더 보수적입니다.

권장 스니펫:

```ts
type RoundingMode = 'none' | 'integer';

export interface NormalizeDraftNumberArgs {
  rawValue: string;
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: RoundingMode;
}

export interface NormalizedDraftNumberResult {
  value: number;
  didClamp: boolean;
  shouldShowOutOfRangeToast: boolean;
  hasInvalidNumberConfig: boolean;
  hasInvalidFormat: boolean;
}

function roundDraftValue(value: number, mode: RoundingMode): number {
  if (mode === 'integer') {
    return Math.round(value + Number.EPSILON);
  }

  return value;
}

function normalizeFiniteFallback(value: number): {
  value: number;
  hasInvalidNumberConfig: boolean;
} {
  if (Number.isFinite(value)) {
    return {
      value,
      hasInvalidNumberConfig: false,
    };
  }

  return {
    value: 0,
    hasInvalidNumberConfig: true,
  };
}

function normalizeSafeBounds(args: {
  fallback: number;
  min: number;
  max?: number;
}): {
  safeMin: number;
  safeMax?: number;
  hasInvalidNumberConfig: boolean;
} {
  const hasInvalidMin = !Number.isFinite(args.min);
  const safeMin = hasInvalidMin ? args.fallback : args.min;

  if (args.max === undefined) {
    return {
      safeMin,
      hasInvalidNumberConfig: hasInvalidMin,
    };
  }

  if (!Number.isFinite(args.max) || args.max < safeMin) {
    return {
      safeMin,
      safeMax: safeMin,
      hasInvalidNumberConfig: true,
    };
  }

  return {
    safeMin,
    safeMax: args.max,
    hasInvalidNumberConfig: hasInvalidMin,
  };
}

export function normalizeDraftNumberToBounds(
  args: NormalizeDraftNumberArgs,
): NormalizedDraftNumberResult {
  const fallback = normalizeFiniteFallback(args.fallback);
  const trimmedValue = args.rawValue.trim();

  if (trimmedValue === '') {
    return {
      value: fallback.value,
      didClamp: false,
      shouldShowOutOfRangeToast: false,
      hasInvalidNumberConfig: fallback.hasInvalidNumberConfig,
      hasInvalidFormat: false,
    };
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return {
      value: fallback.value,
      didClamp: false,
      shouldShowOutOfRangeToast: false,
      hasInvalidNumberConfig: fallback.hasInvalidNumberConfig,
      hasInvalidFormat: true,
    };
  }

  const processedValue = roundDraftValue(
    parsedValue,
    args.roundingMode ?? 'none',
  );
  const bounds = normalizeSafeBounds({
    fallback: fallback.value,
    min: args.min,
    max: args.max,
  });

  const valueWithMin = Math.max(bounds.safeMin, processedValue);
  const value =
    bounds.safeMax === undefined
      ? valueWithMin
      : Math.min(bounds.safeMax, valueWithMin);
  const didClamp = value !== processedValue;
  const hasInvalidNumberConfig =
    fallback.hasInvalidNumberConfig || bounds.hasInvalidNumberConfig;

  return {
    value,
    didClamp,
    shouldShowOutOfRangeToast: didClamp && !hasInvalidNumberConfig,
    hasInvalidNumberConfig,
    hasInvalidFormat: false,
  };
}
```

주의:

- 위 함수는 UI 이벤트, i18n, toast에 접근하지 않습니다.
- malformed bounds도 throw하지 않습니다.
- `0`은 “유한 fallback 자체가 오염된 최후 방어값”으로만 쓰이며, `ZERO_AMOUNT` 같은 포장 상수를 만들지 않습니다.

### 3. 컨트롤러 계층 헬퍼 추가

`components/strategyCreator/useStrategyCreatorController.tsx`

권장 스니펫:

```ts
type DraftNumberRules = {
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: 'none' | 'integer';
};

interface CommitClampedInputParams {
  rawValue: string;
  rules: DraftNumberRules;
  currentCommittedValue: number;
  outOfRangeToastMessage: string;
  invalidFormatToastMessage?: string;
  updateValue: (value: number) => void;
}

const commitClampedInput = useCallback(
  (params: CommitClampedInputParams): number => {
    const {
      rawValue,
      rules,
      currentCommittedValue,
      outOfRangeToastMessage,
      invalidFormatToastMessage,
      updateValue,
    } = params;

    const normalized = normalizeDraftNumberToBounds({
      rawValue,
      ...rules,
    });

    if (normalized.hasInvalidNumberConfig) {
      if (import.meta.env.DEV) {
        console.error('[StrategyCreator] invalid number bounds', rules);
      }
      updateValue(normalized.value);
      return normalized.value;
    }

    if (normalized.hasInvalidFormat) {
      if (invalidFormatToastMessage != null) {
        showErrorToast(invalidFormatToastMessage);
      }
      return Number.isFinite(currentCommittedValue)
        ? currentCommittedValue
        : normalized.value;
    }

    updateValue(normalized.value);

    if (normalized.shouldShowOutOfRangeToast) {
      showErrorToast(outOfRangeToastMessage);
    }

    return normalized.value;
  },
  [],
);
```

Why:

- 이 헬퍼는 컨트롤러 내부에 있으므로 상태 업데이트와 토스트 side effect를 함께 조율해도 SRP를 위반하지 않습니다.
- 순수 유틸은 계산 결과만 제공하고, 실제 UI 피드백 정책은 컨트롤러에 남습니다.
- 핸들러마다 `if (normalized.shouldShowOutOfRangeToast)`를 반복하지 않아 DRY를 지킵니다.
- malformed bounds는 사용자 입력 문제가 아니므로 공통 범위 초과 토스트를 띄우지 않고 개발 환경 진단 로그로만 보고합니다.
- 현재 `showErrorToast`는 import된 모듈 함수이고 토스트 문구도 호출 시점 parameter로 주입하므로 `commitClampedInput`의 `useCallback` dependency는 비워 둡니다. 향후 hook이나 prop으로 주입되는 함수가 되면 해당 함수도 dependency에 추가합니다.
- 비숫자 입력은 현재 UI에서 sanitize되어 도달하지 않지만, 직접 호출 방어를 위해 상태 업데이트를 건너뜁니다. 반환값도 fallback이 아니라 현재 커밋값을 유지해 `DraftNumberInput` 표시값이 조용히 fallback으로 바뀌지 않게 합니다.
- 토스트 문구는 헬퍼 내부에서 `copy.outOfRangeToast`를 직접 캡처하지 않고 호출 지점의 `outOfRangeToastMessage`로 주입합니다.
- `commitClampedInput`은 인자가 계속 늘어나는 것을 막기 위해 단일 parameter object를 받되, `options` 같은 불필요한 중첩 객체 없이 1-depth로 유지합니다.
- 이 헬퍼는 “범용 훅”이 아니라 `StrategyCreator`의 상태 업데이트와 토스트 정책을 묶는 로컬 헬퍼입니다. 재사용처가 생기기 전까지 공용 추상화를 만들지 않습니다.

### 4. 필드별 변경 방식

#### `clampNumber(...)` 기반 필드

기존:

```ts
const committedValue = clampNumber(
  safeNumber(value, STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT),
  MIN_TOTAL_SPLIT_COUNT,
  MAX_TOTAL_SPLIT_COUNT,
);
updateMultiSplit({ totalSplitCount: committedValue });
return committedValue;
```

계획:

```ts
return commitClampedInput({
  rawValue: value,
  rules: {
    fallback: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    min: MIN_TOTAL_SPLIT_COUNT,
    max: MAX_TOTAL_SPLIT_COUNT,
  },
  updateValue: (committedValue) => {
    updateMultiSplit({ totalSplitCount: committedValue });
  },
  outOfRangeToastMessage: copy.outOfRangeToast,
  currentCommittedValue: safeNumber(
    wizardState.multiSplit?.totalSplitCount,
    STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
  ),
});
```

#### `Math.max(...)` 기반 필드

기존:

```ts
const committedValue = Math.max(1, safeNumber(value, 1));
updateVrBand({ minOrderQty: committedValue });
return committedValue;
```

계획:

```ts
return commitClampedInput({
  rawValue: value,
  rules: {
    fallback: 1,
    min: 1,
  },
  updateValue: (committedValue) => {
    updateVrBand({ minOrderQty: committedValue });
  },
  outOfRangeToastMessage: copy.outOfRangeToast,
  currentCommittedValue: safeNumber(wizardState.vrBand?.minOrderQty, 1),
});
```

#### `sanitizeVrBandWidthPercent(...)` 기반 필드

기존 `sanitizeVrBandWidthPercent`는 `didClamp`를 반환하지 않습니다. 실제 구현 단계에서는 controller의 commit 헬퍼가 같은 범위 상수를 사용해 `didClamp`를 얻습니다.

계획:

```ts
return commitClampedInput({
  rawValue: value,
  rules: {
    fallback: VR_BAND_WIDTH_PCT.DEFAULT,
    min: VR_BAND_WIDTH_PCT.MIN,
    max: VR_BAND_WIDTH_PCT.MAX,
  },
  updateValue: (committedValue) => {
    updateVrBand({ bandUpperPct: committedValue });
  },
  outOfRangeToastMessage: copy.outOfRangeToast,
  currentCommittedValue: safeNumber(
    wizardState.vrBand?.bandUpperPct,
    VR_BAND_WIDTH_PCT.DEFAULT,
  ),
});
```

Why:

- `sanitizeVrBandWidthPercent`를 UI side effect와 섞지 않습니다.
- 범위 판정은 controller에서 처리하고, 기존 순수 유틸은 빌드/저장 정규화 용도로 계속 사용할 수 있습니다.

### 5. `useCallback` 의존성

`commitClampedInput` 자체는 `copy`를 캡처하지 않으므로 dependency array를 비워 둡니다. 현재 `showErrorToast`도 모듈 import 함수이므로 dependency array에 넣지 않습니다.

개별 핸들러는 `copy.outOfRangeToast`를 parameter로 주입하므로 dependency array에 포함합니다. 향후 `const { showErrorToast } = useToast()`처럼 렌더마다 바뀔 수 있는 값으로 바뀌면 `commitClampedInput` dependency에도 해당 함수를 포함해야 합니다.

개별 핸들러는 `commitClampedInput`, 사용한 updater, 그리고 parameter로 주입하는 `copy.outOfRangeToast`를 의존성에 넣습니다.

예:

```ts
const handleMultiSplitTotalCountChange = useCallback(
  (value: string) =>
    commitClampedInput({
      rawValue: value,
      rules: {
        fallback: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
        min: MIN_TOTAL_SPLIT_COUNT,
        max: MAX_TOTAL_SPLIT_COUNT,
      },
      updateValue: (committedValue) => {
        updateMultiSplit({ totalSplitCount: committedValue });
      },
      outOfRangeToastMessage: copy.outOfRangeToast,
      currentCommittedValue: safeNumber(
        wizardState.multiSplit?.totalSplitCount,
        STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
      ),
    }),
  [
    commitClampedInput,
    copy.outOfRangeToast,
    updateMultiSplit,
    wizardState.multiSplit?.totalSplitCount,
  ],
);
```

`stepHandlers`는 `useMemo` 내부 객체라서 `commitClampedInput`을 dependency array에 추가해야 합니다.

## 검증 계획

### 문서 스니펫 검증

`docs2/strategy_creator_clamp_toast_snippets.ts`는 아래를 검증합니다.

- 범위 아래 입력은 하한으로 보정되고 컨트롤러 계층에서 토스트 1회
- 범위 위 입력은 상한으로 보정되고 컨트롤러 계층에서 토스트 1회
- 범위 내부 입력은 보정 없음, 토스트 없음
- 빈 문자열은 fallback 유지, 토스트 없음
- 비숫자 입력은 현재 커밋값 반환, 상태 업데이트 없음, `hasInvalidFormat: true`
- `invalidFormatToastMessage`가 주입된 경우에만 비숫자 입력 토스트 1회
- 정수 입력 필드는 실제 UI 경로에 맞춰 정수 문자열 기준으로 검증
- `min > max`, `NaN` bounds는 throw 없이 방어 보정하고, 사용자 토스트 대신 invalid config 보고만 수행

### 실제 구현 후 검증

1. `npm run typecheck:app`
2. 현재 repo 스크립트 기준 `npm test`
3. 집중 테스트가 필요하면 `StrategyCreator` 관련 테스트 또는 pure util 단위 테스트 추가
4. 수동 확인:
   - 각 필드에 하한 미만/상한 초과 입력
   - 입력값이 경계값으로 바뀌는지 확인
   - 동일한 토스트 문구가 표시되는지 확인
   - 정상 범위 입력에는 토스트가 뜨지 않는지 확인

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 모든 클램프 필드에 토스트가 동시에 추가되어 사용자에게 과하게 느껴질 수 있음 | 토스트는 commit 시점에만 호출합니다. 입력 중 매 key stroke마다 호출하지 않습니다. |
| `copy.outOfRangeToast` 의존성 누락 | `commitClampedInput`은 `copy`를 캡처하지 않고, 개별 핸들러가 `outOfRangeToastMessage`로 주입하며 dependency에 포함합니다. |
| VR 기존 optional 메시지 경로 때문에 silent failure 지속 | `getVrBandOutOfRangeToast`를 제거하고 공통 메시지 키를 직접 사용합니다. |
| `sanitizeVrBandWidthPercent`와 controller 정규화가 이중화될 수 있음 | UI 입력 commit은 controller 헬퍼, 저장/빌드 정규화는 기존 util로 역할을 분리합니다. 범위 상수는 `VR_BAND_WIDTH_PCT`만 사용합니다. |
| malformed bounds가 잘못된 값으로 이어질 수 있음 | 크래시 대신 `safeMax = safeMin` 등 보수적 보정을 적용하고, pure util 단위 테스트로 문서화합니다. |
| 공용 훅을 너무 일찍 만들 가능성 | 현재는 `StrategyCreator` 한 화면만 대상이므로 로컬 헬퍼로 제한합니다. 재사용처가 확인되면 콜백 주입형 훅으로 승격합니다. |
| invalid format이 조용히 fallback되는 것처럼 보일 수 있음 | 상태 업데이트를 건너뛰고 `onCommit` 반환값도 `currentCommittedValue`로 유지합니다. 전용 UX가 필요한 호출부는 `invalidFormatToastMessage`를 주입합니다. |

## 구현 전 체크리스트

- [ ] `rg "outOfRangeToast"`로 모든 참조 확인
- [ ] `StrategyCreatorMessageSet` 공통 키 추가
- [ ] 기존 멀티스플릿 토스트를 공통 키로 이동
- [ ] 순수 유틸 `normalizeDraftNumberToBounds` 추가
- [ ] 컨트롤러 내부 `commitClampedInput` 추가
- [ ] 클램프 기반 핸들러를 `commitClampedInput`으로 교체
- [ ] `stepHandlers` dependency에 `commitClampedInput` 추가
- [ ] VR/TVC 기본 성장률, 스마트 브레이크의 누락 메시지 문제 해결
- [ ] 타입체크와 관련 테스트 실행
