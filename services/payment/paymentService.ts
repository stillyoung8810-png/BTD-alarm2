/**
 * 포트원 V2 결제 서비스
 *
 * - 포트원(PortOne) V2 브라우저 SDK를 동적으로 로드합니다.
 * - 확장 가능한 구조: PG사 · 간편결제 공급자 · 인앱 결제 추가 시 이 파일만 변경하면 됩니다.
 * - 토스 미니앱 환경 대응 자리도 미리 확보되어 있습니다.
 */

import { supabase } from '../supabase';
import { isTossApp } from '../tossAppBridge';
import type {
  PayMethod,
  PaymentRequest,
  PaymentResult,
  OrderRecord,
} from './types';

// ---------------------------------------------------------------------------
// 상수 (식별 정보)
// ---------------------------------------------------------------------------
const STORE_ID = 'store-cb0db9eb-1c27-49b4-98ff-d6c07e30bcef';
const NICEPAY_CHANNEL_KEY = 'channel-key-0f1b9375-7c55-4ff1-986f-69b37566951b';
const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

// ---------------------------------------------------------------------------
// 포트원 V2 SDK 동적 로드
// ---------------------------------------------------------------------------
/** 이미 로드된 SDK 인스턴스 */
let portOneInstance: typeof window.PortOne | null = null;

/** 중복 로드 방지용 Promise 캐시 */
let loadPromise: Promise<typeof window.PortOne> | null = null;

/**
 * 포트원 V2 브라우저 SDK를 <script> 태그로 동적 로드합니다.
 * 이미 로드됐으면 캐시된 인스턴스를 반환합니다.
 */
export async function loadPortOneSDK(): Promise<typeof window.PortOne> {
  // 이미 로드됨
  if (portOneInstance) return portOneInstance;

  // window에 이미 존재하는지 확인 (index.html에 수동 삽입된 경우 대비)
  if (window.PortOne) {
    portOneInstance = window.PortOne;
    return portOneInstance;
  }

  // 중복 호출 방어
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<typeof window.PortOne>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PORTONE_SDK_URL;
    script.async = true;

    script.onload = () => {
      if (window.PortOne) {
        portOneInstance = window.PortOne;
        resolve(portOneInstance);
      } else {
        reject(new Error('포트원 SDK 로드 후 window.PortOne을 찾을 수 없습니다.'));
      }
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('포트원 SDK 스크립트 로드에 실패했습니다.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

// ---------------------------------------------------------------------------
// PayMethod → 포트원 V2 `payMethod` 매핑
// ---------------------------------------------------------------------------
function mapPayMethodToPortOne(method: PayMethod): string {
  const map: Record<PayMethod, string> = {
    CARD: 'CARD',
    VIRTUAL_ACCOUNT: 'VIRTUAL_ACCOUNT',
    TRANSFER: 'TRANSFER',
    MOBILE: 'MOBILE',
    EASY_PAY: 'EASY_PAY',
  };
  return map[method] ?? 'CARD';
}

// ---------------------------------------------------------------------------
// 고유 결제 ID 생성
// ---------------------------------------------------------------------------
function generatePaymentId(): string {
  return `order_${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// 결제 요청
// ---------------------------------------------------------------------------
/**
 * 포트원 V2 결제창을 호출합니다.
 *
 * @param req - 결제 요청 파라미터
 * @returns PaymentResult
 */
export async function requestPayment(req: PaymentRequest): Promise<PaymentResult> {
  const paymentId = generatePaymentId();

  // ── 토스 미니앱 환경 ──────────────────────────────────────
  if (isTossApp()) {
    // TODO: 토스 브릿지 결제 최적화 로직
    // 토스 미니앱 내에서는 포트원 대신 토스페이 브릿지를 통해
    // 보다 네이티브한 결제 경험을 제공할 수 있습니다.
    // 예시:
    //   const bridge = await loadWebFramework();
    //   const result = await bridge.partner.requestPayment({ ... });
    //   return { success: true, paymentId, ... };
    //
    // 현재는 아래 포트원 표준 결제창을 동일하게 사용합니다.
    console.info('[Payment] 토스 미니앱 환경 — 포트원 표준 결제창 사용');
  }

  // ── 포트원 V2 표준 결제창 ──────────────────────────────────
  const PortOne = await loadPortOneSDK();

  const portOneRequest: Record<string, unknown> = {
    storeId: STORE_ID,
    channelKey: NICEPAY_CHANNEL_KEY,
    paymentId,
    orderName: req.orderName,
    totalAmount: req.totalAmount,
    currency: 'CURRENCY_KRW',
    payMethod: mapPayMethodToPortOne(req.payMethod),
    customer: {
      ...(req.customerEmail ? { email: req.customerEmail } : {}),
      ...(req.customerId ? { customerId: req.customerId } : {}),
    },
    // Webhook에서 사용자/플랜 식별용 (서버 검증 실패 시 fallback)
    customData: JSON.stringify({
      userId: req.customerId,
      planId: req.planId,
    }),
  };

  // 간편결제 세부 분기
  if (req.payMethod === 'EASY_PAY' && req.easyPayProvider) {
    portOneRequest.easyPay = {
      easyPayProvider: req.easyPayProvider,
    };
  }

  try {
    const response = await PortOne.requestPayment(portOneRequest);

    if (response.code != null) {
      // 사용자 취소 또는 PG 에러
      return {
        success: false,
        paymentId,
        code: response.code,
        message: response.message ?? '결제가 취소되었거나 실패했습니다.',
      };
    }

    // 결제 성공
    return {
      success: true,
      paymentId,
      transactionType: response.transactionType,
      txId: response.txId,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '알 수 없는 결제 오류';
    return {
      success: false,
      paymentId,
      code: 'SDK_ERROR',
      message: msg,
    };
  }
}

// ---------------------------------------------------------------------------
// 서버 측 결제 검증 (핵심 보안 로직)
// ---------------------------------------------------------------------------
/**
 * verify-payment Edge Function을 호출하여 서버에서 결제를 검증합니다.
 *
 * 클라이언트의 결제 성공 응답만으로는 신뢰할 수 없으므로,
 * 서버가 포트원 V2 API를 직접 호출하여 실제 결제 상태 + 금액을 확인합니다.
 *
 * 검증 성공 시 서버가 직접:
 *  1. orders 테이블에 기록
 *  2. user_profiles 구독 활성화
 */
export interface VerifyPaymentResult {
  success: boolean;
  message?: string;
  subscription?: {
    tier: string;
    status: string;
    expiresAt: string;
  };
  error?: string;
}

export async function verifyPaymentOnServer(
  paymentId: string,
  planId: string,
): Promise<VerifyPaymentResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '인증 세션이 없습니다. 다시 로그인해주세요.' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ paymentId, planId }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data.error ?? '결제 검증에 실패했습니다.',
      };
    }

    return {
      success: true,
      message: data.message,
      subscription: data.subscription,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '결제 검증 중 네트워크 오류';
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// 주문 기록 저장 (클라이언트 직접 — fallback용)
// ---------------------------------------------------------------------------
/**
 * verify-payment 서버 검증이 실패할 경우의 fallback으로,
 * 클라이언트에서 직접 orders 테이블에 기록합니다.
 *
 * ⚠️ RLS 정책에 따라 INSERT 권한이 없을 수 있습니다.
 *    프로덕션에서는 서버 검증(verifyPaymentOnServer)을 우선 사용하세요.
 */
export async function saveOrderRecord(
  record: Omit<OrderRecord, 'id' | 'created_at'>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('orders').insert({
      user_id: record.user_id,
      payment_id: record.payment_id,
      plan_id: record.plan_id,
      order_name: record.order_name,
      amount: record.amount,
      currency: record.currency,
      pay_method: record.pay_method,
      status: record.status,
      pg_provider: record.pg_provider,
      pg_tx_id: record.pg_tx_id ?? null,
      paid_at: record.paid_at ?? null,
      metadata: record.metadata ?? null,
    });

    if (error) {
      console.warn('[Payment] 주문 저장 실패:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '주문 저장 중 오류 발생';
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// 포트원 V2 타입 선언 (window 확장)
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    PortOne: {
      requestPayment: (params: Record<string, unknown>) => Promise<{
        code?: string;
        message?: string;
        transactionType?: string;
        txId?: string;
      }>;
    };
  }
}
