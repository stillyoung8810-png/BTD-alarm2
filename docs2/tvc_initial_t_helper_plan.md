# TVC Initial T Helper 1:1 배선 계획서

## 목표
`초기 T 값` 입력란 하단에 helper text만 추가합니다. 변경 범위는 아래 3개 파일로 제한합니다.

- `constants/messages/strategyCreatorMessages.ts`
- `components/strategies/VrBandStrategyForm.tsx`
- `components/strategyCreator/StrategyCreator.tsx`

추가할 문구는 아래와 같습니다.

- `ko`: `첫 사이클의 목표 평가금이에요. 시작할 때 이 금액만큼 주식을 보유하는 것을 권장해요.`
- `en`: `Target valuation for the first cycle. It is recommended to hold this amount of stock at the start.`

## 현재 AST 사실
1. `components/strategyCreator/useStrategyCreatorController.tsx`
   - `const copy = getStrategyCreatorMessages(lang);`로 메시지를 읽습니다.
   - 훅 반환 객체에 이미 `copy`가 포함되어 있으므로 `StrategyCreator.tsx`는 `controller.copy.*` 경로를 그대로 사용할 수 있습니다.
   - 이 파일은 이번 작업의 수정 대상이 아닙니다.

2. `components/strategyCreator/StrategyCreator.tsx`
   - `case 'vr_band_config'` 분기에서 `<VrBandStrategyForm ... />`를 생성합니다.
   - 즉, helper text를 VR 폼까지 전달하는 상위 배선 노드는 이미 존재합니다.

3. `components/strategies/VrBandStrategyForm.tsx`
   - `VrBandStrategyFormProps`에는 현재 helper 전용 prop이 없습니다.
   - `초기 T 값` 필드는 별도 재사용 컴포넌트가 아니라, 아래 inline subtree로 직접 렌더링됩니다.
     - `<label htmlFor="vr-initial-v">`
     - `<div className="relative">`
     - `<DraftNumberInput id="vr-initial-v" ... />`
     - 기존 validation `<p>`
   - 현재 파일 AST에는 `LabeledNumberField` 심볼이 없습니다.

4. `constants/messages/strategyCreatorMessages.ts`
   - `StrategyCreatorMessageSet` 인터페이스에는 아직 `vrBand` property가 없습니다.
   - 다만 `useStrategyCreatorController.tsx`에는 `copy.vrBand?.outOfRangeToast`를 읽는 optional bridge가 이미 있어, `controller.copy.vrBand.*` 형태의 확장은 현재 코드 방향과 충돌하지 않습니다.

## 목표 심볼 배선

```text
STRATEGY_CREATOR_MESSAGES[lang].vrBand.initialTHelper
  -> getStrategyCreatorMessages(lang)
  -> useStrategyCreatorController().copy
  -> StrategyCreator.tsx: controller.copy.vrBand.initialTHelper
  -> <VrBandStrategyForm initialTHelper={...} />
  -> VrBandStrategyFormProps.initialTHelper
  -> VrBandStrategyForm({ initialTHelper })
  -> initial T field subtree (id="vr-initial-v")
  -> helper text node rendered under the input
```

## 파일별 계획

### 1. `constants/messages/strategyCreatorMessages.ts`

대상 AST 노드:

- `InterfaceDeclaration` `StrategyCreatorMessageSet`
- 위 인터페이스 내부의 `PropertySignature` `vrBand`
- `VariableDeclaration` `STRATEGY_CREATOR_MESSAGES`
- `ObjectLiteralExpression` `ko`
- `ObjectLiteralExpression` `en`

배선 계획:

1. `StrategyCreatorMessageSet`에 `vrBand` 메시지 그룹을 추가합니다.
2. `vrBand` 그룹 안에 `initialTHelper: string`을 추가합니다.
3. `STRATEGY_CREATOR_MESSAGES.ko.vrBand.initialTHelper`에 한국어 문구를 넣습니다.
4. `STRATEGY_CREATOR_MESSAGES.en.vrBand.initialTHelper`에 영어 문구를 넣습니다.

추가 후 기대 경로:

```text
getStrategyCreatorMessages(lang).vrBand.initialTHelper
```

문구 값:

- `ko`: `첫 사이클의 목표 평가금이에요. 시작할 때 이 금액만큼 주식을 보유하는 것을 권장해요.`
- `en`: `Target valuation for the first cycle. It is recommended to hold this amount of stock at the start.`

주의:

- 이번 계획은 새 helper 문구만 `strategyCreatorMessages.ts`에 추가합니다.
- 기존 VR 라벨 전체를 `vrMessages.ts`에서 `strategyCreatorMessages.ts`로 이관하는 리팩터링은 포함하지 않습니다.

### 2. `components/strategyCreator/StrategyCreator.tsx`

대상 AST 노드:

- `SwitchCase` `case 'vr_band_config'`
- 해당 분기의 `JsxElement` 또는 `JsxSelfClosingElement` `<VrBandStrategyForm>`
- 새 `JsxAttribute` `initialTHelper`

배선 계획:

1. `vr_band_config` 분기에서 `<VrBandStrategyForm>` 호출부에 새 prop 하나만 추가합니다.
2. prop 값은 아래 경로를 그대로 사용합니다.

```tsx
initialTHelper={controller.copy.vrBand.initialTHelper}
```

이 노드의 역할:

- `strategyCreatorMessages.ts`에서 온 문자열 심볼을 VR 폼으로 내려보내는 단일 상위 배선 노드입니다.
- 상태, 핸들러, 계산 로직, 검증 로직은 건드리지 않습니다.

### 3. `components/strategies/VrBandStrategyForm.tsx`

대상 AST 노드:

- `InterfaceDeclaration` `VrBandStrategyFormProps`
- 컴포넌트 파라미터의 `ObjectBindingPattern`
- `initialV` 입력 필드 subtree

배선 계획:

1. `VrBandStrategyFormProps`에 아래 prop을 추가합니다.

```ts
initialTHelper?: string;
```

2. 컴포넌트 파라미터 구조분해에 `initialTHelper`를 추가합니다.
3. `초기 T 값` 필드의 실제 sink node는 `id="vr-initial-v"`를 가진 inline subtree이므로, 이 subtree 바로 아래에서 `initialTHelper`를 소비합니다.
4. 렌더링 순서는 아래처럼 고정합니다.
   - `DraftNumberInput`
   - helper text
   - 기존 validation message

중요 사실:

- 사용자 요구사항에는 `LabeledNumberField`로의 `helperText={props.initialTHelper}` 배선이 적혀 있지만, 현재 `VrBandStrategyForm.tsx` AST에는 `LabeledNumberField` 심볼이 없습니다.
- 따라서 이번 3파일 한정 배선 계획에서는 `초기 T 값`의 **기존 inline field subtree**를 helper text sink로 사용합니다.
- `LabeledNumberField` 추출/도입 또는 공통 microcopy 컴포넌트 리팩터링은 별도 작업이며, 이번 계획 범위에 넣지 않습니다.

## 비범위(절대 포함하지 않음)

- `useStrategyCreatorController.tsx` 수정
- `constants/vrMessages.ts` 수정
- 시뮬레이션/엔진/Supabase shared `.ts` 코드 수정
- 상태 관리 추가
- 계산 로직 변경
- validation/clamp 로직 변경
- CSS 클래스 신규 설계
- `LabeledNumberField` 추출/import 리팩터링

## 완료 판정 기준

- `strategyCreatorMessages.ts`에 `vrBand.initialTHelper`가 `ko`, `en` 모두 존재합니다.
- `StrategyCreator.tsx`에서 `<VrBandStrategyForm initialTHelper={controller.copy.vrBand.initialTHelper} />` 경로가 성립합니다.
- `VrBandStrategyForm.tsx`가 `initialTHelper?: string` prop을 받아 `초기 T 값` 입력란 아래에서만 소비합니다.
- 위 3개 파일 외의 파일은 이 계획 범위에 포함되지 않습니다.
