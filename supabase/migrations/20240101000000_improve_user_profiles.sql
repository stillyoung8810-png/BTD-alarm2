-- ============================================
-- user_profiles 테이블 개선 마이그레이션
-- ============================================
-- 목적: 유료 회원 관리 및 광고 제거 기능을 위한 스키마 개선
-- 날짜: 2024-01-01
-- 
-- 기존 인덱스:
-- - idx_user_profiles_subscription_tier (subscription_tier)
-- - idx_user_profiles_subscription_status (subscription_status)
-- - idx_user_profiles_subscription_expires (subscription_expires_at)
-- ============================================

-- 1. 복합 인덱스 추가 (subscription_tier + subscription_status)
-- 구독 상태와 티어를 동시에 조회하는 쿼리 성능 향상
-- 기존 개별 인덱스보다 복합 인덱스가 동시 조건 조회 시 더 효율적
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier_status 
ON public.user_profiles (subscription_tier, subscription_status);

COMMENT ON INDEX idx_user_profiles_tier_status IS 
'구독 티어와 상태를 동시에 조회할 때 사용하는 복합 인덱스. 유료 회원 필터링 성능 향상.';

-- 2. stripe_customer_id UNIQUE 제약조건 추가
-- 한 명의 Stripe 고객이 여러 프로필에 연결되는 것을 방지 (정산 사고 방지)
-- 기존에 NULL이 아닌 중복 값이 있는지 먼저 확인 필요
DO $$
DECLARE
  duplicate_count INTEGER;
  constraint_exists BOOLEAN;
BEGIN
  -- 이미 제약조건이 존재하는지 확인
  SELECT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'unique_stripe_customer_id'
      AND conrelid = 'public.user_profiles'::regclass
  ) INTO constraint_exists;
  
  IF constraint_exists THEN
    RAISE NOTICE 'unique_stripe_customer_id 제약조건이 이미 존재합니다.';
  ELSE
    -- 중복된 stripe_customer_id가 있는지 확인 (NULL 제외)
    SELECT COUNT(*) INTO duplicate_count
    FROM (
      SELECT stripe_customer_id, COUNT(*) as cnt
      FROM public.user_profiles
      WHERE stripe_customer_id IS NOT NULL
      GROUP BY stripe_customer_id
      HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
      RAISE WARNING '중복된 stripe_customer_id가 %개 발견되었습니다. 먼저 중복을 해결해야 합니다.', duplicate_count;
      RAISE NOTICE '중복 확인 쿼리: SELECT stripe_customer_id, COUNT(*), array_agg(id) FROM public.user_profiles WHERE stripe_customer_id IS NOT NULL GROUP BY stripe_customer_id HAVING COUNT(*) > 1;';
    ELSE
      -- UNIQUE 제약조건 추가 (NULL 값은 허용)
      ALTER TABLE public.user_profiles 
      ADD CONSTRAINT unique_stripe_customer_id 
      UNIQUE (stripe_customer_id);
      
      RAISE NOTICE 'stripe_customer_id UNIQUE 제약조건이 성공적으로 추가되었습니다.';
    END IF;
  END IF;
END $$;

COMMENT ON CONSTRAINT unique_stripe_customer_id ON public.user_profiles IS 
'Stripe 고객 ID는 유일해야 합니다. 한 고객이 여러 프로필에 연결되는 것을 방지합니다.';

-- 3. subscription_expires_at 인덱스 최적화
-- 기존 인덱스(idx_user_profiles_subscription_expires)가 있지만,
-- NULL 값이 많은 경우 부분 인덱스가 더 효율적
-- 기존 인덱스를 부분 인덱스로 교체 (선택사항)
-- 주의: 기존 인덱스를 삭제하고 재생성하므로 잠깐의 성능 저하가 있을 수 있음
-- 
-- NULL 값이 많지 않다면 이 단계는 스킵해도 됨
-- 
-- DROP INDEX IF EXISTS idx_user_profiles_subscription_expires;
-- CREATE INDEX idx_user_profiles_subscription_expires 
-- ON public.user_profiles (subscription_expires_at)
-- WHERE subscription_expires_at IS NOT NULL;
--
-- 위 코드는 주석 처리되어 있습니다. 필요시 주석을 해제하여 실행하세요.

-- 4. subscription_status 기본값은 기존과 동일하게 유지 ('active')
-- 기존 코드와의 호환성을 위해 변경하지 않음
-- 참고: 
-- - free 티어 사용자는 subscription_status가 'active'이지만, subscription_tier = 'free'로 구분
-- - subscription_status 가능한 값: 'active', 'cancelled', 'expired', 'trial'
-- - subscription_tier 가능한 값: 'free', 'pro', 'premium', 'enterprise'

-- ============================================
-- 마이그레이션 완료 확인
-- ============================================
-- 다음 쿼리로 인덱스가 제대로 생성되었는지 확인:
-- 
-- SELECT 
--   indexname, 
--   indexdef,
--   pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
-- FROM pg_indexes 
-- WHERE tablename = 'user_profiles' 
-- ORDER BY indexname;
--
-- 제약조건 확인:
-- SELECT 
--   conname AS constraint_name,
--   contype AS constraint_type,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'user_profiles'::regclass
--   AND conname = 'unique_stripe_customer_id';
