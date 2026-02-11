/**
 * 토스 미니앱 브릿지 전역 객체 타입.
 * @apps-in-toss 문서에 맞춰 사용하는 시그니처만 정의.
 */
interface TossAppBridgeGlobal {
  /** 토스 로그인: 인증 코드 요청 (토스 앱 내에서만 동작) */
  requestAuth?: () => Promise<{ code: string }>;
  /** 토스페이 결제 요청 */
  requestPayment?: (params: TossPaymentRequest) => Promise<TossPaymentBridgeResponse>;
  /** 광고 표시 (리워드/전면). 실제 API는 토스 문서 확인 후 보강 */
  ads?: {
    showReward?: (placementId: string) => Promise<void>;
    showInterstitial?: (placementId: string) => Promise<void>;
  };
}

interface TossPaymentRequest {
  orderName: string;
  totalAmount: number;
  orderId?: string;
  [key: string]: unknown;
}

interface TossPaymentBridgeResponse {
  success?: boolean;
  paymentId?: string;
  txId?: string;
  code?: string;
  message?: string;
}

declare global {
  interface Window {
    TossApp?: TossAppBridgeGlobal;
    __TOSS_APP__?: TossAppBridgeGlobal;
  }
}

export type { TossAppBridgeGlobal, TossPaymentRequest, TossPaymentBridgeResponse };
