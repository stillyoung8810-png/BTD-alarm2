---
name: multiSplit 유지 리브랜딩 계획
overview: 기존 `multiSplit` 식별자를 그대로 유지한 채, `noStopMultiSplit`의 보유 계산/진행률 아키텍처를 재사용하기 위한 Step 1-2 전용 검토 문서입니다.
stage: simulation-only
status: draft
---

# multiSplit 유지 리브랜딩 계획

## 문서 목적

이 문서는 **본 구현 이전 Step 1-2 전용 산출물**입니다.

- 목적 1: 현재 워크스페이스에서 재사용 가능한 `무손절 다분할` 구조를 정확히 확인합니다.
- 목적 2: 리브랜딩된 `multiSplit`에 필요한 UI/상태/로직 흐름을 **과한 추상화 없이** 고정합니다.
- 목적 3: 구현 전에 검증 가능한 핵심 스니펫만 하단에 남깁니다.

이번 문서에서는 **브로커 API, 실제 주문 실행, 서버 write 동작**을 전혀 다루지 않습니다. 표시 전용 앱이라는 현재 제품 경계를 유지합니다.

시뮬레이션 실행 하네스는 아래 문서 전용 파일로 분리합니다.

- `docs2/multiSplit-smart-rebranding-simulation-snippets.ts`
- `docs2/multiSplit-smart-rebranding-simulation.test.ts`
- `docs2/multiSplit-smart-rebranding-vitest.config.ts`

## 정확한 평가를 위해 실제 확인한 코드 파일

이번 계획서 검토 전에 아래 실코드를 먼저 확인했습니다.

- `types.ts`
- `src/components/StrategyCreator/utils.ts`
- `hooks/useMultiSplitExecution.ts`
- `supabase/functions/_shared/multiSplitShared.ts`
- `supabase/functions/_shared/noStopMultiSplitShared.ts`
- `supabase/functions/_shared/noStopExecutionMessages.ts`
- `components/Dashboard.tsx`
- `utils/dailyExecutionSummary.ts`
- `utils/multiSplitCalc.test.ts`

이 파일들을 확인한 이유는 아래와 같습니다.

- `types.ts`
  - `Strategy` fat interface 제약 안에서 이번 변경이 기술 부채를 더 키우는지 판단해야 했습니다.
- `src/components/StrategyCreator/utils.ts`
  - 새 파라미터 추가가 `STRATEGY_DEFAULTS` 기반 임시 캡슐화 경계를 깨뜨리는지 확인해야 했습니다.
- `hooks/useMultiSplitExecution.ts`
  - 현재 `multiSplit`이 이미 quarter-mode/phase semantics를 강하게 갖고 있어, 계획서가 기존 동작을 무심코 덮어쓰는지 확인해야 했습니다.
- `supabase/functions/_shared/multiSplitShared.ts`
  - `calcHoldings` 재사용 가능성과 현재 `multiSplit` SSOT 범위를 확인해야 했습니다.
- `supabase/functions/_shared/noStopMultiSplitShared.ts`
  - `avgPrice LOC / MOC 수량-only` 계약과 `findTargetHolding` 구현 기준을 확인해야 했습니다.
- `supabase/functions/_shared/noStopExecutionMessages.ts`
  - 매수 안내 라인 포맷이 실제로 `LOC 가격/수량`, `MOC 수량-only`인지 확인해야 했습니다.
- `components/Dashboard.tsx`, `utils/dailyExecutionSummary.ts`
  - progress bar 재사용과 요약 라인 연결 지점이 실제로 어디인지 확인해야 했습니다.

## 반영 완료 전제

이번 문서에서는 아래 3개를 **확정값**으로 둡니다.

1. **구현 식별자/저장 키/파일명은 `multiSplit`를 그대로 사용합니다.**
   - `strategy.multiSplit`
   - `useMultiSplitExecution`
   - `multiSplitShared.ts`
   - 즉, 이번 계획에서는 내부 구현을 위해 `smartSplit`라는 새 식별자를 만들지 않습니다.
2. **매수 안내는 `무손절 다분할`과 동일한 표기 계약으로 고정합니다.**
   - `LOC`는 `avgPrice` 기준 `가격 / 수량`으로 안내합니다.
   - `MOC`는 `currentPrice * 1.15` 안전 버퍼로 수량을 계산하되, 화면에는 `수량만` 안내합니다.
   - 따라서 Step 2 스니펫에서도 `referencePrice` 외부 주입 방식은 제거합니다.
3. **`appliedLocRatioPct`의 source of truth도 현재 `무손절 다분할` 규칙을 그대로 따릅니다.**
   - 기본값은 사용자가 저장한 `baseLocRatio`입니다.
   - `RSI`, `정배열` 조건이 켜져 있고 당일 snapshot이 조건을 충족하면, 각 조건에 묶인 `70 / 50 / 30` 프리셋이 후보가 됩니다.
   - 후보가 여러 개면 더 큰 `LOC%`가 승리합니다.
   - 그 결과값으로 `MOC 우선 워터폴 -> 남은 금액을 LOC` 흐름을 적용합니다.

## 로컬 사실 검증

### 1. 보유 회계 SSOT는 이미 존재합니다

- `supabase/functions/_shared/multiSplitShared.ts`
  - `calcHoldings(trades)`가 이동평균단가 기준 `quantity`, `totalCost`, `avgPrice`, `realizedPnL`을 계산합니다.
  - 부분 매도 후 `prev.totalCost = prev.quantity * currentAvgPrice`로 잔여 원가를 유지합니다.
- 이 로직은 현재 워크스페이스에서 가장 중요한 **잔여 totalCost 회계 SSOT**입니다.

즉, 사용자 요구사항의

> `findTargetHolding` -> `calcHoldings` 로직 100% 그대로 차용

은 이미 로컬 코드와 정확히 맞아떨어집니다.

### 2. 타깃 종목 추출 래퍼도 이미 존재합니다

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
  - `findTargetHolding(trades, targetStock)`가
    - ticker normalize
    - `calcHoldings(trades)` 호출
    - 타깃 보유분만 추출
  흐름으로 구현되어 있습니다.

이 함수는 지금 `noStop` 파일 안에 local helper로만 존재합니다.  
따라서 이번 리브랜딩 구현에서는 **복붙이 아니라 재사용**하려면 Step 3에서 아주 작은 공용 helper로 추출하는 편이 맞습니다.

### 3. 현금 사용률 Progress Bar의 실체는 별도 컴포넌트가 아니라 `Dashboard.tsx` inline block입니다

- `components/Dashboard.tsx`
  - `renderNoStopExecutionSummary()` 안에서
    - 상단 텍스트 1줄
    - progress width clamp
    - 막대 바 렌더링
  이 한 덩어리로 구현되어 있습니다.
- 따라서 "컴포넌트 재사용"을 문자 그대로 수행하려면, Step 3에서 별도 대형 컴포넌트를 만들기보다 **로컬 헬퍼 또는 작은 재사용 컴포넌트 1개**로 승격하는 정도가 적절합니다.

### 4. `noStop` 훅 구조가 현재 `multiSplit` 훅보다 더 가깝습니다

- `hooks/useNoStopMultiSplitExecution.ts`
  - status 기반
  - target holding 중심 계산
  - progress 퍼센트
  - summary line builder 연결
- `hooks/useMultiSplitExecution.ts`
  - 구간(`first/second/quarter`) 중심
  - quarter mode / MOC / recent trading days 의존
  - 현재 요구사항과 무관한 legacy 규칙이 많습니다.

즉, 이번 리브랜딩된 `multiSplit`은 **기존 `multiSplit` 런타임을 그대로 끌고 가는 것보다 `noStop` 구조를 따라가는 편이 더 안전**합니다.

### 5. 전략 생성 화면도 이미 “단일 종목 전략용 step” 구조를 갖고 있습니다

- `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`
  - `MultiSplitConfigStepView`
  - `NoStopMultiSplitConfigStepView`
- `components/strategyCreator/useStrategyCreatorController.tsx`
  - 전략별 draft state
  - clamp/commit handlers
- `src/components/StrategyCreator/utils.ts`
  - wizard draft -> runtime strategy 변환

따라서 이번 리브랜딩은 새 마법사 구조를 발명할 필요가 없고, **기존 단일 종목 전략 슬라이스에 파라미터 2개를 얇게 추가**하면 됩니다.

### 6. 매수 안내 표기 계약도 이미 `noStop` 쪽에 존재합니다

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
  - `calculateNoStopExecution()` 안에서 `targetHolding?.avgPrice`를 읽습니다.
  - `resolveAppliedLocRatio(strategy, snapshot)`가 `baseLocRatio` fallback, 조건 매칭 시 preset 후보 수집, 최댓값 선택을 수행합니다.
  - `calculateMocFirstRemainingToLocAllocation(...)`로 `LOC/MOC` 수량을 계산합니다.
  - `buildDisplayOrderEntry(avgPrice, allocation.finalLocQty)`로 `LOC`를 **평단가 기준 가격/수량**으로 만듭니다.
  - `buildDisplayQuantityOnlyOrder(allocation.finalMocQty)`로 `MOC`를 **수량-only**로 만듭니다.
- `supabase/functions/_shared/noStopExecutionMessages.ts`
  - `displayLowLoc`는 `가격 / 수량` 라인으로 출력합니다.
  - `displayMocBuy`는 `수량만` 출력합니다.

즉, 이번 요구사항의 "평단가 LOC / MOC 수량-only"는 새 규칙이 아니라, 현재 로컬의 `noStop` display contract를 그대로 재사용하면 됩니다.

## 현재 계획서의 무자비 리뷰 결론

현재 문서 초안은 **그대로는 통과가 아닙니다.**

가장 큰 이유는 아래 4개입니다.

1. `useMultiSplitExecution`를 무비판적으로 확장하면, 현재 `multiSplit`에 남아 있는 quarter-mode/phase 복잡도까지 함께 끌고 들어올 위험이 큽니다.
2. Pre-launch 기준에서는 레거시 호환 어댑터를 상상해서 붙이는 순간, 문서가 오히려 **존재하지 않는 요구사항**을 만들어 냅니다.
3. `appliedLocRatioPct`를 매일 자유 슬라이더로 다시 정하는 방식으로 이해하면 안 됩니다.
   - 현재 무손절 실코드는 `baseLocRatio`를 기본으로 두고, 저장된 조건부 프리셋이 충족될 때만 덮어씁니다.
   - 따라서 이번 리브랜딩 계획도 `baseLocRatio + 조건부 프리셋 + 최대 LOC% 우선` 규칙을 그대로 따라야 합니다.
4. 현재 중앙 validator는 `max`를 지원하지 않으므로, 상한 검증을 각 함수에서 흩뿌리면 규칙 1/6을 다시 위반하게 됩니다.

따라서 이번 수정본은

- **저장 키는 유지**
- **회계/표시 계약은 고정**
- **조건부 LOC 비율은 no-stop 실규칙으로 고정**
- **quarter-mode legacy runtime은 새 스마트 스플릿 경로에 끌고 오지 않음**

로 방향을 좁힙니다.

## 권장 아키텍처

## 1. 저장 구조

권장 방향은 아래와 같습니다.

- 저장 필드: 계속 `strategy.multiSplit`
- 내부 타입/함수/파일명: 전부 `multiSplit` 접두 유지
- 확장 파라미터:
  - `mainTakeProfitRatioPct`
  - `riskCutRatioPct`
- 파생 파라미터:
  - `intermediateTakeProfitRatioPct = 100 - mainTakeProfitRatioPct`

이렇게 하면 **메인/중간 익절 비율을 이중 저장하지 않아** drift를 막을 수 있습니다.

## 2. 런타임 구조

권장 방향은 아래와 같습니다.

1. `calcHoldings`는 그대로 유지합니다.
2. `findTargetHolding`는 `noStop` 파일 소유가 아니라 **전략 중립 helper**로 분리합니다.
3. 신규 helper가 필요해도 `multiSplit` 접두만 사용하되, quarter-mode 로직과 새 가이드 계산을 한 함수/한 타입에 섞지 않습니다.
4. 시뮬레이션의 1차 목표는 `useMultiSplitExecution`을 바로 뒤엎는 것이 아니라, **새 가이드 계산을 위한 순수 함수 레이어를 먼저 고정**하는 것입니다.
5. `Dashboard`는 `noStop` progress block을 재사용하되 라벨만 `Cash Usage` 계열로 바꿉니다.
6. 일별 요약/모달 안내 문구는 `noStopExecutionMessages.ts` 계약을 따르되, 내부 네이밍은 계속 `multiSplit` 기준으로 유지합니다.

### ISP/Fat Interface 격리 원칙

이번 계획은 사용자가 언급한 `Strategy` fat interface 기술 부채를 더 키우지 않기 위해 아래를 고정합니다.

- 새 파라미터는 오직 `strategy.multiSplit` slice 안에만 추가합니다.
- `ma0`, `ma1`, `ma2`, `ma3` 필드에 `multiSplit` 전용 의미를 억지로 주입하지 않습니다.
- `buildValidationInput()`에서 `STRATEGY_DEFAULTS`로 우회 중인 MA 기본값 캡슐화는 **그대로 유지**하고, 이번 변경이 그 경계를 넘지 않게 합니다.
- 즉, 이번 리브랜딩은 fat interface를 해결하지는 않지만, **기술 부채 격리 경계를 깨지 않는 방향으로만 진행**합니다.

## 3. UI 흐름

### 전략 생성 화면

기존 `multiSplit` 화면에서 아래 순서로 보이는 구성이 가장 단순합니다.

1. 대상 종목
2. 목표 수익률
3. 총 분할 횟수
4. 기본 `LOC` 비율 입력 (`baseLocRatio`)
5. `RSI` 조건 on/off + 기준 preset + 적용 budget preset (`70 / 50 / 30`)
6. 정배열 조건 on/off + 기준 preset + 적용 budget preset (`70 / 50 / 30`)
7. 메인 익절 비중 슬라이더 (`1~100`)
8. 파생 표시: 중간 익절 비중 (`100 - 메인 익절 비중`)
9. 리스크 컷 비중 입력

여기서 중요한 점:

- `중간 익절 비중`은 **읽기 전용 파생값**으로만 보여 줍니다.
- 별도 second slider를 만들지 않습니다.
- 이유는 메인/중간이 100% 합 규칙을 가지므로, 값을 2개로 저장하는 순간 검증/동기화 비용만 늘어납니다.
- `LOC/MOC` 비율은 **일별 자유 슬라이더가 아니라 저장된 `baseLocRatio` + 조건부 preset override**로만 결정합니다.

### 대시보드 카드

기존 `noStop` 요약 블록 형태를 그대로 가져가되 라벨만 바꿉니다.

- 상단 라벨: `현금 사용률` / `Cash Usage`
- progress width: `cashUsagePct`
- detail lines:
  - `LOC` 매수 안내 (`avgPrice` 기준 가격/수량)
  - `MOC` 매수 안내 (수량-only)
  - 메인 익절 안내 수량
  - 중간 익절 안내 수량
  - 리스크 컷 안내 수량

### 실행 모달 / 일일 요약

`buildNoStopExecutionSummaryLines()`와 동일한 계약으로 line builder를 따르는 편이 가장 안전합니다.

- line order를 고정
- 메시지 사전 기반
- 수량 중심
- `LOC` 매수는 `가격 / 수량`
- `MOC` 매수는 `수량-only`

## 4. 변경 대상 파일 후보

### 타입 / draft / 저장

- `types.ts`
- `supabase/functions/_shared/types.ts`
- `src/components/StrategyCreator/utils.ts`

### 전략 생성 UI

- `components/strategyCreator/useStrategyCreatorController.tsx`
- `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`
- `components/strategyCreator/types/ui.ts`
- `components/strategyCreator/StrategyCreator.tsx`
- `constants/messages/strategyCreatorMessages.ts`

### 런타임 계산 / 메시지

- `supabase/functions/_shared/multiSplitShared.ts` (회계 SSOT 유지 + 진행률/매수안내 확장 후보)
- `supabase/functions/_shared/noStopMultiSplitShared.ts` (helper 추출 후보)
- `supabase/functions/_shared/multiSplitExecutionMessages.ts` (분리 필요 시 신규, 접두는 유지)
- `hooks/useMultiSplitExecution.ts` (기존 hook을 즉시 갈아엎지 말고, 새 순수 계산 레이어를 소비하는 얇은 어댑터로 한정)

### 렌더링 / 요약

- `components/Dashboard.tsx`
- `components/TradeExecutionModal.tsx`
- `utils/dailyExecutionSummary.ts`
- `supabase/functions/generate-daily-execution-summaries/index.ts`
- `constants/messages/dashboardMessages.ts`
- `constants/messages/tradeMessages.ts`

### 테스트

- `utils/multiSplitCalc.test.ts` 개편
- `hooks/useMultiSplitExecution.test.ts` 개편
- 프론트/서버 summary cross validation 계열 테스트

## 5. Step 3 구현 순서 제안

1. **타입과 draft 확장**
   - verify: `baseLocRatio`, 조건부 preset, `mainTakeProfitRatioPct`, `riskCutRatioPct`가 저장 draft -> runtime strategy까지 끊김 없이 전달되는지 확인
2. **전략 중립 holdings helper 추출**
   - verify: `noStop` 동작이 기존과 동일한지 테스트 유지
3. **`multiSplit` 가이드 순수 계산 레이어 확정**
   - verify: `resolveAppliedLocRatio(baseLocRatio + 조건부 preset + 최대 LOC% 우선)`와 `MOC 우선 워터폴`, `avgPrice LOC / MOC 수량-only` 스니펫 테스트 통과
4. **multiSplit 훅 순수 계산 어댑터 구축**
   - verify: 기존 복잡한 quarter-mode 구조는 무시하고, 새 순수 함수 레이어(`buyGuide`, `sellGuide`, `cashUsage`)만 소비하는 얇은 훅 구조인지 확인
5. **Dashboard/Modal/일일요약 라벨 교체**
   - verify: `multiSplit` 식별자 유지, `현금 사용률` progress, `avgPrice LOC / MOC 수량-only` line 출력 확인
6. **신규 전략 적용**
   - verify: Pre-launch 상황이므로 데이터 마이그레이션 및 레거시 quarter-mode 방어막은 만들지 않고, 스마트 스플릿 순수 계산 경로만 구동되게 고정

## 6. 오버엔지니어링 방지 자가 점검

이번 계획은 아래를 **의도적으로 하지 않습니다.**

- 새 전략 레지스트리/플러그인 시스템 도입
- 새 `smartSplit` 접두 식별자/파일명을 만드는 것
- `main`과 `intermediate` 비율을 둘 다 저장
- `noStop` indicator fetch 구조를 이번 리브랜딩에 억지로 이식
- 출시 전인데도 레거시 호환 어댑터나 마이그레이션 레이어를 미리 만드는 것
- broker execution / order placement 로직 추가
- `Dashboard` 하나 쓰자고 범용 디자인 시스템 컴포넌트 대규모 신설
- `quarter mode`, `MOC`, 최근 거래일 로직을 이번 리브랜딩에 끌고 오는 것

즉, 이번 설계의 핵심은

> **회계는 `calcHoldings` 재사용, UI는 no-stop progress 재사용, 상태 shape는 no-stop style 재사용, 내부 식별자는 `multiSplit` 유지**

입니다.

## 7. 이번 수정으로 확정된 결정

1. 내부 구현 식별자는 모두 `multiSplit`를 유지합니다.
2. 매수 안내는 `noStop`과 동일하게 고정합니다.
   - `LOC`: `avgPrice` 기준 `가격 / 수량`
   - `MOC`: 수량-only
3. `LOC/MOC` 예산 분배 비율도 `noStop`과 동일하게 고정합니다.
   - 기본값: `baseLocRatio`
   - override: `RSI` / `정배열` 조건에 연결된 `70 / 50 / 30` preset
   - 다중 매칭 시: 더 큰 `LOC%` 선택
   - 수량 배분: `MOC` 우선 워터폴 후 잔여 금액을 `LOC`에 배정

---

## 핵심 시뮬레이션 스니펫

### 스니펫 A — 상태 구조는 `baseLocRatio + 조건부 preset + main`만 저장하고 `intermediate`는 파생값으로 계산

```ts
const PERCENT_DENOMINATOR = 100;
const MIN_MAIN_TAKE_PROFIT_RATIO_PCT = 1;
const MAX_MAIN_TAKE_PROFIT_RATIO_PCT = 100;
const MIN_RISK_CUT_RATIO_PCT = 0;
const MAX_RISK_CUT_RATIO_PCT = 100;

function validatePercentRange(args: {
  name: string;
  value: number;
  min: number;
  max: number;
  context: string;
}): void {
  validateFinancialArgs(
    { [args.name]: args.value },
    { [args.name]: { min: args.min } },
    args.context,
  );

  // 현재 중앙 validator가 상한(max)을 지원하지 않으므로,
  // 상한 가드는 한 helper로만 집중시켜 산발적인 inline validation을 막습니다.
  if (args.value > args.max) {
    throw new Error(
      `${args.context}.${args.name} must be <= ${args.max}. Received: ${args.value}`,
    );
  }
}

interface MultiSplitStrategyDraft {
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
  rsiCondition?: {
    isEnabled: boolean;
    criterionPreset: 'rsi30' | 'rsi40' | 'rsi50';
    budgetPreset: 'loc70' | 'balanced' | 'moc70';
  };
  alignmentCondition?: {
    isEnabled: boolean;
    criterionPreset: 'ma5_20' | 'ma20_60' | 'ma60_120';
    budgetPreset: 'loc70' | 'balanced' | 'moc70';
  };
}

function deriveMultiSplitIntermediateTakeProfitRatioPct(
  mainTakeProfitRatioPct: number,
): number {
  validatePercentRange({
    name: 'mainTakeProfitRatioPct',
    value: mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'deriveMultiSplitIntermediateTakeProfitRatioPct',
  });

  return PERCENT_DENOMINATOR - mainTakeProfitRatioPct;
}
```

검증 포인트:

- `main=1`이면 `intermediate=99`
- `main=100`이면 `intermediate=0`
- 저장값은 1개뿐이라 drift가 없습니다.

### 스니펫 B — `findTargetHolding -> calcHoldings`를 그대로 타서 현금 사용률 계산

```ts
const MIN_PROGRESS_PERCENT = 0;
const MAX_PROGRESS_PERCENT = 100;

function normalizeTickerSymbol(stock: string): string {
  return stock.trim().toUpperCase();
}

function findTargetHolding(
  trades: TradeInput[],
  targetStock: string,
): ReturnType<typeof calcHoldings>[number] | null {
  const normalizedTargetStock = normalizeTickerSymbol(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  const holdings = calcHoldings(trades);
  return (
    holdings.find(
      (holding) =>
        normalizeTickerSymbol(holding.stock) === normalizedTargetStock,
    ) ?? null
  );
}

function calculateMultiSplitCashUsagePct(args: {
  investedCost: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  validateFinancialArgs(
    {
      investedCost: args.investedCost,
      oneTimeAmount: args.oneTimeAmount,
      totalSplitCount: args.totalSplitCount,
    },
    {
      investedCost: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateMultiSplitCashUsagePct',
  );

  const totalSeed = roundMoney(args.oneTimeAmount * args.totalSplitCount);
  if (totalSeed <= 0) {
    return MIN_PROGRESS_PERCENT;
  }

  const rawUsagePct = (args.investedCost / totalSeed) * PERCENT_DENOMINATOR;
  const boundedUsagePct = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, rawUsagePct),
  );

  return roundMoney(boundedUsagePct);
}
```

검증 포인트:

- `investedCost=1000`, `oneTimeAmount=100`, `totalSplitCount=20` => `cashUsagePct=50`
- 장부 조회는 상위 조합 단계에서 1번만 수행하고, 이 함수는 O(1) 퍼센트 계산만 담당합니다.
- 전량 매도 후 `investedCost=0`이면 `cashUsagePct=0`으로 돌아옵니다.

### 스니펫 C — 메인 익절 / 중간 익절 / 리스크 컷 수량 분배

```ts
interface MultiSplitSellGuide {
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  riskCutQty: number;
}

function calculateMultiSplitSellGuide(args: {
  currentQuantity: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}): MultiSplitSellGuide {
  validateFinancialArgs(
    {
      currentQuantity: args.currentQuantity,
    },
    {
      currentQuantity: { min: 0 },
    },
    'calculateMultiSplitSellGuide',
  );

  validatePercentRange({
    name: 'mainTakeProfitRatioPct',
    value: args.mainTakeProfitRatioPct,
    min: MIN_MAIN_TAKE_PROFIT_RATIO_PCT,
    max: MAX_MAIN_TAKE_PROFIT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuide',
  });
  validatePercentRange({
    name: 'riskCutRatioPct',
    value: args.riskCutRatioPct,
    min: MIN_RISK_CUT_RATIO_PCT,
    max: MAX_RISK_CUT_RATIO_PCT,
    context: 'calculateMultiSplitSellGuide',
  });

  const safeQuantity = floorSafeQuantity(args.currentQuantity);
  if (safeQuantity <= 0) {
    return {
      mainTakeProfitQty: 0,
      intermediateTakeProfitQty: 0,
      riskCutQty: 0,
    };
  }

  const rawMainTakeProfitQty =
    safeQuantity * (args.mainTakeProfitRatioPct / PERCENT_DENOMINATOR);
  const roundedMainTakeProfitQty = Math.max(
    0,
    Math.round(rawMainTakeProfitQty + Number.EPSILON),
  );
  const mainTakeProfitQty = Math.min(
    safeQuantity,
    roundedMainTakeProfitQty,
  );
  // 한 주만 남은 상황에서도 비율에 더 가까운 쪽으로 배분되도록
  // 반올림 후 remainder를 intermediate가 가져가게 합니다.
  const intermediateTakeProfitQty = Math.max(
    0,
    safeQuantity - mainTakeProfitQty,
  );

  // 리스크 컷은 익절 라인과 동시 집행이 아니라 대체 시나리오이므로 별도 수량으로 계산합니다.
  const riskCutQty = floorSafeQuantity(
    safeQuantity * (args.riskCutRatioPct / PERCENT_DENOMINATOR),
  );

  return {
    mainTakeProfitQty,
    intermediateTakeProfitQty,
    riskCutQty,
  };
}
```

검증 포인트:

- `currentQuantity=17`, `main=65`, `riskCut=20`
  - `intermediate=35`
  - `intermediateTakeProfitQty=6`
  - `mainTakeProfitQty=11`
  - `riskCutQty=3`
- `currentQuantity=1`, `main=10`이면 `mainTakeProfitQty=0`, `intermediateTakeProfitQty=1`
- `currentQuantity=1`, `main=90`이면 `mainTakeProfitQty=1`, `intermediateTakeProfitQty=0`
- 항상 `mainTakeProfitQty + intermediateTakeProfitQty === floor(currentQuantity)`를 만족합니다.

### 스니펫 D — `noStop`과 동일한 `baseLocRatio + 조건부 preset + 최대 LOC% 우선 + MOC 우선 워터폴` 매수 안내 계산

```ts
const MOC_SAFETY_BUFFER_MULTIPLIER = 1.15;
const MIN_VALID_UNIT_COST = Number.EPSILON;

const BUDGET_LOC_RATIO_BY_PRESET = {
  loc70: 70,
  balanced: 50,
  moc70: 30,
} as const;

interface MultiSplitBuyGuide {
  appliedLocRatioPct: number;
  displayLocBuy?: {
    price: number;
    quantity: number;
  };
  displayMocBuy?: {
    quantity: number;
  };
}

function resolveAppliedLocRatio(args: {
  baseLocRatio: number;
  rsiRule?: { threshold: number; locRatio: 70 | 50 | 30 };
  alignmentRule?: {
    shortPeriod: number;
    longPeriod: number;
    locRatio: 70 | 50 | 30;
  };
  snapshot: {
    rsi?: number;
    maByPeriod?: Partial<Record<number, number>>;
  };
}): number {
  const matchedLocRatios: number[] = [];

  if (
    args.rsiRule != null &&
    typeof args.snapshot.rsi === 'number' &&
    args.snapshot.rsi < args.rsiRule.threshold
  ) {
    matchedLocRatios.push(args.rsiRule.locRatio);
  }

  const shortValue =
    args.alignmentRule == null
      ? undefined
      : args.snapshot.maByPeriod?.[args.alignmentRule.shortPeriod];
  const longValue =
    args.alignmentRule == null
      ? undefined
      : args.snapshot.maByPeriod?.[args.alignmentRule.longPeriod];

  if (
    args.alignmentRule != null &&
    typeof shortValue === 'number' &&
    typeof longValue === 'number' &&
    shortValue > longValue
  ) {
    matchedLocRatios.push(args.alignmentRule.locRatio);
  }

  if (matchedLocRatios.length === 0) {
    return args.baseLocRatio;
  }

  return Math.max(...matchedLocRatios);
}

function calculateMultiSplitBuyGuide(args: {
  remainingBudget: number;
  feeRate: number;
  avgPrice: number;
  currentPrice: number;
  baseLocRatio: number;
  rsiRule?: { threshold: number; locRatio: 70 | 50 | 30 };
  alignmentRule?: {
    shortPeriod: number;
    longPeriod: number;
    locRatio: 70 | 50 | 30;
  };
  snapshot: {
    rsi?: number;
    maByPeriod?: Partial<Record<number, number>>;
  };
}): MultiSplitBuyGuide {
  validateFinancialArgs(
    {
      remainingBudget: args.remainingBudget,
      feeRate: args.feeRate,
      avgPrice: args.avgPrice,
      currentPrice: args.currentPrice,
      baseLocRatio: args.baseLocRatio,
    },
    {
      remainingBudget: { min: 0 },
      feeRate: { min: 0 },
      avgPrice: { strictPositive: true },
      currentPrice: { strictPositive: true },
      baseLocRatio: { min: 0 },
    },
    'calculateMultiSplitBuyGuide',
  );

  const appliedLocRatioPct = resolveAppliedLocRatio({
    baseLocRatio: args.baseLocRatio,
    rsiRule: args.rsiRule,
    alignmentRule: args.alignmentRule,
    snapshot: args.snapshot,
  });

  const locUnitCost =
    args.avgPrice * (1 + args.feeRate / PERCENT_DENOMINATOR);
  // [의도된 생략] MOC_SAFETY_BUFFER_MULTIPLIER(1.15)가 이미 15% 버퍼를 제공하므로,
  // 통상적인 feeRate(0.25% 등) 때문에 예산 초과가 나지 않아 MOC 쪽 feeRate는 더하지 않습니다.
  const mocUnitCost =
    args.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
  if (locUnitCost <= MIN_VALID_UNIT_COST || mocUnitCost <= MIN_VALID_UNIT_COST) {
    return {
      appliedLocRatioPct,
      displayLocBuy: undefined,
      displayMocBuy: undefined,
    };
  }
  const baseLocBudget =
    args.remainingBudget * (appliedLocRatioPct / PERCENT_DENOMINATOR);
  const baseMocBudget = Math.max(0, args.remainingBudget - baseLocBudget);
  // floorSafeQuantity 내부의 floorToNonNegativeInt가 Number.EPSILON을 더하므로,
  // 0.3 / 0.1 ~= 2.9999999999999996 같은 경계값에서도 1주 누락을 막습니다.
  const finalMocQty = floorSafeQuantity(baseMocBudget / mocUnitCost);
  const usedMocCost = finalMocQty * mocUnitCost;
  const remainingForLoc = Math.max(0, args.remainingBudget - usedMocCost);
  const finalLocQty = floorSafeQuantity(remainingForLoc / locUnitCost);

  return {
    appliedLocRatioPct,
    displayLocBuy:
      finalLocQty >= 1
        ? {
            price: roundMoney(args.avgPrice),
            quantity: finalLocQty,
          }
        : undefined,
    displayMocBuy:
      finalMocQty >= 1
        ? {
            quantity: Math.max(0, finalMocQty),
          }
        : undefined,
  };
}
```

검증 포인트:

- `baseLocRatio=50`, `RSI preset=70`, `정배열 preset=30`, 그리고 둘 다 충족되면 `appliedLocRatioPct=70`
- `remainingBudget=1500`, `avgPrice=100`, `currentPrice=95`, `feeRate=0.25`, `appliedLocRatioPct=70`
  - `displayLocBuy.price = 100`
  - `displayLocBuy.quantity = 10`
  - `displayMocBuy.quantity = 4`
  - `displayLocBuy.quantity`는 `avgPrice` 기준으로 계산됩니다.
  - `displayMocBuy.quantity`는 `currentPrice * 1.15` 기준으로 계산되지만, 화면에는 `수량만` 노출합니다.
- `remainingBudget=0.3`, `avgPrice=0.1`, `baseLocRatio=100`, `feeRate=0`이면 `displayLocBuy.quantity = 3`으로 유지됩니다.
- `avgPrice` 또는 `currentPrice`가 비정상적으로 `0`에 가까우면 분모 가드에 의해 추가 매수 안내를 숨깁니다.
- `MOC`는 15% 버퍼를 이미 쓰므로, 통상 feeRate까지 중복 반영하지 않는다는 도메인 의도를 주석으로 고정합니다.
- 즉, `LOC`의 안내 가격 기준은 외부 주입값이 아니라 **타깃 보유의 `avgPrice`** 이고, `LOC/MOC` 비율 역시 외부 일일 슬라이더가 아니라 **저장된 no-stop 규칙**에서 결정됩니다.

### 스니펫 E — 메시지 사전 + 템플릿 + 네이티브 통화 포맷 기반 요약/Progress 매핑

```ts
interface MultiSplitProgressVm {
  labelText: string;
  widthPct: number;
}

type MultiSplitSimulationMessageId =
  | 'multiSplit.cashUsage'
  | 'format.percentLabel'
  | 'format.priceQuantity'
  | 'format.quantityOnly';

type MultiSplitSimulationMessageMap = Record<
  MultiSplitSimulationMessageId,
  string
>;

const MULTI_SPLIT_SIMULATION_MESSAGES: Record<'ko' | 'en', MultiSplitSimulationMessageMap> = {
  ko: {
    'multiSplit.cashUsage': '현금 사용률',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
  },
  en: {
    'multiSplit.cashUsage': 'Cash Usage',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
  },
};

function getMultiSplitSimulationMessages(lang: 'ko' | 'en') {
  return MULTI_SPLIT_SIMULATION_MESSAGES[lang] ?? MULTI_SPLIT_SIMULATION_MESSAGES.ko;
}

function applyTemplate(args: {
  template: string;
  replacements: Record<string, string>;
}): string {
  let formattedText = args.template;

  for (const [key, value] of Object.entries(args.replacements)) {
    formattedText = formattedText.replaceAll(`{${key}}`, value);
  }

  return formattedText;
}

function formatPercentText(value: number): string {
  return String(roundMoney(value));
}

function formatCurrency(value: number, currencyCode: string = 'USD'): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  return roundMoney(value).toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildMultiSplitProgressVm(args: {
  cashUsagePct: number;
  progressLabel: string;
  lang: 'ko' | 'en';
}): MultiSplitProgressVm {
  const boundedUsagePct = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, args.cashUsagePct),
  );
  const messages = getMultiSplitSimulationMessages(args.lang);

  return {
    labelText: applyTemplate({
      template: messages['format.percentLabel'],
      replacements: {
        label: args.progressLabel,
        value: formatPercentText(boundedUsagePct),
      },
    }),
    widthPct: boundedUsagePct,
  };
}
```

검증 포인트:

- `cashUsagePct=-10` => `0%`
- `cashUsagePct=132.8` => `100%`
- `cashUsagePct=87.5` => `현금 사용률: 87.5%`
- 콜론(`:`), 슬래시(`/`), 퍼센트(`%`) 위치도 메시지 템플릿이 제어합니다.
- 가격은 `$`를 수동 조립하지 않고 `toLocaleString({ style: 'currency' })` 기반 포맷으로 처리합니다.

## Step 2 결론

현재 로컬 구조 기준으로 이번 리브랜딩된 `multiSplit`은 아래 5가지만 지키면 안전하게 구현 가능합니다.

1. **회계는 절대 새로 쓰지 말고 `calcHoldings` 기반으로만 간다.**
2. **내부 구현 식별자는 `multiSplit`를 그대로 유지한다.**
3. **진행률 UI는 `noStop` block을 그대로 재사용하되 라벨만 바꾼다.**
4. **매수 안내는 `avgPrice LOC / MOC 수량-only` 계약을 그대로 따른다.**
5. **새 파라미터는 `mainTakeProfitRatioPct` 1개만 저장하고, `intermediate`는 파생값으로 계산한다.**

추가 도메인 규칙 2개:

- `HOLDINGS_QTY_EPSILON`은 오직 주식 **수량** 비교에만 사용합니다.
- 가격/투자금 같은 **통화 금액** 비교는 `MIN_VALID_UNIT_COST` 또는 `roundMoney(...)`로 정규화한 값끼리만 처리합니다.

이 다섯 가지를 지키면 요구사항의 핵심인

- no-stop 아키텍처 재사용
- 현금 사용률 progress 재사용
- 익절/리스크 컷 수량 분리 렌더링

을 가장 얇은 변경으로 만족할 수 있습니다.
