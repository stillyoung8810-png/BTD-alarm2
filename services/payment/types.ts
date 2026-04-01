/**
 * Toss IAP 전용 체크아웃 상수.
 */
export type CheckoutPlanId = 'pro' | 'premium';

/** Toss mini-app Phase 1: PRO 30일권 1건만 허용 */
export const TOSS_IAP_FIXED_PLAN_ID = 'pro' as const satisfies CheckoutPlanId;
export const TOSS_IAP_FIXED_QUANTITY = 1;

/** 1개당 이용 일수 */
export const PLAN_DAYS_PER_UNIT = 30;
