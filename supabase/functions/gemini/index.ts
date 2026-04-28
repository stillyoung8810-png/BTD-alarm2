// Supabase Edge Function: Gemini 호출을 이 함수에서만 수행.
// 배포: supabase functions deploy gemini --no-verify-jwt
// 인증: 프론트에서 전달한 Supabase Bearer 토큰을 auth.getUser()로 검증

import { serve } from "std/http/server.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationConfig } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders, getJsonCorsHeaders } from "../_shared/cors.ts";

type Tier = "free" | "paid";
type UsageCheckMode = "edge";
type UsageLimitCode = "DAILY_LIMIT_REACHED" | "MONTHLY_LIMIT_REACHED";
type UsageTier = "free" | "pro" | "premium";

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
  usageCheckMode?: UsageCheckMode;
  usageTier?: string;
  skipUsageCheck?: boolean;
}

type RequestBody = AdvisorRequestBody | AnalyzeTradesRequestBody;

const FALLBACK_ADVISOR_TEXT =
  "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const UNLIMITED_USAGE_QUOTA = 999;
const PRO_MONTHLY_AI_QUOTA = 50;
const FREE_DAILY_AI_QUOTA = 1;
const AI_USAGE_LIMITS: Record<UsageTier, { daily: number; monthly: number }> = {
  free: { daily: FREE_DAILY_AI_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
  pro: { daily: UNLIMITED_USAGE_QUOTA, monthly: PRO_MONTHLY_AI_QUOTA },
  premium: { daily: UNLIMITED_USAGE_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
};

interface UsageRpcPayload {
  success: boolean;
  error?: string;
  current_daily?: number;
  current_monthly?: number | null;
}

const getTier = (tier?: Tier): Tier => (tier === "paid" ? "paid" : "free");

const normalizeUsageTier = (tier: string | undefined): UsageTier => {
  const normalizedTier = tier?.trim().toLowerCase();
  if (normalizedTier === "pro" || normalizedTier === "premium") {
    return normalizedTier;
  }

  return "free";
};

const getAiUsageLimits = (
  tier: string | undefined,
): { daily: number; monthly: number } => AI_USAGE_LIMITS[normalizeUsageTier(tier)];

const shouldRunEdgeUsageCheck = (body: RequestBody): body is AnalyzeTradesRequestBody =>
  body.mode === "analyze-trades" &&
  body.usageCheckMode === "edge" &&
  body.skipUsageCheck !== true;

const normalizeUsageLimitMessage = (error: unknown): UsageLimitCode | null => {
  if (typeof error !== "string") {
    return null;
  }

  const normalizedError = error.trim().toLowerCase();
  if (normalizedError === "daily limit reached") {
    return "DAILY_LIMIT_REACHED";
  }

  if (normalizedError === "monthly limit reached") {
    return "MONTHLY_LIMIT_REACHED";
  }

  return null;
};

const isUsageRpcPayload = (value: unknown): value is UsageRpcPayload => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return typeof (value as { success?: unknown }).success === "boolean";
};

const createJsonResponse = (
  payload: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response => new Response(JSON.stringify(payload), { status, headers });

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

  // 사용자 JWT로 RPC를 호출해야 DB 함수의 auth.uid() 정책이 기존과 동일하게 동작한다.
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return createJsonResponse({ error: "SUPABASE_ENV_MISSING" }, 500, jsonHeaders);
  }

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return createJsonResponse({ error: "Unauthorized" }, 401, jsonHeaders);
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

      if (shouldRunEdgeUsageCheck(body)) {
        const limits = getAiUsageLimits(body.usageTier);
        const { data, error } = await userClient.rpc("check_and_increment_usage", {
          p_usage_type: "ai",
          p_max_daily: limits.daily,
          p_max_monthly: limits.monthly,
        });

        if (error || !isUsageRpcPayload(data)) {
          return createJsonResponse({ error: "USAGE_CHECK_FAILED" }, 500, jsonHeaders);
        }

        if (!data.success) {
          const usageLimit = normalizeUsageLimitMessage(data.error);
          if (usageLimit != null) {
            return createJsonResponse({ trades: [], usageLimit }, 200, jsonHeaders);
          }

          return createJsonResponse({ error: "USAGE_CHECK_FAILED" }, 500, jsonHeaders);
        }
      }

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
