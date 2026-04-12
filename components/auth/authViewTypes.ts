import type { FormEvent } from 'react';
import type { AppLang } from '../../types';
import type {
  AuthModalMessageSet,
  AuthProvider,
} from '../../constants/messages/authMessages';
import type { TossAuthSuccessResult } from '../../services/toss/tossAuth';

export type AuthModalType =
  | 'login'
  | 'signup'
  | 'profile'
  | 'reset-password'
  | 'change-password';

export interface SignedInUser {
  id: string;
  email: string;
}

export type AuthSignedInPayload = SignedInUser | TossAuthSuccessResult;

export interface LoginViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (payload: AuthSignedInPayload) => Promise<void> | void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  setError: (message: string | null) => void;
  isInTossApp: boolean;
}

export interface SignupViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (payload: AuthSignedInPayload) => Promise<void> | void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  termsConsent: boolean;
  setTermsConsent: (value: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (value: boolean) => void;
  setError: (message: string | null) => void;
  isInTossApp: boolean;
}

export interface ResetPasswordViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  isInTossApp: boolean;
}

export interface ChangePasswordViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onSwitchType: (nextType: AuthModalType) => void;
  currentUserEmail: string | null;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  isInTossApp: boolean;
}

export interface ProfileViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onLogout: () => Promise<void> | void;
  isLogoutPending: boolean;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  currentUserEmail: string | null;
  currentTier: 'free' | 'pro' | 'premium';
  currentUserId: string | undefined;
  telegramConnectedAt: string | null;
  telegramAlertsEnabled: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  error: string | null;
  info: string | null;
  loading: boolean;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  setInfo: (message: string | null) => void;
  telegramLinkToken: string | null;
  setTelegramLinkToken: (value: string | null) => void;
  telegramLinkLoading: boolean;
  setTelegramLinkLoading: (value: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  onConnectTelegram: () => Promise<string>;
  onDeleteAccount: () => Promise<void>;
  isInTossApp: boolean;
}