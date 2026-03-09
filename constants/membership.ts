/**
 * MembershipConfig — 멤버십 가격 Single Source of Truth (프론트엔드)
 *
 * - 단가: VITE_PLAN_AMOUNT_PRO / VITE_PLAN_AMOUNT_PREMIUM 환경변수에서 읽어옴.
 * - Supabase Edge Functions 및 BFF(Node)는 PLAN_AMOUNT_PRO / PLAN_AMOUNT_PREMIUM 을 사용한다.
 * - 네이밍/단가가 백엔드와 반드시 일치해야 하며, 하드코딩 금지.
 */

// ---------------------------------------------------------------------------
// Plan 타입
// ---------------------------------------------------------------------------
export const PLAN_TYPES = ['pro', 'premium'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export interface PlanConfig {
  type: PlanType;
  rawAmount: number;
  currency: 'KRW';
  displayName: string;
  subtitle: { ko: string; en: string };
  features: { ko: string[]; en: string[] };
}

// ---------------------------------------------------------------------------
// 환경변수 로더 (검증 포함)
// ---------------------------------------------------------------------------
const FALLBACK_PRO = 5907;
const FALLBACK_PREMIUM = 9900;

function loadPlanAmount(envValue: unknown, fallback: number, planName: string): number {
  if (envValue == null || envValue === '') return fallback;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
      console.error(`[MembershipConfig] Invalid PLAN_AMOUNT_${planName}: "${envValue}" → fallback ${fallback}`);
    }
    return fallback;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 인스턴스 (앱 시작 시 1회 계산)
// ---------------------------------------------------------------------------
const RAW_PRO = loadPlanAmount(import.meta.env.VITE_PLAN_AMOUNT_PRO, FALLBACK_PRO, 'PRO');
const RAW_PREMIUM = loadPlanAmount(import.meta.env.VITE_PLAN_AMOUNT_PREMIUM, FALLBACK_PREMIUM, 'PREMIUM');

const PRO_CONFIG: PlanConfig = {
  type: 'pro',
  rawAmount: RAW_PRO,
  currency: 'KRW',
  displayName: 'PRO',
  subtitle: { ko: '전문 투자자', en: 'Active Investor' },
  features: {
    ko: ['포트폴리오 최대 5개', '알람 슬롯 10개', '기본 13개 + PRO 전용 종목', 'AI 매매 인식 (50회/월)', '텔레그램 상세 알림', '광고 제거'],
    en: ['Up to 5 portfolios', '10 alert slots', 'Core + PRO tickers', 'AI Trade Recognition (50/mo)', 'Detailed Telegram alerts', 'No ads'],
  },
};

const PREMIUM_CONFIG: PlanConfig = {
  type: 'premium',
  rawAmount: RAW_PREMIUM,
  currency: 'KRW',
  displayName: 'PREMIUM',
  subtitle: { ko: '슈퍼 고래', en: 'Power User' },
  features: {
    ko: ['포트폴리오 최대 20개', '알람 슬롯 40개', '모든 종목 + 베타 종목', 'AI 매매 인식 (무제한)', '신규 전략 선공개', 'VIP 전용 고객 지원'],
    en: ['Up to 20 portfolios', '40 alert slots', 'All tickers + beta', 'Unlimited AI Recognition', 'Early access to strategies', 'VIP priority support'],
  },
};

export const MembershipConfig = {
  PRO: PRO_CONFIG,
  PREMIUM: PREMIUM_CONFIG,
  byType: { pro: PRO_CONFIG, premium: PREMIUM_CONFIG } as Record<PlanType, PlanConfig>,
} as const;
