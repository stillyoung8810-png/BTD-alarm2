# 토스 로그인 후 유저 정보 저장 구조 (DB·타입 정리)

## 1. DB 스키마: `user_profiles.toss_user_key`

**마이그레이션**: `supabase/migrations/20260220000000_add_toss_user_key_to_user_profiles.sql`

```sql
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS toss_user_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_toss_user_key
  ON public.user_profiles (toss_user_key)
  WHERE toss_user_key IS NOT NULL;
```

- **컬럼**: `toss_user_key` (text, nullable)
- **역할**: 토스 로그인 시 토스 `userKey`를 저장해, 토스 사용자와 Supabase `user_profiles.id`(＝auth.users.id)를 1:1 매핑
- **Unique**: 동일한 `toss_user_key`로 여러 프로필이 생기지 않도록 인덱스로 보장

---

## 2. 토스 로그인 시 저장 흐름 (BFF)

**파일**: `server/src/toss/AuthService.ts` → `ensureSessionForTossUserKey(tossUserKey)`

1. **기존 유저 조회**  
   `user_profiles`에서 `toss_user_key = tossUserKey`로 `id` 조회.

2. **있으면**  
   해당 유저의 이메일(`toss_${userKey}@toss.placeholder`) + 서버만 아는 managed 비밀번호로 `signInWithPassword` → Supabase 세션(access_token, refresh_token) 반환.

3. **없으면**  
   - `auth.admin.createUser`로 계정 생성 (이메일·managed 비밀번호, `user_metadata: { provider: 'toss', toss_user_key }`).
   - `user_profiles`에 **upsert**: `{ id: user.id, toss_user_key: tossUserKey }` (onConflict: 'id').
   - 생성된 계정으로 `signInWithPassword` 후 세션 반환.

즉, **토스 로그인으로 생성/매핑되는 유저 정보는 Supabase `auth.users` + `user_profiles`(최소한 `id`, `toss_user_key`)에 저장**됩니다.

---

## 3. 클라이언트 타입에 `toss_user_key`가 없는 이유

| 위치 | 타입 | toss_user_key |
|------|------|----------------|
| `utils/subscriptionUtils.ts` | `UserProfile` | ❌ 없음 |
| `types/appUserProfile.ts` | `AppUserProfile` | ❌ 없음 |
| `hooks/useAuth.ts` | `fetchUserProfile` select 목록 | ❌ 조회하지 않음 |

**의도된 동작입니다.**

- `toss_user_key`는 **토스 사용자 ↔ Supabase 유저 매핑**용으로, **BFF(서버)에서만** 사용합니다.
- 클라이언트는 토스 로그인 후 **BFF가 내려준 Supabase 세션**만 받고, 프로필은 `user_profiles`의 **구독·설정·사용량 등**만 조회합니다.
- `useAuth.ts`의 `fetchUserProfile`은 아래 컬럼만 명시적으로 select 합니다.  
  `toss_user_key`는 select 목록에 없고, 따라서 클라이언트 상태/타입에도 넣을 필요가 없습니다.

```ts
// useAuth.ts 47행 부근
.select('subscription_tier, max_portfolios, max_alarms, subscription_status, subscription_expires_at, telegram_enabled, telegram_connected_at, telegram_last_error, preferred_language, timezone, ai_daily_usage, ai_monthly_usage, backtest_daily_usage, last_usage_reset_at')
```

정리하면, **DB에는 `toss_user_key`가 있고 BFF가 읽/쓰기 하며, 클라이언트 타입/조회에는 의도적으로 포함하지 않은 구조**입니다.

---

## 4. 추후 IAP 등에서 `toss_user_key`가 필요할 때

- 토스 IAP **주문 상태 조회 API**(`get-order-status`) 등에서는 요청 헤더에 **`x-toss-user-key`**가 필요할 수 있습니다.
- 현재는 BFF가 토스 로그인 시점에만 `userKey`를 받아 사용하고, **클라이언트에는 `toss_user_key`를 내려주지 않습니다**.
- 그런 API를 쓸 계획이면 다음 중 하나가 필요합니다.
  - **옵션 A**: BFF가 토스 로그인/토큰 교환 시 받은 `userKey`를 세션 또는 `user_metadata` 등에 넣어 두고, IAP 검증 시 BFF가 DB의 `user_profiles.toss_user_key` 또는 그 저장값을 읽어 `x-toss-user-key`로 사용.
  - **옵션 B**: 클라이언트가 `userKey`를 알 필요가 있다면, BFF가 로그인 응답에 넣어 주고, 클라이언트는 IAP 관련 API 호출 시 BFF에 넘기고, BFF가 `x-toss-user-key`로 사용 (가급적 클라이언트에 장기 보관하지 않는 쪽이 안전).

현재 구조만 보면 **DB와 BFF에서만 `toss_user_key`를 다루고, 클라이언트 타입에는 넣지 않은 상태가 일관되게 유지**되고 있습니다.
