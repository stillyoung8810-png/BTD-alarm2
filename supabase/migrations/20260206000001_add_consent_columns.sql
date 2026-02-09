-- ============================================
-- user_profiles에 동의 기록 컬럼 추가
-- ============================================
-- 개인정보 보호법 제17조: 동의 여부를 명확하게 표시할 수 있는 방법 제공
-- 동의 일시(timestamp)를 DB에 기록하여 감사 추적(audit trail) 확보

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS terms_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz NULL;

COMMENT ON COLUMN public.user_profiles.terms_consent_at IS
  '이용약관 동의 일시. 회원가입 시 기록.';
COMMENT ON COLUMN public.user_profiles.privacy_consent_at IS
  '개인정보 처리방침 동의 일시. 회원가입 시 기록.';
