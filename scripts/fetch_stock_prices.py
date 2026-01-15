import os
import datetime as dt
import json
import time
import random
from typing import List, Dict, Any, Optional

import yfinance as yf
import requests


TICKERS: List[str] = [
    "SPY", "SSO", "UPRO", "QQQ", "QLD", "TQQQ",
    "SOXX", "USD", "SOXL", "STRC", "BILL", "ICSH", "SGOV",
]

# 배치 크기 (2~3개씩 랜덤하게 묶어서 처리)
MIN_BATCH_SIZE = 2
MAX_BATCH_SIZE = 3
# 배치 사이 딜레이 (랜덤 2.5~3.5초)
MIN_DELAY = 2.5
MAX_DELAY = 3.5
# 최대 재시도 횟수
MAX_RETRIES = 3
# 재시도 간 초기 딜레이 (초)
INITIAL_RETRY_DELAY = 5


def fetch_ticker_price(ticker_symbol: str, retry_count: int = 0) -> Optional[Dict[str, Any]]:
    """yfinance를 사용하여 단일 종목의 종가 가져오기 (재시도 로직 포함)"""
    try:
        ticker = yf.Ticker(ticker_symbol)
        
        # 최근 1일 데이터 가져오기
        hist = ticker.history(period="1d", interval="1d")
        
        if hist.empty:
            # 데이터가 없으면 info에서 이전 종가 가져오기
            info = ticker.info
            close = info.get("previousClose")
            if close is None:
                print(f"⚠ Warning: No data found for {ticker_symbol}")
                return None
        else:
            # 가장 최근 종가 가져오기
            close = float(hist["Close"].iloc[-1])
        
        return {
            "symbol": ticker_symbol,
            "close": close,
        }
    
    except Exception as e:
        if retry_count < MAX_RETRIES:
            delay = INITIAL_RETRY_DELAY * (2 ** retry_count)  # Exponential backoff
            print(f"Error fetching {ticker_symbol}: {e}. Retrying after {delay} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
            time.sleep(delay)
            return fetch_ticker_price(ticker_symbol, retry_count + 1)
        else:
            print(f"✗ Failed to fetch {ticker_symbol} after {MAX_RETRIES} retries: {e}")
            return None


def fetch_quotes_batch(tickers: List[str]) -> List[Dict[str, Any]]:
    """한 배치의 종목들을 순차적으로 가져오기"""
    results: List[Dict[str, Any]] = []
    
    for ticker in tickers:
        result = fetch_ticker_price(ticker)
        if result:
            results.append(result)
        
        # 각 종목 사이에 작은 딜레이 (0.5~1초)
        if ticker != tickers[-1]:  # 마지막 종목이 아니면
            time.sleep(random.uniform(0.5, 1.0))
    
    return results


def fetch_all_quotes(tickers: List[str]) -> List[Dict[str, Any]]:
    """모든 종목을 2~3개씩 랜덤하게 묶어서 순차적으로 가져오기"""
    all_quotes: List[Dict[str, Any]] = []
    i = 0
    batch_num = 1
    
    while i < len(tickers):
        # 랜덤하게 2~3개씩 묶기
        batch_size = random.randint(MIN_BATCH_SIZE, MAX_BATCH_SIZE)
        batch = tickers[i:i + batch_size]
        
        print(f"Fetching batch {batch_num}: {', '.join(batch)} ({len(batch)} tickers)")
        quotes = fetch_quotes_batch(batch)
        all_quotes.extend(quotes)
        
        i += batch_size
        batch_num += 1
        
        # 마지막 배치가 아니면 랜덤 딜레이
        if i < len(tickers):
            delay = random.uniform(MIN_DELAY, MAX_DELAY)
            print(f"Waiting {delay:.2f} seconds before next batch...")
            time.sleep(delay)
    
    return all_quotes


def build_rows(quotes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """yfinance로 가져온 데이터를 Supabase 테이블 구조에 맞게 변환"""
    now = dt.datetime.utcnow()
    trade_date = now.date().isoformat()  # YYYY-MM-DD (UTC 기준)
    fetched_at = now.isoformat() + "Z"

    rows: List[Dict[str, Any]] = []
    for quote in quotes:
        symbol = quote.get("symbol")
        close = quote.get("close")

        if not symbol or close is None:
            continue

        rows.append({
            "symbol": symbol,
            "trade_date": trade_date,
            "close": float(close),
            "fetched_at": fetched_at,
        })

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
    print("Starting stock price fetch using yfinance")
    print(f"Total tickers: {len(TICKERS)}")
    print(f"Batch size: {MIN_BATCH_SIZE}~{MAX_BATCH_SIZE} (random)")
    print(f"Delay between batches: {MIN_DELAY}~{MAX_DELAY}s (random)")
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

