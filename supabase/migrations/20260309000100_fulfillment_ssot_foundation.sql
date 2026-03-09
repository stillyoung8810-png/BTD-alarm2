-- ============================================
-- Fulfillment SSOT 기반 정합성 보강
-- 1. user_profiles: pending_plan / pending_plan_effective_at
-- 2. orders.status: processing 상태 추가
-- 3. 주문 처리권 확보용 얇은 RPC claim_order_processing 추가
-- ============================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS pending_plan text,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_pending_plan_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_pending_plan_check
      CHECK (pending_plan IS NULL OR pending_plan IN ('pro', 'premium'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_pending_plan_effective_at
  ON public.user_profiles (pending_plan_effective_at)
  WHERE pending_plan IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.pending_plan IS
  '현재 기간 종료 후 적용할 다음 플랜. PREMIUM -> PRO 다운그레이드 대기 등에 사용.';
COMMENT ON COLUMN public.user_profiles.pending_plan_effective_at IS
  'pending_plan 이 실제 권한으로 전환되는 UTC 시각.';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'));

COMMENT ON COLUMN public.orders.status IS
  'pending -> processing -> paid/failed/cancelled/refunded';

CREATE OR REPLACE FUNCTION public.claim_order_processing(
  p_payment_id text,
  p_user_id uuid,
  p_plan_id text,
  p_order_name text,
  p_amount integer,
  p_currency text,
  p_pay_method text,
  p_pg_provider text,
  p_pg_tx_id text,
  p_paid_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.orders (
      user_id,
      payment_id,
      plan_id,
      order_name,
      amount,
      currency,
      pay_method,
      status,
      pg_provider,
      pg_tx_id,
      paid_at,
      metadata
    ) VALUES (
      p_user_id,
      p_payment_id,
      p_plan_id,
      p_order_name,
      p_amount,
      COALESCE(NULLIF(p_currency, ''), 'KRW'),
      COALESCE(NULLIF(p_pay_method, ''), 'UNKNOWN'),
      'processing',
      COALESCE(NULLIF(p_pg_provider, ''), 'unknown'),
      NULLIF(p_pg_tx_id, ''),
      COALESCE(p_paid_at, timezone('utc'::text, now())),
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object(
      'success', true,
      'claimed', true,
      'status', v_existing.status,
      'order_id', v_existing.id
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT *
  INTO v_existing
  FROM public.orders
  WHERE payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order row not found after unique_violation'
    );
  END IF;

  IF v_existing.user_id IS NOT NULL AND v_existing.user_id <> p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'payment_id already belongs to another user',
      'status', v_existing.status,
      'order_id', v_existing.id
    );
  END IF;

  IF v_existing.status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'claimed', false,
      'already_processed', true,
      'status', v_existing.status,
      'order_id', v_existing.id
    );
  END IF;

  IF v_existing.status = 'processing' THEN
    RETURN jsonb_build_object(
      'success', true,
      'claimed', false,
      'in_progress', true,
      'status', v_existing.status,
      'order_id', v_existing.id
    );
  END IF;

  UPDATE public.orders
  SET
    user_id = p_user_id,
    plan_id = p_plan_id,
    order_name = p_order_name,
    amount = p_amount,
    currency = COALESCE(NULLIF(p_currency, ''), 'KRW'),
    pay_method = COALESCE(NULLIF(p_pay_method, ''), 'UNKNOWN'),
    status = 'processing',
    pg_provider = COALESCE(NULLIF(p_pg_provider, ''), pg_provider),
    pg_tx_id = COALESCE(NULLIF(p_pg_tx_id, ''), pg_tx_id),
    paid_at = COALESCE(p_paid_at, paid_at, timezone('utc'::text, now())),
    metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = timezone('utc'::text, now())
  WHERE id = v_existing.id;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'status', 'processing',
    'order_id', v_existing.id
  );
END;
$$;

COMMENT ON FUNCTION public.claim_order_processing(text, uuid, text, text, integer, text, text, text, text, timestamptz, jsonb) IS
  '결제 Fulfillment 처리권을 원자적으로 확보하는 얇은 RPC. 멤버십 계산은 애플리케이션 레이어에서 수행한다.';
