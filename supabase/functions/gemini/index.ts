// Supabase Edge Function: Gemini 호출을 이 함수에서만 수행.
// 배포: supabase functions deploy gemini --no-verify-jwt
// 인증: Authorization Bearer 헤더 존재 여부만 확인 (프론트에서 Supabase 세션 토큰 전달)

import { serve } from "std/http/server.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationConfig } from "@google/generative-ai";
import { getCorsHeaders, getJsonCorsHeaders } from "../_shared/cors.ts";

type Tier = "free" | "paid";

interface AdvisorRequestBody {
  mode: "advisor";
  strategyDescription: string;
  tier?: Tier;
}

interface AnalyzeTradesRequestBody {
  mode: "analyze-trades";
  imageBase64: string;
  mimeType?: string;
  tier?: Tier;
}

type RequestBody = AdvisorRequestBody | AnalyzeTradesRequestBody;

const FALLBACK_ADVISOR_TEXT =
  "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";

const getTier = (tier?: Tier): Tier => (tier === "paid" ? "paid" : "free");

const getApiKey = (tier: Tier): string | null => {
  const freeKey = Deno.env.get("GEMINI_API_KEY_FREE") ?? undefined;
  const paidKey = Deno.env.get("GEMINI_API_KEY_PAID") ?? undefined;
  if (tier === "paid") {
    return paidKey ?? freeKey ?? null;
  }
  return freeKey ?? null;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = getJsonCorsHeaders(req);

  if (req.method === "OPTIONS") {
    // CORS preflight
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // 인증: 프론트에서 Supabase로 발급받은 Bearer 토큰이 있는지만 확인
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (_err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const tier = getTier(body.tier);
  const apiKey = getApiKey(tier);
  if (!apiKey) {
    if (body.mode === "advisor") {
      return new Response(JSON.stringify({ text: FALLBACK_ADVISOR_TEXT }), {
        headers: jsonHeaders,
      });
    }
    return new Response(JSON.stringify({ trades: [] }), {
      headers: jsonHeaders,
    });
  }

  const client = new GoogleGenerativeAI(apiKey);

  try {
    if (body.mode === "advisor") {
      const model = client.getGenerativeModel({
        model: "gemini-2.5-flash",
      });
      const resp = await model.generateContent(
        `Evaluate this trading strategy. Provide a professional fintech advisor insight (max 3 sentences) that specifically includes a brief mention of potential historical backtest performance (e.g., expected returns or risk/reward ratio based on these technical indicators): ${body.strategyDescription}`,
      );
      const text = resp.response.text();
      return new Response(JSON.stringify({ text }), {
        headers: jsonHeaders,
      });
    }

    if (body.mode === "analyze-trades") {
      const model = client.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        } as unknown as GenerationConfig,
      });
      const promptText =
        `Analyze this image of a brokerage trading history screen (likely Korean interface).
Extract ALL visible trade records. Note that each record may span two lines (e.g. Date/Stock on line 1, Type/Price/Qty on line 2).

Mapping Rules:
- "매수" or "Buy" -> type: "buy"
- "매도" or "Sell" -> type: "sell"
- Date usually formatted as YYYY-MM-DD.
- "체결수량" is Quantity.
- "체결단가" is Price.

Return a JSON object with a key "trades" containing an array of trade objects.
Each object must have: type ("buy"/"sell"), stock (convert to TICKER SYMBOL e.g. "Apple" -> "AAPL", "ProShares UltraPro QQQ" -> "TQQQ"), date (YYYY-MM-DD), price (number), quantity (number), fee (number, 0 if not visible), isMOC (boolean).

Example JSON:
{"trades": [{"type": "sell", "stock": "TQQQ", "date": "2026-01-09", "price": 54.5, "quantity": 10, "fee": 0.16, "isMOC": false}]}
Return {"trades":[]} if no valid trade data is found.`;

      const resp = await model.generateContent([
        {
          inlineData: {
            mimeType: body.mimeType ?? "image/png",
            data: body.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
          },
        },
        { text: promptText },
      ]);

      const text = resp.response.text().trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(JSON.stringify({ trades: [] }), {
          headers: jsonHeaders,
        });
      }

      return new Response(match[0], {
        headers: jsonHeaders,
      });
    }

    return new Response("Invalid mode", { status: 400, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate limit|quota|resource exhausted/i.test(msg)) {
      return new Response("RATE_LIMIT", { status: 429, headers: corsHeaders });
    }
    console.error(
      "Supabase gemini function error DETAILS:",
      JSON.stringify(err, null, 2),
    );
    console.error("Error message:", msg);

    if (body.mode === "advisor") {
      return new Response(JSON.stringify({ text: FALLBACK_ADVISOR_TEXT }), {
        headers: jsonHeaders,
        status: 500,
      });
    }
    return new Response(JSON.stringify({ trades: [] }), {
      headers: jsonHeaders,
      status: 500,
    });
  }
});
