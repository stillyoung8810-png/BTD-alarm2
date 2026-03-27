/**
 * CheckoutModal — 주문 요약 & 결제 수단 선택 모달
 *
 * 이용권 개수 선택, 유료 서비스 이용 기간 표시, 결제 요청(포트원/IAP) 지원.
 */

import React, { useState, useCallback } from 'react';
import { calculateSafeTotalAmountKRW, formatPriceKRW } from '../utils/currency';
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
  TOSS_IAP_FIXED_PLAN_ID,
  TOSS_IAP_FIXED_QUANTITY,
  type PayMethod,
  type EasyPayProvider,
  type CheckoutPlanId,
} from '../services/payment/types';
import type { PaymentRequest } from '../services/payment/types';
import { requestPaymentWithServerVerify } from '../services/payment/paymentService';
import { requestTossIAP } from '../services/payment/tossIapService';
import { useTossApp } from '../contexts/TossAppContext';
import { TDSModal, TDSButton } from './tds';
import { getServicePeriodDisplay } from '../utils/dateUtils';
import { MembershipConfig } from '../constants/membership';
import {
  PAYMENT_CHECKOUT_MESSAGES,
  PAYMENT_CHECKOUT_REFUND_EMAIL,
  type PaymentCheckoutMessageSet,
  type TossIapErrorCode,
} from '../constants/paymentCheckoutMessages';

// ---------------------------------------------------------------------------
// 플랜 카드 스타일 (시각만; 카피는 paymentCheckoutMessages)
// ---------------------------------------------------------------------------
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

function getPrimaryCheckoutCtaLabel(
  m: PaymentCheckoutMessageSet,
  isPremiumComingSoon: boolean,
  isInTossApp: boolean,
): string {
  if (isPremiumComingSoon) {
    return m.PREMIUM_COMING_SOON;
  }
  if (isInTossApp) {
    return m.PAY;
  }
  return m.PAY_NOW;
}

const METHOD_ICON_MAP: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard size={20} />,
  Landmark: <Landmark size={20} />,
  ArrowLeftRight: <ArrowLeftRight size={20} />,
  Smartphone: <Smartphone size={20} />,
  Wallet: <Wallet size={20} />,
};

function notifyCheckoutError(message: string): void {
  alert(message);
}

function getTossIapAlertMessage(
  messages: PaymentCheckoutMessageSet,
  errorCode: TossIapErrorCode | undefined,
  rawMessage: string | undefined,
): string {
  if (!errorCode) {
    return messages.TOSS_IAP_ERROR_MESSAGES.UNKNOWN;
  }
  const mapped = messages.TOSS_IAP_ERROR_MESSAGES[errorCode];
  if (mapped) {
    return mapped;
  }
  return messages.FAILED(rawMessage ?? messages.UNKNOWN);
}

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

function ModalWrapper({
  children,
  open,
  onClose,
  useToss,
  closeLabel,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  useToss: boolean;
  closeLabel: string;
}) {
  const handleBackdropKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClose();
    }
  };

  if (useToss) {
    return <TDSModal open={open} onClose={onClose}>{children}</TDSModal>;
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
        role="button"
        tabIndex={0}
        aria-label={closeLabel}
        onClick={onClose}
        onKeyDown={handleBackdropKeyDown}
      />
      <div className="relative w-full max-w-md bg-white dark:bg-[#0E1525] rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  );
}

type CheckoutPlanRow = {
  id: CheckoutPlanId;
  label: string;
  subtitle: string;
  price: number;
  priceFormatted: string;
  features: string[];
};

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  lang,
  plan,
  customerEmail,
  customerId,
  onPaymentSuccess,
}) => {
  const { isInTossApp } = useTossApp();
  const messages = PAYMENT_CHECKOUT_MESSAGES[lang];
  const lk: 'ko' | 'en' = lang;
  const [selectedPlanId, setSelectedPlanId] = useState<CheckoutPlanId>(plan.id);
  const [payMethod, setPayMethod] = useState<PayMethod>('CARD');
  const [quantity, setQuantity] = useState<number>(DEFAULT_QUANTITY);
  const [isProcessing, setIsProcessing] = useState(false);

  const proCfg = MembershipConfig.byType.pro;
  const premiumCfg = MembershipConfig.byType.premium;

  const planMap: Record<CheckoutPlanId, CheckoutPlanRow> = {
    pro: {
      id: 'pro',
      label: proCfg.displayName,
      subtitle: proCfg.subtitle[lk],
      price: proCfg.rawAmount,
      priceFormatted: formatPriceKRW(proCfg.rawAmount),
      features: proCfg.features[lk],
    },
    premium: {
      id: 'premium',
      label: premiumCfg.displayName,
      subtitle: premiumCfg.subtitle[lk],
      price: premiumCfg.rawAmount,
      priceFormatted: formatPriceKRW(premiumCfg.rawAmount),
      features: premiumCfg.features[lk],
    },
  };

  const effectivePlanId: CheckoutPlanId = isInTossApp
    ? TOSS_IAP_FIXED_PLAN_ID
    : selectedPlanId;

  const effectiveQuantity = isInTossApp
    ? TOSS_IAP_FIXED_QUANTITY
    : quantity;

  const activePlanCandidate = planMap[effectivePlanId];
  if (!activePlanCandidate) {
    console.error('[CheckoutModal] Invalid plan ID for planMap', { effectivePlanId });
  }

  const activePlan =
    activePlanCandidate ?? planMap[TOSS_IAP_FIXED_PLAN_ID];

  if (!activePlan) {
    console.error('[CheckoutModal] planMap missing TOSS_IAP_FIXED_PLAN_ID; check MembershipConfig wiring');
  }

  const isPremiumComingSoon = !isInTossApp && effectivePlanId === 'premium';

  const totalDays = PLAN_DAYS_PER_UNIT * effectiveQuantity;
  const totalAmount = calculateSafeTotalAmountKRW(activePlan?.price, effectiveQuantity);
  const totalFormatted = formatPriceKRW(totalAmount);
  const isInvalidPrice = totalAmount <= 0;

  const styles = PLAN_STYLES[effectivePlanId];
  const primaryCtaLabel = getPrimaryCheckoutCtaLabel(
    messages,
    isPremiumComingSoon,
    isInTossApp,
  );

  const buildPayReq = useCallback((): PaymentRequest => {
    const safePlanLabel = activePlan?.label ?? messages.UNKNOWN_PLAN_LABEL;
    const baseRequest: PaymentRequest = {
      orderName: `${safePlanLabel} ${messages.DURATION_PACKAGE_LABEL(PLAN_DAYS_PER_UNIT * effectiveQuantity)}`,
      totalAmount,
      customerEmail,
      customerId,
      payMethod,
      planId: effectivePlanId,
      quantity: effectiveQuantity,
    };
    if (payMethod === 'EASY_PAY') {
      baseRequest.easyPayProvider = 'KAKAOPAY';
    }
    return baseRequest;
  }, [
    activePlan?.label,
    messages.UNKNOWN_PLAN_LABEL,
    messages.DURATION_PACKAGE_LABEL,
    effectiveQuantity,
    totalAmount,
    customerEmail,
    customerId,
    payMethod,
    effectivePlanId,
    lang,
  ]);

  const handleTossIapPay = useCallback(async () => {
    const result = await requestTossIAP(effectivePlanId, effectiveQuantity);
    if (!result.success) {
      return {
        ok: false as const,
        cancel: result.cancel,
        errorCode: result.errorCode,
        rawMessage: result.rawMessage,
      };
    }
    return { ok: true as const, needRefresh: true as const };
  }, [effectivePlanId, effectiveQuantity]);

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
    if (isProcessing || isPremiumComingSoon) {
      return;
    }
    if (isInvalidPrice) {
      alert(PAYMENT_CHECKOUT_MESSAGES[lang].ERR_INVALID_PRICE);
      return;
    }

    const msgs = PAYMENT_CHECKOUT_MESSAGES[lang];
    setIsProcessing(true);

    try {
      const outcome = isInTossApp
        ? await handleTossIapPay()
        : await handlePortOnePay(buildPayReq());

      if (outcome.cancel) {
        return;
      }

      if (outcome.ok) {
        alert(msgs.SUCCESS);
        onPaymentSuccess?.();
        onClose();
        return;
      }

      let extractedMessage: string | undefined;
      if ('rawMessage' in outcome && typeof outcome.rawMessage === 'string') {
        extractedMessage = outcome.rawMessage;
      } else if ('message' in outcome && typeof outcome.message === 'string') {
        extractedMessage = outcome.message;
      }

      let alertMessage = msgs.UNKNOWN;
      if ('configMissing' in outcome && outcome.configMissing) {
        alertMessage = msgs.CONFIG_MISSING;
      } else if ('errorCode' in outcome && outcome.errorCode) {
        alertMessage = getTossIapAlertMessage(
          msgs,
          outcome.errorCode as TossIapErrorCode,
          extractedMessage,
        );
      } else if ('needRefresh' in outcome && outcome.needRefresh) {
        alertMessage = msgs.VERIFY_FAILED(extractedMessage ?? '');
      } else {
        alertMessage = msgs.FAILED(extractedMessage ?? msgs.UNKNOWN);
      }

      notifyCheckoutError(alertMessage);

      if (outcome.needRefresh) {
        onPaymentSuccess?.();
        onClose();
      }
    } catch (error) {
      console.error('[Payment Error]', error);
      alert(msgs.PROCESSING_ERROR);
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    isPremiumComingSoon,
    isInvalidPrice,
    lang,
    isInTossApp,
    handleTossIapPay,
    handlePortOnePay,
    buildPayReq,
    onPaymentSuccess,
    onClose,
  ]);

  if (!isOpen) {
    return null;
  }

  if (!activePlan) {
    return (
      <ModalWrapper
        open={isOpen}
        onClose={onClose}
        useToss={isInTossApp}
        closeLabel={messages.CLOSE_MODAL}
      >
        <div className="p-6 text-center text-slate-500 dark:text-slate-400">
          {messages.CONFIG_MISSING}
        </div>
      </ModalWrapper>
    );
  }

  const periodLabel = getServicePeriodDisplay(totalDays, lang);

  const modalBody = (
    <>
      <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-[#0B0F19]">
        <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <span className="text-xl">{'<'}</span>
          {messages.ORDER_SUMMARY}
        </h2>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
          <Shield size={14} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            {messages.SECURE_CHECKOUT}
          </span>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-8rem)] p-6 space-y-6">
        {!isInTossApp && (
          <div className="flex justify-center">
            <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
              {(['pro', 'premium'] as const).map((id) => {
                const isSelected = selectedPlanId === id;
                const isPro = id === 'pro';
                let toggleClass = 'text-slate-500 dark:text-slate-300';
                if (isSelected && isPro) {
                  toggleClass = 'bg-blue-600 text-white';
                } else if (isSelected && !isPro) {
                  toggleClass = 'bg-amber-400 text-black';
                }
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedPlanId(id)}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${toggleClass}`}
                  >
                    {id.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={`p-5 rounded-2xl border ${styles.card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.iconBg}`}>
              {effectivePlanId === 'pro' ? (
                <Star size={20} className={styles.icon} />
              ) : (
                <Crown size={20} className={styles.icon} />
              )}
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                {messages.PLAN_NAME_WITH_SUFFIX(activePlan.label)}
              </p>
              <p className={`text-xs font-semibold ${styles.subtitle}`}>
                {messages.DURATION_PACKAGE_LABEL(totalDays)}
              </p>
            </div>
          </div>

          {isInTossApp ? (
            <div
              className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4"
              role="group"
              aria-labelledby="toss-fixed-duration-label"
            >
              <p
                id="toss-fixed-duration-label"
                className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2"
              >
                {messages.TOSS_FIXED_DURATION_LABEL}
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {messages.TOSS_FIXED_DURATION_VALUE(totalDays)}
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
                {messages.DURATION_LABEL}
              </label>
              <select
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium"
                aria-label={messages.DURATION_SELECT_ARIA}
              >
                {Array.from({ length: QUANTITY_MAX }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {messages.QUANTITY_OPTION(count, PLAN_DAYS_PER_UNIT * count)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <ul className="space-y-2">
            {activePlan.features.map((feat, featIndex) => (
              <li key={`${effectivePlanId}-feat-${featIndex}-${feat.slice(0, 24)}`} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${styles.check}`}>
                  <Check size={10} className={styles.checkIcon} />
                </div>
                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            {messages.PAID_SERVICE_PERIOD}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {periodLabel}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            {messages.PAID_SERVICE_PERIOD_HINT}
          </p>
        </div>

        {!isInTossApp && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              {messages.PAYMENT_METHOD_HEADING}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHOD_OPTIONS.map((opt) => {
                const isSelected = payMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPayMethod(opt.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-200 text-center ${
                      isSelected ? styles.methodSelected : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className={isSelected ? styles.methodIcon : 'text-slate-500 dark:text-slate-400'}>
                      {METHOD_ICON_MAP[opt.icon] ?? <CreditCard size={20} />}
                    </span>
                    <span className={`text-[10px] font-bold leading-tight ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                      {messages.PAY_METHOD_LABELS[opt.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isInTossApp && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {messages.TOSS_IAP_NOTICE}
            </p>
          </div>
        )}

        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {messages.PLAN_PRICE}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {activePlan?.priceFormatted ?? formatPriceKRW(0)} × {effectiveQuantity} = {totalFormatted}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {messages.DISCOUNT}
            </span>
            <span className="text-sm font-bold text-emerald-500">
              {messages.DISCOUNT_ZERO_LINE(formatPriceKRW(0))}
            </span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-white/5">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {messages.TOTAL}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {messages.VAT_INCLUDED}
              </p>
            </div>
            <p className={`text-2xl font-black ${styles.total}`}>{totalFormatted}</p>
          </div>
        </div>

        {isInTossApp ? (
          <TDSButton
            fullWidth
            loading={isProcessing}
            disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
            onClick={handlePay}
          >
            {isProcessing ? messages.PROCESSING : primaryCtaLabel}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={handlePay}
            disabled={isProcessing || isPremiumComingSoon || isInvalidPrice}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${styles.button}`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {messages.PROCESSING}
              </>
            ) : (
              <>
                <Zap size={18} />
                {primaryCtaLabel}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        )}

        {isPremiumComingSoon && (
          <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 text-center">
            {messages.PREMIUM_UNAVAILABLE_DETAIL}
          </p>
        )}

        <div className="text-center space-y-1 pt-2">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            {messages.TERMS_CONSENT_NOTICE}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            {messages.VALIDITY_NOTICE(totalDays)}
          </p>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            {messages.REFUND_SECTION_TITLE}
          </p>
          <ul className="text-[9px] text-slate-400 dark:text-slate-500 leading-[1.7] space-y-1 list-disc pl-3.5">
            <li>{messages.REFUND_BULLET_1}</li>
            <li>{messages.REFUND_BULLET_2}</li>
            <li>{messages.REFUND_BULLET_3(totalDays)}</li>
            <li>{messages.REFUND_INQUIRY(PAYMENT_CHECKOUT_REFUND_EMAIL)}</li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-200/50 dark:bg-white/10 flex items-center justify-center hover:bg-slate-300/50 dark:hover:bg-white/20 transition-colors"
        aria-label={messages.CLOSE_MODAL}
      >
        <X size={16} className="text-slate-500 dark:text-slate-400" />
      </button>
    </>
  );

  return (
    <ModalWrapper
      open={isOpen}
      onClose={onClose}
      useToss={isInTossApp}
      closeLabel={messages.CLOSE_MODAL}
    >
      {modalBody}
    </ModalWrapper>
  );
};

export default CheckoutModal;
