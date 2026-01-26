// supabase/functions/update-stock-prices/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// AVAILABLE_STOCKS와 동일한 13개 종목
const TICKERS = [
  "SPY", "SSO", "UPRO", "QQQ", "QLD", "TQQQ",
  "SOXX", "USD", "SOXL", "STRC", "BIL", "ICSH", "SGOV",
];

// Yahoo Finance quote API
const YF_ENDPOINT =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=";

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number | null;
  regularMarketPreviousClose: number | null;
  regularMarketTime?: number | null; // epoch seconds
  exchangeTimezoneName?: string | null;
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response("Server config error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Yahoo Finance는 여러 심볼을 한 번에 받을 수 있으므로 13개를 한 번에 요청
    const url = `${YF_ENDPOINT}${encodeURIComponent(TICKERS.join(","))}`;
    const yfRes = await fetch(url);

    if (!yfRes.ok) {
      console.error("Yahoo Finance request failed:", yfRes.status, await yfRes
        .text());
      return new Response("Failed to fetch from Yahoo Finance", {
        status: 502,
      });
    }

    const yfJson = await yfRes.json();
    const results: YahooQuote[] = yfJson.quoteResponse?.result ?? [];

    const now = new Date();
    const isoNow = now.toISOString();

    // Yahoo의 regularMarketTime(마지막 거래 시각)을 기준으로 "실제 거래일"을 산출.
    // 주말/미국장 공휴일에도 regularMarketTime은 직전 거래일(예: 금요일)로 유지되므로,
    // trade_date를 실행일이 아닌 거래일로 저장하면 날짜만 바뀐 중복 데이터가 생성되지 않는다.
    const formatYmdInTimeZone = (date: Date, timeZone: string): string => {
      // en-CA는 기본적으로 YYYY-MM-DD 형태를 제공
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    };

    // stock_prices 테이블에 넣을 행 배열
    const rows = results
      .filter((q) => q && q.symbol)
      .map((q) => {
        const close = q.regularMarketPrice ?? q.regularMarketPreviousClose ?? null;
        const tz = q.exchangeTimezoneName ?? "America/New_York";
        const tradeDate =
          q.regularMarketTime
            ? formatYmdInTimeZone(new Date(q.regularMarketTime * 1000), tz)
            : isoNow.slice(0, 10); // fallback

        return {
          symbol: q.symbol,
          close,
          trade_date: tradeDate,
          fetched_at: isoNow,
        };
      })
      .filter((r) => r.close !== null); // 가격 없으면 제외

    if (rows.length === 0) {
      console.warn("No valid quotes from Yahoo Finance");
      return new Response("No data", { status: 200 });
    }

    // upsert: symbol + trade_date 기준으로 덮어쓰기 되도록 (유니크 인덱스 필요)
    const { error } = await supabase
      .from("stock_prices")
      .upsert(rows, { onConflict: "symbol,trade_date" });

    if (error) {
      console.error("Supabase upsert error:", error);
      return new Response("Database error", { status: 500 });
    }

    return new Response(
      JSON.stringify({ inserted: rows.length }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response("Internal error", { status: 500 });
  }
});