CREATE OR REPLACE FUNCTION public.cleanup_old_daily_execution_summaries()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM daily_execution_summaries
  WHERE summary_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 1);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_daily_execution_summaries() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_daily_execution_summaries() TO service_role;

COMMENT ON FUNCTION public.cleanup_old_daily_execution_summaries() IS
  'daily_execution_summaries: KST 기준 오늘과 어제만 남기고 오래된 일일 알람 본문 캐시를 삭제. pg_cron으로 매일 실행.';

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
