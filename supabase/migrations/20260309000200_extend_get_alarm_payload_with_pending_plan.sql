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
  v_kst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date;

  SELECT jsonb_build_object(
    'subscription_tier', subscription_tier,
    'subscription_status', subscription_status,
    'subscription_expires_at', subscription_expires_at,
    'pending_plan', pending_plan,
    'pending_plan_effective_at', pending_plan_effective_at,
    'telegram_enabled', telegram_enabled,
    'telegram_chat_id', telegram_chat_id,
    'preferred_language', preferred_language
  )
  INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id
  LIMIT 1;

  SELECT summary_text INTO v_summary_text
  FROM daily_execution_summaries
  WHERE user_id = p_user_id AND summary_date = v_kst_date
  LIMIT 1;

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
