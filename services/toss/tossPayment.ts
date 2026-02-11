/**
 * 토스페이 결제 요청: 브릿지로 결제 실행만 수행.
 * 결제 검증(Verify)은 paymentService에서 BFF(Railway)를 통해 반드시 수행합니다.
 */

import { isTossApp, loadWebFramework } from './tossBridge';
import type { PaymentResult } from '../payment/types';

const PAYMENT_TIMEOUT_MS = 120_000;

export interface TossPaymentRequest {
  paymentId: string;
  orderName: string;
  totalAmount: number;
  planId: string;
  customerId?: string;
}

/**
 * 토스 앱 내에서 토스페이 결제 요청. 성공 시 paymentId를 반환하여 BFF 검증에 사용.
 */
export async function requestTossPayment(params: TossPaymentRequest): Promise<PaymentResult> {
  if (!isTossApp()) {
    return {
      success: false,
      paymentId: params.paymentId,
      code: 'NOT_TOSS_APP',
      message: '토스 앱 환경이 아닙니다.',
    };
  }

  const bridge = typeof window !== 'undefined' ? window.TossApp : undefined;
  const requestPayment = bridge?.requestPayment;
  if (!requestPayment) {
    try {
      await loadWebFramework();
    } catch {
      // ignore
    }
    const afterLoad = typeof window !== 'undefined' ? window.TossApp?.requestPayment : undefined;
    if (!afterLoad) {
      return {
        success: false,
        paymentId: params.paymentId,
        code: 'BRIDGE_UNAVAILABLE',
        message: '토스페이를 사용할 수 없는 환경입니다.',
      };
    }
    return runPaymentRequest(afterLoad, params);
  }
  return runPaymentRequest(requestPayment, params);
}

function runPaymentRequest(
  requestPayment: (p: { orderName: string; totalAmount: number; orderId?: string; [key: string]: unknown }) => Promise<{ success?: boolean; paymentId?: string; txId?: string; code?: string; message?: string }>,
  params: TossPaymentRequest,
): Promise<PaymentResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);

  const payload = {
    orderName: params.orderName,
    totalAmount: params.totalAmount,
    orderId: params.paymentId,
    planId: params.planId,
    customerId: params.customerId,
  };

  return requestPayment(payload)
    .then((res) => {
      clearTimeout(timeoutId);
      const success = res.success !== false && !res.code;
      return {
        success,
        paymentId: res.paymentId ?? params.paymentId,
        transactionType: success ? 'PAYMENT' : undefined,
        txId: res.txId,
        code: res.code,
        message: res.message,
      };
    })
    .catch((err: unknown) => {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : '결제 요청 중 오류가 발생했습니다.';
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        success: false,
        paymentId: params.paymentId,
        code: isAbort ? 'TIMEOUT' : 'SDK_ERROR',
        message: isAbort ? '결제 요청 시간이 초과되었습니다.' : message,
      };
    });
}
