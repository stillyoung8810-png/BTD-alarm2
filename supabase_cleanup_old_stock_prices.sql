-- ============================================
-- stock_prices 테이블에서 300일 이상 된 데이터 자동 삭제
-- pg_cron을 사용하여 매일 자정에 실행
-- ============================================

-- 1. pg_cron 확장이 활성화되어 있는지 확인 (이미 활성화되어 있다면 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 기존에 동일한 이름의 작업이 있다면 삭제
SELECT cron.unschedule('cleanup_old_stock_prices');

-- 3. 300일 이상 된 stock_prices 데이터를 삭제하는 함수 생성
CREATE OR REPLACE FUNCTION cleanup_old_stock_prices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 300일(약 10개월) 이상 된 데이터 삭제
  DELETE FROM public.stock_prices
  WHERE trade_date < CURRENT_DATE - INTERVAL '300 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- 로그 출력 (선택사항)
  RAISE NOTICE 'Deleted % rows from stock_prices older than 300 days', deleted_count;
END;
$$;

-- 4. pg_cron 작업 스케줄링: 매일 자정(00:00 UTC)에 실행
-- 참고: Supabase는 UTC 시간대를 사용하므로, 한국 시간(KST) 기준으로는 오전 9시에 실행됩니다.
SELECT cron.schedule(
  'cleanup_old_stock_prices',           -- 작업 이름
  '0 0 * * *',                         -- Cron 표현식: 매일 자정 (UTC)
  $$SELECT cleanup_old_stock_prices();$$ -- 실행할 SQL
);

-- 5. 작업이 제대로 등록되었는지 확인
SELECT * FROM cron.job WHERE jobname = 'cleanup_old_stock_prices';

-- ============================================
-- 참고사항:
-- 1. 이 스크립트는 Supabase SQL Editor에서 실행하세요.
-- 2. pg_cron은 Supabase Pro 플랜 이상에서만 사용 가능합니다.
-- 3. 작업을 중지하려면: SELECT cron.unschedule('cleanup_old_stock_prices');
-- 4. 작업을 수정하려면: 먼저 unschedule 후 다시 schedule하세요.
-- 5. 실행 시간을 변경하려면 Cron 표현식을 수정하세요:
--    - '0 0 * * *' : 매일 자정 (UTC)
--    - '0 9 * * *' : 매일 오전 9시 (UTC, 한국 시간 오후 6시)
--    - '0 */6 * * *' : 6시간마다
-- ============================================
