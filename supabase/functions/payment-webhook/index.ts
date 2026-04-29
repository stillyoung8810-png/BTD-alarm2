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
 *    - PORTONE_WEBHOOK_SECRET_TEST: 포트원 웹훅 서명 검증 시크릿 (테스트 연동).
 *      Supabase Secrets에 등록. 설정 시 x-portone-signature 헤더로 시그니처 검증 필수, 실패 시 401.
 *      미설정 시 검증 생략(기존 동작 유지).
 */

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import {
  fulfillPaidOrder,
  type PaidPlanId,
} from "../../../server/src/services/paymentFulfillment.ts";

// ---------------------------------------------------------------------------
// 환경 변수
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_WEBHOOK_SECRET_TEST = Deno.env.get("PORTONE_WEBHOOK_SECRET_TEST") ?? "";
const PORTONE_API_BASE = "https://api.portone.io";

// ---------------------------------------------------------------------------
// 웹훅 시그니처 검증 (PORTONE_WEBHOOK_SECRET_TEST 사용)
// ---------------------------------------------------------------------------
const SIGNATURE_HEADER = "x-portone-signature";

/**
 * HMAC-SHA256(rawBody, secret)을 Base64로 계산해 전달받은 시그니처와 비교합니다.
 * 시크릿이 설정되어 있으면 검증 필수; 실패 시 401 반환.
 */
async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ valid: boolean }> {
  if (!PORTONE_WEBHOOK_SECRET_TEST) {
    return { valid: true };
  }
  if (!signatureHeader?.trim()) {
    return { valid: false };
  }
  const receivedSig = signatureHeader.replace(/^v1,?\s*/i, "").trim();
  if (!receivedSig) {
    return { valid: false };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PORTONE_WEBHOOK_SECRET_TEST),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  const valid = receivedSig.length > 0 && expectedSig === receivedSig;
  return { valid };
}

// ---------------------------------------------------------------------------
// ⚠ PRICE SOURCE OF TRUTH
// 프론트엔드(constants/membership.ts)와 이 서버 환경변수가 반드시 일치해야 합니다.
// 기본값(fallback): PRO = 5907, PREMIUM = 9900
// 변경 시 프론트(.env VITE_PLAN_AMOUNT_*) + 백엔드(PLAN_AMOUNT_*) 모두 갱신 필수.
// ---------------------------------------------------------------------------
const PLAN_AMOUNTS: Record<string, number> = {
  pro: Number(Deno.env.get("PLAN_AMOUNT_PRO") ?? 5907),
  premium: Number(Deno.env.get("PLAN_AMOUNT_PREMIUM") ?? 9900),
};

const QUANTITY_MAX = 12;

function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
  if (actualAmount < unitPrice || actualAmount % unitPrice !== 0) return null;
  const q = actualAmount / unitPrice;
  return q >= 1 && q <= QUANTITY_MAX ? q : null;
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
    // ── 0. Raw body 수신 (시그니처 검증용) ─────────────
    const rawBody = await req.text();
    const signatureHeader = req.headers.get(SIGNATURE_HEADER);
    const { valid: signatureValid } = await verifyWebhookSignature(rawBody, signatureHeader);
    if (!signatureValid) {
      console.warn("[webhook] 시그니처 검증 실패: PORTONE_WEBHOOK_SECRET_TEST 기준 불일치 또는 헤더 없음");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Webhook signature verification failed." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── 1. Webhook 페이로드 파싱 ──────────────────────
    const body = JSON.parse(rawBody) as {
      type: string;
      data: { paymentId?: string; transactionId?: string };
    };
    const { type, data } = body;

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
        const planId = existingOrder.plan_id;
        const unitPrice = PLAN_AMOUNTS[planId];
        const quantity =
          unitPrice != null
            ? deriveQuantityFromAmount(payment.amount.total, unitPrice)
            : null;

        if (unitPrice != null && quantity != null) {
          const fulfillment = await fulfillPaidOrder({
            adminClient,
            paymentId,
            userId: existingOrder.user_id,
            planId: planId as PaidPlanId,
            quantity,
            amount: payment.amount.total,
            currency: payment.amount.currency ?? "KRW",
            payMethod: payment.method?.type ?? "UNKNOWN",
            pgProvider: "nicepay",
            pgTxId: payment.transactionId ?? null,
            paidAt: payment.paidAt ?? new Date().toISOString(),
            orderName: payment.orderName ?? `${planId.toUpperCase()} Plan (${quantity * 30}일)`,
            planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
            metadata: {
              source: "payment-webhook",
              webhookType: type,
            },
          });

          if (fulfillment.inProgress) {
            console.info(`[webhook] 처리 중 결제 건 재수신: paymentId=${paymentId}`);
            return new Response(JSON.stringify({ ok: true, inProgress: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          console.info(`[webhook] 결제 확인 완료: paymentId=${paymentId}, userId=${existingOrder.user_id}, plan=${planId}`);
        } else {
          console.warn(`[webhook] 기존 주문의 금액/플랜 검증 실패: paymentId=${paymentId}, plan=${planId}`);
        }
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

        const unitPrice = planId != null ? PLAN_AMOUNTS[planId] : undefined;
        const quantity = unitPrice != null ? deriveQuantityFromAmount(payment.amount.total, unitPrice) : null;

        if (userId && planId && unitPrice != null && quantity != null) {
          const fulfillment = await fulfillPaidOrder({
            adminClient,
            paymentId,
            userId,
            planId: planId as PaidPlanId,
            quantity,
            amount: payment.amount.total,
            currency: payment.amount.currency ?? "KRW",
            payMethod: payment.method?.type ?? "UNKNOWN",
            pgProvider: "nicepay",
            pgTxId: payment.transactionId ?? null,
            paidAt: payment.paidAt ?? new Date().toISOString(),
            orderName: payment.orderName ?? `${planId.toUpperCase()} Plan (${quantity * 30}일)`,
            planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
            metadata: {
              source: "payment-webhook",
              webhookType: type,
              customDataPresent: Boolean(payment.customData),
            },
          });

          if (fulfillment.inProgress) {
            console.info(`[webhook] 신규 주문이 이미 처리 중: paymentId=${paymentId}`);
          }

          console.info(`[webhook] 신규 주문 처리: paymentId=${paymentId}`);
        } else if (userId && planId && unitPrice != null) {
          console.warn(`[webhook] 금액 불일치: unit=${unitPrice}, actual=${payment.amount.total}, paymentId=${paymentId}`);
        } else {
          console.warn(`[webhook] userId/planId 확인 불가 — paymentId=${paymentId}`);
        }
      }
    } else if (type === "Transaction.Cancelled") {
      // ▸ 결제 취소/환불 (단발성 결제)
      const { data: order } = await adminClient
        .from("orders")
        .select("id, user_id, status")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (order && order.status !== "refunded") {
        // cancel-subscription 에서 이미 refunded 처리한 경우 중복 방지
        await adminClient
          .from("orders")
          .update({ status: "refunded" })
          .eq("id", order.id);

        // 서비스 권한 즉시 회수
        await adminClient
          .from("user_profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "refunded",
            subscription_expires_at: null,
            pending_plan: null,
            pending_plan_effective_at: null,
            max_portfolios: 3,
            max_alarms: 4,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.user_id);

        console.info(`[webhook] 결제 환불 처리: paymentId=${paymentId}`);
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
