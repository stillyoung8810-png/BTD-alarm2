# 텔레그램 알람 중단 원인 리뷰 (2025-02-20)

## 역할·목표
- 시니어 리뷰어 관점에서 **텔레그램 알람이 갑자기 멈춘 원인**을 최적화 작업(2.12 최적화1-1~1-5)과 연계해 철저히 확인.
- 문제가 있을 경우 **어디에, 어떤 문제가, 왜** 생겼는지 리스트업.

---

## 1. 결론 요약

| 구분 | 내용 |
|------|------|
| **유력 원인** | **send-alarm** Edge Function에서 `FIREBASE_SERVICE_ACCOUNT`가 없으면 **요청 초기에 500 반환**하여, 텔레그램 발송 로직까지 **도달하지 못함**. |
| **최적화 커밋과의 관계** | **무관**. 최적화는 `App.tsx` 등 **프론트엔드만** 변경했고, `supabase/functions`, `supabase/migrations`는 변경 없음. |
| **수정 사항** | `FIREBASE_SERVICE_ACCOUNT` 없을 때는 **500 반환 대신 FCM만 스킵**하고, **텔레그램 발송은 그대로 진행**하도록 수정함. |

---

## 2. 문제 리스트 (원인별)

### 2.1 [치명] send-alarm: FIREBASE 없으면 전체 요청 500 → 텔레그램 미발송

| 항목 | 내용 |
|------|------|
| **어디** | `supabase/functions/send-alarm/index.ts` (기존 293~299행 부근) |
| **무슨 문제** | `FIREBASE_SERVICE_ACCOUNT` 환경 변수가 없으면 **즉시 500 응답**을 반환. 그 뒤의 RPC 조회·텔레그램 발송 코드는 **실행되지 않음**. |
| **왜** | FCM과 텔레그램을 **같은 요청 흐름**에서 처리하면서, FCM에 필요한 Firebase 설정을 **전체 요청의 전제조건**으로 두었기 때문. Firebase 시크릿이 삭제/이름 변경/배포 누락 등으로 비어 있으면 **텔레그램만 쓰는 사용자도 알람을 받지 못함**. |
| **수정** | (1) `FIREBASE_SERVICE_ACCOUNT` 없을 때는 500 대신 **경고 로그만 남기고 진행**. (2) FCM 발송은 **해당 변수와 토큰이 있을 때만** 수행하고, 텔레그램 발송은 **항상** `shouldSendTelegram` 조건 만족 시 수행. |

---

### 2.2 [참고] 최적화 커밋은 텔레그램 알람 로직과 무관

| 항목 | 내용 |
|------|------|
| **어디** | 커밋 `b765239`(최적화1-1) ~ `61ad5fe`(최적화1-5) |
| **무슨 변경** | `App.tsx` 리팩터(프로필/포트폴리오/FCM 등), `docs/APP_REFACTOR_PLAN_*.md` 추가. **Edge Function·RPC·DB 마이그레이션·시크릿** 변경 없음. |
| **왜 알람과 무관인지** | 텔레그램 알람은 **check-and-trigger-alarms → send-alarm** 서버 흐름과 **get_alarm_payload** RPC, DB의 `user_profiles`(telegram_enabled, telegram_chat_id 등)에 의존. 이 경로는 최적화에서 전혀 건드리지 않음. |

---

### 2.3 [참고] 프로필 모달 캐시와 UI

| 항목 | 내용 |
|------|------|
| **어디** | `App.tsx` 프로필 모달 열릴 때 `userProfile != null`이면 `fetchUserProfile` 생략 |
| **무슨 동작** | 로그인 직후 등 **캐시된 프로필이 있을 때** DB의 `telegram_enabled` 변경이 UI에 바로 반영되지 않을 수 있음. |
| **알람 발송과의 관계** | **없음**. 알람 발송은 **send-alarm**이 RPC로 DB를 직접 읽어 수행하므로, 프론트 캐시와 무관. |

---

## 3. 수정된 코드 요약 (send-alarm)

1. **환경 변수 검사**
   - `FIREBASE_SERVICE_ACCOUNT` 없음 → **500 반환 제거** → `console.warn` 후 진행.

2. **FCM 블록**
   - `firebaseServiceAccount`와 `tokens.length > 0`일 때만 FCM 발송 시도.
   - 그 안에서만 `getGoogleAccessToken`, `sendFCMNotification`, 토큰 비활성화, `fcmResults` 집계 수행.
   - `fcmResults`를 바깥 스코프에 두어 `last_notification_sent_at` 업데이트에 사용.

3. **텔레그램**
   - 기존과 동일하게 **항상** `sendTelegram && telegramBotToken && profileRow?.telegram_chat_id`이면 발송.

4. **응답**
   - `success: successful > 0 || telegramSent` 유지 → FCM만 실패해도 텔레그램 성공 시 success true.

---

## 4. 배포·운영 권장 사항

- **send-alarm** 재배포:  
  `supabase functions deploy send-alarm --no-verify-jwt`
- Supabase Dashboard에서 **send-alarm** Secrets 확인:
  - `TELEGRAM_BOT_TOKEN`: 텔레그램 발송에 필수.
  - `INTERNAL_ALARM_SECRET`: check-and-trigger-alarms와 동일 값.
  - `FIREBASE_SERVICE_ACCOUNT`: FCM 사용 시 필수. **없어도 텔레그램은 동작**하도록 수정됨.
- 알람이 다시 안 오면 **Edge Function 로그**에서 다음 확인:
  - `get_alarm_payload` 에러
  - `TELEGRAM_BOT_TOKEN not set`
  - `shouldSendTelegram` 조건(구독 티어, telegram_enabled, telegram_chat_id)

---

## 5. 참고 문서

- `docs/TELEGRAM_ALARM_SETUP.md` — 텔레그램 알람 설정·시크릿·401 대응
- `docs/SUPABASE_CALLS_SUMMARY.md` — get_alarm_payload / send-alarm 호출 흐름
