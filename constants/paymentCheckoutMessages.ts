import type { PayMethod } from '../services/payment/types';

/** 환불 안내 등에 쓰는 고객 문의 메일(SSOT). */
export const PAYMENT_CHECKOUT_REFUND_EMAIL = 'grrrvv@naver.com' as const;

export type TossIapKnownErrorCode =
  | 'INVALID_PRODUCT_ID'
  | 'PAYMENT_PENDING'
  | 'NETWORK_ERROR'
  | 'INVALID_USER_ENVIRONMENT'
  | 'APP_MARKET_VERIFICATION_FAILED'
  | 'TOSS_SERVER_VERIFICATION_FAILED'
  | 'INTERNAL_ERROR'
  | 'KOREAN_ACCOUNT_ONLY'
  | 'USER_CANCELED'
  | 'PRODUCT_NOT_GRANTED_BY_PARTNER';

export type TossIapErrorCode = TossIapKnownErrorCode | 'UNKNOWN';

export interface PaymentCheckoutMessageSet {
  CLOSE_MODAL: string;
  CONFIG_MISSING: string;
  DISCOUNT: string;
  DISCOUNT_ZERO_LINE: (formattedZero: string) => string;
  DURATION_LABEL: string;
  DURATION_PACKAGE_LABEL: (days: number) => string;
  DURATION_SELECT_ARIA: string;
  ERR_INVALID_PRICE: string;
  FAILED: (message: string) => string;
  ORDER_SUMMARY: string;
  PAID_SERVICE_PERIOD: string;
  PAID_SERVICE_PERIOD_HINT: string;
  PAY: string;
  PAYMENT_METHOD_HEADING: string;
  PAY_METHOD_LABELS: Record<PayMethod, string>;
  PAY_NOW: string;
  PLAN_NAME_WITH_SUFFIX: (planDisplayName: string) => string;
  PLAN_PRICE: string;
  PREMIUM_COMING_SOON: string;
  PREMIUM_UNAVAILABLE_DETAIL: string;
  PROCESSING: string;
  PROCESSING_ERROR: string;
  QUANTITY_OPTION: (count: number, days: number) => string;
  REFUND_BULLET_1: string;
  REFUND_BULLET_2: string;
  REFUND_BULLET_3: (totalDays: number) => string;
  REFUND_INQUIRY: (email: string) => string;
  REFUND_SECTION_TITLE: string;
  SECURE_CHECKOUT: string;
  SUCCESS: string;
  TERMS_CONSENT_NOTICE: string;
  TOSS_FIXED_DURATION_LABEL: string;
  TOSS_FIXED_DURATION_VALUE: (days: number) => string;
  TOSS_IAP_ERROR_MESSAGES: Record<TossIapErrorCode, string>;
  TOSS_IAP_NOTICE: string;
  TOTAL: string;
  UNKNOWN: string;
  UNKNOWN_PLAN_LABEL: string;
  VALIDITY_NOTICE: (days: number) => string;
  VAT_INCLUDED: string;
  VERIFY_FAILED: (error: string) => string;
}

export const PAYMENT_CHECKOUT_MESSAGES: Record<'ko' | 'en', PaymentCheckoutMessageSet> = {
  ko: {
    ORDER_SUMMARY: '주문 요약',
    SECURE_CHECKOUT: '보안 결제',
    DURATION_LABEL: '이용 기간 (개수)',
    DURATION_SELECT_ARIA: '이용권 개수 선택',
    TOSS_FIXED_DURATION_LABEL: '토스 인앱결제 이용 기간',
    TOSS_FIXED_DURATION_VALUE: (days) => `고정 1건 (${days}일)`,
    TOSS_IAP_NOTICE: '토스 앱 인앱결제로 진행됩니다.',
    TOSS_IAP_ERROR_MESSAGES: {
      INVALID_PRODUCT_ID:
        '현재 구매 가능한 상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      PAYMENT_PENDING: '이전 결제가 아직 처리 중입니다. 잠시 후 다시 확인해 주세요.',
      NETWORK_ERROR: '네트워크가 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
      INVALID_USER_ENVIRONMENT: '현재 계정 또는 기기 환경에서는 이 상품을 구매할 수 없습니다.',
      APP_MARKET_VERIFICATION_FAILED:
        '앱마켓 확인에 실패했습니다. 결제 내역을 확인한 뒤 필요하면 환불을 요청해 주세요.',
      TOSS_SERVER_VERIFICATION_FAILED:
        '결제 정보 전송이 지연되고 있습니다. 잠시 후 다시 열어 상태를 확인해 주세요.',
      INTERNAL_ERROR: '결제 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      KOREAN_ACCOUNT_ONLY: '한국 스토어 계정에서만 구매할 수 있는 상품입니다.',
      USER_CANCELED: '결제가 취소되었습니다.',
      PRODUCT_NOT_GRANTED_BY_PARTNER:
        '결제는 완료되었지만 이용권 지급이 지연되고 있습니다. 잠시 후 다시 열면 자동 복구를 시도합니다.',
      UNKNOWN: '결제 처리 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    },
    PLAN_PRICE: '이용권 금액',
    DISCOUNT: '할인 금액',
    TOTAL: '최종 결제 금액',
    VAT_INCLUDED: '부가세 포함',
    PAY_NOW: '지금 결제하기',
    PAY: '결제하기',
    PREMIUM_COMING_SOON: 'PREMIUM 플랜은 출시 예정입니다',
    PREMIUM_UNAVAILABLE_DETAIL:
      'PREMIUM 플랜은 아직 결제가 불가합니다. 준비되는 대로 안내드릴게요.',
    PROCESSING: '결제 처리 중...',
    ERR_INVALID_PRICE: '결제 금액이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.',
    SUCCESS: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
    FAILED: (message) => `결제에 실패했습니다: ${message}`,
    VERIFY_FAILED: (error) =>
      `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${error})`,
    CONFIG_MISSING: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    UNKNOWN: '알 수 없는 오류',
    UNKNOWN_PLAN_LABEL: '알 수 없는 플랜',
    DURATION_PACKAGE_LABEL: (days) => `이용권 (${days}일)`,
    QUANTITY_OPTION: (count, days) => `${count}개 (${days}일)`,
    VALIDITY_NOTICE: (days) => `이용권은 결제일로부터 ${days}일간 유효합니다.`,
    DISCOUNT_ZERO_LINE: (formattedZero) => `-${formattedZero}`,
    PROCESSING_ERROR: '결제 처리 중 오류가 발생했습니다.',
    CLOSE_MODAL: '결제 모달 닫기',
    PAID_SERVICE_PERIOD: '유료 서비스 이용 기간',
    PAID_SERVICE_PERIOD_HINT: '(결제일 기준 예정)',
    PAYMENT_METHOD_HEADING: '결제 수단 선택',
    PAY_METHOD_LABELS: {
      CARD: '신용카드',
      VIRTUAL_ACCOUNT: '가상계좌',
      TRANSFER: '계좌이체',
      MOBILE: '휴대폰',
      EASY_PAY: '간편결제',
    },
    PLAN_NAME_WITH_SUFFIX: (planDisplayName) => `${planDisplayName} 플랜`,
    TERMS_CONSENT_NOTICE: '결제 시 서비스 이용 약관에 동의하는 것으로 간주합니다.',
    REFUND_SECTION_TITLE: '환불 및 취소 규정',
    REFUND_BULLET_1:
      '결제 후 7일 이내에 서비스 이용 기록(AI 매매 인식, 백테스트, 텔레그램 연동 등)이 없는 경우 전액 환불이 가능합니다.',
    REFUND_BULLET_2:
      '유료 서비스를 1회 이상 이용한 경우, 전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됩니다.',
    REFUND_BULLET_3: (totalDays) =>
      `본 결제는 단발성 이용권(${totalDays}일)이며, 자동 갱신되지 않습니다.`,
    REFUND_INQUIRY: (email) => `환불 문의: ${email}`,
  },
  en: {
    ORDER_SUMMARY: 'Order Summary',
    SECURE_CHECKOUT: 'Secure Checkout',
    DURATION_LABEL: 'Duration (quantity)',
    DURATION_SELECT_ARIA: 'Select quantity',
    TOSS_FIXED_DURATION_LABEL: 'Toss in-app purchase duration',
    TOSS_FIXED_DURATION_VALUE: (days) => `Fixed single purchase (${days} days)`,
    TOSS_IAP_NOTICE: 'Payment will be processed through Toss in-app purchase.',
    TOSS_IAP_ERROR_MESSAGES: {
      INVALID_PRODUCT_ID: 'The product information is unavailable right now. Please try again later.',
      PAYMENT_PENDING: 'A previous payment is still being processed. Please check again shortly.',
      NETWORK_ERROR: 'Your network connection is unstable. Please check your connection and try again.',
      INVALID_USER_ENVIRONMENT:
        'This product cannot be purchased in the current account or device environment.',
      APP_MARKET_VERIFICATION_FAILED:
        'App market verification failed. Please review your purchase history and request a refund if needed.',
      TOSS_SERVER_VERIFICATION_FAILED:
        'Payment confirmation is delayed. Please reopen the app and check again shortly.',
      INTERNAL_ERROR: 'A temporary payment error occurred. Please try again later.',
      KOREAN_ACCOUNT_ONLY: 'This product can only be purchased with a Korean store account.',
      USER_CANCELED: 'The payment was canceled.',
      PRODUCT_NOT_GRANTED_BY_PARTNER:
        'Payment completed, but entitlement delivery is delayed. Reopening the app will retry recovery.',
      UNKNOWN: 'An unknown error occurred during payment. Please try again later.',
    },
    PLAN_PRICE: 'Plan Price',
    DISCOUNT: 'Discount',
    TOTAL: 'Total',
    VAT_INCLUDED: 'VAT included',
    PAY_NOW: 'Pay Now',
    PAY: 'Pay',
    PREMIUM_COMING_SOON: 'PREMIUM plan is coming soon',
    PREMIUM_UNAVAILABLE_DETAIL:
      'The PREMIUM plan is not available for purchase yet.',
    PROCESSING: 'Processing...',
    ERR_INVALID_PRICE: 'The payment amount is invalid. Please try again later.',
    SUCCESS: 'Payment complete! Your service is now active.',
    FAILED: (message) => `Payment failed: ${message}`,
    VERIFY_FAILED: (error) =>
      `Payment succeeded but verification failed. It will be reflected shortly or contact support.\n(${error})`,
    CONFIG_MISSING: 'Payment is not configured. Please contact support.',
    UNKNOWN: 'Unknown error',
    UNKNOWN_PLAN_LABEL: 'Unknown plan',
    DURATION_PACKAGE_LABEL: (days) => `Plan (${days} days)`,
    QUANTITY_OPTION: (count, days) => `${count} (${days} days)`,
    VALIDITY_NOTICE: (days) => `This plan is valid for ${days} days from the date of purchase.`,
    DISCOUNT_ZERO_LINE: (formattedZero) => `-${formattedZero}`,
    PROCESSING_ERROR: 'An error occurred during payment.',
    CLOSE_MODAL: 'Close checkout modal',
    PAID_SERVICE_PERIOD: 'Paid service period',
    PAID_SERVICE_PERIOD_HINT: '(Expected from payment date)',
    PAYMENT_METHOD_HEADING: 'Payment Method',
    PAY_METHOD_LABELS: {
      CARD: 'Credit Card',
      VIRTUAL_ACCOUNT: 'Virtual Account',
      TRANSFER: 'Bank Transfer',
      MOBILE: 'Mobile',
      EASY_PAY: 'Easy Pay',
    },
    PLAN_NAME_WITH_SUFFIX: (planDisplayName) => `${planDisplayName} PLAN`,
    TERMS_CONSENT_NOTICE: 'By purchasing, you agree to our Terms of Service.',
    REFUND_SECTION_TITLE: 'Refund & Cancellation Policy',
    REFUND_BULLET_1:
      'Full refund available within 7 days if no service usage (AI recognition, backtesting, Telegram sync, etc.) has occurred.',
    REFUND_BULLET_2:
      'If paid features have been used, withdrawal is restricted per the E-Commerce Act.',
    REFUND_BULLET_3: (totalDays) =>
      `This is a one-time purchase valid for ${totalDays} days. No auto-renewal.`,
    REFUND_INQUIRY: (email) => `Refund inquiries: ${email}`,
  },
};
