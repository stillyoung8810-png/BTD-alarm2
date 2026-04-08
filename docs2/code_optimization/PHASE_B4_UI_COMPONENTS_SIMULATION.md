# PHASE B4: UI Components Simulation

> 목적: `hooks/` 리팩토링(B3)이 끝난 뒤, 이를 소비하는 `components/` / `App.tsx` UI 레이어를 실제 수정 전에 AST 레벨로 가상 컴파일하는 문서입니다.  
> 원칙: 이 문서는 계획과 시뮬레이션만 다루며, **회장님 승인 전까지 `.tsx` 프로덕션 소스는 수정하지 않습니다.**  
> **Step 3.2·3.3·3.4 통합:** `PHASE_B4_STEP_3_2_DASHBOARD_DECOMPOSITION_SIMULATION.md`, `PHASE_B4_STEP_3_3_AUTH_MODALS_SIMULATION.md`, `PHASE_B4_STEP_3_4_TRADE_MODALS_SIMULATION.md`의 상세 절차·경로·비목표·계약 설명은 본 문서 §3.2·§3.3·§3.4 하위 **「Step 3.2 / 3.3 / 3.4 상세 계획 통합 및 레포 구현 정합」**으로 흡수했고, 해당 전용 파일은 삭제되었습니다(3.4는 본 통합 시점에 삭제). 그 절들은 **현재 워크스페이스 소스와의 정합**을 기록합니다.

---

## 0. B4 동결 선언

### 0.1 범위

- 이번 단계는 **UI 컴포넌트 레이어**만 다룹니다.
- B3에서 확정된 훅 계약(`usePortfolios`, `useAuth`, `useMultiSplitExecution`, `useMutexAction`)을 **UI가 올바르게 소비하도록** 재배치합니다.
- B1 금융 수학, B2 서비스 경계, B3 훅 내부 정책은 다시 열지 않습니다.

### 0.2 이번 문서에서 절대 하지 않을 것

- 실제 `components/*.tsx` / `App.tsx` 수정
- B1/B2/B3에 이미 동결된 수학식 재정의
- "언젠가 쓸 수도 있음" 수준의 추상화 추가
- UI 컴포넌트 안에 `supabase`, 금융 계산, 브리지 호출을 다시 밀어 넣는 것

**예외:** §3.2·§3.3·§3.4의 **「Step 3.2 / 3.3 / 3.4 상세 계획 통합 및 레포 구현 정합」**은 동결 선언과 별도로, **이미 반영된 산 코드 경로·정합 표**를 적습니다(계획 문서의 추적성용).

### 0.3 B4 성공 조건

1. JSX 내부 하드코딩 문자열이 사라지고, **기능별 typed message SSoT**만 사용합니다.
2. Dashboard / Modal / Wizard UI가 **렌더링, 로컬 상태, 명령 실행**으로 책임이 분리됩니다.
3. 비동기 저장/삭제 버튼은 `disabled`만 쓰지 않고, **B3의 mutex 실행 상태**와 연결됩니다.
4. `div`/`span` 클릭 표면은 전부 A11y 계약(`role`, `tabIndex`, `onKeyDown`, `aria-label`)을 갖습니다.
5. 렌더 바디에서 `ref.current = ...`가 사라지고 `useLayoutEffect` 또는 event handler로 이동합니다.
6. `any`, non-null assertion(`!`), 3중 이상 중첩 삼항이 문서 스니펫에 존재하지 않습니다.
7. Trade/Portfolio 입력 폼은 중앙 검증기 또는 B3 guard를 사용하며, 돈 계산은 `Number.EPSILON` 보정이 들어갑니다.

---

## 1. B4 1차 타깃 선정

| 타깃 | 현재 리스크 | B4 조치 | 우선순위 |
|---|---|---|---|
| `App.tsx` + `TabContent` 진입 셸 | 모달 상태가 분산되고, UI 레이어에서 직접 I/O 업데이트가 남아 있으며, inline callback churn이 큼 | 단일 modal state, `usePortfolioUiCommands` 브리지, typed suspense fallback, 모달 콜백 `useCallback` 안정화, 네비는 TabContent 외부 셸(또는 별도 확장) | P0 |
| `Dashboard.tsx` + 내부 `PortfolioCard` | 한 파일 안에 fetch/effect/view-model/JSX가 과밀, 렌더 중 ref 변이, 하드코딩 문자열, A11y 누락, `vrSettings!`, unused import, helper-local `any` 존재 | `DashboardShell` / `PortfolioCardContainer` / `PortfolioCardView` 분리, strategy union helper, dead code 소각, clickable surface 정규화 | P0 |
| `AuthModals.tsx` + `auth/AuthModalCoordinator.tsx` | UI 컴포넌트가 `supabase`를 직접 다루고, `any` catch, 하드코딩 문구, type별 props 삼항이 큼 | `useAuthModalController` + `AuthViewRenderer`(명시 props / `ProfileView`만 `ProfileViewProps` 스프레드) + coordinator shell 고정 | P0 |
| `TradeExecutionModal.tsx` + `QuickInputModal.tsx` | 수수료 계산/캘린더/저장 guard 중복, UI가 trade id를 생성, mutex 상태 미소비, backdrop A11y 미흡, `dailyBuyAmount` 초과 UX 정책이 아직 미고정 | 공유 trade draft controller + fee preview helper + save command contract + Soft Warning(non-blocking) 규약 추가 | P1 |
| `StrategyCreator.tsx` | 저장 파이프라인은 개선됐지만, wizard JSX가 과대하고 `lang ===` 하드코딩이 산재 | step 분리, typed copy SSOT, **`saveCommand`만 뮤텍스 소비(UI `useMutexAction` 이중 잠금 금지)**, `utils.ts` colocation | P1 |

### 1.1 2차 후속 타깃

- `AlarmModal.tsx`
- `PortfolioDetailsModal.tsx`
- `PortfolioCardActions.tsx`
- `SessionExpiredAlertGate.tsx`

이들은 이번 B4 핵심 계약이 고정된 뒤 동일 패턴으로 따라오면 됩니다. 즉, 지금 문서에서는 **공통 규약만 고정**하고 개별 상세 스니펫은 생략합니다.

---

## 2. B4 공통 계약

### 2.1 UI mutation command 계약

UI는 더 이상 "그냥 `async () => void` 콜백"만 받지 않습니다.  
버튼 비활성/로딩/1-tick 중복 차단을 **같은 계약**으로 소비해야 합니다.

```ts
export interface UiMutationCommand<Args extends unknown[], Result = void> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

export interface PortfolioUiCommands {
  createPortfolio: UiMutationCommand<[portfolio: Omit<Portfolio, 'id'>]>;
  saveTrade: UiMutationCommand<[portfolioId: string, draft: TradeDraftInput]>;
  updatePortfolio: UiMutationCommand<[portfolio: Portfolio]>;
  deletePortfolio: UiMutationCommand<[portfolioId: string]>;
  closePortfolio: UiMutationCommand<
    [portfolioId: string, finalSells: TerminationInput[], additionalFee: number]
  >;
}
```

핵심:

- 저장 버튼은 `disabled={command.isExecuting}` 와 `aria-busy={command.isExecuting}` 를 함께 사용합니다.
- UI는 `Promise<void>` 콜백만 받고 자체 `isSaving` state를 또 만들지 않습니다.
- B3에서 `useMutexAction`으로 고정한 정책을 **UI가 눈으로 보이게** 소비합니다.
- B4 `App.tsx`는 `usePortfolios(...)` 반환 묶음을 그대로 모달에 넘기지 않고, **`usePortfolioUiCommands(bundle): PortfolioUiCommands`**(신규)로 감싼 뒤 `ActiveModalRenderer`에 주입한다. 구현체는 각 `handle*`에 대응하는 `isExecuting` 플래그를 **B3 뮤텍스 노출 계약**에 맞춰 매핑한다.

### 2.2 기능별 i18n SSoT 계약

`I18N` 하나에 모든 문구를 우겨 넣지 않습니다. 기능별 메시지 파일로 쪼개되, 런타임 nullish fallback 없이 `Record<AppLang, MessageSet>`로 고정합니다.

```ts
import type { AppLang } from '@/types';

export interface DashboardMessageSet {
  emptyPortfolio: string;
  valuationLabel: string;
  realizedProfitLabel: string;
  realizedProfitAfterFees: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
  openExecutionAria: (portfolioName: string) => string;
  strategyName: Record<PortfolioStrategyKind, string>;
  execution: {
    calculating: string;
    noHoldings: string;
    insufficientAmount: string;
    checkingSection: string;
  };
}

export const DASHBOARD_MESSAGES: Record<AppLang, DashboardMessageSet> = {
  ko: {
    emptyPortfolio: '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.',
    valuationLabel: '평가금액',
    realizedProfitLabel: '실현손익',
    realizedProfitAfterFees: '(제비용 반영)',
    aiTradeRecognitionAria: 'AI 매매 인식',
    quickInputAria: '퀵 입력',
    openExecutionAria: (portfolioName) => `${portfolioName} 일별 매매 실행 열기`,
    strategyName: {
      vr_band: '타겟 밸류 채널',
      multi_split: '다분할 매매법',
      no_stop_multi_split: '다분할 매매법(무손절)',
      ma_interval: '이평선 구간매수',
    },
    execution: {
      calculating: '계산 중...',
      noHoldings: '보유 없음',
      insufficientAmount:
        '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
      checkingSection: '구간 확인 중…',
    },
  },
  en: {
    emptyPortfolio: 'No portfolios. Please add a portfolio.',
    valuationLabel: 'Valuation',
    realizedProfitLabel: 'Realized P/L',
    realizedProfitAfterFees: '(After fees)',
    aiTradeRecognitionAria: 'AI Trade Recognition',
    quickInputAria: 'Quick input',
    openExecutionAria: (portfolioName) =>
      `Open daily execution for ${portfolioName}`,
    strategyName: {
      vr_band: 'Target Value Channel',
      multi_split: 'Multi-Split Trading',
      no_stop_multi_split: 'No-Stop Multi-Split',
      ma_interval: 'MA Interval Buying',
    },
    execution: {
      calculating: 'Calculating...',
      noHoldings: 'No holdings',
      insufficientAmount:
        'Notice: 1st buy amount is too low to place orders. Please check your settings.',
      checkingSection: 'Checking section…',
    },
  },
};
```

핵심:

- 런타임 `?.` / `??` fallback으로 가리는 대신, **타입으로 누락을 막습니다**.
- JSX에서는 `copy.execution.calculating`만 소비합니다.
- "하드코딩 금지"를 문서 수준에서 강제합니다.

### 2.3 클릭 표면 접근성 헬퍼

B4에서 **`src/utils/a11yHelpers.ts`** 단일 구현을 SSOT로 두고, 루트 `components/`에서는 **`import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers'`** 로 소비합니다(유령 심볼 방지, Rule 6·7). `src/components/`만 쓰는 브랜치에서는 상대 경로를 한 단계 줄여 **`../utils/a11yHelpers`**로 맞추면 됩니다.

```tsx
// src/utils/a11yHelpers.ts
import type { KeyboardEvent } from 'react';

export function handlePressEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  action();
}
```

적용 대상:

- `Dashboard.tsx`의 종목 로고 클릭 표면
- `Dashboard.tsx`의 daily execution 카드 표면
- modal backdrop가 클릭으로 닫히는 웹 모달

### 2.4 금액/수수료 preview 공통 helper

`TradeExecutionModal`과 `QuickInputModal`은 현재 같은 수학을 중복 계산합니다. B4에서는 UI 전용 preview helper 하나로 통일합니다.

```ts
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';

const DEFAULT_FEE_RATE_PERCENT = 0.25;
const SEC_FEE_RATE = 0.00003;
const MOC_SELL_RATIO = 0.25;
const FEE_DECIMAL_PLACES = 4;

function roundToPlaces(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

interface TradeFeePreviewInput {
  tradeType: 'buy' | 'sell';
  price: number;
  quantity: number;
  feeRatePercent: number | null | undefined;
}

interface TradeFeePreview {
  fee: number;
  totalSettlement: number;
}

export function calculateTradeFeePreview(
  input: TradeFeePreviewInput,
): TradeFeePreview {
  if (!areStrictPositiveFiniteScalars(input.price, input.quantity)) {
    return {
      fee: 0,
      totalSettlement: 0,
    };
  }

  const feeRatePercent =
    input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT;
  const commission =
    input.price * input.quantity * (feeRatePercent / 100);
  const secFee =
    input.tradeType === 'sell'
      ? input.price * input.quantity * SEC_FEE_RATE
      : 0;
  const fee = roundToPlaces(commission + secFee, FEE_DECIMAL_PLACES);

  return {
    fee,
    totalSettlement:
      input.tradeType === 'buy'
        ? roundToPlaces(input.price * input.quantity + fee, 2)
        : roundToPlaces(input.price * input.quantity - fee, 2),
  };
}
```

핵심:

- `price <= 0`, `quantity <= 0` 산재를 없애고 `areStrictPositiveFiniteScalars`로 정렬합니다.
- 수수료 반올림에 `Number.EPSILON`을 강제합니다.
- `0.25`, `0.00003` 같은 매직 넘버를 상수로 올립니다.

### 2.5 Trade journal Soft Warning 계약

`TradeExecutionModal` / `QuickInputModal`은 **실주문 실행 UI가 아니라 매매 일지 기록 UI**입니다.  
따라서 **매수 총액(가격 × 수량을 소수점 2자리로 정규화한 값)이 `dailyBuyAmount`(동일하게 2자리 정규화)를 초과해도 저장을 막지 않습니다.**

#### 2.5.1 Rule 1: IEEE 754 방어 + Rule 6: 총액 계산 SRP

UI 모달 본문에 `price * quantity`를 인라인으로 두면 **한도에 정확히 맞춘 거래도** `300.00000000000004 > 300` 같은 **거짓 경고(False Positive)**가 날 수 있습니다.  
또한 총액 정의가 바뀌면(예: 세금/접대 비용이 총액에 포함) 모달 전체를 뜯어고쳐야 하므로, **총액 산출은 순수 유틸 한 곳**으로 격리합니다.

B4 구현 시 **신규** `utils/financialCalculations.ts`(가칭 파일명, 기존 `calculateTradeFeePreview`와 역할 분리)에 아래 계약을 둡니다.

```ts
import { areStrictPositiveFiniteScalars } from './financialScalarGuards';

/**
 * B4 동결: 일지 예산 Soft Warning 비교는 **소수점 2자리 고정**.
 * `calculateTotalTradeAmount`·`dailyBuyAmount` 정규화·`>` 비교 모두 이 자리수만 사용한다.
 */
const TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES = 2;

function roundMoneyToPlaces(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * 매수 총액(가격 × 수량)의 **표시/비교용** 정규화 값.
 * 검증 실패 시 0 — 호출부는 `areStrictPositiveFiniteScalars`로 이미 게이트한 뒤 호출하는 것을 권장.
 */
export function calculateTotalTradeAmount(
  price: number,
  quantity: number,
): number {
  if (!areStrictPositiveFiniteScalars(price, quantity)) {
    return 0;
  }

  return roundMoneyToPlaces(
    price * quantity,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );
}

interface TradeBudgetCheckInput {
  tradeType: 'buy' | 'sell';
  price: number;
  quantity: number;
  dailyBuyAmount: number;
}

/**
 * Soft Warning 여부만 판단. 저장 차단 금지.
 * `dailyBuyAmount`도 **동일하게 2자리**로 반올림해 비교해 양쪽 모두 부동소수 잔여 오차를 제거.
 */
export function shouldWarnBudgetExceeded(
  input: TradeBudgetCheckInput,
): boolean {
  if (input.tradeType !== 'buy') {
    return false;
  }

  if (
    !areStrictPositiveFiniteScalars(
      input.price,
      input.quantity,
      input.dailyBuyAmount,
    )
  ) {
    return false;
  }

  const tradeAmount = calculateTotalTradeAmount(input.price, input.quantity);
  const budgetAmount = roundMoneyToPlaces(
    input.dailyBuyAmount,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );

  return tradeAmount > budgetAmount;
}
```

규약:

- **소수점 자리수:** 위 비교는 `TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES = 2`로 **고정**한다(회장님 확정). 이후 통화 단위 변경이 필요하면 **별도 페이즈**에서 상수·문서·마이그레이션을 함께 연다.
- `tradeAmount > budgetAmount`(위 유틸이 산출한 정규화 값 기준) 는 **에러가 아니라 경고**입니다.
- 경고 토스트를 띄운 뒤에도 `saveCommand.run(...)`은 계속 실행합니다.
- 저장 차단은 오직 **비정상 수치(`NaN`, `0`, 음수)** 또는 **뮤텍스 실행 중**일 때만 허용합니다.
- 로컬 `usePortfolioMutations.handleAddTrade`는 현재 예산 초과 하드 블록이 없으므로, B4는 **새 차단 로직을 추가하지 않습니다**.
- `TradeExecutionModal` / `QuickInputModal` JSX·핸들러 안에서는 **`price * quantity`를 직접 쓰지 않고** `shouldWarnBudgetExceeded` 또는 `calculateTotalTradeAmount`만 호출합니다.

### 2.6 Warning toast 채널 계약

현재 로컬 워크스페이스에는 `showErrorToast`는 있으나, **별도 warning 토스트 심볼은 아직 없습니다.**  
따라서 B4 계획서는 아래처럼 **가칭 warning 채널**을 문서에 고정하고, 실제 구현 시 `tds-adapter` 확장 또는 동등 경고 토스트 API로 연결합니다.

```ts
/**
 * 구현 시점 계약:
 * - 에러 토스트(`showErrorToast`)와 시각적으로 구분되는 경고 토스트 채널
 * - 함수 이름은 `showWarningToast` 또는 동등 API로 최종 확정
 */
declare function showWarningToast(message: string): void;
```

핵심:

- 지금 단계에서는 **문서 계약만 고정**합니다.
- 실제 구현 때 함수명은 저장소의 toast host 구조에 맞춰 확정합니다.
- §3.4 `TradeExecutionModal` 시뮬레이션은 구현 시 **`../components/tds-adapter/showWarningToast`**(또는 동등 경로)에서 `showWarningToast`를 import한다. 모듈이 아직 없으면 B4에서 `showErrorToast`와 분리된 **warning 전용 host**를 함께 추가한다.

---

## 3. 타깃별 시뮬레이션

## 3.1 `App.tsx`: 모달/탭/명령 오케스트레이션 셸

### 현재 문제

- `creator`, `alarm`, `details`, `quickInput`, `execution`, `aiImage`, `terminate`가 각각 분산 state라서 셸 인지 복잡도가 큽니다.
- JSX 안에서 inline async handler가 많아 memoized child 재렌더가 쉽게 발생합니다.
- 일부 사용자 데이터 변경이 아직 셸 레이어에서 직접 `supabase`를 호출합니다.
- lazy fallback이 `…` 하나로 끝나 UX/i18n 의미가 약합니다.
- 시뮬레이션 초안에 **`portfolios` / `portfolioCommands` 미선언**, **`navItems` 데드 코드**, **`TabContent`에 인라인 화살표 콜백 다발** 등 Mental Compile 실패 요소가 있었다.

### 3.1.1 B4 전제 (로컬 API와의 정합)

- `usePortfolios`는 **인자 없이 호출할 수 없다.** `UsePortfoliosOptions`( `userId`, `userProfile`, `portfolios`, `setPortfolios`, `lang` )를 반드시 넘긴다.
- `usePortfolioMutations`만 단독으로 import 되는 형태는 본 레포와 맞지 않는다. B4에서는 **`usePortfolios` 반환 묶음**을 `§2.1`의 `PortfolioUiCommands`로 싸는 **`usePortfolioUiCommands`**(가칭, 신규 훅 또는 인접 모듈)를 두는 것을 계획서에 고정한다.
- 현재 `TabContent`는 **`navItems` prop이 없다.** 하단/상단 네비 설정 배열이 필요하면 **`TabContent` 밖의 전용 셸 컴포넌트**에서 소비하거나, 별도 페이즈에서 `TabContent` 시그니처를 확장한다(본 문서 스니펫은 전자를 기본으로 한다).

### After 시뮬레이션

> **발췌 규약:** `TabContent`에 넘기는 `user`·KPI·수치 **0** 등은 문서 길이를 줄이기 위한 자리 표시자다. 실제 구현 시에는 **현재 `App.tsx`가 넘기는 동일 값**으로 치환한다. **스텁 콜백은 시뮬레이션에서도 `noop` / `noopAsync`처럼 `useCallback`으로 고정한 참조**를 넘겨 `TabContent`가 `React.memo`일 때 매 렌더마다 새 화살표 함수가 생기지 않게 한다(Rule 10). 모달 오픈용 핸들러는 별도 `useCallback`으로 안정화한다.
>
> **Rule 10 (참조 동일성):** `TabContent` 같은 거대 셸이 `React.memo`일 때, **`activePortfolios` / `closedPortfolios`처럼 `.filter`로 만든 배열을 매 렌더 새로 만들면 prop 참조가 매번 바뀌어 방어막이 무력화**된다. 연산 비용이 아니라 **참조 안정성** 때문에 **`useMemo(() => portfolios.filter(...), [portfolios])`로 배열 참조를 고정**한다. `activePortfolioCount`는 **`useMemo` 없이 `length`**로 충분하다. 스텁 화살표를 객체로 모아 **`useMemo`로 감싼 `tabContentProps`는 여전히 가짜 최적화**이므로 비채택한다.

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { AppLang, Portfolio } from './types';
import type { AppUserProfile } from './types/appUserProfile';
import { TabContent, type ActiveTab } from './components/TabContent';
import { usePortfolios } from './hooks/usePortfolios';
import { usePortfolioUiCommands } from './hooks/usePortfolioUiCommands';
import StrategyCreator from './components/StrategyCreator';
import AlarmModal from './components/AlarmModal';
import PortfolioDetailsModal from './components/PortfolioDetailsModal';
import QuickInputModal from './components/QuickInputModal';
import TradeExecutionModal from './components/TradeExecutionModal';
import AIImageInputModal from './components/AIImageInputModal';
import { TerminationInput } from './components/SettlementModals';

type ModalState =
  | { kind: 'none' }
  | { kind: 'creator' }
  | { kind: 'alarm'; portfolioId: string }
  | { kind: 'details'; portfolioId: string }
  | { kind: 'quick_input'; portfolioId: string; activeSection?: 1 | 2 | 3 }
  | { kind: 'trade_execution'; portfolioId: string }
  | { kind: 'ai_image'; portfolioId: string }
  | { kind: 'terminate'; portfolioId: string };

function App(): React.ReactElement {
  const [lang, _setLang] = useState<AppLang>('ko');
  const [activeTab, _setActiveTab] = useState<ActiveTab>('dashboard');
  const [modalState, setModalState] = useState<ModalState>({ kind: 'none' });
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  const userId: string | null = null;
  const userProfile: AppUserProfile | null = null;

  const portfolioBundle = usePortfolios({
    userId,
    userProfile,
    portfolios,
    setPortfolios,
    lang,
  });

  const portfolioCommands = usePortfolioUiCommands(portfolioBundle);

  const handleCloseModal = useCallback(() => {
    setModalState({ kind: 'none' });
  }, []);

  const handleOpenCreator = useCallback(() => {
    setModalState({ kind: 'creator' });
  }, []);

  const handleOpenAlarm = useCallback((portfolioId: string) => {
    setModalState({ kind: 'alarm', portfolioId });
  }, []);

  const handleOpenDetails = useCallback((portfolioId: string) => {
    setModalState({ kind: 'details', portfolioId });
  }, []);

  const handleOpenQuickInput = useCallback(
    (portfolioId: string, activeSection?: 1 | 2 | 3) => {
      setModalState({
        kind: 'quick_input',
        portfolioId,
        activeSection,
      });
    },
    [],
  );

  const handleOpenExecution = useCallback((portfolioId: string) => {
    setModalState({ kind: 'trade_execution', portfolioId });
  }, []);

  const handleOpenAIImage = useCallback((portfolioId: string) => {
    setModalState({ kind: 'ai_image', portfolioId });
  }, []);

  const activePortfolios = useMemo(
    () => portfolios.filter((p) => !p.isClosed),
    [portfolios],
  );
  const closedPortfolios = useMemo(
    () => portfolios.filter((p) => p.isClosed),
    [portfolios],
  );
  const activePortfolioCount = activePortfolios.length;

  const maxPortfolios = userProfile?.max_portfolios ?? 3;

  const currentModalPortfolio = useMemo(() => {
    if (modalState.kind === 'none' || modalState.kind === 'creator') {
      return null;
    }
    return (
      portfolios.find((portfolio) => portfolio.id === modalState.portfolioId) ?? null
    );
  }, [modalState, portfolios]);

  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => {}, []);

  return (
    <>
      <TabContent
        activeTab={activeTab}
        lang={lang}
        user={null}
        activePortfolios={activePortfolios}
        portfolios={portfolios}
        closedPortfolios={closedPortfolios}
        canAccessPaidStocks={false}
        currentTier=""
        totalValuation={0}
        totalValuationChange={0}
        totalValuationChangePct={0}
        onDailyExecutionSummaryChange={noop}
        onOpenLogin={noop}
        onOpenSignup={noop}
        onRequestOpenCreator={handleOpenCreator}
        onOpenAlarm={handleOpenAlarm}
        onOpenDetails={handleOpenDetails}
        onOpenQuickInput={handleOpenQuickInput}
        onOpenExecution={handleOpenExecution}
        onOpenAIImage={handleOpenAIImage}
        onClosePortfolio={noop}
        onDeletePortfolio={noopAsync}
        onUpdatePortfolio={noopAsync}
        onDeleteHistory={noopAsync}
        onClearHistory={noopAsync}
        onSelectCheckoutPlan={noop}
        onBackToDashboard={noop}
      />

      <ActiveModalRenderer
        lang={lang}
        modalState={modalState}
        portfolio={currentModalPortfolio}
        activePortfolioCount={activePortfolioCount}
        maxPortfolios={maxPortfolios}
        onClose={handleCloseModal}
        portfolioCommands={portfolioCommands}
      />
    </>
  );
}

function ActiveModalRenderer({
  lang,
  modalState,
  portfolio,
  activePortfolioCount,
  maxPortfolios,
  onClose,
  portfolioCommands,
}: {
  lang: AppLang;
  modalState: ModalState;
  portfolio: Portfolio | null;
  activePortfolioCount: number;
  maxPortfolios: number;
  onClose: () => void;
  portfolioCommands: PortfolioUiCommands;
}): React.ReactElement | null {
  switch (modalState.kind) {
    case 'none':
      return null;
    case 'creator':
      return (
        <StrategyCreator
          lang={lang}
          onClose={onClose}
          saveCommand={portfolioCommands.createPortfolio}
          currentPortfolioCount={activePortfolioCount}
          maxPortfolios={maxPortfolios}
        />
      );
    case 'alarm':
      return portfolio == null ? null : <AlarmModal lang={lang} portfolio={portfolio} onClose={onClose} saveCommand={portfolioCommands.updatePortfolio} />;
    case 'details':
      return portfolio == null ? null : <PortfolioDetailsModal lang={lang} portfolio={portfolio} onClose={onClose} />;
    case 'quick_input':
      return portfolio == null ? null : (
        <QuickInputModal
          lang={lang}
          portfolio={portfolio}
          activeSection={modalState.activeSection}
          onClose={onClose}
          saveCommand={portfolioCommands.saveTrade}
        />
      );
    case 'trade_execution':
      return portfolio == null ? null : (
        <TradeExecutionModal
          lang={lang}
          portfolio={portfolio}
          dailyBuyAmount={portfolio.dailyBuyAmount}
          onClose={onClose}
          saveCommand={portfolioCommands.saveTrade}
        />
      );
    case 'ai_image':
      return portfolio == null ? null : <AIImageInputModal lang={lang} portfolio={portfolio} onClose={onClose} />;
    case 'terminate':
      return portfolio == null ? null : <TerminationInput lang={lang} portfolio={portfolio} onClose={onClose} closeCommand={portfolioCommands.closePortfolio} />;
    default: {
      const exhaustiveCheck: never = modalState;
      return exhaustiveCheck;
    }
  }
}
```

핵심:

- `App.tsx`는 **상태 오케스트레이션만** 담당합니다.
- modal open state를 단일 discriminated union으로 묶어 WSOD 없이 분기합니다.
- 모달을 **`React.lazy`로만** 불러올 때만 **`Suspense` + i18n fallback**을 둔다. 본 스니펫은 **정적 import**이므로 **가짜 `Suspense` 껍데기는 두지 않는다**(Rule 6).
- `saveCommand` / `closeCommand`를 전달하므로, 하위 모달이 **hook mutex 상태**를 그대로 UI에 노출할 수 있습니다.
- **`portfolios` / `setPortfolios` / `usePortfolios` / `portfolioCommands` 선언**을 스니펫에 포함해 Rule 7 유령 변수를 제거했습니다.
- **`usePortfolioUiCommands`**는 B4에서 추가하는 어댑터로 명시합니다(본문 스니펫은 import만 두고 구현은 §2.1과 동일 계약으로 조립).
- **`navItems` 데드 코드**는 제거했습니다. 네비는 `TabContent` 외부 셸에서 다루는 것을 전제로 합니다.
- 모달 오픈용 **`useCallback` 고정 핸들러**로 `TabContent`에 넘기는 참조를 안정화합니다(Rule 10).
- **`activePortfolios` / `closedPortfolios`는 `TabContent`에 안정 참조를 넘기기 위해 `useMemo(..., [portfolios])`로 고정**합니다(Rule 10, 배열 재생성 방지). `activePortfolioCount`는 **`length`로만 계산**합니다.
- **`tabContentProps`를 `useMemo`로 감싸는 가짜 최적화는 제거**합니다. 대신 스텁 콜백은 **`noop` / `noopAsync`를 `useCallback`으로 한 번만 만들어** 재사용해, `TabContent`가 메모이제이션돼 있어도 **스텁 참조가 매 렌더 바뀌지 않게** 합니다(Rule 10).
- `ActiveModalRenderer`가 쓰는 모달·위저드는 **`./components/...` import**로 유령 심볼을 없앱니다.
- `TabContent`의 비모달 필드는 **시뮬레이션 스텁**입니다. 프로덕션에서는 기존 `App.tsx`의 실제 `user`·티어·KPI·히스토리 핸들러로 치환합니다.

### 3.1.2 실제 레포 구현과의 차이 (SSOT 보정)

§3.1 발췌 스니펫은 **길이·가독성**을 위해 단순화되어 있으며, 프로덕션 `App.tsx`·모달 prop 계약과 **아래**가 달라질 수 있습니다. 구현·리뷰 시 **본 절을 레포 정본**으로 두고, 스니펫은 **union·`ActiveModalRenderer`·어댑터·Rule 10 의도**만 참조합니다.

- **경로:** 시뮬은 `./hooks/usePortfolioUiCommands` 로 적을 수 있으나, 실제 어댑터는 **`src/hooks/usePortfolioUiCommands.ts`** 에 두고 루트 **`App.tsx`** 에서 **`./src/hooks/usePortfolioUiCommands`** 로 import 하는 형태가 될 수 있습니다(`hooks/` 루트와 `src/hooks/` 공존 구조와의 정합).
- **`onSave` vs `saveCommand` / `closeCommand`:** 시뮬은 모달에 `saveCommand`·`closeCommand` 를 직접 넘기지만, **기존 모달·위저드는 `onSave` 등 레거시 시그니처**를 유지할 수 있습니다. 프로덕션에서는 **`ActiveModalRenderer`(또는 동등 계층)에서 `portfolioCommands.*.run` 을 래핑해 `onSave` 등으로 전달**하는 것이 허용됩니다. 모달 쪽을 command 계약으로 통일하는 후속 Step이 있으면 **본 절·컴포넌트 시그니처·§2.1**을 함께 개정합니다.
- **B3 타입·뮤텍스 노출:** `PortfolioUiCommands`의 `isExecuting` 을 **B3 `useMutexAction` 과 정직히 연결**하려면, **`usePortfolioUiCommands` 단일 어댑터** 외에 **`hooks/portfolioTypes.ts`·`hooks/usePortfolioMutations.ts` 등에서 `run` + `isExecuting` 을 담은 command 객체 노출**이 필요할 수 있습니다. **소비자 관점 계약은 §2.1과 동일**하게 두고, 조립·파일 위치는 레포 구조에 맞게 둡니다.

### Mental Compile 결과

- Rule 2: inline async JSX 감소
- Rule 3: fallback 문구도 SSOT
- Rule 6: exhaustive switch + 스니펫 내 식별자 정의 완결 + **모달 컴포넌트 명시 import** + **`React.lazy` 없을 때 가짜 `Suspense` 비채택**
- Rule 7: 미선언 변수 제거, `StrategyCreator` 필수 prop 연결(`currentPortfolioCount` / `maxPortfolios`)
- Rule 10: **`activePortfolios`/`closedPortfolios` 배열 참조 `useMemo`** + 모달 오픈 **`useCallback`** + 스텁 **`noop`/`noopAsync`** + **`tabContentProps`식 가짜 `useMemo` 비채택**
- Rule 11: command contract에 `isExecuting` 포함

---

## 3.2 `Dashboard.tsx`: 거대 카드 컴포넌트 해체

### 현재 문제

> **(시뮬레이션 시점 기록)** B4 착수 전 리스크입니다. 실제 레포 반영 여부는 아래 **「Step 3.2 상세 계획 통합 및 레포 구현 정합」** 표를 따릅니다.

- `Dashboard.tsx` 내부 `PortfolioCard`가 fetch, 파생 계산, ref 관리, JSX 렌더를 모두 수행합니다.
- `onDailyExecutionBlockRef.current = onDailyExecutionBlock`가 렌더 바디에서 실행됩니다.
- `lang === 'ko' ? ... : ...` 문자열이 JSX 전역에 산재합니다.
- 클릭 가능한 `div`가 A11y 속성 없이 존재합니다.
- `vrSettings!` non-null assertion이 남아 있습니다.
- `HoverTip`, `VR_DASHBOARD_HINT`처럼 실제 사용되지 않는 import가 보입니다.
- `checkPartial(config: any)` 같은 helper-local `any`가 남아 있습니다.
- MA 실행 텍스트가 중첩 삼항으로 읽기 어렵습니다.

### After 시뮬레이션

```tsx
import React, { useCallback, useMemo } from 'react';
import { Camera, Zap } from 'lucide-react';
import type { AppLang, Portfolio } from '../types';
import type { DashboardMessageSet } from '../constants/messages/dashboardMessages';
import { DASHBOARD_MESSAGES } from '../constants/messages/dashboardMessages';
import {
  useMultiSplitExecution,
  type MultiSplitHookResult,
} from '../hooks/useMultiSplitExecution';
import {
  useNoStopMultiSplitExecution,
  type NoStopMultiSplitHookResult,
} from '../hooks/useNoStopMultiSplitExecution';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';

type PortfolioStrategyKind =
  | 'vr_band'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'ma_interval';

function getPortfolioStrategyKind(portfolio: Portfolio): PortfolioStrategyKind {
  if (portfolio.strategy.vrBand != null) {
    return 'vr_band';
  }
  if (portfolio.strategy.multiSplit != null) {
    return 'multi_split';
  }
  if (portfolio.strategy.noStopMultiSplit != null) {
    return 'no_stop_multi_split';
  }
  return 'ma_interval';
}

/**
 * `buildPortfolioExecutionSummary`는 훅 반환 **통객체**를 인자로 받지 않는다(Rule 6·10).
 * 카드 컨테이너가 구조 분해한 필드만 넘기므로, `useMemo` deps와 조립 입력이 **동일 집합**으로 맞춰지기 쉽다.
 */
interface PortfolioExecutionSummaryInput {
  lang: AppLang;
  portfolio: Portfolio;
  strategyKind: PortfolioStrategyKind;
  copy: DashboardMessageSet;
  vrSettings: Portfolio['strategy']['vrBand'] | null;
  multiSplitCurrentRound: number;
  multiSplitPhase: MultiSplitHookResult['multiSplitPhase'];
  multiSplitIsInQuarterMode: boolean;
  multiSplitIsInQuarterModeByT: boolean;
  multiSplitInsufficientAmount: boolean;
  multiSplitQuarterStopLossData: MultiSplitHookResult['quarterStopLossData'];
  multiSplitExecutionData: MultiSplitHookResult['multiSplitExecutionData'];
  noStopCurrentRound: number;
  noStopExecutionData: NoStopMultiSplitHookResult['executionData'];
}

interface PortfolioCardContainerProps {
  lang: AppLang;
  portfolio: Portfolio;
  /** 부모에서 `useCallback`으로 고정한 `(id) => …` — map마다 `() => fn(p.id)` 금지(Rule 10). */
  onOpenDetails: (portfolioId: string) => void;
  onOpenExecution: (portfolioId: string) => void;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => void | Promise<void>;
  onOpenAIImage: (portfolioId: string) => void;
}

function PortfolioCardContainer({
  lang,
  portfolio,
  onOpenDetails,
  onOpenExecution,
  onOpenQuickInput,
  onOpenAIImage,
}: PortfolioCardContainerProps): React.ReactElement {
  const copy = DASHBOARD_MESSAGES[lang];
  const strategyKind = getPortfolioStrategyKind(portfolio);
  const vrSettings = portfolio.strategy.vrBand ?? null;

  const multiSplitVm = useMultiSplitExecution(portfolio, lang);
  const noStopMultiSplitVm = useNoStopMultiSplitExecution(portfolio, lang);

  const multiSplitCurrentRound = multiSplitVm.currentRound;
  const multiSplitPhase = multiSplitVm.multiSplitPhase;
  const multiSplitIsInQuarterMode = multiSplitVm.isInQuarterMode;
  const multiSplitIsInQuarterModeByT = multiSplitVm.isInQuarterModeByT;
  const multiSplitInsufficientAmount = multiSplitVm.multiSplitInsufficientAmount;
  const multiSplitQuarterStopLossData = multiSplitVm.quarterStopLossData;
  const multiSplitExecutionData = multiSplitVm.multiSplitExecutionData;

  const noStopCurrentRound = noStopMultiSplitVm.currentRound;
  const noStopExecutionData = noStopMultiSplitVm.executionData;

  // Rule 6·10: 콜백 내부에서 읽는 외부 값과 deps 배열이 1:1(exhaustive-deps).
  // 지문 문자열로 deps를 “축약”하면 Stale Closure가 된다.
  const executionSummary = useMemo(
    () =>
      buildPortfolioExecutionSummary({
        lang,
        portfolio,
        strategyKind,
        copy,
        vrSettings,
        multiSplitCurrentRound,
        multiSplitPhase,
        multiSplitIsInQuarterMode,
        multiSplitIsInQuarterModeByT,
        multiSplitInsufficientAmount,
        multiSplitQuarterStopLossData,
        multiSplitExecutionData,
        noStopCurrentRound,
        noStopExecutionData,
      }),
    [
      lang,
      portfolio,
      strategyKind,
      copy,
      vrSettings,
      multiSplitCurrentRound,
      multiSplitPhase,
      multiSplitIsInQuarterMode,
      multiSplitIsInQuarterModeByT,
      multiSplitInsufficientAmount,
      multiSplitQuarterStopLossData,
      multiSplitExecutionData,
      noStopCurrentRound,
      noStopExecutionData,
    ],
  );

  const portfolioId = portfolio.id;

  return (
    <PortfolioCardView
      portfolioId={portfolioId}
      portfolioName={portfolio.name}
      strategyName={copy.strategyName[strategyKind]}
      executionSummary={executionSummary}
      onOpenDetails={onOpenDetails}
      onOpenExecution={onOpenExecution}
      onOpenQuickInput={onOpenQuickInput}
      onOpenAIImage={onOpenAIImage}
      detailsAriaLabel={copy.openExecutionAria(portfolio.name)}
      aiTradeRecognitionAria={copy.aiTradeRecognitionAria}
      quickInputAria={copy.quickInputAria}
    />
  );
}

const PortfolioCardView = React.memo(function PortfolioCardView({
  portfolioId,
  portfolioName,
  strategyName,
  executionSummary,
  onOpenDetails,
  onOpenExecution,
  onOpenQuickInput,
  onOpenAIImage,
  detailsAriaLabel,
  aiTradeRecognitionAria,
  quickInputAria,
}: {
  portfolioId: string;
  portfolioName: string;
  strategyName: string;
  executionSummary: React.ReactNode;
  onOpenDetails: (portfolioId: string) => void;
  onOpenExecution: (portfolioId: string) => void;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => void | Promise<void>;
  onOpenAIImage: (portfolioId: string) => void;
  detailsAriaLabel: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
}): React.ReactElement {
  const handleOpenDetails = useCallback(() => {
    onOpenDetails(portfolioId);
  }, [onOpenDetails, portfolioId]);

  const handleOpenExecution = useCallback(() => {
    onOpenExecution(portfolioId);
  }, [onOpenExecution, portfolioId]);

  const handleOpenQuickInput = useCallback(() => {
    void onOpenQuickInput(portfolioId);
  }, [onOpenQuickInput, portfolioId]);

  const handleOpenAIImage = useCallback(() => {
    onOpenAIImage(portfolioId);
  }, [onOpenAIImage, portfolioId]);

  return (
    <div className="glass light-card-depth rounded-[2.5rem] p-7">
      <div
        role="button"
        tabIndex={0}
        aria-label={detailsAriaLabel}
        onClick={handleOpenDetails}
        onKeyDown={(event) => handlePressEnterOrSpace(event, handleOpenDetails)}
        className="cursor-pointer"
      >
        <h3 className="text-xl font-black">{portfolioName}</h3>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {strategyName}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_50px] gap-4">
        <button
          type="button"
          onClick={handleOpenAIImage}
          aria-label={aiTradeRecognitionAria}
          className="rounded-[1.25rem]"
        >
          <Camera size={28} />
        </button>

        <button
          type="button"
          onClick={handleOpenQuickInput}
          aria-label={quickInputAria}
          className="rounded-[1.25rem]"
        >
          <Zap size={20} />
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={detailsAriaLabel}
        onClick={handleOpenExecution}
        onKeyDown={(event) => handlePressEnterOrSpace(event, handleOpenExecution)}
        className="rounded-[1.5rem] border border-blue-100 bg-blue-50/50 p-5"
      >
        {executionSummary}
      </div>
    </div>
  );
});
PortfolioCardView.displayName = 'PortfolioCardView';

function buildPortfolioExecutionSummary(
  params: PortfolioExecutionSummaryInput,
): React.ReactNode {
  const {
    lang,
    strategyKind,
    copy,
    portfolio,
    vrSettings,
    multiSplitCurrentRound,
    multiSplitPhase,
    multiSplitIsInQuarterMode,
    multiSplitIsInQuarterModeByT,
    multiSplitInsufficientAmount,
    multiSplitQuarterStopLossData,
    multiSplitExecutionData,
    noStopCurrentRound,
    noStopExecutionData,
  } = params;

  switch (strategyKind) {
    case 'vr_band':
      if (vrSettings == null) {
        return <span>{copy.execution.calculating}</span>;
      }
      return (
        <VrPortfolioSummary
          vrSettings={vrSettings}
          vrSnapshot={portfolio.vrSnapshot}
          lang={lang}
          hasEverBought={portfolio.trades.some((trade) => trade.type === 'buy')}
        />
      );
    case 'multi_split': {
      const multiSplitVm: MultiSplitHookResult = {
        currentRound: multiSplitCurrentRound,
        multiSplitPhase,
        isInQuarterMode: multiSplitIsInQuarterMode,
        isInQuarterModeByT: multiSplitIsInQuarterModeByT,
        multiSplitInsufficientAmount,
        quarterStopLossData: multiSplitQuarterStopLossData,
        multiSplitExecutionData,
      };
      if (multiSplitVm.multiSplitInsufficientAmount) {
        return <span>{copy.execution.insufficientAmount}</span>;
      }
      return renderMultiSplitExecutionSummary(copy, multiSplitVm);
    }
    case 'no_stop_multi_split': {
      const noStopVm: NoStopMultiSplitHookResult = {
        currentRound: noStopCurrentRound,
        executionData: noStopExecutionData,
      };
      return renderNoStopExecutionSummary(copy, noStopVm);
    }
    case 'ma_interval':
      return renderMaExecutionSummary(copy, portfolio);
    default: {
      const exhaustiveCheck: never = strategyKind;
      return exhaustiveCheck;
    }
  }
}
```

핵심:

- `PortfolioCardContainer`는 hook 소비와 view-model 조립까지만 담당합니다.
- `handlePressEnterOrSpace`는 **§2.3 `src/utils/a11yHelpers.ts`**에서 import합니다(루트 `components/` 기준 **`../src/utils/a11yHelpers`**).
- **`executionSummary`는 `ReactNode` 참조가 매 렌더 바뀌면 `React.memo`된 `PortfolioCardView`의 얕은 비교가 항상 실패**하므로, 연산 비용 때문이 아니라 **참조 안정성**을 위해 컨테이너에서만 **`useMemo`로 감싼다**(Rule 10). 이는 “가짜 메모이제이션”이 아니라 **메모된 View와 짝을 맞추는 계약**이다. **동시에 `eslint-plugin-react-hooks` exhaustive-deps와 동일한 기준으로**, `useMemo` 본문이 읽는 **모든** 외부 값(부울·숫자·`portfolio`·중첩 데이터 참조 포함)을 **deps에 빠짐없이** 둔다 — **본문에서는 `multiSplitVm` 통객체를 직접 닫지 않고**, 컨테이너에서 필드를 **구조 분해한 뒤 `PortfolioExecutionSummaryInput`으로만** `buildPortfolioExecutionSummary`에 전달한다. **지문 문자열로 deps를 축약하면 Stale Closure**가 되므로 비채택이다. `quarterStopLossData` / `executionData`처럼 객체 참조가 바뀔 때마다 메모가 무효화되는 것은 **의도된 정합성**이며, 참조 안정화는 **B3 훅 내부 `useMemo`** 책임으로 둔다.
- **`PortfolioCardView`는 `React.memo`로 감싸고 `displayName`을 둔다.** 문서의 “2단 구조” 주장과 구현이 일치해야 한다.
- 읽는 곳 없이 유지되던 **`dailyExecutionBlockRef` / `useLayoutEffect` / `onDailyExecutionBlock` prop**은 데드 코드로 **전면 소각**합니다(Rule 6).
- `Dashboard` 리스트 레벨에서 `portfolio` 객체를 완전히 primitive로 해체하지는 않습니다. 현재 카드가 전략/거래/알람/실행 view-model을 넓게 소비하므로, **컨테이너가 `portfolio`를 받고 메모된 view에만 primitive를 내리는 2단 구조**가 최소 변경입니다.
- `renderMaExecutionSummary`, `renderMultiSplitExecutionSummary` 같은 helper로 **중첩 삼항 제거**가 가능합니다.
- `vrSettings!`를 제거하고 `vrSettings == null` 가드로 닫습니다.
- 클릭 `div`는 모두 A11y 계약을 갖습니다.
- dead import와 helper-local `any`는 같은 단계에서 소각합니다.

### 추가 고정 규칙

- `DashboardHeader`의 상단 KPI는 config array로 렌더링합니다.
- `PortfolioCardActions`에 넘기는 prop은 최대한 primitive로 유지합니다.
- `determineActiveSection`, `calculateYield`, `fetchStockPrices` 조립은 UI 전용 hook으로 밀되, JSX 파일 본문에서 직접 섞지 않습니다.
- 리스트 map에서 `onOpenExecution={() => handleOpenExecution(p.id)}`처럼 **카드마다 새 함수 참조를 찍지 않는다.** 부모는 `handleOpenExecution`을 `useCallback`으로 고정하고, 카드에는 `portfolioId`와 `(id) => void` 시그니처만 넘긴다.
- **비채택:** `Dashboard`가 최상위 map 단계에서 `PortfolioCard`에 필요한 모든 필드를 primitive로 전개하는 방식. 현재 로컬 구조에서는 prop 폭증과 결합도 증가가 더 커서, B4 1차 최소 변경 원칙과 맞지 않습니다.

### Mental Compile 결과

- Rule 2: render-phase ref mutation 제거 + **`executionSummary`는 연산 경량성이 아니라 `React.memo` View와의 참조 안정성을 위해 컨테이너에서만 `useMemo`**
- Rule 3: strategy name / status text SSoT화
- Rule 4: clickable surface A11y 충족 + **`handlePressEnterOrSpace` 명시 import**
- Rule 6: container/view SRP 분리 + **미사용 ref·effect·prop 소각**
- Rule 7: `!` 제거
- Rule 10: `(portfolioId) => void` + 카드 내부 `useCallback`로 map 인라인 클로저 제거 + **`PortfolioCardView` `React.memo` + `displayName`** + **`executionSummary` `useMemo`는 exhaustive-deps — `PortfolioExecutionSummaryInput` 필드와 deps 배열 1:1**

### 가상 컴파일 3회 검증 (`Dashboard` `executionSummary`)

1. **Exhaustive deps:** `useMemo` 본문이 읽는 식별자 집합과 deps 배열 항목을 **한 줄씩 대조**했을 때 누락이 없음(`multiSplitVm` 직접 캡처 없음 → 거짓 deps 불가).
2. **Stale 방지:** 가격·라운드 변화가 `multiSplitExecutionData` / `quarterStopLossData` / `noStopExecutionData` 참조 또는 내장 필드를 바꾸면 **동일 필드가 deps에 있으므로** 요약이 갱신됨(플래그 하나만 deps에 두고 본문에서 통객체를 쓰는 **치명 패턴 제거**).
3. **조립 계약:** `buildPortfolioExecutionSummary`는 **`PortfolioExecutionSummaryInput`만** 받고, `renderMultiSplitExecutionSummary`용 `MultiSplitHookResult`는 **함수 내부에서 명시 필드로 재조립** — API 경계에서 통객체 유입을 차단해 이후 리뷰어가 deps를 추적하기 쉬움.

### Step 3.2 상세 계획 통합 및 레포 구현 정합

> **문서 이력:** `docs2/PHASE_B4_STEP_3_2_DASHBOARD_DECOMPOSITION_SIMULATION.md`의 로컬 경로 번역 규칙, 변경 허용 2파일 고정, 비목표(예: `PortfolioCardActions`·`VrPortfolioSummary` 비변경), `dashboardMessages.ts` 스키마·SSoT 원칙, `buildPortfolioExecutionSummary` / `render*Summary` 분리, MA `try`/`catch`, 통화 표기 통일 등 **전 절차**를 본 절로 통합했습니다. 전용 파일은 삭제되었습니다.

#### 로컬 경로(현재 워크스페이스)

| 항목 | 실제 경로 |
|------|-----------|
| Dashboard 메시지 SSoT | `constants/messages/dashboardMessages.ts` — `DashboardMessageSet`, `DashboardStrategyKind`, `DASHBOARD_MESSAGES`, **`getDashboardMessages(lang)`** |
| Dashboard UI | `components/Dashboard.tsx` |
| A11y 헬퍼 | `components/Dashboard.tsx` → `import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers'` |
| VR 카드/주문표 문구 | `constants/vrMessages.ts`(`VR_SUMMARY` 등) — VR 도메인 SSOT 유지(전용 계획서와 동일) |

`src/components/`, `src/constants/` 선행 브랜치에서는 위를 동일 파일명으로 `src/` 트리에 맞춰 **import 경로만 치환**하면 됩니다.

#### 전용 계획서에서 이관한 고정 원칙(요약)

1. **1차 변경 범위:** `dashboardMessages.ts` + `Dashboard.tsx` 중심; `PortfolioCardActions`, `VrPortfolioSummary`, multi-split/no-stop 훅 **본문 로직**은 당시 계획대로 분리하지 않음.
2. **구조:** `PortfolioCardContainer`(훅·파생·`useMemo`로 `executionSummary`) + `PortfolioCardView`(`React.memo`, `displayName`, 안정 콜백).
3. **제거·보강:** 렌더 단계 ref 변이, `vrSettings!`, helper-local `any`, 미사용 import, 리스트 map 인라인 `() => onOpen(p.id)`, 클릭 `div` A11y 누락.
4. **실행 요약:** `buildPortfolioExecutionSummary` + 전략별 `render*Summary`; Multi-Split / No-Stop 표기는 `formatUsd`·`formatShareQuantity` 등으로 통일하라는 전용 문구는 **레포 내 실제 헬퍼명**과 대조해 유지.

#### 레포와의 정합(스팟 체크)

| 전용 계획서 항목 | 현재 레포 |
|------------------|-----------|
| Container / View 분리, `buildPortfolioExecutionSummary` | `components/Dashboard.tsx`에 `PortfolioCardContainer`, `PortfolioCardView`, `buildPortfolioExecutionSummary` 존재 |
| `executionSummary` `useMemo` + exhaustive deps | 컨테이너에서 구현 |
| `HoverTip`, `checkPartial`, `onDailyExecutionBlockRef` 류 | 해당 파일에서 **미검출** |
| `vrSettings` null 가드 | `?? null` 등으로 non-null assertion 제거 방향과 정합 |
| 카드·실행 요약 문구 typed SSOT | `getDashboardMessages` + `DashboardMessageSet` |
| MA 등 비동기 경로 관측 | `runAnalysis` / `updateMetrics` 등에 `try`/`catch` 및 로깅 패턴 존재(세부는 소스) |

#### 본 문서 §3.2 After 스니펫 vs 산 코드

- **A11y import:** 스니펫은 레포와 같이 **`../src/utils/a11yHelpers`**를 쓰는 것이 맞습니다(위 블록 반영됨).
- **메시지:** 스니펫의 `DASHBOARD_MESSAGES[lang]`는 **`getDashboardMessages(lang)`**과 동등한 접근으로 바꿔도 됩니다.

---

## 3.3 `AuthModals.tsx` + `AuthModalCoordinator.tsx`

### 현재 문제

> **(시뮬레이션 시점 기록)** B4 착수 전 리스크입니다. 실제 레포 반영 여부는 아래 **「Step 3.3 상세 계획 통합 및 레포 구현 정합」** 표를 따릅니다.

- `AuthModals.tsx`가 `supabase`를 직접 import해서 인증 I/O까지 들고 있습니다.
- `catch (err: any)`가 존재합니다.
- `lang === 'ko' ? ... : ...` 문구가 인증 로직 전반에 산재합니다.
- type별 view props를 중첩 삼항으로 빌드합니다.
- 일부 dialog 메시지는 `?.`로 읽다가 없으면 `null`로 빠져 조용히 경로가 닫힙니다.
- 시뮬레이션 초안에 **`AUTH_VIEW_MAP` + `<ViewComponent {...viewProps} />`** 같은 **Union props spread**가 있어 Rule 7·10에 취약했다.
- `useAuthModalController` 등 **미선언 심볼**이 스니펫에 남아 Mental Compile이 불가능했다.

### After 시뮬레이션

```tsx
import React from 'react';
import type { AppLang } from '../types';
import type { AuthModalType } from '../auth/authViewTypes';
import type { ProfileViewProps } from '../auth/authViewTypes';
import LoginView from '../auth/LoginView';
import SignupView from '../auth/SignupView';
import ProfileView from '../auth/ProfileView';
import ResetPasswordView from '../auth/ResetPasswordView';
import ChangePasswordView from '../auth/ChangePasswordView';

interface SignedInUser {
  id: string;
  email: string;
}

interface SignupDraft {
  email: string;
  password: string;
}

interface ChangePasswordDraft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface AuthModalMessageSet {
  title: Record<AuthModalType, string>;
  passwordRule: {
    minLength: string;
    uppercase: string;
    lowercase: string;
    number: string;
    special: string;
  };
  error: {
    missingPasswordFields: string;
    passwordMismatch: string;
    authenticationFailed: string;
    signupFailed: string;
    resetPasswordSent: string;
  };
}

export const AUTH_MODAL_MESSAGES: Record<AppLang, AuthModalMessageSet> = {
  ko: {
    title: {
      login: '로그인',
      signup: '회원가입',
      profile: '사용자 프로필',
      'reset-password': '비밀번호 재설정',
      'change-password': '비밀번호 변경',
    },
    passwordRule: {
      minLength: '비밀번호는 최소 8자 이상이어야 합니다.',
      uppercase: '대문자를 1개 이상 포함해야 합니다.',
      lowercase: '소문자를 1개 이상 포함해야 합니다.',
      number: '숫자를 1개 이상 포함해야 합니다.',
      special: '특수문자를 1개 이상 포함해야 합니다.',
    },
    error: {
      missingPasswordFields: '모든 비밀번호 입력란을 채워주세요.',
      passwordMismatch: '비밀번호가 일치하지 않습니다.',
      authenticationFailed: '인증 중 오류가 발생했습니다.',
      signupFailed: '회원가입에 실패했습니다.',
      resetPasswordSent: '비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해주세요.',
    },
  },
  en: {
    title: {
      login: 'Login',
      signup: 'Sign Up',
      profile: 'User Profile',
      'reset-password': 'Reset Password',
      'change-password': 'Change Password',
    },
    passwordRule: {
      minLength: 'Password must be at least 8 characters.',
      uppercase: 'Must include at least 1 uppercase letter.',
      lowercase: 'Must include at least 1 lowercase letter.',
      number: 'Must include at least 1 number.',
      special: 'Must include at least 1 special character.',
    },
    error: {
      missingPasswordFields: 'Please fill in all password fields.',
      passwordMismatch: 'Passwords do not match.',
      authenticationFailed: 'Authentication error occurred.',
      signupFailed: 'Sign up failed.',
      resetPasswordSent: 'Password reset email sent. Please check your inbox.',
    },
  },
};

interface AuthCommands {
  signIn: UiMutationCommand<[email: string, password: string], SignedInUser>;
  signUp: UiMutationCommand<[draft: SignupDraft], SignedInUser | null>;
  resetPassword: UiMutationCommand<[email: string], void>;
  changePassword: UiMutationCommand<[draft: ChangePasswordDraft], void>;
  deleteAccount: UiMutationCommand<[], void>;
  connectTelegram: UiMutationCommand<[], string>;
}

/**
 * B4: `hooks/useAuthModalController.ts`에서 동일 필드로 구현·export.
 * 시그니처는 **`(type, copy, commands, onClose, onSignedIn, onSwitchType)` 개별 인자**(options 객체 금지, Rule 10).
 * `getProfileViewProps`는 `ProfileViewProps` 단일 타입만 반환 → Union spread 회피.
 */
interface AuthModalController {
  isBusy: boolean;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  errorMessage: string | null;
  infoMessage: string | null;
  termsConsent: boolean;
  setTermsConsent: (value: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (value: boolean) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  currentUserEmail: string | null;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleDeleteAccount: () => Promise<void>;
  handleConnectTelegram: () => Promise<string>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: 'google' | 'github' | 'kakao') => Promise<void>;
  setError: (message: string | null) => void;
  isInTossApp: boolean;
  getProfileViewProps: () => ProfileViewProps;
}

declare function useAuthModalController(
  type: AuthModalType,
  copy: AuthModalMessageSet,
  commands: AuthCommands,
  onClose: () => void,
  onSignedIn: (user: SignedInUser) => Promise<void> | void,
  onSwitchType: (nextType: AuthModalType) => void,
): AuthModalController;

interface AuthModalLayoutProps {
  title: string;
  onClose: () => void;
  isBusy: boolean;
  children: React.ReactNode;
}

/** B4: `components/auth/AuthModalLayout.tsx` 등에서 구현·export(Rule 7: `Record<string, unknown>` 비채택). */
declare const AuthModalLayout: React.ComponentType<AuthModalLayoutProps>;

function AuthViewRenderer({
  type,
  lang,
  onClose,
  onSwitchType,
  onSignedIn,
  controller,
}: {
  type: AuthModalType;
  lang: AppLang;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  controller: AuthModalController;
}): React.ReactElement {
  switch (type) {
    case 'login':
      return (
        <LoginView
          type="login"
          lang={lang}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          termsConsent={controller.termsConsent}
          setTermsConsent={controller.setTermsConsent}
          privacyConsent={controller.privacyConsent}
          setPrivacyConsent={controller.setPrivacyConsent}
          setError={controller.setError}
          isInTossApp={controller.isInTossApp}
        />
      );
    case 'signup':
      return (
        <SignupView
          type="signup"
          lang={lang}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          termsConsent={controller.termsConsent}
          setTermsConsent={controller.setTermsConsent}
          privacyConsent={controller.privacyConsent}
          setPrivacyConsent={controller.setPrivacyConsent}
          setError={controller.setError}
          isInTossApp={controller.isInTossApp}
        />
      );
    case 'reset-password':
      return (
        <ResetPasswordView
          lang={lang}
          onClose={onClose}
          onSwitchType={onSwitchType}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={controller.isInTossApp}
        />
      );
    case 'change-password':
      return (
        <ChangePasswordView
          lang={lang}
          onSwitchType={onSwitchType}
          currentUserEmail={controller.currentUserEmail}
          currentPassword={controller.currentPassword}
          setCurrentPassword={controller.setCurrentPassword}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={controller.isInTossApp}
        />
      );
    case 'profile':
      return <ProfileView {...controller.getProfileViewProps()} />;
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}

function AuthModals({
  lang,
  type,
  commands,
  onClose,
  onSignedIn,
  onSwitchType,
}: {
  lang: AppLang;
  type: AuthModalType;
  commands: AuthCommands;
  onClose: () => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  onSwitchType: (nextType: AuthModalType) => void;
}): React.ReactElement {
  const copy = AUTH_MODAL_MESSAGES[lang];
  const controller = useAuthModalController(
    type,
    copy,
    commands,
    onClose,
    onSignedIn,
    onSwitchType,
  );

  return (
    <AuthModalLayout
      title={copy.title[type]}
      onClose={onClose}
      isBusy={controller.isBusy}
    >
      <AuthViewRenderer
        type={type}
        lang={lang}
        onClose={onClose}
        onSwitchType={onSwitchType}
        onSignedIn={onSignedIn}
        controller={controller}
      />
    </AuthModalLayout>
  );
}
```

핵심:

- `AuthModals`는 **view shell**만 담당합니다.
- 실제 인증 mutation은 `commands.*.run()`으로만 실행합니다.
- 기능별 typed copy를 사용하므로 `TDS_DIALOG_MESSAGES[lang]?.auth == null` 같은 silent failure 분기를 UI 본문에서 제거할 수 있습니다.
- **`AUTH_VIEW_MAP` / Union `viewProps` spread를 폐기**하고, `AuthViewRenderer`의 **`switch + never`**에서 뷰별로 **명시적 props**를 주입한다. `profile`만 필드가 많아 **`getProfileViewProps(): ProfileViewProps` 한 번의 스프레드**로 단일 구체 타입만 전달한다(Rule 7).
- `LoginView` 등은 `components/auth/authViewTypes.ts`의 계약을 따른다. 시뮬레이션의 `useAuthModalController`는 **`declare function`**으로 출처를 고정하고, B4에서 `hooks/useAuthModalController.ts`로 구현한다.
- Rule 10: 훅에 **`{ type, copy, ... }` 같은 매 렌더 새 객체**를 넘기지 않는다. **`useAuthModalController(type, copy, commands, onClose, onSignedIn, onSwitchType)`**처럼 **개별 인자**로 받아, 훅 내부 `useEffect`/`useCallback` 의존성이 **참조 흔들림 없이** 안정되게 한다.

### Mental Compile 결과 (§3.3 보강)

- Rule 6: 인증 뷰 렌더링 SRP — 맵+스프레드 제거
- Rule 7: 미선언 `AUTH_VIEW_MAP` 제거, `declare useAuthModalController`로 1:1 출처 표기 + **`AuthModalLayout` `declare`**
- Rule 10: Union 기반 동적 컴포넌트 안티패턴 제거 + **`useAuthModalController` 휘발성 options 객체 주입 금지(개별 인자)**

### `AuthModalCoordinator` 고정 역할

> **가상 컴파일:** 아래 스니펫은 위 §3.3 `AuthModals`·`SignedInUser`·`AuthCommands`·`AuthModalType`과 **동일 번들(같은 파일에 이어 붙임)**을 가정합니다. `AuthModals`는 재import하지 않습니다.

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../types';
import type { AuthModalType } from '../auth/authViewTypes';

/** §3.3 스니펫과 동일한 `SignedInUser` */
interface SignedInUser {
  id: string;
  email: string;
}

/** §2.1과 동일 계약(시뮬레이션 중복 허용) */
interface UiMutationCommand<Args extends unknown[], Result = void> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

interface SignupDraft {
  email: string;
  password: string;
}

interface ChangePasswordDraft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** §3.3 스니펫과 동일한 `AuthCommands` */
interface AuthCommands {
  signIn: UiMutationCommand<[email: string, password: string], SignedInUser>;
  signUp: UiMutationCommand<[draft: SignupDraft], SignedInUser | null>;
  resetPassword: UiMutationCommand<[email: string], void>;
  changePassword: UiMutationCommand<[draft: ChangePasswordDraft], void>;
  deleteAccount: UiMutationCommand<[], void>;
  connectTelegram: UiMutationCommand<[], string>;
}

interface AuthExitDialogCopy {
  title: string;
  body: string;
  confirm: string;
}

declare const AUTH_EXIT_DIALOG_MESSAGES: Record<
  AppLang,
  { authClose: AuthExitDialogCopy }
>;

interface TdsDialogActionLabels {
  confirm: string;
  cancel: string;
}

declare const TDS_DIALOG_MESSAGES: Record<AppLang, { actions: TdsDialogActionLabels }>;

interface UseAsyncTdsConfirmResult {
  open: (input: {
    title: string;
    body: string;
    confirmLabel: string;
    tone: string;
    action: () => Promise<void>;
  }) => void;
  dialogProps: Record<string, unknown>;
}

declare function useAsyncTdsConfirm(lang: AppLang): UseAsyncTdsConfirmResult;

declare function useTossApp(): { isInTossApp: boolean };

declare const TdsConfirmDialog: React.ComponentType<
  Record<string, unknown> & { labels: TdsDialogActionLabels }
>;

interface AuthModalCoordinatorProps {
  lang: AppLang;
  isOpen: boolean;
  type: AuthModalType;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void>;
  onCommitSignedIn: (user: SignedInUser) => Promise<void> | void;
  onFinishSignedInFlow: (
    user: SignedInUser,
    options: { shouldShowWelcome: boolean },
  ) => Promise<void> | void;
  authCommands: AuthCommands;
}

function AuthModalCoordinator({
  lang,
  isOpen,
  type,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  authCommands,
}: AuthModalCoordinatorProps): React.ReactElement | null {
  const { isInTossApp } = useTossApp();
  const exitDialog = useAsyncTdsConfirm(lang);

  const handleSignedIn = useCallback(
    async (user: SignedInUser) => {
      try {
        await Promise.resolve(onCommitSignedIn(user));
        await Promise.resolve(
          onFinishSignedInFlow(user, {
            shouldShowWelcome: isInTossApp && (type === 'login' || type === 'signup'),
          }),
        );
      } catch (error: unknown) {
        console.error('[AuthModalCoordinator] Sign-in flow execution failed', error);
        // B4: 토스트는 `showErrorToast`(tds-adapter) 계약에 맞춰 선택 적용 — 이중 피드백만 피할 것.
      }
    },
    [isInTossApp, onCommitSignedIn, onFinishSignedInFlow, type],
  );

  const handleRequestClose = useCallback(() => {
    if (!isInTossApp || type !== 'login') {
      onCloseAuthModal();
      return;
    }

    const exitCopy = AUTH_EXIT_DIALOG_MESSAGES[lang].authClose;
    exitDialog.open({
      title: exitCopy.title,
      body: exitCopy.body,
      confirmLabel: exitCopy.confirm,
      tone: 'primary',
      action: async () => {
        try {
          await Promise.resolve(onRequestMiniAppExit());
          onCloseAuthModal();
        } catch (error: unknown) {
          console.error('[AuthModalCoordinator] App exit request failed', error);
        }
      },
    });
  }, [exitDialog, isInTossApp, lang, onCloseAuthModal, onRequestMiniAppExit, type]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AuthModals
        lang={lang}
        type={type}
        commands={authCommands}
        onClose={handleRequestClose}
        onSignedIn={handleSignedIn}
      />
      <TdsConfirmDialog {...exitDialog.dialogProps} labels={TDS_DIALOG_MESSAGES[lang].actions} />
    </>
  );
}
```

핵심:

- coordinator는 `Toss exit`와 `post sign-in routing`만 담당합니다.
- `AuthModals`는 더 이상 `supabase`를 몰라도 됩니다.
- `useTossApp`, `useAsyncTdsConfirm`, `AUTH_EXIT_DIALOG_MESSAGES`, `TDS_DIALOG_MESSAGES`, `TdsConfirmDialog`는 **실제 구현 시 기존 Toss/TDS 모듈 경로로 import**하고, 시뮬레이션에서는 위 **`declare` / 최소 인터페이스**로 출처를 박는다(Rule 6·7). `any`는 쓰지 않는다.
- Rule 11: **`onCommitSignedIn` / `onFinishSignedInFlow` / `onRequestMiniAppExit`**처럼 **토스 웹 브리지·후속 라우팅을 태우는 비동기 경로는 `try`/`catch`로 감싼다.** 실패 시 **`console.error`로 관측 가능**하게 하고, Unhandled Promise Rejection을 UI 레이어에 남기지 않는다. `catch (error: unknown)`으로 두고, 사용자 피드백이 필요하면 **`showErrorToast`**는 B4 `tds-adapter` 계약과 **이중 토스트** 여부를 검토한 뒤만 추가한다.

### Mental Compile 결과

- Rule 3: 인증 문구 SSoT화
- Rule 6: view / coordinator / command 분리 + **coordinator 전용 심볼 `declare`·타입 고정**
- Rule 7: `any` 제거
- Rule 11: 인증/삭제/텔레그램 연결도 command 기반 mutex 연결 가능 + **`AuthModalCoordinator` 브리지·사인인 후속 흐름 `try`/`catch`(`unknown`)로 Unhandled Rejection 방어**

### Step 3.3 상세 계획 통합 및 레포 구현 정합

> **문서 이력:** `docs2/PHASE_B4_STEP_3_3_AUTH_MODALS_SIMULATION.md`의 Rule 7/10/11, `AUTH_MODAL_MESSAGES`·`authMessages.ts`, `useAuthModalController` 개별 인자·`noopSetBoolean`, `AuthViewRenderer` `switch`+`never`, coordinator `try`/`catch`·`isCommittingSignInRef`, `TDS_DIALOG_MESSAGES[lang].actions` 인덱싱 등 **전 절차**를 본 절로 통합했습니다. 전용 파일은 삭제되었습니다.

#### 로컬 경로(현재 워크스페이스)

| 항목 | 실제 경로 |
|------|-----------|
| 인증 모달 문구 SSoT | `constants/messages/authMessages.ts` — `getAuthModalMessages(lang)` 등 |
| 모달 셸 + 컨트롤러 훅 | `components/AuthModals.tsx` |
| 뷰 props 계약 | `components/auth/authViewTypes.ts` |
| 코디네이터 | `components/auth/AuthModalCoordinator.tsx` |
| 뷰 barrel | `components/auth/index.ts` — **`AUTH_VIEW_MAP` / `React.FC<any>` 없음** |
| A11y | `components/AuthModals.tsx` → `../src/utils/a11yHelpers` |

#### 레포와의 정합(스팟 체크)

| 전용 계획서 항목 | 현재 레포 |
|------------------|-----------|
| `AuthModals`가 `supabase` 직접 import | **`AuthModals.tsx`에 `supabase` 없음** — UI는 `commands.*.run`만 호출 |
| `commands` 조립 | **`AuthModalCoordinator`**가 `useMemo`로 `AuthCommands` 조립(`supabase`, `buildRedirectUrl` 등) |
| `catch (err: any)` / Union props spread | 지양; 명시 props·`unknown` 처리 방향 유지 |
| `noopSetBoolean`, 훅 개별 인자 | `AuthModals.tsx` 모듈 레벨 `noopSetBoolean` 및 확장 인자 시그니처 존재 |
| Rule 11 + 재진입 방지 | `AuthModalCoordinator`에 `try`/`catch` 및 **`isCommittingSignInRef`** |
| `TDS_DIALOG_MESSAGES` | `TDS_DIALOG_MESSAGES[lang].actions` 등 **Record 인덱싱**(맹목적 `?.` 회픘)과 정합 |

#### 본 문서 §3.3 After 스니펫 vs 산 코드

- **`AuthCommands`:** 시뮬레이션의 단순 `signUp → SignedInUser | null`과 달리, 실제는 **`SignupCommandResult`**(`verify_email` / `signed_in` 등)로 구체화됨.
- **코디네이터 props:** `shouldShowSignedInWelcome`, `onCompleteSignedInWelcome` 등 **앱 셸 계약**이 추가됨 — `App.tsx`에서 주입하는 전제 유지.
- **파일 경계:** 인증 I/O는 코디네이터에 두고 `AuthModals`는 셸·폼·렌더만 담당하는 **현재 구조**가 전용 계획서의 “셸은 supabase 모름”과 일치합니다.

---

## 3.4 `TradeExecutionModal.tsx` + `QuickInputModal.tsx`

**Step 3.4 통합:** `PHASE_B4_STEP_3_4_TRADE_MODALS_SIMULATION.md`의 세부 절차, Rule 1·3·11 적용, 아키텍트 리뷰(예산 매수 수량 O(1) 상한, QuickInput 파생값 평탄화), 비목표(App `onSave` 계약 유지)는 본 절에 흡수했으며 전용 파일은 삭제되었습니다.

### Step 3.4 상세 계획 통합 및 레포 구현 정합

| 계획서(구 Step 3.4) 항목 | 산 코드 정합 |
|---|---|
| `constants/messages/tradeMessages.ts` 신설 | `getTradeMessages(lang)`·`TradeMessageSet` — Trade/QuickInput 공통 문구 SSOT |
| `src/utils/tradeModalCalculations.ts` 신설 | `buildTradeFeePreview`, `buildTradeSettlementPreview`, `shouldWarnTradeBudgetExceeded`, `parseTradeNumericInput`, `formatUsd`, `createTradeId`(→ `crypto.randomUUID()`), `calculateBudgetBuyQuantity`(O(1) 상한 + 소수 보정), MOC·달력 보조 등 |
| 수수료 자동값 vs 수동 override 혼선 정리 | Trade 모달: preview + **명시적 `feeOverrideRaw`** 병행(유틸이 SSOT, UI는 override 입력 유지) |
| `Math.random()` trade id 제거 | `createTradeId()` |
| 네이티브 `Number('')` → 0 | `parseTradeNumericInput`로 입력 경계 처리(Trade/Quick 양쪽) |
| backdrop A11y | 오버레이는 **`<button type="button"` + `aria-label`**(시맨틱 버튼) |
| 매도 후보에 전량 매도 종목 잔류 | `calculateHoldings` 등으로 **보유 기반** 후보 구성(Trade 모달 쪽 로직) |
| Rule 11 더블 제출 | `isExecutingTradeRef` + `isSaving` + `await Promise.resolve(onSave(trade))` |
| 예산 Soft Warning, 토스트 미도입 | **인라인 경고 배너**(`budgetWarningTitle` / `budgetWarningMessage` 등 View primitive) |
| 상위 계약 | `App.tsx`에서 `onSave={(trade) => { void onSaveTrade(portfolio.id, trade); }}` 유지 — B4 Step 3.4는 **모달 내부 정리**로 scope 고정 |
| QuickInput `useEffect` 체인·티어링 | 최신 거래일 fetch·프리셋은 유지하되, **파생 `selectedStock`·플랫 분기**로 중첩 삼항 제거 방향과 정합 |
| View 계약(Rule 10) | `TradeExecutionModalView` / `QuickInputModalView`에 **문자열·불리언·핸들러** 위주로 주입; container가 계산·메시지 조립 |

#### 본 문서 구(舊) §3.4 After 스니펫 vs 산 코드

- **스니펫:** `saveCommand` + `calculateTradeFeePreview` + `TRADE_MODAL_MESSAGES` + `showWarningToast` 가정.
- **산 코드:** `onSave` 콜백, `tradeModalCalculations`의 `buildTradeFeePreview` 등, `getTradeMessages`, 예산은 **토스트가 아닌 인라인 경고**; 저장 뮤텍스는 **모달 내부 `useRef`**(B3 `saveCommand`와 별계 — 이중 `useMutexAction` 없음).

### 구현 전 베이스라인(역사적 참고)

리팩터 전에는 두 모달에 수수료·SEC·정산식이 흩어져 있고, `Math.random()` id·backdrop A11y 부재·예산 비교를 UI 곱셈으로 두는 등 Rule 1·4·11 위반이 있었습니다. 위 표가 그 문제를 어떻게 닫았는지 보여 줍니다.

### 설계 원칙 요약(구 Step 3.4 §2 축약)

- **Rule 3:** Trade 모달층 문구는 `tradeMessages.ts`만 사용(레거시 `I18N` 키는 점진 이관 대상으로 두되, 신규 스니펫은 `getTradeMessages` 기준).
- **Rule 1:** 금액 반올림·표시는 `tradeModalCalculations`의 `roundMoneyToPlaces` / `formatUsd` 등 단일 경로; 예산 경고는 `shouldWarnTradeBudgetExceeded`로 **정의 한곳**에서 판단.
- **Rule 11:** `disabled`/`isSaving`은 UI 힌트, **물리 락은 `useRef`**.
- **Rule 10:** View에는 포트폴리오 통객체 대신 **이미 포맷된 문자열·플래그·콜백**만 전달.

### Mental Compile 결과(구현 기준)

- Rule 1: EPSILON·`formatUsd`·예산 판단 유틸화로 인라인 금융 곱셈 제거.
- Rule 2: preview 결과 전체를 맹목 `useMemo`로 감싸지 않음; View는 primitive 위주.
- Rule 3: `getTradeMessages` SSOT.
- Rule 4: 오버레이 **시맨틱 버튼** + 라벨.
- Rule 6·7: 계산은 `tradeModalCalculations`, 문구는 `tradeMessages`, id는 `createTradeId`.
- Rule 10: Container/View 분리 + `handleSave` `useCallback`.
- Rule 11: `isExecutingTradeRef` + `try`/`finally`; 실패 시 **`onClose` 호출 안 함**(성공 경로에서만 닫기).

### `QuickInputModal` 정렬 원칙(유지)

별도 계산 엔진을 두지 않고 **동일 `tradeModalCalculations` + `getTradeMessages`**를 씁니다. 차이는 종목/날짜/수량 프리셋·MOC·예산 자동 매수 수량 등 **퀵 입력 전용 흐름**에 한정합니다.

---

## 3.5 `StrategyCreator.tsx`: 저장 파이프라인 유지 + 렌더링 분해

### 현재 판단

- 좋은 점:
  - `validatePortfolioSetupInput(...)` 경유
  - `roundMoney(...)` 사용
  - B3에서 뮤텍스가 걸린 **`saveCommand`**로 저장 경로 연결 가능(단, **UI에서 `useMutexAction`으로 한 번 더 감싸면 이중 잠금**)
- 남은 문제:
  - wizard JSX가 지나치게 큽니다.
  - step별 문구가 `lang === 'ko' ? ... : ...`로 매우 많이 산재합니다.
  - 일부 안내는 `alert(...)`에 의존합니다.
  - step/footer/title 계산이 파일 곳곳에 흩어져 있습니다.
  - 시뮬레이션 초안에 **`wizardState` / `commonCopy` 미선언** 등 Mental Compile 실패 요소가 있었다.

### After 시뮬레이션

B4 구현 시 **`buildPortfolioDraftFromWizardState`**, **`hasDuplicatedSectionStocks`**는 전역 `utils/`에 두지 않고, **`src/components/StrategyCreator/utils.ts`** 한 파일에 colocation합니다(타입·`safe*`·빌더 스니펫 SSoT는 **§3.6**). 엔트리 컴포넌트가 같은 폴더에 있으면 아래처럼 `./utils`로 import합니다(레포가 아직 `components/StrategyCreator.tsx` 단일 파일이면, B4에서 **`src/components/StrategyCreator/`** 또는 **`components/StrategyCreator/`** 폴더로 정리한 뒤 `utils.ts`를 두는 것을 권장합니다).

```tsx
import React, { useCallback, useState } from 'react';
import type { AppLang, Portfolio } from '../types';
import { COMMON_MESSAGES } from '../constants/messages/commonMessages';
import { validatePortfolioSetupInput } from '../utils/validatePortfolioSetupInput';
import {
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
} from './utils';

type StrategyType =
  | 'rsi_ma_interval'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';

type StrategyWizardScreen =
  | 'strategy_select'
  | 'ma_base'
  | 'ma_sections'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';

interface StrategyCreatorMessageSet {
  title: Record<StrategyWizardScreen, string>;
  next: string;
  save: string;
  startStrategy: string;
  portfolioLimitReached: (maxPortfolios: number) => string;
  duplicateSectionStocks: string;
}

declare const STRATEGY_CREATOR_MESSAGES: Record<AppLang, StrategyCreatorMessageSet>;

/**
 * 마법사 로컬 상태의 최소 시뮬레이션 타입.
 * B4 구현 시 실제 필드(MA 구간, multiSplit 파라미터 등)로 치환한다. `any` 사용 금지.
 */
type StrategyWizardDraftState = Record<string, unknown>;

interface StrategyCreatorLayoutProps {
  title: string;
  errorMessage: string | null;
  isSaving: boolean;
  primaryActionLabel: string;
  onClose: () => void;
  onPrimaryAction: () => void;
  children: React.ReactNode;
}

interface StrategyCreatorScreenRendererProps {
  lang: AppLang;
  screen: StrategyWizardScreen;
  wizardState: StrategyWizardDraftState;
  onSelectStrategy: (strategy: StrategyType) => void;
  onWizardStateChange: (state: StrategyWizardDraftState) => void;
}

/** B4: 레이아웃·스텝 렌더러는 전용 컴포넌트로 분리(Rule 7: 명시 props). */
declare const StrategyCreatorLayout: React.ComponentType<StrategyCreatorLayoutProps>;
declare const StrategyCreatorScreenRenderer: React.ComponentType<StrategyCreatorScreenRendererProps>;

function getStrategyWizardScreen(
  selectedStrategy: StrategyType | null,
  step: number,
): StrategyWizardScreen {
  if (selectedStrategy == null || step === 0) {
    return 'strategy_select';
  }

  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      return step === 1 ? 'ma_base' : 'ma_sections';
    case 'multi_split':
      return 'multi_split';
    case 'no_stop_multi_split':
      return 'no_stop_multi_split';
    case 'vr_band':
      return 'vr_band';
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

function StrategyCreator({
  lang,
  onClose,
  saveCommand,
  currentPortfolioCount,
  maxPortfolios,
}: {
  lang: AppLang;
  onClose: () => void;
  saveCommand: UiMutationCommand<[portfolio: Omit<Portfolio, 'id'>]>;
  currentPortfolioCount: number;
  maxPortfolios: number;
}): React.ReactElement {
  const copy = STRATEGY_CREATOR_MESSAGES[lang];
  const commonCopy = COMMON_MESSAGES[lang];
  const executePortfolioSave = saveCommand.run;
  const isPortfolioSaveExecuting = saveCommand.isExecuting;
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null);
  const [step, setStep] = useState(0);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [wizardState, setWizardState] = useState<StrategyWizardDraftState>({});

  const screen = getStrategyWizardScreen(selectedStrategy, step);

  const saveAction = useCallback(async (): Promise<void> => {
    if (selectedStrategy == null) {
      return;
    }

    if (isPortfolioSaveExecuting) {
      return;
    }

    if (currentPortfolioCount >= maxPortfolios) {
      setSaveErrorMessage(copy.portfolioLimitReached(maxPortfolios));
      return;
    }

    const draft = buildPortfolioDraftFromWizardState({
      selectedStrategy,
      wizardState,
    });

    const validationMessage = validatePortfolioSetupInput(
      draft.validationInput,
      commonCopy,
    );

    if (validationMessage != null) {
      setSaveErrorMessage(validationMessage);
      return;
    }

    if (
      selectedStrategy === 'rsi_ma_interval' &&
      hasDuplicatedSectionStocks(draft.portfolio.strategy)
    ) {
      setSaveErrorMessage(copy.duplicateSectionStocks);
      return;
    }

    setSaveErrorMessage(null);

    try {
      await executePortfolioSave(draft.portfolio);
      onClose();
    } catch (error) {
      console.error('[StrategyCreator] saveCommand.run failed', error);
    }
  }, [
    commonCopy,
    copy,
    currentPortfolioCount,
    executePortfolioSave,
    isPortfolioSaveExecuting,
    maxPortfolios,
    onClose,
    selectedStrategy,
    wizardState,
  ]);

  let primaryActionLabel = copy.next;
  if (screen === 'multi_split' || screen === 'no_stop_multi_split' || screen === 'vr_band') {
    primaryActionLabel = copy.startStrategy;
  } else if (screen === 'ma_sections') {
    primaryActionLabel = copy.save;
  }

  const handlePrimaryAction = useCallback(() => {
    if (screen === 'strategy_select' || screen === 'ma_base') {
      setStep((previous) => previous + 1);
      return;
    }
    void saveAction();
  }, [screen, saveAction]);

  return (
    <StrategyCreatorLayout
      title={copy.title[screen]}
      errorMessage={saveErrorMessage}
      isSaving={isPortfolioSaveExecuting}
      primaryActionLabel={primaryActionLabel}
      onClose={onClose}
      onPrimaryAction={handlePrimaryAction}
    >
      <StrategyCreatorScreenRenderer
        lang={lang}
        screen={screen}
        wizardState={wizardState}
        onSelectStrategy={setSelectedStrategy}
        onWizardStateChange={setWizardState}
      />
    </StrategyCreatorLayout>
  );
}
```

핵심:

- **현재 saveAction의 검증/저장 방향은 유지**합니다.
- 바꾸는 것은 "거대한 JSX 파일 구조"이지, 이미 맞게 잡힌 검증 파이프라인이 아닙니다.
- Rule 11·아키텍처: B3가 넘긴 **`saveCommand`에 이미 뮤텍스가 있다면 UI에서 `useMutexAction(saveAction)`으로 **이중 잠금(Double Mutex)**을 두지 않는다. **`isPortfolioSaveExecuting`(`saveCommand.isExecuting`)만** 소비하고, 진입 시 실행 중이면 즉시 return한다. **`saveAction`의 `useCallback` deps에는 `saveCommand` 통객체 대신 `executePortfolioSave`·`isPortfolioSaveExecuting`만** 넣는다. **`await executePortfolioSave`는 `try`/`catch`**로 감싸 Unhandled Rejection을 막고, 실패 시 **`onClose`를 호출하지 않는다**(토스트는 B3 계약에 위임).
- 마법사 전용 순수 로직(`buildPortfolioDraftFromWizardState`, `hasDuplicatedSectionStocks`)은 **`src/components/StrategyCreator/utils.ts`**에만 둡니다. 전역 `utils/`를 이 도메인으로 오염시키지 않습니다(colocation, Rule 5·6).
- **`StrategyCreatorLayout` / `StrategyCreatorScreenRenderer`**는 B4에서 분리 구현하거나, 시뮬레이션 **`declare`**로 출처를 박는다(Rule 6·7).
- `alert(...)`는 TDS alert 또는 inline error slot으로 치환합니다.
- wizard screen 계산은 `switch + never`로 닫아야 합니다.
- Rule 2: **`primaryActionLabel`은 O(1) 문자열 분기이므로 `useMemo` 없이 즉시 평가**합니다.
- Rule 10: **`StrategyCreatorLayout`에 인라인 `onPrimaryAction={() => …}` 금지** — **`handlePrimaryAction`을 `useCallback`으로 고정**해 `React.memo` 레이아웃의 불필요한 연쇄 리렌더를 막습니다.

### Mental Compile 결과

- Rule 1: 현재 `validatePortfolioSetupInput` 계약 유지
- Rule 2: **`primaryActionLabel` 맹목적 `useMemo` 비채택**
- Rule 3: 화면 문구 SSoT화
- Rule 6: save pipeline 유지, 렌더링만 분해 + **`STRATEGY_CREATOR_MESSAGES`는 constants 쪽 SSOT**, 초안·중복 검사 헬퍼는 **`src/components/StrategyCreator/utils.ts`에서 import**해 유령 심볼·전역 utils 오염을 동시에 제거 + **레이아웃·스크린 렌더러 `declare`**
- Rule 7: `commonCopy`·`wizardState`·`setWizardState` 선언 및 `StrategyWizardDraftState`로 `any` 회피
- Rule 8: footer label / step title 계산 중앙화
- Rule 10: **`handlePrimaryAction` `useCallback`**으로 무거운 레이아웃에 안정 콜백 전달 + **`saveAction` deps에서 `saveCommand` 통객체 비채택**
- Rule 11: **`saveCommand` 단일 뮤텍스 소비** + `run` **`try`/`catch`**(실패 시 모달 유지) — UI **`useMutexAction` 이중 래핑 금지**

---

## 3.6 B4 Step 1: Pure Utils Hardening (`StrategyCreator` colocation, **구현 완료**)

> **통합:** 독립 문서 `PHASE_B4_STEP1_PURE_UTILS_HARDENING_SIMULATION.md`의 내용을 이 절로 합쳤으며, 해당 파일은 삭제합니다.  
> **구현 SSoT:** `src/components/StrategyCreator/utils.ts` (아래 스니펫·체크리스트와 1:1).  
> **UI 소비:** 입력 경계 공용 헬퍼 **`safeTrim`**, **`safeNumber`**, **`safeBoolean`**는 **export**되어 있으며, Trade·기타 폼 UI(§3.4 등 후속 단계)에서 동일 모듈에서 import해 **네이티브 `Number()` 단독 파싱을 금지**하는 계약을 만족시킨다.  
> **동결(별도 파일):** `src/utils/a11yHelpers.ts`, `src/utils/financialCalculations.ts` — 본 Step 1 범위에서는 수정하지 않습니다.  
> **타입체크:** `tsconfig.json`에 `src/**/*.ts`, `src/**/*.tsx`가 포함되어 있어 `npm run typecheck:app`으로 본 유틸도 검증합니다.

### 0. 동결 범위

#### 0.1 이번 단계에서 유지하는 것

- `src/utils/a11yHelpers.ts`
- `src/utils/financialCalculations.ts`

위 두 파일은 현재 기준으로 다음 항목을 이미 충족하므로 **동결**합니다.

- `Number.EPSILON` 반올림
- Guard Clause
- 매직 넘버 상수화
- UI/React 책임 미포함

#### 0.2 Step 1에서 확정·구현된 파일

- **`src/components/StrategyCreator/utils.ts`** — partial draft 정규화, 빌더, **`safeTrim` / `safeNumber` / `safeBoolean` export**(후속 UI 단계 소비용).

당초 이 파일을 열어야 했던 동기는 다음 두 가지였고, **현재 구현으로 반영된 상태**입니다.

1. 드래프트를 “완성된 상태”처럼 가정한 **깊은 접근** 제거(`?.`·normalize·`safe*`).
2. **`trim()` 무방비 호출** 제거 — **`safeTrim`만** 사용.

**`as` 0건** 원칙을 유지하며, 미완성 draft가 들어와도 **WSOD**가 나지 않도록 런타임 경계를 닫았습니다.

---

### 1. 최종 판단

#### 1.1 동의하는 지적

- `buildValidationInput(...)`이 `wizardState.meta.name.trim()`처럼 **중첩 객체와 문자열 메서드를 직접 신뢰**하는 점
- `hasDuplicatedSectionStocks(...)`가 `strategy.ma1.stock.trim()`처럼 **불완전 입력을 고려하지 않는** 점
- `buildStrategyFromWizardState(...)` 계열이 현재 타입상 “완성된 마법사 상태”를 받도록 설계되어 있어, **실제 B4 분리 과정에서 partial draft를 받는 순간 위험해질 수 있는 점**

#### 1.2 그대로 받지 않는 지적

- 리뷰 예시의 `wizardState as Partial<...>` 패턴은 의도는 맞지만, **가능하면 `as` 자체도 피하는 쪽이 더 안전**합니다.
- 따라서 이번 시뮬레이션은 **`as`로 임시 캐스팅해 넘기는 방식이 아니라**,  
  **입력 타입 자체를 “부분 상태(Partial Draft)”로 재정의**하고, 내부에서 **정규화(normalize)** 하는 방식으로 설계합니다.

#### 1.3 외부 리뷰(교집합·`as`·데드코드) 회신

- **`as` 0건 원칙:** 본 SSoT는 `src/components/StrategyCreator/utils.ts`에 **`as` 키워드를 두지 않는다.** 머지 전 **`rg '\bas\b' src/components/StrategyCreator/utils.ts`**(또는 동일 경로)로 **0건**을 확인하고, 리뷰 본문의 줄번호 인용은 **반드시 로컬 트리와 대조**한다. (다른 브랜치·구버전과 혼동 시 “거짓 보고”로 간주될 수 있음.)
- **교집합 타입:** `StrategyWizardDraftInput`은 `meta?`·`maInterval?`·`multiSplit?` … 를 **한 객체에 옵셔널로 모은 입력 계약**이다. `wizardState.maInterval?.ma0Stock`처럼 **`?.`만으로 접근 가능하면 `as`는 금지**이며, 루트에 `ma0Stock`을 펼치지 않는 한 **`wizardState.ma0Stock` 같은 경로는 문서·구현 모두 비채택**(폼 상태를 평탄화할 별도 B4 단계가 있으면 그때 타입을 같이 개정).
- **외부에서 제시된 `buildValidationInput`의 `stocks` 배열 반환안은 비채택:** `PortfolioSetupValidationInput`은 **`constants/domain/financeRules.ts`의 `validatePortfolioSetupInput` 인자 형태**(`maShortPeriod`, `maLongPeriod`, `withdrawalAmount` 등)와 **1:1**로 맞춰야 한다. `stocks[]`는 검증기 계약을 깨므로 시뮬레이션에 넣지 않는다.
- **`createInitialVrSnapshot(params, feeRatePercent)` 이중 인자안은 비채택:** 실제 `utils/vrBandStrategy.ts`의 `createInitialVrSnapshot`은 **`(params: VrBandStrategyParams) => VrSnapshot` 단일 인자**다. 수수료 소수율은 **`vrParams.feeRate`**에 이미 반영된 뒤 호출한다.

즉, 이번 문서의 목표는 다음입니다.

- **`as` 제거**
- **deep access 전 `?.` + `??`**
- **문자열은 `safeTrim`으로만 정규화**
- **switch는 `never`로 닫기**
- **출력만 완성형 타입(`Portfolio`, `Strategy`)**

---

### 2. 리팩터링 목표

`src/components/StrategyCreator/utils.ts`는 아래 구조로 재편합니다.

1. **입력 타입은 “불완전 draft”를 인정**
2. **전략별 normalize helper**로 안전한 기본값 생성
3. `buildValidationInput(...)`은 **정규화된 값만** 반환
4. `buildStrategyFromWizardState(...)`는 **완성형 `Strategy`만** 조립
5. `hasDuplicatedSectionStocks(...)`는 **빈 문자열 제외 + 안전 trim**

핵심 원칙:

- **입력은 불완전할 수 있다.**
- **출력은 항상 완전해야 한다.**
- **크래시 대신 안전한 fallback**을 선택한다.

---

### 3. 제안 타입 계약

#### 3.1 입력은 Partial Draft로 재정의

```ts
import {
  STRATEGY_DEFAULTS,
  roundMoney,
} from '@/constants/domain/financeRules';
import { RATE_PRECISION_MULTIPLIER } from '@/constants/vrConstants';
import type {
  Portfolio,
  Strategy,
  VrBandStrategyParams,
  VrSnapshot,
} from '@/types';
import {
  createInitialVrSnapshot,
  sanitizeVrCycleWeeks,
} from '@/utils/vrBandStrategy';

const PERCENT_DENOMINATOR = 100;
const SECTION_TWO_SPLIT_COUNT = 1;
const DEFAULT_VR_REFERENCE_STOCK = 'TQQQ';
const ZERO_AMOUNT = 0;
const EMPTY_STRING = '';

export type StrategyType =
  | 'rsi_ma_interval'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';

export interface StrategyCreatorMetaDraftInput {
  name?: string;
  /** 폼/controlled input에서 `string`으로 올 수 있음 — `safeNumber`가 파싱 */
  dailyBuyAmount?: number | string;
  startDate?: string;
  /** 빈 문자열 `""`는 `Number("") === 0` 맹점이 있으므로 `safeNumber(..., STRATEGY_DEFAULTS.FEE_RATE_PERCENT)`로만 정규화 */
  feeRatePercent?: number | string;
}

export interface MaIntervalSectionDraftInput {
  stock?: string;
  rsiThreshold?: number;
  takePartialProfit?: boolean;
  partialProfitTargetPct?: number;
}

export interface MaIntervalWizardDraftInput {
  ma0Stock?: string;
  maAPeriod?: number;
  maBPeriod?: number;
  rsiEnabled?: boolean;
  alignmentEnabled?: boolean;
  ma1?: MaIntervalSectionDraftInput;
  ma2?: MaIntervalSectionDraftInput;
  ma3?: MaIntervalSectionDraftInput;
}

export interface MultiSplitWizardDraftInput {
  targetStock?: string;
  targetReturnRate?: number;
  totalSplitCount?: number;
}

export interface NoStopMultiSplitWizardDraftInput {
  targetStock?: string;
  lowLocBudgetRatio?: number;
  highLocPremiumPct?: number;
  takeProfitPct?: number;
  totalSplitCount?: number;
}

export interface VrBandWizardDraftInput {
  vrMode?: VrBandStrategyParams['vrMode'];
  initialCapital?: number;
  initialV?: number;
  minOrderQty?: number;
  bandUpperPct?: number;
  bandLowerPct?: number;
  g?: number;
  poolUsagePct?: number;
  deltaCash?: number;
  cycleWeeks?: number;
}

export interface StrategyWizardDraftInput {
  meta?: StrategyCreatorMetaDraftInput;
  maInterval?: MaIntervalWizardDraftInput;
  multiSplit?: MultiSplitWizardDraftInput;
  noStopMultiSplit?: NoStopMultiSplitWizardDraftInput;
  vrBand?: VrBandWizardDraftInput;
}

export interface PortfolioSetupValidationInput {
  name: string;
  dailyBuyAmount: number;
  feeRatePercent: number;
  maShortPeriod: number;
  maLongPeriod: number;
  withdrawalAmount: number;
}

export interface PortfolioDraftBuildResult {
  portfolio: Omit<Portfolio, 'id'>;
  validationInput: PortfolioSetupValidationInput;
}
```

핵심:

- 입력 타입은 **optional field가 있는 draft**로 선언합니다.
- 여기서부터 이미 “미완성 입력”을 타입 시스템에 정직하게 드러냅니다.
- **`as Partial<T>` 같은 사후 캐스팅이 필요 없어집니다.**

---

### 4. 안전 정규화 헬퍼

#### 4.1 문자열/숫자/불리언 정규화

```ts
export function safeTrim(val: unknown): string {
  return typeof val === 'string' ? val.trim() : EMPTY_STRING;
}

/**
 * Rule 1 & 6: `Number("") === 0` 맹점 — 빈 문자열은 유효한 숫자 0이 아니라 **미입력**으로 보고 `fallback`을 쓴다.
 * 공백만 있는 문자열은 `trim()` 후 빈 문자열과 동일하게 처리한다.
 */
export function safeNumber(val: unknown, fallback: number = ZERO_AMOUNT): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === EMPTY_STRING) {
      return fallback;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function safeBoolean(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

function toDecimalRate(percent: number): number {
  if (!Number.isFinite(percent)) {
    return ZERO_AMOUNT;
  }

  const rawRate = percent / PERCENT_DENOMINATOR;

  return (
    Math.round((rawRate + Number.EPSILON) * RATE_PRECISION_MULTIPLIER) /
    RATE_PRECISION_MULTIPLIER
  );
}
```

#### 4.2 Meta / Section normalize

```ts
// §3 스니펫과 동일 번들: `STRATEGY_DEFAULTS`·`roundMoney`는 `@/constants/domain/financeRules`에서 import됨을 가정

interface NormalizedMetaDraft {
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRatePercent: number;
}

interface NormalizedMaSectionDraft {
  stock: string;
  rsiThreshold: number;
  takePartialProfit: boolean;
  partialProfitTargetPct: number;
}

function normalizeMetaDraft(
  meta: StrategyCreatorMetaDraftInput | undefined,
): NormalizedMetaDraft {
  return {
    name: safeTrim(meta?.name),
    dailyBuyAmount: roundMoney(
      safeNumber(meta?.dailyBuyAmount, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
    ),
    startDate: safeTrim(meta?.startDate),
    // 수수료: 빈 문자열·미입력이 0%로 떨어지면 정산 오류 — 도메인 기본값을 명시 fallback으로 전달
    feeRatePercent: roundMoney(
      safeNumber(meta?.feeRatePercent, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
    ),
  };
}

function normalizeMaSectionDraft(
  section: MaIntervalSectionDraftInput | undefined,
): NormalizedMaSectionDraft {
  return {
    stock: safeTrim(section?.stock),
    rsiThreshold: safeNumber(section?.rsiThreshold),
    takePartialProfit: safeBoolean(section?.takePartialProfit),
    partialProfitTargetPct: safeNumber(section?.partialProfitTargetPct),
  };
}
```

핵심:

- `trim()`은 **직접 호출 금지**, `safeTrim()`만 사용합니다(모듈 **export** — 다른 UI에서도 동일 계약으로 import).
- 숫자·불리언도 normalize를 거쳐 **항상 반환값이 존재**하게 만듭니다. **`safeNumber`·`safeBoolean`도 export**하여 폼 입력 경계에서 재사용합니다.
- **`Number("") === 0`** 맹점: `safeNumber`는 `trim()` 후 빈 문자열이면 **`fallback`**으로 돌리고, 네이티브 `Number()`로 **입력 문자열을 단독 변환하지 않는다**(내부 파싱은 빈 제거 **이후**의 토큰에만 적용). **0%가 비즈니스적으로 틀린 필드**(예: 브로커 수수료 %)는 **`safeNumber(x, STRATEGY_DEFAULTS.FEE_RATE_PERCENT)`**처럼 **도메인 기본값을 두 번째 인자로 명시**한다.

---

### 5. `buildValidationInput` 시뮬레이션

#### 5.1 목표

- **deep access WSOD 차단**
- 전략별로 필요한 값만 읽되, **전부 fallback 보장**
- UI 검증기(`validatePortfolioSetupInput`)에 넘길 값은 항상 완성형

#### 5.2 스니펫

```ts
export function buildValidationInput(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
): PortfolioSetupValidationInput {
  const meta = normalizeMetaDraft(wizardState.meta);

  switch (selectedStrategy) {
    case 'rsi_ma_interval': {
      const maIntervalDraft = wizardState.maInterval;
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: safeNumber(maIntervalDraft?.maAPeriod),
        maLongPeriod: safeNumber(maIntervalDraft?.maBPeriod),
        withdrawalAmount: ZERO_AMOUNT,
      };
    }
    case 'multi_split':
    case 'no_stop_multi_split':
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: ZERO_AMOUNT,
      };
    case 'vr_band': {
      const vrBandDraft = wizardState.vrBand;
      const vrMode = vrBandDraft?.vrMode ?? 'lump_sum';
      const normalizedWithdrawalAmount =
        vrMode === 'withdraw'
          ? roundMoney(Math.abs(safeNumber(vrBandDraft?.deltaCash)))
          : ZERO_AMOUNT;

      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: normalizedWithdrawalAmount,
      };
    }
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}
```

핵심:

- `wizardState.meta`가 없어도 `normalizeMetaDraft(...)`가 안전하게 닫습니다.
- **검증 DTO와 실제 조립의 MA 기간 계약(Rule 6):** `multi_split`·`no_stop_multi_split`·`vr_band`는 사용자 `maInterval` 입력을 읽지 않고, 실제 `buildSingleStockStrategyBase(...)`가 쓰는 `STRATEGY_DEFAULTS.MA_SHORT_PERIOD` / `STRATEGY_DEFAULTS.MA_LONG_PERIOD`를 그대로 검증기에 전달합니다. 검증과 저장이 서로 다른 설명서를 보지 않게 합니다.
- `vrBandDraft?.vrMode ?? 'lump_sum'`으로 미완성 draft도 닫습니다.
- **VR 밴드·중앙 검증 계약(Rule 1·6):** `validatePortfolioSetupInput`의 `withdrawalAmount`는 **출금(`withdraw`) 모드일 때만** `deltaCash`를 `Math.abs`·`roundMoney`로 반영한다. **적립(`accumulate`)·거치(`lump_sum`)** 에서는 **`ZERO_AMOUNT`로 고정**하여 적립 금액이 출금 상한 검증에 오인되는 False Positive를 차단한다. (저장 조립은 `buildVrBandStrategy`에서 `vrMode`별 `deltaCash`를 유지.)
- **`as` 없이** 전부 추론 가능한 구조입니다.

---

### 6. `buildStrategyFromWizardState` 시뮬레이션

#### 6.1 목표

- `Strategy`는 **항상 완전한 shape**로 반환
- partial draft를 읽을 때는 **정규화 helper만** 사용
- 각 전략 case는 서로 격리

#### 6.2 MA 전략

```ts
interface StrategyBuildResult {
  strategy: Strategy;
  initialVrSnapshot: VrSnapshot | null;
}

function buildMaIntervalStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const maDraft = wizardState.maInterval;
  const ma1 = normalizeMaSectionDraft(maDraft?.ma1);
  const ma2 = normalizeMaSectionDraft(maDraft?.ma2);
  const ma3 = normalizeMaSectionDraft(maDraft?.ma3);
  const isRsiEnabled = safeBoolean(maDraft?.rsiEnabled);

  return {
    strategy: {
      ma0: {
        stock: safeTrim(maDraft?.ma0Stock),
        rsiEnabled: isRsiEnabled,
        alignmentEnabled: safeBoolean(maDraft?.alignmentEnabled),
        maAPeriod: safeNumber(maDraft?.maAPeriod),
        maBPeriod: safeNumber(maDraft?.maBPeriod),
      },
      ma1: {
        stock: ma1.stock,
        rsiThreshold: isRsiEnabled ? ma1.rsiThreshold : undefined,
        takePartialProfit: ma1.takePartialProfit,
        partialProfitTargetPct: ma1.takePartialProfit
          ? ma1.partialProfitTargetPct
          : undefined,
      },
      ma2: {
        stock: ma2.stock,
        splitCount: SECTION_TWO_SPLIT_COUNT,
        rsiThreshold: isRsiEnabled ? ma2.rsiThreshold : undefined,
        takePartialProfit: ma2.takePartialProfit,
        partialProfitTargetPct: ma2.takePartialProfit
          ? ma2.partialProfitTargetPct
          : undefined,
      },
      ma3: {
        stock: ma3.stock,
        rsiThreshold: isRsiEnabled ? ma3.rsiThreshold : undefined,
        takePartialProfit: ma3.takePartialProfit,
        partialProfitTargetPct: ma3.takePartialProfit
          ? ma3.partialProfitTargetPct
          : undefined,
      },
    },
    initialVrSnapshot: null,
  };
}
```

#### 6.3 Multi-split / No-stop

```ts
function buildSingleStockStrategyBase(targetStock: string): Pick<
  Strategy,
  'ma0' | 'ma1' | 'ma2' | 'ma3'
> {
  return {
    ma0: {
      stock: targetStock,
      rsiEnabled: false,
      alignmentEnabled: false,
      maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
      maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    },
    ma1: { stock: targetStock },
    ma2: { stock: targetStock, splitCount: SECTION_TWO_SPLIT_COUNT },
    ma3: { stock: targetStock },
  };
}

function buildMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.multiSplit;
  const targetStock = safeTrim(draft?.targetStock);

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      multiSplit: {
        targetStock,
        targetReturnRate: safeNumber(draft?.targetReturnRate),
        totalSplitCount: safeNumber(draft?.totalSplitCount),
      },
    },
    initialVrSnapshot: null,
  };
}

function buildNoStopMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.noStopMultiSplit;
  const targetStock = safeTrim(draft?.targetStock);

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      noStopMultiSplit: {
        targetStock,
        lowLocBudgetRatio: safeNumber(draft?.lowLocBudgetRatio),
        highLocPremiumPct: safeNumber(draft?.highLocPremiumPct),
        takeProfitPct: safeNumber(draft?.takeProfitPct),
        totalSplitCount: safeNumber(draft?.totalSplitCount),
      },
    },
    initialVrSnapshot: null,
  };
}
```

#### 6.4 VR Band

```ts
function buildVrBandStrategy(
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  const draft = wizardState.vrBand;
  const vrMode = draft?.vrMode ?? 'lump_sum';
  // `feeRatePercent`는 `buildValidationInput` → `normalizeMetaDraft`를 거친 UI 퍼센트(%) — 여기서 `safeNumber`·`Number.isFinite`로 이중 방어하지 않는다(Rule 6 데드코드 제거).
  const normalizedFeeRate = toDecimalRate(feeRatePercent);
  const absoluteDeltaCash = roundMoney(Math.abs(safeNumber(draft?.deltaCash)));

  const vrBaseParams = {
    initialCapital: safeNumber(draft?.initialCapital),
    initialV: safeNumber(draft?.initialV),
    minOrderQty: safeNumber(draft?.minOrderQty),
    feeRate: normalizedFeeRate,
    bandRateUpper: toDecimalRate(safeNumber(draft?.bandUpperPct)),
    bandRateLower: toDecimalRate(safeNumber(draft?.bandLowerPct)),
    G: safeNumber(draft?.g),
    poolUsageRateBuy: toDecimalRate(safeNumber(draft?.poolUsagePct)),
    cycleWeeks: sanitizeVrCycleWeeks(draft?.cycleWeeks),
  };

  let vrParams: VrBandStrategyParams;

  switch (vrMode) {
    case 'accumulate':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'accumulate',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'withdraw':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'withdraw',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'lump_sum':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'lump_sum',
        deltaCash: ZERO_AMOUNT,
      };
      break;
    default: {
      const exhaustiveCheck: never = vrMode;
      return exhaustiveCheck;
    }
  }

  return {
    strategy: {
      ...buildSingleStockStrategyBase(DEFAULT_VR_REFERENCE_STOCK),
      vrBand: vrParams,
    },
    initialVrSnapshot: createInitialVrSnapshot(vrParams),
  };
}
```

#### 6.5 전략 분기 진입점

```ts
function buildStrategyFromWizardState(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      return buildMaIntervalStrategy(wizardState);
    case 'multi_split':
      return buildMultiSplitStrategy(wizardState);
    case 'no_stop_multi_split':
      return buildNoStopMultiSplitStrategy(wizardState);
    case 'vr_band':
      return buildVrBandStrategy(wizardState, feeRatePercent);
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}
```

핵심:

- 모든 case가 **동일 패턴**을 따릅니다.
- partial draft를 읽는 곳은 각 strategy helper 내부로만 제한됩니다.
- 결과는 항상 완성형 `Strategy`입니다.

---

### 7. `buildPortfolioDraftFromWizardState` 시뮬레이션

```ts
export function buildPortfolioDraftFromWizardState(input: {
  selectedStrategy: StrategyType;
  wizardState: StrategyWizardDraftInput;
}): PortfolioDraftBuildResult {
  const validationInput = buildValidationInput(
    input.selectedStrategy,
    input.wizardState,
  );
  const strategyBuildResult = buildStrategyFromWizardState(
    input.selectedStrategy,
    input.wizardState,
    validationInput.feeRatePercent,
  );
  const meta = normalizeMetaDraft(input.wizardState.meta);

  return {
    portfolio: {
      name: validationInput.name,
      dailyBuyAmount: validationInput.dailyBuyAmount,
      startDate: meta.startDate,
      feeRate: validationInput.feeRatePercent,
      isClosed: false,
      trades: [],
      strategy: strategyBuildResult.strategy,
      ...(strategyBuildResult.initialVrSnapshot != null
        ? { vrSnapshot: strategyBuildResult.initialVrSnapshot }
        : {}),
    },
    validationInput,
  };
}
```

핵심:

- 최종 반환 경로에서도 `wizardState.meta.startDate`를 직접 읽지 않습니다.
- `normalizeMetaDraft(...)`를 통과한 값만 씁니다.
- `validationInput.feeRatePercent`는 이미 `safeNumber`·`roundMoney`를 거친 값이므로 **`Number.isFinite(...) ? ... : LEGACY_*` 삼항은 데드 분기**로 간주하고 스니펫에서 제거한다. (레거시 DB 힐 등 **별도 경로**가 필요하면 **서비스/마이그레이션 레이어**로 격리 — 본 유틸은 draft→검증 입력→포트폴리오 조립만 담당.)

---

### 8. `hasDuplicatedSectionStocks` 시뮬레이션

```ts
export function hasDuplicatedSectionStocks(
  strategy: Partial<Pick<Strategy, 'ma1' | 'ma2' | 'ma3'>>,
): boolean {
  const sectionStocks = [
    safeTrim(strategy.ma1?.stock),
    safeTrim(strategy.ma2?.stock),
    safeTrim(strategy.ma3?.stock),
  ].filter((stock) => stock.length > 0);

  if (sectionStocks.length === 0) {
    return false;
  }

  return new Set(sectionStocks).size !== sectionStocks.length;
}
```

핵심:

- `trim()` 직접 호출 금지
- `undefined`, `null`, 빈 문자열 모두 안전
- 빈 값은 중복 판정에서 제외

---

### 9. 구현 체크리스트 (완료·회귀 방지)

Step 1 유틸 구현은 **아래를 모두 만족한 상태**로 동결한다. 후속 PR에서 깨지면 Step 1 회귀로 본다.

1. `src/components/StrategyCreator/utils.ts`의 입력 타입을 **완성형 state**가 아닌 **partial draft input**으로 유지한다.
2. `wizardState.meta.name.trim()` 같은 **깊은 직접 접근을 전면 금지** — `normalizeMetaDraft`·`safeTrim` 경유.
3. `safeTrim`, `safeNumber`, `safeBoolean`, `normalizeMetaDraft`, `normalizeMaSectionDraft`를 유지한다. **`safeNumber`는 `Number("") === 0` 맹점을 막기 위해** `trim()` 후 빈 문자열은 **`fallback`**으로 돌리고, 수수료·일일 매수액처럼 **0이 도메인적으로 틀린 필드는 `STRATEGY_DEFAULTS` 등 명시 fallback**을 넘긴다. **`safeTrim`·`safeNumber`·`safeBoolean`은 export**하여 Trade 등 **다른 UI**에서도 동일 헬퍼를 import한다(중복 `Number()` 파싱 금지).
4. `buildStrategyFromWizardState(...)`의 모든 `switch` 케이스(`rsi_ma_interval`, `multi_split`, `no_stop_multi_split`, `vr_band`)에 **동일한 partial + normalize 패턴**을 유지한다.
5. `hasDuplicatedSectionStocks(...)`는 **Partial 입력 + 빈 문자열 제외**를 유지한다.
6. `any`, non-null assertion(`!`), `as` 캐스팅을 넣지 않는다. (머지 전 `rg '\bas\b' src/components/StrategyCreator/utils.ts`로 **0건** 확인.)
7. `normalizeMetaDraft` / `buildValidationInput` 산출 `feeRatePercent`에 대해 **`Number.isFinite`·`safeNumber` 이중 방어**를 추가하지 않는다.
8. Step 1 범위에서는 **`.tsx`/Hook 변경 없이** 유틸만 구현했다. **폼·모달 UI에서 본 헬퍼를 쓰는 작업**은 §3.4 등 **후속 B4 단계**에서 수행한다.

---

### 10. Mental Compile

#### 10.1 타입 검증

- `StrategyWizardDraftInput`은 partial draft를 정직하게 표현한다.
- `buildValidationInput`, `buildStrategyFromWizardState`, `buildPortfolioDraftFromWizardState`는 완성형 출력만 반환한다.
- `switch`는 `never`로 닫힌다.

#### 10.2 런타임 검증

- `wizardState.meta`가 `undefined`여도 `normalizeMetaDraft(...)`가 닫는다.
- `strategy.ma1?.stock`이 `undefined`여도 `safeTrim(...)`이 닫는다.
- 드래프트의 특정 단계가 비어 있어도 `Cannot read properties of undefined`가 나지 않는다.
- 폼에서 수수료 등 숫자 필드가 **빈 문자열(`""`)**로 넘어와도 **`Number("")`에 의한 0% 오적용**이 나지 않는다(`safeNumber` + 도메인 fallback).

#### 10.3 규칙 검증

- Rule 1: `Number("") === 0` 맹점을 신뢰하지 않고, **빈·공백만 있는 입력은 `trim()` 뒤 `fallback`**으로만 처리한다(네이티브 `Number(폼문자열)` 단독 사용 금지).
- Rule 6: 깊은 객체 접근에 `?.` / `??` / normalize helper 적용. **동일 값에 대한 중복 유한성 검사·중복 `safeNumber` 래핑 금지**(신뢰 경계는 한 곳에서만).
- Rule 7: `any`·`!`·`as` 비채택
- Rule 8: 매직 넘버 상수화 유지
- Rule 10: UI/상태 책임 없이 순수 함수만 유지

---

### 11. 최종 결론

Step 1은 **구현 완료**되었으며, 범위는 다음과 같이 고정된다.

- `src/utils/a11yHelpers.ts`, `src/utils/financialCalculations.ts`는 **동결**(Step 1에서 변경 없음).
- `src/components/StrategyCreator/utils.ts`는 **partial draft 정규화 + 빌더**의 SSoT이며, 아래 스니펫과 **동작·타입이 1:1**이다.
- **`safeTrim` / `safeNumber` / `safeBoolean`는 export**되어, 후속 UI 작업(§3.4 Trade 등)에서 **입력 경계 계약**을 공유한다.

추가 구현 시에는 **이 절을 회귀 기준**으로 삼고, import 경로(`@/`·`src/...`)와 `validatePortfolioSetupInput` 계약만 레포와 맞추면 된다.

---

## 4. 구현 순서

**Colocation 원칙:** UI·마법사에만 쓰이는 순수 함수는 해당 컴포넌트와 **가장 가까운 전용 파일**에 둡니다. 여러 화면에서 공유되는 금융·검증 SSOT만 `utils/` 등 공용 트리에 둡니다.

1. `App.tsx`에서 modal state, `usePortfolioUiCommands`(또는 동등 어댑터), `TabContent`용 안정 콜백(`noop`/`noopAsync` 포함)을 먼저 고정합니다. **`activePortfolios` / `closedPortfolios`는 `useMemo(..., [portfolios])`로 배열 참조를 안정화**해 `TabContent`의 `React.memo`를 보호합니다. **`React.lazy` 없이 정적 import만 쓰면 `Suspense` 껍데기는 두지 않습니다.**
2. `Dashboard.tsx`를 container/view로 나누고, 클릭 표면 A11y와 render-phase ref mutation 제거를 먼저 끝냅니다. **`src/utils/a11yHelpers.ts`**(§2.3)를 SSOT로 두고 `handlePressEnterOrSpace`를 import해 씁니다. **미사용 `dailyExecutionBlock` ref·effect·prop**은 제거하고, **`PortfolioCardView`는 `React.memo`**, **`executionSummary`(`ReactNode`)는 `React.memo`와의 참조 안정성을 위해 컨테이너에서만 `useMemo`**로 감쌉니다. **`useMemo`는 exhaustive-deps 준수**: §3.2처럼 **`PortfolioExecutionSummaryInput`에 넣은 값과 deps를 동일 집합**으로 맞추고, **지문 문자열로 deps를 속이지 않는다**.
3. `constants/messages/tradeMessages.ts`와 `src/utils/tradeModalCalculations.ts`를 두고, `TradeExecutionModal.tsx`·`QuickInputModal.tsx`를 **container/view + `getTradeMessages` + 유틸 preview**로 통합합니다(저장 계약은 `onSave(trade)` 유지, Rule 11은 모달 내부 `useRef` 락). 예산 Soft Warning은 인라인 배너로 처리합니다.
4. `AuthModals.tsx`를 view shell로 축소하고 `AuthModalCoordinator.tsx`를 exit/sign-in 흐름만 담당하도록 좁힙니다. **`useAuthModalController`는 options 객체가 아니라 개별 인자**로 호출해 훅 의존성 흔들림을 막습니다.
5. `StrategyCreator`는 저장 파이프라인을 유지한 채 step renderer만 분해하고, **`buildPortfolioDraftFromWizardState` / `hasDuplicatedSectionStocks`는 `src/components/StrategyCreator/utils.ts`에만 구현**합니다(전역 `utils/`에 두지 않음). 필요 시 `components/StrategyCreator/` 폴더로 엔트리를 정리한 뒤 `./utils`로 import합니다. **`saveCommand`가 B3에서 이미 뮤텍스 처리된 경우 UI에 `useMutexAction`을 또 두지 않습니다**(이중 잠금 금지); 저장 실패 시 **`onClose`는 성공 경로에서만** 호출하고 `try`/`catch`로 방어합니다.

---

## 5. B4 자체 검증 체크

| 원칙 | 검증 결과 |
|---|---|
| Financial Math & Edge Cases | Trade/Quick는 **`src/utils/tradeModalCalculations.ts`**에서 preview·정산·예산 경고(`shouldWarnTradeBudgetExceeded`)·입력 파싱(`parseTradeNumericInput`)을 단일화하고, `areStrictPositiveFiniteScalars` 등과 결합합니다(UI 인라인 `price * quantity` 금지). 마법사 등 다른 UI는 `safeNumber` SSOT(§3.6)를 유지합니다. |
| React & UI Anti-Patterns | render-phase ref mutation 제거, nested ternary를 helper/switch로 평탄화했습니다. Trade 종목은 **`useEffect` 동기화 대신 파생 `selectedStock`**으로 티어링을 막습니다. Dashboard·Trade는 **`handlePressEnterOrSpace`를 `utils/a11yHelpers.ts`에서 import**합니다. |
| Strict I18N | JSX 하드코딩 대신 기능별 `Record<AppLang, MessageSet>` 형태를 제안했습니다. |
| Accessibility | Trade/Quick 오버레이는 **시맨틱 `button`** + `aria-label`로 처리합니다. 그 외 클릭 `div`/backdrop에는 `role`, `tabIndex`, `onKeyDown`, `aria-label` 계약을 명시했습니다. |
| Architecture & DRY | App shell / Dashboard / Auth / Trade modal / Strategy wizard를 각각 container-view-command로 분리했습니다. |
| Clean Code | UI에서 `supabase`, fee math, modal orchestration, hardcoded text가 섞이지 않도록 경계를 나눴습니다. |
| Strict TypeScript | 문서 스니펫에 `any`와 `!`를 넣지 않았고, union 분기에는 `never`를 넣었습니다. Trade 하위 UI는 **`Record<string, unknown>` 대신 `TradeTypeSegmentProps` 등 명시 props**로 `declare`합니다. |
| Naming & Magic Numbers | `DEFAULT_FEE_RATE_PERCENT`, `SEC_FEE_RATE`, `MOC_SELL_RATIO` 등 설명 가능한 상수로 올렸습니다. |
| Meaningful Comments | "왜 이 분리가 필요한지" 중심으로만 설명했고, 의미 없는 주석은 넣지 않았습니다. |
| Performance & State | modal 단일 state, primitive prop 우선, App **`activePortfolios`/`closedPortfolios` 배열 참조 `useMemo`**, `TabContent` 스텁·모달 오픈 **`useCallback`/`noop`**, Trade/Quick **`tradeModalCalculations` 맹목 `useMemo` 비채택** + **View에 명시 props**, **`handleSave` `useCallback`** + **`onSave` + `useRef` 저장 락**, **`StrategyCreatorLayout` `handlePrimaryAction` `useCallback`**, **`saveAction`에서 `run`/`isExecuting` 분리**, Dashboard **`PortfolioCardView` `React.memo` + `executionSummary` `useMemo` exhaustive-deps(`PortfolioExecutionSummaryInput` ↔ deps 1:1)**, StrategyCreator **`primaryActionLabel` 맹목적 `useMemo` 비채택**, App **가짜 `Suspense` 비채택**, 네비는 TabContent 밖 셸로 분리했습니다. |
| Async UI Flow & Domain Safety | **StrategyCreator 등**은 `UiMutationCommand`의 `isExecuting`을 소비하고, **`saveCommand`에 B3 뮤텍스가 있으면 UI `useMutexAction` 이중 잠금을 금지**합니다. **Trade/Quick**은 `onSave` + 모달 내부 **`useRef` 락**으로 Rule 11을 만족합니다. 예산 초과는 non-blocking 인라인 경고이며, 저장 실패 시 **모달을 닫지 않는 `try`/`catch`/`finally`**로 Unhandled Rejection을 막습니다(성공 시에만 `onClose`). |

### 5.1 오버코딩 여부 점검

- 채택: **단일 modal union**, **typed message set**, **공통 trade preview helper**, **Dashboard container/view 분리**
- 추가 채택: **Trade/Quick `tradeMessages` + `tradeModalCalculations` + container/view**, **예산 Soft Warning 인라인 배너(non-blocking)**, **Trade 저장 `useRef` 락 + `onSave` 유지**, **Dashboard dead code/`any` 소각**, **`usePortfolioUiCommands` 어댑터**, **App `TabContent`용 `activePortfolios`/`closedPortfolios` `useMemo` 참조 고정**, **`TabContent` `noop`/`noopAsync` + 모달 오픈 `useCallback`**, **Trade 종목 `selectedStockRaw`+파생 `selectedStock`**, **StrategyCreator `saveCommand` 단일 뮤텍스 + `try`/`catch` + `saveAction` deps 동일 분리**, **`utils/a11yHelpers.ts` SSOT**, **Dashboard `PortfolioCardView` `React.memo` + `executionSummary` `useMemo` exhaustive-deps + `PortfolioExecutionSummaryInput`**, **StrategyCreator `primaryActionLabel` 맹목적 `useMemo` 비채택**, **`StrategyCreatorLayout` `handlePrimaryAction` `useCallback`**, **App `tabContentProps` 가짜 `useMemo` 제거 + 가짜 `Suspense` 제거 + 모달 명시 import**, **Trade `X` 출처 고정**, **Auth `AuthModalLayout` + `useAuthModalController` 개별 인자 + Coordinator Toss/TDS `declare`**, **StrategyCreator 레이아웃/렌더러 `declare`**, **UI-Level 입력 파싱:** 마법사 등은 `safeNumber` SSOT(§3.6); Trade/Quick는 `parseTradeNumericInput` 등 `tradeModalCalculations` 계약.
- 비채택:
  - 전역 state machine 도입
  - generic form framework 도입
  - 재사용 가능성 불명확한 추상 component factory
  - B3 공개 API를 대규모로 다시 바꾸는 작업
  - Dashboard 최상위 map 단계에서의 전면 primitive prop 분해
  - 로컬과 맞지 않는 **`usePortfolios()` 무인자** / **`usePortfolioMutations(lang)` 단독** 호출(문서·구현 모두 금지)
  - 현재 `TabContent`에 존재하지 않는 **`navItems` prop 가정**만으로 데드 코드를 해소하려는 방식(네비는 셸 분리 또는 별도 시그니처 확장으로 처리)
  - B3가 이미 뮤텍스를 건 `saveCommand` / `UiMutationCommand`를 UI에서 `useMutexAction`으로 **한 번 더 감싸는 이중 잠금**

결론적으로 이번 계획은 **"현재 UI의 과밀한 책임을 해체하는 최소 구조"** 까지만 제안하며, 미래 확장용 과잉 추상화는 넣지 않았습니다.

---

## 6. 최종 결론

Phase B4의 본질은 디자인 손질이 아닙니다.  
핵심은 **B3에서 정리된 훅/뮤텍스/에러 정책을 UI 컴포넌트가 더 이상 훼손하지 않도록 소비 계층을 재정렬하는 것**입니다.

1. `App.tsx`는 오케스트레이터가 되고, 모달/탭/명령 분기만 담당합니다.
2. `Dashboard.tsx`는 거대 카드 컴포넌트에서 벗어나 container/view 구조로 쪼갭니다.
3. `AuthModals.tsx`는 I/O를 버리고 typed copy + controller shell로 바뀝니다.
4. `TradeExecutionModal.tsx`와 `QuickInputModal.tsx`는 **`getTradeMessages` + `tradeModalCalculations` + container/view**로 통합하고, 저장은 **`onSave(trade)`**를 유지합니다(Rule 11은 모달 내부 `useRef` 락).
5. `StrategyCreator`는 저장 파이프라인은 유지하고 렌더링만 분해하며, 마법사 전용 헬퍼는 **`src/components/StrategyCreator/utils.ts`**에 colocation하고, **B3 `saveCommand` 뮤텍스와 UI 로컬 뮤텍스를 중복 적용하지 않습니다**.

이 문서 기준으로 Mental Compile은 **통과 가능**합니다(§3.2 `executionSummary`는 **exhaustive-deps 3회 검증**으로 Stale Closure·거짓 deps·`PortfolioExecutionSummaryInput` 계약을 교차 확인). 실제 구현은 위 순서대로, 그리고 **각 단계마다 B3 contract를 다시 깨지 않는지** 확인하면서 들어가면 됩니다.
