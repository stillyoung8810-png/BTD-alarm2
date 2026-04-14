# PHASE C Pricing Design Restoration Plan

## 1. 목표

본 문서의 목표는 `components/Pricing.tsx`의 **과거 풍부한 시각 디자인**을 복원하되, Phase C에서 확보한 **Strict I18N / resolver 기반 분기 / CheckoutModal 비동기 안전성**은 절대 되돌리지 않는 것입니다.

복원 기준은 다음 두 축입니다.

- **디자인 기준:** `git show efb58ee:components/Pricing.tsx`
- **로직 기준:** 현재 `components/Pricing.tsx`, `constants/messages/pricingMessages.ts`, `components/CheckoutModal.tsx`, `docs2/code_optimization/PHASE_C_SIMULATION_PLAN.md` C4 절

## 2. Git / 현행 분석 요약

### 2.1 과거 풍부한 디자인(`efb58ee`)

`efb58ee:components/Pricing.tsx`에는 현재 제거된 다음 시각 구조가 있었습니다.

1. 상단 블러 그라디언트 배경 + `Membership` 히어로
2. 3열 티어 카드
4. AI 섹션
   - `style={{ perspective: '1200px' }}`
   - `/images/ai_step_input.jpg`
   - `/images/ai_step_processing.jpg`
   - `/images/ai_step_result.jpg`
5. 텔레그램 폰 프레임 목업
   - `TELEGRAM_PREVIEW_CARDS`
   - `BTD Alarm Bot`
6. Toss 앱 / Web 버튼 분기
   - Toss: `TDSButton`
   - Web: 일반 `<button>`

### 2.2 Phase C 이후 현재 상태

현재 `components/Pricing.tsx`는 `getTierCtaState` 같은 **좋은 resolver 패턴**을 확보했지만, UI는 **3열 카드 최소 구조**만 남은 상태입니다.

현재 유지해야 할 핵심은 다음입니다.

1. **Strict I18N**
   - JSX에서 `isKo ? '...' : '...'` 금지
   - 모든 UI 문자열은 `pricingMessages.ts`로 이동
2. **분기 정리**
   - `getTierCtaState`
   - theme / CTA / preview tone 별 dictionary 또는 helper
3. **CheckoutModal 비동기 안전성**
   - `try/catch/finally`
   - `showErrorToast(copy.paymentFailed)`
   - `showErrorToast(copy.systemError)`
   - `window.alert` 금지
   - 언마운트 후 `setState` 금지
   - `useRef` 동기 mutex 유지

### 2.3 이번 복원의 설계 원칙

이번 복원은 **디자인 롤백**이 아니라 **시각 복원 + 구조 유지**입니다.

- 복원할 것
  - 레이아웃
  - 색감
  - 카드 조형
  - AI 3D 프레임
  - 텔레그램 폰 목업
  - 프리미엄 글로우
- 유지할 것
  - 메시지 SSOT
  - helper 기반 CTA 결정
  - helper 기반 theme 결정
  - CheckoutModal 에러 처리
  - 타입 안전성
  - a11y

## 3. 반드시 지킬 복원 원칙

### 3.1 UI 복원 원칙

- 히어로 / AI / 텔레그램 섹션을 다시 넣되, `Pricing.tsx`는 **조립자(composer)** 역할만 수행합니다.
- 시각용 mock data도 JSX 내부 상수로 두지 않고 `pricingMessages.ts`로 이동합니다.
- 과거 디자인의 **배치와 분위기**는 유지하되, 과거의 하드코딩 / 중첩 삼항 / dead code는 복원하지 않습니다.

### 3.2 로직 원칙

- CTA는 JSX 안에서 계산하지 않습니다.
- `getTierCtaState`가 유일한 CTA 정책 진입점이 됩니다.
- 토스 미니앱 심사 리스크를 줄이기 위해, **출시 전 기능(`premium`)은 Pricing 탭에서 완전히 렌더링하지 않습니다.**
- 즉, `premium`은 teaser / coming soon / notify 형태로도 노출하지 않습니다.
- 과거 `free` 카드가 유료 사용자에게도 사실상 업그레이드 CTA처럼 보이던 문제는 이번에 resolver로 바로 정리합니다.

### 3.3 A11y 원칙

과거 코드의 AI / Telegram 프리뷰는 클릭 가능한 `div`였습니다. 이번 복원안에서는 **거대한 블록 레이아웃을 `button`으로 감싸지 않고**, 웹 표준과 실제 UX를 모두 만족하도록 **`div role="button"` 패턴**을 사용합니다.

- AI 프리뷰: `div` + `role="button"` + `tabIndex={0}` + `onKeyDown`
- Telegram 프리뷰: `div` + `role="button"` + `tabIndex={0}` + `onKeyDown`
- 스크롤과 클릭이 충돌할 수 있는 영역에는 `overflow-y-auto`를 남기지 않습니다.

즉, 접근성은 **시맨틱 태그 억지 사용**이 아니라 **명시적 A11y 속성**으로 확보합니다.

### 3.4 유지하지 않을 과거 코드

다음은 복원 금지입니다.

- `isKo ? '...' : '...'` JSX 하드코딩
- JSX 내부 중첩 삼항
- 사용되지 않는 `MOCK_TRADES`
- 사용되지 않는 `Sparkles`, `Clock`
- 실제 swipe UX 없이 남아 있던 `touchStartX`

## 4. 구현 전략

### 4.1 `pricingMessages.ts` 확장

현재는 티어 subtitle / checkout 메시지 정도만 담고 있습니다. 이를 다음처럼 확장합니다.

1. `hero`
2. `tiers`
   - price shape
   - feature list
   - 현재 Pricing 화면에서 실제 노출되는 티어만 포함
3. `sections.ai`
   - badge
   - title
   - description
   - bullet items
   - preview image meta
4. `sections.telegram`
   - badge
   - title
   - description
   - bot meta
   - preview cards / lines
5. CTA labels
   - `currentPlan`
   - `basePlanIncluded`
   - `extendPeriod`
   - `upgradeNow`

### 4.2 `Pricing.tsx` 복원 방식

`Pricing.tsx`는 다음 5개 presentation block을 조립합니다.

1. `PricingHero`
2. `TierCard`
3. `PricingAiSection`
4. `PricingTelegramSection`
5. `TierActionButton`

핵심은 **시각은 풍부하게**, **정책 분기는 helper로**, **문구는 messages로**입니다.

### 4.3 `CheckoutModal.tsx` 처리 방침

이번 복원 작업은 `CheckoutModal.tsx`를 **되돌리지 않습니다.**

현재 구현은 C4의 요구를 이미 만족합니다.

- `try/catch/finally`
- `Promise.resolve(...)`
- `showErrorToast(...)`
- `isExecutingRef`
- `isUnmounted`

따라서 이번 계획의 변경 대상은 **`pricingMessages.ts` + `Pricing.tsx` 중심**입니다.

## 5. 권고 결정 사항

### 5.1 PRO 현재 플랜 CTA

과거 디자인에는 `PRO` 현재 플랜일 때 버튼이 `기간 연장하기`였습니다. 이는 시각뿐 아니라 정책도 일부 포함합니다.

본 계획의 권고는 다음입니다.

- `getTierCtaState`에 `extend` 상태를 추가합니다.
- `currentTier === 'pro' && tierId === 'pro'` 이면 `extend`
- 그 외 현재 플랜은 `current`

이 방식은 **과거 UI의 인상**을 살리면서도 **resolver 기반 구조**를 유지합니다.

### 5.2 FREE 카드 CTA

과거 구현은 유료 사용자가 FREE 카드를 봐도 업그레이드처럼 보일 수 있었습니다. 본 계획에서는 다음으로 정리합니다.

- `tierId === 'free' && currentTier !== 'free'` -> `included`
- 라벨: `기본 혜택 포함` / `Base tier included`
- disabled: `true`

이 변경은 디자인 훼손이 아니라 **잘못된 CTA 인상 제거**입니다.

### 5.3 PREMIUM 노출 정책

사용자 요청 및 토스 미니앱 심사 리스크를 반영하여, `premium`은 현재 Pricing 탭에서 **완전 비노출**합니다.

- 카드 없음
- `COMING SOON` 없음
- `notify` CTA 없음
- feature / price / subtitle 없음

즉, 현재 배포 범위의 Pricing 탭은 **FREE / PRO만 노출**합니다.

## 6. To-Be Snippet — `constants/messages/pricingMessages.ts`

```ts
import type { AppLang } from '@/types';

export type PricingTierId = 'free' | 'pro';
export type PricingTierTheme = 'free' | 'pro';

export type PricingTierPrice =
  | { kind: 'static'; label: string; note: string }
  | { kind: 'membershipConfig'; plan: 'pro'; note: string };

export type PricingTelegramPreviewLineTone = 'text' | 'buy' | 'sell' | 'footer';
export type PricingTelegramBadgeTone = 'brand' | 'accent' | 'warning';

export interface PricingFeatureRow {
  id: string;
  text: string;
  isLocked?: boolean;
}

export interface PricingTierRow {
  id: PricingTierId;
  label: string;
  subtitle: string;
  theme: PricingTierTheme;
  badgeLabel?: string;
  price: PricingTierPrice;
  features: readonly PricingFeatureRow[];
}

export interface PricingHeroCopy {
  title: string;
  description: string;
}

export interface PricingBulletRow {
  id: string;
  text: string;
}

export interface PricingAiPreviewCard {
  id: 'input' | 'processing' | 'result';
  imageSrc: string;
  imageAlt: string;
}

export interface PricingAiSectionCopy {
  eyebrowLabel: string;
  title: string;
  description: string;
  bulletItems: readonly PricingBulletRow[];
  previewCards: readonly PricingAiPreviewCard[];
  advancePreviewAriaLabel: string;
}

export interface PricingTelegramPreviewLine {
  id: string;
  text: string;
  tone: PricingTelegramPreviewLineTone;
}

export interface PricingTelegramPreviewCard {
  id: string;
  badge: string;
  badgeTone: PricingTelegramBadgeTone;
  intro: string;
  time: string;
  lines: readonly PricingTelegramPreviewLine[];
}

export interface PricingTelegramSectionCopy {
  eyebrowLabel: string;
  title: string;
  description: string;
  appName: string;
  avatarText: string;
  previewCards: readonly PricingTelegramPreviewCard[];
  advancePreviewAriaLabel: string;
}

export interface PricingCheckoutMessages {
  pay: string;
  processing: string;
  paymentFailed: string;
  systemError: string;
}

export interface PricingMessageSet {
  hero: PricingHeroCopy;
  tiers: readonly PricingTierRow[];
  currentPlan: string;
  basePlanIncluded: string;
  extendPeriod: string;
  upgradeNow: string;
  sections: {
    ai: PricingAiSectionCopy;
    telegram: PricingTelegramSectionCopy;
  };
  checkout: PricingCheckoutMessages;
}

const AI_PREVIEW_IMAGE_PATHS = {
  input: '/images/ai_step_input.jpg',
  processing: '/images/ai_step_processing.jpg',
  result: '/images/ai_step_result.jpg',
} as const;

const TELEGRAM_APP_COPY = {
  appName: 'BTD Alarm Bot',
  avatarText: 'B',
} as const;

const PRICING_MESSAGES = {
  ko: {
    hero: {
      title: 'Membership',
      description: '당신에게 맞는 등급을 선택하고 거래 효율을 높여보세요.',
    },
    tiers: [
      {
        id: 'free',
        label: 'FREE',
        subtitle: '초보 투자자',
        theme: 'free',
        price: {
          kind: 'static',
          label: '₩0',
          note: '/ 평생',
        },
        features: [
          { id: 'portfolio-count', text: '포트폴리오 최대 2개' },
          { id: 'alert-slots', text: '알람 슬롯 2개' },
          { id: 'core-etfs', text: '기본 13개 ETF' },
          { id: 'ai-scan', text: 'AI 매매 인식 (1회/일)' },
          { id: 'backtest', text: '백테스트 (2회/일)', isLocked: true },
          { id: 'core-alerts', text: '기본 알람 · 기록 기능' },
          { id: 'ads', text: '광고 포함' },
        ],
      },
      {
        id: 'pro',
        label: 'PRO',
        subtitle: '전문 투자자',
        theme: 'pro',
        badgeLabel: '가장 인기 있는 선택',
        price: {
          kind: 'membershipConfig',
          plan: 'pro',
          note: '/ 월 (예정)',
        },
        features: [
          { id: 'portfolio-count', text: '포트폴리오 최대 5개' },
          { id: 'alert-slots', text: '알람 슬롯 10개' },
          { id: 'paid-tickers', text: '기본 13개 + PRO 전용 종목' },
          { id: 'ai-scan', text: 'AI 매매 인식 (50회/월)' },
          { id: 'backtest', text: '백테스트 (5회/일)', isLocked: true },
          { id: 'telegram', text: '텔레그램 상세 알림' },
          { id: 'ads', text: '광고 제거' },
        ],
      },
    ],
    currentPlan: '사용 중인 플랜',
    basePlanIncluded: '기본 혜택 포함',
    extendPeriod: '기간 연장하기',
    upgradeNow: '업그레이드하기',
    sections: {
      ai: {
        eyebrowLabel: 'AI SMART SCAN',
        title: '스크린샷 한 장으로\n매매 기록을 끝내세요',
        description:
          '증권사 앱의 체결 내역 화면을 캡처해서 올려주시면 AI가 종목, 단가, 수량을 자동으로 인식하여 포트폴리오에 반영합니다.',
        bulletItems: [
          { id: 'accuracy', text: '정밀한 인식률 (99%)' },
          { id: 'batch-support', text: '일괄 처리 지원' },
          { id: 'zero-manual-entry', text: '수기 입력 제로' },
        ],
        previewCards: [
          {
            id: 'input',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.input,
            imageAlt: 'AI 입력 예시 화면',
          },
          {
            id: 'processing',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.processing,
            imageAlt: 'AI 분석 진행 화면',
          },
          {
            id: 'result',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.result,
            imageAlt: 'AI 분석 결과 화면',
          },
        ],
        advancePreviewAriaLabel: '다음 AI 미리보기 보기',
      },
      telegram: {
        eyebrowLabel: 'SMART NOTIFICATIONS',
        title: '매매 시점을\n놓치지 마세요',
        description:
          '복잡한 계산 없이 텔레그램으로 전송되는 정교한 매매 지시를 따르기만 하세요.',
        appName: TELEGRAM_APP_COPY.appName,
        avatarText: TELEGRAM_APP_COPY.avatarText,
        previewCards: [
          {
            id: 'basic-split',
            badge: '기본 분할매수',
            badgeTone: 'brand',
            intro: '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
            time: '18:00',
            lines: [
              { id: 'title', text: '다분할 매매법', tone: 'text' },
              { id: 'alarm', text: '알람 시간 (KST): 17:10, 18:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC 매수1: 55.14 / 9주', tone: 'buy' },
              { id: 'buy-2', text: 'LOC 매수2: 60.37 / 8주', tone: 'buy' },
              { id: 'sell-1', text: 'LOC 매도: 60.38 / 4주', tone: 'sell' },
              { id: 'sell-2', text: '지정가 매도: 60.65 / 13주', tone: 'sell' },
            ],
          },
          {
            id: 'custom-strategy-mix',
            badge: '커스텀 전략 혼합',
            badgeTone: 'accent',
            intro: '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
            time: '09:00',
            lines: [
              { id: 'title', text: '다분할 매매법', tone: 'text' },
              { id: 'alarm', text: '알람 시간 (KST): 09:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC 매수2: 54.56 / 18주', tone: 'buy' },
              { id: 'sell-1', text: 'LOC 매도: 54.57 / 100주', tone: 'sell' },
              { id: 'sell-2', text: '지정가 매도: 60.65 / 300주', tone: 'sell' },
              { id: 'divider', text: '—', tone: 'text' },
              { id: 'ma-title', text: '이평선 구간매수', tone: 'text' },
              { id: 'ma-buy', text: '구간 2: QLD 매수', tone: 'buy' },
              {
                id: 'footer',
                text: '오늘 주문 요약은 앱에서 확인해 주세요.',
                tone: 'footer',
              },
            ],
          },
          {
            id: 'stop-loss-special',
            badge: '손절 및 특수대응',
            badgeTone: 'warning',
            intro: '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
            time: '09:00',
            lines: [
              { id: 'ma-title', text: '이평선 구간매수', tone: 'text' },
              { id: 'alarm', text: '알람 시간 (KST): 09:00', tone: 'text' },
              { id: 'ma-buy', text: '구간 3: QQQ 매수', tone: 'buy' },
              {
                id: 'footer',
                text: '오늘 주문 요약은 앱에서 확인해 주세요.',
                tone: 'footer',
              },
              { id: 'divider', text: '—', tone: 'text' },
              { id: 'multi-title', text: '다분할 매매법', tone: 'text' },
              { id: 'moc-sell', text: 'MOC 매도: 104.25 주', tone: 'sell' },
              {
                id: 'quarter-stop',
                text: 'MOC 매도 하여 쿼터 손절 모드 시작',
                tone: 'sell',
              },
            ],
          },
        ],
        advancePreviewAriaLabel: '다음 텔레그램 예시 보기',
      },
    },
    checkout: {
      pay: '결제하기',
      processing: '처리 중…',
      paymentFailed: '결제에 실패했습니다. 다시 시도하거나 다른 수단을 이용해 주세요.',
      systemError: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    },
  },
  en: {
    hero: {
      title: 'Membership',
      description: 'Simple but powerful benefits. Choose the right membership to scale your strategies.',
    },
    tiers: [
      {
        id: 'free',
        label: 'FREE',
        subtitle: 'Getting Started',
        theme: 'free',
        price: {
          kind: 'static',
          label: '$0',
          note: '/ lifetime',
        },
        features: [
          { id: 'portfolio-count', text: 'Up to 2 portfolios' },
          { id: 'alert-slots', text: '2 alert slots' },
          { id: 'core-etfs', text: '13 core ETFs' },
          { id: 'ai-scan', text: 'AI Trade Recognition (1/day)' },
          { id: 'backtest', text: 'Backtesting (2/day)', isLocked: true },
          { id: 'core-alerts', text: 'Core alerts & trading history' },
          { id: 'ads', text: 'Includes ads' },
        ],
      },
      {
        id: 'pro',
        label: 'PRO',
        subtitle: 'Active Investor',
        theme: 'pro',
        badgeLabel: 'Most popular',
        price: {
          kind: 'membershipConfig',
          plan: 'pro',
          note: '/ month (planned)',
        },
        features: [
          { id: 'portfolio-count', text: 'Up to 5 portfolios' },
          { id: 'alert-slots', text: '10 alert slots' },
          { id: 'paid-tickers', text: 'Core + PRO tickers' },
          { id: 'ai-scan', text: 'AI Trade Recognition (50/month)' },
          { id: 'backtest', text: 'Backtesting (5/day)', isLocked: true },
          { id: 'telegram', text: 'Detailed Telegram alerts' },
          { id: 'ads', text: 'No ads' },
        ],
      },
    ],
    currentPlan: 'Current Plan',
    basePlanIncluded: 'Base tier included',
    extendPeriod: 'Extend Period',
    upgradeNow: 'Upgrade Now',
    sections: {
      ai: {
        eyebrowLabel: 'AI SMART SCAN',
        title: 'Auto-log trades with\na screenshot',
        description:
          'Upload your execution history screen and AI will extract ticker, price, and quantity into your portfolio automatically.',
        bulletItems: [
          { id: 'accuracy', text: '99% Accuracy' },
          { id: 'batch-support', text: 'Batch Support' },
          { id: 'zero-manual-entry', text: 'Zero Manual Entry' },
        ],
        previewCards: [
          {
            id: 'input',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.input,
            imageAlt: 'AI input preview',
          },
          {
            id: 'processing',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.processing,
            imageAlt: 'AI processing preview',
          },
          {
            id: 'result',
            imageSrc: AI_PREVIEW_IMAGE_PATHS.result,
            imageAlt: 'AI result preview',
          },
        ],
        advancePreviewAriaLabel: 'Show next AI preview',
      },
      telegram: {
        eyebrowLabel: 'SMART NOTIFICATIONS',
        title: 'Real-time alerts,\nZero missed trades',
        description: 'Get precise trading signals via Telegram.',
        appName: TELEGRAM_APP_COPY.appName,
        avatarText: TELEGRAM_APP_COPY.avatarText,
        previewCards: [
          {
            id: 'basic-split',
            badge: 'Basic Split',
            badgeTone: 'brand',
            intro: 'Your set trading alarm time. Please check your portfolio strategy.',
            time: '18:00',
            lines: [
              { id: 'title', text: 'Multi-split trading', tone: 'text' },
              { id: 'alarm', text: 'Alarm (KST): 17:10, 18:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC Buy 1: 55.14 / 9 sh', tone: 'buy' },
              { id: 'buy-2', text: 'LOC Buy 2: 60.37 / 8 sh', tone: 'buy' },
              { id: 'sell-1', text: 'LOC Sell: 60.38 / 4 sh', tone: 'sell' },
              { id: 'sell-2', text: 'Limit Sell: 60.65 / 13 sh', tone: 'sell' },
            ],
          },
          {
            id: 'custom-strategy-mix',
            badge: 'Custom Strategy Mix',
            badgeTone: 'accent',
            intro: 'Your set trading alarm time. Please check your portfolio strategy.',
            time: '09:00',
            lines: [
              { id: 'title', text: 'Multi-split trading', tone: 'text' },
              { id: 'alarm', text: 'Alarm (KST): 09:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC Buy 2: 54.56 / 18 sh', tone: 'buy' },
              { id: 'sell-1', text: 'LOC Sell: 54.57 / 100 sh', tone: 'sell' },
              { id: 'sell-2', text: 'Limit Sell: 60.65 / 300 sh', tone: 'sell' },
              { id: 'divider', text: '—', tone: 'text' },
              { id: 'ma-title', text: 'MA interval buy', tone: 'text' },
              { id: 'ma-buy', text: 'Section 2: QLD Buy', tone: 'buy' },
              {
                id: 'footer',
                text: "Check today's order summary in the app.",
                tone: 'footer',
              },
            ],
          },
          {
            id: 'stop-loss-special',
            badge: 'Stop-loss & Special',
            badgeTone: 'warning',
            intro: 'Your set trading alarm time. Please check your portfolio strategy.',
            time: '09:00',
            lines: [
              { id: 'ma-title', text: 'MA interval buy', tone: 'text' },
              { id: 'alarm', text: 'Alarm (KST): 09:00', tone: 'text' },
              { id: 'ma-buy', text: 'Section 3: QQQ Buy', tone: 'buy' },
              {
                id: 'footer',
                text: "Check today's order summary in the app.",
                tone: 'footer',
              },
              { id: 'divider', text: '—', tone: 'text' },
              { id: 'multi-title', text: 'Multi-split trading', tone: 'text' },
              { id: 'moc-sell', text: 'MOC Sell: 104.25 sh', tone: 'sell' },
              {
                id: 'quarter-stop',
                text: 'MOC sell to start quarter stop-loss mode',
                tone: 'sell',
              },
            ],
          },
        ],
        advancePreviewAriaLabel: 'Show next Telegram example',
      },
    },
    checkout: {
      pay: 'Pay now',
      processing: 'Processing…',
      paymentFailed:
        'Payment failed. Please try again or use another method.',
      systemError: 'A temporary error occurred. Please try again later.',
    },
  },
} satisfies Record<AppLang, PricingMessageSet>;

export function getPricingMessages(lang: AppLang): PricingMessageSet {
  return PRICING_MESSAGES[lang];
}
```

## 7. To-Be Snippet — `components/Pricing.tsx`

```tsx
import React, { useCallback, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bell,
  Brain,
  Check,
  Lock,
  Star,
  Zap,
} from 'lucide-react';
import type { AppLang } from '@/types';
import {
  getPricingMessages,
  type PricingAiSectionCopy,
  type PricingMessageSet,
  type PricingTelegramBadgeTone,
  type PricingTelegramPreviewCard,
  type PricingTelegramPreviewLineTone,
  type PricingTierId,
  type PricingTierPrice,
  type PricingTierRow,
  type PricingTierTheme,
} from '@/constants/messages/pricingMessages';
import { MembershipConfig } from '../constants/membership';
import { PRICING_PRO_TIER_CARD_SURFACE_CLASSES } from '../constants/proPlanSurface';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSButton, type TDSButtonProps } from './tds';
import { formatPriceKRW, formatPriceUSDForDisplay } from '../utils/currency';

const PREVIEW_PERSPECTIVE_PX = 1200;
const AI_PREVIEW_WIDTH_PX = 325;
const AI_PREVIEW_HEIGHT_PX = 375;
const TELEGRAM_PREVIEW_MAX_HEIGHT_PX = 360;

const AI_PREVIEW_FRAME_STYLE: CSSProperties = {
  width: AI_PREVIEW_WIDTH_PX,
  height: AI_PREVIEW_HEIGHT_PX,
  perspective: `${PREVIEW_PERSPECTIVE_PX}px`,
};

const TELEGRAM_SCROLL_STYLE: CSSProperties = {
  maxHeight: TELEGRAM_PREVIEW_MAX_HEIGHT_PX,
};

interface PricingProps {
  lang: AppLang;
  currentTier: string;
  onUpgrade?: (planId: 'pro') => void;
}

type TierCtaState =
  | { kind: 'current'; label: string; isDisabled: true }
  | { kind: 'included'; label: string; isDisabled: true }
  | { kind: 'extend'; label: string; isDisabled: false; planId: 'pro' }
  | { kind: 'upgrade'; label: string; isDisabled: false; planId: 'pro' };

const TIER_THEME_STYLES: Record<
  PricingTierTheme,
  {
    card: string;
    title: string;
    subtitle: string;
    price: string;
    priceNote: string;
    featureList: string;
    currentBadge: string;
    featureDot: string;
    featureCheck: string;
    tossButtonVariant: TDSButtonProps['variant'];
    webButton: string;
  }
> = {
  free: {
    card:
      'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 shadow-xl dark:shadow-2xl',
    title: 'text-slate-900 dark:text-slate-300',
    subtitle: 'text-slate-500 dark:text-slate-400',
    price: 'text-slate-900 dark:text-white',
    priceNote: 'text-slate-500 dark:text-slate-400',
    featureList: 'text-slate-600 dark:text-slate-300',
    currentBadge:
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-400/30',
    featureDot: 'border-emerald-400 bg-emerald-400/20',
    featureCheck: 'text-emerald-500',
    tossButtonVariant: 'tertiary',
    webButton:
      'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white',
  },
  pro: {
    card: PRICING_PRO_TIER_CARD_SURFACE_CLASSES,
    title: 'text-blue-900 dark:text-white',
    subtitle: 'text-blue-600/70 dark:text-slate-400',
    price: 'text-blue-950 dark:text-white',
    priceNote: 'text-blue-600/60 dark:text-slate-400',
    featureList: 'text-blue-900/80 dark:text-slate-200',
    currentBadge: 'bg-emerald-500 text-white border-emerald-400',
    featureDot: 'border-blue-400 bg-blue-400/20',
    featureCheck: 'text-blue-500',
    tossButtonVariant: 'primary',
    webButton: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20',
  },
};

const TELEGRAM_BADGE_STYLES: Record<PricingTelegramBadgeTone, string> = {
  brand: 'bg-blue-500/20 text-blue-200 border-blue-400/50',
  accent: 'bg-purple-500/20 text-purple-200 border-purple-400/50',
  warning: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
};

const TELEGRAM_LINE_STYLES: Record<PricingTelegramPreviewLineTone, string> = {
  buy: 'text-emerald-400',
  sell: 'text-rose-400',
  footer: 'text-slate-400',
  text: 'text-slate-100',
};

function getTierCtaState(input: {
  tierId: PricingTierId;
  currentTier: string;
  copy: PricingMessageSet;
}): TierCtaState {
  const { tierId, currentTier, copy } = input;

  if (tierId === 'pro' && currentTier === 'pro') {
    return {
      kind: 'extend',
      label: copy.extendPeriod,
      isDisabled: false,
      planId: 'pro',
    };
  }

  if (tierId === currentTier) {
    return {
      kind: 'current',
      label: copy.currentPlan,
      isDisabled: true,
    };
  }

  if (tierId === 'free') {
    return {
      kind: 'included',
      label: copy.basePlanIncluded,
      isDisabled: true,
    };
  }

  if (currentTier === 'premium' && tierId === 'pro') {
    return {
      kind: 'included',
      label: copy.basePlanIncluded,
      isDisabled: true,
    };
  }

  return {
    kind: 'upgrade',
    label: copy.upgradeNow,
    isDisabled: false,
    planId: 'pro',
  };
}

function handleKeyDownAsClick(
  event: React.KeyboardEvent<HTMLDivElement>,
  callback: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

function getNextPreviewIndex(currentIndex: number, totalCount: number): number {
  // Preview data is now externalized; guard the modulo path so an empty message set does not yield NaN.
  if (totalCount <= 0) {
    return 0;
  }

  return (currentIndex + 1) % totalCount;
}

function getActivePreviewId<T extends { id: string }>(
  items: readonly T[],
  activeIndex: number,
): string | null {
  const activeItem = items[activeIndex] ?? items[0] ?? null;
  if (activeItem == null) {
    return null;
  }

  return activeItem.id;
}

function formatTierPriceLabel(price: PricingTierPrice, lang: AppLang): string {
  if (price.kind === 'static') {
    return price.label;
  }

  const config = MembershipConfig.byType?.[price.plan];
  if (config == null) {
    return lang === 'ko' ? '가격 미정' : 'Price TBA';
  }

  // USD display formatting already applies Number.EPSILON internally; keep money math centralized.
  if (lang === 'ko') {
    return formatPriceKRW(config.rawAmount);
  }

  return formatPriceUSDForDisplay(config.rawAmount);
}

function renderTierIcon(theme: PricingTierTheme): React.ReactElement {
  switch (theme) {
    case 'pro':
      return (
        <div className="w-full h-full bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-400/30">
          <Star
            size={24}
            className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]"
          />
        </div>
      );
    case 'free':
      return (
        <div className="w-full h-full rounded-2xl flex items-center justify-center border border-slate-300 dark:border-white">
          <Zap size={22} className="text-slate-900 dark:text-slate-200" />
        </div>
      );
    default: {
      const exhaustiveCheck: never = theme;
      return exhaustiveCheck;
    }
  }
}

function getTierActionAdornment(input: {
  kind: TierCtaState['kind'];
  isInTossApp: boolean;
}): React.ReactElement | null {
  const { kind, isInTossApp } = input;

  switch (kind) {
    case 'extend':
    case 'upgrade':
      return (
        <ArrowRight
          size={16}
          className={isInTossApp ? 'ml-1' : 'transition-transform group-hover/btn:translate-x-1'}
        />
      );
    case 'current':
    case 'included':
      return null;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

const PricingHero = React.memo(function PricingHero({
  copy,
}: {
  copy: PricingMessageSet['hero'];
}): React.ReactElement {
  return (
    <div className="text-center space-y-4 mb-20">
      <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter uppercase italic">
        {copy.title}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
        {copy.description}
      </p>
    </div>
  );
});

PricingHero.displayName = 'PricingHero';

const TierActionButton = React.memo(function TierActionButton({
  theme,
  ctaKind,
  label,
  isInTossApp,
  isDisabled,
  onClick,
}: {
  theme: PricingTierTheme;
  ctaKind: TierCtaState['kind'];
  label: string;
  isInTossApp: boolean;
  isDisabled: boolean;
  onClick: () => void;
}): React.ReactElement {
  const styles = TIER_THEME_STYLES[theme];
  const adornment = getTierActionAdornment({
    kind: ctaKind,
    isInTossApp,
  });

  if (isInTossApp) {
    return (
      <TDSButton
        type="button"
        variant={styles.tossButtonVariant}
        fullWidth
        disabled={isDisabled}
        onClick={onClick}
        aria-label={label}
      >
        {label}
        {adornment}
      </TDSButton>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group/btn disabled:opacity-60 disabled:cursor-not-allowed ${styles.webButton}`}
    >
      <span>{label}</span>
      {adornment}
    </button>
  );
});

TierActionButton.displayName = 'TierActionButton';

const TierCard = React.memo(function TierCard({
  tier,
  lang,
  currentTier,
  copy,
  isInTossApp,
  onUpgrade,
}: {
  tier: PricingTierRow;
  lang: AppLang;
  currentTier: string;
  copy: PricingMessageSet;
  isInTossApp: boolean;
  onUpgrade?: (planId: 'pro') => void;
}): React.ReactElement {
  const isCurrentTier = currentTier === tier.id;
  const styles = TIER_THEME_STYLES[tier.theme];

  const ctaState = getTierCtaState({
    tierId: tier.id,
    currentTier,
    copy,
  });

  const ctaKind = ctaState.kind;
  const ctaLabel = ctaState.label;
  const isCtaDisabled = ctaState.isDisabled;
  const ctaPlanId =
    ctaState.kind === 'extend' || ctaState.kind === 'upgrade'
      ? ctaState.planId
      : null;

  const handleAction = useCallback((): void => {
    switch (ctaKind) {
      case 'current':
      case 'included':
        return;
      case 'extend':
      case 'upgrade':
        if (ctaPlanId != null) {
          onUpgrade?.(ctaPlanId);
        }
        return;
      default: {
        const exhaustiveCheck: never = ctaKind;
        void exhaustiveCheck;
      }
    }
  }, [ctaKind, ctaPlanId, onUpgrade]);

  const isActionMissingHandler =
    (ctaKind === 'extend' || ctaKind === 'upgrade') && onUpgrade == null;

  const isActionDisabled = isCtaDisabled || isActionMissingHandler;
  const priceLabel = formatTierPriceLabel(tier.price, lang);

  return (
    <div
      className={`relative rounded-[2.2rem] p-6 md:p-8 flex flex-col justify-between overflow-hidden transition-all duration-300 ${styles.card}`}
    >
      <div className="relative mb-8 pt-4">
        {isCurrentTier ? (
          <div className="absolute -top-2 -left-2 z-20">
            <span
              className={`text-[9px] px-2.5 py-1 rounded-full border whitespace-nowrap font-black uppercase tracking-wider shadow-sm ${styles.currentBadge}`}
            >
              {copy.currentPlan}
            </span>
          </div>
        ) : null}

        {tier.badgeLabel != null ? (
          <div className="absolute -top-2 -right-2 z-20">
            <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border whitespace-nowrap shadow-sm bg-blue-600 text-white border-blue-400">
              {tier.badgeLabel}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 shrink-0">{renderTierIcon(tier.theme)}</div>
          <div className="text-left">
            <div
              className={`text-sm font-black tracking-[0.2em] uppercase ${styles.title}`}
            >
              {tier.label}
            </div>
            <div
              className={`text-[11px] font-medium ${styles.subtitle}`}
            >
              {tier.subtitle}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full">
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-black tracking-tight ${styles.price}`}
            >
              {priceLabel}
            </span>
            <span
              className={`text-xs font-medium ${styles.priceNote}`}
            >
              {tier.price.note}
            </span>
          </div>
        </div>

        <ul className={`space-y-3 mb-8 text-xs ${styles.featureList}`}>
          {tier.features.map((feature) => (
            <li
              key={`${tier.id}-${feature.id}`}
              className={`flex items-start gap-2.5 ${feature.isLocked === true ? 'opacity-40' : ''}`}
            >
              <div className="mt-0.5 shrink-0">
                {feature.isLocked === true ? (
                  <Lock size={12} className="text-slate-500" />
                ) : (
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${styles.featureDot}`}
                  >
                    <Check
                      size={9}
                      className={styles.featureCheck}
                    />
                  </div>
                )}
              </div>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>

        <TierActionButton
          theme={tier.theme}
          ctaKind={ctaKind}
          label={ctaLabel}
          isInTossApp={isInTossApp}
          isDisabled={isActionDisabled}
          onClick={handleAction}
        />
      </div>
    </div>
  );
});

TierCard.displayName = 'TierCard';

const PricingAiSection = React.memo(function PricingAiSection({
  copy,
  activeIndex,
  onAdvance,
}: {
  copy: PricingAiSectionCopy;
  activeIndex: number;
  onAdvance: () => void;
}): React.ReactElement {
  const activePreviewId = getActivePreviewId(copy.previewCards, activeIndex);
  const hasPreviewCards = copy.previewCards.length > 0;

  return (
    <section className="mt-40 mb-20 p-8 md:p-16 rounded-[3rem] bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 transition-all">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">
            <Brain size={14} />
            <span>{copy.eyebrowLabel}</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight whitespace-pre-line">
            {copy.title}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-lg">
            {copy.description}
          </p>

          <div className="space-y-4">
            {copy.bulletItems.map((bulletItem) => (
              <div
                key={bulletItem.id}
                className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Check size={14} />
                </div>
                <span className="text-sm md:text-base">{bulletItem.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          {hasPreviewCards ? (
            <div
              role="button"
              tabIndex={0}
              onClick={onAdvance}
              onKeyDown={(event) => handleKeyDownAsClick(event, onAdvance)}
              aria-label={copy.advancePreviewAriaLabel}
              className="relative bg-transparent p-0 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-[1.5rem]"
            >
              <div className="relative select-none" style={AI_PREVIEW_FRAME_STYLE}>
                {copy.previewCards.map((previewCard) => {
                  const isActive = previewCard.id === activePreviewId;
                  const layerVisibilityClass = isActive
                    ? 'opacity-100 z-30'
                    : 'opacity-0 z-10 pointer-events-none';

                  return (
                    <div
                      key={previewCard.id}
                      aria-hidden={!isActive}
                      className={`absolute inset-0 transition-opacity duration-500 ${layerVisibilityClass}`}
                    >
                      <div className="relative h-full rounded-2xl overflow-hidden shadow-xl bg-slate-900 flex items-center justify-center border border-white/10">
                        <img
                          src={previewCard.imageSrc}
                          alt={previewCard.imageAlt}
                          className="max-w-full max-h-full object-contain"
                          aria-hidden={!isActive}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});

PricingAiSection.displayName = 'PricingAiSection';

const PricingTelegramSection = React.memo(function PricingTelegramSection({
  copy,
  activeIndex,
  onAdvance,
}: {
  copy: PricingMessageSet['sections']['telegram'];
  activeIndex: number;
  onAdvance: () => void;
}): React.ReactElement {
  const activePreviewId = getActivePreviewId(copy.previewCards, activeIndex);
  const hasPreviewCards = copy.previewCards.length > 0;

  return (
    <section className="mt-40 mb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="relative">
          {hasPreviewCards ? (
            <div
              role="button"
              tabIndex={0}
              onClick={onAdvance}
              onKeyDown={(event) => handleKeyDownAsClick(event, onAdvance)}
              aria-label={copy.advancePreviewAriaLabel}
              className="block w-full bg-transparent p-0 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-[3rem]"
            >
              <div className="relative w-full max-w-[320px] mx-auto bg-[#1a1c23] rounded-[3rem] border-8 border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
                <div className="rounded-[2rem] bg-[#0e1117] overflow-hidden m-2">
                  <div className="flex items-center gap-3 px-5 py-4 bg-slate-900/80 border-b border-white/5">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black">
                      {copy.avatarText}
                    </div>
                    <div className="text-xs font-black text-white">{copy.appName}</div>
                  </div>

                  <div className="p-4 overflow-hidden" style={TELEGRAM_SCROLL_STYLE}>
                    <div className="relative min-h-[220px]">
                      {copy.previewCards.map((previewCard: PricingTelegramPreviewCard) => {
                        const isActive = previewCard.id === activePreviewId;
                        const visibilityClassName = isActive
                          ? 'relative opacity-100'
                          : 'absolute inset-0 opacity-0 pointer-events-none';

                        return (
                          <div
                            key={previewCard.id}
                            aria-hidden={!isActive}
                            className={`p-4 rounded-2xl bg-slate-800 border border-white/5 transition-opacity duration-300 ${visibilityClassName}`}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[8px] font-bold border ${TELEGRAM_BADGE_STYLES[previewCard.badgeTone]}`}
                              >
                                {previewCard.badge}
                              </span>
                              <span className="text-[8px] text-slate-500">{previewCard.time}</span>
                            </div>

                            <p className="text-[10px] text-slate-300 mb-3">
                              {previewCard.intro}
                            </p>

                            <div className="space-y-1">
                              {previewCard.lines.map((previewLine) => (
                                <div
                                  key={previewLine.id}
                                  className={`text-[9px] ${TELEGRAM_LINE_STYLES[previewLine.tone]}`}
                                >
                                  {`• ${previewLine.text}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest">
            <Bell size={14} />
            <span>{copy.eyebrowLabel}</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight whitespace-pre-line">
            {copy.title}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed">
            {copy.description}
          </p>
        </div>
      </div>
    </section>
  );
});

PricingTelegramSection.displayName = 'PricingTelegramSection';

export default function Pricing({
  lang,
  currentTier,
  onUpgrade,
}: PricingProps): React.ReactElement {
  const copy = getPricingMessages(lang);
  const { isInTossApp } = useTossApp();
  const [telegramPreviewIndex, setTelegramPreviewIndex] = useState(0);
  const [aiPreviewIndex, setAiPreviewIndex] = useState(0);

  const handleAdvanceTelegramPreview = useCallback((): void => {
    setTelegramPreviewIndex((currentIndex) =>
      getNextPreviewIndex(currentIndex, copy.sections.telegram.previewCards.length),
    );
  }, [copy.sections.telegram.previewCards.length]);

  const handleAdvanceAiPreview = useCallback((): void => {
    setAiPreviewIndex((currentIndex) =>
      getNextPreviewIndex(currentIndex, copy.sections.ai.previewCards.length),
    );
  }, [copy.sections.ai.previewCards.length]);

  return (
    <div className="relative min-h-[70vh] pb-20 font-sans">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-32 -left-16 w-80 h-80 bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-transparent rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/25 via-amber-500/10 to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      <div className="max-w-5xl mx-auto px-4">
        <PricingHero copy={copy.hero} />

        <section className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {copy.tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              lang={lang}
              currentTier={currentTier}
              copy={copy}
              isInTossApp={isInTossApp}
              onUpgrade={onUpgrade}
            />
          ))}
        </section>

        <PricingAiSection
          copy={copy.sections.ai}
          activeIndex={aiPreviewIndex}
          onAdvance={handleAdvanceAiPreview}
        />

        <PricingTelegramSection
          copy={copy.sections.telegram}
          activeIndex={telegramPreviewIndex}
          onAdvance={handleAdvanceTelegramPreview}
        />
      </div>
    </div>
  );
}
```

## 8. 구현 순서

1. `pricingMessages.ts` 타입 확장
   - hero / ai / telegram / CTA labels / feature rows
   - Pricing 화면에서 노출할 FREE / PRO만 유지
2. `Pricing.tsx` presentation block 복원
   - Hero
   - TierCard
   - AI
   - Telegram
3. CTA resolver 치환
   - `current`
   - `included`
   - `extend`
   - `upgrade`
   - `notify`
4. CheckoutModal 그대로 유지
5. QA
   - Web
   - Toss mini-app
   - Free / Pro / Premium states

## 9. 검증 체크리스트

### 9.1 시각 검증

- 상단 블러 그라디언트 배경이 과거와 동일 톤으로 보입니다.
- `Membership` 히어로 타이포와 간격이 과거와 동일합니다.
- FREE / PRO 카드의 시각 톤과 조형이 과거와 최대한 동일합니다.
- Premium 관련 카드/배지/문구는 Pricing 탭 어디에도 노출되지 않습니다.
- Telegram 섹션의 종 아이콘(`Bell`) import 누락이 없습니다.
- AI / Telegram 프리뷰 래퍼는 `button`이 아니라 `div role="button"` 패턴으로 구현됩니다.
- AI 섹션의 3D 프레임과 `ai_step_*.jpg` 전환이 복원됩니다.
- 텔레그램 폰 프레임 목업이 복원됩니다.

### 9.2 구조 검증

- `Pricing.tsx` JSX 안에 `isKo ? '...' : '...'` 가 없습니다.
- preview mock text가 `pricingMessages.ts` 밖에 흩어져 있지 않습니다.
- CTA 라벨 결정을 JSX에서 하지 않습니다.
- theme class 결정을 JSX에서 하지 않습니다.
- 3중첩 ternary가 없습니다.

### 9.3 동작 검증

- `free -> included/current`
- `pro current -> extend`
- `premium user viewing pro -> included`
- Pricing 탭에 `premium`, `COMING SOON`, `Get Notified`, `notify` CTA가 전혀 노출되지 않습니다.
- AI preview 비활성 레이어는 `opacity-0` + `pointer-events-none` 으로 처리되어 잔상 겹침이 없습니다.
- AI preview 비활성 이미지/레이어에는 `aria-hidden`이 적용되어 스크린 리더가 숨은 이미지를 읽지 않습니다.
- Telegram preview 내부는 `overflow-hidden`으로 유지되어 스크롤-클릭 충돌이 없습니다.
- `web -> button`
- `toss -> TDSButton`
- preview 데이터가 비어도 modulo-by-zero / `NaN`가 발생하지 않습니다.

### 9.4 Checkout 검증

- `CheckoutModal.tsx`는 current implementation을 유지합니다.
- `handlePay`의 `try/catch/finally` 구조를 되돌리지 않습니다.
- `showErrorToast(copy.paymentFailed)` / `showErrorToast(copy.systemError)` 경로를 유지합니다.
- `isExecutingRef`와 `isUnmounted` 보호를 유지합니다.

## 10. 결론

가장 안전한 복원 방법은 **`efb58ee`의 FREE / PRO 시각 언어만 되살리고, C4가 도입한 메시지 SSOT / resolver 구조 / async safety는 그대로 두며, 출시 전인 `premium`은 Pricing 탭에서 완전히 제외하는 것**입니다.

핵심은 다음 한 줄로 요약됩니다.

> **디자인은 과거로, 분기와 메시지 구조는 현재로.**

이 방식이 가장 낮은 회귀 위험으로 사용자가 원하는 “예전의 화려함”을 되찾는 경로입니다.
