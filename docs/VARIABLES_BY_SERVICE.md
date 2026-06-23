# Variables 입력 안내 (Supabase, Cloudflare, Firebase, GitHub)

이 문서는 **Supabase**, **Cloudflare**, **Firebase**, **GitHub**를 사용할 때, 환경 변수(Variables)와 시크릿(Secrets)을 **어느 사이트에서 어떻게 입력하는지** 정리한 것입니다.

---

## 1. Supabase

Supabase에서는 **Edge Function**에서 쓰는 비밀값(시크릿)만 대시보드에 입력합니다.  
프론트엔드에서 쓰는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`는 **Supabase가 아니라** 앱을 빌드하는 곳(로컬 `.env` 또는 **Cloudflare Pages**)에 넣습니다.

### 1-1. 접속 경로

1. [Supabase Dashboard](https://app.supabase.com) 로그인
2. **프로젝트 선택**
3. 왼쪽 메뉴 **Project Settings** (톱니바퀴) → **Edge Functions**

### 1-2. 시크릿 입력 방법

- **Edge Functions** → **Secrets** (또는 각 함수별 설정)
- **Add new secret** / **Manage secrets** 클릭
- **Name**에 변수명, **Value**에 값을 입력 후 저장

### 1-3. 이 프로젝트에서 Supabase에 넣는 변수

| 변수명 | 넣는 위치 | 용도 |
|--------|------------|------|
| `SUPABASE_URL` | Edge Function **Secrets** (공통 또는 해당 함수) | Edge Function에서 Supabase 호출 시 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function **Secrets** | 서버 권한으로 DB/API 호출 |
| `TELEGRAM_BOT_TOKEN` | **send-alarm**, **telegram-webhook** 함수 Secrets | 텔레그램 API 호출 |
| `INTERNAL_ALARM_SECRET` | **check-and-trigger-alarms**, **send-alarm** 함수 Secrets (동일 값) | 알람 트리거 → 발송 간 검증 |
| `WORKER_BFF_URL` | **send-alarm**, **benefits** 함수 Secrets | Cloudflare Worker BFF base URL. 없으면 기존 `RAILWAY_BFF_URL` fallback 사용 |

- Supabase Dashboard에서 **Edge Functions** 목록에 있는 각 함수(**check-and-trigger-alarms**, **send-alarm**, **telegram-webhook**, **update-stock-prices** 등)에 들어가서, 해당 함수가 사용하는 시크릿을 위와 같이 추가하면 됩니다.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`는 **Project Settings → API**에서 확인할 수 있습니다. 이 값을 복사해서 Edge Function Secrets에 넣으면 됩니다.

---

## 2. Cloudflare (Cloudflare Pages)

프론트엔드(웹 앱)가 **Cloudflare Pages**로 배포되는 경우, **빌드 시** 사용하는 모든 환경 변수는 **Cloudflare Pages의 Environment variables**에 넣습니다.

### 2-1. 접속 경로

1. [Cloudflare Dashboard](https://dash.cloudflare.com) 로그인
2. 왼쪽 **Workers & Pages** (또는 **Pages**) 클릭
3. **해당 프로젝트(사이트)** 선택
4. **Settings** 탭 → **Environment variables**

### 2-2. 변수 입력 방법

- **Add variable** (또는 **Add**)
- **Variable name**: 예) `VITE_SUPABASE_URL`
- **Value**: 실제 값
- **Environment**: Production / Preview / Development 중 선택 (보통 Production 필수)
- 저장 후 **한 번 재배포(Redeploy)** 해야 반영됩니다. (Vite는 빌드 시점에 `VITE_` 변수를 코드에 넣기 때문)

### 2-3. Cloudflare Pages에 넣는 변수 (이 프로젝트 기준)

| 변수명 | 설명 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key (Project Settings → API) |
| `VITE_SITE_URL` | 실제 서비스 URL (예: `https://your-project.pages.dev`) |
| `GEMINI_API_KEY` | Gemini API 키 (AI 어드바이저·매매 인식) |
| `VITE_GEMINI_API_KEY_FREE` | (선택) 무료 티어용 Gemini 키 |
| `VITE_GEMINI_API_KEY_PAID` | (선택) 유료 티어용 Gemini 키 |
| `VITE_FIREBASE_API_KEY` | Firebase 프로젝트 API 키 |
| `VITE_FIREBASE_AUTH_DOMAIN` | `xxx.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `xxx.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_FIREBASE_VAPID_KEY` | FCM Web Push 키 (VAPID) |
| `VITE_TELEGRAM_BOT_USERNAME` | 텔레그램 봇 유저명 (@ 없이) |
| `VITE_WORKER_BFF_URL` | Cloudflare Worker BFF base URL. 없으면 기존 `VITE_RAILWAY_BFF_URL` fallback 사용 |

- Firebase 관련 값은 **Firebase Console** → 프로젝트 → **Project settings** → **General** → **Your apps** 에서 확인할 수 있습니다.
- **주의**: `TELEGRAM_BOT_TOKEN`, `INTERNAL_ALARM_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` 같은 **비밀키는 Cloudflare에 넣지 마세요.** 이건 Supabase Edge Function 쪽 Secrets에만 넣습니다.

---

## 3. Firebase

Firebase 자체에는 “환경 변수 입력” 메뉴가 없습니다.  
웹 앱에서 쓰는 설정(API 키, 프로젝트 ID 등)은 **Firebase Console**에서 **확인**만 하고, 실제로 **앱에 넣는 곳**은 **앱을 빌드하는 환경**입니다.

### 3-1. 값 확인 (Firebase Console)

1. [Firebase Console](https://console.firebase.google.com) 로그인
2. **프로젝트 선택**
3. **Project settings** (톱니바퀴) → **General**
4. **Your apps** 에서 웹 앱 선택 → **Config** 객체에서 다음 값 확인:
   - `apiKey` → `VITE_FIREBASE_API_KEY`
   - `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `VITE_FIREBASE_PROJECT_ID`
   - `storageBucket` → `VITE_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `VITE_FIREBASE_APP_ID`
5. **Cloud Messaging** 탭에서 **Web Push 인증 키(VAPID)** 확인 → `VITE_FIREBASE_VAPID_KEY`

### 3-2. 변수 입력하는 곳

- **로컬**: 프로젝트 루트 `.env` 에 `VITE_FIREBASE_*` 형태로 입력
- **배포(Cloudflare Pages)**: 위 **2. Cloudflare** 절대로 가서 **Environment variables**에 같은 이름으로 입력

즉, **Variables를 “입력”하는 사이트는 Firebase가 아니라 로컬 `.env` 또는 **Cloudflare** 입니다.

---

## 4. GitHub

GitHub에서는 **Actions**에서 사용하는 비밀값(Secrets)과 변수(Variables)를 저장합니다.  
주로 **주가 fetch** 같은 스케줄 작업이나, GitHub Actions로 빌드/배포할 때 사용합니다.

### 4-1. 접속 경로

1. **GitHub**에서 해당 **저장소(Repository)** 열기
2. **Settings** 탭
3. 왼쪽 **Secrets and variables** → **Actions**

### 4-2. Secrets 입력 (비밀키)

- **New repository secret** 클릭
- **Name**: 예) `SUPABASE_SERVICE_ROLE_KEY`
- **Secret**: 값 입력 (한 번 저장하면 다시 볼 수 없음)
- **Add secret** 로 저장

### 4-3. Variables 입력 (공개해도 되는 값)

- **Variables** 탭 → **New repository variable**
- **Name** / **Value** 입력 후 저장  
- 워크플로에서 `${{ vars.변수명 }}` 으로 사용

### 4-4. 이 프로젝트에서 GitHub에 넣는 값

| 이름 | 종류 | 용도 |
|------|------|------|
| `SUPABASE_URL` | Secret | `fetch-stock-prices` 워크플로에서 Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `fetch-stock-prices` 워크플로에서 Supabase 서비스 롤 키 |

- `.github/workflows/fetch-stock-prices.yml` 에서 위 두 Secret을 사용합니다.
- **Cloudflare Pages**를 GitHub 저장소와 연결해 자동 배포하는 경우, **빌드에 필요한 변수는 Cloudflare Pages의 Environment variables에 넣고**, GitHub Actions에서는 위처럼 **Supabase 관련 Secret만** 넣으면 됩니다.

---

## 요약 표

| 사용처 | Variables 입력하는 사이트 | 경로 요약 |
|--------|---------------------------|-----------|
| **Supabase Edge Function** (시크릿) | **Supabase** | Dashboard → 프로젝트 → Project Settings → Edge Functions → Secrets |
| **프론트엔드 빌드** (VITE_*, GEMINI 등) | **Cloudflare** | Workers & Pages → 프로젝트 → Settings → Environment variables |
| **Firebase 값** | Firebase에서 **확인**, 실제 입력은 **Cloudflare** 또는 **.env** | Cloudflare: 위와 동일 / 로컬: `.env` |
| **GitHub Actions** (주가 fetch 등) | **GitHub** | 저장소 → Settings → Secrets and variables → Actions |

- **로컬 개발**: 프로젝트 루트 `.env` 에 위 변수들을 넣고 `npm run dev` 로 실행하면 됩니다.
- **배포 후 변수 추가/수정**: Cloudflare에서 변수 저장한 뒤 **반드시 Redeploy** 해야 새 값이 반영됩니다.
