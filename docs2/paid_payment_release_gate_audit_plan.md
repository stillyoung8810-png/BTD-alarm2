---
name: 유료 결제 출시 게이트 감사 계획서
overview: Toss IAP 유료 결제를 유지한 채 출시할 수 있는지 판단하기 위한 P0/P1 안정성 게이트와 검증 절차를 정의합니다.
stage: pre-release-gate
status: draft
decision_owner: release
---

# 유료 결제 출시 게이트 감사 계획서

## 결론

유료 결제는 **게이트를 통과하면 유지한 채 출시 가능**합니다. 단, P0 게이트는 예외 없이 전부 통과해야 하며 하나라도 실패하면 출시 전 결제 CTA를 닫고 무료/비결제 기능만 출시합니다.

이 문서의 목적은 “결제를 켜도 되는가”를 감으로 판단하지 않고, 자동 테스트·수동 스모크·운영 롤백 기준으로 결정하는 것입니다.

## 이번 릴리스 결제 범위

이번 릴리스는 **B안**으로 진행합니다.

- 활성 결제 경로는 Toss IAP PRO 30일권뿐입니다.
- 기존 카드 결제/BFF `/payment/toss/verify`/Supabase Edge `payment-webhook`, `verify-payment` 경로는 운영 라우팅, 환경변수, 배포 설정에서 비활성임을 별도 확인합니다.
- 비활성 경로가 외부에서 호출 가능하거나 운영 secret/env가 살아 있으면 결제 유지 출시를 금지합니다.
- 비활성 경로의 가격 fallback 제거는 이번 릴리스 코드 보강 범위가 아니며, 대신 “외부 호출 불가/운영 비활성”을 P0로 검증합니다.

## 현재 결제 구조 요약

| 구간 | 파일 | 역할 |
|---|---|---|
| 가격/플랜 SSOT | `constants/membership.ts`, `services/payment/types.ts` | PRO 30일권 가격·수량·기간 정의 |
| 결제 모달 | `components/CheckoutModal.tsx` | Toss IAP 결제 CTA, one-click mutex, 결과 안내 |
| IAP 브리지 | `services/payment/tossIapService.ts` | `@apps-in-toss/web-framework` IAP 호출, 서버 검증, 미결 주문 복원 |
| 서버 IAP 검증 | `server/src/routes/payment.ts` | `/payment/toss/iap-verify`, Toss 주문 상태 조회, SKU 검증 |
| Fulfillment | `server/src/services/paymentFulfillment.ts` | 주문 claim, 중복 처리 방지, 구독 티어/만료일/한도 반영 |
| 앱 권한 반영 | `App.tsx`, `utils/subscriptionUtils.ts` | 결제 성공 후 프로필 재조회, max portfolio/alarm/광고/사용량 제한 반영 |
| CTA 노출 | `components/Pricing.tsx`, `components/auth/ProfileView.tsx`, `App.tsx` | 결제 진입점과 인증 가드 |
| 결제/환불 문구 | `constants/paymentCheckoutMessages.ts`, `constants/messages/pricingMessages.ts` | 오류·환불·CTA 문구 |
| 구현 스니펫 | `docs2/paid_payment_release_gate_refactor_snippets.md` | 출시 차단 이슈를 해결하기 위한 최소 변경안 |

## 현재 알려진 출시 차단 이슈

| 중요도 | 이슈 | 영향 | 해결 기준 |
|---|---|---|---|
| P0 | `components/auth/ProfileView.tsx`에서 PRO 사용자의 업그레이드 클릭이 `premium` 요청을 만들 수 있음 | 사용자는 Premium을 기대하지만 `CheckoutModal`은 PRO 30일권만 결제해 결제 민원이 발생할 수 있음 | `premium` 요청이 Checkout으로 들어가는 모든 경로 차단 |
| P0 | 결제 CTA kill switch가 명시되어 있지 않음 | 운영 장애 시 결제만 즉시 닫기 어렵고, 전체 앱 재배포/롤백에 의존하게 됨 | `VITE_ENABLE_IAP_CHECKOUT` 등 fail-closed 스위치 도입 |
| P0 | 활성 Toss IAP 가격 환경변수 누락 또는 비정상 숫자 시 fallback 가격으로 결제창·지급 경로가 열릴 수 있음 | 운영 가격 확정 없이 의도하지 않은 가격으로 결제·권한 지급이 발생할 수 있음 | `VITE_PLAN_AMOUNT_PRO`/`PLAN_AMOUNT_PRO` 누락 또는 0 이하/비정수/비정상 숫자/상한 초과 시 Toss IAP CTA와 서버 지급 모두 fail-closed |
| P0 | 가격 env 검증 로직이 활성 경로 안에서 복붙되어 불일치할 수 있음 | 프론트는 막고 BFF IAP는 허용하는 식의 결제 정책 충돌이 생길 수 있음 | 활성 Toss IAP 경로는 공유 유틸을 사용하고 route/component 내부에 `Number(...)`/fallback 숫자/정규식 검증을 새로 쓰지 않음 |
| P0 | 기존 카드/BFF verify/Edge 결제 경로가 운영에서 살아 있을 수 있음 | Toss IAP만 출시한다고 판단했는데 비활성 경로로 결제·지급이 열릴 수 있음 | 기존 카드/Edge 경로는 운영 라우팅·환경변수·배포 설정에서 비활성임을 확인 |
| P0 | 결제 진입점 일부가 `setCheckoutPlan`을 직접 호출할 수 있음 | kill switch 또는 지원 플랜 검증을 우회해 화면별로 다른 결제 동작이 발생할 수 있음 | 모든 결제 진입을 단일 `handleSelectCheckoutPlan` 게이트로 통과 |
| P0 | IAP 서버 검증의 `success: false`/`inProgress` 응답을 프론트가 HTTP 2xx만 보고 성공으로 오인할 수 있음 | 권한 지급이 끝나지 않았는데 Toss `completeProductGrant`가 호출되어 결제-권한 상태가 어긋날 수 있음 | 프론트는 JSON `success === true`만 성공으로 인정하고, 서버는 처리 중/실패를 non-2xx로 반환 |
| P0 | 프론트 IAP 계약 테스트가 실패 경로만 보고 정상 성공 경로를 고정하지 않을 수 있음 | 보강 중 정상 결제까지 실패 처리되어 실제 고객이 결제 후 권한을 받지 못할 수 있음 | `{ ok: true, success: true }`일 때만 `completeProductGrant`가 호출되는 정상 경로 테스트 추가 |
| P0 | Toss IAP 주문 생성 브리지가 직접 호출될 수 있음 | SDK가 동기 예외를 던질 때 결제 시작 실패가 일관된 실패 경로로 수렴하지 않을 수 있음 | `createOneTimePurchaseOrder`, `completeProductGrant`, `getPendingOrders` 모두 `Promise.resolve`/`wrapBridgeCall`로 catch 경로에 수렴 |
| P0 | `/payment/toss/iap-verify` 라우트 테스트가 부족함 | SKU/주문 상태/toss_user_key 검증 누락을 자동으로 잡지 못함 | BFF route injection 테스트 추가 |
| P0 | 결제 라우트 테스트 mock이 Vitest hoisting 규칙을 위반할 수 있음 | 테스트가 실행 전에 실패하거나 출시 게이트에서 빠질 수 있음 | `vi.mock` factory가 참조하는 mock은 `vi.hoisted`로 선언 |
| P0 | 운영 DB의 `claim_order_processing` RPC 배포 확인 절차가 없음 | 중복 지급 방지의 핵심 장치가 운영 DB에 없을 수 있음 | 운영 DB 확인 SQL 통과 |

## 출시 의사결정

### 결제 유지 출시 허용

아래 조건을 모두 만족하면 유료 결제를 유지하고 출시합니다.

- P0 게이트 100% 통과
- P1 게이트 100% 통과 또는 release owner의 명시적 예외 승인
- 결제 실패/취소/권한 지연 시 사용자가 갇히지 않음
- 중복 클릭/중복 검증/미결 주문 복원 테스트 통과
- 실제 Toss 미니앱 환경에서 성공 결제 1건, 취소 1건, 서버 검증 실패 1건을 확인
- 결제 CTA를 즉시 숨길 수 있는 kill switch 확인

### 결제 닫고 출시

아래 중 하나라도 해당하면 유료 결제는 닫고 출시합니다.

- 결제는 성공했지만 `user_profiles` 권한 반영이 실패하거나 재현 불가 상태가 있음
- 중복 결제 또는 중복 권한 지급 가능성이 있음
- `VITE_RAILWAY_BFF_URL`, Toss IAP SKU, 서버 환경변수, 가격 SSOT 중 하나라도 운영값 확인이 안 됨
- 결제 실패/취소 후 모달이 닫히지 않거나 재시도 불가능함
- Toss 실제 WebView에서 버튼 잘림, 키보드/하단 inset 겹침, 결제 CTA 접근 불가가 발생함
- 환불 문의/약관/고객 지원 경로가 앱 내에서 확인되지 않음
- `premium` 결제 요청이 PRO IAP 결제로 이어질 수 있음
- kill switch 없이 결제 CTA를 닫을 방법이 배포 롤백뿐임
- `/payment/toss/iap-verify`의 `success: false`, `inProgress`, 202/409/500 응답이 프론트에서 성공 결제로 처리될 수 있음
- `App.tsx` 외부 경로가 중앙 결제 게이트를 우회해 `checkoutPlan`을 직접 열 수 있음
- `VITE_PLAN_AMOUNT_PRO` 또는 `PLAN_AMOUNT_PRO` 누락/0 이하/비정수/비정상 숫자/상한 초과 상태에서 Toss IAP 결제창이나 지급 경로가 열릴 수 있음
- 기존 카드/BFF verify/Edge 결제 경로가 운영에서 외부 호출 가능하거나 운영 secret/env가 살아 있음
- Toss IAP `createOneTimePurchaseOrder` 동기 예외가 통합 실패 처리로 수렴하지 않음

## P0 게이트

### P0-0. 결제 CTA kill switch와 중앙 진입 게이트

검증 대상:

- `vite-env.d.ts`
- `App.tsx`
- `components/TabContent.tsx`
- `components/Pricing.tsx`
- `components/AuthModals.tsx`
- `components/auth/ProfileView.tsx`

필수 통과 기준:

- `VITE_ENABLE_IAP_CHECKOUT`가 명시적으로 `true`일 때만 결제 CTA가 열립니다.
- `VITE_PLAN_AMOUNT_PRO`가 비어 있거나 0 이하/비정수/비정상 숫자/상한 초과이면 `VITE_ENABLE_IAP_CHECKOUT=true`여도 결제 CTA는 열리지 않습니다.
- 환경변수가 없거나 `false`이면 결제 CTA는 Checkout을 열지 않습니다.
- kill switch가 꺼져도 로그인, 포트폴리오, 알림, 기존 유료 권한 조회는 영향받지 않습니다.
- 운영 장애 시 새 앱 심사 없이도 웹 배포/환경변수 반영으로 결제 진입을 닫을 수 있습니다.
- `Pricing`, `ProfileView`, `TabContent`, `AuthModals`에서 Checkout을 여는 모든 경로는 `App.tsx`의 단일 `handleSelectCheckoutPlan`을 통과합니다.
- `setCheckoutPlan`은 `handleSelectCheckoutPlan`, Checkout `onClose`, `onPaymentSuccess` 외부로 직접 전달하지 않습니다.
- kill switch 차단 또는 미지원 플랜 차단 시 조용히 무시하지 않고, 기존 i18n 메시지를 사용하는 오류 toast 또는 인증 흐름처럼 사용자에게 안전한 결과가 있어야 합니다.

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S1. 결제 CTA kill switch와 중앙 진입 게이트`

### P0-1. 결제 금액·SKU 불일치 차단

검증 대상:

- `TOSS_IAP_FIXED_PLAN_ID`는 `pro` 고정
- `TOSS_IAP_FIXED_QUANTITY`는 `1` 고정
- Toss IAP SKU는 서버 `/payment/toss/iap-verify`에서 클라이언트 값을 믿지 않고 재검증
- 프론트 `VITE_PLAN_AMOUNT_PRO`와 서버 `PLAN_AMOUNT_PRO`가 동일
- `constants/membership.ts`
- `server/src/routes/payment.ts`
- 프론트/BFF 런타임별 가격 env 공유 유틸

필수 통과 기준:

- 서버가 알 수 없는 SKU를 거부합니다.
- 서버가 Toss 주문 상태 `COMPLETED` 또는 `PURCHASED` 외 상태를 거부합니다.
- 가격이 바뀌어도 프론트/서버 환경변수 불일치를 출시 전에 탐지합니다.
- `/payment/toss/iap-verify` 라우트 테스트가 SKU 불일치, 미완료 상태, `toss_user_key` 누락, fulfillment 실패 응답을 모두 검증합니다.
- `/payment/toss/iap-verify` 라우트 테스트는 `PLAN_AMOUNT_PRO`를 각 테스트에서 고정값으로 주입하고 종료 후 원복해 로컬/CI 환경값에 의존하지 않습니다.
- 운영 `VITE_PLAN_AMOUNT_PRO` 또는 `PLAN_AMOUNT_PRO`가 비어 있거나 0 이하/비정수/비정상 숫자/상한 초과이면 결제 CTA와 서버 지급을 모두 열지 않습니다. 가격 fallback에 의존한 유료 출시를 금지합니다.
- 서버는 `PLAN_AMOUNT_PRO`가 없거나 0 이하/비정수/비정상 숫자/상한 초과이면 `/payment/toss/iap-verify`에서 `success: false` non-2xx를 반환하고 fulfillment를 호출하지 않습니다.
- `constants/membership.ts`와 BFF `/payment/toss/iap-verify`의 가격 fallback은 활성 Toss IAP 출시 경로에서 사용하지 않습니다.
- `PLAN_AMOUNT_PRO`와 `VITE_PLAN_AMOUNT_PRO`는 0보다 큰 안전한 정수이며, 문서화된 상한 이하입니다.
- 활성 Toss IAP 가격 env 검증은 route/component 안에 복붙하지 않고 런타임별 공유 유틸만 사용합니다.
- 활성 Toss IAP 경로에 `Number(process.env.PLAN_AMOUNT_... ?? fallback)` 패턴이 남아 있으면 출시하지 않습니다.

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S0. 가격 env 파서 단일화`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S3. IAP verify와 bridge 성공 계약 보강`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S4. 결제 라우트 테스트`

권장 자동 테스트:

```powershell
npx vitest run "utils/paymentPlanAmount.test.ts"
npm --prefix server run test -- paymentPlanAmount.test.ts
npm --prefix server run test -- paymentFulfillment.test.ts
npm --prefix server run test -- payment.iapVerify.test.ts
```

추가 확인:

- 운영 `VITE_PLAN_AMOUNT_PRO`
- 운영 `PLAN_AMOUNT_PRO`
- Toss 콘솔 IAP SKU
- `services/iap/iapConstants.ts` 또는 서버 `IAP_PRODUCTS.PRO`

### P0-1A. 기존 카드/Edge 결제 경로 비활성 확인

검증 대상:

- BFF `/payment/toss/verify`
- Supabase Edge `payment-webhook`
- Supabase Edge `verify-payment`
- 프론트 카드/PortOne/Toss Payments 결제 CTA 또는 라우팅
- 운영 결제 관련 secret/env

필수 통과 기준:

- 이번 릴리스에서 외부 사용자가 기존 카드/Edge 결제 경로로 결제를 시작할 수 없습니다.
- 기존 카드/Edge 결제 CTA, 라우팅, 배포 엔드포인트, webhook 연결이 운영에서 비활성입니다.
- `TOSS_PAYMENTS_SECRET_KEY`, PortOne secret, Edge function verify/webhook secret 등 기존 결제 경로용 운영 secret/env가 배포 환경에서 결제 가능 상태로 남아 있지 않습니다.
- Toss/PortOne 콘솔 webhook 또는 redirect가 Supabase Edge 기존 결제 함수로 연결되어 있지 않습니다.
- 기존 카드/Edge 경로가 활성으로 확인되면 B안 전제 위반이므로 결제 CTA를 닫고 출시합니다.

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S7. B안 비활성 결제 경로 운영 확인`

### P0-2. 중복 결제·중복 지급 방지

검증 대상:

- `CheckoutModal.tsx`의 `isExecutingRef`
- `services/payment/tossIapService.ts`의 `isSettled`
- `services/payment/tossIapService.ts`의 `createOneTimePurchaseOrder` 래핑
- `services/payment/tossIapService.ts`의 서버 검증 응답 파싱
- `server/src/routes/payment.ts`의 IAP verify 응답 status code
- `server/src/services/paymentFulfillment.ts`의 `claim_order_processing`
- `fulfillPaidOrder`의 `alreadyProcessed`/`inProgress`

필수 통과 기준:

- 결제 버튼 연타로 IAP 요청이 2번 시작되지 않습니다.
- `createOneTimePurchaseOrder`가 동기 예외를 던져도 `PRODUCT_NOT_GRANTED_BY_PARTNER` 또는 통합 실패 toast 경로로 수렴하고 loading이 풀립니다.
- 동일 `orderId` 서버 검증 재호출 시 권한은 1번만 반영됩니다.
- 동시 검증 요청 중 하나만 처리권을 얻습니다.
- 서버가 `inProgress` 또는 `success: false`를 반환할 때 HTTP 2xx로 성공처럼 응답하지 않습니다.
- 프론트는 `/payment/toss/iap-verify`의 HTTP 성공만으로 지급 성공을 판단하지 않고, JSON 본문 `success === true`일 때만 Toss `completeProductGrant`를 호출합니다.
- 프론트 계약 테스트는 `{ ok: true, body: { success: true } }` 정상 경로에서만 Toss `completeProductGrant`가 호출되고 최종 성공으로 끝나는지 검증합니다.
- `services/payment/tossIapService.test.ts`는 `VITE_RAILWAY_BFF_URL`을 `tossIapService` import 전에 주입하도록 `vi.stubEnv`와 동적 import를 사용합니다.
- `services/payment/tossIapService.test.ts`의 IAP 성공 이벤트 mock은 `processProductGrant` promise rejection을 명시적으로 catch해 unhandled rejection을 남기지 않습니다.
- `services/payment/tossIapService.test.ts`는 개별 `npx vitest run`뿐 아니라 기본 `npm test` include에도 포함됩니다.
- `server/src/routes/payment.iapVerify.test.ts`의 `vi.mock` factory가 참조하는 mock 함수는 `vi.hoisted`로 선언합니다.
- 운영 DB에 `orders.status = processing` 체크 제약과 `claim_order_processing` RPC가 배포되어 있습니다.

권장 자동 테스트:

```powershell
npm --prefix server run test -- paymentFulfillment.test.ts
npx vitest run "services/payment/tossIapService.test.ts"
```

운영 DB 확인 SQL:

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_order_processing';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.orders'::regclass
  and conname = 'orders_status_check';
```

추가로 만들면 좋은 테스트:

```ts
// 목표: 같은 orderId를 동시에 두 번 verify할 때 하나는 success, 하나는 alreadyProcessed/inProgress가 되어야 합니다.
// 목표: inProgress 또는 success:false 응답은 프론트에서 PRODUCT_NOT_GRANTED_BY_PARTNER로 처리되고 completeProductGrant를 호출하지 않아야 합니다.
// 목표: success:true 응답만 completeProductGrant 호출과 최종 성공으로 이어져야 합니다.
// 목표: createOneTimePurchaseOrder 동기 예외는 처리되지 않은 예외가 아니라 안전한 실패 결과로 수렴해야 합니다.
```

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S3. IAP verify와 bridge 성공 계약 보강`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S4. 결제 라우트 테스트`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S5. 프론트 IAP verify 응답 계약 테스트`

### P0-3. 결제 성공 후 권한 반영

검증 대상:

- `server/src/services/paymentFulfillment.ts`
- `App.tsx`의 `onPaymentSuccess`
- `utils/subscriptionUtils.ts`

필수 통과 기준:

- 결제 성공 후 `subscription_tier = pro`
- `subscription_status = active`
- `subscription_expires_at`이 현재 시각 기준 30일 뒤로 설정
- `max_portfolios = 5`
- `max_alarms = 10`
- 앱에서 프로필 재조회 후 유료 제한이 즉시 반영

자동 테스트:

```powershell
npm --prefix server run test -- paymentFulfillment.test.ts
npm test -- hooks/usePortfolioMutations.test.ts
```

수동 스모크:

1. Free 계정으로 로그인합니다.
2. PRO 30일권 결제를 완료합니다.
3. 결제 모달이 닫힌 뒤 프로필이 재조회되는지 확인합니다.
4. 포트폴리오 3개 이상 생성 가능 여부를 확인합니다.
5. 알람 슬롯이 10개까지 열리는지 확인합니다.

### P0-4. 실패/취소/지연 복구

검증 대상:

- Toss IAP `USER_CANCELED`
- `PRODUCT_NOT_GRANTED_BY_PARTNER`
- `restorePendingIapOrders`
- Checkout error toast
- `/payment/toss/iap-verify`의 `success` JSON body
- `/payment/toss/iap-verify`의 non-2xx 실패 응답
- Toss IAP bridge 동기 예외
- 환불 안내 문구

필수 통과 기준:

- 사용자 취소는 결제 실패/오류로 오인되지 않습니다.
- 서버 지급 실패 시 “지급 지연” 안내가 표시됩니다.
- 서버 검증 응답이 HTTP 2xx라도 JSON `success !== true`이면 결제 성공으로 처리하지 않습니다.
- 서버 지급 처리 중(`inProgress`)은 최종 성공이 아니며 Toss `completeProductGrant`를 호출하지 않습니다.
- `createOneTimePurchaseOrder`가 즉시 예외를 던져도 앱이 멈추지 않고 실패 안내 및 재시도 가능 상태로 돌아옵니다.
- 미결 주문은 앱 재진입 시 복구 루트가 있습니다.
- 실패 후 결제 버튼이 영구 loading 상태로 남지 않습니다.

수동 스모크:

1. 결제창에서 취소합니다.
2. 앱이 정상 상태로 돌아오는지 확인합니다.
3. 네트워크 차단 또는 BFF 오류 상황에서 실패 안내가 표시되는지 확인합니다.
4. 앱 재실행 시 미결 주문 복구가 호출되는 경로를 확인합니다.

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S3. IAP verify와 bridge 성공 계약 보강`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S5. 프론트 IAP verify 응답 계약 테스트`

### P0-5. 결제 모달 접근성·작은 화면 안정성

검증 대상:

- `components/CheckoutModal.tsx`
- `components/tds/TDSModal.tsx`
- `components/ui/constants.ts`
- `__tests__/modalLayoutContract.test.ts`

필수 통과 기준:

- `320px x 568px`에서 결제 버튼이 화면 밖으로 사라지지 않습니다.
- 본문 스크롤이 가능하고 닫기 버튼이 접근 가능합니다.
- safe-area 하단 겹침이 없습니다.
- 결제 버튼이 loading 중 중복 클릭되지 않습니다.

자동 테스트:

```powershell
npx vitest run "__tests__/modalLayoutContract.test.ts"
```

권장 E2E:

```powershell
npm run test:e2e -- --grep "checkout"
```

테스트가 없다면 Playwright로 다음 계약을 추가합니다.

- viewport `320 x 568`
- 가격 페이지에서 PRO CTA 클릭
- Checkout modal panel bottom <= viewport bottom
- Pay button bounding box가 viewport 안에 존재
- body scroll 후 pay/cancel/close click 가능

### P0-6. 지원하지 않는 Premium 결제 경로 차단

검증 대상:

- `App.tsx`의 `checkoutPlan: SupportedIapCheckoutPlan | null`
- `App.tsx`의 `handleSelectCheckoutPlan`
- `components/TabContent.tsx`의 `onSelectCheckoutPlan`
- `components/auth/ProfileView.tsx`의 `nextPlan`
- `components/Pricing.tsx`의 PRO CTA
- `components/CheckoutModal.tsx`의 Toss IAP 고정 PRO 결제

현재 Toss IAP Phase 1은 PRO 30일권만 허용합니다. 따라서 `premium` 요청이 Checkout으로 들어오면 사용자는 Premium 업그레이드를 기대했는데 실제로는 PRO 30일권을 결제할 수 있습니다. 이 상태는 결제 금액/상품 기대값이 어긋나는 문제라 출시 전 반드시 차단해야 합니다.

필수 통과 기준:

- Free 사용자의 결제 CTA는 PRO 30일권으로만 연결됩니다.
- PRO 사용자의 Premium 업그레이드 CTA가 Toss IAP Phase 1에서 노출되지 않거나, 명확히 “준비 중” 상태로 막힙니다.
- `checkoutPlan === 'premium'` 상태로 `CheckoutModal`이 열리는 경로가 없습니다.
- 결제 모달에 표시되는 플랜명, 금액, 서버 검증 SKU가 모두 PRO로 일치합니다.
- `App.tsx`에서 `planId !== TOSS_IAP_FIXED_PLAN_ID` 요청은 Checkout을 열지 않습니다.
- `TabContent`와 `AuthModals`의 props 타입도 지원 플랜(`'pro'`)만 받도록 좁혀 타입 레벨에서 premium 직접 전달을 막습니다.
- 미지원 플랜 요청은 조용한 무동작이 아니라 기존 i18n 오류 toast로 사용자에게 안전하게 종료됩니다.

권장 신규 자동 테스트:

현재 별도 `ProfileView`/`Pricing` CTA 테스트 파일이 없다면, 런타임 계약 테스트나 컴포넌트 테스트에 다음 조건을 추가합니다.

```ts
// 목표: Toss IAP Phase 1에서는 CheckoutModal이 premium 요청으로 열리지 않아야 합니다.
```

구현 스니펫:

- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S1. 결제 CTA kill switch와 중앙 진입 게이트`
- `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S2. Premium 경로 차단`

### P0-7. BFF 서버 빌드·타입 검증

검증 대상:

- `server/src/routes/payment.ts`
- `server/src/services/paymentFulfillment.ts`
- `server/package.json`

필수 통과 기준:

- BFF 서버 타입 체크가 통과합니다.
- BFF 서버 빌드가 통과합니다.
- 결제 라우트 테스트가 통과합니다.

자동 테스트:

```powershell
npm --prefix server run typecheck
npm --prefix server run build
npm --prefix server run test
```

## P1 게이트

### P1-1. CTA 노출 조건

검증 대상:

- `components/Pricing.tsx`
- `App.tsx`
- `currentTier`
- `onUpgradePlan`

통과 기준:

- Free 사용자에게만 PRO 업그레이드 CTA가 표시됩니다.
- PRO 사용자는 “기간 연장”으로 표시됩니다.
- Premium 사용자는 PRO 구매 CTA가 비활성/포함 상태입니다.
- PRO -> Premium 업그레이드 CTA는 현재 Toss IAP Phase 1에서 결제창을 열지 않습니다.
- 로그아웃 상태에서 결제 CTA를 눌렀을 때 결제창이 아니라 인증 흐름으로 이동합니다.

### P1-2. 환불/약관/고객지원

검증 대상:

- `constants/paymentCheckoutMessages.ts`
- `components/RefundPolicy.tsx`
- `Footer`의 약관/환불 링크

통과 기준:

- 결제 모달에 단발성 30일권, 자동 갱신 없음, 환불 문의 이메일이 표시됩니다.
- 이용 기록 발생 시 환불 제한 안내가 표시됩니다.
- 앱 하단 또는 결제 화면에서 약관/환불 정책 접근이 가능합니다.

### P1-3. 운영 환경변수

필수 운영값:

- `VITE_ENABLE_IAP_CHECKOUT=true`
- `VITE_RAILWAY_BFF_URL`
- `PLAN_AMOUNT_PRO`
- `VITE_PLAN_AMOUNT_PRO`
- `SUPABASE_SERVICE_ROLE_KEY`
- Toss IAP 앱/상품 설정
- Toss 사용자 식별용 `toss_user_key` 저장 경로

비활성 확인값:

- 기존 카드/PortOne/Toss Payments 결제용 운영 env/secret은 결제 가능 상태로 배포되어 있지 않습니다.
- Supabase Edge `payment-webhook`, `verify-payment`는 운영 라우팅/webhook 대상에서 제외되어 있습니다.

통과 기준:

- 운영 배포 환경에서 값이 비어 있지 않습니다.
- `PLAN_AMOUNT_PRO`와 `VITE_PLAN_AMOUNT_PRO`는 0보다 큰 안전한 정수이며 문서화된 상한 이하입니다.
- staging과 production 값이 의도한 차이를 제외하고 일치합니다.
- 활성 Toss IAP 경로는 가격 fallback에 의존하지 않습니다.
- 기존 카드/Edge 결제 경로 비활성 상태가 운영 담당자 1명 이상에게 별도 확인되었습니다.

### P1-4. 관측·장애 대응

필수 로그:

- IAP 주문 생성 실패
- 서버 검증 실패
- SKU 불일치
- 권한 지급 실패
- 중복 처리 inProgress/alreadyProcessed

필수 운영 절차:

- 결제 CTA 숨김 방법
- 결제 실패 고객 수동 지급 방법
- 환불 문의 대응 템플릿
- 장애 발생 시 공지 문구

## 자동 검증 명령

출시 전 최소 명령:

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

선택 권장:

```powershell
npm run test:e2e
npm run build
```

이번 릴리스에서는 Supabase Edge 기존 결제 함수가 비활성 경로이므로 `deno check`는 결제 유지 P0 필수 명령에 포함하지 않습니다. 해당 경로를 다시 활성화하는 릴리스에서는 `payment-webhook`, `verify-payment` 타입 체크와 가격 fallback 제거를 별도 P0로 승격합니다.

## Toss 실제 환경 스모크 시나리오

### 성공 결제

1. Free 계정으로 Toss 미니앱에 진입합니다.
2. Pricing에서 PRO CTA를 누릅니다.
3. 결제 모달에서 금액, 기간, 환불 안내를 확인합니다.
4. Toss IAP 결제를 완료합니다.
5. Checkout modal이 닫히고 프로필이 재조회됩니다.
6. PRO 권한이 즉시 반영되는지 확인합니다.

통과 기준:

- 결제는 1회만 발생
- 권한은 즉시 PRO
- `max_portfolios = 5`, `max_alarms = 10`
- 광고 제거 또는 PRO 제한 완화가 반영

### 취소

1. 결제창을 열고 Toss IAP 결제를 취소합니다.
2. 앱이 정상 상태로 돌아옵니다.
3. 권한이 무료 상태로 유지됩니다.
4. 결제 버튼 재시도가 가능합니다.

통과 기준:

- 결제 실패 toast가 과도하게 뜨지 않음
- loading 영구 고착 없음
- 주문/권한 변경 없음

### 서버 지급 실패

1. staging에서 BFF 검증 실패를 강제로 만듭니다.
2. 결제 완료 후 `PRODUCT_NOT_GRANTED_BY_PARTNER` 경로를 확인합니다.
3. 앱 재진입 시 미결 주문 복구 가능성을 확인합니다.

통과 기준:

- 사용자가 “결제는 됐는데 아무 안내도 없음” 상태에 빠지지 않음
- 운영자가 orderId로 수동 확인 가능

## 결제 유지 출시 최종 체크리스트

| 항목 | 상태 |
|---|---|
| `npm test` 통과 | TODO |
| `npm run typecheck` 통과 | TODO |
| `npm --prefix server run typecheck` 통과 | TODO |
| `npm --prefix server run build` 통과 | TODO |
| `npm --prefix server run test` 통과 | TODO |
| `/payment/toss/iap-verify` 라우트 테스트 통과 | TODO |
| IAP verify `inProgress`/`success:false` 오인 방지 테스트 통과 | TODO |
| IAP verify `success:true` 정상 성공 계약 테스트 통과 | TODO |
| IAP bridge 동기 예외 안전 처리 테스트 통과 | TODO |
| 프론트 `tossIapService` 계약 테스트 통과 | TODO |
| 활성 Toss IAP 프론트/BFF 가격 fallback 제거 확인 | TODO |
| 활성 Toss IAP 프론트/BFF 가격 env 파서 공유 유틸 적용 | TODO |
| 기존 카드/BFF verify/Edge 결제 경로 운영 비활성 확인 | TODO |
| 결제 라우트 테스트 `vi.hoisted` mock 적용 | TODO |
| 운영 DB `claim_order_processing` 확인 | TODO |
| 결제 모달 작은 화면 검증 통과 | TODO |
| Toss 성공 결제 1건 통과 | TODO |
| Toss 취소 1건 통과 | TODO |
| 서버 지급 실패 안내 통과 | TODO |
| 결제 CTA kill switch 확인 | TODO |
| Premium 결제 경로 차단 확인 | TODO |
| 가격/환경변수 운영값 확인 | TODO |
| 환불/약관/문의 경로 확인 | TODO |
| 결제 CTA 긴급 차단 절차 확인 | TODO |

## 결제 닫기 기준

아래 중 하나라도 발생하면 결제 CTA를 닫고 출시합니다.

- 결제 성공 후 30초 안에 PRO 권한이 반영되지 않음
- 결제 버튼 연타로 주문이 2건 이상 생성됨
- Toss 취소 후 loading이 풀리지 않음
- 서버 지급 실패 시 사용자 안내가 없음
- 서버 검증 `success:false`, `inProgress`, 202/409/500 응답이 프론트에서 성공 결제로 처리됨
- 서버 검증 `success:true` 정상 응답에서도 `completeProductGrant`가 호출되지 않거나 최종 성공으로 끝나지 않음
- Toss IAP bridge 동기 예외가 통합 실패 경로로 처리되지 않음
- 운영 환경변수 중 하나라도 미확정
- 활성 Toss IAP 가격 환경변수가 양의 정수가 아니거나 fallback 가격으로 결제/지급이 열림
- 활성 Toss IAP 가격 env 검증이 route/component 안에 중복 구현되어 프론트/BFF 정책이 달라질 수 있음
- 기존 카드/BFF verify/Edge 결제 경로가 운영에서 외부 호출 가능함
- 결제 라우트 테스트가 Vitest hoisting 오류로 실행되지 않음
- `VITE_ENABLE_IAP_CHECKOUT` 없이도 결제 CTA가 열림
- 운영 DB에서 `claim_order_processing` 또는 `orders.status = processing` 확인 불가
- 환불 문의 경로가 앱에서 확인되지 않음
- 실제 Toss WebView 작은 화면에서 결제 버튼 접근 불가
- PRO 사용자의 Premium 업그레이드 기대가 PRO 결제로 이어짐

## 결제 유지 출시 기준

아래 조건을 모두 만족하면 유료 결제를 유지한 채 출시합니다.

- P0 게이트 전부 통과
- P1 게이트 전부 통과 또는 명시적 출시 승인
- 실제 Toss 미니앱 스모크 3종 성공
- 결제 CTA kill switch 확인
- 수동 지급/환불 문의 운영 절차 준비

## 다음 작업

1. `docs2/paid_payment_release_gate_refactor_snippets.md`의 `S0` 가격 env 파서 단일화를 먼저 수행합니다.
2. `docs2/paid_payment_release_gate_refactor_snippets.md` 기준으로 나머지 P0 코드 보강을 수행합니다.
3. 이 계획서 기준으로 실제 감사 체크를 수행합니다.
4. 부족한 자동 테스트를 추가합니다.
5. Playwright로 Checkout viewport E2E를 추가할지 결정합니다.
6. 통과 결과를 `docs2/paid_payment_release_gate_audit_result.md`로 남깁니다.
