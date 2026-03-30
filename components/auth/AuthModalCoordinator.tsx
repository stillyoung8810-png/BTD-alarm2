import React, { useCallback, useState } from 'react';
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
  onFinishSignedInFlow: (user: SignedInUser) => Promise<void> | void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  type,
  ...authModalProps
}) => {
  const { isInTossApp } = useTossApp();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const exitDialog = useAsyncTdsConfirm(lang);
  const welcomeDialog = useAsyncTdsConfirm(lang);
  const [isAuthModalSuspended, setIsAuthModalSuspended] = useState(false);

  const handleWelcomeDialogClose = useCallback(() => {
    setIsAuthModalSuspended(false);
    welcomeDialog.close();
  }, [welcomeDialog.close]);

  const handleSignedIn = useCallback(
    async (user: SignedInUser) => {
      await Promise.resolve(onCommitSignedIn(user));

      const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
      const acknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
      const canShowSignedInWelcome =
        isInTossApp && (type === 'login' || type === 'signup');

      if (
        !canShowSignedInWelcome ||
        authMessages == null ||
        acknowledge == null ||
        actionLabels == null
      ) {
        setIsAuthModalSuspended(false);
        await Promise.resolve(onFinishSignedInFlow(user));
        return;
      }

      // 성공 직후 원본 인증 모달을 잠시 숨겨야 환영 다이얼로그가 가려지지 않습니다.
      setIsAuthModalSuspended(true);
      welcomeDialog.open({
        title: authMessages.signedInSuccessTitle ?? '',
        body: authMessages.signedInSuccessBody ?? '',
        confirmLabel: acknowledge,
        tone: 'primary',
        action: async () => {
          await Promise.resolve(onFinishSignedInFlow(user));
          setIsAuthModalSuspended(false);
        },
      });
    },
    [
      isInTossApp,
      lang,
      onCommitSignedIn,
      onFinishSignedInFlow,
      setIsAuthModalSuspended,
      type,
      welcomeDialog.open,
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
      {!isAuthModalSuspended ? (
        <AuthModals
          {...authModalProps}
          lang={lang}
          type={type}
          onClose={onCloseAuthModal}
          onRequestClose={handleAuthClose}
          onSignedIn={handleSignedIn}
        />
      ) : null}

      {labels != null ? (
        <>
          <TdsConfirmDialog {...exitDialog.dialogProps} labels={labels} />
          <TdsConfirmDialog
            {...welcomeDialog.dialogProps}
            labels={labels}
            onClose={handleWelcomeDialogClose}
            shouldHideCancel={true}
          />
        </>
      ) : null}
    </>
  );
};

export default AuthModalCoordinator;
