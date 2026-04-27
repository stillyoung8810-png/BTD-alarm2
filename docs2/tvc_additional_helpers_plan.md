# TVC Additional Helpers 1:1 배선 계획서

## 목표
TVC 설정 폼의 아래 3개 입력란 하단에 helper text를 추가하기 위한 **배선 계획만** 정의합니다.  
이번 문서는 UI 문자열 연결만 다루며, 계산 로직/검증 로직/시뮬레이션 코드는 범위에서 제외합니다.

- `baseGrowthRatePct` (`기본 목표 성장률`)
- `vrPoolUsagePct` 필드가 렌더링하는 `매수 시 예수금 사용 비율`
- `smartBrakeThresholdPct` (`스마트 브레이크 임계치`)

## 대상 문구

### 1. 기본 목표 성장률
- `ko`: `매 사이클 달성하고 싶은 최대 성장률이에요. 실제로는 현금 상황에 맞춰 0~50% 정도로 성장률이 조절돼요.`
- `en`: `The maximum target growth rate per cycle. The actual rate is adjusted to around 0-50% based on cash availability.`

### 2. 매수 시 예수금 사용 비율
- `ko`: `매 사이클 시작 시 남은 현금에서 예약 매수에 사용할 비율이에요.`
- `en`: `The ratio of remaining cash to use for reserve buying at the start of each cycle.`

### 3. 스마트 브레이크 임계치
- `ko`: `현금 소진을 막기 위해, 목표 성장률을 0에 가깝게 멈춰 세우는 비상 브레이크예요.`
- `en`: `An emergency brake that brings the target growth rate close to zero to prevent cash depletion.`

## 현재 코드 상태

### 1. `controller.copy` 경로는 이미 존재함
`components/strategyCreator/useStrategyCreatorController.tsx`는 현재 아래처럼 `getStrategyCreatorMessages(lang)`를 `copy`로 읽고 반환합니다.

```444:445:components/strategyCreator/useStrategyCreatorController.tsx
  const copy = getStrategyCreatorMessages(lang);
  const commonCopy = getCommonMessages(lang);
```

즉, 새 helper key가 `StrategyCreatorMessageSet['vrBand']`에만 추가되면, `StrategyCreator.tsx`는 `controller.copy.vrBand.*` 경로로 바로 접근할 수 있습니다.

### 2. `vrBand` 메시지 그룹은 이미 존재함
현재 `constants/messages/strategyCreatorMessages.ts`에는 `vrBand` 그룹이 이미 있고, `initialTHelper`가 배선되어 있습니다.

```94:96:constants/messages/strategyCreatorMessages.ts
  vrBand: {
    initialTHelper: string;
  };
```

이번 작업은 이 기존 `vrBand` 객체를 **확장**하는 방향입니다.

### 3. `VrBandStrategyForm`은 이미 helper prop 1개를 받고 있음
현재 `components/strategies/VrBandStrategyForm.tsx`는 `initialTHelper?: string`을 prop으로 받아서 `초기 T 값` 입력 아래에 helper를 렌더링합니다.

```16:20:components/strategies/VrBandStrategyForm.tsx
export interface VrBandStrategyFormProps {
  lang: 'ko' | 'en';
  showErrors: boolean;
  initialTHelper?: string;
  vrMode: VrBandStrategyParams['vrMode'];
```

즉, 이번 3개 helper는 이 패턴을 그대로 복제하면 됩니다.

### 4. `매수 시 예수금 사용 비율`의 실제 prop 이름 확인 결과
Zero Assumption 요구에 따라 현재 코드 AST를 확인한 결과, 해당 필드의 정확한 prop 이름은 `vrPoolUsagePct`입니다.  
렌더 subtree와 handler 이름은 아래와 같습니다.

```273:285:components/strategies/VrBandStrategyForm.tsx
            <label htmlFor="vr-pool-usage" className={VR_LABEL_CLASS_NAME}>
              {vrT.poolUsage}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-pool-usage"
                value={vrPoolUsagePct}
                onCommit={onVrPoolUsagePctChange}
```

따라서 이번 계획서에서는 `poolUsageRateBuy` 같은 가정 이름을 쓰지 않고, **실제 코드 심볼인 `vrPoolUsagePct`**를 기준으로 연결을 정의합니다.

### 5. 현재 VR 폼은 `LabeledNumberField`를 사용하지 않음
현재 `VrBandStrategyForm.tsx`의 3개 대상 입력은 모두 **inline subtree**로 렌더링됩니다.  
따라서 helper 연결도 `LabeledNumberField`가 아니라 각 입력 subtree 바로 아래의 `<p>` sink node에 배선해야 합니다.

또한 helper 스타일은 이미 존재하는 `STRATEGY_CREATOR_STYLES.helperText`를 재사용할 수 있습니다.

```27:27:components/strategyCreator/styles.ts
  helperText: 'text-[11px] font-medium text-slate-500 dark:text-slate-400',
```

## 목표 심볼 배선

```text
STRATEGY_CREATOR_MESSAGES[lang].vrBand.baseGrowthRatePctHelper
  -> getStrategyCreatorMessages(lang)
  -> useStrategyCreatorController().copy
  -> StrategyCreator.tsx
  -> <VrBandStrategyForm baseGrowthRatePctHelper={controller.copy.vrBand.baseGrowthRatePctHelper} />
  -> VrBandStrategyFormProps.baseGrowthRatePctHelper
  -> VrBandStrategyForm({ baseGrowthRatePctHelper })
  -> id="vr-base-growth-rate" input subtree 아래 helper text node

STRATEGY_CREATOR_MESSAGES[lang].vrBand.poolUsagePctHelper
  -> getStrategyCreatorMessages(lang)
  -> useStrategyCreatorController().copy
  -> StrategyCreator.tsx
  -> <VrBandStrategyForm poolUsagePctHelper={controller.copy.vrBand.poolUsagePctHelper} />
  -> VrBandStrategyFormProps.poolUsagePctHelper
  -> VrBandStrategyForm({ poolUsagePctHelper })
  -> id="vr-pool-usage" input subtree 아래 helper text node

STRATEGY_CREATOR_MESSAGES[lang].vrBand.smartBrakeThresholdPctHelper
  -> getStrategyCreatorMessages(lang)
  -> useStrategyCreatorController().copy
  -> StrategyCreator.tsx
  -> <VrBandStrategyForm smartBrakeThresholdPctHelper={controller.copy.vrBand.smartBrakeThresholdPctHelper} />
  -> VrBandStrategyFormProps.smartBrakeThresholdPctHelper
  -> VrBandStrategyForm({ smartBrakeThresholdPctHelper })
  -> id="vr-smart-brake-threshold" input subtree 아래 helper text node
```

## 파일별 계획

### 1. `constants/messages/strategyCreatorMessages.ts`

대상 AST 노드:

- `InterfaceDeclaration` `StrategyCreatorMessageSet`
- 위 인터페이스 내부 `PropertySignature` `vrBand`
- `VariableDeclaration` `STRATEGY_CREATOR_MESSAGES`
- `ObjectLiteralExpression` `ko`
- `ObjectLiteralExpression` `en`

현재 상태:

- `vrBand`는 이미 존재하지만 `initialTHelper` 하나만 가지고 있습니다.

추가할 key:

- `baseGrowthRatePctHelper: string`
- `poolUsagePctHelper: string`
- `smartBrakeThresholdPctHelper: string`

배선 계획:

1. `StrategyCreatorMessageSet['vrBand']`에 위 3개 `PropertySignature`를 추가합니다.
2. `STRATEGY_CREATOR_MESSAGES.ko.vrBand`에 한국어 문구 3개를 추가합니다.
3. `STRATEGY_CREATOR_MESSAGES.en.vrBand`에 영어 문구 3개를 추가합니다.
4. 기존 `initialTHelper`는 유지하고, 같은 객체 아래에 나란히 확장합니다.

추가 후 기대 타입 구조:

```ts
vrBand: {
  initialTHelper: string;
  baseGrowthRatePctHelper: string;
  poolUsagePctHelper: string;
  smartBrakeThresholdPctHelper: string;
};
```

### 2. `components/strategyCreator/StrategyCreator.tsx`

대상 AST 노드:

- `SwitchCase` `case 'vr_band_config'`
- 해당 분기의 `<VrBandStrategyForm ... />`
- 새 `JsxAttribute` 3개

현재 상태:

- 이미 `initialTHelper={controller.copy.vrBand.initialTHelper}`가 전달되고 있습니다.

추가할 배선:

```tsx
baseGrowthRatePctHelper={controller.copy.vrBand.baseGrowthRatePctHelper}
poolUsagePctHelper={controller.copy.vrBand.poolUsagePctHelper}
smartBrakeThresholdPctHelper={
  controller.copy.vrBand.smartBrakeThresholdPctHelper
}
```

역할:

- 메시지 상수의 새 심볼 3개를 `VrBandStrategyForm`으로 전달하는 상위 `JsxAttribute` 배선입니다.
- `controller` 내부 상태, handler, 계산식은 수정하지 않습니다.

### 3. `components/strategies/VrBandStrategyForm.tsx`

대상 AST 노드:

- `InterfaceDeclaration` `VrBandStrategyFormProps`
- 컴포넌트 파라미터 `ObjectBindingPattern`
- `id="vr-base-growth-rate"` 입력 subtree
- `id="vr-pool-usage"` 입력 subtree
- `id="vr-smart-brake-threshold"` 입력 subtree

현재 상태:

- `initialTHelper?: string`만 존재합니다.
- 3개 대상 필드는 모두 inline subtree이며 `LabeledNumberField` 심볼은 없습니다.

추가할 prop:

```ts
baseGrowthRatePctHelper?: string;
poolUsagePctHelper?: string;
smartBrakeThresholdPctHelper?: string;
```

배선 계획:

1. `VrBandStrategyFormProps`에 위 3개 optional helper prop을 추가합니다.
2. 컴포넌트 파라미터 구조분해에 동일 이름 3개를 추가합니다.
3. 각 입력 subtree 바로 아래에 helper sink를 추가합니다.
4. helper가 비어 있지 않을 때만 `<p>`를 렌더링합니다.
5. 새 CSS 클래스는 만들지 않고, 기존 `STRATEGY_CREATOR_STYLES.helperText`만 재사용합니다.

필드별 sink 위치:

#### a. `baseGrowthRatePct`

현재 입력 노드:

```258:269:components/strategies/VrBandStrategyForm.tsx
          <div className="space-y-3">
            <label htmlFor="vr-base-growth-rate" className={VR_LABEL_CLASS_NAME}>
              {vrT.baseGrowthRatePct}
            </label>
            <DraftNumberInput
              id="vr-base-growth-rate"
              value={vrBaseGrowthRatePct}
              onCommit={onVrBaseGrowthRatePctChange}
```

배선 위치:

- `DraftNumberInput` 다음
- 별도 validation 메시지 없음
- 따라서 helper `<p>`가 바로 다음 형제로 들어갑니다.

#### b. `vrPoolUsagePct`

현재 입력 노드:

```272:286:components/strategies/VrBandStrategyForm.tsx
          <div className="space-y-3">
            <label htmlFor="vr-pool-usage" className={VR_LABEL_CLASS_NAME}>
              {vrT.poolUsage}
            </label>
            <div className="relative">
              <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <DraftNumberInput
                id="vr-pool-usage"
                value={vrPoolUsagePct}
                onCommit={onVrPoolUsagePctChange}
```

배선 위치:

- `</div>`(`relative` wrapper) 직후
- helper `<p>`를 삽입

#### c. `smartBrakeThresholdPct`

현재 입력 노드:

```289:303:components/strategies/VrBandStrategyForm.tsx
          <div className="space-y-3">
            <label
              htmlFor="vr-smart-brake-threshold"
              className={VR_LABEL_CLASS_NAME}
            >
              {vrT.smartBrakeThresholdPct}
            </label>
            <DraftNumberInput
              id="vr-smart-brake-threshold"
              value={vrSmartBrakeThresholdPct}
              onCommit={onVrSmartBrakeThresholdPctChange}
```

배선 위치:

- `DraftNumberInput` 다음
- 별도 validation 메시지 없음
- helper `<p>`가 바로 다음 형제로 들어갑니다.

## 비범위

- `useStrategyCreatorController.tsx` 수정
- 상태 관리 추가
- clamp/validation 로직 수정
- `constants/vrMessages.ts` 수정
- 시뮬레이션/엔진/Supabase shared 코드 수정
- 새 CSS 클래스 추가
- 공통 `LabeledNumberField` 추출/도입 리팩터링

## 완료 판정 기준

- `strategyCreatorMessages.ts`의 `vrBand` 객체에 helper key 3개가 추가되어 있습니다.
- `StrategyCreator.tsx`의 `<VrBandStrategyForm>` 호출부가 `controller.copy.vrBand.*`를 통해 helper prop 3개를 전달합니다.
- `VrBandStrategyForm.tsx`가 helper prop 3개를 받고, 아래 3개 입력란 하단에서만 소비합니다.
  - `vr-base-growth-rate`
  - `vr-pool-usage`
  - `vr-smart-brake-threshold`
- 위 3개 파일 외의 변경은 계획 범위에 포함되지 않습니다.
