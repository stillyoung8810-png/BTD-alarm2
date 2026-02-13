"""
FMP API 공통 HTTP 클라이언트.

- 단일 진입점: fmp_get(path, params, api_key) — 재시도·타임아웃·apikey 주입
- 추후 RSI, PER 등 새 엔드포인트 추가 시 이 함수만 사용하면 됨 (DRY)
"""

import time
from typing import Any, Dict

import requests

from . import config

# 순환 참조 방지: config만 import
_BASE = config.FMP_BASE_URL
_TIMEOUT = config.REQUEST_TIMEOUT_SEC
_MAX_RETRIES = config.MAX_RETRIES
_INITIAL_DELAY = config.INITIAL_RETRY_DELAY_SEC


def fmp_get(
    path: str,
    params: Dict[str, str],
    api_key: str,
    *,
    timeout: int = _TIMEOUT,
    max_retries: int = _MAX_RETRIES,
) -> Any:
    """
    FMP API GET 요청. apikey 자동 병합, 지수 백오프 재시도.
    path: 예 "historical-price-eod/full" (앞뒤 슬래시 없음)
    params: symbol 등 (apikey는 여기서 병합)
    반환: resp.json() 결과. 실패 시 RequestException 또는 런타임 예외.
    """
    url = f"{_BASE}/{path.lstrip('/')}"
    request_params = {**params, "apikey": api_key}

    for attempt in range(max_retries + 1):
        try:
            resp = requests.get(url, params=request_params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            if attempt >= max_retries:
                raise
            delay = _INITIAL_DELAY * (2 ** attempt)
            time.sleep(delay)
    return None  # unreachable; for type checker
