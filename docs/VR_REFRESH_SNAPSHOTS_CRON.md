# refresh-vr-snapshots — pg_cron 등록 (주기 호출)

[VR 사이클 명세](./VR_CYCLE_REFACTORING_PLAN_FINAL.md) 에 따라 미국 장 마감 후 확정 종가를 전제로 **주 1회(사이클 전환 시)** 갱신을 돌리려면, Supabase에서 이 Edge 함수를 주기적으로 호출하면 됩니다.

## 스케줄 (권장)

- **의도:** 매주 **화~토 아침 06:10 KST** (일·월 아침은 비용 절감을 위해 생략 가능)
- **pg_cron 은 UTC 기준**이므로, KST 화 06:10 = UTC **월** 21:10 … KST 토 06:10 = UTC **금** 21:10  
  → UTC 크론식: **`10 21 * * 1-5`** (월~금 21:10 UTC)

필요 시 팀 규약에 맞게 분·요일만 조정하세요.

## 사전 준비

[CRON_SETUP_SQL_GUIDE.md](./CRON_SETUP_SQL_GUIDE.md) 의 **1. 필요한 값** 과 동일합니다.

- `YOUR_PROJECT_REF` — Reference ID  
- `YOUR_SERVICE_ROLE_KEY` — service_role (SQL에만 붙여넣기, **커밋·공유 금지**)

## 확장 활성화 (1회)

SQL Editor에서:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

## 기존 job 제거 (재등록 시)

```sql
select cron.unschedule('refresh-vr-snapshots')
where exists (
  select 1 from cron.job where jobname = 'refresh-vr-snapshots'
);
```

## job 등록

아래에서 **URL의 프로젝트 ref** 와 **Bearer 토큰**만 본인 값으로 바꾼 뒤 SQL Editor에서 실행합니다.

```sql
select cron.schedule(
  'refresh-vr-snapshots',
  '10 21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-vr-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

- Edge 함수가 내부에서 `SUPABASE_SERVICE_ROLE_KEY` 로 DB에 접근하므로, **호출 측도 service_role** 을 쓰는 것이 일반적입니다.
- 타임아웃은 포트폴리오 수에 맞게 늘리세요.

## 확인

```sql
select jobid, schedule, command, jobname
from cron.job
where jobname = 'refresh-vr-snapshots';
```

## 대안

- Dashboard **Integrations → Cron** (또는 프로젝트에서 제공하는 Scheduled Functions)으로 동일 URL·주기를 등록해도 됩니다.
- 외부 크론( GitHub Actions, Cloud Scheduler 등)에서 동일하게 `POST` 하면 됩니다.

## 관련 문서

- 스모크·로그: [VR_REFRESH_SNAPSHOTS_OPERATIONS.md](./VR_REFRESH_SNAPSHOTS_OPERATIONS.md)
- `_shared` 사본 동기화: [supabase/functions/_shared/README.md](../supabase/functions/_shared/README.md)
