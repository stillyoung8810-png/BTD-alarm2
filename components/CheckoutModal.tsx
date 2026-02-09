/**
 * CheckoutModal — 주문 요약 & 결제 수단 선택 모달
 *
 * 첨부 이미지 레퍼런스를 기반으로 한 결제 UI 입니다.
 * 기존 모달(AuthModals, AlarmModal)과 동일한 다크/라이트 모드 색상 체계를 사용합니다.
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
import { PAY_METHOD_OPTIONS, type PayMethod, type EasyPayProvider } from '../services/payment/types';
import { requestPayment, saveOrderRecord, activateSubscription } from '../services/payment/paymentService';

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
  /** 결제 성공 후 콜백 — 프로필 새로고침 등 */
  onPaymentSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// 아이콘 매핑
// ---------------------------------------------------------------------------
const METHOD_ICON_MAP: Record<string, React.ReactNode> = {
  CreditCard:     <CreditCard size={20} />,
  Landmark:       <Landmark size={20} />,
  ArrowLeftRight: <ArrowLeftRight size={20} />,
  Smartphone:     <Smartphone size={20} />,
  Wallet:         <Wallet size={20} />,
};

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
  const [payMethod, setPayMethod] = useState<PayMethod>('CARD');
  const [isProcessing, setIsProcessing] = useState(false);

  // ── 결제 실행 ─────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const result = await requestPayment({
        orderName: `${plan.label} ${isKo ? '월간 구독권' : 'Monthly Plan'}`,
        totalAmount: plan.price,
        customerEmail,
        customerId,
        payMethod,
        planId: plan.id,
        ...(payMethod === 'EASY_PAY' ? { easyPayProvider: 'KAKAOPAY' as EasyPayProvider } : {}),
      });

      if (result.success) {
        // 주문 기록 저장 (orders 테이블 필요)
        if (customerId) {
          await saveOrderRecord({
            user_id: customerId,
            payment_id: result.paymentId,
            plan_id: plan.id,
            order_name: `${plan.label} Monthly Plan`,
            amount: plan.price,
            currency: 'KRW',
            pay_method: payMethod,
            status: 'paid',
            pg_provider: 'nicepay',
            pg_tx_id: result.txId,
            paid_at: new Date().toISOString(),
          });

          // 구독 활성화
          await activateSubscription(customerId, plan.id);
        }

        alert(isKo ? '결제가 완료되었습니다! 구독이 활성화됩니다.' : 'Payment complete! Your subscription is now active.');
        onPaymentSuccess?.();
        onClose();
      } else {
        // 사용자 취소 (PAYMENT_USER_CANCEL) 는 조용히 처리
        if (result.code === 'PAYMENT_USER_CANCEL' || result.code === 'USER_CANCEL') {
          return;
        }
        alert(isKo
          ? `결제에 실패했습니다: ${result.message ?? '알 수 없는 오류'}`
          : `Payment failed: ${result.message ?? 'Unknown error'}`);
      }
    } catch {
      alert(isKo ? '결제 처리 중 오류가 발생했습니다.' : 'An error occurred during payment.');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, plan, isKo, payMethod, customerEmail, customerId, onPaymentSuccess, onClose]);

  if (!isOpen) return null;

  // 플랜별 테마
  const isPro = plan.id === 'pro';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* 모달 본체 */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#0E1525] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── 헤더 ──────────────────────────────────────── */}
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

        {/* ── 스크롤 컨텐츠 ─────────────────────────────── */}
        <div className="overflow-y-auto max-h-[calc(100vh-8rem)] p-6 space-y-6">

          {/* ▸ 플랜 카드 */}
          <div className={`p-5 rounded-2xl border ${
            isPro
              ? 'bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20'
              : 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isPro
                  ? 'bg-blue-500/10 border border-blue-400/30'
                  : 'bg-black border-2 border-amber-400'
              }`}>
                {isPro
                  ? <Star size={20} className="text-blue-400" />
                  : <Crown size={20} className="text-amber-400" />
                }
              </div>
              <div>
                <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                  {plan.label} PLAN
                </p>
                <p className={`text-xs font-semibold ${
                  isPro ? 'text-blue-500 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {isKo ? '월간 구독권' : 'Monthly Plan'}
                </p>
              </div>
            </div>

            {/* 기능 목록 (체크마크 6개) */}
            <ul className="space-y-2">
              {plan.features.map((feat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    isPro
                      ? 'bg-blue-400/20 border border-blue-400'
                      : 'bg-amber-400/20 border border-amber-400'
                  }`}>
                    <Check size={10} className={isPro ? 'text-blue-500' : 'text-amber-500'} />
                  </div>
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {feat}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ▸ 결제 수단 선택 */}
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
                      isSelected
                        ? isPro
                          ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-400 dark:border-blue-400 shadow-md shadow-blue-500/10'
                          : 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-400 shadow-md shadow-amber-500/10'
                        : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className={`${
                      isSelected
                        ? isPro ? 'text-blue-500 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {METHOD_ICON_MAP[opt.icon] ?? <CreditCard size={20} />}
                    </span>
                    <span className={`text-[10px] font-bold leading-tight ${
                      isSelected
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {isKo ? opt.label.ko : opt.label.en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ▸ 금액 정보 */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                {isKo ? '구독 금액' : 'Subscription'}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {plan.priceFormatted}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                {isKo ? '할인 금액' : 'Discount'}
              </span>
              <span className="text-sm font-bold text-emerald-500">
                -₩0
              </span>
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
              <p className={`text-2xl font-black ${
                isPro ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {plan.priceFormatted}
              </p>
            </div>
          </div>

          {/* ▸ 결제 버튼 */}
          <button
            onClick={handlePay}
            disabled={isProcessing}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
              isPro
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30'
                : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black shadow-lg shadow-amber-500/30'
            }`}
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

          {/* ▸ 하단 안내 문구 */}
          <div className="text-center space-y-1 pt-2">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              {isKo
                ? '구독 시작 시 서비스 이용 약관에 동의하는 것으로 간주합니다.'
                : 'By subscribing, you agree to our Terms of Service.'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              {isKo
                ? '월간 구독은 언제든지 해지 가능합니다.'
                : 'Monthly subscriptions can be cancelled anytime.'}
            </p>
          </div>
        </div>

        {/* ── 닫기 버튼 (우상단) ────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-200/50 dark:bg-white/10 flex items-center justify-center hover:bg-slate-300/50 dark:hover:bg-white/20 transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-slate-500 dark:text-slate-400" />
        </button>
      </div>
    </div>
  );
};

export default CheckoutModal;
