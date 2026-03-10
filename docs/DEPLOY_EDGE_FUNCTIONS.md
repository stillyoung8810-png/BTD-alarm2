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

---

## 6. 토스 미니앱 대응 CORS 배포 (AI 매매 인식 등)

일반 웹(`btd-alarm2.pages.dev`)에서는 동작하지만 **토스 미니앱 WebView**에서만 API 호출이 실패하는 경우, Edge Function의 CORS가 미니앱 Origin을 허용하지 않기 때문입니다.  
`supabase/functions/_shared/cors.ts`를 도입해 **요청의 Origin**에 따라 동적으로 `Access-Control-Allow-Origin`을 반환하도록 수정된 함수들을 배포해야 합니다.

### 6.1 수정된 Edge Function 목록

| 함수 | 용도 | 배포 시 옵션 |
|------|------|----------------|
| **gemini** | AI 매매 인식, 전략 어드바이저 | `--no-verify-jwt` |
| cancel-subscription | 결제 취소(환불) | (기본) |
| verify-payment | 결제 검증 | (기본) |
| delete-account | 회원 탈퇴 | (기본) |
| push-notification | FCM 푸시 | `--no-verify-jwt` |
| send-alarm | 알람 발송(내부 호출) | `--no-verify-jwt` |

### 6.2 배포 순서 (프로젝트 루트에서)

**AI 매매 인식만 먼저 해결하려면** — `gemini`만 배포:

```powershell
cd c:\dev\BTD-alarm2
npx supabase functions deploy gemini --no-verify-jwt
```

**미니앱에서 쓰는 다른 API까지 한 번에 반영하려면** — 아래 전부 실행:

```powershell
cd c:\dev\BTD-alarm2
npx supabase functions deploy gemini --no-verify-jwt
npx supabase functions deploy cancel-subscription
npx supabase functions deploy verify-payment
npx supabase functions deploy delete-account
npx supabase functions deploy push-notification --no-verify-jwt
npx supabase functions deploy send-alarm --no-verify-jwt
```

또는 **전체 Edge Function 일괄 배포**:

```powershell
npx supabase functions deploy
```

이후 JWT 검증이 꺼져 있어야 하는 함수(`send-alarm`, `gemini`, `push-notification` 등)는 Dashboard에서 해당 함수 설정을 확인하거나, 위처럼 `--no-verify-jwt`를 붙여 다시 배포합니다.

### 6.3 환경 변수(선택)

CORS 공통 로직(`_shared/cors.ts`)은 **환경 변수가 없어도** 아래 Origin을 기본 허용합니다.

- `https://btd-alarm2.pages.dev`
- `https://btdalarm.apps.tossmini.com`
- `https://btdalarm.private-apps.tossmini.com`

앱 이름이 다르면 Supabase Dashboard → **Edge Functions** → **Secrets**에서 다음 중 필요한 것만 설정합니다.

| 시크릿 | 설명 | 예시 |
|--------|------|------|
| `TOSS_APP_NAME` | 토스 미니앱 콘솔 앱 이름 (기본: `btdalarm`) | `btdalarm` |
| `ALLOWED_ORIGINS` | 추가 허용 Origin (쉼표 구분) | `https://example.com` |
| `ALLOWED_ORIGIN` / `SITE_URL` | 기존 단일 Origin 설정도 여전히 사용됨 | `https://btd-alarm2.pages.dev` |

### 6.4 프론트엔드 배포

- **웹 (Cloudflare Pages)**  
  - 코드 푸시 후 자동 빌드되거나, Dashboard에서 **Deployments** → **Retry deployment** / **Create deployment**로 재배포.  
  - CORS 수정은 **Edge Function 쪽만** 배포하면 되고, 프론트는 에러 메시지 개선분만 반영하려면 한 번 재배포하면 됩니다.

- **토스 미니앱**  
  - `npm run build` 후 `dist` 결과물을 앱인토스 콘솔에 업로드하거나, `npm run deploy`(`ait deploy`)로 배포.  
  - CORS는 **서버(Edge Function)** 배포로 해결되므로, 미니앱 번들은 “에러 메시지가 더 구체적으로 보이도록” 한 번 배포해 두면 됩니다.

### 6.5 배포 후 확인

1. **Supabase Dashboard** → **Edge Functions** → 배포한 함수 → **Last deployed** 시간이 방금인지 확인.
2. 토스 앱에서 **QR 코드(테스트용 스킴)** 또는 실제 미니앱으로 진입 후, AI 매매 인식 실행.
3. 여전히 실패하면 브라우저(또는 원격 디버깅) **네트워크 탭**에서 해당 요청이 CORS/401로 막히는지 확인.  
   - 이번 수정으로 401/네트워크 오류 시 모달에 표시되는 문구가 더 구체적으로 바뀌어 있음.
