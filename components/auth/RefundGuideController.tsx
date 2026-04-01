import React, { useCallback, useState } from 'react';
import type { AppLang } from '../../types';
import { TDSButton } from '../tds';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface RefundGuideControllerProps {
  lang: AppLang;
  isDisabled: boolean;
}

const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isDisabled,
}) => {
  const refundDialog = useAsyncTdsConfirm(lang);
  const [isRefundPanelOpen, setIsRefundPanelOpen] = useState(false);
  const messages = TDS_DIALOG_MESSAGES[lang];
  const labels = messages?.actions;
  const refundMessages = messages?.refund;

  const showRefundErrorToast = () => {
    const currentErrorMessage = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
    if (currentErrorMessage != null && currentErrorMessage !== '') {
      showErrorToast(currentErrorMessage);
    }
  };

  const handleConfirmRefund = useCallback(() => {
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
  }, [lang, refundDialog.open]);

  if (refundMessages == null || labels == null) {
    return null;
  }

  return (
    <>
      {!isRefundPanelOpen ? (
        <TDSButton
          variant="tertiary"
          fullWidth
          onClick={() => setIsRefundPanelOpen(true)}
          disabled={isDisabled}
        >
          {refundMessages.requestRefund}
        </TDSButton>
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
            <TDSButton
              variant="tertiary"
              className="flex-1"
              onClick={() => setIsRefundPanelOpen(false)}
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
              {refundMessages.openRefundGuide}
            </TDSButton>
          </div>
        </div>
      )}

      <TdsConfirmDialog
        {...refundDialog.dialogProps}
        labels={labels}
        shouldHideCancel={true}
      />
    </>
  );
};

export default RefundGuideController;
