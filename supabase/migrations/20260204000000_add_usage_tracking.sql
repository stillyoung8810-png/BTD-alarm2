-- Add usage tracking columns to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS ai_daily_usage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_monthly_usage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS backtest_daily_usage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_usage_reset_at TIMESTAMPTZ DEFAULT now();

-- Create RPC to check and increment usage atomically
-- Returns JSON with success status and error message if any
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_usage_type TEXT, -- 'ai' or 'backtest'
  p_max_daily INTEGER,
  p_max_monthly INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_now TIMESTAMPTZ := now();
  v_today DATE := v_now::DATE;
  v_last_reset_date DATE;
  v_last_reset_month DATE;
  v_current_month DATE := date_trunc('month', v_now)::DATE;
  v_daily_count INTEGER;
  v_monthly_count INTEGER;
  v_success BOOLEAN := FALSE;
  v_error_message TEXT := '';
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the profile row for update to ensure atomicity
  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_last_reset_date := v_profile.last_usage_reset_at::DATE;
  v_last_reset_month := date_trunc('month', v_profile.last_usage_reset_at)::DATE;

  -- Initialize counts from profile
  v_daily_count := CASE 
    WHEN p_usage_type = 'ai' THEN v_profile.ai_daily_usage 
    ELSE v_profile.backtest_daily_usage 
  END;
  v_monthly_count := v_profile.ai_monthly_usage;

  -- Logic to reset daily count if date changed
  IF v_today > v_last_reset_date THEN
    v_daily_count := 0;
    -- Reset all daily counts for safety
    UPDATE public.user_profiles 
    SET ai_daily_usage = 0, backtest_daily_usage = 0, last_usage_reset_at = v_now
    WHERE id = v_user_id;
  END IF;

  -- Logic to reset monthly count if month changed
  IF v_current_month > v_last_reset_month THEN
    v_monthly_count := 0;
    UPDATE public.user_profiles 
    SET ai_monthly_usage = 0, last_usage_reset_at = v_now
    WHERE id = v_user_id;
  END IF;

  -- Check limits
  IF v_daily_count >= p_max_daily THEN
    v_error_message := 'Daily limit reached';
  ELSIF p_max_monthly IS NOT NULL AND v_monthly_count >= p_max_monthly THEN
    v_error_message := 'Monthly limit reached';
  ELSE
    -- Increment
    IF p_usage_type = 'ai' THEN
      UPDATE public.user_profiles 
      SET ai_daily_usage = v_daily_count + 1, 
          ai_monthly_usage = v_monthly_count + 1,
          last_usage_reset_at = v_now
      WHERE id = v_user_id;
    ELSE
      UPDATE public.user_profiles 
      SET backtest_daily_usage = v_daily_count + 1,
          last_usage_reset_at = v_now
      WHERE id = v_user_id;
    END IF;
    v_success := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'success', v_success, 
    'error', v_error_message,
    'current_daily', CASE WHEN v_success THEN v_daily_count + 1 ELSE v_daily_count END,
    'current_monthly', CASE WHEN p_usage_type = 'ai' THEN (CASE WHEN v_success THEN v_monthly_count + 1 ELSE v_monthly_count END) ELSE NULL END
  );
END;
$$;
