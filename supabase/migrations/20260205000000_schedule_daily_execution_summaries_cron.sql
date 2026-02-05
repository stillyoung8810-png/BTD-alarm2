-- 일일 실행 요약 생성 크론 스케줄 (generate-daily-execution-summaries)
-- 월~금 07:20 KST = UTC 기준 일~목 22:20
-- pg_cron은 UTC 기준이므로: 20 22 * * 0-4 (일요일=0, 월요일=1, ..., 목요일=4)
--
-- 텔레그램 연결된 유료 사용자 대상으로 daily_execution_summaries 테이블에 요약 저장

-- pg_cron, pg_net 확장 활성화 확인
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 스케줄이 있으면 삭제
select cron.unschedule('generate-daily-execution-summaries')
where exists (
  select 1 from cron.job where jobname = 'generate-daily-execution-summaries'
);

-- 크론 스케줄 등록: 월~금 07:20 KST (UTC 기준 일~목 22:20)
select cron.schedule(
  'generate-daily-execution-summaries',
  '20 22 * * 0-4',  -- UTC 기준: 일~목 22:20 = KST 월~금 07:20
  $$
  select net.http_post(
    url := 'https://vbscfgjlckbjrdqzpire.supabase.co/functions/v1/generate-daily-execution-summaries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZic2NmZ2psY2tianJkcXpwaXJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM3MDE2NiwiZXhwIjoyMDgzOTQ2MTY2fQ.T8zwtyvQODGFh8VGAPCrqmz_xJLa8zP7my1x3Vrvyy8',
      'X-Internal-Alarm-Secret', 'dbalstn10790307'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 확인용 쿼리 (선택사항)
-- select * from cron.job where jobname = 'generate-daily-execution-summaries';
