# 결제 기능 개선 계획 (이용권 개수 선택 + 이용기간 표시)

> **요청**: 코드 변경 없이 계획·리스트·예상 오류만 정리

---

## 1. 개요

- **현재**: 이용권 30일 단위 1개만 구매 가능 (단가 × 1).
- **목표**:
  1. 이용권 **개수 선택** (1개=30일, 2개=60일, …) → 결제 금액 = 단가 × 개수.
  2. 결제 확인 모달에 **유료 서비스 이용 기간** 표시 (시작일~종료일).

### 1.1 토스 미니앱 적용 여부

**예, 토스 미니앱에도 동일하게 적용됩니다.**

| 구분 | 적용 내용 |
|------|-----------|
| **UI** | `CheckoutModal`은 웹(포트원)과 토스 앱에서 **같은 컴포넌트**를 씁니다. 개수 선택, 이용기간 표시, 총액 표시는 토스에서도 그대로 노출됩니다. |
| **결제 요청** | 토스 경로는 `requestPayment()` → `requestTossPayment({ orderName, totalAmount, planId })`를 사용합니다. 모달에서 `totalAmount = plan.price * quantity`, `orderName`에 일수 반영하면 토스에도 동일 금액·주문명이 전달됩니다. |
| **검증** | 토스는 **BFF** `POST /payment/toss/verify`로 검증합니다. 여기에 `quantity`를 요청 바디로 넘기고, BFF에서 **실제 결제 금액 = 단가×quantity** 검증 및 **만료일 = 30×quantity 일** 적용이 필요합니다. (계획서 3.2절 #7) |
| **정리** | 웹(포트원)은 Supabase `verify-payment` + `payment-webhook`, 토스는 Railway BFF 한 경로만 사용하므로, **BFF만 quantity·만료일 로직을 맞추면** 토스 미니앱에서도 개수 선택·이용기간이 동일하게 동작합니다. |

---

## 2. 기능 요구사항 정리

### 2.1 이용권 개수 선택

| 항목 | 내용 |
|------|------|
| 단위 | 30일/1개 (기존과 동일) |
| 선택 범위 | 1개 ~ N개 (N은 정책: 예 1~12 등) |
| 금액 | `단가(플랜별) × 개수` (예: PRO 5900×2 = 11,800원) |
| 이용 기간 | `결제일(또는 서버 처리일) 기준 30 × 개수` 일 |

- UI: 결제 모달 내 "이용 기간" 또는 "이용권 개수" 선택 (드롭다운/스텝퍼 등).
- 주문명/결제 요청: `orderName`, `totalAmount`에 개수 반영 (예: "PRO 이용권 (60일)", 11800).

### 2.2 결제 확인 모달 — 이용기간 표시

| 케이스 | 예시 |
|--------|------|
| 3.1에 30일(1개) 결제 | 이용기간: 3.1 ~ 3.30 |
| 2.28에 60일(2개) 결제 | 이용기간: 2.28 ~ 4.28 |

- **시작일**: 결제일(또는 “오늘”) — 클라이언트 표시용은 “오늘” KST 기준으로 통일 권장.
- **종료일**: 시작일 + (30 × 개수)일. 말일/윤년 등은 **날짜 산술**으로 처리 (예: 2.28 + 60일 = 4.28).

표시 위치: 모달 내 “주문 요약” 또는 “금액 정보” 위/아래에 “유료 서비스 이용 기간: YYYY.MM.DD ~ YYYY.MM.DD” 형태.

---

## 3. 수정이 필요한 영역 (리스트)

### 3.1 클라이언트

| # | 파일/영역 | 변경 내용 |
|---|-----------|-----------|
| 1 | `services/payment/types.ts` | `PaymentRequest`에 `quantity?: number` (기본 1), 필요 시 `planId`와 함께 서버로 전달 구조 확장 |
| 2 | `components/CheckoutModal.tsx` | (1) 이용권 개수 선택 UI 추가 (2) `totalAmount = plan.price * quantity`, `orderName`에 일수/개수 반영 (3) 이용기간 계산·표시 (시작일~종료일) |
| 3 | `App.tsx` | CheckoutModal에 넘기는 `plan` 객체는 단가만 유지; 개수/총액은 모달 내부 state로 처리하거나, 상위에서 quantity state 관리 후 plan + quantity 전달 |
| 4 | `services/payment/paymentService.ts` | `PaymentRequest` 확장에 맞춰 `orderName`, `totalAmount` 사용 (이미 totalAmount 쓰므로 quantity 반영된 값만 넘기면 됨). customData에 `quantity` 포함 시 서버 검증/만료일 계산에 활용 가능 |

### 3.2 서버 / Edge Functions

| # | 파일/영역 | 변경 내용 |
|---|-----------|-----------|
| 5 | `supabase/functions/verify-payment/index.ts` | (1) 요청 바디에 `quantity` 또는 금액으로 개수 역산 (2) **금액 검증**: `expectedAmount = PLAN_AMOUNTS[planId] * quantity` (3) **만료일**: `getServiceExpiresAt(days: number)` → `30 * quantity` 일 적용 |
| 6 | `supabase/functions/payment-webhook/index.ts` | (1) **금액 검증**: 단일 금액이 아닌 `PLAN_AMOUNTS[planId] * quantity` 허용. quantity는 customData에서 파싱 (2) **만료일**: 동일하게 `30 * quantity` 일 계산 (3) 기존 orders 단일 금액 매칭 로직 확장 |
| 7 | `server/src/routes/payment.ts` (BFF 토스 검증) | (1) 요청에 `quantity` 또는 총 금액으로 개수 역산 (2) 토스 결제 금액과 `단가*quantity` 비교 (3) 만료일 `+1 month` → `+ (30*quantity) days` 로 변경 |

### 3.3 DB / 스키마

| # | 항목 | 변경 내용 |
|---|------|-----------|
| 8 | `orders` 테이블 | 선택: `quantity` 컬럼 추가 또는 `metadata`에 `{ "quantity": 2 }` 저장. 만료일은 `user_profiles.subscription_expires_at`에 이미 있으므로 필수 스키마 변경은 없을 수 있음 |
| 9 | `user_profiles.subscription_expires_at` | 기존대로 사용. 서버에서 “시작일 + 30*quantity 일”로 설정 |

### 3.4 공통 로직

| # | 항목 | 내용 |
|---|------|------|
| 10 | 이용기간 계산 유틸 | 클라이언트·서버 공통: “시작일(KST 또는 UTC)+ N일” → 종료일. `dateUtils` 또는 `subscriptionUtils`에 `addDays(date, n)`, `formatPeriod(start, end)` 등 추가 검토 |
| 11 | 단가 상수 | 이미 `PLAN_AMOUNTS` / `VITE_PLAN_AMOUNT_*` 로 분리되어 있음. 개수만 곱하면 됨 |

---

## 4. 결제 확인 모달 “이용기간” 표시 로직

- **시작일**: 오늘(KST) 또는 결제 완료 시점(서버 시간). 모달에서는 “예정”이므로 **오늘(KST)** 로 통일해도 됨.
- **종료일**: 시작일 + (30 × 개수)일.
  - 2.28 + 60일 = 4.28 (말일·윤년은 JavaScript `Date` 또는 서버에서 일관된 규칙으로 처리).
- 표시 형식: `YYYY.MM.DD ~ YYYY.MM.DD` (한국어) / `MM/DD/YYYY - MM/DD/YYYY` (영문 등) — 기존 날짜 포맷 정책에 맞춤.

---

## 5. 이 로직 적용 시 예상 오류·리스크

### 5.1 보안·검증

| 위험 | 설명 | 대응 |
|------|------|------|
| 금액 위변조 | 클라이언트가 quantity를 크게 보내면 `expectedAmount`가 단가×quantity로 바뀌어야 함. 서버가 **반드시** `payment.amount.total === PLAN_AMOUNTS[planId] * quantity` 검증. quantity는 customData에서 읽되, **금액으로 역산해서 교차 검증** 권장 | verify-payment, payment-webhook, BFF 모두 “허용 금액 집합”을 `단가×1`, `단가×2`, … 로 두거나, quantity 상한(예: 12) 검사 |
| quantity 조작 | customData만 믿으면 악의적 사용자가 quantity=10 등으로 보낼 수 있음 | 서버는 **실제 결제 금액**으로만 만료일·개수 역산. 즉 `actualAmount / PLAN_AMOUNTS[planId]`가 정수인지, 그리고 그 값으로 만료일 계산 |
| 중복 결제 / 멱등성 | 기존과 동일. payment_id 기준 중복 처리 방지 유지 | verify-payment, webhook 모두 기존 로직 유지 |

### 5.2 일관성

| 위험 | 설명 | 대응 |
|------|------|------|
| verify-payment vs webhook | verify-payment는 `quantity` 받아서 만료일 계산, webhook은 customData 없을 수 있음. webhook만 오면 quantity를 모름 | webhook 경로: **금액으로 quantity 역산** (total / 단가 = 정수인지 검사 후 사용). 동일한 `getServiceExpiresAt(quantity)` 규칙 사용 |
| 기존 30일 고정 로직 | 현재 `getServiceExpiresAt()`는 30일 고정 | `getServiceExpiresAt(days: number)`로 변경하고, `days = 30 * quantity`, quantity 기본 1 |
| BFF 토스 | 현재 `amount: planId === "premium" ? 29900 : 9900` 등 하드코딩 | 단가 상수화 + quantity 곱한 값과 토스 응답 금액 비교. 만료일도 30*quantity 일로 통일 |

### 5.3 UX·비즈니스

| 위험 | 설명 | 대응 |
|------|------|------|
| 개수 상한 | 너무 큰 개수 선택 시 부담 또는 사기 가능성 | UI에서 상한(예: 12개) 설정, 서버에서도 상한 검사 |
| 환불 시 기간 | “60일 중 30일 사용 후 환불” 등 부분 환불 정책 | 정책 정의 후 cancel-subscription 등에서 “이용 일수” 기준 환불 비율 적용 검토 (현 계획은 단발성 전액/전액아님 정도로 보임) |
| 표시와 실제 차이 | 모달 “오늘” 기준 표시 vs 서버는 결제 완료 시각 기준 | 서버 기준이 진실 소스. 모달은 “예상 이용기간”으로 문구 통일 |

### 5.4 기술적

| 위험 | 설명 | 대응 |
|------|------|------|
| 타임존 | 만료일을 “KST 23:59”로 할지 “UTC 00:00”로 할지 | 서버·클라이언트 동일 규칙 (예: UTC 저장, 표시만 KST 변환) |
| 말일/윤년 | 1.31 + 30일 = 3.2 등 | `Date` 또는 dayjs 등으로 “날짜 + N일” 계산하면 대부분 해결. Edge 함수와 클라이언트 동일 알고리즘 권장 |
| orders 테이블 | amount는 총액 저장 시 이미 있음. quantity만 추가하면 됨 | metadata 또는 quantity 컬럼. 기존 단일 건은 quantity=1로 해석 |

---

## 6. 구현 순서 제안

1. **타입·상수**: `PaymentRequest.quantity`, 서버 허용 금액/만료일 계산 규칙 정의.
2. **서버 검증**: verify-payment에서 금액 = 단가×quantity, 만료일 = 30×quantity 일. (기존 1개 결제는 quantity=1로 호환.)
3. **payment-webhook**: customData 또는 금액 역산으로 quantity 확정, 동일 만료일 로직.
4. **BFF 토스**: 금액·만료일 로직 정렬.
5. **CheckoutModal**: 개수 선택 UI, 총액·이용기간 표시, 결제 요청에 quantity 반영.
6. **App.tsx**: plan 전달 방식 유지 또는 quantity 초기값만 전달.
7. **테스트**: 1개/2개 결제, verify vs webhook, 토스 경로, 환불 플로우.

---

## 7. 체크리스트 요약

- [ ] `PaymentRequest`에 quantity (기본 1).
- [ ] CheckoutModal: 개수 선택, 총액 = 단가×개수, 이용기간 표시(시작일~종료일).
- [ ] verify-payment: 금액 검증(단가×quantity), 만료일 30×quantity 일.
- [ ] payment-webhook: 금액/quantity 역산 및 동일 만료일 로직.
- [ ] BFF 토스: 금액·만료일을 quantity 기반으로 통일.
- [ ] 단가 상수 일원화, quantity 상한(클라이언트·서버).
- [ ] 이용기간 날짜 계산 유틸(공통) 및 말일/윤년 처리.
- [ ] 기존 1개 결제 호환(quantity=1 또는 생략 시 30일).

이 문서는 코드 변경 없이 계획과 예상 오류만 기술한 것입니다. 구현 시 위 리스트와 5장 예상 오류를 참고해 적용하면 됩니다.
