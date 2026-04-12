import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, UserCheck, ShieldCheck } from 'lucide-react';
import type { AppLang } from '../types';
import {
  getAuthModalMessages,
  type AuthModalMessageSet,
  type AuthModalType,
  type AuthProvider,
} from '../constants/messages/authMessages';
import { TDSButton, TDSModal, TDSModalHeader } from './tds';
import { TdsAlertDialog } from './tds-adapter/TdsAlertDialog';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { useTossApp } from '../contexts/TossAppContext';
import LoginView from './auth/LoginView';
import SignupView from './auth/SignupView';
import ResetPasswordView from './auth/ResetPasswordView';
import ChangePasswordView from './auth/ChangePasswordView';
import ProfileView from './auth/ProfileView';
import type {
  AuthSignedInPayload,
  SignedInUser,
  LoginViewProps,
  SignupViewProps,
  ResetPasswordViewProps,
  ChangePasswordViewProps,
  ProfileViewProps,
} from './auth/authViewTypes';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';

const EMAIL_VERIFICATION_REDIRECT_DELAY_MS = 3000;
const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_PASSWORD_RE = /[A-Z]/;
const LOWERCASE_PASSWORD_RE = /[a-z]/;
const NUMBER_PASSWORD_RE = /[0-9]/;
const SPECIAL_PASSWORD_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;
const AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL =
  'AUTH_MISSING_CURRENT_USER_EMAIL';
const AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT =
  'AUTH_CURRENT_PASSWORD_INCORRECT';

/**
 * Rule 10: `ProfileView` 등 메모이제이션된 자식에 안정된 `setLoading` 참조를 넘기기 위한 모듈 레벨 noop.
 */
const noopSetBoolean = (_value: boolean): void => {};

export interface SignupDraft {
  email: string;
  password: string;
  termsConsent: boolean;
  privacyConsent: boolean;
}

export interface ChangePasswordDraft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type AuthCompletionKind =
  | 'password_ok'
  | 'password_ok_relogin'
  | 'account_deleted';

export interface SignupCommandResultVerifyEmail {
  kind: 'verify_email';
}

export interface SignupCommandResultSignedIn {
  kind: 'signed_in';
  user: SignedInUser;
}

export type SignupCommandResult =
  | SignupCommandResultVerifyEmail
  | SignupCommandResultSignedIn;

export interface AuthCommands {
  signIn: {
    run: (email: string, password: string) => Promise<SignedInUser>;
    isExecuting: boolean;
  };
  signUp: {
    run: (draft: SignupDraft) => Promise<SignupCommandResult>;
    isExecuting: boolean;
  };
  signInWithOAuth: {
    run: (provider: AuthProvider, mode: 'login' | 'signup') => Promise<void>;
    isExecuting: boolean;
  };
  resetPassword: {
    run: (email: string) => Promise<void>;
    isExecuting: boolean;
  };
  changePassword: {
    run: (draft: ChangePasswordDraft) => Promise<void>;
    isExecuting: boolean;
  };
  connectTelegram: {
    run: () => Promise<string>;
    isExecuting: boolean;
  };
  deleteAccount: {
    run: () => Promise<void>;
    isExecuting: boolean;
  };
}

interface AuthModalsProps {
  lang: AppLang;
  type: AuthModalType;
  commands: AuthCommands;
  onClose: () => void;
  onRequestClose?: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (payload: AuthSignedInPayload) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  isLogoutPending?: boolean;
  currentUserEmail?: string | null;
  currentTier?: 'free' | 'pro' | 'premium' | null;
  currentUserId?: string;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  telegramConnectedAt?: string | null;
  telegramAlertsEnabled?: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  shouldShowSignedInWelcome?: boolean;
  onCompleteSignedInWelcome?: () => void;
}

interface AuthModalController {
  isBusy: boolean;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  errorMessage: string | null;
  infoMessage: string | null;
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;
  termsConsent: boolean;
  setTermsConsent: (value: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (value: boolean) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  authCompletionKind: AuthCompletionKind | null;
  closeAuthCompletion: () => void;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  handleConnectTelegram: () => Promise<string>;
  handleDeleteAccount: () => Promise<void>;
  telegramLinkToken: string | null;
  setTelegramLinkToken: (value: string | null) => void;
  telegramLinkLoading: boolean;
  setTelegramLinkLoading: (value: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message.trim() || null;
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message.trim() || null;
  }

  return null;
}

function getErrorName(error: unknown): string | null {
  if (error instanceof Error) {
    return error.name || null;
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name || null;
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return getErrorName(error) === 'AbortError';
}

function getFriendlyAuthErrorMessage(
  copy: AuthModalMessageSet,
  error: unknown,
  fallbackMessage: string,
): string {
  const rawMessage = getErrorMessage(error)?.toLowerCase();
  if (rawMessage == null) {
    return fallbackMessage;
  }

  if (rawMessage.includes('already registered')) {
    return copy.validation.alreadyRegistered;
  }
  if (rawMessage.includes('invalid email')) {
    return copy.validation.invalidEmail;
  }
  if (rawMessage.includes('email rate limit')) {
    return copy.validation.emailRateLimit;
  }
  if (rawMessage.includes('password')) {
    return copy.validation.weakPassword;
  }

  return fallbackMessage;
}

function getSocialProviderLabel(
  copy: AuthModalMessageSet,
  provider: AuthProvider,
): string {
  switch (provider) {
    case 'google':
      return copy.social.google;
    case 'github':
      return copy.social.github;
    case 'kakao':
      return copy.social.kakao;
    default: {
      const exhaustiveCheck: never = provider;
      return exhaustiveCheck;
    }
  }
}

function validatePasswordRules(
  copy: AuthModalMessageSet,
  password: string,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return copy.passwordRule.minLength;
  }
  if (!UPPERCASE_PASSWORD_RE.test(password)) {
    return copy.passwordRule.uppercase;
  }
  if (!LOWERCASE_PASSWORD_RE.test(password)) {
    return copy.passwordRule.lowercase;
  }
  if (!NUMBER_PASSWORD_RE.test(password)) {
    return copy.passwordRule.number;
  }
  if (!SPECIAL_PASSWORD_RE.test(password)) {
    return copy.passwordRule.special;
  }

  return null;
}

function getAuthCompletionDialogTitle(
  copy: AuthModalMessageSet,
  kind: AuthCompletionKind,
): string {
  switch (kind) {
    case 'password_ok':
      return copy.helper.passwordChangedTitle;
    case 'password_ok_relogin':
      return copy.helper.passwordChangedReloginTitle;
    case 'account_deleted':
      return copy.helper.accountDeletedTitle;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function getAuthCompletionDialogBody(
  copy: AuthModalMessageSet,
  kind: AuthCompletionKind,
): string {
  switch (kind) {
    case 'password_ok':
      return copy.helper.passwordChangedBody;
    case 'password_ok_relogin':
      return copy.helper.passwordChangedReloginBody;
    case 'account_deleted':
      return copy.helper.accountDeletedBody;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function useAuthModalController(
  type: AuthModalType,
  copy: AuthModalMessageSet,
  commands: AuthCommands,
  isInTossApp: boolean,
  currentUserEmail: string | null,
  currentTier: 'free' | 'pro' | 'premium',
  currentUserId: string | undefined,
  telegramConnectedAt: string | null,
  telegramAlertsEnabled: boolean,
  onTelegramAlertsEnabledChange: ((enabled: boolean) => void) | undefined,
  onUpgradePlan: ((planId: 'pro' | 'premium') => void) | undefined,
  onLogout: () => Promise<void> | void,
  onSignedIn: (payload: AuthSignedInPayload) => Promise<void> | void,
  onSwitchType: (nextType: AuthModalType) => void,
  onClose: () => void,
): AuthModalController {
  const [isBusy, setIsBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [termsConsent, setTermsConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [authCompletionKind, setAuthCompletionKind] =
    useState<AuthCompletionKind | null>(null);
  const [telegramLinkToken, setTelegramLinkToken] = useState<string | null>(
    null,
  );
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const authCompletionKindRef = useRef<AuthCompletionKind | null>(null);
  const verifyEmailRedirectTimerRef = useRef<number | null>(null);
  /** Rule 11: 연타·중복 submit 시 서버 요청 이중 발사 방지(동기 ref 락). */
  const isAuthMutationLockedRef = useRef(false);

  const clearVerifyEmailRedirectTimer = useCallback((): void => {
    if (verifyEmailRedirectTimerRef.current == null) {
      return;
    }

    window.clearTimeout(verifyEmailRedirectTimerRef.current);
    verifyEmailRedirectTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearVerifyEmailRedirectTimer();
    };
  }, [clearVerifyEmailRedirectTimer]);

  useEffect(() => {
    if (type !== 'profile') {
      setTelegramLinkToken(null);
    }
  }, [type]);

  const openAuthCompletion = useCallback((kind: AuthCompletionKind): void => {
    authCompletionKindRef.current = kind;
    setAuthCompletionKind(kind);
  }, []);

  const closeAuthCompletion = useCallback((): void => {
    const kind = authCompletionKindRef.current;
    authCompletionKindRef.current = null;
    setAuthCompletionKind(null);

    if (kind === 'password_ok') {
      onSwitchType('profile');
      return;
    }

    if (kind === 'password_ok_relogin') {
      onSwitchType('login');
      onClose();
      return;
    }

    if (kind === 'account_deleted') {
      void Promise.resolve(onLogout());
    }
  }, [onClose, onLogout, onSwitchType]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent): Promise<void> => {
      event.preventDefault();

      if (type === 'change-password') {
        if (
          currentPassword.trim() === '' ||
          newPassword.trim() === '' ||
          confirmPassword.trim() === ''
        ) {
          setErrorMessage(copy.validation.missingPasswordFields);
          return;
        }

        if (newPassword !== confirmPassword) {
          setErrorMessage(copy.validation.passwordMismatch);
          return;
        }

        const passwordValidationMessage = validatePasswordRules(
          copy,
          newPassword,
        );
        if (passwordValidationMessage != null) {
          setErrorMessage(passwordValidationMessage);
          return;
        }

        if (isAuthMutationLockedRef.current) {
          return;
        }
        isAuthMutationLockedRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        setInfoMessage(null);

        try {
          await commands.changePassword.run({
            currentPassword,
            newPassword,
            confirmPassword,
          });
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          openAuthCompletion('password_ok');
        } catch (error: unknown) {
          const errorCode = getErrorMessage(error);
          if (errorCode === AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL) {
            setErrorMessage(copy.validation.missingCurrentUserEmail);
          } else if (
            errorCode === AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT
          ) {
            setErrorMessage(copy.validation.currentPasswordIncorrect);
          } else {
            setErrorMessage(
              getFriendlyAuthErrorMessage(
                copy,
                error,
                copy.validation.passwordUpdateFailed,
              ),
            );
          }
        } finally {
          isAuthMutationLockedRef.current = false;
          setIsBusy(false);
        }
        return;
      }

      if (type === 'reset-password') {
        if (
          newPassword.trim() === '' ||
          confirmPassword.trim() === ''
        ) {
          setErrorMessage(copy.validation.missingPasswordFields);
          return;
        }

        if (newPassword !== confirmPassword) {
          setErrorMessage(copy.validation.passwordMismatch);
          return;
        }

        const passwordValidationMessage = validatePasswordRules(
          copy,
          newPassword,
        );
        if (passwordValidationMessage != null) {
          setErrorMessage(passwordValidationMessage);
          return;
        }

        if (isAuthMutationLockedRef.current) {
          return;
        }
        isAuthMutationLockedRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        setInfoMessage(null);

        try {
          await commands.changePassword.run({
            currentPassword: '',
            newPassword,
            confirmPassword,
          });
          setNewPassword('');
          setConfirmPassword('');
          openAuthCompletion('password_ok_relogin');
        } catch (error: unknown) {
          setErrorMessage(
            getFriendlyAuthErrorMessage(
              copy,
              error,
              copy.validation.passwordUpdateFailed,
            ),
          );
        } finally {
          isAuthMutationLockedRef.current = false;
          setIsBusy(false);
        }
        return;
      }

      if (email.trim() === '' || password.trim() === '') {
        setErrorMessage(copy.validation.missingEmailOrPassword);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        if (type === 'signup') {
          if (!termsConsent || !privacyConsent) {
            setErrorMessage(copy.validation.mustAgreeRequiredPolicies);
            return;
          }

          const result = await commands.signUp.run({
            email,
            password,
            termsConsent,
            privacyConsent,
          });

          if (result.kind === 'verify_email') {
            setInfoMessage(copy.validation.emailVerificationSent);
            clearVerifyEmailRedirectTimer();
            verifyEmailRedirectTimerRef.current = window.setTimeout(() => {
              setEmail('');
              setPassword('');
              onSwitchType('login');
            }, EMAIL_VERIFICATION_REDIRECT_DELAY_MS);
            return;
          }

          await Promise.resolve(onSignedIn(result.user));
          return;
        }

        if (type === 'login') {
          const signedInUser = await commands.signIn.run(email, password);
          await Promise.resolve(onSignedIn(signedInUser));
        }
      } catch (error: unknown) {
        if (isAbortError(error)) {
          return;
        }

        const fallbackMessage =
          type === 'signup'
            ? copy.validation.signupFailed
            : copy.validation.authenticationFailed;
        setErrorMessage(
          getFriendlyAuthErrorMessage(copy, error, fallbackMessage),
        );
      } finally {
        isAuthMutationLockedRef.current = false;
        setIsBusy(false);
      }
    },
    [
      clearVerifyEmailRedirectTimer,
      commands.changePassword,
      commands.signIn,
      commands.signUp,
      confirmPassword,
      copy,
      currentPassword,
      email,
      newPassword,
      onSignedIn,
      onSwitchType,
      openAuthCompletion,
      password,
      privacyConsent,
      termsConsent,
      type,
    ],
  );

  const handleResetPassword = useCallback(
    async (emailToUse?: string): Promise<void> => {
      const targetEmail = emailToUse ?? email ?? currentUserEmail ?? '';
      if (targetEmail.trim() === '') {
        setErrorMessage(copy.validation.resetPasswordNeedsEmail);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        await commands.resetPassword.run(targetEmail);
        setInfoMessage(copy.validation.resetPasswordSent);
      } catch (error: unknown) {
        setErrorMessage(
          getFriendlyAuthErrorMessage(
            copy,
            error,
            copy.validation.resetPasswordFailed,
          ),
        );
      } finally {
        isAuthMutationLockedRef.current = false;
        setIsBusy(false);
      }
    },
    [commands.resetPassword, copy, currentUserEmail, email],
  );

  const handleSocialLogin = useCallback(
    async (provider: AuthProvider): Promise<void> => {
      if (type === 'signup' && (!termsConsent || !privacyConsent)) {
        setErrorMessage(copy.validation.mustAgreeRequiredPolicies);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      let shouldReleaseBusy = true;

      try {
        await commands.signInWithOAuth.run(
          provider,
          type === 'signup' ? 'signup' : 'login',
        );
        shouldReleaseBusy = false;
      } catch (error: unknown) {
        if (isAbortError(error)) {
          return;
        }

        const providerLabel = getSocialProviderLabel(copy, provider);
        const reason =
          getErrorMessage(error) ?? copy.validation.authenticationFailed;
        setErrorMessage(copy.social.oauthFailed(providerLabel, reason));
      } finally {
        isAuthMutationLockedRef.current = false;
        if (shouldReleaseBusy) {
          setIsBusy(false);
        }
      }
    },
    [commands.signInWithOAuth, copy, privacyConsent, termsConsent, type],
  );

  const handleConnectTelegram = useCallback(async (): Promise<string> => {
    return commands.connectTelegram.run();
  }, [commands.connectTelegram]);

  const handleDeleteAccount = useCallback(async (): Promise<void> => {
    if (isAuthMutationLockedRef.current) {
      return;
    }
    isAuthMutationLockedRef.current = true;
    setIsBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await commands.deleteAccount.run();
      openAuthCompletion('account_deleted');
    } finally {
      isAuthMutationLockedRef.current = false;
      setIsBusy(false);
    }
  }, [commands.deleteAccount, openAuthCompletion]);

  void isInTossApp;
  void currentTier;
  void currentUserId;
  void telegramConnectedAt;
  void telegramAlertsEnabled;
  void onTelegramAlertsEnabledChange;
  void onUpgradePlan;

  return {
    isBusy,
    email,
    setEmail,
    password,
    setPassword,
    errorMessage,
    infoMessage,
    setErrorMessage,
    setInfoMessage,
    termsConsent,
    setTermsConsent,
    privacyConsent,
    setPrivacyConsent,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    currentPassword,
    setCurrentPassword,
    authCompletionKind,
    closeAuthCompletion,
    handleSubmit,
    handleResetPassword,
    handleSocialLogin,
    handleConnectTelegram,
    handleDeleteAccount,
    telegramLinkToken,
    setTelegramLinkToken,
    telegramLinkLoading,
    setTelegramLinkLoading,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleteConfirmText,
    setDeleteConfirmText,
  };
}

function AuthViewRenderer({
  type,
  lang,
  copy,
  onClose,
  onSwitchType,
  onSignedIn,
  onLogout,
  isLogoutPending,
  onUpgradePlan,
  currentUserEmail,
  currentTier,
  currentUserId,
  telegramConnectedAt,
  telegramAlertsEnabled,
  onTelegramAlertsEnabledChange,
  isInTossApp,
  controller,
}: {
  type: AuthModalType;
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (payload: AuthSignedInPayload) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  isLogoutPending: boolean;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  currentUserEmail: string | null;
  currentTier: 'free' | 'pro' | 'premium';
  currentUserId: string | undefined;
  telegramConnectedAt: string | null;
  telegramAlertsEnabled: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  isInTossApp: boolean;
  controller: AuthModalController;
}): React.ReactElement {
  switch (type) {
    case 'login':
      return (
        <LoginView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          setError={controller.setErrorMessage}
          isInTossApp={isInTossApp}
        />
      );
    case 'signup':
      return (
        <SignupView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          termsConsent={controller.termsConsent}
          setTermsConsent={controller.setTermsConsent}
          privacyConsent={controller.privacyConsent}
          setPrivacyConsent={controller.setPrivacyConsent}
          setError={controller.setErrorMessage}
          isInTossApp={isInTossApp}
        />
      );
    case 'reset-password':
      return (
        <ResetPasswordView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={isInTossApp}
        />
      );
    case 'change-password':
      return (
        <ChangePasswordView
          lang={lang}
          copy={copy}
          onSwitchType={onSwitchType}
          currentUserEmail={currentUserEmail}
          currentPassword={controller.currentPassword}
          setCurrentPassword={controller.setCurrentPassword}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={isInTossApp}
        />
      );
    case 'profile':
      return (
        <ProfileView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onLogout={onLogout}
          isLogoutPending={isLogoutPending}
          onUpgradePlan={onUpgradePlan}
          currentUserEmail={currentUserEmail}
          currentTier={currentTier}
          currentUserId={currentUserId}
          telegramConnectedAt={telegramConnectedAt}
          telegramAlertsEnabled={telegramAlertsEnabled}
          onTelegramAlertsEnabledChange={onTelegramAlertsEnabledChange}
          error={controller.errorMessage}
          info={controller.infoMessage}
          loading={controller.isBusy}
          setLoading={noopSetBoolean}
          setError={controller.setErrorMessage}
          setInfo={controller.setInfoMessage}
          telegramLinkToken={controller.telegramLinkToken}
          setTelegramLinkToken={controller.setTelegramLinkToken}
          telegramLinkLoading={controller.telegramLinkLoading}
          setTelegramLinkLoading={controller.setTelegramLinkLoading}
          showDeleteConfirm={controller.showDeleteConfirm}
          setShowDeleteConfirm={controller.setShowDeleteConfirm}
          deleteConfirmText={controller.deleteConfirmText}
          setDeleteConfirmText={controller.setDeleteConfirmText}
          onConnectTelegram={controller.handleConnectTelegram}
          onDeleteAccount={controller.handleDeleteAccount}
          isInTossApp={isInTossApp}
        />
      );
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}

function AuthModals({
  lang,
  type,
  commands,
  onClose,
  onRequestClose,
  onSwitchType,
  onSignedIn,
  onLogout,
  isLogoutPending = false,
  currentUserEmail = null,
  currentTier = 'free',
  currentUserId,
  onUpgradePlan,
  telegramConnectedAt = null,
  telegramAlertsEnabled = false,
  onTelegramAlertsEnabledChange,
  shouldShowSignedInWelcome = false,
  onCompleteSignedInWelcome,
}: AuthModalsProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const copy = getAuthModalMessages(lang);
  const handleRequestClose = onRequestClose ?? onClose;
  const resolvedCurrentTier = currentTier ?? 'free';
  const controller = useAuthModalController(
    type,
    copy,
    commands,
    isInTossApp,
    currentUserEmail,
    resolvedCurrentTier,
    currentUserId,
    telegramConnectedAt,
    telegramAlertsEnabled,
    onTelegramAlertsEnabledChange,
    onUpgradePlan,
    onLogout,
    onSignedIn,
    onSwitchType,
    onClose,
  );

  const isSignedInWelcomeVisible =
    type === 'profile' && shouldShowSignedInWelcome === true;
  const title = isSignedInWelcomeVisible
    ? copy.helper.signedInSuccessTitle
    : copy.title[type];

  const authCompletionTitle =
    controller.authCompletionKind != null
      ? getAuthCompletionDialogTitle(copy, controller.authCompletionKind)
      : null;

  const authCompletionBody =
    controller.authCompletionKind != null
      ? getAuthCompletionDialogBody(copy, controller.authCompletionKind)
      : null;

  const modalContent = (
    <>
      {isInTossApp ? (
        <TDSModalHeader
          title={title}
          onClose={handleRequestClose}
          leftAccessory={
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? (
                <UserCheck className="text-white" size={20} />
              ) : (
                <ShieldCheck className="text-white" size={20} />
              )}
            </div>
          }
        />
      ) : (
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? (
                <UserCheck className="text-white" size={20} />
              ) : (
                <ShieldCheck className="text-white" size={20} />
              )}
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"
            aria-label={copy.a11y.closeModal}
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div className="p-6 md:p-10 space-y-6 md:space-y-8 flex-1 overflow-y-auto overscroll-contain">
        {isSignedInWelcomeVisible ? (
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-blue-200 bg-blue-50 px-5 py-6 text-center dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 shadow-lg shadow-blue-500/20">
                <UserCheck className="text-white" size={28} />
              </div>
              <p className="text-base font-bold leading-7 text-slate-900 dark:text-white">
                {copy.helper.signedInSuccessBody}
              </p>
            </div>
            <TDSButton
              type="button"
              variant="primary"
              fullWidth
              onClick={onCompleteSignedInWelcome}
            >
              {copy.action.acknowledge}
            </TDSButton>
          </div>
        ) : (
          <AuthViewRenderer
            type={type}
            lang={lang}
            copy={copy}
            onClose={onClose}
            onSwitchType={onSwitchType}
            onSignedIn={onSignedIn}
            onLogout={onLogout}
            isLogoutPending={isLogoutPending}
            onUpgradePlan={onUpgradePlan}
            currentUserEmail={currentUserEmail}
            currentTier={resolvedCurrentTier}
            currentUserId={currentUserId}
            telegramConnectedAt={telegramConnectedAt}
            telegramAlertsEnabled={telegramAlertsEnabled}
            onTelegramAlertsEnabledChange={onTelegramAlertsEnabledChange}
            isInTossApp={isInTossApp}
            controller={controller}
          />
        )}
      </div>
    </>
  );

  const resolvedTdsMessages = TDS_DIALOG_MESSAGES[lang] ?? TDS_DIALOG_MESSAGES.ko;
  const actionLabels = resolvedTdsMessages.actions;

  return (
    <>
      {isInTossApp ? (
        <TDSModal open onClose={handleRequestClose}>
          {modalContent}
        </TDSModal>
      ) : (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
            onClick={handleRequestClose}
            role="button"
            tabIndex={0}
            aria-label={copy.a11y.closeModal}
            onKeyDown={(event) =>
              handlePressEnterOrSpace(event, handleRequestClose)
            }
          />
          <div className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
            {modalContent}
          </div>
        </div>
      )}

      {controller.authCompletionKind != null &&
      authCompletionTitle != null &&
      authCompletionBody != null ? (
        <TdsAlertDialog
          isOpen
          title={authCompletionTitle}
          body={authCompletionBody}
          confirmLabel={copy.action.acknowledge}
          labels={actionLabels}
          onClose={controller.closeAuthCompletion}
        />
      ) : null}
    </>
  );
}

export default AuthModals;
