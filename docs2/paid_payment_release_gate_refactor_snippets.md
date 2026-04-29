# 유료 결제 출시 게이트 보강 스니펫

## 목적

`docs2/paid_payment_release_gate_audit_plan.md`의 P0 게이트를 통과하기 위한 최소 변경 스니펫입니다. 실제 구현 시에는 아래 순서대로 적용하고, 각 단계마다 타입 체크와 관련 테스트를 실행합니다.

## S0. 가격 env 파서 단일화

### 목표

가격 검증 규칙이 `App.tsx`, `membership.ts`, BFF IAP route에 흩어지면 출시 직전 가장 위험한 불일치가 생깁니다. 이번 B안 릴리스의 활성 결제 경로는 Toss IAP뿐이므로, 활성 프론트/BFF 경로 안에서는 반드시 공유 유틸 하나만 사용합니다.

### 권장 파일

- 프론트: `utils/paymentPlanAmount.ts`
- BFF: `server/src/utils/paymentPlanAmount.ts`

```typescript
export const MAX_PLAN_AMOUNT_KRW = 1_000_000;

export function readRequiredPositiveIntegerAmount(rawAmount: unknown): number | null {
  if (typeof rawAmount !== 'string' || rawAmount.trim() === '') {
    return null;
  }

  const normalizedAmount = rawAmount.trim();
  if (!/^\d+$/.test(normalizedAmount)) {
    return null;
  }

  const amount = Number(normalizedAmount);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PLAN_AMOUNT_KRW
  ) {
    return null;
  }

  return amount;
}
```

검증 포인트:

- 결제 가격 검증은 route/component 안에 새로 쓰지 않고 위 유틸을 import해서 사용합니다.
- 프론트와 BFF는 배포 런타임이 다르므로 파일은 나뉠 수 있지만, 함수명·상수명·테스트 케이스는 동일하게 유지합니다.
- `undefined`, 빈 문자열, `0`, 음수, 비숫자, 소수, 상한 초과는 모두 `null`로 수렴합니다.

### 권장 테스트: `utils/paymentPlanAmount.test.ts`, `server/src/utils/paymentPlanAmount.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { MAX_PLAN_AMOUNT_KRW, readRequiredPositiveIntegerAmount } from './paymentPlanAmount';

describe('readRequiredPositiveIntegerAmount', () => {
  it.each([undefined, null, '', '   ', '0', '-1', 'abc', '5907.5', `${MAX_PLAN_AMOUNT_KRW + 1}`])(
    '비정상 금액 %s는 null을 반환한다',
    (rawAmount: unknown) => {
      expect(readRequiredPositiveIntegerAmount(rawAmount)).toBeNull();
    },
  );

  it('상한 이하 양의 정수 문자열은 number로 반환한다', () => {
    expect(readRequiredPositiveIntegerAmount('5907')).toBe(5907);
    expect(readRequiredPositiveIntegerAmount(` ${MAX_PLAN_AMOUNT_KRW} `)).toBe(
      MAX_PLAN_AMOUNT_KRW,
    );
  });
});
```

## S1. 결제 CTA kill switch와 중앙 진입 게이트

### 목표

운영에서 결제 장애가 발생했을 때 앱 전체가 아니라 **결제 진입점만 닫을 수 있게** 합니다. 안전을 위해 환경변수는 fail-closed로 처리하고, 모든 결제 진입점은 `App.tsx`의 단일 게이트를 통과시킵니다.

### `services/payment/types.ts`

```typescript
export type CheckoutPlanId = 'pro' | 'premium';

/** Toss mini-app Phase 1: PRO 30일권 1건만 허용 */
export const TOSS_IAP_FIXED_PLAN_ID = 'pro' as const satisfies CheckoutPlanId;
export type SupportedIapCheckoutPlan = typeof TOSS_IAP_FIXED_PLAN_ID;
export const TOSS_IAP_FIXED_QUANTITY = 1;
```

### `vite-env.d.ts`

```typescript
interface ImportMetaEnv {
  readonly VITE_ENABLE_IAP_CHECKOUT?: BooleanEnvFlag;
  readonly VITE_PLAN_AMOUNT_PRO?: NumericEnvString;
}
```

### `App.tsx`

```typescript
import { getPricingMessages } from './constants/messages/pricingMessages';
import {
  TOSS_IAP_FIXED_PLAN_ID,
  type CheckoutPlanId,
  type SupportedIapCheckoutPlan,
} from './services/payment/types';
import { parseViteBooleanEnvFlag } from './utils/envViteFlags';
import { readRequiredPositiveIntegerAmount } from './utils/paymentPlanAmount';

const isIapCheckoutEnabled =
  parseViteBooleanEnvFlag(import.meta.env.VITE_ENABLE_IAP_CHECKOUT) &&
  readRequiredPositiveIntegerAmount(import.meta.env.VITE_PLAN_AMOUNT_PRO) != null;

function isSupportedIapCheckoutPlan(
  planId: CheckoutPlanId,
): planId is SupportedIapCheckoutPlan {
  return planId === TOSS_IAP_FIXED_PLAN_ID;
}
```

```typescript
const [checkoutPlan, setCheckoutPlan] = useState<SupportedIapCheckoutPlan | null>(null);
```

```typescript
const handleSelectCheckoutPlan = useCallback((planId: CheckoutPlanId): void => {
  if (!user) {
    setAuthModal('login');
    return;
  }

  if (!isIapCheckoutEnabled) {
    showErrorToast(getPricingMessages(lang).checkout.systemError);
    return;
  }

  if (!isSupportedIapCheckoutPlan(planId)) {
    showErrorToast(getPricingMessages(lang).checkout.systemError);
    return;
  }

  setCheckoutPlan(planId);
}, [lang, setAuthModal, setCheckoutPlan, user]);
```

```tsx
<TabContent
  // ...existing props
  onSelectCheckoutPlan={handleSelectCheckoutPlan}
/>

<AuthModals
  // ...existing props
  onUpgradePlan={handleSelectCheckoutPlan}
/>
```

검증 포인트:

- `VITE_ENABLE_IAP_CHECKOUT`가 없으면 결제창이 열리지 않습니다.
- `VITE_PLAN_AMOUNT_PRO`가 없거나 0 이하/비정상 숫자/소수/상한 초과이면 `VITE_ENABLE_IAP_CHECKOUT=true`여도 결제창이 열리지 않습니다.
- `VITE_ENABLE_IAP_CHECKOUT=true`이고 `planId === 'pro'`일 때만 결제창이 열립니다.
- `premium` 요청은 Checkout을 열지 않고 기존 i18n 오류 toast로 종료됩니다.
- `setCheckoutPlan`은 `handleSelectCheckoutPlan`, Checkout `onClose`, `onPaymentSuccess` 외부로 직접 전달하지 않습니다.
- `TabContent`, `AuthModals`, `ProfileView`의 props 타입도 `SupportedIapCheckoutPlan`으로 좁혀 타입 레벨에서 `premium` 직접 전달을 막습니다.

## S2. Premium 경로 차단

### 목표

현재 Toss IAP Phase 1은 PRO 30일권만 지원합니다. 따라서 PRO 사용자의 “Premium 업그레이드” 버튼이 PRO 결제로 이어지는 경로를 제거합니다.

### `components/TabContent.tsx`

```typescript
import type { SupportedIapCheckoutPlan } from '@/services/payment/types';

export interface TabContentProps {
  // ...existing props
  onSelectCheckoutPlan: (planId: SupportedIapCheckoutPlan) => void;
}
```

```typescript
const handlePricingUpgrade = useCallback(
  (planId: SupportedIapCheckoutPlan): void => {
    if (user?.id == null) {
      onOpenLogin();
      return;
    }

    onSelectCheckoutPlan(planId);
  },
  [user?.id, onOpenLogin, onSelectCheckoutPlan],
);
```

### `components/AuthModals.tsx`, `components/auth/authViewTypes.ts`

```typescript
import type { SupportedIapCheckoutPlan } from '@/services/payment/types';

interface AuthModalsProps {
  // ...existing props
  onUpgradePlan?: (planId: SupportedIapCheckoutPlan) => void;
}

export interface ProfileViewProps {
  // ...existing props
  onUpgradePlan?: (planId: SupportedIapCheckoutPlan) => void;
}
```

### `components/auth/ProfileView.tsx`

기존:

```typescript
const canUpgrade = !!onUpgradePlan && paidTier !== 'premium';
const handleUpgradeClick = () => {
  if (!canUpgrade || !onUpgradePlan) return;
  const nextPlan: 'pro' | 'premium' = paidTier === 'free' ? 'pro' : 'premium';
  onUpgradePlan(nextPlan);
};
```

교체:

```typescript
import { TOSS_IAP_FIXED_PLAN_ID } from '../../services/payment/types';

const canUpgrade = !!onUpgradePlan && paidTier === 'free';
const handleUpgradeClick = (): void => {
  if (!canUpgrade || !onUpgradePlan) {
    return;
  }

  onUpgradePlan(TOSS_IAP_FIXED_PLAN_ID);
};
```

검증 포인트:

- Free 사용자는 Profile에서 PRO CTA를 볼 수 있습니다.
- PRO 사용자는 Profile에서 Premium 업그레이드 CTA를 보지 않습니다.
- PRO 기간 연장은 `components/Pricing.tsx`의 PRO 카드 `extend` 경로에서만 다룹니다.
- `CheckoutPlanId` 전체 union을 받는 곳은 중앙 게이트뿐이며, 하위 결제 CTA props는 `SupportedIapCheckoutPlan`만 전달합니다.

## S3. IAP verify와 bridge 성공 계약 보강

### 목표

권한 지급이 끝나지 않은 상태를 프론트가 결제 성공으로 오인하지 않게 합니다. 서버는 처리 중/실패를 non-2xx로 반환하고, 프론트는 HTTP 성공만이 아니라 JSON 본문 `success === true`까지 확인해야 합니다. 또한 Toss IAP bridge 호출은 모두 동기 예외와 비동기 rejection이 같은 실패 경로로 수렴해야 합니다.

### `server/src/routes/payment.ts`

```typescript
import { readRequiredPositiveIntegerAmount } from '../utils/paymentPlanAmount';

const PAYMENT_FULFILLMENT_CONFLICT_STATUS = 409;
const PAYMENT_FULFILLMENT_ERROR_STATUS = 500;
const PAYMENT_CONFIG_ERROR_STATUS = 500;

function readRequiredPlanAmount(envKey: 'PLAN_AMOUNT_PRO'): number | null {
  return readRequiredPositiveIntegerAmount(process.env[envKey]);
}

function getConfiguredIapPlanAmount(planId: PaidPlanId): number | null {
  if (planId !== 'pro') {
    return null;
  }

  return readRequiredPlanAmount('PLAN_AMOUNT_PRO');
}
```

```typescript
const amountToRecord = getConfiguredIapPlanAmount(finalPlanId);
if (amountToRecord == null) {
  request.log.error(
    { orderId, planId: finalPlanId },
    '[IAP Verify] Missing plan amount',
  );
  return reply.code(PAYMENT_CONFIG_ERROR_STATUS).send({
    success: false,
    error: 'Payment configuration is invalid',
  });
}

const iapPlanAmounts = {
  ...PLAN_AMOUNTS,
  pro: amountToRecord,
};

const fulfillment = await fulfillPaidOrder({
  // ...existing fields
  amount: amountToRecord,
  planAmounts: iapPlanAmounts,
});

if (fulfillment.inProgress) {
  return reply.code(PAYMENT_FULFILLMENT_CONFLICT_STATUS).send({
    success: false,
    error: fulfillment.message || 'Transaction is already processing',
  });
}

if (!fulfillment.success) {
  return reply.code(PAYMENT_FULFILLMENT_ERROR_STATUS).send({
    success: false,
    error: fulfillment.message || 'Payment fulfillment failed',
  });
}

return reply.send({
  success: true,
  message: fulfillment.message,
});
```

### 가격 fallback 제거 적용 범위

유료 출시의 활성 Toss IAP 경로에서는 가격 fallback을 “표시용 안전망”으로도 사용하지 않습니다. 아래 파일들은 모두 동일한 양의 정수 검증을 사용하고, 값이 없거나 비정상이면 결제/지급 경로를 닫습니다.

- `constants/membership.ts`
- `server/src/routes/payment.ts`

각 파일은 `S0`의 런타임별 공유 유틸을 import해서 사용합니다. route, component 안에서 `Number(...)`, fallback 숫자, 정규식 검증을 새로 쓰지 않습니다.

B안에서는 기존 카드/Edge 결제 경로를 이번 릴리스 활성 경로로 보지 않습니다. `supabase/functions/payment-webhook/index.ts`, `supabase/functions/verify-payment/index.ts`, BFF `/payment/toss/verify`는 코드 리팩토링 대신 운영 라우팅/env/배포 설정에서 외부 결제 호출이 불가능함을 확인합니다.

검증 포인트:

- `PLAN_AMOUNT_PRO`와 `VITE_PLAN_AMOUNT_PRO`는 같은 정수 금액이어야 합니다.
- `PLAN_AMOUNT_PRO`가 없을 때 활성 BFF IAP route가 fallback 금액으로 처리하면 안 됩니다.
- 결제 CTA는 프론트 가격 env가 유효할 때만 열리고, 서버 지급은 서버 가격 env가 유효할 때만 실행됩니다.
- 기존 카드/Edge 경로가 운영에서 활성으로 확인되면 B안 전제가 깨지므로 출시 전 결제 CTA를 닫습니다.

### `services/payment/tossIapService.ts`

```typescript
interface IapVerifySuccessResponse {
  success: true;
}

function isIapVerifySuccessResponse(
  value: unknown,
): value is IapVerifySuccessResponse {
  return isRecord(value) && value.success === true;
}
```

```typescript
const verifyResult = await fetchJsonWithTimeout<null>(
  `${base}/payment/toss/iap-verify`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ orderId, planId, quantity }),
  },
  null,
  { context: { action: 'iap_verify', orderId, planId } },
);

return verifyResult.ok && isIapVerifySuccessResponse(verifyResult.data);
```

```typescript
const orderCallbacks = {
  processProductGrant: async ({ orderId }: TossIapBridgeOrderGrantParams) => {
    const isGranted = await verifyAndGrantProductOnServer(
      orderId,
      planId,
      quantity,
    );
    if (!isGranted) {
      settle({
        success: false,
        errorCode: 'PRODUCT_NOT_GRANTED_BY_PARTNER',
        rawMessage: 'server_grant_failed',
      });
      return false;
    }

    const completeResult = await wrapBridgeCall<unknown>(
      () => iap.completeProductGrant({ orderId }),
      null,
      { action: 'completeProductGrant', orderId },
    );
    if (!completeResult.ok) {
      settle({
        success: false,
        errorCode: 'PRODUCT_NOT_GRANTED_BY_PARTNER',
        rawMessage: normalizeErrorMessage(
          completeResult.error.cause,
          'complete_product_grant_failed',
        ),
      });
      return false;
    }

    settle({ success: true, orderId });
    return true;
  },
};

void (async () => {
  try {
    const cleanup = await Promise.resolve(
      iap.createOneTimePurchaseOrder({
        options: {
          sku,
          processProductGrant: orderCallbacks.processProductGrant,
        },
        onEvent: (event) => {
          if (event.type !== 'canceled') {
            return;
          }

          settle({
            success: false,
            cancel: true,
            errorCode: 'USER_CANCELED',
          });
        },
        onError: (error) => {
          settle(toTossIapResultFromError(error));
        },
      }),
    );
    void cleanup;
  } catch (error: unknown) {
    settle(toTossIapResultFromError(error));
  }
})();
```

검증 포인트:

- `PLAN_AMOUNT_PRO`가 없거나 0 이하/비정상 숫자/소수/상한 초과이면 서버는 fulfillment를 호출하지 않습니다.
- `fulfillment.inProgress`는 HTTP 409와 `success: false`를 반환합니다.
- `fulfillment.success === false`는 HTTP 500과 `success: false`를 반환합니다.
- 프론트는 HTTP 2xx만으로 성공 처리하지 않습니다.
- `success !== true`이면 `completeProductGrant`가 호출되지 않고 `PRODUCT_NOT_GRANTED_BY_PARTNER` 경로로 갑니다.
- `createOneTimePurchaseOrder`가 동기 예외를 던져도 처리되지 않은 예외로 새지 않고 `toTossIapResultFromError` 경로로 수렴합니다.

## S4. 결제 라우트 테스트

### 목표

`paymentFulfillment.test.ts`가 계산/중복 처리만 보는 한계를 보완합니다. `/payment/toss/iap-verify` 라우트가 실제로 인증, `toss_user_key`, Toss 주문 상태, SKU, fulfillment 처리 중/실패 응답을 검증하는지 테스트합니다.

### 신규 파일: `server/src/routes/payment.iapVerify.test.ts`

```typescript
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IAP_PRODUCTS } from '../services/iapConstants';

const mocks = vi.hoisted(() => ({
  mockAuthGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFulfillPaidOrder: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: unknown[]) => mocks.mockAuthGetUser(...args),
    },
    from: (...args: unknown[]) => mocks.mockFrom(...args),
    rpc: vi.fn(),
  },
}));

vi.mock('../services/paymentFulfillment', async () => {
  const actual = await vi.importActual<typeof import('../services/paymentFulfillment')>(
    '../services/paymentFulfillment',
  );

  return {
    ...actual,
    fulfillPaidOrder: (...args: unknown[]) => mocks.mockFulfillPaidOrder(...args),
  };
});

import { paymentRoutes } from './payment';

const IAP_VERIFY_PATH = '/payment/toss/iap-verify';
const { mockAuthGetUser, mockFrom, mockFulfillPaidOrder } = mocks;

function mockUserProfile(tossUserKey: string | null): void {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'user_profiles') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: (columns: string) => ({
        eq: (field: string, value: string) => ({
          single: async () => {
            if (columns !== 'toss_user_key' || field !== 'id' || value !== 'user-1') {
              throw new Error(`Unexpected user_profiles query: ${columns} ${field} ${value}`);
            }

            return {
              data: tossUserKey == null ? null : { toss_user_key: tossUserKey },
              error: null,
            };
          },
        }),
      }),
    };
  });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(paymentRoutes);
  return app;
}

describe('POST /payment/toss/iap-verify', () => {
  const originalFetch = global.fetch;
  const originalPlanAmountPro = process.env.PLAN_AMOUNT_PRO;

  beforeEach(() => {
    process.env.PLAN_AMOUNT_PRO = '5907';
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockFulfillPaidOrder.mockResolvedValue({
      success: true,
      message: 'ok',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPlanAmountPro == null) {
      delete process.env.PLAN_AMOUNT_PRO;
      return;
    }

    process.env.PLAN_AMOUNT_PRO = originalPlanAmountPro;
  });

  it('Authorization 헤더가 없으면 401을 반환한다', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(401);
    expect(mockFulfillPaidOrder).not.toHaveBeenCalled();
  });

  it('toss_user_key가 없으면 결제를 지급하지 않는다', async () => {
    mockUserProfile(null);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(mockFulfillPaidOrder).not.toHaveBeenCalled();
  });

  it('완료되지 않은 주문 상태는 거부한다', async () => {
    mockUserProfile('toss-user-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'PENDING',
          product: { id: IAP_PRODUCTS.PRO },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(mockFulfillPaidOrder).not.toHaveBeenCalled();
  });

  it('알 수 없는 SKU는 거부한다', async () => {
    mockUserProfile('toss-user-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'COMPLETED',
          product: { id: 'unknown-sku' },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(mockFulfillPaidOrder).not.toHaveBeenCalled();
  });

  it('fulfillment 처리 중이면 결제 성공으로 응답하지 않는다', async () => {
    mockUserProfile('toss-user-1');
    mockFulfillPaidOrder.mockResolvedValueOnce({
      success: false,
      inProgress: true,
      message: 'processing',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'COMPLETED',
          product: { id: IAP_PRODUCTS.PRO },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ success: false });
  });

  it.each([undefined, '', '0', '-1', 'abc', '5907.5', '1000001'])(
    'PLAN_AMOUNT_PRO=%s 이면 fulfillment를 호출하지 않는다',
    async (rawAmount: string | undefined) => {
      if (rawAmount == null) {
        delete process.env.PLAN_AMOUNT_PRO;
      } else {
        process.env.PLAN_AMOUNT_PRO = rawAmount;
      }

      mockUserProfile('toss-user-1');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: {
            status: 'COMPLETED',
            product: { id: IAP_PRODUCTS.PRO },
          },
        }),
      }) as unknown as typeof fetch;
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: IAP_VERIFY_PATH,
        headers: { authorization: 'Bearer token' },
        payload: { orderId: 'order-1' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ success: false });
      expect(mockFulfillPaidOrder).not.toHaveBeenCalled();
    },
  );

  it('PLAN_AMOUNT_PRO가 유효한 양의 정수이면 fulfillment 금액으로 사용한다', async () => {
    process.env.PLAN_AMOUNT_PRO = '5907';
    mockUserProfile('toss-user-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'COMPLETED',
          product: { id: IAP_PRODUCTS.PRO },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5907,
        planAmounts: expect.objectContaining({ pro: 5907 }),
      }),
    );
  });

  it('fulfillment 실패는 success:false non-2xx로 반환한다', async () => {
    mockUserProfile('toss-user-1');
    mockFulfillPaidOrder.mockResolvedValueOnce({
      success: false,
      message: 'fulfillment failed',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'COMPLETED',
          product: { id: IAP_PRODUCTS.PRO },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ success: false });
  });

  it('완료된 PRO SKU만 fulfillment를 호출한다', async () => {
    mockUserProfile('toss-user-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: {
          status: 'COMPLETED',
          product: { id: IAP_PRODUCTS.PRO },
        },
      }),
    }) as unknown as typeof fetch;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: IAP_VERIFY_PATH,
      headers: { authorization: 'Bearer token' },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });
    expect(mockFulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'order-1',
        userId: 'user-1',
        planId: 'pro',
        quantity: 1,
        payMethod: 'IAP',
        pgProvider: 'toss_iap',
      }),
    );
  });
});
```

검증 명령:

```powershell
npm --prefix server run test -- payment.iapVerify.test.ts
```

검증 포인트:

- `vi.mock` factory가 참조하는 mock 함수는 `vi.hoisted`로 선언해 Vitest hoisting 오류를 방지합니다.
- `beforeEach`는 `PLAN_AMOUNT_PRO`를 양수 고정값으로 설정해 다른 테스트가 운영 환경값에 의존하지 않게 합니다.
- `afterEach`는 `PLAN_AMOUNT_PRO`와 `global.fetch`를 원복해 테스트 간 오염을 막습니다.
- `PLAN_AMOUNT_PRO`의 누락, 빈 문자열, 0, 음수, 비숫자, 소수, 상한 초과는 모두 fulfillment 미호출로 검증합니다.

## S5. 프론트 IAP verify 응답 계약 테스트

### 목표

`/payment/toss/iap-verify`가 HTTP 2xx를 반환하더라도 JSON 본문이 `success: true`가 아니면 Toss `completeProductGrant`를 호출하지 않는지 검증합니다.

### 신규 파일: `services/payment/tossIapService.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockCreateOneTimePurchaseOrder: vi.fn(),
  mockCompleteProductGrant: vi.fn(),
  mockGetPendingOrders: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@apps-in-toss/web-framework', () => ({
  IAP: {
    createOneTimePurchaseOrder: (
      params: Parameters<typeof mocks.mockCreateOneTimePurchaseOrder>[0],
    ) => mocks.mockCreateOneTimePurchaseOrder(params),
    completeProductGrant: (
      params: Parameters<typeof mocks.mockCompleteProductGrant>[0],
    ) => mocks.mockCompleteProductGrant(params),
    getPendingOrders: () => mocks.mockGetPendingOrders(),
  },
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mocks.mockGetSession(),
    },
  },
}));

const {
  mockCreateOneTimePurchaseOrder,
  mockCompleteProductGrant,
  mockGetSession,
} = mocks;

const originalFetch = global.fetch;

let requestTossIAP: typeof import('./tossIapService').requestTossIAP;

function mockSession(): void {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'token' } },
  });
}

function mockIapSuccessEvent(orderId: string): void {
  mockCreateOneTimePurchaseOrder.mockImplementationOnce(
    (params: {
      options: {
        processProductGrant: (input: { orderId: string }) => Promise<boolean>;
      };
    }) => {
      void params.options.processProductGrant({ orderId }).catch(() => undefined);
      return () => undefined;
    },
  );
}

describe('requestTossIAP', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_RAILWAY_BFF_URL', 'https://bff.test');
    vi.clearAllMocks();
    ({ requestTossIAP } = await import('./tossIapService'));
    mockSession();
    mockCompleteProductGrant.mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('IAP verify 본문 success가 true가 아니면 지급 완료 처리하지 않는다', async () => {
    mockIapSuccessEvent('order-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;

    const result = await requestTossIAP('pro', 1);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PRODUCT_NOT_GRANTED_BY_PARTNER');
    expect(mockCompleteProductGrant).not.toHaveBeenCalled();
  });

  it('IAP verify 409 inProgress는 지급 완료 처리하지 않는다', async () => {
    mockIapSuccessEvent('order-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'processing' }),
    }) as unknown as typeof fetch;

    const result = await requestTossIAP('pro', 1);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PRODUCT_NOT_GRANTED_BY_PARTNER');
    expect(mockCompleteProductGrant).not.toHaveBeenCalled();
  });

  it('IAP verify success:true일 때만 지급 완료 처리한다', async () => {
    mockIapSuccessEvent('order-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;

    const result = await requestTossIAP('pro', 1);

    expect(result.success).toBe(true);
    expect(mockCompleteProductGrant).toHaveBeenCalledWith({ orderId: 'order-1' });
  });

  it('createOneTimePurchaseOrder 동기 예외는 안전한 실패로 수렴한다', async () => {
    mockCreateOneTimePurchaseOrder.mockImplementationOnce(() => {
      throw new Error('bridge failed');
    });

    const result = await requestTossIAP('pro', 1);

    expect(result.success).toBe(false);
    expect(mockCompleteProductGrant).not.toHaveBeenCalled();
  });
});
```

### `vitest.config.ts`

`services/payment/tossIapService.test.ts`가 개별 명령에서만 돌고 `npm test`에서 빠지면 출시 게이트가 자동화되지 않습니다. 기본 테스트 include에 `services/**/*.test.ts`를 포함합니다.

```typescript
include: [
  'utils/**/*.test.ts',
  'services/**/*.test.ts',
  '__tests__/**/*.test.ts',
  'components/**/*.test.tsx',
  'src/components/**/*.test.ts',
  'hooks/**/*.test.ts',
  'hooks/**/*.test.tsx',
],
```

검증 포인트:

- `completeProductGrant`는 서버 검증 성공 body가 `success: true`일 때만 호출됩니다.
- `{ ok: true, body: { success: true } }` 정상 경로에서는 `completeProductGrant`가 호출되고 성공 결과로 끝납니다.
- `success: false`, 409, 500, 네트워크 실패는 모두 `PRODUCT_NOT_GRANTED_BY_PARTNER` 또는 안전한 실패 경로로 끝납니다.
- `createOneTimePurchaseOrder` 동기 예외는 처리되지 않은 예외로 새지 않습니다.
- IAP 성공 이벤트 mock은 `processProductGrant` promise rejection을 명시적으로 catch해 테스트 unhandled rejection을 남기지 않습니다.
- `VITE_RAILWAY_BFF_URL`은 `tossIapService` 동적 import 전에 `vi.stubEnv`로 주입되어야 합니다.
- `services/payment/tossIapService.test.ts`는 `npm test` 기본 include에 포함되어야 합니다.
- 실패 후 `CheckoutModal`의 `isExecutingRef`와 loading이 해제되어 재시도 가능합니다.

## S6. 운영 DB RPC 확인 쿼리

### 목표

중복 지급 방지의 핵심인 `claim_order_processing`과 `orders.status = processing` 제약이 운영 DB에 실제로 배포됐는지 확인합니다.

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_order_processing';
```

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.orders'::regclass
  and conname = 'orders_status_check';
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name in ('pending_plan', 'pending_plan_effective_at');
```

통과 기준:

- 첫 번째 쿼리는 `claim_order_processing` 1행을 반환합니다.
- 두 번째 쿼리의 constraint definition에 `processing`이 포함됩니다.
- 세 번째 쿼리는 `pending_plan`, `pending_plan_effective_at` 2행을 반환합니다.

## S7. B안 비활성 결제 경로 운영 확인

### 목표

이번 릴리스는 Toss IAP만 활성 결제 경로입니다. 기존 카드 결제, BFF `/payment/toss/verify`, Supabase Edge `payment-webhook`, `verify-payment`는 코드 보강 범위가 아니라 운영 비활성 확인 대상으로 둡니다.

### 운영 확인 체크리스트

```markdown
- [ ] 운영 프론트에 카드/PortOne/Toss Payments 결제 CTA가 노출되지 않습니다.
- [ ] 운영 라우팅에서 `/payment/toss/verify`가 외부 결제 완료 경로로 사용되지 않습니다.
- [ ] Toss/PortOne 콘솔 webhook 또는 redirect가 Supabase Edge `payment-webhook`, `verify-payment`로 연결되어 있지 않습니다.
- [ ] 기존 카드/Edge 결제용 secret/env가 운영 결제 가능 상태로 배포되어 있지 않습니다.
- [ ] 위 항목 중 하나라도 실패하면 `VITE_ENABLE_IAP_CHECKOUT=false`로 결제 CTA를 닫고 출시합니다.
```

검증 포인트:

- 비활성 경로의 fallback 가격 제거는 이번 B안 릴리스 P0 코드 작업이 아닙니다.
- 단, 비활성 경로가 운영에서 호출 가능하면 즉시 P0 실패입니다.
- 추후 카드/Edge 경로를 다시 활성화하는 릴리스에서는 해당 경로의 가격 파서 단일화, `deno check`, webhook 계약 테스트를 별도 P0로 승격합니다.

## S8. 최소 검증 명령

```powershell
npm test
npm run typecheck
npx vitest run "utils/paymentPlanAmount.test.ts"
npm --prefix server run typecheck
npm --prefix server run build
npm --prefix server run test
npm --prefix server run test -- paymentPlanAmount.test.ts
npx vitest run "services/payment/tossIapService.test.ts"
npx vitest run "__tests__/modalLayoutContract.test.ts"
npx vitest run --config docs2/miniapp_modal_layout_vitest.config.ts
```

## 적용 순서

1. `S0`으로 가격 env 파서를 먼저 단일화합니다.
2. `S1`과 `S2`를 적용해 결제 오결제 위험을 제거합니다.
3. `S3`로 서버/프론트 성공 계약을 보강합니다.
4. `S4`, `S5` 테스트를 추가하고 실패하는 부분을 코드로 보강합니다.
5. `S6` 운영 DB 확인을 수행합니다.
6. `S7`로 기존 카드/BFF verify/Edge 결제 경로 비활성을 확인합니다.
7. `S8` 명령을 실행합니다.
8. 실제 Toss 미니앱 성공/취소/지급 실패 스모크를 수행합니다.
