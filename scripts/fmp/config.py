"""FMP API 공통 설정. 모든 FMP 데이터 타입(EOD, 추후 RSI/PER 등)에서 재사용."""

FMP_BASE_URL = "https://financialmodelingprep.com/stable"
REQUEST_TIMEOUT_SEC = 30
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_SEC = 5
