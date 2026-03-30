import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { useTossApp } from '../../contexts/TossAppContext';
import AuthModals from '../AuthModals';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import {
  TDS_DIALOG_MESSAGES,
  type ExitDialogReason,
} from '../../constants/tdsDialogMessages';

type BaseAuthModalsProps = Omit<
  React.ComponentProps<typeof AuthModals>,
  'lang' | 'onClose' | 'onRequestClose'
>;

interface AuthModalCoordinatorProps extends BaseAuthModalsProps {
  lang: AppLang;
  isOpen: boolean;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
  type,
  ...authModalProps
}) => {
  const { isInTossApp } = useTossApp();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const exitDialog = useAsyncTdsConfirm(lang);

  const handleRequestExit = useCallback(
    (reason: ExitDialogReason) => {
      if (!isInTossApp || type !== 'login') {
        onCloseAuthModal();
        return;
      }

      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.[reason];
      if (exitMessage == null) {
        return;
      }

      exitDialog.open({
        title: exitMessage.title ?? '',
        body: exitMessage.body ?? '',
        confirmLabel: exitMessage.confirm ?? '',
        tone: 'primary',
        action: async () => {
          await Promise.resolve(onRequestMiniAppExit());
          onCloseAuthModal();
        },
      });
    },
    [
      exitDialog.open,
      isInTossApp,
      lang,
      onCloseAuthModal,
      onRequestMiniAppExit,
      type,
    ],
  );

  const handleAuthClose = useCallback(() => {
    handleRequestExit('auth_close');
  }, [handleRequestExit]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AuthModals
        {...authModalProps}
        lang={lang}
        type={type}
        onClose={onCloseAuthModal}
        onRequestClose={handleAuthClose}
      />

      {labels != null ? (
        <TdsConfirmDialog {...exitDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};

export default AuthModalCoordinator;
