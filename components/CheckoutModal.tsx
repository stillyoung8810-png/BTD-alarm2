/**
 * CheckoutModal — 주문 요약 & Toss IAP 결제 모달
 */

import React, { useState, useCallback, useRef } from 'react';
import { calculateSafeTotalAmountKRW, formatPriceKRW } from '../utils/currency';
import {
  X,
  Star,
  Check,
  Shield,
} from 'lucide-react';
import {
  PLAN_DAYS_PER_UNIT,
  TOSS_IAP_FIXED_PLAN_ID,
  TOSS_IAP_FIXED_QUANTITY,
} from '../services/payment/types';
import { requestTossIAP } from '../services/payment/tossIapService';
import { TDSModal, TDSButton } from './tds';
import { getServicePeriodDisplay } from '../utils/dateUtils';
import { MembershipConfig } from '../constants/membership';
import {
  PAYMENT_CHECKOUT_MESSAGES,
  PAYMENT_CHECKOUT_REFUND_EMAIL,
} from '../constants/paymentCheckoutMessages';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { TdsAlertDialog } from './tds-adapter/TdsAlertDialog';
import { getPricingMessages } from '../constants/messages/pricingMessages';
import { showErrorToast } from './tds-adapter/showErrorToast';
import { LegalDisclaimer } from './common/LegalDisclaimer';

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
    total: 'text-blue-600 dark:text-blue-400',
  },
} as const;

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ko' | 'en';
  customerEmail?: string;
  customerId?: string;
  onPaymentSuccess?: () => void;
}

function ModalWrapper({
  children,
  open,
  onClose,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return <TDSModal open={open} onClose={onClose}>{children}</TDSModal>;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  lang,
  onPaymentSuccess,
}) => {
  const messages = PAYMENT_CHECKOUT_MESSAGES[lang];
  const pricingCheckoutCopy = getPricingMessages(lang).checkout;
  const tdsActions = TDS_DIALOG_MESSAGES[lang]?.actions;
  const checkoutNoticeTitle =
    TDS_DIALOG_MESSAGES[lang]?.checkout?.resultNoticeTitle ?? '';
  const acknowledgeLabel = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge ?? '';

  const [checkoutNoticeBody, setCheckoutNoticeBody] = useState<string | null>(null);
  const checkoutAfterAckRef = useRef<'success_dismiss' | 'error_refresh_dismiss' | 'none'>(
    'none',
  );

  const openCheckoutNotice = useCallback(
    (
      body: string,
      afterAck: 'success_dismiss' | 'error_refresh_dismiss' | 'none',
    ) => {
      checkoutAfterAckRef.current = afterAck;
      setCheckoutNoticeBody(body);
    },
    [],
  );

  const handleCheckoutNoticeClose = useCallback(() => {
    const afterAck = checkoutAfterAckRef.current;
    checkoutAfterAckRef.current = 'none';
    setCheckoutNoticeBody(null);
    if (afterAck === 'success_dismiss' || afterAck === 'error_refresh_dismiss') {
      onPaymentSuccess?.();
      onClose();
    }
  }, [onPaymentSuccess, onClose]);

  const lk: 'ko' | 'en' = lang;
  const [isProcessing, setIsProcessing] = useState(false);
  const isExecutingRef = useRef(false); // Rule 11: 동기 뮤텍스 (더블 서밋 방지)

  const proCfg = MembershipConfig.byType[TOSS_IAP_FIXED_PLAN_ID];
  const activePlan = {
    id: TOSS_IAP_FIXED_PLAN_ID,
    label: proCfg.displayName,
    subtitle: proCfg.subtitle[lk],
    price: proCfg.rawAmount,
    priceFormatted: formatPriceKRW(proCfg.rawAmount),
    features: proCfg.features[lk],
  };

  const effectiveQuantity = TOSS_IAP_FIXED_QUANTITY;
  const totalDays = PLAN_DAYS_PER_UNIT * effectiveQuantity;
  const totalAmount = calculateSafeTotalAmountKRW(activePlan.price, effectiveQuantity);
  const totalFormatted = formatPriceKRW(totalAmount);
  const isInvalidPrice = totalAmount <= 0;

  const handleTossIapPay = useCallback(async () => {
    const result = await requestTossIAP(TOSS_IAP_FIXED_PLAN_ID, TOSS_IAP_FIXED_QUANTITY);

    if (!result.success) {
      return {
        ok: false as const,
        cancel: result.cancel,
        errorCode: result.errorCode,
        rawMessage: result.rawMessage,
      };
    }

    return { ok: true as const };
  }, []);

  const handlePay = useCallback(async (): Promise<void> => {
    if (isExecutingRef.current) {
      return;
    }

    if (isInvalidPrice) {
      openCheckoutNotice(PAYMENT_CHECKOUT_MESSAGES[lang].ERR_INVALID_PRICE, 'none');
      return;
    }

    isExecutingRef.current = true;
    setIsProcessing(true);

    let isUnmounted = false;

    try {
      const outcome = await Promise.resolve(handleTossIapPay());

      if (outcome.cancel) {
        return;
      }

      if (outcome.ok) {
        onPaymentSuccess?.();
        isUnmounted = true;
        onClose();
        return;
      }

      const errorCode = outcome.errorCode;
      console.error(
        '[CheckoutModal] payment failed:',
        errorCode,
        outcome.rawMessage,
      );

      showErrorToast(pricingCheckoutCopy.paymentFailed);
    } catch (error) {
      console.error('[CheckoutModal] unhandled rejection:', error);

      showErrorToast(pricingCheckoutCopy.systemError);
      isUnmounted = true;
      onClose();
    } finally {
      isExecutingRef.current = false;
      if (!isUnmounted) {
        setIsProcessing(false);
      }
    }
  }, [
    isInvalidPrice,
    lang,
    handleTossIapPay,
    openCheckoutNotice,
    onClose,
    onPaymentSuccess,
    pricingCheckoutCopy.paymentFailed,
    pricingCheckoutCopy.systemError,
  ]);

  if (!isOpen) {
    return null;
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
        <div className={`p-5 rounded-2xl border ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].iconBg}`}>
              <Star size={20} className={PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].icon} />
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                {messages.PLAN_NAME_WITH_SUFFIX(activePlan.label)}
              </p>
              <p className={`text-xs font-semibold ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].subtitle}`}>
                {messages.DURATION_PACKAGE_LABEL(totalDays)}
              </p>
            </div>
          </div>

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

          <ul className="space-y-2">
            {activePlan.features.map((feat, featIndex) => (
              <li key={`${activePlan.id}-feat-${featIndex}-${feat.slice(0, 24)}`} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].check}`}>
                  <Check size={10} className={PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].checkIcon} />
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

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {messages.TOSS_IAP_NOTICE}
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {messages.PLAN_PRICE}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {activePlan.priceFormatted} × {effectiveQuantity} = {totalFormatted}
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
            <p className={`text-2xl font-black ${PLAN_STYLES[TOSS_IAP_FIXED_PLAN_ID].total}`}>{totalFormatted}</p>
          </div>
        </div>

        <LegalDisclaimer
          lang={lang}
          variant="accent"
          layoutClassName="text-center"
        />

        <TDSButton
          fullWidth
          loading={isProcessing}
          disabled={isProcessing || isInvalidPrice}
          onClick={() => void handlePay()}
        >
          {isProcessing ? pricingCheckoutCopy.processing : pricingCheckoutCopy.pay}
        </TDSButton>

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
    <>
      <ModalWrapper open={isOpen} onClose={onClose}>
        {modalBody}
      </ModalWrapper>
      {checkoutNoticeBody != null && tdsActions != null ? (
        <TdsAlertDialog
          isOpen
          title={checkoutNoticeTitle}
          body={checkoutNoticeBody}
          confirmLabel={acknowledgeLabel}
          labels={tdsActions}
          onClose={handleCheckoutNoticeClose}
        />
      ) : null}
    </>
  );
};

export default CheckoutModal;
