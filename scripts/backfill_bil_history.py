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


def fetch_bil_history(days: int = 240) -> List[Dict[str, Any]]:
    """
    BIL의 과거 N일치 종가 데이터를 yfinance에서 가져와
    Supabase stock_prices 테이블 형식으로 변환합니다.
    """
    ticker = yf.Ticker("BIL")
    hist = ticker.history(period=f"{days}d", interval="1d")

    if hist.empty:
        raise RuntimeError("No history found for BIL")

    rows: List[Dict[str, Any]] = []
    for idx, row in hist.iterrows():
        trade_date = idx.date().isoformat()  # YYYY-MM-DD
        close = float(row["Close"])
        fetched_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")

        rows.append(
            {
                "symbol": "BIL",
                "trade_date": trade_date,
                "close": close,
                "fetched_at": fetched_at,
            }
        )

    return rows


def upsert_to_supabase(rows: List[Dict[str, Any]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        error_msg = "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment\n"
        error_msg += "\n예시:\n"
        error_msg += "  $env:SUPABASE_URL='your-url'\n"
        error_msg += "  $env:SUPABASE_SERVICE_ROLE_KEY='your-key'\n"
        error_msg += "  python scripts/backfill_bil_history.py\n"
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

    resp = requests.post(
        endpoint, params=params, headers=headers, data=json.dumps(rows), timeout=30
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: {resp.status_code} {resp.text}")


def main() -> None:
    print("=" * 60)
    print("Backfilling BIL 240-day history into Supabase")
    print("=" * 60)

    # 1) 기존 BIL 데이터 삭제 (선택적이지만 혼동 방지를 위해 권장)
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.")

    delete_endpoint = f"{supabase_url.rstrip('/')}/rest/v1/stock_prices"
    delete_params = {"symbol": "eq.BIL"}
    delete_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "return=representation",
    }
    print("· Deleting existing BIL rows from stock_prices ...")
    delete_resp = requests.delete(
        delete_endpoint, params=delete_params, headers=delete_headers, timeout=30
    )
    if delete_resp.status_code >= 300:
        raise RuntimeError(
            f"Failed to delete existing BIL rows: {delete_resp.status_code} {delete_resp.text}"
        )
    deleted_count = len(delete_resp.json() or [])
    print(f"  -> Deleted {deleted_count} existing BIL rows")

    # 2) yfinance에서 BIL 240일치 데이터 가져오기
    rows = fetch_bil_history(240)
    print(f"· Prepared {len(rows)} BIL rows from yfinance")

    # 3) Supabase에 upsert
    upsert_to_supabase(rows)
    print("✓ Successfully upserted BIL history to Supabase")


if __name__ == "__main__":
    main()

