# PHASE_A_FRONT_LAYER_SIMULATION

> 목적: Phase A 기초 공사(A2 루트 설정, A3 상수 SSOT, Entry 정리)가 끝난 현재 시점에서, 프론트 레이어(`components/`, `hooks/`, `services/`, `utils/`)에 남아 있는 **A1 데드 코드/디버그 잔재**, **A2 느슨한 타입**, **A3 하드코딩 UI 문자열·매직 넘버**를 실제 코드 수정 전에 드라이런으로 정리하는 문서입니다.
>
> 비범위: **Phase B/C/D 비즈니스 로직**은 제외합니다. 즉, 수익률 계산, 주문 생성 수학, 포트폴리오 재계산 규칙, VR/다분할 핵심 알고리즘 변경은 본 문서의 대상이 아닙니다.

---

## 0. 전제와 제외 범위

- 본 문서는 **프론트 레이어 청소 계획서**입니다.
- 이미 확정된 SSOT는 그대로 재사용합니다.
  - `COMMON_MESSAGES`
  - `APP_SHELL_MESSAGES`
  - `PORTFOLIO_VALIDATION`
  - `STRATEGY_DEFAULTS`
  - `roundMoney()`
  - `getDictionaryCopy()`
  - `useMutexAction()`
- 아래 항목은 **이번 문서에서 일부러 건드리지 않습니다**.
  - 수익률 계산식 변경
  - 주문 생성 루프 변경
  - VR / 다분할 / 무손절의 도메인 규칙 변경
  - Supabase 서버 스키마 변경

---

## 1. 프론트 레이어 진단 (Analysis)

| 핫스팟 | 레이어 | Phase | 진단 | 위험 |
| --- | --- | --- | --- | --- |
| `components/auth/ProfileView.tsx` | Component | A3 + A2 + **Rule 7** + **DRY** | JSX 하드코딩·`tierLabel === 'FREE'` 문자열 분기 외에, `PaidTier` 뱃지 색상은 **`switch`+`never`로 exhaustive** 하게 두어야 합니다. 같은 렌더에서 `resolvePaidTier`를 칩 헬퍼 안에서 **한 번 더 호출**하면 불필요한 중복 연산·책임 이중화가 됩니다. | 다국어 drift, 분기 오류, exhaustive 누락, **동일 파생값 재계산** |
| `components/Backtest.tsx` | Component | A3 + **Rule 11** + **Rule 10** + **DRY** | 사용량 차감·원격 백테스트는 **뮤텍스**로 보호하고, `run`은 **`onClick`에 직접 전달**(Rule 10). 같은 `lang`에 대해 `getDictionaryCopy(BACKTEST_MESSAGES, …)`를 **렌더 영역과 `executeBacktest` 내부에 이중 호출**하면 DRY 위반·불필요한 객체 생성이 됩니다. | 이중 차감, GC/메모, **사전 추출 중복** |
| `hooks/useTossBanner.ts` | Hook | A2 + **Rule 6** | `TossAds as any`, payload `any` 등 타입 이슈 외에, **존재가 보장되지 않는 식별자**를 `useMemo` 본문에서 그대로 평가하면(예: 전역 주입 전제) **평가 시점 `ReferenceError` → WSOD** 위험이 있습니다. `attachBanner` Stale closure·**`this` 분리 호출** 리스크는 이전과 동일합니다. | SDK 계약 이탈, NPE, **초기화 크래시·런타임 오류** |
| `services/supabase.ts` | Service | A1 + A2 | `window.supabase` 디버그 노출과 `createClient(supabaseUrl || '', supabaseAnonKey || '')` 같은 **침묵 fallback**이 남아 있습니다. 즉, 필수 env가 비어도 “깨진 클라이언트”를 만들 수 있습니다. | 운영 설정 누락이 조용히 런타임 장애로 전환됨 |

### 1.1 추가 메모

- `hooks/useAuth.ts`도 보조 정리 대상입니다.
  - `Record<string, string>` 기반 `updatePayload`가 느슨합니다.
  - `pendingConsent` JSON 파싱 결과가 무타입입니다.
  - 다만 1차 핵심 핫스팟은 위 4개가 우선입니다.
- `services/firebase.ts`도 후속 후보입니다.
  - 선택 env가 그대로 초기화 객체에 주입됩니다.
  - 현재는 동작하지만 “초기화 계약” 관점에서 느슨합니다.
  - 본 문서에서는 `services/supabase.ts`를 더 치명적인 A1/A2 잔재로 우선 선정합니다.

---

## 2. 액션 플랜 (Action Plan)

### 2.1 SSOT 주입 원칙

1. **공용 문구는 범용 사전으로만 넣습니다.**
   - 버튼 공통 레이블, 처리 중 문구, 범용 검증 문구는 `COMMON_MESSAGES`.
   - 앱 셸 로딩/전역 에러/진입점 문구는 `APP_SHELL_MESSAGES`.

2. **기능 전용 문구는 기능별 사전 파일로 분리합니다.**
   - `ProfileView`는 `constants/messages/profileMessages.ts`
   - `Backtest`는 `constants/messages/backtestMessages.ts`
   - `Supabase` / `Firebase` 같은 서비스 초기화 에러는 `constants/messages/systemMessages.ts`
   - 원칙: `COMMON_MESSAGES`를 억지로 거대 사전으로 키우지 않고, **공용/기능 전용**으로 나눕니다.

3. **기본값과 숫자 규칙은 도메인 SSOT로만 올립니다.**
   - `Backtest` 기본 파라미터는 `constants/domain/backtestDefaults.ts` 같은 파일로 격리합니다.
   - 포트폴리오 입력 규칙은 계속 `PORTFOLIO_VALIDATION`, `STRATEGY_DEFAULTS`, `roundMoney()`만 사용합니다.

4. **느슨한 SDK는 `adapter + type guard` 패턴으로 감쌉니다.**
   - `useTossBanner.ts`는 `any`를 직접 쓰지 않고, `unknown -> type guard -> narrow` 순서로만 접근합니다.
   - 브리지 객체는 훅 내부에서 바로 쓰지 않고, `resolveTossAdsBridge()` 같은 보정 함수를 한 번 통과시킵니다.
   - `useCallback`으로 브리지 메서드를 감쌀 때는 **브리지 레퍼런스를 의존성 배열에 명시**해 Stale closure를 금지합니다(Rule 6).
   - **외부 SDK 메서드는 변수에 떼어 호출하지 않습니다.** `const fn = bridge.attachBanner; fn(...)` 형태는 `this`가 깨져 런타임 `TypeError`를 유발할 수 있으므로, **`bridge.attachBanner(...)`처럼 객체에 바인딩된 채로만** 호출합니다(Rule 6 / 오류 복원력).
   - **SDK 진입점은 평가 시점 크래시를 피합니다.** 존재가 불확실한 심벌을 상단에서 그대로 참조하면 `ReferenceError`로 앱 전체가 멈출 수 있으므로, `typeof window !== 'undefined'`·`globalThis`·안전한 `unknown` 슬롯 읽기 등 **환경에 맞는 가드 후 `resolveTossAdsBridge`**로만 좁힙니다(Rule 6 / WSOD 방지).

5. **사용량 차감·원격 금융 호출 등 무거운 비동기 액션은 `useMutexAction`으로 래핑합니다(Rule 11).**
   - `Backtest.tsx`의 실행 버튼은 `run` + `isExecuting`으로 연타를 원천 차단하고, 라벨은 사전 문자열만 사용합니다(Rule 3).
   - `useMutexAction`이 제공하는 `run` 참조가 이미 안정적이면 **`onClick={run}`처럼 직접 전달**하고, `onClick={() => { void run(); }}` 같은 **렌더 경로 인라인 래퍼는 피합니다**(Rule 10).
   - **동일 `lang`에 대한 `getDictionaryCopy`는 기능당 한 벌만** 컴포넌트 상단에서 만들고, 비동기 콜백은 그 객체를 **클로저로 캡처**합니다. `executeBacktest` 안에서 같은 사전을 다시 `getDictionaryCopy`하지 않습니다(DRY / Rule 6).

6. **`PaidTier` 등 유한 유니온의 UI 분기는 `switch` + `default`의 `never`로 exhaustive 하게 둡니다(Rule 7).**
   - 동일 렌더에서 `resolvePaidTier` 등 **파생값은 한 번만 계산**하고, 칩 클래스 헬퍼에는 **정제된 `PaidTier`만 넘깁니다**(DRY / Rule 6).

7. **서비스 초기화는 침묵 fallback 금지입니다.**
   - `supabaseUrl || ''` 같은 코드 금지
   - 필수 env는 `getRequiredClientEnv()` 헬퍼에서 즉시 검증합니다.
   - 개발용 디버그 노출은 `DEV` 전용 typed debug bucket으로만 허용하거나 제거합니다.

### 2.2 적용 순서

1. `constants/messages/profileMessages.ts`, `backtestMessages.ts`, `systemMessages.ts` 초안 작성
2. `components/auth/ProfileView.tsx`에서 하드코딩 제거 + 문자열 기반 분기 제거
3. `components/Backtest.tsx`에서 기본값/문구/원격 응답 파서 분리
4. `hooks/useTossBanner.ts`에서 `any` 제거 + 브리지 어댑터 도입
5. `services/supabase.ts`에서 디버그 노출/침묵 fallback 제거
6. 후속으로 `hooks/useAuth.ts`, `services/firebase.ts`를 동일 패턴으로 정리

### 2.3 검증 기준

- `rg "\bany\b|as any"` 로 프론트 레이어 직접 `any` 잔존 여부 확인
- `rg "lang === 'ko'|lang === \"ko\""` 로 JSX 내부 하드코딩 분기 감소 확인
- `rg "window\.supabase|createClient\(.*\|\|"` 로 디버그/침묵 fallback 제거 여부 확인
- `npm run typecheck`, `npm test` 유지

---

## 3. 시뮬레이션 스니펫 (Before ❌ vs After ✅)

## 3.1 `components/auth/ProfileView.tsx`

### 진단

- 현재 파일은 **문구 사전, 티어 뱃지 규칙, 텔레그램 연결 UX, 에러 문구**가 한 컴포넌트에 섞여 있습니다.
- `tierLabel === 'FREE' ? ...` 는 Rule 3 위반입니다. 번역 문자열을 로직 축으로 쓰면 안 됩니다.
- 중첩 삼항으로 JSX 내부 문구를 직접 선택하고 있어 Rule 2/6에도 좋지 않습니다.
- `getTierChipClassName`에서 `PaidTier`를 `if` 체인만으로 처리하면 Rule 7(exhaustive check)을 만족하지 못합니다. **`switch` + `default: never`**로 교체해야 티어 유니온 확장 시 컴파일러가 누락을 막습니다.
- 부모에서 이미 `const paidTier = resolvePaidTier(currentTier)`로 뽑았는데, 칩 헬퍼가 다시 `resolvePaidTier(currentTier)`를 호출하면 **동일 렌더·동일 입력에 대한 중복 연산**이 되어 DRY·Rule 6에 어긋납니다. 헬퍼 시그니처는 **`PaidTier`만** 받습니다.

### ❌ Before

```tsx
const canUpgrade = !!onUpgradePlan && currentTier !== 'premium';

return (
  <div className="space-y-6">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
      {lang === 'ko' ? 'ACCOUNT CONNECTED' : 'ACCOUNT CONNECTED'}
    </p>
    <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
      {currentUserEmail || 'unknown'}
    </p>
    <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
      {tierLabel === 'FREE'
        ? (lang === 'ko' ? 'FREE 회원' : 'FREE MEMBER')
        : tierLabel === 'PRO'
        ? (lang === 'ko' ? 'PRO 회원' : 'PRO MEMBER')
        : (lang === 'ko' ? 'PREMIUM 회원' : 'PREMIUM MEMBER')}
    </p>
  </div>
);
```

### ✅ After

```ts
// constants/messages/profileMessages.ts
import type { AppLang } from '@/types';
import type { PaidTier } from '@/utils/appEntryHelpers';

export interface ProfileMessageSet {
  accountConnected: string;
  unknownEmail: string;
  telegramConnect: string;
  telegramOpen: string;
  logoutFailed: string;
}

export const PROFILE_MESSAGES: Record<AppLang, ProfileMessageSet> = {
  ko: {
    accountConnected: '계정 연결됨',
    unknownEmail: '알 수 없는 이메일',
    telegramConnect: '텔레그램 연결하기',
    telegramOpen: '텔레그램에서 열기',
    logoutFailed: '로그아웃 중 오류가 발생했습니다.',
  },
  en: {
    accountConnected: 'Account connected',
    unknownEmail: 'Unknown email',
    telegramConnect: 'Connect Telegram',
    telegramOpen: 'Open in Telegram',
    logoutFailed: 'An error occurred during logout.',
  },
};

const MEMBERSHIP_MEMBER_BADGE: Record<PaidTier, Record<AppLang, string>> = {
  free: { ko: 'FREE 회원', en: 'FREE MEMBER' },
  pro: { ko: 'PRO 회원', en: 'PRO MEMBER' },
  premium: { ko: 'PREMIUM 회원', en: 'PREMIUM MEMBER' },
};

export function getMembershipMemberBadge(
  tier: PaidTier,
  lang: AppLang,
): string {
  return MEMBERSHIP_MEMBER_BADGE[tier][lang];
}
```

```tsx
// components/auth/ProfileView.tsx (발췌)
import { PROFILE_MESSAGES, getMembershipMemberBadge } from '@/constants/messages/profileMessages';
import { getDictionaryCopy } from '@/utils/getDictionaryCopy';
import { resolvePaidTier, type PaidTier } from '@/utils/appEntryHelpers';

// DRY: 원시 `currentTier`가 아니라 이미 정제된 `PaidTier`만 받음
function getTierChipClassName(paidTier: PaidTier): string {
  // Rule 7: 유니온 확장 시 컴파일 타임에 미처리 분기를 강제
  switch (paidTier) {
    case 'premium':
      return 'bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.55)]';
    case 'pro':
      return 'bg-sky-400 text-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.45)]';
    case 'free':
      return 'bg-slate-900/80 text-slate-100';
    default: {
      const exhaustiveCheck: never = paidTier;
      return exhaustiveCheck;
    }
  }
}

const ProfileView: React.FC<ProfileViewProps> = (props) => {
  const { lang, currentTier, currentUserEmail } = props;
  const copy = getDictionaryCopy(PROFILE_MESSAGES, lang, 'PROFILE_MESSAGES');

  // 정제 로직은 렌더당 한 번만
  const paidTier = resolvePaidTier(currentTier);
  const membershipBadge = getMembershipMemberBadge(paidTier, lang);

  return (
    <div className="space-y-6">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
        {copy.accountConnected}
      </p>
      <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
        {currentUserEmail ?? copy.unknownEmail}
      </p>
      <p className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 ${getTierChipClassName(paidTier)}`}>
        {membershipBadge}
      </p>
    </div>
  );
};
```

### 기대 효과

- `ProfileView`는 화면만 담당하고, 문구/티어 라벨 규칙은 바깥으로 빠집니다.
- 문자열 오타가 로직 오류로 번지는 경로를 차단합니다.
- 티어 칩 스타일 분기가 **exhaustive** 해져, `PaidTier` 유니온이 바뀌면 컴파일러가 미갱신을 잡아냅니다(Rule 7).
- `resolvePaidTier`는 **한 번만** 호출하고 칩 스타일은 그 결과만 소비해 **중복 파생 로직을 제거**합니다(DRY).

---

## 3.2 `components/Backtest.tsx`

### 진단

- 현재 `handleRunBacktest()`는 **사용량 체크 문구**, **원격 fetch**, **응답 파싱**, **fallback mock**, **step 전환**을 한 함수에서 다룹니다.
- **Rule 11:** 위 경로는 `incrementUsage`로 쿼터를 차감하고 원격과 통신하는 **무거운 비동기 트랜잭션**에 해당합니다. 단순 `async () => {}`를 버튼에 직접 달면 더블 클릭·연타 시 **차감·요청이 중복**될 수 있으므로, 반드시 `useMutexAction`으로 동기 뮤텍스를 겹쳐야 합니다.
- `1000`, `24`, `0.25`, `40` 같은 숫자가 여러 기본값 객체에 반복되고 있습니다.
- 같은 구조의 `fetch -> body.error 확인 -> result 조립` 코드가 `multi_split`, `no_stop_multi_split`에 반복됩니다.
- **Rule 10:** `useMutexAction`의 `run`은 안정 참조이므로, 실행 버튼에는 **`onClick={handleRunBacktest}`로 직접 전달**합니다. 불필요한 `onClick={() => { void handleRunBacktest(); }}` 래퍼는 제거합니다.
- **DRY:** `getDictionaryCopy(BACKTEST_MESSAGES, lang, …)`를 **렌더 본문과 `executeBacktest` 내부에 이중으로 두지 않습니다.** 상단에서 `backtestCopy` 한 번만 만들고, 콜백 의존성에 `backtestCopy`를 넣어 최신 사전을 캡처합니다.

### ❌ Before

```tsx
const handleRunBacktest = async () => {
  const usageResult = await incrementUsage('backtest', currentTier);
  if (!usageResult.success) {
    setBacktestError(
      lang === 'ko'
        ? usageResult.message === 'DAILY_LIMIT_REACHED'
          ? '일일 백테스트 한도에 도달했습니다. 내일 다시 시도하거나 멤버십을 업그레이드하세요.'
          : usageResult.message || '사용량 확인 중 오류가 발생했습니다.'
        : usageResult.message || 'Usage limit reached or verification failed.'
    );
    setResult(null);
    setStep('results');
    return;
  }

  if (strategyId === 'multi_split') {
    const apiUrl = import.meta.env.VITE_BACKTEST_MULTI_URL;
    // fetch + body.error + setResult ...
  } else if (strategyId === 'no_stop_multi_split') {
    const apiUrl = import.meta.env.VITE_BACKTEST_NO_STOP_MULTI_URL;
    // fetch + body.error + setResult ...
  }
};
```

### ✅ After

```ts
// constants/domain/backtestDefaults.ts
export const BACKTEST_DEFAULTS = {
  DAILY_BUY_AMOUNT_USD: 1_000,
  BACKTEST_MONTHS: 24,
  FEE_RATE_PERCENT: 0.25,
  TOTAL_SPLIT_COUNT: 40,
  TARGET_RETURN_RATE_PERCENT: 10,
} as const;
```

```tsx
// components/Backtest.tsx (발췌)
import { useCallback } from 'react';
import { useMutexAction } from '@/hooks/useMutexAction';
import { getDictionaryCopy } from '@/utils/getDictionaryCopy';
import { COMMON_MESSAGES } from '@/constants/messages/commonMessages';
import { BACKTEST_MESSAGES } from '@/constants/messages/backtestMessages';
import { BACKTEST_DEFAULTS } from '@/constants/domain/backtestDefaults';

// `BacktestMessageSet`에 `startRun` 등 실행 버튼 레이블 키를 추가한다고 가정 (Rule 3: JSX 하드코딩 금지).
// 처리 중 문구는 기존 SSOT인 `COMMON_MESSAGES.processing`을 재사용합니다.

type RemoteBacktestStrategyId = 'multi_split' | 'no_stop_multi_split';

function getUsageFailureMessage(
  copy: BacktestMessageSet,
  rawMessage: string | undefined,
): string {
  if (rawMessage === 'DAILY_LIMIT_REACHED') {
    return copy.dailyLimitReached;
  }
  return rawMessage?.trim() || copy.usageVerificationFailed;
}

function toBacktestResult(body: Record<string, unknown>): BacktestResult | null {
  if (!Array.isArray(body.equityCurve)) {
    return null;
  }
  return {
    totalReturnPct: Number(body.totalReturnPct ?? 0),
    cagrPct: Number(body.cagrPct ?? 0),
    mddPct: Number(body.mddPct ?? 0),
    winRatePct: Number(body.winRatePct ?? 0),
    sharpeRatio: Number(body.sharpeRatio ?? 0),
    avgHoldingDays: Number(body.avgHoldingDays ?? 0),
    equityCurve: body.equityCurve as BacktestResult['equityCurve'],
    drawdownSeries: Array.isArray(body.drawdownSeries) ? body.drawdownSeries as BacktestResult['drawdownSeries'] : [],
  };
}

// Rule 6 (DRY): 동일 lang에 대한 사전은 컴포넌트 상단에서 한 번만 추출
const commonCopy = getDictionaryCopy(COMMON_MESSAGES, lang, 'COMMON_MESSAGES');
const backtestCopy = getDictionaryCopy(BACKTEST_MESSAGES, lang, 'BACKTEST_MESSAGES');

const executeBacktest = useCallback(async () => {
  const usageResult = await incrementUsage('backtest', currentTier);
  if (!usageResult.success) {
    setBacktestError(getUsageFailureMessage(backtestCopy, usageResult.message));
    setResult(null);
    setStep('results');
    return;
  }

  const remoteResult = await requestRemoteBacktestResult(strategyId, paramsMulti, paramsNoStopMulti);
  if (remoteResult != null) {
    setBacktestError(null);
    setResult(remoteResult);
    setStep('results');
    return;
  }

  setBacktestError(null);
  setResult(buildMockResult());
  setStep('results');
}, [currentTier, strategyId, paramsMulti, paramsNoStopMulti, backtestCopy]);

// Rule 11: 1-tick 중복 실행 차단 + UI와 동기화
const { run: handleRunBacktest, isExecuting } = useMutexAction(executeBacktest);

// … JSX 발췌 (Rule 10: 안정 핸들러는 인라인 래퍼 없이 직접 전달)
<button
  type="button"
  onClick={handleRunBacktest}
  disabled={isExecuting}
>
  {isExecuting ? commonCopy.processing : backtestCopy.startRun}
</button>
```

> **시뮬레이션 메모:** `useMutexAction`의 `run`은 `MouseEvent`를 첫 인자로 받을 수 있습니다. 액션이 인자를 쓰지 않으면 무시되며, 본문에서 이벤트를 소비해야 하면 `useCallback((e) => { e.preventDefault(); void run(); }, [run])`처럼 **별도 안정 래퍼**를 훅 상단에 두는 편이 JSX 인라인보다 낫습니다.

### 기대 효과

- 화면 문구와 기본값이 한곳으로 모입니다.
- 네트워크 응답 처리의 중복을 걷어내, UI 컴포넌트가 “화면 상태 전환”에 집중하게 됩니다.
- **사용량 차감·원격 호출이 뮤텍스로 한 번에 한 갱신만 허용**되어 이중 차감·요청 폭주 위험이 줄어듭니다(Rule 11).
- 실행 버튼이 **매 렌더 새 화살표 함수를 만들지 않아** Rule 10에 맞습니다.
- `BACKTEST_MESSAGES` 사전은 **렌더당 한 번의 `getDictionaryCopy`만** 사용하고, 실패 메시지 조립은 **`backtestCopy` 재사용**으로 DRY를 지킵니다.

---

## 3.3 `hooks/useTossBanner.ts`

### 진단

- 현재 훅은 SDK 브리지를 `any`로 뭉개고 있어, 실제 SDK 계약이 바뀌면 컴파일러가 전혀 경고하지 못합니다.
- `callbacks`도 `[key: string]: any`로 열려 있어 타입 방어가 사실상 없습니다.
- **`attachBanner`를 `useCallback(..., [])`로 두고 브리지 인스턴스를 클로저로만 붙잡으면 Rule 6 위반입니다.** 브리지 해석이 렌더/라이프사이클에 따라 달라질 수 있는 경우 Stale closure로 `undefined` 호출이 납니다. 브리지 레퍼런스는 `useMemo` 등으로 고정하되, **`useCallback` 의존성 배열에 그 레퍼런스를 명시**해야 합니다.
- **`const attach = tossAdsBridge.attachBanner; attach(...)`는 금지입니다.** 메서드를 객체에서 분리하면 `this`가 깨져 SDK가 내부 상태에 접근할 때 **런타임 `TypeError`**가 날 수 있습니다. **`tossAdsBridge.attachBanner(...)` 형태로만** 호출합니다(Rule 6 / 오류 복원력).
- **`useMemo(() => resolveTossAdsBridge(TossAds), [])`에서 `TossAds`를 베어(Bare) 식별자로 평가**하면, 주입/번들 전제가 어긋난 환경에서 **평가 즉시 `ReferenceError` → WSOD**로 이어질 수 있습니다. SDK 후보는 **`window` / `globalThis` 등 안전 슬롯에서 읽거나**, 정적 `import`를 쓰는 경우에도 **모듈 로드 실패 시 앱 전체가 죽지 않도록** 진입 경로를 한 겹 가드합니다(Rule 6).

### ❌ Before

```ts
export interface TossAdsAttachBannerOptions {
  theme?: 'auto' | 'light' | 'dark';
  tone?: 'blackAndWhite' | 'grey';
  variant?: 'card' | 'expanded';
  callbacks?: {
    onNoFill?: (payload?: any) => void;
    onAdFailedToRender?: (payload?: any) => void;
    [key: string]: any;
  };
}

const tossAdsAny = TossAds as any;
return typeof tossAdsAny !== 'undefined' && typeof tossAdsAny.initialize?.isSupported === 'function'
  ? tossAdsAny.initialize.isSupported()
  : false;
```

### ✅ After

```ts
interface TossAdsBannerCallbackPayload {
  reason?: string;
  message?: string;
}

interface TossAdsBridge {
  initialize: {
    (params: {
      callbacks: {
        onInitialized: () => void;
        onInitializationFailed: (error: unknown) => void;
      };
    }): void;
    isSupported?: () => boolean;
  };
  attachBanner?: {
    (
      adGroupId: string,
      element: HTMLElement,
      options?: TossAdsAttachBannerOptions,
    ): TossAdsAttachBannerResult;
    isSupported?: () => boolean;
  };
}

export interface TossAdsAttachBannerOptions {
  theme?: 'auto' | 'light' | 'dark';
  tone?: 'blackAndWhite' | 'grey';
  variant?: 'card' | 'expanded';
  callbacks?: {
    onNoFill?: (payload?: TossAdsBannerCallbackPayload) => void;
    onAdFailedToRender?: (payload?: TossAdsBannerCallbackPayload) => void;
  };
}

function resolveTossAdsBridge(candidate: unknown): TossAdsBridge | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const bridge = candidate as Partial<TossAdsBridge>;
  if (typeof bridge.initialize !== 'function') {
    return null;
  }
  return bridge as TossAdsBridge;
}
```

```ts
import { useCallback, useMemo, useState } from 'react';

// … TossAdsBridge / resolveTossAdsBridge 정의는 위와 동일

export function useTossBanner(): UseTossBannerResult {
  // Rule 6 (Error Resilience): SDK가 전역에 없거나 브라우저만 있는 환경에서도 평가 시점 크래시 방지
  const tossAdsBridge = useMemo(() => {
    const globalObj = typeof window !== 'undefined' ? window : null;
    const rawAds =
      globalObj != null && 'TossAds' in globalObj
        ? (globalObj as Record<string, unknown>).TossAds
        : undefined;

    return resolveTossAdsBridge(rawAds);
  }, []);

  const [isSupported] = useState<boolean>(() => {
    try {
      return tossAdsBridge?.initialize?.isSupported?.() ?? false;
    } catch {
      return false;
    }
  });

  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // … `useEffect`에서 `TossAds.initialize` 호출 후 `setIsInitialized(true)` (실제 구현 시 기존 패턴 유지)

  // Rule 6: 의존성 배열에 브리지·초기화 상태 명시 + 메서드는 객체에 바인딩된 채로만 호출(this 보존)
  const attachBanner = useCallback(
    (adGroupId: string, element: HTMLElement, options?: TossAdsAttachBannerOptions) => {
      if (!isSupported || !isInitialized || !element || tossAdsBridge == null) {
        return undefined;
      }
      if (typeof tossAdsBridge.attachBanner !== 'function') {
        return undefined;
      }
      if (
        typeof tossAdsBridge.attachBanner.isSupported === 'function' &&
        !tossAdsBridge.attachBanner.isSupported()
      ) {
        return undefined;
      }
      try {
        return tossAdsBridge.attachBanner(adGroupId, element, options);
      } catch (error) {
        console.error('[TossBanner] attachBanner failed:', error);
        return undefined;
      }
    },
    [tossAdsBridge, isSupported, isInitialized],
  );

  return { isSupported, isInitialized, attachBanner };
}
```

> **시뮬레이션 메모:** 실제 코드베이스는 `@apps-in-toss/web-framework`의 **`import { TossAds }`** 로 브리지를 쓰는 경우가 많습니다. 정적 import이면 “식별자 미정의 `ReferenceError`”는 드물고, 대신 **번들/런타임 계약** 문제가 따를 수 있습니다. 반면 **`window.TossAds`만** 보면 미니앱 번들에서 브리지가 전역에 없을 수 있어 `resolveTossAdsBridge(null)`로만 떨어질 수 있습니다. **본공사 시** 공식 로딩 계약에 맞춰 `import` 바인딩과 `globalThis`/`window` 후보를 **하나의 `unknown` 후보 파이프로 합성**한 뒤 `resolveTossAdsBridge`에 넘기는 방식이 안전합니다. `useEffect` 안의 `initialize` 호출도 **`tossAdsBridge?.initialize` 등 동일 브리지 레퍼런스**와 맞추어야 스니펫과 일관됩니다. 모듈 단위 초기화 플래그(`isTossAdsInitialized` 등)는 기존과 같이 유지합니다. **`attachBanner`를 지역 변수에 담아 호출하지 않는 것**은 `this` 유실 방지의 최소 요건입니다.

### 기대 효과

- SDK 계약 변화가 컴파일 타임에 더 빨리 드러납니다.
- 프런트 훅이 “불명확한 외부 객체”를 직접 만지지 않게 됩니다.
- **`attachBanner`가 항상 최신 브리지 레퍼런스를 참조**해 Rule 6 안티패턴(빈 의존성 배열)을 제거합니다.
- SDK 메서드를 **객체 경유로만 호출**해 `this` 컨텍스트 유실에 따른 크래시를 피합니다.
- 브리지 해석을 **`unknown` 후보만 안전하게 읽는 경로**로 두어, SDK 미주입·비브라우저 가정 오류 시에도 **평가 단계 WSOD** 가능성을 낮춥니다.

---

## 3.4 `services/supabase.ts`

### 진단

- 이 파일은 현재 **디버그 노출 잔재**와 **침묵 fallback**을 동시에 갖고 있습니다.
- `supabaseUrl || ''`는 잘못된 운영 환경에서도 클라이언트를 생성해 버립니다.
- `window as any`는 A1/A2 관점에서 가장 먼저 걷어내야 할 전형적 잔해입니다.

### ❌ Before

```ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}
```

### ✅ After

```ts
type RequiredClientEnvKey =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY';

function getRequiredClientEnv(key: RequiredClientEnvKey): string {
  const value = import.meta.env[key];
  if (value != null && value.trim() !== '') {
    return value;
  }
  throw new Error(`[Supabase] Missing required env: ${key}`);
}

const supabaseUrl = getRequiredClientEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getRequiredClientEnv('VITE_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: authStorage,
    storageKey: 'sb-auth-token',
  },
});
```

```ts
declare global {
  interface Window {
    __BTD_DEBUG__?: {
      supabase?: typeof supabase;
    };
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__BTD_DEBUG__ = {
    ...(window.__BTD_DEBUG__ ?? {}),
    supabase,
  };
}
```

### 기대 효과

- 필수 env 누락이 “조용한 반쪽 장애”가 아니라 **즉시 검출 가능한 초기화 오류**로 바뀝니다.
- 디버그 잔재가 운영 글로벌 네임스페이스를 오염시키지 않습니다.

---

## 4. 실제 적용 체크리스트

- `ProfileView.tsx`에서 `tierLabel === 'FREE'` 같은 문자열 기반 로직을 제거했는가
- `ProfileView.tsx`의 JSX 내부 한국어/영어 문자열을 feature dictionary로 모두 이동했는가
- `ProfileView.tsx`의 `getTierChipClassName`(또는 동등 로직)이 **`switch` + `default: never`로 `PaidTier`를 exhaustive 하게 처리**하는가(Rule 7)
- `ProfileView.tsx`에서 `resolvePaidTier`는 **렌더당 한 번**이고, 칩 클래스 헬퍼는 **`PaidTier` 인자만** 받아 **중복 파생을 하지 않는가**(DRY)
- `Backtest.tsx`의 기본값 숫자를 `BACKTEST_DEFAULTS`로 올렸는가
- `Backtest.tsx`의 사용량 초과 문구와 fallback 문구를 feature dictionary로 분리했는가
- `Backtest.tsx`의 백테스트 실행이 **`useMutexAction`으로 래핑**되고, 실행 중 **`disabled={isExecuting}`** 등 UI가 뮤텍스와 동기화되는가(Rule 11)
- `Backtest.tsx` 실행 버튼 레이블이 **하드코딩 없이** `COMMON_MESSAGES` / `BACKTEST_MESSAGES`만 사용하는가(Rule 3)
- `Backtest.tsx` 실행 버튼이 **`onClick={handleRunBacktest}`처럼 안정 참조를 직접 넘기고**, `onClick={() => { void handleRunBacktest(); }}` 같은 **불필요한 인라인 래퍼가 없는가**(Rule 10)
- `Backtest.tsx`에서 `BACKTEST_MESSAGES`에 대한 **`getDictionaryCopy`가 `executeBacktest` 내부에 중복되지 않고**, 상단 `backtestCopy`를 콜백이 캡처하며 **`backtestCopy`가 의존성 배열에 포함**되는가(DRY)
- `useTossBanner.ts`에서 직접 `any`, `[key: string]: any`를 제거했는가
- `useTossBanner.ts`의 `attachBanner`가 **`tossAdsBridge` 및 `isSupported`/`isInitialized`를 의존성 배열에 포함**하는가(Rule 6; 빈 배열 금지)
- `useTossBanner.ts`의 `attachBanner`가 **`const fn = bridge.attachBanner; fn(...)` 형태 없이** `tossAdsBridge.attachBanner(...)`로만 호출되어 **`this` 유실 위험이 없는가**
- `useTossBanner.ts`에서 브리지 후보를 읽을 때 **`useMemo` 본문이 베어(Bare) `TossAds` 식별자에만 의존하지 않고**, `window`/`globalThis`·(필요 시) **import 바인딩을 합성한 안전 경로**로 `resolveTossAdsBridge`에 넘기는가(WSOD·`ReferenceError` 방지)
- `services/supabase.ts`에서 `window as any`와 `|| ''` fallback을 제거했는가
- `getDictionaryCopy()`는 컴포넌트 상단 1회만 호출하고, 렌더 루프 내부에서 반복 호출하지 않았는가
- 새 메시지 파일은 `constants/messages/` 하위로만 추가하고, 기존 `COMMON_MESSAGES`를 무분별하게 비대화시키지 않았는가

---

## 5. 최종 판단

- 프런트 레이어는 이미 Phase A 기초 공사 덕분에 **입력 무결성**, **비동기 자물쇠**, **루트 타입 게이트**를 확보했습니다.
- 남은 문제는 “핵심 비즈니스 로직”이 아니라, **화면 컴포넌트와 클라이언트 서비스 가장자리**에 남은 하드코딩/느슨한 타입/디버그 잔재입니다.
- 따라서 Phase B로 넘어가기 전의 마지막 프런트 청소는 아래 한 줄로 요약됩니다.

> **문구는 사전으로, 숫자는 상수로, 외부 SDK는 어댑터로, 필수 env는 즉시 실패로 바꾼다.**

- 이 기준으로 들어가면 Phase B 비즈니스 로직 공사는 훨씬 더 좁고 예측 가능한 작업이 됩니다.
