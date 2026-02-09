-- ============================================
-- sent_alarms, stock_prices 테이블 RLS 활성화
-- ============================================
-- 보안 감사 C-4: RLS 미적용 테이블 해결
--
-- 현재 상태:
--   user_profiles    → RLS 활성화됨 (Dashboard에서 설정됨)
--   portfolios       → RLS 활성화됨 (Dashboard에서 설정됨)
--   user_devices     → RLS 활성화됨 (Dashboard에서 설정됨)
--   portfolio_history→ RLS 활성화됨 (Dashboard에서 설정됨)
--   sent_alarms      → RLS 미활성화 ← 이번에 적용
--   stock_prices     → RLS 미활성화 ← 이번에 적용
-- ============================================


-- ============================================
-- 1. sent_alarms — RLS 활성화 (정책 불필요)
-- ============================================
-- 클라이언트에서 직접 접근하지 않음. Edge Functions(service_role)만 사용.
-- service_role은 RLS를 우회하므로 별도 정책 없이 활성화만 해도 안전.
-- 결과: anon/authenticated 키로는 접근 불가, service_role만 접근 가능.

ALTER TABLE public.sent_alarms ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 2. stock_prices — RLS 활성화 + 인증 사용자 읽기 전용
-- ============================================
-- 클라이언트(stockService.ts)에서 authenticated user로 SELECT만 수행.
-- INSERT/UPDATE/DELETE는 Edge Functions(service_role)과 Python 스크립트(service_role)만 수행.

ALTER TABLE public.stock_prices ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 모든 주가 데이터를 읽을 수 있음 (주가는 공개 시장 데이터)
DROP POLICY IF EXISTS "Authenticated users can read stock prices" ON public.stock_prices;
CREATE POLICY "Authenticated users can read stock prices"
  ON public.stock_prices
  FOR SELECT
  TO authenticated
  USING (true);
