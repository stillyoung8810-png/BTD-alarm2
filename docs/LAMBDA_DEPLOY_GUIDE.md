# AWS Lambda 연동·배포 가이드 (단계별)

백테스트(이평선/다분할)를 **AWS Lambda**에서 실행하고, 앱에서 API로 호출할 수 있도록 **연결부터 배포까지** 단계별로 정리한 문서입니다.

---

## 전체 흐름 (한눈에)

```
[앱 Backtest.tsx]  →  HTTP POST  →  [API Gateway]  →  [Lambda 함수]  →  Supabase 주가 조회 → 백테스트 실행 → JSON 반환
       ↑                                                                                              │
       └────────────────────────── 응답(수익률, 차트 데이터 등) 수신 ──────────────────────────────────┘
```

- **Lambda**: Python 코드(`backtest_ma.py` / `backtest_multi.py`)가 실행되는 서버리스 함수
- **API Gateway**: 브라우저에서 Lambda를 **HTTP 주소**로 호출할 수 있게 해주는 문
- **레이어(Layer)**: Pandas, Supabase 등 라이브러리를 Lambda에 “붙여 주는” 패키지

---

## 준비물

| 항목 | 설명 |
|------|------|
| **AWS 계정** | [AWS 가입](https://aws.amazon.com/) 후 로그인 가능한 상태 |
| **Supabase 프로젝트** | 주가 데이터(`stock_prices`)가 들어 있는 프로젝트 |
| **Supabase URL & Anon Key** | Supabase 대시보드 → Settings → API에서 확인 |
| **Python 3.11** | 로컬에서 레이어 zip 만들 때 사용 (선택: Docker로 Linux 호환 zip 생성) |

---

## 1단계: Lambda 함수 만들기

### 1-1. AWS 콘솔에서 함수 생성

1. [AWS 콘솔](https://console.aws.amazon.com/) 로그인 후 상단 검색에서 **Lambda** 입력 → **Lambda** 서비스 클릭
2. **「함수 생성(Create function)」** 클릭
3. 다음처럼 입력:
   - **생성 방식**: "새로 작성(Author from scratch)"
   - **함수 이름**: 예) `btd-backtest-multi` (다분할용), `btd-backtest-ma` (이평선용)
   - **런타임**: **Python 3.11**
   - **아키텍처**: x86_64 (기본값)
   - (선택) 실행 역할: "새 역할 자동 생성" 그대로 두면 됨
4. **「함수 생성」** 클릭

이평선·다분할을 **각각** 쓰려면 위 과정을 두 번 반복해 함수를 **두 개** 만듭니다.

---

### 1-2. 함수 코드 넣기

Lambda는 **핸들러(진입점)** 를 통해 코드를 실행합니다.  
이 프로젝트에서는 `scripts/backtest_ma.py`, `scripts/backtest_multi.py` 안에 이미 `handler(event, context)` 가 있습니다.

**방법 A – 인라인 코드 (테스트용, 간단)**

1. Lambda 함수 페이지에서 **「코드(Code)」** 탭 선택
2. `lambda_function.py` 기본 내용을 **전부 삭제**
3. 아래 중 해당하는 스크립트 **전체 내용**을 복사해 붙여넣기:
   - **이평선**: `scripts/backtest_ma.py` 전체
   - **다분할**: `scripts/backtest_multi.py` 전체
4. **핸들러 설정** 변경:
   - **이평선**: `lambda_function.handler` (파일명이 `lambda_function.py`이므로)
   - **다분할**: `lambda_function.handler`
   - 즉, 붙여넣은 파일 이름을 `lambda_function.py`로 두었다면 핸들러는 `lambda_function.handler`
5. **「Deploy」** 클릭

**방법 B – zip 업로드 (실서비스 권장)**

1. 로컬에서 `backtest_ma.py` 또는 `backtest_multi.py`를 **그대로** 한 폴더에 넣고, 그 폴더만 zip으로 압축
2. Lambda → **코드** 탭 → **「업로드 from .zip 파일」** 선택 후 해당 zip 업로드
3. 핸들러를 **`backtest_ma.handler`** 또는 **`backtest_multi.handler`** 로 설정 (파일명.handler)

---

## 2단계: 레이어(Layer) 붙이기

Lambda에는 **Pandas**와 **Supabase** 클라이언트가 기본으로 없으므로 **레이어**로 추가합니다.

### 2-1. Pandas 레이어 (AWS 제공)

1. Lambda 함수 페이지에서 아래로 스크롤 → **「계층(Layers)」** 섹션
2. **「계층 추가(Add a layer)」** 클릭
3. **「AWS 공식 계층(AWS Layers)」** 선택
4. **AWSSDKPandas-Python311** 검색 후 선택 (또는 Pandas가 포함된 공식 레이어)
5. **「추가」** 클릭

> AWS에서 Pandas 레이어 이름이 다를 수 있습니다. "Pandas" 또는 "Data Wrangler" 등 Pandas가 포함된 Python 3.11 호환 레이어를 선택하면 됩니다.

### 2-2. Supabase 레이어 (직접 만들기)

Supabase는 AWS에 공식 레이어가 없으므로 **직접 만들어** 업로드합니다.  
자세한 절차는 **`docs/LAMBDA_SUPABASE_LAYER.md`** 에 있습니다. 요약만 적습니다.

1. **로컬에서 레이어용 폴더 생성**
   ```bash
   mkdir -p lambda-layers/supabase/python
   cd lambda-layers/supabase/python
   ```
2. **Supabase 패키지 설치**
   ```bash
   pip install supabase -t .
   ```
3. **zip 생성** (상위 폴더에서)
   ```bash
   cd ..
   zip -r supabase-layer.zip python
   ```
   - Windows PowerShell: `Compress-Archive -Path python -DestinationPath supabase-layer.zip`
4. **Lambda 콘솔** → 왼쪽 **「계층(Layers)」** → **「계층 생성」**
   - 이름: `supabase-python311`
   - zip 업로드: 방금 만든 `supabase-layer.zip`
   - 호환 런타임: **Python 3.11**
5. **함수에 레이어 연결**: Lambda 함수 → **계층** → **계층 추가** → **사용자 지정 계층** → `supabase-python311` 선택

---

## 3단계: 환경 변수 설정

Lambda가 Supabase에 접속하려면 **URL**과 **Anon Key**가 필요합니다.

1. Lambda 함수 페이지에서 **「구성(Configuration)」** 탭 → 왼쪽 **「환경 변수(Environment variables)」**
2. **「편집(Edit)》」** → **「환경 변수 추가」**
3. 다음 두 개 추가:

| 키 | 값 | 비고 |
|----|-----|------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 대시보드 → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | 같은 화면의 anon public key |

4. **「저장」** 클릭

이렇게 하면 코드에서 `os.environ.get("SUPABASE_URL")` 등으로 읽을 수 있고, `backtest_ma.py` / `backtest_multi.py`의 `handler()`가 이미 이 변수를 사용합니다.

---

## 4단계: API Gateway로 HTTP 엔드포인트 열기

브라우저(앱)에서 Lambda를 **URL로** 호출하려면 **API Gateway**를 연결해야 합니다.

### 4-1. "함수 URL"로 빠르게 열기 (가장 간단)

1. Lambda 함수 → **구성** 탭 → 왼쪽 **「함수 URL(Function URL)」**
2. **「함수 URL 생성(Create function URL)"** 클릭
3. **인증 유형**: "NONE" (나중에 API 키 등으로 보안 강화 가능)
4. **CORS**: "동일 출처만 허용" 또는 "모든 출처 허용" (개발 시에는 모든 출처 허용이 편함)
   - "모든 출처 허용" 시:
     - Allow origin: `*`
     - Allow methods: `POST`, `OPTIONS`
     - Allow headers: `Content-Type`
5. **저장** 후 **함수 URL**이 생성됩니다. 예: `https://xxxxxxxx.lambda-url.ap-northeast-2.on.aws/`
6. 이 URL을 **복사**해 두세요. 앱에서 이 주소로 POST 요청을 보내면 됩니다.

### 4-2. (대안) REST API로 열기

1. **API Gateway** 서비스 → **「API 생성」** → **REST API** (비공개 아님) 선택
2. **리소스** 생성 → **메서드**에서 **POST** 추가 → 통합 대상 **Lambda 함수** 선택 (리전·함수명 일치)
3. **API 배포** (예: 스테이지 이름 `prod`)
4. **호출 URL** 예: `https://xxxxxx.execute-api.ap-northeast-2.amazonaws.com/prod/backtest`
5. **CORS** 설정: API Gateway에서 리소스에 OPTIONS, POST에 CORS 헤더 추가

---

## 5단계: 앱에서 URL 연결 (프론트엔드)

앱은 **환경 변수**로 백테스트 API 주소를 읽습니다.

1. 프로젝트 **루트**에 `.env` 파일 생성 (이미 있으면 수정)
2. 다음 한 줄 추가 (다분할 백테스트용):

   ```env
   VITE_BACKTEST_MULTI_URL=https://xxxxxxxx.lambda-url.ap-northeast-2.on.aws/
   ```

   - 위 주소는 **4단계**에서 복사한 **함수 URL**로 바꿉니다.
   - 이평선 백테스트도 Lambda로 붙였다면, 예를 들어:

   ```env
   VITE_BACKTEST_MA_URL=https://yyyyyyyy.lambda-url.ap-northeast-2.on.aws/
   ```

3. 앱을 **다시 실행** (예: `npm run dev`).  
   백테스트 페이지에서 **다분할** 선택 후 실행하면, 설정한 URL로 POST 요청이 가고 Lambda가 실행됩니다.

> `Backtest.tsx`는 현재 **다분할**일 때만 `VITE_BACKTEST_MULTI_URL`을 사용합니다. 이평선용 URL 변수는 필요 시 코드에 추가하면 됩니다.

---

## 6단계: 요청/응답 형식 맞추기

### Lambda가 기대하는 요청 (다분할 예시)

**POST** body (JSON):

```json
{
  "stock": "TQQQ",
  "targetReturnRate": 10,
  "totalSplitCount": 40,
  "oneTimeAmount": 1000,
  "months": 24,
  "feeRate": 0.25
}
```

선택적으로 event에 Supabase 정보를 넘길 수도 있습니다:

```json
{
  "stock": "TQQQ",
  "targetReturnRate": 10,
  "totalSplitCount": 40,
  "oneTimeAmount": 1000,
  "months": 24,
  "feeRate": 0.25,
  "supabase_url": "https://xxxxx.supabase.co",
  "supabase_key": "eyJ..."
}
```

(환경 변수에 이미 넣었으면 생략 가능)

### Lambda가 반환하는 응답

- **성공**: `{ "statusCode": 200, "body": "{\"totalReturnPct\": ..., \"equityCurve\": [...], ...}" }`  
  - `body`는 문자열이므로 프론트에서 `JSON.parse(data.body)` 한 번 하면 됩니다. (이미 `Backtest.tsx`에서 처리 중)
- **에러(예: 1회 매수금 부족)**: `body` 안에 `"error": "1회 매수 금액이 주식 1주 가격보다 적습니다. ..."` 가 들어 있으면, 앱에서 빨간 박스로 해당 메시지를 표시합니다.

---

## 7단계: 테스트 방법

### Lambda 콘솔에서 직접 테스트

1. Lambda 함수 → **「테스트(Test)」** 탭
2. **테스트 이벤트** 새로 만들기 (이벤트 이름 예: `multi-test`)
3. 이벤트 JSON 예시 (다분할):

   ```json
   {
     "stock": "TQQQ",
     "targetReturnRate": 10,
     "totalSplitCount": 40,
     "oneTimeAmount": 1000,
     "months": 24,
     "feeRate": 0.25
   }
   ```

4. **「테스트」** 클릭 → 실행 결과에서 `statusCode: 200`, `body` 안에 수익률·차트 데이터가 있으면 성공입니다.  
   `body`에 `"error"`가 있으면 그 메시지대로 설정을 조정하면 됩니다.

### 앱에서 테스트

1. `.env`에 `VITE_BACKTEST_MULTI_URL` 저장 후 앱 재시작
2. 백테스트 페이지 → **다분할 매매법** 선택 → 파라미터 입력 → **백테스트 실행**
3. 결과 차트가 나오거나, 에러일 경우 빨간 박스에 메시지가 표시되면 연동이 된 것입니다.

---

## 8단계: 자주 나오는 문제와 확인 사항

| 현상 | 확인할 것 |
|------|------------|
| **타임아웃** | Lambda 기본 3초. 구성 → 일반 구성 → 제한 시간을 30초~1분 정도로 늌다. |
| **메모리 부족** | 구성 → 메모리 512MB 이상(예: 1024MB)으로 올린다. |
| **ModuleNotFoundError: pandas / supabase** | 해당 라이브러리 **레이어**가 이 Lambda 함수에 붙어 있는지, 런타임(Python 3.11)과 맞는지 확인한다. |
| **Supabase 연결 실패** | 환경 변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 가 정확한지, Supabase 대시보드에서 복사한 값인지 확인한다. |
| **CORS 에러** | 함수 URL 또는 API Gateway에서 CORS에 `POST`, `Content-Type`, `*`(또는 앱 도메인) 허용했는지 확인한다. |
| **body가 문자열** | Lambda는 `body`를 `json.dumps(result)` 로 문자열로 반환한다. 프론트에서는 `JSON.parse(data.body)` 로 파싱하면 된다. (`Backtest.tsx` 에 이미 반영됨) |

---

## 9단계: 배포 체크리스트 (한 번에 확인)

- [ ] Lambda 함수 생성 (이평선/다분할 각각 필요 시)
- [ ] 함수 코드에 `backtest_ma.py` 또는 `backtest_multi.py` 넣기, 핸들러 설정
- [ ] Pandas 레이어 추가 (AWSSDKPandas 등)
- [ ] Supabase 레이어 생성·업로드 후 함수에 연결 (`LAMBDA_SUPABASE_LAYER.md` 참고)
- [ ] 환경 변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 설정
- [ ] 함수 URL(또는 API Gateway) 생성, CORS 설정
- [ ] `.env`에 `VITE_BACKTEST_MULTI_URL` (및 필요 시 `VITE_BACKTEST_MA_URL`) 설정
- [ ] Lambda 테스트 이벤트로 실행해 보기
- [ ] 앱에서 백테스트 실행해 보기

---

## 관련 문서

- **레이어 상세**: `docs/LAMBDA_SUPABASE_LAYER.md` — Supabase 레이어 만들기
- **백테스트 연동 개요**: `docs/BACKTEST_NEXT_STEPS.md` — 연산 엔진·API·프론트 연동 흐름
- **이평선 백테스트**: `scripts/backtest_ma.py` — `handler(event, context)` 진입점
- **다분할 백테스트**: `scripts/backtest_multi.py` — `handler(event, context)` 진입점

이 가이드대로 하면 Lambda와 연결·배포 후 앱에서 실제 백테스트 API를 호출할 수 있습니다.
