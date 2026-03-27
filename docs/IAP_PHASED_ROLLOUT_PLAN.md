# 토스 미니앱 IAP Phase 1 코드-우선 출시 계획

**문서 목적**: `components/CheckoutModal.tsx` 기준으로, 토스 미니앱에서는 **PRO 30일권 1건만** 결제되도록 고정하고, 웹 결제 흐름을 유지합니다. **모든 사용자 노출 문자열은 `constants/paymentCheckoutMessages.ts`로 이관(Sweep)** 하며, `CheckoutModal` 안에는 **한글·영어 리터럴과 `isKo` 삼항 분기가 단 한 줄도 남지 않게** 합니다(§2-2 완료 기준).

**관련 문서**: 다중 SKU/`purchasedDays` 확장은 [IAP_PRO_30_100_200_PLAN.md](./IAP_PRO_30_100_200_PLAN.md)에서 다룹니다. 본 문서는 **Phase 1 단일 SKU/단일 수량**만 다룹니다.

---

## Phase 1 런타임 성공 조건

아래 4개 조건이 동시에 참이면 Phase 1 구현이 끝난 것입니다.

```ts
const phase1SuccessCriteria = {
  tossPlanIdIsFixed: effectivePlanId === TOSS_IAP_FIXED_PLAN_ID, // 'pro'
  tossQuantityIsFixed: effectiveQuantity === TOSS_IAP_FIXED_QUANTITY, // 1
  tossAmountIsIntegerKRW: Number.isInteger(totalAmount) && totalAmount > 0,
  renderDoesNotThrow: true, // invalid input => totalAmount = 0, button disabled
};
```

---

## 수정 대상 파일

| 파일 | 변경 목적 |
|------|-----------|
| `services/payment/types.ts` | 토스 Phase 1 고정 플랜/수량 상수·타입 추가; **§1-2** 결제 수단 옵션에서 표시 `label` 제거 |
| `constants/paymentCheckoutMessages.ts` | 체크아웃 전용 i18n 사전 신설 |
| `utils/currency.ts` | KRW 총액 내림 계산 유틸 추가 |
| `components/CheckoutModal.tsx` | 파생 플랜/수량/금액, A11y, 결제 분기, Toss UI 고정 |

---

## 1. `services/payment/types.ts`

### 1-1. 상수와 타입 추가

**파일 경로**: `services/payment/types.ts`  
**변경 위치**: 이용권 상수 선언부, `PaymentRequest` 타입 선언부

```ts
// [추가할 실제 스니펫]
export type CheckoutPlanId = 'pro' | 'premium';

/** Toss mini-app Phase 1: PRO 30일권 1건만 허용 */
export const TOSS_IAP_FIXED_PLAN_ID = 'pro' as const;
export const TOSS_IAP_FIXED_QUANTITY = 1;

/** 1개당 이용 일수 */
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
  /** 이용권 개수 (1 = 30일, 2 = 60일 ...) */
  quantity?: number;
}
```

**Mental Compile 포인트**

```ts
const isPhase1TossOrder =
  payReq.planId === TOSS_IAP_FIXED_PLAN_ID &&
  payReq.quantity === TOSS_IAP_FIXED_QUANTITY;
```

### 1-2. `PAY_METHOD_OPTIONS` — 표시 문자열 제거 (Sweep 연동)

**파일 경로**: `services/payment/types.ts`  
**목적**: 결제 수단 **캡션 SSOT**를 `paymentCheckoutMessages`로만 둔다. `label: { ko; en }` 및 JSX의 `isKo` 분기를 **동시에 폐기**한다.

```ts
// [수정 후 스니펫 개요]
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
```

**CheckoutModal 표기**: `messages.PAY_METHOD_LABELS[opt.id]` 만 사용한다.

---

## 2. `constants/paymentCheckoutMessages.ts`

### 2-1. 체크아웃 전용 i18n 사전 신설

**파일 경로**: `constants/paymentCheckoutMessages.ts`  
**변경 위치**: 신설 파일 전체

```ts
// [신설 파일 전체 스니펫 — CheckoutModal UI/alert/orderName Sweep 반영]
import type { PayMethod } from '../services/payment/types';

/** 환불 안내 등에 쓰는 고객 문의 메일(SSOT). JSX에 이메일 리터럴 금지. */
export const PAYMENT_CHECKOUT_REFUND_EMAIL = 'grrrvv@naver.com' as const;

export interface PaymentCheckoutMessageSet {
  CLOSE_MODAL: string;
  CONFIG_MISSING: string;
  DISCOUNT: string;
  DISCOUNT_ZERO_LINE: (formattedZero: string) => string;
  DURATION_LABEL: string;
  /** 주문명·플랜 카드 부제 등: “이용권 (N일)” / “Plan (N days)” */
  DURATION_PACKAGE_LABEL: (days: number) => string;
  DURATION_SELECT_ARIA: string;
  ERR_INVALID_PRICE: string;
  FAILED: (message: string) => string;
  ORDER_SUMMARY: string;
  PAID_SERVICE_PERIOD: string;
  PAID_SERVICE_PERIOD_HINT: string;
  PAY: string;
  PAYMENT_METHOD_HEADING: string;
  /** `PAY_METHOD_OPTIONS` 순회 시 캡션은 여기만 참조(표시 문자열은 types에서 제거 권장) */
  PAY_METHOD_LABELS: Record<PayMethod, string>;
  PAY_NOW: string;
  /** 예: "PRO 플랜" / "PRO PLAN" */
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
  TOSS_IAP_NOTICE: string;
  TOTAL: string;
  UNKNOWN: string;
  UNKNOWN_PLAN_LABEL: string;
  VALIDITY_NOTICE: (days: number) => string;
  VAT_INCLUDED: string;
  VERIFY_FAILED: (error: string) => string;
}

export const PAYMENT_CHECKOUT_MESSAGES: Record<'ko' | 'en', PaymentCheckoutMessageSet> = {
  ko: {
    ORDER_SUMMARY: '주문 요약',
    SECURE_CHECKOUT: '보안 결제',
    DURATION_LABEL: '이용 기간 (개수)',
    DURATION_SELECT_ARIA: '이용권 개수 선택',
    TOSS_FIXED_DURATION_LABEL: '토스 인앱결제 이용 기간',
    TOSS_FIXED_DURATION_VALUE: (days) => `고정 1건 (${days}일)`,
    TOSS_IAP_NOTICE: '토스 앱 인앱결제로 진행됩니다.',
    PLAN_PRICE: '이용권 금액',
    DISCOUNT: '할인 금액',
    TOTAL: '최종 결제 금액',
    VAT_INCLUDED: '부가세 포함',
    PAY_NOW: '지금 결제하기',
    PAY: '결제하기',
    PREMIUM_COMING_SOON: 'PREMIUM 플랜은 출시 예정입니다',
    PREMIUM_UNAVAILABLE_DETAIL:
      'PREMIUM 플랜은 아직 결제가 불가합니다. 준비되는 대로 안내드릴게요.',
    PROCESSING: '결제 처리 중...',
    ERR_INVALID_PRICE: '결제 금액이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.',
    SUCCESS: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
    FAILED: (message) => `결제에 실패했습니다: ${message}`,
    VERIFY_FAILED: (error) =>
      `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${error})`,
    CONFIG_MISSING: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    UNKNOWN: '알 수 없는 오류',
    UNKNOWN_PLAN_LABEL: '알 수 없는 플랜',
    DURATION_PACKAGE_LABEL: (days) => `이용권 (${days}일)`,
    QUANTITY_OPTION: (count, days) => `${count}개 (${days}일)`,
    VALIDITY_NOTICE: (days) => `이용권은 결제일로부터 ${days}일간 유효합니다.`,
    DISCOUNT_ZERO_LINE: (formattedZero) => `-${formattedZero}`,
    PROCESSING_ERROR: '결제 처리 중 오류가 발생했습니다.',
    CLOSE_MODAL: '결제 모달 닫기',
    PAID_SERVICE_PERIOD: '유료 서비스 이용 기간',
    PAID_SERVICE_PERIOD_HINT: '(결제일 기준 예정)',
    PAYMENT_METHOD_HEADING: '결제 수단 선택',
    PAY_METHOD_LABELS: {
      CARD: '신용카드',
      VIRTUAL_ACCOUNT: '가상계좌',
      TRANSFER: '계좌이체',
      MOBILE: '휴대폰',
      EASY_PAY: '간편결제',
    },
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
  },
  en: {
    ORDER_SUMMARY: 'Order Summary',
    SECURE_CHECKOUT: 'Secure Checkout',
    DURATION_LABEL: 'Duration (quantity)',
    DURATION_SELECT_ARIA: 'Select quantity',
    TOSS_FIXED_DURATION_LABEL: 'Toss in-app purchase duration',
    TOSS_FIXED_DURATION_VALUE: (days) => `Fixed single purchase (${days} days)`,
    TOSS_IAP_NOTICE: 'Payment will be processed through Toss in-app purchase.',
    PLAN_PRICE: 'Plan Price',
    DISCOUNT: 'Discount',
    TOTAL: 'Total',
    VAT_INCLUDED: 'VAT included',
    PAY_NOW: 'Pay Now',
    PAY: 'Pay',
    PREMIUM_COMING_SOON: 'PREMIUM plan is coming soon',
    PREMIUM_UNAVAILABLE_DETAIL:
      'The PREMIUM plan is not available for purchase yet.',
    PROCESSING: 'Processing...',
    ERR_INVALID_PRICE: 'The payment amount is invalid. Please try again later.',
    SUCCESS: 'Payment complete! Your service is now active.',
    FAILED: (message) => `Payment failed: ${message}`,
    VERIFY_FAILED: (error) =>
      `Payment succeeded but verification failed. It will be reflected shortly or contact support.\n(${error})`,
    CONFIG_MISSING: 'Payment is not configured. Please contact support.',
    UNKNOWN: 'Unknown error',
    UNKNOWN_PLAN_LABEL: 'Unknown plan',
    DURATION_PACKAGE_LABEL: (days) => `Plan (${days} days)`,
    QUANTITY_OPTION: (count, days) => `${count} (${days} days)`,
    VALIDITY_NOTICE: (days) => `This plan is valid for ${days} days from the date of purchase.`,
    DISCOUNT_ZERO_LINE: (formattedZero) => `-${formattedZero}`,
    PROCESSING_ERROR: 'An error occurred during payment.',
    CLOSE_MODAL: 'Close checkout modal',
    PAID_SERVICE_PERIOD: 'Paid service period',
    PAID_SERVICE_PERIOD_HINT: '(Expected from payment date)',
    PAYMENT_METHOD_HEADING: 'Payment Method',
    PAY_METHOD_LABELS: {
      CARD: 'Credit Card',
      VIRTUAL_ACCOUNT: 'Virtual Account',
      TRANSFER: 'Bank Transfer',
      MOBILE: 'Mobile',
      EASY_PAY: 'Easy Pay',
    },
    PLAN_NAME_WITH_SUFFIX: (planDisplayName) => `${planDisplayName} PLAN`,
    TERMS_CONSENT_NOTICE: 'By purchasing, you agree to our Terms of Service.',
    REFUND_SECTION_TITLE: 'Refund & Cancellation Policy',
    REFUND_BULLET_1:
      'Full refund available within 7 days if no service usage (AI recognition, backtesting, Telegram sync, etc.) has occurred.',
    REFUND_BULLET_2:
      'If paid features have been used, withdrawal is restricted per the E-Commerce Act.',
    REFUND_BULLET_3: (totalDays) =>
      `This is a one-time purchase valid for ${totalDays} days. No auto-renewal.`,
    REFUND_INQUIRY: (email) => `Refund inquiries: ${email}`,
  },
};
```

**참고**

- `DISCOUNT_ZERO_LINE` 본문은 ko/en 동일해도 된다. 다통화 시 로케일별로만 조정한다.
- `PAY_METHOD_LABELS` 도입 후 `services/payment/types.ts`의 `PAY_METHOD_OPTIONS`에서 **`label` 필드는 제거**하고, 그리드는 `opt.id` + `messages.PAY_METHOD_LABELS[opt.id]`만 쓴다(표시 문자열 SSOT 단일화).
- 라틴 상품 코드 **`PRO` / `PREMIUM` 토글 텍스트**(`id.toUpperCase()`)는 번역 대상이 아니므로 JSX에 그대로 둬도 된다.

### 2-2. `CheckoutModal` i18n Sweep 완료 기준 (필수)

**삭제 대상(컴포넌트 파일 내부)**

- `PAY_MSGS` 및 그에 상응하는 인라인 `Record<'ko'|'en', …>`
- `getPlanDurationLabel` 등 **문자열을 반환하는 로컬 헬퍼**(내용은 전부 `paymentCheckoutMessages`로 이전)
- `const isKo = lang === 'ko'` 및 **모든** `isKo ? … : …` 표현(JSX·TS 본문 포함)

**허용**

- `lang` prop / `PAYMENT_CHECKOUT_MESSAGES[lang]` / `messages.*` 참조만
- `MembershipConfig` 등 데이터: `proCfg.subtitle[lang]`, `proCfg.features[lang]` 처럼 **`lang`으로만 인덱싱**(삼항 금지)

**검증(구현 후 반드시 실행)**

```bash
# CheckoutModal 내 한글·영문 따옴표 문자열 잔존 점검(의도적 예외: import 경로 등만 수동 확인)
rg "[\u3131-\uD79D]" components/CheckoutModal.tsx
rg "isKo" components/CheckoutModal.tsx
```

위 `rg`가 **사용자 문구로서의 매칭이 0건**이어야 한다(로그·주석은 별도 정책; **사용자 노출·alert·주문명·aria-label**은 전부 사전).

---

## 3. `utils/currency.ts`

### 3-1. KRW 총액 계산 함수 추가

**파일 경로**: `utils/currency.ts`  
**변경 위치**: `formatPriceKRW()` 아래

```ts
// [추가할 실제 스니펫]
export function calculateSafeTotalAmountKRW(
  price: number | undefined,
  quantity: number,
): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return 0;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  // 제품 정책: KRW 최종 결제 금액은 항상 정수이며 소수는 내림한다.
  return Math.floor(price * quantity + Number.EPSILON);
}
```

**Mental Compile 포인트**

```ts
calculateSafeTotalAmountKRW(5907.5, 1); // 5907
calculateSafeTotalAmountKRW(undefined, 1); // 0
calculateSafeTotalAmountKRW(5900, 0); // 0
```

---

## 4. `components/CheckoutModal.tsx`

### 4-1. import 교체

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: import 영역

```ts
// [현재 문제점]
import { formatPriceKRW } from '../utils/currency';
import {
  PAY_METHOD_OPTIONS,
  PLAN_DAYS_PER_UNIT,
  QUANTITY_MAX,
  DEFAULT_QUANTITY,
  type PayMethod,
  type EasyPayProvider,
} from '../services/payment/types';

// ... 중략 ...

const PAY_MSGS = {
  ko: { /* ... */ },
  en: { /* ... */ },
} as const;

// [수정 후 적용할 실제 스니펫]
import { calculateSafeTotalAmountKRW, formatPriceKRW } from '../utils/currency';
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
import {
  PAYMENT_CHECKOUT_MESSAGES,
  PAYMENT_CHECKOUT_REFUND_EMAIL,
  type PaymentCheckoutMessageSet,
} from '../constants/paymentCheckoutMessages';
```

### 4-2. `PAY_MSGS` 제거 + 파생값 선언

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `CheckoutModal` 함수 본문 상단, `planMap` 선언 직후

```ts
// [수정 후 적용할 실제 스니펫]
const messages = PAYMENT_CHECKOUT_MESSAGES[lang];

const effectivePlanId: CheckoutPlanId = isInTossApp
  ? TOSS_IAP_FIXED_PLAN_ID
  : selectedPlanId;

// planMap 조회 실패 시 undefined 접근 방지 + 알려진 폴백(훅에서 activePlan 필수인 경우 대비)
const activePlanCandidate = planMap[effectivePlanId];
if (!activePlanCandidate) {
  console.error('[CheckoutModal] Invalid plan ID for planMap', { effectivePlanId });
}

// `undefined` 가능: 폴백 행까지 없으면 §4-4a에서 모달 안에 CONFIG_MISSING만 노출
const activePlan =
  activePlanCandidate ?? planMap[TOSS_IAP_FIXED_PLAN_ID];

if (!activePlan) {
  console.error('[CheckoutModal] planMap missing TOSS_IAP_FIXED_PLAN_ID; check MembershipConfig wiring');
}

const effectiveQuantity = isInTossApp
  ? TOSS_IAP_FIXED_QUANTITY
  : quantity;

const isPremiumComingSoon = !isInTossApp && effectivePlanId === 'premium';

const totalDays = PLAN_DAYS_PER_UNIT * effectiveQuantity;
const totalAmount = calculateSafeTotalAmountKRW(activePlan?.price, effectiveQuantity);
const totalFormatted = formatPriceKRW(totalAmount);
const periodLabel = getServicePeriodDisplay(totalDays, lang);
const isInvalidPrice = totalAmount <= 0;

const primaryCtaLabel = getPrimaryCheckoutCtaLabel(
  messages,
  isPremiumComingSoon,
  isInTossApp,
);
```

**컴포넌트 바깥(또는 파일 하단) — 중첩 삼항 금지·가독성**

```ts
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
```

**`planMap` 빌드**: `const lk = lang;` 처럼 **`lang`만** 사용해 `subtitle[lang]`, `features[lang]` 인덱싱한다(`isKo` 금지).

**Rules of Hooks 주의**

- **권장(§4-4a)**: `activePlan`이 없으면 **`buildPayReq` / `handlePay` 등 모든 훅 선언이 끝난 직후**, `modalBody` 조립 전에 `ModalWrapper`로 감싼 안내 UI만 반환한다. 엉성한 결제 UI·`TypeError` 백지 화면을 동시에 막는다.
- **보조(§4-3·§4-8)**: 훅 클로저·JSX 어디에서도 `activePlan.foo` 직접 접근 금지 → `?.` / `??` / `messages.UNKNOWN_PLAN_LABEL` / `formatPriceKRW(0)` 로 **렌더·요청 생성 경로의 크래시를 원천 차단**한다.
- `if (!isOpen) return null` 이 있으면 그 **다음**에 `!activePlan` 가드를 둔다(닫힌 모달에 불필요한 래핑 방지).

**금지 스니펫**

```ts
// 금지: 렌더 중 state 덮어쓰기
useEffect(() => {
  if (isInTossApp) {
    setQuantity(1);
  }
}, [isInTossApp]);
```

### 4-3. `buildPayReq`를 파생 플랜/수량 기준으로 고정

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `buildPayReq` 함수

```ts
// [현재 문제점]
const buildPayReq = useCallback((): PaymentRequest => ({
  orderName: `${activePlan.label} ${getPlanDurationLabel(quantity, isKo)}`,
  totalAmount,
  customerEmail,
  customerId,
  payMethod,
  planId: selectedPlanId,
  quantity,
  ...(payMethod === 'EASY_PAY' ? { easyPayProvider: 'KAKAOPAY' as EasyPayProvider } : {}),
}), [activePlan.label, quantity, totalAmount, payMethod, customerEmail, customerId, isKo, selectedPlanId]);

// [수정 후 적용할 실제 스니펫 — 빈 객체 스프레드 제거 + activePlan 결손 시 주문명 크래시 방지]
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

### 4-4. `handleTossIapPay`와 `handlePay` 가드 클로즈 (확정)

**확정 정책**: `handlePay`의 `useCallback` 의존성 배열이 길어지는 것은 **전혀 문제 삼지 않는다**. 구현은 **가독성·단순함**을 최우선으로 하며, **성능 명목의 ref·추가 `useEffect`로 deps를 줄이는 우회는 사용하지 않는다.**

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `handleTossIapPay`, `handlePay`

```ts
// [확정 스니펫 — §4-4만 사용]
// exhaustive-deps 정책: 콜백 본문에서 참조하는 함수(`requestTossIAP` 포함)는
// 모듈 import든 외부든, 린터가 경고하면 deps에 넣어 경고를 없앤다. eslint-disable로 우회하지 않음.
const handleTossIapPay = useCallback(async () => {
  const result = await requestTossIAP(effectivePlanId, effectiveQuantity);

  if (!result.success) {
    return {
      ok: false,
      cancel: result.cancel,
      message: result.message,
    };
  }

  return { ok: true, needRefresh: true };
}, [effectivePlanId, effectiveQuantity, requestTossIAP]);

const handlePay = useCallback(async () => {
  if (isProcessing || isPremiumComingSoon) {
    return;
  }

  // 렌더에서 disabled + 여기서 한 번 더: 키보드/강제 호출 방어 (의도적 이중 가드)
  if (isInvalidPrice) {
    alert(PAYMENT_CHECKOUT_MESSAGES[lang].ERR_INVALID_PRICE);
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
      alert(msgs.SUCCESS);
      onPaymentSuccess?.();
      onClose();
      return;
    }

    let alertMessage = msgs.UNKNOWN;
    if ('configMissing' in outcome && outcome.configMissing) {
      alertMessage = msgs.CONFIG_MISSING;
    } else if (outcome.needRefresh) {
      alertMessage = msgs.VERIFY_FAILED(outcome.message ?? '');
    } else {
      alertMessage = msgs.FAILED(outcome.message ?? msgs.UNKNOWN);
    }

    alert(alertMessage);

    if (outcome.needRefresh) {
      onPaymentSuccess?.();
      onClose();
    }
  } catch (error) {
    console.error('[Payment Error]', error);
    alert(msgs.PROCESSING_ERROR);
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
]);
```

### 4-4a. `activePlan` 결손 시 Early Return (권장 · White Screen 방지)

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: **`handlePay` / `buildPayReq` / `handlePortOnePay` 등 이 컴포넌트의 모든 훅 선언이 끝난 직후**, `if (!isOpen) return null` 다음(있다면), **`modalBody`·`periodLabel` 등 `activePlan`을 직접 쓰는 JSX 조립 전**

**카피**: `messages.CONFIG_MISSING` 재사용(결제/플랜 설정 불가 안내). JSX에 한글·영문 하드코딩 금지.

```tsx
// [권장 스니펫 — Rules of Hooks: 훅 아래, 본문 JSX 직전]
if (!isOpen) {
  return null;
}

if (!activePlan) {
  return (
    <ModalWrapper
      open={isOpen}
      onClose={onClose}
      useToss={isInTossApp}
      closeLabel={messages.CLOSE_MODAL}
    >
      <div className="p-6 text-center text-slate-500 dark:text-slate-400">
        {messages.CONFIG_MISSING}
      </div>
    </ModalWrapper>
  );
}

// 이후부터는 TypeScript가 activePlan을 좁힐 수 있음(타입을 `undefined` 허용으로 두었을 때)
```

**리뷰 반영 요약**

| 항목 | 판단 |
|------|------|
| `useCallback` + 외부 함수 | `requestTossIAP`, `handlePortOnePay` 등 콜백에서 호출하는 심볼은 **린터가 요구하면 전부 deps에 포함**해 경고를 해결한다. |
| `buildPayReq` 스프레드 | 빈 `{}` / 매번 새 객체 생성 제거 → `baseRequest`에 조건부 필드만 대입. |
| `isInvalidPrice` + `messages` | UI는 `disabled`, 핸들러는 가드 유지. 알림 문구는 `PAYMENT_CHECKOUT_MESSAGES[lang]` / `msgs`로 조회해 `messages` 전체를 deps에 묶지 않음(`lang`만). |
| `handlePay` deps 길이 | **문제 아님**. exhaustive-deps 충족을 위해 필요한 심볼은 모두 나열(§4-4 확정). |
| `activePlan` / `planMap` | 로그 + `?? planMap[TOSS_IAP_FIXED_PLAN_ID]`; **§4-4a**로 결손 UI 차단; **§4-3·§4-8**에서 `?.` / `??` / `UNKNOWN_PLAN_LABEL` / `formatPriceKRW(0)` 로 이중 방어. |
| CheckoutModal i18n Sweep | **§2-2·§4-10**: `PAY_MSGS`·`getPlanDurationLabel`·`isKo`·JSX/aria **모든** 사용자 문자열 제거 → `paymentCheckoutMessages` + `PAYMENT_CHECKOUT_REFUND_EMAIL` + `PAY_METHOD_LABELS`만 사용. |

**Mental Compile 포인트**

```ts
if (isInTossApp) {
  // requestTossIAP('pro', 1)만 호출된다.
}

if (totalAmount <= 0) {
  // 렌더에서 throw하지 않고 alert + return 한다.
}
```

### 4-5. `ModalWrapper` 백드롭 A11y 보강

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `ModalWrapper` 함수 내부

```tsx
// [수정 후 적용할 실제 스니펫]
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

### 4-6. 토스 환경에서 플랜 토글 숨김

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `modalBody` 내 플랜 선택 토글 JSX

```tsx
// [수정 후 적용할 실제 스니펫]
{!isInTossApp && (
  <div className="flex justify-center">
    <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
      {(['pro', 'premium'] as const).map((id) => {
        const isSelected = selectedPlanId === id;
        const isPro = id === 'pro';

        return (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedPlanId(id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              isSelected
                ? isPro
                  ? 'bg-blue-600 text-white'
                  : 'bg-amber-400 text-black'
                : 'text-slate-500 dark:text-slate-300'
            }`}
          >
            {id.toUpperCase()}
          </button>
        );
      })}
    </div>
  </div>
)}
```

**Mental Compile 포인트**

```ts
if (isInTossApp) {
  // selectedPlanId UI가 사라지고, effectivePlanId는 항상 'pro'다.
}
```

### 4-7. 개수 `<select>`를 웹 전용으로 제한하고 토스는 고정 안내 블록으로 대체

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: 이용권 개수 선택 JSX 블록

**i18n**: `<option>` 문구는 **`messages.QUANTITY_OPTION`만** 사용한다. `isKo` / `lang` 삼항으로 한·영 문자열을 JSX에 두지 않는다.

```tsx
// [수정 후 적용할 실제 스니펫]
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

### 4-8. 토스 인앱결제 안내와 금액 표시는 파생값만 사용

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: 인앱결제 안내 박스, 금액 요약 박스, 약관/기간 텍스트

**i18n·통화**: 유효기간 문구는 **`messages.VALIDITY_NOTICE`**. 할인 0원 줄은 **`messages.DISCOUNT_ZERO_LINE(formatPriceKRW(0))`** — 통화 기호·단위는 `formatPriceKRW` SSOT, JSX에 `₩`/`$` 리터럴 금지.

```tsx
// [수정 후 적용할 실제 스니펫]
{isInTossApp && (
  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
      {messages.TOSS_IAP_NOTICE}
    </p>
  </div>
)}

<div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
  <div className="flex justify-between items-center">
    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
      {messages.PLAN_PRICE}
    </span>
    <span className="text-sm font-bold text-slate-900 dark:text-white">
      {activePlan?.priceFormatted ?? formatPriceKRW(0)} × {effectiveQuantity} = {totalFormatted}
    </span>
  </div>

  <div className="flex justify-between items-center">
    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
      {messages.DISCOUNT}
    </span>
    <span className="text-sm font-bold text-emerald-500">
      {messages.DISCOUNT_ZERO_LINE(formatPriceKRW(0))}
    </span>
  </div>

  <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-white/5">
    <div>
      <p className="text-sm font-black text-slate-900 dark:text-white">
        {messages.TOTAL}
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        {messages.VAT_INCLUDED}
      </p>
    </div>
    <p className={`text-2xl font-black ${styles.total}`}>{totalFormatted}</p>
  </div>
</div>

<p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
  {messages.VALIDITY_NOTICE(totalDays)}
</p>
```

### 4-9. 버튼 비활성 조건과 모달 래퍼 인자 교체

**파일 경로**: `components/CheckoutModal.tsx`  
**변경 위치**: `TDSButton`, 일반 버튼, 최종 `ModalWrapper` 호출부

```tsx
// [수정 후 적용할 실제 스니펫]
<TDSButton
  fullWidth
  loading={isProcessing}
  disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
  onClick={handlePay}
>
  {isProcessing ? messages.PROCESSING : primaryCtaLabel}
</TDSButton>

<button
  onClick={handlePay}
  disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
  className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${styles.button}`}
>
  {isProcessing ? messages.PROCESSING : primaryCtaLabel}
</button>

<button
  type="button"
  onClick={onClose}
  className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-200/50 dark:bg-white/10 flex items-center justify-center hover:bg-slate-300/50 dark:hover:bg-white/20 transition-colors"
  aria-label={messages.CLOSE_MODAL}
>
  <X size={16} className="text-slate-500 dark:text-slate-400" />
</button>

return (
  <ModalWrapper
    open={isOpen}
    onClose={onClose}
    useToss={isInTossApp}
    closeLabel={messages.CLOSE_MODAL}
  >
    {modalBody}
  </ModalWrapper>
);
```

### 4-10. 모달 본문 JSX 매핑표 (남김없이 사전만 참조)

**원칙**: 아래 표의 **우열**만 허용. 그 외 한글·영문 리터럴·`isKo` 삼항 **금지**.

| UI 위치 | 참조 식 |
|---------|---------|
| 주문 헤더 제목 | `messages.ORDER_SUMMARY` |
| 헤더 배지 | `messages.SECURE_CHECKOUT` |
| 플랜 카드 제목 | `messages.PLAN_NAME_WITH_SUFFIX(activePlan.label)` |
| 플랜 카드 부제(기간) | `messages.DURATION_PACKAGE_LABEL(totalDays)` |
| 유료 기간 블록 제목 | `messages.PAID_SERVICE_PERIOD` |
| 유료 기간 보조 | `messages.PAID_SERVICE_PERIOD_HINT` |
| 결제 수단 제목 | `messages.PAYMENT_METHOD_HEADING` |
| 결제 수단 버튼 캡션 | `messages.PAY_METHOD_LABELS[opt.id]` |
| 토스 인앱 안내 | `messages.TOSS_IAP_NOTICE` |
| 금액·할인·합계 라벨 | `messages.PLAN_PRICE`, `messages.DISCOUNT`, `messages.TOTAL`, `messages.VAT_INCLUDED` |
| 할인 금액 값 | `messages.DISCOUNT_ZERO_LINE(formatPriceKRW(0))` |
| 처리 중 / CTA | `messages.PROCESSING`, `primaryCtaLabel`(§4-2 헬퍼) |
| PREMIUM 불가 안내 | `messages.PREMIUM_UNAVAILABLE_DETAIL` |
| 약관 동의 한 줄 | `messages.TERMS_CONSENT_NOTICE` |
| 유효기간 안내 | `messages.VALIDITY_NOTICE(totalDays)` |
| 환불 섹션 제목 | `messages.REFUND_SECTION_TITLE` |
| 환불 리스트 | `messages.REFUND_BULLET_1`, `REFUND_BULLET_2`, `REFUND_BULLET_3(totalDays)` |
| 환불 문의 | `messages.REFUND_INQUIRY(PAYMENT_CHECKOUT_REFUND_EMAIL)` |
| 닫기 `aria-label` | `messages.CLOSE_MODAL` |
| 토스 고정 기간 블록 | `messages.TOSS_FIXED_DURATION_LABEL`, `TOSS_FIXED_DURATION_VALUE(totalDays)` |
| 웹 `<select>` 옵션 | `messages.QUANTITY_OPTION(count, PLAN_DAYS_PER_UNIT * count)` |

**허용 예외**: 장식용 `<span>{'<'}</span>`, 상품 코드 `id.toUpperCase()`(`PRO`/`PREMIUM`).

---

## 5. `services/payment/tossIapService.ts`

본 파일의 공개 시그니처는 이미 `requestTossIAP(planId: string, quantity: number = 1)` 이므로, Phase 1에서는 **호출부가 `('pro', 1)`만 넘기게 만드는 것**이 핵심입니다. 서비스 파일 자체는 Phase 1 범위에서 필수 수정 대상이 아닙니다.

```ts
// [Phase 1에서 호출부가 만족해야 하는 조건]
await requestTossIAP(TOSS_IAP_FIXED_PLAN_ID, TOSS_IAP_FIXED_QUANTITY);
```

---

## 6. 검증 체크포인트

### 6-1. Toss mini-app

```ts
expect(isInTossApp ? effectivePlanId : selectedPlanId).toBe('pro');
expect(isInTossApp ? effectiveQuantity : quantity).toBe(1);
expect(activePlan).toBeDefined();
expect(totalAmount).toBe(Math.floor(activePlan.price * 1 + Number.EPSILON));
expect(isInvalidPrice).toBe(false);
```

### 6-2. Invalid price fallback

```ts
const totalAmount = calculateSafeTotalAmountKRW(undefined, 1);
const isInvalidPrice = totalAmount <= 0;

expect(totalAmount).toBe(0);
expect(isInvalidPrice).toBe(true);
// render path: throw 없음
```

### 6-3. Web checkout

```ts
expect(isInTossApp).toBe(false);
expect(effectivePlanId).toBe(selectedPlanId);
expect(effectiveQuantity).toBe(quantity);
```

---

## 7. 작업 체크리스트

| 항목 | 완료 기준 |
|------|-----------|
| `services/payment/types.ts` | `TOSS_IAP_FIXED_PLAN_ID`, `TOSS_IAP_FIXED_QUANTITY`, `CheckoutPlanId` 추가; **§1-2** `PAY_METHOD_OPTIONS`에서 `label` 제거 |
| `constants/paymentCheckoutMessages.ts` | **§2-1 전 키 + `PAYMENT_CHECKOUT_REFUND_EMAIL`**; CheckoutModal·alert·주문명 **전부** SSOT |
| i18n Sweep | **§2-2** `rg` 통과; `CheckoutModal`에 `isKo`·`PAY_MSGS`·사용자 대상 하드코딩 문자열 **0건** |
| `utils/currency.ts` | `calculateSafeTotalAmountKRW()`가 `Math.floor(price * quantity + Number.EPSILON)` 사용 |
| `components/CheckoutModal.tsx` | `effectivePlanId`, `effectiveQuantity`, `isInvalidPrice`가 `return` 이전에 계산됨 |
| `planMap` / `activePlan` | §4-4a 훅 이후 Early Return + §4-3·§4-8 `?.`/`??`/사전 키/`formatPriceKRW(0)`; 총액은 `activePlan?.price` |
| `buildPayReq` | `planId: effectivePlanId`, `quantity: effectiveQuantity`, `totalAmount` 사용 |
| `handlePay` | **§4-4 확정**; 렌더 throw 없음, invalid price는 `alert + return` 가드; deps는 린터 요구만큼 전부 나열(길이 무관) |
| `activePlan` Early Return | **§4-4a**: 훅 직후·`modalBody` 전에 `!activePlan`이면 `CONFIG_MISSING`만 담은 `ModalWrapper` |
| `useCallback` / exhaustive-deps | `requestTossIAP` 등 린터가 지적하는 심볼은 **deps에 포함**, `eslint-disable` 미사용 |
| 토스 UI | 플랜 토글 숨김, 수량 `<select>` 숨김, 고정 기간 안내 블록 표시 |
| 웹 UI | 기존 `selectedPlanId`, `quantity`, 포트원 결제 흐름 유지 |

---

## 8. Phase 2 경계

Phase 2에서는 아래 상수가 더 이상 고정값이 아닙니다. 그 전까지는 본 문서의 스니펫을 그대로 유지합니다.

```ts
const phase2WillReplace = {
  TOSS_IAP_FIXED_PLAN_ID: 'pro',
  TOSS_IAP_FIXED_QUANTITY: 1,
};
```
