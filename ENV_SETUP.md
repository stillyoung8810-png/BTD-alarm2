# 환경 변수 설정 가이드

## 📋 .env 파일에 필요한 환경 변수 목록

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 아래 변수들을 설정하세요:

```env
# Supabase 클라이언트 설정 (프론트엔드용)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 사이트 URL (OAuth 리다이렉트용)
VITE_SITE_URL=https://btd-alarm2.pages.dev

# Gemini API (AI 어드바이저 기능용)
GEMINI_API_KEY=your_gemini_api_key
```

---

## 🔍 각 파일별 환경 변수 사용 현황

### ✅ 1. services/supabase.ts
- **사용 변수**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **접근 방식**: `import.meta.env.VITE_SUPABASE_URL`
- **상태**: ✅ 정상 연동
- **용도**: 프론트엔드에서 Supabase 클라이언트 생성

### ✅ 2. services/geminiService.ts
- **사용 변수**: `process.env.API_KEY` (vite.config.ts에서 `GEMINI_API_KEY`로 매핑)
- **접근 방식**: `process.env.API_KEY`
- **상태**: ✅ 정상 연동
- **용도**: Google Gemini API 호출 (전략 어드바이저 기능)

### ✅ 3. vite.config.ts
- **사용 변수**: `GEMINI_API_KEY` (`.env`에서 로드)
- **접근 방식**: `loadEnv(mode, '.', '')` → `env.GEMINI_API_KEY`
- **상태**: ✅ 정상 연동
- **용도**: `process.env.API_KEY`와 `process.env.GEMINI_API_KEY`로 컴파일 시 주입

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
