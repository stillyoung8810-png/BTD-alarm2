# 인앱 결제(IAP) 구현 현황 점검

> 토스 콘솔에 등록한 **PRO 티어 (월 구독)** 상품(`ait.0000019657.ceab139a.9b2501a8c1.1914414893`)과 현재 코드 구조를 대조한 결과입니다.  
> 토스 가이드: https://developers-apps-in-toss.toss.im/iap/develop.html

---

## 1. 현재 구현 vs 콘솔 등록 상품

| 구분 | 토스 콘솔 (캡처 기준) | 현재 코드 |
|------|------------------------|-----------|
| **결제 경로** | **인앱결제(IAP)** — 인앱 상품 등록 | **토스페이(일반 결제)** + BFF 검증 |
| **상품** | PRO 티어 (월 구독), 비소모품, 노출 중 | `planId: 'pro' \| 'premium'` (비즈니스 식별자) |
| **상품 ID** | `ait.0000019657.ceab139a.9b2501a8c1.1914414893` | 코드/서버 어디에도 **미사용** |
| **SDK 사용** | IAP: getProductItemList, createOneTimePurchaseOrder 등 | `window.TossApp.requestPayment` (토스페이) |
| **서버 검증** | IAP: get-order-status 또는 지급 완료 플로우 | BFF `POST /v1/payments/confirm` (토스페이먼츠 API) |

**요약**: 콘솔에 등록한 건 **인앱결제(IAP) 상품**이고, 앱은 **토스페이(일반 결제) + 토스페이먼츠 confirm** 구조입니다. **서로 다른 결제 경로**라서, 지금 코드만으로는 콘솔에 등록한 PRO 상품이 결제 플로우에 쓰이지 않습니다.

---

## 2. 현재 구현이 잘 되어 있는 부분

- **토스 앱 여부 분기**: `isTossApp()` 일 때만 토스페이 요청 (`paymentService.ts` → `requestTossPayment`).
- **결제 요청**: `tossPayment.ts`에서 `requestPayment`(orderName, totalAmount, orderId, planId 등) 호출.
- **서버 검증**: BFF `server/src/routes/payment.ts`에서 `POST /payment/toss/verify` → 토스페이먼츠 `/v1/payments/confirm` 호출 후 금액·planId 검증 및 DB 구독 갱신.
- **플랜 식별**: `planId`는 `'pro' \| 'premium'`으로 CheckoutModal → paymentService → BFF까지 일관되게 사용.

즉, **토스페이(일반 결제) 기준**으로는 구현이 연결되어 있습니다. 다만 이 경로는 **인앱 상품(IAP)과는 별개**입니다.

---

## 3. 콘솔 PRO 상품을 쓰려면 필요한 것 (IAP 전환 시)

콘솔에 등록한 **인앱 상품**을 사용하려면, 가이드의 **인앱결제(IAP)** 플로우를 구현해야 합니다.

### 3.1 클라이언트 (프론트)

| 항목 | 내용 |
|------|------|
| **SDK** | `@apps-in-toss/web-framework`의 **IAP** 객체 사용 (현재는 `requestPayment`만 사용). |
| **상품 목록** | `IAP.getProductItemList()`로 콘솔에 등록·노출된 상품 조회. |
| **결제 요청** | `IAP.createOneTimePurchaseOrder({ options: { sku, processProductGrant } })` 사용. 여기서 `sku`에 콘솔 상품 ID(`ait.0000019657...`) 전달. |
| **지급 처리** | `processProductGrant({ orderId })` 안에서 서버에 지급 요청 후, 성공 시 `completeProductGrant(orderId)` 호출. |
| **미결 주문 복원** | 앱 실행 시 `IAP.getPendingOrders()` → 미결 건 있으면 지급 처리 후 `completeProductGrant`. |

### 3.2 상품 ID 단일 관리

- **파일**: 예) `services/iap/iapConstants.ts` 또는 `constants/iap.ts` (신규 생성 권장).
- **내용**: 콘솔 상품 ID를 한 곳에서만 관리.
  - PRO (월 구독): `ait.0000019657.ceab139a.9b2501a8c1.1914414893`
  - 나중에 PREMIUM 등 추가 시 같은 파일에 상품 ID 추가.

### 3.3 서버(BFF)

- IAP는 **결제·지급 완료**가 토스 앱/서버와 협업으로 이뤄지므로, 다음 중 하나가 필요합니다.
  - **옵션 A**: `processProductGrant` 안에서 우리 BFF로 “orderId + 상품 지급 요청”을 보내고, BFF에서 토스 **주문 상태 조회 API** (`POST /api-partner/v1/apps-in-toss/order/get-order-status`, `x-toss-user-key` + `orderId`)로 검증 후 구독 갱신 및 `completeProductGrant` 호출 유도.
  - **옵션 B**: 토스 가이드의 “파트너사 상품 지급” 절차(웹훅 등)가 있다면 그에 맞춰 검증·지급 후 `completeProductGrant`.

가이드 상 **주문 조회 API** 사용을 위해선 **토스 로그인 연동**(`x-toss-user-key` 발급)이 선행되어야 합니다.

### 3.4 추가로 참고할 코드/문서

- **타입**: `types/toss.d.ts`에는 현재 `requestPayment`만 정의되어 있음. IAP 도입 시 `IAP` 관련 타입은 `@apps-in-toss/web-framework` 또는 공식 레퍼런스 기준으로 보강.
- **기존 리뷰**: `docs/TOSS_ADS_IAP_CODE_REVIEW_SENIOR.md`에 IAP vs 토스페이 구분, 상품 ID 단일 관리, 서버 검증 시 amount·productId 대조 등이 정리되어 있음.

---

## 4. 정리

- **현재**: 토스페이(일반 결제) + BFF 토스페이먼츠 confirm으로 **결제·검증·구독 갱신**이 이뤄지고 있어, 그 경로만 보면 구현은 연결되어 있습니다.
- **콘솔 PRO 상품**: 인앱결제(IAP) 상품으로 등록되어 있으므로, **이 상품을 쓰려면** 위 3절의 IAP 플로우와 상품 ID 상수, 서버 검증(및 필요 시 토스 로그인)을 추가해야 합니다.
- **추가로 필요한 코딩/정보**:
  1. IAP 전용 상수 파일 (콘솔 상품 ID 매핑).
  2. `@apps-in-toss/web-framework` IAP API 연동 (getProductItemList, createOneTimePurchaseOrder, getPendingOrders, completeProductGrant).
  3. BFF 또는 백엔드에서 IAP 주문 검증(주문 상태 조회 API 등) 및 구독 지급 로직.
  4. (주문 상태 API 사용 시) 토스 로그인 연동으로 `x-toss-user-key` 확보.

이 문서는 “콘솔에 등록한 PRO 상품과 현재 코드가 어떻게 다른지”와 “그 상품을 쓰려면 무엇이 더 필요한지”만 정리한 점검 문서입니다. 실제 IAP 전환 시에는 토스 IAP 개발 가이드와 샌드박스 테스트 절차를 함께 진행하는 것이 좋습니다.
