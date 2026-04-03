# PHASE A2/A4: Types / Tools Simulation

> 목적: 실제 소스(`types/`, `types.ts`, `vite-env.d.ts`, `tsconfig.json`, `server/tsconfig.json`, `vitest.config.ts` 등)를 직접 수정하기 전에, 타입 엄격화(A2)와 도구/설정 고도화(A4)가 서비스 로직을 건드리지 않고도 안전하게 적용되는지 드라이런하는 문서입니다.  
> 제약: **원본 파일은 직접 수정하지 않음**. 이 문서는 계획·진단·완성형 시뮬레이션 스니펫만 제공합니다.

## 0. Mental Compile 전제

- 이번 스윕에서 `types/`, `types.ts`, `vite-env.d.ts` 내부의 **직접적인 `any`와 non-null assertion(`!`)은 발견되지 않았습니다.**
- 하지만 이것이 곧 A2가 완료되었다는 뜻은 아닙니다. 실제 취약점은 다음 4가지입니다.
  1. **유니온 드리프트:** 도메인에서 허용하는 값 집합과 타입 정의가 어긋납니다.
  2. **느슨한 문자열 타입:** `string`으로 열어둔 프로필/구독 상태 때문에 잘못된 값이 런타임까지 흘러갑니다.
  3. **불완전한 env 선언:** `vite-env.d.ts` 누락 때문에 실제 코드가 `as string`, `(import.meta as any)` 같은 우회로를 사용합니다.
  4. **비엄격 컴파일 파이프라인:** 루트 TS 설정이 strict가 아니고, 루트 빌드/테스트 경로에 별도 `typecheck` 게이트가 없습니다.
- 성공 기준은 아래 7가지입니다.
  1. `types/`와 루트 타입 파일에서 도메인 유니온이 실제 서버/앱 계약과 1:1로 일치합니다.
  2. `vite-env.d.ts`가 현재 사용 중인 env key를 빠짐없이 선언하여 `any`/캐스트 우회를 제거합니다.
  3. **boolean 형 문자열 env**(`BooleanEnvFlag`)는 타입 선언만으로 끝내지 않고, **단일 파싱 유틸(SSOT)** 로만 `boolean`으로 승격합니다 — 호출부에 `if (v === 'true' \|\| v === '1')` 분기 누적 금지(Rule 6·DRY).
  4. `types.ts`의 레거시 `StrategySection` **`enum`을 폐기**하고, 팀 확정 명칭 **`StrategySliceKey`**(`as const` 배열 + 유니온)로 즉시 치환합니다(트리 쉐이킹·역방향 매핑 오버헤드 회피). **의미:** UI 탭이 아니라 **`Strategy` 상의 전략 데이터 조각(Slice)을 식별하는 고유 키**입니다(§0.2). **실제 리네이밍 시** 전역 텍스트 치환 대신 **IDE Rename Symbol**으로 참조를 연쇄 갱신하고, **TS 진단·`tsc` 0건**까지 확인합니다(§0.2·마스터 플랜 항목 6).
  5. `types/toss.d.ts`의 브릿지 응답은 **이름 있는 interface**로 분리해 재사용·문서화 가능한 계약으로 둡니다(A2에서 “2차로 미룸” 금지).
  6. 루트 앱 TS 프로그램과 서버 TS 프로그램이 명확히 분리됩니다.
  7. `vitest`가 `vite` alias/resolve와 정렬되고, 타입 검사까지 포함한 검증 게이트를 가집니다.

### 0.1 확인된 다운스트림 증상

| 경로 | 현재 증상 | 근본 원인 |
|---|---|---|
| `components/auth/ProfileView.tsx` | `import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string` 캐스트가 필요합니다. | `vite-env.d.ts`에 `VITE_TELEGRAM_BOT_USERNAME` 선언이 없습니다. |
| `components/Backtest.tsx` | `(import.meta as any).env?.VITE_BACKTEST_MULTI_URL` / `...NO_STOP...` 우회가 남아 있습니다. | `vite-env.d.ts`에 해당 env key가 없어서 `import.meta.env`를 정식 타입으로 접근하지 못합니다. |
| `services/toss/tossAuth.ts`, `services/payment/tossIapService.ts` | `VITE_RAILWAY_BFF_URL as string \| undefined` 캐스트가 남아 있습니다. | env 타입 정의는 일부 있으나, 사용 계층별 헬퍼/검증이 없습니다. |
| `constants/membership.ts` | `VITE_PLAN_AMOUNT_PRO`, `VITE_PLAN_AMOUNT_PREMIUM`를 읽지만 env 선언은 없습니다. | numeric env string 계약이 누락되어 있습니다. |
| `services/geminiService.ts` | `VITE_GEMINI_EDGE_URL`를 사용하지만 env 선언은 없습니다. | env SSOT 누락입니다. |
| `App.tsx` | `currentTier`를 기반으로 광고 티어를 매핑할 때 `enterprise`가 타입/로직 어디에도 명시되지 않습니다. | `types/userTier.ts`가 subscription tier와 ad tier를 혼동하고 있습니다. |

### 0.2 팀 확정 — `StrategySliceKey` 용어 (UI 탭 ≠ 데이터 슬라이스)

| 항목 | 확정 내용 |
|------|-----------|
| **명칭** | 레거시 `StrategySection`은 **폐기**하고 **`StrategySliceKey`** 로 전면 리네이밍한다. |
| **의미** | **실제 전략 데이터의 조각(Slice)을 식별하는 고유 키**이다. **앱 UI 탭 ID·QuickInput의 `activeSection: 1 \| 2 \| 3` 등과 동일 축이 아니다.** |
| **구현 형태** | TS `enum` 금지. **`STRATEGY_SLICE_KEY_VALUES` `as const`** + **`export type StrategySliceKey = …`** (§3.2.1). |
| **동기화** | `types.ts`와 `supabase/functions/_shared/types.ts`(및 향후 동일 복제본)에 **동일 SSOT**를 적용한다. |
| **마스터 플랜** | `PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` **「확정 — A2 `StrategySliceKey`」** 와 본 절은 동일 계약이다. |
| **리네이밍 실행** | **전역 텍스트 치환(find-replace)만으로 식별자를 바꾸지 말 것.** Cursor/VS Code **Rename Symbol**(F2 등)으로 TypeScript 언어 서비스가 추적하는 **모든 참조(Callers)에 연쇄 반영**한다. `enum` 제거·`as const` 도입 시에는 **이름 Rename → 구조 교체** 순서를 권장한다. |
| **완료·보고** | IDE **TypeScript 진단 0건**, **`tsc --noEmit`**(및 팀이 정한 `typecheck`/`typecheck:server` 스크립트) **에러 0건**, `rg StrategySection` 등으로 **의도치 않은 잔존 식별자 없음**을 확인한 뒤 PR/보고에 명시한다. 상세 절차는 마스터 플랜 **「확정 — A2 `StrategySliceKey`」항목 6** 및 **「A2/A4 교차 — 루트 앱 `tsconfig`·Vite boolean env」**. |

---

## 1. 진입점 분석 (Analysis)

### 1.1 `types/`, `types.ts`, `vite-env.d.ts` 진단

| 파일 | 현재 상태 | 진단 | A2 판단 |
|---|---|---|---|
| `types/userTier.ts` | `export type UserTier = 'free' \| 'pro' \| 'premium';` | 앱 전역 구독 상태는 `enterprise`까지 다루는데, 이 파일은 광고 도메인 기준 3개 값만 표현합니다. 이름은 범용(`UserTier`)인데 실제로는 광고 티어 전용이라 의미가 충돌합니다. | **즉시 정리 필요**. `SubscriptionTier`와 `AdUserTier`를 분리하고 매퍼를 둬야 합니다. |
| `types/appUserProfile.ts` | `subscription_tier`, `subscription_status`, `pending_plan` 등이 광범위한 `string` 기반입니다. | 실제 서버/유틸은 이미 `"free" \| "pro" \| "premium" \| "enterprise"` 등 더 구체적인 유니온을 알고 있는데, 프런트 프로필 타입만 느슨합니다. 잘못된 상태 문자열이 통과해도 컴파일러가 막지 못합니다. | **즉시 정리 필요**. 프로필 응답 타입을 구체 유니온으로 고정해야 합니다. |
| `types/toss.d.ts` | 직접적인 `any`/`!`는 없고 전역 선언도 안전한 편입니다. | 다만 `requestAuth` 반환 구조가 **익명 객체**라, 토스 인증 연동 코드·테스트·문서가 동일 계약을 import로 공유하지 못합니다. | **A2 즉시 정리**. `TossAuthResponse` 등 **명시적 interface**로 승격하고 `Window.TossApp` / `__TOSS_APP__` 시그니처에 연결합니다(§3.2.2). |
| `types.ts` | 전반적으로 `unknown`, exhaustive `never` 등을 잘 사용하고 있습니다. | 레거시 **`StrategySection` `enum`(MA1~MA3)** 는 `Strategy` 객체의 실제 슬라이스 키(`ma0`~`ma3`, 선택적 `multiSplit`·`noStopMultiSplit`·`vrBand`)와 **정합하지 않으며**, 이름이 UI “섹션”처럼 읽혀 **데이터 슬라이스 키**와 혼동을 유발합니다. QuickInput의 `activeSection: 1 \| 2 \| 3` 등은 **별 축**(§0.2). | **A2 즉시 정리**. **`StrategySliceKey`** + **`STRATEGY_SLICE_KEY_VALUES`**(`as const` union)로 교체하고, `supabase/functions/_shared/types.ts` 등 **복제본도 동일 SSOT로 동기화**합니다(§3.2.1). |
| `vite-env.d.ts` | 기존 핵심 키 몇 개만 선언되어 있습니다. | 실제 사용 중인 `VITE_TELEGRAM_BOT_USERNAME`, `VITE_GEMINI_EDGE_URL`, `VITE_PLAN_AMOUNT_PRO`, `VITE_PLAN_AMOUNT_PREMIUM`, `VITE_BACKTEST_MULTI_URL`, `VITE_BACKTEST_NO_STOP_MULTI_URL`가 빠져 있습니다. `VITE_TOSS_INTERSTITIAL_USE_TEST`도 단순 `string`이라 너무 느슨합니다. | **즉시 정리 필요**. env key 누락은 곧 다운스트림 `any`/캐스트 우회로 이어집니다. |

### 1.2 `tsconfig.json` 및 설정 파일 진단

| 파일 | 현재 상태 | 진단 | A4 판단 |
|---|---|---|---|
| `tsconfig.json` | `strict` 없음, `allowJs: true`, `skipLibCheck: true`, `include/exclude` 없음 | 루트 앱 TS 프로그램이 느슨합니다. 특히 `skipLibCheck: true`는 우리가 직접 관리하는 `vite-env.d.ts`, `types/toss.d.ts` 같은 선언 파일 오류까지 숨길 수 있습니다. `include/exclude`가 없어 `server/`, `supabase/` 같은 이질 런타임 코드가 같은 프로그램에 섞일 여지도 있습니다. **교정:** 브라우저 앱용 `tsconfig`의 `compilerOptions.types`에 **`node`를 넣지 않는다**(§3.5) — Node 전역 주입 시 `setTimeout` 등 **추론 충돌**이 재발한다. | **최우선 정리 대상** |
| `server/tsconfig.json` | `strict: true`는 켜져 있으나 세부 strict 플래그는 빠져 있고 `skipLibCheck: true`입니다. | 서버는 루트보다 낫지만 “최대 엄격도”에는 못 미칩니다. **교정:** 베이스에서 **`*.test.ts` exclude + 에미트 전용 단일 config** 는 **테스트 타입 사각지대**를 만든다 — §3.6·§3.6.1·§3.8로 **베이스(테스트 포함·`noEmit`) / 빌드(`tsconfig.build.json`) / vitest `typecheck`** 를 분리한다. | **강화 필요** |
| `vitest.config.ts` | 독립 config이며 `vite.config.ts`와 merge되지 않습니다. `components/**/*.test.tsx`를 include하면서 기본 environment는 `node`입니다. | 현재 `.test.tsx`가 없어서 조용할 뿐, React DOM 테스트가 생기면 런타임 환경이 바로 어긋납니다. 또 별도 `typecheck`가 없어 테스트는 통과해도 타입 오류는 놓칠 수 있습니다. | **즉시 정리 필요** |
| `server/vitest.config.ts` | 최소 설정만 있습니다. | 서버 테스트 자체는 단순하지만 exclude/typecheck/검증 범위가 거의 없습니다. | **보강 권장** |
| 루트 `package.json` 스크립트 | `build:web`는 `vite build`, `test`는 `vitest run`입니다. 별도 `typecheck`가 없습니다. | Vite 빌드는 기본적으로 타입 에러를 막아주지 않습니다. 즉, 현재 루트 파이프라인은 “빌드는 성공했는데 타입은 깨진 상태”를 허용할 수 있습니다. | **A4 핵심 취약점** |

### 1.3 결론

1. 이번 범위의 핵심 문제는 “눈에 보이는 `any`”가 아니라 **타입 경계가 약해서 결국 다른 파일에서 `any`/캐스트로 도망가게 만드는 구조**입니다.
2. 따라서 A2는 단순 치환 작업이 아니라, **도메인 유니온의 SSOT 정리**가 먼저입니다.
3. A4는 `tsconfig` 숫자 몇 개 켜는 수준이 아니라, **앱/서버/테스트 프로그램 경계를 분리하고 typecheck를 빌드 파이프라인에 승격**하는 것이 핵심입니다.

---

## 2. Phase A 액션 플랜 (Action Plan)

### 2.1 A2 타입 엄격화

1. `types/userTier.ts`를 **범용 구독 티어**와 **광고 전용 티어**로 분리합니다.
   - `SubscriptionTier = 'free' | 'pro' | 'premium' | 'enterprise'`
   - `AdUserTier = 'free' | 'pro' | 'premium'`
   - `toAdUserTier(subscriptionTier)`로 다운캐스팅 규칙을 한 곳에 고정합니다.
2. `types/appUserProfile.ts`는 `string`을 제거하고, `SubscriptionTier`, `SubscriptionStatus`, `PendingPlanId`, `AppLang`를 직접 참조하도록 고칩니다.
3. `vite-env.d.ts`는 **현재 실제 사용 중인 env key를 전부 선언**합니다.
   - 누락 키 추가
   - boolean flag는 `'true' | 'false' | '1' | '0'`(`BooleanEnvFlag`)로 선언하되, **런타임 분기는 §3.3.1 단일 파서만 사용**합니다.
   - 금액 env는 `` `${number}` `` 형태로 축소
4. `types/toss.d.ts`는 **즉시** `TossAuthResponse`, `TossAppAdsBridge` 등으로 계약을 명명하고 `TossAppBridgeGlobal`에 연결합니다(§3.2.2). “2차로 미룸” 없음.
5. `types.ts`(및 Edge 공유 `supabase/functions/_shared/types.ts`)의 레거시 `StrategySection` **`enum`을 폐기**하고, 팀 확정 명칭 **`StrategySliceKey`**(§0.2)로 §3.2.1과 동일한 **`as const` + union** 패턴을 적용합니다.

### 2.2 A4 도구/설정 고도화

1. 공통 strict 정책을 `tsconfig.base.json`으로 추출합니다.
   - `strict`
   - `noImplicitAny`
   - `noImplicitOverride`
   - `noImplicitReturns`
   - `noUncheckedIndexedAccess`
   - `exactOptionalPropertyTypes`
   - `noFallthroughCasesInSwitch`
   - `noPropertyAccessFromIndexSignature`
   - `useUnknownInCatchVariables`
   - `forceConsistentCasingInFileNames`
   - `skipLibCheck: false`
2. 루트 `tsconfig.json`은 앱 전용 프로그램으로 축소합니다.
   - `server/`, `supabase/`, `docs2/`를 제외합니다.
   - `allowJs`를 끄고 alias/baseUrl을 명시합니다.
3. `server/tsconfig.json`은 **IDE·`tsc --noEmit`·Vitest typecheck 베이스**로 두고(`noEmit: true`, 테스트 **미 exclude**), **`server/tsconfig.build.json`** 으로 배포 에미트만 분리한다(§3.6·§3.6.1). `server/package.json`의 `build`는 **`tsc -p tsconfig.build.json`** 로 맞춘다.
4. 루트 `vitest.config.ts`는 `vite.config.ts`와 merge하여 alias/resolve를 공유합니다.
5. 루트 `vitest`는 `typecheck`를 켜고, 브라우저 DOM이 필요한 테스트는 `jsdom`으로 분리합니다.
6. 루트 검증 파이프라인에 `typecheck`를 추가합니다.
   - `typecheck`
   - `typecheck:server`
   - `verify:phase-a = typecheck + test + test:server`

### 2.3 권장 적용 순서

1. `types.ts`의 레거시 `StrategySection` **`enum` → `StrategySliceKey`(`STRATEGY_SLICE_KEY_VALUES`)** 교체 + `supabase/functions/_shared/types.ts` 동기화(§0.2·§3.2.1).
2. `types/toss.d.ts`에 **명시적 브릿지 응답/ads 타입** 도입(§3.2.2).
3. `vite-env.d.ts`를 정리하고 §3.3.1 **boolean env 파서**를 추가한 뒤, `interstitialPlacementConfig` 등 호출부가 파서만 쓰도록 정렬합니다.
4. `types/userTier.ts`, `types/appUserProfile.ts`를 정리해 도메인 유니온 SSOT를 굳힙니다.
5. `tsconfig.base.json`을 추가하고 루트/서버 tsconfig를 분리 적용합니다.
6. `vitest.config.ts`를 `vite.config.ts`와 merge하고 typecheck를 추가합니다.
7. 마지막으로 실제 코드에서 env 캐스트와 느슨한 문자열 비교를 제거합니다.

---

## 3. 시뮬레이션용 코드 스니펫 (Before & After)

### 3.1 `types/userTier.ts`

#### ❌ Before

```ts
/**
 * 광고·프리로드 정책에서 사용하는 구독 티어 구분 (무료 vs 유료 경험 분리).
 */
export type UserTier = 'free' | 'pro' | 'premium';
```

#### ✅ After

```ts
/**
 * 구독 도메인 전체가 공유하는 실질 티어.
 * 광고 노출, 멤버십 권한, 서버 정산 규칙이 모두 이 집합을 기준으로 파생된다.
 */
export const SUBSCRIPTION_TIER_VALUES = [
  'free',
  'pro',
  'premium',
  'enterprise',
] as const;

export type SubscriptionTier =
  (typeof SUBSCRIPTION_TIER_VALUES)[number];

/**
 * 광고 시스템은 현재 3개 티어 버킷만 이해한다.
 * enterprise는 paid 상위 플랜이므로 premium 버킷으로 수렴시킨다.
 */
export const AD_USER_TIER_VALUES = [
  'free',
  'pro',
  'premium',
] as const;

export type UserTier = (typeof AD_USER_TIER_VALUES)[number];

export function toAdUserTier(
  subscriptionTier: SubscriptionTier,
): UserTier {
  switch (subscriptionTier) {
    case 'free':
      return 'free';
    case 'pro':
      return 'pro';
    case 'premium':
    case 'enterprise':
      return 'premium';
    default: {
      const exhaustiveCheck: never = subscriptionTier;
      return exhaustiveCheck;
    }
  }
}
```

### 3.2 `types/appUserProfile.ts`

#### ❌ Before

```ts
/**
 * App 전역 상태용 user_profiles 타입
 * Supabase user_profiles 조회 결과 및 setUserProfile 호출 시 사용
 */
export interface AppUserProfile {
  subscription_tier: string;
  max_portfolios: number;
  max_alarms: number;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean;
  telegram_connected_at?: string | null;
  telegram_last_error?: string | null;
  preferred_language?: 'ko' | 'en' | null;
  timezone?: string | null;
  ai_daily_usage?: number;
  ai_monthly_usage?: number;
  backtest_daily_usage?: number;
  last_usage_reset_at?: string | null;
}
```

#### ✅ After

```ts
import type { AppLang } from '../types';
import type { SubscriptionTier } from './userTier';

export const SUBSCRIPTION_STATUS_VALUES = [
  'active',
  'cancelled',
  'expired',
  'trial',
  'refunded',
] as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS_VALUES)[number];

export const PENDING_PLAN_VALUES = [
  'pro',
  'premium',
] as const;

export type PendingPlanId =
  (typeof PENDING_PLAN_VALUES)[number];

/**
 * App 전역 상태용 user_profiles 타입.
 * 프런트 상태가 서버 계약보다 느슨해지면 paid gating, 광고 제거, 멤버십 만료 처리 전부가 흔들리므로
 * 문자열 자유입력을 허용하지 않는다.
 */
export interface AppUserProfile {
  subscription_tier: SubscriptionTier;
  max_portfolios: number;
  max_alarms: number;
  subscription_status?: SubscriptionStatus | null;
  subscription_expires_at?: string | null;
  pending_plan?: PendingPlanId | null;
  pending_plan_effective_at?: string | null;
  telegram_enabled?: boolean;
  telegram_connected_at?: string | null;
  telegram_last_error?: string | null;
  preferred_language?: AppLang | null;
  timezone?: string | null;
  ai_daily_usage?: number;
  ai_monthly_usage?: number;
  backtest_daily_usage?: number;
  last_usage_reset_at?: string | null;
}
```

### 3.2.1 파일 C — `types.ts` (`StrategySliceKey`: 레거시 `StrategySection` `enum` 제거·`Strategy` 슬라이스 키와 1:1 union)

**전제(팀 확정·§0.2):** 본 타입은 **UI 탭이 아니라** `Strategy`에 매달린 **전략 데이터 조각(Slice)을 가리키는 고유 키**이다. `Strategy` 인터페이스는 `ma0`~`ma3`를 항상 갖고, `multiSplit`·`noStopMultiSplit`·`vrBand`는 선택적입니다. QuickInput 등은 `activeSection: 1 | 2 | 3`처럼 **별도 축**으로 ma1~ma3를 다룰 수 있으므로 **`StrategySliceKey`와 혼동하지 않는다.**  
**동기화:** `supabase/functions/_shared/types.ts`에 동일 `enum` 복제가 있으므로, 실제 공사 시 **한쪽을 SSOT로 두고 import하거나 동일 스니펫을 양쪽에 적용**해 드리프트를 막습니다.

#### ❌ Before

```ts
export enum StrategySection {
  MA1 = 'MA1',
  MA2 = 'MA2',
  MA3 = 'MA3',
}
```

#### ✅ After

```ts
/**
 * Strategy 객체와 1:1인 전략 데이터 슬라이스 키 SSOT (팀 명칭: StrategySliceKey).
 * UI 탭 ID가 아님 — QuickInput activeSection 등과 별 축(§0.2).
 * TS enum 대신 as const + union: 번들 트리 쉐이킹·역방향 매핑 오버헤드 회피(Rule 6).
 * 새 전략 필드가 Strategy에 추가되면 이 배열만 갱신 → switch default never로 누락 검출.
 */
export const STRATEGY_SLICE_KEY_VALUES = [
  'ma0',
  'ma1',
  'ma2',
  'ma3',
  'multiSplit',
  'noStopMultiSplit',
  'vrBand',
] as const;

export type StrategySliceKey = (typeof STRATEGY_SLICE_KEY_VALUES)[number];
```

### 3.2.2 파일 D — `types/toss.d.ts` (익명 응답 객체 → 명시적 계약)

**주의:** 저장소 실측 계약은 `Window.TossApp` / `Window.__TOSS_APP__`에 옵셔널 `TossAppBridgeGlobal`이 붙고, `requestAuth`는 **무인자 `() => Promise<...>`** 입니다. 아래는 그 형태를 유지한 채 **익명 객체를 이름 있는 타입으로 승격**한 것입니다. (리뷰 예시의 `tossAppBridge`·`requestAuth(params)`는 본 프로젝트와 불일치하므로 문서에 반영하지 않습니다.)

#### ❌ Before

```ts
interface TossAppBridgeGlobal {
  requestAuth?: () => Promise<{ authorizationCode?: string; code?: string; referrer?: string }>;
  ads?: {
    showReward?: (placementId: string) => Promise<void>;
    showInterstitial?: (placementId: string) => Promise<void>;
  };
}
```

#### ✅ After

```ts
/**
 * 토스 로그인: 인증 코드 요청 응답.
 * 공식/실측 필드명(authorizationCode·code·referrer)을 SSOT로 둔다 — 호출부에서 재해석 금지.
 */
export interface TossAuthResponse {
  authorizationCode?: string;
  code?: string;
  referrer?: string;
}

/** 리워드·전면 광고 브릿지(토스 문서 기준으로 시그니처 보강 시 이 타입만 확장). */
export interface TossAppAdsBridge {
  showReward?: (placementId: string) => Promise<void>;
  showInterstitial?: (placementId: string) => Promise<void>;
}

/** 토스 미니앱 브릿지 전역 객체 타입. */
export interface TossAppBridgeGlobal {
  requestAuth?: () => Promise<TossAuthResponse>;
  ads?: TossAppAdsBridge;
}

declare global {
  interface Window {
    TossApp?: TossAppBridgeGlobal;
    __TOSS_APP__?: TossAppBridgeGlobal;
  }
}
```

### 3.3 `vite-env.d.ts`

#### ❌ Before

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SITE_URL?: string
  /** AI 매매 인식: 무료 티어용 Gemini API 키 (구글 AI 스튜디오 등에서 발급) */
  readonly VITE_GEMINI_API_KEY_FREE?: string
  /** AI 매매 인식: 유료 회원용 Gemini API 키 */
  readonly VITE_GEMINI_API_KEY_PAID?: string
  /** AI 공통 키 (무료/유료 미구분 시 둘 다 이 키 사용) */
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  /** Railway BFF base URL (토스 mTLS·인증·결제 검증용). 예: https://your-app.railway.app */
  readonly VITE_RAILWAY_BFF_URL?: string
  /**
   * `true`/`1`이면 전면 프리로드 config가 운영 ID 대신 토스 테스트 전면 ID를 씁니다.
   * @see services/ads/interstitialPlacementConfig.ts
   */
  readonly VITE_TOSS_INTERSTITIAL_USE_TEST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### 선행 SSOT — `types/viteEnvContract.ts` (**필수**, §3.3·§3.3.1과 동일 리터럴 집합)

`import type`로만 끌어오는 **모듈 스코프** 타입이므로 `BooleanEnvFlag` / `NumericEnvString` 이 프로젝트 전역 네임스페이스를 오염시키지 않는다.

```ts
export type BooleanEnvFlag = 'true' | 'false' | '1' | '0';
export type NumericEnvString = `${number}`;
```

#### ✅ After (`vite-env.d.ts` — 모듈 + `declare global` Augmentation)

**Rule 7 (이전 스니펫 교정):** 최상단에 `type BooleanEnvFlag = …` 를 **import/export 없이** 두면 스크립트 `.d.ts`로 해석될 때 **전역 타입으로 풀려** 서드파티·팀 타입과 **이름 충돌** 위험이 있다. **`import type`로 모듈 경계를 확보**한 뒤 **`declare global` 안에서만** `ImportMetaEnv` / `ImportMeta` 를 보강한다.

**본 저장소(BTD-alarm2) 정합:** `vite-env.d.ts`는 **저장소 루트**에 두는 전제이며, `types/viteEnvContract.ts`도 **루트 `types/`** 에 두면 아래 `import type` 경로(`./types/viteEnvContract`)가 맞다. 마스터 플랜 **§1.4**와 동일 전제다.

```ts
/// <reference types="vite/client" />

import type { BooleanEnvFlag, NumericEnvString } from './types/viteEnvContract';

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_SITE_URL?: string;

    readonly VITE_GEMINI_API_KEY_FREE?: string;
    readonly VITE_GEMINI_API_KEY_PAID?: string;
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_GEMINI_EDGE_URL?: string;

    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_FIREBASE_VAPID_KEY?: string;

    readonly VITE_TELEGRAM_BOT_USERNAME?: string;
    readonly VITE_RAILWAY_BFF_URL?: string;

    readonly VITE_PLAN_AMOUNT_PRO?: NumericEnvString;
    readonly VITE_PLAN_AMOUNT_PREMIUM?: NumericEnvString;

    readonly VITE_BACKTEST_MULTI_URL?: string;
    readonly VITE_BACKTEST_NO_STOP_MULTI_URL?: string;

    readonly VITE_TOSS_INTERSTITIAL_USE_TEST?: BooleanEnvFlag;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
```

### 3.3.1 `BooleanEnvFlag` 파싱 SSOT (`types/viteEnvContract.ts` + `utils/envViteFlags.ts` 권장)

**Rule 6·DRY:** 호출부에 `=== 'true' || === '1'`을 반복하지 말고 **단일 파서**로 모읍니다.

**Rule 7 (이전 스니펫 교정):** 파서 시그니처를 `BooleanEnvFlag | undefined`로만 두고 내부에서 `raw === ''`를 검사하면, 유니온에 `''`가 없어 **strict 하에서 TS2367·불가능 분기**가 난다. 또한 `isEnvFlagEnabled` + 중첩 `if`는 **동일 목적 로직의 이중화(DRY 위반)** 였다.

**분리 원칙:**

- **`types/viteEnvContract.ts`:** `BooleanEnvFlag`·`NumericEnvString` **SSOT(필수)** — §3.3 `vite-env.d.ts`가 `import type`로 참조하고, 파서·기타 모듈도 동일 파일을 쓴다.
- **`vite-env.d.ts`:** §3.3 After처럼 **모듈 + `declare global`** 로만 `ImportMetaEnv`를 확장한다(전역 `type` 별칭 금지).
- **`parseViteBooleanEnvFlag`:** 런타임에는 빈 문자열·오타·비문자열이 섞일 수 있으므로 인자는 **`unknown`** 으로 받아, **한 식으로** `true`만 인정하고 나머지는 전부 `false`로 수렴한다(선언의 사각지대 방어).

#### 파서 (신규 파일 예: `utils/envViteFlags.ts`) — **교체 확정 스니펫**

```ts
/**
 * Vite `import.meta.env`의 boolean-like 문자열 전용 안전 파서.
 * `ImportMetaEnv`의 `BooleanEnvFlag`는 컴파일 타임에만 좁히고, 런타임에는 `''`·`unknown` 유입이 가능하므로
 * 인자는 `unknown`으로 받아 단일 식으로만 평가한다(Rule 6·7).
 * `services/ads/interstitialPlacementConfig.ts` 등에서는 직접 분기하지 말고 이 함수만 사용한다.
 */
export function parseViteBooleanEnvFlag(raw: unknown): boolean {
  return raw === 'true' || raw === '1';
}
```

**검증:** 단위 테스트로 `'true'`, `'1'`, `'false'`, `'0'`, `''`, `undefined`, 임의 문자열·비원시값을 넣어 **기대 `boolean`**만 고정한다. `import.meta.env.VITE_*`는 호출부에서 `parseViteBooleanEnvFlag(import.meta.env.VITE_TOSS_INTERSTITIAL_USE_TEST)`처럼 넘기면 된다.

### 3.4 `tsconfig.base.json` (신규)

#### ❌ Before

```json
없음
```

#### ✅ After

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false,
    "resolveJsonModule": true
  }
}
```

### 3.5 루트 `tsconfig.json`

#### ❌ Before

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

#### ✅ After

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "jsx": "react-jsx",
    "moduleDetection": "force",
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "allowJs": false,
    "verbatimModuleSyntax": true,
    "baseUrl": ".",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "types": [
      "vite/client",
      "vitest/globals"
    ],
    "noEmit": true
  },
  "include": [
    "App.tsx",
    "index.tsx",
    "types.ts",
    "vite-env.d.ts",
    "components/**/*.ts",
    "components/**/*.tsx",
    "constants/**/*.ts",
    "features/**/*.ts",
    "features/**/*.tsx",
    "hooks/**/*.ts",
    "hooks/**/*.tsx",
    "services/**/*.ts",
    "services/**/*.tsx",
    "types/**/*.ts",
    "types/**/*.d.ts",
    "utils/**/*.ts",
    "utils/**/*.tsx",
    "*.config.ts",
    "*.config.mts",
    "*.test.ts",
    "*.test.tsx"
  ],
  "exclude": [
    "dist",
    "node_modules",
    "docs2",
    "server",
    "supabase",
    "toss-bff"
  ]
}
```

**A4·런타임 분리 주의:** 루트 앱 `tsconfig`에서 **`"node"`를 `types`에 넣지 않는다** — 브라우저 번들에 Node 전역 타입이 스며들면 `setTimeout` 등이 **`NodeJS.Timeout` vs 브라우저 `number`** 로 다시 충돌할 수 있다(진입점 시뮬에서 이미 지적한 이슈와 동일).  
`vite.config.ts`·`granite.config.ts` 등 **Node 전용 빌드 스크립트**는 Vite 표준처럼 **`tsconfig.node.json`**(또는 동등하게 **`types`: `["node"]`만 포함하는 별도 tsconfig**)으로만 검사·보완한다. `*.config.ts`를 루트 `include`에 두었을 때 타입 에러가 나면 **해당 파일을 node 전용 tsconfig로 분리**하는 것이 정석이다.

### 3.6 `server/tsconfig.json` (파일 E-1 — IDE·테스트·`tsc --noEmit` 베이스)

**Rule 7 (이전 스니펫 교정):** 베이스 `server/tsconfig.json`에서 **`src/**/*.test.ts`를 exclude**해 두면, **`tsc`가 테스트 소스를 아예 검사하지 않는 사각지대**가 생긴다. **베이스 설정은 테스트를 포함**하고 **`noEmit: true`** 로 “타입 검사만” 수행하게 두고, **에미트(배포 산출물)** 는 별도 **`tsconfig.build.json`**(§3.6.1)에서만 수행한다.

#### ❌ Before

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts"]
}
```

#### ✅ After

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "rootDir": "./src",
    "types": ["node"],
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.d.ts"
  ]
}
```

### 3.6.1 `server/tsconfig.build.json` (파일 E-2 — 프로덕션 빌드 전용)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": false,
    "noEmitOnError": true
  },
  "exclude": [
    "src/**/*.test.ts",
    "src/__mocks__/**"
  ]
}
```

**`server/package.json` 정합:** `"build": "tsc"` 를 **`tsc -p tsconfig.build.json`**(또는 동등한 `--project`)로 갱신해, 배포 시 **베이스가 아닌 빌드 전용 config**만 에미트하도록 한다.

### 3.7 루트 `vitest.config.ts`

#### ❌ Before

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'utils/**/*.test.ts',
      'components/**/*.test.tsx',
      'hooks/**/*.test.ts',
      'server/src/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
    ],
  },
});
```

#### ✅ After

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: [
        'utils/**/*.test.ts',
        'components/**/*.test.tsx',
        'hooks/**/*.test.ts',
        'hooks/**/*.test.tsx',
      ],
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/.turbo/**',
        '**/.next/**',
        'server/**',
        'supabase/**',
      ],
      environmentMatchGlobs: [
        ['components/**/*.test.tsx', 'jsdom'],
        ['hooks/**/*.test.ts', 'jsdom'],
        ['hooks/**/*.test.tsx', 'jsdom'],
      ],
      typecheck: {
        enabled: true,
        checker: 'tsc',
        tsconfig: './tsconfig.json',
      },
    },
  }),
);
```

**정합:** 루트는 **Vitest 4.0.x** — `typecheck` 키 스키마는 §3.8과 동일하며, `tsc -p`로 **루트 `tsconfig.json` 프로그램 전체**를 검사한다. **`ignoreSourceErrors`는 기본 `false` 유지.** 마스터 플랜 **§1.4** 참고.

### 3.8 `server/vitest.config.ts`

#### ❌ Before

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

#### ✅ After

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      checker: 'tsc',
      tsconfig: './tsconfig.json',
    },
  },
});
```

**Rule 7:** `typecheck.tsconfig`는 §3.6 베이스 **`server/tsconfig.json`** 을 가리킨다(`noEmit: true`이며 **`*.test.ts`를 exclude하지 않음`). Vitest(본 저장소: `server`는 **Vitest 3.2.x**, 루트는 **4.0.x**)는 `enabled: true`일 때 **`tsc --noEmit -p`로 해당 tsconfig의 프로그램 전체**를 검사한다. `typecheck.include` 기본값은 `*.test-d.*` 계열이지만, **`ignoreSourceErrors`를 켜지 않는 한**(기본 `false`) **그 외 파일의 타입 오류도 실패로 집계**되어, `*.test.ts`만 조용히 통과하는 **Silent Pass** 와 맞서게 된다. **`checker: 'tsc'`** 는 기본과 동일하나 설정 의도를 드러내기 위해 둔다. 상위 정책 문구: `docs2/PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` **§1.4**.

---

## 4. 적용 후 기대 효과

1. `vite-env.d.ts` 누락 때문에 생긴 `as string`, `(import.meta as any)` 우회를 제거할 기반이 생깁니다. **`import type` + `declare global`** 로 **전역 타입 오염 없이** `ImportMetaEnv`만 보강한다(§3.3).
2. `BooleanEnvFlag` 분기가 **`parseViteBooleanEnvFlag` 한 곳**으로 모여, 호출부 지저분함과 불일치가 줄어듭니다.
3. **`StrategySliceKey`** 가 **`Strategy` 슬라이스 키와 1:1**이 되어, 레거시 `StrategySection` enum 드리프트·트리 쉐이킹 비용이 사라지고 UI 탭과의 용어 혼동이 줄어듭니다.
4. 토스 브릿지 응답이 **`TossAuthResponse` 등 명명된 계약**으로 공유되어, 인증 연동·테스트 가독성이 올라갑니다.
5. `AppUserProfile`와 티어 타입이 서버 계약과 맞아져서, 멤버십/광고/권한 분기에서 잘못된 문자열이 숨어들 공간이 줄어듭니다.
6. 루트 앱과 서버가 서로 다른 런타임인데도 한 TS 프로그램에 묶여 흔들리던 문제가 줄어듭니다.
7. 서버 **`*.test.ts`** 가 베이스 `tsconfig`·**Vitest `typecheck`** 아래에 들어가 **Silent Pass 타입 사각지대**가 사라집니다.
8. `vite build`만으로는 놓치던 타입 오류를 `typecheck` 단계에서 조기 차단할 수 있습니다.
9. 새 티어, 새 env key, 새 전략이 추가될 때 “조용히 런타임으로 새는” 대신 컴파일 타임에 실패하게 만들 수 있습니다.

## 5. 실제 공사 전 체크리스트

1. `types.ts`의 레거시 `StrategySection` **`enum` 제거·`StrategySliceKey`(§0.2)·§3.2.1 union 적용** 후, `supabase/functions/_shared/types.ts`와 **동일 SSOT**로 맞춥니다. 식별자 갱신은 **IDE Rename Symbol**로 연쇄 반영하고, **§0.2 표·마스터 플랜 항목 6**의 **TS 0에러·잔존 검색** 기준으로 완료를 보고합니다.
2. `types/toss.d.ts`에 §3.2.2 **명시적 interface**를 적용하고, `services/toss/*.ts` 등에서 `TossAuthResponse`를 재사용할 수 있는지 확인합니다.
3. **`types/viteEnvContract.ts`**(필수 SSOT) + §3.3 **`vite-env.d.ts`**(`import type`·`declare global`) + `utils/envViteFlags.ts`(§3.3.1)를 한 세트로 적용한 뒤, `getResolvedInterstitialAdGroupId` 등이 **파서만** 쓰는지 grep으로 확인합니다.
4. `types/userTier.ts`를 적용한 뒤, `App.tsx`와 광고 계층이 `toAdUserTier()`를 쓰도록 정렬합니다.
5. `types/appUserProfile.ts` 적용 후 `hooks/useAuth.ts`, `hooks/usePortfolios.ts`, `utils/subscriptionUtils.ts`의 중복 타입을 정리합니다.
6. `vite-env.d.ts` 적용 직후 아래 우회 코드를 제거합니다.
   - `components/Backtest.tsx`
   - `components/auth/ProfileView.tsx`
   - `services/payment/tossIapService.ts`
   - `services/toss/tossAuth.ts`
7. `tsconfig.base.json` 도입 후 `npm run typecheck` / `npm run typecheck:server` 스크립트를 추가합니다(서버는 베이스 `server/tsconfig.json`에 `tsc --noEmit`이 테스트를 포함하는지 확인).
8. 루트 `vitest.config.ts`를 바꾼 뒤, UI 테스트가 없더라도 `jsdom` 분기와 `typecheck`가 정상 동작하는지 먼저 확인합니다.
9. **`server/tsconfig.json`**(§3.6)·**`server/tsconfig.build.json`**(§3.6.1) 분리 후, **`server/package.json`** 의 `build`를 **`tsc -p tsconfig.build.json`** 으로 갱신합니다.
10. **`server/vitest.config.ts`**에 §3.8 **`typecheck.enabled: true`** 를 적용하고, `tsconfig: './tsconfig.json'` 이 베이스(테스트 미 exclude)를 가리키는지 확인합니다.

## 6. 최종 판단

- 이번 범위는 “타입 파일 자체에 `any`가 많다”가 아니라, **타입 정의가 약해서 결국 애플리케이션 코드가 `any`와 캐스트로 무너지는 상태**입니다.
- 따라서 Phase A A2/A4의 정답은 단순 문법 청소가 아니라, **`StrategySliceKey` 등 도메인 유니온 SSOT 확립 + 서드파티(토스) 브릿지 계약 명명 + env 모듈형 Augmentation·파싱 완결 + 서버 베이스/빌드 tsconfig 분리·Vitest typecheck + strict compiler gate 승격**입니다.
- 위 스니펫 순서대로 들어가면 서비스 로직을 직접 바꾸지 않고도, 타입/빌드/테스트 기반을 훨씬 더 강하게 만들 수 있습니다.
