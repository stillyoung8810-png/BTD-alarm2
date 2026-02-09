-- ============================================
-- 정리 함수 + 트리거 함수 마이그레이션 통합
-- ============================================
-- 1. sent_alarms: 7일 보관 정책 (정리 함수)
-- 2. telegram_link_tokens: 중복 인덱스 제거
-- 3. telegram_link_tokens: 만료 토큰 정리 함수
-- 4. updated_at 트리거 함수 3개 마이그레이션 정의
-- ============================================


-- ============================================
-- 1. sent_alarms: 7일 이상 된 알람 이력 삭제 함수
-- ============================================
-- 중복 방지 로직은 local_date = 오늘만 검사하므로 과거 데이터 삭제 안전.

CREATE OR REPLACE FUNCTION public.cleanup_old_sent_alarms()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM sent_alarms
  WHERE sent_at < (now() - interval '7 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_sent_alarms() IS
  'sent_alarms: 7일 이상 지난 알람 발송 이력 삭제. pg_cron으로 매일 실행 권장.';


-- ============================================
-- 2. telegram_link_tokens: 중복 인덱스 제거
-- ============================================
-- UNIQUE 제약조건(telegram_link_tokens_token_key)이 이미 동일한 고유 인덱스를 생성하므로
-- 아래 명시적 인덱스는 완전히 중복됨. 스토리지 낭비 + INSERT 미세 성능 저하.

DROP INDEX IF EXISTS idx_telegram_link_tokens_token;


-- ============================================
-- 3. telegram_link_tokens: 7일 이상 된 미사용 토큰 정리 함수
-- ============================================
-- 토큰은 일회용(사용 후 즉시 삭제). 7일간 미사용 = 폐기된 토큰.

CREATE OR REPLACE FUNCTION public.cleanup_expired_telegram_link_tokens()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM telegram_link_tokens
  WHERE created_at < (now() - interval '7 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_telegram_link_tokens() IS
  'telegram_link_tokens: 생성 후 7일 이상 경과된 미사용 토큰 삭제. pg_cron으로 매일 실행 권장.';


-- ============================================
-- 4. updated_at 자동 갱신 트리거 함수 정의
-- ============================================
-- 이 함수들은 현재 DB에 존재하지만 마이그레이션에 정의되어 있지 않았음.
-- CREATE OR REPLACE 사용: 기존 환경에서는 동일 로직으로 교체(영향 없음),
-- 신규 환경 / supabase db reset 시 트리거 실패 방지.

CREATE OR REPLACE FUNCTION public.update_user_devices_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_portfolio_history_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_user_devices_updated_at() IS
  'user_devices.updated_at 자동 갱신 트리거 함수.';
COMMENT ON FUNCTION public.update_user_profiles_updated_at() IS
  'user_profiles.updated_at 자동 갱신 트리거 함수.';
COMMENT ON FUNCTION public.update_portfolio_history_updated_at() IS
  'portfolio_history.updated_at 자동 갱신 트리거 함수.';


-- ============================================
-- (선택) pg_cron 스케줄 등록
-- ============================================
-- Supabase Dashboard → SQL Editor 에서 아래를 직접 실행하세요.
-- pg_cron 확장이 활성화되어 있어야 합니다.
/*
SELECT cron.schedule(
  'cleanup-old-sent-alarms',
  '0 4 * * *',                -- 매일 UTC 04:00 (KST 13:00)
  $$SELECT public.cleanup_old_sent_alarms();$$
);

SELECT cron.schedule(
  'cleanup-expired-telegram-link-tokens',
  '10 4 * * *',               -- 매일 UTC 04:10 (KST 13:10)
  $$SELECT public.cleanup_expired_telegram_link_tokens();$$
);
*/
