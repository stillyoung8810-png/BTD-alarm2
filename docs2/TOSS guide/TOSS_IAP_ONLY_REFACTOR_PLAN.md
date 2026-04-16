# Toss IAP 100% 단일화 리팩토링 계획서

> **목적**: 토스 심사 정책에 따라 외부 웹 결제 모듈(PortOne, 신용카드, 계좌이체, 간편결제 등) 관련 런타임 코드를 **100% 제거**하고, 체크아웃을 Toss IAP 단일 경로로 평탄화합니다.  
> **전제**: 이 문서는 **계획서**이며, 실제 `.ts`/`.tsx` 수정은 별도 승인 후 진행합니다.  
> **원칙**: `Hard Delete`, `Zero Dead Code`, `Fail Closed`.

---

## 1. Hard Delete 범위

### 1.1 반드시 제거할 심볼

- `requestPaymentWithServerVerify`
- `PaymentRequest`
- `PaymentResult`
- `PayMethod`
- `EasyPayProvider`
- `PAY_METHOD_OPTIONS`
- `METHOD_ICON_MAP`
- `handlePortOnePay`
- `buildPayReq`
- `selectedPlanId`
- `payMethod`
- `quantity`
- `QUANTITY_MAX`
- `DEFAULT_QUANTITY`
- `PAYMENT_METHOD_HEADING`
- `PAY_METHOD_LABELS`
- `PAY_NOW`
- `DURATION_LABEL`
- `DURATION_SELECT_ARIA`
- `QUANTITY_OPTION`
- `VERIFY_FAILED`
- `CONFIG_MISSING`
- `PREMIUM_COMING_SOON`
- `PREMIUM_UNAVAILABLE_DETAIL`
- `PortOne`
- `VITE_PORTONE_STORE_ID`
- `VITE_PORTONE_CHANNEL_KEY`

### 1.2 파일 단위 대상

| 파일 | 조치 |
|------|------|
| `components/CheckoutModal.tsx` | IAP 전용으로 평탄화 |
| `services/payment/types.ts` | 웹 결제 타입/상수 제거 |
| `constants/paymentCheckoutMessages.ts` | 웹 결제 문구 제거 |
| `services/payment/paymentService.ts` | PortOne 모듈 코드 제거 |
| `App.tsx` | `CheckoutModal`의 `plan` prop 제거 |
| `components/AuthModals.tsx` | `cancelSubscription` 전달 제거 |
| `components/auth/authViewTypes.ts` | `cancelSubscription` prop 제거 |
| `components/auth/ProfileView.tsx` | 웹 환불 처리 함수 제거 |
| `components/auth/RefundGuideController.tsx` | 웹 환불 비동기 분기 제거 |

---

## 2. `components/CheckoutModal.tsx` 리팩토링

### 2.1 import / helper / props 평탄화

```typescript
// [수정 전]
import React, { useState, useCallback, useRef } from 'react';
import {
  X,
  Star,
  Crown,
  Check,
  CreditCard,
  Landmark,
  ArrowLeftRight,
  Smartphone,
  Wallet,
  Zap,
  ArrowRight,
  Shield,
  Loader2,
} from 'lucide-react';
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
import { requestTossIAP } from '../services/payment/tossIapService';
import { useTossApp } from '../contexts/TossAppContext';

function getPrimaryCheckoutCtaLabel(
  m: PaymentCheckoutMessageSet,
  isPremiumComingSoon: boolean,
  isInTossApp: boolean,
): string {
  if (isPremiumComingSoon) {
    return m.PREMIUM_COMING_SOON;
  }
  if (isInTossApp) {
    return m.PAY;
  }
  return m.PAY_NOW;
}

const METHOD_ICON_MAP: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard size={20} />,
  Landmark: <Landmark size={20} />,
  ArrowLeftRight: <ArrowLeftRight size={20} />,
  Smartphone: <Smartphone size={20} />,
  Wallet: <Wallet size={20} />,
};

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ko' | 'en';
  plan: {
    id: 'pro' | 'premium';
    label: string;
    subtitle: string;
    price: number;
    priceFormatted: string;
    features: string[];
  };
  customerEmail?: string;
  customerId?: string;
  onPaymentSuccess?: () => void;
}
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
import React, { useState, useCallback, useRef } from 'react';
import {
  X,
  Star,
  Check,
  Shield,
} from 'lucide-react';
import {
  PLAN_DAYS_PER_UNIT,
  TOSS_IAP_FIXED_PLAN_ID,
  TOSS_IAP_FIXED_QUANTITY,
} from '../services/payment/types';
import { requestTossIAP } from '../services/payment/tossIapService';
import { TDSModal, TDSButton } from './tds';
import { getServicePeriodDisplay } from '../utils/dateUtils';
import { MembershipConfig } from '../constants/membership';
import {
  PAYMENT_CHECKOUT_MESSAGES,
  PAYMENT_CHECKOUT_REFUND_EMAIL,
  type TossIapErrorCode,
} from '../constants/paymentCheckoutMessages';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { TdsAlertDialog } from './tds-adapter/TdsAlertDialog';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ko' | 'en';
  customerEmail?: string;
  customerId?: string;
  onPaymentSuccess?: () => void;
}
```

### 2.2 `ModalWrapper`를 Toss 전용으로 고정

```typescript
// [수정 전]
function ModalWrapper({
  children,
  open,
  onClose,
  useToss,
  closeLabel,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  useToss: boolean;
  closeLabel: string;
}) {
  const handleBackdropKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClose();
    }
  };

  if (useToss) {
    return <TDSModal open={open} onClose={onClose}>{children}</TDSModal>;
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
        role="button"
        tabIndex={0}
        aria-label={closeLabel}
        onClick={onClose}
        onKeyDown={handleBackdropKeyDown}
      />
      <div className="relative w-full max-w-md bg-white dark:bg-[#0E1525] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  );
}
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
function ModalWrapper({
  children,
  open,
  onClose,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return <TDSModal open={open} onClose={onClose}>{children}</TDSModal>;
}
```

### 2.3 상태 / 플랜 계산 평탄화

**리뷰 반영 (동시 실행·브릿지 오류)**

- `isProcessing`만으로 중복 클릭을 막으면, React state 갱신이 배치되기 전 **같은 틱/연속 프레임**에서 `handlePay`가 두 번 진입해 IAP가 이중 호출될 수 있습니다. **`useRef` 기반 동기 뮤텍스**(`isExecutingRef`)로 즉시 차단합니다. (시니어 리뷰 가이드 **Rule 11: 동기 뮤텍스**)
- 브릿지/SDK 래퍼는 동기 `throw`나 비정형 thenable이 섞일 수 있으므로 **`await Promise.resolve(handleTossIapPay())`** 로 정규화해 `try/catch`로 흡수합니다. (시니어 리뷰 가이드 **Rule 11: 브릿지 호출 정규화**)

```typescript
// [수정 전]
const { isInTossApp } = useTossApp();
const [selectedPlanId, setSelectedPlanId] = useState<CheckoutPlanId>(plan.id);
const [payMethod, setPayMethod] = useState<PayMethod>('CARD');
const [quantity, setQuantity] = useState<number>(DEFAULT_QUANTITY);
const [isProcessing, setIsProcessing] = useState(false);

const proCfg = MembershipConfig.byType.pro;
const premiumCfg = MembershipConfig.byType.premium;

const planMap: Record<CheckoutPlanId, CheckoutPlanRow> = {
  pro: {
    id: 'pro',
    label: proCfg.displayName,
    subtitle: proCfg.subtitle[lk],
    price: proCfg.rawAmount,
    priceFormatted: formatPriceKRW(proCfg.rawAmount),
    features: proCfg.features[lk],
  },
  premium: {
    id: 'premium',
    label: premiumCfg.displayName,
    subtitle: premiumCfg.subtitle[lk],
    price: premiumCfg.rawAmount,
    priceFormatted: formatPriceKRW(premiumCfg.rawAmount),
    features: premiumCfg.features[lk],
  },
};

const effectivePlanId: CheckoutPlanId = isInTossApp
  ? TOSS_IAP_FIXED_PLAN_ID
  : selectedPlanId;

const effectiveQuantity = isInTossApp
  ? TOSS_IAP_FIXED_QUANTITY
  : quantity;

const activePlanCandidate = planMap[effectivePlanId];
const activePlan = activePlanCandidate ?? planMap[TOSS_IAP_FIXED_PLAN_ID];
const isPremiumComingSoon = !isInTossApp && effectivePlanId === 'premium';
const primaryCtaLabel = getPrimaryCheckoutCtaLabel(
  messages,
  isPremiumComingSoon,
  isInTossApp,
);
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
const lk: 'ko' | 'en' = lang;
const [isProcessing, setIsProcessing] = useState(false);
const isExecutingRef = useRef(false); // Rule 11: 동기 뮤텍스 (더블 서밋 방지)

const proCfg = MembershipConfig.byType[TOSS_IAP_FIXED_PLAN_ID];
const activePlan = {
  id: TOSS_IAP_FIXED_PLAN_ID,
  label: proCfg.displayName,
  subtitle: proCfg.subtitle[lk],
  price: proCfg.rawAmount,
  priceFormatted: formatPriceKRW(proCfg.rawAmount),
  features: proCfg.features[lk],
};

const effectiveQuantity = TOSS_IAP_FIXED_QUANTITY;
const totalDays = PLAN_DAYS_PER_UNIT * effectiveQuantity;
const totalAmount = calculateSafeTotalAmountKRW(activePlan.price, effectiveQuantity);
const totalFormatted = formatPriceKRW(totalAmount);
const isInvalidPrice = totalAmount <= 0;
```

### 2.4 PortOne 요청 생성 / 실행 삭제

```typescript
// [수정 전]
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

```typescript
// [수정 후 (적용될 실제 스니펫)]
const handleTossIapPay = useCallback(async () => {
  const result = await requestTossIAP(TOSS_IAP_FIXED_PLAN_ID, TOSS_IAP_FIXED_QUANTITY);

  if (!result.success) {
    return {
      ok: false as const,
      cancel: result.cancel,
      errorCode: result.errorCode,
      rawMessage: result.rawMessage,
    };
  }

  return { ok: true as const };
}, []);
```

### 2.5 `handlePay`를 IAP 단일 흐름으로 단순화

```typescript
// [수정 전]
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

```typescript
// [수정 후 (적용될 실제 스니펫)]
const handlePay = useCallback(async () => {
  // 1. 동기 뮤텍스 (Rule 11) — state 배치 전 재진입 차단
  if (isExecutingRef.current) {
    return;
  }

  if (isInvalidPrice) {
    openCheckoutNotice(PAYMENT_CHECKOUT_MESSAGES[lang].ERR_INVALID_PRICE, 'none');
    return;
  }

  // 2. Lock 획득
  isExecutingRef.current = true;
  setIsProcessing(true);
  const msgs = PAYMENT_CHECKOUT_MESSAGES[lang];

  try {
    // 3. 브릿지 호출 정규화 (Rule 11) — thenable/동기 throw → catch로 수렴
    const outcome = await Promise.resolve(handleTossIapPay());

    if (outcome.cancel) {
      return;
    }

    if (outcome.ok) {
      openCheckoutNotice(msgs.SUCCESS, 'success_dismiss');
      return;
    }

    openCheckoutNotice(
      getTossIapAlertMessage(
        msgs,
        outcome.errorCode as TossIapErrorCode | undefined,
        outcome.rawMessage,
      ),
      'none',
    );
  } catch (error) {
    console.error('[Payment Error]', error);
    openCheckoutNotice(msgs.PROCESSING_ERROR, 'none');
  } finally {
    // 4. Lock 해제
    isExecutingRef.current = false;
    setIsProcessing(false);
  }
}, [
  isInvalidPrice,
  lang,
  handleTossIapPay,
  openCheckoutNotice,
]);
```

### 2.6 UI에서 웹 결제 영역 전체 삭제

```tsx
// [수정 전]
{!isInTossApp && (
  <div className="flex justify-center">
    <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
      {(['pro', 'premium'] as const).map((id) => {
        // ...
      })}
    </div>
  </div>
)}

{isInTossApp ? (
  <div className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
    <p id="toss-fixed-duration-label" className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
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
    <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
      {Array.from({ length: QUANTITY_MAX }, (_, index) => index + 1).map((count) => (
        <option key={count} value={count}>
          {messages.QUANTITY_OPTION(count, PLAN_DAYS_PER_UNIT * count)}
        </option>
      ))}
    </select>
  </div>
)}

{!isInTossApp && (
  <div>
    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
      {messages.PAYMENT_METHOD_HEADING}
    </h3>
    <div className="grid grid-cols-3 gap-2">
      {PAY_METHOD_OPTIONS.map((opt) => {
        // ...
      })}
    </div>
  </div>
)}

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

{isPremiumComingSoon && (
  <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 text-center">
    {messages.PREMIUM_UNAVAILABLE_DETAIL}
  </p>
)}
```

```tsx
// [수정 후 (적용될 실제 스니펫)]
<div className={`p-5 rounded-2xl border ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].card}`}>
  <div className="flex items-center gap-3 mb-4">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].iconBg}`}>
      <Star size={20} className={PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].icon} />
    </div>
    <div>
      <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">
        {messages.PLAN_NAME_WITH_SUFFIX(activePlan.label)}
      </p>
      <p className={`text-xs font-semibold ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].subtitle}`}>
        {messages.DURATION_PACKAGE_LABEL(totalDays)}
      </p>
    </div>
  </div>

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

  <ul className="space-y-2">
    {activePlan.features.map((feat, featIndex) => (
      <li key={`${activePlan.id}-feat-${featIndex}-${feat.slice(0, 24)}`} className="flex items-center gap-2">
        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].check}`}>
          <Check size={10} className={PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].checkIcon} />
        </div>
        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{feat}</span>
      </li>
    ))}
  </ul>
</div>

<div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
    {messages.TOSS_IAP_NOTICE}
  </p>
</div>

<TDSButton
  fullWidth
  loading={isProcessing}
  disabled={isProcessing || isInvalidPrice}
  onClick={handlePay}
>
  {isProcessing ? messages.PROCESSING : messages.PAY}
</TDSButton>
```

### 2.7 최종 반환부 정리

```tsx
// [수정 전]
<ModalWrapper
  open={isOpen}
  onClose={onClose}
  useToss={isInTossApp}
  closeLabel={messages.CLOSE_MODAL}
>
  {modalBody}
</ModalWrapper>
```

```tsx
// [수정 후 (적용될 실제 스니펫)]
<ModalWrapper open={isOpen} onClose={onClose}>
  {modalBody}
</ModalWrapper>
```

---

## 3. `services/payment/types.ts` 정리

```typescript
// [수정 전]
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

export interface PlanInfo {
  id: 'pro' | 'premium';
  label: string;
  subtitle: string;
  price: number;
  features: string[];
}

export type CheckoutPlanId = 'pro' | 'premium';

export const TOSS_IAP_FIXED_PLAN_ID: CheckoutPlanId = 'pro';
export const TOSS_IAP_FIXED_QUANTITY = 1;

export const PLAN_DAYS_PER_UNIT = 30;
export const QUANTITY_MAX = 12;
export const DEFAULT_QUANTITY = 1;

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
  // ...
  pay_method: PayMethod;
  // ...
}
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
/**
 * Toss IAP 전용 체크아웃 상수.
 */
export type CheckoutPlanId = 'pro' | 'premium';

/** Toss mini-app Phase 1: PRO 30일권 1건만 허용 */
export const TOSS_IAP_FIXED_PLAN_ID: CheckoutPlanId = 'pro';
export const TOSS_IAP_FIXED_QUANTITY = 1;

/** 1개당 이용 일수 */
export const PLAN_DAYS_PER_UNIT = 30;
```

---

## 4. `constants/paymentCheckoutMessages.ts` 정리

```typescript
// [수정 전]
import type { PayMethod } from '../services/payment/types';

export interface PaymentCheckoutMessageSet {
  CLOSE_MODAL: string;
  CONFIG_MISSING: string;
  DISCOUNT: string;
  DISCOUNT_ZERO_LINE: (formattedZero: string) => string;
  DURATION_LABEL: string;
  DURATION_PACKAGE_LABEL: (days: number) => string;
  DURATION_SELECT_ARIA: string;
  ERR_INVALID_PRICE: string;
  FAILED: (message: string) => string;
  ORDER_SUMMARY: string;
  PAID_SERVICE_PERIOD: string;
  PAID_SERVICE_PERIOD_HINT: string;
  PAY: string;
  PAYMENT_METHOD_HEADING: string;
  PAY_METHOD_LABELS: Record<PayMethod, string>;
  PAY_NOW: string;
  PLAN_NAME_WITH_SUFFIX: (planDisplayName: string) => string;
  PLAN_PRICE: string;
  PREMIUM_COMING_SOON: string;
  PREMIUM_UNAVAILABLE_DETAIL: string;
  PROCESSING: string;
  PROCESSING_ERROR: string;
  QUANTITY_OPTION: (count: number, days: number) => string;
  REFUND_BULLET_1: string;
  REFUND_BULLET_2: string;
  REFUND_BULLET_3: (totalDays: number) => string;
  REFUND_INQUIRY: (email: string) => string;
  REFUND_SECTION_TITLE: string;
  SECURE_CHECKOUT: string;
  SUCCESS: string;
  TERMS_CONSENT_NOTICE: string;
  TOSS_FIXED_DURATION_LABEL: string;
  TOSS_FIXED_DURATION_VALUE: (days: number) => string;
  TOSS_IAP_ERROR_MESSAGES: Record<TossIapErrorCode, string>;
  TOSS_IAP_NOTICE: string;
  TOTAL: string;
  UNKNOWN: string;
  UNKNOWN_PLAN_LABEL: string;
  VALIDITY_NOTICE: (days: number) => string;
  VAT_INCLUDED: string;
  VERIFY_FAILED: (error: string) => string;
}
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
export interface PaymentCheckoutMessageSet {
  CLOSE_MODAL: string;
  DISCOUNT: string;
  DISCOUNT_ZERO_LINE: (formattedZero: string) => string;
  DURATION_PACKAGE_LABEL: (days: number) => string;
  ERR_INVALID_PRICE: string;
  FAILED: (message: string) => string;
  ORDER_SUMMARY: string;
  PAID_SERVICE_PERIOD: string;
  PAID_SERVICE_PERIOD_HINT: string;
  PAY: string;
  PLAN_NAME_WITH_SUFFIX: (planDisplayName: string) => string;
  PLAN_PRICE: string;
  PROCESSING: string;
  PROCESSING_ERROR: string;
  REFUND_BULLET_1: string;
  REFUND_BULLET_2: string;
  REFUND_BULLET_3: (totalDays: number) => string;
  REFUND_INQUIRY: (email: string) => string;
  REFUND_SECTION_TITLE: string;
  SECURE_CHECKOUT: string;
  SUCCESS: string;
  TERMS_CONSENT_NOTICE: string;
  TOSS_FIXED_DURATION_LABEL: string;
  TOSS_FIXED_DURATION_VALUE: (days: number) => string;
  TOSS_IAP_ERROR_MESSAGES: Record<TossIapErrorCode, string>;
  TOSS_IAP_NOTICE: string;
  TOTAL: string;
  UNKNOWN: string;
  UNKNOWN_PLAN_LABEL: string;
  VALIDITY_NOTICE: (days: number) => string;
  VAT_INCLUDED: string;
}
```

```typescript
// [수정 전]
ko: {
  DURATION_LABEL: '이용 기간 (개수)',
  DURATION_SELECT_ARIA: '이용권 개수 선택',
  PAY_NOW: '지금 결제하기',
  PREMIUM_COMING_SOON: 'PREMIUM 플랜은 출시 예정입니다',
  PREMIUM_UNAVAILABLE_DETAIL:
    'PREMIUM 플랜은 아직 결제가 불가합니다. 준비되는 대로 안내드릴게요.',
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
// [수정 후 (적용될 실제 스니펫)]
ko: {
  ORDER_SUMMARY: '주문 요약',
  SECURE_CHECKOUT: '보안 결제',
  TOSS_FIXED_DURATION_LABEL: '토스 인앱결제 이용 기간',
  TOSS_FIXED_DURATION_VALUE: (days) => `고정 1건 (${days}일)`,
  TOSS_IAP_NOTICE: '토스 앱 인앱결제로 진행됩니다.',
  TOSS_IAP_ERROR_MESSAGES: {
    INVALID_PRODUCT_ID:
      '현재 구매 가능한 상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    PAYMENT_PENDING: '이전 결제가 아직 처리 중입니다. 잠시 후 다시 확인해 주세요.',
    NETWORK_ERROR: '네트워크가 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
    INVALID_USER_ENVIRONMENT: '현재 계정 또는 기기 환경에서는 이 상품을 구매할 수 없습니다.',
    APP_MARKET_VERIFICATION_FAILED:
      '앱마켓 확인에 실패했습니다. 결제 내역을 확인한 뒤 필요하면 환불을 요청해 주세요.',
    TOSS_SERVER_VERIFICATION_FAILED:
      '결제 정보 전송이 지연되고 있습니다. 잠시 후 다시 열어 상태를 확인해 주세요.',
    INTERNAL_ERROR: '결제 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    KOREAN_ACCOUNT_ONLY: '한국 스토어 계정에서만 구매할 수 있는 상품입니다.',
    USER_CANCELED: '결제가 취소되었습니다.',
    PRODUCT_NOT_GRANTED_BY_PARTNER:
      '결제는 완료되었지만 이용권 지급이 지연되고 있습니다. 잠시 후 다시 열면 자동 복구를 시도합니다.',
    UNKNOWN: '결제 처리 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  },
  PLAN_PRICE: '이용권 금액',
  DISCOUNT: '할인 금액',
  TOTAL: '최종 결제 금액',
  VAT_INCLUDED: '부가세 포함',
  PAY: '결제하기',
  PROCESSING: '결제 처리 중...',
  ERR_INVALID_PRICE: '결제 금액이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.',
  SUCCESS: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
  FAILED: (message) => `결제에 실패했습니다: ${message}`,
  UNKNOWN: '알 수 없는 오류',
  UNKNOWN_PLAN_LABEL: '알 수 없는 플랜',
  DURATION_PACKAGE_LABEL: (days) => `이용권 (${days}일)`,
  VALIDITY_NOTICE: (days) => `이용권은 결제일로부터 ${days}일간 유효합니다.`,
  DISCOUNT_ZERO_LINE: (formattedZero) => `-${formattedZero}`,
  PROCESSING_ERROR: '결제 처리 중 오류가 발생했습니다.',
  CLOSE_MODAL: '결제 모달 닫기',
  PAID_SERVICE_PERIOD: '유료 서비스 이용 기간',
  PAID_SERVICE_PERIOD_HINT: '(결제일 기준 예정)',
  PLAN_NAME_WITH_SUFFIX: (planDisplayName) => `${planDisplayName} 플랜`,
  TERMS_CONSENT_NOTICE: '결제 시 서비스 이용 약관에 동의하는 것으로 간주합니다.',
  REFUND_SECTION_TITLE: '환불 및 취소 규정',
  REFUND_BULLET_1:
    '결제 후 7일 이내에 서비스 이용 기록(AI 매매 인식, 백테스트, 텔레그램 연동 등)이 없는 경우 전액 환불이 가능합니다.',
  REFUND_BULLET_2:
    '유료 서비스를 1회 이상 이용한 경우, 전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됩니다.',
  REFUND_BULLET_3: (totalDays) =>
    `본 결제는 단발성 이용권(${totalDays}일)이며, 자동 갱신되지 않습니다.`,
  REFUND_INQUIRY: (email) => `환불 문의: ${email}`,
}
```

---

## 5. `services/payment/paymentService.ts` PortOne 모듈 제거

### 5.1 PortOne 서비스 파일 비우기

```typescript
// [수정 전]
import type {
  PayMethod,
  PaymentRequest,
  PaymentResult,
  OrderRecord,
} from './types';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string;
const NICEPAY_CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string;
const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

export function isPortOneConfigured(): boolean {
  return Boolean(STORE_ID?.trim() && NICEPAY_CHANNEL_KEY?.trim());
}

export async function loadPortOneSDK(): Promise<typeof window.PortOne> {
  // ...
}

function mapPayMethodToPortOne(method: PayMethod): string {
  // ...
}

export async function requestPayment(req: PaymentRequest): Promise<PaymentResult> {
  // ...
}

export async function requestPaymentWithServerVerify(
  req: PaymentRequest,
): Promise<RequestPaymentWithVerifyResult> {
  // ...
}

export async function verifyPaymentOnServer(
  paymentId: string,
  planId: string,
  quantity?: number,
): Promise<VerifyPaymentResult> {
  // ...
}
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
export {};
```

### 5.2 PortOne 서비스 import 제거

```typescript
// [수정 전]
import { requestPaymentWithServerVerify } from '../services/payment/paymentService';
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
// import 삭제
```

---

## 6. 웹 환불 경로 dead code 정리

### 6.1 `components/auth/authViewTypes.ts`

```typescript
// [수정 전]
cancelSubscription: () => Promise<{ success: boolean; message?: string; error?: string }>;
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
// 위 prop 전체 삭제
```

### 6.2 `components/AuthModals.tsx`

```typescript
// [수정 전]
import { cancelSubscription } from '../services/payment/paymentService';

// ...
const viewProps =
  type === 'profile'
    ? {
        // ...
        cancelSubscription,
        onConnectTelegram,
        onDeleteAccount,
      }
    : // ...
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
// cancelSubscription import 삭제

// ...
const viewProps =
  type === 'profile'
    ? {
        // ...
        onConnectTelegram,
        onDeleteAccount,
      }
    : // ...
```

### 6.3 `components/auth/ProfileView.tsx`

```typescript
// [수정 전]
const ProfileView: React.FC<ProfileViewProps> = ({
  // ...
  cancelSubscription,
  onConnectTelegram,
  onDeleteAccount,
  isInTossApp,
}) => {
  // ...
  const handleProcessWebRefund = async () => {
    setError(null);
    setInfo(null);

    const result = await Promise.resolve(cancelSubscription());
    if (result.success) {
      setInfo(result.message ?? '');
      return;
    }

    setInfo(result.message ?? '');
    if (result.error) {
      setError(result.error);
    }
  };

  // ...
  <RefundGuideController
    lang={lang}
    isInTossApp={Boolean(isInTossApp)}
    isDisabled={loading}
    onProcessWebRefund={handleProcessWebRefund}
  />
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
const ProfileView: React.FC<ProfileViewProps> = ({
  // ...
  onConnectTelegram,
  onDeleteAccount,
  isInTossApp,
}) => {
  // ...
  <RefundGuideController
    lang={lang}
    isDisabled={loading}
  />
```

### 6.4 `components/auth/RefundGuideController.tsx`

```typescript
// [수정 전]
interface RefundGuideControllerProps {
  lang: AppLang;
  isInTossApp: boolean;
  isDisabled: boolean;
  onProcessWebRefund: () => Promise<void> | void;
}

const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isInTossApp,
  isDisabled,
  onProcessWebRefund,
}) => {
  const [isRefundPanelOpen, setIsRefundPanelOpen] = useState(false);
  const [isWebLoading, setIsWebLoading] = useState(false);
  const isWebProcessingRef = useRef(false);

  const handleConfirmRefund = useCallback(async () => {
    if (!isInTossApp) {
      if (isWebProcessingRef.current) {
        return;
      }

      isWebProcessingRef.current = true;
      setIsWebLoading(true);

      try {
        await Promise.resolve(onProcessWebRefund());
        setIsRefundPanelOpen(false);
      } catch (_error: unknown) {
        showRefundErrorToast();
      } finally {
        isWebProcessingRef.current = false;
        setIsWebLoading(false);
      }
      return;
    }

    refundDialog.open({
      title: currentRefundMessages.guideTitle ?? '',
      body: currentRefundMessages.guideBody ?? '',
      confirmLabel: currentAcknowledge,
      tone: 'primary',
      action: async () => {
        setIsRefundPanelOpen(false);
      },
    });
  }, [
    isInTossApp,
    lang,
    onProcessWebRefund,
    refundDialog.open,
  ]);
```

```typescript
// [수정 후 (적용될 실제 스니펫)]
interface RefundGuideControllerProps {
  lang: AppLang;
  isDisabled: boolean;
}

const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isDisabled,
}) => {
  const refundDialog = useAsyncTdsConfirm(lang);
  const [isRefundPanelOpen, setIsRefundPanelOpen] = useState(false);
  const messages = TDS_DIALOG_MESSAGES[lang];
  const labels = messages?.actions;
  const refundMessages = messages?.refund;

  const showRefundErrorToast = () => {
    const currentErrorMessage = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
    if (currentErrorMessage != null && currentErrorMessage !== '') {
      showErrorToast(currentErrorMessage);
    }
  };

  const handleConfirmRefund = useCallback(() => {
    const currentLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
    const currentRefundMessages = TDS_DIALOG_MESSAGES[lang]?.refund;
    const currentAcknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;

    if (
      currentRefundMessages == null ||
      currentAcknowledge == null ||
      currentLabels == null
    ) {
      showRefundErrorToast();
      return;
    }

    refundDialog.open({
      title: currentRefundMessages.guideTitle ?? '',
      body: currentRefundMessages.guideBody ?? '',
      confirmLabel: currentAcknowledge,
      tone: 'primary',
      action: async () => {
        setIsRefundPanelOpen(false);
      },
    });
  }, [lang, refundDialog.open]);

  if (refundMessages == null || labels == null) {
    return null;
  }

  return (
    <>
      {!isRefundPanelOpen ? (
        <TDSButton
          variant="tertiary"
          fullWidth
          onClick={() => setIsRefundPanelOpen(true)}
          disabled={isDisabled}
        >
          {refundMessages.requestRefund}
        </TDSButton>
      ) : (
        <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/40">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            {refundMessages.confirmPrompt}
          </p>
          <ul className="text-[10px] text-slate-500 dark:text-slate-400 space-y-1 list-disc pl-4">
            <li>{refundMessages.eligiblePolicy}</li>
            <li>{refundMessages.ineligiblePolicy}</li>
          </ul>
          <div className="flex gap-2">
            <TDSButton
              variant="tertiary"
              className="flex-1"
              onClick={() => setIsRefundPanelOpen(false)}
            >
              {labels.cancel}
            </TDSButton>
            <TDSButton
              variant="primary"
              className="flex-1"
              onClick={() => {
                void handleConfirmRefund();
              }}
            >
              {refundMessages.openRefundGuide}
            </TDSButton>
          </div>
        </div>
      )}

      <TdsConfirmDialog
        {...refundDialog.dialogProps}
        labels={labels}
        shouldHideCancel={true}
      />
    </>
  );
};
```

---

## 7. `App.tsx` 호출부 compile cleanup

```tsx
// [수정 전]
<CheckoutModal
  isOpen={!!checkoutPlan}
  onClose={() => setCheckoutPlan(null)}
  lang={lang}
  plan={(() => {
    const cfg = MembershipConfig.byType[checkoutPlan];
    const lk = lang === 'ko' ? 'ko' : 'en';
    return {
      id: cfg.type,
      label: cfg.displayName,
      subtitle: cfg.subtitle[lk],
      price: cfg.rawAmount,
      priceFormatted: formatPriceKRW(cfg.rawAmount),
      features: cfg.features[lk],
    };
  })()}
  customerEmail={user?.email}
  customerId={user?.id}
  onPaymentSuccess={() => {
    setCheckoutPlan(null);
    if (user?.id) fetchUserProfile(user.id);
  }}
/>
```

```tsx
// [수정 후 (적용될 실제 스니펫)]
<CheckoutModal
  isOpen={!!checkoutPlan}
  onClose={() => setCheckoutPlan(null)}
  lang={lang}
  customerEmail={user?.email}
  customerId={user?.id}
  onPaymentSuccess={() => {
    setCheckoutPlan(null);
    if (user?.id) fetchUserProfile(user.id);
  }}
/>
```

---

## 8. 적용 후 grep 기준

아래 문자열은 적용 후 **0건**이어야 합니다.

- `PortOne`
- `requestPaymentWithServerVerify`
- `loadPortOneSDK`
- `PAY_METHOD_OPTIONS`
- `PayMethod`
- `EasyPayProvider`
- `PAYMENT_METHOD_HEADING`
- `PAY_METHOD_LABELS`
- `PAY_NOW`
- `VITE_PORTONE_STORE_ID`
- `VITE_PORTONE_CHANNEL_KEY`

---

## 9. Mental Compile 체크포인트

1. `CheckoutModal.tsx`에서 `plan` prop을 제거하면 `App.tsx` 호출부도 같은 PR에서 같이 정리되어야 합니다.
2. `types.ts`에서 `PayMethod`를 삭제하면 `paymentCheckoutMessages.ts`의 `import type { PayMethod } ...`도 반드시 같이 삭제되어야 합니다.
3. `paymentService.ts`를 비우거나 삭제하면 `AuthModals.tsx`의 `cancelSubscription` import와 프로필 뷰 prop 전달도 반드시 같이 제거되어야 합니다.
4. `RefundGuideController.tsx`의 웹 비동기 분기를 지우면 `ProfileView.tsx`의 `handleProcessWebRefund`는 dead code가 되므로 같이 삭제되어야 합니다.
5. `handlePay`는 **`isProcessing`만으로 중복 진입을 막지 말고** `isExecutingRef`로 동기 가드를 두고, `finally`에서 **반드시** `isExecutingRef.current = false`로 해제합니다. 브릿지 호출은 **`await Promise.resolve(handleTossIapPay())`** 형태를 유지합니다.

---

## 10. 문서 이력

| 일자 | 내용 |
|------|------|
| 2026-04-01 | 토스 심사 정책 반영: 외부 웹 결제 모듈 hard delete 계획 초안 작성 |
| 2026-04-01 | 리뷰 반영: §2.3·§2.5에 `isExecutingRef` 동기 뮤텍스 및 `Promise.resolve(handleTossIapPay())` 브릿지 정규화 추가 |
