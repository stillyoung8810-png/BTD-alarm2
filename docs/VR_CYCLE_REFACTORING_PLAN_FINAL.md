# VR 사이클 리팩터링 최종 명세 (V2)

**문서 역할:** 구현 시 복사·적용 가능한 단일 명세서(SSOT).  
**선행 문서:** `VR_CYCLE_REFACTORING_PLAN.md`는 논의·히스토리 보관용으로 유지하며, **구현은 본 문서를 우선**한다.

---

## 1. 목표

- `VrBandStrategyParams`에 **`cycleWeeks` (1~12주)** 필수 도입.
- UI: StrategyCreator 주기 입력, Dashboard 헤더 사이클 배지 (`#n: MM/DD ~ MM/DD`).
- 런타임: `sanitizeVrCycleWeeks` 단일 SSOT, `PortfolioRow` 단일 타입, `normalizePortfolioData` 강건화.
- VR 생성 시 **Insert와 동시에 `vrSnapshot` 시딩** (좀비 포트폴리오 방지).
- Edge: **종료 포트 제외 + 컬럼 제한 + 청크 페이지네이션**으로 OOM 방지.
- 금융: `toFixedMoney` 중심, 주문 루프 누적 Dust 차단.
- React: **`useVrOrders`** 훅으로 Step 0 병합 DRY.
- UX: Cycle 0(첫 매수 전) **`VrOrderModal`**에서 `sharesAfter` / `poolAfter` **뷰 마스킹** + A11y·I18N 준수.

---

## 2.0 Import 경로 (파일 위치 기준)

| 작성 위치 | `types` | `utils/vrBandStrategy` | `constants` |
|-----------|---------|-------------------------|---------------|
| `components/*.tsx` | `from '../types'` | `from '../utils/vrBandStrategy'` | `from '../constants/...'` |
| `components/strategies/*.tsx` | `from '../../types'` | `from '../../utils/vrBandStrategy'` | `from '../../constants/...'` |
| `hooks/*.ts` | `from '../types'` | (필요 시) `from '../utils/vrBandStrategy'` | `from '../constants/...'` |
| `utils/*.ts` | `from '../types'` | 동일 폴더만 `from './vrBandStrategy'` | `from '../constants/...'` |
| `supabase/functions/<name>/index.ts` | `from '../_shared/types.ts'` 또는 프로젝트 정책에 맞는 상대 경로 | 배포 번들 정책에 따름 | `from '../../../constants/vrConstants.ts'` 등 |

- `components/` 루트에서 `../../types` 금지 (한 단계 오류로 빌드 실패).
- `utils/`에서 `../utils/vrBandStrategy` 금지; 동일 폴더는 `./vrBandStrategy`.

---

## 2.1 타입 (`types.ts`)

- `VrBandStrategyBase`에 `cycleWeeks: number` 필수.
- `VrSnapshot`에 `cycleIndex?: number` 선택.
- `export interface PortfolioRow extends Record<string, unknown> { ... }` — DB snake_case + `strategy`, `trades`, `vr_snapshot` 등. **판박이 Raw 타입 금지.**

---

## 2.2 상수 (`constants/vrConstants.ts`)

- `VR_CYCLE` (DEFAULT/MIN/MAX WEEKS), `DEFAULT_TIMEZONE`, `DEFAULT_FEE_RATE` (소수), `LEGACY_FEE_RATE_PCT` (루트 퍼센트 폴백), `RATE_PRECISION_MULTIPLIER`, `TIME_MS`, `EMPTY_VR_ORDERS` (`Object.freeze` + 캐스팅).

**수수료 이중 잣대:** 루트 `Portfolio.feeRate` 폴백은 **`LEGACY_FEE_RATE_PCT`**. `vrBand.feeRate` 폴백만 **`DEFAULT_FEE_RATE`**.

---

## 2.3 명명 계약

- UI state: **`vrPoolUsagePct`** (퍼센트). 저장·수학: **`poolUsageRateBuy`** (소수). 경계는 `handleSave`에서 `toDecimalRate` 한 번만.

---

## 2.4 `utils/vrBandStrategy.ts` (요약)

- `sanitizeVrCycleWeeks`, `getVrCyclePeriodText` (호출부에 `cycleFormat` 주입 — utils에서 `VR_CREATOR_LABELS` import 금지).
- `formatCurrency(value: number | null | undefined)`.
- `toFixedMoney`, `validateFinancialArgs`.
- **`calculateCycleIndexFromDates`** — Zero-Tolerance: 함수 **최상단**에 `if (cycleWeeks <= 0) return 0;` 를 필수 배치한다. 그 아래에서만 `cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK` 등 나눗셈을 수행한다. 이렇게 해야 `Infinity` / `NaN`이 스케줄러·UI로 전파되지 않는다.
- `createInitialVrSnapshot(params)` — `calculateBands` + `generateBuyOrders` / `generateSellOrders` 조립 (**export 필수**).
- `generateBuyOrders` / `generateSellOrders`: `MAX_ORDER_STEPS`, `orderCost`/`proceeds` ≤ 0이면 `break`, **`roundPrice2` 제거 후 `toFixedMoney`만**.

---

## 2.5 전략 폼·제출 (`VrBandStrategyForm` / `StrategyCreator`)

- 폼 props **평탄화** (인라인 `values`/`callbacks` 객체 금지).
- 전략 선택은 **기존 `handleStrategySelect` 유지** — PRO/PREMIUM 검증 후 `setSelectedStrategy`; VR이면 `setStartDate(getLocalTodayString())`.
- VR 달력 입력 `disabled={selectedStrategy === 'vr_band'}`.
- `getSubmitButtonText` + `canShowNextIcon` + `MAX_STEP_*` 상수로 제출 버튼 평탄화.

---

## 2.6 Dashboard 헤더 배지

- `getVrCyclePeriodText` + `sanitizeVrCycleWeeks` + `cycleFormat`에 `VR_CREATOR_LABELS[lang].cyclePeriodFormat` 주입.

---

## 2.7 `dailyExecutionSummary.ts`

- `STRINGS`에 `vrV`, `vrPool`, `vrBand`, `cyclePeriodFormat`, 모드 라벨 등 추가.
- VR 블록은 `formatCurrency`를 `vrBandStrategy`에서 import. `formatVrBandBlock`에서 `getVrCyclePeriodText`에 `STRINGS` 기반 `cycleFormat` 주입.

---

## 3. 런타임 방어 (요약)

- 모든 소비자가 **`sanitizeVrCycleWeeks`** 사용.
- 레거시 DB 행: SQL 마이그레이션(§4.1) + `normalizePortfolioData`(§9.8.2).

---

## 4.0 `StrategyCreator` — `handleSave` (Cycle 0 시딩, 단일 블록)

**전제:** 모듈 스코프에 `toDecimalRate`( `RATE_PRECISION_MULTIPLIER` 사용) 정의. `createInitialVrSnapshot`는 `vrBandStrategy`에 구현되어 있어야 함.

**단위:** 루트 `newP.feeRate`는 **UI 퍼센트 `feeRate` 그대로** (`finalFeeRate`). VR 수학용 소수는 **`vrBand.feeRate`** 만.

```ts
// import { validateFinancialArgs, createInitialVrSnapshot, toFixedMoney } from '../utils/vrBandStrategy';
// import { DEFAULT_FEE_RATE } from '../constants/vrConstants';
// import { getLocalTodayString } from '../utils/dateHelpers';

const handleSave = async () => {
  if (!selectedStrategy) return;

  if (currentPortfolioCount >= maxPortfolios) {
    alert(
      lang === 'ko'
        ? `포트폴리오 생성 한도(${maxPortfolios}개)에 도달했습니다. 더 많은 포트폴리오를 만들려면 업그레이드를 고려해 보세요.`
        : `Portfolio limit (${maxPortfolios}) reached. Please upgrade to create more.`,
    );
    return;
  }

  setVrShowErrors(false);

  let strategy: Strategy;
  let initialVrSnapshot: VrSnapshot | null = null;
  let finalFeeRate = feeRate;

  if (selectedStrategy === 'rsi_ma_interval') {
    if (ma1Stock === ma2Stock || ma2Stock === ma3Stock || ma1Stock === ma3Stock) {
      alert(
        lang === 'ko'
          ? '구간 1, 2, 3에서 서로 다른 종목을 선택해 주세요.'
          : 'Please select different stocks for sections 1, 2, and 3.',
      );
      return;
    }
    strategy = {
      ma0: { stock: ma0Stock, rsiEnabled, alignmentEnabled, maAPeriod, maBPeriod },
      ma1: {
        stock: ma1Stock,
        rsiThreshold: rsiEnabled ? ma1Rsi : undefined,
        takePartialProfit: ma1TakePartialProfit,
        partialProfitTargetPct: ma1TakePartialProfit ? ma1PartialProfitPct : undefined,
      },
      ma2: {
        stock: ma2Stock,
        splitCount: 1,
        rsiThreshold: rsiEnabled ? ma2Rsi : undefined,
        takePartialProfit: ma2TakePartialProfit,
        partialProfitTargetPct: ma2TakePartialProfit ? ma2PartialProfitPct : undefined,
      },
      ma3: {
        stock: ma3Stock,
        rsiThreshold: rsiEnabled ? ma3Rsi : undefined,
        takePartialProfit: ma3TakePartialProfit,
        partialProfitTargetPct: ma3TakePartialProfit ? ma3PartialProfitPct : undefined,
      },
    };
  } else if (selectedStrategy === 'multi_split') {
    strategy = {
      ma0: { stock: multiSplitStock, rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: multiSplitStock },
      ma2: { stock: multiSplitStock, splitCount: 1 },
      ma3: { stock: multiSplitStock },
      multiSplit: { targetStock: multiSplitStock, targetReturnRate, totalSplitCount },
    };
  } else if (selectedStrategy === 'no_stop_multi_split') {
    strategy = {
      ma0: { stock: noStopMultiSplitStock, rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: noStopMultiSplitStock },
      ma2: { stock: noStopMultiSplitStock, splitCount: 1 },
      ma3: { stock: noStopMultiSplitStock },
      noStopMultiSplit: {
        targetStock: noStopMultiSplitStock,
        lowLocBudgetRatio,
        highLocPremiumPct,
        takeProfitPct,
        totalSplitCount: noStopTotalSplitCount,
      },
    };
  } else if (selectedStrategy === 'vr_band') {
    const bandUpper = Number.isFinite(vrBandUpperPct) ? toDecimalRate(vrBandUpperPct) : 0;
    const bandLower = Number.isFinite(vrBandLowerPct) ? toDecimalRate(vrBandLowerPct) : 0;
    const poolUsageRateBuy = Number.isFinite(vrPoolUsagePct) ? toDecimalRate(vrPoolUsagePct) : 0;
    const vrDecimalFeeRate = Number.isFinite(feeRate) ? toDecimalRate(feeRate) : DEFAULT_FEE_RATE;

    const safeInitialCapital = toFixedMoney(vrInitialCapital);
    const safeInitialV = toFixedMoney(vrInitialV);
    const safeG = Number.isFinite(vrG) ? toFixedMoney(vrG) : 0;

    try {
      validateFinancialArgs(
        {
          initialCapital: safeInitialCapital,
          initialV: safeInitialV,
          minOrderQty: vrMinOrderQty,
          G: safeG,
        },
        {
          initialCapital: { strictPositive: true },
          initialV: { strictPositive: true },
          minOrderQty: { strictPositive: true },
          G: { strictPositive: true },
        },
        'StrategyCreator.handleSave.vr_band',
      );
    } catch {
      setVrShowErrors(true);
      return;
    }

    const rawDeltaCash = Number.isFinite(vrDeltaCash) ? toFixedMoney(vrDeltaCash) : 0;
    let enforcedDeltaCash = Math.abs(rawDeltaCash);
    if (vrMode === 'lump_sum') enforcedDeltaCash = 0;
    else if (vrMode === 'withdraw') enforcedDeltaCash = -Math.abs(rawDeltaCash);

    const vrParams = {
      vrMode,
      initialCapital: safeInitialCapital,
      initialV: safeInitialV,
      minOrderQty: vrMinOrderQty,
      feeRate: vrDecimalFeeRate,
      bandRateUpper: bandUpper,
      bandRateLower: bandLower,
      G: safeG,
      poolUsageRateBuy,
      cycleWeeks: vrCycleWeeks,
      deltaCash: enforcedDeltaCash,
    } as VrBandStrategyParams;

    strategy = {
      ma0: { stock: 'TQQQ', rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'TQQQ', splitCount: 1 },
      ma3: { stock: 'TQQQ' },
      vrBand: vrParams,
    } as Strategy;

    initialVrSnapshot = createInitialVrSnapshot(vrParams);
  } else {
    strategy = {
      ma0: { stock: 'QQQ', rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'QLD', splitCount: 1 },
      ma3: { stock: 'QQQ' },
    };
  }

  const newP: Omit<Portfolio, 'id'> = {
    name: name || t.customStrategy,
    dailyBuyAmount: dailyBuy,
    startDate: selectedStrategy === 'vr_band' ? getLocalTodayString() : startDate,
    feeRate: finalFeeRate,
    isClosed: false,
    trades: [],
    strategy,
    ...(initialVrSnapshot ? { vrSnapshot: initialVrSnapshot } : {}),
  };

  await onSave(newP);
};
```

---

## 4.1 DB 마이그레이션 SQL (`cycleWeeks` 기본값)

```sql
UPDATE public.portfolios
SET strategy = jsonb_set(strategy, '{vrBand,cycleWeeks}', '2', true)
WHERE jsonb_typeof(strategy->'vrBand') = 'object'
  AND (strategy->'vrBand'->>'cycleWeeks') IS NULL;
```

---

## 4.2 Edge Function — OOM 방어 + 청크 페이지네이션

**원칙:** `select('*')` 금지, **`is_closed = false`**, 필요 컬럼만 선택, **`PAGE_SIZE` 단위로 `.range` 반복**하여 한 번에 전체 테이블을 메모리에 올리지 않는다.

```ts
const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  'id, user_id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_quarter_mode, is_closed, vr_snapshot, start_date';

export async function processAllVrPortfolios(supabase: SupabaseClient) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from('portfolios')
      .select(SELECT_COLUMNS)
      .eq('is_closed', false)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = rows ?? [];
    for (const row of batch) {
      // mapPortfolioRow → VR 스냅샷 갱신 등 도메인 처리
    }

    hasMore = batch.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
}
```

- `mapPortfolioRow`: `PortfolioRow` → `Portfolio`; 루트 `feeRate` 폴백 **`LEGACY_FEE_RATE_PCT`**.
- JSON으로 `strategy->vrBand` 존재 행만 좁히는 필터는 PostgREST 버전에 맞게 선택 적용.

---

## 4.3 백엔드 Cron 스케줄 (인프라·타임존)

**목적:** VR 리밸런싱은 **미국 정규장 마감 종가**가 반영된 뒤에만 돌아가야 한다.

| 항목 | 명세 |
|------|------|
| Cron 표현식 (UTC) | `10 21 * * 1-5` — 매 UTC 요일 1~5(월~금) 21:10 |
| KST 환산 | **매주 화~토 아침 06:10** (월~금 UTC 스케줄이 한국 날짜로 넘어가며 화~토 새벽대에 대응) |
| DST | 스케줄은 **UTC 고정**으로 두고, “KST 06:10 전후 실행 = 전일 미국장 마감 이후”를 목표로 한다. 서머타임 여부와 무관하게 **마감 후 데이터**를 쓰도록 설계한다. |
| 비용 | **일·월요일 아침 KST** 등 장이 의미 없는 슬롯은 Edge 내부에서 **즉시 return** 하거나 Cron을 좁혀 **불필요한 전체 스캔을 줄인다** (정책은 팀과 합의). |

Supabase Scheduled Functions 또는 외부 Cron이 위 표현식으로 `refresh-vr-snapshots`(가칭)를 호출한다.

---

## 5.0 `VrOrderModal.tsx` — Cycle 0 마스킹 및 A11y (UX 방어)

**원칙:** 데이터 모델(`OrderLevel`의 `sharesAfter` / `poolAfter` 타입)은 바꾸지 않는다. **표시(View)만** 첫 매수 전에는 마스킹한다.

**`hasNoTrades`:** Dashboard 등 호출부에서 `hasNoTrades={!portfolio.trades || portfolio.trades.length === 0}` (또는 `vrSnapshot.shares === 0` 등 제품 정책과 일치하는 단일 규칙)로 주입. 듀얼 모달이면 **동일 값**을 넘긴다.

**I18N / A11y:** 오버레이·닫기 버튼 등 `aria-label`·스크린리더용 문자열은 **하드코딩 금지**. `VR_MODAL_LABELS`에 없는 키(예: `closeModal`, 하단 안내용 `firstBuyGuide`)는 **`constants/vrMessages.ts`에 ko/en 추가** 후 참조.

```tsx
// components/VrOrderModal.tsx — 구현 요약

// Props: hasNoTrades?: boolean (기본 false)
// VrOrderTableProps에 hasNoTrades?: boolean 추가 후 테이블로 전달

// renderCellContent(order, col, labels, hasNoTrades)
function renderCellContent(
  order: OrderLevel,
  col: { id: string; /* ... */ },
  labels: (typeof VR_MODAL_LABELS)['ko'],
  hasNoTrades: boolean,
): React.ReactNode {
  if (hasNoTrades && (col.id === 'sharesAfter' || col.id === 'poolAfter')) {
    return '-';
  }
  if (col.renderCell) return col.renderCell(order, labels);
  if (col.hideOnStepZero && order.step === STEP_CURRENT_STATE) return '-';
  return defaultCellContent(order, { id: col.id, format: col.format });
}

// 표 하단: 첫 매수 전에만 안내 (I18N)
// {hasNoTrades && <p className="...">{VR_MODAL_LABELS[lang].firstBuyGuide}</p>}
```

**데이터 계층:** `vrSnapshot`·주문 배열 JSON은 그대로 유지. 마스킹은 **렌더 경로 전용**.

---

## 5.4 주문 목록 DRY — `hooks/useVrOrders.ts`

**금지:** `buyOrders={snapshot?.buyOrders ?? EMPTY_VR_ORDERS}` 단독 (Step 0 행 소실).  
**금지:** Dashboard / VrPortfolioSummary에 동일 `useMemo` 3중 복붙.

```ts
// hooks/useVrOrders.ts
import { useMemo } from 'react';
import type { VrSnapshot, OrderLevel } from '../types';
import { EMPTY_VR_ORDERS } from '../constants/vrConstants';

export function useVrOrders(vrSnapshot: VrSnapshot | null | undefined) {
  const stepZeroRow = useMemo((): OrderLevel | null => {
    if (!vrSnapshot) return null;
    return {
      step: 0,
      price: 0,
      qty: 0,
      isBuffer: false,
      sharesAfter: vrSnapshot.shares,
      poolAfter: vrSnapshot.pool,
    };
  }, [vrSnapshot?.shares, vrSnapshot?.pool]);

  const safeBuyOrders = useMemo((): OrderLevel[] => {
    if (!vrSnapshot || !stepZeroRow) return EMPTY_VR_ORDERS;
    return [stepZeroRow, ...(vrSnapshot.buyOrders ?? [])];
  }, [stepZeroRow, vrSnapshot?.buyOrders]);

  const safeSellOrders = useMemo((): OrderLevel[] => {
    if (!vrSnapshot || !stepZeroRow) return EMPTY_VR_ORDERS;
    return [stepZeroRow, ...(vrSnapshot.sellOrders ?? [])];
  }, [stepZeroRow, vrSnapshot?.sellOrders]);

  return { safeBuyOrders, safeSellOrders, stepZeroRow };
}
```

**Dashboard:** `const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);` — 듀얼 모달 동일 props.  
**VrPortfolioSummary:** `useVrOrders(vrSnapshot)` — **모든 훅 호출 후** 얼리 리턴.

---

## 9.8.2 `utils/portfolioNormalize.ts` — 단일 블록

`as Portfolio` 객체 단언 금지 → **`const portfolio: Portfolio = { ... }`** 후 `acc.push(portfolio)`.

```ts
import type { Portfolio, PortfolioRow, Strategy, VrBandStrategyParams } from '../types';
import { DEFAULT_FEE_RATE, LEGACY_FEE_RATE_PCT } from '../constants/vrConstants';
import { sanitizeVrCycleWeeks } from './vrBandStrategy';

export function normalizePortfolioData(data: unknown[]): Portfolio[] {
  if (!Array.isArray(data)) return [];

  return data.reduce<Portfolio[]>((acc, rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') {
      console.warn('[VR_Normalize_Warning] Invalid portfolio row skipped', rawItem);
      return acc;
    }

    const item = rawItem as PortfolioRow;
    const rawFeeRate = item.fee_rate ?? item.feeRate ?? LEGACY_FEE_RATE_PCT;

    let normalizedStrategy = item.strategy as Strategy | undefined;

    if (normalizedStrategy?.vrBand) {
      const vrRecord = (
        typeof normalizedStrategy.vrBand === 'object' && normalizedStrategy.vrBand !== null
          ? normalizedStrategy.vrBand
          : {}
      ) as Record<string, unknown>;

      const cycleWeeks = sanitizeVrCycleWeeks(vrRecord.cycleWeeks);

      normalizedStrategy = {
        ...normalizedStrategy,
        vrBand: {
          ...vrRecord,
          initialV: Number(vrRecord.initialV ?? 0),
          initialCapital: Number(vrRecord.initialCapital ?? 0),
          bandRateUpper: Number(vrRecord.bandRateUpper ?? 0),
          bandRateLower: Number(vrRecord.bandRateLower ?? 0),
          G: Number(vrRecord.G ?? 0),
          minOrderQty: Number(vrRecord.minOrderQty ?? 0),
          poolUsageRateBuy: Number(vrRecord.poolUsageRateBuy ?? 0),
          deltaCash: Number(vrRecord.deltaCash ?? 0),
          feeRate: Number(vrRecord.feeRate ?? DEFAULT_FEE_RATE),
          cycleWeeks,
        } as VrBandStrategyParams,
      };
    }

    if (normalizedStrategy === undefined) {
      console.warn('[VR_Normalize_Warning] Row skipped: missing strategy', item.id);
      return acc;
    }

    const portfolio: Portfolio = {
      id: item.id ?? '',
      name: item.name ?? '',
      dailyBuyAmount: item.daily_buy_amount ?? 0,
      startDate: item.start_date ?? item.startDate ?? '',
      feeRate: Number(rawFeeRate),
      strategy: normalizedStrategy,
      isClosed: item.is_closed ?? item.isClosed ?? false,
      trades: Array.isArray(item.trades) ? item.trades : [],
      closedAt: item.closed_at ?? item.closedAt ?? undefined,
      finalSellAmount: item.final_sell_amount ?? item.finalSellAmount ?? undefined,
      alarmconfig: item.alarm_config ?? item.alarmconfig ?? undefined,
      isQuarterMode: item.is_quarter_mode ?? item.isQuarterMode ?? false,
      vrSnapshot: item.vr_snapshot ?? item.vrSnapshot ?? undefined,
    };

    acc.push(portfolio);
    return acc;
  }, []);
}
```

---

## 9.8.4 `VrPortfolioSummary.tsx` (요지)

- `useVrOrders(vrSnapshot)`로 `safeBuyOrders` / `safeSellOrders` 확보.
- 통화 표시: `formatCurrency(vrSnapshot.currentV)` 등 — **`toDisplayNumber`와 이중 포맷 금지**.
- `!vrSnapshot` 얼리 리턴은 **훅 아래**.
- `calculateMaxBuyStep` 등은 얼리 리턴 이후 `vrSnapshot` 확정 상태에서만 호출.

---

## 9.8.12 `generateBuyOrders` / `generateSellOrders` — Dust + OOM

- `MAX_ORDER_STEPS` 상한, `orderCost <= 0` / `proceeds <= 0` 시 `break` 유지.
- 매수 루프 예시:

```ts
const orderCost = toFixedMoney(price * qty * (1 + feeRate));
if (orderCost <= 0) break;

const nextCumulativeCost = toFixedMoney(cumulativeCost + orderCost);
const isWithinBudget = nextCumulativeCost <= maxBuyBudget;
// ...
cumulativeCost = nextCumulativeCost;
const poolAfter = toFixedMoney(pool - cumulativeCost);
```

- 매도: `proceeds = toFixedMoney(price * qty * (1 - feeRate))`, `cumulativeProceeds = toFixedMoney(cumulativeProceeds + proceeds)`, `poolAfter = toFixedMoney(pool + cumulativeProceeds)`.
- 루프 안에서 **`params.G`에 재적용 `toFixedMoney` 금지** (저장·정규화 단계 SSOT).

---

## 9.8 기타 방어 (한 줄씩)

- `computeVrSnapshotAfterTrade`: `newShares <= 0`이면 `avgPrice = 0`; 매수 분기만 `toFixedMoney`로 평단 갱신.
- `toDecimalMoney` 심볼 금지 — **`toFixedMoney`만**.
- VR 관련 UI 문자열은 `vrMessages` / `STRINGS` SSOT.

---

## 10. 체크리스트

- [ ] `types.ts`: `cycleWeeks`, `cycleIndex?`, `PortfolioRow`
- [ ] `vrConstants.ts`: `VR_CYCLE`, `DEFAULT_FEE_RATE`, `LEGACY_FEE_RATE_PCT`, `RATE_PRECISION_MULTIPLIER`, `EMPTY_VR_ORDERS`, `TIME_MS`
- [ ] `vrBandStrategy.ts`: `sanitizeVrCycleWeeks`, `getVrCyclePeriodText`, `formatCurrency`, `createInitialVrSnapshot`, `calculateCycleIndexFromDates` 가드, 주문 루프 Dust·OOM, `roundPrice2` 제거
- [ ] `hooks/useVrOrders.ts` 신설 및 `Dashboard` / `VrPortfolioSummary` 적용
- [ ] `StrategyCreator`: §4.0 `handleSave`, 폼 평탄화, `getSubmitButtonText`, PRO 분기 보존
- [ ] `portfolioNormalize.ts`: §9.8.2 블록, `any` 제거
- [ ] `dailyExecutionSummary.ts`: STRINGS 키 + `formatCurrency` import
- [ ] Edge: §4.2 컬럼 선택 + `is_closed` + **`PAGE_SIZE` 페이지네이션**
- [ ] 인프라: §4.3 Cron `10 21 * * 1-5` (UTC) 배포 및 Edge 내부 no-op 정책 합의
- [ ] DB: §4.1 SQL
- [ ] `VrOrderModal.tsx` / `VrOrderTable`: §5.0 `hasNoTrades`, 셀 마스킹, `VR_MODAL_LABELS` 키 보강 (`closeModal`, `firstBuyGuide` 등)
- [ ] `vrBandStrategy.ts`: §2.4 `calculateCycleIndexFromDates` 최상단 `cycleWeeks <= 0` 가드
- [ ] 붙여넣기 전 실제 파일과 diff 대조 (`VrBandStrategyParams` 필드·import 깊이)

---

*본 V2 명세는 구현 우선 순위를 고정한다. 세부 논쟁·대안 스니펫은 `VR_CYCLE_REFACTORING_PLAN.md`를 참고한다.*
