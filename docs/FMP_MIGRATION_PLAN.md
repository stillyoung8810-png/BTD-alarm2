# FMP API 주가 전환 계획 (최종)

## 1. 현재 상태

| 구분 | 내용 |
|------|------|
| **주가 소스** | Yahoo Finance (yfinance / Yahoo Quote API) |
| **Python** | `scripts/fetch_stock_prices.py` — `StockDataProvider(source="yahoo")`, yfinance 사용 |
| **Edge Function** | `supabase/functions/update-stock-prices/index.ts` — Yahoo Quote API 직접 호출 |
| **원칙** | Yahoo 경로는 **수정하지 않음**. FMP는 **독립 코드**로 구현·검증 후 전환. |

---

## 2. 목표

1. FMP API로 종가를 **독립적으로** 가져와서 **테스트**로 검증한다.
2. 검증 성공 시 FMP를 기본 소스로 전환하고, Yahoo 경로는 사용하지 않는다.
3. **확장성**: 수년 후 RSI·PER 등 기술/재무 지표를 FMP로 추가할 때, 기존 구조를 최대한 재사용하고 새 모듈만 추가할 수 있게 설계한다.

---

## 3. Supabase `stock_prices` 스키마 (기준)

```sql
create table public.stock_prices (
  id bigint generated always as identity not null,
  symbol text not null,
  trade_date date not null,
  close numeric not null,
  fetched_at timestamp with time zone not null default now(),
  constraint stock_prices_pkey primary key (id)
) TABLESPACE pg_default;

create unique index if not exists stock_prices_symbol_trade_date_idx
  on public.stock_prices using btree (symbol, trade_date) TABLESPACE pg_default;
```

FMP EOD 반환형과의 매핑:

| DB 컬럼 | FMP/스크립트 | 비고 |
|---------|----------------|------|
| `symbol` | `symbol` | 티커 심볼 |
| `trade_date` | `trade_date` (YYYY-MM-DD) | FMP EOD `date` |
| `close` | `close` (numeric) | FMP EOD `close` 또는 `adjClose` |
| `fetched_at` | 스크립트에서 `now()` UTC | upsert 시 클라이언트 설정 |
| `id` | 자동 생성 | 클라이언트에서 설정 안 함 |

---

## 4. 확장 가능한 구조 (추후 RSI, PER 등)

### 4.1 디렉터리/모듈 구성

```
scripts/
├── fmp/
│   ├── __init__.py      # fmp_get, fetch_latest_close 등 공개 API
│   ├── config.py        # FMP_BASE_URL, TIMEOUT, MAX_RETRIES (공통)
│   ├── client.py        # fmp_get(path, params, api_key) — 모든 FMP 호출 공통
│   ├── eod.py           # 종가: fetch_latest_close(symbol, api_key)
│   │   # 추후 추가 예시:
│   │   # technical.py   # RSI 등: fetch_rsi(symbol, api_key) 등
│   │   # ratios.py     # PER 등: fetch_ratios(symbol, api_key) 등
│   └── (추가 fetcher는 동일 client 사용)
├── fetch_stock_prices_fmp.py   # EOD 전용 CLI (배치, build_rows, upsert)
└── fetch_stock_prices.py       # Yahoo 유지, 전환 시 source='fmp'에서 fmp.eod 사용
```

### 4.2 설계 원칙

- **DRY**: HTTP·재시도·apikey 주입은 `client.fmp_get()` 한 곳에서만 처리. 새 지표는 새 path/params만 넘기면 됨.
- **추가 난이도 최소화**: RSI/PER 추가 시
  1. `scripts/fmp/technical.py` 또는 `ratios.py` 추가
  2. `fmp_get("해당 FMP path", params, api_key)` 호출
  3. 응답 파싱 후 도메인 모델(예: `{ symbol, rsi, date }`) 반환
  4. (필요 시) 새 테이블 또는 기존 테이블 확장 후, 전용 스크립트 또는 기존 스크립트에 옵션 추가

Yahoo 관련 코드는 계속 건드리지 않는다.

---

## 5. 구현 요약 (코딩 기준)

| 파일 | 역할 |
|------|------|
| `scripts/fmp/config.py` | `FMP_BASE_URL`, `REQUEST_TIMEOUT_SEC`, `MAX_RETRIES`, `INITIAL_RETRY_DELAY_SEC` |
| `scripts/fmp/client.py` | `fmp_get(path, params, api_key)` — GET, apikey 병합, 지수 백오프 재시도 |
| `scripts/fmp/eod.py` | `fetch_latest_close(symbol, api_key)` → `{ symbol, close, trade_date }` 또는 None. 내부에서 `_parse_latest_eod()`로 파싱만 담당 (인지 복잡도 분리) |
| `scripts/fetch_stock_prices_fmp.py` | CLI: `--dry-run`, `--tickers`; `fetch_all_quotes()`(배치)·`_quotes_to_rows()`·`_upsert_stock_prices()`; `Quote`/`StockPriceRow` TypedDict로 스키마 명시 |

- **반복 제거**: 배치/딜레이 상수는 스크립트에만 두고, FMP 호출 제한용 설정은 `fmp/config`에만 둠.
- **Dead code**: 미사용 import/변수 제거. `client`는 예외 시에만 raise, 불필요한 변수 없음.
- **인지 복잡도**: EOD 파싱은 `_parse_latest_eod()` 순수 함수로 분리; 스크립트 main은 단순 흐름(파싱 → 배치 조회 → 행 변환 → upsert 또는 dry-run 출력).

---

## 6. 단계별 실행 계획

### 1단계: FMP 독립 구현 (완료)

- `scripts/fmp/` 패키지 및 `scripts/fetch_stock_prices_fmp.py` 구현.
- Yahoo/기존 `fetch_stock_prices.py`는 변경 없음.

### 2단계: 동작 확인

1. FMP API 키 발급 후 `.env`에 `FMP_API_KEY=...` 설정 (또는 PowerShell: `$env:FMP_API_KEY='...'`).
2. 소규모 테스트:
   ```powershell
   cd c:\dev\BTD-alarm2
   $env:FMP_API_KEY="your-fmp-key"
   python scripts/fetch_stock_prices_fmp.py --dry-run
   ```
3. `--dry-run`: Supabase 미반영, 콘솔에만 `symbol`, `close`, `trade_date` 출력.
4. `--tickers SPY,QQQ`: 지정 종목만 테스트 (기본: SPY, QQQ, BIL).
5. 출력이 기대한 종가/날짜와 일치하는지 확인.

### 3단계: (선택) Supabase 연동 테스트

- `--dry-run` 없이 실행 → `stock_prices` upsert.
- Supabase에서 `symbol`, `trade_date`로 행 존재·`close` 값 확인.

### 4단계: 전환 (검증 후)

- **위치**: `scripts/fetch_stock_prices.py` 내 `StockDataProvider`.
- **변경 요지**:
  - `source="fmp"`일 때 `_fetch_ticker_price_yahoo` 대신 **FMP EOD** 사용.
  - 구현 방식 (택 1):
    - A) `from scripts.fmp.eod import fetch_latest_close` 후, `_fetch_ticker_price_fmp(self, ticker)`에서 `return fetch_latest_close(ticker, self.api_key)` 호출 (기존 `fetch_ticker_price` 시그니처에 맞게 `retry_count`는 FMP client 내부 재시도로 충족).
    - B) 또는 `fetch_stock_prices_fmp` 모듈의 `fetch_latest_close`를 re-export하고 동일하게 사용.
  - **환경**: `.env`에 `STOCK_DATA_SOURCE=fmp`, `FMP_API_KEY=...` 설정.
- **Edge Function** `update-stock-prices`: 별도 작업으로 Yahoo 대신 FMP 호출 전환 검토 (본 계획 범위 외).

---

## 7. FMP API 참고 (종가)

- **엔드포인트**: `GET https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={SYMBOL}&apikey={KEY}`
- **응답**: 일별 배열. 항목에 `date`, `close`(또는 `adjClose`) 등. **가장 최근 거래일**의 date/close를 `trade_date`/`close`로 매핑.
- **제한**: 플랜별 호출 제한 있음. 배치 크기·딜레이는 스크립트 상수로 유지.

---

## 8. 동작 확인 요약

| 단계 | 명령 | 설명 |
|------|------|------|
| 1 | `$env:FMP_API_KEY='your-key'` | API 키 설정 (또는 `.env`) |
| 2 | `python scripts/fetch_stock_prices_fmp.py --dry-run` | SPY, QQQ, BIL 조회 후 콘솔만 출력 |
| 3 | `python scripts/fetch_stock_prices_fmp.py --tickers SPY,QQQ --dry-run` | 지정 종목만 테스트 |
| 4 | `python scripts/fetch_stock_prices_fmp.py` | 기본 티커 전체 조회 후 Supabase upsert |

정상 시 `--dry-run`에서 각 종목별 `close`, `trade_date`가 출력된다.

---

## 9. 품질 체크리스트 (유지보수·클린 코드)

- [ ] **DRY**: FMP HTTP/재시도는 `fmp/client.py` 한 곳; EOD 파싱은 `eod._parse_latest_eod` 한 곳.
- [ ] **Dead code**: 미사용 import·변수·함수 없음 (스크립트·fmp 패키지 공통).
- [ ] **인지 복잡도**: 파싱·배치·upsert 분리; 중첩 if 최소화.
- [ ] **안티패턴**: 전역 가변 상태 없음; 예외는 필요한 계층에서만 처리.
- [ ] **스키마 일치**: `StockPriceRow`·`Quote`와 DB `stock_prices` 컬럼 및 upsert `on_conflict` 일치.

---

## 10. 우리 서비스 종목 vs FMP 플랜 (유료에서 전부 가능한지)

### 10.1 우리가 쓰는 종목 목록 (27개, 전부 미국 거래)

`scripts/fetch_stock_prices.py` 기준:

| 구분 | 심볼 |
|------|------|
| **ETF** | SPY, SSO, UPRO, QQQ, QLD, TQQQ, SOXX, USD, SOXL, STRC, BIL, ICSH, SGOV |
| **개별주/레버리지ETF** | TSLA, TSLL, NVDA, NVDL, GOOGL, GGLL, PLTR, PTIR, COIN, CONL, MSTR, MSTX, BMNR |

- 전부 **미국 거래소** 상장 (US Coverage 범위).

### 10.2 FMP 플랜별 문서 정리 ([Pricing](https://site.financialmodelingprep.com/developer/docs/pricing))

| 플랜 | 가격 | Historical EOD / 종가 관련 | 심볼 범위 |
|------|------|----------------------------|-----------|
| **Basic (무료)** | $0 | End of Day Historical Data | 제한적(일부만). SPY 등 일부는 되고 QQQ·BIL 등은 **402 Payment Required** 발생. |
| **Starter** | $22/월(연결) | Historical Stock Price Data, 5년 | **US Coverage** (미국 거래소) |
| **Premium** | $59/월(연결) | 30년 히스토리, Intraday 등 | US + UK + Canada |
| **Ultimate** | $149/월(연결) | **ETF & Mutual Fund Holdings**, Full Historical Access, Bulk | **Full Global Coverage** |

- **Starter 이상**이면 문서상 “US Coverage” + “Historical Stock Price Data”로 **우리 27개(전부 미국)는 포함될 가능성이 높음**.
- **Ultimate**는 “ETF & Mutual Fund Holdings”, “Full Historical Access”를 명시해 **ETF(SPY, QQQ, BIL 등)까지 유료에서 제공**하는 것으로 해석됨.

### 10.3 결론 및 권장

- **문서만으로 “우리 27개 전부 유료에서 100% 가능”이라고 단정할 수는 없음.**  
  플랜별로 실제로 어떤 심볼이 제한되는지는 FMP 측만 정확히 알고 있음.
- **권장:**
  1. **Starter(또는 trial)로 먼저** 우리 티커 27개에 대해 `historical-price-eod/full` 호출이 전부 200으로 오는지 확인.
  2. 여전히 특정 심볼에서 402가 나오면 **FMP 고객 지원(Help Center / Contact)**에 아래 종목 리스트를 보내고, “Starter(또는 사용 예정 플랜)에서 이 목록 전부 EOD 제공 가능한지” 문의.

문의 시 첨부할 종목 리스트 (복사용):

```
SPY, SSO, UPRO, QQQ, QLD, TQQQ, SOXX, USD, SOXL, STRC, BIL, ICSH, SGOV, TSLA, TSLL, NVDA, NVDL, GOOGL, GGLL, PLTR, PTIR, COIN, CONL, MSTR, MSTX, BMNR
```

---

## 11. 검증 후 전환 체크리스트

- [ ] FMP API 키 발급 및 `.env` 설정
- [ ] `fetch_stock_prices_fmp.py --dry-run`으로 1~2종목 응답 확인
- [ ] (선택) FMP 스크립트만으로 Supabase upsert 테스트
- [ ] `StockDataProvider`에 FMP 분기 연결 (`_fetch_ticker_price_fmp` 또는 `fetch_latest_close` 사용)
- [ ] `STOCK_DATA_SOURCE=fmp`로 전체 티커 1회 실행해 정상 동작 확인
- [ ] 필요 시 Edge Function `update-stock-prices` FMP 전환 검토
