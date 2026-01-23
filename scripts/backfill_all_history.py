import os
import datetime as dt
import json
from pathlib import Path
from typing import List, Dict, Any

import yfinance as yf
import requests

# .env 파일 자동 로드 (python-dotenv가 있으면)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ Loaded environment variables from {env_path}")
    else:
        load_dotenv()
except ImportError:
    # python-dotenv가 없어도 계속 진행 (환경 변수가 이미 설정되어 있을 수 있음)
    pass


TICKERS: List[str] = [
    "SPY",
    "SSO",
    "UPRO",
    "QQQ",
    "QLD",
    "TQQQ",
    "SOXX",
    "USD",
    "SOXL",
    "STRC",
    "BIL",
    "ICSH",
    "SGOV",
]


def fetch_history_for_ticker(ticker_symbol: str, days: int = 240) -> List[Dict[str, Any]]:
    """
    단일 종목의 과거 N일치 종가 데이터를 yfinance에서 가져와
    Supabase stock_prices 테이블 형식으로 변환합니다.
    """
    print(f"Fetching history for {ticker_symbol} ({days} days)...")
    ticker = yf.Ticker(ticker_symbol)
    hist = ticker.history(period=f"{days}d", interval="1d")

    if hist.empty:
        print(f"⚠ Warning: No history found for {ticker_symbol}")
        return []

    rows: List[Dict[str, Any]] = []
    for idx, row in hist.iterrows():
        trade_date = idx.date().isoformat()  # YYYY-MM-DD
        close = float(row["Close"])
        fetched_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")

        rows.append(
            {
                "symbol": ticker_symbol,
                "trade_date": trade_date,
                "close": close,
                "fetched_at": fetched_at,
            }
        )

    print(f"  -> Prepared {len(rows)} rows for {ticker_symbol}")
    return rows


def upsert_to_supabase(rows: List[Dict[str, Any]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        error_msg = "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment\n"
        error_msg += "\n예시:\n"
        error_msg += "  $env:SUPABASE_URL='your-url'\n"
        error_msg += "  $env:SUPABASE_SERVICE_ROLE_KEY='your-key'\n"
        error_msg += "  python scripts/backfill_all_history.py\n"
        raise RuntimeError(error_msg)

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

    # rows가 많을 수 있으므로 필요시 나눠서 보낼 수 있지만,
    # 13개 티커 × 240일 ≈ 3,120행 정도라 한 번에 보내도 무난함.
    resp = requests.post(
        endpoint, params=params, headers=headers, data=json.dumps(rows), timeout=60
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: {resp.status_code} {resp.text}")


def main() -> None:
    print("=" * 60)
    print("Backfilling ALL tickers 240-day history into Supabase")
    print("=" * 60)

    # 1) 기존 데이터 전체 삭제는 위험하므로 하지 않고,
    #    on_conflict(\"symbol,trade_date\")로 덮어쓰는 방식 사용.
    #    (정말 전체 초기화가 필요하면 아래 주석을 참고)
    #
    #   DELETE FROM public.stock_prices;
    #
    # 여기서는 기존 데이터가 있으면 덮어쓰고, 없으면 새로 삽입.

    all_rows: List[Dict[str, Any]] = []

    for ticker in TICKERS:
        try:
            rows = fetch_history_for_ticker(ticker, 240)
            all_rows.extend(rows)
        except Exception as e:
            print(f"✗ Error fetching history for {ticker}: {e}")

    if not all_rows:
        print("⚠ No rows prepared. Exiting.")
        return

    print(f"\nTotal prepared rows: {len(all_rows)}")
    upsert_to_supabase(all_rows)
    print("✓ Successfully upserted all history to Supabase")


if __name__ == "__main__":
    main()

