-- ============================================
-- daily_execution_summaries 테이블 생성
-- ============================================
-- 목적:
-- - 각 사용자별로 "오늘 알람에 포함할 daily execution 요약 텍스트"를 캐싱
-- - 프론트엔드에서 포트폴리오/전략/daily execution 내용이 변경될 때 이 테이블에 upsert
-- - Edge Function(send-alarm)이 알람 발송 시 이 요약 텍스트를 읽어 텔레그램 메시지에 포함
-- 
-- 키 설계:
-- - user_id + summary_date(KST 기준 날짜) 를 UNIQUE 로 관리
-- - summary_text 에는 이미 포맷팅된 텍스트(여러 줄)를 저장
-- ============================================

CREATE TABLE IF NOT EXISTS public.daily_execution_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  summary_text text NOT NULL,
  lang text DEFAULT 'ko',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daily_execution_summaries IS
'각 사용자의 KST 기준 일별 매매 실행(daily execution) 요약 텍스트 캐시. send-alarm Edge Function이 텔레그램 알림에 포함하기 위해 사용.';

COMMENT ON COLUMN public.daily_execution_summaries.summary_date IS
'KST 기준 날짜(YYYY-MM-DD). user_id + summary_date 조합은 1행만 유지.';

COMMENT ON COLUMN public.daily_execution_summaries.summary_text IS
'텔레그램/푸시 알림에 포함할 일별 매매 실행 요약 텍스트(여러 줄 가능).';

-- user_id + summary_date 조합의 유일성 보장
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_execution_summaries_user_date
  ON public.daily_execution_summaries (user_id, summary_date);

-- RLS 활성화
ALTER TABLE public.daily_execution_summaries ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 자신의 user_id 로만 INSERT / SELECT / UPDATE 가능
CREATE POLICY "Users can insert own daily execution summary"
  ON public.daily_execution_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own daily execution summary"
  ON public.daily_execution_summaries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own daily execution summary"
  ON public.daily_execution_summaries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

