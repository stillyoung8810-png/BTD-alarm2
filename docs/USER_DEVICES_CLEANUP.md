# user_devices 정책 및 4일 이상 비활성 토큰 삭제

## 정책 (A+D)

- **기기당 1개 토큰**: 같은 (user_id, fcm_token) 은 한 행으로 유지. 여러 기기 = 여러 행.
- **여러 기기 푸시**: 서로 다른 기기(Chrome, Edge, 폰 등)에서 각각 토큰 등록 시 모두 수신 가능.
- **4일 이상 된 비활성 토큰 삭제**: `is_active = false` 이고 `updated_at` 이 **4일 지난** 행만 삭제. 활성 토큰·최근 비활성은 유지.

---

## 자동 정리 (권장)

### 1. 마이그레이션 적용

`supabase/migrations/20250130000002_cleanup_old_inactive_user_devices.sql` 가 적용되면  
`public.cleanup_old_inactive_user_devices()` 함수가 생성됩니다.

### 2. 매일 자동 실행 (pg_cron)

Supabase Dashboard → **SQL Editor**에서 아래 실행 (pg_cron이 이미 활성화된 프로젝트):

```sql
SELECT cron.schedule(
  'cleanup-old-inactive-user-devices',
  '0 3 * * *',
  $$SELECT public.cleanup_old_inactive_user_devices();$$
);
```

- **스케줄**: 매일 **UTC 03:00** (한국 시간 12:00). 원하면 `0 3 * * *` 를 다른 cron 표현으로 변경 가능.

### 3. 수동 실행

한 번만 실행해 보려면:

```sql
SELECT public.cleanup_old_inactive_user_devices();
```

반환값은 **삭제된 행 수**입니다.

---

## 동작 요약

| 조건 | 처리 |
|------|------|
| `is_active = true` | 삭제 안 함 (어느 시점에 등록했든 유지) |
| `is_active = false` 이고 `updated_at` ≥ 4일 전 | 삭제 |
| `is_active = false` 이고 `updated_at` < 4일 | 삭제 안 함 (최근 실패 토큰은 유지) |

이렇게 하면 오래된 비활성 토큰만 정리되고, 활성·최근 비활성은 유지됩니다.
