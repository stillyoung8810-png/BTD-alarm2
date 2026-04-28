# refresh-vr-snapshots 타입 오류 수정 계획 v1

## 목표

`supabase/functions/refresh-vr-snapshots/index.ts`의 `deno check` 실패를 해결하되, VR 계산 로직과 DB 갱신 로직은 변경하지 않습니다.

수정 범위는 타입 경계 정렬로 제한합니다.

- 출시 직전 안정성이 최우선입니다. 타입 오류 제거에 직접 필요하지 않은 런타임 변경은 이번 기본안에서 제외합니다.
- `buildRefreshedVrSnapshot()`, `calculateNextCycleIndexForPortfolio()`는 수정하지 않습니다.
- `generateBuyOrders()`, `generateSellOrders()` 및 주문표 생성 로직은 수정하지 않습니다.
- 기본 타입 오류 수정에서는 `portfolios` 조회 조건, `SELECT_COLUMNS`, `.eq('is_closed', false)`, `.not('strategy->vrBand', 'is', null)`, `.range(...)`를 유지합니다.
- 결정적 페이징 개선(`.order('id', { ascending: true })`)은 타당하지만, 이번 출시 직전 타입 오류 해결 기본안에서는 제외하고 출시 후 하드닝 후보로 분리합니다.
- 업데이트 payload `{ vr_snapshot: updatedSnapshot }`도 유지합니다.

## 시스템 검토

### 1. `buildRefreshedVrSnapshot()` 인자 타입 불일치

현재 `refreshVrSnapshotForPortfolio()`는 `portfolio` 인자를 아래처럼 조각 객체로 선언합니다.

```ts
portfolio: { strategy: { vrBand?: unknown }; vrSnapshot?: VrSnapshot },
```

하지만 실제 런타임 흐름은 다릅니다.

1. `processAllVrPortfolios()`가 DB row를 가져옵니다.
2. `processVrRefreshBatch()`가 `mapPortfolioRowForRefresh(row)`를 호출합니다.
3. `mapPortfolioRowForRefresh()`는 `Portfolio | null`을 반환합니다.
4. `refreshPortfolio` 콜백에는 이미 `Portfolio`로 매핑된 객체가 전달됩니다.
5. `buildRefreshedVrSnapshot(portfolio, targetCycleIndex)`는 `Portfolio` 전체 타입을 요구합니다.

따라서 오류의 원인은 실제 데이터 흐름이 아니라 `refreshVrSnapshotForPortfolio()`의 인자 타입이 실제보다 좁게 선언된 데 있습니다.

수정 방향은 단순합니다.

- `Portfolio` 타입을 import합니다.
- `refreshVrSnapshotForPortfolio()`의 `portfolio` 인자를 `Portfolio`로 변경합니다.
- `buildRefreshedVrSnapshot()` 내부 로직은 건드리지 않습니다.

### 2. `createClient()` 반환 타입과 `EdgeSupabase` 포트 타입 충돌

현재 코드는 Supabase JS의 실제 클라이언트를 직접 `EdgeSupabase`에 할당합니다.

```ts
const supabase: EdgeSupabase = createClient(supabaseUrl, serviceKey);
```

여기서 두 문제가 발생합니다.

- Supabase JS의 query builder는 `Promise` 자체가 아니라 `await` 가능한 builder 타입입니다.
- Supabase JS v2의 제네릭 타입 추론이 깊어져 Deno check에서 `Type instantiation is excessively deep and possibly infinite`가 발생합니다.

실제 런타임 호출은 이미 스모크 테스트에서 `HTTP 200`으로 확인되었습니다. 따라서 해결해야 할 것은 런타임 동작이 아니라 외부 라이브러리 타입과 Edge Function 내부 포트 타입 사이의 정적 경계입니다.

수정 방향은 다음과 같습니다.

- Edge Function이 실제로 사용하는 메서드만 표현하는 작은 포트 타입을 유지합니다.
- 출시 직전 기본안에서는 현재 사용하는 테이블명과 컬럼명 리터럴을 타입으로 보존해 오타를 컴파일 타임에 차단합니다.
- PostgREST 에러 객체는 `unknown`으로 뭉개지 않고 `message`, `code`, `details`, `hint`를 보존합니다.
- Supabase query builder 특성에 맞춰 결과 타입은 `PromiseLike`로 둡니다.
- `createClient`의 복잡한 제네릭 호출 타입은 외부 경계에서만 `unknown`을 통해 포트 타입으로 좁힙니다.
- 내부 도메인 타입에는 `any`를 쓰지 않습니다.

### 3. 숨겨진 의존성 검토 결과

`supabase/functions/refresh-vr-snapshots/index.ts` 전체를 확인한 결과, 현재 엔트리포인트에서 사용하는 Supabase 연산은 아래 두 경로뿐입니다.

- `from('portfolios').select(...).eq(...).not(...).range(...)`
- `from('portfolios').update({ vr_snapshot: updatedSnapshot }).eq('id', portfolioId)`

현재 파일 안에는 RPC 호출, `orders` 등 다른 테이블 조작, delete/upsert/insert 호출이 없습니다. 따라서 계획서의 포트 타입은 현 엔트리포인트 기준으로 충분합니다.

출시 직전 기본안에서는 숨겨진 확장성보다 현재 동작의 오타 방지가 더 중요합니다. 따라서 포트 타입은 `portfolios`, `is_closed`, `strategy->vrBand`, `id`에 맞춰 좁게 둡니다. 향후 다른 테이블이나 컬럼이 실제로 추가될 때 그 변경 범위에서 포트 타입을 함께 확장합니다.

또한 현재 파일에는 `.single()`, `.maybeSingle()`, RPC 호출이 없습니다. 그런 호출을 추가하는 별도 작업이 생기면 포트 타입도 그 작업 범위에서 명시적으로 확장해야 합니다.

### 4. 업데이트 payload 타입 안전성 검토

`update(payload: Record<string, unknown>)`는 이 함수의 실제 쓰기 경계인 `{ vr_snapshot: VrSnapshot }`를 충분히 보호하지 못합니다. 예를 들어 `vrSnapshot`처럼 camelCase 오타가 들어가도 포트 타입이 막아주지 못합니다.

리뷰 제안의 `update(payload: Partial<Row>)` 방향은 일반적으로 더 좋아 보이지만, 이 프로젝트의 `PortfolioRow`는 `extends Record<string, unknown>` 구조입니다. 따라서 `Partial<PortfolioRow>`도 임의 문자열 키를 완전히 막지 못할 수 있습니다.

이번 계획서는 더 좁고 확실한 방식을 사용합니다.

- 조회 row 타입과 update payload 타입을 분리합니다.
- `refresh-vr-snapshots`에서 허용하는 update payload를 `EdgePortfolioSnapshotUpdate`로 명시합니다.
- update 호출부는 `.from<PortfolioRow, EdgePortfolioSnapshotUpdate>('portfolios')`처럼 쓰기 payload 타입을 명시합니다.

### 5. 결정적 페이징 검토

`.range(offset, offset + PAGE_SIZE - 1)`를 쓰는 배치 조회는 명시적 정렬이 있을 때 가장 안전합니다. PostgreSQL은 `order by` 없는 결과 순서를 보장하지 않으므로, 대량 데이터와 동시 업데이트가 겹치면 페이지 경계가 흔들릴 수 있습니다.

다만 `.order('id', { ascending: true })` 추가는 타입 오류 수정이 아니라 실제 DB 조회 순서를 고정하는 런타임 동작 변경입니다. 현재 서비스가 정상 동작 중이고 출시 직전이라는 조건에서는, 타입 오류 해결 기본안에 포함하지 않습니다.

- 출시 직전 타입 오류 해결: 기존 쿼리 체인을 유지합니다.
- 출시 후 하드닝: 운영 로그와 데이터량을 확인한 뒤 `.range(...)` 앞에 `.order('id', { ascending: true })`를 별도 PR/작업으로 추가합니다.

`id`는 포트폴리오 row의 안정적인 식별자이며, 현재 배치 로직에서 별도 비즈니스 정렬 의미를 갖지 않으므로 결정적 pagination 기준으로 적합합니다.

## 수정 계획

1. `supabase/functions/refresh-vr-snapshots/index.ts`에서 타입 import를 확장합니다.

```ts
import type { Portfolio, PortfolioRow, VrSnapshot } from '../_shared/types.ts';
```

2. Supabase 포트 타입을 query builder의 `PromiseLike` 성격에 맞추고, PostgREST 에러 구조를 보존합니다.

```ts
interface EdgePostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface EdgeSelectResult<Row> {
  data: Row[] | null;
  error: EdgePostgrestError | null;
}

interface EdgeMutationResult {
  error: EdgePostgrestError | null;
}

type EdgeAsyncResult<Result> = PromiseLike<Result>;

type EdgePortfolioTable = 'portfolios';
type EdgePortfolioEqColumn = 'is_closed';
type EdgePortfolioNotColumn = 'strategy->vrBand';
type EdgePortfolioUpdateColumn = 'id';
type EdgePostgrestIsOperator = 'is';

interface EdgeQueryFilter<Row> {
  eq(
    column: EdgePortfolioEqColumn,
    value: boolean,
  ): EdgeQueryFilter<Row>;
  not(
    column: EdgePortfolioNotColumn,
    operator: EdgePostgrestIsOperator,
    value: null,
  ): EdgeQueryFilter<Row>;
  range(
    from: number,
    to: number,
  ): EdgeAsyncResult<EdgeSelectResult<Row>>;
}

interface EdgeUpdateFilter {
  eq(
    column: EdgePortfolioUpdateColumn,
    value: string,
  ): EdgeAsyncResult<EdgeMutationResult>;
}

interface EdgePortfolioSnapshotUpdate {
  vr_snapshot: VrSnapshot;
}

interface EdgeTableGateway<Row, UpdatePayload> {
  select(columns: string): EdgeQueryFilter<Row>;
  update(payload: UpdatePayload): EdgeUpdateFilter;
}

interface EdgeSupabase {
  from<Row = unknown, UpdatePayload = never>(
    table: EdgePortfolioTable,
  ): EdgeTableGateway<Row, UpdatePayload>;
}
```

이 포트 타입은 특정 SQL builder 전체를 재현하지 않고, 이 Edge Function이 현재 사용하는 최소 메서드만 표현합니다. 테이블명과 컬럼명은 리터럴 타입으로 좁혀, 출시 직전 수정 과정에서 `is_clsoed`, `vrSnapshot`, 다른 테이블명 같은 오타가 컴파일 단계에서 걸리도록 합니다. 또한 `eq`와 `not`의 허용 컬럼을 분리해 `eq('strategy->vrBand', false)` 같은 잘못된 필터 조합도 막습니다.

`UpdatePayload = never` 기본값은 실수로 update payload 타입을 생략한 채 쓰기 호출을 추가하지 못하게 하는 안전장치입니다. 조회만 하는 경로는 `from<PortfolioRow>('portfolios')`로 충분하고, 쓰기 경로만 `from<PortfolioRow, EdgePortfolioSnapshotUpdate>('portfolios')`처럼 명시합니다.

3. `createClient`는 별도 어댑터 함수에서만 포트 타입으로 좁힙니다.

```ts
type EdgeSupabaseFactory = (
  supabaseUrl: string,
  serviceKey: string,
) => EdgeSupabase;

function createEdgeSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
): EdgeSupabase {
  const createEdgeClient = createClient as unknown as EdgeSupabaseFactory;
  return createEdgeClient(supabaseUrl, serviceKey);
}
```

이 방식은 `any`를 쓰지 않고, Supabase JS의 복잡한 제네릭 타입을 Edge Function 내부로 전파하지 않습니다. 타입 단언은 외부 라이브러리 경계 한 곳에만 격리됩니다.

4. `refreshVrSnapshotForPortfolio()`의 인자 타입을 실제 런타임 흐름과 맞춥니다.

```ts
async function refreshVrSnapshotForPortfolio(
  supabase: EdgeSupabase,
  portfolio: Portfolio,
  portfolioId: string,
  targetCycleIndex: number,
): Promise<void> {
  const updatedSnapshot = buildRefreshedVrSnapshot(portfolio, targetCycleIndex);
  if (!updatedSnapshot) return;

  const { error } = await supabase
    .from<PortfolioRow, EdgePortfolioSnapshotUpdate>('portfolios')
    .update({ vr_snapshot: updatedSnapshot })
    .eq('id', portfolioId);

  if (error) {
    console.error(`[VR_Refresh_Error] portfolio ${portfolioId}:`, error);
    throw error;
  }
}
```

5. `serve()` 내부에서 직접 `createClient()`를 호출하지 않고 어댑터를 사용합니다.

```ts
const supabase = createEdgeSupabaseClient(supabaseUrl, serviceKey);
await processAllVrPortfolios(supabase);
```

## 변경하지 않을 코드

다음 런타임 동작은 이번 타입 오류 수정 범위에서 제외합니다. `from<PortfolioRow>(...)`처럼 타입 인자만 추가할 수 있지만, 조회 조건과 업데이트 payload는 유지합니다.

```ts
const updatedSnapshot = buildRefreshedVrSnapshot(portfolio, targetCycleIndex);
```

```ts
const { data: rows, error } = await supabase
  .from<PortfolioRow>('portfolios')
  .select(SELECT_COLUMNS)
  .eq('is_closed', false)
  .not('strategy->vrBand', 'is', null)
  .range(offset, offset + PAGE_SIZE - 1);
```

결정적 페이징 개선은 출시 후 하드닝 후보입니다. 적용 시 조회 체인은 아래처럼 바꿉니다.

```ts
const { data: rows, error } = await supabase
  .from<PortfolioRow>('portfolios')
  .select(SELECT_COLUMNS)
  .eq('is_closed', false)
  .not('strategy->vrBand', 'is', null)
  .order('id', { ascending: true })
  .range(offset, offset + PAGE_SIZE - 1);
```

이 변경은 필터 조건이나 선택 컬럼을 바꾸지 않고, 페이지 경계를 안정화하기 위한 정렬만 추가합니다.

출시 직전 기본안에서는 위 `.order(...)` 변경을 적용하지 않습니다.

```ts
.update({ vr_snapshot: updatedSnapshot })
```

## 오버코딩 검토

이번 수정안은 의도적으로 작은 변경만 포함합니다.

- 새 추상화 계층을 만들지 않습니다.
- DB repository, service class, generic query builder wrapper를 추가하지 않습니다.
- `processVrRefreshBatch()`나 `mapPortfolioRowForRefresh()`를 이동하지 않습니다.
- Supabase 응답을 새 도메인 객체로 재매핑하지 않습니다.
- 런타임 로직을 바꾸는 방어 코드나 fallback을 추가하지 않습니다.
- Supabase query builder 전체 타입을 복제하지 않습니다. 출시 직전 기본안에서는 현재 함수가 사용하는 `select`, `update`, `eq`, `not`, `range`만 포트로 둡니다.

`createEdgeSupabaseClient()`는 일반적인 추상화가 아니라, Supabase 외부 타입을 Edge Function 내부의 작은 포트 타입으로 제한하는 단일 경계입니다. 이 함수 하나로 `createClient()`의 깊은 제네릭 타입 문제를 격리할 수 있으므로 수정 목적에 비해 과하지 않습니다.

리뷰 반영 사항은 다음과 같습니다.

- `error: unknown` 대신 `EdgePostgrestError | null`을 사용해 에러의 `message`, `code`, `details`, `hint`를 보존합니다.
- `portfolios`, `is_closed`, `strategy->vrBand`, `id`는 리터럴 타입으로 보존해 출시 직전 오타를 막습니다.
- `from<Row = unknown, UpdatePayload = never>(table: EdgePortfolioTable)` 형태의 작은 제네릭 포트를 사용합니다.
- `Record<string, unknown>`과 `Partial<PortfolioRow>` 대신 `EdgePortfolioSnapshotUpdate`를 사용해 update payload를 `{ vr_snapshot: VrSnapshot }`로 제한합니다.
- `.order()`는 출시 직전 기본안에서 제외하고, 출시 후 결정적 페이징 하드닝 후보로 분리합니다.
- 실제 파일에 RPC나 다른 테이블 조작이 없는 것을 확인했으며, 현 함수의 사용 범위 이상으로 포트를 과도하게 확장하지 않습니다.

## Core Rules 준수 체크리스트

- [x] 금융 계산 로직을 수정하지 않습니다.
- [x] `buildRefreshedVrSnapshot()` 내부의 V, pool, 밴드, 주문표 계산을 변경하지 않습니다.
- [x] DB 조회 조건을 변경하지 않습니다.
- [x] DB 업데이트 payload를 변경하지 않습니다.
- [x] 업데이트 payload 타입은 `{ vr_snapshot: VrSnapshot }`만 허용하도록 제한합니다.
- [x] `any`를 사용하지 않고, 외부 타입 경계에는 `unknown`을 사용합니다.
- [x] PostgREST 에러 객체의 기본 진단 필드(`message`, `code`, `details`, `hint`)를 타입으로 보존합니다.
- [x] non-null assertion `!`를 추가하지 않습니다.
- [x] 불필요한 inline validation이나 중복 guard를 추가하지 않습니다.
- [x] 새 magic number를 추가하지 않습니다.
- [x] 현재 사용 중인 컬럼명과 테이블명은 리터럴 타입으로 보존해 오타를 막습니다.
- [x] 기존 에러 격리 정책을 유지합니다. 개별 포트폴리오 실패는 `processVrRefreshBatch()`에서 계속 격리됩니다.
- [x] 기존 chunk 처리와 pagination을 유지합니다.
- [x] 결정적 pagination 개선은 출시 후 별도 하드닝 항목으로 분리합니다.
- [x] 주기 전환 멱등성 로직을 변경하지 않습니다.
- [x] 출시 전 검증 명령과 스모크 테스트를 명시합니다.

## 검증 시나리오

### 1. Deno 타입 검증

```bash
deno check supabase/functions/refresh-vr-snapshots/index.ts
```

기대 결과:

- `TS2345`가 사라져야 합니다.
- `TS2322`가 사라져야 합니다.
- `TS2589`가 사라져야 합니다.

### 2. VR 스냅샷 순수 로직 회귀 테스트

```bash
npx vitest run utils/vrSnapshotRefresh.test.ts
```

기대 결과:

- 기존 10개 테스트가 모두 통과해야 합니다.
- 주기 미도래, 주기 전환, 중복 실행 멱등성, 주문표 재생성, 배치 에러 격리 테스트가 유지되어야 합니다.

### 3. 운영 스모크 호출

PowerShell 예시입니다.

```powershell
curl.exe -s -w "`nHTTP_CODE:%{http_code}" `
  -X POST "https://vbscfgjlckbjrdqzpire.supabase.co/functions/v1/refresh-vr-snapshots" `
  -H "Content-Type: application/json" `
  -d "{}"
```

기대 결과:

```json
{"success":true}
```

그리고 마지막 줄은 다음이어야 합니다.

```text
HTTP_CODE:200
```

JWT 검증 설정이나 게이트웨이 정책 때문에 인증이 필요한 경우에는 anon 또는 service role key를 헤더에 붙여 호출합니다.

```powershell
$KEY = "YOUR_KEY"

curl.exe -s -w "`nHTTP_CODE:%{http_code}" `
  -X POST "https://vbscfgjlckbjrdqzpire.supabase.co/functions/v1/refresh-vr-snapshots" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $KEY" `
  -H "apikey: $KEY" `
  -d "{}"
```

## 승인 후 실제 코드 수정 범위

승인 후 실제 수정은 `supabase/functions/refresh-vr-snapshots/index.ts` 한 파일로 제한합니다.

예상 변경은 다음뿐입니다.

- `Portfolio` 타입 import 추가
- Supabase 포트 타입의 `PromiseLike` 정렬
- `EdgePostgrestError` 추가로 에러 객체 진단 필드 보존
- `from<Row = unknown, UpdatePayload = never>(table: EdgePortfolioTable)` 기반의 작은 제네릭 포트 적용
- `EdgePortfolioSnapshotUpdate` 추가로 update payload를 `{ vr_snapshot: VrSnapshot }`로 제한
- `createEdgeSupabaseClient()` 어댑터 추가
- `refreshVrSnapshotForPortfolio()` 인자 타입을 `Portfolio`로 변경
- `serve()` 내부에서 어댑터 사용

출시 후 결정적 페이징 하드닝을 진행하면 아래 변경을 별도 적용합니다.

- `.range(...)` 앞에 `.order('id', { ascending: true })` 추가

수정 후에는 아래 순서로 검증합니다.

```bash
deno check supabase/functions/refresh-vr-snapshots/index.ts
npx vitest run utils/vrSnapshotRefresh.test.ts
```

이후 운영 배포가 필요하면 아래 명령을 사용합니다.

```bash
npx supabase functions deploy refresh-vr-snapshots --no-verify-jwt
```
