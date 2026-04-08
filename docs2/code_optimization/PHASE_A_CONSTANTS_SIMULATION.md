# PHASE A3: Constants / I18N Simulation

> 목적: 실제 소스 코드를 수정하기 전에 `constants/`, 루트 `constants.tsx`, 그리고 `components`/`features`/`hooks` 전반의 하드코딩 문자열 및 매직 넘버를 어떻게 정리할지 가상 런타임 기준으로 검증하는 문서입니다.  
> 원칙: 이 문서는 설계와 시뮬레이션만 다루며, 현재 저장소의 실제 파일은 수정하지 않습니다.

## 0. Mental Compile 전제

- 현재 저장소는 이미 일부 도메인에서 `constants/appShellMessages.ts`, `constants/vrMessages.ts`, `constants/tdsDialogMessages.ts`, `constants/vrConstants.ts` 같은 분리를 시작했습니다.
- 반면 루트 `constants.tsx`에는 여전히 거대한 `I18N` 사전과 종목/색상/Mock 데이터가 혼재해 있습니다.
- 따라서 Phase A3의 핵심은 "새 상수를 더 추가"하는 것이 아니라, 이미 존재하는 상수 체계를 **도메인별 SSOT로 재배치**하는 것입니다.
- 성공 기준은 아래 4가지입니다.
  - JSX 내부에 한국어/영어 UI 문자열이 직접 남지 않습니다.
  - 금융/검증/타이머/제한 숫자가 의미 있는 상수명으로 승격됩니다.
  - 번역 문자열이 아닌 `id`, `enum`, `union key`로 로직이 분기됩니다.
  - 사전 키 누락이나 비동기 중복 클릭 때문에 앱이 멈추지 않습니다.
- **`useMutexAction` 계획 정렬:** `PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` Phase A **Mutex** 행과 동일하게, 훅은 **`{ run, isExecuting }`** 반환으로 확장하는 전제 하에 본 문서 스니펫을 작성한다(§3.5.1). 실제 `hooks/useMutexAction.ts` 는 해당 PR에서 동일 계약으로 맞춘다.
- **VR 주기별 입·출금(실제 코드):** `constants/vrConstants.ts`의 **`VR_DELTA_CASH_INPUT`**·**`getVrDeltaCashInputValidationReason`**, 문구는 **`constants/vrMessages.ts`의 `VR_DELTA_CASH_VALIDATION_MESSAGES`** — 계획서 `PRE_RELEASE` Phase A 표 **VR 주기별 입·출금** 행과 동일.

### 0.1 A3 포트폴리오 폼·훅 계약 (팀 확정 — Option B)

`PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` **「확정 — A3 포트폴리오 설정 폼 검증 파이프라인」** 과 동일하다. 시뮬레이션 §3.3·§3.6은 이 계약을 따른다.

1. **Option B (데이터 구조):** UI(`StrategyCreator`, 향후 `PortfolioEditModal` 등)에서 **`trim`·`roundMoney` 등 선제 정제** → **평면 DTO** → **`validatePortfolioSetupInput(dto, copy)`** → 통과 시 **동일 필드로만** `Portfolio` 조립 → **`usePortfolios`** 로 전달. **`usePortfolios` 내부의 폼형 인라인 검증은 제거**하고 훅은 **통신·세션·한도** 중심(SRP).
2. **에러 반환:** `validatePortfolioSetupInput`은 **`string | null`만 반환**하고, 주입된 **`copy`** 로만 사용자 문구를 고른다. **폼 검증 경로에서 `throw`하지 않는다.** DB·네트워크 실패는 **`createPortfolioMutationError` 등 뮤테이션 경로**에서 기존 패턴 유지.
3. **Rule 1·6:** 검증에 사용한 정제 값과 **DB 저장 값이 바이트 단위로 동일 계약**이어야 한다(검증 후 재-trim·재-round 금지).

---

## 1. 상수/다국어 전수 분석

### 1.1 `constants/` 및 루트 `constants.tsx` 진단

| 경로 | 현재 역할 | 중복/파편화 문제 | Phase A3 판단 |
|---|---|---|---|
| `constants.tsx` | 종목 목록, 색상, 로고, mock price, 거대 `I18N` 사전 | 한 파일에 시장 데이터 + 비주얼 토큰 + 전역 UI 문구가 뒤엉켜 SRP 위반 상태입니다. 특히 멤버십/백테스트/AI/대시보드 문구가 여전히 이 파일에 남아 있어 신규 `constants/*` 체계와 이원화됩니다. | 가장 먼저 분해 대상입니다. `market constants`와 `legacy i18n`를 분리해야 합니다. |
| `constants/vrMessages.ts` | VR 라벨, 배지, 힌트, 링크 라벨, 일부 UI class | 메시지 SSOT 역할은 좋지만, 텍스트와 스타일 class, 외부 링크 메타데이터가 함께 있습니다. | `vrMessages`, `vrPresentation`, `vrExternalLinks` 성격으로 재구분 권장입니다. |
| `constants/appShellMessages.ts` | 앱 엔트리/로딩/에러/해시 | 방향은 좋지만 네비게이션/게시판/백테스트 비활성 툴팁 같은 shell copy가 아직 바깥에 남아 있습니다. | `navigation`, `shell loading`, `global mutation errors` 범위를 명확히 확장해야 합니다. |
| `constants/tdsDialogMessages.ts` | TDS 다이얼로그용 문구 | 구조화 수준은 좋지만, 공통 확인/취소/닫기 `aria-label`이 다른 컴포넌트들까지 완전히 흡수하지는 못했습니다. | 공통 modal a11y 사전의 상위 SSOT 후보입니다. |
| `constants/paymentCheckoutMessages.ts` | 결제/환불/인앱결제 오류 사전 | 결제 영역은 잘 모듈화되었지만, 이메일/정책 문구/오류 텍스트만 있고 멤버십 설명은 `constants.tsx`, `membership.ts`에 중복됩니다. | 멤버십 문구와 결제 문구의 경계 재설계가 필요합니다. |
| `constants/portfolioMutationErrors.ts` | mutation error code + 사용자 노출 문구 | 코드와 표시 문구가 결합되어 있습니다. 나쁜 구조는 아니지만, 공통 fallback title/body는 다른 사전과 중복될 여지가 있습니다. | 도메인 전용 에러 사전으로 유지하되, 공통 fallback은 상위 공통 메시지에서 공급받게 정리 권장입니다. |
| `constants/landingMessages.ts` | 랜딩 페이지 copy | `landingConfig.ts`와 역할이 비교적 잘 분리되어 있습니다. | 좋은 사례입니다. 유지하되 naming만 통일하면 됩니다. |
| `constants/landingConfig.ts` | 랜딩 feature id/icon config | 순수 config 역할이라 바람직합니다. | 유지 대상입니다. |
| `constants/proPlanSurface.ts` | gradient/border/class token | 메시지 파일과 다른 성격인데 `constants` 루트에 평면적으로 놓여 있어 구분이 약합니다. | `ui/surfaceTokens` 계열로 이동 고려 대상입니다. |
| `constants/vrConstants.ts` | VR 주기/수수료/limit/time precision | 금융/시간 상수 분리 방향은 맞습니다. 다만 백테스트/포트폴리오 검증 상수는 다른 파일들에 흩어져 있습니다. | 금융/검증 상수의 기준 파일로 확장해야 합니다. |
| `constants/membership.ts` | 플랜 단가, subtitle, feature list | 멤버십 설명 문자열 일부가 루트 `constants.tsx`와 중복됩니다. | `membershipMessages`와 `membershipPlanConfig`를 분리해야 합니다. |

### 1.2 도메인 파편화의 핵심 원인

1. 루트 `constants.tsx`가 "예전 전역 사전" 역할을 계속 수행하고 있습니다.
2. 신규 `constants/*` 파일이 생겼지만, 실제 컴포넌트는 여전히 `lang === 'ko' ? ... : ...` 패턴과 혼용 중입니다.
3. 메시지와 설정값, 스타일 토큰, 외부 링크 메타데이터가 같은 파일에 공존합니다.
4. 일부 숫자는 상수화되어 있지만, 검증 상수와 초기값 상수의 기준 파일이 분리되어 있지 않습니다.

### 1.3 숨겨진 하드코딩 문자열 핫스팟

| 경로 | 문제 | 권장 SSOT |
|---|---|---|
| `App.tsx` | `멤버십`, 게시판 라벨, 게시판 `aria-label`, 백테스트 비활성 툴팁이 인라인입니다. | `constants/navigationMessages.ts` |
| `components/auth/ProfileView.tsx` | 텔레그램 연결, 탈퇴 확인, 로딩/실패 문구, 플레이스홀더, tier badge 문구가 파일 내부에 집중되어 있습니다. | `constants/profileMessages.ts`, `constants/commonA11y.ts` |
| `components/StrategyCreator.tsx` | 전략 선택/설명/툴팁/유효성 메시지와 기본 티커/기본 수치가 혼재합니다. | `constants/strategyCreatorMessages.ts`, `constants/strategyDefaults.ts` |
| `components/Terms.tsx` | 약관 본문과 제목이 컴포넌트 내부에 직접 박혀 있습니다. | `constants/legalTermsMessages.ts` |
| `components/AuthModals.tsx`, `components/tds/TDSModal.tsx`, `components/VrOrderModal.tsx`, `components/InfoModal.tsx` | `aria-label="닫기"`류가 공통 SSOT 없이 흩어져 있습니다. | `constants/commonA11y.ts` |
| `features/board/PostDetailPage.tsx` | 로딩, 빈 상태, 돌아가기, 면책 문구가 한국어 고정입니다. | `constants/boardMessages.ts` |
| `features/board/PostsListPage.tsx` | `post.category ?? '칼럼'` 폴백이 하드코딩입니다. | `constants/boardMessages.ts` 또는 category enum dictionary |
| `features/board/*Charts.tsx` | 차트 series/축 레이블이 게시글 파일마다 하드코딩입니다. | `constants/boardChartLabels.ts` 또는 `postAssets` 계층 |
| `hooks/useTierDisplay.ts` | `'FREE' | 'PRO' | 'PREMIUM'` 표시 문자열이 훅 내부에 고정입니다. | `constants/membershipTierLabels.ts` |
| `hooks/usePortfolios.ts` | (레거시) 이름·일매수·수수료 등 **폼 검증이 훅 안에 인라인**으로 남아 SRP를 깬다. 상한 숫자는 `constants/domain`으로 이전해야 하나, **폼 규칙 실행은 UI + `validatePortfolioSetupInput`으로 이전**한다(§0.1·`PRE_RELEASE` 확정). | 폼 검증 제거 후 **`constants/domain/financeRules.ts`(또는 동일 SSOT)** 의 상수만 훅이 참조할 필요가 있으면 import; **검증 분기 자체는 훅에서 삭제** |

### 1.4 매직 넘버 핫스팟

| 경로 | 현재 값 | 의미 | 권장 상수명 |
|---|---:|---|---|
| `components/StrategyCreator.tsx` | `20`, `60` | MA 기간 기본값 | `DEFAULT_MA_SHORT_PERIOD`, `DEFAULT_MA_LONG_PERIOD` |
| `components/StrategyCreator.tsx` | `30` | RSI 기본값 | `DEFAULT_RSI_THRESHOLD` |
| `components/StrategyCreator.tsx` | `10` | 부분 익절/목표 수익률/VR G 일부 기본값 | 도메인별로 분리: `DEFAULT_PARTIAL_PROFIT_PCT`, `DEFAULT_TARGET_RETURN_RATE_PCT`, `DEFAULT_VR_G` |
| `components/StrategyCreator.tsx` | `40` | 총 분할 수 기본값 | `DEFAULT_TOTAL_SPLIT_COUNT` |
| `components/StrategyCreator.tsx` | `50` | pool 사용률, low LOC 비중 | `DEFAULT_POOL_USAGE_PCT`, `DEFAULT_LOW_LOC_BUDGET_RATIO_PCT` |
| `components/StrategyCreator.tsx` | `15` | high LOC premium | `DEFAULT_HIGH_LOC_PREMIUM_PCT` |
| `components/StrategyCreator.tsx` | `10000` | VR 초기 투자금 / 초기 V | `DEFAULT_VR_INITIAL_CAPITAL`, `DEFAULT_VR_INITIAL_V` |
| `components/StrategyCreator.tsx` | `1000` | 일반 전략 기본 일매수 금액 | `DEFAULT_DAILY_BUY_AMOUNT` |
| `components/StrategyCreator.tsx` | `0.25` | 수수료율 기본값(%) | `DEFAULT_FEE_RATE_PERCENT` |
| `hooks/usePortfolios.ts` | `100` | 포트폴리오 이름 최대 길이 | `MAX_PORTFOLIO_NAME_LENGTH` |
| `hooks/usePortfolios.ts` | `1_000_000` | 일매수 최대 금액 | `MAX_DAILY_BUY_AMOUNT_USD` |
| `hooks/usePortfolios.ts` | `10` | 허용 가능한 수수료율 상한(%) | `MAX_FEE_RATE_PERCENT` |
| 시뮬레이션 `PORTFOLIO_VALIDATION` | `1`, `250` | MA 기간 하한/상한(0·NaN 차단) | `MIN_MA_PERIOD`, `MAX_MA_PERIOD` |
| 시뮬레이션 `PORTFOLIO_VALIDATION` | `0`, `1_000_000` | 인출/주기 입출금 UI 입력(0 이상, 상한) | `MIN_WITHDRAWAL_INPUT_USD`, `MAX_WITHDRAWAL_AMOUNT_USD` |
| 실제 VR (`constants/vrConstants`) | 동일 | 프로덕션은 `VR_DELTA_CASH_INPUT` + `getVrDeltaCashInputValidationReason` | `MAX_WITHDRAWAL_AMOUNT_USD` |

### 1.5 Core Principles 관점의 결론

- 문자열은 "번역 대상"과 "도메인 규칙"이 분리되어야 합니다.
- 숫자는 "표시용 기본값", "검증 상한", "금융 계산 상수", "시간/쿨타임"으로 계층화되어야 합니다.
- `constants.tsx`는 더 이상 거대 i18n 컨테이너가 아니라, 분리 전환기의 호환 레이어로 축소되어야 합니다.

---

## 2. Phase A3 액션 플랜

### 2.1 SSOT 재설계 원칙

1. 메시지는 `constants/messages/*`로 모읍니다.
   - 예: `appShellMessages.ts`, `navigationMessages.ts`, `profileMessages.ts`, `strategyCreatorMessages.ts`, `boardMessages.ts`, `legalMessages.ts`
2. 숫자/제한/금융 계산은 `constants/domain/*`로 모읍니다.
   - 예: `portfolioValidation.ts`, `strategyDefaults.ts`, `financeRules.ts`, `timeConstants.ts`
3. 스타일 token은 `constants/ui/*`로 분리합니다.
   - 예: `surfaceTokens.ts`, `badgeTokens.ts`
4. "설정"과 "문구"를 같은 파일에 두지 않습니다.
   - `landingConfig.ts` + `landingMessages.ts` 패턴을 다른 도메인에도 확대 적용합니다.
5. 루트 `constants.tsx`는 즉시 삭제하지 않고 호환 레이어로 축소합니다.
   - 1차: `I18N` 신규 key 추가 금지
   - 2차: 기존 사용처를 도메인 사전으로 이전
   - 3차: 종목/색상/로고 전용 파일로 분해
6. 폼·도메인 검증 함수는 **수치·형식 판단만** 담당하고, 사용자에게 보이는 문구는 `messages/*` 사전 객체를 **매개변수로 주입**받습니다. 검증 모듈에 `lang === 'ko' ? ...` 또는 리터럴 문자열을 숨기지 않습니다.
7. **포트폴리오 설정 폼 (§0.1·Option B):** `validatePortfolioSetupInput` 은 **평면 DTO + `copy` 주입**으로 **`string | null`** 만 반환한다(**throw 금지**). UI가 정제한 값으로 검증한 뒤, **변형 없이** 동일 값으로 `Portfolio`를 만든 다음 `usePortfolios`에 넘긴다. **`usePortfolios`에서는 동일 규칙의 중복 검증을 두지 않는다.**

### 2.1.1 구현 순서 (마이그레이션용 체크리스트)

1. `constants/domain/financeRules.ts`(가칭)에 **`PORTFOLIO_VALIDATION`**, **`roundMoney`**, **`validatePortfolioSetupInput`**, **`normalizeWithdrawalAmount`** 등 시뮬 §3.3과 동일 계약을 **실제 파일로 추가**한다.  
2. `constants/messages/commonMessages.ts`에 시뮬 §3.4 **`CommonMessageSet`** 을 맞춘다.  
3. **`StrategyCreator`** (및 향후 편집 모달): 저장 직전 **DTO 정제** → `validatePortfolioSetupInput` → `null`이면 **그 DTO로만** `Omit<Portfolio,'id'>` 조립 → `onSave`.  
4. **`usePortfolios.handleAddPortfolio` / `handleUpdatePortfolio`:** 이름·일매수·수수료·시작일 등 **폼 검증 블록 삭제**; **한도·세션·Supabase 오류** 등 통신 책임만 유지. 페이로드는 UI가 이미 무결하다고 가정하되, **방어적 프로그래밍이 필요하면** “폼이 아닌 서버 제약 위반” 수준으로만 별도 정책을 문서화한다(폼과 중복 메시지 금지 권장).

### 2.2 권장 폴더 구조

```text
constants/
  messages/
    appShellMessages.ts
    navigationMessages.ts
    profileMessages.ts
    strategyCreatorMessages.ts
    boardMessages.ts
    legalMessages.ts
    commonMessages.ts
    commonA11y.ts
  domain/
    financeRules.ts
    strategyDefaults.ts
    portfolioValidation.ts
    membershipPlanConfig.ts
    marketUniverse.ts
  ui/
    surfaceTokens.ts
    badgeTokens.ts
  legacy/
    rootI18nCompat.ts
```

### 2.3 루트 `constants.tsx` 정리 전략

- `AVAILABLE_STOCKS`, `PAID_STOCKS`, `ALL_STOCKS`는 `domain/marketUniverse.ts`로 이동합니다.
- `STOCK_COLORS`, `CUSTOM_GRADIENT_LOGOS`는 `ui/stockPresentation.ts`로 이동합니다.
- `MOCK_PRICES`는 테스트/스토리북 성격이라면 `mocks/marketPrices.ts`로 이동합니다.
- 거대 `I18N`는 신규 분리 파일로 옮기고, 루트는 아래처럼 과도기 호환만 담당합니다.

```ts
export { APP_SHELL_MESSAGES } from './constants/messages/appShellMessages';
export { STRATEGY_CREATOR_MESSAGES } from './constants/messages/strategyCreatorMessages';
export { MEMBERSHIP_TIER_LABELS } from './constants/messages/membershipTierLabels';
export { ALL_STOCKS, PAID_STOCKS } from './constants/domain/marketUniverse';
```

### 2.4 안전한 fallback 전략

- 타입 레벨에서는 `Record<AppLang, ...>`로 강제하여 키 누락을 최대한 컴파일 단계에서 막습니다.
- 런타임에서는 `getDictionaryCopy()` 같은 안전 wrapper로 누락을 감지합니다.
- 누락 시:
  - 개발 환경: 콘솔 경고
  - 사용자 환경: `showErrorToast()` 호출 — **`getDictionaryCopy` 등이 렌더 경로에서 호출될 때는 동기 호출 금지(Rule 2)**; `Promise.resolve().then(() => showErrorToast(...))` 로 커밋 이후로 지연(§3.5).
  - UI: 한국어 기본 또는 최소 안전 문구로 렌더링

### 2.5 마이그레이션 순서

1. `constants.tsx` 신규 문자열 추가 금지 선언
2. `App.tsx`, `ProfileView.tsx`, `StrategyCreator.tsx`의 하드코딩 제거
3. 공통 `aria-label`, `modal close`, `loading`, `fallback error`를 공통 사전으로 통합
4. `useTierDisplay.ts`의 표시 문자열/매직 넘버를 상수 기반으로 치환
5. **`usePortfolios.ts`:** §0.1에 따라 **폼 검증 로직을 제거**하고, 상한·이름 길이 등 숫자 상수는 **`constants/domain`** SSOT로만 참조(훅 내부 하드코딩 `100`, `1_000_000` 제거). **포트폴리오 필드 무결성은 전적으로 UI + `validatePortfolioSetupInput` 파이프라인**에 둔다.
6. `Terms.tsx`, `Privacy.tsx`, `features/board/*`로 확장
7. 마지막에 루트 `constants.tsx` 축소

---

## 3. 시뮬레이션용 코드 스니펫

아래 코드는 실제 저장소를 바로 덮어쓰는 최종본이 아니라, 현재 코드 패턴을 안전하게 재설계했을 때 어떤 구조가 되어야 하는지 보여주는 **완성형 가상 파일**입니다.

### 3.1 Before: 파편화된 루트 상수 파일

```ts
export const AVAILABLE_STOCKS = ['SPY', 'QQQ', 'TQQQ'];

export const STOCK_COLORS: Record<string, string> = {
  SPY: '#4285F4',
  QQQ: '#34A853',
  TQQQ: '#9C27B0',
};

export const I18N = {
  ko: {
    dashboard: '대시보드',
    membership: '멤버십',
    login: '로그인',
    logout: '로그아웃',
    telegramConnect: '텔레그램 연결하기',
    processing: '처리 중...',
    deleteAccount: '회원 탈퇴',
    strategyTitle: '이평선 구간매수',
    overLimit: '매매 내역을 확인하세요. 총투자금을 초과했습니다.',
  },
  en: {
    dashboard: 'Dashboard',
    membership: 'Membership',
    login: 'Login',
    logout: 'Logout',
    telegramConnect: 'Connect Telegram',
    processing: 'Processing...',
    deleteAccount: 'Delete Account',
    strategyTitle: 'Moving Average Interval',
    overLimit: 'Check your trades. Total invested has exceeded the limit.',
  },
};

export const MOCK_PRICES: Record<string, number> = {
  SPY: 450.2,
  QQQ: 380.5,
  TQQQ: 35.8,
};
```

문제:

- 시장 데이터, 비주얼, 번역 문자열, mock 데이터가 한 파일에 혼재합니다.
- `membership`, `telegramConnect`, `strategyTitle`처럼 도메인이 다른 문자열이 무차별적으로 같은 사전에 쌓입니다.
- 일부 도메인은 신규 `constants/*`로 빠졌는데, 루트 `I18N`가 계속 살아 있어 호출처가 분산됩니다.

### 3.2 Before: 하드코딩 문자열과 매직 넘버가 섞인 UI 컴포넌트

```tsx
import React, { useState } from 'react';

type AppLang = 'ko' | 'en';

interface PortfolioSetupPanelProps {
  lang: AppLang;
  onSave: (input: {
    name: string;
    dailyBuyAmount: number;
    feeRatePercent: number;
    maShortPeriod: number;
    maLongPeriod: number;
    withdrawalAmount: number;
  }) => Promise<void>;
}

export function PortfolioSetupPanel({
  lang,
  onSave,
}: PortfolioSetupPanelProps) {
  const [name, setName] = useState('');
  const [dailyBuyAmount, setDailyBuyAmount] = useState(1000);
  const [feeRatePercent, setFeeRatePercent] = useState(0.25);
  const [maShortPeriod, setMaShortPeriod] = useState(20);
  const [maLongPeriod, setMaLongPeriod] = useState(60);
  const [withdrawalAmount, setWithdrawalAmount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(lang === 'ko' ? '포트폴리오 이름을 입력해 주세요.' : 'Please enter a portfolio name.');
      return;
    }

    if (dailyBuyAmount <= 0 || dailyBuyAmount > 1000000) {
      setError(lang === 'ko' ? '매일 매수 금액은 0보다 크고 1,000,000 이하여야 합니다.' : 'Daily buy amount must be greater than 0 and up to 1,000,000.');
      return;
    }

    if (feeRatePercent < 0 || feeRatePercent > 10) {
      setError(lang === 'ko' ? '수수료율은 0% ~ 10% 사이여야 합니다.' : 'Fee rate must be between 0% and 10%.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name,
        dailyBuyAmount,
        feeRatePercent,
        maShortPeriod,
        maLongPeriod,
        withdrawalAmount: withdrawalAmount < 0 ? withdrawalAmount : -withdrawalAmount,
      });
    } catch (saveError) {
      setError(
        lang === 'ko'
          ? '저장 중 오류가 발생했습니다.'
          : 'Failed to save.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border p-6">
      <h2>{lang === 'ko' ? '전략 생성' : 'Create Strategy'}</h2>
      <p>{lang === 'ko' ? '이평선 구간 전략의 기본값을 설정합니다.' : 'Configure defaults for the moving-average interval strategy.'}</p>

      <label>
        {lang === 'ko' ? '포트폴리오 이름' : 'Portfolio Name'}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={lang === 'ko' ? '예: 나스닥 적립식' : 'e.g. Nasdaq accumulation'}
        />
      </label>

      <label>
        {lang === 'ko' ? '일매수 금액' : 'Daily Buy Amount'}
        <input
          type="number"
          value={dailyBuyAmount}
          onChange={(event) => setDailyBuyAmount(Number(event.target.value))}
        />
      </label>

      <label>
        {lang === 'ko' ? '수수료율(%)' : 'Fee Rate (%)'}
        <input
          type="number"
          value={feeRatePercent}
          onChange={(event) => setFeeRatePercent(Number(event.target.value))}
        />
      </label>

      <label>
        {lang === 'ko' ? '단기 이평 기간' : 'Short MA Period'}
        <input
          type="number"
          value={maShortPeriod}
          onChange={(event) => setMaShortPeriod(Number(event.target.value))}
        />
      </label>

      <label>
        {lang === 'ko' ? '장기 이평 기간' : 'Long MA Period'}
        <input
          type="number"
          value={maLongPeriod}
          onChange={(event) => setMaLongPeriod(Number(event.target.value))}
        />
      </label>

      <label>
        {lang === 'ko' ? '주기별 인출금' : 'Periodic Withdrawal'}
        <input
          type="number"
          value={withdrawalAmount}
          onChange={(event) => setWithdrawalAmount(Number(event.target.value))}
        />
      </label>

      {error && <p>{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        aria-label={lang === 'ko' ? '전략 저장' : 'Save strategy'}
      >
        {isSaving
          ? lang === 'ko'
            ? '처리 중...'
            : 'Processing...'
          : lang === 'ko'
          ? '저장하기'
          : 'Save'}
      </button>
    </section>
  );
}
```

문제:

- JSX 내부 문자열 하드코딩
- `1000`, `0.25`, `20`, `60`, `10`, `1000000` 등 매직 넘버 남발
- 인출금 sign enforcement가 인라인에 박혀 있어 재사용이 불가능
- 저장 액션에 mutex가 없어 1-tick 중복 클릭이 가능합니다
- 중첩 삼항으로 UI 문구가 선택됩니다

### 3.3 After: 금융/검증 상수 통합 파일

```ts
import type { CommonMessageSet } from '@/constants/messages/commonMessages';

export const ROUNDING = {
  MONEY_DECIMALS: 2,
  EPSILON: Number.EPSILON,
} as const;

export const PORTFOLIO_VALIDATION = {
  MIN_DAILY_BUY_AMOUNT_USD: 1,
  MAX_DAILY_BUY_AMOUNT_USD: 1_000_000,
  MIN_FEE_RATE_PERCENT: 0,
  MAX_FEE_RATE_PERCENT: 10,
  MAX_PORTFOLIO_NAME_LENGTH: 100,
  /** Rule 1: MA 기간 0·음수·비유한값 → 백엔드 이평/분할 계산에서 divide-by-zero·무한 루프 위험 */
  MIN_MA_PERIOD: 1,
  MAX_MA_PERIOD: 250,
  /** 시뮬레이션 폼의 인출/주기 입출금 입력 — UI는 0 이상만 허용, 상한은 일일 매수 한도와 동일 기준으로 둘 수 있음 */
  MIN_WITHDRAWAL_INPUT_USD: 0,
  MAX_WITHDRAWAL_AMOUNT_USD: 1_000_000,
} as const;

export const STRATEGY_DEFAULTS = {
  DAILY_BUY_AMOUNT_USD: 1_000,
  FEE_RATE_PERCENT: 0.25,
  MA_SHORT_PERIOD: 20,
  MA_LONG_PERIOD: 60,
  RSI_THRESHOLD: 30,
  PARTIAL_PROFIT_PERCENT: 10,
  TARGET_RETURN_PERCENT: 10,
  TOTAL_SPLIT_COUNT: 40,
  VR_INITIAL_CAPITAL: 10_000,
  VR_INITIAL_VALUE: 10_000,
} as const;

/** 뮤텍스/디바운스 상한 등 비동기 UI 안전망을 도입할 때 기준으로 삼을 수 있는 상수(제품 정책에 맞게 조정). */
export const MUTEX_TIMEOUT_MS = 60_000;

export function roundMoney(value: number): number {
  const multiplier = 10 ** ROUNDING.MONEY_DECIMALS;
  return Math.round((value + ROUNDING.EPSILON) * multiplier) / multiplier;
}

export function normalizeWithdrawalAmount(rawAmount: number): number {
  return -Math.abs(rawAmount);
}

export function getSafeInitialOrderQty(
  shares: number,
  minOrderQty: number,
): number {
  if (shares <= 0) {
    return minOrderQty;
  }

  return Math.max(minOrderQty, shares);
}

/**
 * Rule 3·6: 검증은 순수하게 수치·형식만 판단하고, 사용자에게 보이는 문구는 주입된 SSOT 사전(`copy`)에서만 가져온다.
 * `lang` 분기나 하드코딩 문자열을 여기에 두지 않는다(SRP).
 *
 * Rule 6 — 페이로드 정합: `input.name`은 **저장·API에 보낼 문자열과 동일**하게 호출부에서 정제한다(일반적으로 `trim()` 후).
 * 원본 입력 기준으로만 길이를 검사하고 저장 시에만 `trim()` 하면, 공백 접미로 인해 **유효한 페이로드가 거짓 실패**할 수 있다(§3.6).
 *
 * 폼 검증 표준(팀 확정): **에러 코드를 throw 하지 않는다.** 반환값 **`string | null`** 만 사용한다(`null` === 통과).
 * DB·네트워크 실패는 `usePortfolios` 등 뮤테이션 레이어에서 별도 처리한다(§0.1).
 */
export function validatePortfolioSetupInput(
  input: {
    name: string;
    dailyBuyAmount: number;
    feeRatePercent: number;
    maShortPeriod: number;
    maLongPeriod: number;
    withdrawalAmount: number;
  },
  copy: CommonMessageSet,
): string | null {
  const {
    name,
    dailyBuyAmount,
    feeRatePercent,
    maShortPeriod,
    maLongPeriod,
    withdrawalAmount,
  } = input;

  if (name.length === 0) {
    return copy.validationNameRequired;
  }

  if (name.length > PORTFOLIO_VALIDATION.MAX_PORTFOLIO_NAME_LENGTH) {
    return copy.validationNameLength;
  }

  if (
    !Number.isFinite(dailyBuyAmount) ||
    dailyBuyAmount < PORTFOLIO_VALIDATION.MIN_DAILY_BUY_AMOUNT_USD ||
    dailyBuyAmount > PORTFOLIO_VALIDATION.MAX_DAILY_BUY_AMOUNT_USD
  ) {
    return copy.validationDailyBuy;
  }

  if (
    !Number.isFinite(feeRatePercent) ||
    feeRatePercent < PORTFOLIO_VALIDATION.MIN_FEE_RATE_PERCENT ||
    feeRatePercent > PORTFOLIO_VALIDATION.MAX_FEE_RATE_PERCENT
  ) {
    return copy.validationFeeRate;
  }

  if (
    !Number.isFinite(maShortPeriod) ||
    maShortPeriod < PORTFOLIO_VALIDATION.MIN_MA_PERIOD ||
    maShortPeriod > PORTFOLIO_VALIDATION.MAX_MA_PERIOD ||
    !Number.isFinite(maLongPeriod) ||
    maLongPeriod < PORTFOLIO_VALIDATION.MIN_MA_PERIOD ||
    maLongPeriod > PORTFOLIO_VALIDATION.MAX_MA_PERIOD
  ) {
    return copy.validationMaPeriod;
  }

  if (!Number.isFinite(withdrawalAmount)) {
    return copy.validationWithdrawalNonFinite;
  }

  if (withdrawalAmount < PORTFOLIO_VALIDATION.MIN_WITHDRAWAL_INPUT_USD) {
    return copy.validationWithdrawalNegative;
  }

  if (withdrawalAmount > PORTFOLIO_VALIDATION.MAX_WITHDRAWAL_AMOUNT_USD) {
    return copy.validationWithdrawalTooLarge;
  }

  return null;
}
```

핵심:

- 숫자의 의미가 이름으로 드러납니다.
- `Number.EPSILON`, divide-by-zero guard, `-Math.abs()` 강제가 중앙화됩니다.
- `StrategyCreator.tsx`, `usePortfolios.ts`, VR 계산 유틸이 같은 기준을 보게 됩니다.
- **검증 유틸 내부에 UI 문자열을 두지 않고**, `CommonMessageSet`을 인자로 주입해 Rule 3(SSOT)과 SRP를 동시에 만족합니다.
- **Rule 1:** `maShortPeriod` / `maLongPeriod` / `withdrawalAmount`까지 중앙 검증에 포함해 NaN·비정상 기간으로 인한 **0으로 나누기·비유한 파이프라인** 진입을 차단합니다. `withdrawalAmount`는 **0 이상·상한 이하**만 허용합니다.
- **Rule 6:** `name` 검증은 **`trim()` 등 저장 직전 페이로드와 동일한 문자열**을 넘겨 받는 전제다(§3.6 `trimmedName`). 빈 문자열·최대 길이는 그 문자열 기준으로만 판단한다.

### 3.4 After: 통합 메시지 사전

```ts
import type { AppLang } from '@/types';

export type CommonMessageKey =
  | 'save'
  | 'processing'
  | 'close'
  | 'portfolioName'
  | 'dailyBuyAmount'
  | 'feeRatePercent'
  | 'shortMaPeriod'
  | 'longMaPeriod'
  | 'periodicWithdrawal'
  | 'createStrategy'
  | 'setupDescription'
  | 'saveAriaLabel'
  | 'namePlaceholder'
  | 'saveFailed'
  | 'validationNameRequired'
  | 'validationNameLength'
  | 'validationDailyBuy'
  | 'validationFeeRate'
  | 'validationMaPeriod'
  | 'validationWithdrawalNonFinite'
  | 'validationWithdrawalNegative'
  | 'validationWithdrawalTooLarge';

export interface CommonMessageSet {
  save: string;
  processing: string;
  close: string;
  portfolioName: string;
  dailyBuyAmount: string;
  feeRatePercent: string;
  shortMaPeriod: string;
  longMaPeriod: string;
  periodicWithdrawal: string;
  createStrategy: string;
  setupDescription: string;
  saveAriaLabel: string;
  namePlaceholder: string;
  saveFailed: string;
  validationNameRequired: string;
  validationNameLength: string;
  validationDailyBuy: string;
  validationFeeRate: string;
  validationMaPeriod: string;
  validationWithdrawalNonFinite: string;
  validationWithdrawalNegative: string;
  validationWithdrawalTooLarge: string;
}

export const COMMON_MESSAGES: Record<AppLang, CommonMessageSet> = {
  ko: {
    save: '저장하기',
    processing: '처리 중…',
    close: '닫기',
    portfolioName: '포트폴리오 이름',
    dailyBuyAmount: '일매수 금액',
    feeRatePercent: '수수료율(%)',
    shortMaPeriod: '단기 이평 기간',
    longMaPeriod: '장기 이평 기간',
    periodicWithdrawal: '주기별 인출금',
    createStrategy: '전략 생성',
    setupDescription: '이평선 구간 전략의 기본값을 설정합니다.',
    saveAriaLabel: '전략 저장',
    namePlaceholder: '예: 나스닥 적립식',
    saveFailed: '저장 중 오류가 발생했습니다.',
    validationNameRequired: '포트폴리오 이름을 입력해 주세요.',
    validationNameLength: '포트폴리오 이름은 100자 이내여야 합니다.',
    validationDailyBuy:
      '매일 매수 금액은 1 이상 1,000,000 이하여야 합니다.',
    validationFeeRate: '수수료율은 0% 이상 10% 이하여야 합니다.',
    validationMaPeriod:
      '단기·장기 이평 기간은 1 이상 250 이하의 유효한 숫자여야 합니다.',
    validationWithdrawalNonFinite: '인출 금액은 유효한 숫자여야 합니다.',
    validationWithdrawalNegative:
      '인출 금액은 0 이상만 입력할 수 있습니다. 음수는 입력할 수 없습니다.',
    validationWithdrawalTooLarge:
      '인출 금액은 $1,000,000 이하여야 합니다.',
  },
  en: {
    save: 'Save',
    processing: 'Processing…',
    close: 'Close',
    portfolioName: 'Portfolio Name',
    dailyBuyAmount: 'Daily Buy Amount',
    feeRatePercent: 'Fee Rate (%)',
    shortMaPeriod: 'Short MA Period',
    longMaPeriod: 'Long MA Period',
    periodicWithdrawal: 'Periodic Withdrawal',
    createStrategy: 'Create Strategy',
    setupDescription:
      'Configure defaults for the moving-average interval strategy.',
    saveAriaLabel: 'Save strategy',
    namePlaceholder: 'e.g. Nasdaq accumulation',
    saveFailed: 'Failed to save.',
    validationNameRequired: 'Please enter a portfolio name.',
    validationNameLength: 'Portfolio name must be 100 characters or less.',
    validationDailyBuy:
      'Daily buy amount must be between 1 and 1,000,000.',
    validationFeeRate: 'Fee rate must be between 0% and 10%.',
    validationMaPeriod:
      'Short and long MA periods must be valid numbers between 1 and 250.',
    validationWithdrawalNonFinite: 'Withdrawal amount must be a valid number.',
    validationWithdrawalNegative:
      'Withdrawal amount must be zero or greater. Negative values are not allowed.',
    validationWithdrawalTooLarge:
      'Withdrawal amount must be $1,000,000 or less.',
  },
};

export function getCommonMessages(lang: AppLang): CommonMessageSet {
  return COMMON_MESSAGES[lang];
}
```

핵심:

- JSX 텍스트, placeholder, `aria-label`을 같은 SSOT로 묶습니다.
- 문자열 기반 로직 분기 없이 `lang` key만 사용합니다.
- 폼/도메인 검증에 쓰는 사용자 노출 메시지도 동일 사전에 두어, `validatePortfolioSetupInput` 같은 순수 검증기에 **주입**합니다.

### 3.5 After: 사전 키 누락 안전 wrapper

```ts
import type { AppLang } from '@/types';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';

/** Rule 3: 시스템 폴백 토스트 문구도 인라인 하드코딩 금지 — 최소한 모듈 상단 Record로 SSOT */
const SYSTEM_FALLBACK_MESSAGES: Record<AppLang, string> = {
  ko: '사전 로드에 실패했습니다. 기본 언어로 표시합니다.',
  en: 'Failed to load dictionary. Falling back to default copy.',
} as const;

export function getDictionaryCopy<T>(
  dictionary: Record<AppLang, T>,
  lang: AppLang,
  dictionaryName: string,
): T {
  const selected = dictionary[lang];

  if (selected != null) {
    return selected;
  }

  const fallback = dictionary.ko;

  // Rule 2: 렌더링 동안 다른 컴포넌트(토스트) 상태를 갱신하지 않는다.
  // 마이크로태스크로 한 틱 미뤄 현재 렌더·커밋 이후에 토스트를 연다.
  void Promise.resolve()
    .then(() => {
      showErrorToast(`[${dictionaryName}] ${SYSTEM_FALLBACK_MESSAGES[lang]}`);
    })
    .catch((err: unknown) => {
      console.error('[getDictionaryCopy] Fallback toast failed:', err);
    });

  return fallback;
}
```

핵심:

- `lang` 타입이 `ko | en`으로 통제되어 있어도, 가상 런타임이나 레거시 마이그레이션 중에는 안전망이 필요합니다.
- "앱이 멈추는 것"보다 "기본 언어로라도 계속 동작하는 것"이 우선입니다.
- 극한 폴백 경로의 문구까지 **`SYSTEM_FALLBACK_MESSAGES`** 로 분리해 Rule 3과 정합합니다.
- **`getDictionaryCopy`를 렌더 본문에서 호출하는 패턴**에서는 폴백 토스트를 **동기 호출하지 않는다(Rule 2)** — `Promise.resolve().then(...)` 로 이펙트를 커밋 이후로 미룬다.

### 3.5.1 계획 반영: `useMutexAction` 확장 (`run` + `isExecuting`)

**목표:** 컴포넌트마다 `useRef` 뮤텍스와 `useState(loading)` 을 이중으로 두지 않고, **동일 실행 구간**에 대해 ref(동기 중복 차단)와 React state(UI 반영)를 훅 한 곳에서 관리한다.  
**마이그레이션:** `const wrapped = useMutexAction(action)` → **`const { run: wrapped, isExecuting } = useMutexAction(action)`**. `isExecuting`이 필요 없는 호출부(예: 진입점 Mutation 래퍼만 두는 경우)는 `run`만 구조 분해하면 된다.

`hooks/useMutexAction.ts` 적용 예정 시그니처(시뮬레이션 — `PHASE_A_ENTRY_SIMULATION.md` §3.3.2와 동일 계약):

```ts
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface UseMutexActionResult<Args extends unknown[]> {
  run: (...args: Args) => Promise<void>;
  isExecuting: boolean;
}

export function useMutexAction<Args extends unknown[]>(
  action: (...args: Args) => void | Promise<void>,
): UseMutexActionResult<Args> {
  const isExecutingRef = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const actionRef = useRef(action);

  // Rule 2: 렌더 페이즈에서 ref를 변이하지 않는다. 페인트 직전에 최신 action을 동기 반영.
  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async (...args: Args) => {
    if (isExecutingRef.current) {
      return;
    }

    try {
      isExecutingRef.current = true;
      setIsExecuting(true);
      await Promise.resolve(actionRef.current(...args));
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
    }
  }, []);

  return useMemo(
    () => ({ run, isExecuting }),
    [run, isExecuting],
  );
}
```

**동작 메모:**

- `run`이 호출된 시점부터 래핑된 액션이 끝날 때까지 `isExecuting === true`이다. 폼 검증이 액션 본문 앞단에 있어도 동일하므로, 저장 버튼 비활성은 “뮤텍스가 잠긴 구간”과 일치한다.
- **Rule 2:** `actionRef.current` 갱신은 **`useLayoutEffect`** 에서만 수행한다. 렌더 본문에서 `actionRef.current = action` 을 두면 Concurrent 렌더와 충돌할 수 있다.
- **Rule 11:** `run`은 **빈 의존성 `useCallback`** 으로 참조를 고정하고, 실행 시점의 액션은 항상 `actionRef.current`를 읽는다. 호출부는 관례·린트를 위해 `saveAction`을 `useCallback`으로 두는 것을 권장한다.
- **Rule 10:** 반환 객체는 `useMemo`로 감싼다. `isExecuting`이 바뀔 때는 참조가 달라지는 것이 정상(하위가 로딩 상태를 구독해야 함).

### 3.6 After: 상수 import 기반 무결점 컴포넌트

```tsx
import React, { useCallback, useState } from 'react';
import type { AppLang } from '@/types';
import { useMutexAction } from '@/hooks/useMutexAction';
import { getDictionaryCopy } from '@/utils/getDictionaryCopy';
import { COMMON_MESSAGES } from '@/constants/messages/commonMessages';
import {
  STRATEGY_DEFAULTS,
  normalizeWithdrawalAmount,
  roundMoney,
  validatePortfolioSetupInput,
} from '@/constants/domain/financeRules';

interface PortfolioSetupPanelProps {
  lang: AppLang;
  onSave: (input: {
    name: string;
    dailyBuyAmount: number;
    feeRatePercent: number;
    maShortPeriod: number;
    maLongPeriod: number;
    withdrawalAmount: number;
  }) => Promise<void>;
}

function formatSaveButtonLabel(
  copy: { save: string; processing: string },
  isSaving: boolean,
): string {
  if (isSaving) {
    return copy.processing;
  }

  return copy.save;
}

export function PortfolioSetupPanel({
  lang,
  onSave,
}: PortfolioSetupPanelProps) {
  const copy = getDictionaryCopy(COMMON_MESSAGES, lang, 'COMMON_MESSAGES');

  const [name, setName] = useState('');
  const [dailyBuyAmount, setDailyBuyAmount] = useState(
    STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD,
  );
  const [feeRatePercent, setFeeRatePercent] = useState(
    STRATEGY_DEFAULTS.FEE_RATE_PERCENT,
  );
  const [maShortPeriod, setMaShortPeriod] = useState(
    STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
  );
  const [maLongPeriod, setMaLongPeriod] = useState(
    STRATEGY_DEFAULTS.MA_LONG_PERIOD,
  );
  const [withdrawalAmount, setWithdrawalAmount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rule 6(Core Principles): 참조 동일성이 필요 없는 O(1) 원시값 연산 — 맹목적 useMemo 금지
  const normalizedFeeRatePercent = roundMoney(feeRatePercent);

  // Rule 6: 검증·저장 모두 동일 페이로드 기준(trim 후 이름)
  const trimmedName = name.trim();

  // `useMutexAction` 계약: §3.5.1 (`useLayoutEffect`로 `actionRef` + `{ run, isExecuting }`)
  const saveAction = useCallback(async () => {
    const validationMessage = validatePortfolioSetupInput(
      {
        name: trimmedName,
        dailyBuyAmount,
        feeRatePercent: normalizedFeeRatePercent,
        maShortPeriod,
        maLongPeriod,
        withdrawalAmount,
      },
      copy,
    );

    if (validationMessage != null) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);

    try {
      await onSave({
        name: trimmedName,
        dailyBuyAmount,
        feeRatePercent: normalizedFeeRatePercent,
        maShortPeriod,
        maLongPeriod,
        withdrawalAmount: normalizeWithdrawalAmount(withdrawalAmount),
      });
    } catch {
      setErrorMessage(copy.saveFailed);
    }
  }, [
    copy,
    trimmedName,
    dailyBuyAmount,
    normalizedFeeRatePercent,
    maShortPeriod,
    maLongPeriod,
    withdrawalAmount,
    onSave,
  ]);

  const { run: runSave, isExecuting } = useMutexAction(saveAction);
  const buttonLabel = formatSaveButtonLabel(copy, isExecuting);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  const handleDailyBuyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDailyBuyAmount(Number(event.target.value));
  };

  const handleFeeRateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFeeRatePercent(Number(event.target.value));
  };

  const handleShortMaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMaShortPeriod(Number(event.target.value));
  };

  const handleLongMaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMaLongPeriod(Number(event.target.value));
  };

  const handleWithdrawalChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setWithdrawalAmount(Number(event.target.value));
  };

  const handleSaveClick = () => {
    void runSave();
  };

  return (
    <section
      className="rounded-2xl border p-6"
      aria-label={copy.createStrategy}
    >
      <header className="space-y-1">
        <h2 className="text-lg font-bold">{copy.createStrategy}</h2>
        <p className="text-sm text-slate-500">{copy.setupDescription}</p>
      </header>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-1">
          <span>{copy.portfolioName}</span>
          <input
            value={name}
            onChange={handleNameChange}
            placeholder={copy.namePlaceholder}
          />
        </label>

        <label className="grid gap-1">
          <span>{copy.dailyBuyAmount}</span>
          <input
            type="number"
            value={dailyBuyAmount}
            onChange={handleDailyBuyChange}
          />
        </label>

        <label className="grid gap-1">
          <span>{copy.feeRatePercent}</span>
          <input
            type="number"
            value={feeRatePercent}
            onChange={handleFeeRateChange}
          />
        </label>

        <label className="grid gap-1">
          <span>{copy.shortMaPeriod}</span>
          <input
            type="number"
            value={maShortPeriod}
            onChange={handleShortMaChange}
          />
        </label>

        <label className="grid gap-1">
          <span>{copy.longMaPeriod}</span>
          <input
            type="number"
            value={maLongPeriod}
            onChange={handleLongMaChange}
          />
        </label>

        <label className="grid gap-1">
          <span>{copy.periodicWithdrawal}</span>
          <input
            type="number"
            value={withdrawalAmount}
            onChange={handleWithdrawalChange}
          />
        </label>
      </div>

      {errorMessage != null && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
        onClick={handleSaveClick}
        disabled={isExecuting}
        aria-label={copy.saveAriaLabel}
      >
        {buttonLabel}
      </button>
    </section>
  );
}
```

이 After 시뮬레이션이 충족하는 항목:

- UI 문자열 100% SSOT import
- 매직 넘버 제거
- 중첩 삼항 제거
- `aria-label`도 사전에서 공급
- **§0.1 Option B:** 본 패널은 **정제 → DTO → `validatePortfolioSetupInput` → 동일 필드로 `Portfolio` 조립 → 훅** 순서의 참고 구현이다; 실제 `StrategyCreator` 등도 **훅 호출 전**에 동일 계약을 지킨다.
- **Rule 6:** `trimmedName`·`normalizedFeeRatePercent`로 **검증 입력과 `onSave` 페이로드가 동일** — 이름 길이·필수 검사가 저장 문자열과 어긋나지 않음(§3.3 JSDoc과 정합)
- **Rule 6(Core Principles):** `roundMoney(feeRatePercent)` 같은 **원시값 O(1) 연산에 `useMemo`를 씌우지 않음**(맹목적 메모이제이션 금지)
- **Rule 8:** `handleNameChange`·`handleSaveClick` 등 이벤트 핸들러를 **`handle` 접두사**로 분리(렌더 JSX 가독성·팀 네이밍)
- `useMutexAction`으로 중복 제출 방지; **확장 계약**에 따라 **`{ run, isExecuting }`** 구조 분해로 실행 함수와 UI 잠금 상태를 동시에 취득(§3.5.1)
- ref 뮤텍스와 `isExecuting`을 훅 내부에서 동기화해, 컴포넌트에 중복 `useState` 로딩을 두지 않음
- **`useMutexAction`:** `useLayoutEffect`로 `actionRef` 동기화 + 고정 `run` + `useMemo` 반환 객체로 Rule 2·10·11 정렬(§3.5.1)
- `normalizeWithdrawalAmount()`로 sign enforcement 중앙화
- `roundMoney()`로 `Number.EPSILON` 반영
- 검증 로직은 도메인 모듈에 두되, 노출 문구는 `copy` 주입으로 Rule 3·6 정합
- **Rule 1:** MA 기간·인출(주기 입출금) 입력값을 `validatePortfolioSetupInput`에서 함께 검증 — 인출 입력은 **0 이상**, **`MAX_WITHDRAWAL_AMOUNT_USD` 이하**, 음수·비유한값 차단

### 3.7 After: 문자열 기반 로직 금지 예시

아래와 같이 tier badge 문구를 문자열 비교로 고르면 안 됩니다.

```ts
const badgeText =
  tierLabel === 'FREE'
    ? 'FREE MEMBER'
    : tierLabel === 'PRO'
    ? 'PRO MEMBER'
    : 'PREMIUM MEMBER';
```

대신 key 기반 exhaustive helper로 바꿔야 합니다.

```ts
type MembershipTier = 'free' | 'pro' | 'premium';
type AppLang = 'ko' | 'en';

const MEMBERSHIP_MEMBER_BADGE: Record<
  MembershipTier,
  Record<AppLang, string>
> = {
  free: { ko: 'FREE 회원', en: 'FREE MEMBER' },
  pro: { ko: 'PRO 회원', en: 'PRO MEMBER' },
  premium: { ko: 'PREMIUM 회원', en: 'PREMIUM MEMBER' },
};

export function getMembershipMemberBadge(
  tier: MembershipTier,
  lang: AppLang,
): string {
  switch (tier) {
    case 'free':
      return MEMBERSHIP_MEMBER_BADGE.free[lang];
    case 'pro':
      return MEMBERSHIP_MEMBER_BADGE.pro[lang];
    case 'premium':
      return MEMBERSHIP_MEMBER_BADGE.premium[lang];
    default: {
      const exhaustiveCheck: never = tier;
      return exhaustiveCheck;
    }
  }
}
```

---

## 4. 실제 적용 시 체크리스트

- `constants.tsx`에 새로운 UI 문구를 추가하지 않았는가
- JSX 내부에 한국어/영어 문자열이 남아 있지 않은가
- `aria-label`, tooltip, placeholder도 사전 import를 사용하는가
- `lang === 'ko' ? ... : ...`가 메시지 선택 용도로 남아 있지 않은가
- 도메인/검증 유틸(`validate*`, `utils/*`) 내부에 UI 문구를 하드코딩하지 않았는가; 사용자 노출 문자열은 사전을 **인자로 주입**받는가(Rule 3·6)
- 폼에서 **`validate*`에 넘기는 값**이 **`onSave`/API 페이로드와 동일**(예: 이름은 `trim()` 후로 검증·전송 일치)한가(Rule 6·§3.3·§3.6)
- **원시값에 대한 단순 연산**(`roundMoney`, 소규모 산술)에 **불필요한 `useMemo`** 를 두지 않았는가(Core Principles·§3.6)
- JSX의 `onClick`/`onChange`를 **무기명 인라인 화살표만**으로 뭉개지 않고 **`handle*`** 로 분리했는가(Rule 8·§3.6)
- **`validatePortfolioSetupInput`** 이 **`string | null`만 반환**하고 **`copy` 주입·throw 없음** 계약을 지켰는가(§0.1·§3.3 JSDoc)
- **`usePortfolios`** 에서 **폼과 중복되는** 이름·일매수·수수료 검증을 **제거**했는가; 훅은 **통신·한도·세션** 중심만 남았는가(SRP·§0.1·§2.1.1)
- 금융·전략 입력(MA 기간, 인출·주기 입출금 등)이 **중앙 검증**에서 `Number.isFinite`·하한/상한으로 막혀 있는가(Rule 1). 인출류 입력은 **0 이상**·**`MAX_WITHDRAWAL_AMOUNT_USD` 이하**·**음수 거부**
- `getDictionaryCopy` 등 유틸의 토스트 폴백 문구가 **`SYSTEM_FALLBACK_MESSAGES` 같은 모듈 상수**로 분리되어 있는가(Rule 3)
- `getDictionaryCopy`가 렌더 경로에서 호출될 때 **토스트를 동기 호출하지 않고** `Promise.resolve().then` 등으로 **커밋 이후**로 미루는가(Rule 2)
- `1000`, `0.25`, `10`, `60_000` 같은 값이 의미 있는 상수명으로 승격되었는가
- 금융 계산에 `Number.EPSILON`, divide-by-zero guard, `-Math.abs()`가 반영되었는가
- 비동기 저장/삭제/결제 액션에 mutex가 적용되었는가
- `useMutexAction` 사용 시 **확장 시그니처**와 일치하는가: 반환값 **`{ run, isExecuting }`**; 구현은 **`useLayoutEffect`로 `actionRef` 갱신** + 고정 `run` + **`useMemo` 반환**으로 Rule 2·Stale closure·불필요한 `run` 재생성을 방지(§3.5.1). 진입점 등 `isExecuting` 불필요 시에도 **`const { run: fn } = useMutexAction(...)`** 로 통일
- 사전 누락 시 `showErrorToast` + fallback copy로 앱이 계속 동작하는가

---

## 5. 최종 결론

Phase A3의 본질은 번역 파일 몇 개를 추가하는 작업이 아닙니다.  
실제 목표는 아래로 요약됩니다.

1. **문자열은 도메인별 사전으로**, 숫자는 **검증/금융/시간 상수로** 분리합니다.
2. `constants.tsx` 중심의 과거 구조를 끝내고, `constants/messages`, `constants/domain`, `constants/ui` 기반의 계층형 SSOT로 이행합니다.
3. **포트폴리오 설정(§0.1):** UI **Option B** 파이프라인 — 정제·평면 DTO·`validatePortfolioSetupInput`(`string | null`)·**페이로드 무결 일치**·훅은 **통신만** — 으로 **레거시 훅 내 폼 검증을 끝낸다.**

이 기준대로 진행하면 `App.tsx`, `ProfileView.tsx`, `StrategyCreator.tsx`, `Terms.tsx`, `useTierDisplay.ts`, `usePortfolios.ts`(폼 검증 **삭제**·상수 SSOT 참조)가 Phase A3의 1차 실제 수정 대상이 됩니다.
