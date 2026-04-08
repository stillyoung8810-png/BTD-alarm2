import type { OrderLevel, VrSnapshot } from '../types';
import { EMPTY_VR_ORDERS } from '../constants/vrConstants';

/**
 * VR 예약 주문 모달용: Step 0 행 + 스냅샷 주문 병합 (SSOT).
 * 스냅샷 없으면 동일 참조 EMPTY_VR_ORDERS 반환.
 */
export function useVrOrders(vrSnapshot: VrSnapshot | null | undefined): {
  safeBuyOrders: OrderLevel[];
  safeSellOrders: OrderLevel[];
} {
  if (vrSnapshot == null) {
    return { safeBuyOrders: EMPTY_VR_ORDERS, safeSellOrders: EMPTY_VR_ORDERS };
  }

  const step0: OrderLevel = {
    step: 0,
    price: 0,
    qty: 0,
    isBuffer: false,
    sharesAfter: vrSnapshot.shares,
    poolAfter: vrSnapshot.pool,
  };

  return {
    safeBuyOrders: [step0, ...(vrSnapshot.buyOrders ?? [])],
    safeSellOrders: [step0, ...(vrSnapshot.sellOrders ?? [])],
  };
}
