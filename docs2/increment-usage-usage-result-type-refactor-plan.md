# `incrementUsage` 반환 타입 `any` 제거 — 리뷰 반영 계획서

**상태**: 문서 전용 (코드 변경 전 검토·시뮬레이션용)  
**대상 규칙**: Rule 7 — Strict TypeScript (`any` 금지), Rule 8 — 매직 넘버 금지, Rule 5·OCP — 정책과 로직 분리  
**범위**: `utils/subscriptionUtils.ts`의 `getUsageLimits`, `incrementUsage` 및 이와 직접 연결된 타입·상수.  
**비범위**: Supabase RPC `check_and_increment_usage`의 SQL 시그니처 변경(선택 후속).

---

## 0. 리뷰 요약

### 0.1 1차 리뷰 (타입·RPC 필드)

| 지적 | 판단 | 본 문서 반영 |
|------|------|----------------|
| `incrementUsage` 반환 타입에 `currentUsage?: any` (Rule 7 위반) | **동의.** 호출부에서 임의 필드 접근이 타입 검증을 빠져나감. | §3.2 `UsageResult` 등 타입 + `Promise<UsageResult>`. *(구현은 저장소에 반영됨 — 본 문서는 최종 스니펫 기준 유지.)* |
| 리뷰안 스니펫의 RPC 필드명 `daily_usage` / `monthly_usage` | **부분 수정 필요.** 마이그레이션상 실제 키는 `current_daily` / `current_monthly`임. | §3.2에서 **`CheckAndIncrementUsageRpcRow` + `current_daily` / `current_monthly` 매핑**. |

### 0.2 2차 리뷰 (매직 넘버·한도 정책 테이블)

| 지적 | 판단 | 본 문서 반영 |
|------|------|----------------|
| `limits.aiMonthly ?? 999` 등 **설명 없는 999** (Rule 8) | **동의.** 의미 있는 **이름 붙은 상수**로 치환. | §3.2 `UNLIMITED_USAGE_QUOTA`(§0.3 주석으로 의미 고정) + `incrementUsage` 내 `?? UNLIMITED_USAGE_QUOTA`. |
| `getUsageLimits` 내부 if 체인에 정책 숫자 하드코딩 (Rule 5·OCP) | **동의(권고 수준).** 정책을 **상단 테이블(`TIER_USAGE_LIMITS`)**로 모으고 조회는 매핑 한 줄로. | §3.2 `TIER_USAGE_LIMITS` + `getUsageLimits` 딕셔너리 조회. |

### 0.3 제품 결정 (반영됨)

1. **`UNLIMITED_USAGE_QUOTA` 이름**: **그대로 유지.** 다만 구현 시 상수 바로 위에 주석으로 아래 의미를 **반드시** 명시한다.  
   - *서버(RPC)가 “무제한”을 직접 처리하지 못하므로, 월 상한이 없는 티어에 넘기는 **실질적 상한값**이다.*

2. **Enterprise 요금제**: **지금은 테이블에 넣지 않는다.** `getUsageLimits`는 `TIER_USAGE_LIMITS[normalizedTier] ?? TIER_USAGE_LIMITS.free`로 **미등록 티어(enterprise 등)는 free와 동일 한도**를 쓰게 둔다. 나중에 Enterprise 정책이 생기면 **`TIER_USAGE_LIMITS`에 행 한 줄만 추가**하면 된다.

---

## 1. 현재 코드 요지 (문제)

```typescript
// 현재 (요지)
export const incrementUsage = async (
  usageType: "ai" | "backtest",
  tier: string,
): Promise<{ success: boolean; message?: string; currentUsage?: any }> => {
  // ...
  const result = data as {
    success: boolean;
    error?: string;
    daily_usage?: number;
    monthly_usage?: number;
  };
  // ...
  return {
    success: true,
    currentUsage: {
      daily: result.daily_usage,
      monthly: result.monthly_usage,
    },
  };
};
```

**문제**

1. `any`로 `currentUsage` 형태가 봉인되지 않음.  
2. RPC JSON 키는 아래와 같음 — 클라이언트 필드명과 불일치할 수 있음.

---

## 2. RPC 계약 (단일 소스: 마이그레이션)

`supabase/migrations/20260204000000_add_usage_tracking.sql` 기준 성공 시 반환 객체:

```sql
RETURN jsonb_build_object(
  'success', v_success,
  'error', v_error_message,
  'current_daily', CASE WHEN v_success THEN v_daily_count + 1 ELSE v_daily_count END,
  'current_monthly', CASE WHEN p_usage_type = 'ai' THEN (...) ELSE NULL END
);
```

- **성공**: `success: true`, `error`는 빈 문자열 등으로 올 수 있음(구현상 `v_error_message` 초기값 `''`).  
- **실패**: `success: false`, `error`에 `'Daily limit reached'` / `'Monthly limit reached'` 등(클라이언트에서는 이미 `normalizeRpcUsageLimitMessage`로 코드화).

클라이언트의 `currentUsage.daily` / `currentUsage.monthly`는 **`current_daily` / `current_monthly`에서만** 채우는 것이 계약에 맞음.

---

## 3. 적용 계획 (구현 순서)

### 3.1 타입 추가 위치

- 파일: `utils/subscriptionUtils.ts`  
- `normalizeRpcUsageLimitMessage` **위 또는 바로 아래**에 `UsageResult`를 두고 export하여, 향후 다른 모듈에서 재사용 시 import 가능하게 함.

### 3.2 이식용 스니펫 (시뮬레이션·코드 리뷰용)

아래를 **한 덩어리**로 적용한다고 가정하고 AST/타입 시뮬레이션을 돌린다.

**병합 규칙 (파일 실제 구조와 충돌 방지)**

- `export interface UsageLimits { ... }`는 **파일에 이미 존재**하므로 스니펫에서 **재정의하지 않는다** — 인터페이스는 그대로 두고 **`UNLIMITED_USAGE_QUOTA`, `TIER_USAGE_LIMITS`, `getUsageLimits` 본문, 타입·`incrementUsage` 블록**만 아래 순서로 맞춘다.  
- `normalizeRpcUsageLimitMessage`는 기존 구현을 **유지**한다(스니펫에 중복 붙이지 않음).

```typescript
// ---------------------------------------------------------------------------
// Rule 8 & 5: 정책 상수·티어 테이블
// ---------------------------------------------------------------------------
// 서버가 무제한을 처리하지 못해 보내는 실질적 상한값 (월 한도 미설정 티어의 p_max_monthly 등에 사용).
export const UNLIMITED_USAGE_QUOTA = 999;

// premium / pro / free 만 명시. enterprise 등 미등록 티어는 getUsageLimits에서 free로 폴백(§0.3).
const TIER_USAGE_LIMITS: Record<string, UsageLimits> = {
  premium: { aiDaily: UNLIMITED_USAGE_QUOTA, backtestDaily: 10 },
  pro: {
    aiDaily: UNLIMITED_USAGE_QUOTA,
    aiMonthly: 50,
    backtestDaily: 5,
  },
  free: { aiDaily: 1, backtestDaily: 2 },
};

/**
 * 티어별 일일/월간 사용량 한도 가져오기
 */
export const getUsageLimits = (tier: string): UsageLimits => {
  const normalizedTier = tier?.toLowerCase() || "free";
  // enterprise 등 테이블에 없는 티어 → free와 동일. 추후 enterprise 행만 추가하면 됨(§0.3).
  return TIER_USAGE_LIMITS[normalizedTier] ?? TIER_USAGE_LIMITS.free;
};

// ... normalizeRpcUsageLimitMessage (기존과 동일) ...

/** `incrementUsage` 성공 시에만 의미 있는 사용량 스냅샷. */
export interface UsageIncrementCurrentUsage {
  daily: number;
  monthly?: number | null;
}

export interface UsageResult {
  success: boolean;
  message?: string;
  currentUsage?: UsageIncrementCurrentUsage;
}

/** Supabase `check_and_increment_usage`가 반환하는 JSON (성공/실패 공통 상위 필드) */
interface CheckAndIncrementUsageRpcRow {
  success: boolean;
  error?: string;
  current_daily?: number;
  current_monthly?: number | null;
}

export const incrementUsage = async (
  usageType: "ai" | "backtest",
  tier: string,
): Promise<UsageResult> => {
  const limits = getUsageLimits(tier);
  const maxDaily = usageType === "ai" ? limits.aiDaily : limits.backtestDaily;
  const maxMonthly =
    usageType === "ai" ? limits.aiMonthly ?? UNLIMITED_USAGE_QUOTA : undefined;

  try {
    const { data, error } = await supabase.rpc("check_and_increment_usage", {
      p_usage_type: usageType,
      p_max_daily: maxDaily,
      p_max_monthly: maxMonthly,
    });

    if (error) {
      console.error(`[Usage] Error incrementing ${usageType} usage:`, error);
      return { success: false, message: error.message };
    }

    const result = data as CheckAndIncrementUsageRpcRow;

    if (!result.success) {
      return {
        success: false,
        message: normalizeRpcUsageLimitMessage(result.error) ?? result.error,
      };
    }

    return {
      success: true,
      currentUsage: {
        daily: result.current_daily ?? 0,
        monthly: result.current_monthly,
      },
    };
  } catch (err) {
    console.error(`[Usage] Unexpected error during ${usageType} usage:`, err);
    return { success: false, message: "Unexpected server error" };
  }
};
```

**시뮬레이션 체크 포인트**

1. `UsageResult`를 반환하는 함수에 `as any` 없음.  
2. `currentUsage`에 임의 키 접근 시 tsc 에러.  
3. `result.current_daily`가 `undefined`일 때 `daily: 0` 폴백 — RPC 계약상 성공이면 숫자가 와야 하나, 방어적 기본값. (원하면 `undefined` 허용으로 `daily?: number`로 완화 가능 — 단 그 경우 호출부 nil 처리 필요.)  
4. 숫자 정책은 **`TIER_USAGE_LIMITS` + `UNLIMITED_USAGE_QUOTA`만** 보면 되고, `getUsageLimits`에 if 체인 없음.  
5. **Enterprise는 테이블에 넣지 않음** — `enterprise` 등 미등록 티어는 **`?? TIER_USAGE_LIMITS.free`** 로 free와 동일 한도(§0.3). 추후 `TIER_USAGE_LIMITS`에 `enterprise` 행 한 줄 추가로 확장.

### 3.3 호출부 영향

현재 워크스페이스 grep 기준:

- `components/AIImageInputModal.tsx` — `usageResult.success` / `usageResult.message`만 사용.  
- `components/Backtest.tsx` — 동일.

즉 **`currentUsage`를 읽는 코드가 없어** 이번 타입 변경만으로는 대부분의 컴파일 영향이 없음. 향후 `currentUsage.daily`를 UI에 노출할 때는 `UsageResult` 타입이 가이드가 됨.

### 3.4 리뷰 원안과의 차이 (문서에 명시)

| 항목 | 리뷰 스니펫 | 본 계획서 권장 |
|------|-------------|----------------|
| RPC 파싱 필드 | `daily_usage`, `monthly_usage` | **`current_daily`, `current_monthly`** (마이그레이션 일치) |
| `currentUsage` 형태 | 인라인 `{ daily?: number; monthly?: number }` | `UsageIncrementCurrentUsage` + `UsageResult`로 이름 부여 (SRP·재사용) |
| `daily` 필수 여부 | optional | 계획서 스니펫은 **`daily: number`** + `?? 0` (명시적 폴백) |
| `UsageLimits` | 스니펫 안에서 `export interface` 재선언 | **파일 기존 `export interface UsageLimits` 유지** — 중복 export 금지 |
| 티어 테이블 키 | `Record<string, UsageLimits>`만 제시 | **Enterprise 미추가·`?? free` 폴백**은 §0.3 결정으로 고정. 추후 enterprise는 행 한 줄 추가. |

---

## 4. 검증 체크리스트 (구현 후)

- [ ] `utils/subscriptionUtils.ts`에서 `incrementUsage` 반환 타입에 `any` 없음 (`rg "currentUsage\\?\\: any"` 빈 결과).  
- [ ] `incrementUsage` 본문에 **`?? 999` 같은 베어 리터럴 없음** — `UNLIMITED_USAGE_QUOTA`만 사용(상수 주석은 §0.3·§3.2와 동일 문구).  
- [ ] `getUsageLimits`에 티어별 숫자 if 체인 없음 — **`TIER_USAGE_LIMITS` 단일 소스**.  
- [ ] `npx tsc --noEmit`에서 `subscriptionUtils` / `AIImageInputModal` / `Backtest` 관련 신규 에러 없음.  
- [ ] (선택) 성공 응답 한 건을 네트워크 탭 또는 Supabase 대시보드에서 확인해 `current_daily` 존재 여부와 클라이언트 표시 일치 확인.

---

## 5. 선택 후속 (본 리뷰 범위 밖)

- RPC가 `daily_usage` 같은 별칭을 추가하거나, 문서화된 공식 응답 스키마를 OpenAPI/타입 생성기와 맞추기.  
- `error`가 빈 문자열일 때 `normalizeRpcUsageLimitMessage` 동작(현재는 trim 후 빈 문자열이면 `undefined` 반환)을 명시적으로 정책화.

---

## 6. 한 줄 요약

**타입**: `UsageResult`·`CheckAndIncrementUsageRpcRow`·`current_daily` / `current_monthly` 매핑을 유지한다.  
**정책**: `999`는 이름 **`UNLIMITED_USAGE_QUOTA` 유지** + 주석으로 *서버가 무제한을 처리하지 못해 보내는 실질적 상한*을 명시. 티어 한도는 **`TIER_USAGE_LIMITS` + `getUsageLimits`**; **Enterprise는 미추가·free 폴백** 유지, 추후 행 한 줄 추가로 확장(§0.3).
