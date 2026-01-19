-- ============================================
-- 종료된 포트폴리오 이력 저장 테이블 설정 SQL
-- ============================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS portfolio_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- 포트폴리오 참조 (기존 portfolios 테이블의 id는 text 타입이므로 text로 설정)
  -- 원본 포트폴리오가 삭제되어도 이력은 유지되도록 외래키 제약은 설정하지 않음
  portfolio_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- 포트폴리오 스냅샷 정보
  portfolio_name text NOT NULL,
  
  -- 금융 지표
  total_invested numeric NOT NULL DEFAULT 0,
  total_return numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  yield_rate numeric NOT NULL DEFAULT 0,
  
  -- 날짜 정보
  start_date date NOT NULL,
  end_date timestamp with time zone NOT NULL,
  
  -- 전략 상세 정보 (JSONB)
  strategy_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- 추가 메모 (선택사항)
  notes text
  
  -- 원본 포트폴리오가 삭제되어도 이력은 유지되도록 외래키 제약은 설정하지 않음
  -- 대신 portfolio_id는 참조용으로만 사용
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_id ON portfolio_history(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_portfolio_id ON portfolio_history(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_end_date ON portfolio_history(end_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_created_at ON portfolio_history(created_at DESC);

-- 3. updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_portfolio_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. updated_at 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_portfolio_history_updated_at ON portfolio_history;
CREATE TRIGGER trigger_update_portfolio_history_updated_at
  BEFORE UPDATE ON portfolio_history
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_history_updated_at();

-- 5. RLS 활성화
ALTER TABLE portfolio_history ENABLE ROW LEVEL SECURITY;

-- 6. 기존 정책 삭제
DROP POLICY IF EXISTS "Users can view own portfolio history" ON portfolio_history;
DROP POLICY IF EXISTS "Users can insert own portfolio history" ON portfolio_history;
DROP POLICY IF EXISTS "Users can update own portfolio history" ON portfolio_history;
DROP POLICY IF EXISTS "Users can delete own portfolio history" ON portfolio_history;

-- 7. RLS 정책 생성
CREATE POLICY "Users can view own portfolio history" 
  ON portfolio_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolio history" 
  ON portfolio_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolio history" 
  ON portfolio_history FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolio history" 
  ON portfolio_history FOR DELETE 
  USING (auth.uid() = user_id);

-- 8. 코멘트 추가 (선택사항 - 테이블 및 컬럼 설명)
COMMENT ON TABLE portfolio_history IS '종료된 포트폴리오의 이력 정보를 저장하는 테이블';
COMMENT ON COLUMN portfolio_history.portfolio_id IS '원본 portfolios 테이블의 id (참조용, 외래키 제약 없음)';
COMMENT ON COLUMN portfolio_history.portfolio_name IS '포트폴리오 이름 스냅샷 (원본 삭제 대비)';
COMMENT ON COLUMN portfolio_history.total_invested IS '총 투자금: Σ(매수금 + 수수료)';
COMMENT ON COLUMN portfolio_history.total_return IS '총 회수금: Σ(매도금 - 수수료)';
COMMENT ON COLUMN portfolio_history.total_profit IS '총 수익금: 회수금 - 투자금';
COMMENT ON COLUMN portfolio_history.yield_rate IS '수익률: (수익금 / 투자금) * 100';
COMMENT ON COLUMN portfolio_history.strategy_detail IS '사용된 전략 설정 (MA, RSI 기준 등) JSON 형식';
