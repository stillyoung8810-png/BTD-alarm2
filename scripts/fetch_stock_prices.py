import os
import datetime as dt
import json
import time
from typing import List, Dict, Any

import requests


TICKERS: List[str] = [
    "SPY", "SSO", "UPRO", "QQQ", "QLD", "TQQQ",
    "SOXX", "USD", "SOXL", "STRC", "BILL", "ICSH", "SGOV",
]

YF_ENDPOINT = "https://query1.finance.yahoo.com/v7/finance/quote"

# User-Agent 헤더 (야후 파이낸스가 User-Agent 없으면 차단할 수 있음)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

# 배치 크기 (한 번에 요청할 종목 수)
BATCH_SIZE = 5
# 배치 사이 딜레이 (초)
BATCH_DELAY = 2.5
# 최대 재시도 횟수
MAX_RETRIES = 3
# 재시도 간 초기 딜레이 (초)
INITIAL_RETRY_DELAY = 5


def fetch_quotes_batch(tickers: List[str], retry_count: int = 0) -> List[Dict[str, Any]]:
    """한 배치의 종목을 가져오기 (재시도 로직 포함)"""
    symbols = ",".join(tickers)
    
    try:
        resp = requests.get(
            YF_ENDPOINT,
            params={"symbols": symbols},
            headers=HEADERS,
            timeout=20
        )
        
        # 429 에러면 재시도
        if resp.status_code == 429:
            if retry_count < MAX_RETRIES:
                delay = INITIAL_RETRY_DELAY * (2 ** retry_count)  # Exponential backoff
                print(f"Rate limited (429). Retrying after {delay} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
                time.sleep(delay)
                return fetch_quotes_batch(tickers, retry_count + 1)
            else:
                raise RuntimeError(f"Rate limit exceeded after {MAX_RETRIES} retries")
        
        resp.raise_for_status()
        data = resp.json()
        return data.get("quoteResponse", {}).get("result", [])
    
    except requests.exceptions.RequestException as e:
        if retry_count < MAX_RETRIES:
            delay = INITIAL_RETRY_DELAY * (2 ** retry_count)
            print(f"Request failed: {e}. Retrying after {delay} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
            time.sleep(delay)
            return fetch_quotes_batch(tickers, retry_count + 1)
        else:
            raise


def fetch_all_quotes(tickers: List[str]) -> List[Dict[str, Any]]:
    """모든 종목을 배치로 나눠서 순차적으로 가져오기"""
    all_quotes: List[Dict[str, Any]] = []
    total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
    
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        
        print(f"Fetching batch {batch_num}/{total_batches}: {', '.join(batch)}")
        quotes = fetch_quotes_batch(batch)
        all_quotes.extend(quotes)
        
        # 마지막 배치가 아니면 딜레이
        if i + BATCH_SIZE < len(tickers):
            print(f"Waiting {BATCH_DELAY} seconds before next batch...")
            time.sleep(BATCH_DELAY)
    
    return all_quotes


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
    print("=" * 60)
    print("Starting stock price fetch from Yahoo Finance")
    print(f"Total tickers: {len(TICKERS)}")
    print(f"Batch size: {BATCH_SIZE}, Delay: {BATCH_DELAY}s")
    print("=" * 60)
    
    try:
        quotes = fetch_all_quotes(TICKERS)
        print(f"\n✓ Received {len(quotes)} quotes from {len(TICKERS)} tickers")

        rows = build_rows(quotes)
        print(f"✓ Prepared {len(rows)} rows for upsert")

        if not rows:
            print("⚠ No rows to insert. Exiting.")
            return

        upsert_to_supabase(rows)
        print(f"\n✓ Successfully upserted {len(rows)} rows to Supabase")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise


if __name__ == "__main__":
    main()

