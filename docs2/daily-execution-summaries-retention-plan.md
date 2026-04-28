# daily_execution_summaries 보관 정책 시뮬레이션 계획

> 목적: `daily_execution_summaries`를 영구 이력 테이블이 아니라 **알람 본문용 일일 캐시**로 다루고, 구현 전에 SQL 시뮬레이션으로 삭제 조건을 검증합니다.
>
> 구현 진입 조건: 본 문서의 시뮬레이션 SQL이 통과한 뒤에만 Supabase migration 작성에 들어갑니다.

---

## 1. 현재 시스템 검토

### 1.1 테이블 의미

`daily_execution_summaries`는 사용자별/날짜별 DAILY EXECUTION 텍스트 캐시입니다.

- 스키마 키: `user_id + summary_date`
- 유일 인덱스: `idx_daily_execution_summaries_user_date`
- 포트폴리오별 행이 아니라, **사용자 1명 + KST 날짜 1개당 최대 1행**입니다.
- `summary_text` 안에 해당 사용자의 여러 포트폴리오 요약이 합쳐져 들어갑니다.

### 1.2 쓰기 경로

현재 쓰기 경로는 모두 `upsert`입니다.

- `App.tsx`
  - `summaryToSave`를 만든 뒤 3초 디바운스로 `daily_execution_summaries`에 upsert합니다.
  - conflict key는 `user_id,summary_date`입니다.
- `supabase/functions/generate-daily-execution-summaries/index.ts`
  - 텔레그램 연결된 유료 사용자 대상으로 당일 KST `summary_date` 행을 upsert합니다.

즉, 기존 시스템에는 오래된 행을 정리하는 경로가 없습니다.

### 1.3 읽기 경로

알람 발송용 RPC는 KST 기준 **오늘 날짜**만 조회합니다.

```sql
SELECT summary_text INTO v_summary_text
FROM daily_execution_summaries
WHERE user_id = p_user_id AND summary_date = v_kst_date
LIMIT 1;
```

따라서 과거 여러 달의 `summary_text`는 현재 알람 발송 경로에서 사용되지 않습니다.

### 1.4 기존 정리 패턴

Supabase 마이그레이션에는 이미 다음 패턴이 있습니다.

- `cleanup_old_sent_alarms()`: 오래된 알람 이력 삭제
- `cleanup_expired_telegram_link_tokens()`: 오래된 텔레그램 토큰 삭제
- `cleanup_old_inactive_user_devices()`: 오래된 비활성 FCM 토큰 삭제

공통 구조는 다음과 같습니다.

- `CREATE OR REPLACE FUNCTION public.cleanup_*()`
- `RETURNS bigint`
- `SECURITY DEFINER`
- `SET search_path = public`
- `DELETE ... WHERE ...`
- `GET DIAGNOSTICS deleted_count = ROW_COUNT`
- `SECURITY DEFINER` 함수의 `PUBLIC`/`anon`/`authenticated` 실행 권한 차단
- 선택적으로 `pg_cron` 등록

이번 작업도 같은 구조를 따르는 것이 가장 작고 일관적입니다.

---

## 2. 보관 정책 결정

### 2.1 권장 정책

**KST 기준 오늘 + 어제만 보관합니다.**

삭제 조건:

```sql
summary_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 1)
```

의미:

- 오늘: 실제 알람 발송에 사용
- 어제: KST/UTC 경계, 지연 실행, 장애 확인용 완충
- 그 이전: 현재 제품 기능 기준 불필요한 캐시

### 2.2 최근 2개 날짜 방식은 제외

사용자별 최근 2개 날짜를 남기는 방식은 이번 목적에 맞지 않습니다.

| 방식 | 장점 | 문제 |
| --- | --- | --- |
| 오늘+어제 | 의미가 명확하고 SQL이 단순합니다. 오래 접속하지 않은 사용자의 오래된 캐시도 정리됩니다. | 하루 단위 캐시라는 현재 모델에 의존합니다. |
| 사용자별 최근 2개 날짜 | 사용자별 보관 개수를 일정하게 유지합니다. | 3개월 전 2개 행도 계속 남을 수 있습니다. `row_number() over (partition by user_id ...)`가 필요해 복잡합니다. |

이번 테이블은 이력 저장소가 아니라 일일 캐시이므로 **시간 기준 TTL**이 더 논리적입니다.

### 2.3 출시 직전 안정성 원칙

출시 직전에는 삭제 자동화를 한 번에 켜지 않습니다. 다음 순서를 고정합니다.

1. 실제 테이블 preview 쿼리로 삭제 대상 수와 날짜를 확인합니다.
2. 임시 테이블 시뮬레이션이 `PASS`인지 확인합니다.
3. cleanup 함수 생성과 권한 차단을 하나의 트랜잭션으로 실행합니다.
4. 운영자가 수동으로 `SELECT public.cleanup_old_daily_execution_summaries();`를 1회 실행하고 반환된 삭제 수를 확인합니다.
5. cron 등록 role이 cleanup 함수를 실행할 수 있는지 확인합니다.
6. 수동 실행 결과와 role 권한 확인이 모두 통과할 때만 `pg_cron`을 등록합니다.
7. cron 등록 후 `cron.job`과 `cron.job_run_details`에서 실제 실행 권한과 성공 여부를 확인합니다.

---

## 3. 구현 후보 스니펫

> 이 섹션은 구현 후보입니다. 실제 migration은 시뮬레이션 통과 후 별도 작업에서 추가합니다.

### 3.1 SQL Editor 수동 실행용 정리 함수 후보

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_old_daily_execution_summaries()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retained_past_days constant integer := 1;
  cutoff_date date;
  deleted_count bigint;
BEGIN
  cutoff_date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - retained_past_days);

  DELETE FROM public.daily_execution_summaries
  WHERE summary_date < cutoff_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_daily_execution_summaries() TO service_role;

COMMENT ON FUNCTION public.cleanup_old_daily_execution_summaries() IS
  'daily_execution_summaries: KST 기준 오늘과 어제만 남기고 오래된 알람 본문 캐시를 삭제.';

COMMIT;
```

Supabase migration runner가 트랜잭션을 별도로 관리하는 환경이라면 `BEGIN;`/`COMMIT;`만 제외하고, 함수 생성부터 권한 차단까지는 같은 migration에서 연속 실행합니다.

### 3.2 migration 파일용 정리 함수 후보

실제 migration 파일에는 아래처럼 `BEGIN;`/`COMMIT;`를 제외한 버전을 권장합니다. Supabase CLI/migration runner가 파일 단위 트랜잭션을 관리할 수 있으므로, 중첩 트랜잭션으로 적용 실패가 나는 위험을 피합니다.

```sql
CREATE OR REPLACE FUNCTION public.cleanup_old_daily_execution_summaries()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retained_past_days constant integer := 1;
  cutoff_date date;
  deleted_count bigint;
BEGIN
  cutoff_date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - retained_past_days);

  DELETE FROM public.daily_execution_summaries
  WHERE summary_date < cutoff_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_daily_execution_summaries() TO service_role;

COMMENT ON FUNCTION public.cleanup_old_daily_execution_summaries() IS
  'daily_execution_summaries: KST 기준 오늘과 어제만 남기고 오래된 알람 본문 캐시를 삭제.';
```

### 3.3 스케줄 후보

`pg_cron`은 UTC 기준입니다. KST 04:00은 UTC 19:00입니다. 아래 스케줄은 preview와 수동 1회 cleanup 결과가 예상과 일치한 뒤에만 등록합니다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('cleanup-old-daily-execution-summaries')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'cleanup-old-daily-execution-summaries'
);

SELECT cron.schedule(
  'cleanup-old-daily-execution-summaries',
  '0 19 * * *',
  $$SELECT public.cleanup_old_daily_execution_summaries();$$
);
```

cron 등록 직후에는 job이 등록되었는지 확인합니다.

```sql
SELECT
  jobid,
  jobname,
  active,
  schedule,
  command
FROM cron.job
WHERE jobname = 'cleanup-old-daily-execution-summaries';
```

스케줄 시간을 KST 새벽 4시로 둔 이유:

- 날짜 경계 직후 실행보다 안전합니다.
- 시장 시간/알람 집중 시간과 떨어져 있습니다.
- 오늘 행이 아직 생성되지 않았더라도 삭제 조건상 어제 행은 보존됩니다.
- cron은 등록한 DB role로 실행될 수 있으므로, 첫 실행 후 권한 실패가 없는지 반드시 확인합니다.

---

## 4. 구현 전 시뮬레이션

### 4.1 실제 테이블 삭제 대상 확인

이 쿼리는 실제 데이터를 삭제하지 않습니다. 삭제 대상이 0건이어도 기준일과 삭제 예정 수를 반드시 1행으로 보여줍니다.

```sql
WITH retention_policy AS (
  SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date AS current_kst_date,
    1::integer AS retained_past_days
)
SELECT
  retention_policy.current_kst_date,
  (retention_policy.current_kst_date - retention_policy.retained_past_days) AS cutoff_date,
  count(summary.id) AS rows_to_delete,
  min(summary.summary_date) AS oldest_delete_date,
  max(summary.summary_date) AS newest_delete_date
FROM retention_policy
LEFT JOIN public.daily_execution_summaries AS summary
  ON summary.summary_date < (
    retention_policy.current_kst_date - retention_policy.retained_past_days
  )
GROUP BY
  retention_policy.current_kst_date,
  retention_policy.retained_past_days;
```

통과 기준:

- 결과가 항상 1행이어야 합니다.
- `cutoff_date`는 KST 기준 어제 날짜여야 합니다.
- `rows_to_delete`가 0이면 `oldest_delete_date`와 `newest_delete_date`는 `null`이어야 합니다.
- `rows_to_delete`가 1 이상이면 `newest_delete_date`가 KST 기준 그제 이하이어야 합니다.

출시 직전 운영 기준:

- `rows_to_delete`가 예상보다 크면 즉시 cleanup/cron 등록을 하지 않습니다.
- 대량 삭제가 의심되면 출시 이후 저부하 시간에 별도 batching 또는 인덱스 검토와 함께 진행합니다.
- 이 작업은 알람 필수 기능이 아니라 캐시 정리이므로, 애매하면 출시 이후로 미룹니다.

### 4.2 임시 테이블 삭제 조건 시뮬레이션

Supabase SQL Editor에서 그대로 실행할 수 있습니다. `TEMP TABLE`과 `ROLLBACK`만 사용하므로 실제 테이블은 변경하지 않습니다.

```sql
BEGIN;

CREATE TEMP TABLE tmp_daily_execution_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  summary_date date NOT NULL,
  summary_text text NOT NULL,
  lang text DEFAULT 'ko',
  updated_at timestamptz NOT NULL DEFAULT now()
) ON COMMIT DROP;

CREATE TEMP TABLE tmp_expected_daily_summary_retention (
  user_id uuid NOT NULL,
  summary_date date NOT NULL,
  should_remain boolean NOT NULL
) ON COMMIT DROP;

WITH retention_policy AS (
  SELECT
    DATE '2026-04-28' AS current_kst_date,
    1::integer AS retained_past_days
),
fixture_users AS (
  SELECT '00000000-0000-0000-0000-000000000001'::uuid AS user_id
  UNION ALL
  SELECT '00000000-0000-0000-0000-000000000002'::uuid AS user_id
),
fixture_dates AS (
  SELECT 0::integer AS day_offset, true AS should_remain
  UNION ALL
  SELECT -1::integer AS day_offset, true AS should_remain
  UNION ALL
  SELECT -2::integer AS day_offset, false AS should_remain
  UNION ALL
  SELECT -30::integer AS day_offset, false AS should_remain
)
INSERT INTO tmp_expected_daily_summary_retention (
  user_id,
  summary_date,
  should_remain
)
SELECT
  fixture_users.user_id,
  retention_policy.current_kst_date + fixture_dates.day_offset,
  fixture_dates.should_remain
FROM fixture_users
CROSS JOIN fixture_dates
CROSS JOIN retention_policy;

INSERT INTO tmp_daily_execution_summaries (
  user_id,
  summary_date,
  summary_text
)
SELECT
  user_id,
  summary_date,
  'simulation summary'
FROM tmp_expected_daily_summary_retention;

WITH retention_policy AS (
  SELECT
    DATE '2026-04-28' AS current_kst_date,
    1::integer AS retained_past_days
)
DELETE FROM tmp_daily_execution_summaries
USING retention_policy
WHERE summary_date < (current_kst_date - retained_past_days);

DO $$
DECLARE
  unexpected_remaining_count integer;
  missing_remaining_count integer;
BEGIN
  SELECT count(*)
  INTO unexpected_remaining_count
  FROM tmp_daily_execution_summaries AS actual
  INNER JOIN tmp_expected_daily_summary_retention AS expected
    ON expected.user_id = actual.user_id
   AND expected.summary_date = actual.summary_date
  WHERE expected.should_remain = false;

  SELECT count(*)
  INTO missing_remaining_count
  FROM tmp_expected_daily_summary_retention AS expected
  LEFT JOIN tmp_daily_execution_summaries AS actual
    ON actual.user_id = expected.user_id
   AND actual.summary_date = expected.summary_date
  WHERE expected.should_remain = true
    AND actual.user_id IS NULL;

  IF unexpected_remaining_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: old rows remained. count=%', unexpected_remaining_count;
  END IF;

  IF missing_remaining_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: today/yesterday rows were deleted. count=%', missing_remaining_count;
  END IF;

  RAISE NOTICE 'PASS: only today and yesterday rows remain.';
END;
$$;

ROLLBACK;
```

통과 기준:

```text
NOTICE: PASS: only today and yesterday rows remain.
```

실패하면 `RAISE EXCEPTION`으로 중단됩니다.

### 4.3 수동 1회 실행 검증

preview와 임시 테이블 시뮬레이션이 통과한 뒤에만 실제 cleanup 함수를 수동 1회 실행합니다.

```sql
SELECT public.cleanup_old_daily_execution_summaries() AS deleted_count;
```

실행 직후 아래 쿼리로 오래된 행이 남지 않았는지 확인합니다.

```sql
WITH retention_policy AS (
  SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date AS current_kst_date,
    1::integer AS retained_past_days
)
SELECT
  summary_date,
  count(*) AS row_count
FROM public.daily_execution_summaries
CROSS JOIN retention_policy
WHERE summary_date < (current_kst_date - retained_past_days)
GROUP BY summary_date
ORDER BY summary_date;
```

통과 기준:

- 결과가 0행이어야 합니다.
- `deleted_count`는 4.1 preview에서 확인한 총 삭제 대상 수와 일치해야 합니다.

### 4.4 cron 등록 전 실행 role 권한 확인

cron은 등록한 DB role로 실행될 수 있으므로, 등록 전에 현재 SQL 세션 role이 cleanup 함수를 실행할 수 있는지 확인합니다.

```sql
SELECT
  current_user AS scheduler_role,
  pg_get_userbyid(proc.proowner) AS function_owner,
  has_function_privilege(
    current_user,
    'public.cleanup_old_daily_execution_summaries()',
    'EXECUTE'
  ) AS can_scheduler_execute
FROM pg_proc AS proc
INNER JOIN pg_namespace AS namespace
  ON namespace.oid = proc.pronamespace
WHERE namespace.nspname = 'public'
  AND proc.proname = 'cleanup_old_daily_execution_summaries';
```

통과 기준:

- 결과가 1행이어야 합니다.
- `can_scheduler_execute`가 `true`여야 합니다.
- `false`면 cron 등록을 보류하고, 실행 role/권한을 먼저 확인합니다.

### 4.5 cron 첫 실행 검증

cron 등록 후 첫 실행이 끝나면 `cron.job_run_details`에서 권한 실패 없이 성공했는지 확인합니다.

```sql
SELECT
  jobid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid
  FROM cron.job
  WHERE jobname = 'cleanup-old-daily-execution-summaries'
)
ORDER BY start_time DESC
LIMIT 5;
```

통과 기준:

- 최신 실행의 `status`가 `succeeded`여야 합니다.
- `return_message`에 권한 오류, 함수 미존재, schema 오류가 없어야 합니다.
- 실패하면 cron을 비활성화하거나 unschedule한 뒤 실행 role/권한을 먼저 확인합니다.

---

## 5. 단계별 체크리스트

### 5.1 migration 작성 전 체크리스트

- 실제 테이블 확인 쿼리에서 오늘/어제 행이 삭제 대상으로 나오지 않습니다.
- 임시 테이블 시뮬레이션이 `PASS`를 출력합니다.
- `get_alarm_payload`가 여전히 오늘 KST 날짜만 조회한다는 전제가 유지됩니다.
- `daily_execution_summaries`를 과거 리포트/통계/감사 로그로 쓰는 신규 요구사항이 없습니다.
- Supabase 운영 환경에서 `pg_cron` 사용 가능 여부를 확인했습니다.

### 5.2 cron 등록 전 체크리스트

- cleanup 함수가 적용되었습니다.
- `SECURITY DEFINER` 함수에서 `PUBLIC`/`anon`/`authenticated` 실행 권한을 차단했습니다.
- 첫 cron 등록 전 수동 1회 실행 결과가 preview 결과와 일치했습니다.
- cron 등록 role이 cleanup 함수를 실행할 수 있습니다.

### 5.3 cron 등록 후 체크리스트

- cron 등록 후 `cron.job`에 active job이 존재합니다.
- cron 첫 실행 결과가 `cron.job_run_details`에서 `succeeded`로 확인되었습니다.
- `return_message`에 권한 오류, 함수 미존재, schema 오류가 없습니다.

---

## 6. 오버코딩 검토

이번 목적은 오래된 일일 캐시 삭제입니다. 다음 항목은 일부러 제외합니다.

| 제외한 접근 | 제외 이유 |
| --- | --- |
| 별도 Edge Function 생성 | 단순 `DELETE` 1개에 HTTP 호출/비밀키/배포 단계를 추가합니다. 기존 정리 함수 패턴보다 무겁습니다. |
| 사용자별 최근 2개 날짜 윈도우 함수 삭제 | 오래 접속하지 않은 사용자의 오래된 캐시가 남습니다. 현재 테이블 의미와 맞지 않습니다. |
| `App.tsx` 저장 로직 변경 | 저장 경로는 정상이며, 이번 문제는 보관 정책 부재입니다. |
| `get_alarm_payload` fallback 확장 | 알람은 오늘 요약을 읽는 현재 계약이 명확합니다. 어제 fallback은 오래된 본문 발송 위험이 있습니다. |
| 포트폴리오별 요약 테이블 분리 | 현재 스키마와 제품 흐름은 사용자별 통합 요약입니다. 보관 정책 작업의 범위를 벗어납니다. |
| 신규 날짜 인덱스 즉시 추가 | 첫 preview에서 삭제 대상이 과도하게 크지 않다면 불필요한 인덱스입니다. 대량 적재가 확인될 때만 별도 migration으로 검토합니다. |
| 별도 cron 실행자 함수/Edge Function 추가 | 현재는 단일 DB 함수와 cron 검증으로 충분합니다. 권한 실패가 실제로 확인될 때만 실행 role 보강을 검토합니다. |

최소 구현은 다음 2개면 충분합니다.

1. 권한 제한을 포함한 `public.cleanup_old_daily_execution_summaries()` 함수 추가
2. preview와 수동 1회 실행 통과 후 매일 1회 `pg_cron` 스케줄 등록 및 첫 실행 결과 확인

---

## 7. Core Rules 준수 검토

- 금융 수학 변경 없음: 주문/금액/수량 계산을 건드리지 않습니다.
- React/UI 변경 없음: i18n, a11y, state/ref 규칙에 영향이 없습니다.
- DRY/SRP: 기존 cleanup 함수 패턴을 재사용하고, 함수 책임은 오래된 summary 삭제 하나로 제한합니다.
- Magic number 완화: 보관 일수는 `retained_past_days`로 이름을 부여합니다.
- Error resilience: 함수는 삭제 행 수를 반환하므로 운영자가 실행 결과를 확인할 수 있습니다.
- 운영 안전성: `SECURITY DEFINER` 함수의 실행 권한을 `service_role` 중심으로 제한합니다.
- 출시 안정성: 자동 cron 등록 전 preview와 수동 1회 실행, 등록 후 첫 실행 결과 확인을 필수 단계로 둡니다.
- Zero assumption: 과거 리포트/감사 용도로 쓰는 요구사항이 확인되면 이 정책은 보류해야 합니다.

---

## 8. 구현 후 검증 후보

시뮬레이션 통과 후 migration을 적용했다면 다음 순서로 확인합니다. cron 등록은 아래 검증이 끝난 뒤에 진행합니다.

```sql
SELECT public.cleanup_old_daily_execution_summaries();
```

```sql
SELECT
  summary_date,
  count(*) AS row_count
FROM public.daily_execution_summaries
GROUP BY summary_date
ORDER BY summary_date;
```

통과 기준:

- KST 기준 오늘/어제보다 오래된 `summary_date`가 없습니다.
- 오늘 알람 발송용 `get_alarm_payload(p_user_id)`가 기존처럼 오늘 행을 정상 반환합니다.
- 함수 반환값이 예상 삭제 대상 수와 일치합니다.
- `anon`/`authenticated` 권한으로 cleanup 함수를 호출할 수 없습니다.
- cron 첫 실행이 `succeeded`이며 권한 오류가 없습니다.
