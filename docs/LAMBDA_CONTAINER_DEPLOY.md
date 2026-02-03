# 백테스트 Lambda — 컨테이너 이미지로 배포 (단계별)

zip 대신 **컨테이너 이미지**로 배포하면 250MB 제한이 없습니다. **기능은 그대로**입니다.

---

## 준비 (한 번만 확인)

- [ ] **Docker Desktop** 설치되어 있고 실행 중
- [ ] **AWS CLI** 설치됨 (`aws --version` 실행해 보기)
- [ ] **AWS 로그인** 되어 있음 (`aws sts get-caller-identity` 로 확인)

---

## 1단계: ECR 저장소 만들기 (처음 한 번만)

1. **PowerShell** 또는 **CMD**를 연다.

2. 아래 명령 실행 (리전이 `ap-northeast-2`가 아니면 `--region` 값을 본인 리전으로 바꾼다).

   ```bash
   aws ecr create-repository --repository-name backtest-lambda --region ap-northeast-2
   ```

3. 출력된 JSON 안에 **`repositoryUri`** 가 있다.  
   예: `"repositoryUri": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/backtest-lambda"`  
   → **이 주소 전체**와 **맨 앞 숫자(계정 ID)** 를 메모해 둔다.  
   (이미 저장소가 있으면 "ResourceAlreadyExistsException" 나와도 괜찮다. 기존 저장소 쓰면 된다.)

---

## 2단계: Docker로 ECR 로그인

1. **계정 ID**를 본인 값으로 바꾼 뒤 실행 (위 1단계에서 메모한 숫자).

   ```bash
   aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
   ```

2. `Login Succeeded` 가 나오면 성공.

---

## 3단계: 이미지 빌드

1. **프로젝트 폴더**로 이동한다 (Dockerfile.backtest 가 있는 곳).

   ```bash
   cd C:\Users\user\Desktop\BTD-alarm2
   ```

2. 아래 명령으로 이미지를 만든다.

   ```bash
   docker build -f Dockerfile.backtest -t backtest-lambda .
   ```

3. 끝날 때까지 기다린다 (몇 분 걸릴 수 있음). 마지막에 `Successfully built` 가 나오면 성공.

---

## 4단계: 이미지에 ECR 주소 태그 붙이기

**`123456789012`** 와 **리전**을 본인 값으로 바꾼 뒤 실행.

```bash
docker tag backtest-lambda:latest 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/backtest-lambda:latest
```

---

## 5단계: ECR에 이미지 올리기 (푸시)

```bash
docker push 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/backtest-lambda:latest
```

(위 주소는 4단계에서 쓴 것과 동일하게.)

푸시가 끝나면 ECR 콘솔에서 `backtest-lambda` 저장소에 `latest` 태그가 보인다.

---

## 6단계: Lambda에서 컨테이너 이미지로 함수 만들기

1. **AWS 콘솔** → **Lambda** → **함수 생성**.

2. **새로 작성** 선택 후:
   - 함수 이름: 예) `backtest-ma`
   - **이미지** 선택 (zip 아님).
   - **Amazon ECR에서 이미지 선택** 클릭.
   - `backtest-lambda` 저장소 선택 → **latest** 태그 선택 → **선택** 클릭.

3. **함수 생성** 클릭.

4. 함수가 만들어지면:
   - **구성** 탭 → **일반 구성** → **편집**  
     - 메모리: 예) **512 MB**  
     - 타임아웃: 예) **1분**  
     - **저장**
   - **구성** 탭 → **환경 변수** → **편집**  
     - `SUPABASE_URL` = (본인 Supabase URL)  
     - `SUPABASE_ANON_KEY` = (본인 anon key)  
     - **저장**

5. **테스트** 탭에서 **테스트** 버튼으로 한 번 실행해 본다.  
   (테스트 이벤트는 기존 zip 함수에서 쓰던 JSON 그대로 써도 된다.)

---

## 7단계: (선택) 기존 zip 함수를 이미지로 바꾸는 경우

이미 backtest Lambda 함수가 있고, **그 함수를 이미지로만 바꾸고 싶을 때**:

1. Lambda 콘솔에서 **해당 함수** 클릭.
2. **코드** 탭 → **이미지** 영역에서 **이미지 선택** (또는 **배포 패키지** 관련에서 이미지로 전환).
3. ECR의 **backtest-lambda:latest** 선택 후 저장.
4. **구성** → **계층** → 기존 **Pandas / Supabase 레이어는 제거** (이미지 안에 들어 있음).
5. **환경 변수**는 그대로 두고 **저장** → **테스트**로 확인.

---

## 체크리스트 요약

| 순서 | 할 일 | 확인 |
|------|--------|------|
| 1 | ECR 저장소 생성 (`aws ecr create-repository ...`) | |
| 2 | Docker로 ECR 로그인 | |
| 3 | `docker build -f Dockerfile.backtest -t backtest-lambda .` | |
| 4 | `docker tag ...` (본인 ECR 주소로) | |
| 5 | `docker push ...` (본인 ECR 주소로) | |
| 6 | Lambda에서 “이미지”로 함수 생성 + 환경 변수 설정 | |
| 7 | (선택) 기존 함수를 이미지로 전환 + 레이어 제거 | |

---

## 자주 바꾸는 값

- **리전**: `ap-northeast-2` → 본인 Lambda/ECR 리전
- **계정 ID**: `123456789012` → 본인 AWS 계정 ID (1단계 출력의 `repositoryUri` 맨 앞 숫자)
- **함수 이름**: `backtest-ma` → 원하는 이름

이 순서대로 하면 컨테이너 이미지로 배포까지 끝낼 수 있다.  
기능은 zip 배포와 동일하고, 250MB 제한만 없어진다.
