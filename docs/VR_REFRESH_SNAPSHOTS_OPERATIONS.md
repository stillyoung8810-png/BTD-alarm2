# refresh-vr-snapshots 운영 · 스모크 테스트

Edge 함수 [`refresh-vr-snapshots`](../supabase/functions/refresh-vr-snapshots/index.ts) 배포 후 **한 번 호출해 동작을 확인**하고, 대시보드 **Functions → Logs**에서 에러가 없는지 봅니다.

## 1. 사전 검증 (로컬)

레포 루트에서:

```bash
deno check supabase/functions/refresh-vr-snapshots/index.ts
```

## 2. 스모크 호출 (PowerShell)

`YOUR_PROJECT_REF` 를 **Settings → General → Reference ID** 로 바꿉니다.

```powershell
curl.exe -s -w "`nHTTP_CODE:%{http_code}" -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-vr-snapshots" -H "Content-Type: application/json" -d "{}"
```

### 기대 결과

- **HTTP 200** 이고 본문에 `{"success":true}` 가 오면 정상입니다.
- **401** 인 경우: [Settings → API](https://supabase.com/dashboard) 에서 **anon** 또는 **service_role** 키로 헤더를 붙입니다 (`--no-verify-jwt` 배포 여부·게이트웨이 정책에 따라 다를 수 있음).

```powershell
$KEY = "여기에_anon_또는_service_role"
curl.exe -s -w "`nHTTP_CODE:%{http_code}" -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-vr-snapshots" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $KEY" `
  -H "apikey: $KEY" `
  -d "{}"
```

## 3. 로그 확인

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 → **Edge Functions** → `refresh-vr-snapshots` → **Logs**
2. 스모크 직후 **500** 또는 `[VR_Refresh_Error]` / `[VR_Batch_Error]` 가 없는지 확인합니다.

## 4. 정기 실행

**화~토 06:10 KST** 등 스케줄은 [VR_REFRESH_SNAPSHOTS_CRON.md](./VR_REFRESH_SNAPSHOTS_CRON.md) 를 따릅니다.

## 5. 원본 코드 변경 시

[`supabase/functions/_shared/README.md`](../supabase/functions/_shared/README.md) 의 동기화 절차를 적용한 뒤 다시 배포합니다.

```bash
npx supabase functions deploy refresh-vr-snapshots --no-verify-jwt
```
