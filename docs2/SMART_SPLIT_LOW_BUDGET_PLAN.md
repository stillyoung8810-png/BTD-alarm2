# 스마트 스플릿 저예산 매수 가이드 계획서

## 목적

스마트 스플릿 전략의 일별 매매 실행 요약에서 남은 계획 예산이 1회 매수금보다 작은 경우, LOC/MOC 매수 가이드를 숨기고 예산 부족 안내를 노출하는 데이터 주도형 분기를 추가합니다. 컴포넌트에서 직접 예산을 비교하지 않고, 계산 레이어가 `isLowBudget` 상태를 만들어 UI/문구 빌더가 그 boolean만 읽도록 유지합니다.

## 현재 구조 검토

### 타입 레이어

- `types.ts`에는 `MultiSplitStrategy`, `MultiSplitIndicatorSnapshot` 등 저장 전략과 지표 스냅샷 타입이 있습니다.
- 일별 실행 결과 타입인 `MultiSplitGuideState`는 `types.ts`가 아니라 `supabase/functions/_shared/multiSplitShared.ts`에 정의되어 있고, `utils/multiSplitCalc.ts`가 이를 그대로 re-export합니다.
- 클라이언트 훅 `hooks/useMultiSplitExecution.ts`와 서버 배치 `supabase/functions/generate-daily-execution-summaries/index.ts` 모두 `calculateMultiSplitGuideState` 결과를 사용하므로, 상태 필드 확장은 이 공유 타입 한 곳에서 시작하는 것이 가장 단순합니다.

### 계산 레이어

- 핵심 계산 함수는 `supabase/functions/_shared/multiSplitShared.ts`의 `calculateMultiSplitGuideState`입니다.
- 현재 계산값:
  - `totalSeed = oneTimeAmount * totalSplitCount`
  - `totalInvested = targetHolding.totalCost`
  - `remainingBudget = max(0, totalSeed - totalInvested)`
  - `isSeedExhausted = totalInvested >= totalSeed`
  - `buyTrancheBudget = min(oneTimeAmount, remainingBudget)`
- “남은 예산이 1회분보다 작다”는 조건은 이미 계산 함수 내부에서 필요한 값이 모두 존재합니다.
- 현재 프로덕션의 첫 매수 판정은 `currentQuantity <= HOLDINGS_QTY_EPSILON || avgPrice <= MIN_VALID_UNIT_COST`입니다. 승인된 첫 매수 안내 문구를 도입할 때는 “보유 수량은 있는데 평단가만 깨진 상태”가 첫 매수로 오인되지 않도록 `isFirstBuy`와 `isDataError`를 분리합니다.
- 로컬 프로덕션 코드의 `calculateMultiSplitBuyGuide`는 이미 `MOC_SAFETY_BUFFER_MULTIPLIER` 상수를 사용하고, LOC/MOC 단가가 유효하지 않으면 나눗셈 전에 반환하는 분모 가드를 가지고 있습니다. 스니펫도 이 안전성을 맞춰 매직 넘버와 암묵적 0 나눗셈을 제거합니다.

### 라인 빌더

- 프롬프트의 `buildMultiSplitSummaryLines`는 현재 코드 기준 실제 함수명이 `buildMultiSplitExecutionSummaryLines`입니다.
- 위치는 `supabase/functions/_shared/multiSplitExecutionMessages.ts`입니다.
- 이 함수는 앱의 `TradeExecutionModal.tsx`, 텔레그램/일별 요약 포맷터 `utils/dailyExecutionSummary.ts`, 서버 배치가 공유하는 문구 조립 경로에 연결되어 있습니다.
- 현재 첫 매수 상태(`currentQuantity <= 0`)에서는 `보유 수량이 없습니다.`를 출력하고 즉시 반환합니다. 승인된 정책에 따라 이 문구를 스마트 스플릿용 첫 매수 안내로 바꾸는 계획을 포함합니다.

## 결정해야 할 의미

`remainingBudget < oneTimeAmount`는 수학적으로 `remainingBudget === 0`도 포함합니다. 다만 현재 코드에는 이미 `isSeedExhausted`가 있어 0 예산은 “시드 소진” 상태와 겹칩니다.

계획안에서는 저예산 상태를 아래처럼 분리합니다.

```ts
const isLowBudget = remainingBudget > 0 && remainingBudget < oneTimeAmount;
```

이유는 다음과 같습니다.

- `remainingBudget === 0`은 이미 `isSeedExhausted === true`인 완전 소진 상태입니다.
- 저예산 안내는 “마지막 잔여 예산은 있으나 1회분보다 부족해 정상 LOC/MOC 가이드가 맞지 않는 상태”를 표현하는 것이 더 명확합니다.
- 사용자가 매도해 원가가 낮아지면 `remainingBudget`이 다시 커질 수 있고, 다음 계산에서 `isLowBudget` 또는 `isSeedExhausted`가 자연스럽게 해제될 수 있습니다.

승인 시 이 정의로 진행합니다. 만약 제품 문구상 `remainingBudget === 0`도 “매수금 부족”으로 표시해야 한다면 조건을 `remainingBudget < oneTimeAmount`로 바꾸면 됩니다.

## 수정 계획

### 1. 상태 확장

대상: `supabase/functions/_shared/multiSplitShared.ts`

- `MultiSplitGuideState`에 `isLowBudget: boolean` 추가.
- 첫 매수 정의를 `currentQuantity <= HOLDINGS_QTY_EPSILON`로 좁히고, 평단가 이상 상태는 `isDataError: boolean`으로 분리.
- `calculateMultiSplitGuideState`에서 `remainingBudget` 계산 직후 `isLowBudget` 계산.
- `baseState`에 `isLowBudget`, `isDataError` 포함.
- 컴포넌트나 훅에서 계산하지 않습니다.

### 1-1. 계산 안전성 유지

대상: `supabase/functions/_shared/multiSplitShared.ts`, `docs2/smart-split-low-budget-snippets.ts`

- 프로덕션 코드에는 이미 `MOC_SAFETY_BUFFER_MULTIPLIER`가 있으므로 실제 구현 단계에서는 이를 재사용하고 새 중복 상수를 만들지 않습니다.
- 시뮬레이션 스니펫은 독립 파일이므로 `MOC_PRICE_BUFFER_MULTIPLIER`를 파일 상단에 두어 `1.15` 하드코딩을 제거합니다.
- LOC/MOC 수량 계산은 `locUnitCost > MIN_VALID_UNIT_COST`, `mocUnitCost > MIN_VALID_UNIT_COST`를 통과한 뒤에만 나눗셈을 수행합니다.
- 단가가 유효하지 않은 경우 해당 매수 수량은 `0`으로 두며, `isLowBudget` 및 매도 가이드 계산과 섞지 않습니다.

### 2. 문구 딕셔너리 확장

대상: `supabase/functions/_shared/multiSplitExecutionMessages.ts`

- 메시지 ID 추가:
  - `multiSplit.buyGuide`
  - `multiSplit.insufficientFunds`
  - `multiSplit.firstBuyGuide`
  - `multiSplit.dataErrorNotice`
- 한국어:
  - `multiSplit.buyGuide`: `매수 가이드`
  - `multiSplit.insufficientFunds`: `매수금 부족`
  - `multiSplit.firstBuyGuide`: `첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.`
  - `multiSplit.dataErrorNotice`: `평단가 정보를 불러올 수 없습니다.`
  - `multiSplit.riskCut`: `위험 관리 손절`
- 영어:
  - `multiSplit.buyGuide`: `Buy guide`
  - `multiSplit.insufficientFunds`: `Insufficient Funds`
  - `multiSplit.firstBuyGuide`: `For the first buy, feel free to buy anytime during market hours using one buy tranche as the reference.`
  - `multiSplit.dataErrorNotice`: `Unable to load average price information.`
  - `multiSplit.riskCut`: `Risk management stop-loss`

문구는 라인 빌더의 메시지 딕셔너리에서 조합하고, 로직 내부에 한국어/영어 문자열을 직접 하드코딩하지 않습니다.

### 3. 라인 빌더 조건 분기

대상: `supabase/functions/_shared/multiSplitExecutionMessages.ts`

- `MultiSplitExecutionSummaryData`의 `Pick` 목록에 `isLowBudget` 포함.
- `isFirstBuy === true`이면:
  - 기존 `보유 수량이 없습니다.` 대신 `첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.` 출력.
  - 첫 매수 전에는 평단가가 없어 LOC/MOC·익절·손절 가격을 안전하게 산출할 수 없으므로 이 안내 라인만 출력하고 반환.
- `isDataError === true`이면:
  - `평단가 정보를 불러올 수 없습니다.` 출력 후 반환.
  - 보유 수량이 존재하므로 첫 매수 안내를 출력하지 않습니다.
- `isLowBudget === true`이면:
  - `displayLocBuy` 라인 추가 안 함.
  - `displayMocBuy` 라인 추가 안 함.
  - `매수 가이드: 매수금 부족` 라인 추가.
- `isLowBudget === false`이면:
  - 기존 LOC/MOC 라인 그대로 출력.
- 매도 라인:
  - `displayMainTakeProfit`
  - `displayIntermediateTakeProfit`
  - `riskCutQty`
  는 `isLowBudget`과 독립적으로 유지합니다.

### 4. 데이터 파이프라인 영향

- `hooks/useMultiSplitExecution.ts`는 `calculateMultiSplitGuideState` 결과를 그대로 반환하므로 별도 계산 추가가 필요 없습니다.
- `utils/dailyExecutionSummary.ts`는 `buildMultiSplitExecutionSummaryLines`에 데이터를 전달만 하므로 추가 계산이 필요 없습니다.
- `supabase/functions/generate-daily-execution-summaries/index.ts`도 공유 계산 결과를 그대로 포맷터에 넘기므로 동일하게 동작합니다.

## 테스트 계획

### 순수 함수 단위

대상 후보:

- `utils/multiSplitCalc.test.ts`
- `utils/multiSplitCrossValidation.test.ts`
- `hooks/useMultiSplitExecution.test.ts`

테스트 케이스:

- 첫 매수 상태(`currentQuantity <= 0`): `첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.` 출력, LOC/MOC/매도 라인 숨김.
- 데이터 이상 상태(`currentQuantity > 0 && avgPrice <= MIN_VALID_UNIT_COST`): 첫 매수 안내 대신 `평단가 정보를 불러올 수 없습니다.` 출력.
- `remainingBudget > oneTimeAmount`: `isLowBudget === false`, LOC/MOC 라인 정상 출력.
- `remainingBudget === oneTimeAmount`: `isLowBudget === false`, LOC/MOC 라인 정상 출력.
- `0 < remainingBudget < oneTimeAmount`: `isLowBudget === true`, LOC/MOC 라인 숨김, `매수 가이드: 매수금 부족` 출력, 매도 라인 유지.
- `remainingBudget === 0`: `isSeedExhausted === true`; 저예산 라벨 포함 여부는 승인된 정의에 맞춰 테스트.

### 회귀 확인

- 스마트 스플릿이 아닌 MA/TVC/무손절 다분할 라인 생성에는 영향 없어야 합니다.
- 리스크 컷 라벨 변경은 한국어/영어 스냅샷 또는 문자열 기대값 테스트 업데이트가 필요합니다.
- 스니펫/프로덕션 모두 MOC 가격 버퍼는 이름 있는 상수를 사용해야 하며, LOC/MOC 단가가 0 이하일 때 나눗셈을 수행하지 않는지 확인합니다.

## 오버엔지니어링 방지 체크

- 새 전역 상태 없음.
- 새 훅 없음.
- 컴포넌트 내부 계산 없음.
- 기존 `MultiSplitGuideState` 데이터 파이프라인 재사용.
- 문구는 기존 메시지 딕셔너리 확장.
- 계산은 `calculateMultiSplitGuideState` 한 곳에서 끝냄.
