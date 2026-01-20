// supabase/functions/send-alarm/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleAuth } from "https://esm.sh/google-auth-library@9";

interface AlarmRequest {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface FCMV1Message {
  message: {
    token: string;
    notification: {
      title: string;
      body: string;
    };
    data?: Record<string, string>;
    android?: {
      priority: "high" | "normal";
    };
    webpush?: {
      headers: {
        Urgency: "high" | "normal";
      };
    };
  };
}

/**
 * Google Service Account JSON을 파싱하고 Access Token을 생성
 */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    const auth = new GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
        project_id: serviceAccount.project_id,
      },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error("Failed to get access token");
    }

    return accessToken.token;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
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
): Promise<boolean> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  
  const message: FCMV1Message = {
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
      },
    },
  };

  // data가 있으면 추가 (문자열로 변환 필요)
  if (data) {
    const stringifiedData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      stringifiedData[key] = String(value);
    }
    message.message.data = stringifiedData;
  }

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
      return false;
    }

    const result = await response.json();
    console.log("FCM notification sent successfully:", result.name);
    return true;
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return false;
  }
}

serve(async (req) => {
  try {
    // CORS 헤더 설정
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    // OPTIONS 요청 처리
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

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
    const accessToken = await getAccessToken(firebaseServiceAccount);

    // 모든 활성 토큰에 알림 전송
    const tokens = devices.map((d) => d.fcm_token).filter((token) => token);
    const results = await Promise.allSettled(
      tokens.map((token) =>
        sendFCMNotification(accessToken, projectId, token, title, body, data)
      )
    );

    // 결과 집계
    const successful = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === false)).length;

    // 실패한 토큰 처리 (선택사항: is_active를 false로 업데이트)
    const failedTokens: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected" || (result.status === "fulfilled" && result.value === false)) {
        failedTokens.push(tokens[index]);
      }
    });

    // 실패한 토큰이 있으면 비활성화 (선택사항)
    if (failedTokens.length > 0) {
      await supabase
        .from("user_devices")
        .update({ is_active: false })
        .in("fcm_token", failedTokens)
        .eq("user_id", user_id);
    }

    // 마지막 알림 전송 시간 업데이트 (성공한 경우만)
    if (successful > 0) {
      const now = new Date().toISOString();
      await supabase
        .from("user_devices")
        .update({ last_notification_sent_at: now })
        .eq("user_id", user_id)
        .in("fcm_token", tokens.filter((_, index) => {
          const result = results[index];
          return result.status === "fulfilled" && result.value === true;
        }));
    }

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
