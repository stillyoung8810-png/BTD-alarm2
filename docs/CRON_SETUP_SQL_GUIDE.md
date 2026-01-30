# 크론 설정 방법 B: SQL로 10분마다 알람 트리거 등록

Supabase Dashboard에서 **SQL만 실행**해서 10분마다 `check-and-trigger-alarms`를 호출하는 방법입니다.

---

## 1. 필요한 값 미리 준비

SQL을 실행하기 전에 아래 두 값을 구해 둡니다.

### 1-1. YOUR_PROJECT_REF (프로젝트 참조 ID)

1. [Supabase Dashboard](https://app.supabase.com) 접속 후 **해당 프로젝트** 선택.
2. 왼쪽 아래 **Settings**(톱니바퀴) 클릭.
3. **General** 메뉴로 이동.
4. **Reference ID** 항목을 복사합니다.  
   - 예: `abcdefghijklmnop` (영문 소문자/숫자 조합, 길이 20자 내외).

또는 **프로젝트 URL**에서 추출할 수 있습니다.

- 상단 URL이 `https://app.supabase.com/project/abcdefghijklmnop` 형태라면  
  **`abcdefghijklmnop`** 부분이 Reference ID입니다.

### 1-2. YOUR_SERVICE_ROLE_KEY (서비스 롤 키)

1. 같은 프로젝트에서 **Settings** → **API** 메뉴로 이동.
2. **Project API keys** 섹션에서:
   - **anon** (public) 키가 아닌  
   - **service_role** (비공개) 키를 찾습니다.
3. **Reveal** 클릭 후 키 전체를 복사합니다.  
   - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` 형태의 긴 문자열입니다.

⚠️ **주의**: `service_role` 키는 **DB·API 전체 권한**이 있으므로 외부에 노출하지 마세요. SQL/문서에 붙여넣을 때만 사용하고, 공유·커밋하지 않습니다.

---

## 2. 확장(Extension) 활성화 (1회만)

1. Supabase Dashboard → **SQL Editor** 클릭.
2. **New query** 로 새 쿼리 창을 엽니다.
3. 아래 SQL을 **그대로** 붙여넣고 **Run** 실행합니다.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

4. 성공 시 `Success. No rows returned` 또는 비슷한 메시지가 나옵니다.  
   - 이미 설치돼 있으면 에러 없이 넘어갑니다.

---

## 3. 크론 job 등록 (10분마다 실행)

1. 같은 **SQL Editor**에서 **New query** 로 또 다른 쿼리 창을 엽니다.
2. 아래 SQL을 **전체** 복사한 뒤, **두 군데만** 본인 값으로 바꿉니다.
   - `YOUR_PROJECT_REF` → 1-1에서 복사한 **Reference ID**
   - `YOUR_SERVICE_ROLE_KEY` → 1-2에서 복사한 **service_role** 키 (따옴표 안에 통째로)

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

**예시** (실제로는 본인 프로젝트 ref·키로 바꿔야 함):

- `url := 'https://abcdefghijklmnop.supabase.co/functions/v1/check-and-trigger-alarms'`
- `'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...'`

3. **Run** 실행합니다.
4. 성공 시 `cron.schedule` 의 반환값으로 **job id**(숫자)가 한 줄 나옵니다.  
   - 예: `1` → 정상 등록된 것입니다.

---

## 4. 등록 확인

등록된 크론 job을 확인하려면 SQL Editor에서 아래를 실행합니다.

```sql
select jobid, schedule, command, jobname
from cron.job
where jobname = 'trigger-btd-alarms-every-10-min';
```

- `schedule` 이 `*/10 * * * *` 이고  
- `command` 에 `check-and-trigger-alarms` URL이 보이면  
  설정이 올바르게 된 것입니다.

---

## 5. 삭제/재등록이 필요할 때

### job 삭제

다른 이름으로 다시 등록하거나, 실수로 두 번 등록했을 때 기존 job을 지우려면:

```sql
select cron.unschedule('trigger-btd-alarms-every-10-min');
```

### 다시 등록

- 먼저 위 **삭제** SQL 실행 후,  
- **3. 크론 job 등록** 의 SQL을 다시 실행하면 됩니다.

---

## 6. 요약 체크리스트

- [ ] **Reference ID** 복사 (Settings → General 또는 URL에서)
- [ ] **service_role** 키 복사 (Settings → API → service_role → Reveal)
- [ ] SQL Editor에서 `create extension if not exists pg_cron;` + `pg_net` 실행
- [ ] `cron.schedule(...)` SQL에서 `YOUR_PROJECT_REF`, `YOUR_SERVICE_ROLE_KEY` 만 교체 후 실행
- [ ] `cron.job` 조회로 `*/10 * * * *` 와 `check-and-trigger-alarms` URL 확인

이후에는 **매 10분(:00, :10, :20, :30, :40, :50)** 마다 `check-and-trigger-alarms`가 자동으로 호출됩니다.
