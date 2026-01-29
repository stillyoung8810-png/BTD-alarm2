-- ============================================
-- telegram_link_tokens 테이블 생성
-- ============================================
-- 목적: 텔레그램 봇 연결 시 일회성 토큰 저장 (Pro/Premium 유저용)
-- 사용: 사용자가 웹에서 "텔레그램 연결하기" 클릭 → 토큰 생성/저장
--       봇에게 /start <token> 전송 → Edge Function이 이 테이블에서 user_id 조회 후
--       user_profiles에 telegram_chat_id 등 업데이트, 토큰 삭제
-- 날짜: 2025-01-28
-- ============================================

CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: 서비스 역할(Edge Function)만 접근. 앱 사용자는 이 테이블을 직접 읽지 않음.
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- 서비스 역할은 RLS를 우회하므로 정책은 "인증된 사용자가 자신의 토큰만 삽입/조회"용으로 둘 수 있음.
-- Edge Function은 service_role_key를 쓰므로 RLS를 우회합니다.
-- 앱에서 "연결 토큰 생성" 시 인증된 사용자만 자신의 user_id로 행을 삽입할 수 있게 함.
CREATE POLICY "Users can insert own telegram link token"
  ON public.telegram_link_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 토큰 조회는 Edge Function(service_role)만 하므로, authenticated용 SELECT 정책은 선택사항.
-- 필요 시: 사용자가 자신의 미사용 토큰 존재 여부만 확인하려면 SELECT 정책 추가 가능.
CREATE POLICY "Users can read own telegram link tokens"
  ON public.telegram_link_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 만료된 토큰 정리용: created_at 기준 오래된 행 삭제는 cron 등에서 service_role로 수행 가능.
-- (DELETE 정책은 Edge Function이 토큰 사용 후 삭제할 때 service_role 사용)

COMMENT ON TABLE public.telegram_link_tokens IS '텔레그램 봇 연결용 일회성 토큰. /start <token> 후 user_profiles 업데이트 및 토큰 삭제.';
COMMENT ON COLUMN public.telegram_link_tokens.token IS '영문/숫자/_- 조합. 봇에게 /start <token> 로 전달.';
COMMENT ON COLUMN public.telegram_link_tokens.user_id IS '연결 대상 사용자( auth.users.id ).';

-- 인덱스: 토큰으로 조회하는 Edge Function 쿼리 성능
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
  ON public.telegram_link_tokens (token);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id
  ON public.telegram_link_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_created_at
  ON public.telegram_link_tokens (created_at);
