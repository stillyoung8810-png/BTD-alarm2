# PHASE C Legal Disclaimer Implementation Plan

## 1. Objective
토스 미니앱 심사에서 요구한 “투자권유 아님/참고용” 고지를 **사용자가 명확히 인지**하도록 보장하기 위해, 주요 의사결정 구간에 동일한 법적 면책을 노출합니다. 본 계획은 Toss compliance와 사용자 보호를 동시에 만족시키면서도, UI 중복을 최소화하고 I18N SSOT를 유지하는 것을 목표로 합니다.

## 2. I18N SSOT Definition
모든 문구는 `constants/messages/commonMessages.ts`에 정의하고, UI에서는 **직접 문자열을 사용하지 않습니다.** 아래는 신규 key가 포함된 **완전한 파일 스니펫**입니다.

```ts
import type { AppLang } from '@/types';

export interface CommonMessageSet {
  save: string;
  processing: string;
  close: string;
  closeDialog: string;
  acknowledge: string;
  notice: string;
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
  legalDisclaimerMinimal: string;
  legalDisclaimerStandard: string;
  legalDisclaimerAccent: string;
}

export type CommonMessageKey = keyof CommonMessageSet;

export const COMMON_MESSAGES: Record<AppLang, CommonMessageSet> = {
  ko: {
    save: '저장하기',
    processing: '처리 중…',
    close: '닫기',
    closeDialog: '대화상자 닫기',
    acknowledge: '확인',
    notice: '안내',
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
    legalDisclaimerMinimal:
      '본 서비스 정보는 참고용이며 투자 권유가 아닙니다.',
    legalDisclaimerStandard:
      '본 서비스는 투자 참고용 정보만 제공하며, 투자 판단과 책임은 이용자에게 있습니다.',
    legalDisclaimerAccent:
      '진행 전에 본 서비스가 투자 권유가 아닌 참고용 정보임을 확인해 주세요.',
  },
  en: {
    save: 'Save',
    processing: 'Processing…',
    close: 'Close',
    closeDialog: 'Close dialog',
    acknowledge: 'OK',
    notice: 'Notice',
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
    validationWithdrawalNonFinite:
      'Withdrawal amount must be a valid number.',
    validationWithdrawalNegative:
      'Withdrawal amount must be zero or greater. Negative values are not allowed.',
    validationWithdrawalTooLarge:
      'Withdrawal amount must be $1,000,000 or less.',
    legalDisclaimerMinimal:
      'This service provides information for reference only and is not investment advice.',
    legalDisclaimerStandard:
      'This service provides reference information only; all investment decisions and responsibility remain with the user.',
    legalDisclaimerAccent:
      'Before proceeding, please confirm this service is for reference only and not investment advice.',
  },
};

export function getCommonMessages(lang: AppLang): CommonMessageSet {
  return COMMON_MESSAGES[lang];
}
```

## 3. Component Architecture
중복 UI를 제거하고 SRP를 지키기 위해 `components/common/LegalDisclaimer.tsx`에 `LegalDisclaimer` 단일 컴포넌트를 설계합니다. `variant`를 통해 **O(1) dictionary mapping**으로 메시지와 스타일을 선택하며, 접근성 역할은 컴포넌트 내부에서 **`role="note"`로 고정**합니다. 시각 톤은 컴포넌트 내부 variant가 전담하고, 외부에서는 margin/padding/text-align 같은 **레이아웃 클래스만** 주입합니다.

```tsx
import React from 'react';
import type { AppLang } from '@/types';
import { getCommonMessages } from '@/constants/messages/commonMessages';

const DISCLAIMER_MESSAGE_KEY_BY_VARIANT = {
  minimal: 'legalDisclaimerMinimal',
  standard: 'legalDisclaimerStandard',
  accent: 'legalDisclaimerAccent',
} as const;

export type LegalDisclaimerVariant =
  keyof typeof DISCLAIMER_MESSAGE_KEY_BY_VARIANT;

const DISCLAIMER_CLASSNAME_BY_VARIANT: Record<LegalDisclaimerVariant, string> = {
  minimal:
    'text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed',
  standard:
    'text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed',
  accent:
    'text-[12px] font-semibold text-slate-600 dark:text-slate-300 leading-relaxed',
};

interface LegalDisclaimerProps {
  lang: AppLang;
  variant?: LegalDisclaimerVariant;
  layoutClassName?: string;
}

export const LegalDisclaimer = React.memo(function LegalDisclaimer({
  lang,
  variant = 'standard',
  layoutClassName = '',
}: LegalDisclaimerProps): React.ReactElement {
  const copy = getCommonMessages(lang);
  const messageKey = DISCLAIMER_MESSAGE_KEY_BY_VARIANT[variant];
  const baseClassName = DISCLAIMER_CLASSNAME_BY_VARIANT[variant];

  return (
    <div role="note" className={`${baseClassName} ${layoutClassName}`.trim()}>
      {copy[messageKey]}
    </div>
  );
});

LegalDisclaimer.displayName = 'LegalDisclaimer';
```

## 4. Integration Map

### 4.1 Pre-login Dashboard (Landing)
**파일:** `components/Landing.tsx`  
Hero/Trust 영역 하단에 `standard` variant로 배치합니다.

```tsx
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

const Landing: React.FC<LandingProps> = ({ lang, onOpenSignup, onOpenLogin }) => {
  // ... existing logic

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <LandingHero
        copy={copy}
        isInTossApp={isInTossApp}
        tossTitleStyle={tossTitleStyle}
        tossSubtitleStyle={tossSubtitleStyle}
        onOpenSignup={onOpenSignup}
        onOpenLogin={onOpenLogin}
      />

      {/* ... existing feature/trust blocks */}

      <LegalDisclaimer
        lang={lang}
        variant="standard"
        layoutClassName="mt-6 text-center"
      />
    </div>
  );
};
```

### 4.2 Checkout Modal (Payment Button Adjacent)
**파일:** `components/CheckoutModal.tsx`  
결제 버튼 **바로 위**에 `accent` variant로 배치합니다. `handlePay`, `isExecutingRef`, `isUnmounted` 등 Phase C 안전 로직은 **변경하지 않습니다**.

```tsx
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

// ... inside modalBody
<div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
  {/* ... pricing rows */}
</div>

<LegalDisclaimer
  lang={lang}
  variant="accent"
  layoutClassName="mt-4 text-center"
/>

<TDSButton
  fullWidth
  loading={isProcessing}
  disabled={isProcessing || isInvalidPrice}
  onClick={() => void handlePay()}
>
  {isProcessing ? pricingCheckoutCopy.processing : pricingCheckoutCopy.pay}
</TDSButton>
```

### 4.3 Post-login Dashboard (Fixed Footer Area)
**파일:** `components/Footer.tsx`, `App.tsx`  
Footer에 `minimal` variant를 추가하되, **로그인 후 + dashboard 탭**에서만 보이도록 `showLegalDisclaimer` 플래그를 전달합니다.

```tsx
import type { AppLang } from '@/types';
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

interface FooterProps {
  lang: AppLang;
  showLegalDisclaimer?: boolean;
  isInTossApp?: boolean;
  onNavigateTerms?: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateRefundPolicy?: () => void;
}

const Footer: React.FC<FooterProps> = ({
  lang,
  showLegalDisclaimer = false,
  isInTossApp: isInTossAppProp,
  onNavigateTerms,
  onNavigatePrivacy,
  onNavigateRefundPolicy,
}) => {
  // ... existing logic

  return (
    <footer className="w-full bg-slate-100 dark:bg-slate-900/80 border-t border-slate-200 dark:border-white/5 mt-auto">
      <div className="px-5 py-6 space-y-4">
        {showLegalDisclaimer && (
          <LegalDisclaimer
            lang={lang}
            variant="minimal"
            layoutClassName="mt-2 text-center"
          />
        )}

        {/* ... existing footer content */}
      </div>
    </footer>
  );
};
```

```tsx
<Footer
  lang={lang}
  showLegalDisclaimer={user != null && activeTab === 'dashboard'}
  onNavigateTerms={handleNavigateTerms}
  onNavigatePrivacy={handleNavigatePrivacy}
  onNavigateRefundPolicy={handleNavigateRefundPolicy}
/>
```

### 4.4 Strategy Selection Modal (Bottom Area)
**파일:** `components/strategyCreator/steps/StrategySelectionStepView.tsx`  
**추가 변경:** `StrategySelectionStepViewProps`에 `lang`을 추가하고, 선택 리스트 하단에 `accent` variant를 배치합니다.

```tsx
import type { AppLang } from '@/types';
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';
import type { StrategySelectionStepViewProps } from '../types/ui';

export interface StrategySelectionStepViewProps {
  lang: AppLang;
  heading: string;
  description: string;
  definitions: readonly StrategyDefinitionViewModel[];
  selectedStrategy: StrategyType | null;
  onSelectStrategy: (strategy: StrategyType) => void;
}

export function StrategySelectionStepView({
  lang,
  heading,
  description,
  definitions,
  selectedStrategy,
  onSelectStrategy,
}: StrategySelectionStepViewProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {/* ... existing heading + list */}

      <LegalDisclaimer
        lang={lang}
        variant="accent"
        layoutClassName="pt-2 text-center"
      />
    </div>
  );
}
```

```tsx
<StrategySelectionStepView
  lang={lang}
  heading={controller.copy.strategySelection.heading}
  description={controller.copy.strategySelection.description}
  definitions={controller.strategyDefinitions}
  selectedStrategy={controller.selectedStrategy}
  onSelectStrategy={controller.handleSelectStrategy}
/>
```

## 5. Verification Checklist
- `commonMessages.ts`에 신규 disclaimer key가 **ko/en 모두 존재**한다.
- `getCommonMessages()`는 정적 객체를 그대로 반환하며, 불필요한 별도 캐시를 두지 않는다.
- 모든 화면에서 `LegalDisclaimer`만 사용하며 **직접 문자열은 사용하지 않는다**.
- `LegalDisclaimer`는 `variant` 기반 **O(1) dictionary mapping**을 사용한다.
- `layoutClassName`에는 레이아웃 속성만 전달하고, 텍스트 색상/크기 override는 금지한다.
- `LegalDisclaimer`의 접근성 역할은 컴포넌트 내부의 `role="note"`로 고정하고, 외부에서 랜드마크 role을 주입하지 않는다.
- `CheckoutModal`의 `isExecutingRef`, `isUnmounted`, `PLAN_STYLES` 로직은 변경하지 않는다.
- 4개 목표 영역(Pre-login, Checkout, Post-login Footer, Strategy Selection)에 노출이 확인된다.
