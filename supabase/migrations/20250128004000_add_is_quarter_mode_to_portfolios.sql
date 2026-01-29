-- ============================================
-- portfolios.is_quarter_mode 컬럼 추가
-- ============================================
-- 목적: 다분할 매매법에서 T > a-1 일 때 쿼터 손절 모드 진입을 코드로 구분 (토글 제거)
-- 사용: LOC 매도 체결(보유수량 24% 이상 감소) 또는 +A% 지정가 매도로 수량 0(99% 이상 감소) 시 false로 해제
-- 날짜: 2025-01-28
-- ============================================

ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS is_quarter_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.portfolios.is_quarter_mode IS
'다분할 매매법 쿼터 손절 모드 여부. T > a-1 이면 true, LOC/지정가 매도로 복귀 시 false.';
