"""
FMP(Financial Modeling Prep) API 클라이언트 패키지.

- client: HTTP 요청 및 재시도 (모든 FMP 데이터 타입 공통)
- eod: 종가(EOD) 데이터 전용 — 현재 구현됨
- 추후 확장: technical(RSI 등), ratios(PER 등) 등은 동일 client 사용, 새 fetcher 모듈만 추가
"""

from .client import fmp_get
from .eod import fetch_latest_close

__all__ = ["fmp_get", "fetch_latest_close"]

