# 환경 변수 설정 가이드

**Supabase / Cloudflare / Firebase / GitHub에서 Variables를 어디에 어떻게 입력하는지** 단계별 안내는 **[docs/VARIABLES_BY_SERVICE.md](docs/VARIABLES_BY_SERVICE.md)** 를 참고하세요.

---

## 📋 .env 파일에 필요한 환경 변수 목록

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 아래 변수들을 설정하세요:

```env
# Supabase 클라이언트 설정 (프론트엔드용)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 사이트 URL (OAuth 리다이렉트용)
VITE_SITE_URL=https://btd-alarm2.pages.dev

# Gemini API (AI 어드바이저·AI 매매 인식 기능용)
GEMINI_API_KEY=your_gemini_api_key

# AI 매매 인식: 무료/유료 티어별 키 (선택)
# - 무료 회원: VITE_GEMINI_API_KEY_FREE (구글 AI 스튜디오 무료 키 등)
# - 유료 회원(PRO/PREMIUM): VITE_GEMINI_API_KEY_PAID
# - 둘 다 없으면 GEMINI_API_KEY 하나로 통일 사용
VITE_GEMINI_API_KEY_FREE=your_free_tier_gemini_key
VITE_GEMINI_API_KEY_PAID=your_paid_tier_gemini_key

# Firebase Cloud Messaging (FCM) 설정 (푸시 알림용)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_VAPID_KEY=your_vapid_key
```

---

## 🔍 각 파일별 환경 변수 사용 현황

### ✅ 1. services/supabase.ts
- **사용 변수**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **접근 방식**: `import.meta.env.VITE_SUPABASE_URL`
- **상태**: ✅ 정상 연동
- **용도**: 프론트엔드에서 Supabase 클라이언트 생성

### ✅ 2. services/geminiService.ts
- **사용 변수**: `process.env.API_KEY` (vite.config.ts에서 `GEMINI_API_KEY`로 매핑), AI 매매 인식 시 무료/유료 키는 `VITE_GEMINI_API_KEY_FREE`·`VITE_GEMINI_API_KEY_PAID` (App에서 전달)
- **접근 방식**: `process.env.API_KEY` (기본), `analyzeTradeScreenshot(..., { apiKey })` (티어별 키)
- **상태**: ✅ 정상 연동
- **용도**: Google Gemini API 호출 (전략 어드바이저, AI 매매 인식)
- **AI API 키 입력 위치**: 프로젝트 루트 `.env` 파일에 아래 변수를 넣으면 됩니다.
  - **무료·유료 구분 없이 하나만 쓸 때**: `GEMINI_API_KEY=발급받은_키` (기존과 동일)
  - **무료 티어용**: `VITE_GEMINI_API_KEY_FREE=무료_키` (구글 AI 스튜디오 등에서 무료 키 발급)
  - **유료 회원용**: `VITE_GEMINI_API_KEY_PAID=유료_키`
  - `VITE_` 변수는 빌드 시 클라이언트에 포함되므로, 배포 시에는 호스팅(Vercel·Netlify 등)의 **Environment Variables**에 같은 이름으로 설정하면 됩니다.

### ✅ 3. vite.config.ts
- **사용 변수**: `GEMINI_API_KEY` (`.env`에서 로드)
- **접근 방식**: `loadEnv(mode, '.', '')` → `env.GEMINI_API_KEY`
- **상태**: ✅ 정상 연동
- **용도**: `process.env.API_KEY`·`process.env.GEMINI_API_KEY`로 컴파일 시 주입. `VITE_GEMINI_API_KEY_*`는 Vite가 자동으로 클라이언트에 노출

### ✅ 4. scripts/fetch_stock_prices.py
- **사용 변수**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **접근 방식**: `os.environ.get()`
- **상태**: ✅ 정상 연동 (GitHub Actions secrets 사용)
- **용도**: 주가 데이터를 Supabase에 저장

### ✅ 5. .github/workflows/fetch-stock-prices.yml
- **사용 변수**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (GitHub Secrets에서 제공)
- **상태**: ✅ 정상 연동
- **설정 위치**: GitHub Repository → Settings → Secrets and variables → Actions

### ✅ 6. supabase/functions/update-stock-prices/index.ts
- **사용 변수**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **접근 방식**: `Deno.env.get()`
- **상태**: ✅ 정상 연동 (Supabase Edge Function 환경 변수 사용)
- **설정 위치**: Supabase Dashboard → Project Settings → Edge Functions → Secrets

### ✅ 7. components/AuthModals.tsx
- **사용 변수**: `VITE_SITE_URL`
- **접근 방식**: `import.meta.env.VITE_SITE_URL`
- **상태**: ✅ 정상 연동
- **용도**: OAuth 소셜 로그인 및 비밀번호 재설정 이메일의 리다이렉트 URL 설정
- **기본값**: 환경 변수가 없으면 `window.location.origin` 사용 (로컬 개발용)

### ✅ 8. services/firebase.ts
- **사용 변수**: 
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_VAPID_KEY`
- **접근 방식**: `import.meta.env.VITE_FIREBASE_*`
- **상태**: ✅ 정상 연동
- **용도**: Firebase Cloud Messaging (FCM) 초기화 및 푸시 알림 토큰 관리
- **주요 함수**: 
  - `requestForToken()`: 알림 권한 요청 및 FCM 토큰 가져오기
  - `onMessageListener()`: 포그라운드 메시지 리스너 설정
  - `getNotificationPermission()`: 현재 알림 권한 상태 확인
  - `isNotificationPermissionGranted()`: 알림 권한 허용 여부 확인

### ✅ 9. supabase/functions/telegram-webhook (Edge Function)
- **사용 변수**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`
- **접근 방식**: `Deno.env.get()`
- **상태**: ✅ 정상 연동 (Supabase Edge Function Secrets에 설정)
- **설정 위치**: Supabase Dashboard → Project Settings → Edge Functions → Secrets
- **용도**: 텔레그램 봇 Webhook — 사용자가 `/start <token>` 전송 시 `user_profiles`에 `telegram_chat_id` 등 연동
- **웹훅 등록**: 자세한 단계는 `TELEGRAM_SETUP.md` 참고

---

## ⚠️ 주의사항

1. **Vite 환경 변수**: 프론트엔드에서 접근 가능한 변수는 반드시 `VITE_` 접두사가 필요합니다.
   - ✅ `VITE_SUPABASE_URL`
   - ❌ `SUPABASE_URL` (프론트엔드에서 접근 불가)

2. **GitHub Actions**: Python 스크립트 실행 시 환경 변수는 GitHub Secrets에서 제공됩니다.
   - 로컬 `.env` 파일과는 별개입니다.
   - Repository Settings → Secrets에서 설정해야 합니다.

3. **Supabase Edge Functions**: Edge Function은 Supabase 대시보드에서 별도로 환경 변수를 설정해야 합니다.

---

## 🧪 환경 변수 연동 테스트 방법

### 로컬 테스트
```bash
# 1. .env 파일 생성 및 변수 설정
# 2. 개발 서버 실행
npm run dev

# 3. 브라우저 콘솔에서 확인
# - Supabase 연결 확인
# - Gemini API 호출 테스트
```

### GitHub Actions 테스트
```bash
# GitHub Actions 탭에서 workflow_dispatch로 수동 실행
# 또는 자동 스케줄 실행 시 로그 확인
```
