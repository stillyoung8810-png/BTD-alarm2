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

/** 실제 결제 금액으로부터 quantity 역산 (위변조 방지). 허용 범위 밖이면 null */
function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
  if (actualAmount < unitPrice || actualAmount % unitPrice !== 0) return null;
  const q = actualAmount / unitPrice;
  return q >= 1 && q <= QUANTITY_MAX ? q : null;
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
    const body = await req.json() as { paymentId?: string; planId?: string; quantity?: number };
    const { paymentId, planId } = body;

    if (!paymentId || !planId) {
      return new Response(
        JSON.stringify({ error: "paymentId와 planId가 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const unitPrice = PLAN_AMOUNTS[planId];
    if (unitPrice == null || unitPrice <= 0) {
      return new Response(
        JSON.stringify({ error: `유효하지 않은 플랜: ${planId}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. 포트원 V2 API로 결제 상태 검증 ──────────────
    const payment = await getPortOnePayment(paymentId);

    if (payment.status !== "PAID") {
      return new Response(
        JSON.stringify({
          error: "결제가 완료되지 않았습니다.",
          portoneStatus: payment.status,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const quantity = deriveQuantityFromAmount(payment.amount.total, unitPrice);
    if (quantity == null) {
      console.warn(
        `[verify-payment] 금액이 단가의 1~${QUANTITY_MAX}배가 아님: actual=${payment.amount.total}, unit=${unitPrice}, paymentId=${paymentId}`,
      );
      return new Response(
        JSON.stringify({
          error: "결제 금액이 일치하지 않습니다. 위변조가 의심됩니다.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Service Role 클라이언트로 Fulfillment 실행 ───
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const fulfillment = await fulfillPaidOrder({
      adminClient,
      paymentId,
      userId: user.id,
      planId: planId as PaidPlanId,
      quantity,
      amount: payment.amount.total,
      currency: payment.amount.currency ?? "KRW",
      payMethod: payment.method?.type ?? "CARD",
      pgProvider: "nicepay",
      pgTxId: payment.transactionId ?? null,
      paidAt: payment.paidAt ?? new Date().toISOString(),
      orderName: `${planId.toUpperCase()} Plan (${quantity * 30}일)`,
      planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
      metadata: {
        source: "verify-payment",
        portoneStatus: payment.status,
      },
    });

    if (fulfillment.inProgress) {
      return new Response(
        JSON.stringify({
          success: false,
          error: fulfillment.message ?? "동일 결제 건이 처리 중입니다.",
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. 성공 응답 ───────────────────────────────────
    console.info(
      `[verify-payment] 결제 검증 성공: paymentId=${paymentId}, userId=${user.id}, plan=${planId}, amount=${payment.amount.total}, expiresAt=${fulfillment.subscription?.expiresAt ?? "unknown"}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: fulfillment.alreadyProcessed
          ? "이미 검증 완료된 결제입니다."
          : "결제 검증 완료. 서비스가 활성화되었습니다.",
        subscription: {
          tier: fulfillment.subscription?.tier ?? planId,
          status: fulfillment.subscription?.status ?? "active",
          expiresAt: fulfillment.subscription?.expiresAt ?? null,
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
