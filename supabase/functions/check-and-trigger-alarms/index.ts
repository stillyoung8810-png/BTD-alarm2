// supabase/functions/check-and-trigger-alarms/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PortfolioRow {
  user_id: string | null;
  alarm_config: {
    enabled?: boolean;
    selectedHours?: string[];
  } | null;
  is_closed?: boolean | null;
}

interface SendAlarmPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

// 현재 UTC 시간을 KST(UTC+9) 기준 HH:mm 문자열로 변환
function getCurrentKSTTimeString(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  const kstHour = (utcHour + 9) % 24;
  const kstMinute = utcMinute;

  const hh = String(kstHour).padStart(2, "0");
  const mm = String(kstMinute).padStart(2, "0");

  return `${hh}:${mm}`;
}

// Supabase Functions URL 생성 (https://<project>.supabase.co -> https://<project>.functions.supabase.co)
function getFunctionsBaseUrl(supabaseUrl: string): string {
  if (!supabaseUrl) return "";
  return supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 현재 KST 시간 (HH:mm)
    const currentKstTime = getCurrentKSTTimeString();
    console.log("Current KST time:", currentKstTime);

    // KST 기준 주말(토·일)이면 알람 트리거하지 않음
    const now = new Date();
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const kstDay = kstTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (kstDay === 0 || kstDay === 6) {
      console.log("KST weekend (day=" + kstDay + "), skipping alarm trigger.");
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, skipped: "weekend" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // alarm_config.enabled = true 이고, alarm_config.selectedHours 에 현재 시간이 포함된 포트폴리오 조회
    const { data: portfolios, error } = await supabase
      .from("portfolios")
      .select("user_id, alarm_config, is_closed")
      .eq("is_closed", false)
      .not("alarm_config", "is", null);

    if (error) {
      console.error("Error fetching portfolios with alarms:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch portfolios" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!portfolios || portfolios.length === 0) {
      console.log("No portfolios with alarm_config found.");
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 현재 시간에 알람이 활성화된 user_id 목록 추출
    const userIdSet = new Set<string>();

    (portfolios as PortfolioRow[]).forEach((row) => {
      if (!row.user_id || !row.alarm_config) return;

      const cfg = row.alarm_config;
      const enabled = cfg.enabled === true;
      const selectedHours = Array.isArray(cfg.selectedHours)
        ? cfg.selectedHours
        : [];

      if (!enabled) return;

      if (selectedHours.includes(currentKstTime)) {
        userIdSet.add(row.user_id);
      }
    });

    const userIds = Array.from(userIdSet);

    if (userIds.length === 0) {
      console.log("No users to notify at this time.");
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // send-alarm 함수 URL 구성
    const functionsBaseUrl = getFunctionsBaseUrl(supabaseUrl);
    const sendAlarmUrl = `${functionsBaseUrl}/send-alarm`;

    const title = "BTD 매매 알람";
    const body = "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.";

    // 각 user_id 에 대해 send-alarm Edge Function 호출
    const payloads: SendAlarmPayload[] = userIds.map((userId) => ({
      user_id: userId,
      title,
      body,
      data: {
        type: "portfolio_alarm",
        time_kst: currentKstTime,
      },
    }));

    const results = await Promise.allSettled(
      payloads.map(async (payload) => {
        try {
          const res = await fetch(sendAlarmUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // 내부 호출이지만, 필요 시 인증을 위해 service role key를 포함
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const text = await res.text();
            console.error(
              `send-alarm failed for user ${payload.user_id}:`,
              res.status,
              text,
            );
            return false;
          }

          const json = await res.json();
          console.log("send-alarm response for user", payload.user_id, json);
          return true;
        } catch (err) {
          console.error("Error calling send-alarm for user", payload.user_id, err);
          return false;
        }
      }),
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value === true,
    ).length;
    const failed = results.length - successful;

    return new Response(
      JSON.stringify({
        success: successful > 0,
        triggeredUsers: userIds.length,
        sent: successful,
        failed,
        time_kst: currentKstTime,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error in check-and-trigger-alarms:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

