-- ============================================
-- RPC: get_alarm_payload (send-alarm 단일 쿼리용)
-- ============================================
-- 목적: send-alarm Edge Function에서 user_profiles + daily_execution_summaries + user_devices 를 한 번에 조회
-- 사용: supabase.rpc('get_alarm_payload', { p_user_id: user_id })
-- 날짜: 2025-01-28
-- ============================================

CREATE OR REPLACE FUNCTION public.get_alarm_payload(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kst_date date;
  v_profile jsonb;
  v_summary_text text;
  v_fcm_tokens text[];
BEGIN
  -- KST 기준 오늘 날짜
  v_kst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date;

  -- user_profiles (필요 컬럼만)
  SELECT jsonb_build_object(
    'subscription_tier', subscription_tier,
    'subscription_status', subscription_status,
    'subscription_expires_at', subscription_expires_at,
    'telegram_enabled', telegram_enabled,
    'telegram_chat_id', telegram_chat_id,
    'preferred_language', preferred_language
  )
  INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id
  LIMIT 1;

  -- daily_execution_summaries (오늘 KST 날짜)
  SELECT summary_text INTO v_summary_text
  FROM daily_execution_summaries
  WHERE user_id = p_user_id AND summary_date = v_kst_date
  LIMIT 1;

  -- user_devices (활성 FCM 토큰 배열)
  SELECT coalesce(array_agg(fcm_token) FILTER (WHERE fcm_token IS NOT NULL AND fcm_token <> ''), ARRAY[]::text[])
  INTO v_fcm_tokens
  FROM user_devices
  WHERE user_id = p_user_id AND is_active = true;

  RETURN jsonb_build_object(
    'profile', coalesce(v_profile, 'null'::jsonb),
    'summary_text', v_summary_text,
    'fcm_tokens', coalesce(v_fcm_tokens, ARRAY[]::text[])
  );
END;
$$;

COMMENT ON FUNCTION public.get_alarm_payload(uuid) IS
'send-alarm Edge Function용: user_id로 프로필·요약·FCM 토큰을 한 번에 조회.';
