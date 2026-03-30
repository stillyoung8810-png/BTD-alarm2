import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsConfirmDialog } from './TdsConfirmDialog';
import { useAsyncTdsConfirm } from './useAsyncTdsConfirm';

interface ConfirmDialogSampleProps {
  lang: AppLang;
}

export const ConfirmDialogSample: React.FC<ConfirmDialogSampleProps> = ({
  lang,
}) => {
  const dialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const sampleTrigger =
    TDS_DIALOG_MESSAGES[lang]?.samples?.openDangerConfirmSample ?? '';

  const handleOpenDangerDialog = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.history;
    if (messages == null) {
      return;
    }
    dialog.open({
      title: messages.clearTitle ?? '',
      body: messages.clearBody ?? '',
      confirmLabel: messages.clearConfirm ?? '',
      tone: 'danger',
      action: async () => {
        // 샘플: 실제 구현에서는 API 등
      },
    });
  }, [dialog.open, lang]);

  return (
    <>
      <button type="button" onClick={handleOpenDangerDialog}>
        {sampleTrigger}
      </button>
      {labels != null ? (
        <TdsConfirmDialog {...dialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
