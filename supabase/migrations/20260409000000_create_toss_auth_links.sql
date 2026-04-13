-- ============================================
-- public.toss_auth_links
-- ============================================
-- 목적: 토스 로그인 후 저장되는 암호화 refresh token (BFF service_role 전용).
--       AuthService: 재로그인 시 auth_user_id·toss_user_key 각각 delete 후 insert (이중 UNIQUE 안전).
--       tossSelfUnlinkRoute: auth_user_id로 조회 후 공식 unlink.
-- ============================================

CREATE TABLE IF NOT EXISTS public.toss_auth_links (
  toss_user_key text PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  encrypted_refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT toss_auth_links_auth_user_id_key UNIQUE (auth_user_id)
);

COMMENT ON TABLE public.toss_auth_links IS '토스 OAuth 연결: toss_user_key당 한 행, auth_user_id당 한 행. 서버(BFF)만 접근.';
COMMENT ON COLUMN public.toss_auth_links.encrypted_refresh_token IS '저장용 refresh token (서버 측 암호화).';

ALTER TABLE public.toss_auth_links ENABLE ROW LEVEL SECURITY;
