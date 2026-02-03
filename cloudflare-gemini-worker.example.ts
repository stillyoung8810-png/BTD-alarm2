// Cloudflare Worker 예시: Gemini 호출을 이 Worker에서만 수행.
// 실제 배포 시에는 이 파일을 Workers 프로젝트에 맞게 옮기고, Env 타입/라우팅을 조정하세요.

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface Env {
  GEMINI_API_KEY_FREE: string;
  GEMINI_API_KEY_PAID: string;
}

type Tier = "free" | "paid";

const getApiKey = (env: Env, tier: Tier): string | null => {
  if (tier === "paid") {
    return env.GEMINI_API_KEY_PAID || env.GEMINI_API_KEY_FREE || null;
  }
  return env.GEMINI_API_KEY_FREE || null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/analyze-trades") {
      const body = await request.json<{ imageBase64: string; mimeType?: string; tier?: Tier }>();
      const apiKey = getApiKey(env, body.tier || "free");
      if (!apiKey) {
        return new Response(JSON.stringify({ trades: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const client = new GoogleGenerativeAI(apiKey);
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
              mimeType: body.mimeType || "image/png",
              data: body.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
            },
          },
          { text: promptText },
        ]);

        const text = resp.response.text().trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          return new Response(JSON.stringify({ trades: [] }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(match[0], {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/429|rate limit|quota/i.test(msg)) {
          return new Response("RATE_LIMIT", { status: 429 });
        }
        console.error("Worker analyze-trades error:", err);
        return new Response(JSON.stringify({ trades: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/advisor") {
      const body = await request.json<{ strategyDescription: string; tier?: Tier }>();
      const apiKey = getApiKey(env, body.tier || "free");
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            text:
              "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({ model: "gemini-3.5-flash" });
        const resp = await model.generateContent(
          `Evaluate this trading strategy. Provide a professional fintech advisor insight (max 3 sentences) that specifically includes a brief mention of potential historical backtest performance (e.g., expected returns or risk/reward ratio based on these technical indicators): ${body.strategyDescription}`
        );
        const text = resp.response.text();
        return new Response(JSON.stringify({ text }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Worker advisor error:", err);
        return new Response(
          JSON.stringify({
            text:
              "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.",
          }),
          { headers: { "Content-Type": "application/json" }, status: 500 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};

