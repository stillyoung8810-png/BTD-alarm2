-- ============================================
-- sent_alarms 테이블 생성
-- ============================================
-- 목적:
-- - 알람 전송 이력을 구조적으로 남겨서
--   "언제, 누구에게, 어떤 채널로, 성공/실패 여부"를 추적
-- - 유료 사용자 CS 대응 및 장애 분석에 활용
-- ============================================

CREATE TABLE IF NOT EXISTS public.sent_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL CHECK (channel IN ('fcm', 'telegram')),
  status text NOT NULL CHECK (status IN ('success', 'failure')),
  error_message text,
  alarm_type text,
  time_kst text, -- 예: '15:00'
  payload_snapshot jsonb
);

COMMENT ON TABLE public.sent_alarms IS
'알람 전송 이력 테이블. 각 행은 특정 시점에 특정 사용자에게 특정 채널(fcm/telegram)로 알림을 보낸 결과를 나타냄.';

COMMENT ON COLUMN public.sent_alarms.channel IS
'알림 채널 (fcm / telegram).';

COMMENT ON COLUMN public.sent_alarms.status IS
'전송 결과 (success / failure).';

COMMENT ON COLUMN public.sent_alarms.alarm_type IS
'알림 유형 (예: portfolio_alarm 등).';

COMMENT ON COLUMN public.sent_alarms.time_kst IS
'KST 기준 알람 시간 문자열 (예: 15:00).';

-- 사용자별 최근 이력 조회 최적화를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_sent_alarms_user_time
  ON public.sent_alarms (user_id, sent_at DESC);

