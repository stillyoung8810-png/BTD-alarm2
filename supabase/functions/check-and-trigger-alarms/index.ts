// supabase/functions/check-and-trigger-alarms/index.ts
// 배포: supabase functions deploy check-and-trigger-alarms --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DateTime } from "npm:luxon";
import { mapWithConcurrency } from "../_shared/asyncBatch.ts";
import type { PortfolioRow } from "../_shared/types.ts";

interface SendAlarmPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

type AlarmCandidate = {
  user_id: string;
  time_local: string;
  timezone: string;
  local_date: string;
};

type SentAlarmRow = {
  user_id: string | null;
  time_local: string | null;
  timezone: string | null;
  local_date: string | null;
};

/** 크론 주기(분). 이 구간만큼 과거 시간을 검사하고, sent_alarms로 중복 발송을 막습니다. */
const WINDOW_MINUTES = 10;

const DEFAULT_TIMEZONE = "Asia/Seoul";
const SEND_ALARM_CONCURRENCY = 30;
const SEND_ALARM_BATCH_DELAY_MS = 200;

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

function toSentAlarmKey(candidate: AlarmCandidate): string {
  return `${candidate.user_id}|${candidate.timezone}|${candidate.local_date}|${candidate.time_local}`;
}

function getUniqueCandidateValues(
  candidates: readonly AlarmCandidate[],
  selectValue: (candidate: AlarmCandidate) => string,
): string[] {
  return Array.from(
    new Set(
      candidates
        .map(selectValue)
        .filter((value) => value.trim().length > 0),
    ),
  );
}

async function fetchAlreadySentAlarmKeys(
  supabase: ReturnType<typeof createClient>,
  candidates: readonly AlarmCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) {
    return new Set<string>();
  }

  const userIds = getUniqueCandidateValues(
    candidates,
    (candidate) => candidate.user_id,
  );
  const localDates = getUniqueCandidateValues(
    candidates,
    (candidate) => candidate.local_date,
  );
  const timezones = getUniqueCandidateValues(
    candidates,
    (candidate) => candidate.timezone,
  );
  const localTimes = getUniqueCandidateValues(
    candidates,
    (candidate) => candidate.time_local,
  );

  if (
    userIds.length === 0 ||
    localDates.length === 0 ||
    timezones.length === 0 ||
    localTimes.length === 0
  ) {
    return new Set<string>();
  }

  // N개 timezone/date 그룹 조회를 후보군 전체 1회 bulk query로 압축합니다.
  const { data: sentRows, error: sentError } = await supabase
    .from("sent_alarms")
    .select("user_id, time_local, timezone, local_date")
    .in("user_id", userIds)
    .in("local_date", localDates)
    .in("timezone", timezones)
    .in("time_local", localTimes);

  if (sentError) {
    throw sentError;
  }

  return new Set(
    (sentRows ?? []).map((row: SentAlarmRow) =>
      toSentAlarmKey({
        user_id: String(row.user_id ?? ""),
        time_local: String(row.time_local ?? ""),
        timezone: String(row.timezone ?? ""),
        local_date: String(row.local_date ?? ""),
      }),
    ),
  );
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
    const internalAlarmSecret =
      (
        Deno.env.get("INTERNAL_ALARM_SECRET") ??
        Deno.env.get("internal_alarm_secret")
      )?.trim() || "";

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
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 과거 WINDOW_MINUTES분 구간 중 selectedHours에 포함된 후보 수집
    const candidateKeys = new Set<string>();
    const candidateList: AlarmCandidate[] = [];

    (portfolios as PortfolioRow[]).forEach((row) => {
      if (!row.user_id || !row.alarm_config) return;
      const cfg = row.alarm_config;
      const enabled = cfg.enabled === true;
      const selectedHours = Array.isArray(cfg.selectedHours)
        ? cfg.selectedHours
        : [];
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
      return new Response(
        JSON.stringify({ success: true, triggeredUsers: 0, sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const alreadySentKeys = await fetchAlreadySentAlarmKeys(
      supabase,
      candidateList,
    );
    const toSend = candidateList.filter(
      (c) => !alreadySentKeys.has(toSentAlarmKey(c)),
    );

    if (toSend.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          triggeredUsers: 0,
          sent: 0,
          skipped: "already_sent",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // send-alarm 함수 URL (공식 invoke URL 사용 → 401 Invalid JWT 방지)
    const sendAlarmUrl = getSendAlarmUrl(supabaseUrl);

    const title = "BTD 매매 알람";
    const body = "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.";

    // 각 (user_id, time_local, timezone) 에 대해 send-alarm 호출
    const payloads: SendAlarmPayload[] = toSend.map(
      ({ user_id, time_local, timezone, local_date }) => ({
        user_id,
        title,
        body,
        data: {
          type: "portfolio_alarm",
          time_local,
          timezone,
          local_date,
        },
      }),
    );

    const deliveryResults = await mapWithConcurrency(
      payloads,
      SEND_ALARM_CONCURRENCY,
      async (payload) => {
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

          await res.json();
          return true;
        } catch (err) {
          console.error(
            "Error calling send-alarm for user",
            payload.user_id,
            err,
          );
          return false;
        }
      },
      { delayMsBetweenBatches: SEND_ALARM_BATCH_DELAY_MS },
    );

    const successful = deliveryResults.filter((isSuccess) => isSuccess).length;
    const failed = deliveryResults.length - successful;

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

