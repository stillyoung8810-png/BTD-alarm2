import React from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsAlertDialog } from '../tds-adapter/TdsAlertDialog';

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
  if (!isOpen) {
    return null;
  }

  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;

  if (labels == null || authMessages == null) {
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
