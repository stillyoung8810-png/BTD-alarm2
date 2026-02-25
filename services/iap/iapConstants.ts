export const IAP_PRODUCTS = {
  PRO: 'ait.0000019657.865b2b73.2082393ca6.1984429523', // 소모품 (30일 이용권)
} as const;

export type IapPlanType = keyof typeof IAP_PRODUCTS;

export function getSkuByPlanId(planId: string): string | null {
  const normalized = planId.toUpperCase();
  if (normalized in IAP_PRODUCTS) {
    return IAP_PRODUCTS[normalized as IapPlanType];
  }
  return null;
}
