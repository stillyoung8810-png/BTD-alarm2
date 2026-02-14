# 결제·테스트 결제 환경 현재 상태 보고서

> 목적: 테스트 결제 환경 완성 후 승인을 받기 위한 현황 파악  
> 참고: [포트원 테스트 연동 가이드](https://help.portone.io/category/procedure/payment-integration/test)

---

## 1. 요약

| 구분 | 상태 | 비고 |
|------|------|------|
| **포트원 테스트 채널** | ✅ 설정됨 | Store ID, Channel Key 로컬·빌드에 반영 |
| **클라이언트 결제 플로우** | ✅ 구현됨 | PortOne V2 SDK, verify-payment 호출 |
| **서버 검증 (verify-payment)** | ✅ 구현됨 | Supabase Edge Function, PortOne API 조회 |
| **웹훅 (payment-webhook)** | ✅ 구현·배포됨 | 테스트 404 처리 포함 |
| **웹훅 시크릿 검증** | ⚠️ 미구현 | PORTONE_WEBHOOK_SECRET 사용 안 함 |
| **Supabase Secrets 동기화** | ⚠️ 확인 필요 | 테스트용 API Secret 등록 여부 확인 필요 |
| **포트원 콘솔 웹훅 URL** | ⚠️ 확인 필요 | 테스트 연동 탭에 URL 등록 여부 |
| **테스트 시나리오·제한사항 문서** | ❌ 없음 | 카드사/가상계좌 제한 등 안내 없음 |

---

## 2. 현재 결제 구조

### 2.1 이중 경로

- **웹(일반 브라우저)**  
  - 결제: **포트원 V2** (Store ID + Channel Key)  
  - 검증: **Supabase Edge Function** `verify-payment` (PortOne REST API로 결제 상태·금액 확인 후 `orders` / `user_profiles` 반영)

- **토스 미니앱**  
  - 결제: **토스페이 브릿지**  
  - 검증: **Railway BFF** `POST /payment/toss/verify` (mTLS로 토스 검증 후 DB 반영)

이 문서는 **포트원 테스트 연동**에 초점을 둡니다.

### 2.2 포트원 관련 환경 변수 (로컬 `.env` 기준)

| 변수 | 용도 | 비고 |
|------|------|------|
| `VITE_PORTONE_STORE_ID` | 클라이언트 결제창 | 주석: "포트원 테스트 채널 … 실제 연동시 변경" |
| `VITE_PORTONE_CHANNEL_KEY` | 클라이언트 결제창 | 테스트 채널 키 |
| `PORTONE_API_SECRET` | verify-payment, payment-webhook, cancel-subscription | **Supabase Secrets에 동일 이름으로 등록 필요** |
| `PORTONE_API_KEY` | REST API용 (참고) | |
| `PORTONE_WEBHOOK_SECRET_TEST` | 웹훅 서명 검증용 (예정) | 현재 Edge Function에서 **미사용** |
| `WEBHOOKURL` | 포트원 콘솔에 등록할 URL | `https://vbscfgjlckbjrdqzpire.supabase.co/functions/v1/payment-webhook` |

---

## 3. 구현된 기능 상세

### 3.1 클라이언트 (`paymentService.ts`, `CheckoutModal.tsx`)

- PortOne V2 SDK 동적 로드 (`https://cdn.portone.io/v2/browser-sdk.js`), `index.html`에서도 로드
- `VITE_PORTONE_STORE_ID`, `VITE_PORTONE_CHANNEL_KEY` 로 결제 요청
- 결제 성공 시 **반드시** `verifyPaymentOnServer()` → Supabase `verify-payment` 호출 (금액·상태 서버 검증)
- `customData`에 `userId`, `planId` 전달 (웹훅 fallback용)

### 3.2 verify-payment (Supabase Edge Function)

- JWT 필수, `paymentId`, `planId` 수신
- PortOne API `GET /payments/{paymentId}` 로 상태·금액 조회
- `status === "PAID"`, 금액이 `PLAN_AMOUNTS[planId]`와 일치할 때만 `orders` INSERT/업데이트 및 `user_profiles` 구독 활성화
- `PORTONE_API_SECRET`, `PLAN_AMOUNT_PRO`, `PLAN_AMOUNT_PREMIUM` 등은 환경변수(또는 Supabase Secrets) 사용

### 3.3 payment-webhook (Supabase Edge Function)

- `--no-verify-jwt` 로 배포 (포트원이 JWT 없이 호출)
- `Transaction.Paid`: PortOne API로 결제 조회 후 `orders` / `user_profiles` 반영 (verify-payment 미호출 건 fallback)
- `Transaction.Cancelled`: 해당 주문 환불 처리, 구독 권한 회수
- PortOne API 404(결제 건 미존재) 시 **200 OK** 반환 — 테스트/지연 건 재시도 방지 (가이드와 부합)

### 3.4 cancel-subscription

- 환불 정책(7일 이내·이용 없음 등) 적용 후 PortOne 결제 취소 API 호출

---

## 4. 테스트 연동 완성을 위해 필요한 것

### 4.1 포트원 관리자 콘솔 (필수 확인)

1. **테스트 연동 채널**  
   - [가이드](https://help.portone.io/category/procedure/payment-integration/test)대로 **테스트용 채널**이 추가되어 있는지 확인  
   - 현재 사용 중인 Store ID / Channel Key가 해당 테스트 채널과 일치하는지 확인  

2. **웹훅 URL (테스트 연동)**  
   - 테스트 연동용 웹훅에 아래 URL이 등록되어 있는지 확인  
   - `https://vbscfgjlckbjrdqzpire.supabase.co/functions/v1/payment-webhook`  
   - 실연동 전환 시 별도 “실연동” 웹훅 탭에서 URL·시크릿을 다시 설정하는 체크리스트는 `.env` 주석에 있음  

### 4.2 Supabase Secrets (필수 확인)

- 다음 값이 **Supabase 프로젝트 Secrets**에 등록되어 있어야 함 (Edge Function에서 `Deno.env.get`으로 사용):
  - `PORTONE_API_SECRET` — 테스트 연동용 API 시크릿 (현재 verify-payment, payment-webhook, cancel-subscription이 이 하나만 사용)
  - `PLAN_AMOUNT_PRO`, `PLAN_AMOUNT_PREMIUM` — 선택(없으면 코드 기본값 5900/9900 사용)
- 배포 스크립트(`deploy-functions.ps1`)는 `verify-payment`, `payment-webhook` 모두 배포 대상에 포함됨.

### 4.3 웹훅 시크릿 검증 (권장)

- `.env`에는 `PORTONE_WEBHOOK_SECRET_TEST`가 있으나, **payment-webhook 코드에서 사용하지 않음**.
- 포트원은 웹훅 시그니처를 제공하므로, 승인·보안 강화를 위해:
  - 테스트 연동: `PORTONE_WEBHOOK_SECRET` 또는 `PORTONE_WEBHOOK_SECRET_TEST`를 Supabase Secret에 넣고,
  - payment-webhook에서 페이로드 서명 검증 로직을 추가하는 것을 권장합니다.

### 4.4 테스트 시 제한사항 안내 (문서화 권장)

포트원 테스트 연동 가이드에 따른 제한을 팀/승인 담당자에게 문서로 남기면 좋습니다.

- **테스트 결제는 자동 환불**  
  - 매입 전 일괄 취소(30분~1시간 또는 자정 경).  
  - PG 제휴 간편결제는 실제 출금될 수 있으므로 테스트 시 환불 처리 필요.  

- **일부 카드사 테스트 불가**  
  - KB국민, NH농협, 카카오뱅크(국민 계열) 등은 테스트 환경에서 결제가 안 될 수 있음 → 다른 카드로 테스트 권장.  

- **가상계좌**  
  - 채번(계좌 발급)만 테스트 가능, 실제 입금·환불 불가.  

- **관리자 콘솔**  
  - 테스트 건이 자동 환불되어도 콘솔에는 ‘결제완료’로 남을 수 있음 (가이드 설명과 동일).  

위 내용을 `docs/` 또는 운영 문서에 “테스트 결제 시 유의사항”으로 두면 승인 단계에서 혼선을 줄일 수 있습니다.

---

## 5. 실연동 전환 시 체크리스트 (기존 .env 주석 보강)

- 포트원 콘솔: 실연동 탭 선택 → 웹훅 URL 동일 입력 → **실연동 전용** 웹훅 시크릿 발급  
- Supabase Secrets: `PORTONE_API_SECRET` 실계약 값, `PORTONE_WEBHOOK_SECRET` 실연동 시크릿으로 교체  
- 클라이언트: `paymentService.ts` 및 빌드 환경의 Store ID, Channel Key를 실연동 채널로 교체  

---

## 6. 결론

- **이미 구축된 것**: 포트원 테스트 채널 식별자 반영, 클라이언트 결제 플로우, verify-payment 서버 검증, payment-webhook 배포 및 테스트/404 처리.
- **승인 전에 확인·보완할 것**:  
  1) 포트원 콘솔에서 테스트 채널·테스트 연동 웹훅 URL 등록 여부,  
  2) Supabase Secrets에 `PORTONE_API_SECRET` 등 필요한 값 등록 여부,  
  3) (권장) 웹훅 시크릿 검증 구현,  
  4) 테스트 결제 제한사항(카드사, 가상계좌, 자동 환불) 문서화.

위 항목을 점검하고, 필요 시 웹훅 시크릿 검증과 테스트 유의사항 문서를 추가하면 테스트 결제 환경을 “완성”된 상태로 승인 받기에 적합해집니다.
