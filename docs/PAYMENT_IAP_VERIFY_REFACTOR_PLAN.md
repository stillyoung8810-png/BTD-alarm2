# 백엔드 결제 검증 로직 리팩토링 및 환각(Hallucination) 제거 계획서

> **목적**: [`server/src/routes/payment.ts`](../server/src/routes/payment.ts)의 IAP 검증 라우트에서 공식 가이드에 없는 `TOSS_PARTNER_API_SECRET` 및 `Authorization: Bearer` 주입을 제거한다.  
> **유지**: 일반 웹 결제(`POST /payment/toss/verify`)와 토스 미니앱 IAP(`POST /payment/toss/iap-verify`)의 **투트랙 구조**.  
> **참고 가이드**: [인앱결제 개발하기](https://developers-apps-in-toss.toss.im/iap/develop.html), [인앱 결제 IAP 레퍼런스](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EC%9D%B8%EC%95%B1%20%EA%B2%B0%EC%A0%9C/IAP.html)

---

## 1. 수정 요구 사항 (Action Items)

1. **IAP 주문 조회 로직 환각 제거 (`/payment/toss/iap-verify`)**
   - 토스 미니앱 공식 가이드에 따르면 `POST /api-partner/v1/apps-in-toss/order/get-order-status` 호출 시 요청 헤더 표준에는 **`x-toss-user-key`**(로그인으로 획득한 userKey)가 핵심으로 제시된다.
   - 레포에서 임의로 추가한 **`TOSS_PARTNER_API_SECRET` 환경 변수**와 **`Authorization: Bearer ...` 헤더**를 **완전히 삭제**한다.

---

## 2. 변경 범위 요약

| 구분 | 파일 |
|------|------|
| 수정 | [`server/src/routes/payment.ts`](../server/src/routes/payment.ts) |
| 이번 계획에서 수정하지 않음 | `POST /payment/toss/verify`, `TOSS_PAYMENTS_SECRET_KEY` 사용부, 클라이언트 `tossIapService.ts` |

---

## 3. 코드 스니펫 (Code-First)

### 3.1 IAP 검증용 환각 환경 변수 선언 제거

**타겟 파일:** `server/src/routes/payment.ts`

```typescript
// [수정 전 (문제 코드)]
const IAP_ORDER_STATUS_URL = "https://api-partner.toss.im/api-partner/v1/apps-in-toss/order/get-order-status";
const TOSS_PARTNER_API_SECRET = process.env.TOSS_PARTNER_API_SECRET;
```

```typescript
// [수정 후]
const IAP_ORDER_STATUS_URL = "https://api-partner.toss.im/api-partner/v1/apps-in-toss/order/get-order-status";
```

**이유:** 공식 가이드에 없는 시크릿 의존성을 선언 단계에서 제거해 재도입을 방지한다.

---

### 3.2 IAP 라우트의 허위 서버 설정 가드 제거

**타겟 파일:** `server/src/routes/payment.ts`

```typescript
// [수정 전 (문제 코드)]
if (!TOSS_PARTNER_API_SECRET) {
    request.log.error("[IAP Verify] TOSS_PARTNER_API_SECRET not configured");
    return reply.code(500).send({ success: false, error: "Server configuration error" });
}
```

```typescript
// [수정 후]
// 위 블록 전체 삭제
```

**이유:** 존재하지 않아야 할 환경 변수를 기준으로 500을 반환하는 것은 잘못된 가정이다. 실제 방어는 Supabase 사용자 인증, `toss_user_key` 존재, `orderId` 유효성, 토스 API 응답으로 충분하다.

---

### 3.3 `get-order-status` 호출 헤더 수정

**타겟 파일:** `server/src/routes/payment.ts`

```typescript
// [수정 전 (문제 코드)]
const orderStatusRes = await fetch(IAP_ORDER_STATUS_URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOSS_PARTNER_API_SECRET}`,
        "x-toss-user-key": profile.toss_user_key,
    },
    body: JSON.stringify({ orderId }),
});
```

```typescript
// [수정 후]
const orderStatusRes = await fetch(IAP_ORDER_STATUS_URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-toss-user-key": profile.toss_user_key,
    },
    body: JSON.stringify({ orderId }),
});
```

**이유:** 공식 문서에 근거하지 않은 `Authorization: Bearer`는 스펙 혼선과 운영 디버깅 비용을 유발한다.

---

### 3.4 수정 후 IAP 검증 라우트 핵심 흐름 (참고용)

아래는 헤더·가드 제거 후 리뷰어가 제어 흐름을 한 번에 검토할 수 있도록 정리한 골격이다. `sku` 매핑, `fulfillPaidOrder`, 금액·일수 정책은 기존 구현을 유지한다.

```typescript
fastify.post<{ Body: IapVerifyBody }>(
    "/payment/toss/iap-verify",
    async (request, reply) => {
        const { orderId } = request.body ?? {};
        const authHeader = request.headers.authorization;

        if (!orderId || typeof orderId !== "string") {
            return reply.code(400).send({ success: false, error: "Missing orderId" });
        }

        if (!authHeader) {
            return reply.code(401).send({ success: false, error: "Missing Authorization header" });
        }

        try {
            const token = authHeader.replace(/^\s*Bearer\s+/i, "");
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

            if (authError || !user) {
                return reply.code(401).send({ success: false, error: "Invalid or expired token" });
            }

            const { data: profile, error: profileError } = await supabaseAdmin
                .from("user_profiles")
                .select("toss_user_key")
                .eq("id", user.id)
                .single();

            if (profileError || !profile?.toss_user_key) {
                return reply.code(400).send({
                    success: false,
                    error: "toss_user_key not found. Toss login required.",
                });
            }

            const orderStatusRes = await fetch(IAP_ORDER_STATUS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-toss-user-key": profile.toss_user_key,
                },
                body: JSON.stringify({ orderId }),
            });

            // 이하: 응답 파싱, status 검증, fulfillPaidOrder 등 기존 로직 유지
        } catch (error) {
            request.log.error(error, "[IAP Verify] unexpected error");
            return reply.code(500).send({ success: false, error: "Internal server error" });
        }
    },
);
```

---

## 4. 이번 계획에서 의도적으로 건드리지 않는 영역

- `POST /payment/toss/verify` 및 `TOSS_PAYMENTS_SECRET_KEY` 기반 토스페이먼츠 confirm 로직
- `PLAN_AMOUNTS`, `fulfillPaidOrder`, SKU 상수 매핑
- [`services/payment/tossIapService.ts`](../services/payment/tossIapService.ts)

---

## 5. 적용 후 검증 체크리스트

1. `server/src/routes/payment.ts`에서 문자열 `TOSS_PARTNER_API_SECRET`가 **0건**인지 확인
2. `fetch(IAP_ORDER_STATUS_URL, ...)`의 `headers`에 **`Authorization` 키가 없는지** 확인
3. `npm run build`(또는 `server` 디렉터리 기준 TypeScript 빌드) 통과
4. HTTP 동작
   - `orderId` 누락 → `400`
   - 세션/토큰 없음 또는 무효 → `401`
   - `toss_user_key` 없음 → `400`
   - 토스 주문 조회 HTTP 실패 → 기존과 동일하게 로깅 후 `500` 등 유지
   - 주문 상태 미완료 → 기존 정책 유지

---

## 6. Mental Compile 포인트

- 상단에서 `TOSS_PARTNER_API_SECRET` 선언을 제거하면, 동일 심볼을 참조하는 **모든** 줄을 함께 제거해야 컴파일이 깨지지 않는다.
- `profile.toss_user_key`는 기존 가드로 보장되므로 헤더 축소만으로 NPE 리스크는 증가하지 않는다.
- 토스 API가 향후 **추가 서버 인증**(예: mTLS, 별도 헤더)을 요구하면, **공식 문서·토스 지원 확인 후** 별도 계획서로 반영한다. 본 문서는 **문서에 없는 Bearer 시크릿 환각 제거**에 한정한다.

---

## 7. 문서 이력

| 일자 | 내용 |
|------|------|
| 2026-03-26 | 초안 작성 (IAP `get-order-status` 헤더 환각 제거 계획) |
| 2026-03-26 | [`server/src/routes/payment.ts`](../server/src/routes/payment.ts)에 반영 완료: `TOSS_PARTNER_API_SECRET`·`Authorization: Bearer` 제거 |
