-- check-and-trigger-alarms 10분 구간 실행 시 "오늘 이미 발송된 (user_id, time_kst)" 조회 최적화
CREATE INDEX IF NOT EXISTS idx_sent_alarms_sent_at_user_time_kst
  ON public.sent_alarms (sent_at, user_id, time_kst);
