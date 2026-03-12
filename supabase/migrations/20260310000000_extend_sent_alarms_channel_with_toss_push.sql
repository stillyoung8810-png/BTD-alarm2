-- ============================================
-- sent_alarms.channel 에 toss_push 추가
-- ============================================
-- 목적:
-- - 토스 스마트 메시지(푸시/인앱 알림) 발송 이력을 sent_alarms 에 저장할 수 있게 한다.
-- - 기존 채널(fcm, telegram)과 함께 toss_push 를 허용한다.
-- ============================================

ALTER TABLE public.sent_alarms
  DROP CONSTRAINT IF EXISTS sent_alarms_channel_check;

ALTER TABLE public.sent_alarms
  ADD CONSTRAINT sent_alarms_channel_check
  CHECK (channel IN ('fcm', 'telegram', 'toss_push'));

COMMENT ON COLUMN public.sent_alarms.channel IS
'알림 채널 (fcm / telegram / toss_push).';
