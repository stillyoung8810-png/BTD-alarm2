# 무료 한도 상수화 리팩토링 계획서

**상태**: 문서 전용 - 구현 전 검토용  
**목표**: 무료 회원 기본 한도를 `FREE_MAX_PORTFOLIOS`, `FREE_MAX_ALARMS` 두 상수로 통일  
**제품 결정**: 기존 유저 DB 값은 신경 쓰지 않음. DB 보정 SQL 없음.  
**비범위**: 광고, 멤버십 UI, 종목 무료화, 텔레그램, AI/백테스트 한도, 결제 가격 정책.

---

## 0. 결론

무료 회원의 포트폴리오/알람 한도를 바꾸려면 `2`라는 숫자만 한두 곳 수정하면 안 됩니다. 현재 기본값이 프론트·서버·Edge Function에 흩어져 있어서, 출시 직전 안정성을 위해 **두 상수**로 묶고 모든 기본/만료/환불 경로가 같은 값을 보게 해야 합니다.

권장 상수:

```typescript
export const FREE_MAX_PORTFOLIOS = 3;
export const FREE_MAX_ALARMS = 4;
```

---

## 1. 현재 코드 기준 문제

| 파일 | 현재 동작 |
|------|-----------|
| `utils/subscriptionUtils.ts` | Free fallback 포트폴리오 `2`, 알람 `2` |
| `services/authProfileService.ts` | 프로필 필드 누락 시 `DEFAULT_PROFILE_LIMIT = 2`, `DEFAULT_ALARM_LIMIT = 2` |
| `hooks/useAuthSessionSync.ts` | 로그인 직후 pending profile `max_portfolios: 2`, `max_alarms: 2` |
| `hooks/usePortfolioMutations.ts` | 저장 가드가 `userProfile?.max_portfolios ?? 3` 사용 |
| `server/src/services/paymentFulfillment.ts` | Free `2/2`, 만료 시 `2/2`, 만료 정규화도 `2/2` |
| `supabase/functions/cancel-subscription/index.ts` | 환불 후 `2/2` |
| `supabase/functions/payment-webhook/index.ts` | 환불 웹훅 후 `2/2` |

핵심 위험은 UI는 새 한도를 보여주는데 저장 가드는 다른 숫자를 보거나, 서버 만료/환불 경로가 다시 `2/2`로 덮는 경우입니다.

---

## 2. 상수 위치 결정

### 2.1 권장 위치

파일: `server/src/services/paymentFulfillment.ts`

이 파일은 이미 다음 경로에서 공통으로 사용됩니다.

- 앱: `utils/subscriptionUtils.ts`가 `getEffectiveSubscriptionState`를 import
- Edge Function: `verify-payment`, `send-alarm`, `generate-daily-execution-summaries`, `reconcile-subscriptions`, `payment-webhook`
- 서버 테스트: `server/src/services/paymentFulfillment.test.ts`

따라서 새 공유 파일을 추가해 서버/Edge import 경계를 흔드는 것보다, 이미 공유 중인 `paymentFulfillment.ts` 안에 두 상수를 두는 것이 출시 직전에는 더 안전합니다.

```typescript
export const FREE_MAX_PORTFOLIOS = 3;
export const FREE_MAX_ALARMS = 4;
```

### 2.2 하지 않는 방식

출시 직전에는 아래 방식은 피합니다.

- `constants/freeTierLimits.ts` 같은 새 루트 공유 파일을 만들고 서버에서 import
- 서버 `tsconfig.rootDir` 조정
- DB 마이그레이션으로 기존 유저 `max_*` 일괄 보정

이 방식들은 구조적으로는 깔끔할 수 있지만, 현재 목표가 “기존 유저 무시 + 신규 기본값만 안정적으로 변경”이므로 변경 범위가 과합니다.

---

## 3. 적용 스니펫

### 3.1 `server/src/services/paymentFulfillment.ts`

상단 상수 영역에 추가합니다.

```typescript
export const PLAN_DAYS_PER_UNIT = 30;
export const FREE_MAX_PORTFOLIOS = 3;
export const FREE_MAX_ALARMS = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

`getTierLimits`의 free 반환값을 상수로 바꿉니다.

```typescript
export function getTierLimits(tier: SubscriptionTier): {
  maxPortfolios: number;
  maxAlarms: number;
} {
  if (tier === "premium") return { maxPortfolios: 20, maxAlarms: 40 };
  if (tier === "pro") return { maxPortfolios: 5, maxAlarms: 10 };
  return {
    maxPortfolios: FREE_MAX_PORTFOLIOS,
    maxAlarms: FREE_MAX_ALARMS,
  };
}
```

만료 상태도 상수로 바꿉니다.

```typescript
return {
  tier: isExpired ? "free" : tier,
  status: isExpired ? "expired" : status,
  expiresAt,
  pendingPlan,
  pendingPlanEffectiveAt,
  isActive: !isExpired && isActiveStatus && tier !== "free",
  isExpired,
  maxPortfolios: isExpired ? FREE_MAX_PORTFOLIOS : limits.maxPortfolios,
  maxAlarms: isExpired ? FREE_MAX_ALARMS : limits.maxAlarms,
};
```

만료 정규화 payload도 상수로 바꿉니다.

```typescript
return {
  subscription_tier: "free",
  subscription_status: "expired",
  pending_plan: null,
  pending_plan_effective_at: null,
  max_portfolios: FREE_MAX_PORTFOLIOS,
  max_alarms: FREE_MAX_ALARMS,
};
```

### 3.2 `utils/subscriptionUtils.ts`

`getEffectiveSubscriptionState`가 이미 한도를 계산하므로, 클라이언트 한도 getter는 실효 상태를 그대로 반환하게 단순화합니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
  getEffectiveSubscriptionState,
  type SubscriptionProfileSnapshot,
} from "../server/src/services/paymentFulfillment";

export { FREE_MAX_ALARMS, FREE_MAX_PORTFOLIOS };

export const getMaxPortfolios = (
  profile: UserProfile | SimpleUserProfile | null,
): number => getEffectiveSubscription(profile).maxPortfolios;

export const getMaxAlarms = (
  profile: UserProfile | SimpleUserProfile | null,
): number => getEffectiveSubscription(profile).maxAlarms;
```

이렇게 하면 `profile == null`, free, pro, premium, expired 모두 서버의 `getTierLimits`와 같은 계산 결과를 씁니다. 또한 앱의 다른 프론트 파일은 서버 파일을 직접 import하지 않고 `subscriptionUtils`에서 재수출된 상수를 사용합니다.

### 3.3 `services/authProfileService.ts`

프로필 row에 `max_*` 필드가 없을 때의 기본값을 같은 상수로 맞춥니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
} from '../utils/subscriptionUtils';

const EMPTY_PROFILE: AppUserProfile | null = null;
const DEFAULT_PROFILE_LIMIT = FREE_MAX_PORTFOLIOS;
const DEFAULT_ALARM_LIMIT = FREE_MAX_ALARMS;
```

### 3.4 `hooks/useAuthSessionSync.ts`

로그인 직후 실제 프로필 조회 전 임시 프로필도 같은 기본값을 씁니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
} from '../utils/subscriptionUtils';

function createPendingUserProfile(): AppUserProfile {
  return {
    subscription_tier: 'free',
    max_portfolios: FREE_MAX_PORTFOLIOS,
    max_alarms: FREE_MAX_ALARMS,
    preferred_language: 'ko',
    timezone: getDeviceTimeZone(),
  };
}
```

### 3.5 `hooks/usePortfolioMutations.ts`

포트폴리오 저장 가드가 UI와 같은 규칙을 보도록 `getMaxPortfolios`를 사용합니다.

```typescript
import {
  getEffectiveSubscription,
  getMaxPortfolios,
} from '../utils/subscriptionUtils';

// ...

const maxPortfolios = getMaxPortfolios(userProfile);
```

기존 코드:

```typescript
const maxPortfolios = userProfile?.max_portfolios ?? 3;
```

이 값은 UI의 `getMaxPortfolios(userProfile)`와 불일치할 수 있으므로 제거합니다.

### 3.6 `supabase/functions/cancel-subscription/index.ts`

환불 후 무료 기본 한도를 상수와 맞춥니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
} from "../../../server/src/services/paymentFulfillment.ts";

// ...

max_portfolios: FREE_MAX_PORTFOLIOS,
max_alarms: FREE_MAX_ALARMS,
```

### 3.7 `supabase/functions/payment-webhook/index.ts`

이미 `paymentFulfillment.ts`를 import하고 있으므로 같은 import에 상수를 추가합니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
  // 기존 import 유지
} from "../../../server/src/services/paymentFulfillment.ts";

// ...

max_portfolios: FREE_MAX_PORTFOLIOS,
max_alarms: FREE_MAX_ALARMS,
```

---

## 4. 테스트 스니펫

### 4.1 `server/src/services/paymentFulfillment.test.ts`

무료/만료 기본 한도가 바뀌었는지 직접 확인합니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
  getEffectiveSubscriptionState,
  getTierLimits,
} from "./paymentFulfillment";

describe("free tier limits", () => {
  it("free tier uses configured default limits", () => {
    expect(getTierLimits("free")).toEqual({
      maxPortfolios: FREE_MAX_PORTFOLIOS,
      maxAlarms: FREE_MAX_ALARMS,
    });
  });

  it("expired paid user falls back to free default limits", () => {
    const result = getEffectiveSubscriptionState(
      {
        subscription_tier: "pro",
        subscription_status: "active",
        subscription_expires_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-02-01T00:00:00.000Z",
    );

    expect(result.tier).toBe("free");
    expect(result.maxPortfolios).toBe(FREE_MAX_PORTFOLIOS);
    expect(result.maxAlarms).toBe(FREE_MAX_ALARMS);
  });
});
```

### 4.2 `utils/subscriptionUtils.test.ts`

클라이언트 한도 getter가 서버 실효 구독 계산값과 같은 값을 반환하는지 확인합니다. 문자열 검색 테스트보다 실제 동작을 검증하는 쪽이 출시 직전 안정성에 맞습니다.

```typescript
import {
  FREE_MAX_ALARMS,
  FREE_MAX_PORTFOLIOS,
  getMaxAlarms,
  getMaxPortfolios,
} from './subscriptionUtils';

describe('free tier client limits', () => {
  it('uses configured free defaults when profile is not loaded yet', () => {
    expect(getMaxPortfolios(null)).toBe(FREE_MAX_PORTFOLIOS);
    expect(getMaxAlarms(null)).toBe(FREE_MAX_ALARMS);
  });

  it('uses configured free defaults for free profiles', () => {
    const profile = {
      subscription_tier: 'free',
      max_portfolios: FREE_MAX_PORTFOLIOS,
      max_alarms: FREE_MAX_ALARMS,
      subscription_status: null,
      subscription_expires_at: null,
    };

    expect(getMaxPortfolios(profile)).toBe(FREE_MAX_PORTFOLIOS);
    expect(getMaxAlarms(profile)).toBe(FREE_MAX_ALARMS);
  });
});
```

포트폴리오 저장 가드는 `getMaxPortfolios(userProfile)`를 호출하도록 변경한 뒤 기존 `hooks/usePortfolioMutations.test.ts`의 생성 제한 케이스가 있다면 함께 돌립니다. 별도 케이스가 없다면 수동 QA에서 무료 한도까지 생성 가능하고 그 다음 생성이 막히는지 확인합니다.

---

## 5. 검증 절차

구현 후 아래를 순서대로 실행합니다.

```bash
npm run typecheck:app
npm run typecheck:server
npm run test:server -- server/src/services/paymentFulfillment.test.ts
```

가능하면 전체 테스트도 실행합니다.

```bash
npm run test:server
npm run test
```

수동 확인:

1. 신규 로그인 직후 프로필 조회 전 화면에서 포트폴리오/알람 한도가 새 값으로 보이는지 확인
2. 무료 신규 사용자로 포트폴리오 새 한도까지 생성 가능한지 확인
3. 알람 모달에서 새 알람 슬롯 수까지 추가 가능한지 확인
4. Pro/Premium 한도 5/10, 20/40은 그대로인지 확인
5. 광고 노출 정책이 바뀌지 않았는지 확인

---

## 6. Core Rules 점검

| 규칙 | 판단 |
|------|------|
| 금융 수학 | 주문/금액 계산을 건드리지 않음 |
| React anti-pattern | JSX 구조 변경 없음 |
| i18n | UI 문구 추가 없음 |
| A11y | 인터랙션 추가 없음 |
| DRY/SRP/OCP | 무료 한도 숫자를 두 상수로 통일 |
| Clean code | `userProfile?.max_portfolios ?? 3` 불일치 제거 |
| Strict TS | `any`, non-null assertion 없음 |
| Magic number | 무료 한도 `3`, `4`를 상수화 |
| Async safety | 네트워크/결제/브릿지 흐름 변경 없음 |
| Zero assumption | 기존 유저 DB 보정은 명시적으로 비범위 |

---

## 7. 오버코딩 여부

이번 목표에는 아래를 하지 않습니다.

- DB 보정 SQL 작성/실행
- 새 entitlement 시스템 추가
- 멤버십 탭 구조 변경
- 광고 정책 변경
- 결제/IAP 삭제
- 원격 feature flag 추가

적정 범위는 **두 상수 추가 + 기존 2/2 하드코딩 교체 + 저장 가드 일원화 + 최소 테스트 보강**입니다.
