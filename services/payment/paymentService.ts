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
// 주문 기록 저장 (스켈레톤)
// ---------------------------------------------------------------------------
/**
 * 결제 완료 후 Supabase `orders` 테이블에 주문 기록을 저장합니다.
 *
 * ⚠️ `orders` 테이블이 아직 생성되지 않았다면 마이그레이션을 먼저 실행하세요.
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
// 구독 상태 업데이트 (스켈레톤)
// ---------------------------------------------------------------------------
/**
 * 결제 성공 후 `user_profiles` 테이블의 구독 정보를 업데이트합니다.
 */
export async function activateSubscription(
  userId: string,
  planId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    // 월간 구독: 30일 후 만료
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('user_profiles')
      .update({
        subscription_tier: planId,
        subscription_status: 'active',
        subscription_expires_at: expiresAt,
        updated_at: now,
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Payment] 구독 활성화 실패:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '구독 활성화 중 오류 발생';
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
