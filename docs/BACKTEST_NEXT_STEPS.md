# 백테스트 연동 다음 단계 안내

현재 백테스트 페이지는 **UI·디자인만** 구현되어 있으며, "백테스트 실행" 시 **목업(mock) 결과**만 표시됩니다.  
실제 과거 데이터 기반 연산을 붙이려면 아래 순서로 진행하면 됩니다.

---

## 1. 연산 엔진 (Python / Pandas)

- **역할**: 전략별 시뮬레이션 로직(일별 종가 매수, 구간 판정, 매도 규칙 등)을 구현.
- **권장**: `scripts/` 또는 별도 `backtest/` 패키지에 Python 스크립트/모듈로 작성.
  - **이평선 구간매수**: 기준주식 종가·이동평균으로 구간 1/2/3 판정 → 구간별 종목 매수, 중간 익절 규칙 적용.
  - **다분할 매매법**: 목표수익률·총 분할 횟수·1회 매수금액으로 시뮬레이션, MOC/LOC 등 규칙 반영.
- **입력**: 전략 ID, 파라미터(현재 `BacktestParamsMa` / `BacktestParamsMultiSplit`와 동일 구조), **과거 주가 시계열** (일별 OHLC 또는 최소 종가).
- **출력**:  
  - 누적 수익률, CAGR, MDD, 승률, 샤프 지수, 평균 보유 기간  
  - 자산 곡선(equity curve) 시계열  
  - 구간별 낙폭(drawdown) 시계열  
  (형식은 프론트에서 사용 중인 `BacktestResult`와 맞추면 연동이 쉽습니다.)
- **데이터**: 이미 사용 중인 Supabase/IndexedDB 주가 데이터와 동일 기간(최대 2년)을 사용하거나, 백테스트 전용 히스토리 API를 두어도 됩니다.

---

## 2. 연산 서버 (AWS Lambda 등)

- **역할**: 브라우저에서 직접 Python을 돌리지 않으므로, **API 한 번 호출 → 서버에서 Python 엔진 실행 → 결과 JSON 반환**.
- **옵션**:
  - **AWS Lambda** + API Gateway: 파라미터를 body로 받아, Lambda 내부에서 Python(Pandas) 스크립트 실행 후 결과 반환.
  - **Supabase Edge Functions (Deno)** 또는 **별도 Node/Python 서버**: 동일하게 “파라미터 수신 → 백테스트 실행 → 결과 반환” REST/폴링 엔드포인트 제공.
- **입력**: 현재 `Backtest.tsx`의 `paramsMa` / `paramsMulti`와 동일한 필드를 JSON으로 전달.
- **출력**: `BacktestResult` 형태(누적 수익률, CAGR, MDD, 승률, 샤프, 평균 보유 기간, equity curve, drawdown 시계열).
- **보안**: API 키 또는 인증 토큰으로 호출 제한, 타임아웃·메모리 제한 설정 권장.

---

## 3. 프론트엔드 연동

- **위치**: `components/Backtest.tsx`의 `handleRunBacktest()`.
- **변경 사항**:
  - "백테스트 실행" 클릭 시 선택된 전략에 따라 `paramsMa` 또는 `paramsMulti`를 서버 API로 전송.
  - 응답으로 받은 결과를 `setResult(...)`에 넣어 기존 결과 UI(차트·KPI)가 그대로 사용하도록.
- **로딩/에러**: 실행 중 스피너 표시, 실패 시 토스트/알림으로 메시지 표시하면 됩니다.

---

## 4. 벤치마크 비교 (PRO)

- 현재 결과 화면의 "벤치마크 비교 (PRO)"는 **UI만** 있으며, 업그레이드 버튼으로 멤버십 페이지 등으로 연결 가능.
- 실제 벤치마크 연동: 연산 엔진/서버에서 **S&P 500, 나스닥 등 지수 일별 수익률**을 같은 기간으로 계산해, 전략 수익률과 함께 반환하면 됩니다.  
  프론트에서는 결과에 `benchmarkCurve` 같은 필드를 추가해 자산 곡선 차트에 전략 + 벤치마크 라인을 같이 그리면 됩니다.

---

정리하면:  
**1) Python/Pandas로 전략별 백테스트 로직 구현 → 2) Lambda 등 서버에서 해당 로직 호출하는 API 노출 → 3) Backtest.tsx에서 API 호출 후 결과를 기존 UI에 연결** 하면 됩니다.

---

## 5. 구현된 Python 백테스트 (`scripts/backtest_ma.py`)

- **이평선 구간매수** 전략용 백테스트가 `scripts/backtest_ma.py`에 구현되어 있습니다.
- **로컬 실행**: `.env`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 설정 후  
  `python scripts/backtest_ma.py`  
  → 기본 파라미터로 Supabase에서 주가를 조회해 백테스트 후 JSON을 stdout에 출력합니다.
- **Lambda 진입점**: `handler(event, context)`  
  - **event**: `params`(BacktestParamsMa 형태), 선택적으로 `supabase_url`, `supabase_key`.  
  - **환경 변수**: Lambda에서 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 설정 시 event 없이도 동작합니다.  
  - **반환**: `{ statusCode: 200, body: JSON.stringify(BacktestResult) }`.
- **필요 레이어**:  
  - **Pandas**: AWSSDKPandas-Python311 레이어 (또는 동일한 Pandas 포함 레이어).  
  - **Supabase**: `docs/LAMBDA_SUPABASE_LAYER.md` 참고해 만든 Supabase 전용 레이어.  
- **배포**: Lambda 함수 코드에 `backtest_ma.py`의 내용을 넣고, 핸들러를 `backtest_ma.handler`로 설정.  
  또는 `scripts/backtest_ma.py`를 Lambda 패키지 루트에 두고 의존성은 레이어로 연결하면 됩니다.
