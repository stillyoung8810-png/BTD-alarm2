import type { AppLang } from '@/types';

export type PricingTierId = 'free' | 'pro' | 'premium';

export type PricingTierTheme = 'free' | 'pro' | 'premium';

export interface PricingTierRow {
  id: PricingTierId;
  label: string;
  subtitle: string;
  theme: PricingTierTheme;
}

export interface PricingCheckoutMessages {
  pay: string;
  processing: string;
  paymentFailed: string;
  systemError: string;
}

export interface PricingMessageSet {
  tiers: readonly PricingTierRow[];
  currentPlan: string;
  notifyWhenReleased: string;
  upgradeNow: string;
  checkout: PricingCheckoutMessages;
}

const PRICING_MESSAGES: Record<AppLang, PricingMessageSet> = {
  ko: {
    tiers: [
      {
        id: 'free',
        label: 'FREE',
        subtitle: '기본 알람·시장 데이터로 시작하세요.',
        theme: 'free',
      },
      {
        id: 'pro',
        label: 'PRO',
        subtitle: '유료 종목·백테스트·텔레그램 연동.',
        theme: 'pro',
      },
      {
        id: 'premium',
        label: 'PREMIUM',
        subtitle: '곧 공개됩니다.',
        theme: 'premium',
      },
    ],
    currentPlan: '사용 중인 플랜',
    notifyWhenReleased: '출시 알림 받기',
    upgradeNow: '업그레이드하기',
    checkout: {
      pay: '결제하기',
      processing: '처리 중…',
      paymentFailed: '결제에 실패했습니다. 다시 시도하거나 다른 수단을 이용해 주세요.',
      systemError: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    },
  },
  en: {
    tiers: [
      {
        id: 'free',
        label: 'FREE',
        subtitle: 'Start with core alerts and market data.',
        theme: 'free',
      },
      {
        id: 'pro',
        label: 'PRO',
        subtitle: 'Paid tickers, backtest, and Telegram.',
        theme: 'pro',
      },
      {
        id: 'premium',
        label: 'PREMIUM',
        subtitle: 'Coming soon.',
        theme: 'premium',
      },
    ],
    currentPlan: 'Current plan',
    notifyWhenReleased: 'Get notified',
    upgradeNow: 'Upgrade now',
    checkout: {
      pay: 'Pay now',
      processing: 'Processing…',
      paymentFailed:
        'Payment failed. Please try again or use another method.',
      systemError: 'A temporary error occurred. Please try again later.',
    },
  },
};

const PRICING_MESSAGE_CACHE = new Map<AppLang, PricingMessageSet>();

export function getPricingMessages(lang: AppLang): PricingMessageSet {
  const cached = PRICING_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = PRICING_MESSAGES[lang];
  PRICING_MESSAGE_CACHE.set(lang, messages);
  return messages;
}
