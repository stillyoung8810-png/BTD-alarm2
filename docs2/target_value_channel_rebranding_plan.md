---
name: 타겟 밸류 채널 전면 리브랜딩 계획
overview: 기존 VR 축을 타겟 밸류 채널(Target Value Channel)로 전면 교체하고, 새 T/CR/스마트 브레이크 수식을 Simulation Pass 전 단계에서 고정하는 계획서입니다.
stage: simulation-only
status: draft
---

# 타겟 밸류 채널 전면 리브랜딩 계획

## 문서 목적

이 문서는 프로덕션 구현 전에 아래 3가지를 고정하기 위한 Step 1-2 산출물입니다.

1. 현재 시스템의 `VR / vrBand / vrSnapshot / G / initialV / Pool` 축을 어디까지 제거해야 하는지 범위를 명확히 정합니다.
2. 새 브랜드인 `타겟 밸류 채널 (Target Value Channel)` 기준으로 타입, DB 컬럼, 파일명, UI 문구를 한 번에 맞춥니다.
3. 새 수학 엔진은 `docs2/target_value_channel_simulation.ts`에서 순수 함수로만 검증하고, Simulation Pass 이후에만 실제 코드 구현으로 넘어갑니다.

## 현재 시스템 기준 검토 결론

이번 프롬프트는 현재 워크스페이스와 비교했을 때 그대로 사용할 수는 없었고, 아래처럼 수정해야 일관성이 맞습니다.

1. 원본 프롬프트의 `SmartSplit` 명칭은 전부 폐기합니다.
   - 최종 브랜드와 내부 식별자는 모두 `TargetValueChannel` 계열로 통일합니다.
2. 원본 프롬프트의 `Multiplier` 기반 수식은 사용하지 않습니다.
   - 이미 합의된 수식인 `R_base * CR` / `R_base * CR^2` 모델을 최종본으로 고정합니다.
3. `CR cap = 1.0` 규칙은 제거합니다.
   - 대규모 적립금 유입 시 더 큰 목표 평가금 상승을 허용합니다.
4. 안전모드는 `CR <= smartBrakeThreshold`일 때 발동합니다.
5. `initialCapital`과 `initialT`는 같은 값이 아닙니다.
   - UI의 초기 투입 비중 슬라이더로 `initialTargetValue`와 `initialAvailableCash`를 유도합니다.
6. 매수/매도 표 생성 로직은 유지합니다.
   - 이번 리브랜딩은 `T` 계산 엔진과 명칭 체계만 바꾸고, 상단/하단 밴드 및 주문표 생성 계약은 그대로 재사용합니다.

## 실제 확인한 현재 코드 축

아래 파일들을 직접 확인한 뒤 계획을 작성했습니다.

- `types.ts`
- `supabase/functions/_shared/types.ts`
- `utils/vrBandStrategy.ts`
- `components/strategies/VrBandStrategyForm.tsx`
- `constants/vrMessages.ts`
- `components/VrPortfolioSummary.tsx`
- `components/VrOrderModal.tsx`
- `hooks/useVrOrders.ts`
- `src/components/StrategyCreator/utils.ts`
- `hooks/usePortfolioMutations.ts`
- `utils/portfolioNormalize.ts`
- `services/portfolioService.ts`
- `services/portfolioMutationService.ts`
- `utils/dailyExecutionSummary.ts`
- `supabase/functions/_shared/maSummaryShared.ts`
- `supabase/functions/_shared/vrSnapshotRefresh.ts`
- `supabase/functions/refresh-vr-snapshots/index.ts`
- `supabase/migrations/20260313000000_add_vr_snapshot_to_portfolios.sql`

이 확인 결과, 현재 시스템은 단순 UI 카피가 아니라 아래 계약 전체가 VR 명칭에 묶여 있습니다.

- 수학 함수: `calculateNextV`
- 저장 구조: `strategy.vrBand`, `vr_snapshot`
- 스냅샷 타입: `VrSnapshot`, `currentV`, `pool`
- 주문표 행: `poolAfter`
- 사용자 표면: `VR 예약 주문`, `VR 전략 시작`, `Initial V`, `Pool`
- 서버 요약: `V`, `Pool`, `VR band rules`

즉, 이번 작업은 반드시 **전면 치환 + 하드 리셋**으로 가야 합니다.

## 확정 아키텍처

### 1) 브랜드 / 식별자

- 최종 전략명: `타겟 밸류 채널`
- TS/React/Supabase 식별자: `TargetValueChannel...`
- DB snake_case 식별자: `target_value_channel...`
- 축약형 `tvc`는 이번 1차 리브랜딩에서는 사용하지 않습니다.
  - Why: 하드 리셋 직후에는 축약형보다 전체 이름이 더 안전하고 검색성이 높습니다.

### 2) 수학 모델

#### 핵심 변수

- `T`: 목표 평가금
- `CR = currentAvailableCash / currentT`
- `R_base`: 기본 목표 상승률
- `smartBrakeThreshold`: 안전모드 임계값
- `Adjustment`: 다음 사이클 반영용 입금/출금 금액

#### 저장 단위

- `baseGrowthRate`: DB/UI 정수 `1 ~ 20`
- `smartBrakeThreshold`: DB/UI 정수 `1 ~ 99`
- 계산 엔진 내부에서만 `/ 100` 하여 소수로 변환

#### 확정 수식

일반 구간:

```text
T_next = T_current × (1 + (R_base × CR)) + Adjustment
```

안전모드:

```text
T_next = T_current × (1 + (R_base × CR^2)) + Adjustment
```

안전모드 판정:

```text
CR <= smartBrakeThreshold
```

필수 방어 규칙:

- `currentT <= 0`이면 즉시 에러를 던집니다.
- 금액/비율 반올림은 양수/음수 대칭 공식을 사용합니다.
  - Why: 입금과 출금이 같은 절대값일 때 반올림 결과가 비대칭이면 장부에 1센트 단위 드리프트가 쌓일 수 있습니다.
- `cashRatio`는 `availableCash / currentT` 직후 비교에 사용하지 않고, `roundRate`와 동일한 정밀도로 먼저 반올림한 뒤 `smartBrakeThreshold`와 비교합니다.
  - Why: 임계값에 정확히 걸친 사이클에서 부동소수점 찌꺼기 때문에 안전모드가 누락되면, 브레이크가 걸려야 할 구간에서 일반모드가 유지될 수 있습니다.
- `Adjustment`는 모드 기준으로 부호를 강제합니다.
  - deposit: `+Math.abs(amount)`
  - withdraw: `-Math.abs(amount)`
  - none: `0`
- `nextAvailableCash = currentAvailableCash + Adjustment`
- `bandLow`, `bandHigh` 계산식은 유지합니다.
  - `bandLow = currentT × (1 - bandRateLower)`
  - `bandHigh = currentT × (1 + bandRateUpper)`
- 모든 순수 수학 함수와 주문표 생성 함수는 scattered `if (value < 0)` 검증 대신 중앙 `validateFinancialArgs`를 첫 검증 진입점으로 사용합니다.
- TVC 스니펫은 전략 파일 안에 로컬 `validateFinancialArgs`를 다시 정의하지 않습니다.
- 범위 상한(`max`)이나 정수(`integer`) 검증이 더 필요하면, shared validator를 먼저 확장하거나 shared wrapper를 추가한 뒤 TVC가 그 모듈을 import합니다.
  - Why: 리브랜딩 이후에도 입력 필드가 늘어날 수 있으므로, 검증 규칙을 한 군데로 모아야 수학 엔진과 주문표 엔진이 같은 방어 규약을 공유할 수 있습니다.

### 3) 초기 입력 전략

UI 입력은 아래처럼 재설계합니다.

- `총 투자 원금 (initialCapital)`
- `초기 투입 비중 슬라이더 (10% ~ 100%)`

저장 전 유도 규칙:

```text
initialTargetValue = initialCapital × (initialAllocationPct / 100)
initialAvailableCash = initialCapital - initialTargetValue
```

초기 저장 방향:

- 저장: `initialCapital`, `initialAllocationPct`, `initialTargetValue`, `initialAvailableCash`

Why:

- 대시보드 요약 카드와 설정 요약 UI에서 사용자의 원본 입력 비율을 다시 보여 주려면, `initialAllocationPct`를 source of truth로 보존해야 합니다.
- 역산으로 비율을 복원하면 `24.9999%` 같은 부동소수점 표기 드리프트가 생길 수 있으므로, 원본 정수 입력값을 그대로 저장하는 편이 더 안전합니다.

### 3-0) 입력 정밀도 계약

- `feeRatePct`는 UI에서 퍼센트 단위로 입력하고, 소수점 둘째 자리까지 허용합니다.
  - 예: `0.25`
- `bandUpperPct`, `bandLowerPct`는 UI에서 정수만 허용합니다.
  - 허용 범위: `1 ~ 100`
- `buildTargetValueChannelPersistedConfig(input)`는 `feeRatePct`의 소수점 자리수와 `band*Pct`의 정수 여부를 런타임 검증합니다.
- `bandLowerPct = 100` 같은 입력으로 파생값 `bandLow <= 0`가 만들어지면, `calculateBandsFromTargetValue()` 또는 snapshot 생성 단계에서 fail-fast 합니다.

Why:

- 수수료율은 실제 제품 UX에서 `0.25%`처럼 소수 둘째 자리 입력이 필요하지만, 밴드 폭은 정수 slider/input UX가 더 직관적입니다.
- 입력 레벨 규칙과 파생 수학 규칙을 분리하지 않으면, UI는 허용했는데 수학 엔진은 묵묵히 잘못된 밴드를 만드는 반쪽 계약이 생깁니다.

### 3-1) Creator 입력형 / Persisted config형 분리

전략 생성 UI draft와 실제 저장 계약은 같은 타입을 쓰지 않습니다. 또한 low-level slice helper와 최종 portfolio draft 결과를 같은 payload로 섞지 않습니다.

```text
TargetValueChannelCreatorInput = {
  initialCapital,
  initialAllocationPct,
  bandUpperPct,
  bandLowerPct,
  feeRatePct,
  baseGrowthRate,
  smartBrakeThreshold,
  minOrderQty,
  cashUsageRateBuyPct,
  cycleWeeks,
  adjustmentMode,
  adjustmentAmount
}

TargetValueChannelWizardDraftInput = {
  initialCapital,
  initialAllocationPct,
  bandUpperPct,
  bandLowerPct,
  baseGrowthRate,
  smartBrakeThreshold,
  minOrderQty,
  cashUsageRateBuyPct,
  cycleWeeks,
  adjustmentMode,
  adjustmentAmount
}

TargetValueChannelPersistedConfig = {
  initialCapital,
  initialAllocationPct,
  initialTargetValue,
  initialAvailableCash,
  bandRateUpper,
  bandRateLower,
  feeRate,
  baseGrowthRate,
  smartBrakeThreshold,
  minOrderQty,
  cashUsageRateBuy,
  cycleWeeks,
  adjustmentMode,
  adjustmentAmount
}
```

변환 원칙:

- `Portfolio.feeRate`는 계속 UI 퍼센트값(`0.25`)을 저장하는 전역 SSOT로 유지합니다.
- TVC의 `TargetValueChannelPersistedConfig.feeRate`는 위 퍼센트 SSOT를 `buildTargetValueChannelPersistedConfig()` 경계에서만 decimal(`0.0025`)로 파생한 계산 전용 값입니다.
- 따라서 TVC Creator는 별도 fee input을 draft에 넣지 않고, 메타 입력의 `feeRatePercent`를 `buildTargetValueChannelCreatorInput({ meta, draft })` 경계에서만 주입받습니다.
- `buildTargetValueChannelPersistedConfig(input)`만 Creator 입력을 persisted config로 변환합니다.
- `buildTargetValueChannelSliceEnvelope(input)`는 `strategy.targetValueChannel + targetValueChannelSnapshot`만 담는 low-level 저장 slice helper입니다.
- `buildTargetValueChannelPortfolioInsertEnvelope({ meta, draft, baseStrategy })`가 실제 DB insert에 사용하는 full runtime strategy + snapshot envelope를 만듭니다.
- 실제 insert payload는 read path가 복원하는 shape와 동일하게 `strategy.ma0~ma3 + strategy.targetValueChannel + target_value_channel_snapshot`를 함께 저장합니다.
- `buildTargetValueChannelPortfolioDraft({ meta, draft, baseStrategy })` 결과에는 low-level slice payload를 다시 실어 보내지 않습니다.
- `bandUpperPct`, `bandLowerPct`, `feeRatePct`, `cashUsageRateBuyPct`는 UI 입력 전용 필드입니다.
- `bandRateUpper`, `bandRateLower`, `feeRate`, `cashUsageRateBuy`는 저장/계산 전용 필드입니다.
- `baseGrowthRate`, `smartBrakeThreshold`는 합의대로 UI/DB에서 정수로 유지하고, 계산 엔진 안에서만 소수로 변환합니다.
- `adjustmentMode`는 `AdjustmentMode = 'none' | 'deposit' | 'withdraw'` 중 하나를 명시적으로 저장합니다.
- `adjustmentAmount`는 항상 `0 이상`의 절대값 입력만 받습니다.
- `adjustmentMode = 'none'`이면 Creator UI에서 `adjustmentAmount` 입력은 비활성화하고, persisted config에는 `adjustmentAmount = 0`으로 정규화합니다.
- `buildTargetValueChannelPersistedConfig(input)`는 타입 선언만 믿지 않고 `normalizeTargetValueChannelAdjustmentMode(raw)`를 먼저 호출합니다.
- `normalizeTargetValueChannelAdjustmentMode(raw)`는 공백이 섞인 문자열을 `trim()`한 뒤 `none | deposit | withdraw`만 통과시키고, 나머지는 `none`으로 폴백합니다.
- `isAdjustmentAmountInputEnabled()`와 `resolveSignedAdjustmentAmount()`도 raw 문자열을 직접 신뢰하지 않고, 같은 normalizer를 거친 mode만 소비합니다.
- 요약 카드, cycle 0 스냅샷 시딩, 다음 사이클 계산 엔진은 persisted config만 읽습니다.
- `buildTargetValueChannelPersistedConfig`, `createInitialTargetValueChannelSnapshot`, `calculateNextCycleState`, 주문표 생성 함수들은 모두 shared validator 경유 검증을 먼저 수행합니다.

### 3-1-1) Strategy defaults adapter 계약

- `buildTargetValueChannelStrategyBase()`는 내부에서 `TQQQ`, `20`, `60`, `1` 같은 로컬 기본값을 들고 있지 않습니다.
- 대신 `TargetValueChannelStrategyDefaultsAdapter`를 입력으로 받아 base strategy를 만듭니다.
- 실제 구현 단계의 owner module은 `constants/domain/targetValueChannelDefaults.ts`로 고정하고, 아래 상수를 export합니다.

```ts
import { STRATEGY_DEFAULTS } from '../constants/domain/financeRules';

export const TARGET_VALUE_CHANNEL_STRATEGY_DEFAULTS = {
  referenceStock: 'TQQQ',
  maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
  maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
  splitCount: 1,
} as const;
```

- TVC는 `TargetValueChannelStrategyDefaultsAdapter`를 이 상수에서만 주입받습니다.
- 현재 로컬에는 owner module이 아직 없으므로, `docs2/target_value_channel_simulation.ts`는 `SIMULATION_SAMPLE_TARGET_VALUE_CHANNEL_DEFAULTS`라는 낮은 이름으로만 샘플 adapter를 유지합니다.
- Creator path는 `buildTargetValueChannelStrategyBase(strategyDefaultsAdapter)`로 만든 `baseStrategy`를 `buildTargetValueChannelRuntimeStrategy()`와 `buildTargetValueChannelPortfolioDraft()`에 그대로 전달합니다.

### 3-1-2) Shared consumer isolation 계약

- `Strategy` fat interface 기술 부채가 남아 있더라도, TVC shared consumer는 filler `ma1 ~ ma3`를 실제 전략 의미로 해석하지 않습니다.
- TVC 판별은 `strategy.targetValueChannel != null` 같은 전용 type guard/helper에서만 수행합니다.
- TVC가 tracked stock을 외부 공용 surface에 노출할 때는 `ma0.stock`만 반환합니다.
- 즉, `Dashboard`, `QuickInputModal`, `TradeExecutionModal`, `AIImageInputModal` 같은 공용 consumer는 TVC 분기에서 `ma1.stock`, `ma2.stock`, `ma3.stock`를 직접 읽지 않습니다.
- 문서 스니펫 기준 helper owner는 아래 두 함수로 잠급니다.

```ts
export function isTargetValueChannelStrategy(
  strategy: Strategy | TargetValueChannelRuntimeStrategy,
): strategy is TargetValueChannelRuntimeStrategy {
  return getTargetValueChannelConfig(strategy) != null;
}

export function getTargetValueChannelTrackedStocks(args: {
  strategy: Strategy | TargetValueChannelRuntimeStrategy;
}): string[] {
  if (!isTargetValueChannelStrategy(args.strategy)) {
    return [];
  }

  return [args.strategy.ma0.stock];
}
```

Why:

- 리브랜딩 문서 안에 기본 종목/기간 숫자를 다시 박아 넣으면, 실제 구현의 기본값과 시뮬레이션 문서가 쉽게 갈라집니다.
- defaults adapter를 경계로 세우면 TVC 문서는 전략 구조 계약만 책임지고, 제품 기본값 소유권은 기존 SSOT에 남길 수 있습니다.
- shared consumer 격리를 문서에 못 박지 않으면, TVC를 위한 filler `ma1 ~ ma3`가 다시 공용 화면에서 실제 거래 종목처럼 읽히는 cross-contamination이 발생합니다.
- defaults adapter의 문자열 필드까지 fail-fast 하지 않으면 creator 저장 직후 조회 skip 같은 자기모순이 생길 수 있으므로, `referenceStock`도 `buildTargetValueChannelStrategyBase()` 경계에서 non-empty string으로 검증합니다.

### 3-2) Adjustment UI 계약

- Creator UI에는 `adjustmentMode` selector를 반드시 둡니다.
- selector 값은 `none`, `deposit`, `withdraw` 3개뿐입니다.
- `adjustmentAmount` 입력은 `adjustmentMode !== 'none'`일 때만 활성화합니다.
- 사용자는 음수를 입력하지 않습니다. 음수/양수 방향은 `resolveSignedAdjustmentAmount(mode, amount)`에서만 강제합니다.
- `adjustmentAmount` upper bound는 `PORTFOLIO_VALIDATION.MAX_WITHDRAWAL_AMOUNT_USD`를 단일 owner로 사용합니다.
- 따라서 UI에서 `-100`, `+100` 같은 부호 입력 UX는 사용하지 않습니다.

### 3-3) Adjustment read / normalize 계약

- `utils/portfolioNormalize.ts` 성격의 read path에는 `normalizeTargetValueChannelAdjustmentMode(raw)` helper를 별도로 둡니다.
- DB/캐시/레거시 JSON에서 읽은 raw 값은 `TargetValueChannelPersistedConfig.adjustmentMode`로 바로 캐스팅하지 않습니다.
- `adjustmentMode = 'deposit '`, `' withdraw'`, `null`, 예상치 못한 문자열처럼 runtime에서 들어온 값은 normalize 단계에서 먼저 정리합니다.
- invalid `adjustmentMode`는 `none`으로 safe fallback 하되, `[TVC_Normalize_Warning]` 계열 warning 로그를 남깁니다.
- normalize 이후에도 `adjustmentMode = 'none'`이면 `adjustmentAmount = 0`으로 함께 정규화합니다.
- `resolveSignedAdjustmentAmount()`는 normalize되지 않은 raw DB 문자열을 직접 받지 않습니다.

Why:

- TVC는 UI 입력 타입이 안전해 보여도, 실제 서비스에서는 DB row / 캐시 / 네트워크 응답이 언제든 dirty string을 보낼 수 있습니다.
- 이 read-path 계약이 비어 있으면 `adjustmentMode` switch가 런타임에서 예상 밖 값을 만나고, 그 여파가 `T_next`, 주문표, 요약 카드까지 연쇄 오염될 수 있습니다.

### 3-3-1) feeRate SSOT 계약

- `Portfolio.feeRate`는 퍼센트 단위 UI/저장 SSOT입니다.
- `TargetValueChannelPersistedConfig.feeRate`는 decimal 계산 전용 파생값입니다.
- normalize/read path는 TVC slice의 `feeRate`를 계산용으로 복원하되, 전역 표시용 수수료율은 `Portfolio.feeRate`를 기준으로 봅니다.
- `feeRatePct` upper bound는 `PORTFOLIO_VALIDATION.MAX_FEE_RATE_PERCENT`(현재 1%)를 단일 owner로 사용합니다.
- 구현 단계에서 `utils/portfolioNormalize.ts`의 과거 decimal-heal 로직은 TVC 전환 후 제거 대상입니다.

Why:

- 이 원칙을 먼저 못 박지 않으면, 어떤 화면은 `Portfolio.feeRate`를 보고 어떤 계산은 `targetValueChannel.feeRate`를 보면서 같은 수수료를 서로 다른 단위로 읽게 됩니다.
- 이미 기존 코드가 이 문제를 복구하는 heal 로직을 갖고 있으므로, 문서 단계에서 SSOT를 안 정하면 같은 문제가 TVC에서 다시 반복됩니다.

### 3-3-2) Portfolio row normalize fail-fast 계약

- `normalizeTargetValueChannelPortfolioRow(row)`는 `id`, `name`, `start_date`, `daily_buy_amount`, `fee_rate`, `strategy.targetValueChannel`, `target_value_channel_snapshot` 중 하나라도 깨져 있으면 `null`을 반환하고 row 자체를 skip합니다.
- normalize 단계에서 `''`, `0` 같은 조용한 대체값으로 깨진 row를 정상 포트폴리오처럼 꾸미지 않습니다.
- read path는 신규 hard-reset 구조만 읽으므로, `ma0 ~ ma3` runtime strategy base도 누락 없이 복원되어야 합니다.
- `target_value_channel_snapshot`의 `buyOrders`, `sellOrders`는 핵심 장부 일부이므로, 배열이 아니거나 row 하나라도 깨져 있으면 snapshot 전체를 fail-fast 처리합니다.
- 즉, order book normalize는 invalid row를 일부 skip하지 않고 `readRequiredTargetValueChannelOrderLevels(...)`로 전체 snapshot 복원을 중단합니다.
- `trades`도 blind cast 하지 않고 row 단위로 `id`, `type`, `stock`, `date`, `price`, `quantity`, `fee`를 검증한 뒤, `validateFinancialArgs`로 `price > 0`, `quantity > 0`, `fee >= 0`까지 다시 검증합니다.
- `buildTargetValueChannelRuntimeStrategyFromRaw()`도 shape만 확인하지 않고 `maAPeriod`, `maBPeriod`, `splitCount`를 write path와 같은 shared validator 범위로 다시 검증합니다.
- invalid trade row는 warning 로그와 함께 skip하고, 전체 portfolio row는 나머지 필수 envelope가 멀쩡할 때만 복원합니다.

Why:

- 조회 경로가 누락 데이터를 임의 보정해 버리면, 실제로는 손상된 row가 대시보드와 거래 경로에서 정상 장부처럼 보일 수 있습니다.
- TVC는 snapshot과 strategy slice가 함께 맞물려야 하는 구조이므로, 한쪽이라도 비면 조용한 복원보다 row skip이 더 안전합니다.

### 3-4) Trade path fail-fast 계약

- `computeTargetValueChannelSnapshotAfterTrade()`는 `currentSnapshot == null`이면 절대 자동 시딩하지 않습니다.
- 거래 mutation이 TVC 분기에 진입했는데 snapshot이 비어 있으면 즉시 `[TVC_Trade_Error]` 계열 에러를 던집니다.
- `createInitialTargetValueChannelSnapshot(config)`는 오직 생성 시점 payload와 insert seed에서만 사용합니다.
- 즉, 생성 파이프라인 누락을 거래 경로가 몰래 메워 주는 lazy reseed는 금지합니다.
- 같은 cycle 안에서는 `availableCash`, `shares`, `avgPrice`만 갱신합니다.
- 같은 cycle 안에서는 `currentT`, `bandLow`, `bandHigh`, `buyOrders`, `sellOrders`를 refresh 전까지 유지합니다.
- 단, `shares === 0 -> shares > 0`로 넘어가는 첫 매수 체결 시에만 현재 band 기준으로 주문표를 1회 재생성합니다.
- 이 규칙은 `shouldRebuildTargetValueChannelOrdersAfterTrade(...)` helper 이름으로 코드에 고정합니다.

```ts
function shouldRebuildTargetValueChannelOrdersAfterTrade(args: {
  tradeType: Trade['type'];
  previousShares: number;
  nextShares: number;
}): boolean {
  return (
    args.tradeType === 'buy' &&
    args.previousShares <= ZERO_AMOUNT &&
    args.nextShares > ZERO_AMOUNT
  );
}
```

Why:

- 생성 경로와 거래 경로가 각각 스냅샷을 만들기 시작하면, 어떤 값이 진짜 장부인지 알 수 없는 이중 진실(two sources of truth)이 생깁니다.
- 이 문제는 초기에 조용히 지나가도, 나중에 `cycleIndex`, `availableCash`, 주문표가 서로 다른 기준으로 누적되어 더 큰 데이터 오염으로 번집니다.

### 3-5) Legacy validator 호환 계약

- TVC가 실제 구현에서 `validatePortfolioSetupInput(...)`를 계속 사용하는 동안에는 `TargetValueChannelValidationInput`에 `withdrawalAmount`를 유지합니다.
- `withdrawalAmount`는 `adjustmentMode === 'withdraw'`일 때만 `adjustmentAmount`를 전달하고, `deposit` / `none`은 `0`으로 고정합니다.
- 즉, TVC 문서 단계에서는 `buildTargetValueChannelValidationInput(...)`를 compatibility bridge로 두고, 실제 PR에서 `constants/domain/financeRules.ts`와 `components/strategyCreator/useStrategyCreatorController.tsx`를 함께 바꾸기 전까지 이 DTO를 제거하지 않습니다.

Why:

- 현재 실제 검증기 계약을 바꾸지 않은 상태에서 DTO만 먼저 줄이면 creator 저장 경로가 바로 깨집니다.
- compatibility bridge를 두면 문서 스니펫은 TVC 용어로 정리하면서도, 실제 제품 검증 경계와 충돌하지 않고 단계적으로 전환할 수 있습니다.

## DB 스키마 변경 (Drop vs Add)

### Drop

하드 리셋 전제이므로, 아래 VR 축은 백필 없이 제거합니다.

- `portfolios.vr_snapshot`
- `strategy.vrBand`
- `Portfolio.vrSnapshot`
- `PortfolioRow.vr_snapshot`
- `Trade.metadata.pool_after`
- 레거시 폴백 읽기
  - `strategy.vr_band`
  - `strategy.vrBandStrategy`
  - `row.vrSnapshot`

### Add

새 계약은 아래처럼 단방향으로만 추가합니다.

- `portfolios.target_value_channel_snapshot jsonb`
- `strategy.targetValueChannel`
- `Portfolio.targetValueChannelSnapshot`
- `PortfolioRow.target_value_channel_snapshot`
- `Trade.metadata.cash_after`

### Snapshot JSON 권장 구조

```text
target_value_channel_snapshot = {
  currentT,
  availableCash,
  shares,
  avgPrice,
  bandLow,
  bandHigh,
  buyOrders,
  sellOrders,
  cycleIndex
}
```

### Cycle 0 주문표 시딩 규칙

- `currentT = initialTargetValue`
- `availableCash = initialAvailableCash`
- `shares = 0`, `avgPrice = 0`
- `bandLow`, `bandHigh`는 `initialTargetValue`와 persisted `bandRateUpper`, `bandRateLower`로 계산합니다.
- `buyOrders`는 `initialCapital`이 아니라 `initialAvailableCash`를 기준으로 기존 예약매수 표 생성 규칙을 그대로 적용해 시딩합니다.
- `sellOrders`는 Creator 직후 `shares = 0`이므로 빈 배열로 시작하는 것이 정상입니다.
- snapshot JSON의 `buyOrders`, `sellOrders`에는 `step 0` 현재 상태 행을 저장하지 않습니다.
- `step 0` 현재 상태 행은 `createTargetValueChannelStepZeroOrderLevel(snapshot)` helper로만 생성합니다.
- `step 0` row payload shape는 아래 6개 필드를 고정합니다.

```text
{
  step: 0,
  price: 0,
  qty: 0,
  isBuffer: false,
  sharesAfter: snapshot.shares,
  cashAfter: snapshot.availableCash
}
```

- `useTargetValueChannelOrders()`는 아래 순서를 고정합니다.

```text
if (snapshot == null) {
  return {
    safeBuyOrders: EMPTY_TARGET_VALUE_CHANNEL_ORDERS,
    safeSellOrders: EMPTY_TARGET_VALUE_CHANNEL_ORDERS
  };
}

step0 = createTargetValueChannelStepZeroOrderLevel(snapshot)
safeBuyOrders = [step0, ...snapshot.buyOrders]
safeSellOrders = [step0, ...snapshot.sellOrders]
```

- Order Modal의 empty-state 판정은 `safeOrders.length`가 아니라 `CURRENT_STATE_STEP`를 제외한 executable order 개수로 판단합니다.
- 즉, 아래 helper 계약을 유지합니다.

```text
executableOrders = orders.filter((order) => order.step !== CURRENT_STATE_STEP)
hasExecutableOrders = executableOrders.length > 0
```

- Order Modal 소비자는 아래 view-model helper 시그니처로만 이 규칙을 소비합니다.

```ts
export function buildTargetValueChannelOrderModalViewModel(args: {
  snapshot: TargetValueChannelSnapshot | null | undefined;
  activeTab: 'buy' | 'sell';
}): {
  orders: TargetValueChannelOrderLevel[];
  hasExecutableOrders: boolean;
}
```

- empty 문구는 `!hasExecutableOrders`일 때만 렌더링합니다.

- 따라서 `initialAllocationPct = 100`으로 `initialAvailableCash = 0`이 된 경우, 초기 예약매수 표가 빈 배열이어도 정상입니다.

### 생성 -> 저장 -> 조회 -> 거래 파이프라인

실제 구현 순서는 아래 순서로 고정합니다.

1. Creator UI draft는 `TargetValueChannelWizardDraftInput`으로 수집합니다.
2. `buildTargetValueChannelCreatorInput({ meta, draft })`가 메타의 `feeRatePercent`를 one-way로 합쳐 `TargetValueChannelCreatorInput`을 만듭니다.
3. `buildTargetValueChannelPersistedConfig(input)`으로 persisted config를 생성합니다.
4. `createInitialTargetValueChannelSnapshot(persistedConfig)`으로 cycle 0 snapshot을 생성합니다.
5. `buildTargetValueChannelSliceEnvelope(input)`가 low-level 저장 slice를 만듭니다.
6. `buildTargetValueChannelStrategyBase(strategyDefaultsAdapter)`가 외부 defaults 기반 base strategy를 만듭니다.
7. `buildTargetValueChannelPortfolioInsertEnvelope({ meta, draft, baseStrategy })`가 실제 insert용 full runtime strategy envelope를 만듭니다.
8. `buildTargetValueChannelPortfolioDraft({ meta, draft, baseStrategy })`가 실제 포트폴리오 draft envelope를 반환합니다.
9. 포트폴리오 insert 시 `insertEnvelope.strategy`와 `insertEnvelope.targetValueChannelSnapshot`을 같은 트랜잭션 경계에서 함께 저장합니다.
10. 조회 시 `normalizeTargetValueChannelPortfolioRow(row)`가 전체 포트폴리오 runtime envelope를 복원하고, 필수값이 깨진 row는 `null`로 skip합니다.
11. 거래 시 시작 현금 기준값은 `resolveTargetValueChannelTradeStartingAvailableCash({ snapshot })`로만 읽습니다.
12. `snapshot == null`이면 거래 경로는 즉시 fail-fast 하며, `config.initialAvailableCash`나 `initialCapital`로 폴백하지 않습니다.

Why:

- TVC는 초기 원금과 초기 가용 현금을 분리했기 때문에, snapshot이 비어 있는 상태에서 거래 경로가 임의로 현금을 다시 구성하면 첫 거래부터 `CR`, 주문표, 다음 `T`가 모두 어긋납니다.

### 실제 함수 체인 고정

문서 단계에서도 아래 함수 체인을 기준으로 1:1 매핑합니다.

```text
Creator
  -> buildTargetValueChannelCreatorInput({ meta, draft })
  -> buildTargetValueChannelCreationArtifacts(input)
  -> buildTargetValueChannelSliceEnvelope(input)
  -> buildTargetValueChannelStrategyBase(strategyDefaultsAdapter)
  -> buildTargetValueChannelPortfolioInsertEnvelope({ meta, draft, baseStrategy })
  -> buildTargetValueChannelValidationInput({ meta, persistedConfig, baseStrategy })
  -> buildTargetValueChannelPortfolioDraft({ meta, draft, baseStrategy })

Normalize / Read
  -> getTargetValueChannelConfig(strategy)
  -> normalizeTargetValueChannelStrategySlice(rawStrategy)
  -> readTargetValueChannelSnapshotFromRow(row)
  -> normalizeTargetValueChannelPortfolioRow(row)

Trade
  -> resolveTargetValueChannelTradeStartingAvailableCash(args)
  -> computeHoldingStateAfterTrade(args)
  -> computeTargetValueChannelSnapshotAfterTrade(args)

Refresh
  -> calculateNextCycleState(args)
  -> buildRefreshedTargetValueChannelSnapshot(args)
  -> buildTargetValueChannelRefreshPersistencePayload(snapshot)

Consumer ViewModel
  -> buildTargetValueChannelOrderModalViewModel({ snapshot, activeTab })
  -> buildTargetValueChannelDailyExecutionViewModel({ config, messages })
```

- 계획서에 함수명이 없으면 구현자가 같은 책임을 여러 파일에 중복으로 흩뿌릴 가능성이 높으므로, 이 단계에서 함수 이름까지 고정합니다.

### 사이클 refresh 계약

- `supabase/functions/_shared/vrSnapshotRefresh.ts`를 대체하는 TVC refresh 경로는 `buildRefreshedTargetValueChannelSnapshot()`를 핵심 순수 함수로 사용합니다.
- refresh는 이전 snapshot의 `shares`, `avgPrice`를 유지한 채, target cycle index까지 실제로 반복 전진하며 `currentT`, `availableCash`, `bandLow`, `bandHigh`, 주문표를 갱신합니다.
- `mapPortfolioRowForRefresh()` 성격의 helper는 `target_value_channel_snapshot`만 읽습니다.
- `calculateNextCycleIndexForPortfolio()` 성격의 helper는 `strategy.targetValueChannel`과 `portfolio.targetValueChannelSnapshot`만 사용합니다.
- `buildRefreshedTargetValueChannelSnapshot()`는 순수 계산만 담당하고 DB update를 직접 수행하지 않습니다.
- `targetCycleIndex`가 `previous.cycleIndex`보다 작으면 즉시 fail-fast 합니다.
- `buildRefreshedTargetValueChannelSnapshot()`는 `while (snapshot.cycleIndex < targetCycleIndex)` 루프로 `calculateNextCycleState()`를 반복 호출하고, 각 step에서 `nextCycleIndex`가 실제로 증가하는지 검증합니다.
- persistence 계층은 `buildTargetValueChannelRefreshPersistencePayload()`가 반환한 `{ target_value_channel_snapshot }`만 update합니다.
- `supabase/functions/refresh-target-value-channel-snapshots/index.ts`는 `vr_snapshot`를 절대 read/write 하지 않습니다.
- refresh path는 아래 순서로 고정합니다.

```text
normalize row
-> calculate due cycle index
-> buildRefreshedTargetValueChannelSnapshot({ previous, config, targetCycleIndex })
-> buildTargetValueChannelRefreshPersistencePayload(snapshot)
-> update target_value_channel_snapshot
```

Why:

- 주기 refresh는 실제로 돈과 주문표가 함께 바뀌는 핵심 경로이므로, 이 함수가 문서에 없으면 리브랜딩이 UI 치환에만 머무르게 됩니다.
- 거래 후 스냅샷과 주기 refresh가 서로 다른 규칙으로 움직이면, 같은 포트폴리오가 “거래 직후 상태”와 “다음 사이클 상태”에서 서로 다른 수학 모델을 사용하게 됩니다.

### Strategy JSON 권장 구조

이번 범위에서는 기존 `Strategy` fat interface를 유지하고, 그 안에 TVC 전용 slice를 추가합니다.

```text
strategy.targetValueChannel = {
  initialCapital,
  initialAllocationPct,
  initialTargetValue,
  initialAvailableCash,
  bandRateUpper,
  bandRateLower,
  feeRate,
  baseGrowthRate,
  smartBrakeThreshold,
  minOrderQty,
  cashUsageRateBuy,
  cycleWeeks,
  adjustmentMode,
  adjustmentAmount
}
```

기술 부채 고지:

- `Strategy` fat interface의 ISP/OCP 문제는 실제로 존재합니다.
- 다만 이 문제는 리브랜딩 본체보다 범위가 훨씬 크고, 기존 전략 전반에 연쇄 충돌을 만들 가능성이 큽니다.
- 따라서 이번 문서에서는 이를 **별도 기술 부채**로 분리하고, TVC 리브랜딩 자체는 기존 `Strategy` 구조 안에서 완료하는 방향으로 고정합니다.
- 단, raw access 확산을 막기 위해 최소한 아래 adapter는 즉시 도입합니다.

```ts
export function getTargetValueChannelConfig(
  strategy: Strategy,
): TargetValueChannelPersistedConfig | null {
  return strategy.targetValueChannel ?? null;
}
```

### 하드 리셋 운영 원칙

- 기존 VR 포트폴리오를 읽는 폴백은 만들지 않습니다.
- 기존 DB 행을 새 구조로 자동 변환하는 마이그레이션은 만들지 않습니다.
- Simulation Pass 이후 실제 구현 단계에서는 새 스키마만 파싱하고, 레거시 키는 타입에서 제거합니다.

## 파일 / 타입 / 심볼 리네이밍 맵

### 파일명 리네이밍

- `utils/vrBandStrategy.ts`
  -> `utils/targetValueChannelStrategy.ts`
- `supabase/functions/_shared/vrBandStrategy.ts`
  -> `supabase/functions/_shared/targetValueChannelStrategy.ts`
- `components/strategies/VrBandStrategyForm.tsx`
  -> `components/strategies/TargetValueChannelStrategyForm.tsx`
- `components/VrPortfolioSummary.tsx`
  -> `components/TargetValueChannelPortfolioSummary.tsx`
- `components/VrOrderModal.tsx`
  -> `components/TargetValueChannelOrderModal.tsx`
- `components/VrBadge.tsx`
  -> `components/TargetValueChannelBadge.tsx`
- `hooks/useVrOrders.ts`
  -> `hooks/useTargetValueChannelOrders.ts`
- `constants/vrMessages.ts`
  -> `constants/targetValueChannelMessages.ts`
- `constants/vrConstants.ts`
  -> `constants/targetValueChannelConstants.ts`
- `supabase/functions/refresh-vr-snapshots`
  -> `supabase/functions/refresh-target-value-channel-snapshots`
- `utils/vrSnapshotRefresh.test.ts`
  -> `utils/targetValueChannelSnapshotRefresh.test.ts`
- `utils/vrBandStrategy.test.ts`
  -> `utils/targetValueChannelStrategy.test.ts`

### 타입 / 필드 리네이밍

- `VrSnapshot`
  -> `TargetValueChannelSnapshot`
- `VrBandStrategyBase`
  -> `TargetValueChannelStrategyBase`
- `VrBandStrategyParams`
  -> `TargetValueChannelPersistedConfig`
- `StrategyType.'vr_band'`
  -> 이번 단계에서는 legacy 내부 strategy id로 유지 (`src/components/StrategyCreator/utils.ts` owner)
- `StrategyWizardDraftInput.vrBand`
  -> `StrategyWizardDraftInput.targetValueChannel`
- `VrBandWizardDraftInput`
  -> `TargetValueChannelWizardDraftInput`
- `VrBandStrategyFormProps`
  -> `TargetValueChannelStrategyFormProps`
- `StrategyWizardScreen.'vr_band_config'`
  -> 이번 단계에서는 legacy 내부 screen id로 유지
- `TargetValueChannelCreatorInput`
  -> creator meta + draft를 합친 저장 직전 입력 DTO
- `Portfolio.vrSnapshot`
  -> `Portfolio.targetValueChannelSnapshot`
- `PortfolioRow.vr_snapshot`
  -> `PortfolioRow.target_value_channel_snapshot`
- `currentV`
  -> `currentT`
- `initialV`
  -> `initialTargetValue`
- `pool`
  -> `availableCash`
- `poolAfter`
  -> `cashAfter`
- `G`
  -> `baseGrowthRate`
- `poolUsageRateBuy`
  -> `cashUsageRateBuy`
- `deltaCash`
  -> `adjustmentAmount`
- `vrMode`
  -> `adjustmentMode`
- `getVrDeltaCashForNextV`
  -> `resolveNextCycleAdjustment`
- `calculateNextV`
  -> `calculateNextCycleTargetValue`
- `computeVrSnapshotAfterTrade`
  -> `computeTargetValueChannelSnapshotAfterTrade`
- `createInitialVrSnapshot`
  -> `createInitialTargetValueChannelSnapshot`
- `buildVrBandStrategy`
  -> `buildTargetValueChannelPortfolioDraft`

### 유지하는 개념

아래는 유지합니다.

- `bandLow`, `bandHigh`
  - 값은 각각 `currentT × (1 - bandRateLower)`, `currentT × (1 + bandRateUpper)`로 계산합니다.
  - 바뀌는 것은 기준 축이 `V`에서 `T`로 바뀌는 점뿐입니다.
- 예약매수 표 생성 규칙
  - 입력값은 `shares`, `availableCash`, `bandLow`, `minOrderQty`, `feeRate`, `cashUsageRateBuy`를 사용합니다.
  - `cashAfter`는 시작 `availableCash`에서 누적 매수 비용(수수료 포함)을 차감한 값으로 유지합니다.
  - `isBuffer`는 buy orders에서만 사용합니다.
  - `MAX_BUFFER_ORDER_COUNT = 2`를 유지합니다.
  - `calculateTargetValueChannelMaxBuyStep` 같은 UI 힌트 계산은 `isBuffer === false`인 row만 소비합니다.
- 예약매도 표 생성 규칙
  - 입력값은 `shares`, `availableCash`, `bandHigh`, `minOrderQty`, `feeRate`를 사용합니다.
  - `cashAfter`는 시작 `availableCash`에 누적 매도 수령액(수수료 차감 후)을 더한 값으로 유지합니다.
  - sell orders는 항상 `isBuffer = false`입니다.
- `sharesAfter`
  - 각 step 주문이 체결된 뒤의 누적 보유 수량이라는 의미를 그대로 유지합니다.
- buffer row의 `cashAfter`
  - guide-only display value일 수 있으며, snapshot의 실제 `availableCash`와 같은 의미로 취급하지 않습니다.
- 사이클 index 개념
  - `cycleIndex`는 snapshot에 저장되며, 다음 사이클 계산 시 `previous.cycleIndex + 1` 규칙을 유지합니다.

## UI / I18N 변경

### I18N / 컴포넌트 분리 원칙

- 사용자 노출 문자열은 계산 엔진 파일에 두지 않습니다.
- 실제 구현에서는 `constants/targetValueChannelMessages.ts`를 별도 SSOT로 분리합니다.
- 실제 요약 카드는 `.tsx` 컴포넌트 파일로 분리합니다.
- `docs2/target_value_channel_simulation.ts`는 순수 엔진 + 문서용 view-model helper(`buildTargetValueChannelOrderModalViewModel`, `buildTargetValueChannelDailyExecutionViewModel`, summary view model)만 담당합니다.
- `docs2/target_value_channel_simulation.ts`는 `TARGET_VALUE_CHANNEL_MESSAGES` 같은 concrete message map을 import하지 않고, message contract type만 소비합니다.
- `docs2/target_value_channel_summary_contract.ts`는 summary 공용 타입만 담당합니다.
- `docs2/target_value_channel_validation_bridge.ts`는 현재 shared validator에 붙는 얇은 bridge만 담당합니다.
- `docs2/target_value_channel_messages.ts`는 문서용 i18n 사전 + fallback 상수 + surface별 message contract만 담당합니다.
- `docs2/target_value_channel_messages.ts`는 메인 메시지 map과 별도 fallback 상수(`TARGET_VALUE_CHANNEL_FATAL_FALLBACK`)도 함께 보관합니다.
- `docs2/target_value_channel_summary_card.tsx`는 문서용 요약 카드 TSX 스니펫을 담당합니다.
- surface는 아래 5개로 분리합니다.
  - `creator`
  - `orderModal`
  - `dashboard`
  - `dailyExecution`
  - `summaryCard`
- 실제 구현 매핑은 아래를 기준으로 맞춥니다.
  - `creator` -> `constants/messages/strategyCreatorMessages.ts`, `components/strategyCreator/useStrategyCreatorController.tsx`, `components/strategyCreator/StrategyCreator.tsx`, `components/strategies/TargetValueChannelStrategyForm.tsx`
  - `orderModal` -> `components/TargetValueChannelOrderModal.tsx`
  - `dashboard` -> `constants/messages/dashboardMessages.ts`, `components/Dashboard.tsx`, `components/TargetValueChannelPortfolioSummary.tsx`
  - `dailyExecution` -> `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`
  - `summaryCard` -> `docs2/target_value_channel_summary_card.tsx` 및 실제 요약 카드 컴포넌트
- `constants/messages/strategyCreatorMessages.ts`와 `constants/messages/dashboardMessages.ts`는 TVC 사용자 노출 문구의 독립 owner가 아니라 `constants/targetValueChannelMessages.ts`를 소비하는 thin projection layer입니다.
- legacy 내부 key(`titles.vrBandConfig`, `strategyDefinitions.vr_band.*`, `strategyName.vr_band`)는 이번 단계에서 유지하되, 사용자 노출 value는 projection helper를 통해서만 주입합니다.
- `creator.submitLabel`은 shared `actions.startStrategy`를 덮어쓰지 않고, `selectedStrategy === 'vr_band'` 경로의 meta-step CTA resolver에서만 직접 소비합니다.
- `constants/messages/dashboardMessages.ts`는 `strategyName.vr_band`만 projection하고, TVC 전용 버튼/힌트 라벨은 `dashboard` surface를 직접 소비합니다.
- `utils/dailyExecutionSummary.ts`와 `supabase/functions/_shared/maSummaryShared.ts`는 로컬 `STRINGS` 테이블을 유지하지 않습니다.
- 두 파일 모두 `constants/targetValueChannelMessages.ts`의 `dailyExecution` surface만 import합니다.
- `dailyExecution.adjustmentModeLabels`와 `dailyExecution.formatAdjustmentHeader`는 서로 다른 하드코딩 소스를 갖지 않고, 같은 label owner에서 함께 파생합니다.

Why:

- 번역 문자열과 계산 엔진이 한 파일에 섞이면, 카피 수정이 핵심 수식 파일 변경으로 번져 리뷰 난이도와 회귀 위험이 같이 올라갑니다.
- `String.raw`로 TSX를 문자열화하면 TypeScript/JSX 컴파일 검증을 우회하게 되어, 오타와 null 접근이 리뷰 전까지 숨어 버립니다.
- 문장 결합 규칙을 컴포넌트의 `join(' ')` 같은 표현으로 처리하면, 공백 규칙이 다른 언어 확장 시 문장이 어색해질 수 있습니다.

### 숨은 UI 문자열 키 범위

`docs2/target_value_channel_messages.ts`와 실제 `constants/targetValueChannelMessages.ts`는 큰 라벨뿐 아니라 아래 숨은 UI 문자열도 반드시 SSOT로 가집니다.

- `adjustmentModeLabel`
- `adjustmentModeOptions.none`
- `adjustmentModeOptions.deposit`
- `adjustmentModeOptions.withdraw`
- `adjustmentAmountLabel`
- `adjustmentAmountDisabledHint`
- `closeModalAriaLabel`
- `cycleFixedBadge`
- `currentTargetValueLabel`
- `currentAvailableCashLabel`
- `bandRangeLabel`
- `dashboard.openOrderTableButtonLabel`
- `creator.screenTitle`
- `creator.strategyTitle`
- `creator.strategyDescription`
- `creator.submitLabel`
- `dashboard.strategyName`
- `dailyExecution.adjustmentModeLabels.*`
- `dailyExecution.formatAdjustmentHeader`

- `creator.adjustmentModeOptions.*`와 `dailyExecution.adjustmentModeLabels.*`는 서로 다른 상수를 들고 있지 않고, 같은 `TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS` owner에서 함께 파생합니다.
- `StrategyCreatorMessageSet.titles.vrBandConfig`, `StrategyCreatorMessageSet.strategyDefinitions.vr_band.*`, `DashboardMessageSet.strategyName.vr_band`는 projection target key이지, 독립 하드코딩 owner가 아닙니다.

Why:

- 실서비스에서는 접근성 라벨, disabled helper, 모달 배지, 요약 카드 보조 라벨처럼 리뷰에서 잘 안 보이는 문자열이 가장 늦게 VR 흔적을 남깁니다.
- 이 키 범위를 문서에서 먼저 잠가 두지 않으면 구현자가 화면 제목만 바꾸고, 모달 내부·접근성·요약 카드의 잔여 문구를 놓치기 쉽습니다.

### Legacy key projection 계약

- `constants/messages/strategyCreatorMessages.ts`와 `constants/messages/dashboardMessages.ts`는 TVC 카피를 직접 하드코딩하지 않고 projection helper 결과만 merge합니다.
- `StrategyType.'vr_band'`, `StrategyWizardScreen.'vr_band_config'` 같은 legacy 내부 id는 유지하지만, 사용자 노출 copy는 아래 helper에서만 파생합니다.
- 이 projection layer 밖에서 `VR 밴드 설정`, `strategyName.vr_band` 같은 value를 다시 하드코딩하지 않습니다.

```ts
export function buildTargetValueChannelStrategyCreatorLegacyMessageProjection(
  lang: AppLang,
) {
  const messages = TARGET_VALUE_CHANNEL_MESSAGES[lang];
  return {
    titles: { vrBandConfig: messages.creator.screenTitle },
    strategyDefinitions: {
      vr_band: {
        title: messages.creator.strategyTitle,
        description: messages.creator.strategyDescription,
      },
    },
  };
}

export function buildTargetValueChannelDashboardLegacyMessageProjection(
  lang: AppLang,
) {
  const messages = TARGET_VALUE_CHANNEL_MESSAGES[lang];
  return {
    strategyName: {
      vr_band: messages.dashboard.strategyName,
    },
  };
}
```

Why:

- 내부 key rename을 deferred 했더라도 value source까지 legacy 파일마다 흩어지면 리브랜딩 회귀가 반복됩니다.
- projection layer를 두면 UI consumer는 기존 shape를 유지하면서도 visible copy owner는 하나로 잠글 수 있습니다.

### Creator CTA resolve 계약

- `creator.submitLabel`은 TVC 전용 CTA이므로 `StrategyCreatorMessageSet.actions.startStrategy` projection 대상으로 사용하지 않습니다.
- `components/strategyCreator/useStrategyCreatorController.tsx`는 meta-step primary CTA를 아래 resolver에서만 결정합니다.
- `multi_split`, `no_stop_multi_split`은 기존 `copy.actions.startStrategy`를 유지하고, `vr_band`만 `creator.submitLabel`을 직접 읽습니다.

```ts
function resolveStrategyMetaPrimaryActionLabel(args: {
  screen: StrategyWizardScreen;
  selectedStrategy: StrategyType | null;
  copy: StrategyCreatorMessageSet;
  targetValueChannelMessages: TargetValueChannelCreatorMessages;
}): string {
  if (args.screen !== 'strategy_meta') {
    return args.copy.actions.next;
  }

  if (args.selectedStrategy === 'vr_band') {
    return args.targetValueChannelMessages.submitLabel;
  }

  if (
    args.selectedStrategy === 'multi_split' ||
    args.selectedStrategy === 'no_stop_multi_split'
  ) {
    return args.copy.actions.startStrategy;
  }

  return args.copy.actions.save;
}
```

Why:

- shared `actions.startStrategy`를 TVC 문구로 덮어쓰면 다른 전략 CTA까지 같이 오염됩니다.
- CTA resolver를 controller 경계에 두면 legacy internal id는 유지하면서도 TVC만 별도 문구를 안전하게 소비할 수 있습니다.

### Message builder / cache 계약

- `constants/messages/strategyCreatorMessages.ts`는 base message map을 직접 mutate하지 않고, TVC projection을 얹은 최종 객체만 반환합니다.
- `constants/messages/dashboardMessages.ts`는 `DASHBOARD_MESSAGE_CACHE`에 base 객체가 아니라 projection merge가 끝난 최종 객체만 저장합니다.
- `buildDashboardMessages(lang)` / `buildStrategyCreatorMessages(lang)` helper 없이 getter 내부에서 ad-hoc mutation 하지 않습니다.

```ts
function buildDashboardMessages(lang: AppLang): DashboardMessageSet {
  const base = DASHBOARD_MESSAGES[lang];
  const projection = buildTargetValueChannelDashboardLegacyMessageProjection(lang);
  const tvc = TARGET_VALUE_CHANNEL_MESSAGES[lang];

  return {
    ...base,
    strategyName: {
      ...base.strategyName,
      ...projection.strategyName,
    },
    openOrderTableButtonLabel: tvc.dashboard.openOrderTableButtonLabel,
  };
}

export function getDashboardMessages(lang: AppLang): DashboardMessageSet {
  const cached = DASHBOARD_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const builtMessages = buildDashboardMessages(lang);
  DASHBOARD_MESSAGE_CACHE.set(lang, builtMessages);
  return builtMessages;
}
```

Why:

- merge 위치가 모호하면 cache object 직접 mutation, 참조 안정성 파괴, 테스트 오염이 같이 발생할 수 있습니다.
- builder -> cache 순서를 잠그면 shared consumer가 많아도 동일한 최종 message contract를 안전하게 재사용할 수 있습니다.

### Daily Execution header 정책

- `adjustmentAmount <= 0`이면 daily execution header에서 adjustment mode를 노출하지 않습니다.
- `adjustmentAmount > 0`이고 `adjustmentMode = 'deposit' | 'withdraw'`일 때만 `[입금]`, `[출금]` 또는 해당 언어의 대응 문자열을 노출합니다.
- `adjustmentMode = 'none'`은 header에 별도 `[없음]` 배지를 만들지 않습니다.
- daily execution 소비자는 아래 view-model helper 시그니처로만 header를 계산합니다.

```ts
export function buildTargetValueChannelDailyExecutionViewModel(args: {
  config: Pick<
    TargetValueChannelPersistedConfig,
    'adjustmentMode' | 'adjustmentAmount'
  >;
  messages: TargetValueChannelDailyExecutionMessages;
}): {
  adjustmentHeader: string | null;
}
```

Why:

- `none`이나 `0`을 굳이 헤더에 노출하면 정보량은 늘지 않고 noise만 증가합니다.
- 이 정책을 문서에서 먼저 잠그지 않으면 클라이언트 summary와 edge summary가 서로 다른 header 규칙을 사용하게 됩니다.

### 시뮬레이션 런너 격리 원칙

- `runSimulationExamples()`는 자동 실행하지 않습니다.
- 시뮬레이션 파일 import 시 부수 효과가 발생하지 않도록, 필요할 때만 명시적으로 호출 가능한 exported helper로만 둡니다.

Why:

- 계산 엔진을 가져오기 위해 import한 순간 시뮬레이션이 같이 돌면, 실제 구현 단계에서 불필요한 로그/연산이 런타임에 섞일 수 있습니다.

### 요약 카드 최후 방어 규칙

- 번역 사전 lookup이 실패한 최악의 상황에서는 사전 내부 속성을 다시 참조하지 않습니다.
- 요약 카드는 컴포넌트 로컬 문자열이 아니라 i18n 모듈에 분리된 `TARGET_VALUE_CHANNEL_FATAL_FALLBACK` 상수로 오류 상태를 렌더링합니다.
- 초기 목표 평가금 설명은 컴포넌트에서 배열 결합하지 않고, 사전 함수가 완성된 문장을 반환합니다.
- 요약 카드가 사용하는 `initialAllocationPct`는 역산값이 아니라 저장된 `config.initialAllocationPct`를 그대로 읽습니다.
- 요약 카드가 보여 주는 `initialTargetValue`, `initialAvailableCash`도 재계산하지 않고 저장된 config 값을 그대로 사용합니다.

Why:

- `messages == null`인데 다시 메인 메시지 map 내부 필드를 읽으면 fallback 경로 자체가 다시 터질 수 있으므로, 같은 i18n 모듈의 별도 fallback 상수로 분리해 두는 편이 더 안전합니다.
- 국제화 문장 구조를 컴포넌트에서 조립하면 언어별 어순과 공백 규칙을 i18n 계층이 통제할 수 없습니다.
- 저장되지 않은 슬라이더 값을 화면에서 다시 만들려고 하면, 표시용 설명문과 실제 저장 상태가 분리되어 hydration 오류나 역산 오차가 생길 수 있습니다.
- 저장된 금액까지 다시 계산하기 시작하면 Creator 시점 반올림 규칙과 대시보드 표시 규칙이 갈라질 수 있으므로, 표시 계층은 persisted config를 그대로 읽는 편이 더 안전합니다.

### 전략 생성 화면

기존 `initialV` 직접 입력은 제거하고, 아래 입력으로 대체합니다.

1. `총 투자 원금`
2. `초기 투입 비중 슬라이더 (10% ~ 100%)`
3. `기본 목표 상승률 (%)`
4. `스마트 브레이크 임계값 (%)`
5. `상단 밴드 폭 (%)`
6. `하단 밴드 폭 (%)`
7. `최소 주문 수량`
8. `매수 시 가용 현금 사용 비율 (%)`
9. `Adjustment 모드 selector (none / deposit / withdraw)`
10. `입금/출금 금액`
11. `리밸런싱 주기`

추가 UI 요구사항:

- 초기 투입 비중은 슬라이더 + 현재 값 숫자 표시
- 슬라이더 아래 헬퍼 문구:
  - `첫 매수에 사용할 비중이에요. 다음 사이클 목표 평가금 계산의 기준이에요.`
- `초기 목표 평가금 (T)`와 `초기 가용 현금`은 읽기 전용 파생 미리보기로 함께 보여 줍니다.
- `수수료율 (%)` 입력은 소수점 둘째 자리까지 허용합니다.
- `상단 밴드 폭 (%)`, `하단 밴드 폭 (%)` 입력은 정수만 허용하고 범위는 `1 ~ 100`입니다.
- `Adjustment 모드 selector`는 분기 문자열이 아니라 enum key 기반으로 렌더링합니다.
- `adjustmentMode = 'none'`이면 `adjustmentAmount` 입력은 disabled 처리하고 저장값도 `0`으로 정규화합니다.
- 요약 카드에 아래 4줄을 노출합니다.
  - `초기 목표 평가금 (T)`
  - `기본 목표 상승률`
  - `스마트 브레이크 임계값`
  - 일반 구간 / 안전모드 설명 + 수식

### 사용자 노출 문구 치환

- `VR 밴드 설정`
  -> `타겟 밸류 채널 설정`
- `초기 V 값`
  -> `초기 목표 평가금 (T)`
- `G`
  -> `기본 목표 상승률 (%)`
- `Pool`
  -> `가용 현금`
- `Pool After`
  -> `Cash After`
- `VR 전략 시작`
  -> `타겟 밸류 채널 전략 시작`
- `VR 예약 주문`
  -> `예약매수 표 / 예약매도 표`
- `VR 밴드 룰에 따라`
  -> `상단/하단 밴드와 예약 주문표를 참고해 매매하세요`

### 설명 톤

수식 설명은 남기되, 기본 카피는 사용자 친화형으로 유지합니다.

- `현금이 줄어들수록 다음 목표 평가금 상승폭이 자동으로 완만해집니다.`
- `가용 현금이 충분하면 다음 목표 평가금이 선형적으로 증가합니다.`

### 제거 대상

`라오어 Original`, `Official Strategy Credit`, `LaoerCreditBanner` 등
기존 출처 표시는 타겟 밸류 채널 플로우에서 제거합니다.

Why:

- 이번 리브랜딩의 목적은 독자 전략으로의 분리이므로, 라오어 크레딧 배너를 유지하면 브랜드 방향이 다시 흔들립니다.

## 구현 우선순위

### Phase A: 타입 / 저장 계약 고정

0. shared `validateFinancialArgs` 확장 또는 shared wrapper 모듈 고정
1. `types.ts`
   - `STRATEGY_SLICE_KEY_VALUES`: `'vrBand'` -> `'targetValueChannel'`
   - `Strategy.vrBand` -> `Strategy.targetValueChannel`
   - `Trade.metadata.pool_after` -> `Trade.metadata.cash_after`
   - `OrderLevel.poolAfter` -> `OrderLevel.cashAfter`
   - `VrSnapshot` -> `TargetValueChannelSnapshot`
   - `Portfolio.vrSnapshot` -> `Portfolio.targetValueChannelSnapshot`
   - `PortfolioRow.vr_snapshot` -> `PortfolioRow.target_value_channel_snapshot`
2. `supabase/functions/_shared/types.ts`
   - shared edge row/type도 `vr_snapshot` 계열 필드를 전부 `target_value_channel_snapshot`으로 맞춤
   - edge payload의 `vrBand` / `VrSnapshot` / `pool_after` 잔존 심볼 제거
3. `utils/portfolioNormalize.ts`
   - `readVrSnapshotFromRow()` 제거/교체
   - `normalizeTargetValueChannelAdjustmentMode(raw)` 추가
   - `readTargetValueChannelSnapshotFromRow(row)` 추가
   - `normalizeTargetValueChannelStrategySlice(raw)` 추가
   - `normalizeTargetValueChannelPortfolioRow(row)` 추가
   - `normalizeTargetValueChannelPortfolioRow(row)`는 partial `strategy + snapshot`이 아니라 전체 `Portfolio` runtime envelope를 복원하도록 잠금
   - trade normalize도 blind cast 금지, row 단위 validation helper로 교체
   - `strategy.vr_band`, `strategy.vrBandStrategy`, `row.vrSnapshot` 같은 레거시 fallback 제거
   - `targetValueChannel` + `target_value_channel_snapshot`만 복원
4. `services/portfolioService.ts`
   - `PORTFOLIO_SELECT_FIELDS`에서 `vr_snapshot` 제거
   - `target_value_channel_snapshot` 추가
5. `services/portfolioMutationService.ts`
   - `PortfolioRecordPayload.vr_snapshot` -> `target_value_channel_snapshot`
   - `PersistPortfolioTradeMutationInput.vrSnapshot` -> `targetValueChannelSnapshot`
   - `persistPortfolioTradeMutationSafe()` update payload에서 `vr_snapshot` 제거, `target_value_channel_snapshot` 추가
6. `hooks/usePortfolioMutations.ts`
   - `getVrStrategyParams()` 제거/교체
   - `portfolio.vrSnapshot` 참조를 `portfolio.targetValueChannelSnapshot`으로 교체
   - `currentPool ?? initialCapital` fallback 제거
   - 거래 시작 현금은 `resolveTargetValueChannelTradeStartingAvailableCash({ snapshot })`로만 읽고, snapshot이 없으면 즉시 fail-fast
   - `Trade.metadata.pool_after` 기록 제거 후 `cash_after`로 통일
7. `src/components/StrategyCreator/utils.ts`
   - `StrategyType.'vr_band'` owner로서 이번 단계에서는 legacy 내부 strategy id 유지
   - `StrategyWizardDraftInput.vrBand` -> `StrategyWizardDraftInput.targetValueChannel`
   - `VrBandWizardDraftInput` -> `TargetValueChannelWizardDraftInput`
   - `buildValidationInput()` 제거 대신 `buildTargetValueChannelValidationInput()` compatibility bridge 추가
   - `buildVrBandStrategy()` 제거 후 `buildTargetValueChannelPortfolioDraft()`로 치환
   - `buildPortfolioDraftFromWizardState()`의 `vrSnapshot` 생성 경로 제거 후 `targetValueChannelSnapshot`로 교체
   - creator draft를 `TargetValueChannelWizardDraftInput`으로 고정
   - `buildTargetValueChannelCreatorInput({ meta, draft })`가 feeRate 메타를 one-way로 합치는 유일한 경계가 되도록 잠금
   - `buildTargetValueChannelRuntimeStrategy()`가 실제 `Strategy` 호환 shape를 반환하도록 잠금
   - `buildTargetValueChannelPortfolioDraft({ meta, draft, baseStrategy })`가 partial slice가 아니라 실제 portfolio runtime envelope를 반환하도록 잠금
   - `strategy.targetValueChannel`와 `target_value_channel_snapshot`를 동시에 붙이는 creator call graph를 명시적으로 잠금
8. `components/strategyCreator/useStrategyCreatorController.tsx`
   - 실제 저장 버튼 경로가 `buildTargetValueChannelValidationInput()` 결과를 그대로 `validatePortfolioSetupInput(...)`에 넘기도록 교체
   - `selectedStrategy === 'vr_band'` 분기와 `StrategyWizardScreen.'vr_band_config'`는 이번 단계에서 legacy 내부 id로 유지
9. `constants/domain/financeRules.ts`
   - TVC compatibility bridge 제거 시점 전까지 기존 validator 계약 owner로 유지
10. `constants/domain/targetValueChannelDefaults.ts`
   - `TARGET_VALUE_CHANNEL_STRATEGY_DEFAULTS` owner module 신설
11. `components/strategies/TargetValueChannelStrategyForm.tsx`
   - `VrBandStrategyFormProps` -> `TargetValueChannelStrategyFormProps`
   - 개별 `vr*` props 대신 `TargetValueChannelWizardDraftInput` 기준의 draft contract로 재구성
12. `components/strategyCreator/types/ui.ts`
   - `StrategyWizardScreen.'vr_band_config'` owner
   - legacy screen id는 이번 단계에서 유지하고, full rename은 `StrategyCreator.tsx`, `useStrategyCreatorController.tsx`, `src/components/StrategyCreator/utils.ts`와 같은 PR에서만 수행
13. `components/strategyCreator/StrategyCreator.tsx`
   - `VrBandStrategyForm` direct render 경로를 `TargetValueChannelStrategyForm` 기준으로 교체
   - same-PR full rename이 아니면 `vr_band_config` screen id는 유지
14. `components/Dashboard.tsx`
   - TVC 분기는 `isTargetValueChannelStrategy()` 같은 전용 helper로만 판별
   - `portfolio.strategy.vrBand`, `portfolio.vrSnapshot`, `useVrOrders()`, `getVrDailyExecutionCycleHeaderLabel()`, `VR_SUMMARY`, `VR_DASHBOARD_HINT`, `vrOrderButtonLabel` owner 경로 참조 제거/교체
   - hardcoded `TQQQ` fallback 제거 후 tracked stock owner helper 기준으로 통일
15. `components/QuickInputModal.tsx`
   - TVC 분기에서 `ma1.stock`, `ma2.stock`, `ma3.stock`를 실제 거래 종목처럼 사용하지 않도록 격리
16. `components/TradeExecutionModal.tsx`
   - TVC 분기에서 공용 MA section stock 수집 로직과 분리
17. `components/AIImageInputModal.tsx`
   - TVC 포트폴리오 요약/분석 입력에서 filler MA 종목 노출 금지

목표:

- TVC가 로컬 validator clone 없이 shared validator를 import하도록 기반 정리
- 새 키만 읽고 쓰는 strict contract 완성
- 레거시 VR 폴백 제거
- “파일 몇 개 수정”이 아니라 심볼 단위 체크리스트로 부분 리네임 실패를 방지
- `Strategy` fat interface 개선은 별도 기술 부채로 분리

### Phase B: 수학 / 스냅샷 / 주문표 축 교체

1. `targetValueChannelStrategy.ts` 신설
2. `calculateNextCycleTargetValue`
3. `createInitialTargetValueChannelSnapshot`
4. `computeHoldingStateAfterTrade`
5. `computeTargetValueChannelSnapshotAfterTrade`
6. `buildRefreshedTargetValueChannelSnapshot`
7. `useTargetValueChannelOrders`
8. `supabase/functions/_shared/vrSnapshotRefresh.ts`
9. `supabase/functions/refresh-vr-snapshots/index.ts`

목표:

- 새 `T / CR / smartBrakeThreshold / baseGrowthRate` 수식 적용
- 주문표 생성 로직은 유지하되 입력 필드명만 새 축으로 정리
- `useTargetValueChannelOrders`는 `createTargetValueChannelStepZeroOrderLevel()` helper를 통해서만 step 0 row를 prepend
- oversell은 `assertTargetValueChannelTradeDoesNotOversell()`에서 즉시 fail-fast
- 거래 후 snapshot 갱신은 `computeTargetValueChannelSnapshotAfterTrade()` 단일 순수 함수로만 고정
- 주기 refresh는 `buildRefreshedTargetValueChannelSnapshot()`를 중심으로 edge 경로까지 연결

### Phase C: UI / 요약 / 문구 교체

1. `components/strategies/TargetValueChannelStrategyForm.tsx`
2. `components/TargetValueChannelPortfolioSummary.tsx`
3. `components/TargetValueChannelOrderModal.tsx`
4. `constants/targetValueChannelMessages.ts`
5. `constants/messages/strategyCreatorMessages.ts`
6. `components/strategyCreator/useStrategyCreatorController.tsx`
7. `components/strategyCreator/StrategyCreator.tsx`
8. `constants/messages/dashboardMessages.ts`
9. `components/Dashboard.tsx`
10. `constants/vrMessages.ts`
11. `utils/dailyExecutionSummary.ts`
12. `supabase/functions/_shared/maSummaryShared.ts`

목표:

- 사용자 표면에서 `VR / V / G / Pool` 완전 제거
- `Cash After`와 `목표 평가금 (T)` 기준으로 문구 통일
- 메시지 계약은 `creator / orderModal / dashboard / dailyExecution / summaryCard` 다섯 surface로 분리
- `creator`와 `dashboard` 노출 문구도 `constants/targetValueChannelMessages.ts` 단일 owner에서 projection됨
- `Dashboard.tsx`의 TVC 주문표 버튼 라벨과 힌트도 `dashboard.openOrderTableButtonLabel` 및 TVC surface로 이관되고, `constants/vrMessages.ts` 경유 경로는 0개가 됨

### Phase D: 테스트 / 하드 리셋

1. `src/components/StrategyCreator/utils.test.ts`
   - 1% fee cap, compatibility bridge, TVC draft/snapshot shape 갱신
2. `utils/targetValueChannelSnapshotRefresh.test.ts`
   - multi-cycle refresh, fail-fast, 새 수식 기준으로 갱신
3. `components/Dashboard.test.tsx`
   - `strategyName.vr_band`, `dashboard.openOrderTableButtonLabel`, TVC order hook glue, daily execution copy 회귀 검증
4. 신규 `components/strategyCreator/StrategyCreator.test.tsx`
   - legacy 내부 id(`vr_band`, `vr_band_config`) 유지 + TVC만 `creator.submitLabel` 사용, 다른 전략은 `copy.actions.startStrategy` 유지 검증
5. 새 DB 컬럼 기준 시드/하드 리셋 체크리스트 작성

## Simulation Pass 기준

`docs2/target_value_channel_simulation.ts`는 아래를 통과해야 합니다.

1. `currentT <= 0`에서 즉시 throw
2. `baseGrowthRate`, `smartBrakeThreshold`가 정수 상태로 저장되고 계산 함수 내부에서만 소수로 변환됨
3. `roundMoney`, `roundRate`는 음수와 양수 모두 대칭적으로 반올림됨
4. `cashRatio`는 반올림 후 비교되고, `CR <= threshold`일 때 정확히 안전모드 분기
5. `CR`을 cap 하지 않고도 계산이 정상 동작함
6. `initialCapital + initialAllocationPct`로 `initialTargetValue`, `initialAvailableCash`가 올바르게 계산되고, `initialAllocationPct`도 config/저장 스키마에 보존됨
7. `TargetValueChannelCreatorInput`과 `TargetValueChannelPersistedConfig`가 분리되고, `buildTargetValueChannelPersistedConfig()`만 두 계층 사이 변환 경계가 됨
8. `adjustmentMode`는 Creator UI의 명시적 selector 입력이고, `adjustmentMode = 'none'`일 때 `adjustmentAmount`는 disabled + `0`으로 정규화됨
9. `adjustmentMode`는 타입 선언만 믿지 않고 `normalizeTargetValueChannelAdjustmentMode(raw)`를 통해 build/read path 모두에서 런타임 정규화됨
10. `'deposit '`, `' withdraw'`, `null`, 잘못된 문자열은 normalize 단계에서 trim + `none` safe fallback + warning 처리되고, raw 값이 `resolveSignedAdjustmentAmount()`까지 직접 내려가지 않음
11. TVC 스니펫은 로컬 `validateFinancialArgs`를 다시 정의하지 않고 shared validator 또는 shared bridge를 import함
12. cycle 0 스냅샷은 `initialAvailableCash`로 예약매수 표를 시딩하고, `shares = 0`일 때 예약매도 표는 빈 배열로 유지함
13. `step 0` 현재 상태 행은 snapshot 저장값이 아니라 렌더링 계층 helper에서 붙고, payload shape가 `{ step: 0, price: 0, qty: 0, isBuffer: false, sharesAfter: snapshot.shares, cashAfter: snapshot.availableCash }`로 고정됨
14. `useTargetValueChannelOrders`는 `snapshot == null`이면 empty orders를 반환하고, 그렇지 않으면 `step0 + buyOrders`, `step0 + sellOrders` 순서로만 병합함
15. 포트폴리오 생성 시 persisted config와 cycle 0 snapshot이 함께 저장되고, 거래 경로는 snapshot 없을 때 `initialCapital`이나 `initialAvailableCash`로 폴백하지 않고 fail-fast 함
16. `MAX_BUFFER_ORDER_COUNT = 2`, `buyOrders`만 `isBuffer` 사용, `sellOrders`는 항상 `isBuffer = false` 계약이 유지됨
17. `runSimulationExamples()`는 import 시 자동 실행되지 않음
18. React summary snippet은 `String.raw`가 아닌 별도 `.tsx` 파일로 분리되고, 외부 i18n 사전을 import하며, 상태를 mutate 하지 않음
19. 번역 사전 lookup 실패 시에도 요약 카드가 컴포넌트 로컬 문자열이 아닌 `TARGET_VALUE_CHANNEL_FATAL_FALLBACK`으로 렌더링되어 SSOT와 WSoD 방어를 동시에 만족함
20. 초기 목표 평가금 설명은 i18n 사전 함수가 완성된 문장을 반환하고, 컴포넌트는 문자열 결합을 하지 않음
21. 요약 카드는 역산값이 아니라 저장된 `config.initialAllocationPct`를 직접 읽어 렌더링함
22. 요약 카드는 `initialTargetValue`, `initialAvailableCash`도 재계산하지 않고 저장된 config 값을 그대로 사용함
23. `target_value_channel_messages.ts`는 숨은 UI 문자열 키(`adjustmentModeOptions`, `adjustmentAmountDisabledHint`, `closeModalAriaLabel`, `cycleFixedBadge`, `currentTargetValueLabel`, `currentAvailableCashLabel`, `bandRangeLabel`, `dashboard.openOrderTableButtonLabel`)까지 포함한 SSOT가 됨
24. summary 공용 타입은 `target_value_channel_summary_contract.ts`로 분리되고, `AppLang`는 문서용 재정의가 아니라 실제 `../types`에서 import하며, i18n message contract는 `target_value_channel_messages.ts`에만 존재함
25. `feeRatePct`는 소수점 둘째 자리까지 허용되고, `bandUpperPct`, `bandLowerPct`는 `1 ~ 100` 정수로만 검증됨
26. low-level creation helper는 `buildTargetValueChannelCreationArtifacts()`와 `buildTargetValueChannelSliceEnvelope()`로 유지되되, 실제 DB insert는 `buildTargetValueChannelPortfolioInsertEnvelope()`를 사용함
27. Creator path는 `buildTargetValueChannelCreatorInput()` -> `buildTargetValueChannelStrategyBase(strategyDefaultsAdapter)` -> `buildTargetValueChannelPortfolioInsertEnvelope()` -> `buildTargetValueChannelValidationInput()` -> `buildTargetValueChannelPortfolioDraft()` 순서의 one-way builder로 닫히고, draft 결과에는 별도 `persistencePayload`를 싣지 않음
28. Read path는 `normalizeTargetValueChannelStrategySlice()`, `readTargetValueChannelSnapshotFromRow()`, `normalizeTargetValueChannelPortfolioRow()` helper로만 복원되고, `trades`도 row 단위 validation 후 bad row를 skip하며, 필수 envelope가 깨진 portfolio row는 `null`로 skip하고, 최종 결과는 전체 `Portfolio` runtime envelope임
29. Trade path는 `computeHoldingStateAfterTrade()` + `computeTargetValueChannelSnapshotAfterTrade()`로 고정되고, `currentSnapshot == null`이면 fail-fast 함
30. Refresh path는 `buildRefreshedTargetValueChannelSnapshot()`를 중심으로 target cycle index까지 실제로 반복 전진하며 `T`, `availableCash`, 밴드, 주문표를 함께 갱신함
31. `src/components/StrategyCreator/utils.ts`, `hooks/usePortfolioMutations.ts`, `supabase/functions/_shared/vrSnapshotRefresh.ts`가 Phase 체크리스트에 모두 포함됨
32. 메시지 계약은 `creator`, `orderModal`, `dashboard`, `dailyExecution`, `summaryCard` 다섯 surface로 분리됨
33. 문서용 시뮬레이션 예시는 low-level slice envelope, full insert envelope, runtime portfolio draft, normalize row, trade snapshot, multi-cycle refresh snapshot, missing snapshot fail-fast 예시까지 포함함
34. `Portfolio.feeRate`는 퍼센트 SSOT로 유지되고, TVC slice `feeRate`는 계산 전용 decimal 파생값으로만 사용됨
35. oversell은 silent clamp가 아니라 `assertTargetValueChannelTradeDoesNotOversell()`에서 즉시 fail-fast 함
36. refresh path는 `buildTargetValueChannelRefreshPersistencePayload()`를 통해 `target_value_channel_snapshot`만 update하고 `vr_snapshot`를 건드리지 않음
37. daily execution / edge summary는 로컬 문자열 테이블을 유지하지 않고 `dailyExecution` surface만 import함
38. daily execution header는 `adjustmentAmount <= 0`이면 mode를 숨기고, 양수일 때만 `[입금]` / `[출금]` 계열 header를 노출함
39. daily execution consumer는 `Pick`이 아니라 전체 `TargetValueChannelDailyExecutionMessages` surface를 받아 SSOT를 유지하고, `adjustmentModeLabels`와 `formatAdjustmentHeader`는 같은 owner label source에서 함께 파생함
40. order modal empty-state는 `CURRENT_STATE_STEP`를 제외한 executable order 개수로만 판단함
41. consumer glue code는 `buildTargetValueChannelOrderModalViewModel()`과 `buildTargetValueChannelDailyExecutionViewModel()` 시그니처로 잠김
42. `creator.screenTitle`, `creator.strategyTitle`, `creator.strategyDescription`, `creator.submitLabel`, `dashboard.strategyName`는 `target_value_channel_messages.ts` 단일 owner에서 정의되고, `strategyCreatorMessages.ts`/`dashboardMessages.ts`는 legacy internal key projection만 수행함
43. legacy 내부 id `vr_band`, `vr_band_config`는 유지되더라도 사용자 노출 copy에는 `VR / V / G / Pool` 문자열이 남지 않음
44. `src/components/StrategyCreator/utils.test.ts`, `utils/targetValueChannelSnapshotRefresh.test.ts`, `components/Dashboard.test.tsx`, 신규 `components/strategyCreator/StrategyCreator.test.tsx` 회귀 테스트가 모두 갱신되어 통과함
45. `creator.submitLabel`은 `actions.startStrategy` projection으로 merge되지 않고, `selectedStrategy === 'vr_band'` 경로의 meta-step CTA resolver에서만 직접 소비됨
46. `Dashboard.tsx`의 TVC 관련 사용자 노출 라벨은 `VR_SUMMARY`/`VR_DASHBOARD_HINT`가 아니라 `dashboard` surface와 TVC 전용 helper만 소비하며, TVC 경로에서 `constants/vrMessages.ts` import는 0개임
47. `getDashboardMessages()`는 projection merge가 끝난 최종 객체만 cache하고, base message map을 mutate하지 않음

## Step 2 산출물

- `docs2/target_value_channel_rebranding_plan.md`
- `docs2/target_value_channel_simulation.ts`
- `docs2/target_value_channel_summary_contract.ts`
- `docs2/target_value_channel_validation_bridge.ts`
- `docs2/target_value_channel_messages.ts`
- `docs2/target_value_channel_summary_card.tsx`
