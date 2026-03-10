// supabase/functions/delete-account/index.ts
// 회원 탈퇴(계정 삭제) Edge Function
// - 인증된 사용자 본인만 자신의 계정을 삭제할 수 있음
// - CASCADE가 설정되지 않은 테이블(portfolios, portfolio_history)은 명시적으로 삭제
// - auth.users 삭제 시 CASCADE로 나머지 테이블 자동 정리:
//   user_profiles, user_devices, sent_alarms, telegram_link_tokens, daily_execution_summaries

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders, getJsonCorsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = getJsonCorsHeaders(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. JWT에서 사용자 인증 확인
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // anon key로 사용자 인증 확인
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const userId = user.id;
    console.log("[delete-account] Account deletion requested");

    // 2. service_role 클라이언트로 데이터 삭제
    const adminClient = createClient(supabaseUrl, serviceKey);

    // 2-a. portfolio_history 삭제 (FK 없음 — 명시적 삭제 필요)
    const { error: historyError } = await adminClient
      .from("portfolio_history")
      .delete()
      .eq("user_id", userId);

    if (historyError) {
      console.warn("[delete-account] portfolio_history 삭제 실패 (계속 진행):", historyError.message);
    }

    // 2-b. portfolios 삭제 (CASCADE 없음 — 명시적 삭제 필요)
    const { error: portfolioError } = await adminClient
      .from("portfolios")
      .delete()
      .eq("user_id", userId);

    if (portfolioError) {
      console.error("[delete-account] portfolios 삭제 실패:", portfolioError.message);
      return new Response(
        JSON.stringify({ error: "Failed to delete portfolios" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. auth.users 삭제 (CASCADE로 나머지 자동 정리)
    //    - user_profiles (ON DELETE CASCADE)
    //    - user_devices (ON DELETE CASCADE)
    //    - sent_alarms (ON DELETE CASCADE)
    //    - telegram_link_tokens (ON DELETE CASCADE)
    //    - daily_execution_summaries (ON DELETE CASCADE)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[delete-account] auth.users 삭제 실패:", deleteError.message);
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[delete-account] Account deleted successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[delete-account] Unexpected error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
