/**
 * 포트원 V2 결제 서비스
 *
 * - 포트원(PortOne) V2 브라우저 SDK를 동적으로 로드합니다.
 * - 확장 가능한 구조: PG사 · 간편결제 공급자 · 인앱 결제 추가 시 이 파일만 변경하면 됩니다.
 * - 토스 미니앱 환경 대응 자리도 미리 확보되어 있습니다.
 */

import { supabase } from '../supabase';
import { isTossApp } from '../tossAppBridge';
import { requestTossPayment } from '../toss/tossPayment';
import type {
  PayMethod,
  PaymentRequest,
  PaymentResult,
  OrderRecord,
} from './types';

const BFF_URL = import.meta.env.VITE_RAILWAY_BFF_URL as string | undefined;

// ---------------------------------------------------------------------------
// 상수 (식별 정보 — 환경변수에서 가져옴)
// ---------------------------------------------------------------------------
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string;
const NICEPAY_CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string;
const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

// 런타임 유효성 검사 — 환경변수 누락 시 빠른 실패
if (!STORE_ID) console.error('[Payment] VITE_PORTONE_STORE_ID 환경변수가 설정되지 않았습니다.');
if (!NICEPAY_CHANNEL_KEY) console.error('[Payment] VITE_PORTONE_CHANNEL_KEY 환경변수가 설정되지 않았습니다.');

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

  // ── 토스 미니앱 환경: 토스페이 브릿지 사용. 검증은 호출부에서 verifyTossPaymentOnServer로 BFF 경유 필수.
  if (isTossApp()) {
    return requestTossPayment({
      paymentId,
      orderName: req.orderName,
      totalAmount: req.totalAmount,
      planId: req.planId,
      customerId: req.customerId,
    });
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
// 결제 요청 + 서버 검증 (포트원: 결제창 → 성공 시 verify-payment 호출)
// ---------------------------------------------------------------------------
export interface RequestPaymentWithVerifyResult {
  success: boolean;
  paymentId: string;
  /** 포트원 경로에서만 채워짐. 토스는 호출부에서 verifyTossPaymentOnServer 호출 */
  verification?: VerifyPaymentResult;
  code?: string;
  message?: string;
}

/**
 * VITE_PORTONE_STORE_ID, VITE_PORTONE_CHANNEL_KEY로 결제창을 띄우고,
 * 결제 성공 시(포트원 경로) verify-payment Edge Function을 호출해 서버 검증까지 수행합니다.
 *
 * - 웹(포트원): requestPayment → 성공 시 verifyPaymentOnServer 호출 후 결과 반환.
 * - 토스 미니앱: requestPayment만 수행. 호출부에서 verifyTossPaymentOnServer 필수 호출.
 */
export async function requestPaymentWithServerVerify(
  req: PaymentRequest,
): Promise<RequestPaymentWithVerifyResult> {
  const result = await requestPayment(req);

  if (!result.success) {
    return {
      success: false,
      paymentId: result.paymentId,
      code: result.code,
      message: result.message,
    };
  }

  if (isTossApp()) {
    return { success: true, paymentId: result.paymentId };
  }

  const verification = await verifyPaymentOnServer(result.paymentId, req.planId);
  return {
    success: verification.success,
    paymentId: result.paymentId,
    verification,
  };
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
// 토스페이 결제 검증 (Railway BFF 경유, mTLS)
// ---------------------------------------------------------------------------
/**
 * 토스 미니앱 결제 후 반드시 BFF를 통해 토스 API로 최종 성공 여부를 검증한 뒤 구독 활성화.
 */
export async function verifyTossPaymentOnServer(
  paymentId: string,
  planId: string,
): Promise<VerifyPaymentResult> {
  if (!BFF_URL?.trim()) {
    return { success: false, error: 'BFF URL이 설정되지 않았습니다.' };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '인증 세션이 없습니다. 다시 로그인해주세요.' };
    }

    const base = BFF_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/payment/toss/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ paymentId, planId }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        error: data?.message ?? data?.error ?? '토스 결제 검증에 실패했습니다.',
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
// 결제 환불 요청
// ---------------------------------------------------------------------------
export interface CancelSubscriptionResult {
  success: boolean;
  refunded?: boolean;
  message?: string;
  error?: string;
}

/**
 * cancel-subscription Edge Function을 호출하여 결제 환불을 요청합니다.
 *
 * 서버에서 환불 가능 여부를 자동 판단합니다:
 *  - 7일 이내 + 이용 기록 없음(AI, 백테스트, 텔레그램 연동 미사용) → 전액 환불 + 권한 즉시 회수
 *  - 그 외 → 환불 거부 안내 (단발성 결제이므로 만료 시 자동 종료)
 */
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '인증 세션이 없습니다. 다시 로그인해주세요.' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error ?? '구독 해지에 실패했습니다.' };
    }

    return {
      success: true,
      refunded: data.refunded,
      message: data.message,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '구독 해지 중 네트워크 오류';
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
