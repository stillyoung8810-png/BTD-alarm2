import React, { useCallback } from 'react';
import type { AppLang } from '../types';
import { Trash2 } from 'lucide-react';
import { TdsConfirmDialog } from './tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from './tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { showErrorToast } from './tds-adapter/showErrorToast';

interface HistoryHeaderActionsProps {
  lang: AppLang;
  canClearHistory: boolean;
  onClearHistory: () => Promise<void> | void;
}

export const HistoryHeaderActions: React.FC<HistoryHeaderActionsProps> = ({
  lang,
  canClearHistory,
  onClearHistory,
}) => {
  const clearDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const historyMessages = TDS_DIALOG_MESSAGES[lang]?.history;
  const triggerLabel =
    historyMessages?.clearHistoryButton ??
    historyMessages?.openClearDialog ??
    '';

  const handleRequestClearHistory = useCallback(() => {
    const currentLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
    const currentHistoryMessages = TDS_DIALOG_MESSAGES[lang]?.history;

    if (currentHistoryMessages == null || currentLabels == null) {
      const errorMessage =
        TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMessage != null && errorMessage !== '') {
        showErrorToast(errorMessage);
      }
      return;
    }

    clearDialog.open({
      title: currentHistoryMessages.clearTitle ?? '',
      body: currentHistoryMessages.clearBody ?? '',
      confirmLabel: currentHistoryMessages.clearConfirm ?? '',
      tone: 'danger',
      action: onClearHistory,
    });
  }, [clearDialog.open, lang, onClearHistory]);

  if (!canClearHistory) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleRequestClearHistory}
        className="glass px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-rose-500 border border-rose-500/40 hover:bg-rose-500/10 flex flex-row items-center justify-center gap-2"
      >
        <Trash2 size={14} className="shrink-0" />
        <span className="leading-none">{triggerLabel}</span>
      </button>

      {labels != null ? (
        <TdsConfirmDialog {...clearDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};

export default HistoryHeaderActions;
