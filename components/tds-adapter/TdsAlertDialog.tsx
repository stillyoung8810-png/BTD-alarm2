import React from 'react';
import { TDSButton } from '../tds';
import { TdsDialogShell } from './TdsDialogShell';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

export interface TdsAlertDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  labels: DialogActionLabels;
  onClose: () => void;
}

export const TdsAlertDialog: React.FC<TdsAlertDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  labels,
  onClose,
}) => {
  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      footer={
        <TDSButton type="button" variant="primary" fullWidth onClick={onClose}>
          {confirmLabel}
        </TDSButton>
      }
    >
      <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{body}</p>
    </TdsDialogShell>
  );
};

export default TdsAlertDialog;
