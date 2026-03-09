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
