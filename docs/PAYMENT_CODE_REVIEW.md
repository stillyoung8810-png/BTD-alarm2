# 결제 관련 코드 리뷰 — 유지보수성·클린코드 관점

> **범위**: `CheckoutModal.tsx`, `paymentService.ts`, `services/payment/types.ts`, `supabase/functions/verify-payment/index.ts`  
> **중점**: DRY, Dead Code/Unused Props, Cognitive Complexity, Anti-patterns

---

## 발견된 문제점 리스트 (중요도 순)

### 1. [높음] DRY 위반 — "30일" / "30 days" 하드코딩 반복

**위치**: `CheckoutModal.tsx`  
- 87행: `orderName: \`${plan.label} ${isKo ? '이용권 (30일)' : 'Plan (30 days)'}\``  
- 196행: `{isKo ? '이용권 (30일)' : 'Plan (30 days)'}`  
- 334행: `이용권은 결제일로부터 30일간 유효합니다.`  
- 357행: `단발성 이용권(30일)`  

**문제**: 동일 문자열·의미가 4곳 이상에 흩어져 있어, "60일" 등으로 확장 시 누락·불일치 위험.

**개선**: 상수 또는 유틸로 한 곳에서 정의.

```ts
// constants.ts 또는 CheckoutModal 상단
const PLAN_DAYS = 30;
const getPlanDurationLabel = (isKo: boolean) => isKo ? `이용권 (${PLAN_DAYS}일)` : `Plan (${PLAN_DAYS} days)`;
```

---

### 2. [높음] DRY 위반 — isKo 분기 반복 (결제 메시지·알림)

**위치**: `CheckoutModal.tsx` `handlePay` 내부  
- 성공/실패/검증실패 메시지가 모두 `isKo ? '...' : '...'` 패턴으로 10회 이상 반복.

**문제**: 메시지 추가·수정 시 누락 가능성, 가독성 저하.

**개선**: 메시지 맵 또는 작은 헬퍼로 한 곳에 모음.

```ts
const PAY_MSGS = {
  ko: {
    success: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
    failed: (msg: string) => `결제에 실패했습니다: ${msg}`,
    verifyFailed: (err: string) => `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${err})`,
    configMissing: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    unknown: '알 수 없는 오류',
    processingError: '결제 처리 중 오류가 발생했습니다.',
  },
  en: { ... },
} as const;
// 사용: alert(PAY_MSGS[lang][key] 또는 PAY_MSGS[lang].failed(result.message));
```

---

### 3. [높음] Cognitive Complexity — `handlePay` 내 조건 분기 과다

**위치**: `CheckoutModal.tsx` 81~145행  

**문제**:  
- `if (isTossApp())` → 내부에서 success/!success, verification 성공/실패 분기.  
- 그 다음 포트원 경로에서 `result.success && result.verification`, `!result.success`, `result.code` 분기.  
- try/catch까지 겹쳐 한 함수가 7~8단계 깊이로 읽기 어려움.

**개선**: 경로별로 함수 분리.

```ts
const handleTossPay = async (payReq: PaymentRequest) => {
  const result = await requestPayment(payReq);
  if (!result.success) return { ok: false, cancel: result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL', message: result.message };
  const verification = await verifyTossPaymentOnServer(result.paymentId, plan.id);
  return { ok: verification.success, message: verification.error, needRefresh: true };
};

const handlePortOnePay = async (payReq: PaymentRequest) => {
  const result = await requestPaymentWithServerVerify(payReq);
  if (result.success && result.verification?.success) return { ok: true, needRefresh: true };
  if (!result.success) return { ok: false, cancel: result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL', message: result.message, configMissing: result.code === 'CONFIG_MISSING' };
  return { ok: false, message: result.verification?.error };
};

const handlePay = useCallback(async () => {
  if (isProcessing) return;
  setIsProcessing(true);
  const payReq = { ... };
  try {
    const handler = isTossApp() ? handleTossPay : handlePortOnePay;
    const outcome = await handler(payReq);
    if (outcome.cancel) return;
    if (outcome.ok) {
      alert(PAY_MSGS[lang].success);
      onPaymentSuccess?.();
      onClose();
    } else {
      alert(outcome.configMissing ? PAY_MSGS[lang].configMissing : PAY_MSGS[lang].failed(outcome.message ?? PAY_MSGS[lang].unknown));
      if (outcome.needRefresh) { onPaymentSuccess?.(); onClose(); }
    }
  } catch {
    alert(PAY_MSGS[lang].processingError);
  } finally {
    setIsProcessing(false);
  }
}, [/* deps */]);
```

---

### 4. [높음] DRY 위반 — verify-payment / payment-webhook 만료일 계산 중복

**위치**:  
- `verify-payment/index.ts` 44~46행: `getServiceExpiresAt()` → 30일 고정  
- `payment-webhook/index.ts` 86~89행: 동일 `getServiceExpiresAt()` 30일 고정  

**문제**: 만료일 규칙이 두 파일에 복붙. "30*quantity" 도입 시 두 곳을 반드시 같이 수정해야 함.

**개선**: 공통 유틸로 분리(Edge 함수 공용 레이어 또는 한 파일에서 export).

```ts
// shared/subscription.ts 또는 각 함수 상단 공통
function getServiceExpiresAtFromNow(days: number = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
```

---

### 5. [중간] Dead Code / Unused — `types.ts`의 `PlanInfo.priceUSD`

**위치**: `services/payment/types.ts` 42행  
- `PlanInfo`에 `priceUSD` 필드 정의되어 있으나, `CheckoutModal`의 `plan` 타입은 로컬 인터페이스로 `price`, `priceFormatted`만 사용.  
- 전역 검색 시 `priceUSD` 사용처 없을 가능성 높음.

**개선**: 실제로 사용하지 않으면 `PlanInfo`에서 제거하거나, 사용할 곳이 있으면 명시적으로 사용. 사용처 없으면 제거 권장.

---

### 6. [중간] DRY 위반 — 플랜별 스타일(isPro) 반복

**위치**: `CheckoutModal.tsx`  
- `isPro ? 'blue-...' : 'amber-...'` 패턴이 카드, 버튼, 아이콘, 텍스트 등 10곳 이상 반복.

**문제**: 색/테마 변경 시 다수 수정, 가독성 저하.

**개선**: 플랜별 스타일 객체로 추출.

```ts
const PLAN_STYLES = {
  pro: {
    card: 'bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20',
    iconBg: 'bg-blue-500/10 border border-blue-400/30',
    checkBg: 'bg-blue-400/20 border border-blue-400',
    button: 'bg-blue-600 hover:bg-blue-500 ...',
    // ...
  },
  premium: { ... },
} as const;
// 사용: PLAN_STYLES[plan.id].card
```

---

### 7. [중간] Anti-pattern — key={i} 사용

**위치**: `CheckoutModal.tsx` 206행  
- `plan.features.map((feat, i) => <li key={i}> ...`

**문제**: features 순서 변경·중복 시 React reconciliation 오동작 가능. 리스트 아이템은 가능하면 안정적 id 사용 권장.

**개선**: `feat`가 고유하면 `key={feat}`, 아니면 `key={\`feat-${i}-${feat.slice(0,20)}\`}` 등으로 고유성 확보.

---

### 8. [중간] 인지 복잡도 — 모달 렌더 분기 (isInTossApp)

**위치**: `CheckoutModal.tsx` 384~391행  
- `return isInTossApp ? <TDSModal>{modalBody}</TDSModal> : <div className="fixed...">{modalBody}</div>`  
- `modalBody`는 150행 이상의 JSX 블록으로, 버튼만 토스/일반 분기하고 나머지는 공통.

**문제**: 한 컴포넌트가 "토스 모달 래퍼 vs 일반 래퍼"와 "토스 버튼 vs 일반 버튼"을 여러 곳에서 분기. 한 곳으로 모으면 유지보수 용이.

**개선**: 래퍼만 선택하는 작은 컴포넌트로 분리.

```ts
const ModalWrapper = ({ children, open, onClose }: { children: React.ReactNode; open: boolean; onClose: () => void }) =>
  isInTossApp ? <TDSModal open={open} onClose={onClose}>{children}</TDSModal> : (
    <div className="fixed inset-0 ...">
      <div className="absolute inset-0 ..." onClick={onClose} />
      <div className="relative ...">{children}</div>
    </div>
  );
```

---

### 9. [낮음] Dead Code — paymentService.ts의 `mapPayMethodToPortOne` 단순 매핑

**위치**: `paymentService.ts` 89~99행  
- `Record<PayMethod, string>`이 거의 1:1 매핑. 현재는 DRY라기보다 "한 곳에 모여 있음"의 이점만 있음.

**판단**: 유지해도 되고, 인라인 `payMethod` 전달로 줄일 수 있음. 우선순위 낮음.

---

### 10. [낮음] 서버 측 하드코딩 — BFF payment.ts 금액

**위치**: `server/src/routes/payment.ts` 62행  
- `amount: planId === "premium" ? 29900 : 9900`  
- 클라이언트·verify-payment는 5900/9900 환경변수 사용하는데 BFF만 상이한 값.

**문제**: 금액 불일치 시 토스 검증 실패, 수익/정책 불일치.

**개선**: `process.env.PLAN_AMOUNT_PRO` / `PLAN_AMOUNT_PREMIUM` 등 환경변수로 통일하고, premium이 29900이면 그 값도 env로 관리.

---

### 11. [낮음] verify-payment — expectedAmount 단일 값

**위치**: `verify-payment/index.ts` 134행  
- `const expectedAmount = PLAN_AMOUNTS[planId]`  
- quantity 도입 시 여기서 `PLAN_AMOUNTS[planId] * quantity`로 확장 필요(계획서와 동일).

**개선**: 계획서대로 요청 바디에 `quantity` 추가 후 `expectedAmount = PLAN_AMOUNTS[planId] * quantity` 및 만료일 `30*quantity` 일 적용.

---

## 리팩토링된 개선 코드 제안 (핵심만)

### A. CheckoutModal — 메시지·기간 라벨 상수화 + 플랜 스타일 추출

```ts
// 상수 (파일 상단 또는 constants)
const PLAN_DAYS = 30;
const getPlanDurationLabel = (isKo: boolean) =>
  isKo ? `이용권 (${PLAN_DAYS}일)` : `Plan (${PLAN_DAYS} days)`;

const PAY_MSGS = {
  ko: {
    success: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
    failed: (m: string) => `결제에 실패했습니다: ${m}`,
    verifyFailed: (e: string) => `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${e})`,
    configMissing: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    unknown: '알 수 없는 오류',
    processingError: '결제 처리 중 오류가 발생했습니다.',
  },
  en: {
    success: 'Payment complete! Your service is now active.',
    failed: (m: string) => `Payment failed: ${m}`,
    verifyFailed: (e: string) => `Payment succeeded but verification failed. It will be reflected shortly or contact support.\n(${e})`,
    configMissing: 'Payment is not configured. Please contact support.',
    unknown: 'Unknown error',
    processingError: 'An error occurred during payment.',
  },
} as const;

const PLAN_STYLES = {
  pro: {
    card: 'bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20',
    subtitle: 'text-blue-500 dark:text-blue-400',
    check: 'bg-blue-400/20 border border-blue-400',
    button: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30',
    total: 'text-blue-600 dark:text-blue-400',
    methodSelected: 'bg-blue-50 dark:bg-blue-500/10 border-blue-400 dark:border-blue-400 shadow-md shadow-blue-500/10',
    methodIcon: 'text-blue-500 dark:text-blue-400',
  },
  premium: {
    card: 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20',
    subtitle: 'text-amber-600 dark:text-amber-400',
    check: 'bg-amber-400/20 border border-amber-400',
    button: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black shadow-lg shadow-amber-500/30',
    total: 'text-amber-600 dark:text-amber-400',
    methodSelected: 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-400 shadow-md shadow-amber-500/10',
    methodIcon: 'text-amber-500 dark:text-amber-400',
  },
} as const;
```

### B. handlePay 단순화 — 경로별 함수 분리 후 조합

- 위 "개선 3" 참고: `handleTossPay`, `handlePortOnePay`로 나눈 뒤 `handlePay`에서는 `handler` 호출 → `outcome`에 따라 alert/onClose만 수행.
- 메시지는 `PAY_MSGS[lang]` 사용.

### C. features 리스트 key

- `key={i}` → `key={\`${i}-${feat.slice(0, 30)}\`}` 또는 feature가 고유하면 `key={feat}`.

### D. verify-payment / payment-webhook

- `getServiceExpiresAt(days?: number)` 공통화 (기본 30).
- quantity 도입 시 `expectedAmount = PLAN_AMOUNTS[planId] * quantity`, `getServiceExpiresAt(30 * quantity)`.

### E. BFF payment.ts

- 금액을 env에서 읽어와 `PLAN_AMOUNTS[planId]`와 동일한 값 사용.
- 만료일을 30일 고정이 아니라 (향후 quantity 대비) `addDays(now, 30 * quantity)` 형태로 확장 가능하게 유지.

---

## 요약

| 우선순위 | 항목 | 조치 |
|----------|------|------|
| 높음 | 30일/메시지 반복 | 상수·PAY_MSGS·getPlanDurationLabel 도입 |
| 높음 | handlePay 분기 과다 | handleTossPay / handlePortOnePay 분리 후 handlePay 단순화 |
| 높음 | Edge 만료일 중복 | getServiceExpiresAt(days) 공통화 |
| 중간 | PlanInfo.priceUSD | 미사용 시 제거 |
| 중간 | isPro 스타일 반복 | PLAN_STYLES 객체로 추출 |
| 중간 | key={i} | 안정적 key로 변경 |
| 중간 | 모달/버튼 분기 | ModalWrapper 등으로 래퍼 일원화 |
| 낮음 | BFF 금액 하드코딩 | env 상수로 통일 |

이 순서로 적용하면 유지보수성과 클린 코드 측면에서 개선 효과가 큽니다.
