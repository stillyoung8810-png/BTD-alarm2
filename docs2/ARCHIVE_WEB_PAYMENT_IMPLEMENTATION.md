# 웹 결제 구현 아카이브

> **목적**: 토스 미니앱 심사 정책에 따라 런타임 코드에서는 PortOne 등 외부 웹 결제 모듈을 제거하되, 향후 일반 웹 서비스 런칭 시 현재 구현을 소스 코드 레벨에서 복원할 수 있도록 보관합니다.  
> **중요**: 이 문서는 **아카이브 전용**입니다. 아래 스니펫은 토스 미니앱 배포 코드에 다시 남아 있으면 안 됩니다.

---

## 1. 현재 웹 결제 구현 파일 맵

| 구분 | 파일 | 역할 |
|------|------|------|
| 체크아웃 UI | `components/CheckoutModal.tsx` | 웹 결제 수단 그리드, 플랜 선택, 수량 선택, PortOne/IAP 분기 |
| 결제 타입 | `services/payment/types.ts` | `PayMethod`, `EasyPayProvider`, `PAY_METHOD_OPTIONS`, `PaymentRequest` |
| 외부 PG 서비스 | `services/payment/paymentService.ts` | PortOne SDK 로드, 결제 요청, 서버 검증, 웹 환불 |
| 결제 문구 | `constants/paymentCheckoutMessages.ts` | 웹 결제 전용 라벨 (`PAYMENT_METHOD_HEADING`, `PAY_METHOD_LABELS`, `PAY_NOW` 등) |

---

## 2. 웹 결제 타입 정의 원본

**파일**: `services/payment/types.ts`

```typescript
export type PayMethod =
  | 'CARD'
  | 'VIRTUAL_ACCOUNT'
  | 'TRANSFER'
  | 'MOBILE'
  | 'EASY_PAY';

export interface PayMethodOption {
  id: PayMethod;
  icon: string;
}

export const PAY_METHOD_OPTIONS: PayMethodOption[] = [
  { id: 'CARD', icon: 'CreditCard' },
  { id: 'VIRTUAL_ACCOUNT', icon: 'Landmark' },
  { id: 'TRANSFER', icon: 'ArrowLeftRight' },
  { id: 'MOBILE', icon: 'Smartphone' },
  { id: 'EASY_PAY', icon: 'Wallet' },
];

export type EasyPayProvider = 'KAKAOPAY' | 'NAVERPAY' | 'TOSSPAY';

export interface PaymentRequest {
  orderName: string;
  totalAmount: number;
  customerEmail?: string;
  customerId?: string;
  payMethod: PayMethod;
  easyPayProvider?: EasyPayProvider;
  planId: CheckoutPlanId;
  quantity?: number;
}

export interface PaymentResult {
  success: boolean;
  paymentId: string;
  transactionType?: string;
  txId?: string;
  code?: string;
  message?: string;
}

export interface OrderRecord {
  id?: string;
  user_id: string;
  payment_id: string;
  plan_id: string;
  order_name: string;
  amount: number;
  currency: string;
  pay_method: PayMethod;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  pg_provider: string;
  pg_tx_id?: string;
  created_at?: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
}
```

---

## 3. `CheckoutModal.tsx`의 웹 결제 진입점 원본

### 3.1 웹 결제 import / 아이콘 매핑 / 상태

```typescript
import {
  PAY_METHOD_OPTIONS,
  PLAN_DAYS_PER_UNIT,
  QUANTITY_MAX,
  DEFAULT_QUANTITY,
  TOSS_IAP_FIXED_PLAN_ID,
  TOSS_IAP_FIXED_QUANTITY,
  type PayMethod,
  type EasyPayProvider,
  type CheckoutPlanId,
} from '../services/payment/types';
import type { PaymentRequest } from '../services/payment/types';
import { requestPaymentWithServerVerify } from '../services/payment/paymentService';

const METHOD_ICON_MAP: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard size={20} />,
  Landmark: <Landmark size={20} />,
  ArrowLeftRight: <ArrowLeftRight size={20} />,
  Smartphone: <Smartphone size={20} />,
  Wallet: <Wallet size={20} />,
};

const [selectedPlanId, setSelectedPlanId] = useState<CheckoutPlanId>(plan.id);
const [payMethod, setPayMethod] = useState<PayMethod>('CARD');
const [quantity, setQuantity] = useState<number>(DEFAULT_QUANTITY);
const [isProcessing, setIsProcessing] = useState(false);
```

### 3.2 웹/토스 분기 원본

```typescript
const effectivePlanId: CheckoutPlanId = isInTossApp
  ? TOSS_IAP_FIXED_PLAN_ID
  : selectedPlanId;

const effectiveQuantity = isInTossApp
  ? TOSS_IAP_FIXED_QUANTITY
  : quantity;

const isPremiumComingSoon = !isInTossApp && effectivePlanId === 'premium';
```

이 구조 때문에 당시 체크아웃은 아래 두 흐름을 모두 품고 있었습니다.

- `isInTossApp === true` -> Toss IAP 고정 플랜/고정 수량
- `isInTossApp === false` -> 일반 웹 결제(플랜 선택, 수량 선택, 결제 수단 선택, PortOne 요청)

---

## 4. 웹 결제 요청 생성 / 실행 원본

### 4.1 PortOne 요청 바디 조립

```typescript
const buildPayReq = useCallback((): PaymentRequest => {
  const safePlanLabel = activePlan?.label ?? messages.UNKNOWN_PLAN_LABEL;
  const baseRequest: PaymentRequest = {
    orderName: `${safePlanLabel} ${messages.DURATION_PACKAGE_LABEL(PLAN_DAYS_PER_UNIT * effectiveQuantity)}`,
    totalAmount,
    customerEmail,
    customerId,
    payMethod,
    planId: effectivePlanId,
    quantity: effectiveQuantity,
  };

  if (payMethod === 'EASY_PAY') {
    baseRequest.easyPayProvider = 'KAKAOPAY';
  }

  return baseRequest;
}, [
  activePlan?.label,
  messages.UNKNOWN_PLAN_LABEL,
  messages.DURATION_PACKAGE_LABEL,
  effectiveQuantity,
  totalAmount,
  customerEmail,
  customerId,
  payMethod,
  effectivePlanId,
  lang,
]);
```

### 4.2 PortOne 결제 + 서버 검증 핸들러

```typescript
const handlePortOnePay = useCallback(async (payReq: PaymentRequest) => {
  const result = await requestPaymentWithServerVerify(payReq);

  if (result.success && result.verification?.success) {
    return { ok: true, needRefresh: true };
  }

  if (!result.success) {
    return {
      ok: false,
      cancel: result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL',
      message: result.message,
      configMissing: result.code === 'CONFIG_MISSING',
    };
  }

  return { ok: false, message: result.verification?.error, needRefresh: true };
}, []);
```

### 4.3 IAP / 웹 결제 공존형 `handlePay`

```typescript
const handlePay = useCallback(async () => {
  if (isProcessing || isPremiumComingSoon) {
    return;
  }

  if (isInvalidPrice) {
    openCheckoutNotice(PAYMENT_CHECKOUT_MESSAGES[lang].ERR_INVALID_PRICE, 'none');
    return;
  }

  const msgs = PAYMENT_CHECKOUT_MESSAGES[lang];
  setIsProcessing(true);

  try {
    const outcome = isInTossApp
      ? await handleTossIapPay()
      : await handlePortOnePay(buildPayReq());

    if (outcome.cancel) {
      return;
    }

    if (outcome.ok) {
      openCheckoutNotice(msgs.SUCCESS, 'success_dismiss');
      return;
    }

    let extractedMessage: string | undefined;
    if ('rawMessage' in outcome && typeof outcome.rawMessage === 'string') {
      extractedMessage = outcome.rawMessage;
    } else if ('message' in outcome && typeof outcome.message === 'string') {
      extractedMessage = outcome.message;
    }

    let alertMessage = msgs.UNKNOWN;
    if ('configMissing' in outcome && outcome.configMissing) {
      alertMessage = msgs.CONFIG_MISSING;
    } else if ('errorCode' in outcome && outcome.errorCode) {
      alertMessage = getTossIapAlertMessage(
        msgs,
        outcome.errorCode as TossIapErrorCode,
        extractedMessage,
      );
    } else if ('needRefresh' in outcome && outcome.needRefresh) {
      alertMessage = msgs.VERIFY_FAILED(extractedMessage ?? '');
    } else {
      alertMessage = msgs.FAILED(extractedMessage ?? msgs.UNKNOWN);
    }

    const afterAck = outcome.needRefresh ? 'error_refresh_dismiss' : 'none';
    openCheckoutNotice(alertMessage, afterAck);
  } catch (error) {
    console.error('[Payment Error]', error);
    openCheckoutNotice(msgs.PROCESSING_ERROR, 'none');
  } finally {
    setIsProcessing(false);
  }
}, [
  isProcessing,
  isPremiumComingSoon,
  isInvalidPrice,
  lang,
  isInTossApp,
  handleTossIapPay,
  handlePortOnePay,
  buildPayReq,
  onPaymentSuccess,
  onClose,
  openCheckoutNotice,
]);
```

---

## 5. `CheckoutModal.tsx` 웹 결제 UI 원본

### 5.1 웹 전용 플랜 토글

```typescript
{!isInTossApp && (
  <div className="flex justify-center">
    <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
      {(['pro', 'premium'] as const).map((id) => {
        const isSelected = selectedPlanId === id;
        const isPro = id === 'pro';
        let toggleClass = 'text-slate-500 dark:text-slate-300';

        if (isSelected && isPro) {
          toggleClass = 'bg-blue-600 text-white';
        } else if (isSelected && !isPro) {
          toggleClass = 'bg-amber-400 text-black';
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedPlanId(id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${toggleClass}`}
          >
            {id.toUpperCase()}
          </button>
        );
      })}
    </div>
  </div>
)}
```

### 5.2 웹 전용 수량 선택 UI

```typescript
{isInTossApp ? (
  <div
    className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4"
    role="group"
    aria-labelledby="toss-fixed-duration-label"
  >
    <p
      id="toss-fixed-duration-label"
      className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2"
    >
      {messages.TOSS_FIXED_DURATION_LABEL}
    </p>
    <p className="text-sm font-bold text-slate-900 dark:text-white">
      {messages.TOSS_FIXED_DURATION_VALUE(totalDays)}
    </p>
  </div>
) : (
  <div className="mb-4">
    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
      {messages.DURATION_LABEL}
    </label>
    <select
      value={quantity}
      onChange={(event) => setQuantity(Number(event.target.value))}
      className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium"
      aria-label={messages.DURATION_SELECT_ARIA}
    >
      {Array.from({ length: QUANTITY_MAX }, (_, index) => index + 1).map((count) => (
        <option key={count} value={count}>
          {messages.QUANTITY_OPTION(count, PLAN_DAYS_PER_UNIT * count)}
        </option>
      ))}
    </select>
  </div>
)}
```

### 5.3 웹 전용 결제 수단 선택 UI

```typescript
{!isInTossApp && (
  <div>
    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
      {messages.PAYMENT_METHOD_HEADING}
    </h3>
    <div className="grid grid-cols-3 gap-2">
      {PAY_METHOD_OPTIONS.map((opt) => {
        const isSelected = payMethod === opt.id;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPayMethod(opt.id)}
            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-200 text-center ${
              isSelected
                ? styles.methodSelected
                : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <span className={isSelected ? styles.methodIcon : 'text-slate-500 dark:text-slate-400'}>
              {METHOD_ICON_MAP[opt.icon] ?? <CreditCard size={20} />}
            </span>
            <span
              className={`text-[10px] font-bold leading-tight ${
                isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {messages.PAY_METHOD_LABELS[opt.id]}
            </span>
          </button>
        );
      })}
    </div>
  </div>
)}
```

### 5.4 웹 전용 CTA 원본

```typescript
{isInTossApp ? (
  <TDSButton
    fullWidth
    loading={isProcessing}
    disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
    onClick={handlePay}
  >
    {isProcessing ? messages.PROCESSING : primaryCtaLabel}
  </TDSButton>
) : (
  <button
    type="button"
    onClick={handlePay}
    disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
    className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${styles.button}`}
  >
    {isProcessing ? (
      <>
        <Loader2 size={18} className="animate-spin" />
        {messages.PROCESSING}
      </>
    ) : (
      <>
        <Zap size={18} />
        {primaryCtaLabel}
        <ArrowRight size={16} />
      </>
    )}
  </button>
)}
```

---

## 6. `paymentService.ts` PortOne 서비스 원본

### 6.1 SDK 로드 / 매핑 / 결제 요청

```typescript
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string;
const NICEPAY_CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string;
const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

let portOneInstance: typeof window.PortOne | null = null;
let loadPromise: Promise<typeof window.PortOne> | null = null;

export function isPortOneConfigured(): boolean {
  return Boolean(STORE_ID?.trim() && NICEPAY_CHANNEL_KEY?.trim());
}

export async function loadPortOneSDK(): Promise<typeof window.PortOne> {
  if (portOneInstance) return portOneInstance;

  if (window.PortOne) {
    portOneInstance = window.PortOne;
    return portOneInstance;
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<typeof window.PortOne>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PORTONE_SDK_URL;
    script.async = true;

    script.onload = () => {
      if (window.PortOne) {
        portOneInstance = window.PortOne;
        resolve(portOneInstance);
      } else {
        reject(new Error('포트원 SDK 로드 후 window.PortOne을 찾을 수 없습니다.'));
      }
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('포트원 SDK 스크립트 로드에 실패했습니다.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

function mapPayMethodToPortOne(method: PayMethod): string {
  const map: Record<PayMethod, string> = {
    CARD: 'CARD',
    VIRTUAL_ACCOUNT: 'VIRTUAL_ACCOUNT',
    TRANSFER: 'TRANSFER',
    MOBILE: 'MOBILE',
    EASY_PAY: 'EASY_PAY',
  };

  return map[method] ?? 'CARD';
}

function generatePaymentId(): string {
  return `order_${crypto.randomUUID()}`;
}
```

### 6.2 PortOne 결제창 호출 원본

```typescript
export async function requestPayment(req: PaymentRequest): Promise<PaymentResult> {
  const paymentId = generatePaymentId();

  if (isTossApp()) {
    return {
      success: false,
      paymentId,
      code: 'IAP_ONLY',
      message: '토스 앱에서는 인앱결제(IAP) 전용 경로만 사용할 수 있습니다.',
    };
  }

  if (!STORE_ID?.trim() || !NICEPAY_CHANNEL_KEY?.trim()) {
    return {
      success: false,
      paymentId,
      code: 'CONFIG_MISSING',
      message: '결제 환경이 설정되지 않았습니다. (Store ID / Channel Key가 없습니다. 배포 환경 변수 확인 필요)',
    };
  }

  const PortOne = await loadPortOneSDK();

  const portOneRequest: Record<string, unknown> = {
    storeId: STORE_ID,
    channelKey: NICEPAY_CHANNEL_KEY,
    paymentId,
    orderName: req.orderName,
    totalAmount: req.totalAmount,
    currency: 'CURRENCY_KRW',
    payMethod: mapPayMethodToPortOne(req.payMethod),
    customer: {
      ...(req.customerEmail ? { email: req.customerEmail } : {}),
      ...(req.customerId ? { customerId: req.customerId } : {}),
    },
    customData: JSON.stringify({
      userId: req.customerId,
      planId: req.planId,
      quantity: req.quantity ?? 1,
    }),
  };

  if (req.payMethod === 'EASY_PAY' && req.easyPayProvider) {
    portOneRequest.easyPay = {
      easyPayProvider: req.easyPayProvider,
    };
  }

  try {
    const response = await PortOne.requestPayment(portOneRequest);

    if (response.code != null) {
      return {
        success: false,
        paymentId,
        code: response.code,
        message: response.message ?? '결제가 취소되었거나 실패했습니다.',
      };
    }

    return {
      success: true,
      paymentId,
      transactionType: response.transactionType,
      txId: response.txId,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '알 수 없는 결제 오류';
    return {
      success: false,
      paymentId,
      code: 'SDK_ERROR',
      message: msg,
    };
  }
}
```

### 6.3 결제 성공 후 서버 검증 원본

```typescript
export interface RequestPaymentWithVerifyResult {
  success: boolean;
  paymentId: string;
  verification?: VerifyPaymentResult;
  code?: string;
  message?: string;
}

export async function requestPaymentWithServerVerify(
  req: PaymentRequest,
): Promise<RequestPaymentWithVerifyResult> {
  const result = await requestPayment(req);

  if (!result.success) {
    return {
      success: false,
      paymentId: result.paymentId,
      code: result.code,
      message: result.message,
    };
  }

  const verification = await verifyPaymentOnServer(result.paymentId, req.planId, req.quantity);
  return {
    success: verification.success,
    paymentId: result.paymentId,
    verification,
  };
}

export interface VerifyPaymentResult {
  success: boolean;
  message?: string;
  subscription?: {
    tier: string;
    status: string;
    expiresAt: string;
  };
  error?: string;
}

export async function verifyPaymentOnServer(
  paymentId: string,
  planId: string,
  quantity?: number,
): Promise<VerifyPaymentResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '인증 세션이 없습니다. 다시 로그인해주세요.' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ paymentId, planId, ...(quantity != null ? { quantity } : {}) }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data.error ?? '결제 검증에 실패했습니다.',
      };
    }

    return {
      success: true,
      message: data.message,
      subscription: data.subscription,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '결제 검증 중 네트워크 오류';
    return { success: false, error: msg };
  }
}
```

---

## 7. 웹 결제 문구 원본

**파일**: `constants/paymentCheckoutMessages.ts`

```typescript
import type { PayMethod } from '../services/payment/types';

export interface PaymentCheckoutMessageSet {
  CONFIG_MISSING: string;
  DURATION_LABEL: string;
  DURATION_SELECT_ARIA: string;
  FAILED: (message: string) => string;
  PAYMENT_METHOD_HEADING: string;
  PAY_METHOD_LABELS: Record<PayMethod, string>;
  PAY_NOW: string;
  QUANTITY_OPTION: (count: number, days: number) => string;
  VERIFY_FAILED: (error: string) => string;
  // ... 기존 IAP/공통 메시지 생략
}
```

```typescript
ko: {
  DURATION_LABEL: '이용 기간 (개수)',
  DURATION_SELECT_ARIA: '이용권 개수 선택',
  PAY_NOW: '지금 결제하기',
  VERIFY_FAILED: (error) =>
    `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${error})`,
  CONFIG_MISSING: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
  QUANTITY_OPTION: (count, days) => `${count}개 (${days}일)`,
  PAYMENT_METHOD_HEADING: '결제 수단 선택',
  PAY_METHOD_LABELS: {
    CARD: '신용카드',
    VIRTUAL_ACCOUNT: '가상계좌',
    TRANSFER: '계좌이체',
    MOBILE: '휴대폰',
    EASY_PAY: '간편결제',
  },
}
```

```typescript
en: {
  DURATION_LABEL: 'Duration (quantity)',
  DURATION_SELECT_ARIA: 'Select quantity',
  PAY_NOW: 'Pay Now',
  VERIFY_FAILED: (error) =>
    `Payment succeeded but verification failed. It will be reflected shortly or contact support.\n(${error})`,
  CONFIG_MISSING: 'Payment is not configured. Please contact support.',
  QUANTITY_OPTION: (count, days) => `${count} (${days} days)`,
  PAYMENT_METHOD_HEADING: 'Payment Method',
  PAY_METHOD_LABELS: {
    CARD: 'Credit Card',
    VIRTUAL_ACCOUNT: 'Virtual Account',
    TRANSFER: 'Bank Transfer',
    MOBILE: 'Mobile',
    EASY_PAY: 'Easy Pay',
  },
}
```

---

## 8. 향후 웹 서비스 복원 순서

1. `services/payment/types.ts`에 `PayMethod`, `EasyPayProvider`, `PAY_METHOD_OPTIONS`, `PaymentRequest`, `PaymentResult`, `OrderRecord`를 복원합니다.
2. `constants/paymentCheckoutMessages.ts`에 웹 결제 전용 키(`PAYMENT_METHOD_HEADING`, `PAY_METHOD_LABELS`, `PAY_NOW`, `DURATION_LABEL`, `DURATION_SELECT_ARIA`, `QUANTITY_OPTION`, `CONFIG_MISSING`, `VERIFY_FAILED`)를 복원합니다.
3. `services/payment/paymentService.ts`에 PortOne SDK 로더, `requestPayment`, `requestPaymentWithServerVerify`, `verifyPaymentOnServer`를 복원합니다.
4. `components/CheckoutModal.tsx`에 웹 플랜 토글, 수량 선택, 결제 수단 그리드, 웹 CTA, `buildPayReq`, `handlePortOnePay`, IAP/웹 공존형 `handlePay`를 복원합니다.
5. 일반 웹 서비스 배포에서만 PortOne 환경 변수(`VITE_PORTONE_STORE_ID`, `VITE_PORTONE_CHANNEL_KEY`)를 다시 주입합니다.

---

## 9. 문서 이력

| 일자 | 내용 |
|------|------|
| 2026-04-01 | 토스 심사 정책 대응용 웹 결제 구현 아카이브 초안 작성 |
