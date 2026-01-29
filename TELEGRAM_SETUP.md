# 텔레그램 알림 연동 설정 가이드

Pro / Premium 구독 사용자에게 텔레그램 메시지 알림을 보내기 위한 설정 단계입니다.

---

## 1. 사전 준비

- Supabase 프로젝트에서 **Edge Function Secrets**에 다음이 설정되어 있어야 합니다.
  - `SUPABASE_URL` (보통 자동 설정)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TELEGRAM_BOT_TOKEN` (Telegram [@BotFather](https://t.me/BotFather)에서 봇 생성 후 발급받은 토큰)

- **데이터베이스 마이그레이션**이 적용되어 있어야 합니다.
  - `supabase/migrations/20250128000000_telegram_link_tokens.sql` 실행
  - `user_profiles` 테이블에 `telegram_enabled`, `telegram_chat_id`, `telegram_connected_at`, `telegram_last_error` 컬럼 존재 (이전 단계에서 추가된 경우)

---

## 2. Webhook URL 등록

텔레그램이 봇으로 들어오는 메시지를 Supabase Edge Function으로 보내려면 **Webhook URL**을 한 번 등록해야 합니다.

### 2.1 Edge Function URL 확인

배포된 `telegram-webhook` 함수의 URL은 다음 형태입니다:

```
https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook
```

`<PROJECT_REF>`는 Supabase 대시보드 **Project Settings → General → Reference ID**에서 확인할 수 있습니다.

### 2.2 Telegram에 Webhook 설정

아래 URL을 **본인 봇 토큰**으로 치환한 뒤, 브라우저에서 **한 번만** 열어주세요.

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook
```

예시:
- 토큰이 `123456:ABC-DEF...` 이고
- 프로젝트 ref가 `abcdefghij` 이면

```
https://api.telegram.org/bot123456:ABC-DEF.../setWebhook?url=https://abcdefghij.supabase.co/functions/v1/telegram-webhook
```

응답에 `"ok":true` 가 오면 Webhook 등록이 완료된 것입니다.

### 2.3 Webhook 해제 (필요 시)

다른 서버로 바꾸거나 Webhook을 끄려면:

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook
```

---

## 3. 사용자 연동 흐름

1. **웹 앱**: Pro/Premium 사용자가 프로필 모달에서 "텔레그램 연결하기" 클릭
2. **앱**: `telegram_link_tokens` 테이블에 일회성 토큰 삽입 후, 봇 링크(예: `https://t.me/YourBotName?start=<token>`) 안내
3. **사용자**: 링크 클릭 또는 텔레그램에서 봇에게 `/start <token>` 전송
4. **Telegram**: Supabase `telegram-webhook` 으로 업데이트 전달
5. **Edge Function**: 토큰으로 `user_id` 조회 → `user_profiles`에 `telegram_chat_id`, `telegram_enabled` 등 업데이트 → 토큰 삭제 → 봇으로 "연결 완료" 메시지 전송

---

## 4. 프론트엔드 환경 변수 (선택)

봇 사용자 이름(예: `YourBotName`)을 링크에 쓰려면:

- `.env`에 `VITE_TELEGRAM_BOT_USERNAME=YourBotName` 설정
- 없으면 "텔레그램에서 봇에게 /start \<토큰\> 을 보내주세요" 문구만 표시할 수 있음
