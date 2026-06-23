# 텔레그램 알람 발송 조건 및 설정 가이드

프로필에 "텔레그램 연결됨"이 보이는데도 알람이 오지 않는 경우, 아래 조건과 **스케줄러(cron)** 설정을 확인하세요.

---

## 0. 환경 변수·시크릿 저장 위치 (TELEGRAM_BOT_TOKEN, VITE_TELEGRAM_BOT_USERNAME, INTERNAL_ALARM_SECRET)

| 변수명 | 어디에 저장? | 용도 |
|--------|----------------|------|
| **TELEGRAM_BOT_TOKEN** | **Supabase Dashboard** → Edge Functions → **send-alarm** · **telegram-webhook** → 각 함수의 **Secrets**에 동일 값으로 추가 | 봇이 텔레그램 API 호출 시 사용. **절대** 프론트엔드(브라우저)에 노출하면 안 됨. |
| **VITE_TELEGRAM_BOT_USERNAME** | **프론트엔드 배포 환경** (로컬: 프로젝트 `.env` / `.env.local`, 배포: Vercel·Netlify 등 호스팅의 **Environment Variables**) | 앱에서 "텔레그램 연결하기" 시 `t.me/봇유저명?start=토큰` 링크 생성용. 봇 유저명은 공개되어도 됨. |
| **INTERNAL_ALARM_SECRET** | **Supabase Dashboard** → Edge Functions → **check-and-trigger-alarms** · **send-alarm** → 각 함수의 **Secrets**에 **동일 값**으로 추가 | check-and-trigger-alarms가 send-alarm 호출 시 헤더로 전달, send-alarm이 검증. 두 함수에 **같은 값**이어야 함. |

- **Supabase 시크릿**: [Supabase Dashboard](https://app.supabase.com) → 프로젝트 → **Edge Functions** → 함수 선택 → **Secrets** (또는 Settings)에서 이름·값 입력.
- **프론트엔드 .env**: `VITE_` 접두사가 붙은 변수만 Vite가 클라이언트 번들에 포함하므로, `TELEGRAM_BOT_TOKEN`·`INTERNAL_ALARM_SECRET`은 **프론트엔드 .env에 넣지 말 것** (노출 위험). 로컬에서 Edge Function 테스트용으로만 쓰는 경우는 Supabase CLI / Dashboard에서 설정.

### 웹 배포 환경에서 VITE_TELEGRAM_BOT_USERNAME 설정 (.env 없을 때)

웹 서비스는 보통 **배포 플랫폼**에서 빌드하므로, **서버/호스팅 쪽 환경 변수**에 넣어야 합니다. `.env` 파일은 배포 환경에 없어도 됩니다.

1. **사용 중인 배포 서비스** 대시보드에 접속합니다.
2. 해당 **프로젝트(사이트)** → **Settings** → **Environment Variables** (또는 **Build & deploy** → **Environment**) 메뉴로 이동합니다.
3. **새 변수 추가**:
   - **Name**: `VITE_TELEGRAM_BOT_USERNAME`
   - **Value**: 봇 유저명 (예: `btd_alarm_bot`). @ 없이 입력.
4. **저장** 후 **한 번 다시 배포(Re-deploy / Rebuild)** 합니다.  
   Vite는 빌드 시점에 `VITE_` 변수를 코드에 박아 넣기 때문에, 변수를 추가·수정한 뒤에는 **반드시 재빌드**해야 사용자에게 반영됩니다.

| 배포 서비스 | 설정 위치 예시 |
|-------------|----------------|
| **Vercel** | Project → Settings → **Environment Variables** → Add (Production / Preview / Development 원하는 것에) |
| **Netlify** | Site → **Site configuration** → **Environment variables** → Add / Edit |
| **Cloudflare Pages** | Project → **Settings** → **Environment variables** |
| **GitHub Pages** (Actions로 빌드) | Repo → **Settings** → **Secrets and variables** → **Actions** → Variables에 추가 후, workflow에서 `env.VITE_TELEGRAM_BOT_USERNAME` 로 참조 |
| **기타** | 해당 서비스 문서에서 "Environment Variables" 또는 "Build env" 검색 후, 빌드가 실행되는 환경에 변수 추가 |

설정이 반영되면, 다른 사용자도 웹 서비스에서 "텔레그램 연결하기" 버튼을 누를 때 `t.me/봇유저명?start=토큰` 이 올바르게 열립니다.

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
    → telegram_enabled + telegram_chat_id 있으면 텔레그램 발송
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
| 5 | 프로필 텔레그램 연결 | `user_profiles.telegram_enabled = true`, `telegram_chat_id` 값 있음 |

- 프로필에 "텔레그램 연결됨"이 보이는 건 **5번**이 된 상태입니다.
- **토글 OFF 시**: 앱 프로필에서 "텔레그램 알림 사용" 토글을 끄면 `user_profiles.telegram_enabled`가 `false`로 저장됩니다. 크론이 깨우는 **check-and-trigger-alarms → send-alarm** 흐름에서 **반드시** 이 값을 읽어 발송 여부를 결정합니다(아래 "텔레그램 비활성화 시 크론 반영" 참고).
- **1번(cron)** 이 없으면, 2~5가 다 맞아도 알람이 한 번도 가지 않습니다.
- Free / Pro / Premium 모두 텔레그램 연결과 발송이 가능합니다.

---

## 3. 왜 “연결됨”인데 알람이 안 오나?

가능한 원인 두 가지가 가장 큽니다.

### (1) check-and-trigger-alarms를 호출하는 **cron이 없음**

- 이 함수는 **누군가 주기적으로 HTTP로 호출**해 줘야 합니다.
- Supabase 대시보드에서 **Integrations → Cron Jobs**로 Edge Function 호출을 스케줄하거나, **pg_cron + pg_net**으로 매 분(또는 5분)마다 `check-and-trigger-alarms` URL을 POST 하도록 설정해야 합니다.
- cron을 한 번도 설정하지 않았다면, **알람이 오지 않는 것이 정상**입니다.

### (2) 텔레그램 연결 또는 토글 상태가 DB에 반영되지 않음

- `send-alarm` 내부의 `shouldSendTelegram()`은 **티어와 무관하게** `telegram_enabled = true` 와 `telegram_chat_id` 존재 여부를 확인합니다.
- `telegram_enabled`가 `false`이거나 `telegram_chat_id`가 비어 있으면 Free / Pro / Premium 모두 텔레그램으로는 발송하지 않습니다.
- 앱에서 "연결됨"이 보이는데도 발송되지 않으면 DB에서 `telegram_enabled`, `telegram_chat_id`, `telegram_last_error`를 확인해 주세요.

---

## 4. 스케줄러(cron) 설정 방법 (10분 단위 권장)

`check-and-trigger-alarms`는 **과거 10분 구간**을 검사하고 **sent_alarms**로 중복 발송을 막으므로, **10분마다 실행**하는 크론이 권장됩니다.

**중요**: **Edge Function 배포(`supabase functions deploy`)는 크론 스케줄을 바꾸지 않습니다.** 크론이 **언제** 실행되는지는 Dashboard의 Cron Jobs 또는 pg_cron SQL에 **별도로** 저장됩니다. 1분마다 로그가 찍힌다면 현재 크론이 1분 주기로 설정된 것이므로, 10분으로 바꾸려면 **크론 설정을 직접 수정**해야 합니다.

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

**이미 1분마다 돌고 있는 크론을 10분으로 바꾸려면**: Dashboard → **Integrations** → **Cron Jobs** → 해당 Job 선택 → **Schedule**을 `*/10 * * * *`로 변경 후 저장. (SQL로 등록한 경우 아래 "방법 B"에서 기존 job을 `cron.unschedule` 한 뒤 10분 스케줄로 다시 등록.)

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

## 5. 텔레그램 비활성화(토글 OFF) 시 크론 반영

**질문**: 프로필에서 "텔레그램 알림 사용" 토글을 끄면, 크론이 깨우는 `check-and-trigger-alarms` / `send-alarm`에서도 발송이 차단되는가?

**답**: 예. 토글 OFF 시 `user_profiles.telegram_enabled`가 `false`로 저장되고, **매 발송 시점마다 DB에서 이 값을 다시 읽어** 발송 여부를 결정합니다.

| 단계 | 확인 내용 |
|------|-----------|
| **1. DB 반영** | 앱에서 토글 OFF → `user_profiles.telegram_enabled = false` 업데이트. |
| **2. get_alarm_payload** | `send-alarm`이 호출될 때 **RPC `get_alarm_payload(p_user_id)`**로 user_profiles를 조회. 이 RPC는 **`telegram_enabled` 컬럼을 포함**해 반환함 (`supabase/migrations/20250128005000_rpc_get_alarm_payload.sql`). |
| **3. send-alarm** | `shouldSendTelegram(profile)`에서 **`profile.telegram_enabled !== true`이면 `return false`** (`supabase/functions/send-alarm/index.ts`). `sendTelegram`이 false이면 텔레그램 발송 블록으로 진입하지 않음. |

**코드 확인 (send-alarm)**:

```ts
// send-alarm/index.ts – shouldSendTelegram()
if (profile.telegram_enabled !== true) return false;
```

**결론**: 토글 OFF 시 서버는 **매 요청마다 DB의 `telegram_enabled`**를 읽어, 비활성화된 사용자에 대해서는 텔레그램 발송을 건너뜁니다. 크론 관련 업무에 완벽하게 반영됩니다.

---

## 6. 안전장치 (10분 구간 + sent_alarms)

- **문제**: "정확히 현재 시각"만 보면, 크론 실행 시각과 서버 시각이 몇 초 어긋날 때 해당 분을 놓쳐 알람이 안 갈 수 있음.
- **대응**: `check-and-trigger-alarms`는 다음처럼 동작합니다.
  1. **과거 10분 구간**의 KST HH:mm 목록을 만듦 (예: 15:10 실행 시 `["15:00","15:01",...,"15:09"]`).
  2. 포트폴리오 중 `selectedHours`에 그 구간의 시간이 포함된 **(user_id, time_kst)** 후보를 수집.
  3. **sent_alarms** 테이블에서 **오늘 KST 기준** 이미 발송된 (user_id, time_kst)를 조회해 제외.
  4. 남은 (user_id, time_kst)만 `send-alarm`으로 호출.

- 따라서 **10분마다** 크론을 돌리면, "지금부터 과거 10분 사이에 보냈어야 하는 알람 중 아직 안 보낸 것"만 보내서 **놓침 없이**, **같은 시간에 두 번 보내지 않도록** 할 수 있습니다.

---

## 7. 점검 체크리스트

알람이 안 올 때 아래를 순서대로 확인하세요.

1. [ ] **Cron 등록 여부**: Dashboard 또는 SQL로 `check-and-trigger-alarms`가 **10분마다(`*/10 * * * *`)** 호출되도록 되어 있는가?
2. [ ] **포트폴리오 알람**: 해당 포트폴리오에 `alarm_config.enabled = true`, `selectedHours`에 원하는 KST 시간(예: `"15:00"`)이 들어 있는가?
3. [ ] **프로필**: `user_profiles.telegram_enabled = true`, `telegram_chat_id`가 비어 있지 않은가?
4. [ ] **요일**: 테스트 시 KST 기준 평일인가? (토·일은 의도적으로 스킵됨)
5. [ ] **시간**: 테스트 시각의 KST HH:mm이 `selectedHours`와 정확히 일치하는가?

---

### 401 Invalid JWT 해결 (send-alarm 배포·시크릿)

**증상**: Edge Function 로그에 `send-alarm failed for user ... 401 {"code":401,"message":"Invalid JWT"}` 가 반복해서 찍힘.

**원인**: 401의 `"Invalid JWT"` 메시지는 **Supabase Edge 게이트웨이**가 요청의 `Authorization: Bearer ...` JWT를 검증하다가 거절한 결과입니다. `send-alarm` 함수 코드가 반환하는 `"Invalid or missing X-Internal-Alarm-Secret"` 와는 다릅니다. 즉, **send-alarm이 기본(JWT 검증 ON)으로 배포되어 있어서** 게이트웨이에서 401이 나는 상황입니다.

**해결** (둘 다 적용해야 함):

1. **send-alarm을 JWT 검증 없이 배포**  
   - 터미널에서:
   ```bash
   supabase functions deploy send-alarm --no-verify-jwt
   ```
   - (npx 사용 시: `npx supabase functions deploy send-alarm --no-verify-jwt`)
   - 이렇게 하면 게이트웨이가 Bearer JWT를 검증하지 않고, 요청이 `send-alarm` 코드까지 들어갑니다.

2. **내부 인증용 시크릿 설정**  
   - `send-alarm`은 **내부 호출만 허용**하려면 `INTERNAL_ALARM_SECRET` 환경 변수를 설정하고, 요청 헤더 `X-Internal-Alarm-Secret` 값이 그 값과 일치할 때만 처리합니다.
   - Supabase Dashboard → **Edge Functions** → **send-alarm** → **Secrets** (또는 **Settings**) 에서:
     - `INTERNAL_ALARM_SECRET` = 원하는 긴 랜덤 문자열 (예: 비밀번호 생성기로 생성)
   - 같은 값을 **check-and-trigger-alarms** 함수의 Secrets에도 추가:
     - **Edge Functions** → **check-and-trigger-alarms** → **Secrets** → `INTERNAL_ALARM_SECRET` = **send-alarm과 동일한 값**
   - `check-and-trigger-alarms`는 `send-alarm` 호출 시 이 값을 `X-Internal-Alarm-Secret` 헤더에 넣어 보냅니다.

**정리**: `send-alarm`을 `--no-verify-jwt`로 배포하고, 두 함수 모두에 **같은 값**의 `INTERNAL_ALARM_SECRET`을 설정하면 401 Invalid JWT는 사라지고, 내부 시크릿으로만 인증됩니다.

---

### 401 "Invalid or missing X-Internal-Alarm-Secret" 해결

**증상**: 로그에 `send-alarm failed ... 401 {"error":"Unauthorized","code":401,"message":"Invalid or missing X-Internal-Alarm-Secret"}` 가 찍힘. (게이트웨이 "Invalid JWT"가 아님.)

**원인**: `send-alarm`에만 시크릿이 있거나, **check-and-trigger-alarms**에는 없어서 헤더를 안 보내거나, 두 함수에 넣은 **값이 다르거나** 공백/오타가 있는 경우.

**해결**:

1. **두 함수 모두에 같은 시크릿 추가**  
   - Dashboard → **Edge Functions** → **check-and-trigger-alarms** → **Secrets**  
     - 이름: `INTERNAL_ALARM_SECRET` (또는 `internal_alarm_secret` 둘 다 지원)  
     - 값: 예) `my-super-secret-alarm-key-12345` (복사해 두기)
   - **send-alarm** → **Secrets**  
     - **이름·값을 check-and-trigger-alarms와 완전히 동일하게** 입력 (앞뒤 공백 없이).
2. **값이 정말 같은지 확인**  
   - 한쪽만 수정했거나, 복사 시 공백이 들어가면 401이 납니다. 새로 생성한 랜덤 문자열을 두 함수에 똑같이 붙여넣는 것을 권장합니다.
3. **수정 후 재배포**  
   - 시크릿만 바꿔도 적용되지만, 코드를 수정했다면 `supabase functions deploy check-and-trigger-alarms` 와 `supabase functions deploy send-alarm --no-verify-jwt` 로 다시 배포하세요.

**정리**: check-and-trigger-alarms와 send-alarm **둘 다**에 **같은 이름·같은 값**의 시크릿이 있어야 합니다. 코드는 `INTERNAL_ALARM_SECRET` / `internal_alarm_secret` 둘 다 읽고, 비교 시 앞뒤 공백은 무시합니다.

---

### 주말·테스트용 1회 발송 (send-alarm 직접 호출)

**상황**: 주말에는 `check-and-trigger-alarms`가 **주말 스킵**이라 알람이 안 감. 알람 예시를 **1회만** 테스트하고 싶을 때.

**방법**: **send-alarm** Edge Function을 **직접 HTTP로 한 번 호출**하면 됩니다. 크론/주말 로직을 거치지 않습니다.

1. **필요한 값**
   - **Supabase 프로젝트 URL**  
     예: `https://abcdefgh.supabase.co` (Dashboard → Settings → API → Project URL)
   - **INTERNAL_ALARM_SECRET**  
     send-alarm에 설정한 시크릿 값 (Dashboard → Edge Functions → send-alarm → Secrets)
   - **테스트할 사용자 user_id**  
     Supabase Dashboard → Authentication → Users 에서 복사하거나, `user_profiles.id` (UUID)

2. **호출 예시 (PowerShell)**

   ```powershell
   $url = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-alarm"
   $secret = "YOUR_INTERNAL_ALARM_SECRET"
   $userId = "테스트할_사용자_UUID"

   $body = @{
     user_id = $userId
     title   = "BTD 매매 알람"
     body    = "설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요."
     data    = @{ type = "portfolio_alarm"; time_kst = "테스트" }
   } | ConvertTo-Json

   Invoke-RestMethod -Uri $url -Method Post -Headers @{
     "Content-Type"             = "application/json"
     "X-Internal-Alarm-Secret"   = $secret
   } -Body $body
   ```

   `YOUR_PROJECT_REF`, `YOUR_INTERNAL_ALARM_SECRET`, `테스트할_사용자_UUID`만 실제 값으로 바꾸면 됩니다.

3. **호출 예시 (curl)**

   ```bash
   curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-alarm" \
     -H "Content-Type: application/json" \
     -H "X-Internal-Alarm-Secret: YOUR_INTERNAL_ALARM_SECRET" \
     -d '{"user_id":"테스트할_사용자_UUID","title":"BTD 매매 알람","body":"설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.","data":{"type":"portfolio_alarm","time_kst":"테스트"}}'
   ```

4. **주의**
   - 해당 사용자는 **텔레그램 연결**(`telegram_chat_id` 있음)되어 있고 `telegram_enabled = true`여야 텔레그램으로 발송됩니다.
   - 1회 호출이므로 **sent_alarms**에는 기록되지 않습니다. 평일 크론 흐름과 동일한 메시지 형식으로만 테스트할 수 있습니다.

---

### Supabase에서 확인할 것 (알람이 안 올 때)

| 확인 항목 | Supabase에서 하는 방법 |
|-----------|-------------------------|
| **Cron 등록** | Dashboard → **Integrations** → **Cron Jobs** (또는 Database → Extensions에서 `pg_cron` 활성화 여부). `check-and-trigger-alarms`가 **10분마다** 호출되는지 확인. |
| **포트폴리오 alarm_config** | **Table Editor** → `portfolios` → 해당 행의 `alarm_config` 컬럼. `{"enabled": true, "selectedHours": ["14:30"]}` 처럼 **24시간 형식 HH:mm** (오후 2:30 → `"14:30"`)인지 확인. |
| **프로필 텔레그램** | **Table Editor** → `user_profiles` → 해당 사용자 행. `telegram_enabled = true`, `telegram_chat_id` 값 있음, `telegram_last_error` 확인. |
| **Edge Function 로그** | **Edge Functions** → `check-and-trigger-alarms` → **Logs**. 실행 시 "Current KST time:", "window" 로그로 KST 시간과 검사 구간이 맞는지 확인. |

---

### KST “현재 분” 누락 버그 (수정 반영됨)

**증상**: 오후 2:30처럼 **정각·30분**에 맞춘 알람이 그 시간에 오지 않음.

**원인**: `check-and-trigger-alarms`의 `getKSTTimeWindow()`가 **과거 10분 구간**을 만들 때 **현재 분을 제외**하고 있었음. 예: 크론이 14:30 KST에 실행되면 윈도우가 `["14:20",...,"14:29"]`만 포함해 `"14:30"`이 빠짐 → 14:30 알람이 그 회차에서 스킵되고, 다음 크론(14:40)에서야 14:30이 윈도우에 포함됨.

**수정**: `getKSTTimeWindow()`에서 **현재 분을 포함**하도록 루프를 `i >= 0`으로 변경. 이제 14:30 KST 실행 시 윈도우에 `"14:30"`이 포함되어 해당 분에 알람이 발송됨.

---

## 8. 이평선 구간매수 – 구간 판별 로직 (Daily Execution / 구간1·구간2)

### 8.1 구간이 어떻게 정해지는지

- **기준 주식(구간 0)**  
  전략에서 "구간 0: 이동평균선과의 위치를 정하는 주식"으로 선택한 종목(예: QQQ).  
  **모든 구간**에서 이 종목의 **종가**와 **이 종목의 이동평균선**만으로 구간 1~3을 판별합니다.

- **각 구간에서 선택한 주식(ma1/ma2/ma3)**  
  해당 구간일 때 **매수할 종목**일 뿐, 이평선 계산에는 사용하지 않습니다.

- **사용하는 데이터**  
  가격·이동평균 모두 **IndexedDB/Supabase의 최신 레코드(마지막 거래일)**를 사용합니다.  
  토요일·휴일이어도 **마지막 거래일 기준**으로 계산됩니다.

- **구간 정의 (예: 기준주식 QQQ, 이평선 20·60일)**  
  - **구간 1**: QQQ 종가가 **QQQ의** 20일 이평선 **위**에 있음  
  - **구간 2**: QQQ 종가가 **QQQ의** 20~60일 이평선 **사이**에 있음  
  - **구간 3**: QQQ 종가가 **QQQ의** 60일 이평선 **아래**에 있음  

### 8.2 Daily Execution(텔레그램)에서 이평선 구간매수

- 이평선 구간매수 포트폴리오는 텔레그램 Daily Execution 블록에  
  **포트폴리오명·전략명·알람 시간 + "오늘 주문 요약은 앱에서 확인해 주세요"**만 표시됩니다.  
- **구간 번호(구간1/구간2)**는 텔레그램 메시지에는 포함되지 않고,  
  **앱 내** 대시보드·퀵입력·거래 내역에서만 "구간 1", "구간 2" 등으로 표시됩니다.

---

## 9. 버튼/UI 정리

- **새 버튼을 만들 필요는 없습니다.**  
  - 텔레그램 연결: 프로필(모달) → **「텔레그램 연결하기」** 로 연결. Free / Pro / Premium 모두 같은 블록에서 연결할 수 있습니다.  
  - 알람 시간: 각 포트폴리오 카드 → **알람(벨) 아이콘** → 시간 선택 후 저장.
- 연결이 완료되면 같은 블록에 **「연결됨」** 이 표시됩니다.  
  이 상태에서도 알람이 안 온다면, 위 조건(특히 **cron**, **telegram_enabled**, **selectedHours 일치**)을 확인하면 됩니다.

---

## 10. Free 사용자 텔레그램 정책

현재는 Free / Pro / Premium 모두 텔레그램 연결과 수신이 가능합니다.

- 발송 자격은 `supabase/functions/_shared/telegramEligibility.ts`의 `shouldSendTelegram()`에서 관리합니다.
- 조건은 `telegram_enabled === true` 이고 `telegram_chat_id`가 비어 있지 않은 것입니다.
- Daily Execution 요약 생성도 `generate-daily-execution-summaries`에서 티어와 무관하게 텔레그램 연결 사용자를 대상으로 합니다.
