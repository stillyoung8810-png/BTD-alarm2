-- 알람 트리거 스케줄 (pg_cron + pg_net)
-- 텔레그램/푸시 알람이 동작하려면 check-and-trigger-alarms가 주기적으로 호출되어야 합니다.
-- 함수는 "과거 10분 구간"을 검사하고 sent_alarms로 중복 발송을 막으므로, 10분 단위 크론 권장.
--
-- [방법 1] Supabase Dashboard → Integrations → Cron Jobs (권장)
--   - Schedule: */10 * * * * (10분마다, :00/:10/:20/:30/:40/:50)
--   - Type: Edge Function → check-and-trigger-alarms
--
-- [방법 2] SQL Editor에서 아래 주석 블록의 내용으로 등록
--   - YOUR_PROJECT_REF, YOUR_SERVICE_ROLE_KEY 를 실제 값으로 교체 후 실행

-- pg_cron, pg_net은 Supabase Dashboard → Database → Extensions에서 활성화할 수도 있습니다.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 크론 스케줄 등록은 별도 실행. docs/TELEGRAM_ALARM_SETUP.md, docs/CRON_SETUP_SQL_GUIDE.md 참고.
-- (블록 주석 안에 '*/10'이 있으면 */ 가 주석 종료로 파싱되어 문법 오류가 나므로 예시는 문서에만 둠.)
