"""
FMP API 전용 주식 종가 수집 스크립트 (Yahoo 경로와 독립).

- 기존 fetch_stock_prices.py(Yahoo/yfinance)는 수정하지 않음.
- 검증 후 전환 시: fetch_stock_prices.py의 StockDataProvider에서
  source='fmp'일 때 fmp.eod.fetch_latest_close 를 사용하도록 연결.

사용법:
  $env:FMP_API_KEY='key'; python scripts/fetch_stock_prices_fmp.py --dry-run
  $env:FMP_API_KEY='key'; python scripts/fetch_stock_prices_fmp.py --tickers SPY,QQQ
  $env:FMP_API_KEY='key'; python scripts/fetch_stock_prices_fmp.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, TypedDict

import requests

# 프로젝트 루트 기준 .env 로드
def _load_env() -> None:
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
    except ImportError:
        pass

_load_env()

# scripts/ 가 sys.path에 있으므로 (스크립트 위치) fmp 패키지 직접 import
try:
    from fmp.eod import fetch_latest_close
except ImportError:
    # 프로젝트 루트에서 실행된 경우 (예: python -m scripts.fetch_stock_prices_fmp)
    _root = Path(__file__).resolve().parent.parent
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))
    from scripts.fmp.eod import fetch_latest_close


# --- 스키마 호환 타입 (Supabase stock_prices 테이블) ---
# create table stock_prices (
#   id bigint generated always as identity,
#   symbol text not null,
#   trade_date date not null,
#   close numeric not null,
#   fetched_at timestamptz not null default now()
# );
# unique(symbol, trade_date)


class Quote(TypedDict):
    """EOD fetcher 반환형. stock_prices 행과 1:1 대응 전 제 변환용."""
    symbol: str
    close: float
    trade_date: str


class StockPriceRow(TypedDict):
    """Supabase stock_prices upsert 시 전송하는 행."""
    symbol: str
    trade_date: str
    close: float
    fetched_at: str


# 배치/딜레이: 오케스트레이션 전용 (FMP 호출 제한 완화용)
MIN_BATCH_SIZE = 2
MAX_BATCH_SIZE = 3
MIN_DELAY_SEC = 2.5
MAX_DELAY_SEC = 3.5
INTER_TICKER_DELAY = (0.5, 1.0)

DEFAULT_TICKERS: List[str] = ["SPY", "QQQ", "BIL"]


def _fetch_batch(tickers: List[str], api_key: str) -> List[Dict[str, Any]]:
    """한 배치 내 종목을 순차 조회."""
    results: List[Dict[str, Any]] = []
    for i, ticker in enumerate(tickers):
        quote = fetch_latest_close(ticker, api_key)
        if quote:
            results.append(quote)
        else:
            print(f"  ⚠ No data for {ticker} (skipped)")
        if i < len(tickers) - 1:
            time.sleep(random.uniform(*INTER_TICKER_DELAY))
    return results


def fetch_all_quotes(tickers: List[str], api_key: str) -> List[Dict[str, Any]]:
    """전체 티커를 2~3개씩 배치로 나누어 FMP EOD 조회."""
    all_quotes: List[Dict[str, Any]] = []
    offset = 0
    batch_num = 1
    while offset < len(tickers):
        size = random.randint(MIN_BATCH_SIZE, MAX_BATCH_SIZE)
        batch = tickers[offset : offset + size]
        print(f"FMP batch {batch_num}: {', '.join(batch)}")
        all_quotes.extend(_fetch_batch(batch, api_key))
        offset += len(batch)
        batch_num += 1
        if offset < len(tickers):
            delay = random.uniform(MIN_DELAY_SEC, MAX_DELAY_SEC)
            print(f"Waiting {delay:.2f}s...")
            time.sleep(delay)
    return all_quotes


def _quotes_to_rows(quotes: List[Dict[str, Any]]) -> List[StockPriceRow]:
    """Quote 리스트를 Supabase stock_prices 행 형태로 변환."""
    now = dt.datetime.now(dt.timezone.utc)
    fetched_at = now.isoformat().replace("+00:00", "Z")
    rows: List[StockPriceRow] = []
    for q in quotes:
        symbol = q.get("symbol")
        close = q.get("close")
        trade_date = q.get("trade_date")
        if not symbol or close is None or not trade_date:
            continue
        rows.append({
            "symbol": symbol,
            "trade_date": trade_date,
            "close": float(close),
            "fetched_at": fetched_at,
        })
    return rows


def _upsert_stock_prices(rows: List[StockPriceRow]) -> None:
    """stock_prices 테이블에 merge (on_conflict symbol,trade_date)."""
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for upsert")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/stock_prices"
    params = {"on_conflict": "symbol,trade_date"}
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    resp = requests.post(
        endpoint,
        params=params,
        headers=headers,
        data=json.dumps(rows),
        timeout=20,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: {resp.status_code} {resp.text}")


def _parse_tickers(value: str) -> List[str]:
    """쉼표 구분 티커 문자열 파싱."""
    return [t.strip() for t in value.split(",") if t.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch stock closing prices via FMP API only (standalone)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and print only; do not upsert to Supabase",
    )
    parser.add_argument(
        "--tickers",
        type=str,
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated symbols (e.g. SPY,QQQ,BIL)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        print("Error: FMP_API_KEY environment variable is required.")
        print("Example: $env:FMP_API_KEY='your-key'; python scripts/fetch_stock_prices_fmp.py --dry-run")
        sys.exit(1)

    tickers = _parse_tickers(args.tickers)
    if not tickers:
        print("Error: No tickers specified.")
        sys.exit(1)

    print("=" * 60)
    print("FMP-only stock price fetch (standalone)")
    print(f"Tickers: {tickers}")
    print(f"Dry-run: {args.dry_run}")
    print("=" * 60)

    quotes = fetch_all_quotes(tickers, api_key)
    print(f"\n✓ FMP returned {len(quotes)} quotes")

    if not quotes:
        print("No data to proceed.")
        sys.exit(0)

    if args.dry_run:
        for q in quotes:
            print(f"  {q['symbol']}: close={q['close']} trade_date={q['trade_date']}")
        print("\n(Dry-run: Supabase upsert skipped)")
        return

    rows = _quotes_to_rows(quotes)
    _upsert_stock_prices(rows)
    print(f"✓ Upserted {len(rows)} rows to Supabase")


if __name__ == "__main__":
    main()
