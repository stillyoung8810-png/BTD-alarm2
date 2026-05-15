-- ============================================
-- Benefit rewarded ad unlock idempotency
-- ============================================

CREATE TABLE IF NOT EXISTS public.benefit_rewarded_ad_unlock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mission_kind text NOT NULL CHECK (mission_kind IN ('price_prediction', 'stock_quiz')),
  mission_date date NOT NULL,
  idempotency_key text NOT NULL,
  can_grant boolean NOT NULL,
  reason text NOT NULL CHECK (reason IN ('granted', 'attempt_limit_reached', 'unlock_limit_reached')),
  completed_attempts integer NOT NULL CHECK (completed_attempts BETWEEN 0 AND 5),
  rewarded_ad_unlocks integer NOT NULL CHECK (rewarded_ad_unlocks BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.benefit_rewarded_ad_unlock_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS benefit_rewarded_ad_unlock_attempts_lookup_idx
  ON public.benefit_rewarded_ad_unlock_attempts (
    user_id,
    mission_kind,
    mission_date,
    created_at DESC
  );

CREATE OR REPLACE FUNCTION public.unlock_benefit_mission_ad(
  p_user_id uuid,
  p_mission_kind text,
  p_mission_date date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.benefit_mission_daily_states%ROWTYPE;
  v_existing_attempt public.benefit_rewarded_ad_unlock_attempts%ROWTYPE;
  v_can_grant boolean := false;
  v_reason text := 'unlock_limit_reached';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_mission_kind NOT IN ('price_prediction', 'stock_quiz') THEN
    RAISE EXCEPTION 'invalid_mission_kind';
  END IF;

  IF p_mission_date IS NULL THEN
    RAISE EXCEPTION 'mission_date_required';
  END IF;

  IF btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_idempotency_key)
  );

  SELECT *
  INTO v_existing_attempt
  FROM public.benefit_rewarded_ad_unlock_attempts
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_attempt.mission_kind <> p_mission_kind
      OR v_existing_attempt.mission_date <> p_mission_date
    THEN
      RAISE EXCEPTION 'ad_unlock_idempotency_key_conflict';
    END IF;

    RETURN jsonb_build_object(
      'canGrant', v_existing_attempt.can_grant,
      'reason', v_existing_attempt.reason,
      'completedAttempts', v_existing_attempt.completed_attempts,
      'rewardedAdUnlocks', v_existing_attempt.rewarded_ad_unlocks
    );
  END IF;

  INSERT INTO public.benefit_mission_daily_states (
    user_id,
    mission_kind,
    mission_date
  )
  VALUES (
    p_user_id,
    p_mission_kind,
    p_mission_date
  )
  ON CONFLICT (user_id, mission_kind, mission_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.benefit_mission_daily_states
  WHERE user_id = p_user_id
    AND mission_kind = p_mission_kind
    AND mission_date = p_mission_date
  FOR UPDATE;

  IF v_state.completed_attempts >= 5 THEN
    v_can_grant := false;
    v_reason := 'attempt_limit_reached';
  ELSIF v_state.rewarded_ad_unlocks >= 4 THEN
    v_can_grant := false;
    v_reason := 'unlock_limit_reached';
  ELSE
    UPDATE public.benefit_mission_daily_states
    SET
      rewarded_ad_unlocks = rewarded_ad_unlocks + 1,
      updated_at = now()
    WHERE user_id = p_user_id
      AND mission_kind = p_mission_kind
      AND mission_date = p_mission_date
    RETURNING * INTO v_state;

    v_can_grant := true;
    v_reason := 'granted';
  END IF;

  INSERT INTO public.benefit_rewarded_ad_unlock_attempts (
    user_id,
    mission_kind,
    mission_date,
    idempotency_key,
    can_grant,
    reason,
    completed_attempts,
    rewarded_ad_unlocks
  )
  VALUES (
    p_user_id,
    p_mission_kind,
    p_mission_date,
    p_idempotency_key,
    v_can_grant,
    v_reason,
    v_state.completed_attempts,
    v_state.rewarded_ad_unlocks
  );

  RETURN jsonb_build_object(
    'canGrant', v_can_grant,
    'reason', v_reason,
    'completedAttempts', v_state.completed_attempts,
    'rewardedAdUnlocks', v_state.rewarded_ad_unlocks
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_benefit_mission_ad(uuid, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_benefit_mission_ad(uuid, text, date, text) TO service_role;
