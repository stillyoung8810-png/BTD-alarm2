import React, { useEffect, useRef } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsAlertDialog } from '../tds-adapter/TdsAlertDialog';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface SessionExpiredAlertGateProps {
  lang: AppLang;
  isOpen: boolean;
  onClose: () => void;
}

export const SessionExpiredAlertGate: React.FC<SessionExpiredAlertGateProps> = ({
  lang,
  isOpen,
  onClose,
}) => {
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
  const fallbackToastMessage = TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback;
  const hasRecoveryToastFiredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasRecoveryToastFiredRef.current = false;
      return;
    }
    if (labels != null && authMessages != null) {
      return;
    }
    if (
      !hasRecoveryToastFiredRef.current &&
      fallbackToastMessage != null &&
      fallbackToastMessage !== ''
    ) {
      hasRecoveryToastFiredRef.current = true;
      showErrorToast(fallbackToastMessage);
    }
    onClose();
  }, [authMessages, fallbackToastMessage, isOpen, labels, onClose]);

  if (!isOpen || labels == null || authMessages == null) {
    return null;
  }

  return (
    <TdsAlertDialog
      isOpen={isOpen}
      title={authMessages.sessionExpiredTitle}
      body={authMessages.sessionExpiredBody}
      confirmLabel={authMessages.sessionExpiredAcknowledge}
      labels={labels}
      onClose={onClose}
    />
  );
};

export default SessionExpiredAlertGate;