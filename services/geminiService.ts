import { GoogleGenAI } from "@google/genai";

const FALLBACK_ADVISOR_TEXT =
  "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";

/**
 * 브라우저 번들에서 API Key 없이 new GoogleGenAI()를 호출하면
 * \"An API Key must be set when running in a browser\" 에러가 발생하므로
 * 이 함수로 안전하게 클라이언트를 생성한다.
 */
const createGeminiClient = (apiKey?: string | null) => {
  if (!apiKey) {
    // 키가 없으면 클라이언트 생성 자체를 하지 않고, 상위에서 fallback 동작을 하도록 함.
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/** 전략 설명에 대한 짧은 인사이트를 반환. apiKey가 없으면 안전하게 fallback 문구만 반환. */
export const getStrategyAdvisor = async (strategyDescription: string, apiKey?: string | null) => {
  const client = createGeminiClient(apiKey);
  if (!client) {
    // 키 미설정 시 브라우저에서 런타임 에러 대신 안전한 기본 문구만 반환
    return FALLBACK_ADVISOR_TEXT;
  }

  try {
    const response = await client.models.generateContent({
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
    return FALLBACK_ADVISOR_TEXT;
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
  const client = createGeminiClient(options?.apiKey);

  // 키가 없으면 브라우저에서 라이브러리 에러를 내지 않고, "분석하지 않음"으로 처리
  if (!client) {
    console.warn("Gemini API key is not configured; skipping trade screenshot analysis.");
    return { trades: [] };
  }
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
