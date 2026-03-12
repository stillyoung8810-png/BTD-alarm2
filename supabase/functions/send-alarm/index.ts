// supabase/functions/send-alarm/index.ts
// 배포: supabase functions deploy send-alarm --no-verify-jwt
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT, importPKCS8 } from "jose";
import { getEffectiveSubscriptionState } from "../../../server/src/services/paymentFulfillment.ts";
import {
  BTD_TOSS_SMART_MESSAGE_TEMPLATE_CODE,
  buildBtdTossSmartMessageContext,
  type TossSmartMessageContext,
} from "../../../server/src/toss/smartMessage.ts";
import { getCorsHeaders, getJsonCorsHeaders } from "../_shared/cors.ts";

interface AlarmRequest {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface UserProfileRow {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean | null;
  telegram_chat_id?: string | null;
  preferred_language?: string | null;
  toss_user_key?: string | null;
}

/** 유료 구독 + 텔레그램 연결 시에만 텔레그램 발송 */
function shouldSendTelegram(profile: UserProfileRow | null): boolean {
  if (!profile) return false;
  const effective = getEffectiveSubscriptionState(profile);
  if (effective.tier !== "pro" && effective.tier !== "premium") return false;
  if (!effective.isActive || effective.isExpired) return false;
  if (profile.telegram_enabled !== true) return false;
  const chatId = profile.telegram_chat_id;
  if (!chatId || String(chatId).trim() === "") return false;
  return true;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_MAX_ERROR_STORAGE = 500;

/** 알람용 텔레그램 메시지 포맷 (길이 제한 적용) */
function formatTelegramAlarmMessage(
  title: string,
  body: string,
  data?: Record<string, string>,
  dailyExecutionSummary?: string,
): string {
  const timeLocal = data?.time_local;
  const timezone = data?.timezone;
  const timeKst = data?.time_kst;
  const parts = [
    "🔔 " + (title || "BTD 매매 알람"),
    "",
    body || "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.",
  ];
  if (timeLocal) {
    const tzLabel = timezone || "Asia/Seoul";
    parts.push("");
    parts.push(`⏰ ${tzLabel} ${timeLocal}`);
  } else if (timeKst) {
    parts.push("");
    parts.push(`⏰ KST ${timeKst}`);
  }
  if (dailyExecutionSummary && dailyExecutionSummary.trim().length > 0) {
    parts.push("");
    parts.push("📋 DAILY EXECUTION");
    parts.push(dailyExecutionSummary.trim());
  }
  const text = parts.join("\n");
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return text;
  return text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 3) + "...";
}

/** DB에 저장할 에러 메시지 길이 제한 */
function truncateErrorForStorage(msg: string): string {
  if (!msg || msg.length <= TELEGRAM_MAX_ERROR_STORAGE) return msg;
  return msg.slice(0, TELEGRAM_MAX_ERROR_STORAGE - 3) + "...";
}

async function sendTossSmartMessage(
  bffBase: string,
  internalSecret: string,
  userId: string,
  context: TossSmartMessageContext,
): Promise<{ success: boolean; errorMessage?: string }> {
  const url = `${bffBase.replace(/\/+$/, "")}/internal/toss/messages/send`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-alarm-secret": internalSecret,
      },
      body: JSON.stringify({
        userId,
        context,
      }),
    });

    const responseText = await response.text();
    let responseJson: Record<string, unknown> | null = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) as Record<string, unknown> : null;
    } catch {
      responseJson = null;
    }

    if (!response.ok || responseJson?.success !== true) {
      const errorMessage =
        typeof responseJson?.error === "string"
          ? responseJson.error
          : typeof responseJson?.message === "string"
            ? responseJson.message
            : responseText || `BFF request failed with ${response.status}`;

      return { success: false, errorMessage: truncateErrorForStorage(errorMessage) };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: truncateErrorForStorage(message) };
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  retryCount = 0,
): Promise<{ success: boolean; errorMessage?: string }> {
  const maxRetries = 1;
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const resText = await res.text();

    if (res.ok) {
      return { success: true };
    }

    // Telegram API 에러 응답 파싱 (JSON인 경우 description 사용)
    let errorMessage = `${res.status}: ${resText}`;
    try {
      const json = JSON.parse(resText) as { description?: string };
      if (json?.description) {
        errorMessage = json.description;
      }
    } catch {
      // 비-JSON 응답이면 그대로 사용
    }
    errorMessage = truncateErrorForStorage(errorMessage);

    // 5xx 또는 일시적 오류 시 1회 재시도
    const isRetryable = res.status >= 500 || res.status === 429;
    if (isRetryable && retryCount < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      return sendTelegramMessage(botToken, chatId, text, retryCount + 1);
    }

    return { success: false, errorMessage };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorMessage = truncateErrorForStorage(msg);
    const isRetryable = err instanceof TypeError && msg.includes("fetch");
    if (isRetryable && retryCount < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      return sendTelegramMessage(botToken, chatId, text, retryCount + 1);
    }
    return { success: false, errorMessage };
  }
}

/**
 * Google Service Account JSON을 파싱하고 Access Token을 생성 (jose 라이브러리 사용)
 */
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
  
  const jwt = await new SignJWT({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  // JWT를 Google OAuth2 토큰으로 교환
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * FCM V1 API를 사용하여 푸시 알림 전송
 */
async function sendFCMNotification(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; shouldDeactivate: boolean }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  
  const message = {
    message: {
      token,
      notification: {
        title,
        body,
      },
      android: {
        priority: "high",
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
        fcm_options: {
          link: "/",
        },
      },
      data: data ? Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value)])
      ) : undefined,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`FCM API error (${response.status}):`, errorText);
      
      // 토큰이 유효하지 않은 경우 비활성화 플래그 설정
      const shouldDeactivate = response.status === 404 || 
        errorText.includes('UNREGISTERED') || 
        errorText.includes('INVALID_ARGUMENT');
      
      return { success: false, shouldDeactivate };
    }

    const result = await response.json();
    console.log("FCM notification sent successfully:", result.name);
    return { success: true, shouldDeactivate: false };
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return { success: false, shouldDeactivate: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, {
    allowHeaders: "authorization, x-client-info, apikey, content-type, x-internal-alarm-secret",
  });
  const jsonHeaders = getJsonCorsHeaders(req, {
    allowHeaders: "authorization, x-client-info, apikey, content-type, x-internal-alarm-secret",
  });

  // OPTIONS 요청 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 내부 호출 전용: INTERNAL_ALARM_SECRET 이 있으면 헤더 검사 (JWT 없이 배포 시 401 방지)
  // Dashboard에서 internal_alarm_secret 으로 넣어도 동작하도록 둘 다 확인
  const internalSecret = (Deno.env.get("INTERNAL_ALARM_SECRET") ?? Deno.env.get("internal_alarm_secret"))?.trim() || "";
  if (internalSecret) {
    const headerSecret = (req.headers.get("X-Internal-Alarm-Secret") ?? req.headers.get("x-internal-alarm-secret"))?.trim() ?? "";
    if (headerSecret !== internalSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: 401, message: "Invalid or missing X-Internal-Alarm-Secret" }),
        { status: 401, headers: jsonHeaders }
      );
    }
  }

  try {
    // 환경 변수 확인
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const firebaseServiceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FIREBASE_SERVICE_ACCOUNT 없으면 FCM은 스킵하되, 텔레그램 발송은 진행 가능
    if (!firebaseServiceAccount) {
      console.warn("Missing FIREBASE_SERVICE_ACCOUNT; FCM will be skipped. Telegram may still be sent.");
    }

    // 요청 본문 파싱
    const alarmRequest: AlarmRequest = await req.json();
    const { user_id, title, body, data } = alarmRequest;

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing alarm, title: ${title}`);

    // Supabase 클라이언트 생성
    const supabase = createClient(supabaseUrl, serviceKey);

    // RPC: user_profiles + daily_execution_summaries + user_devices 한 번에 조회
    const { data: payload, error: payloadError } = await supabase.rpc("get_alarm_payload", {
      p_user_id: user_id,
    });

    if (payloadError) {
      console.error("get_alarm_payload RPC error:", payloadError.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch alarm payload" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profileRow = (payload?.profile ?? null) as UserProfileRow | null;
    let tossUserKey =
      typeof profileRow?.toss_user_key === "string"
        ? profileRow.toss_user_key.trim()
        : "";

    if (!tossUserKey) {
      const { data: tossProfile, error: tossProfileError } = await supabase
        .from("user_profiles")
        .select("toss_user_key")
        .eq("id", user_id)
        .maybeSingle();

      if (tossProfileError) {
        console.error("Failed to load toss_user_key:", tossProfileError.message);
        return new Response(
          JSON.stringify({ error: "Failed to fetch toss_user_key" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tossUserKey =
        typeof tossProfile?.toss_user_key === "string"
          ? tossProfile.toss_user_key.trim()
          : "";
    }

    const shouldSendTossPush = tossUserKey.length > 0;
    const sendTelegram = shouldSendTelegram(profileRow);
    const preferredLang: 'ko' | 'en' =
      profileRow?.preferred_language === 'en' ? 'en' : 'ko';
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const bffBase = (Deno.env.get("RAILWAY_BFF_URL") ?? Deno.env.get("railway_bff_url"))?.trim() || "";

    const dailyExecutionText: string | null = payload?.summary_text ?? null;
    const tokens: string[] = Array.isArray(payload?.fcm_tokens)
      ? payload.fcm_tokens.filter((t: string) => t)
      : [];

    // 알람 메타 정보 (이력 기록용)
    const alarmType = data?.type ?? null;
    const alarmTimeKst = data?.time_kst ?? null;
    const alarmTimeLocal = data?.time_local ?? null;
    const alarmTimezone = data?.timezone ?? null;
    const alarmLocalDate = data?.local_date ?? null;
    if (!shouldSendTossPush && tokens.length === 0) {
      console.warn(`No active FCM devices for user ${user_id}; will still try Telegram if enabled.`);
    }

    // 언어에 따른 알림 제목/본문 결정 (텔레그램/FCM 공통)
    const localizedTitle =
      preferredLang === 'en' ? 'BTD Trading Alert' : 'BTD 매매 알람';
    const localizedBody =
      preferredLang === 'en'
        ? 'This is your scheduled trading alert. Please review your portfolio strategy.'
        : '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.';

    let successful = 0;
    let failed = 0;
    const tokensToDeactivate: string[] = [];
    let fcmResults: PromiseSettledResult<{ success: boolean; shouldDeactivate: boolean }>[] = [];
    let tossPushSent = false;
    let tossPushError: string | null = null;
    const tossMessageContext = shouldSendTossPush
      ? buildBtdTossSmartMessageContext({
          local_date: data?.local_date,
          time_local: data?.time_local,
          time_kst: data?.time_kst,
        })
      : null;

    if (shouldSendTossPush) {
      if (!bffBase) {
        tossPushError = "RAILWAY_BFF_URL not set";
        console.warn(`Toss push skipped for user ${user_id}:`, tossPushError);
      } else if (!internalSecret) {
        tossPushError = "INTERNAL_ALARM_SECRET not set";
        console.warn(`Toss push skipped for user ${user_id}:`, tossPushError);
      } else {
        const tossResult = await sendTossSmartMessage(
          bffBase,
          internalSecret,
          user_id,
          tossMessageContext!,
        );

        tossPushSent = tossResult.success;
        tossPushError = tossResult.success ? null : tossResult.errorMessage ?? "Toss push send failed";

        if (tossPushSent) {
          console.log(`Toss push sent for user ${user_id}`);
        } else {
          console.warn(`Toss push failed for user ${user_id}:`, tossPushError);
        }
      }
    }

    // FCM 발송: FIREBASE_SERVICE_ACCOUNT 있을 때만 수행
    if (!shouldSendTossPush && firebaseServiceAccount && tokens.length > 0) {
      let serviceAccount: { project_id?: string } = {};
      try {
        serviceAccount = JSON.parse(firebaseServiceAccount);
      } catch (e) {
        console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON:", e);
      }
      const projectId = serviceAccount?.project_id;
      if (projectId) {
        try {
          const accessToken = await getGoogleAccessToken(firebaseServiceAccount);
          console.log(`Sending FCM to ${tokens.length} device(s)`);
          fcmResults = await Promise.allSettled(
            tokens.map((token) =>
              sendFCMNotification(accessToken, projectId, token, localizedTitle, localizedBody, data)
            )
          );
          fcmResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
              if (result.value.success) {
                successful++;
              } else {
                failed++;
                if (result.value.shouldDeactivate) {
                  tokensToDeactivate.push(tokens[index]);
                }
              }
            } else {
              failed++;
            }
          });
          if (tokensToDeactivate.length > 0) {
            console.log(`Deactivating ${tokensToDeactivate.length} invalid token(s)`);
            await supabase
              .from("user_devices")
              .update({ is_active: false })
              .in("fcm_token", tokensToDeactivate);
          }
        } catch (fcmErr) {
          console.error("FCM send error:", fcmErr);
          failed = tokens.length;
        }
      } else {
        console.warn("Project ID not found in service account; skipping FCM.");
        failed = tokens.length;
      }
    } else if (shouldSendTossPush && tokens.length > 0) {
      console.log(`Skipping FCM for user ${user_id} because toss_user_key is present`);
    }

    // 텔레그램 발송 (Pro/Premium + telegram_enabled + chat_id 있을 때만)
    let telegramSent = false;
    if (sendTelegram && telegramBotToken && profileRow?.telegram_chat_id) {
      const telegramText = formatTelegramAlarmMessage(
        localizedTitle,
        localizedBody,
        data,
        dailyExecutionText || undefined,
      );
      const tgResult = await sendTelegramMessage(
        telegramBotToken,
        String(profileRow.telegram_chat_id).trim(),
        telegramText,
      );
      if (tgResult.success) {
        telegramSent = true;
        console.log(`Telegram sent for user ${user_id}`);
        await supabase
          .from("user_profiles")
          .update({ telegram_last_error: null })
          .eq("id", user_id);
      } else {
        const errToStore = truncateErrorForStorage(tgResult.errorMessage ?? "Send failed");
        console.warn(`Telegram send failed for user ${user_id}:`, errToStore);
        await supabase
          .from("user_profiles")
          .update({ telegram_last_error: errToStore })
          .eq("id", user_id);
      }
    } else if (sendTelegram && !telegramBotToken) {
      console.warn("TELEGRAM_BOT_TOKEN not set; skipping Telegram.");
    }

    // sent_alarms 테이블에 전송 이력 기록 (채널별 1행씩)
    try {
      const historyRows: Array<{
        user_id: string;
        channel: string;
        status: string;
        error_message?: string | null;
        alarm_type?: string | null;
        time_kst?: string | null;
        time_local?: string | null;
        timezone?: string | null;
        local_date?: string | null;
        payload_snapshot?: Record<string, unknown>;
      }> = [];

      // FCM 이력
      if (!shouldSendTossPush && tokens.length > 0) {
        const fcmStatus = successful > 0 ? "success" : "failure";
        const fcmError =
          failed > 0
            ? `FCM: ${successful} success, ${failed} failure (tokens=${tokens.length})`
            : null;

        historyRows.push({
          user_id,
          channel: "fcm",
          status: fcmStatus,
          error_message: fcmError,
          alarm_type: alarmType ?? undefined,
          time_kst: alarmTimeKst ?? undefined,
          time_local: alarmTimeLocal ?? undefined,
          timezone: alarmTimezone ?? undefined,
          local_date: alarmLocalDate ?? undefined,
          payload_snapshot: {
            title: localizedTitle,
            body: localizedBody,
            time_kst: alarmTimeKst,
            time_local: alarmTimeLocal,
            timezone: alarmTimezone,
            local_date: alarmLocalDate,
          },
        });
      }

      if (shouldSendTossPush) {
        historyRows.push({
          user_id,
          channel: "toss_push",
          status: tossPushSent ? "success" : "failure",
          error_message: tossPushError,
          alarm_type: alarmType ?? undefined,
          time_kst: alarmTimeKst ?? undefined,
          time_local: alarmTimeLocal ?? undefined,
          timezone: alarmTimezone ?? undefined,
          local_date: alarmLocalDate ?? undefined,
          payload_snapshot: {
            templateSetCode: BTD_TOSS_SMART_MESSAGE_TEMPLATE_CODE,
            context: tossMessageContext,
            time_kst: alarmTimeKst,
            time_local: alarmTimeLocal,
            timezone: alarmTimezone,
            local_date: alarmLocalDate,
          },
        });
      }

      // 텔레그램 이력
      if (sendTelegram) {
        const tgStatus = telegramSent ? "success" : "failure";
        // 구체적인 에러 메시지는 user_profiles.telegram_last_error에 남기므로 여기서는 요약만
        const tgError = tgStatus === "failure" ? "Telegram send failed" : null;

        historyRows.push({
          user_id,
          channel: "telegram",
          status: tgStatus,
          error_message: tgError,
          alarm_type: alarmType ?? undefined,
          time_kst: alarmTimeKst ?? undefined,
          time_local: alarmTimeLocal ?? undefined,
          timezone: alarmTimezone ?? undefined,
          local_date: alarmLocalDate ?? undefined,
          payload_snapshot: {
            title: localizedTitle,
            body: localizedBody,
            time_kst: alarmTimeKst,
            time_local: alarmTimeLocal,
            timezone: alarmTimezone,
            local_date: alarmLocalDate,
          },
        });
      }

      if (historyRows.length > 0) {
        await supabase.from("sent_alarms").insert(historyRows);
      }
    } catch (err) {
      console.warn("[sent_alarms] insert failed (logging only):", err);
    }

    // 마지막 알림 전송 시간 업데이트 (FCM 성공한 경우)
    if (successful > 0 && fcmResults.length > 0) {
      const now = new Date().toISOString();
      const successfulTokens = tokens.filter((_, index) => {
        const result = fcmResults[index];
        return result?.status === "fulfilled" && result.value.success;
      });

      if (successfulTokens.length > 0) {
        await supabase
          .from("user_devices")
          .update({ last_notification_sent_at: now })
          .in("fcm_token", successfulTokens);
      }
    }

    console.log(`Alarm sent: fcm=${successful}/${failed}, toss=${tossPushSent}, telegram=${telegramSent}`);

    return new Response(
      JSON.stringify({
        success: successful > 0 || tossPushSent || telegramSent,
        sent: successful,
        failed,
        total: tokens.length,
        toss_push_sent: tossPushSent,
        toss_push_error: tossPushError,
        telegram_sent: telegramSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    const message =
      error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
