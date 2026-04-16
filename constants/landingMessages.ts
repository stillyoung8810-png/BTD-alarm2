import type { AppLang } from '../types';
import type { LandingFeatureId } from './landingConfig';

/** 번역 문자열로 분기하지 않고 레이아웃만 구분 (Rule: string-based logic 금지) */
export type LandingHeroTitleLayout = 'ko_brand_lines' | 'en_brand_lines';

export type LandingHeroTitle =
  | {
      layout: 'ko_brand_lines';
      line1Before: string;
      line1Highlight: string;
      line1After: string;
      line2: string;
    }
  | {
      layout: 'en_brand_lines';
      line1: string;
      line2Highlight: string;
      line2After: string;
    };

export interface LandingPageCopy {
  hero: {
    badge: string;
    title: LandingHeroTitle;
    body: string;
    ctaSignup: string;
    ctaLogin: string;
    ctaTossLogin: string;
  };
  trustLine: string;
  featureLabels: Record<LandingFeatureId, string>;
}

const LANDING_PAGE_COPY_KO: LandingPageCopy = {
  hero: {
    badge: '로그인 후 시작하세요',
    title: {
      layout: 'ko_brand_lines',
      line1Before: '나만의 ',
      line1Highlight: 'BUY THE DIP',
      line1After: ' 전략을',
      line2: '저장하고 관리하세요.',
    },
    body: '나만의 매매 전략을 설정하고, 투자 루틴을 위한 정기 알림으로 자산을 체계적으로 불려 나가세요. 프리미엄 등급의 매니징 경험을 제공합니다.',
    ctaSignup: '무료로 시작하기',
    ctaLogin: '이미 계정이 있으신가요? 로그인',
    ctaTossLogin: 'TOSS로 계속하기',
  },
  trustLine: '안전하고 신뢰할 수 있는 자산 관리 플랫폼',
  featureLabels: {
    secureAssetManagement: '안전한 자산 관리',
    quickTradeEntry: '빠른 매매 입력',
    realTimeMarketData: '실시간 마켓 데이터',
    customAlertSettings: '커스텀 알람 설정',
  },
};

const LANDING_PAGE_COPY_EN: LandingPageCopy = {
  hero: {
    badge: 'Sign in to get started',
    title: {
      layout: 'en_brand_lines',
      line1: 'Save and manage your own',
      line2Highlight: 'BUY THE DIP',
      line2After: ' strategies.',
    },
    body: 'Set your own trading strategies and grow your assets systematically with recurring alerts for your investment routine. Experience premium-grade portfolio management.',
    ctaSignup: 'Start for Free',
    ctaLogin: 'Already have an account? Log in',
    ctaTossLogin: 'Continue with TOSS',
  },
  trustLine: 'Secure & Trusted Asset Management Platform',
  featureLabels: {
    secureAssetManagement: 'Secure Asset Management',
    quickTradeEntry: 'Quick Trade Entry',
    realTimeMarketData: 'Real-time Market Data',
    customAlertSettings: 'Custom Alert Settings',
  },
};

const LANDING_PAGE_COPY: Record<AppLang, LandingPageCopy> = {
  ko: LANDING_PAGE_COPY_KO,
  en: LANDING_PAGE_COPY_EN,
};

export function getLandingPageCopy(lang: AppLang): LandingPageCopy {
  return LANDING_PAGE_COPY[lang];
}
