/**
 * cancel-subscription Edge Function
 *
 * 단발성 결제 환불 처리:
 *  1. JWT 인증으로 본인 확인
 *  2. orders 테이블에서 최근 paid 주문 조회
 *  3. 이용 기록 유무 + 결제 후 7일 이내 여부 판단
 *     - 7일 이내 + 미사용 → 포트원 전액 환불 → status: "refunded" → 서비스 권한 즉시 회수
 *     - 그 외 → 환불 거부 안내 (status 변경 없음 — 단발성이므로 만료 시 자동 종료)
 *
 * 이용 기록 판단 기준:
 *  - AI 매매 인식 사용 (ai_monthly_usage > 0)
 *  - 백테스트 사용 (backtest_daily_usage > 0)
 *  - 텔레그램 연동 (telegram_connected_at IS NOT NULL)
 */

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 환경 변수
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const ALLOWED_ORIGIN =
  Deno.env.get("ALLOWED_ORIGIN") || "https://btd-alarm2.pages.dev";
const PORTONE_API_BASE = "https://api.portone.io";

const REFUND_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// 포트원 V2 결제 취소 API
// ---------------------------------------------------------------------------
async function cancelPortOnePayment(
  paymentId: string,
  reason: string,
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `PortOne ${PORTONE_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[cancel] 포트원 취소 실패 (${res.status}):`, body);
    return { success: false, message: `PG 취소 실패 (${res.status})` };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// 이용 기록 판단
// ---------------------------------------------------------------------------
interface UsageProfile {
  ai_monthly_usage: number | null;
  backtest_daily_usage: number | null;
  telegram_connected_at: string | null;
}

function hasServiceUsage(profile: UsageProfile | null): boolean {
  if (!profile) return false;
  return (
    (profile.ai_monthly_usage ?? 0) > 0 ||
    (profile.backtest_daily_usage ?? 0) > 0 ||
    profile.telegram_connected_at != null
  );
}

// ---------------------------------------------------------------------------
// 메인 핸들러
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    // ── 1. JWT 인증 ────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "인증이 필요합니다." }),
        { status: 401, headers: jsonHeaders },
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
        { status: 401, headers: jsonHeaders },
      );
    }

    // ── 2. 최근 paid 주문 조회 ─────────────────────
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: latestOrder, error: orderError } = await adminClient
      .from("orders")
      .select("id, payment_id, plan_id, amount, status, paid_at, created_at")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !latestOrder) {
      return new Response(
        JSON.stringify({ error: "환불 가능한 결제 건이 없습니다." }),
        { status: 404, headers: jsonHeaders },
      );
    }

    // ── 3. 환불 가능 여부 판단 ─────────────────────
    const paidAt = new Date(latestOrder.paid_at ?? latestOrder.created_at);
    const daysSincePaid = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60 * 24);
    const isWithinRefundWindow = daysSincePaid <= REFUND_WINDOW_DAYS;

    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("ai_monthly_usage, backtest_daily_usage, telegram_connected_at")
      .eq("id", user.id)
      .single();

    const hasUsage = hasServiceUsage(profile);
    const isRefundEligible = isWithinRefundWindow && !hasUsage;

    // ── 4. 분기 처리 ──────────────────────────────
    if (!isRefundEligible) {
      // 환불 불가 → 안내만 하고 끝 (단발성이므로 status 변경 불필요)
      const reason = !isWithinRefundWindow
        ? "결제 후 7일이 경과하여 환불이 불가합니다."
        : "서비스 이용 기록이 있어 전자상거래법 제17조 제2항 제5호에 따라 환불이 불가합니다.";

      console.info(
        `[cancel] 환불 거절: userId=${user.id}, paymentId=${latestOrder.payment_id}, days=${daysSincePaid.toFixed(1)}, hasUsage=${hasUsage}`,
      );

      return new Response(
        JSON.stringify({
          success: false,
          refunded: false,
          message: reason + " 문의: grrrvv@naver.com",
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // ── 5. 전액 환불 (포트원 API) ──────────────────
    const cancelResult = await cancelPortOnePayment(
      latestOrder.payment_id,
      "사용자 요청 — 이용 기록 없음, 7일 이내 전액 환불",
    );

    if (!cancelResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          refunded: false,
          message: "환불 처리 중 오류가 발생했습니다. 고객센터(grrrvv@naver.com)로 문의해주세요.",
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // ── 6. DB 업데이트 (환불 완료) ─────────────────
    // 6-a. orders → refunded
    await adminClient
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", latestOrder.id);

    // 6-b. user_profiles → 서비스 권한 즉시 회수
    await adminClient
      .from("user_profiles")
      .update({
        subscription_tier: "free",
        subscription_status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    // ── 7. 응답 ────────────────────────────────────
    console.info(
      `[cancel] 전액 환불 완료: userId=${user.id}, paymentId=${latestOrder.payment_id}, amount=${latestOrder.amount}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        refunded: true,
        message: "전액 환불이 완료되었습니다. 서비스 이용 권한이 즉시 해제됩니다.",
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    console.error("[cancel] 처리 실패:", message);
    return new Response(
      JSON.stringify({ error: "환불 처리 중 오류가 발생했습니다." }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
