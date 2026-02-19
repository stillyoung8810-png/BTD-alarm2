/**
 * 결제 관련 타입 정의
 * 포트원 V2 SDK 및 자체 결제 흐름에서 사용합니다.
 */

// ---------------------------------------------------------------------------
// 결제 수단
// ---------------------------------------------------------------------------
export type PayMethod =
  | 'CARD'           // 신용카드
  | 'VIRTUAL_ACCOUNT' // 가상계좌 (무통장 입금)
  | 'TRANSFER'       // 계좌이체
  | 'MOBILE'         // 휴대폰 소액결제
  | 'EASY_PAY';      // 간편결제 (카카오페이, 네이버페이 등)

export interface PayMethodOption {
  id: PayMethod;
  label: { ko: string; en: string };
  icon: string; // Lucide icon name or emoji
}

/** 결제 수단 선택지 목록 */
export const PAY_METHOD_OPTIONS: PayMethodOption[] = [
  { id: 'CARD',            label: { ko: '신용카드', en: 'Credit Card' },       icon: 'CreditCard' },
  { id: 'VIRTUAL_ACCOUNT', label: { ko: '가상계좌', en: 'Virtual Account' },   icon: 'Landmark' },
  { id: 'TRANSFER',        label: { ko: '계좌이체', en: 'Bank Transfer' },     icon: 'ArrowLeftRight' },
  { id: 'MOBILE',          label: { ko: '휴대폰',   en: 'Mobile' },            icon: 'Smartphone' },
  { id: 'EASY_PAY',        label: { ko: '간편결제', en: 'Easy Pay' },          icon: 'Wallet' },
];

// ---------------------------------------------------------------------------
// 간편결제 제공자
// ---------------------------------------------------------------------------
export type EasyPayProvider = 'KAKAOPAY' | 'NAVERPAY' | 'TOSSPAY';

// ---------------------------------------------------------------------------
// 구독 플랜 (결제 대상)
// ---------------------------------------------------------------------------
export interface PlanInfo {
  id: 'pro' | 'premium';
  label: string;
  subtitle: string;
  price: number;          // 원화 기준 (₩)
  features: string[];     // 체크 항목 텍스트
}

// ---------------------------------------------------------------------------
// 이용권 상수 (개수 선택·만료일 계산에 사용)
// ---------------------------------------------------------------------------
/** 1개당 이용 일수 */
export const PLAN_DAYS_PER_UNIT = 30;
/** 이용권 개수 선택 상한 (클라이언트·서버 검증용) */
export const QUANTITY_MAX = 12;
/** 기본 개수 (미선택 시) */
export const DEFAULT_QUANTITY = 1;

// ---------------------------------------------------------------------------
// 결제 요청 파라미터
// ---------------------------------------------------------------------------
export interface PaymentRequest {
  orderName: string;
  totalAmount: number;
  customerEmail?: string;
  customerId?: string;
  payMethod: PayMethod;
  easyPayProvider?: EasyPayProvider;
  planId: string;
  /** 이용권 개수 (1 = 30일, 2 = 60일 …). 기본 1, 서버 검증 시 사용 */
  quantity?: number;
}

// ---------------------------------------------------------------------------
// 결제 결과
// ---------------------------------------------------------------------------
export interface PaymentResult {
  success: boolean;
  paymentId: string;
  transactionType?: string;
  txId?: string;
  code?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// 주문 기록 (Supabase orders 테이블 스키마)
// ---------------------------------------------------------------------------
export interface OrderRecord {
  id?: string;
  user_id: string;
  payment_id: string;
  plan_id: string;
  order_name: string;
  amount: number;
  currency: string;
  pay_method: PayMethod;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  pg_provider: string;
  pg_tx_id?: string;
  created_at?: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
}
