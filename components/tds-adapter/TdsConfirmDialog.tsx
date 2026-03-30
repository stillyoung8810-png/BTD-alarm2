import React from 'react';
import { TDSButton } from '../tds';
import { TdsDialogShell } from './TdsDialogShell';
import type {
  DialogActionLabels,
  DialogTone,
} from '../../constants/tdsDialogMessages';

const getButtonVariant = (tone: DialogTone): 'primary' | 'dangerFill' => {
  switch (tone) {
    case 'danger':
      return 'dangerFill';
    case 'primary':
      return 'primary';
    default: {
      const _exhaustiveCheck: never = tone;
      void _exhaustiveCheck;
      return 'primary';
    }
  }
};

export interface TdsConfirmDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  labels: DialogActionLabels;
  tone?: DialogTone;
  shouldHideCancel?: boolean;
  isConfirmLoading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const TdsConfirmDialog: React.FC<TdsConfirmDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  labels,
  tone = 'primary',
  shouldHideCancel = false,
  isConfirmLoading = false,
  onClose,
  onConfirm,
}) => {
  const handleConfirmClick = (): void => {
    void onConfirm();
  };

  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      isConfirmLoading={isConfirmLoading}
      footer={
        <div className="flex w-full gap-3">
          {!shouldHideCancel ? (
            <TDSButton
              type="button"
              variant="tertiary"
              fullWidth
              className="min-w-0 flex-1"
              disabled={isConfirmLoading}
              onClick={onClose}
            >
              {labels.cancel}
            </TDSButton>
          ) : null}
          <TDSButton
            type="button"
            variant={getButtonVariant(tone)}
            fullWidth
            className="min-w-0 flex-1"
            loading={isConfirmLoading}
            disabled={isConfirmLoading}
            onClick={handleConfirmClick}
          >
            {confirmLabel}
          </TDSButton>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{body}</p>
    </TdsDialogShell>
  );
};

export default TdsConfirmDialog;
