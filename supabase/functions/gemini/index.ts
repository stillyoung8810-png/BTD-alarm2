// Supabase Edge Function: Gemini 호출을 이 함수에서만 수행.
// 배포: supabase functions deploy gemini --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // CORS preflight
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
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
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return new Response(JSON.stringify({ trades: [] }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const client = new GoogleGenerativeAI(apiKey);

  try {
    if (body.mode === "advisor") {
      const model = client.getGenerativeModel({ model: "gemini-3.5-flash" });
      const resp = await model.generateContent(
        `Evaluate this trading strategy. Provide a professional fintech advisor insight (max 3 sentences) that specifically includes a brief mention of potential historical backtest performance (e.g., expected returns or risk/reward ratio based on these technical indicators): ${body.strategyDescription}`,
      );
      const text = resp.response.text();
      return new Response(JSON.stringify({ text }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (body.mode === "analyze-trades") {
      const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
      const promptText = `This image is a screenshot of a brokerage/trading app showing trade execution history (buy/sell records).
Extract ALL visible trade records. For each trade return: type ("buy" or "sell"), stock (ticker symbol, e.g. TQQQ, QQQ), date (YYYY-MM-DD), price (number), quantity (number), fee (number if visible, else 0), isMOC (true only if it is a market-on-close sell).
Return a valid JSON object with a single key "trades" which is an array of objects. Example:
{"trades":[{"type":"buy","stock":"TQQQ","date":"2025-02-01","price":35.5,"quantity":10,"fee":0.09,"isMOC":false}]}
If no trade data is visible or the image is not a trade/execution screen, return: {"trades":[]}
Output only the JSON, no other text.`;

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
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      return new Response(match[0], {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response("Invalid mode", { status: 400, headers: CORS_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate limit|quota|resource exhausted/i.test(msg)) {
      return new Response("RATE_LIMIT", { status: 429 });
      return new Response("RATE_LIMIT", { status: 429, headers: CORS_HEADERS });
    }
    console.error("Supabase gemini function error:", err);
    if (body.mode === "advisor") {
      return new Response(JSON.stringify({ text: FALLBACK_ADVISOR_TEXT }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        status: 500,
      });
    }
    return new Response(JSON.stringify({ trades: [] }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      status: 500,
    });
  }
});

