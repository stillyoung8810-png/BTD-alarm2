// supabase/functions/send-alarm/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

interface AlarmRequest {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
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
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // OPTIONS 요청 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    if (!firebaseServiceAccount) {
      console.error("Missing FIREBASE_SERVICE_ACCOUNT");
      return new Response(
        JSON.stringify({ error: "Firebase service account not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    console.log(`Processing alarm for user: ${user_id}, title: ${title}`);

    // Supabase 클라이언트 생성
    const supabase = createClient(supabaseUrl, serviceKey);

    // user_devices 테이블에서 활성화된 토큰 조회
    const { data: devices, error: devicesError } = await supabase
      .from("user_devices")
      .select("fcm_token")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (devicesError) {
      console.error("Error fetching devices:", devicesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user devices" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!devices || devices.length === 0) {
      console.warn(`No active devices found for user ${user_id}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No active devices found",
          sent: 0,
          total: 0 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Firebase Service Account 파싱
    const serviceAccount = JSON.parse(firebaseServiceAccount);
    const projectId = serviceAccount.project_id;

    if (!projectId) {
      console.error("Project ID not found in service account");
      return new Response(
        JSON.stringify({ error: "Invalid service account configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Access Token 획득
    const accessToken = await getGoogleAccessToken(firebaseServiceAccount);

    // 모든 활성 토큰에 알림 전송
    const tokens = devices.map((d) => d.fcm_token).filter((token) => token);
    console.log(`Sending to ${tokens.length} device(s)`);

    const results = await Promise.allSettled(
      tokens.map((token) =>
        sendFCMNotification(accessToken, projectId, token, title, body, data)
      )
    );

    // 결과 집계
    let successful = 0;
    let failed = 0;
    const tokensToDeactivate: string[] = [];

    results.forEach((result, index) => {
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

    // 유효하지 않은 토큰 비활성화
    if (tokensToDeactivate.length > 0) {
      console.log(`Deactivating ${tokensToDeactivate.length} invalid token(s)`);
      await supabase
        .from("user_devices")
        .update({ is_active: false })
        .in("fcm_token", tokensToDeactivate);
    }

    // 마지막 알림 전송 시간 업데이트 (성공한 경우)
    if (successful > 0) {
      const now = new Date().toISOString();
      const successfulTokens = tokens.filter((_, index) => {
        const result = results[index];
        return result.status === "fulfilled" && result.value.success;
      });

      if (successfulTokens.length > 0) {
        // user_devices 테이블 업데이트
        await supabase
          .from("user_devices")
          .update({ last_notification_sent_at: now })
          .in("fcm_token", successfulTokens);
      }
    }

    console.log(`Alarm sent: ${successful} success, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: successful > 0,
        sent: successful,
        failed,
        total: tokens.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }
});
