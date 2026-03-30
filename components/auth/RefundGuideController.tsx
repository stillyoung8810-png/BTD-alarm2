import React, { useCallback, useRef, useState } from 'react';
import type { AppLang } from '../../types';
import { TDSButton } from '../tds';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface RefundGuideControllerProps {
  lang: AppLang;
  isInTossApp: boolean;
  isDisabled: boolean;
  onProcessWebRefund: () => Promise<void> | void;
}

const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isInTossApp,
  isDisabled,
  onProcessWebRefund,
}) => {
  const refundDialog = useAsyncTdsConfirm(lang);
  const [isRefundPanelOpen, setIsRefundPanelOpen] = useState(false);
  const [isWebLoading, setIsWebLoading] = useState(false);
  const isWebProcessingRef = useRef(false);

  const messages = TDS_DIALOG_MESSAGES[lang];
  const labels = messages?.actions;
  const refundMessages = messages?.refund;
  
  const showRefundErrorToast = () => {
    const currentErrorMessage =
      TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
    if (currentErrorMessage != null && currentErrorMessage !== '') {
      showErrorToast(currentErrorMessage);
    }
  };

  const handleCloseRefundPanel = useCallback(() => {
    if (isWebLoading) {
      return;
    }
    setIsRefundPanelOpen(false);
  }, [isWebLoading]);

  const handleConfirmRefund = useCallback(async () => {
    if (!isInTossApp) {
      if (isWebProcessingRef.current) {
        return;
      }

      isWebProcessingRef.current = true;
      setIsWebLoading(true);

      try {
        await Promise.resolve(onProcessWebRefund());
        setIsRefundPanelOpen(false);
      } catch (_error: unknown) {
        showRefundErrorToast();
      } finally {
        isWebProcessingRef.current = false;
        setIsWebLoading(false);
      }
      return;
    }

    const currentLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
    const currentRefundMessages = TDS_DIALOG_MESSAGES[lang]?.refund;
    const currentAcknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;

    if (
      currentRefundMessages == null ||
      currentAcknowledge == null ||
      currentLabels == null
    ) {
      showRefundErrorToast();
      return;
    }

    refundDialog.open({
      title: currentRefundMessages.guideTitle ?? '',
      body: currentRefundMessages.guideBody ?? '',
      confirmLabel: currentAcknowledge,
      tone: 'primary',
      action: async () => {
        setIsRefundPanelOpen(false);
      },
    });
  }, [
    isInTossApp,
    lang,
    onProcessWebRefund,
    refundDialog.open,
  ]);

  if (refundMessages == null || labels == null) {
    return null;
  }

  const confirmButtonLabel = isInTossApp
    ? refundMessages.openRefundGuide
    : isWebLoading
    ? (messages?.common?.webAsyncProcessing ?? '')
    : refundMessages.confirmRefund;

  return (
    <>
      {!isRefundPanelOpen ? (
        isInTossApp ? (
          <TDSButton
            variant="tertiary"
            fullWidth
            onClick={() => setIsRefundPanelOpen(true)}
            disabled={isDisabled}
          >
            {refundMessages.requestRefund}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={() => setIsRefundPanelOpen(true)}
            disabled={isDisabled}
            className="w-full py-3 text-[11px] font-bold text-slate-400 hover:text-amber-500 transition-colors uppercase tracking-widest disabled:opacity-60"
          >
            {refundMessages.requestRefund}
          </button>
        )
      ) : (
        <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/40">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            {refundMessages.confirmPrompt}
          </p>
          <ul className="text-[10px] text-slate-500 dark:text-slate-400 space-y-1 list-disc pl-4">
            <li>{refundMessages.eligiblePolicy}</li>
            <li>{refundMessages.ineligiblePolicy}</li>
          </ul>
          <div className="flex gap-2">
            {isInTossApp ? (
              <>
                <TDSButton
                  variant="tertiary"
                  className="flex-1"
                  onClick={handleCloseRefundPanel}
                  disabled={isWebLoading}
                >
                  {labels.cancel}
                </TDSButton>
                <TDSButton
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    void handleConfirmRefund();
                  }}
                >
                  {confirmButtonLabel}
                </TDSButton>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCloseRefundPanel}
                  disabled={isWebLoading}
                  className="flex-1 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  disabled={isWebLoading}
                  aria-busy={isWebLoading}
                  onClick={() => {
                    void handleConfirmRefund();
                  }}
                  className="flex-1 py-3 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {confirmButtonLabel}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {labels != null ? (
        <TdsConfirmDialog
          {...refundDialog.dialogProps}
          labels={labels}
          shouldHideCancel={true}
        />
      ) : null}
    </>
  );
};

export default RefundGuideController;
