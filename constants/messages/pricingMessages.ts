import type { AppLang } from '@/types';

export type PricingTierId = 'free' | 'pro';
export type PricingTierTheme = 'free' | 'pro';

export type PricingTierPrice =
  | { kind: 'static'; label: string; note: string }
  | { kind: 'membershipConfig'; plan: 'pro'; note: string };

export type PricingTelegramPreviewLineTone =
  | 'text'
  | 'buy'
  | 'sell'
  | 'footer';

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
  priceTba: string;
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
          { id: 'core-etfs', text: '기본 종목 ETF' },
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
          { id: 'paid-tickers', text: '기본 종목 + PRO 전용 종목' },
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
    priceTba: '가격 미정',
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
            intro:
              '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
            time: '18:00',
            lines: [
              { id: 'title', text: '다분할 매매법', tone: 'text' },
              {
                id: 'alarm',
                text: '알람 시간 (KST): 17:10, 18:00',
                tone: 'text',
              },
              { id: 'buy-1', text: 'LOC 매수1: 55.14 / 9주', tone: 'buy' },
              { id: 'buy-2', text: 'LOC 매수2: 60.37 / 8주', tone: 'buy' },
              { id: 'sell-1', text: 'LOC 매도: 60.38 / 4주', tone: 'sell' },
              {
                id: 'sell-2',
                text: '지정가 매도: 60.65 / 13주',
                tone: 'sell',
              },
            ],
          },
          {
            id: 'custom-strategy-mix',
            badge: '커스텀 전략 혼합',
            badgeTone: 'accent',
            intro:
              '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
            time: '09:00',
            lines: [
              { id: 'title', text: '다분할 매매법', tone: 'text' },
              { id: 'alarm', text: '알람 시간 (KST): 09:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC 매수2: 54.56 / 18주', tone: 'buy' },
              { id: 'sell-1', text: 'LOC 매도: 54.57 / 100주', tone: 'sell' },
              {
                id: 'sell-2',
                text: '지정가 매도: 60.65 / 300주',
                tone: 'sell',
              },
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
            intro:
              '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.',
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
      paymentFailed:
        '결제에 실패했습니다. 다시 시도하거나 다른 수단을 이용해 주세요.',
      systemError:
        '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    },
  },
  en: {
    hero: {
      title: 'Membership',
      description:
        'Simple but powerful benefits. Choose the right membership to scale your strategies.',
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
          { id: 'core-etfs', text: 'Core ETFs' },
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
    priceTba: 'Price TBA',
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
            intro:
              'Your set trading alarm time. Please check your portfolio strategy.',
            time: '18:00',
            lines: [
              { id: 'title', text: 'Multi-split trading', tone: 'text' },
              {
                id: 'alarm',
                text: 'Alarm (KST): 17:10, 18:00',
                tone: 'text',
              },
              { id: 'buy-1', text: 'LOC Buy 1: 55.14 / 9 sh', tone: 'buy' },
              { id: 'buy-2', text: 'LOC Buy 2: 60.37 / 8 sh', tone: 'buy' },
              { id: 'sell-1', text: 'LOC Sell: 60.38 / 4 sh', tone: 'sell' },
              {
                id: 'sell-2',
                text: 'Limit Sell: 60.65 / 13 sh',
                tone: 'sell',
              },
            ],
          },
          {
            id: 'custom-strategy-mix',
            badge: 'Custom Strategy Mix',
            badgeTone: 'accent',
            intro:
              'Your set trading alarm time. Please check your portfolio strategy.',
            time: '09:00',
            lines: [
              { id: 'title', text: 'Multi-split trading', tone: 'text' },
              { id: 'alarm', text: 'Alarm (KST): 09:00', tone: 'text' },
              { id: 'buy-1', text: 'LOC Buy 2: 54.56 / 18 sh', tone: 'buy' },
              { id: 'sell-1', text: 'LOC Sell: 54.57 / 100 sh', tone: 'sell' },
              {
                id: 'sell-2',
                text: 'Limit Sell: 60.65 / 300 sh',
                tone: 'sell',
              },
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
            intro:
              'Your set trading alarm time. Please check your portfolio strategy.',
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
