-- 토스 로그인 연동: user_profiles에 toss_user_key 추가 (Unique)
-- login-me 응답의 userKey를 string으로 저장하여 토스 사용자 매핑
-- API는 number이지만 JS Number 범위 이슈 방지를 위해 DB에는 text로 저장
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS toss_user_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_toss_user_key
  ON public.user_profiles (toss_user_key)
  WHERE toss_user_key IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.toss_user_key IS
  '토스 로그인 login-me 응답의 userKey (string). Unique. 토스 사용자별 1:1 매핑.';
