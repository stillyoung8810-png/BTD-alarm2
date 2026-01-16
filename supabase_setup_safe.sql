-- ============================================
-- 안전한 portfolios 테이블 설정 SQL
-- ============================================

-- 1. 테이블 생성 (기존 테이블이 있으면 유지됨)
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

-- 2. 누락된 컬럼 추가 (기존 테이블이 있을 경우를 대비)
-- 이미 존재하는 컬럼은 무시되고, 없는 컬럼만 추가됩니다.
DO $$ 
BEGIN
  -- daily_buy_amount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'daily_buy_amount') THEN
    ALTER TABLE portfolios ADD COLUMN daily_buy_amount numeric NOT NULL DEFAULT 0;
  END IF;
  
  -- start_date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'start_date') THEN
    ALTER TABLE portfolios ADD COLUMN start_date text NOT NULL DEFAULT '';
  END IF;
  
  -- fee_rate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'fee_rate') THEN
    ALTER TABLE portfolios ADD COLUMN fee_rate numeric DEFAULT 0.25;
  END IF;
  
  -- is_closed
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'is_closed') THEN
    ALTER TABLE portfolios ADD COLUMN is_closed boolean DEFAULT false;
  END IF;
  
  -- closed_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'closed_at') THEN
    ALTER TABLE portfolios ADD COLUMN closed_at timestamp with time zone;
  END IF;
  
  -- final_sell_amount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'final_sell_amount') THEN
    ALTER TABLE portfolios ADD COLUMN final_sell_amount numeric;
  END IF;
  
  -- alarm_config
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'alarm_config') THEN
    ALTER TABLE portfolios ADD COLUMN alarm_config jsonb;
  END IF;
  
  -- user_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portfolios' AND column_name = 'user_id') THEN
    ALTER TABLE portfolios ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_created_at ON portfolios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolios_is_closed ON portfolios(is_closed);

-- 4. RLS 활성화
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- 5. 정책 재설정 (DROP 후 CREATE)
-- 기존에 있을 법한 정책 이름을 모두 삭제합니다.
DROP POLICY IF EXISTS "Users can view own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can insert own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can update own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can delete own portfolios" ON portfolios;
DROP POLICY IF EXISTS "portfolios_owner_all_access" ON portfolios;

-- 새로 정책 생성
CREATE POLICY "Users can view own portfolios" 
  ON portfolios FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolios" 
  ON portfolios FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolios" 
  ON portfolios FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolios" 
  ON portfolios FOR DELETE 
  USING (auth.uid() = user_id);
