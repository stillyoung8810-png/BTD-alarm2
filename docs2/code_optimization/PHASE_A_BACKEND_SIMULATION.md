# PHASE_A_BACKEND_SIMULATION

> 목적: 프론트 레이어 Phase A가 끝난 현재 시점에서, 백엔드/Edge 레이어(`server/src/`, `supabase/functions/`)에 남아 있는 **A1 데드 코드/중복 타입**, **A2 느슨한 타입과 과도한 단언**을 실제 코드 수정 전에 드라이런으로 정리하는 문서입니다.
>
> 비범위: **Phase B/C/D 비즈니스 로직**은 제외합니다. 즉, DB 쿼리 구조 재설계, 스키마 변경, 결제 정책 변경, 구독 만료 계산 규칙 변경, VR/다분할 핵심 수학 변경은 본 문서의 대상이 아닙니다.

---

## 0. 전제와 제외 범위

- 본 문서는 **백엔드/Edge 기초 공사 계획서**입니다.
- 이번 문서는 아래 범위만 다룹니다.
  - `server/src/`
  - `supabase/functions/`
- 핵심 원칙은 다음 두 줄로 요약됩니다.
  - **A1:** 미사용 export, 중복 타입, 구조화 로깅과 어긋나는 잔재를 걷어냅니다.
  - **A2:** Request/Response, RPC, Supabase row, SDK boundary의 타입을 **런타임 가드 + 정적 타입**으로 좁힙니다.
- 아래 항목은 **이번 문서에서 일부러 건드리지 않습니다**.
  - DB 테이블 스키마 변경
  - SQL/RPC 로직 변경
  - 결제/구독 정책 변경
  - VR/다분할/이평 전략의 계산식 변경
  - Edge Function 비즈니스 플로우 재설계

---

## 1. 백엔드 레이어 진단 (Analysis)

| 핫스팟 | 레이어 | Phase | 진단 | 위험 |
| --- | --- | --- | --- | --- |
| `server/src/routes/payment.ts` | Route | A2 + A1 | `VerifyBody.planId`가 `string`이라 `planId as PaidPlanId` 캐스트가 필요합니다. Toss confirm 응답도 `confirmResponse.data as { status?: string; totalAmount?: number }`로 단언하고 있고, 성공 경로는 `console.log`를 써 구조화 로깅과 어긋납니다. | 외부 결제 응답 drift가 컴파일러를 우회하고, 잘못된 `planId`가 라우트 내부까지 흘러듭니다. |
| `server/src/services/paymentFulfillment.ts` + `paymentFulfillment.test.ts` | Service/Test | A2 | RPC 반환을 `(data ?? {}) as ClaimOrderResult`로 밀어붙이고, `Record<string, unknown>` 업데이트 payload가 두 군데(`orders`, `user_profiles`)에 넓게 열려 있습니다. 테스트도 `adminClient: client as any`를 사용합니다. | 경계 타입이 붕괴되어, RPC shape 변화나 mock drift가 조용히 숨어버립니다. |
| `server/src/tossClient.ts` + `server/src/toss/TossProvider.ts` | Infra | A1 + A2 | mTLS Axios 초기화와 Toss 에러 정규화가 두 파일에 이중화돼 있습니다. 이름만 다른 `normalizeTossErrorPayload` / `normalizeTossError`가 공존하며, 응답 payload를 작은 helper로 통합하지 못하고 있습니다. | 동일 규칙을 두 군데에서 따로 고치게 되어 drift가 발생합니다. |
| `server/src/routes/tossAuthRoute.ts` + `server/src/toss/deleteUserData.ts` | Route/Service | A2 + A1 | `request.body as Record<string, unknown>` 캐스트 뒤에 검증을 붙이고 있어 라우트 제네릭이 비어 있습니다. `deleteUserData.ts`의 `DeleteUserDataStage`는 공개 export지만 현재 사용처가 없습니다. | 요청 경계 타입이 느슨하고, 미사용 공개 타입이 유지보수 잡음을 만듭니다. |
| `supabase/functions/generate-daily-execution-summaries/index.ts` | Edge Function | A1 + A2 | `_shared/types.ts`와 거의 같은 `AlarmConfig`, `Strategy`, `Portfolio`, `PortfolioRow`, `UserProfileRow`를 로컬에 다시 선언했습니다. 동시에 `vrBand?: any`, `(portfolio.strategy as any).vrBand`, `rows.map((row: any) => ...)`, `checkPartial(..., config: any)`가 남아 있습니다. | 타입 SSOT가 깨지고, 전략 필드가 바뀌면 Edge만 뒤처지는 drift가 발생합니다. |
| `supabase/functions/refresh-vr-snapshots/index.ts` + `_shared/types.ts` | Edge Function / Shared | A2 | `EdgeSupabase = any`와 `deno-lint-ignore-file no-explicit-any`가 파일 전체를 덮고 있습니다. `_shared/types.ts`의 `PortfolioRow extends Record<string, unknown>`는 인덱스 시그니처가 너무 넓어 `row['vrSnapshot']` 같은 우회 접근을 쉽게 허용합니다. | 잘못된 키 접근과 row shape drift를 컴파일 타임에 잡지 못합니다. |
| `supabase/functions/send-alarm/index.ts` + `gemini/index.ts` | Edge Function | A1 + A2 | `UserProfileRow`가 `send-alarm`과 `generate-daily-execution-summaries`에 중복 정의돼 있고, `gemini`는 `generationConfig as unknown as GenerationConfig` 이중 단언을 사용합니다. | SDK 업그레이드나 프로필 필드 변경 시 한쪽만 고치는 drift가 생깁니다. |

### 1.1 추가 메모

- 이번 문서의 최우선 순위는 **외부 I/O 경계 타입을 좁히는 것**입니다.
  - Fastify `request.body`
  - Toss/Axios 응답 body
  - Supabase RPC 반환
  - Supabase row 매핑
  - Gemini SDK 옵션
- Rule 1(금융 수학)은 **핵심 수식 변경이 아니라 입력 경계 보호** 관점으로만 반영합니다.
  - 예: `quantity`, `amount`, `unitPrice`, `currentPrice` 같은 수치가 `number`가 아닐 때 조용히 흘리지 않도록 파서에서 막습니다.
  - 예: PG `totalAmount`(KRW)는 계약상 정수이나, Rule 1에 따라 **`Math.round`로 정수 스케일 통일(`safeAmount`)** 후 단가로 나누고, **`amount % unitPrice` 같은 네이티브 나머지 연산만 신뢰하지 않으며**, `Number.EPSILON`으로 **정수 수량 여부를 근사 판별**합니다(§3.1 `deriveQuantityFromAmount` 스니펫).

---

## 2. 액션 플랜 (Action Plan)

### 2.1 정리 원칙

1. **Request/Response는 “unknown 수신 -> guard/parse -> 좁은 타입” 순서로만 통과시킵니다.**
   - `request.body as ...` 금지
   - `axiosResponse.data as ...` 금지
   - `rpc data as ...` 금지
   - **외부 HTTP(결제망·PG 등) 호출은 `try/catch`로 감싸** 타임아웃·5xx 시 **구조화 로그 + 적절한 HTTP 상태(예: 502)** 를 반환합니다. Unhandled rejection을 남기지 않습니다(Rule 6).

2. **서비스 경계 타입은 “실제로 쓰는 메서드만” 노출합니다.**
   - `SupabaseClient` 전체를 함수 시그니처로 받지 말고, 필요 최소 메서드만 가진 얇은 인터페이스로 좁힙니다.
   - 테스트는 이 얇은 인터페이스를 만족하는 mock만 만들면 되게 합니다.

3. **중복 타입은 `_shared` 또는 단일 모듈로 합칩니다.**
   - Edge 함수 로컬 `Portfolio`/`Strategy`/`UserProfileRow` 중복 선언 제거
   - Toss 에러 payload/정규화 helper 통합

4. **업데이트 payload는 `Record<string, unknown>`로 풀어놓지 않습니다.**
   - `orders.update(...)`, `user_profiles.update(...)`는 목적별 인터페이스를 둡니다.
   - 변경 가능한 필드만 정확히 나열합니다.

5. **A1 정리는 “삭제 가능한 것만” 지웁니다.**
   - 미사용 export, 중복 helper, 구조화 로깅과 어긋나는 `console.log`
   - 단, 정책 문자열/에러 문구/업무 플로우는 바꾸지 않습니다.

6. **핵심 계산식은 그대로 두고, 입력 타입과 shape만 좁힙니다.**
   - 구독 만료 계산 로직 유지
   - VR/다분할 계산식 유지
   - 주가/수량/수익률 계산 수식은 건드리지 않음

### 2.2 적용 순서

1. `server/src/routes/payment.ts`
   - `planId`와 Toss confirm 응답 shape를 파서로 좁히기
   - `PLAN_AMOUNTS`를 `Record<PaidPlanId, number>`로 고정
   - 성공 로그를 `request.log.info`로 통일
   - Toss confirm 등 외부 호출 실패 시 **502 + 영문 메시지**는 **§2.4** 유지(프론트에서 i18n)
   - `deriveQuantityFromAmount`: Toss `totalAmount`는 **§2.4**대로 **`Math.round` 정수 스케일(`safeAmount`)** 후 검증·나눗셈

2. `server/src/services/paymentFulfillment.ts` + test
   - `claim_order_processing` RPC 반환 파서 추가
   - `Record<string, unknown>` 업데이트 payload 제거
   - `adminClient`를 최소 인터페이스로 축소
   - 테스트의 `as any` 제거
   - `toClaimOrderResult` 성공 분기에서 `claimed` / `already_processed` / `in_progress`는 **§2.4**대로 명시적 `true`만 인정, 그 외는 **`false`**

3. `server/src/tossClient.ts` + `server/src/toss/TossProvider.ts`
   - Toss 에러 정규화 helper 공통화
   - 중복된 HTTPS/Axios 설정 포인트만 묶기
   - `deleteUserData.ts` 미사용 export 삭제 여부 확인

4. `supabase/functions/generate-daily-execution-summaries/index.ts`
   - 로컬 타입 블록 제거 후 `_shared/types.ts` 재사용
   - `vrBand`, `stock row`, `partial profit config`의 `any` 제거

5. `supabase/functions/refresh-vr-snapshots/index.ts` + `_shared/types.ts`
   - `EdgeSupabase = any` 제거
   - `PortfolioRow`의 인덱스 시그니처 의존 제거
   - 레거시 camelCase row는 별도 보강 인터페이스로 흡수

6. `supabase/functions/send-alarm/index.ts` + `gemini/index.ts`
   - `UserProfileRow`를 `_shared`로 이동 또는 단일 import로 통일
   - Gemini generation config 이중 단언 범위 최소화

### 2.3 검증 기준

- `rg "\bany\b|as any"` 로 `server/src/`, `supabase/functions/` 직접 `any` 잔존 여부 확인
- `rg "as unknown as|as \{"` 로 이중 단언/넓은 단언 잔존 여부 확인
- `rg "console\.log"` 로 구조화 로깅 누수 확인
- `rg "extends Record<string, unknown>"` 로 과도한 row 인덱스 시그니처 확인
- `npm run typecheck`
- 서버 테스트가 있으면 `npm --prefix server test` 또는 동등 스크립트 확인

---

## 2.4 정책 (백엔드 Phase A 확정)

1. **결제망 장애(502 등) 응답 메시지 언어:** 백엔드는 **표준 영문**을 사용한다. 예: `Failed to communicate with payment gateway`. 사용자 대상 다국어·톤앤매너는 **프론트엔드**에서 상태 코드·코드/키를 받아 처리한다.
2. **`toClaimOrderResult`의 불리언 플래그:** 금융·결제 상태 무결성을 위해 `claimed`, `already_processed`, `in_progress`는 RPC에 **명시적 `true`가 없으면 `undefined`로 두지 않고 항상 `false`**로 귀결시킨다(**`=== true`만 성공으로 인정**). TypeScript strict 모드에서는 `object`에 키를 직접 붙이지 않고, **`null` 배제 직후 `raw as Record<string, unknown>`로 한 번 좁힌 뒤** `typeof` / `=== true`로 읽는다.
3. **Toss `totalAmount` 스케일(KRW):** 계약상 **원화 정수**가 내려오는 것이 맞다. 다만 Rule 1에 따라 **외부망 결괏값을 맹신하지 않는다.** `deriveQuantityFromAmount` 도입부에서 **`const safeAmount = Math.round(actualAmount);`** 로 **정수 스케일을 강제 통일**한 뒤, 그 값으로 **비교·나눗셈·EPSILON 정수 판별**을 수행한다(§3.1 스니펫).

---

## 3. 시뮬레이션 스니펫 (Before ❌ vs After ✅)

## 3.1 `server/src/routes/payment.ts`

### 진단

- 현재 라우트는 **요청 body와 Toss 결제 응답을 모두 캐스트**로 밀어붙이고 있습니다.
- `planId as PaidPlanId`, `confirmResponse.data as ...`는 A2의 전형적인 경계 누수입니다.
- 성공 로그는 `console.log`로 남아 있어 Fastify 구조화 로깅과도 불일치합니다.
- **시뮬레이션 초안 오류(수정됨):** After 스니펫에서 `amount: expectedAmount`만 두고 **`expectedAmount` 선언·계산을 빠뜨리면** 라우트 진입 시 **`ReferenceError`로 핸들러가 깨집니다.** 반드시 `unitPrice`와 검증된 `quantity`로 **기존과 동일한 예상 금액**을 복원해야 합니다.
- **`await tossClient.post(...)`를 try/catch 없이 두면** 네트워크·토스 장애 시 **Unhandled rejection** 또는 응답 미반환 위험이 있습니다. 결제 확인 호출은 **항상 실패 경로를 포착**합니다(Rule 6).
- **`deriveQuantityFromAmount`에서 `actualAmount % unitPrice === 0`만 믿는 방식**은 Rule 1에 어긋납니다. PG가 부동소수로 내려주면 **나머지가 0이 아닌 잔차**로 나와 정상 결제가 거절될 수 있으므로, **`Number.EPSILON`을 쓴 정수 근사 판별**을 시뮬레이션 스니펫에 포함합니다. **§2.4:** KRW 계약은 정수이나 외부 값은 맹신하지 않고, **`safeAmount = Math.round(actualAmount)`** 로 한 겹 통일한 뒤 나눗셈합니다.

### ❌ Before

```ts
const PLAN_AMOUNTS: Record<string, number> = {
  pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5907),
  premium: Number(process.env.PLAN_AMOUNT_PREMIUM ?? 9900),
};

interface VerifyBody {
  paymentId: string;
  planId: string;
  quantity?: number;
}

fastify.post<{ Body: VerifyBody }>('/payment/toss/verify', async (request, reply) => {
  const { paymentId, planId, quantity: reqQuantity } = request.body;
  const unitPrice = PLAN_AMOUNTS[planId];
  const expectedAmount =
    unitPrice *
    (typeof reqQuantity === 'number' && reqQuantity >= 1 && reqQuantity <= QUANTITY_MAX
      ? reqQuantity
      : 1);
  const confirmResponse = await tossClient.post('/v1/payments/confirm', {
    paymentKey: paymentId,
    orderId: paymentId,
    amount: expectedAmount,
  });
  const paymentData = confirmResponse.data as { status?: string; totalAmount?: number };

  const fulfillment = await fulfillPaidOrder({
    adminClient: supabaseAdmin,
    paymentId,
    userId: user.id,
    planId: planId as PaidPlanId,
    quantity,
    amount: actualAmount,
    planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
  });

  console.log('[Payment] Verification & DB Update Successful');
  return reply.send({ success: true });
});
```

### ✅ After

```ts
import type { FastifyInstance } from 'fastify';
import { tossClient } from '../tossClient';
import { supabaseAdmin } from '../supabaseClient';
import {
  fulfillPaidOrder,
  PLAN_DAYS_PER_UNIT,
  type PaidPlanId,
} from '../services/paymentFulfillment';

const PAID_PLAN_IDS = ['pro', 'premium'] as const;
const QUANTITY_MAX = 12;

const PLAN_AMOUNTS: Record<PaidPlanId, number> = {
  pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5907),
  premium: Number(process.env.PLAN_AMOUNT_PREMIUM ?? 9900),
};

interface VerifyBody {
  paymentId: string;
  planId: PaidPlanId;
  quantity?: number;
}

interface TossConfirmResponse {
  status?: string;
  totalAmount?: number;
}

function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
  const safeAmount = Math.round(actualAmount);

  if (unitPrice <= 0 || safeAmount < unitPrice) {
    return null;
  }

  const q = safeAmount / unitPrice;

  if (Math.abs(Math.round(q) - q) > Number.EPSILON) {
    return null;
  }

  const roundedQ = Math.round(q);
  return roundedQ >= 1 && roundedQ <= QUANTITY_MAX ? roundedQ : null;
}

function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === 'string' && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

function parseVerifyBody(raw: unknown): VerifyBody | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.paymentId !== 'string' || body.paymentId.trim() === '') {
    return null;
  }
  if (!isPaidPlanId(body.planId)) {
    return null;
  }
  if (
    body.quantity !== undefined &&
    (typeof body.quantity !== 'number' || body.quantity < 1 || body.quantity > QUANTITY_MAX)
  ) {
    return null;
  }

  if (typeof body.quantity === 'number') {
    return { paymentId: body.paymentId, planId: body.planId, quantity: body.quantity };
  }

  return { paymentId: body.paymentId, planId: body.planId };
}

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/payment/toss/verify', async (request, reply) => {
    const parsedBody = parseVerifyBody(request.body);
    if (!parsedBody) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid payment verification payload',
      });
    }

    const { paymentId, planId, quantity: reqQuantity } = parsedBody;
    const unitPrice = PLAN_AMOUNTS[planId];

    const safeQuantity =
      typeof reqQuantity === 'number' && reqQuantity >= 1 && reqQuantity <= QUANTITY_MAX
        ? reqQuantity
        : 1;
    const expectedAmount = unitPrice * safeQuantity;

    // (기존 구현과 동일) Authorization 헤더 → supabaseAdmin.auth.getUser(token) 로 user 확보
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ success: false, error: 'Missing Authorization header' });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return reply.code(401).send({ success: false, error: 'Invalid or expired token' });
    }

    let confirmResponse;
    try {
      confirmResponse = await tossClient.post<TossConfirmResponse>('/v1/payments/confirm', {
        paymentKey: paymentId,
        orderId: paymentId,
        amount: expectedAmount,
      });
    } catch (error) {
      request.log.error({ err: error, paymentId }, '[Payment] Toss confirm API failed');
      return reply.code(502).send({
        success: false,
        message: 'Failed to communicate with payment gateway',
      });
    }

    const paymentData = confirmResponse.data;
    if (paymentData.status !== 'DONE') {
      return reply.send({ success: false, message: 'Payment status is not DONE' });
    }

    const actualAmount = Number(paymentData.totalAmount) || 0;
    const quantity = deriveQuantityFromAmount(actualAmount, unitPrice);
    if (quantity == null) {
      return reply.code(400).send({
        success: false,
        error: 'Payment amount does not match any allowed plan quantity.',
      });
    }

    const fulfillment = await fulfillPaidOrder({
      adminClient: supabaseAdmin,
      paymentId,
      userId: user.id,
      planId,
      quantity,
      amount: actualAmount,
      currency: 'KRW',
      payMethod: 'CARD',
      pgProvider: 'TOSS_PAYMENTS',
      pgTxId: paymentId,
      paidAt: new Date().toISOString(),
      orderName: `${planId.toUpperCase()} Plan (${quantity * PLAN_DAYS_PER_UNIT}일)`,
      planAmounts: PLAN_AMOUNTS,
      metadata: { source: 'toss-payments-verify' },
    });

    request.log.info(
      { paymentId, userId: user.id, planId, quantity },
      '[Payment] Verification & DB update success',
    );

    return reply.send({ success: true, subscription: fulfillment.subscription });
  });
}
```

### 기대 효과

- 결제 요청 body와 Toss confirm 응답의 **타입 구멍이 라우트 경계에서 바로 닫힙니다.**
- `PaidPlanId` 캐스트와 넓은 응답 단언이 사라져, 외부 계약 drift가 더 빨리 드러납니다.
- **`expectedAmount`가 항상 정의**되어 ReferenceError가 나지 않고, Toss 호출 실패 시 **502 + 로그**로 프로세스 안정성을 지킵니다.
- 502 본문 `message`는 **§2.4 정책에 따라 영문 유지**; 최종 사용자 문구는 프론트에서 매핑합니다.
- Toss `totalAmount`는 KRW **정수 계약**을 전제로 하되, **`safeAmount = Math.round(actualAmount)`** 로 외부 부동소수 표현을 흡수한 뒤 수량을 역산합니다(§2.4·Rule 1).

---

## 3.2 `server/src/services/paymentFulfillment.ts` + `paymentFulfillment.test.ts`

### 진단

- 현재 서비스는 RPC 반환을 **`as ClaimOrderResult`로 단언**하고, 업데이트 payload를 **`Record<string, unknown>`**로 열어 둔 상태입니다.
- 테스트도 `adminClient: client as any`를 써서, 정작 mock drift를 컴파일러가 잡지 못합니다.
- **`(raw as ClaimOrderRpcRow)` 같은 중간 단언**은 `any`를 쓰지 않아도 컴파일러를 속이는 것과 같습니다. RPC 응답은 **객체 배제 후 `Record<string, unknown>`으로 한 번 좁힌 뒤 `typeof` / `=== true`로 필드를 읽습니다**(Rule 7). `object`에 `raw.success`처럼 **직접 프로퍼티 접근만 하는 스니펫**은 strict TS에서 **컴파일 오류**가 나므로 시뮬레이션에서도 피합니다.
- **`claimed` / `already_processed` / `in_progress`는 §2.4에 따라** 성공 분기에서 **`true`가 명시적으로 올 때만 `true`**, 그 외(키 없음·타입 불일치·falsy)는 **`false`로 통일**합니다. `undefined`로 “모름”을 남기지 않습니다.
- 이번 단계에서는 **비즈니스 로직은 그대로 두고**, 경계 타입만 얇고 엄격하게 만드는 것이 맞습니다.

### ❌ Before

```ts
interface ClaimOrderResult {
  success: boolean;
  claimed?: boolean;
  already_processed?: boolean;
  in_progress?: boolean;
  order_id?: string;
  status?: string;
  error?: string;
}

async function claimOrderForProcessing(
  adminClient: SupabaseClient,
  params: FulfillPaidOrderParams,
): Promise<ClaimOrderResult> {
  const { data, error } = await adminClient.rpc('claim_order_processing', {
    p_payment_id: params.paymentId,
    p_user_id: params.userId,
    p_plan_id: params.planId,
    p_order_name: params.orderName,
    p_amount: params.amount,
  });
  if (error) {
    throw new Error(`[claim_order_processing] ${error.message}`);
  }
  return (data ?? {}) as ClaimOrderResult;
}

async function markOrderStatus(
  adminClient: SupabaseClient,
  paymentId: string,
  status: 'pending' | 'paid',
  metadata: Record<string, unknown>,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    status,
    metadata,
  };
  await adminClient.from('orders').update(updatePayload).eq('payment_id', paymentId);
}

const profileUpdate: Record<string, unknown> = {
  subscription_tier: fulfillment.nextTier,
  subscription_status: fulfillment.nextStatus,
  subscription_expires_at: fulfillment.nextExpiresAt,
  pending_plan: fulfillment.pendingPlan,
  pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
  max_portfolios: fulfillment.maxPortfolios,
  max_alarms: fulfillment.maxAlarms,
  updated_at: nowIso,
};
```

```ts
const first = await fulfillPaidOrder({
  adminClient: client as any,
  paymentId: 'pay-1',
  userId: 'user-1',
  planId: 'pro',
  quantity: 1,
  amount: PLAN_AMOUNTS.pro,
  currency: 'KRW',
  payMethod: 'CARD',
  pgProvider: 'nicepay',
  orderName: `PRO Plan (${PLAN_DAYS_PER_UNIT}일)`,
  planAmounts: PLAN_AMOUNTS,
});
```

### ✅ After

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

type PaymentAdminClient = Pick<SupabaseClient, 'rpc' | 'from'>;

interface ClaimOrderResult {
  success: boolean;
  claimed?: boolean;
  already_processed?: boolean;
  in_progress?: boolean;
  order_id?: string;
  status?: string;
  error?: string;
}

interface OrderStatusUpdate {
  status: 'pending' | 'paid';
  metadata: Record<string, unknown>;
  paid_at?: string | null;
  pg_tx_id?: string | null;
}

interface OrderProfileUpdate {
  subscription_tier: SubscriptionTier;
  subscription_status: Exclude<SubscriptionStatus, 'cancelled' | 'refunded'>;
  subscription_expires_at: string;
  pending_plan: PaidPlanId | null;
  pending_plan_effective_at: string | null;
  max_portfolios: number;
  max_alarms: number;
  updated_at: string;
}

function toClaimOrderResult(raw: unknown): ClaimOrderResult {
  if (typeof raw !== 'object' || raw === null) {
    return { success: false, error: 'Response is not an object' };
  }

  const data = raw as Record<string, unknown>;

  const isSuccess = typeof data.success === 'boolean' ? data.success : false;

  if (!isSuccess) {
    return {
      success: false,
      error: typeof data.error === 'string' ? data.error : 'Invalid RPC response',
    };
  }

  // §2.4: 명시적 true만 인정 — 그 외는 false
  return {
    success: true,
    claimed: data.claimed === true,
    already_processed: data.already_processed === true,
    in_progress: data.in_progress === true,
    order_id: typeof data.order_id === 'string' ? data.order_id : undefined,
    status: typeof data.status === 'string' ? data.status : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

export interface FulfillPaidOrderParams {
  adminClient: PaymentAdminClient;
  paymentId: string;
  userId: string;
  planId: PaidPlanId;
  quantity: number;
  amount: number;
  currency: string;
  payMethod: string;
  pgProvider: string;
  pgTxId?: string | null;
  paidAt?: string | null;
  orderName: string;
  planAmounts: PlanAmounts;
  metadata?: Record<string, unknown>;
  nowIso?: string;
}

async function claimOrderForProcessing(
  adminClient: PaymentAdminClient,
  params: FulfillPaidOrderParams,
): Promise<ClaimOrderResult> {
  const { data, error } = await adminClient.rpc('claim_order_processing', {
    p_payment_id: params.paymentId,
    p_user_id: params.userId,
    p_plan_id: params.planId,
    p_order_name: params.orderName,
    p_amount: params.amount,
    p_currency: params.currency,
    p_pay_method: params.payMethod,
    p_pg_provider: params.pgProvider,
    p_pg_tx_id: params.pgTxId ?? null,
    p_paid_at: params.paidAt ?? null,
    p_metadata: {
      quantity: params.quantity,
      ...(params.metadata ?? {}),
    },
  });

  if (error) {
    throw new Error(`[claim_order_processing] ${error.message}`);
  }

  return toClaimOrderResult(data);
}

async function markOrderStatus(
  adminClient: PaymentAdminClient,
  paymentId: string,
  updatePayload: OrderStatusUpdate,
): Promise<void> {
  const { error } = await adminClient
    .from('orders')
    .update(updatePayload)
    .eq('payment_id', paymentId);

  if (error) {
    throw new Error(`[orders:${updatePayload.status}] ${error.message}`);
  }
}

const profileUpdate: OrderProfileUpdate = {
  subscription_tier: fulfillment.nextTier,
  subscription_status: fulfillment.nextStatus,
  subscription_expires_at: fulfillment.nextExpiresAt,
  pending_plan: fulfillment.pendingPlan,
  pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
  max_portfolios: fulfillment.maxPortfolios,
  max_alarms: fulfillment.maxAlarms,
  updated_at: nowIso,
};
```

```ts
const adminClient: PaymentAdminClient = client;

const first = await fulfillPaidOrder({
  adminClient,
  paymentId: 'pay-1',
  userId: 'user-1',
  planId: 'pro',
  quantity: 1,
  amount: PLAN_AMOUNTS.pro,
  currency: 'KRW',
  payMethod: 'CARD',
  pgProvider: 'nicepay',
  orderName: `PRO Plan (${PLAN_DAYS_PER_UNIT}일)`,
  planAmounts: PLAN_AMOUNTS,
});
```

### 기대 효과

- 결제 처리 서비스가 **실제 사용하는 Supabase 메서드만** 시그니처에 노출합니다.
- RPC·업데이트 payload·테스트 mock 모두에서 A2 캐스트 누수가 크게 줄어듭니다.
- `claim_order_processing` 응답은 **`ClaimOrderRpcRow` 같은 거짓 중간 타입 없이** `Record<string, unknown>` + `typeof` / `=== true`로 좁혀져, strict TS에서 컴파일되고 스키마 drift 시 런타임에서도 안전하게 실패합니다.
- 성공 시 불리언 플래그가 **항상 `true` 또는 `false`**로 정해져, 다운스트림에서 `undefined`와 `false`를 구분해야 하는 모호함이 사라집니다(§2.4).

---

## 3.3 `supabase/functions/generate-daily-execution-summaries/index.ts`

### 진단

- 이 파일은 `_shared/types.ts`와 거의 동일한 타입을 **로컬에서 다시 선언**하고 있습니다.
- 동시에 `vrBand?: any`, `(portfolio.strategy as any).vrBand`, `row: any`, `config: any`가 섞여 있어 Phase A의 핵심 목표(A1 중복 제거, A2 타입 좁히기)를 정면으로 위반합니다.
- **시뮬레이션 초안 오류(수정됨):** `toStockPriceRows`에서 `row is StockPriceRow`를 선언해 놓고 **`typeof row === 'object'`만 검사**하면, `close`/`trade_date`가 없어도 타입만 맞춰 **런타임에 `undefined`가 흐릅니다.** 타입 술어를 쓰지 않고 **`Record<string, unknown>`로 필드를 읽어 명시적으로 매핑**해야 합니다(Rule 7).
- 이번 단계에서는 **핵심 전략 계산 로직을 바꾸지 않고**, 타입 출처와 경계만 통일해야 합니다.

### ❌ Before

```ts
import { getEffectiveSubscriptionState } from '../../../server/src/services/paymentFulfillment.ts';

interface Strategy {
  ma0: { stock: string; rsiEnabled: boolean; alignmentEnabled?: boolean; maAPeriod?: number; maBPeriod?: number };
  ma1: { stock: string; rsiThreshold?: number; takePartialProfit?: boolean; partialProfitTargetPct?: number };
  ma2: { stock: string; splitCount: number; rsiThreshold?: number; takePartialProfit?: boolean; partialProfitTargetPct?: number };
  ma3: { stock: string; rsiThreshold?: number; takePartialProfit?: boolean; partialProfitTargetPct?: number };
  multiSplit?: { targetStock: string; targetReturnRate: number; totalSplitCount: number };
  noStopMultiSplit?: { targetStock: string; lowLocBudgetRatio: number; highLocPremiumPct: number; takeProfitPct: number; totalSplitCount: number };
  vrBand?: any;
}

async function getStockHistory(
  supabase: ReturnType<typeof createClient>,
  cache: Map<string, StockHistory>,
  symbol: string,
  limit: number,
): Promise<StockHistory> {
  const { data } = await supabase
    .from('stock_prices')
    .select('close, trade_date')
    .eq('symbol', symbol.trim().toUpperCase())
    .order('trade_date', { ascending: false })
    .limit(limit);
  const rows = [...(data ?? [])].reverse();
  const prices = rows.map((row: any) => Number(row.close ?? 0)).filter((p) => p > 0);
  const dates = rows.map((row: any) => String(row.trade_date || '')).filter(Boolean);
  return { prices, dates };
}

function formatVrBandBlock(portfolio: Portfolio, lang: Lang, options: { vrMaxBuyStep?: number }): string {
  const lines: string[] = [];
  const vrMode = (portfolio.strategy as any).vrBand?.vrMode as
    | 'lump_sum'
    | 'accumulate'
    | 'withdraw'
    | undefined;

  if (vrMode) {
    const modeLabel =
      vrMode === 'lump_sum'
        ? lang === 'ko' ? '거치식' : 'Lump-sum'
        : vrMode === 'accumulate'
        ? lang === 'ko' ? '적립식' : 'Accumulate'
        : lang === 'ko' ? '인출식' : 'Withdraw';
    lines.push(`[${modeLabel}]`);
  }
}

const checkPartial = async (sec: 1 | 2 | 3, config: any) => {
  if (!config?.takePartialProfit || config?.partialProfitTargetPct == null || config?.partialProfitTargetPct <= 0) return;
  const h = holdings.find((x) => x.stock === config.stock);
  if (!h || h.quantity <= 0 || h.avgPrice <= 0) return;
  // ...
};
```

### ✅ After

```ts
import { getEffectiveSubscriptionState } from '../../../server/src/services/paymentFulfillment.ts';
import type {
  Portfolio,
  Strategy,
  PortfolioRow,
  VrBandStrategyParams,
} from '../_shared/types.ts';

type PartialProfitStrategyConfig =
  | Strategy['ma1']
  | Strategy['ma2']
  | Strategy['ma3'];

interface UserProfileRow {
  id: string;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean | null;
  telegram_chat_id?: string | null;
  preferred_language?: string | null;
}

interface StockPriceRow {
  close: number | string | null;
  trade_date: string | null;
}

function toStockPriceRows(raw: unknown): StockPriceRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<StockPriceRow[]>((acc, row) => {
    if (typeof row === 'object' && row !== null) {
      const data = row as Record<string, unknown>;
      acc.push({
        close:
          typeof data.close === 'number' || typeof data.close === 'string'
            ? data.close
            : null,
        trade_date:
          typeof data.trade_date === 'string' ? String(data.trade_date) : null,
      });
    }
    return acc;
  }, []);
}

function getVrModeLabel(
  vrMode: VrBandStrategyParams['vrMode'],
  lang: Lang,
): string {
  switch (vrMode) {
    case 'lump_sum':
      return lang === 'ko' ? '거치식' : 'Lump-sum';
    case 'accumulate':
      return lang === 'ko' ? '적립식' : 'Accumulate';
    case 'withdraw':
      return lang === 'ko' ? '인출식' : 'Withdraw';
    default: {
      const exhaustiveCheck: never = vrMode;
      return exhaustiveCheck;
    }
  }
}

async function getStockHistory(
  supabase: ReturnType<typeof createClient>,
  cache: Map<string, StockHistory>,
  symbol: string,
  limit: number,
): Promise<StockHistory> {
  const key = symbol.trim().toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.prices.length >= limit) {
    return cached;
  }

  const { data, error } = await supabase
    .from('stock_prices')
    .select('close, trade_date')
    .eq('symbol', key)
    .order('trade_date', { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) {
    const empty = { prices: [], dates: [] };
    cache.set(key, empty);
    return empty;
  }

  const rows = toStockPriceRows([...data].reverse());
  const prices = rows
    .map((row) => Number(row.close ?? 0))
    .filter((price) => price > 0);
  const dates = rows
    .map((row) => String(row.trade_date ?? ''))
    .filter(Boolean);
  const history = { prices, dates };
  cache.set(key, history);
  return history;
}

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const snapshot = portfolio.vrSnapshot;
  const vrBand = portfolio.strategy.vrBand;

  if (!snapshot) {
    const pending =
      lang === 'ko'
        ? 'VR 밴드 전략 데이터를 계산하는 중입니다. 첫 매수를 V값 안에서 진행해 주세요.'
        : 'Calculating VR band data. Please execute your first buy within the V value.';
    return `- ${pending}`;
  }

  const lines: string[] = [];
  const vrMode = vrBand?.vrMode;
  if (vrMode) {
    lines.push(`[${getVrModeLabel(vrMode, lang)}]`);
  }

  // ... 기존 snapshot formatting 로직 유지
  return lines.join('\n');
}

const checkPartial = async (
  sec: 1 | 2 | 3,
  config: PartialProfitStrategyConfig | undefined,
) => {
  if (
    !config?.takePartialProfit ||
    config.partialProfitTargetPct == null ||
    config.partialProfitTargetPct <= 0
  ) {
    return;
  }

  const holding = holdings.find((item) => item.stock === config.stock);
  if (!holding || holding.quantity <= 0 || holding.avgPrice <= 0) {
    return;
  }

  const snapshot = await getStockSnapshot(
    supabase,
    historyCache,
    snapshotCache,
    config.stock,
  );
  const currentPrice = snapshot.price ?? 0;
  if (currentPrice <= 0) {
    return;
  }

  const yieldPct = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
  if (yieldPct >= config.partialProfitTargetPct) {
    lines.push({ section: sec, stock: config.stock, quantity: holding.quantity });
  }
};
```

### 기대 효과

- Edge 함수가 `_shared/types.ts`를 **진짜 SSOT로 재사용**하게 됩니다.
- 주가 row는 **타입 술어 없이** 필드 단위로 매핑되어, Supabase row shape가 바뀌어도 **`undefined`가 조용히 전파**하기 어렵습니다.
- `vrBand`, 주가 row, partial-profit 설정이 `any` 없이도 안전하게 순회됩니다.

---

## 3.4 `supabase/functions/_shared/types.ts` + `refresh-vr-snapshots/index.ts`

### 진단

- `PortfolioRow extends Record<string, unknown>`는 현재 여러 Edge 함수에 “아무 키나 읽어도 되는” 길을 열어 주고 있습니다.
- `refresh-vr-snapshots`는 그 결과로 `EdgeSupabase = any`, `row['vrSnapshot']`, `as AlarmConfig`, `as VrSnapshot`를 함께 쓰고 있습니다.
- 이번 단계에서는 **row shape를 넓게 허용하는 대신**, 레거시 camelCase 필드만 명시적으로 보강하는 편이 더 안전합니다.

### ❌ Before

```ts
// _shared/types.ts
export interface PortfolioRow extends Record<string, unknown> {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  daily_buy_amount?: number | null;
  start_date?: string | null;
  startDate?: string | null;
  fee_rate?: number | null;
  feeRate?: number | null;
  strategy?: Strategy;
  trades?: Trade[] | null;
  alarm_config?: AlarmConfig | null;
  is_quarter_mode?: boolean | null;
  is_closed?: boolean | null;
  closed_at?: string | null;
  final_sell_amount?: number | null;
  vr_snapshot?: VrSnapshot | null;
}
```

```ts
// refresh-vr-snapshots/index.ts
// deno-lint-ignore-file no-explicit-any
type EdgeSupabase = any;

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row?.strategy) return null;

  const rawSnap = row.vr_snapshot ?? row['vrSnapshot'];

  return {
    id: row.id == null ? '' : String(row.id),
    name: row.name == null ? '' : String(row.name),
    dailyBuyAmount: Number(row.daily_buy_amount ?? 0),
    startDate: String(row.start_date ?? row.startDate ?? ''),
    feeRate: Number(row.fee_rate ?? row.feeRate ?? LEGACY_FEE_RATE_PCT),
    strategy: row.strategy,
    trades,
    isClosed: Boolean(row.is_closed ?? false),
    alarmconfig: (row.alarm_config ?? row.alarmconfig) as AlarmConfig | undefined,
    vrSnapshot: rawSnap === null || rawSnap === undefined ? undefined : (rawSnap as VrSnapshot),
  };
}
```

### ✅ After

```ts
// _shared/types.ts
export interface PortfolioRow {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  daily_buy_amount?: number | null;
  start_date?: string | null;
  fee_rate?: number | null;
  strategy?: Strategy;
  trades?: Trade[] | null;
  alarm_config?: AlarmConfig | null;
  is_quarter_mode?: boolean | null;
  is_closed?: boolean | null;
  closed_at?: string | null;
  final_sell_amount?: number | null;
  vr_snapshot?: VrSnapshot | null;

  // 레거시 camelCase 호환 필드만 명시적으로 허용
  startDate?: string | null;
  feeRate?: number | null;
  alarmconfig?: AlarmConfig | null;
  vrSnapshot?: VrSnapshot | null;
}
```

```ts
// refresh-vr-snapshots/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  AlarmConfig,
  Portfolio,
  PortfolioRow,
  VrSnapshot,
} from '../_shared/types.ts';
import {
  calculateBands,
  calculateNextV,
  generateBuyOrders,
  generateSellOrders,
} from '../_shared/vrBandStrategy.ts';

type EdgeSupabase = ReturnType<typeof createClient>;

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row.strategy) {
    return null;
  }

  const rawTrades = row.trades;
  const trades = Array.isArray(rawTrades) ? rawTrades : [];
  const rawSnapshot = row.vr_snapshot ?? row.vrSnapshot;
  const alarmConfig = row.alarm_config ?? row.alarmconfig ?? undefined;

  return {
    id: row.id == null ? '' : String(row.id),
    name: row.name == null ? '' : String(row.name),
    dailyBuyAmount: Number(row.daily_buy_amount ?? 0),
    startDate: String(row.start_date ?? row.startDate ?? ''),
    feeRate: Number(row.fee_rate ?? row.feeRate ?? LEGACY_FEE_RATE_PCT),
    strategy: row.strategy,
    trades,
    isClosed: Boolean(row.is_closed ?? false),
    closedAt: row.closed_at == null ? undefined : String(row.closed_at),
    finalSellAmount:
      row.final_sell_amount == null ? undefined : Number(row.final_sell_amount),
    alarmconfig: alarmConfig,
    isQuarterMode: Boolean(row.is_quarter_mode ?? false),
    vrSnapshot: rawSnapshot == null ? undefined : rawSnapshot,
  };
}

async function refreshVrSnapshotForPortfolio(
  supabase: EdgeSupabase,
  portfolio: Portfolio,
  portfolioId: string,
  targetCycleIndex: number,
): Promise<void> {
  const params = portfolio.strategy.vrBand;
  const previousSnapshot = portfolio.vrSnapshot;
  if (!params || !previousSnapshot) {
    return;
  }

  const nextV = calculateNextV(previousSnapshot.currentV, previousSnapshot.pool, params);
  const { bandLow, bandHigh } = calculateBands(
    nextV,
    params.bandRateUpper,
    params.bandRateLower,
  );
  const buyOrders = generateBuyOrders({
    shares: previousSnapshot.shares,
    pool: previousSnapshot.pool,
    bandLow,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
    poolUsageRateBuy: params.poolUsageRateBuy,
  });
  const sellOrders = generateSellOrders({
    shares: previousSnapshot.shares,
    pool: previousSnapshot.pool,
    bandHigh,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
  });
  const updatedSnapshot: VrSnapshot = {
    ...previousSnapshot,
    currentV: nextV,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex: targetCycleIndex,
  };

  const { error } = await supabase
    .from('portfolios')
    .update({ vr_snapshot: updatedSnapshot })
    .eq('id', portfolioId);

  if (error) {
    throw error;
  }
}
```

### 기대 효과

- Edge row 매핑이 **인덱스 시그니처에 기대지 않고** 명시적으로 동작합니다.
- `refresh-vr-snapshots`의 파일 전체 `any` 무시가 제거되어, 실제 타입 부채 위치가 드러납니다.

---

## 4. 실제 적용 체크리스트

- `payment.ts`에서 `planId as PaidPlanId`, `confirmResponse.data as ...` 캐스트를 제거했는가
- `payment.ts`에서 Toss confirm 요청 `amount`에 쓰는 **`expectedAmount`가 `unitPrice × 검증된 quantity`로 항상 정의**되는가(미정의 변수 참조 없음)
- `deriveQuantityFromAmount`가 **`safeAmount = Math.round(actualAmount)`** 로 **정수 스케일을 먼저 통일**한 뒤 나눗셈하는가(§2.4·Rule 1)
- `deriveQuantityFromAmount`가 **`% unitPrice`만으로 정수 배수를 판정하지 않고** `Number.EPSILON` 등으로 **부동소수 잔차를 흡수**하는가(Rule 1)
- `payment.ts`에서 Toss confirm 등 **외부 결제망 HTTP 호출이 `try/catch`로 감싸져** 실패 시 **구조화 로그 + 적절한 HTTP 오류(예: 502)** 를 반환하는가
- 결제망 장애 응답 본문은 **§2.4**에 따라 **표준 영문**인가(사용자 문구는 프론트)
- `payment.ts`의 성공 로그를 `console.log`가 아니라 `request.log.info`로 통일했는가
- `paymentFulfillment.ts`에서 RPC 반환이 `toClaimOrderResult()` 같은 런타임 파서를 거치는가
- `toClaimOrderResult`가 **`(raw as SomeRow)` 없이**, `object` 배제 후 **`Record<string, unknown>`으로 좁힌 뒤** `typeof` / `=== true`로 필드를 읽는가(strict TS)
- `toClaimOrderResult` 성공 시 **`claimed` / `already_processed` / `in_progress`가 `undefined` 없이 `true` 또는 `false`**인가(§2.4)
- `paymentFulfillment.ts`의 업데이트 payload가 `Record<string, unknown>`가 아니라 명시적 인터페이스인가
- `paymentFulfillment.test.ts`에서 `client as any`를 제거했는가
- `tossClient.ts`와 `TossProvider.ts`의 Toss 에러 정규화가 단일 helper로 정리되는가
- `deleteUserData.ts`의 미사용 공개 타입/export를 실제 사용 여부 확인 후 제거했는가
- `generate-daily-execution-summaries/index.ts`에서 로컬 `Strategy`/`Portfolio`/`PortfolioRow` 재정의를 제거했는가
- 같은 파일에서 **`toStockPriceRows`가 거짓 `row is StockPriceRow` 필터가 아니라** `Record<string, unknown>` 기반 **필드별 매핑**으로 `close`/`trade_date`를 채우는가(Rule 7)
- 같은 파일에서 `vrBand?: any`, `(portfolio.strategy as any)`, `config: any`, `(row: any)`를 제거했는가
- `_shared/types.ts`에서 `PortfolioRow extends Record<string, unknown>`를 걷어내고, 필요한 레거시 필드만 명시했는가
- `refresh-vr-snapshots/index.ts`에서 `EdgeSupabase = any`를 제거했는가
- `send-alarm/index.ts`와 `generate-daily-execution-summaries/index.ts`의 `UserProfileRow`를 단일 타입 출처로 통일했는가
- `gemini/index.ts`의 `as unknown as GenerationConfig` 범위를 더 좁거나 명시적인 helper로 줄였는가

---

## 5. 최종 판단

- 백엔드/Edge의 Phase A는 **정책을 바꾸는 공사**가 아니라, **경계 타입과 중복 구조를 바로잡는 공사**입니다.
- 이번 단계가 끝나면 얻는 가장 큰 이점은 다음 두 가지입니다.
  - 잘못된 외부 입력이 더 빨리, 더 얕은 층에서 차단됩니다.
  - 같은 타입/에러 규칙을 두 군데 이상 고치는 drift가 줄어듭니다.

> **요청/응답은 경계에서 좁히고, 중복 타입은 하나로 모으고, `any`와 넓은 캐스트는 파서와 얇은 인터페이스로 대체한다.**

- 이 기준으로 들어가면 Phase B 비즈니스 로직 정리는 “수식과 정책”에만 집중할 수 있고, Phase A의 타입 부채가 다시 핵심 로직을 오염시키지 않게 됩니다.
