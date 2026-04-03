/**
 * 통화 포맷팅 유틸리티
 * — 현재는 KRW 전용. 다통화 확장 시 이 파일만 수정.
 */

import {
  areFiniteNonNegativeScalars,
  areStrictPositiveFiniteScalars,
  isStrictPositiveFiniteNumber,
} from './financialScalarGuards';
import { floorToNonNegativeInt } from './financialMath';

const krwFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

export function formatPriceKRW(amount: number): string {
  if (!areFiniteNonNegativeScalars(amount)) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
      console.error('[formatPriceKRW] Invalid amount:', amount);
    }
    return krwFormatter.format(0);
  }
  return krwFormatter.format(amount);
}

/** 결제 SSOT는 KRW(`MembershipConfig`). 영문 멤버십 카드 USD는 UI 표시용 고정 환율만 사용(실시간 환율 아님). */
const KRW_PER_USD_MEMBERSHIP_DISPLAY = 1000;

const usdMembershipFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPriceUSDForDisplay(amountKrw: number): string {
  if (!areFiniteNonNegativeScalars(amountKrw)) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
      console.error('[formatPriceUSDForDisplay] Invalid amountKrw:', amountKrw);
    }
    return usdMembershipFormatter.format(0);
  }
  const usd = amountKrw / KRW_PER_USD_MEMBERSHIP_DISPLAY;
  return usdMembershipFormatter.format(usd + Number.EPSILON);
}

/** KRW 총액: 제품 정책 내림, 비정상 입력 시 0 (렌더 경로 throw 금지). */
export function calculateSafeTotalAmountKRW(
  price: number | undefined,
  quantity: number,
): number {
  if (!isStrictPositiveFiniteNumber(price)) {
    return 0;
  }

  if (!areStrictPositiveFiniteScalars(quantity)) {
    return 0;
  }

  return floorToNonNegativeInt(price * quantity);
}
