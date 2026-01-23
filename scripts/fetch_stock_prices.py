import os
import datetime as dt
import json
import time
import random
from typing import List, Dict, Any, Optional
from pathlib import Path

import yfinance as yf
import requests

# .env 파일 자동 로드 (python-dotenv가 있으면)
try:
    from dotenv import load_dotenv
    # 프로젝트 루트 디렉토리에서 .env 파일 찾기
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ Loaded environment variables from {env_path}")
    else:
        # 현재 디렉토리에서도 시도
        load_dotenv()
except ImportError:
    # python-dotenv가 없어도 계속 진행 (환경 변수가 이미 설정되어 있을 수 있음)
    pass


TICKERS: List[str] = [
    "SPY", "SSO", "UPRO", "QQQ", "QLD", "TQQQ",
    "SOXX", "USD", "SOXL", "STRC", "BIL", "ICSH", "SGOV",
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
    now = dt.datetime.now(dt.timezone.utc)
    trade_date = now.date().isoformat()  # YYYY-MM-DD (UTC 기준)
    fetched_at = now.isoformat().replace('+00:00', 'Z')

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
        error_msg = "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment\n"
        error_msg += "\n로컬 테스트 방법:\n"
        error_msg += "1. PowerShell에서:\n"
        error_msg += "   $env:SUPABASE_URL='your-url'\n"
        error_msg += "   $env:SUPABASE_SERVICE_ROLE_KEY='your-key'\n"
        error_msg += "   python scripts/fetch_stock_prices.py\n"
        error_msg += "\n2. 또는 .env 파일에 추가:\n"
        error_msg += "   SUPABASE_URL=your-url\n"
        error_msg += "   SUPABASE_SERVICE_ROLE_KEY=your-key\n"
        error_msg += "\n그리고: pip install python-dotenv\n"
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

    resp = requests.post(endpoint, params=params, headers=headers, data=json.dumps(rows), timeout=20)
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: {resp.status_code} {resp.text}")


def cleanup_old_stock_prices() -> None:
    """300일 이상 된 stock_prices 데이터를 삭제"""
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        # cleanup 함수에서는 더 간단한 에러 메시지
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment")

    # 300일 전 날짜 계산
    cutoff_date = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=300)).date().isoformat()
    
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/stock_prices"
    params = {
        "trade_date": f"lt.{cutoff_date}",  # trade_date < cutoff_date
    }
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "return=representation",
    }

    # DELETE 요청 전에 삭제될 행 수 확인 (선택사항)
    count_resp = requests.get(
        endpoint,
        params={**params, "select": "id"},
        headers={**headers, "Range": "0-0"},
        timeout=20
    )
    
    if count_resp.status_code == 200:
        # Content-Range 헤더에서 총 개수 추출
        content_range = count_resp.headers.get("Content-Range", "")
        if "/" in content_range:
            total_count = content_range.split("/")[-1]
            if total_count != "*" and total_count.isdigit():
                print(f"Found {total_count} rows older than 300 days to delete")
    
    # DELETE 요청 실행
    resp = requests.delete(endpoint, params=params, headers=headers, timeout=20)
    
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase delete failed: {resp.status_code} {resp.text}")
    
    deleted_count = len(resp.json()) if resp.json() else 0
    print(f"✓ Deleted {deleted_count} rows older than {cutoff_date} (300 days)")


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
        
        # 300일 이상 된 데이터 정리
        print("\n" + "=" * 60)
        print("Cleaning up old stock prices (older than 300 days)...")
        print("=" * 60)
        try:
            cleanup_old_stock_prices()
        except Exception as cleanup_error:
            # 정리 작업 실패해도 주가 업데이트는 성공했으므로 경고만 출력
            print(f"⚠ Warning: Failed to cleanup old data: {cleanup_error}")
            print("(This is non-critical - stock prices were still updated)")
        
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise


if __name__ == "__main__":
    main()

