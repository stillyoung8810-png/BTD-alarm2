-- VR 밴드 전략 JSON에 cycleWeeks 기본값(2주) 백필
-- 명세: docs/VR_CYCLE_REFACTORING_PLAN_FINAL.md §4.1
-- 이미 cycleWeeks 가 있는 행은 변경하지 않음

UPDATE public.portfolios
SET strategy = jsonb_set(strategy, '{vrBand,cycleWeeks}', '2', true)
WHERE jsonb_typeof(strategy->'vrBand') = 'object'
  AND (strategy->'vrBand'->>'cycleWeeks') IS NULL;

-- 적용 후 검증(선택):
-- select count(*) from public.portfolios
-- where jsonb_typeof(strategy->'vrBand') = 'object'
--   and (strategy->'vrBand'->>'cycleWeeks') is null;
-- 기대: 0
