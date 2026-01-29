// supabase/functions/telegram-webhook/index.ts
// 텔레그램 봇 Webhook 엔드포인트
// 역할:
// 1) 사용자가 봇에게 `/start <token>` 을 보내면
// 2) telegram_link_tokens 테이블에서 해당 token → user_id 조회
// 3) user_profiles 에 telegram_chat_id, telegram_enabled 업데이트
// 4) 토큰은 일회성으로 삭제
//
// 주의: 이 함수는 "연결"만 담당합니다.
// 실제 알림 발송 로직은 알람 Edge Function에서 telegram_chat_id 를 사용해 구현합니다.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

serve(async (req) => {
  try {
    if (req.method === "GET") {
      return new Response(
        "telegram-webhook is running",
        { status: 200 },
      );
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!supabaseUrl || !serviceKey || !telegramBotToken) {
      console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or TELEGRAM_BOT_TOKEN");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const update = (await req.json()) as TelegramUpdate;
    console.log("Received Telegram update:", JSON.stringify(update));

    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text || "";

    if (!chatId || !text) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no chatId or text" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // /start <token> 패턴만 처리
    const startMatch = text.trim().match(/^\/start\s+([a-zA-Z0-9_-]+)$/);
    if (!startMatch) {
      // 다른 명령에 대해서는 간단한 안내만 반환
      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        "이 봇은 BUY THE DIP 알림 연동용입니다. 웹 서비스에서 '텔레그램 연결하기' 버튼을 사용해 주세요.",
      );
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = startMatch[1];
    console.log("Parsed token from /start:", token);

    // 1) token → user_id 조회
    const { data: linkRow, error: linkError } = await supabase
      .from("telegram_link_tokens")
      .select("user_id")
      .eq("token", token)
      .single();

    if (linkError || !linkRow) {
      console.error("Invalid or expired telegram link token:", linkError);
      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        "연결 토큰이 유효하지 않거나 만료되었습니다. 웹 서비스에서 다시 '텔레그램 연결하기'를 눌러 주세요.",
      );
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = linkRow.user_id;

    // 2) user_profiles 업데이트: telegram_enabled, telegram_chat_id, telegram_connected_at
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        telegram_enabled: true,
        telegram_chat_id: String(chatId),
        telegram_connected_at: new Date().toISOString(),
        telegram_last_error: null,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update user_profiles for telegram:", updateError);
      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        "텔레그램 연동 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return new Response(JSON.stringify({ error: "update failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3) 토큰 일회성 사용 후 삭제
    const { error: deleteError } = await supabase
      .from("telegram_link_tokens")
      .delete()
      .eq("token", token);

    if (deleteError) {
      console.warn("Failed to delete telegram_link_tokens row:", deleteError);
    }

    // 4) 사용자에게 연결 완료 메시지 전송
    await sendTelegramMessage(
      telegramBotToken,
      chatId,
      "✅ 텔레그램 알림이 성공적으로 연결되었습니다.\n이제 BUY THE DIP에서 텔레그램 알림을 받을 수 있습니다.",
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Failed to send Telegram message:", res.status, errorText);
    }
  } catch (err) {
    console.error("Error sending Telegram message:", err);
  }
}

