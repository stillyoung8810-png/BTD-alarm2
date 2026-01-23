# Supabase 마이그레이션 가이드

## 마이그레이션 실행 방법

### 1. Supabase Dashboard에서 실행 (권장)

1. [Supabase Dashboard](https://app.supabase.com) 접속
2. 프로젝트 선택
3. 좌측 메뉴에서 **SQL Editor** 클릭
4. `20240101000000_improve_user_profiles.sql` 파일 내용 복사하여 붙여넣기
5. **Run** 버튼 클릭

### 2. Supabase CLI 사용

```bash
# 마이그레이션 적용
supabase db push

# 또는 특정 마이그레이션만 실행
supabase migration up
```

### 3. 수동 실행

SQL Editor에서 단계별로 실행:

```sql
-- 1단계: 복합 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier_status 
ON public.user_profiles (subscription_tier, subscription_status);

-- 2단계: 만료일 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profiles_expires_at 
ON public.user_profiles (subscription_expires_at)
WHERE subscription_expires_at IS NOT NULL;

-- 3단계: 중복 확인 (중요!)
SELECT stripe_customer_id, COUNT(*) 
FROM public.user_profiles 
WHERE stripe_customer_id IS NOT NULL 
GROUP BY stripe_customer_id 
HAVING COUNT(*) > 1;

-- 4단계: UNIQUE 제약조건 추가 (중복이 없을 때만)
ALTER TABLE public.user_profiles 
ADD CONSTRAINT unique_stripe_customer_id 
UNIQUE (stripe_customer_id);
```

## 마이그레이션 전 확인사항

### 1. 중복 데이터 확인

```sql
-- stripe_customer_id 중복 확인
SELECT stripe_customer_id, COUNT(*) as count, array_agg(id) as user_ids
FROM public.user_profiles 
WHERE stripe_customer_id IS NOT NULL 
GROUP BY stripe_customer_id 
HAVING COUNT(*) > 1;
```

중복이 발견되면:
- 중복된 사용자 중 하나만 유지
- 나머지는 `stripe_customer_id`를 NULL로 설정
- 또는 수동으로 정리

### 2. 기존 인덱스 확인

```sql
-- 현재 인덱스 목록 확인
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'user_profiles' 
ORDER BY indexname;
```

## 마이그레이션 후 검증

### 1. 인덱스 생성 확인

```sql
SELECT 
  indexname, 
  indexdef,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes 
WHERE tablename = 'user_profiles' 
  AND indexname IN (
    'idx_user_profiles_tier_status',
    'idx_user_profiles_expires_at'
  )
ORDER BY indexname;
```

### 2. 제약조건 확인

```sql
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'user_profiles'::regclass
  AND conname = 'unique_stripe_customer_id';
```

### 3. 성능 테스트

```sql
-- 복합 인덱스 사용 쿼리 테스트
EXPLAIN ANALYZE
SELECT * FROM user_profiles
WHERE subscription_tier = 'premium' 
  AND subscription_status = 'active';

-- 만료일 인덱스 사용 쿼리 테스트
EXPLAIN ANALYZE
SELECT * FROM user_profiles
WHERE subscription_expires_at <= CURRENT_DATE
  AND subscription_expires_at IS NOT NULL;
```

## 롤백 방법

문제 발생 시 다음 쿼리로 롤백:

```sql
-- 인덱스 삭제
DROP INDEX IF EXISTS idx_user_profiles_tier_status;
DROP INDEX IF EXISTS idx_user_profiles_expires_at;

-- 제약조건 삭제
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS unique_stripe_customer_id;
```

## 주의사항

1. **프로덕션 환경**: 마이그레이션 전 백업 필수
2. **트래픽**: 낮은 트래픽 시간대에 실행 권장
3. **모니터링**: 마이그레이션 후 성능 모니터링 권장
4. **중복 데이터**: `stripe_customer_id` 중복이 있으면 마이그레이션 실패
