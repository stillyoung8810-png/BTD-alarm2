import { supabase } from './supabase';

const FALLBACK_ADVISOR_TEXT =
  "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";

// Supabase Edge Function base URL, e.g. https://xxxx.functions.supabase.co/gemini
const EDGE_BASE_URL = import.meta.env.VITE_GEMINI_EDGE_URL || "";

// 인증 헤더를 가져오는 헬퍼
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[Gemini] getSession error:", error);
  }
  if (session?.access_token) {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    };
    console.debug("[Gemini] using auth header for user session. exp:", session.expires_at);
    return headers;
  }
  console.warn("[Gemini] no active Supabase session; calling Edge Function without Authorization header");
  return { "Content-Type": "application/json" };
};

type Tier = "free" | "paid";

const getTier = (isPaidUser: boolean): Tier => (isPaidUser ? "paid" : "free");

/** 전략 설명에 대한 짧은 인사이트를 반환. 실제 Gemini 호출은 Supabase Edge Function에서 처리. */
export const getStrategyAdvisor = async (
  strategyDescription: string,
  opts?: { isPaidUser?: boolean }
) => {
  if (!EDGE_BASE_URL) {
    console.warn("[Gemini] VITE_GEMINI_EDGE_URL not set; using fallback advisor text.");
    return FALLBACK_ADVISOR_TEXT;
  }
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(EDGE_BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "advisor",
        strategyDescription,
        tier: getTier(!!opts?.isPaidUser),
      }),
    });

    if (!res.ok) {
      console.error("[Gemini] advisor worker responded with", res.status);
      return FALLBACK_ADVISOR_TEXT;
    }

    const data = (await res.json()) as { text?: string };
    return data.text || FALLBACK_ADVISOR_TEXT;
  } catch (error) {
    console.error("[Gemini] advisor worker error:", error);
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

/** 증권사 매매 내역 스크린샷 이미지를 분석해 매매 정보를 JSON 배열로 추출. 실제 Gemini 호출은 Supabase Edge Function에서 처리. */
export const analyzeTradeScreenshot = async (
  imageBase64: string,
  mimeType: string = "image/png",
  options?: { isPaidUser?: boolean }
): Promise<{ trades: RecognizedTradeItem[] } | null> => {
  if (!EDGE_BASE_URL) {
    console.warn("[Gemini] VITE_GEMINI_EDGE_URL not set; skipping trade screenshot analysis.");
    return { trades: [] };
  }
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(EDGE_BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "analyze-trades",
        imageBase64,
        mimeType,
        tier: getTier(!!options?.isPaidUser),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Gemini] analyze worker error:", res.status, text);
      if (res.status === 429) {
        throw new Error("RATE_LIMIT");
      }
      if (res.status === 401) {
        throw new Error("AUTH_REQUIRED");
      }
      if (res.status === 403) {
        throw new Error("FORBIDDEN");
      }
      return { trades: [] };
    }

    const data = (await res.json()) as { trades?: RecognizedTradeItem[] };
    if (!data || !Array.isArray(data.trades)) {
      return { trades: [] };
    }
    return { trades: data.trades };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof TypeError ||
      /failed to fetch|networkerror|load failed|cors/i.test(msg)
    ) {
      throw new Error("NETWORK_OR_CORS");
    }
    if (/429|resource exhausted|quota|rate limit/i.test(msg)) {
      throw new Error("RATE_LIMIT");
    }
    console.error("analyzeTradeScreenshot error:", err);
    throw err;
  }
};
