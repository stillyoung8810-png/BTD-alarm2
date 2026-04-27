---
name: TVC 프로덕션 출시 전 성능 리팩토링 스니펫
overview: TVC 출시 전 성능 감사 계획에서 도출된 P0/P1 항목을 수학 결과 변경 없이 적용하기 위한 코드 스니펫 모음입니다.
stage: pre-launch-audit
status: draft
---

# TVC 프로덕션 출시 전 성능 리팩토링 스니펫

## 적용 원칙

- 스니펫은 즉시 적용 후보입니다. 실제 반영 시에는 기존 파일의 import, 테스트, 타입 경계를 다시 확인해야 합니다.
- TVC 수학 결과값(`currentV`, `pool`, `bandLow`, `bandHigh`, 주문표 가격·수량)은 변경하지 않습니다.
- 서버 부하 최적화는 “같은 일을 더 천천히, 안전하게” 하도록 동시성만 제한합니다.
- 신규 의존성은 추가하지 않습니다.

## 1. `processVrRefreshBatch` update 동시성 제한

대상 파일: `supabase/functions/_shared/vrSnapshotRefresh.ts`

현재는 페이지 내 모든 행을 한 번에 `Promise.allSettled`로 실행합니다. 아래처럼 chunk 단위로 제한하면 DB 쓰기 폭주를 줄이면서 각 포트폴리오의 계산 결과는 그대로 유지할 수 있습니다.

```ts
const VR_REFRESH_UPDATE_CHUNK_SIZE = 25;

async function processVrRefreshRowsChunk(
  rows: readonly PortfolioRow[],
  deps: ProcessVrRefreshBatchDeps,
  now: Date,
): Promise<void> {
  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        const portfolio = mapPortfolioRowForRefresh(row);
        if (!portfolio?.strategy.vrBand) return;

        const targetCycleIndex = calculateNextCycleIndexForPortfolio(portfolio, now);
        if (targetCycleIndex === null) return;

        await deps.refreshPortfolio(
          portfolio,
          String(row.id ?? ''),
          targetCycleIndex,
        );
      } catch (error) {
        console.error(`[VR_Batch_Error] Failed portfolio ${row.id}:`, error);
      }
    }),
  );
}

export async function processVrRefreshBatch(
  rows: PortfolioRow[],
  deps: ProcessVrRefreshBatchDeps,
): Promise<void> {
  const now = deps.now ?? new Date();

  for (let start = 0; start < rows.length; start += VR_REFRESH_UPDATE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + VR_REFRESH_UPDATE_CHUNK_SIZE);
    await processVrRefreshRowsChunk(chunk, deps, now);
  }
}
```

검증 포인트:

- `utils/vrSnapshotRefresh.test.ts`의 배치 테스트가 동일하게 통과해야 합니다.
- staging에서 페이지당 포트폴리오 수가 많을 때 Edge 실행 시간이 허용 범위 안인지 확인해야 합니다.
- chunk 크기는 Supabase connection/time limit을 보고 `10`, `25`, `50` 중 하나로 고정합니다.

## 2. TVC 후보만 조회하는 Edge 입력 최적화

대상 파일: `supabase/functions/refresh-vr-snapshots/index.ts`

열린 포트폴리오 전체를 가져온 뒤 JS에서 `vrBand` 여부를 확인하는 구조는 비-TVC 포트폴리오가 많을수록 비용이 커집니다. Supabase JSON path 필터가 staging에서 확인되면 아래 방향으로 줄일 수 있습니다.

```ts
const { data: rows, error } = await supabase
  .from('portfolios')
  .select(SELECT_COLUMNS)
  .eq('is_closed', false)
  .not('strategy->vrBand', 'is', null)
  .range(offset, offset + PAGE_SIZE - 1);
```

대안으로 view/RPC를 둘 수도 있습니다.

```sql
create or replace view active_vr_portfolios as
select
  id,
  user_id,
  name,
  daily_buy_amount,
  fee_rate,
  strategy,
  trades,
  alarm_config,
  is_closed,
  vr_snapshot,
  start_date
from portfolios
where is_closed = false
  and strategy ? 'vrBand';
```

주의:

- PostgREST JSON path 문법은 프로젝트 Supabase 버전에서 반드시 staging 쿼리로 확인합니다.
- 기존 레거시 키(`vr_band`, `vrBandStrategy`)까지 운영 데이터에 남아 있다면 view 조건에 포함해야 합니다.

## 3. `useVrOrders` 참조 안정화

대상 파일: `hooks/useVrOrders.ts`

현재 함수는 스냅샷이 있을 때마다 Step 0 객체와 새 배열을 생성합니다. `VrOrderModal` props 안정성을 위해 `useMemo`를 사용합니다.

```ts
import { useMemo } from 'react';
import type { OrderLevel, VrSnapshot } from '../types';
import { EMPTY_VR_ORDERS } from '../constants/vrConstants';

const EMPTY_VR_ORDER_RESULT = {
  safeBuyOrders: EMPTY_VR_ORDERS,
  safeSellOrders: EMPTY_VR_ORDERS,
} as const;

export function useVrOrders(vrSnapshot: VrSnapshot | null | undefined): {
  safeBuyOrders: OrderLevel[];
  safeSellOrders: OrderLevel[];
} {
  return useMemo(() => {
    if (vrSnapshot == null) {
      return EMPTY_VR_ORDER_RESULT;
    }

    const step0: OrderLevel = {
      step: 0,
      price: 0,
      qty: 0,
      isBuffer: false,
      sharesAfter: vrSnapshot.shares,
      poolAfter: vrSnapshot.pool,
    };

    return {
      safeBuyOrders: [step0, ...(vrSnapshot.buyOrders ?? [])],
      safeSellOrders: [step0, ...(vrSnapshot.sellOrders ?? [])],
    };
  }, [vrSnapshot]);
}
```

검증 포인트:

- `components/Dashboard.test.tsx`에서 주문 모달이 기존과 같은 행을 렌더링해야 합니다.
- `EMPTY_VR_ORDER_RESULT`를 외부에서 mutate하지 않아야 합니다. 현재 반환 배열은 읽기 전용으로만 쓰는 전제입니다.

## 4. `VrOrderModal` row key에서 index 제거

대상 파일: `components/VrOrderModal.tsx`

현재 key는 `idx`를 포함합니다. 주문표는 step이 고유하므로 step 기반 key로 충분합니다.

```ts
function getOrderRowKey(tabId: TabId, order: OrderLevel): string {
  const bufferSuffix = order.isBuffer ? 'buffer' : 'main';
  return `${tabId}-${order.step}-${bufferSuffix}`;
}
```

적용 위치 예시:

```tsx
function VrOrderTable({
  tabId,
  orders,
  labels,
}: {
  tabId: TabId;
  orders: OrderLevel[];
  labels: LabelsLang;
}) {
  return (
    <tbody>
      {orders.map((order) => (
        <tr key={getOrderRowKey(tabId, order)}>
          {/* existing cells */}
        </tr>
      ))}
    </tbody>
  );
}
```

`VrOrderModal` 호출부:

```tsx
<VrOrderTable tabId={activeTab} orders={orders} labels={t} />
```

검증 포인트:

- `sell` 탭과 `buy` 탭의 Step 0 key가 서로 충돌하지 않아야 합니다.
- 주문표가 재생성되어도 동일 step은 동일 DOM row로 유지되어야 합니다.

## 5. 클라이언트/Edge TVC 수학 parity 테스트

대상 파일 후보: `utils/vrBandStrategy.parity.test.ts`

클라이언트와 Edge에 `vrBandStrategy`가 복제되어 있으므로, 출시 전에는 같은 fixture로 핵심 결과가 동일한지 고정합니다.

```ts
import { describe, expect, it } from 'vitest';
import {
  calculateBands as calculateClientBands,
  calculateNextV as calculateClientNextV,
  generateBuyOrders as generateClientBuyOrders,
  generateSellOrders as generateClientSellOrders,
} from './vrBandStrategy';
import {
  calculateBands as calculateEdgeBands,
  calculateNextV as calculateEdgeNextV,
  generateBuyOrders as generateEdgeBuyOrders,
  generateSellOrders as generateEdgeSellOrders,
} from '../supabase/functions/_shared/vrBandStrategy.ts';
import type { VrBandStrategyParams } from '../types';

const baseParams: VrBandStrategyParams = {
  vrMode: 'accumulate',
  initialV: 1000,
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
  deltaCash: 50,
};

describe('TVC client/edge parity', () => {
  it('calculates the same next V and bands', () => {
    const clientNextV = calculateClientNextV(1000, 400, baseParams);
    const edgeNextV = calculateEdgeNextV(1000, 400, baseParams);

    expect(edgeNextV).toBe(clientNextV);
    expect(calculateEdgeBands(edgeNextV, 0.1, 0.1)).toEqual(
      calculateClientBands(clientNextV, 0.1, 0.1),
    );
  });

  it('generates the same order tables', () => {
    const orderInput = {
      shares: 10,
      pool: 450,
      bandLow: 950,
      minOrderQty: 1,
      feeRate: 0.0025,
      poolUsageRateBuy: 0.5,
    };

    expect(generateEdgeBuyOrders(orderInput)).toEqual(
      generateClientBuyOrders(orderInput),
    );

    expect(
      generateEdgeSellOrders({
        shares: orderInput.shares,
        pool: orderInput.pool,
        bandHigh: 1150,
        minOrderQty: orderInput.minOrderQty,
        feeRate: orderInput.feeRate,
      }),
    ).toEqual(
      generateClientSellOrders({
        shares: orderInput.shares,
        pool: orderInput.pool,
        bandHigh: 1150,
        minOrderQty: orderInput.minOrderQty,
        feeRate: orderInput.feeRate,
      }),
    );
  });
});
```

주의:

- Vitest 설정이 `.ts` 확장자 import를 허용하지 않으면 `tsconfig`/test 설정을 건드리지 말고, 별도 `supabase` mirror 테스트 파일 또는 script 방식으로 분리합니다.
- parity 테스트는 중복 제거의 대체물이 아니라 drift 감지 장치입니다.

## 6. `withdraw` UI 숨김과 엔진 보존 테스트

대상 파일 후보: `constants/vrMessages.test.ts`

`VISIBLE_TVC_VR_MODE_KEYS`는 UI 표시 목록이고, `VR_MODE_KEYS`는 전체 도메인 목록입니다. 이 차이를 테스트로 고정합니다.

```ts
import { describe, expect, it } from 'vitest';
import {
  VISIBLE_TVC_VR_MODE_KEYS,
  VR_MODE_KEYS,
} from './vrMessages';

describe('TVC mode visibility policy', () => {
  it('keeps withdraw in the domain list but hides it from the creator UI', () => {
    expect(VR_MODE_KEYS).toContain('withdraw');
    expect(VISIBLE_TVC_VR_MODE_KEYS).toEqual(['lump_sum', 'accumulate']);
  });
});
```

검증 포인트:

- `types.ts`의 `VrBandWithdraw`와 `getVrDeltaCashForNextV`는 유지되어야 합니다.
- `utils/vrBandStrategy.test.ts`의 `withdraw` 부호 테스트를 제거하지 않습니다.

## 7. 운영 로그 debug flag 정리

대상 파일 후보: `services/stockService.ts`, Edge Functions

정상 흐름 로그는 debug flag로 내리고, 오류 로그는 유지합니다.

```ts
const DEBUG_TVC_RUNTIME_LOG =
  typeof Deno !== 'undefined'
    ? Deno.env.get('DEBUG_TVC_RUNTIME_LOG') === 'true'
    : false;

function logTvcDebug(message: string, payload?: unknown): void {
  if (!DEBUG_TVC_RUNTIME_LOG) return;

  if (payload == null) {
    console.log(message);
    return;
  }

  console.log(message, payload);
}
```

브라우저 서비스에서는 기존 `DEBUG_STOCK_LOG` 패턴을 재사용합니다.

```ts
if (DEBUG_STOCK_LOG) {
  console.log(
    `[fetchStockPriceHistory] ${trimmedSymbol}: IndexedDB 데이터 없음, Supabase에서 가져오기`,
  );
}
```

주의:

- `console.error`는 장애 추적용이므로 무조건 제거하지 않습니다.
- 사용자 식별자, 토큰, 원본 payload 전체를 로그에 남기지 않습니다.

## 8. `sent_alarms` 중복 조회 1회화

대상 파일: `supabase/functions/check-and-trigger-alarms/index.ts`

현재 구조가 그룹마다 `sent_alarms`를 조회한다면, 후보 키를 먼저 모아 한 번에 조회하는 방식으로 바꿀 수 있습니다.

```ts
type AlarmCandidateKey = {
  userId: string;
  localDate: string;
  scheduledTime: string;
  timezone: string;
};

function toSentAlarmKey(candidate: AlarmCandidateKey): string {
  return [
    candidate.userId,
    candidate.localDate,
    candidate.scheduledTime,
    candidate.timezone,
  ].join('|');
}

const uniqueLocalDates = Array.from(
  new Set(candidateList.map((candidate) => candidate.local_date)),
);
const uniqueTimes = Array.from(
  new Set(candidateList.map((candidate) => candidate.scheduled_time)),
);
const uniqueTimezones = Array.from(
  new Set(candidateList.map((candidate) => candidate.timezone)),
);

const { data: sentRows, error: sentError } = await supabase
  .from('sent_alarms')
  .select('user_id, local_date, scheduled_time, timezone')
  .in('local_date', uniqueLocalDates)
  .in('scheduled_time', uniqueTimes)
  .in('timezone', uniqueTimezones);

if (sentError) {
  throw sentError;
}

const alreadySentKeys = new Set(
  (sentRows ?? []).map((row) =>
    toSentAlarmKey({
      userId: String(row.user_id ?? ''),
      localDate: String(row.local_date ?? ''),
      scheduledTime: String(row.scheduled_time ?? ''),
      timezone: String(row.timezone ?? ''),
    }),
  ),
);

const toSend = candidateList.filter(
  (candidate) =>
    !alreadySentKeys.has(
      toSentAlarmKey({
        userId: candidate.user_id,
        localDate: candidate.local_date,
        scheduledTime: candidate.scheduled_time,
        timezone: candidate.timezone,
      }),
    ),
);
```

주의:

- `.in()` 조합은 후보군의 superset을 가져오므로, 최종 중복 판정은 반드시 `Set`의 full key로 해야 합니다.
- 후보 수가 매우 커지면 `unique*` 배열 크기에 상한을 두거나 RPC로 옮깁니다.

## 9. 심볼별 최신/직전가 RPC 선택지

대상 파일 후보: `services/stockService.ts`

`fetchStockPricesWithPrev`는 `.in(symbols)`로 한 번에 조회하지만 심볼당 최신 2건으로 DB에서 제한하지는 않습니다. 데이터가 커지면 RPC로 window function을 두는 편이 가장 확실합니다.

```sql
create or replace function get_latest_stock_prices_with_prev(p_symbols text[])
returns table (
  symbol text,
  close numeric,
  trade_date date,
  row_number int
)
language sql
stable
as $$
  select ranked.symbol, ranked.close, ranked.trade_date, ranked.row_number
  from (
    select
      stock_prices.symbol,
      stock_prices.close,
      stock_prices.trade_date,
      row_number() over (
        partition by stock_prices.symbol
        order by stock_prices.trade_date desc
      )::int as row_number
    from stock_prices
    where stock_prices.symbol = any(p_symbols)
  ) ranked
  where ranked.row_number <= 2;
$$;
```

TypeScript 호출 예시:

```ts
const { data, error } = await supabase.rpc(
  'get_latest_stock_prices_with_prev',
  { p_symbols: validSymbols },
);
```

주의:

- 이 스니펫은 DB migration이 필요하므로 P1/P2 항목입니다.
- 기존 `.in()` 호출을 바로 `.limit(validSymbols.length * 2)`로 바꾸면 심볼별 2건 보장이 깨질 수 있습니다.

