-- ============================================
-- user_profiles.preferred_language 컬럼 추가
-- ============================================
-- 목적: 서버(Edge Function)에서 유저별 선호 언어(ko/en)를 알고 푸시/텔레그램 알림 언어를 결정
-- 사용: 프론트엔드에서 언어 토글 시 user_profiles.preferred_language 업데이트
-- 날짜: 2025-01-28
-- ============================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language text
  CHECK (preferred_language IN ('ko', 'en'))
  DEFAULT 'ko';

COMMENT ON COLUMN public.user_profiles.preferred_language IS
'사용자 선호 언어 코드 (ko/en). 알림 및 UI 기본 언어 결정에 사용.';

