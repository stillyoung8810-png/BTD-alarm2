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

// 간단한 sleep 유틸 (배치 간 딜레이용)
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 크론 주기(분). 이 구간만큼 과거 시간을 검사하고, sent_alarms로 중복 발송을 막습니다. */
const WINDOW_MINUTES = 10;

/** KST(UTC+9) 기준 현재 HH:mm */
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

/** 과거 WINDOW_MINUTES분 구간의 KST HH:mm 목록 (현재 분 포함, 예: 15:10 실행 시 ["15:00","15:01",...,"15:10"]) */
function getKSTTimeWindow(): string[] {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const kstTotalMinutes = (utcHour + 9) * 60 + utcMinute;
  const window: string[] = [];
  for (let i = WINDOW_MINUTES; i >= 0; i--) {
    const m = kstTotalMinutes - i;
    const dayMinutes = ((m % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(dayMinutes / 60);
    const min = dayMinutes % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    window.push(`${hh}:${mm}`);
  }
  return window;
}

/** KST 기준 "오늘"의 시작/끝을 UTC ISO 문자열로 반환 (sent_alarms 조회용) */
function getTodayKSTRangeUTC(): { start: string; end: string } {
  const now = new Date();
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);
  const y = kstNow.getUTCFullYear();
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstNow.getUTCDate()).padStart(2, "0");
  const startDate = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}

// Edge Function 호출 URL (공식: https://<project>.supabase.co/functions/v1/<함수명>)
function getSendAlarmUrl(supabaseUrl: string): string {
  if (!supabaseUrl) return "";
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/send-alarm`;
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalAlarmSecret = Deno.env.get("INTERNAL_ALARM_SECRET");

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 과거 WINDOW_MINUTES분 구간의 KST HH:mm 목록 (10분 크론 시 "보냈어야 하는 알람" 구간)
    const timeWindow = getKSTTimeWindow();
    const currentKstTime = getCurrentKSTTimeString();
    console.log("Current KST time:", currentKstTime, "window (past", WINDOW_MINUTES, "min):", timeWindow);

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

    // alarm_config.enabled = true 이고, alarm_config.selectedHours 가 있는 포트폴리오 조회
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
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 과거 WINDOW_MINUTES분 구간 중 selectedHours에 포함된 (user_id, time_kst) 후보 수집
    const candidateKeys = new Set<string>();
    const candidateList: { user_id: string; time_kst: string }[] = [];

    (portfolios as PortfolioRow[]).forEach((row) => {
      if (!row.user_id || !row.alarm_config) return;
      const cfg = row.alarm_config;
      const enabled = cfg.enabled === true;
      const selectedHours = Array.isArray(cfg.selectedHours) ? cfg.selectedHours : [];
      if (!enabled) return;

      timeWindow.forEach((hhmm) => {
        if (!selectedHours.includes(hhmm)) return;
        const key = `${row.user_id}|${hhmm}`;
        if (candidateKeys.has(key)) return;
        candidateKeys.add(key);
        candidateList.push({ user_id: row.user_id, time_kst: hhmm });
      });
    });

    if (candidateList.length === 0) {
      console.log("No (user, time) candidates in window.");
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0, time_window: timeWindow }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 오늘 KST 기준 이미 발송된 (user_id, time_kst) 조회 → 중복 발송 방지
    const { start: todayStart, end: todayEnd } = getTodayKSTRangeUTC();
    const userIdsInCandidates = [...new Set(candidateList.map((c) => c.user_id))];
    const timeKstsInWindow = [...new Set(candidateList.map((c) => c.time_kst))];

    const { data: alreadySentRows } = await supabase
      .from("sent_alarms")
      .select("user_id, time_kst")
      .gte("sent_at", todayStart)
      .lt("sent_at", todayEnd)
      .in("user_id", userIdsInCandidates)
      .in("time_kst", timeKstsInWindow);

    const alreadySentKeys = new Set<string>();
    (alreadySentRows ?? []).forEach((r: { user_id: string; time_kst: string }) => {
      alreadySentKeys.add(`${r.user_id}|${r.time_kst}`);
    });

    const toSend = candidateList.filter((c) => !alreadySentKeys.has(`${c.user_id}|${c.time_kst}`));
    console.log("Candidates:", candidateList.length, "already sent:", alreadySentKeys.size, "to send:", toSend.length);

    if (toSend.length === 0) {
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0, time_window: timeWindow, skipped: "already_sent" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // send-alarm 함수 URL (공식 invoke URL 사용 → 401 Invalid JWT 방지)
    const sendAlarmUrl = getSendAlarmUrl(supabaseUrl);

    const title = "BTD 매매 알람";
    const body = "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.";

    // 각 (user_id, time_kst) 에 대해 send-alarm 호출 (같은 사용자도 time_kst별로 1회씩)
    const payloads: SendAlarmPayload[] = toSend.map(({ user_id, time_kst }) => ({
      user_id,
      title,
      body,
      data: {
        type: "portfolio_alarm",
        time_kst,
      },
    }));

    // 동시성 제한: 너무 많은 send-alarm을 한 번에 호출하지 않도록 배치 처리
    const BATCH_SIZE = 30;
    const BATCH_DELAY_MS = 200; // 배치 간 0.2초 간격 (rate limit 완화용)

    const allResults: PromiseSettledResult<boolean>[] = [];

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (payload) => {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            };
            if (internalAlarmSecret) {
              headers["X-Internal-Alarm-Secret"] = internalAlarmSecret;
            }
            const res = await fetch(sendAlarmUrl, {
              method: "POST",
              headers,
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
            console.error(
              "Error calling send-alarm for user",
              payload.user_id,
              err,
            );
            return false;
          }
        }),
      );

      allResults.push(...batchResults);

      // 마지막 배치가 아니면 잠시 대기하여 외부 API rate limit 완화
      if (i + BATCH_SIZE < payloads.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const successful = allResults.filter(
      (r) => r.status === "fulfilled" && r.value === true,
    ).length;
    const failed = allResults.length - successful;

    return new Response(
      JSON.stringify({
        success: successful > 0,
        triggeredUsers: toSend.length,
        sent: successful,
        failed,
        time_kst: currentKstTime,
        time_window: timeWindow,
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

