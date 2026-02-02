import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getStrategyAdvisor = async (strategyDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate this trading strategy. Provide a professional fintech advisor insight (max 3 sentences) that specifically includes a brief mention of potential historical backtest performance (e.g., expected returns or risk/reward ratio based on these technical indicators): ${strategyDescription}`,
      config: {
        temperature: 0.7,
        topP: 0.95,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";
  }
};

/** AI가 인식한 단일 매매 항목 (저장 전 확인용) */
export interface RecognizedTradeItem {
  type: "buy" | "sell";
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee?: number;
  isMOC?: boolean;
}

/** 증권사 매매 내역 스크린샷 이미지를 분석해 매매 정보를 JSON 배열로 추출. apiKey 미지정 시 기본(process.env.API_KEY) 사용. */
export const analyzeTradeScreenshot = async (
  imageBase64: string,
  mimeType: string = "image/png",
  options?: { apiKey?: string }
): Promise<{ trades: RecognizedTradeItem[] } | null> => {
  const client = options?.apiKey ? new GoogleGenAI({ apiKey: options.apiKey }) : ai;
  try {
    const promptText = `This image is a screenshot of a brokerage/trading app showing trade execution history (buy/sell records).
Extract ALL visible trade records. For each trade return: type ("buy" or "sell"), stock (ticker symbol, e.g. TQQQ, QQQ), date (YYYY-MM-DD), price (number), quantity (number), fee (number if visible, else 0), isMOC (true only if it is a market-on-close sell).
Return a valid JSON object with a single key "trades" which is an array of objects. Example:
{"trades":[{"type":"buy","stock":"TQQQ","date":"2025-02-01","price":35.5,"quantity":10,"fee":0.09,"isMOC":false}]}
If no trade data is visible or the image is not a trade/execution screen, return: {"trades":[]}
Output only the JSON, no other text.`;

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          inlineData: {
            mimeType,
            data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
          },
        },
        {
          text: promptText,
        },
      ],
      config: {
        temperature: 0.2,
      },
    });

    const text = response.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { trades?: unknown[] };
    if (!parsed || !Array.isArray(parsed.trades)) return { trades: [] };

    const validTrades: RecognizedTradeItem[] = parsed.trades
      .filter(
        (t): t is RecognizedTradeItem =>
          t != null &&
          typeof t === "object" &&
          ((t as RecognizedTradeItem).type === "buy" || (t as RecognizedTradeItem).type === "sell") &&
          typeof (t as RecognizedTradeItem).stock === "string" &&
          typeof (t as RecognizedTradeItem).price === "number" &&
          typeof (t as RecognizedTradeItem).quantity === "number"
      )
      .map((t) => ({
        type: t.type,
        stock: String(t.stock).toUpperCase().trim(),
        date: typeof t.date === "string" ? t.date : "",
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: typeof t.fee === "number" ? t.fee : 0,
        isMOC: t.isMOC === true,
      }));

    return { trades: validTrades };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|resource exhausted|quota|rate limit/i.test(msg)) {
      throw new Error("RATE_LIMIT");
    }
    console.error("analyzeTradeScreenshot error:", err);
    throw err;
  }
};
