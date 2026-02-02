# AWS Lambda에 Supabase 전용 레이어 추가하기

백테스트 Lambda에서 **Supabase 주가 데이터**를 조회하려면 `supabase` Python 패키지가 필요합니다.  
AWS에는 Supabase 공식 레이어가 없으므로, **직접 레이어를 만들어 업로드**합니다.

---

## 준비물

- **Python 3.11** (Lambda 런타임과 동일)
- **Linux 환경** 또는 **Docker** (Lambda는 Linux x86_64에서 실행되므로, Windows/Mac에서 만든 zip은 호환 문제가 있을 수 있음)

---

## 1단계: 레이어용 디렉터리 만들기

프로젝트 루트 또는 원하는 위치에서:

```bash
mkdir -p lambda-layers/supabase/python
cd lambda-layers/supabase/python
```

Lambda 레이어는 **`python/`** 아래에 패키지가 있어야 합니다. (또는 `python/lib/python3.11/site-packages/`)

---

## 2단계: Supabase 패키지 설치 (레이어 구조에 맞게)

**방법 A – pip으로 현재 폴더에 설치 (가장 간단)**

```bash
# 위에서 만든 python 폴더 안에서 실행
pip install supabase -t .
```

`supabase`와 의존성(postgrest-py, httpx 등)이 현재 폴더에 설치됩니다.

**방법 B – Windows/Mac 사용 시 (Lambda와 동일한 Linux용으로 설치)**

Lambda는 Linux x86_64이므로, Windows/Mac에서 설치하면 일부 패키지가 호환되지 않을 수 있습니다.  
Docker가 있다면:

```bash
docker run --rm -v "%cd%":/var/task public.ecr.aws/sam/build-python3.11:latest pip install supabase -t /var/task/python
```

(Windows CMD 기준; PowerShell이면 `%cd%` 대신 `${PWD}` 사용)

Docker가 없다면 **방법 A**로 설치한 뒤, Lambda에 올려서 테스트해 보고 에러가 나면 그때 Docker/CI로 다시 만드는 방법을 쓰면 됩니다.

---

## 3단계: zip 파일 만들기

**중요:** zip의 **최상위에 `python` 폴더**가 들어가야 Lambda가 인식합니다.

**Windows PowerShell (zip 명령 없음):**

```powershell
# lambda-layers/supabase 폴더에서 실행 (python 폴더의 부모)
cd ..
Compress-Archive -Path python -DestinationPath supabase-layer.zip
```

**Linux / Mac / Git Bash:**

```bash
cd ..
zip -r supabase-layer.zip python
```

생성된 `supabase-layer.zip` 크기가 **50MB 미만**이어야 합니다 (Lambda 레이어 제한).  
Supabase 클라이언트는 보통 10MB 안쪽입니다.

---

## 4단계: AWS 콘솔에서 레이어 생성

1. **AWS 콘솔** 로그인 → **Lambda** 서비스 이동
2. 왼쪽 메뉴에서 **「계층(Layers)」** 클릭
3. **「계층 생성(Create layer)」** 클릭
4. 입력:
   - **이름:** `supabase-python311` (원하는 이름 가능)
   - **설명:** `Supabase Python client for backtest Lambda` (선택)
   - **업로드:** 「.zip 파일 업로드」 선택 후 위에서 만든 **supabase-layer.zip** 업로드
   - **호환 런타임:** **Python 3.11** 선택
5. **「생성(Create)」** 클릭

---

## 5단계: Lambda 함수에 레이어 연결

1. **Lambda** → 사용 중인 **백테스트 함수** 선택
2. 화면 아래 **「계층(Layers)」** 섹션으로 스크롤
3. **「계층 추가(Add a layer)」** 클릭
4. **「사용자 지정 계층(Custom layers)」** 선택
5. 드롭다운에서 방금 만든 **supabase-python311** (또는 지정한 이름) 선택
6. **「추가(Add)」** 클릭

이제 해당 Lambda 코드에서 `from supabase import create_client` 등으로 사용할 수 있습니다.

---

## 백테스트 Lambda에 필요한 레이어 정리

| 용도 | 레이어 | 비고 |
|------|--------|------|
| **Supabase DB 조회** | Supabase 전용 레이어 (위에서 만든 것) | 주가 등 과거 데이터 조회 |
| **백테스트 연산 (Pandas)** | AWSSDKPandas-Python311 (AWS 계층) | 시계열·수익률·MDD 등 계산 |

**정리:**  
- **Supabase 레이어** → 지금 단계에서 추가하면 됩니다.  
- **Pandas 레이어** → 백테스트 연산을 Lambda에서 할 거라면, **이미 추가했거나 앞으로 추가할 레이어는 이 둘만 있으면 됩니다.**  
  Supabase 레이어만 추가하고, Pandas는 이미 붙여 두었다면 **별도로 더 붙일 “전용 레이어”는 없습니다.**

추가로 필요한 건 **Lambda 함수 코드**(Supabase에서 데이터 가져와서 Pandas로 백테스트 돌리는 로직)와 **환경 변수**(Supabase URL, anon key 등) 설정입니다.
