-- ============================================
-- Benefit Toss promotion execution RPCs
-- ============================================
-- Railway BFF calls these RPCs with service_role.
-- External Toss API calls must stay outside DB row locks.
-- ============================================

CREATE OR REPLACE FUNCTION public.begin_benefit_toss_promotion_attempt(
  p_user_id uuid,
  p_payout_id uuid,
  p_redeem_request_id text,
  p_promotion_key text,
  p_key_issued_at timestamptz,
  p_key_expires_at timestamptz,
  p_processing_retry_at timestamptz,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_payout public.benefit_toss_point_payouts%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required';
  END IF;

  IF btrim(COALESCE(p_redeem_request_id, '')) = '' THEN
    RAISE EXCEPTION 'redeem_request_id_required';
  END IF;

  IF btrim(COALESCE(p_promotion_key, '')) = '' THEN
    RAISE EXCEPTION 'promotion_key_required';
  END IF;

  IF p_key_issued_at IS NULL OR p_key_expires_at IS NULL THEN
    RAISE EXCEPTION 'promotion_key_time_required';
  END IF;

  IF p_key_expires_at <= p_key_issued_at THEN
    RAISE EXCEPTION 'promotion_key_expiration_invalid';
  END IF;

  SELECT *
  INTO v_payout
  FROM public.benefit_toss_point_payouts
  WHERE id = p_payout_id
    AND user_id = p_user_id
    AND redeem_request_id = p_redeem_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_payout.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'canExecute', false,
      'reason', 'payout_already_finalized',
      'payoutId', v_payout.id,
      'status', v_payout.status,
      'redeemRequestId', v_payout.redeem_request_id,
      'tossPointAmount', v_payout.toss_point_amount,
      'moneyBalance', v_wallet.money_balance,
      'nextPromotionRetryAt', v_payout.next_promotion_retry_at
    );
  END IF;

  IF v_payout.toss_point_amount > 5000 THEN
    RAISE EXCEPTION 'toss_point_amount_exceeds_per_request_limit';
  END IF;

  IF
    NOT p_force
    AND v_payout.next_promotion_retry_at IS NOT NULL
    AND v_payout.next_promotion_retry_at > v_now
  THEN
    RETURN jsonb_build_object(
      'canExecute', false,
      'reason', 'retry_not_due',
      'payoutId', v_payout.id,
      'status', v_payout.status,
      'redeemRequestId', v_payout.redeem_request_id,
      'tossPointAmount', v_payout.toss_point_amount,
      'moneyBalance', v_wallet.money_balance,
      'nextPromotionRetryAt', v_payout.next_promotion_retry_at
    );
  END IF;

  UPDATE public.benefit_toss_point_payouts
  SET
    toss_promotion_key = p_promotion_key,
    toss_promotion_key_issued_at = p_key_issued_at,
    toss_promotion_key_expires_at = p_key_expires_at,
    promotion_attempt_count = promotion_attempt_count + 1,
    last_promotion_attempt_at = v_now,
    next_promotion_retry_at = p_processing_retry_at,
    toss_error_code = NULL,
    toss_error_message = NULL
  WHERE id = v_payout.id
  RETURNING * INTO v_payout;

  RETURN jsonb_build_object(
    'canExecute', true,
    'reason', 'ready',
    'payoutId', v_payout.id,
    'status', v_payout.status,
    'redeemRequestId', v_payout.redeem_request_id,
    'promotionCode', v_payout.promotion_code,
    'promotionKey', v_payout.toss_promotion_key,
    'tossPointAmount', v_payout.toss_point_amount,
    'redeemedMoney', v_payout.redeemed_money,
    'moneyBalance', v_wallet.money_balance,
    'promotionAttemptCount', v_payout.promotion_attempt_count,
    'nextPromotionRetryAt', v_payout.next_promotion_retry_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_benefit_toss_promotion_retry(
  p_user_id uuid,
  p_payout_id uuid,
  p_redeem_request_id text,
  p_error_code text,
  p_error_message text,
  p_next_promotion_retry_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.benefit_toss_point_payouts%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required';
  END IF;

  IF btrim(COALESCE(p_redeem_request_id, '')) = '' THEN
    RAISE EXCEPTION 'redeem_request_id_required';
  END IF;

  SELECT *
  INTO v_payout
  FROM public.benefit_toss_point_payouts
  WHERE id = p_payout_id
    AND user_id = p_user_id
    AND redeem_request_id = p_redeem_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_payout.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'status', v_payout.status,
      'payoutId', v_payout.id,
      'redeemRequestId', v_payout.redeem_request_id,
      'tossPointAmount', v_payout.toss_point_amount,
      'moneyBalance', v_wallet.money_balance,
      'nextPromotionRetryAt', v_payout.next_promotion_retry_at
    );
  END IF;

  UPDATE public.benefit_toss_point_payouts
  SET
    toss_error_code = NULLIF(btrim(COALESCE(p_error_code, '')), ''),
    toss_error_message = NULLIF(btrim(COALESCE(p_error_message, '')), ''),
    next_promotion_retry_at = p_next_promotion_retry_at
  WHERE id = v_payout.id
  RETURNING * INTO v_payout;

  RETURN jsonb_build_object(
    'status', v_payout.status,
    'payoutId', v_payout.id,
    'redeemRequestId', v_payout.redeem_request_id,
    'tossPointAmount', v_payout.toss_point_amount,
    'moneyBalance', v_wallet.money_balance,
    'nextPromotionRetryAt', v_payout.next_promotion_retry_at,
    'tossErrorCode', v_payout.toss_error_code,
    'tossErrorMessage', v_payout.toss_error_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_benefit_toss_promotion_success(
  p_user_id uuid,
  p_payout_id uuid,
  p_redeem_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_payout public.benefit_toss_point_payouts%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required';
  END IF;

  IF btrim(COALESCE(p_redeem_request_id, '')) = '' THEN
    RAISE EXCEPTION 'redeem_request_id_required';
  END IF;

  SELECT *
  INTO v_payout
  FROM public.benefit_toss_point_payouts
  WHERE id = p_payout_id
    AND user_id = p_user_id
    AND redeem_request_id = p_redeem_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_payout.status = 'pending' THEN
    UPDATE public.benefit_toss_point_payouts
    SET
      status = 'success',
      completed_at = v_now,
      next_promotion_retry_at = NULL,
      toss_error_code = NULL,
      toss_error_message = NULL
    WHERE id = v_payout.id
    RETURNING * INTO v_payout;
  END IF;

  RETURN jsonb_build_object(
    'status', v_payout.status,
    'payoutId', v_payout.id,
    'redeemRequestId', v_payout.redeem_request_id,
    'tossPointAmount', v_payout.toss_point_amount,
    'redeemedMoney', v_payout.redeemed_money,
    'moneyBalance', v_wallet.money_balance,
    'completedAt', v_payout.completed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_benefit_toss_promotion_failure(
  p_user_id uuid,
  p_payout_id uuid,
  p_redeem_request_id text,
  p_error_code text,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_payout public.benefit_toss_point_payouts%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_ledger_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required';
  END IF;

  IF btrim(COALESCE(p_redeem_request_id, '')) = '' THEN
    RAISE EXCEPTION 'redeem_request_id_required';
  END IF;

  SELECT *
  INTO v_payout
  FROM public.benefit_toss_point_payouts
  WHERE id = p_payout_id
    AND user_id = p_user_id
    AND redeem_request_id = p_redeem_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_payout.status = 'success' THEN
    RETURN jsonb_build_object(
      'status', v_payout.status,
      'payoutId', v_payout.id,
      'redeemRequestId', v_payout.redeem_request_id,
      'tossPointAmount', v_payout.toss_point_amount,
      'redeemedMoney', v_payout.redeemed_money,
      'restoredMoney', 0,
      'moneyBalance', v_wallet.money_balance,
      'completedAt', v_payout.completed_at
    );
  END IF;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'toss_redeem_restore',
    p_redeem_request_id,
    v_payout.redeemed_money,
    v_wallet.money_balance + v_payout.redeemed_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_payout.redeemed_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.benefit_toss_point_payouts
  SET
    status = 'failed',
    completed_at = COALESCE(completed_at, v_now),
    next_promotion_retry_at = NULL,
    toss_error_code = NULLIF(btrim(COALESCE(p_error_code, '')), ''),
    toss_error_message = NULLIF(btrim(COALESCE(p_error_message, '')), '')
  WHERE id = v_payout.id
  RETURNING * INTO v_payout;

  RETURN jsonb_build_object(
    'status', v_payout.status,
    'payoutId', v_payout.id,
    'redeemRequestId', v_payout.redeem_request_id,
    'tossPointAmount', v_payout.toss_point_amount,
    'redeemedMoney', v_payout.redeemed_money,
    'restoredMoney', CASE WHEN v_ledger_id IS NULL THEN 0 ELSE v_payout.redeemed_money END,
    'moneyBalance', v_wallet.money_balance,
    'completedAt', v_payout.completed_at,
    'tossErrorCode', v_payout.toss_error_code,
    'tossErrorMessage', v_payout.toss_error_message
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_benefit_toss_promotion_attempt(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_benefit_toss_promotion_retry(uuid, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_benefit_toss_promotion_success(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_benefit_toss_promotion_failure(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_benefit_toss_promotion_attempt(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_benefit_toss_promotion_retry(uuid, uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_benefit_toss_promotion_success(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_benefit_toss_promotion_failure(uuid, uuid, text, text, text) TO service_role;
