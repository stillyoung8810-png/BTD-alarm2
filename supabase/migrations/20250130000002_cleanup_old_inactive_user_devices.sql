-- ============================================
-- user_devices 정리: 4일 이상 된 비활성 토큰 삭제
-- ============================================
-- 정책: A+D — 기기당 1개 토큰 유지, 여러 기기에서 푸시 수신 가능.
--       is_active = false 이고 updated_at 이 4일 지난 행만 삭제 (활성/최근 비활성은 유지).
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_old_inactive_user_devices()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM user_devices
  WHERE is_active = false
    AND updated_at < (now() - interval '4 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_inactive_user_devices() IS
  'user_devices: is_active=false 이고 updated_at이 4일 지난 행 삭제. pg_cron으로 매일 실행 권장.';

-- ============================================
-- (선택) 매일 새벽 3시 UTC에 자동 실행하려면 SQL Editor에서 아래 실행
-- ============================================
-- pg_cron, pg_net 확장이 이미 활성화되어 있어야 함.
/*
SELECT cron.schedule(
  'cleanup-old-inactive-user-devices',
  '0 3 * * *',
  $$SELECT public.cleanup_old_inactive_user_devices();$$
);
*/
