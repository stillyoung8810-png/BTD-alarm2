# 토스 포인트형 혜택 탭 추가 계획서

**상태**: 문서 전용 - 제품 코드 변경 전 검토·시뮬레이션용  
**목표**: 하단 네비게이션에 `혜택` 탭을 추가하고, 출석체크·주식 가격 예측·주식 상식 퀴즈·토스 포인트 받기 흐름을 설계  
**시뮬레이션**: `docs2/toss_point/toss_point_reward_simulation.test.ts`  
**실행 명령**: `npx vitest run --config docs2/toss_point/vitest.toss_point_reward.config.ts`

---

## 0. 결론

현재 구조에서는 **새 탭 + 서버 상태 관리 + 기존 광고 서비스 재사용** 방식으로 적용하는 것이 적합합니다. 제품 구현 전에 반드시 시뮬레이션을 통과시킨 뒤 진행합니다.

권장 탭명은 `혜택`입니다. `토스 포인트`를 탭명으로 쓰면 사용자가 토스 공식 포인트 지갑으로 오인지할 수 있고, 내부 리워드에는 `포인트`라는 명칭을 쓰지 말라는 토스 가이드와도 충돌 여지가 있습니다. 내부 단위는 `머니`, 최종 버튼은 `토스 포인트 받기`로 제한합니다.

핵심 정책은 아래입니다.

| 기능 | 정책 |
|------|------|
| 출석체크 | 1일 1회, `1머니` 지급 |
| 연속 출석 보너스 | 10회 연속 출석마다 전면광고 시청 후 `10머니` 추가 |
| 주식 가격 예측 | 1일 기본 1문제, 보상광고로 추가 문제 해금, 하루 최대 5문제 |
| 주식 상식 퀴즈 | 1일 기본 1문제, 보상광고로 추가 문제 해금, 하루 최대 5문제 |
| 문제 참여 보상 | 문제 제출 시 무조건 `1머니` |
| 정답 보상 | 정답 시 `9머니` 추가 지급, 총 `10머니` |
| 토스 포인트 받기 | 누적 `1,000머니`마다 토스 포인트 `100P` 지급 요청, 1회 요청 최대 `5,000P` |
| 광고 | 출석 영역 배너, 문제 완료 전면광고, 추가 문제 해금 보상광고 |

---

## 1. 현재 시스템 검토

### 1.1 네비게이션

하단 네비게이션은 `App.tsx`의 `floating-nav` 안에서 `NavIcon`으로 렌더링됩니다.

```tsx
<NavIcon active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} label={t.dashboard} />
<NavIcon active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={22} />} label={t.history} />
<NavIcon active={activeTab === 'markets'} onClick={() => setActiveTab('markets')} icon={<BarChart3 size={22} />} label={t.markets} />
```

새 탭은 `ActiveTab`에 `benefits`를 추가하고, `TabContent.tsx`에 `Benefits` lazy 컴포넌트를 추가하는 방식이 가장 작습니다.

### 1.2 광고

현재 광고는 이미 용도별로 분리되어 있습니다.

| 광고 | 기존 자산 | 이번 기능에서의 사용 |
|------|-----------|----------------------|
| 배너 | `TossInlineBanner`, `useTossBanner`, `tossBannerService.ts` | 혜택 홈/출석체크 영역 |
| 전면 | `GlobalAdManager`, `INTERSTITIAL_PLACEMENT_KEYS` | 문제 완료, 10연속 출석 보너스 |
| 보상형 | `requestRewardAd`, 혜택 전용 보상형 광고 그룹 ID | 추가 문제 1회 해금 |

새 SDK 래퍼를 만들 필요는 없습니다. 필요한 것은 **새 광고 지면 key와 광고 그룹 ID 상수 추가**입니다. 혜택용 보상형 광고 그룹 ID는 승인 후 전달받는 실제 ID로 교체합니다.

### 1.3 토스 프로모션

토스 포인트 지급은 문서상 `grantPromotionReward` 또는 서버 지급 방식을 사용할 수 있습니다. 이번 기능은 머니 잔액·중복 지급·일일 한도·예산 실패 처리가 중요하므로 **서버 지급 방식 우선**이 맞습니다.

클라이언트에서 직접 토스 포인트를 지급하면 위변조와 중복 호출 방지가 약해집니다. 서버에서 `userId`, `tossUserKey`, `promotionCode`, `amount`, `txId`, `status`를 저장하고, `PENDING/SUCCESS/FAILED`를 대사할 수 있어야 합니다.

---

## 2. 제품 정책

### 2.1 용어

| 용어 | 사용 여부 | 이유 |
|------|-----------|------|
| 혜택 | 권장 | 탭명으로 자연스럽고 토스 공식 포인트 오인지가 적음 |
| 머니 | 허용 검토 | 실제 출시 사례가 있으나, 검수 문구를 사전 확인해야 함 |
| 포인트 | 내부 단위로 사용 금지 | 토스 포인트와 혼동 가능 |
| 출금/환전/인출/꺼내기 | 사용 금지 | 현금화 오인지 가능 |
| 토스 포인트 받기 | 권장 | 최종 프로모션 지급 액션으로 명확함 |

### 2.2 토스 검수 리스크

실제 유사 출시 사례가 있으므로 동일 계열 설계가 절대 불가하다고 보기는 어렵습니다. 다만 문서상으로는 `유저가 보유한 재화를 토스포인트로 교환/전환`하는 구조가 제한될 수 있으므로, 검수 제출 전 아래 표현으로 정리합니다.

```text
앱 내 미션 보상 단위인 머니를 모으면,
프로모션 예산 범위 내에서 토스 포인트를 받을 수 있습니다.
부정 참여, 중복 참여, 예산 소진, 프로모션 종료 시 지급이 제한될 수 있습니다.
```

피해야 하는 문구:

```text
머니 환전
머니 출금
머니 인출
현금화
돈으로 바꾸기
```

**출시 게이트**: 토스 검수에서 `머니 누적 후 토스 포인트 받기`, `정답 여부에 따른 머니 차등 지급`, `가격 예측 미션`이 승인되지 않으면 이 기능은 출시하지 않습니다. 구현 단계에서는 feature flag를 기본 `off`로 두고, 검수 승인 전에는 네비게이션 탭도 노출하지 않습니다. 노출 조건은 `feature flag on`, `토스 프로모션 승인`, `승인 광고 그룹 ID 준비`, `서버 API 준비`, `토스 앱 환경`이 모두 참일 때만 통과합니다.

```typescript
export interface BenefitFeatureGateInput {
  readonly isFeatureFlagEnabled: boolean;
  readonly hasTossPromotionApproval: boolean;
  readonly requiredAdGroupIds: readonly string[];
  readonly hasBenefitApiReady: boolean;
  readonly isInTossApp: boolean;
}

const PENDING_AD_GROUP_ID_PREFIX = 'APPROVED_';

export function hasApprovedAdGroupId(adGroupId: string): boolean {
  const normalizedAdGroupId = adGroupId.trim();
  if (normalizedAdGroupId === '') {
    return false;
  }

  return !normalizedAdGroupId.startsWith(PENDING_AD_GROUP_ID_PREFIX);
}

export function hasApprovedRequiredAdGroupIds(
  adGroupIds: readonly string[],
): boolean {
  if (adGroupIds.length === 0) {
    return false;
  }

  return adGroupIds.every(hasApprovedAdGroupId);
}

export function shouldExposeBenefitTab(input: BenefitFeatureGateInput): boolean {
  return (
    input.isFeatureFlagEnabled &&
    input.hasTossPromotionApproval &&
    hasApprovedRequiredAdGroupIds(input.requiredAdGroupIds) &&
    input.hasBenefitApiReady &&
    input.isInTossApp
  );
}
```

광고 그룹 ID는 승인 전 placeholder 문자열(`APPROVED_...`)일 때 출시 게이트를 통과시키지 않습니다. feature flag가 켜져 있어도 실제 승인 ID가 모두 주입되지 않으면 `혜택` 탭은 노출하지 않습니다.

---

## 3. 구현 범위

### 3.1 1차 구현

| 영역 | 1차 범위 |
|------|----------|
| UI | 하단 `혜택` 탭, 상단 누적 머니 보드, 출석체크, 가격 예측, 상식 퀴즈, 토스 포인트 받기 |
| 문제은행 | DB 저장, 600문제 목표, 출제 우선순위 적용 |
| 광고 | 배너/전면/보상형 기존 래퍼 재사용 |
| 보상 | 서버에서 머니 원장 적립, 1,000머니 단위 토스 포인트 지급 |
| 어뷰징 방지 | 일일 제한, 중복 제출 방지, 보상광고 버튼 mutex, 원장 idempotency |

### 3.2 이번에 하지 않을 것

| 제외 항목 | 이유 |
|----------|------|
| 별도 광고 SDK 추상화 | 기존 서비스로 충분함 |
| 실시간 랭킹 | 검수 리스크와 운영 비용 증가 |
| 확률형 보상 | 검수 리스크 증가 |
| AI 자동 문제 생성 | 품질 검수와 오답 리스크가 큼 |
| 보상 무제한 반복 | 어뷰징·광고 피로·검수 리스크 증가 |

---

## 4. 데이터 모델

서버는 Supabase 테이블 또는 Edge Function 뒤의 API 서버로 구현합니다. 클라이언트는 보상 금액을 직접 신뢰하지 않고, 서버 응답만 표시합니다.

```sql
create table benefit_wallets (
  user_id uuid primary key,
  money_balance integer not null default 0 check (money_balance >= 0),
  lifetime_earned_money integer not null default 0 check (lifetime_earned_money >= 0),
  updated_at timestamptz not null default now()
);

create table benefit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  source_id text not null,
  delta_money integer not null,
  money_balance_after integer not null check (money_balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

create table benefit_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  attendance_date date not null,
  consecutive_days integer not null check (consecutive_days > 0),
  base_money integer not null default 1,
  streak_bonus_money integer not null default 0,
  streak_bonus_ad_shown boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, attendance_date)
);

create table benefit_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  category text not null,
  difficulty text not null,
  question text not null,
  choices jsonb not null,
  correct_choice_id text not null,
  explanation text not null,
  is_active boolean not null default true,
  total_attempts integer not null default 0 check (total_attempts >= 0),
  correct_attempts integer not null default 0 check (correct_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table benefit_mission_daily_states (
  user_id uuid not null,
  mission_kind text not null check (mission_kind in ('price_prediction', 'stock_quiz')),
  mission_date date not null,
  completed_attempts integer not null default 0 check (completed_attempts between 0 and 5),
  rewarded_ad_unlocks integer not null default 0 check (rewarded_ad_unlocks between 0 and 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_kind, mission_date),
  check (completed_attempts <= rewarded_ad_unlocks + 1)
);

create table benefit_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question_id uuid not null references benefit_quiz_questions(id),
  attempt_date date not null,
  attempt_sequence integer not null check (attempt_sequence between 1 and 5),
  idempotency_key text not null,
  selected_choice_id text not null,
  is_correct boolean not null,
  reward_money integer not null check (reward_money >= 0),
  answered_at timestamptz not null default now(),
  unique (user_id, attempt_date, attempt_sequence),
  unique (user_id, idempotency_key)
);
```

`benefit_mission_daily_states`는 보상광고 해금의 서버 단일 진실입니다. 광고 SDK 이벤트키나 별도 intent는 만들지 않되, 사용자가 광고를 본 뒤 서버가 이 행을 `FOR UPDATE`로 잠그고 `rewarded_ad_unlocks`를 원자적으로 증가시킵니다. 새로고침, 앱 재진입, 네트워크 재시도 후에도 “오늘 몇 문제까지 열렸는지”가 보존되어야 하므로 클라이언트 `boolean`만으로 처리하지 않습니다.

`check (completed_attempts <= rewarded_ad_unlocks + 1)`은 무료 1회와 광고 해금 횟수보다 많이 푼 상태를 DB가 거부하는 마지막 방어선입니다. 서버 버그나 수동 데이터 수정이 있어도 “5문제 완료, 광고 해금 0회” 같은 불가능한 상태가 저장되지 않아야 합니다.

`benefit_quiz_attempts`는 `question_id` 단독 unique를 두지 않습니다. 사용자가 문제은행을 모두 푼 뒤 최근 30일 제외 정책에 따라 같은 문제를 다시 풀 수 있어야 하기 때문입니다. 중복 제출 방지는 `attempt_date + attempt_sequence`와 `idempotency_key`로 처리합니다.

가격 예측은 문제은행과 별도 테이블을 둡니다. 가격 데이터는 기존 `stock_prices`/`stockService` 계열을 재사용하고, 예측 문제 생성 시 기준가와 결과가를 저장해 사후 데이터 변동으로 채점이 바뀌지 않게 합니다.

```sql
create table benefit_prediction_questions (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  question_date date not null,
  base_trade_date date not null,
  base_close numeric not null check (base_close > 0),
  result_trade_date date,
  result_close numeric check (result_close > 0),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table benefit_prediction_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question_id uuid not null references benefit_prediction_questions(id),
  attempt_date date not null,
  attempt_sequence integer not null check (attempt_sequence between 1 and 5),
  idempotency_key text not null,
  selected_direction text not null check (selected_direction in ('up', 'down')),
  is_correct boolean,
  reward_money integer not null default 1 check (reward_money >= 0),
  answered_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (user_id, attempt_date, attempt_sequence),
  unique (user_id, idempotency_key)
);
```

토스 포인트 지급 대사용 테이블입니다.

```sql
create table benefit_toss_point_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  redeem_request_id text not null,
  promotion_code text not null,
  redeemed_money integer not null check (redeemed_money > 0),
  toss_point_amount integer not null check (toss_point_amount > 0),
  toss_reward_key text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, redeem_request_id)
);
```

`redeem_request_id`는 버튼 연타, 새로고침, 네트워크 재시도에도 같은 요청이 한 번만 처리되도록 하는 idempotency key입니다. `unique (user_id, id)`는 `id`가 이미 primary key라 중복 지급 방어가 되지 않으므로 사용하지 않습니다.

---

## 5. 문제은행 정책

### 5.1 수량

초기 목표는 총 600문제입니다.

| 단계 | 수량 | 예시 |
|------|------|------|
| 1차 | 핵심 주식 상식 200문제 | 주식, ETF, 배당, 분산투자 |
| 2차 | ETF/배당/지수/환율/금리 200문제 | S&P 500, 금리, 환율, 채권 ETF |
| 3차 | 시사형/기업형/용어 비교 200문제 | 엔비디아, 테슬라, 실적, PER/PBR |

카테고리는 아래 8개를 기본으로 둡니다.

```typescript
export const BENEFIT_QUIZ_CATEGORIES = [
  'stock_basic',
  'etf_fund',
  'dividend_earnings',
  'us_stock',
  'economic_indicator',
  'investment_terms',
  'risk_management',
  'market_current_affairs',
] as const;
```

### 5.2 출제 우선순위

문제 수보다 재사용 정책이 중요합니다.

1. 아직 안 푼 문제
2. 최근 30일 내 안 나온 문제
3. 정답률이 너무 높거나 낮지 않은 문제
4. 그래도 없으면 전체 활성 문제 중 안정 정렬 랜덤 또는 fallback

시뮬레이션 스니펫은 이 정책을 `selectNextQuizQuestion`으로 검증합니다.

---

## 6. 구현 스니펫

### 6.1 하단 탭 추가

`App.tsx`에서 `Gift` 아이콘을 사용합니다. 이모지 대신 `lucide-react` 아이콘을 쓰면 현재 네비게이션 스타일과 맞습니다.

```tsx
import {
  LayoutDashboard,
  BarChart3,
  History as HistoryIcon,
  UserCircle,
  Languages,
  Crown,
  FileText,
  Gift,
} from 'lucide-react';
```

`I18N`에는 UI 문자열을 추가합니다.

```typescript
export const I18N = {
  ko: {
    // ... existing copy
    benefits: '혜택',
  },
  en: {
    // ... existing copy
    benefits: 'Benefits',
  },
} as const;
```

하단 nav 스니펫입니다.

```tsx
<NavIcon
  active={activeTab === 'benefits'}
  onClick={() => setActiveTab('benefits')}
  icon={<Gift size={22} />}
  label={t.benefits}
/>
```

### 6.2 `ActiveTab`과 `TabContent`

```tsx
const Benefits = React.lazy(() => import('@/components/Benefits'));

export type ActiveTab =
  | 'dashboard'
  | 'markets'
  | 'history'
  | 'benefits'
  | 'backtest'
  | 'pricing'
  | 'privacy'
  | 'terms';
```

```tsx
case 'benefits':
  if (user == null) {
    return (
      <Landing
        lang={lang}
        onOpenSignup={onOpenSignup}
        onOpenLogin={onOpenLogin}
        onContinueWithToss={onContinueWithToss}
      />
    );
  }

  return (
    <React.Suspense
      fallback={<SuspenseFallback message={copy.loadingBenefits} />}
    >
      <Benefits
        lang={lang}
        userId={user.id}
        portfolios={portfolios}
        shouldShowAds={shouldShowAds}
      />
    </React.Suspense>
  );
```

`APP_SHELL_MESSAGES`에는 `loadingBenefits`를 추가합니다. 실제 구현 시 `SuspenseFallback` 메시지도 i18n에서만 읽습니다.

### 6.3 보상 정책 순수 모듈

구현 시 `services/benefits/benefitRewardPolicy.ts`로 옮길 후보입니다. 현재 동일 로직은 시뮬레이션 파일 `toss_point_reward_simulation_snippets.ts`에 있습니다.

```typescript
export type AnswerOutcome = 'correct' | 'incorrect';

const PARTICIPATION_REWARD_MONEY = 1;
const CORRECT_BONUS_MONEY = 9;

export function calculateAttemptReward(outcome: AnswerOutcome) {
  switch (outcome) {
    case 'correct':
      return {
        baseMoney: PARTICIPATION_REWARD_MONEY,
        bonusMoney: CORRECT_BONUS_MONEY,
        totalMoney: PARTICIPATION_REWARD_MONEY + CORRECT_BONUS_MONEY,
      };
    case 'incorrect':
      return {
        baseMoney: PARTICIPATION_REWARD_MONEY,
        bonusMoney: 0,
        totalMoney: PARTICIPATION_REWARD_MONEY,
      };
    default: {
      const _exhaustiveCheck: never = outcome;
      return _exhaustiveCheck;
    }
  }
}
```

### 6.4 하루 5문제 제한과 보상광고 해금

무료 1회 이후 추가 문제는 보상광고 시청 완료 후 1회씩 열립니다. 가격 예측과 상식 퀴즈는 각각 독립적으로 하루 최대 5회입니다.

```typescript
const DAILY_FREE_ATTEMPT_COUNT = 1;
const DAILY_MAX_ATTEMPTS_PER_MISSION = 5;
const DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION =
  DAILY_MAX_ATTEMPTS_PER_MISSION - DAILY_FREE_ATTEMPT_COUNT;

export interface DailyAttemptState {
  readonly completedAttempts: number;
  readonly rewardedAdUnlocks: number;
}

function assertDailyAttemptState(state: DailyAttemptState): void {
  if (
    state.completedAttempts < 0 ||
    state.completedAttempts > DAILY_MAX_ATTEMPTS_PER_MISSION
  ) {
    throw new Error('completedAttempts_out_of_range');
  }

  if (
    state.rewardedAdUnlocks < 0 ||
    state.rewardedAdUnlocks > DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION
  ) {
    throw new Error('rewardedAdUnlocks_out_of_range');
  }

  if (state.completedAttempts > state.rewardedAdUnlocks + DAILY_FREE_ATTEMPT_COUNT) {
    throw new Error('completedAttempts_must_not_exceed_unlocked_attempts');
  }
}

export function resolveDailyAttemptAvailability(state: DailyAttemptState) {
  assertDailyAttemptState(state);

  const availableAttempts = Math.min(
    DAILY_FREE_ATTEMPT_COUNT + state.rewardedAdUnlocks,
    DAILY_MAX_ATTEMPTS_PER_MISSION,
  );
  const remainingAttempts = Math.max(
    0,
    availableAttempts - state.completedAttempts,
  );
  const hasAttemptCapacity =
    state.completedAttempts < DAILY_MAX_ATTEMPTS_PER_MISSION;
  const hasRewardedAdUnlockCapacity =
    state.rewardedAdUnlocks < DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION;

  return {
    maxAttempts: DAILY_MAX_ATTEMPTS_PER_MISSION,
    availableAttempts,
    remainingAttempts,
    canStartAttempt: remainingAttempts > 0,
    canWatchRewardedAd:
      hasAttemptCapacity &&
      hasRewardedAdUnlockCapacity &&
      availableAttempts < DAILY_MAX_ATTEMPTS_PER_MISSION,
  };
}

export function resolveMissionAvailabilityForView(
  state: DailyAttemptState,
) {
  try {
    return resolveDailyAttemptAvailability(state);
  } catch {
    return null;
  }
}
```

서버 로직은 invalid daily state를 예외로 중단시켜 원장 오염을 막습니다. 반대로 UI는 서버 응답이 일시적으로 깨져도 white screen을 만들지 않도록 `resolveMissionAvailabilityForView()`의 `null` 결과를 빈 상태/재시도 안내로 렌더링합니다.

보상광고 해금은 기존 서비스와 같은 `boolean` 완료 여부와 클라이언트 mutex를 사용합니다. 1차 구현에서는 광고 SDK 이벤트키나 서버 intent를 만들지 않습니다. 대신 서버의 `benefit_mission_daily_states` 행을 잠그고 오늘 완료 횟수와 해금 횟수를 확인해 미션별 하루 추가 해금 4회를 넘지 않게 막습니다.

```typescript
export function grantRewardedAdUnlock(
  state: DailyAttemptState,
): DailyAttemptState {
  const availability = resolveDailyAttemptAvailability(state);
  if (!availability.canWatchRewardedAd) {
    return state;
  }

  return {
    ...state,
    rewardedAdUnlocks: state.rewardedAdUnlocks + 1,
  };
}
```

클라이언트 이벤트 핸들러는 동시 클릭을 막습니다.

```tsx
const REWARD_UNLOCK_BENEFIT_QUIZ_AD_GROUP_ID = 'APPROVED_BENEFIT_QUIZ_REWARD_AD_GROUP_ID';
const REWARD_UNLOCK_BENEFIT_PREDICTION_AD_GROUP_ID =
  'APPROVED_BENEFIT_PREDICTION_REWARD_AD_GROUP_ID';

const isUnlockingRef = useRef(false);

const handleUnlockExtraQuiz = useCallback(async (): Promise<void> => {
  if (isUnlockingRef.current) {
    return;
  }

  isUnlockingRef.current = true;
  try {
    const hasEarnedReward = await requestRewardAd(REWARD_UNLOCK_BENEFIT_QUIZ_AD_GROUP_ID);
    if (!hasEarnedReward) {
      showErrorToast(copy.rewardAdNotCompleted);
      return;
    }

    await benefitQuestClient.grantQuizAdUnlock();
    await reloadBenefitMissionState();
  } catch {
    showErrorToast(copy.rewardAdFailed);
  } finally {
    isUnlockingRef.current = false;
  }
}, [
  benefitQuestClient,
  copy.rewardAdFailed,
  copy.rewardAdNotCompleted,
  reloadBenefitMissionState,
]);
```

### 6.5 전면광고 지면 추가

`INTERSTITIAL_PLACEMENT_KEYS`에 혜택용 지면을 추가합니다. 실제 구현에서는 key만 추가하지 말고 `INTERSTITIAL_PLACEMENT_DEFINITION_BASES`, `AdRouteKey`, `getPrimeableAdRouteKey`까지 함께 갱신해야 합니다. 이 세 곳이 맞지 않으면 `GlobalAdManager.showInstant()`가 `show_error`로 거절되어 광고가 조용히 빠질 수 있습니다.

```typescript
export const INTERSTITIAL_PLACEMENT_KEYS = {
  STRATEGY_SAVE: 'strategy_save',
  TRADE_SAVE: 'trade_save',
  ALARM_SAVE: 'alarm_save',
  SETTLEMENT_DETAIL: 'settlement_detail',
  BENEFIT_QUIZ_COMPLETE: 'benefit_quiz_complete',
  BENEFIT_PREDICTION_COMPLETE: 'benefit_prediction_complete',
  BENEFIT_ATTENDANCE_STREAK: 'benefit_attendance_streak',
} as const;
```

```typescript
export type AdRouteKey =
  | 'dashboard'
  | 'history'
  | 'portfolio_details'
  | 'benefits';

const INTERSTITIAL_PLACEMENT_DEFINITION_BASES = [
  // ... existing placements
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_QUIZ_COMPLETE,
    preloadOnRoutes: ['benefits'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_PREDICTION_COMPLETE,
    preloadOnRoutes: ['benefits'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_ATTENDANCE_STREAK,
    preloadOnRoutes: ['benefits'],
    eligibleTiers: ['free'],
  },
] as const;
```

완료 후 전면광고는 보상 지급을 막는 필수 경로로 두지 않습니다. 광고 실패가 문제 풀이 완료를 깨면 CS가 커지므로, 서버 보상 확정 후 비차단으로 노출합니다. 단, 10연속 출석 보너스는 사용자 액션이 “전면광고 후 보너스 받기”이므로 광고 성공 후 보너스를 지급합니다.

10연속 출석 보너스는 돈성 액션이므로 버튼 disabled와 별개로 `useRef` mutex를 둡니다. 서버는 `benefit_attendance`의 오늘 행을 `FOR UPDATE`로 잠그고, ledger는 `source = 'attendance_streak_bonus'`, `source_id = attendance_date`로 남겨 `unique (user_id, source, source_id)`가 같은 날짜 보너스를 한 번만 허용하게 합니다.

```tsx
const isClaimingStreakBonusRef = useRef(false);

const handleClaimAttendanceStreakBonus = useCallback(async (): Promise<void> => {
  if (isClaimingStreakBonusRef.current) {
    return;
  }

  isClaimingStreakBonusRef.current = true;
  try {
    if (showInstantAd == null) {
      showErrorToast(copy.streakBonusAdRequired);
      return;
    }

    await showInstantAd(INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_ATTENDANCE_STREAK);
    await benefitQuestClient.claimAttendanceStreakBonus();
    await reloadAttendanceState();
  } catch {
    showErrorToast(copy.streakBonusClaimFailed);
  } finally {
    isClaimingStreakBonusRef.current = false;
  }
}, [
  benefitQuestClient,
  copy.streakBonusAdRequired,
  copy.streakBonusClaimFailed,
  reloadAttendanceState,
  showInstantAd,
]);
```

```tsx
const isSubmittingRef = useRef(false);

const handleQuizSubmit = useCallback(async (): Promise<void> => {
  if (isSubmittingRef.current) {
    return;
  }

  isSubmittingRef.current = true;
  try {
    const result = await benefitQuestClient.submitQuizAnswer(selectedChoiceIdRef.current);
    setQuizResult(result);

    window.setTimeout(() => {
      showInstantAd?.(INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_QUIZ_COMPLETE).catch(() => {
        // 광고 실패가 퀴즈 완료 UX를 망치지 않도록 서버 보상과 분리합니다.
      });
    }, 0);
  } catch {
    showErrorToast(copy.quizSubmitFailed);
  } finally {
    isSubmittingRef.current = false;
  }
}, [benefitQuestClient, copy.quizSubmitFailed, showInstantAd]);
```

### 6.6 배너 광고

출석/혜택 홈의 배너는 기존 `TossInlineBanner`를 재사용합니다.

```tsx
<TossInlineBanner
  shouldShowAd={shouldShowAds}
  isInTossApp={isInTossApp}
  containerClassName="h-[96px] min-h-[96px]"
  variant="card"
/>
```

### 6.7 토스 포인트 받기

서버는 `1,000머니` 단위로만 토스 포인트 지급을 요청합니다. 토스 지급 요청 전 wallet row를 잠그고 `pending` payout과 음수 ledger를 같은 트랜잭션으로 남깁니다. 토스 지급 실패 시에는 복구 ledger로 wallet을 원복합니다.

토스 포인트 프로모션은 금액별로 여러 개 만들지 않고, 승인된 단일 `promotionCode`를 사용합니다. 실제 지급 포인트는 API 호출 시 `amount`로 전달하며, 이 값은 내부 `머니`가 아니라 토스 포인트 수량입니다. 예를 들어 `1,000머니 -> 100P` 요청이면 `amount = 100`, `50,000머니 -> 5,000P` 요청이면 `amount = 5000`입니다.

```typescript
const TOSS_POINT_REDEEM_THRESHOLD_MONEY = 1_000;
const TOSS_POINT_REDEEM_AMOUNT = 100;
const TOSS_POINT_REDEEM_MAX_POINT_PER_REQUEST = 5_000;

export function resolveRedeemRequest(
  currentMoneyBalance: number,
) {
  const bundleCountByBalance = Math.floor(
    currentMoneyBalance / TOSS_POINT_REDEEM_THRESHOLD_MONEY,
  );
  const bundleCountByRequest = Math.floor(
    TOSS_POINT_REDEEM_MAX_POINT_PER_REQUEST / TOSS_POINT_REDEEM_AMOUNT,
  );
  const bundleCount = Math.min(
    bundleCountByBalance,
    bundleCountByRequest,
  );

  return {
    redeemedMoney: bundleCount * TOSS_POINT_REDEEM_THRESHOLD_MONEY,
    tossPointAmount: bundleCount * TOSS_POINT_REDEEM_AMOUNT,
  };
}
```

공식 API 호출은 실제 구현 시 서버 지급 방식을 우선합니다. 클라이언트 직접 지급을 선택해야 한다면 중복 지급 방지는 서버에서 별도로 잠가야 합니다.

```typescript
import { grantPromotionReward } from '@apps-in-toss/web-framework';

export async function requestPromotionRewardFromClient(
  promotionCode: string,
  tossPointAmount: number,
): Promise<string | null> {
  const result = await Promise.resolve(
    grantPromotionReward({
      params: {
        promotionCode,
        amount: tossPointAmount,
      },
    }),
  );

  if (result == null || result === 'ERROR') {
    return null;
  }

  if ('key' in result) {
    return result.key;
  }

  return null;
}
```

### 6.8 상단 누적 머니 보드

혜택 탭 최상단에는 실제 출시된 `주식 모으기`류 미니앱처럼 현재 사용자의 누적 보상 상태를 한눈에 보여주는 보드를 둡니다. 다만 내부 단위는 계속 `머니`이며, 토스 공식 지갑처럼 보이지 않도록 `토스 포인트 받기 가능`은 보조 정보로 표시합니다.

보드에 표시할 값은 서버 응답을 그대로 렌더링합니다.

| 표시 값 | 의미 |
|---------|------|
| 현재 머니 | `benefit_wallets.money_balance` |
| 누적 적립 머니 | `benefit_wallets.lifetime_earned_money` |
| 받을 수 있는 토스 포인트 | 현재 머니 기준 `1,000머니 -> 100P`, 1회 최대 `5,000P` |
| 지급 대기 | `benefit_toss_point_payouts.status = 'pending'` 합계 |
| 다음 받기까지 | 다음 `1,000머니` 단위까지 남은 머니 |

```typescript
export interface BenefitWalletBoardSummary {
  readonly currentMoneyBalance: number;
  readonly lifetimeEarnedMoney: number;
  readonly redeemableTossPoint: number;
  readonly pendingTossPointAmount: number;
  readonly moneyUntilNextRedeem: number;
  readonly canRedeem: boolean;
}

export interface BenefitWalletBoardItemLabels {
  readonly redeemableLabel: string;
  readonly lifetimeLabel: string;
  readonly pendingLabel: string;
  readonly nextRedeemLabel: string;
}

export interface BenefitWalletBoardItemValues {
  readonly redeemableTossPointText: string;
  readonly lifetimeEarnedMoneyText: string;
  readonly pendingTossPointText: string;
  readonly nextRedeemText: string;
}

export interface BenefitWalletBoardItem {
  readonly id: 'redeemable' | 'lifetime' | 'pending' | 'nextRedeem';
  readonly label: string;
  readonly value: string;
}

export function resolveBenefitWalletBoardSummary(
  currentMoneyBalance: number,
  lifetimeEarnedMoney: number,
  pendingTossPointAmount: number,
): BenefitWalletBoardSummary {
  const redemption = resolveRedeemRequest(currentMoneyBalance);
  const remainderMoney = currentMoneyBalance % TOSS_POINT_REDEEM_THRESHOLD_MONEY;
  const moneyUntilNextRedeem =
    remainderMoney === 0 && currentMoneyBalance > 0
      ? 0
      : TOSS_POINT_REDEEM_THRESHOLD_MONEY - remainderMoney;

  return {
    currentMoneyBalance,
    lifetimeEarnedMoney,
    redeemableTossPoint: redemption.tossPointAmount,
    pendingTossPointAmount,
    moneyUntilNextRedeem,
    canRedeem: redemption.tossPointAmount > 0,
  };
}

export function resolveBenefitWalletBoardItems(
  labels: BenefitWalletBoardItemLabels,
  values: BenefitWalletBoardItemValues,
): readonly BenefitWalletBoardItem[] {
  return [
    {
      id: 'redeemable',
      label: labels.redeemableLabel,
      value: values.redeemableTossPointText,
    },
    {
      id: 'lifetime',
      label: labels.lifetimeLabel,
      value: values.lifetimeEarnedMoneyText,
    },
    {
      id: 'pending',
      label: labels.pendingLabel,
      value: values.pendingTossPointText,
    },
    {
      id: 'nextRedeem',
      label: labels.nextRedeemLabel,
      value: values.nextRedeemText,
    },
  ] as const;
}
```

UI 스니펫입니다. 실제 구현 시 모든 문구는 `BENEFIT_MESSAGES` 또는 기존 i18n 사전에 둡니다. 상단 보드는 상태 표시 전용으로 두고, 실제 토스 포인트 받기 액션은 `TossPointReceiveCard`에서 mutex와 함께 처리합니다.

```tsx
interface BenefitWalletBoardProps {
  readonly userId: string;
  readonly lang: AppLang;
}

type BenefitWalletBoardItemId =
  | 'redeemable'
  | 'lifetime'
  | 'pending'
  | 'nextRedeem';

interface BenefitWalletBoardItem {
  readonly id: BenefitWalletBoardItemId;
  readonly label: string;
  readonly value: string;
}

interface BenefitWalletBoardViewProps {
  readonly currentMoneyText: string;
  readonly eyebrowLabel: string;
  readonly currentMoneyDescription: string;
  readonly walletItems: readonly BenefitWalletBoardItem[];
}

function BenefitWalletBoard(props: BenefitWalletBoardProps): ReactElement {
  const { userId, lang } = props;
  const copy = BENEFIT_MESSAGES[lang].wallet;
  const summary = useBenefitWalletSummary(userId);

  if (summary == null) {
    return <BenefitWalletBoardSkeleton />;
  }

  const walletItems = resolveBenefitWalletBoardItems(
    {
      redeemableLabel: copy.redeemableLabel,
      lifetimeLabel: copy.lifetimeLabel,
      pendingLabel: copy.pendingLabel,
      nextRedeemLabel: copy.nextRedeemLabel,
    },
    {
      redeemableTossPointText: summary.redeemableTossPointText,
      lifetimeEarnedMoneyText: summary.lifetimeEarnedMoneyText,
      pendingTossPointText: summary.pendingTossPointText,
      nextRedeemText: summary.nextRedeemText,
    },
  );

  return (
    <BenefitWalletBoardView
      currentMoneyText={summary.currentMoneyText}
      eyebrowLabel={copy.eyebrowLabel}
      currentMoneyDescription={copy.currentMoneyDescription}
      walletItems={walletItems}
    />
  );
}

function BenefitWalletBoardView(
  props: BenefitWalletBoardViewProps,
): ReactElement {
  const {
    currentMoneyText,
    eyebrowLabel,
    currentMoneyDescription,
    walletItems,
  } = props;

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-xl">
      <p className="text-sm font-bold text-white/80">{eyebrowLabel}</p>
      <h2 className="mt-2 text-3xl font-black">{currentMoneyText}</h2>
      <p className="mt-1 text-sm font-semibold text-white/75">
        {currentMoneyDescription}
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        {walletItems.map((item) => (
          <div key={item.id} className="rounded-2xl bg-white/12 p-4">
            <dt className="text-xs font-bold text-white/70">{item.label}</dt>
            <dd className="mt-1 text-lg font-black">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

---

## 7. 화면 구성

`components/Benefits.tsx`는 처음부터 거대 컴포넌트로 만들지 않습니다. 컨테이너 1개와 상단 월렛 보드 + 섹션 컴포넌트 4개면 충분합니다.

```text
components/Benefits.tsx
components/benefits/BenefitWalletBoard.tsx
components/benefits/AttendanceQuestCard.tsx
components/benefits/PredictionQuestCard.tsx
components/benefits/StockQuizQuestCard.tsx
components/benefits/TossPointReceiveCard.tsx
services/benefits/benefitRewardPolicy.ts
services/benefits/benefitQuestClient.ts
```

컨테이너 스니펫입니다.

```tsx
export interface BenefitsProps {
  readonly lang: AppLang;
  readonly userId: string;
  readonly portfolios: readonly Portfolio[];
  readonly shouldShowAds: boolean;
}

export default function Benefits(props: BenefitsProps): ReactElement {
  const { lang, userId, portfolios, shouldShowAds } = props;
  const copy = BENEFIT_MESSAGES[lang];
  const { isInTossApp } = useTossApp();

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <BenefitWalletBoard userId={userId} lang={lang} />
      <AttendanceQuestCard
        userId={userId}
        copy={copy.attendance}
        shouldShowAds={shouldShowAds}
        isInTossApp={isInTossApp}
      />
      <PredictionQuestCard
        userId={userId}
        portfolios={portfolios}
        copy={copy.prediction}
      />
      <StockQuizQuestCard userId={userId} copy={copy.quiz} />
      <TossPointReceiveCard userId={userId} copy={copy.receive} />
    </section>
  );
}
```

위 스니펫은 구조 설명용입니다. 실제 구현 시 `copy` prop이 객체로 깊게 내려가면 memoized child에 불리할 수 있으므로, 변경이 잦은 섹션은 필요한 primitive 메시지만 넘기는 방식으로 줄입니다.

---

## 8. 서버 플로우

### 8.1 퀴즈 제출

```text
POST /benefits/quiz/attempt
1. 사용자 인증 확인
2. idempotency_key 중복 여부 확인
3. `benefit_mission_daily_states`의 오늘 행을 upsert 후 `FOR UPDATE` 잠금
4. 시작 가능 여부 확인
5. question_id와 selected_choice_id 검증
6. 정답 여부 계산
7. 1머니 기본 지급 + 정답이면 9머니 추가
8. attempts, ledger, wallet, daily_state.completed_attempts를 동일 트랜잭션으로 저장
9. 결과, 새 머니 잔액, 최신 daily_state 반환
```

### 8.2 보상광고 해금

```text
POST /benefits/{missionKind}/ad-unlock
1. 사용자 인증 확인
2. 클라이언트는 `requestRewardAd()`가 true를 반환한 경우에만 호출
3. `benefit_mission_daily_states`의 오늘 행을 upsert 후 `FOR UPDATE` 잠금
4. completed_attempts >= 5 이면 해금 거절
5. rewarded_ad_unlocks >= 4 이면 해금 거절
6. rewarded_ad_unlocks += 1 저장
7. 최신 daily_state와 availability 반환
```

이 API는 광고 이벤트키를 받지 않습니다. 중복 클릭은 클라이언트 `useRef` mutex로 1차 차단하고, 최종 한도는 서버 잠금과 check constraint가 차단합니다.

### 8.3 가격 예측

가격 예측은 사용자가 보유/등록한 포트폴리오 종목을 우선합니다. 포트폴리오가 비어 있으면 `AVAILABLE_STOCKS` 중 대표 종목으로 fallback합니다.

```typescript
const STRATEGY_STOCK_KEYS = ['ma0', 'ma1', 'ma2', 'ma3'] as const;

export function resolvePredictionCandidateSymbols(
  portfolios: readonly Portfolio[],
  supportedSymbols: readonly string[],
  fallbackSymbols: readonly string[],
): readonly string[] {
  const supportedSet = new Set(
    supportedSymbols.map((symbol) => symbol.trim().toUpperCase()),
  );
  const portfolioSymbols = new Set<string>();

  for (const portfolio of portfolios) {
    for (const key of STRATEGY_STOCK_KEYS) {
      const symbol = portfolio.strategy?.[key]?.stock?.trim().toUpperCase();
      if (symbol != null && supportedSet.has(symbol)) {
        portfolioSymbols.add(symbol);
      }
    }
  }

  if (portfolioSymbols.size > 0) {
    return [...portfolioSymbols];
  }

  return fallbackSymbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => supportedSet.has(symbol));
}
```

### 8.4 출석체크

```text
POST /benefits/attendance/check-in
1. KST 기준 오늘 날짜 계산
2. 이미 출석했으면 기존 결과 반환
3. 전일 출석 여부로 연속일 계산
4. 기본 1머니 지급
5. 10연속이면 streakBonusPending=true 반환
6. 사용자가 전면광고 시청 완료 후 /attendance/streak-bonus 호출
7. 서버는 오늘 `benefit_attendance` 행을 `FOR UPDATE`로 잠금
8. `streak_bonus_ad_shown = true` 또는 동일 ledger가 이미 있으면 기존 결과 반환
9. `source = 'attendance_streak_bonus'`, `source_id = attendance_date` ledger로 10머니 지급
10. wallet.money_balance와 lifetime_earned_money를 같은 트랜잭션에서 증가
11. `streak_bonus_ad_shown = true`로 저장 후 최신 출석/지갑 상태 반환
```

### 8.5 토스 포인트 받기

```text
POST /benefits/toss-point/redeem
1. 사용자 인증 확인
2. redeem_request_id 중복이면 기존 payout 상태 반환
3. wallet row를 `FOR UPDATE` 잠금
4. `1,000머니 -> 100P`, 1회 최대 `5,000P` 기준으로 지급 가능 금액 계산
5. 지급 가능 금액이 0이면 차감 없이 거절
6. `pending` payout 생성
7. 음수 ledger를 생성하고 wallet.money_balance를 차감
8. 단일 promotionCode로 토스 지급 API 호출, `amount`에는 차감 머니가 아니라 토스 포인트 수량을 전달
9. 토스 지급 성공 시 payout을 `success`로 변경하고 toss_reward_key 저장
10. 토스 지급 실패 시 복구 ledger를 생성하고 wallet.money_balance를 원복한 뒤 payout을 `failed`로 변경
```

토스 포인트 지급은 사용자가 직접 보는 돈성 로직이므로 “성공 전 차감하지 않거나 pending으로 잠근다”처럼 선택지를 남기지 않습니다. 서버 구현은 위 순서로 고정합니다.

---

## 9. 시뮬레이션 통과 기준

시뮬레이션은 아래 정책을 검증합니다.

| 검증 | 기준 |
|------|------|
| 문제 보상 | 정답 `10머니`, 오답 `1머니` |
| 추가 문제 | 무료 1회 + 보상광고 해금 4회, 하루 최대 5회 |
| 서버 일일 상태 | 완료 횟수 5회 이후 보상광고 해금 불가, 해금 4회 이후 추가 해금 불가 |
| 출석 | 기본 `1머니`, 10연속 보너스는 전면광고 후 총 `11머니`, 중복 호출은 기존 결과 반환 |
| 토스 포인트 받기 | `1,000머니 -> 100P`, 1회 요청 최대 `5,000P`, API `amount`는 토스 포인트 수량 |
| 토스 포인트 실패 복구 | 토스 지급 실패 시 차감한 머니를 복구 ledger로 원복 |
| 상단 월렛 보드 | 현재 머니, 누적 적립 머니, 받을 수 있는 토스 포인트, 지급 대기 금액 표시, stable item ID 기반 렌더링 |
| 문제은행 | 총 600문제 계획 |
| 출제 우선순위 | 미풀이 → 30일 제외 → 품질밴드 → fallback |
| 보상광고 해금 | 광고 완료 `boolean`, 클라이언트 mutex, 미션별 하루 4회 해금 |
| 일일 상태 UI fallback | 서버 daily state가 깨져도 UI는 `null` availability로 빈 상태/재시도 안내 표시 |
| 출시 게이트 | feature flag, 토스 승인, 승인 광고 ID, 서버 API, 토스 앱 환경 모두 필요 |
| 가격 예측 후보 | 깨진 포트폴리오 데이터에서도 fallback 종목 사용 |

실행:

```bash
npx vitest run --config docs2/toss_point/vitest.toss_point_reward.config.ts
```

---

## 10. 오버코딩 검토

| 판단 | 내용 |
|------|------|
| 새 광고 SDK 래퍼 | 불필요. 기존 배너/전면/보상형 래퍼 재사용 |
| 리워드 정책 엔진 | 불필요. 상수 + 순수 함수로 충분 |
| 문제 추천 알고리즘 | 초기에는 단순 우선순위로 충분 |
| 관리자 CMS | 1차에서는 CSV/SQL seed로 충분. 운영 시작 후 필요하면 추가 |
| 실시간 통계 대시보드 | 1차 제외. ledger와 attempts만 쌓으면 사후 분석 가능 |
| 대규모 상태관리 라이브러리 | 불필요. 서버 상태 fetch + 섹션 단위 state로 충분 |

초기 구현의 핵심은 “재미있는 화면”보다 **보상 원장 무결성**입니다. 보상 지급, 토스 포인트 지급, 광고 완료 여부는 클라이언트 단독 판단으로 처리하지 않습니다.

---

## 11. 구현 전 체크리스트

1. 토스에 `머니 누적 후 토스 포인트 받기` 표현과 정책 사전 문의
2. 프로모션 예산, 1인 최대 지급, 일일 지급 한도 결정
3. 광고 그룹 ID 발급: 혜택 배너, 문제 완료 전면, 추가 문제 보상형 실제 승인 ID 주입
4. 문제은행 1차 200문제 seed 작성 및 정답 검수
5. 시뮬레이션 통과
6. 서버 원장/중복 지급/광고 해금 동시성 테스트 작성
7. 상단 월렛 보드 UI 구현
8. 프론트 UI 구현 시작

---

## 12. 구현 순서

1. `services/benefits/benefitRewardPolicy.ts`에 시뮬레이션 통과 로직 이식
2. DB 마이그레이션 및 seed 추가
3. 서버 API/Edge Function 작성
4. `Benefits` 탭과 네비게이션 추가
5. 상단 월렛 보드 구현
6. 출석체크 섹션 구현
7. 주식 상식 퀴즈 섹션 구현
8. 가격 예측 섹션 구현
9. 토스 포인트 받기 섹션 구현
10. 광고 지면 연결
11. 토스 검수 문구 및 QA 체크리스트 작성
