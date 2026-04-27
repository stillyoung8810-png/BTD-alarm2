---
name: TVC 최적화 수평 전개 리팩토링 스니펫
overview: TVC 최적화 수평 전개 감사에서 발견한 백엔드 bulk/chunking, parity fixture, 전략 생성 UI DRY 개선 후보를 실제 적용 가능한 코드 스니펫으로 정리합니다.
stage: pre-launch-audit
status: draft
---

# TVC 최적화 수평 전개 리팩토링 스니펫

## 적용 원칙

- 이 문서는 제안 스니펫입니다. 실제 코드에는 아직 적용하지 않습니다.
- 수학 엔진 결과값, 알림 발송 조건, 전략 판정 조건은 변경하지 않습니다.
- 반복 조회·반복 UI·반복 테스트 fixture만 구조적으로 줄입니다.
- 새 추상화는 두 곳 이상에서 같은 정책을 공유할 때만 도입합니다.

## 1. 공통 concurrency 유틸

대상 후보:

- `supabase/functions/_shared/asyncBatch.ts`
- 또는 프론트 전용이면 `utils/asyncBatch.ts`

목적:

- TVC의 `processVrRefreshBatch`처럼 “한 번에 너무 많이 실행하지 않는” 정책을 다른 배치에서도 재사용합니다.
- DB update, DB read, 외부 API 호출마다 chunk size만 다르게 적용합니다.

```ts
export async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  worker: (input: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (inputs.length === 0) {
    return [];
  }

  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`mapWithConcurrency: concurrency must be a positive integer. Received ${concurrency}`);
  }

  const results: TOutput[] = [];

  for (let start = 0; start < inputs.length; start += concurrency) {
    const chunk = inputs.slice(start, start + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((input, offset) => worker(input, start + offset)),
    );
    results.push(...chunkResults);
  }

  return results;
}
```

적용 예시:

```ts
const SUMMARY_BUILD_CONCURRENCY = 5;

const chunkRows = await mapWithConcurrency(
  eligibleProfiles,
  SUMMARY_BUILD_CONCURRENCY,
  (profile) =>
    buildUserSummaryRow(
      supabase,
      cacheContext,
      profile,
      portfoliosByUser,
      summaryDate,
    ),
);
```

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | 동시성 제어만 담당하므로 SRP에 맞습니다. |
| Edge Case | 빈 배열 조기 반환, concurrency 0 이하 방어가 있습니다. |
| 수학 로직 불변 | 전략 계산에는 관여하지 않습니다. |
| 과한 추상화 여부 | 이미 TVC, 일일 요약, 알림 batch가 각각 chunk를 갖고 있어 공통화 근거가 있습니다. |

## 2. Edge 일일 요약용 bulk stock history loader

대상 파일 후보:

- `supabase/functions/generate-daily-execution-summaries/index.ts`
- 장기적으로는 `supabase/functions/_shared/stockHistoryBulk.ts`

목적:

- 현재 `getStockHistory`는 캐시와 inflight dedupe가 있지만, 최초 조회는 심볼별 `eq("symbol")` 요청입니다.
- 같은 실행에서 필요한 심볼을 먼저 모아 bulk `.in("symbol", symbols)`로 가져오면 DB 왕복을 줄일 수 있습니다.

```ts
type StockHistoryRequirement = {
  symbol: string;
  limit: number;
};

type StockHistoryRow = {
  symbol?: string | null;
  close?: number | null;
  trade_date?: string | null;
};

function normalizeHistoryRequirements(
  requirements: readonly StockHistoryRequirement[],
): Map<string, number> {
  const result = new Map<string, number>();

  for (const requirement of requirements) {
    const symbol = normalizeTickerSymbol(requirement.symbol);
    if (symbol.length === 0) continue;
    const currentLimit = result.get(symbol) ?? 0;
    result.set(symbol, Math.max(currentLimit, requirement.limit));
  }

  return result;
}

async function fetchStockHistoriesBulk(
  supabase: DailyExecutionSupabaseClient,
  requirements: readonly StockHistoryRequirement[],
): Promise<Map<string, StockHistory>> {
  const normalized = normalizeHistoryRequirements(requirements);
  const symbols = Array.from(normalized.keys());

  if (symbols.length === 0) {
    return new Map<string, StockHistory>();
  }

  const maxLimit = Math.max(...Array.from(normalized.values()));
  const { data, error } = await supabase
    .from("stock_prices")
    .select("symbol, close, trade_date")
    .in("symbol", symbols)
    .order("symbol", { ascending: true })
    .order("trade_date", { ascending: false });

  if (error) {
    throw error;
  }

  const rowsBySymbol = new Map<string, StockHistoryRow[]>();
  for (const row of (data ?? []) as StockHistoryRow[]) {
    const symbol = normalizeTickerSymbol(row.symbol ?? "");
    if (!normalized.has(symbol)) continue;
    const rows = rowsBySymbol.get(symbol) ?? [];
    if (rows.length < maxLimit) {
      rows.push(row);
      rowsBySymbol.set(symbol, rows);
    }
  }

  const histories = new Map<string, StockHistory>();
  for (const [symbol, rows] of rowsBySymbol.entries()) {
    const limit = normalized.get(symbol) ?? 0;
    const orderedRows = rows.slice(0, limit).reverse();
    const prices = orderedRows
      .map((row) => Number(row.close ?? 0))
      .filter((price) => price > 0);
    const dates = orderedRows
      .map((row) => String(row.trade_date ?? ""))
      .filter(Boolean);

    histories.set(symbol, { prices, dates });
  }

  return histories;
}
```

주의:

- 위 `.in()` 방식은 DB 왕복을 줄이지만, 결과 row 수가 커질 수 있습니다.
- 종목 수가 많아지면 RPC/window function으로 “심볼별 최신 N개”를 DB에서 자르는 편이 더 좋습니다.
- `stock_prices(symbol, trade_date desc)` 인덱스가 없다면 성능을 먼저 확인해야 합니다.

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | bulk 조회 전용 함수로 분리되어 메인 summary 로직을 오염시키지 않습니다. |
| Edge Case | requirements가 비면 DB 쿼리를 날리지 않습니다. |
| 수학 로직 불변 | 히스토리 수집만 바꾸고 MA/RSI 계산 함수는 그대로 둡니다. |
| 비용 절감 | 심볼별 N회 조회를 실행당 1회 또는 소수 chunk 조회로 줄이는 방향입니다. |

## 3. 클라이언트 주가 로딩 동시성 제한

대상 파일:

- `services/stockService.ts`

목적:

- `loadStockDataForSymbols`에서 전체 240일 로딩을 종목별 `Promise.all`로 한 번에 실행하는 대신 동시성 상한을 둡니다.

```ts
const STOCK_FULL_LOAD_CONCURRENCY = 5;

await mapWithConcurrency(symbols, STOCK_FULL_LOAD_CONCURRENCY, async (symbol) => {
  const metadata = await getStockMetadata(symbol);
  const shouldCheck = shouldCheckServerForSymbol(metadata, nowUtc);

  if (metadata && metadata.dataCount >= 200 && !shouldCheck) {
    if (
      typeof window !== "undefined" &&
      symbol === REFERENCE_SYMBOL &&
      metadata.lastUpdated != null &&
      metadata.lastUpdated.trim() !== ""
    ) {
      window.localStorage.setItem(
        LATEST_TRADE_DATE_KEY,
        metadata.lastUpdated.trim(),
      );
    }
    return;
  }

  if (metadata && metadata.dataCount >= 200 && shouldCheck) {
    await updateLatestStockData(symbol);
    return;
  }

  const { data, error } = await supabase
    .from("stock_prices")
    .select("close, trade_date")
    .eq("symbol", symbol)
    .order("trade_date", { ascending: false })
    .limit(STOCK_FULL_LOAD_LIMIT);

  // 기존 decode/persist 로직은 그대로 둡니다.
});
```

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | 동시성 제어는 공통 유틸에 맡기고, 기존 로딩 로직은 그대로 유지합니다. |
| Edge Case | 빈 symbols는 `mapWithConcurrency`가 즉시 반환합니다. |
| 수학 로직 불변 | 데이터 로딩 순서만 제한합니다. |
| 리스크 | 초기 로딩이 아주 조금 길어질 수 있지만 서버 burst 비용은 줄어듭니다. |

## 4. Parity 테스트 fixture 공통화

대상 후보:

- `utils/testFixtures/strategyParityFixtures.ts`

목적:

- TVC, MA, Multi-split, No-stop의 포트폴리오/스냅샷 생성 코드가 각 테스트 파일에 흩어져 있습니다.
- 신규 전략이 생길 때 “어떤 parity 구조를 따라야 하는지” 명확하게 합니다.

```ts
import type { Portfolio, Trade, VrBandStrategyParams } from '../../types';

export function createTradeFixture(overrides: Partial<Trade> = {}): Trade {
  return {
    id: overrides.id ?? 'trade-1',
    type: overrides.type ?? 'buy',
    stock: overrides.stock ?? 'TQQQ',
    date: overrides.date ?? '2026-01-01',
    price: overrides.price ?? 100,
    quantity: overrides.quantity ?? 1,
    fee: overrides.fee ?? 0,
    metadata: overrides.metadata,
    isMOC: overrides.isMOC,
  };
}

export function createBasePortfolioFixture(
  overrides: Partial<Portfolio> = {},
): Portfolio {
  return {
    id: overrides.id ?? 'strategy-parity',
    name: overrides.name ?? 'Strategy parity fixture',
    dailyBuyAmount: overrides.dailyBuyAmount ?? 1_000,
    startDate: overrides.startDate ?? '2026-01-01',
    feeRate: overrides.feeRate ?? 0.25,
    strategy: overrides.strategy ?? {
      ma0: {
        stock: 'TQQQ',
        rsiEnabled: false,
        alignmentEnabled: false,
        maAPeriod: 5,
        maBPeriod: 20,
      },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'TQQQ', splitCount: 1 },
      ma3: { stock: 'TQQQ' },
    },
    trades: overrides.trades ?? [],
    isClosed: overrides.isClosed ?? false,
    closedAt: overrides.closedAt,
    finalSellAmount: overrides.finalSellAmount,
    alarmconfig: overrides.alarmconfig,
    vrSnapshot: overrides.vrSnapshot,
  };
}

export function createVrParamsFixture(
  mode: VrBandStrategyParams['vrMode'],
  deltaCash: number,
  overrides: Partial<VrBandStrategyParams> = {},
): VrBandStrategyParams {
  const base = {
    initialV: 1_000,
    initialCapital: 400,
    bandRateUpper: 0.1,
    bandRateLower: 0.1,
    feeRate: 0.0025,
    G: 4,
    minOrderQty: 1,
    poolUsageRateBuy: 0.5,
    cycleWeeks: 1,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 30,
    ...overrides,
  };

  switch (mode) {
    case 'accumulate':
      return { ...base, vrMode: 'accumulate', deltaCash };
    case 'withdraw':
      return { ...base, vrMode: 'withdraw', deltaCash };
    case 'lump_sum':
      return { ...base, vrMode: 'lump_sum', deltaCash: 0 };
    default: {
      const exhaustiveCheck: never = mode;
      return exhaustiveCheck;
    }
  }
}
```

전략별 테스트 명명 제안:

- `utils/vrBandStrategyParity.test.ts`: 이중 구현 직접 비교
- `utils/maStrategyParity.test.ts`: 기존 `maStrategyCrossValidation.test.ts`의 역할을 문서화하거나 이름 정렬
- `utils/multiSplitStrategyParity.test.ts`: hook/shared engine/message parity만 분리
- `utils/noStopMultiSplitStrategyParity.test.ts`: hook/shared engine/message parity만 분리

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | 테스트 데이터 생성만 공통화합니다. 테스트 의도는 각 파일에 남깁니다. |
| 수학 로직 불변 | 프로덕션 로직 변경 없음. |
| 과한 추상화 여부 | 중복 fixture가 3개 이상 있어 공통화 근거가 있습니다. |

## 5. `dropdownInfoModalLabels` 참조 안정화

대상 파일:

- `components/strategyCreator/StrategyCreator.tsx`
- 또는 `components/strategyCreator/useStrategyCreatorController.tsx`

목적:

- 현재 Step마다 동일한 모양의 객체를 JSX 안에서 새로 만듭니다.
- `CustomDropdown`이 memoized child가 되거나 내부 effect가 객체 참조를 의존하면 불필요한 갱신이 발생할 수 있습니다.

```tsx
const dropdownInfoModalLabels = React.useMemo(
  () => ({
    badgeLabel: controller.noticeLabel,
    closeAriaLabel: controller.closeLabel,
    confirmLabel: controller.acknowledgeLabel,
    title: controller.noticeLabel,
    defaultMessage: controller.copy.lockedTickerTooltip,
  }),
  [
    controller.acknowledgeLabel,
    controller.closeLabel,
    controller.copy.lockedTickerTooltip,
    controller.noticeLabel,
  ],
);
```

적용 예시:

```tsx
<MaBaseStepView
  stockOptions={controller.stockOptions}
  stockPickerHeader={controller.copy.stockPickerHeader}
  dropdownInfoModalLabels={dropdownInfoModalLabels}
  // 기존 props 유지
/>
```

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | 동일 객체 생성을 한 곳으로 모읍니다. |
| UI 동작 불변 | label 값은 동일합니다. 참조만 안정화합니다. |
| 과한 useMemo 여부 | 자식 props 참조 안정성 목적이므로 허용됩니다. |

## 6. MA 섹션 렌더링 config array 전환

대상 파일:

- `components/strategyCreator/steps/MaWizardStepViews.tsx`

목적:

- MA 1/2/3 `SectionCard` 수동 전개를 데이터 기반 렌더링으로 바꿉니다.
- key는 `sectionId`를 사용해 안정적으로 유지합니다.

```tsx
type MaSectionCardConfig = {
  sectionId: 'ma1' | 'ma2' | 'ma3';
  title: string;
  titleHelper: string;
  stockOptions: MaSectionsStepViewProps['stockOptionsForMa1'];
  stock: string;
  rsiThreshold: number;
  isTakePartialProfit: boolean;
  partialProfitTargetPct: number;
  onStockChange: (value: string) => void;
  onRsiThresholdChange: (value: string) => number;
  onTakePartialProfitChange: (value: boolean) => void;
  onPartialProfitTargetPctChange: (value: string) => number;
};

function buildMaSectionCardConfigs(
  props: MaSectionsStepViewProps,
): MaSectionCardConfig[] {
  return [
    {
      sectionId: 'ma1',
      title: props.section1Title,
      titleHelper: props.section1Helper,
      stockOptions: props.stockOptionsForMa1,
      stock: props.ma1Stock,
      rsiThreshold: props.ma1RsiThreshold,
      isTakePartialProfit: props.isMa1TakePartialProfit,
      partialProfitTargetPct: props.ma1PartialProfitTargetPct,
      onStockChange: props.onMa1StockChange,
      onRsiThresholdChange: props.onMa1RsiThresholdChange,
      onTakePartialProfitChange: props.onMa1TakePartialProfitChange,
      onPartialProfitTargetPctChange: props.onMa1PartialProfitTargetPctChange,
    },
    // ma2, ma3도 같은 구조로 추가
  ];
}
```

렌더링 예시:

```tsx
export function MaSectionsStepView(
  props: MaSectionsStepViewProps,
): React.ReactElement {
  const sections = buildMaSectionCardConfigs(props);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {sections.map((section) => (
        <SectionCard
          key={section.sectionId}
          sectionId={section.sectionId}
          title={section.title}
          titleHelper={section.titleHelper}
          stockPickerHeader={props.stockPickerHeader}
          dropdownInfoModalLabels={props.dropdownInfoModalLabels}
          stockLabel={props.sectionStockLabel}
          rsiThresholdLabel={props.rsiThresholdLabel}
          takePartialProfitLabel={props.takePartialProfitLabel}
          partialProfitTargetLabel={props.partialProfitTargetLabel}
          stockOptions={section.stockOptions}
          stock={section.stock}
          rsiThreshold={section.rsiThreshold}
          isRsiEnabled={props.isRsiEnabled}
          isTakePartialProfit={section.isTakePartialProfit}
          partialProfitTargetPct={section.partialProfitTargetPct}
          onStockChange={section.onStockChange}
          onRsiThresholdChange={section.onRsiThresholdChange}
          onTakePartialProfitChange={section.onTakePartialProfitChange}
          onPartialProfitTargetPctChange={section.onPartialProfitTargetPctChange}
        />
      ))}
    </div>
  );
}
```

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY | 3회 반복된 `SectionCard` 전개를 하나의 map으로 줄입니다. |
| Key 안정성 | `sectionId` 사용, index key 사용 없음. |
| 수학/비즈니스 로직 불변 | UI 렌더 구조만 바뀝니다. |
| 주의 | config array가 매 렌더 새로 만들어지는 것은 `MaSectionsStepView` 내부 로컬 렌더용이면 괜찮습니다. memoized child에 넘길 경우 `useMemo`를 추가합니다. |

## 7. 공통 `StrategyToggleRow`

대상 후보:

- `components/strategyCreator/common/StrategyToggleRow.tsx`

목적:

- `ToggleField`와 `ToggleCard`의 중복을 줄이고, 접근성(`aria-pressed`)을 한 곳에서 관리합니다.

```tsx
import React from 'react';

interface StrategyToggleRowProps {
  label: string;
  helperText?: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}

export function StrategyToggleRow({
  label,
  helperText,
  isChecked,
  onChange,
}: StrategyToggleRowProps): React.ReactElement {
  const handleClick = React.useCallback(() => {
    onChange(!isChecked);
  }, [isChecked, onChange]);

  return (
    <div className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <div className="pr-4">
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {label}
        </span>
        {helperText != null && helperText.trim().length > 0 ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={isChecked}
        onClick={handleClick}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${
          isChecked ? 'bg-blue-500' : 'bg-slate-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            isChecked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
```

자체 규정 점검:

| 규정 | 점검 |
|---|---|
| DRY/SRP | 토글 row 렌더링만 담당합니다. |
| 접근성 | `aria-pressed`를 포함합니다. |
| 렌더 안정성 | `handleClick`은 `useCallback`으로 안정화됩니다. |
| 하드코딩 | 새 문구를 만들지 않고 label/helperText props를 받습니다. |

## 적용 순서 제안

1. `dropdownInfoModalLabels` 참조 안정화
2. `StrategyToggleRow` 공통화
3. `MaSectionsStepView` config array 전환
4. `mapWithConcurrency` 공통 유틸 도입
5. Edge bulk stock history loader 설계/적용
6. parity fixture 공통화 및 테스트 파일 명명 정렬

## 요약

- 즉시 위험한 P0 버그는 아닙니다.
- 하지만 주가 히스토리 bulk loader와 공통 concurrency utility는 TVC에서 얻은 비용 절감 패턴을 MA/Multi-split/No-stop까지 확장하는 핵심입니다.
- UI 쪽은 대규모 성능 장애보다는 유지보수·참조 안정성·접근성 일관성 개선 목적입니다.

