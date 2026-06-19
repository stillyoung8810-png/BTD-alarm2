# Railway BFF 토스 로그인 레거시 설계 기록

이 문서는 토스 로그인 코드를 주석이나 죽은 코드로 남기지 않고, 필요할 때 Git 기록에서 안전하게 되살리기 위한 복구 기록입니다.

## 보존 지점

- Git 태그: `legacy-toss-login-railway-bff-20260619`
- Archive 브랜치: `archive/toss-login-railway-bff`
- 기준 커밋: `a25951c`
- 기록일: 2026-06-19

주의: Git 태그와 브랜치는 커밋된 `HEAD`만 가리킵니다. 보존 시점에 작업 트리에 남아 있던 미커밋 변경은 이 태그와 브랜치에 포함되지 않습니다.

## 핵심 파일

- `services/toss/tossAuth.ts`
- `components/TossLoginView.tsx`
- `components/auth/AuthModalCoordinator.tsx`
- `server/src/routes/tossAuthRoute.ts`
- `server/src/toss/AuthService.ts`
- `server/src/routes/payment.ts`
- `server/src/routes/tossSmartMessageRoute.ts`
- `docs/RAILWAY_BFF_FAQ.md`
- `docs/RAILWAY_BFF_TOSS_PROMPT.md`

## 레거시 로그인 흐름

프론트엔드는 토스 미니앱 환경에서 `appLogin()` 브릿지 호출로 `authorizationCode`와 `referrer`를 받고, `VITE_RAILWAY_BFF_URL` 기준의 `POST /auth/toss/exchange`로 전달합니다.

`TossLoginView`는 브릿지 호출과 BFF 응답 처리만 맡고, 성공 결과를 상위 인증 흐름으로 전달합니다. `AuthModalCoordinator`는 토스 로그인 성공 payload를 감지한 뒤 Supabase `setSession`을 호출하고, 실패 시 로컬 세션을 롤백합니다.

서버의 `tossAuthRoute`는 요청 body를 `authorizationCode`, `referrer`만 허용하도록 검증합니다. 이후 `TossProvider`가 mTLS로 토스 `generate-token`과 `login-me`를 호출하고, `AuthService`가 토스 `userKey`를 기준으로 Supabase Auth 사용자와 내부 프로필을 연결한 뒤 Supabase 세션을 발급합니다.

`AuthService`는 토스 `userKey`를 주 식별자로 사용합니다. `login-me`의 email은 보조 메타데이터로만 저장하며, `toss_accounts`, `user_profiles.toss_user_key`, `toss_auth_links.encrypted_refresh_token`을 동기화합니다.

## 관련 엔드포인트

### `POST /auth/toss/exchange`

토스 로그인 인증 코드를 Supabase 세션으로 교환합니다.

요청:

```json
{
  "authorizationCode": "토스_appLogin_인가코드",
  "referrer": "DEFAULT"
}
```

`referrer`는 `DEFAULT` 또는 `sandbox`만 허용합니다.

응답:

```json
{
  "access_token": "supabase_access_token",
  "refresh_token": "supabase_refresh_token",
  "user": {
    "id": "auth_user_id",
    "email": "toss_user_key_placeholder_email"
  }
}
```

### `POST /payment/toss/verify`

기존 토스페이먼츠 카드 결제 검증 경로입니다. `Authorization: Bearer <Supabase access token>`으로 사용자를 검증하고, `paymentId`, `planId`, 선택적 `quantity`를 기준으로 금액과 구독 반영을 처리합니다.

### `POST /payment/toss/iap-verify`

토스 IAP 주문 상태 검증 경로입니다. Supabase 사용자 프로필의 `toss_user_key`가 있어야 토스 주문 상태 조회를 진행할 수 있습니다.

### `POST /internal/toss/messages/send`

기능성 스마트 메시지 단건 발송 경로입니다. `x-internal-alarm-secret` 헤더를 검증한 뒤, `user_profiles.toss_user_key`로 토스 `send-message` API를 호출합니다.

## 환경변수

### 프론트엔드

- `VITE_RAILWAY_BFF_URL`: Railway BFF base URL입니다. 토스 로그인, IAP 검증, 로그아웃/self-unlink 계열 호출이 이 값을 사용합니다.

### Railway BFF 공통

- `PORT`: Fastify listen port입니다. Railway가 주입하지 않으면 기본값은 `3000`입니다.
- `CORS_ORIGIN`: 허용할 프론트엔드 origin입니다. 없으면 Fastify CORS가 `true`로 동작합니다.
- `LOG_LEVEL`: Pino 로그 레벨입니다. 없으면 `info`입니다.
- `TOSS_API_URL`: 토스 앱인토스 API base URL입니다. 없으면 `https://apps-in-toss-api.toss.im`을 사용합니다.
- `TOSS_CLIENT_CERT`: 앱인토스 mTLS 클라이언트 인증서 PEM 내용입니다.
- `TOSS_CLIENT_KEY`: 앱인토스 mTLS 클라이언트 개인키 PEM 내용입니다.
- `SUPABASE_URL` 또는 `VITE_SUPABASE_URL`: Supabase 프로젝트 URL입니다.
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 Admin 작업용 service role key입니다.
- `SUPABASE_ANON_KEY` 또는 `VITE_SUPABASE_ANON_KEY`: 사용자 세션 발급용 Supabase Auth client key입니다. 없으면 service role key fallback을 사용합니다.

### 토스 로그인 상태 저장

- `TOSS_REQUIRED_TERMS_TAGS`: `login-me.agreedTerms`에서 필수로 확인할 약관 tag 목록입니다. 콤마로 구분합니다.
- `TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET`: `toss_auth_links.encrypted_refresh_token` 암복호화 secret입니다. 최소 32자 이상이어야 합니다.
- `TOSS_LOGIN_USER_SECRET`: 토스 managed user 비밀번호를 결정적으로 만들 때 쓰는 서버 secret입니다.

### 결제와 메시지

- `TOSS_PAYMENTS_SECRET_KEY`: 기존 토스페이먼츠 `/v1/payments/confirm` Basic Auth secret입니다.
- `PLAN_AMOUNT_PRO`: PRO 플랜 단가입니다. 프론트의 `VITE_PLAN_AMOUNT_*`와 일치해야 합니다.
- `PLAN_AMOUNT_PREMIUM`: PREMIUM 플랜 단가입니다. 프론트의 `VITE_PLAN_AMOUNT_*`와 일치해야 합니다.
- `INTERNAL_ALARM_SECRET`: 스마트 메시지 내부 호출 인증용 secret입니다.

## 복구 절차

1. 현재 작업 트리를 먼저 확인합니다.

   ```bash
   git status --short --branch
   ```

2. 레거시 상태를 별도 브랜치에서 확인합니다.

   ```bash
   git switch -c restore/toss-login-railway-bff legacy-toss-login-railway-bff-20260619
   ```

   또는 이미 만든 archive 브랜치를 직접 확인합니다.

   ```bash
   git switch archive/toss-login-railway-bff
   ```

3. 현재 브랜치에 필요한 파일만 되살릴 때는 새 복구 브랜치를 만든 뒤, 태그에서 핵심 파일을 선택적으로 가져옵니다.

   ```bash
   git restore --source=legacy-toss-login-railway-bff-20260619 -- \
     services/toss/tossAuth.ts \
     components/TossLoginView.tsx \
     components/auth/AuthModalCoordinator.tsx \
     server/src/routes/tossAuthRoute.ts \
     server/src/toss/AuthService.ts \
     server/src/routes/payment.ts \
     server/src/routes/tossSmartMessageRoute.ts \
     docs/RAILWAY_BFF_FAQ.md \
     docs/RAILWAY_BFF_TOSS_PROMPT.md
   ```

4. 서버 라우트 등록이 유지되는지 확인합니다. `server/src/index.ts`에서 `tossAuthRoutes`, `paymentRoutes`, `tossSmartMessageRoutes`가 등록되어야 합니다.

5. Railway 환경변수를 위 목록과 맞춥니다. mTLS 인증서와 private key는 저장소에 넣지 말고 Railway Variables 또는 Secrets로만 관리합니다.

6. 데이터베이스 의존성을 확인합니다. 최소한 `toss_accounts`, `user_profiles.toss_user_key`, `toss_auth_links.encrypted_refresh_token`이 현재 스키마와 호환되어야 합니다.

7. 검증을 실행합니다.

   ```bash
   npm run build
   npm test -- --run
   cd server && npm run build && npm test -- --run
   ```

   실제 명령은 당시 package script 상태에 맞춰 조정합니다.

8. 토스 미니앱에서 수동 검증합니다.

   - 토스 앱 환경에서 로그인 버튼을 누르면 `appLogin()`이 성공해야 합니다.
   - BFF 로그에서 `/auth/toss/exchange` 요청, `generate-token`, `login-me`, Supabase 세션 발급이 순서대로 확인되어야 합니다.
   - 동일 토스 계정 재로그인 시 `toss_accounts`, `user_profiles`, `toss_auth_links`가 중복 없이 유지되어야 합니다.
   - IAP 또는 스마트 메시지를 함께 되살릴 경우 `toss_user_key` 기반 후속 API가 정상 동작해야 합니다.

## 기존 문서

- `docs/RAILWAY_BFF_FAQ.md`: Railway root directory, 필수 환경변수, `server/` BFF 배포 기준을 설명합니다.
- `docs/RAILWAY_BFF_TOSS_PROMPT.md`: Railway BFF 구현 담당자에게 전달했던 토스 mTLS 로그인과 결제 검증 요구사항 원문입니다.

## 주의사항

- 레거시 코드를 현재 코드 안에 주석으로 붙여 넣지 않습니다. 복구는 Git 태그와 archive 브랜치에서 가져옵니다.
- 토스 공식 API 스펙, 인증서 요구사항, 약관 tag 이름은 시간이 지나면 바뀔 수 있습니다. 복구 전 공식 문서와 Toss 콘솔 설정을 다시 확인합니다.
- 인증서, private key, Supabase service role key, 결제 secret은 어떤 형태로도 저장소에 커밋하지 않습니다.
