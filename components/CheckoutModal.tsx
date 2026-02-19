/**
 * CheckoutModal — 주문 요약 & 결제 수단 선택 모달
 *
 * 이용권 개수 선택, 유료 서비스 이용 기간 표시, 결제 요청(포트원/토스) 지원.
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Star,
  Crown,
  Check,
  CreditCard,
  Landmark,
  ArrowLeftRight,
  Smartphone,
  Wallet,
  Zap,
  ArrowRight,
  Shield,
  Loader2,
} from 'lucide-react';
import {
  PAY_METHOD_OPTIONS,
  PLAN_DAYS_PER_UNIT,
  QUANTITY_MAX,
  DEFAULT_QUANTITY,
  type PayMethod,
  type EasyPayProvider,
} from '../services/payment/types';
import type { PaymentRequest } from '../services/payment/types';
import { requestPayment, requestPaymentWithServerVerify, verifyTossPaymentOnServer } from '../services/payment/paymentService';
import { isTossApp } from '../services/tossAppBridge';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSModal, TDSButton } from './tds';
import { getServicePeriodDisplay } from '../utils/dateUtils';

// ---------------------------------------------------------------------------
// 상수 — DRY: 메시지·기간 라벨·플랜 스타일
// ---------------------------------------------------------------------------
const PAY_MSGS = {
  ko: {
    success: '결제가 완료되었습니다! 서비스가 활성화됩니다.',
    failed: (msg: string) => `결제에 실패했습니다: ${msg}`,
    verifyFailed: (err: string) =>
      `결제는 완료되었으나 검증에 실패했습니다. 잠시 후 자동 반영되거나 고객센터에 문의하세요.\n(${err})`,
    configMissing: '결제 환경이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    unknown: '알 수 없는 오류',
    processingError: '결제 처리 중 오류가 발생했습니다.',
  },
  en: {
    success: 'Payment complete! Your service is now active.',
    failed: (msg: string) => `Payment failed: ${msg}`,
    verifyFailed: (err: string) =>
      `Payment succeeded but verification failed. It will be reflected shortly or contact support.\n(${err})`,
    configMissing: 'Payment is not configured. Please contact support.',
    unknown: 'Unknown error',
    processingError: 'An error occurred during payment.',
  },
} as const;

function getPlanDurationLabel(quantity: number, isKo: boolean): string {
  const days = PLAN_DAYS_PER_UNIT * quantity;
  return isKo ? `이용권 (${days}일)` : `Plan (${days} days)`;
}

const PLAN_STYLES = {
  pro: {
    card: 'bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20',
    iconBg: 'bg-blue-500/10 border border-blue-400/30',
    icon: 'text-blue-400',
    subtitle: 'text-blue-500 dark:text-blue-400',
    check: 'bg-blue-400/20 border border-blue-400',
    checkIcon: 'text-blue-500',
    methodSelected: 'bg-blue-50 dark:bg-blue-500/10 border-blue-400 dark:border-blue-400 shadow-md shadow-blue-500/10',
    methodIcon: 'text-blue-500 dark:text-blue-400',
    button: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30',
    total: 'text-blue-600 dark:text-blue-400',
  },
  premium: {
    card: 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20',
    iconBg: 'bg-black border-2 border-amber-400',
    icon: 'text-amber-400',
    subtitle: 'text-amber-600 dark:text-amber-400',
    check: 'bg-amber-400/20 border border-amber-400',
    checkIcon: 'text-amber-500',
    methodSelected: 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-400 shadow-md shadow-amber-500/10',
    methodIcon: 'text-amber-500 dark:text-amber-400',
    button: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black shadow-lg shadow-amber-500/30',
    total: 'text-amber-600 dark:text-amber-400',
  },
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ko' | 'en';
  plan: {
    id: 'pro' | 'premium';
    label: string;
    subtitle: string;
    price: number;
    priceFormatted: string;
    features: string[];
  };
  customerEmail?: string;
  customerId?: string;
  onPaymentSuccess?: () => void;
}

const METHOD_ICON_MAP: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard size={20} />,
  Landmark: <Landmark size={20} />,
  ArrowLeftRight: <ArrowLeftRight size={20} />,
  Smartphone: <Smartphone size={20} />,
  Wallet: <Wallet size={20} />,
};

/** 모달 래퍼 — 토스 TDS vs 일반 고정 레이어 분기 일원화 */
function ModalWrapper({
  children,
  open,
  onClose,
  useToss,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  useToss: boolean;
}) {
  if (useToss) {
    return <TDSModal open={open} onClose={onClose}>{children}</TDSModal>;
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md bg-white dark:bg-[#0E1525] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  lang,
  plan,
  customerEmail,
  customerId,
  onPaymentSuccess,
}) => {
  const isKo = lang === 'ko';
  const { isInTossApp } = useTossApp();
  const [payMethod, setPayMethod] = useState<PayMethod>('CARD');
  const [quantity, setQuantity] = useState<number>(DEFAULT_QUANTITY);
  const [isProcessing, setIsProcessing] = useState(false);

  const totalDays = PLAN_DAYS_PER_UNIT * quantity;
  const totalAmount = plan.price * quantity;
  const totalFormatted = `₩${totalAmount.toLocaleString()}`;
  const styles = PLAN_STYLES[plan.id];

  const buildPayReq = useCallback((): PaymentRequest => ({
    orderName: `${plan.label} ${getPlanDurationLabel(quantity, isKo)}`,
    totalAmount,
    customerEmail,
    customerId,
    payMethod,
    planId: plan.id,
    quantity,
    ...(payMethod === 'EASY_PAY' ? { easyPayProvider: 'KAKAOPAY' as EasyPayProvider } : {}),
  }), [plan, quantity, totalAmount, payMethod, customerEmail, customerId, isKo]);

  const handleTossPay = useCallback(async (payReq: PaymentRequest) => {
    const result = await requestPayment(payReq);
    if (!result.success) {
      return {
        ok: false,
        cancel: result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL',
        message: result.message,
      };
    }
    const verification = await verifyTossPaymentOnServer(result.paymentId, plan.id, payReq.quantity);
    return {
      ok: verification.success,
      message: verification.error,
      needRefresh: true,
    };
  }, [plan.id]);

  const handlePortOnePay = useCallback(async (payReq: PaymentRequest) => {
    const result = await requestPaymentWithServerVerify(payReq);
    if (result.success && result.verification?.success) {
      return { ok: true, needRefresh: true };
    }
    if (!result.success) {
      return {
        ok: false,
        cancel: result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL',
        message: result.message,
        configMissing: result.code === 'CONFIG_MISSING',
      };
    }
    return { ok: false, message: result.verification?.error, needRefresh: true };
  }, []);

  const handlePay = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const payReq = buildPayReq();
    const msgs = PAY_MSGS[lang];

    try {
      const handler = isTossApp() ? handleTossPay : handlePortOnePay;
      const outcome = await handler(payReq);

      if (outcome.cancel) return;
      if (outcome.ok) {
        alert(msgs.success);
        onPaymentSuccess?.();
        onClose();
        return;
      }
      const alertMsg = outcome.configMissing
        ? msgs.configMissing
        : outcome.needRefresh
          ? msgs.verifyFailed(outcome.message ?? '')
          : msgs.failed(outcome.message ?? msgs.unknown);
      alert(alertMsg);
      if (outcome.needRefresh) {
        onPaymentSuccess?.();
        onClose();
      }
    } catch {
      alert(msgs.processingError);
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    buildPayReq,
    handleTossPay,
    handlePortOnePay,
    lang,
    onPaymentSuccess,
    onClose,
  ]);

  if (!isOpen) return null;

  const periodLabel = getServicePeriodDisplay(totalDays, lang);

  const modalBody = (
    <>
      <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-[#0B0F19]">
        <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <span className="text-xl">{'<'}</span>
          {isKo ? '주문 요약' : 'Order Summary'}
        </h2>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
          <Shield size={14} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Secure Checkout
          </span>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-8rem)] p-6 space-y-6">
        {/* 플랜 카드 */}
        <div className={`p-5 rounded-2xl border ${styles.card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.iconBg}`}>
              {plan.id === 'pro' ? <Star size={20} className={styles.icon} /> : <Crown size={20} className={styles.icon} />}
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                {plan.label} PLAN
              </p>
              <p className={`text-xs font-semibold ${styles.subtitle}`}>
                {getPlanDurationLabel(quantity, isKo)}
              </p>
            </div>
          </div>

          {/* 이용권 개수 선택 — 다크모드에서 드롭다운 옵션 가독성 확보 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
              {isKo ? '이용 기간 (개수)' : 'Duration (quantity)'}
            </label>
            <select
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium"
              aria-label={isKo ? '이용권 개수 선택' : 'Select quantity'}
            >
              {Array.from({ length: QUANTITY_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {isKo ? `${n}개 (${PLAN_DAYS_PER_UNIT * n}일)` : `${n} (${PLAN_DAYS_PER_UNIT * n} days)`}
                </option>
              ))}
            </select>
          </div>

          <ul className="space-y-2">
            {plan.features.map((feat, i) => (
              <li key={`feat-${i}-${feat.slice(0, 20)}`} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${styles.check}`}>
                  <Check size={10} className={styles.checkIcon} />
                </div>
                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 유료 서비스 이용 기간 */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            {isKo ? '유료 서비스 이용 기간' : 'Paid service period'}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {periodLabel}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            {isKo ? '(결제일 기준 예정)' : '(Expected from payment date)'}
          </p>
        </div>

        {/* 결제 수단 */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '결제 수단 선택' : 'Payment Method'}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {PAY_METHOD_OPTIONS.map((opt) => {
              const isSelected = payMethod === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setPayMethod(opt.id)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-200 text-center ${
                    isSelected ? styles.methodSelected : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <span className={isSelected ? styles.methodIcon : 'text-slate-500 dark:text-slate-400'}>
                    {METHOD_ICON_MAP[opt.icon] ?? <CreditCard size={20} />}
                  </span>
                  <span className={`text-[10px] font-bold leading-tight ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {isKo ? opt.label.ko : opt.label.en}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 금액 */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {isKo ? '이용권 금액' : 'Plan Price'}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {plan.priceFormatted} × {quantity} = {totalFormatted}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {isKo ? '할인 금액' : 'Discount'}
            </span>
            <span className="text-sm font-bold text-emerald-500">-₩0</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-white/5">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {isKo ? '최종 결제 금액' : 'Total'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {isKo ? '부가세 포함' : 'VAT included'}
              </p>
            </div>
            <p className={`text-2xl font-black ${styles.total}`}>{totalFormatted}</p>
          </div>
        </div>

        {isInTossApp ? (
          <TDSButton fullWidth loading={isProcessing} disabled={isProcessing} onClick={handlePay}>
            {isProcessing ? (isKo ? '결제 처리 중...' : 'Processing...') : (isKo ? '지금 결제하기' : 'Pay Now')}
          </TDSButton>
        ) : (
          <button
            onClick={handlePay}
            disabled={isProcessing}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${styles.button}`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {isKo ? '결제 처리 중...' : 'Processing...'}
              </>
            ) : (
              <>
                <Zap size={18} />
                {isKo ? '지금 결제하기' : 'Pay Now'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        )}

        <div className="text-center space-y-1 pt-2">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            {isKo ? '결제 시 서비스 이용 약관에 동의하는 것으로 간주합니다.' : 'By purchasing, you agree to our Terms of Service.'}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            {isKo
              ? `이용권은 결제일로부터 ${totalDays}일간 유효합니다.`
              : `This plan is valid for ${totalDays} days from the date of purchase.`}
          </p>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            {isKo ? '환불 및 취소 규정' : 'Refund & Cancellation Policy'}
          </p>
          <ul className="text-[9px] text-slate-400 dark:text-slate-500 leading-[1.7] space-y-1 list-disc pl-3.5">
            <li>
              {isKo
                ? '결제 후 7일 이내에 서비스 이용 기록(AI 매매 인식, 백테스트, 텔레그램 연동 등)이 없는 경우 전액 환불이 가능합니다.'
                : 'Full refund available within 7 days if no service usage (AI recognition, backtesting, Telegram sync, etc.) has occurred.'}
            </li>
            <li>
              {isKo
                ? '유료 서비스를 1회 이상 이용한 경우, 전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됩니다.'
                : 'If paid features have been used, withdrawal is restricted per the E-Commerce Act.'}
            </li>
            <li>
              {isKo
                ? `본 결제는 단발성 이용권(${totalDays}일)이며, 자동 갱신되지 않습니다.`
                : `This is a one-time purchase valid for ${totalDays} days. No auto-renewal.`}
            </li>
            <li>
              {isKo ? '환불 문의: grrrvv@naver.com' : 'Refund inquiries: grrrvv@naver.com'}
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-200/50 dark:bg-white/10 flex items-center justify-center hover:bg-slate-300/50 dark:hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X size={16} className="text-slate-500 dark:text-slate-400" />
      </button>
    </>
  );

  return (
    <ModalWrapper open={isOpen} onClose={onClose} useToss={isInTossApp}>
      {modalBody}
    </ModalWrapper>
  );
};

export default CheckoutModal;
