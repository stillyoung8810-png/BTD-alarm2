# 무료 출시 정책 전환 계획서

**상태**: 문서 전용 - 제품 코드 변경 전 검토·시뮬레이션용  
**목표**: 모든 종목 무료, 텔레그램 무료, 멤버십 탭 비노출, 알람 최대 4개, 포트폴리오 최대 3개  
**시뮬레이션**: `docs2/free_launch_policy_refactor_simulation.test.ts`  
**실행 명령**: `npx vitest run --config docs2/free_launch_policy_refactor_vitest.config.ts`

---

## 0. 결론

현재 구조에서 이 정책은 **대규모 리팩터링 없이 적용 가능**합니다. 다만 프론트만 바꾸면 안 되고, 아래 축을 같이 맞춰야 합니다.

1. **종목 접근**: `App.tsx`의 `canAccessPaidStocks`가 핵심 게이트입니다.
2. **텔레그램 무료화**: 프로필 UI와 Supabase Edge Function의 발송 조건을 같이 풀어야 합니다.
3. **멤버십 비노출**: 하단 탭만 숨기면 결제 모달·프로필 업그레이드 버튼이 남을 수 있으므로, 결제 진입면도 같이 막아야 합니다.
4. **한도 정책**: 무료·만료 사용자는 3/4로 보정하고, 기존 `pro`/`premium` 사용자는 기존 한도 5/10, 20/40을 유지합니다.
5. **광고 유지**: 광고가 수익 구조이므로 `shouldShowAds`, 광고 SDK, 광고 노출 조건은 이번 작업에서 수정하지 않습니다.

권장 구현은 **무료 출시 정책 상수를 작은 순수 모듈 하나에 모으고**, 각 게이트에서 그 상수를 읽는 방식입니다. 유료 결제 코드는 지금 삭제하지 않고 비노출·비진입 상태로 두는 편이 나중에 유료 플랜을 다시 열 때 안전합니다.

---

## 1. 제품 정책 가정

본 계획서는 아래 결정을 기준으로 합니다.

| 항목 | 정책 |
|------|------|
| 종목 | `ALL_STOCKS`에 있는 모든 종목을 무료 사용자가 선택·조회 가능 |
| 텔레그램 | 로그인 사용자라면 무료 티어도 연결·토글·발송 가능 |
| 멤버십 | 하단 멤버십 탭, 가격 페이지 진입, 프로필 업그레이드 버튼, 결제 모달 진입을 숨김 |
| 포트폴리오 | 무료·신규·만료/환불 사용자는 최대 3개, 기존 `pro`/`premium` 사용자는 기존 한도 유지 |
| 알람 | 무료·신규·만료/환불 사용자는 최대 4개, 기존 `pro`/`premium` 사용자는 기존 한도 유지 |
| IAP/결제 코드 | 이번 계획의 구현 단계에서는 삭제하지 않고 진입만 차단 |
| 광고 | 서비스 수익 구조이므로 이번 변경에서 **수정 금지** |
| AI·백테스트 | 이번 범위 밖. 무료화 여부를 따로 결정해야 함 |

**결정사항**: 현재 DB에 `pro`/`premium` 사용자가 있다면 기존 유료 한도(`pro` 5/10, `premium` 20/40)를 유지합니다. DB 보정은 무료·만료·환불 사용자에게만 적용하며, 광고 노출/제거 로직은 이번 작업에서 건드리지 않습니다.

---

## 2. 현재 시스템 검토

### 2.1 종목 제한

현재 종목 제한의 중앙 플래그는 `App.tsx`의 `canAccessPaidStocks`입니다.

```typescript
const canAccessPaidStocks = useMemo(() => {
  const tierOk = currentTier !== 'free';
  return tierOk && effectiveSubscription.isActive && !effectiveSubscription.isExpired;
}, [currentTier, effectiveSubscription.isActive, effectiveSubscription.isExpired]);
```

이 값이 아래로 전달됩니다.

| 파일 | 현재 역할 |
|------|-----------|
| `components/Markets.tsx` | 무료면 `AVAILABLE_STOCKS`만 fetch, 유료 종목 선택 시 `QQQ`로 되돌림, 카드 잠금 |
| `components/strategyCreator/useStrategyCreatorController.tsx` | `PAID_STOCKS`를 disabled 처리하고 `PRO+` 배지 표시 |
| `services/stockService.ts` | 기본 종목과 유료 종목 워밍업을 분리 |
| `utils/subscriptionUtils.ts` | `canAccessStock`이 있지만 현재 호출처 없음 |

정책 적용 시 `canAccessPaidStocks`를 무료 출시 기간에는 항상 `true`로 두면 대부분의 실제 제한이 풀립니다. 다만 `StrategyCreator`의 `PRO+` 배지는 사용자가 보게 되는 카피라 같이 제거해야 합니다.

### 2.2 텔레그램 제한

프론트에서는 `ProfileView.tsx`가 무료 사용자에게 텔레그램 연결 버튼을 비활성으로 보여줍니다.

```tsx
{paidTier !== 'free' ? (
  // 연결 UI
) : (
  <HoverTip text={copy.profile.paidOnly}>
    <span className="inline-block w-full">
      <button type="button" disabled>
        <Send size={18} /> {copy.action.connectTelegram}
      </button>
    </span>
  </HoverTip>
)}
```

백엔드 발송은 `send-alarm`과 `generate-daily-execution-summaries`에서 다시 막고 있습니다.

```typescript
function shouldSendTelegram(profile: UserProfileRow | null): boolean {
  if (!profile) return false;
  const effective = getEffectiveSubscriptionState(profile);
  if (effective.tier !== "pro" && effective.tier !== "premium") return false;
  if (!effective.isActive || effective.isExpired) return false;
  if (profile.telegram_enabled !== true) return false;
  const chatId = profile.telegram_chat_id;
  if (!chatId || String(chatId).trim() === "") return false;
  return true;
}
```

`generate-daily-execution-summaries`는 조회 단계에서도 무료 사용자를 제외합니다.

```typescript
.in("subscription_tier", ["pro", "premium"])
.eq("telegram_enabled", true)
.not("telegram_chat_id", "is", null);
```

따라서 텔레그램 무료화는 **UI 조건 제거 + 발송 조건 제거 + 배치 조회 조건 제거**가 한 세트입니다.

### 2.3 멤버십 탭과 결제 진입

하단 네비게이션에서 멤버십 탭은 항상 노출됩니다.

```tsx
<NavIcon
  active={activeTab === 'pricing'}
  onClick={() => setActiveTab('pricing')}
  icon={<Crown size={22} />}
  label={t.membership}
/>
```

추가 결제 진입면도 있습니다.

| 위치 | 현재 동작 |
|------|-----------|
| `TabContent.tsx` | `case 'pricing'`에서 `<Pricing />` 렌더 |
| `Backtest` | `onRequestUpgrade={onOpenPricingTab}` |
| `ProfileView.tsx` | `onUpgradePlan`이 있으면 업그레이드 버튼 노출 |
| `App.tsx` | `checkoutPlan`이 있으면 `CheckoutModal` 렌더 |

하단 탭만 숨기면 나머지 경로가 남습니다. 무료 출시에서는 `shouldShowMembershipSurface = false` 정책으로 모든 진입면을 같이 막는 것이 맞습니다.

### 2.4 포트폴리오·알람 한도

현재 한도는 여러 곳에 분산되어 있습니다.

| 파일 | 현재 값/역할 |
|------|--------------|
| `utils/subscriptionUtils.ts` | Free 폴백 2/2, Pro 5/10, Premium 20/40 |
| `services/authProfileService.ts` | 프로필 필드 누락 시 2/2 |
| `hooks/useAuthSessionSync.ts` | 세션 pending profile 2/2 |
| `hooks/usePortfolioMutations.ts` | 포트폴리오 생성 가드가 `userProfile?.max_portfolios ?? 3` 사용 |
| `server/src/services/paymentFulfillment.ts` | `getTierLimits("free")` 2/2, 만료 시 2/2 |
| `supabase/functions/cancel-subscription/index.ts` | 환불 후 2/2 |
| `supabase/functions/payment-webhook/index.ts` | 환불 웹훅 후 2/2 |

특히 `getMaxPortfolios` / `getMaxAlarms`는 프로필에 명시값이 있으면 그 값을 씁니다. 기존 가입자 row가 2/2이면 코드 기본값을 3/4로 바꿔도 그대로 2/2입니다.

---

## 3. 구현 계획

### 3.1 정책 상수 추가

새 파일: `constants/freeLaunchPolicy.ts`

```typescript
export const FREE_LAUNCH_MAX_PORTFOLIOS = 3;
export const FREE_LAUNCH_MAX_ALARMS = 4;
export const LEGACY_PRO_MAX_PORTFOLIOS = 5;
export const LEGACY_PRO_MAX_ALARMS = 10;
export const LEGACY_PREMIUM_MAX_PORTFOLIOS = 20;
export const LEGACY_PREMIUM_MAX_ALARMS = 40;

export const FREE_LAUNCH_POLICY = {
  canAccessAllSupportedStocks: true,
  shouldShowMembershipSurface: false,
  maxPortfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
  maxAlarms: FREE_LAUNCH_MAX_ALARMS,
  legacyPaidLimits: {
    pro: {
      maxPortfolios: LEGACY_PRO_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PRO_MAX_ALARMS,
    },
    premium: {
      maxPortfolios: LEGACY_PREMIUM_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PREMIUM_MAX_ALARMS,
    },
  },
} as const;
```

이 정도의 상수 모듈은 오버코딩이 아닙니다. 무료 기본 한도와 기존 유료 한도, 멤버십 비노출 플래그가 프론트, 서버 서비스, Edge Function에 걸쳐 반복되기 때문입니다. 반대로 런타임 원격 설정, A/B 플래그, 복잡한 entitlement 레이어는 이번 목적에는 과합니다.

### 3.2 모든 종목 무료화

파일: `App.tsx`

```typescript
import { FREE_LAUNCH_POLICY } from './constants/freeLaunchPolicy';

const canAccessPaidStocks = FREE_LAUNCH_POLICY.canAccessAllSupportedStocks;
```

`canAccessPaidStocks` 이름은 당장은 유지합니다. 하위 컴포넌트 prop 이름을 한 번에 바꾸면 변경 범위가 커지고, 이번 목표는 무료화 정책 적용이므로 의미상 어색함은 후속 정리 대상으로 둡니다.

파일: `components/strategyCreator/useStrategyCreatorController.tsx`

```typescript
return {
  value: stock,
  label: stock,
  disabled: isDisabledByDuplicate,
  badge: undefined,
  tooltip: isDisabledByDuplicate ? params.duplicateSectionStockTooltip : undefined,
};
```

또는 최소 변경을 선호한다면 아래처럼 `PRO+` 배지만 제거합니다.

```typescript
disabled: isPaidLocked || isDisabledByDuplicate,
badge: undefined,
tooltip,
```

단, 이 경우 `isPaidLocked`는 `canAccessPaidStocks = true`라 실제로는 항상 `false`입니다.

### 3.3 텔레그램 무료화

파일: `components/auth/ProfileView.tsx`

현재 `paidTier !== 'free' ? ... : ...` 조건을 제거하고, 기존 연결 UI를 항상 렌더합니다. 이때 기존 중첩 삼항이 길기 때문에 수정 시에는 작은 렌더 헬퍼로 분리하는 것이 좋습니다.

```tsx
function renderTelegramControls(): React.ReactElement {
  if (telegramConnectedAt) {
    return (
      <div className="flex items-center justify-between gap-3">
        {/* 기존 연결 완료 UI 유지 */}
      </div>
    );
  }

  if (telegramLinkToken) {
    return (
      <div className="space-y-2 text-left">
        {/* 기존 /start 안내 UI 유지 */}
      </div>
    );
  }

  if (isInTossApp) {
    return (
      <TDSButton
        variant="tertiary"
        fullWidth
        disabled={!currentUserId || telegramLinkLoading || isLogoutPending}
        loading={telegramLinkLoading}
        onClick={handleConnectTelegramClick}
        className="flex items-center justify-center gap-2 text-[#0088cc] border-[#0088cc]/30"
      >
        <Send size={18} />
        {telegramLinkLoading ? copy.action.processing : copy.action.connectTelegram}
      </TDSButton>
    );
  }

  return (
    <button
      type="button"
      disabled={!currentUserId || telegramLinkLoading || isLogoutPending}
      onClick={handleConnectTelegramClick}
      className="w-full py-4 bg-[#0088cc]/10 text-[#0088cc] dark:text-[#54a9eb] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-[#0088cc]/30 hover:bg-[#0088cc]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <Send size={18} />
      {telegramLinkLoading ? copy.action.processing : copy.action.connectTelegram}
    </button>
  );
}
```

백엔드 발송 조건은 티어와 만료 상태를 제거하고, 사용자의 명시적 opt-in과 `chat_id`만 봅니다.

파일: `supabase/functions/send-alarm/index.ts`  
파일: `supabase/functions/generate-daily-execution-summaries/index.ts`

```typescript
function shouldSendTelegram(profile: UserProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.telegram_enabled !== true) return false;
  const chatId = profile.telegram_chat_id;
  return typeof chatId === "string" && chatId.trim() !== "";
}
```

파일: `supabase/functions/generate-daily-execution-summaries/index.ts`

```typescript
const { data: profiles, error: profileError } = await supabase
  .from("user_profiles")
  .select("id, subscription_tier, subscription_status, subscription_expires_at, pending_plan, pending_plan_effective_at, telegram_enabled, telegram_chat_id, preferred_language")
  .eq("telegram_enabled", true)
  .not("telegram_chat_id", "is", null);
```

### 3.4 멤버십 탭과 결제 진입 비노출

파일: `App.tsx`

```typescript
const shouldShowMembershipSurface = FREE_LAUNCH_POLICY.shouldShowMembershipSurface;

const handleOpenPricingTab = useCallback(() => {
  if (!shouldShowMembershipSurface) {
    setActiveTab('dashboard');
    return;
  }

  setActiveTab('pricing');
}, [shouldShowMembershipSurface]);

const handleUpgradePlan = useCallback((planId: 'pro' | 'premium') => {
  if (!shouldShowMembershipSurface) {
    return;
  }

  if (!user) {
    setAuthModal('login');
    return;
  }

  setCheckoutPlan(planId);
}, [shouldShowMembershipSurface, user]);
```

하단 네비게이션:

```tsx
{shouldShowMembershipSurface && (
  <NavIcon
    active={activeTab === 'pricing'}
    onClick={handleOpenPricingTab}
    icon={<Crown size={22} />}
    label={t.membership}
  />
)}
```

`TabContent` 전달:

```tsx
onOpenPricingTab={handleOpenPricingTab}
```

프로필 업그레이드 버튼 비노출:

```tsx
onUpgradePlan={shouldShowMembershipSurface ? handleUpgradePlan : undefined}
```

결제 모달 진입 차단:

```tsx
{checkoutPlan && shouldShowMembershipSurface && (
  <CheckoutModal
    isOpen={checkoutPlan != null}
    onClose={() => setCheckoutPlan(null)}
    lang={lang}
    customerEmail={user?.email}
    customerId={user?.id}
    onPaymentSuccess={() => {
      setCheckoutPlan(null);
      if (user?.id) fetchUserProfile(user.id);
    }}
  />
)}
```

### 3.5 포트폴리오 3개, 알람 4개

파일: `utils/subscriptionUtils.ts`

```typescript
import {
  FREE_LAUNCH_MAX_ALARMS,
  FREE_LAUNCH_MAX_PORTFOLIOS,
  LEGACY_PREMIUM_MAX_ALARMS,
  LEGACY_PREMIUM_MAX_PORTFOLIOS,
  LEGACY_PRO_MAX_ALARMS,
  LEGACY_PRO_MAX_PORTFOLIOS,
} from "../constants/freeLaunchPolicy";

export const getMaxPortfolios = (
  profile: UserProfile | SimpleUserProfile | null,
): number => {
  if (!profile) return FREE_LAUNCH_MAX_PORTFOLIOS;
  const tier = getEffectiveSubscription(profile).tier;
  if (tier === "premium") return LEGACY_PREMIUM_MAX_PORTFOLIOS;
  if (tier === "pro") return LEGACY_PRO_MAX_PORTFOLIOS;

  const explicit = profile.max_portfolios;
  if (typeof explicit === "number") return explicit;

  return FREE_LAUNCH_MAX_PORTFOLIOS;
};

export const getMaxAlarms = (
  profile: UserProfile | SimpleUserProfile | null,
): number => {
  if (!profile) return FREE_LAUNCH_MAX_ALARMS;
  const tier = getEffectiveSubscription(profile).tier;
  if (tier === "premium") return LEGACY_PREMIUM_MAX_ALARMS;
  if (tier === "pro") return LEGACY_PRO_MAX_ALARMS;

  const explicit = profile.max_alarms;
  if (typeof explicit === "number") return explicit;

  return FREE_LAUNCH_MAX_ALARMS;
};
```

위 스니펫은 무료·만료 사용자는 3/4 기본값을 쓰되, 기존 `pro`/`premium` 사용자의 기존 한도는 유지합니다. 광고 로직은 `shouldShowAds`에 남겨두고 이번 변경에서 수정하지 않습니다.

파일: `hooks/usePortfolioMutations.ts`

```typescript
import { getEffectiveSubscription, getMaxPortfolios } from '../utils/subscriptionUtils';

const maxPortfolios = getMaxPortfolios(userProfile);
```

기존 `userProfile?.max_portfolios ?? 3`은 UI와 mutation 가드가 서로 다른 규칙을 볼 수 있으므로 제거합니다.

파일: `services/authProfileService.ts`

```typescript
import {
  FREE_LAUNCH_MAX_ALARMS,
  FREE_LAUNCH_MAX_PORTFOLIOS,
} from '../constants/freeLaunchPolicy';

const DEFAULT_PROFILE_LIMIT = FREE_LAUNCH_MAX_PORTFOLIOS;
const DEFAULT_ALARM_LIMIT = FREE_LAUNCH_MAX_ALARMS;
```

파일: `hooks/useAuthSessionSync.ts`

```typescript
import {
  FREE_LAUNCH_MAX_ALARMS,
  FREE_LAUNCH_MAX_PORTFOLIOS,
} from '../constants/freeLaunchPolicy';

function createPendingUserProfile(): AppUserProfile {
  return {
    subscription_tier: 'free',
    max_portfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
    max_alarms: FREE_LAUNCH_MAX_ALARMS,
    preferred_language: 'ko',
    timezone: getDeviceTimeZone(),
  };
}
```

파일: `server/src/services/paymentFulfillment.ts`

```typescript
import {
  FREE_LAUNCH_MAX_ALARMS,
  FREE_LAUNCH_MAX_PORTFOLIOS,
  LEGACY_PREMIUM_MAX_ALARMS,
  LEGACY_PREMIUM_MAX_PORTFOLIOS,
  LEGACY_PRO_MAX_ALARMS,
  LEGACY_PRO_MAX_PORTFOLIOS,
} from "../../../constants/freeLaunchPolicy";

export function getTierLimits(tier: SubscriptionTier): {
  maxPortfolios: number;
  maxAlarms: number;
} {
  if (tier === "premium") {
    return {
      maxPortfolios: LEGACY_PREMIUM_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PREMIUM_MAX_ALARMS,
    };
  }
  if (tier === "pro") {
    return {
      maxPortfolios: LEGACY_PRO_MAX_PORTFOLIOS,
      maxAlarms: LEGACY_PRO_MAX_ALARMS,
    };
  }
  return {
    maxPortfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
    maxAlarms: FREE_LAUNCH_MAX_ALARMS,
  };
}
```

같은 파일의 만료 처리도 2/2 하드코딩을 상수로 바꿉니다.

```typescript
maxPortfolios: isExpired ? FREE_LAUNCH_MAX_PORTFOLIOS : limits.maxPortfolios,
maxAlarms: isExpired ? FREE_LAUNCH_MAX_ALARMS : limits.maxAlarms,
```

`cancel-subscription`과 `payment-webhook`의 환불 처리도 같은 상수로 맞춥니다.

```typescript
max_portfolios: FREE_LAUNCH_MAX_PORTFOLIOS,
max_alarms: FREE_LAUNCH_MAX_ALARMS,
```

---

## 4. DB 보정 계획

기존 사용자 row에 2/2가 저장되어 있으면 프론트 기본값 변경만으로는 3/4가 되지 않습니다. 이번 결정은 **기존 `pro`/`premium` 사용자의 기존 한도는 유지**하고, 무료·만료·환불 사용자만 3/4로 보정하는 것입니다.

배포 전에는 반드시 대상 row 수를 먼저 확인합니다.

```sql
select subscription_tier, subscription_status, count(*)
from public.user_profiles
group by subscription_tier, subscription_status
order by subscription_tier, subscription_status;
```

무료·만료·환불 사용자는 3/4로 보정합니다. `pro`/`premium`이면서 아직 유료 권한을 유지해야 하는 row는 제외합니다.

```sql
update public.user_profiles
set
  subscription_tier = 'free',
  subscription_status = case
    when subscription_status in ('expired', 'refunded', 'cancelled') then subscription_status
    else null
  end,
  subscription_expires_at = case
    when subscription_status in ('expired', 'refunded', 'cancelled') then subscription_expires_at
    else null
  end,
  pending_plan = null,
  pending_plan_effective_at = null,
  max_portfolios = 3,
  max_alarms = 4,
  updated_at = now()
where subscription_tier = 'free'
   or subscription_status in ('expired', 'refunded', 'cancelled')
   or (
     subscription_tier in ('pro', 'premium')
     and subscription_expires_at is not null
     and subscription_expires_at <= now()
   );
```

기존 유료 사용자 한도는 보존합니다. 아래 쿼리는 누락·오염된 `max_*` 값을 복구할 때만 사용합니다.

```sql
update public.user_profiles
set
  max_portfolios = case
    when subscription_tier = 'pro' then 5
    when subscription_tier = 'premium' then 20
    else max_portfolios
  end,
  max_alarms = case
    when subscription_tier = 'pro' then 10
    when subscription_tier = 'premium' then 40
    else max_alarms
  end,
  updated_at = now()
where subscription_tier in ('pro', 'premium')
  and (
    subscription_expires_at is null
    or subscription_expires_at > now()
  )
  and coalesce(subscription_status, 'active') in ('active', 'trial');
```

광고 수익 구조는 유지해야 하므로, 광고 관련 컬럼·`shouldShowAds` 정책·광고 SDK 설정은 이 DB 보정 범위에 포함하지 않습니다.

---

## 5. 시뮬레이션

본 계획서와 함께 제품 코드를 건드리지 않는 순수 시뮬레이션 파일을 추가했습니다.

| 파일 | 역할 |
|------|------|
| `docs2/free_launch_policy_refactor_simulation_snippets.ts` | 무료 출시 정책을 순수 함수로 모델링 |
| `docs2/free_launch_policy_refactor_simulation.test.ts` | 정책 기대값 검증 |
| `docs2/free_launch_policy_refactor_vitest.config.ts` | docs2 전용 Vitest 설정 |

실행:

```bash
npx vitest run --config docs2/free_launch_policy_refactor_vitest.config.ts
```

검증하는 내용:

1. 기존 유료 버킷 종목도 `SUPPORTED_TICKERS`에 있으면 접근 가능해야 합니다.
2. 무료·비판매 티어는 3/4 한도를 사용합니다.
3. 기존 `pro`/`premium` 사용자는 기존 한도 5/10, 20/40을 유지합니다.
4. 텔레그램은 구독 상태가 아니라 `telegram_enabled`와 `telegram_chat_id`만 봅니다.
5. 멤버십 화면과 체크아웃 진입은 숨겨집니다.

---

## 6. 구현 후 수동 검증

1. **무료 신규 계정**
   - Markets에서 `PSQ`, `TSLL`, `NVDL` 같은 기존 `PAID_STOCKS` 선택 가능
   - Strategy Creator에서 기존 유료 종목 disabled/`PRO+` 배지 없음
   - 포트폴리오 3개 생성 가능, 4번째 생성 차단
   - 알람 슬롯 4개까지 추가 가능, 5번째 차단

2. **기존 유료 계정**
   - `pro`는 포트폴리오 5개, 알람 10개 유지
   - `premium`은 포트폴리오 20개, 알람 40개 유지
   - 광고 제거 여부는 기존 `shouldShowAds` 결과 그대로 유지

3. **텔레그램**
   - Free 프로필에서 연결 버튼 활성
   - `/start` 연결 후 `telegram_enabled = true`, `telegram_chat_id` 저장
   - `send-alarm` 수동 호출 시 Free 사용자에게 텔레그램 발송
   - `generate-daily-execution-summaries`가 Free 사용자도 조회

4. **멤버십 비노출**
   - 하단 멤버십 탭 없음
   - 프로필 업그레이드 버튼 없음
   - 백테스트 등에서 업그레이드 요청이 발생해도 pricing 탭으로 이동하지 않음
   - `CheckoutModal`이 열리지 않음

5. **회귀**
   - `npm run typecheck`
   - `npm run test`
   - `npm run build:web`
   - 필요 시 `npm run typecheck:server`

---

## 7. Core Rules 검토

| 규칙 | 반영 |
|------|------|
| 금융 수학 | 이번 변경은 주문·금액 계산을 건드리지 않음 |
| React 렌더 | 텔레그램 UI 수정 시 중첩 삼항을 렌더 헬퍼로 축소 |
| i18n | 새 UI 문구를 추가하지 않음. 기존 메시지만 사용 |
| A11y | 새 interactive div 없음. 기존 button/TDSButton 유지 |
| DRY/SRP/OCP | 반복되는 무료 기본 한도, 기존 유료 한도, 무료 출시 플래그를 작은 정책 상수로 모음 |
| Clean code | IAP/결제 삭제 같은 별도 리팩터링은 하지 않음 |
| Strict TS | `any` 없이 유니온 타입과 상수 사용 |
| Naming/Magic number | 3/4를 `FREE_LAUNCH_MAX_*`로 명명 |
| Comments | 불필요한 설명 주석 추가하지 않음 |
| Performance/State | 상태 구조 변경 없음 |
| Async | 텔레그램 연결·발송 흐름의 async 구조는 유지 |
| 오버코딩 점검 | 원격 feature flag, entitlement 엔진, 결제 코드 삭제는 이번 범위에서 제외 |

---

## 8. 오버코딩 여부 판단

**하지 말아야 할 것**

- 결제/IAP 파일 전체 삭제
- 가격 페이지 컴포넌트 전체 삭제
- 새 권한 시스템 또는 entitlement 테이블 추가
- 원격 feature flag 시스템 추가
- 모든 `paid` 명칭을 한 번에 대규모 rename

**해도 되는 것**

- 무료 출시 정책 상수 1개 파일 추가
- 기존 게이트 조건을 그 정책 상수로 우회
- 사용자에게 보이는 유료 배지·유료 안내 제거
- 무료·만료·환불 사용자의 DB 2/2 값을 3/4로 보정

이번 목적에는 **정책 상수 + 게이트 해제 + 진입면 숨김 + DB 보정**이 적정 범위입니다.

---

## 9. 구현 착수 전 체크리스트

- [ ] 실제 유료 사용자가 있는지 확인
- [ ] 기존 `pro`/`premium` 사용자 한도 유지 대상 확인
- [ ] DB 보정 SQL 적용 범위 확정
- [ ] 시뮬레이션 통과 확인
- [ ] 제품 코드 수정 시작
- [ ] Edge Function 배포 대상 확인: `send-alarm`, `generate-daily-execution-summaries`, 필요 시 `cancel-subscription`, `payment-webhook`
