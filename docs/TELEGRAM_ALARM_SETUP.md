# 텔레그램 알람 발송 조건 및 설정 가이드

프로필에 "텔레그램 연결됨"이 보이는데도 알람이 오지 않는 경우, 아래 조건과 **스케줄러(cron)** 설정을 확인하세요.

---

## 1. 발송 흐름 요약

```
[사용자] 텔레그램 연결 (/start {token})
    → telegram-webhook: user_profiles에 telegram_enabled=true, telegram_chat_id 저장

[사용자] 포트폴리오에서 알람 시간 설정 (alarm_config.enabled, selectedHours)
    → 앱에서 portfolios.alarm_config 저장

[10분마다 권장] **스케줄러가 check-and-trigger-alarms 호출**  ← 이 단계가 없으면 알람 없음
    → **과거 10분 구간**의 KST HH:mm 목록 생성 (예: 15:10 실행 시 15:00~15:09)
    → selectedHours가 그 구간에 포함된 (user_id, time_kst) 후보 수집
    → **sent_alarms**에서 오늘 이미 발송된 (user_id, time_kst) 조회 → 중복 제외
    → 아직 안 보낸 (user_id, time_kst)만 send-alarm 호출

[send-alarm]
    → user_profiles 조회 (get_alarm_payload RPC)
    → **Pro/Premium** + telegram_enabled + telegram_chat_id 있으면 텔레그램 발송
    → FCM(푸시)은 별도 조건
```

---

## 2. 텔레그램 알람이 오기 위한 조건 (전부 만족해야 함)

| # | 조건 | 확인 방법 |
|---|------|-----------|
| 1 | **스케줄러(cron) 설정** | `check-and-trigger-alarms` Edge Function이 **주기적으로** 호출되어야 함. **10분마다(`*/10 * * * *`) 권장.** 미설정 시 알람이 한 번도 가지 않습니다. |
| 2 | 포트폴리오 알람 설정 | `portfolios.alarm_config.enabled = true`, `alarm_config.selectedHours`에 **KST 기준 HH:mm** (예: `["15:00"]`) 포함 |
| 3 | 알람 시간·중복 방지 | 함수가 **과거 10분 구간**의 HH:mm을 검사하고, **sent_alarms**로 오늘 이미 보낸 (user, time_kst)는 제외. 크론이 몇 초 어긋나도 같은 10분 안에 다시 돌면 알람을 놓치지 않음. |
| 4 | 평일만 발송 | `check-and-trigger-alarms`는 **KST 기준 토·일요일에는 호출돼도 발송 스킵** |
| 5 | **유료 구독(Pro/Premium)** | `user_profiles.subscription_tier`가 `pro` 또는 `premium` 이어야 텔레그램 발송. **free 티어는 텔레그램 미발송** (코드: `send-alarm` → `shouldSendTelegram`) |
| 6 | 프로필 텔레그램 연결 | `user_profiles.telegram_enabled = true`, `telegram_chat_id` 값 있음 |

- 프로필에 "텔레그램 연결됨"이 보이는 건 **6번**이 된 상태입니다.
- **1번(cron)** 이 없으면, 2~6이 다 맞아도 알람이 한 번도 가지 않습니다.
- **5번**: free 사용자는 앱에서 텔레그램 블록 자체가 안 보이므로, "연결됨"이 보인다면 현재는 Pro/Premium으로 간주됩니다.

---

## 3. 왜 “연결됨”인데 알람이 안 오나?

가능한 원인 두 가지가 가장 큽니다.

### (1) check-and-trigger-alarms를 호출하는 **cron이 없음**

- 이 함수는 **누군가 주기적으로 HTTP로 호출**해 줘야 합니다.
- Supabase 대시보드에서 **Integrations → Cron Jobs**로 Edge Function 호출을 스케줄하거나, **pg_cron + pg_net**으로 매 분(또는 5분)마다 `check-and-trigger-alarms` URL을 POST 하도록 설정해야 합니다.
- cron을 한 번도 설정하지 않았다면, **알람이 오지 않는 것이 정상**입니다.

### (2) 텔레그램은 Pro/Premium만 발송

- `send-alarm` 내부에서 `shouldSendTelegram()`이 **subscription_tier === 'pro' | 'premium'** 일 때만 텔레그램 발송을 허용합니다.
- `user_profiles.subscription_tier`가 `free`이면, `telegram_enabled`/`telegram_chat_id`가 있어도 **텔레그램으로는 발송하지 않습니다.**
- 앱 프로필 화면에서 텔레그램 블록(연결하기/연결됨)은 **Pro/Premium일 때만** 노출되므로, "연결됨"이 보인다면 보통은 Pro/Premium입니다. DB에서 한 번만 확인해 보면 됩니다.

---

## 4. 스케줄러(cron) 설정 방법 (10분 단위 권장)

`check-and-trigger-alarms`는 **과거 10분 구간**을 검사하고 **sent_alarms**로 중복 발송을 막으므로, **10분마다 실행**하는 크론이 권장됩니다.

- **이유**: "지금 이 분"만 보면 크론 실행 시각과 서버 시각이 몇 초 어긋날 때 알람을 놓칠 수 있음. **"지금부터 과거 10분 사이에 보냈어야 하는 알람 중 아직 안 보낸 것"**을 찾는 방식이라 10분 단위 크론이 가장 안전합니다.
- **Schedule**: `*/10 * * * *` (매시 :00, :10, :20, :30, :40, :50)

### 방법 A: Supabase Dashboard (권장)

1. [Supabase Dashboard](https://app.supabase.com) → 프로젝트 선택
2. **Integrations** → **Cron Jobs** (또는 Database → Extensions에서 `pg_cron`, `pg_net` 활성화 후)
3. 새 Cron Job 추가
   - **Schedule**: `*/10 * * * *` (10분마다)
   - **Type**: Supabase Edge Function
   - **Function**: `check-and-trigger-alarms`
   - Body는 비워두거나 `{}` (이 함수는 body를 사용하지 않음)

Dashboard에 Cron이 없다면, 아래 SQL 방식으로 등록합니다.

### 방법 B: pg_cron + pg_net (SQL)

1. Supabase Dashboard → **SQL Editor**
2. Extension 활성화:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

3. 10분마다 `check-and-trigger-alarms` 호출 (실제 URL·키는 프로젝트에 맞게 수정):

```sql
select cron.schedule(
  'trigger-btd-alarms-every-10-min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-and-trigger-alarms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}',
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
```

- `YOUR_PROJECT_REF`: Supabase 프로젝트 URL의 ref
- `YOUR_SERVICE_ROLE_KEY`: 서비스 롤 키 (Dashboard → Settings → API)
- **보안**: 가능하면 Supabase Vault에 저장 후 `vault.get_secret()` 등으로 참조하는 방식 권장

---

## 5. 안전장치 (10분 구간 + sent_alarms)

- **문제**: "정확히 현재 시각"만 보면, 크론 실행 시각과 서버 시각이 몇 초 어긋날 때 해당 분을 놓쳐 알람이 안 갈 수 있음.
- **대응**: `check-and-trigger-alarms`는 다음처럼 동작합니다.
  1. **과거 10분 구간**의 KST HH:mm 목록을 만듦 (예: 15:10 실행 시 `["15:00","15:01",...,"15:09"]`).
  2. 포트폴리오 중 `selectedHours`에 그 구간의 시간이 포함된 **(user_id, time_kst)** 후보를 수집.
  3. **sent_alarms** 테이블에서 **오늘 KST 기준** 이미 발송된 (user_id, time_kst)를 조회해 제외.
  4. 남은 (user_id, time_kst)만 `send-alarm`으로 호출.

- 따라서 **10분마다** 크론을 돌리면, "지금부터 과거 10분 사이에 보냈어야 하는 알람 중 아직 안 보낸 것"만 보내서 **놓침 없이**, **같은 시간에 두 번 보내지 않도록** 할 수 있습니다.

---

## 6. 점검 체크리스트

알람이 안 올 때 아래를 순서대로 확인하세요.

1. [ ] **Cron 등록 여부**: Dashboard 또는 SQL로 `check-and-trigger-alarms`가 **10분마다(`*/10 * * * *`)** 호출되도록 되어 있는가?
2. [ ] **포트폴리오 알람**: 해당 포트폴리오에 `alarm_config.enabled = true`, `selectedHours`에 원하는 KST 시간(예: `"15:00"`)이 들어 있는가?
3. [ ] **프로필**: `user_profiles.telegram_enabled = true`, `telegram_chat_id`가 비어 있지 않은가?
4. [ ] **구독**: 텔레그램 수신을 원하면 `user_profiles.subscription_tier`가 `pro` 또는 `premium`인가?
5. [ ] **요일**: 테스트 시 KST 기준 평일인가? (토·일은 의도적으로 스킵됨)
6. [ ] **시간**: 테스트 시각의 KST HH:mm이 `selectedHours`와 정확히 일치하는가?

---

## 7. 버튼/UI 정리

- **새 버튼을 만들 필요는 없습니다.**  
  - 텔레그램 연결: 프로필(모달) → Pro/Premium일 때만 보이는 **「텔레그램 연결하기」** 로 연결.  
  - 알람 시간: 각 포트폴리오 카드 → **알람(벨) 아이콘** → 시간 선택 후 저장.
- 연결이 완료되면 같은 블록에 **「연결됨」** 이 표시됩니다.  
  이 상태에서도 알람이 안 온다면, 위 조건(특히 **cron**과 **Pro/Premium**, **selectedHours 일치**)을 확인하면 됩니다.

---

## 8. Free 사용자도 텔레그램 수신하게 하려면

현재는 `send-alarm` → `shouldSendTelegram()`에서 **Pro/Premium만** 텔레그램 발송을 허용합니다.  
Free에서도 텔레그램 발송을 허용하려면:

- `supabase/functions/send-alarm/index.ts` 의 `shouldSendTelegram()` 안에서  
  `subscription_tier`가 `pro`/`premium`이어야 한다는 조건을 제거하거나,  
  `telegram_enabled === true && telegram_chat_id` 있으면 발송하도록 조건을 완화하면 됩니다.  
  (이때 앱에서 Free 사용자에게도 텔레그램 블록을 보이려면 `AuthModals.tsx`의 `currentTier === 'pro' || currentTier === 'premium'` 체크를 수정해야 합니다.)
