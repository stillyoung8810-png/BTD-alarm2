/**
 * 통화 포맷팅 유틸리티
 * — 현재는 KRW 전용. 다통화 확장 시 이 파일만 수정.
 */

const krwFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

export function formatPriceKRW(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
      console.error('[formatPriceKRW] Invalid amount:', amount);
    }
    return krwFormatter.format(0);
  }
  return krwFormatter.format(amount);
}

/** KRW 총액: 제품 정책 내림, 비정상 입력 시 0 (렌더 경로 throw 금지). */
export function calculateSafeTotalAmountKRW(
  price: number | undefined,
  quantity: number,
): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return 0;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }
  return Math.floor(price * quantity + Number.EPSILON);
}
