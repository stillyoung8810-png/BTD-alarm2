import os
import datetime as dt
import json
from typing import List, Dict, Any

import requests


TICKERS: List[str] = [
    "SPY", "SSO", "UPRO", "QQQ", "QLD", "TQQQ",
    "SOXX", "USD", "SOXL", "STRC", "BILL", "ICSH", "SGOV",
]

YF_ENDPOINT = "https://query1.finance.yahoo.com/v7/finance/quote"


def fetch_quotes(tickers: List[str]) -> List[Dict[str, Any]]:
    symbols = ",".join(tickers)
    resp = requests.get(YF_ENDPOINT, params={"symbols": symbols}, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return data.get("quoteResponse", {}).get("result", [])


def build_rows(quotes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    now = dt.datetime.utcnow()
    trade_date = (now.date()).isoformat()  # YYYY-MM-DD (UTC 기준)
    fetched_at = now.isoformat() + "Z"

    rows: List[Dict[str, Any]] = []
    for q in quotes:
        symbol = q.get("symbol")
        if not symbol:
            continue

        price = q.get("regularMarketPrice")
        prev_close = q.get("regularMarketPreviousClose")

        close = price if price is not None else prev_close
        if close is None:
            continue

        rows.append(
            {
                "symbol": symbol,
                "trade_date": trade_date,
                "close": float(close),
                "fetched_at": fetched_at,
            }
        )

    return rows


def upsert_to_supabase(rows: List[Dict[str, Any]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/stock_prices"
    params = {
        "on_conflict": "symbol,trade_date",
    }
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    resp = requests.post(endpoint, params=params, headers=headers, data=json.dumps(rows), timeout=20)
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: {resp.status_code} {resp.text}")


def main() -> None:
    print("Fetching quotes from Yahoo Finance...")
    quotes = fetch_quotes(TICKERS)
    print(f"Received {len(quotes)} quotes")

    rows = build_rows(quotes)
    print(f"Prepared {len(rows)} rows for upsert")

    if not rows:
        print("No rows to insert. Exiting.")
        return

    upsert_to_supabase(rows)
    print("Upsert completed successfully.")


if __name__ == "__main__":
    main()

