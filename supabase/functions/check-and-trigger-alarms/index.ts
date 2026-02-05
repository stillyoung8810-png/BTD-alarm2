// supabase/functions/check-and-trigger-alarms/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DateTime } from "npm:luxon";

interface PortfolioRow {
  user_id: string | null;
  alarm_config: {
    enabled?: boolean;
    selectedHours?: string[];
    timezone?: string;
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

const DEFAULT_TIMEZONE = "Asia/Seoul";

type TimeWindow = {
  times: string[];
  localDate: string;
  isWeekend: boolean;
  nowLabel: string;
};

function getTimeWindow(zone: string): TimeWindow {
  const tz = zone?.trim() || DEFAULT_TIMEZONE;
  const now = DateTime.utc().setZone(tz);
  const times: string[] = [];
  for (let i = WINDOW_MINUTES; i >= 0; i--) {
    times.push(now.minus({ minutes: i }).toFormat("HH:mm"));
  }
  const localDate = now.toFormat("yyyy-MM-dd");
  const isWeekend = now.weekday === 6 || now.weekday === 7;
  return { times, localDate, isWeekend, nowLabel: now.toFormat("HH:mm") };
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
    // Dashboard에서 internal_alarm_secret 으로 넣어도 동작하도록 둘 다 확인 (대소문자 구분 없이)
    const internalAlarmSecret = (Deno.env.get("INTERNAL_ALARM_SECRET") ?? Deno.env.get("internal_alarm_secret"))?.trim() || "";

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 과거 WINDOW_MINUTES분 구간의 KST HH:mm 목록 (10분 크론 시 "보냈어야 하는 알람" 구간)
    const timeWindowCache = new Map<string, TimeWindow>();

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

    // 과거 WINDOW_MINUTES분 구간 중 selectedHours에 포함된 후보 수집
    const candidateKeys = new Set<string>();
    const candidateList: { user_id: string; time_local: string; timezone: string; local_date: string }[] = [];

    (portfolios as PortfolioRow[]).forEach((row) => {
      if (!row.user_id || !row.alarm_config) return;
      const cfg = row.alarm_config;
      const enabled = cfg.enabled === true;
      const selectedHours = Array.isArray(cfg.selectedHours) ? cfg.selectedHours : [];
      if (!enabled) return;
      const timezone = (cfg.timezone ?? DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
      const cached = timeWindowCache.get(timezone) ?? getTimeWindow(timezone);
      timeWindowCache.set(timezone, cached);
      if (cached.isWeekend) return;

      cached.times.forEach((hhmm) => {
        if (!selectedHours.includes(hhmm)) return;
        const key = `${row.user_id}|${timezone}|${cached.localDate}|${hhmm}`;
        if (candidateKeys.has(key)) return;
        candidateKeys.add(key);
        candidateList.push({
          user_id: row.user_id,
          time_local: hhmm,
          timezone,
          local_date: cached.localDate,
        });
      });
    });

    if (candidateList.length === 0) {
      console.log("No (user, time) candidates in window.");
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const alreadySentKeys = new Set<string>();
    const grouped = new Map<string, { timezone: string; local_date: string; users: Set<string>; times: Set<string> }>();
    candidateList.forEach((c) => {
      const key = `${c.timezone}|${c.local_date}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          timezone: c.timezone,
          local_date: c.local_date,
          users: new Set<string>(),
          times: new Set<string>(),
        });
      }
      const group = grouped.get(key)!;
      group.users.add(c.user_id);
      group.times.add(c.time_local);
    });

    for (const group of grouped.values()) {
      const userIds = [...group.users];
      const times = [...group.times];
      if (userIds.length === 0 || times.length === 0) continue;
      const { data: alreadySentRows } = await supabase
        .from("sent_alarms")
        .select("user_id, time_local, timezone, local_date")
        .eq("local_date", group.local_date)
        .eq("timezone", group.timezone)
        .in("user_id", userIds)
        .in("time_local", times);

      (alreadySentRows ?? []).forEach((r: { user_id: string; time_local: string; timezone: string; local_date: string }) => {
        alreadySentKeys.add(`${r.user_id}|${r.timezone}|${r.local_date}|${r.time_local}`);
      });
    }

    const toSend = candidateList.filter((c) => !alreadySentKeys.has(`${c.user_id}|${c.timezone}|${c.local_date}|${c.time_local}`));
    console.log("Candidates:", candidateList.length, "already sent:", alreadySentKeys.size, "to send:", toSend.length);

    if (toSend.length === 0) {
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0, skipped: "already_sent" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // send-alarm 함수 URL (공식 invoke URL 사용 → 401 Invalid JWT 방지)
    const sendAlarmUrl = getSendAlarmUrl(supabaseUrl);

    const title = "BTD 매매 알람";
    const body = "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.";

    // 각 (user_id, time_local, timezone) 에 대해 send-alarm 호출
    const payloads: SendAlarmPayload[] = toSend.map(({ user_id, time_local, timezone, local_date }) => ({
      user_id,
      title,
      body,
      data: {
        type: "portfolio_alarm",
        time_local,
        timezone,
        local_date,
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
        time_window: [...timeWindowCache.entries()].map(([tz, v]) => ({
          timezone: tz,
          local_date: v.localDate,
          now: v.nowLabel,
          window: v.times,
        })),
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

