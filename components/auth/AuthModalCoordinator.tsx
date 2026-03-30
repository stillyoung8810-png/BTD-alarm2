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
  'lang' | 'onClose' | 'onRequestClose' | 'onSignedIn'
>;

type SignedInUser = {
  id: string;
  email: string;
};

interface AuthModalCoordinatorProps extends BaseAuthModalsProps {
  lang: AppLang;
  isOpen: boolean;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
  onCommitSignedIn: (user: SignedInUser) => Promise<void> | void;
  onFinishSignedInFlow: (
    user: SignedInUser,
    options: { shouldShowWelcome: boolean },
  ) => Promise<void> | void;
  shouldShowSignedInWelcome: boolean;
  onCompleteSignedInWelcome: () => void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  shouldShowSignedInWelcome,
  onCompleteSignedInWelcome,
  type,
  ...authModalProps
}) => {
  const { isInTossApp } = useTossApp();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const exitDialog = useAsyncTdsConfirm(lang);

  const handleSignedIn = useCallback(
    async (user: SignedInUser) => {
      await Promise.resolve(onCommitSignedIn(user));

      const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
      const acknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
      const canShowSignedInWelcome =
        isInTossApp && (type === 'login' || type === 'signup');

      const shouldShowWelcome =
        canShowSignedInWelcome &&
        authMessages != null &&
        acknowledge != null &&
        actionLabels != null;

      await Promise.resolve(
        onFinishSignedInFlow(user, {
          shouldShowWelcome,
        }),
      );
    },
    [
      isInTossApp,
      lang,
      onCommitSignedIn,
      onFinishSignedInFlow,
      type,
    ],
  );

  const handleRequestExit = useCallback(
    (reason: ExitDialogReason) => {
      if (!isInTossApp || type !== 'login') {
        onCloseAuthModal();
        return;
      }

      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.[reason];
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
      if (exitMessage == null || actionLabels == null) {
        onCloseAuthModal();
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
        onSignedIn={handleSignedIn}
        shouldShowSignedInWelcome={shouldShowSignedInWelcome}
        onCompleteSignedInWelcome={onCompleteSignedInWelcome}
      />

      {labels != null ? (
        <TdsConfirmDialog {...exitDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};

export default AuthModalCoordinator;
