# 🛡️ Deno Edge Function Shared Quarantine Zone (보세 구역)

**[경고] 이 폴더의 파일들은 프론트엔드/앱 원본 파일의 ‘독립된 사본’입니다.**

Deno 런타임·Supabase 번들러의 엄격한 모듈 리졸루션(상대 경로에 **`.ts` 확장자** 필요) 이슈를 피하고, Vite 등 프론트 빌드 체인과의 import 규칙 충돌을 막기 위해 **물리적으로 격리**되었습니다.  
**루트의 동명 파일을 이 폴더에서 직접 import 하지 마세요.** Edge 함수는 항상 `../_shared/*.ts` 만 참조합니다.

## 🔄 동기화 (Sync) 매뉴얼

앱 루트에서 아래 **원본**을 수정했다면, **Supabase Edge 배포 전**에 이 폴더 사본을 덮어쓰고, 사본 내부 import가 **`./types.ts`**, **`./vrConstants.ts`** 처럼 확장자로 끝나는지 확인하세요.

| 사본 (`_shared/`)           | 원본 (레포 루트 기준)              |
|----------------------------|-----------------------------------|
| `types.ts`                 | `types.ts`                        |
| `vrConstants.ts`           | `constants/vrConstants.ts`        |
| `financialScalarGuards.ts` | `utils/financialScalarGuards.ts`  |
| `financialMath.ts`         | `utils/financialMath.ts`          |
| `vrBandStrategy.ts`        | `utils/vrBandStrategy.ts`         |

### 권장 절차 (Windows PowerShell 예시)

레포 루트(`BTD-alarm2`)에서:

```powershell
Copy-Item -Force types.ts supabase/functions/_shared/types.ts
Copy-Item -Force constants/vrConstants.ts supabase/functions/_shared/vrConstants.ts
Copy-Item -Force utils/financialScalarGuards.ts supabase/functions/_shared/financialScalarGuards.ts
Copy-Item -Force utils/financialMath.ts supabase/functions/_shared/financialMath.ts
Copy-Item -Force utils/vrBandStrategy.ts supabase/functions/_shared/vrBandStrategy.ts
```

복사 후 **반드시** 다음을 수동 점검합니다.

1. **`vrConstants.ts`** 첫 줄: `import type { OrderLevel } from './types.ts';`
2. **`vrBandStrategy.ts`** 상단: `from './types.ts'`, `from './vrConstants.ts'`, `from './financialScalarGuards.ts'`, `from './financialMath.ts'` 만 사용 (상위 `../` 경로 금지)
3. **`types.ts`**: 다른 로컬 파일을 import 하게 바뀌었다면, 사본에서도 Deno 규격(`.ts` 확장자)으로 맞출 것

검증:

```bash
deno check supabase/functions/refresh-vr-snapshots/index.ts
```

배포:

```bash
npx supabase functions deploy refresh-vr-snapshots --no-verify-jwt
```

---

## 스텝4 운영 체크리스트 (요약)

| 순서 | 작업 | 문서 |
|------|------|------|
| 1 | 스모크 `POST` + Functions 로그 확인 | [docs/VR_REFRESH_SNAPSHOTS_OPERATIONS.md](../../../docs/VR_REFRESH_SNAPSHOTS_OPERATIONS.md) |
| 2 | pg_cron(또는 대시보드 Cron)으로 주기 호출 등록 | [docs/VR_REFRESH_SNAPSHOTS_CRON.md](../../../docs/VR_REFRESH_SNAPSHOTS_CRON.md) |
| 3 | `cycleWeeks` 백필 마이그레이션 적용 (`supabase db push` 등) | `supabase/migrations/20260312000000_backfill_vr_band_cycle_weeks.sql` |
| 4 | 루트 원본 수정 시 → 위 표 복사 + import 점검 + `deno check` + 재배포 | 이 파일 §동기화 |

**백필 적용 후 검증(SQL Editor, 선택):**

```sql
select count(*) as missing_cycle_weeks
from public.portfolios
where jsonb_typeof(strategy->'vrBand') = 'object'
  and (strategy->'vrBand'->>'cycleWeeks') is null;
-- 기대: 0
```
