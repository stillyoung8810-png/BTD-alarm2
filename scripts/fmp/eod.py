"""
FMP EOD(End-of-Day) 종가 데이터 fetcher.

- 1순위: historical-price-eod/full (상세 OHLC)
- 402 Payment Required 시 2순위: historical-price-eod/light (무료 플랜에서 더 많은 심볼 지원)
- 반환 형식: stock_prices 테이블과 호환되는 { symbol, close, trade_date }
"""

from typing import Any, Dict, Optional

import requests

from .client import fmp_get

# full API: close, adjClose / light API: price
_FMP_CLOSE_KEYS = ("close", "adjClose", "price")


def _parse_latest_eod(data: Any, symbol: str) -> Optional[Dict[str, Any]]:
    """
    FMP EOD 배열에서 가장 최근 거래일의 종가를 추출.
    순수 함수: I/O 없음, 인지 복잡도 낮게 단일 책임.
    """
    if not isinstance(data, list) or len(data) == 0:
        return None

    with_date = [x for x in data if isinstance(x, dict) and x.get("date")]
    if not with_date:
        return None

    latest = max(with_date, key=lambda x: x["date"])
    trade_date = latest["date"]
    close_raw = None
    for key in _FMP_CLOSE_KEYS:
        if latest.get(key) is not None:
            close_raw = latest[key]
            break
    if close_raw is None:
        return None

    try:
        close = float(close_raw)
    except (TypeError, ValueError):
        return None

    return {"symbol": symbol, "close": close, "trade_date": trade_date}


def _fetch_eod_raw(symbol: str, api_key: str) -> Any:
    """
    full API 호출 후 402(무료 플랜 제한)면 light API로 재시도.
    공식 문서: full은 일부 심볼 유료, light는 Free Plan Access.
    """
    try:
        return fmp_get(
            "historical-price-eod/full",
            {"symbol": symbol},
            api_key,
        )
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 402:
            # Payment Required → 무료 플랜용 Light API 사용 (date, price, volume)
            return fmp_get(
                "historical-price-eod/light",
                {"symbol": symbol},
                api_key,
            )
        raise


def fetch_latest_close(symbol: str, api_key: str) -> Optional[Dict[str, Any]]:
    """
    단일 종목의 최근 거래일 종가를 FMP에서 조회.
    반환: { "symbol", "close", "trade_date" } 또는 None (실패/데이터 없음)
    """
    try:
        raw = _fetch_eod_raw(symbol, api_key)
    except Exception as e:
        print(f"  ⚠ FMP request failed for {symbol}: {e}")
        return None

    # FMP가 에러 객체를 반환한 경우 (예: 호출 제한, 잘못된 심볼)
    if isinstance(raw, dict):
        err = raw.get("Error Message") or raw.get("message") or raw.get("error")
        if err:
            print(f"  ⚠ FMP error for {symbol}: {err}")
            return None

    return _parse_latest_eod(raw, symbol)
