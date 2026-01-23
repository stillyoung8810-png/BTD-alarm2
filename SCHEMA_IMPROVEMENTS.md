# Supabase 스키마 개선 가이드

## 개요

유료 회원 관리 및 광고 제거 기능을 위한 `user_profiles` 테이블 스키마 개선 작업입니다.

## 변경 사항

### 1. 인덱싱 개선

#### 추가된 인덱스

1. **복합 인덱스**: `idx_user_profiles_tier_status`
   - 컬럼: `(subscription_tier, subscription_status)`
   - 목적: 유료 회원 필터링 성능 향상
   - 사용 쿼리 예시:
     ```sql
     SELECT * FROM user_profiles 
     WHERE subscription_tier = 'premium' AND subscription_status = 'active';
     ```

2. **만료일 인덱스**: `idx_user_profiles_expires_at`
   - 컬럼: `subscription_expires_at`
   - 목적: 만료 예정 회원 조회 성능 향상
   - 사용 쿼리 예시:
     ```sql
     SELECT * FROM user_profiles 
     WHERE subscription_expires_at <= CURRENT_DATE;
     ```

### 2. 제약조건 추가

#### UNIQUE 제약조건: `unique_stripe_customer_id`
- 컬럼: `stripe_customer_id`
- 목적: Stripe 고객 ID 중복 방지 (정산 사고 방지)
- 주의: NULL 값은 허용 (아직 결제하지 않은 사용자)

### 3. 코드 변경사항

#### 새로운 유틸리티 함수 (`utils/subscriptionUtils.ts`)

1. **`shouldShowAds(profile)`**: 광고 표시 여부 판단
   - 유료 티어 + 활성 상태 + 만료되지 않음 = 광고 제거
   - 기존 코드와 호환 (SimpleUserProfile 지원)

2. **`isPaidSubscription(profile)`**: 유료 구독 여부 확인

3. **`isActiveSubscription(profile)`**: 구독 활성 상태 확인

4. **`isNotExpired(profile)`**: 구독 만료 여부 확인

#### App.tsx 변경사항

- `userProfile` 상태 타입 확장: `subscription_status`, `subscription_expires_at` 필드 추가
- `user_profiles` 조회 시 추가 필드 선택: `subscription_status`, `subscription_expires_at`

## 마이그레이션 실행 방법

### 1. Supabase Dashboard에서 실행

1. Supabase Dashboard 접속
2. SQL Editor 열기
3. `supabase/migrations/20240101000000_improve_user_profiles.sql` 파일 내용 복사
4. 실행

### 2. Supabase CLI 사용

```bash
supabase db push
```

### 3. 수동 실행

Supabase SQL Editor에서 직접 실행:

```sql
-- 복합 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier_status 
ON public.user_profiles (subscription_tier, subscription_status);

-- 만료일 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profiles_expires_at 
ON public.user_profiles (subscription_expires_at);

-- UNIQUE 제약조건 추가 (중복 확인 후)
ALTER TABLE public.user_profiles 
ADD CONSTRAINT unique_stripe_customer_id 
UNIQUE (stripe_customer_id);
```

## 기존 코드 호환성

### ✅ 호환성 유지

1. **기존 쿼리**: `subscription_tier, max_portfolios, max_alarms`만 선택하는 쿼리는 그대로 동작
2. **기존 타입**: `SimpleUserProfile` 타입은 그대로 사용 가능
3. **기본값**: `subscription_status` 기본값은 'active'로 유지

### ⚠️ 주의사항

1. **stripe_customer_id UNIQUE 제약조건**
   - 기존에 중복된 값이 있으면 마이그레이션 실패
   - 마이그레이션 전에 중복 확인 필요:
     ```sql
     SELECT stripe_customer_id, COUNT(*) 
     FROM user_profiles 
     WHERE stripe_customer_id IS NOT NULL 
     GROUP BY stripe_customer_id 
     HAVING COUNT(*) > 1;
     ```

2. **NULL 값 처리**
   - `stripe_customer_id`가 NULL인 경우는 UNIQUE 제약조건에 영향 없음
   - 여러 사용자가 NULL을 가질 수 있음

## 사용 예시

### 광고 표시 여부 판단

```typescript
import { shouldShowAds } from './utils/subscriptionUtils';

// 컴포넌트에서 사용
const showAds = shouldShowAds(userProfile);

if (showAds) {
  // 광고 표시
} else {
  // 광고 제거
}
```

### 유료 회원 확인

```typescript
import { isPaidSubscription } from './utils/subscriptionUtils';

if (isPaidSubscription(userProfile)) {
  // 프리미엄 기능 제공
}
```

### 최대 포트폴리오 개수 확인

```typescript
import { getMaxPortfolios } from './utils/subscriptionUtils';

const maxPortfolios = getMaxPortfolios(userProfile);
if (activePortfolios.length >= maxPortfolios) {
  // 제한 메시지 표시
}
```

## 성능 개선 효과

### 인덱스 사용 전후 비교

**복합 인덱스 사용 전:**
```sql
-- 개별 인덱스만 사용 (느림)
WHERE subscription_tier = 'premium' AND subscription_status = 'active';
-- 실행 계획: Index Scan + Filter
```

**복합 인덱스 사용 후:**
```sql
-- 복합 인덱스 사용 (빠름)
WHERE subscription_tier = 'premium' AND subscription_status = 'active';
-- 실행 계획: Index Only Scan
```

### 예상 성능 향상

- 유료 회원 필터링: **2-5배 향상**
- 만료 예정 회원 조회: **3-10배 향상**

## 검증 쿼리

### 인덱스 확인

```sql
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'user_profiles' 
ORDER BY indexname;
```

### 제약조건 확인

```sql
SELECT 
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'user_profiles'::regclass
ORDER BY conname;
```

### 성능 테스트

```sql
-- 복합 인덱스 사용 쿼리
EXPLAIN ANALYZE
SELECT * FROM user_profiles
WHERE subscription_tier = 'premium' 
  AND subscription_status = 'active';
```

## 롤백 방법

필요시 다음 쿼리로 롤백 가능:

```sql
-- 인덱스 삭제
DROP INDEX IF EXISTS idx_user_profiles_tier_status;
DROP INDEX IF EXISTS idx_user_profiles_expires_at;

-- 제약조건 삭제
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS unique_stripe_customer_id;
```

## 향후 확장 계획

1. **결제 시스템 연동**: Stripe webhook을 통한 자동 구독 갱신
2. **구독 만료 알림**: 만료 예정 회원에게 알림 발송
3. **구독 통계**: 유료 회원 비율, 구독 전환율 등 분석
