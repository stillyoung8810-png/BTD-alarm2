/**
 * 구독/결제 관련 공통 유틸 (Edge Functions 전용)
 * verify-payment, payment-webhook 등에서 import하여 DRY 유지.
 */

/**
 * 현재 시각 기준 N일 후 ISO 문자열 (서비스 이용 만료일 계산)
 */
export function getServiceExpiresAt(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
