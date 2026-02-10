/**
 * payment-webhook Edge Function
 *
 * 포트원 V2 Webhook을 수신합니다.
 * 결제 상태 변경(결제 완료, 취소, 환불 등) 시 포트원이 이 URL을 호출합니다.
 *
 * 설정 방법:
 *   포트원 관리자 콘솔 → Webhook URL에 아래 주소 등록:
 *   https://<PROJECT_REF>.supabase.co/functions/v1/payment-webhook
 *
 * ⚠️ 이 함수는 --no-verify-jwt 플래그로 배포해야 합니다.
 *    (포트원 서버가 JWT 없이 호출하므로)
 *    배포 명령: supabase functions deploy payment-webhook --no-verify-jwt
 *
 * ⚠️ 환경변수 필요:
 *    - PORTONE_API_SECRET: 포트원 V2 API 시크릿
 *    - PORTONE_WEBHOOK_SECRET: 포트원 Webhook 서명 검증 시크릿 (선택)
 */

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 환경 변수
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = "https://api.portone.io";

// ---------------------------------------------------------------------------
// 플랜별 금액 (위변조 검증)
// ---------------------------------------------------------------------------
const PLAN_AMOUNTS: Record<string, number> = {
  pro: 5900,
  premium: 9900,
};

// ---------------------------------------------------------------------------
// 구독 만료일 계산 (30일)
// ---------------------------------------------------------------------------
function getSubscriptionExpiresAt(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// 포트원 V2 REST API 결제 조회
// ---------------------------------------------------------------------------
interface PortOnePayment {
  status: string;
  id: string;
  transactionId?: string;
  orderName?: string;
  amount: { total: number; currency: string };
  method?: { type?: string };
  paidAt?: string;
  cancelledAt?: string;
  customer?: { id?: string };
  customData?: string;
}

async function getPortOnePayment(paymentId: string): Promise<PortOnePayment> {
  const res = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `PortOne ${PORTONE_API_SECRET}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(
      new Error(`포트원 API 조회 실패 (${res.status}): ${body}`),
      { statusCode: res.status },
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// 메인 핸들러
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // ── 1. Webhook 페이로드 파싱 ──────────────────────
    const body = await req.json();
    const { type, data } = body as {
      type: string;        // "Transaction.Paid" | "Transaction.Cancelled" | ...
      data: { paymentId?: string; transactionId?: string };
    };

    const paymentId = data?.paymentId;
    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: "paymentId가 없습니다." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2. 이벤트 타입별 분기 ─────────────────────────
    if (type === "Transaction.Paid") {
      // ▸ 결제 완료
      const payment = await getPortOnePayment(paymentId);

      if (payment.status !== "PAID") {
        console.warn(`[webhook] paymentId=${paymentId}: 포트원 상태가 PAID가 아님 (${payment.status})`);
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 기존 주문 조회
      const { data: existingOrder } = await adminClient
        .from("orders")
        .select("id, status, user_id, plan_id")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (existingOrder?.status === "paid") {
        // 이미 처리됨 (멱등성)
        return new Response(JSON.stringify({ ok: true, message: "already processed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (existingOrder) {
        // pending → paid 업데이트
        await adminClient
          .from("orders")
          .update({
            status: "paid",
            pg_tx_id: payment.transactionId ?? null,
            paid_at: payment.paidAt ?? new Date().toISOString(),
          })
          .eq("id", existingOrder.id);

        // 구독 활성화
        const planId = existingOrder.plan_id;
        const expiresAt = getSubscriptionExpiresAt();

        await adminClient
          .from("user_profiles")
          .update({
            subscription_tier: planId,
            subscription_status: "active",
            subscription_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingOrder.user_id);

        console.info(`[webhook] 결제 확인 완료: paymentId=${paymentId}, userId=${existingOrder.user_id}, plan=${planId}`);
      } else {
        // verify-payment 호출 없이 webhook만 온 경우
        // customData에서 userId, planId 추출 시도
        let userId: string | undefined;
        let planId: string | undefined;

        if (payment.customData) {
          try {
            const custom = JSON.parse(payment.customData);
            userId = custom.userId;
            planId = custom.planId;
          } catch {
            // customData 파싱 실패
          }
        }

        // customer.id 로 fallback
        userId = userId ?? payment.customer?.id;

        if (userId && planId && PLAN_AMOUNTS[planId]) {
          // 금액 검증
          if (payment.amount.total === PLAN_AMOUNTS[planId]) {
            await adminClient.from("orders").insert({
              user_id: userId,
              payment_id: paymentId,
              plan_id: planId,
              order_name: payment.orderName ?? `${planId.toUpperCase()} Plan`,
              amount: payment.amount.total,
              currency: payment.amount.currency ?? "KRW",
              pay_method: payment.method?.type ?? "UNKNOWN",
              status: "paid",
              pg_provider: "nicepay",
              pg_tx_id: payment.transactionId ?? null,
              paid_at: payment.paidAt ?? new Date().toISOString(),
            });

            const expiresAt = getSubscriptionExpiresAt();
            await adminClient
              .from("user_profiles")
              .update({
                subscription_tier: planId,
                subscription_status: "active",
                subscription_expires_at: expiresAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", userId);

            console.info(`[webhook] 신규 주문 처리: paymentId=${paymentId}`);
          } else {
            console.warn(`[webhook] 금액 불일치: expected=${PLAN_AMOUNTS[planId]}, actual=${payment.amount.total}`);
          }
        } else {
          console.warn(`[webhook] userId/planId 확인 불가 — paymentId=${paymentId}`);
        }
      }
    } else if (type === "Transaction.Cancelled") {
      // ▸ 결제 취소/환불
      const { data: order } = await adminClient
        .from("orders")
        .select("id, user_id")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (order) {
        await adminClient
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", order.id);

        // 구독 해지
        await adminClient
          .from("user_profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.user_id);

        console.info(`[webhook] 결제 취소 처리: paymentId=${paymentId}`);
      }
    } else {
      // 기타 이벤트는 로그만
      console.info(`[webhook] 미처리 이벤트: type=${type}, paymentId=${paymentId}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const statusCode = (err as { statusCode?: number })?.statusCode;

    // 404 = 테스트 Webhook이거나 아직 결제 건이 생성 전인 경우
    // → 정상 응답(200)으로 처리하여 불필요한 재시도 방지
    if (statusCode === 404) {
      console.info("[webhook] 결제 건 미존재 (테스트 호출 또는 미생성 건):", message);
      return new Response(
        JSON.stringify({ ok: true, message: "결제 건이 아직 존재하지 않습니다 (테스트 또는 지연)." }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.error("[webhook] 처리 실패:", message);
    // Webhook은 200 외 응답 시 포트원이 재시도하므로, 일시 오류는 500 반환
    return new Response(
      JSON.stringify({ error: "처리 실패" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
