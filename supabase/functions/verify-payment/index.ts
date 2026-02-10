/**
 * verify-payment Edge Function
 *
 * 클라이언트에서 포트원 결제 완료 후 호출합니다.
 * 포트원 V2 REST API로 실제 결제 상태를 검증하고,
 * 검증 성공 시 orders 테이블 INSERT + user_profiles 구독 활성화를 수행합니다.
 *
 * ⚠️ 포트원 V2 API Secret은 Supabase Secret에 PORTONE_API_SECRET 으로 등록해야 합니다.
 */

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 환경 변수
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://btd-alarm2.pages.dev";
const PORTONE_API_BASE = "https://api.portone.io";

// ---------------------------------------------------------------------------
// CORS 헤더
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ---------------------------------------------------------------------------
// 플랜별 금액 (서버 측 금액 위변조 검증용)
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
// 포트원 V2 REST API로 결제 상태 조회
// ---------------------------------------------------------------------------
interface PortOnePayment {
  status: string;        // "PAID" | "CANCELLED" | "FAILED" | ...
  id: string;            // paymentId
  transactionId?: string;
  amount: {
    total: number;
    paid: number;
    currency: string;
  };
  method?: {
    type?: string;
  };
  paidAt?: string;
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
    throw new Error(`포트원 API 조회 실패 (${res.status}): ${body}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// 메인 핸들러
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ── 1. JWT 인증 ────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "인증이 필요합니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "유효하지 않은 인증 토큰입니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. 요청 바디 파싱 ──────────────────────────────
    const { paymentId, planId } = await req.json() as {
      paymentId: string;
      planId: string;
    };

    if (!paymentId || !planId) {
      return new Response(
        JSON.stringify({ error: "paymentId와 planId가 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const expectedAmount = PLAN_AMOUNTS[planId];
    if (!expectedAmount) {
      return new Response(
        JSON.stringify({ error: `유효하지 않은 플랜: ${planId}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. 포트원 V2 API로 결제 상태 검증 ──────────────
    const payment = await getPortOnePayment(paymentId);

    // 3-a. 결제 상태 확인
    if (payment.status !== "PAID") {
      return new Response(
        JSON.stringify({
          error: "결제가 완료되지 않았습니다.",
          portoneStatus: payment.status,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3-b. 금액 위변조 검증
    if (payment.amount.total !== expectedAmount) {
      console.warn(
        `[verify-payment] 금액 불일치! expected=${expectedAmount}, actual=${payment.amount.total}, paymentId=${paymentId}`,
      );
      return new Response(
        JSON.stringify({
          error: "결제 금액이 일치하지 않습니다. 위변조가 의심됩니다.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Service Role 클라이언트로 DB 조작 ───────────
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4-a. 중복 검증 방지 — 이미 paid 상태인 주문이 있는지 확인
    const { data: existingOrder } = await adminClient
      .from("orders")
      .select("id, status")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existingOrder?.status === "paid") {
      // 이미 처리 완료 (멱등성 보장)
      return new Response(
        JSON.stringify({ success: true, message: "이미 검증 완료된 결제입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4-b. orders 테이블에 기록 (upsert — pending → paid)
    const orderData = {
      user_id: user.id,
      payment_id: paymentId,
      plan_id: planId,
      order_name: `${planId.toUpperCase()} Monthly Plan`,
      amount: payment.amount.total,
      currency: payment.amount.currency ?? "KRW",
      pay_method: payment.method?.type ?? "CARD",
      status: "paid",
      pg_provider: "nicepay",
      pg_tx_id: payment.transactionId ?? null,
      paid_at: payment.paidAt ?? new Date().toISOString(),
    };

    if (existingOrder) {
      // pending → paid 업데이트
      await adminClient
        .from("orders")
        .update({
          status: "paid",
          pg_tx_id: orderData.pg_tx_id,
          paid_at: orderData.paid_at,
        })
        .eq("id", existingOrder.id);
    } else {
      // 신규 INSERT
      const { error: insertError } = await adminClient
        .from("orders")
        .insert(orderData);

      if (insertError) {
        console.warn("[verify-payment] 주문 INSERT 실패:", insertError.message);
        // INSERT 실패해도 구독 활성화는 진행 (결제는 이미 성공했으므로)
      }
    }

    // 4-c. user_profiles 구독 활성화
    const expiresAt = getSubscriptionExpiresAt();
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .update({
        subscription_tier: planId,
        subscription_status: "active",
        subscription_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      console.warn("[verify-payment] 구독 활성화 실패:", profileError.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: "결제는 완료되었으나 구독 활성화에 실패했습니다. 고객센터에 문의하세요.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. 성공 응답 ───────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        message: "결제 검증 완료. 구독이 활성화되었습니다.",
        subscription: {
          tier: planId,
          status: "active",
          expiresAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    console.error("[verify-payment] 처리 실패:", message);
    return new Response(
      JSON.stringify({ error: "결제 검증 처리 중 오류가 발생했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
