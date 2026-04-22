---
name: 무손절 리브랜딩
overview: 무손절 다분할 전략을 칩 기반 설정 UX와 실제 MOC 의미를 반영하는 실행 로직으로 재설계하고, 대시보드/일일 요약의 T 표기를 전략 진행률 게이지로 교체합니다.
todos:
  - id: draft-no-stop-chip-state
    content: 무손절 전략 생성 상태를 기본 비율 직접 입력 + 조건부 preset draft 구조로 단순화하고 메시지/props 타입을 재정의한다.
    status: pending
  - id: replace-no-stop-config-ui
    content: 전략 생성 모달에서 고가 LOC 프리미엄 입력을 제거하고, 기본 비율은 직접 입력으로 유지하며 조건부 설정만 칩+토글 UI로 교체한다.
    status: pending
  - id: rework-no-stop-runtime
    content: 무손절 shared 계산 로직을 LOC+MOC 및 전략 진행률 기반으로 재설계하고 필요한 지표 로딩을 연결한다.
    status: pending
  - id: rebrand-no-stop-execution-ui
    content: 대시보드·일별 요약·실행 가이드의 무손절 카피를 새 용어와 진행률 UI로 바꾼다.
    status: pending
  - id: update-tests-for-new-rules
    content: 클라이언트/서버 요약 정합성과 조건부 프리셋, 진행률 계산을 검증하는 테스트를 갱신한다.
    status: pending
isProject: false
---

# 무손절 리브랜딩 계획

> 목적: 실제 프로덕션 코드를 수정하기 전에, 무손절 다분할 리브랜딩의 핵심 상태/계산/요약 포맷을 순수 시뮬레이션으로 먼저 고정합니다.  
> 실행 하네스: `docs2/no-stop-multisplit-rebranding-simulation-snippets.ts`  
> 자동 실행 게이트: `docs2/no-stop-multisplit-rebranding-simulation.test.ts`  
> 전용 설정: `docs2/no-stop-multisplit-rebranding-vitest.config.ts`

## 로컬 사실 검증 요약

사용자 제안과 로컬 코드를 교차 검증한 결과는 아래와 같습니다.

1. **프론트/서버 지표 계산 분리 문제는 사실입니다.**  
   `utils/technicalIndicators.ts`와 `supabase/functions/generate-daily-execution-summaries/index.ts`가 각각 `calculateMA`/`calculateRSI`를 따로 갖고 있습니다. 현재 둘 다 RSI는 Wilder smoothing 계열로 보이므로 "이미 수학식이 다르다"까지는 단정할 수 없지만, 프론트 쪽의 guard·rounding·invalid input 처리와 서버 쪽 구현이 이미 어긋나 있어 **SSOT 위반 자체가 치명적 리스크**입니다.
2. **`ma5` 누락은 사실입니다.**  
   프론트 `services/stockService.ts`는 요청 period에 따라 `5`도 계산할 수 있는데, 서버 `getStockSnapshot()`은 아직 `ma20`/`ma60`/`ma120`만 넣고 있어 `5/20` 정배열 규칙과 nightly summary가 같은 스냅샷 계약을 공유하지 못합니다.
3. **`latestPrice = 0` 폴백은 사실이며 즉시 봉쇄 대상입니다.**  
   서버 `getStockSnapshot()`은 가격 히스토리가 비면 `0`을 넣습니다. 이 값이 예산 분배 계산으로 내려가면 Rule 1의 분모 0/무한 수량 문제로 직결됩니다.
4. **사용자 제안 스니펫은 방향은 맞지만, 그대로 복붙하면 안 됩니다.**  
   제안된 `validateFinancialArgs` import 경로(`supabase/functions/_shared/vrBandStrategy`)는 현재 로컬 기준으로 바로 존재한다고 확인되지 않았습니다. 따라서 이번 문서에서는 "공용 수학 모듈 SSOT"와 "빈 히스토리 실패"라는 핵심 계약만 먼저 잠그고, 실제 구현 시에는 기존 로컬 유틸 구조에 맞춰 안전 병합합니다.

## Partial Fetch 로컬 검토

로컬 환경을 기준으로, 부분 로딩 도입 전에 반드시 알고 가야 할 사실은 아래와 같습니다.

1. **클라이언트는 아직 React Query 기반 캐시가 아니라 `stockService` + IndexedDB 중심 구조입니다.**  
   현재 `services/db.ts`의 `stockPrices`, `stockMetadata`는 모두 `symbol` 기준으로 조회됩니다. 즉, 원시 가격 히스토리 캐시는 종목 단위입니다.
2. **`fetchLatestStockSnapshot()`은 지금도 요구사항 인지형 API가 아닙니다.**  
   실제 구현은 `fetchStockPrice()`를 호출하고, 그 내부에서 DB miss 시 `fetchStockPrices()`가 다시 `calculateTechnicalIndicators(symbol, [20, 60, 120])`를 무조건 수행합니다. 즉, 현재 구조는 `price-only`와 `indicator-aware` snapshot을 구분하지 못하고 이미 과조회가 섞여 있습니다.
3. **서버 `snapshotCache`는 실제로 `symbol` 단일 키입니다.**  
   `supabase/functions/generate-daily-execution-summaries/index.ts`의 `getStockSnapshot()`은 `snapshotCache.get(symbol)` 구조라서, partial fetch를 같은 이름으로 얹으면 "price-only snapshot이 indicator-aware snapshot을 오염시키는" silent fallback 위험이 현실적입니다.
4. **드래프트 편집 중 과호출은 아직 직접 발생하지 않지만, 설계를 잘못하면 바로 생깁니다.**  
   현재 `hooks/useNoStopMultiSplitExecution.ts`는 `useEffect(..., [targetStock])`라서 토글/칩 선택마다 호출되지는 않습니다. 다만 partial fetch를 전략 생성 모달 드래프트 상태에 바로 연결하면, 토글 변화마다 네트워크 재호출이 생길 수 있으므로 정책을 문서로 먼저 고정해야 합니다.

### 검토 결론

- **원시 가격 히스토리 캐시(`historyCache`, IndexedDB `stockPrices`)는 계속 `symbol` 기준으로 유지해도 됩니다.** 같은 종목의 OHLC 히스토리는 요구사항과 무관하기 때문입니다.
- **파생 snapshot/indicator 결과 캐시는 반드시 `symbol + requirements` 키로 분리해야 합니다.** silent fallback을 막아야 하는 핵심 지점은 여기입니다.
- **지표 fetch 시점은 드래프트 편집 중이 아니라 `step submit/next`와 `저장된 전략 실행 화면 mount`로 제한합니다.** 이 정책이 렌더링 안정성과 네트워크 비용을 동시에 지켜줍니다.

## 사전 구조 검토

현재 시스템을 기준으로, 아래 지점들이 이번 리브랜딩의 직접 변경 대상입니다.

1. `components/strategyCreator/useStrategyCreatorController.tsx`  
   무손절 전략은 아직 `handleNoStopLowLocBudgetRatioChange`, `handleNoStopHighLocPremiumPctChange`처럼 **숫자 입력 커밋 + clamp** 구조입니다.
2. `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`  
   무손절 설정 화면은 아직 `lowLocBudgetRatio`, `highLocPremiumPct`, `takeProfitPct`, `totalSplitCount`를 **4개의 숫자 입력**으로 렌더링합니다.
3. `src/components/StrategyCreator/utils.ts`  
   `NoStopMultiSplitWizardDraftInput`와 `buildNoStopMultiSplitStrategy()`가 아직 `lowLocBudgetRatio` / `highLocPremiumPct`를 **raw number**로 그대로 저장합니다.
4. `hooks/useNoStopMultiSplitExecution.ts`  
   훅은 현재 `fetchLatestStockSnapshot()`에서 **`currentPrice`만** 주로 사용하며, `5/20` 정배열 프리셋에 필요한 `ma5`를 직접 확보하지 않습니다.
5. `supabase/functions/_shared/noStopMultiSplitShared.ts`  
   공용 엔진은 아직 `calcNoStopCurrentRound()`와 `highLocPremiumPct` 기반 `highLoc` 계산을 유지하고 있습니다.
6. `components/Dashboard.tsx` / `utils/dailyExecutionSummary.ts` / `supabase/functions/_shared/maSummaryShared.ts`  
   실행 요약은 아직 `T = X.XX`, `저가 LOC`, `고가 LOC`, `가격 / 수량` 포맷을 사용합니다.
7. `utils/noStopMultiSplitCalc.test.ts` / `utils/noStopMultiSplitCrossValidation.test.ts`  
   기존 테스트도 `highLocPremiumPct`, `highLoc`, `currentRound`를 정답으로 가정하고 있어 새 용어와 계산식으로 함께 교체돼야 합니다.

## 시뮬레이션 통과 게이트

아래 조건이 모두 통과돼야 실제 코드 구현에 들어갑니다.

1. 기본 비율은 사용자가 **직접 숫자 입력**하고, RSI/정배열 조건 비율만 `preset ID`로 저장합니다.
2. RSI/정배열 토글이 둘 다 `OFF`이면 조건부 칩 그룹은 노출되지 않습니다.
3. 조건 토글이 `ON`일 때만 해당 조건의 기준 칩 + 비율 칩이 노출됩니다.
4. 클라이언트/서버 snapshot은 **`currentPrice`만으로도 유효**해야 하며, 보조 지표는 optional 이어야 합니다.
5. 빈 가격 히스토리는 `0`으로 폴백하지 않고 **명시적으로 실패**해야 합니다.
6. 조건 판단에 필요한 지표만 부분 로딩해야 하며, base-only 전략은 RSI/MA를 요청하지 않아야 합니다.
7. 정배열 규칙이 켜져 있어도 필요한 MA가 일부 누락되면 크래시 대신 **base ratio**로 폴백해야 합니다.
8. 조건이 모두 불충족이면 비율은 사용자가 입력한 기본 비율로 폴백합니다.
9. RSI와 정배열이 동시에 충족되면 **더 보수적인 LOC 비율**이 선택돼야 합니다.
10. MOC 수량은 항상 `Math.floor(mocBudget / (currentPrice * 1.15))`로 계산돼야 합니다.
11. 전략 진행률은 `0 ~ 100%`로 clamp 되며, 총 시드 소진 시 `0%`가 돼야 합니다.
12. 파생 snapshot 캐시는 `symbol` 단일 키가 아니라 **`symbol + requirements` 키**를 사용해야 합니다.
13. 드래프트 편집 중 토글/칩 변경은 지표 fetch를 트리거하지 않고, **step submit 또는 저장된 전략 mount/change**에서만 fetch 해야 합니다.
14. 실행 엔진은 `targetStock` 보유 데이터만 사용해야 하며, 타 종목 보유분으로 신규 진입 상태를 덮어쓰면 안 됩니다.
15. `totalInvested`, `progressPct`, `isSplitComplete`도 **오직 `targetStock` 누적 비용만** 기준으로 계산해야 합니다.
16. 실행 요약 라인은 하드코딩 문구가 아니라 **메시지 key -> 사전 lookup** 구조를 사용해야 합니다.
17. MOC 라인은 `분할 매수 (MOC): N주`만 표시하고, 가격은 노출하지 않아야 합니다.
18. 분할 완료 상태에서는 추가 매수 라인이 사라지고 익절 라인만 남아야 합니다.

## 시뮬레이션 실행 결과

실행 명령:

```bash
npm run test -- --config docs2/no-stop-multisplit-rebranding-vitest.config.ts
```

현재 결과:

- `17/17` 테스트 통과
- Type error 없음
- 따라서 문서의 게이트 기준을 만족하는 시뮬레이션 초안은 확보된 상태입니다.

## 구체 스니펫

### 스니펫 A — 전략 생성 상태를 기본 입력 + 조건부 preset으로 단순화

대상 파일:

- `src/components/StrategyCreator/utils.ts`
- `components/strategyCreator/useStrategyCreatorController.tsx`
- `components/strategyCreator/types/ui.ts`

```ts
const BUDGET_LOC_RATIO_BY_PRESET = {
  loc70: 70,
  balanced: 50,
  moc70: 30,
} as const;

const RSI_THRESHOLD_BY_PRESET = {
  rsi30: 30,
  rsi40: 40,
  rsi50: 50,
} as const;

const ALIGNMENT_PERIODS_BY_PRESET = {
  ma5_20: { shortPeriod: 5, longPeriod: 20 },
  ma20_60: { shortPeriod: 20, longPeriod: 60 },
  ma60_120: { shortPeriod: 60, longPeriod: 120 },
} as const;

type NoStopBudgetPresetId = keyof typeof BUDGET_LOC_RATIO_BY_PRESET;
type NoStopRsiPresetId = keyof typeof RSI_THRESHOLD_BY_PRESET;
type NoStopAlignmentPresetId = keyof typeof ALIGNMENT_PERIODS_BY_PRESET;

interface NoStopConditionDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: NoStopBudgetPresetId;
}

interface NoStopMultiSplitWizardDraftInput {
  targetStock: string;
  baseLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
  rsiCondition?: NoStopConditionDraft<NoStopRsiPresetId>;
  alignmentCondition?: NoStopConditionDraft<NoStopAlignmentPresetId>;
}

function buildNoStopConfigSections(draft: NoStopMultiSplitWizardDraftInput) {
  const sections = [{ id: 'baseLocRatioInput' }];

  if (draft.rsiCondition?.isEnabled === true) {
    sections.push(
      { id: 'rsiCriterion', selectedOptionId: draft.rsiCondition.criterionPreset },
      { id: 'rsiBudget', selectedOptionId: draft.rsiCondition.budgetPreset },
    );
  }

  if (draft.alignmentCondition?.isEnabled === true) {
    sections.push(
      {
        id: 'alignmentCriterion',
        selectedOptionId: draft.alignmentCondition.criterionPreset,
      },
      { id: 'alignmentBudget', selectedOptionId: draft.alignmentCondition.budgetPreset },
    );
  }

  return sections;
}
```

Why:

- 기본 비율은 현재 UX처럼 직접 입력으로 유지하면서, 조건부 추천 비율만 preset으로 제한해 입력 자유도와 단순성을 함께 가져갑니다.
- JSX를 먼저 짜기보다 `section builder`를 순수 함수로 고정하면 "기본 입력은 항상 노출, 조건부 칩은 토글 ON일 때만 노출" 규칙을 테스트로 먼저 잠글 수 있습니다.

### 스니펫 B — 서버 요약 snapshot은 required indicator만 부분 로딩

대상 파일:

- `supabase/functions/generate-daily-execution-summaries/index.ts`
- `supabase/functions/_shared/technicalIndicators.ts`

```ts
const MAX_HISTORY_DAYS = 240;
const EMPTY_PRICE_HISTORY_ERROR =
  'Stock price history is empty. Cannot compute snapshot.';

interface TechnicalIndicatorMathPort {
  calculateMA: (prices: number[], period: 5 | 20 | 60 | 120) => number;
  calculateRSI: (prices: number[]) => number;
}

interface IndicatorRequirements {
  needsRsi: boolean;
  maPeriods: readonly (5 | 20 | 60 | 120)[];
}

interface SummaryIndicatorSnapshot {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<5 | 20 | 60 | 120, number>>;
}

function collectIndicatorRequirements(
  strategy: NoStopMultiSplitStrategy,
): IndicatorRequirements {
  return {
    needsRsi: strategy.rsiRule != null,
    maPeriods:
      strategy.alignmentRule == null
        ? []
        : [strategy.alignmentRule.shortPeriod, strategy.alignmentRule.longPeriod],
  };
}

function buildSummaryIndicatorSnapshot(args: {
  prices: number[];
  requirements: IndicatorRequirements;
  sharedMath: TechnicalIndicatorMathPort;
}): SummaryIndicatorSnapshot {
  if (args.prices.length === 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const latestPrice = args.prices[args.prices.length - 1];

  if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
    throw new Error(EMPTY_PRICE_HISTORY_ERROR);
  }

  const maByPeriod: Partial<Record<5 | 20 | 60 | 120, number>> = {};
  for (const period of args.requirements.maPeriods) {
    maByPeriod[period] = args.sharedMath.calculateMA(args.prices, period);
  }

  const snapshot: SummaryIndicatorSnapshot = {
    currentPrice: latestPrice,
  };

  if (args.requirements.needsRsi) {
    snapshot.rsi = args.sharedMath.calculateRSI(args.prices);
  }

  if (Object.keys(maByPeriod).length > 0) {
    snapshot.maByPeriod = maByPeriod;
  }

  return snapshot;
}
```

Why:

- 핵심은 "서버도 프론트와 같은 수학 모듈을 호출하되, **전략이 실제로 요구한 지표만 계산한다**"는 계약입니다.
- 이 구조면 `0원 폴백 금지`, `빈 배열 인덱스 접근 차단`, `SSOT 유지`, `fat interface 방지`를 함께 만족하면서 base-only 전략까지 불필요한 API 장애에 묶지 않습니다.

### 스니펫 C — 현재가 필수, 보조지표 optional인 인디케이터 스냅샷

대상 파일:

- `hooks/useNoStopMultiSplitExecution.ts`
- `services/stockService.ts`

```ts
interface NoStopIndicatorSnapshot {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<5 | 20 | 60 | 120, number>>;
}

function composeNoStopIndicatorSnapshot(args: {
  currentPrice: number;
  technicalIndicators?: {
    rsi?: number;
    ma?: Partial<Record<5 | 20 | 60 | 120, number>>;
  } | null;
}): NoStopIndicatorSnapshot {
  validateFinancialArgs(
    { currentPrice: args.currentPrice },
    { currentPrice: { strictPositive: true } },
    'composeNoStopIndicatorSnapshot'
  );

  return {
    currentPrice: args.currentPrice,
    rsi: args.technicalIndicators?.rsi,
    maByPeriod: args.technicalIndicators?.ma,
  };
}
```

Why:

- 현재가는 주문 계산의 필수 계약이고, RSI/MA는 조건부 규칙 평가에만 필요하므로 인터페이스를 분리해야 ISP 위반이 사라집니다.
- 이 shape이면 지표 API가 일부 실패해도 실행 엔진은 죽지 않고 `baseLocRatio`로 안전하게 degrade 됩니다.

### 스니펫 D — LOC/MOC 실행 엔진과 진행률 계산

대상 파일:

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
- `utils/noStopMultiSplitCalc.ts`

```ts
const SAFETY_BUFFER_MULTIPLIER = 1.15;
const MAX_PROGRESS_PERCENT = 100;
const MIN_PROGRESS_PERCENT = 0;
const PERCENT_DENOMINATOR = 100;

function floorSafeQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value + Number.EPSILON);
}

function calculateStrategyProgressPct(args: {
  totalInvested: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  validateFinancialArgs(
    args,
    {
      totalInvested: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateStrategyProgressPct',
  );

  const totalSeed = args.oneTimeAmount * args.totalSplitCount;
  const rawProgress =
    MAX_PROGRESS_PERCENT -
    (args.totalInvested / totalSeed) * MAX_PROGRESS_PERCENT;

  return roundMoney(
    Math.min(MAX_PROGRESS_PERCENT, Math.max(MIN_PROGRESS_PERCENT, rawProgress)),
  );
}

function calculateMocQuantity(args: {
  mocBudget: number;
  currentPrice: number;
}): number {
  validateFinancialArgs(
    args,
    {
      mocBudget: { min: 0 },
      currentPrice: { strictPositive: true },
    },
    'calculateMocQuantity',
  );

  return floorSafeQuantity(
    args.mocBudget / (args.currentPrice * SAFETY_BUFFER_MULTIPLIER),
  );
}

function isValidIndicatorScalar(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveAppliedLocRatio(
  strategy: NoStopMultiSplitStrategy,
  snapshot: NoStopIndicatorSnapshot,
): number {
  const matchedLocRatios: Array<70 | 50 | 30> = [];

  if (
    strategy.rsiRule != null &&
    isValidIndicatorScalar(snapshot.rsi) &&
    snapshot.rsi < strategy.rsiRule.threshold
  ) {
    matchedLocRatios.push(strategy.rsiRule.locRatio);
  }

  if (strategy.alignmentRule != null && snapshot.maByPeriod != null) {
    const shortValue = snapshot.maByPeriod[strategy.alignmentRule.shortPeriod];
    const longValue = snapshot.maByPeriod[strategy.alignmentRule.longPeriod];

    if (isValidIndicatorScalar(shortValue) && isValidIndicatorScalar(longValue)) {
      if (shortValue > longValue) {
        matchedLocRatios.push(strategy.alignmentRule.locRatio);
      }
    }
  }

  if (matchedLocRatios.length === 0) {
    return strategy.baseLocRatio;
  }

  return matchedLocRatios.reduce((currentMax, ratio) => {
    return ratio > currentMax ? ratio : currentMax;
  }, matchedLocRatios[0]);
}

function calculateNoStopExecution(
  args: {
    trades: readonly TradeInput[];
    oneTimeAmount: number;
    feeRate: number;
    snapshot: NoStopIndicatorSnapshot;
    strategy: NoStopMultiSplitStrategy;
  }
): NoStopExecutionResult {
  const holdings = calcHoldings(args.trades);
  const targetHolding =
    holdings.find(
      (holding) =>
        normalizeTicker(holding.stock) === normalizeTicker(args.strategy.targetStock),
    ) ?? null;

  const totalInvested = targetHolding?.totalCost ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const progressPct = calculateStrategyProgressPct({
    totalInvested,
    oneTimeAmount: args.oneTimeAmount,
    totalSplitCount: args.strategy.totalSplitCount,
  });
  const totalSeed = args.oneTimeAmount * args.strategy.totalSplitCount;
  const isSplitComplete = totalInvested >= totalSeed;

  // LOC / MOC 수량 계산도 모두 floorSafeQuantity(...)를 재사용합니다.
}
```

Why:

- 진행률 계산, 조건 병합, MOC 안전 버퍼를 각각 순수 함수로 분리해야 클라이언트/서버 공용 엔진과 테스트가 같은 정답을 공유할 수 있습니다.
- `15%` 버퍼는 사용자 옵션이 아니라 **증권사 편차 흡수용 안전 규칙**이므로 상수로 고정합니다.
- 단일 종목 전략의 `progressPct`와 `isSplitComplete`는 포트폴리오 전체가 아니라 **타겟 종목 누적 비용만** 기준으로 계산해야 예산 오염이 사라집니다.
- 수량 산출은 경계값에서 `1.999999999...` 같은 IEEE 754 오차가 발생해도 `EPSILON` 보정 뒤 내림 처리해야 1주가 증발하는 사고를 막을 수 있습니다.

### 스니펫 E — 대시보드/일일 요약 포맷은 i18n key lookup으로 고정

대상 파일:

- `components/Dashboard.tsx`
- `utils/dailyExecutionSummary.ts`
- `supabase/functions/_shared/maSummaryShared.ts`

```ts
type NoStopExecutionMessageId =
  | 'noStop.strategyProgress'
  | 'noStop.lowLoc'
  | 'noStop.mocBuy'
  | 'noStop.takeProfit'
  | 'noStop.firstBuyHint'
  | 'noStop.splitComplete'
  | 'common.sharesUnit';

const NO_STOP_EXECUTION_MESSAGE_IDS = {
  strategyProgress: 'noStop.strategyProgress',
  lowLoc: 'noStop.lowLoc',
  mocBuy: 'noStop.mocBuy',
  takeProfit: 'noStop.takeProfit',
  firstBuyHint: 'noStop.firstBuyHint',
  splitComplete: 'noStop.splitComplete',
  sharesUnit: 'common.sharesUnit',
} as const satisfies Record<string, NoStopExecutionMessageId>;

function buildNoStopExecutionLines(
  execution: NoStopExecutionResult,
  messages: Record<NoStopExecutionMessageId, string>,
): string[] {
  const lines = [
    `${messages[NO_STOP_EXECUTION_MESSAGE_IDS.strategyProgress]}: ${formatPercent(execution.progressPct)}%`,
  ];

  if (execution.isFirstBuy) {
    lines.push(messages[NO_STOP_EXECUTION_MESSAGE_IDS.firstBuyHint]);
    return lines;
  }

  if (execution.lowLoc != null) {
    lines.push(
      `${messages[NO_STOP_EXECUTION_MESSAGE_IDS.lowLoc]}: ${formatUsd(execution.lowLoc.price)} / ${formatShareQuantity(execution.lowLoc.quantity)}${messages[NO_STOP_EXECUTION_MESSAGE_IDS.sharesUnit]}`,
    );
  }

  if (execution.mocBuy != null) {
    lines.push(
      `${messages[NO_STOP_EXECUTION_MESSAGE_IDS.mocBuy]}: ${formatShareQuantity(execution.mocBuy.quantity)}${messages[NO_STOP_EXECUTION_MESSAGE_IDS.sharesUnit]}`,
    );
  }

  if (execution.takeProfit != null) {
    lines.push(
      `${messages[NO_STOP_EXECUTION_MESSAGE_IDS.takeProfit]}: ${formatUsd(execution.takeProfit.price)} / ${formatShareQuantity(execution.takeProfit.quantity)}${messages[NO_STOP_EXECUTION_MESSAGE_IDS.sharesUnit]}`,
    );
  }

  if (execution.isSplitComplete) {
    lines.push(messages[NO_STOP_EXECUTION_MESSAGE_IDS.splitComplete]);
  }

  return lines;
}
```

Why:

- `Dashboard.tsx`, 프론트 일일 요약, 서버 요약이 같은 문자열 조립 규칙을 공유해야 split-brain이 생기지 않습니다.
- 하드코딩 문구 대신 message ID lookup을 쓰면, 이번 시뮬레이션이 프로덕션 i18n SSOT 패턴과 같은 방향을 미리 고정하게 됩니다.

### 스니펫 F — requirements-aware cache key와 fetch trigger 정책

대상 파일:

- `services/stockService.ts`
- `hooks/useNoStopMultiSplitExecution.ts`
- `components/strategyCreator/useStrategyCreatorController.tsx`
- `supabase/functions/generate-daily-execution-summaries/index.ts`

```ts
interface IndicatorRequirements {
  needsRsi: boolean;
  maPeriods: readonly (5 | 20 | 60 | 120)[];
}

type IndicatorFetchTrigger =
  | 'draft-change'
  | 'step-submit'
  | 'saved-strategy-mount';

function buildIndicatorRequirementCacheKey(args: {
  symbol: string;
  requirements: IndicatorRequirements;
}): string {
  const normalizedSymbol = args.symbol.trim().toUpperCase();
  const normalizedPeriods = Array.from(new Set(args.requirements.maPeriods)).sort(
    (left, right) => left - right,
  );

  return [
    normalizedSymbol,
    args.requirements.needsRsi ? 'rsi:1' : 'rsi:0',
    `ma:${normalizedPeriods.join(',')}`,
  ].join('|');
}

function shouldFetchIndicators(args: {
  trigger: IndicatorFetchTrigger;
  previousCacheKey?: string;
  nextCacheKey: string;
}): boolean {
  if (args.trigger === 'draft-change') {
    return false;
  }

  return args.previousCacheKey !== args.nextCacheKey;
}
```

Why:

- `historyCache`와 IndexedDB price history는 그대로 `symbol` 기준으로 둬도 되지만, **파생 snapshot은 요구사항 키가 없으면 silent fallback 버그를 막을 수 없습니다.**
- fetch trigger를 명시적으로 막아두지 않으면, 토글/칩 편집 중 `collectIndicatorRequirements()`가 네트워크 재호출기로 변질될 수 있습니다.
- 실제 React JSX를 바로 테스트하지 않고 `lines`를 먼저 고정하면 오버코딩 없이 UI와 텍스트를 동시에 잠글 수 있습니다.

## 오버코딩 검토

이번 스니펫 설계는 의도적으로 아래 선을 넘지 않도록 제한합니다.

1. **새 전역 store 없음**  
   기본 비율 입력 상태와 조건부 칩 상태는 기존 `wizardState.noStopMultiSplit` 안에서만 바꾸고, 상태를 상위로 끌어올리지 않습니다.
2. **새 전략 엔진 분기 남발 금지**  
   무손절 전용 계산은 기존처럼 `useNoStopMultiSplitExecution` + `_shared/noStopMultiSplitShared.ts` 경로에만 격리합니다.
3. **React 대신 순수 함수 우선**  
   칩 노출 규칙, 인디케이터 조합, 진행률 계산, 요약 라인 조립을 먼저 순수 함수로 고정해 테스트 가능한 최소 표면만 만듭니다.
4. **과한 추상화 금지**  
   칩 UI를 위해 범용 폼 엔진이나 새 설정 프레임워크는 만들지 않습니다. `기본 입력 1개 + conditional preset map + section builder` 수준으로 끝냅니다.
5. **불필요한 브리지/서버 변경 금지**  
   매수 MOC를 `Trade`에 기록하지 않으므로, 스키마/브리지/API 변경은 이번 범위에서 제외합니다.

## 확정된 방향

- `고가 LOC 프리미엄`은 완전히 제거하고, 실제 의미가 있는 `분할 매수 (MOC)`로 교체합니다.
- 기본 비율 설정은 현재처럼 사용자가 직접 입력합니다.
- 조건 토글이 둘 다 `OFF`일 때는 조건부 칩을 노출하지 않습니다.
- RSI/정배열 토글이 `ON`인데 당일 조건이 미충족이면 사용자가 입력한 기본 비율로 폴백합니다.
- RSI와 정배열이 둘 다 `ON`이고 둘 다 충족되면, 두 조건이 고른 비율 중 더 보수적인 값(LOC 비중이 더 큰 프리셋)을 적용합니다.
- `익절 목표 수익률`, `총 분할 횟수`는 이번 범위에서 기존 입력을 유지합니다.
- **매수 MOC는 `Trade`에 기록하지 않는다(확정).** 실행 가이드·일별 요약·주문 제안 UI에서만 MOC 의미를 반영하고, 거래 입력 스키마(`Trade.isMOC` 등)는 매수 쪽으로 확장하지 않는다.
- **MOC 수량 산출은 기존 고가 LOC 수량 계산 로직을 재활용하되, `15%` 안전 버퍼를 하드코딩한다(확정).** 증권사별 마진콜/주문 거절을 줄이기 위해 `mocQuantity = Math.floor(mocBudget / (currentPrice * 1.15))` 공식을 사용하고, 사용자 설정값으로 노출하지 않는다.

## 상태 구조 초안

전략 생성기의 상태는 기본 비율 숫자 입력은 유지하고, 조건부 설정만 고정 프리셋 ID를 들고 있게 바꾸는 것이 가장 단순합니다. 핵심은 `highLocPremiumPct` 같은 obsolete raw number를 제거하고, 조건부 추천 비율만 저장 직전에 숫자로 해석하는 것입니다.

```ts
export type NoStopBudgetPresetId = 'loc70' | 'balanced' | 'moc70';
export type NoStopRsiPresetId = 'rsi30' | 'rsi40' | 'rsi50';
export type NoStopMaPresetId = 'ma5_20' | 'ma20_60' | 'ma60_120';

export interface NoStopConditionPresetDraft<TCriterion extends string> {
  isEnabled: boolean;
  criterionPreset: TCriterion;
  budgetPreset: NoStopBudgetPresetId;
}

export interface NoStopMultiSplitWizardDraftInput {
  targetStock?: string;
  baseLocRatio?: number;
  takeProfitPct?: number;
  totalSplitCount?: number;
  rsiCondition?: NoStopConditionPresetDraft<NoStopRsiPresetId>;
  alignmentCondition?: NoStopConditionPresetDraft<NoStopMaPresetId>;
}
```

런타임/저장 타입은 프리셋 ID가 아니라 해석된 규칙을 저장하는 편이 클라이언트/서버 공유 계산에 유리합니다.

```ts
export interface NoStopMultiSplitStrategy {
  targetStock: string;
  baseLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
  rsiRule?: {
    threshold: 30 | 40 | 50;
    locRatio: 70 | 50 | 30;
  };
  alignmentRule?: {
    shortPeriod: 5 | 20 | 60;
    longPeriod: 20 | 60 | 120;
    locRatio: 70 | 50 | 30;
  };
}
```

이 구조로 가면 사용자가 입력한 `baseLocRatio`를 기본값으로 유지하면서도, 조건부 비율만 `preset -> locRatio`로 해석할 수 있습니다. `mocRatio`는 항상 `100 - locRatio`로 유도되므로 별도 상태와 검증이 필요 없습니다.

## 구현 축 1: 전략 생성 모달을 칩 기반으로 단순화

대상 파일:

- [components/strategyCreator/useStrategyCreatorController.tsx](components/strategyCreator/useStrategyCreatorController.tsx)
- [components/strategyCreator/steps/SingleStockStrategyStepViews.tsx](components/strategyCreator/steps/SingleStockStrategyStepViews.tsx)
- [components/strategyCreator/types/ui.ts](components/strategyCreator/types/ui.ts)
- [src/components/StrategyCreator/utils.ts](src/components/StrategyCreator/utils.ts)
- [constants/messages/strategyCreatorMessages.ts](constants/messages/strategyCreatorMessages.ts)

작업 내용:

- `NoStopMultiSplitConfigStepView`에서 `highLocPremiumPct` 입력은 제거하고, `lowLocBudgetRatio`는 `평단가 매수 비율 (%)` 숫자 입력으로 유지합니다. RSI/정배열 섹션은 토글 + 칩 그룹으로 추가합니다.
- 컨트롤러의 `handleNoStopHighLocPremiumPctChange`는 제거하고, `handleNoStopLowLocBudgetRatioChange`는 기본 입력용으로 유지합니다. 조건부 비율은 `preset ID` 선택 핸들러로 관리합니다.
- 메시지 SSOT를 확장해 다음 카피를 추가합니다: `평단가 매수 비율 (%)`, RSI 설명문, 정배열 설명문, 칩 라벨 6종, 조건부 비율 라벨.
- `buildNoStopMultiSplitStrategy()`에서 기본 입력값은 그대로 보존하고, 조건부 프리셋만 숫자 규칙으로 변환해 저장합니다.

## 구현 축 2: 무손절 실행 엔진을 LOC+MOC 규칙으로 재설계

대상 파일:

- [types.ts](types.ts)
- [supabase/functions/_shared/types.ts](supabase/functions/_shared/types.ts)
- [supabase/functions/_shared/noStopMultiSplitShared.ts](supabase/functions/_shared/noStopMultiSplitShared.ts)
- [utils/noStopMultiSplitCalc.ts](utils/noStopMultiSplitCalc.ts)
- [hooks/useNoStopMultiSplitExecution.ts](hooks/useNoStopMultiSplitExecution.ts)
- [services/stockService.ts](services/stockService.ts)
- [supabase/functions/generate-daily-execution-summaries/index.ts](supabase/functions/generate-daily-execution-summaries/index.ts)

작업 내용:

- `highLocPremiumPct`와 `currentRound/T`를 상태·계산식에서 제거합니다.
- `calcNoStopMultiSplitOrders()`는 `평단가 매수 (LOC)`와 `분할 매수 (MOC)`를 계산하는 구조로 바꾸고, MOC는 가격이 아닌 `예산 기반 수량` 중심 출력으로 재정의합니다.
- MOC 수량 계산은 기존 `highLoc` 수량 산출 흐름을 재활용하되, 프리미엄 입력 대신 `15%` 안전 버퍼를 고정 적용합니다. 구현 수식은 `const mocQuantity = Math.floor(mocBudget / (currentPrice * 1.15));` 이며, 실질적으로는 기존 `highBudget / (highPrice * (1 + feeRate / 100))` 패턴을 단순화한 안전 버전으로 다룹니다.
- `전략 진행률`은 `총 시드 = 1회 매수금 × 총 분할 횟수`, `진행률 = max(0, min(100, 100 - (현재 투입 원금 / 총 시드) * 100))`로 계산합니다.
- 현재 훅은 `currentPrice`만 받아오므로, 조건부 RSI/정배열 규칙을 적용하려면 **전략이 실제로 켠 조건만 보고 지표 요구사항을 계산**해야 합니다. 구현 계획은 `collectIndicatorRequirements()` 같은 순수 함수로 `needsRsi`, `maPeriods`를 먼저 구한 뒤, 클라이언트는 필요한 period만 넘겨 부분 조회하고, 서버 요약도 같은 요구사항 계약으로 필요한 계산만 수행하도록 맞춥니다. base-only 전략은 추가 지표 조회를 하지 않고, RSI-only 전략은 RSI만, `ma5_20` 정배열 전략은 `MA5/20`만 요청합니다.
- 클라이언트 캐시는 **원시 히스토리 캐시**와 **파생 snapshot 캐시**를 분리합니다. `getStockPrices(symbol)`와 Dexie `stockPrices`는 그대로 두고, partial fetch 결과는 `buildIndicatorRequirementCacheKey(symbol, requirements)` 기반의 메모리 캐시 또는 별도 메타 캐시로 분리합니다.
- 서버도 같은 원칙을 따릅니다. `historyCache`는 `symbol` 기준을 유지하고, `snapshotCache`만 `symbol + requirements` 키로 바꿉니다.
- fetch trigger 정책은 두 단계로 고정합니다. `strategyCreator` 편집 중에는 요구사항 key만 계산하고 네트워크 호출은 하지 않으며, `다음/저장` 시점에만 1회 검증 fetch를 수행합니다. 실행 화면(`useNoStopMultiSplitExecution`)은 저장된 전략이 mount 되거나 전략 key가 바뀐 경우에만 fetch 합니다.
- 단일 종목 전략의 보유 상태 계산은 **오직 `targetStock` 보유분만** 사용합니다. 타 종목 보유 수량/평단가를 대체 fallback으로 사용하면 신규 진입 여부와 주문 수량이 오염되므로, `targetHolding`을 찾지 못하면 `null`로 남겨 `isFirstBuy` 경로로 처리합니다.
- **매수 MOC는 `Trade`에 저장하지 않는다(확정).** `Trade.isMOC`는 기존대로 매도 등 기존 용도만 유지하고, 매수 MOC를 위한 스키마·모달 저장 경로 변경은 범위에서 제외한다. MOC는 실행 요약·가이드·계산 결과 표시에만 반영한다.

## 구현 축 3: 실행 UI와 카피를 새 의미에 맞게 정리

대상 파일:

- [components/Dashboard.tsx](components/Dashboard.tsx)
- [constants/messages/dashboardMessages.ts](constants/messages/dashboardMessages.ts)
- [utils/dailyExecutionSummary.ts](utils/dailyExecutionSummary.ts)
- [supabase/functions/_shared/maSummaryShared.ts](supabase/functions/_shared/maSummaryShared.ts)
- [components/TradeExecutionModal.tsx](components/TradeExecutionModal.tsx)
- [constants.tsx](constants.tsx)

작업 내용:

- `저가 LOC`를 `평단가 매수 (LOC)`로, `고가 LOC`를 `분할 매수 (MOC)`로 교체합니다.
- `T = X.XX`를 제거하고 `전략 진행률` 텍스트 + 프로그레스 바로 치환합니다.
- 실제 MOC 의미에 맞게 `고가 LOC: 가격 / 수량` 형태는 버리고, `분할 매수 (MOC): N주` 형태로 고정 표시합니다.
- 기존 `매일 체결 보장용`, `프리미엄` 같은 외부 전략 흔적 카피를 제거합니다.

## 구현 축 4: 검증과 테스트 정비

대상 파일:

- [utils/noStopMultiSplitCalc.test.ts](utils/noStopMultiSplitCalc.test.ts)
- [utils/noStopMultiSplitCrossValidation.test.ts](utils/noStopMultiSplitCrossValidation.test.ts)
- [components/Dashboard.test.tsx](components/Dashboard.test.tsx)

추가/수정할 검증 포인트:

- 기본 비율 직접 입력, RSI 조건, 정배열 조건, 둘 다 ON일 때의 보수적 병합 규칙
- `currentPrice`만 있는 snapshot이 유효한지, 그리고 지표 누락 시 base ratio로 안전 폴백하는지 검증
- 전략 요구사항에 따라 필요한 RSI/MA만 부분 로딩하는지 검증
- requirements-aware cache key가 `price-only`와 `ma5_20` snapshot을 서로 오염시키지 않는지 검증
- 드래프트 편집 중에는 fetch 하지 않고, `step submit`/`saved strategy mount`에서만 fetch 하는지 검증
- `targetStock`이 아닌 다른 보유 종목이 있어도 신규 진입 상태와 주문 계산이 오염되지 않는지 검증
- 빈 가격 히스토리에서 마지막 인덱스를 읽기 전에 guard clause로 즉시 실패하는지 검증
- 조건 미충족 시 사용자가 입력한 기본 비율 폴백
- `전략 진행률` 계산과 0~100 클램프
- MOC 수량 표시 포맷과 서버/클라이언트 요약 문자열 정합성
- 실행 요약이 하드코딩 문구가 아니라 message key lookup 구조를 따르는지 검증
- `15%` 안전 버퍼가 항상 고정 적용되는지, 그리고 MOC 수량이 `Math.floor(mocBudget / (currentPrice * 1.15))`와 동일하게 계산되는지 검증
- LOC/MOC 수량의 경계값이 `1.999999999...`로 계산돼도 `EPSILON` 보정 뒤 내림 처리되어 1주가 증발하지 않는지 검증

## PR / Commit 분할 순서

실제 구현은 아래 순서로 쪼개는 것이 가장 안전합니다.

1. **PR 1 — 타입/요구사항 계약 도입**  
   대상 파일: `types.ts`, `supabase/functions/_shared/types.ts`, `utils/noStopMultiSplitCalc.ts`, `supabase/functions/_shared/noStopMultiSplitShared.ts`  
   내용: `IndicatorRequirements`, optional snapshot 타입, `collectIndicatorRequirements`, graceful fallback 규칙 추가. UI와 서비스 fetch는 아직 건드리지 않습니다.
2. **PR 2 — 클라이언트 서비스 partial fetch 및 캐시 키 분리**  
   대상 파일: `services/stockService.ts`, `services/db.ts`  
   내용: `fetchLatestStockSnapshot()`를 유지하거나 thin wrapper로 두고, requirements-aware 새 API를 추가합니다. 이 단계에서 `symbol + requirements` 파생 snapshot 캐시를 도입하고, 기존 raw history 저장 구조는 유지합니다.
3. **PR 3 — 실행 훅 연결 및 trigger 정책 반영**  
   대상 파일: `hooks/useNoStopMultiSplitExecution.ts`, 필요 시 `hooks/multiSplitExecutionShared.ts`  
   내용: 저장된 전략에서만 requirements-aware fetch를 사용하도록 연결하고, `requestIdRef`/abort 흐름을 유지한 채 전략 key 변경 시에만 재조회하도록 만듭니다.
4. **PR 4 — 전략 생성 모달의 submit-time validation**  
   대상 파일: `components/strategyCreator/useStrategyCreatorController.tsx`, `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`, `components/strategyCreator/types/ui.ts`, `src/components/StrategyCreator/utils.ts`  
   내용: 토글/칩 편집 중에는 fetch 하지 않고, `다음/저장` 시점에만 requirements-aware 검증을 수행합니다.
5. **PR 5 — 서버 요약 SSOT + requirement-aware snapshot cache**  
   대상 파일: `supabase/functions/generate-daily-execution-summaries/index.ts`, 필요 시 `supabase/functions/_shared/technicalIndicators.ts`  
   내용: `historyCache`는 유지하고 `snapshotCache`만 requirement-aware key로 전환합니다. `latestPrice = 0` 폴백 제거도 이 단계에서 같이 마감합니다.
6. **PR 6 — 요약 UI/i18n 및 회귀 테스트 정리**  
   대상 파일: `components/Dashboard.tsx`, `utils/dailyExecutionSummary.ts`, `supabase/functions/_shared/maSummaryShared.ts`, `constants/messages/dashboardMessages.ts`, `components/TradeExecutionModal.tsx`, 테스트 파일들  
   내용: LOC/MOC 표기, message key lookup, 프론트/서버 정합성 테스트를 마감합니다.

## 난이도 평가

- 유효성 검사 감소 효과는 여전히 큽니다. 현재 [components/strategyCreator/useStrategyCreatorController.tsx](components/strategyCreator/useStrategyCreatorController.tsx)에는 `safeNumber + clampNumber` 기반 숫자 커밋 핸들러가 무손절 설정에 직접 연결돼 있는데, 변경 후에는 `highLocPremiumPct` 관련 숫자 검증은 사라지고, `lowLocBudgetRatio`만 기본 입력 검증으로 남습니다. 조건부 설정은 enum 선택만 남습니다.
- 다만 전체 작업 복잡도는 `중상`입니다. 이유는 UI 변경 자체보다도, `noStopMultiSplit` 저장 타입과 공통 계산기, 서버 요약, 테스트가 모두 같은 필드를 공유하고 있어서 실제 MOC 의미 변경이 타입 레벨까지 번지기 때문입니다.
- 체감 난이도는 대략 `7/10`으로 보며, 전략 생성 UI만 바꾸는 수준이 아니라 `클라이언트 훅 + shared calc + daily summary + tests`를 한 번에 맞춰야 합니다.

## TDS/모바일 레이아웃 검토

- 제안하신 칩 구조는 토스 미니앱 모바일 환경에 적합합니다. 각 그룹이 3개 선택지로 고정이라, `가로 스크롤`보다 `줄바꿈 가능한 2단/1단 그리드`가 안전합니다.
- 긴 라벨(`방어 위주 (LOC 70%)`, `단기 이평선이 장기 이평선...`) 때문에 한 줄 세 칸은 좁을 가능성이 높습니다. 칩은 최소 터치 높이 `44px` 이상, 텍스트는 2줄 허용, 그룹 간 간격을 넉넉히 두는 편이 좋습니다.
- 추천 레이아웃은 `모바일: 1열 또는 2열 랩`, `태블릿 이상: 3열`입니다. 전략 생성 모달처럼 이미 세로 정보량이 많은 화면에서는 칩만 가로 스크롤로 밀어 넣는 방식보다, 카드 안에서 자연스럽게 줄바꿈되는 레이아웃이 더 TDS 톤과 잘 맞습니다.
