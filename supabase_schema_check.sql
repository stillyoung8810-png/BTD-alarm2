-- ============================================
-- portfolios 테이블 스키마 확인 및 수정 SQL
-- ============================================

-- 현재 제공된 스키마에 따르면 모든 컬럼이 이미 존재합니다.
-- 하지만 혹시 누락된 컬럼이 있다면 아래 ALTER TABLE 문을 실행하세요.

-- 1. daily_buy_amount (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS daily_buy_amount numeric NOT NULL DEFAULT 0;

-- 2. start_date (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS start_date text NOT NULL;

-- 3. fee_rate (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS fee_rate numeric DEFAULT 0.25;

-- 4. is_closed (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS is_closed boolean DEFAULT false;

-- 5. closed_at (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

-- 6. final_sell_amount (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS final_sell_amount numeric;

-- 7. alarm_config (이미 존재)
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS alarm_config jsonb;

-- ============================================
-- 전체 테이블 재생성 SQL (필요시 사용)
-- ============================================

-- 기존 테이블 삭제 (주의: 모든 데이터가 삭제됩니다!)
-- DROP TABLE IF EXISTS portfolios CASCADE;

-- 테이블 생성
CREATE TABLE IF NOT EXISTS portfolios (
  id text PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  name text NOT NULL,
  daily_buy_amount numeric NOT NULL,
  start_date text NOT NULL,
  fee_rate numeric DEFAULT 0.25,
  is_closed boolean DEFAULT false,
  closed_at timestamp with time zone,
  final_sell_amount numeric,
  trades jsonb DEFAULT '[]'::jsonb,
  strategy jsonb NOT NULL,
  alarm_config jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_created_at ON portfolios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolios_is_closed ON portfolios(is_closed);

-- Row Level Security (RLS) 정책 (이미 설정되어 있다면 생략)
-- 사용자는 자신의 포트폴리오만 조회/수정/삭제 가능
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- 정책 생성 (이미 있다면 생략)
-- SELECT 정책: 자신의 포트폴리오만 조회
CREATE POLICY IF NOT EXISTS "Users can view own portfolios"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT 정책: 자신의 포트폴리오만 생성
CREATE POLICY IF NOT EXISTS "Users can insert own portfolios"
  ON portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE 정책: 자신의 포트폴리오만 수정
CREATE POLICY IF NOT EXISTS "Users can update own portfolios"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE 정책: 자신의 포트폴리오만 삭제
CREATE POLICY IF NOT EXISTS "Users can delete own portfolios"
  ON portfolios FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 컬럼 매핑 정리 (코드 ↔ DB)
-- ============================================
-- 
-- JavaScript/TypeScript (camelCase)  →  Supabase DB (snake_case)
-- ============================================
-- dailyBuyAmount                    →  daily_buy_amount
-- startDate                         →  start_date
-- feeRate                           →  fee_rate
-- isClosed                          →  is_closed
-- closedAt                          →  closed_at
-- finalSellAmount                   →  final_sell_amount
-- alarmConfig                       →  alarm_config
-- 
-- 그대로 사용 (변환 불필요):
-- name                              →  name
-- id                                →  id
-- trades                            →  trades
-- strategy                          →  strategy
-- user_id                           →  user_id (코드에서 추가)
-- created_at                        →  created_at (DB 자동 생성)
-- ============================================
