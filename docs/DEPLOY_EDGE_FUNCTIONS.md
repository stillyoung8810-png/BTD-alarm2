# Supabase Edge Function 배포 방법

로컬에서 수정한 **check-and-trigger-alarms**, **send-alarm** 등 Edge Function을 Supabase에 배포하는 방법입니다.

---

## 1. 사전 준비

### Supabase CLI 설치

**전역 npm(`npm install -g supabase`)은 지원하지 않습니다.** 아래 방법 중 하나를 사용하세요.

#### 방법 A: Windows – Scoop (권장)

[Scoop](https://scoop.sh)이 있으면:

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Scoop이 없으면 먼저 설치: <https://scoop.sh>

#### 방법 B: 프로젝트에 dev 의존성으로 설치 (npx 사용)

프로젝트 루트에서:

```bash
npm install supabase --save-dev
```

이후에는 **`supabase` 대신 `npx supabase`** 로 실행합니다.

```bash
npx supabase --version
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy check-and-trigger-alarms
```

#### Mac / Linux

```bash
brew install supabase/tap/supabase
```

설치 확인:

```bash
supabase --version
# 또는 (방법 B 사용 시)
npx supabase --version
```

### 로그인 및 프로젝트 연결

1. **로그인** (브라우저 열림):

```bash
supabase login
```

2. **프로젝트 연결** (최초 1회, 프로젝트 루트에서):

```bash
cd c:\Users\user\Desktop\BTD-alarm2
supabase link --project-ref YOUR_PROJECT_REF
```

- `YOUR_PROJECT_REF`: [Supabase Dashboard](https://app.supabase.com) → 프로젝트 선택 → **Settings** → **General** → **Reference ID** (또는 URL의 `.../project/여기` 부분).

---

## 2. Edge Function 배포

프로젝트 루트(`BTD-alarm2`)에서 실행합니다.

### check-and-trigger-alarms만 배포

```bash
supabase functions deploy check-and-trigger-alarms
```

### send-alarm만 배포 (JWT 검증 비활성화 권장)

`check-and-trigger-alarms`가 내부에서 `send-alarm`을 호출할 때 401 Invalid JWT가 나지 않도록 **JWT 검증을 끄고** 내부 시크릿(`INTERNAL_ALARM_SECRET`)으로만 인증하는 구성을 권장합니다.

```bash
supabase functions deploy send-alarm --no-verify-jwt
```

- `--no-verify-jwt` 없이 배포하면 게이트웨이가 Bearer JWT를 검증해 401이 날 수 있음. 자세한 내용은 `docs/TELEGRAM_ALARM_SETUP.md`의 "401 Invalid JWT 해결" 섹션 참고.

### 여러 함수 한 번에 배포

```bash
supabase functions deploy check-and-trigger-alarms
supabase functions deploy send-alarm
```

### 모든 Edge Function 배포

```bash
supabase functions deploy
```

---

## 3. 환경 변수(시크릿) 확인

Edge Function이 **SUPABASE_URL**, **SUPABASE_SERVICE_ROLE_KEY** 등을 사용하는 경우, Supabase Dashboard에서 설정되어 있어야 합니다.

1. [Supabase Dashboard](https://app.supabase.com) → 프로젝트 선택  
2. **Edge Functions** → 해당 함수 선택  
3. **Settings** 또는 **Secrets**에서 필요한 환경 변수 확인/추가  

로컬 `supabase/config.toml`의 `[functions.함수이름.env]`에 넣은 값은 **로컬 실행용**이며, **원격 배포**에는 Dashboard(또는 `supabase secrets set`)로 설정한 값이 사용됩니다.

### send-alarm 401 방지: INTERNAL_ALARM_SECRET

`send-alarm`을 `--no-verify-jwt`로 배포했다면, **내부 호출만 허용**하려면 다음 시크릿을 설정하세요.

| 함수 | 시크릿 이름 | 설명 |
|------|-------------|------|
| **send-alarm** | `INTERNAL_ALARM_SECRET` | 헤더 `X-Internal-Alarm-Secret`과 일치해야 요청 처리 |
| **check-and-trigger-alarms** | `INTERNAL_ALARM_SECRET` | 위와 **동일한 값**. send-alarm 호출 시 위 헤더로 전달 |

두 함수에 **같은 값**을 넣어야 합니다. 401 Invalid JWT 해결 흐름은 `docs/TELEGRAM_ALARM_SETUP.md`의 "401 Invalid JWT 해결" 참고.

---

## 4. 배포 후 확인

- **Dashboard** → **Edge Functions** → `check-and-trigger-alarms` (또는 배포한 함수)  
  - **Last deployed** 시간이 방금 배포 시각으로 갱신되었는지 확인.
- **Logs** 탭에서 다음 크론 실행 시 "Current KST time:", "window" 등 로그가 새 코드 기준으로 나오는지 확인.

---

## 5. 요약 (복사용)

**Scoop으로 CLI 설치한 경우:**

```powershell
cd c:\Users\user\Desktop\BTD-alarm2
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy check-and-trigger-alarms
supabase functions deploy send-alarm --no-verify-jwt
```

**프로젝트에 `npm install supabase --save-dev` 한 경우 (npx 사용):**

```powershell
cd c:\Users\user\Desktop\BTD-alarm2
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy check-and-trigger-alarms
npx supabase functions deploy send-alarm --no-verify-jwt
```

`YOUR_PROJECT_REF`만 실제 프로젝트 Reference ID로 바꾸면 됩니다.
