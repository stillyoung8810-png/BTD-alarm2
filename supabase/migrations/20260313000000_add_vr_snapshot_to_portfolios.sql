-- VR 밴드 스냅샷(JSON). 앱·Edge는 snake_case 컬럼명만 사용합니다.
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS vr_snapshot jsonb;

COMMENT ON COLUMN public.portfolios.vr_snapshot IS
  'VR band strategy: Pool/V/bands/order ladder snapshot (JSON).';
