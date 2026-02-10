-- ============================================
-- orders 테이블: 결제 주문 기록
-- ============================================
-- 포트원 V2 결제 결과를 저장하며,
-- 서버 측 결제 검증(verify-payment) 후 상태를 업데이트합니다.
-- ============================================

CREATE TABLE IF NOT EXISTS public.orders (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id    text NOT NULL UNIQUE,          -- 포트원 paymentId (order_xxxx 형식)
  plan_id       text NOT NULL,                 -- 'pro' | 'premium'
  order_name    text NOT NULL,                 -- 주문명 (예: 'PRO 월간 구독권')
  amount        integer NOT NULL CHECK (amount > 0),  -- 결제 금액 (원)
  currency      text NOT NULL DEFAULT 'KRW',
  pay_method    text NOT NULL,                 -- CARD, VIRTUAL_ACCOUNT, TRANSFER, MOBILE, EASY_PAY
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  pg_provider   text NOT NULL DEFAULT 'nicepay',
  pg_tx_id      text,                          -- PG사 거래 ID
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb DEFAULT '{}'::jsonb
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON public.orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.update_orders_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_orders_updated_at();

-- RLS 활성화
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 주문만 조회 가능
CREATE POLICY "Users can view own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 서비스 키(Edge Function)만 INSERT/UPDATE 허용 — 클라이언트 직접 삽입 차단
-- Edge Function은 service_role 키로 RLS를 우회합니다.
-- 클라이언트에서 직접 INSERT하려면 아래 정책 활성화 필요:
-- CREATE POLICY "Users can insert own orders"
--   ON public.orders
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.orders IS '포트원 V2 결제 주문 기록';
COMMENT ON COLUMN public.orders.payment_id IS '포트원 paymentId (order_UUID 형식, 고유)';
COMMENT ON COLUMN public.orders.status IS 'pending → paid/failed/cancelled/refunded';
