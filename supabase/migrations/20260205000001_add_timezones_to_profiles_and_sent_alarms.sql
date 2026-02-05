-- ============================================
-- user_profiles timezone + sent_alarms local time columns
-- ============================================

-- 1) user_profiles.timezone
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Seoul';

COMMENT ON COLUMN public.user_profiles.timezone IS
'사용자 기본 타임존(IANA). 알람 생성 시점 스냅샷의 기본값.';

-- 2) sent_alarms: local time + timezone
ALTER TABLE public.sent_alarms
  ADD COLUMN IF NOT EXISTS time_local text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS local_date date;

COMMENT ON COLUMN public.sent_alarms.time_local IS
'알람의 로컬 시간 (예: 09:00).';
COMMENT ON COLUMN public.sent_alarms.timezone IS
'알람 타임존 (IANA, 예: Asia/Seoul).';
COMMENT ON COLUMN public.sent_alarms.local_date IS
'알람 로컬 날짜 (YYYY-MM-DD).';

CREATE INDEX IF NOT EXISTS idx_sent_alarms_user_local
  ON public.sent_alarms (user_id, local_date, time_local, timezone);

-- 3) alarm_config.timezone 백필 (기존 알람)
UPDATE public.portfolios p
SET alarm_config = jsonb_set(
  p.alarm_config,
  '{timezone}',
  to_jsonb(coalesce(u.timezone, 'Asia/Seoul')),
  true
)
FROM public.user_profiles u
WHERE p.user_id = u.id
  AND p.alarm_config IS NOT NULL
  AND (p.alarm_config->>'timezone' IS NULL OR p.alarm_config->>'timezone' = '');
