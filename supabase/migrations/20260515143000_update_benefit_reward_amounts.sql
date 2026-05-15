-- ============================================
-- Update benefit reward amounts
-- ============================================
-- Attendance base reward: 5 money
-- Quiz/prediction participation reward: 10 money
-- Attendance streak bonus remains 10 money
-- ============================================

CREATE OR REPLACE FUNCTION public.attend_and_claim_reward(
  p_user_id uuid,
  p_attendance_date date,
  p_has_watched_interstitial_for_streak_bonus boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attendance_reward_money integer := 5;
  v_streak_bonus_reward_money integer := 10;
  v_streak_bonus_interval_days integer := 10;
  v_previous_consecutive_days integer := 0;
  v_consecutive_days integer := 1;
  v_attendance public.benefit_attendance%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_base_ledger_id uuid;
  v_streak_ledger_id uuid;
  v_base_money integer := 0;
  v_streak_bonus_money integer := 0;
  v_is_streak_bonus_day boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_attendance_date IS NULL THEN
    RAISE EXCEPTION 'attendance_date_required';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(consecutive_days, 0)
  INTO v_previous_consecutive_days
  FROM public.benefit_attendance
  WHERE user_id = p_user_id
    AND attendance_date = p_attendance_date - 1;

  v_consecutive_days := COALESCE(v_previous_consecutive_days, 0) + 1;

  INSERT INTO public.benefit_attendance (
    user_id,
    attendance_date,
    consecutive_days,
    base_money,
    streak_bonus_money,
    streak_bonus_ad_shown
  )
  VALUES (
    p_user_id,
    p_attendance_date,
    v_consecutive_days,
    v_attendance_reward_money,
    0,
    false
  )
  ON CONFLICT (user_id, attendance_date) DO NOTHING;

  SELECT *
  INTO v_attendance
  FROM public.benefit_attendance
  WHERE user_id = p_user_id
    AND attendance_date = p_attendance_date
  FOR UPDATE;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'attendance_base',
    p_attendance_date::text,
    v_attendance_reward_money,
    v_wallet.money_balance + v_attendance_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_base_ledger_id;

  IF v_base_ledger_id IS NOT NULL THEN
    v_base_money := v_attendance_reward_money;

    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attendance_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attendance_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  v_is_streak_bonus_day :=
    v_attendance.consecutive_days % v_streak_bonus_interval_days = 0;

  IF
    v_is_streak_bonus_day
    AND p_has_watched_interstitial_for_streak_bonus
    AND v_attendance.streak_bonus_money = 0
  THEN
    INSERT INTO public.benefit_ledger_entries (
      user_id,
      source,
      source_id,
      delta_money,
      money_balance_after
    )
    VALUES (
      p_user_id,
      'attendance_streak_bonus',
      p_attendance_date::text,
      v_streak_bonus_reward_money,
      v_wallet.money_balance + v_streak_bonus_reward_money
    )
    ON CONFLICT (user_id, source, source_id) DO NOTHING
    RETURNING id INTO v_streak_ledger_id;

    IF v_streak_ledger_id IS NOT NULL THEN
      v_streak_bonus_money := v_streak_bonus_reward_money;

      UPDATE public.benefit_wallets
      SET
        money_balance = money_balance + v_streak_bonus_reward_money,
        lifetime_earned_money = lifetime_earned_money + v_streak_bonus_reward_money,
        updated_at = v_now
      WHERE user_id = p_user_id
      RETURNING * INTO v_wallet;

      UPDATE public.benefit_attendance
      SET
        streak_bonus_money = v_streak_bonus_reward_money,
        streak_bonus_ad_shown = true
      WHERE id = v_attendance.id
      RETURNING * INTO v_attendance;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'attendanceDate', p_attendance_date,
    'consecutiveDays', v_attendance.consecutive_days,
    'baseMoneyGranted', v_base_money,
    'streakBonusMoneyGranted', v_streak_bonus_money,
    'requiresInterstitialForBonus',
      v_is_streak_bonus_day
      AND v_attendance.streak_bonus_money = 0,
    'moneyBalance', v_wallet.money_balance,
    'lifetimeEarnedMoney', v_wallet.lifetime_earned_money
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_and_claim_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_attempt_date date,
  p_attempt_sequence integer,
  p_idempotency_key text,
  p_selected_choice_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attempt_reward_money integer := 10;
  v_daily_max_attempts integer := 5;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_state public.benefit_mission_daily_states%ROWTYPE;
  v_question public.benefit_quiz_questions%ROWTYPE;
  v_attempt public.benefit_quiz_attempts%ROWTYPE;
  v_ledger_id uuid;
  v_is_correct boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_question_id IS NULL THEN
    RAISE EXCEPTION 'question_id_required';
  END IF;

  IF p_attempt_date IS NULL THEN
    RAISE EXCEPTION 'attempt_date_required';
  END IF;

  IF p_attempt_sequence NOT BETWEEN 1 AND v_daily_max_attempts THEN
    RAISE EXCEPTION 'attempt_sequence_out_of_range';
  END IF;

  IF btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  IF btrim(COALESCE(p_selected_choice_id, '')) = '' THEN
    RAISE EXCEPTION 'selected_choice_id_required';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.benefit_mission_daily_states (
    user_id,
    mission_kind,
    mission_date
  )
  VALUES (
    p_user_id,
    'stock_quiz',
    p_attempt_date
  )
  ON CONFLICT (user_id, mission_kind, mission_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.benefit_mission_daily_states
  WHERE user_id = p_user_id
    AND mission_kind = 'stock_quiz'
    AND mission_date = p_attempt_date
  FOR UPDATE;

  SELECT *
  INTO v_attempt
  FROM public.benefit_quiz_attempts
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.benefit_quiz_attempts
  WHERE user_id = p_user_id
    AND attempt_date = p_attempt_date
    AND attempt_sequence = p_attempt_sequence;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  IF v_state.completed_attempts >= v_daily_max_attempts THEN
    RAISE EXCEPTION 'daily_attempt_limit_reached';
  END IF;

  IF v_state.completed_attempts >= v_state.rewarded_ad_unlocks + 1 THEN
    RAISE EXCEPTION 'no_unlocked_attempt_available';
  END IF;

  IF p_attempt_sequence <> v_state.completed_attempts + 1 THEN
    RAISE EXCEPTION 'attempt_sequence_must_match_next_attempt';
  END IF;

  SELECT *
  INTO v_question
  FROM public.benefit_quiz_questions
  WHERE id = p_question_id
    AND is_active = true
    AND review_status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quiz_question_not_available';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_question.choices) AS choice
    WHERE choice ->> 'id' = p_selected_choice_id
  ) THEN
    RAISE EXCEPTION 'selected_choice_id_not_in_choices';
  END IF;

  v_is_correct := v_question.correct_choice_id = p_selected_choice_id;

  INSERT INTO public.benefit_quiz_attempts (
    user_id,
    question_id,
    attempt_date,
    attempt_sequence,
    idempotency_key,
    selected_choice_id,
    is_correct,
    reward_money
  )
  VALUES (
    p_user_id,
    p_question_id,
    p_attempt_date,
    p_attempt_sequence,
    p_idempotency_key,
    p_selected_choice_id,
    v_is_correct,
    v_attempt_reward_money
  )
  RETURNING * INTO v_attempt;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'stock_quiz_attempt',
    v_attempt.id::text,
    v_attempt_reward_money,
    v_wallet.money_balance + v_attempt_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attempt_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attempt_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.benefit_mission_daily_states
  SET
    completed_attempts = completed_attempts + 1,
    updated_at = v_now
  WHERE user_id = p_user_id
    AND mission_kind = 'stock_quiz'
    AND mission_date = p_attempt_date
  RETURNING * INTO v_state;

  UPDATE public.benefit_quiz_questions
  SET
    total_attempts = total_attempts + 1,
    correct_attempts = correct_attempts + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    updated_at = v_now
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'alreadyProcessed', false,
    'attemptId', v_attempt.id,
    'isCorrect', v_is_correct,
    'rewardMoney', v_attempt_reward_money,
    'completedAttempts', v_state.completed_attempts,
    'moneyBalance', v_wallet.money_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_prediction_and_claim_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_attempt_date date,
  p_attempt_sequence integer,
  p_idempotency_key text,
  p_selected_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attempt_reward_money integer := 10;
  v_daily_max_attempts integer := 5;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_state public.benefit_mission_daily_states%ROWTYPE;
  v_question public.benefit_prediction_questions%ROWTYPE;
  v_attempt public.benefit_prediction_attempts%ROWTYPE;
  v_ledger_id uuid;
  v_is_correct boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_question_id IS NULL THEN
    RAISE EXCEPTION 'question_id_required';
  END IF;

  IF p_attempt_date IS NULL THEN
    RAISE EXCEPTION 'attempt_date_required';
  END IF;

  IF p_attempt_sequence NOT BETWEEN 1 AND v_daily_max_attempts THEN
    RAISE EXCEPTION 'attempt_sequence_out_of_range';
  END IF;

  IF btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  IF p_selected_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid_selected_direction';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.benefit_mission_daily_states (
    user_id,
    mission_kind,
    mission_date
  )
  VALUES (
    p_user_id,
    'price_prediction',
    p_attempt_date
  )
  ON CONFLICT (user_id, mission_kind, mission_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.benefit_mission_daily_states
  WHERE user_id = p_user_id
    AND mission_kind = 'price_prediction'
    AND mission_date = p_attempt_date
  FOR UPDATE;

  SELECT *
  INTO v_attempt
  FROM public.benefit_prediction_attempts
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.benefit_prediction_attempts
  WHERE user_id = p_user_id
    AND attempt_date = p_attempt_date
    AND attempt_sequence = p_attempt_sequence;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  IF v_state.completed_attempts >= v_daily_max_attempts THEN
    RAISE EXCEPTION 'daily_attempt_limit_reached';
  END IF;

  IF v_state.completed_attempts >= v_state.rewarded_ad_unlocks + 1 THEN
    RAISE EXCEPTION 'no_unlocked_attempt_available';
  END IF;

  IF p_attempt_sequence <> v_state.completed_attempts + 1 THEN
    RAISE EXCEPTION 'attempt_sequence_must_match_next_attempt';
  END IF;

  SELECT *
  INTO v_question
  FROM public.benefit_prediction_questions
  WHERE id = p_question_id
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prediction_question_not_available';
  END IF;

  IF v_question.result_close IS NULL THEN
    v_is_correct := NULL;
  ELSIF v_question.result_close > v_question.base_close THEN
    v_is_correct := p_selected_direction = 'up';
  ELSIF v_question.result_close < v_question.base_close THEN
    v_is_correct := p_selected_direction = 'down';
  ELSE
    v_is_correct := false;
  END IF;

  INSERT INTO public.benefit_prediction_attempts (
    user_id,
    question_id,
    attempt_date,
    attempt_sequence,
    idempotency_key,
    selected_direction,
    is_correct,
    reward_money
  )
  VALUES (
    p_user_id,
    p_question_id,
    p_attempt_date,
    p_attempt_sequence,
    p_idempotency_key,
    p_selected_direction,
    v_is_correct,
    v_attempt_reward_money
  )
  RETURNING * INTO v_attempt;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'price_prediction_attempt',
    v_attempt.id::text,
    v_attempt_reward_money,
    v_wallet.money_balance + v_attempt_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attempt_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attempt_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.benefit_mission_daily_states
  SET
    completed_attempts = completed_attempts + 1,
    updated_at = v_now
  WHERE user_id = p_user_id
    AND mission_kind = 'price_prediction'
    AND mission_date = p_attempt_date
  RETURNING * INTO v_state;

  RETURN jsonb_build_object(
    'alreadyProcessed', false,
    'attemptId', v_attempt.id,
    'isCorrect', v_is_correct,
    'rewardMoney', v_attempt_reward_money,
    'completedAttempts', v_state.completed_attempts,
    'moneyBalance', v_wallet.money_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attend_and_claim_reward(uuid, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_and_claim_reward(uuid, uuid, date, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_prediction_and_claim_reward(uuid, uuid, date, integer, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.attend_and_claim_reward(uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_quiz_and_claim_reward(uuid, uuid, date, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_prediction_and_claim_reward(uuid, uuid, date, integer, text, text) TO service_role;
