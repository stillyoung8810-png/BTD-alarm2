import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AppLang } from '../../types';
import { useTossApp } from '../../contexts/TossAppContext';
import AuthModals, {
  type AuthCommands,
  type ChangePasswordDraft,
  type SignupDraft,
  type SignupCommandResult,
} from '../AuthModals';
import {
  TdsConfirmDialog,
  type TdsConfirmDialogProps,
} from '../tds-adapter/TdsConfirmDialog';
import {
  useAsyncTdsConfirm,
  type AsyncTdsConfirmDialogProps,
  type UseAsyncTdsConfirmResult,
} from '../tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import {
  FALLBACK_AUTH_MESSAGES,
  getAuthModalMessages,
} from '../../constants/messages/authMessages';
import type {
  AuthModalType,
  AuthSignedInPayload,
  SignedInUser,
} from './authViewTypes';
import { clearAuthStorage, supabase } from '../../services/supabase';
import { normalizeErrorMessage } from '../../services/serviceUtils';
import { buildRedirectUrl } from '../../utils/authHelpers';
import { showErrorToast } from '../tds-adapter/showErrorToast';

const AUTH_PENDING_CONSENT_STORAGE_KEY = 'btd_pending_consent';
const AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL =
  'AUTH_MISSING_CURRENT_USER_EMAIL';
const AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT =
  'AUTH_CURRENT_PASSWORD_INCORRECT';

type BaseAuthModalsProps = Omit<
  React.ComponentProps<typeof AuthModals>,
  'lang' | 'onClose' | 'onRequestClose' | 'onSignedIn' | 'commands'
>;

interface FinishSignedInFlowOptions {
  shouldShowWelcome: boolean;
}

interface AuthModalCoordinatorProps extends BaseAuthModalsProps {
  lang: AppLang;
  isOpen: boolean;
  type: AuthModalType;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
  onCommitSignedIn: (user: SignedInUser) => Promise<void> | void;
  onFinishSignedInFlow: (
    user: SignedInUser,
    options: FinishSignedInFlowOptions,
  ) => Promise<void> | void;
  shouldShowSignedInWelcome: boolean;
  onCompleteSignedInWelcome: () => void;
}

function isTossAuthSuccessPayload(
  payload: AuthSignedInPayload,
): payload is Extract<AuthSignedInPayload, { session: unknown }> {
  return 'session' in payload;
}

function AuthModalCoordinator({
  lang,
  isOpen,
  type,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  shouldShowSignedInWelcome,
  onCompleteSignedInWelcome,
  currentUserEmail = null,
  currentUserId,
  ...authModalProps
}: AuthModalCoordinatorProps): React.ReactElement | null {
  const { isInTossApp } = useTossApp();
  const exitDialog: UseAsyncTdsConfirmResult = useAsyncTdsConfirm(lang);
  const exitDialogProps: AsyncTdsConfirmDialogProps = exitDialog.dialogProps;
  const actionLabels =
    TDS_DIALOG_MESSAGES[lang]?.actions ?? TDS_DIALOG_MESSAGES.ko.actions;
  const confirmDialogProps: TdsConfirmDialogProps = {
    ...exitDialogProps,
    labels: actionLabels,
  };
  const copy = getAuthModalMessages(lang);
  const fallbackCopy =
    FALLBACK_AUTH_MESSAGES[lang] ?? FALLBACK_AUTH_MESSAGES.ko;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const commands: AuthCommands = useMemo(() => {
    const normalizedCurrentUserEmail = currentUserEmail?.trim() ?? '';
    const normalizedCurrentUserId = currentUserId?.trim() ?? '';

    return {
      signIn: {
        isExecuting: false,
        run: async (email: string, password: string): Promise<SignedInUser> => {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error != null) {
            throw error;
          }
          if (data.user == null) {
            throw new Error(copy.validation.authenticationFailed);
          }

          return {
            id: data.user.id,
            email: data.user.email ?? email,
          };
        },
      },
      signUp: {
        isExecuting: false,
        run: async (draft: SignupDraft): Promise<SignupCommandResult> => {
          const consentTimestamp = new Date().toISOString();
          const emailRedirectTo = buildRedirectUrl('/auth/callback');
          const { data, error } = await supabase.auth.signUp({
            email: draft.email,
            password: draft.password,
            options: {
              emailRedirectTo,
              data: {
                terms_consent_at: consentTimestamp,
                privacy_consent_at: consentTimestamp,
              },
            },
          });
          if (error != null) {
            throw error;
          }
          if (data.user == null) {
            throw new Error(copy.validation.signupFailed);
          }
          if (data.session == null) {
            return {
              kind: 'verify_email',
            };
          }

          return {
            kind: 'signed_in',
            user: {
              id: data.user.id,
              email: data.user.email ?? draft.email,
            },
          };
        },
      },
      signInWithOAuth: {
        isExecuting: false,
        run: async (
          provider: 'google' | 'github' | 'kakao',
          mode: 'login' | 'signup',
        ): Promise<void> => {
          if (mode === 'signup' && typeof window !== 'undefined') {
            const consentTimestamp = new Date().toISOString();
            localStorage.setItem(
              AUTH_PENDING_CONSENT_STORAGE_KEY,
              JSON.stringify({
                terms_consent_at: consentTimestamp,
                privacy_consent_at: consentTimestamp,
              }),
            );
          }

          const redirectTo = buildRedirectUrl('/auth/callback');
          const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              queryParams:
                provider === 'kakao'
                  ? {
                      access_type: 'offline',
                      prompt: 'consent',
                    }
                  : undefined,
            },
          });
          if (error != null) {
            throw error;
          }
        },
      },
      resetPassword: {
        isExecuting: false,
        run: async (email: string): Promise<void> => {
          const redirectTo = buildRedirectUrl('/auth/reset-password');
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
          });
          if (error != null) {
            throw error;
          }
        },
      },
      changePassword: {
        isExecuting: false,
        run: async (draft: ChangePasswordDraft): Promise<void> => {
          if (draft.currentPassword.trim() !== '') {
            if (normalizedCurrentUserEmail.length === 0) {
              throw new Error(AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL);
            }

            const { error: signInError } = await supabase.auth.signInWithPassword(
              {
                email: normalizedCurrentUserEmail,
                password: draft.currentPassword,
              },
            );
            if (signInError != null) {
              throw new Error(AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT);
            }
          }

          const { error } = await supabase.auth.updateUser({
            password: draft.newPassword,
          });
          if (error != null) {
            throw error;
          }
        },
      },
      connectTelegram: {
        isExecuting: false,
        run: async (): Promise<string> => {
          if (normalizedCurrentUserId.length === 0) {
            throw new Error('User ID required');
          }

          const token = crypto.randomUUID().replace(/-/g, '');
          const { error } = await supabase
            .from('telegram_link_tokens')
            .insert({ user_id: normalizedCurrentUserId, token });
          if (error != null) {
            throw error;
          }

          return token;
        },
      },
      deleteAccount: {
        isExecuting: false,
        run: async (): Promise<void> => {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();
          if (sessionError != null) {
            throw sessionError;
          }
          const sessionAccessToken = session?.access_token ?? '';
          if (sessionAccessToken.trim() === '') {
            const sessionExpiredMessage =
              TDS_DIALOG_MESSAGES[lang]?.auth?.sessionExpiredBody ??
              TDS_DIALOG_MESSAGES.ko.auth.sessionExpiredBody;
            throw new Error(sessionExpiredMessage);
          }

          const result = await supabase.functions.invoke('delete-account', {
            headers: {
              Authorization: `Bearer ${sessionAccessToken}`,
            },
          });
          if (result.error != null) {
            throw new Error(
              result.error.message || copy.profile.deleteAccountFailed,
            );
          }
        },
      },
    };
  }, [copy, currentUserEmail, currentUserId, lang]);

  const isCommittingSignInRef = useRef(false);

  const resolveSignedInUserAfterSession = useCallback(
    async (
      sessionUser: { id: string; email?: string | null } | null,
      fallbackUser?: SignedInUser,
    ): Promise<SignedInUser> => {
      if (sessionUser != null && sessionUser.id.trim().length > 0) {
        return {
          id: sessionUser.id,
          email: sessionUser.email ?? fallbackUser?.email ?? '',
        };
      }

      if (fallbackUser != null && fallbackUser.id.trim().length > 0) {
        return fallbackUser;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error != null) {
        throw error;
      }

      if (data.user == null || data.user.id.trim().length === 0) {
        throw new Error(fallbackCopy.tossSessionApplyFailed);
      }

      return {
        id: data.user.id,
        email: data.user.email ?? '',
      };
    },
    [fallbackCopy.tossSessionApplyFailed],
  );

  const rollbackLocalSession = useCallback(async (): Promise<void> => {
    clearAuthStorage();

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error: unknown) {
      console.warn(
        '[AuthModalCoordinator] Local session rollback failed',
        error,
      );
    }
  }, []);

  const finishSignedInFlow = useCallback(
    async (user: SignedInUser): Promise<void> => {
      if (!isMountedRef.current) {
        return;
      }

      await Promise.resolve(onCommitSignedIn(user));

      if (!isMountedRef.current) {
        return;
      }

      const shouldShowWelcome =
        isInTossApp && (type === 'login' || type === 'signup');

      await Promise.resolve(
        onFinishSignedInFlow(user, {
          shouldShowWelcome,
        }),
      );
    },
    [isInTossApp, onCommitSignedIn, onFinishSignedInFlow, type],
  );

  const handleSignedIn = useCallback(
    async (payload: AuthSignedInPayload) => {
      if (isCommittingSignInRef.current) {
        return;
      }
      isCommittingSignInRef.current = true;

      const isTossPayload = isTossAuthSuccessPayload(payload);
      let hasAppliedSession = false;

      try {
        if (!isTossPayload) {
          await finishSignedInFlow(payload);
          return;
        }

        const { data, error } = await supabase.auth.setSession({
          access_token: payload.session.accessToken,
          refresh_token: payload.session.refreshToken,
        });
        if (error != null) {
          throw error;
        }

        hasAppliedSession = true;
        const signedInUser = await resolveSignedInUserAfterSession(
          data.user,
          payload.user,
        );
        await finishSignedInFlow(signedInUser);
      } catch (error: unknown) {
        const fallbackMessage = isTossPayload
          ? fallbackCopy.tossSessionApplyFailed
          : copy.validation.authenticationFailed;
        const message = normalizeErrorMessage(error, fallbackMessage);

        console.error(
          '[AuthModalCoordinator] Sign-in flow execution failed',
          error,
        );

        if (isTossPayload && hasAppliedSession) {
          await rollbackLocalSession();
        }

        showErrorToast(message);
        throw new Error(message);
      } finally {
        isCommittingSignInRef.current = false;
      }
    },
    [
      copy.validation.authenticationFailed,
      fallbackCopy.tossSessionApplyFailed,
      finishSignedInFlow,
      resolveSignedInUserAfterSession,
      rollbackLocalSession,
    ],
  );

  const handleRequestMiniAppExit = useCallback(async () => {
    try {
      await Promise.resolve(onRequestMiniAppExit());
    } catch (error: unknown) {
      console.error(
        '[AuthModalCoordinator] Mini-app exit request failed',
        error,
      );
      throw error;
    }
  }, [onRequestMiniAppExit]);

  const handleRequestClose = useCallback(() => {
    if (!isInTossApp || type !== 'login') {
      onCloseAuthModal();
      return;
    }

    exitDialog.open({
      title: copy.exitDialog.authCloseTitle,
      body: copy.exitDialog.authCloseBody,
      confirmLabel: copy.exitDialog.authCloseConfirm,
      tone: 'primary',
      action: async () => {
        try {
          await handleRequestMiniAppExit();
        } catch (error: unknown) {
          console.error(
            '[AuthModalCoordinator] Auth close confirm action failed',
            error,
          );
        } finally {
          onCloseAuthModal();
        }
      },
    });
  }, [
    copy.exitDialog.authCloseBody,
    copy.exitDialog.authCloseConfirm,
    copy.exitDialog.authCloseTitle,
    exitDialog,
    handleRequestMiniAppExit,
    isInTossApp,
    onCloseAuthModal,
    type,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AuthModals
        {...authModalProps}
        lang={lang}
        type={type}
        commands={commands}
        onClose={onCloseAuthModal}
        onRequestClose={handleRequestClose}
        onSignedIn={handleSignedIn}
        currentUserEmail={currentUserEmail}
        currentUserId={currentUserId}
        shouldShowSignedInWelcome={shouldShowSignedInWelcome}
        onCompleteSignedInWelcome={onCompleteSignedInWelcome}
      />

      <TdsConfirmDialog {...confirmDialogProps} />
    </>
  );
}

export default AuthModalCoordinator;
