import type { AppLang } from '@/types';

export type AuthModalType =
  | 'login'
  | 'signup'
  | 'profile'
  | 'reset-password'
  | 'change-password';

export type AuthProvider = 'google' | 'github' | 'kakao';

export interface AuthModalMessageSet {
  title: Record<AuthModalType, string>;
  action: {
    processing: string;
    acknowledge: string;
    login: string;
    signup: string;
    changePassword: string;
    resetPassword: string;
    logout: string;
    connectTelegram: string;
    upgradeMembership: string;
    deleteAccount: string;
    cancelDelete: string;
    deleteForever: string;
    openInTelegram: string;
  };
  field: {
    emailLabel: string;
    passwordLabel: string;
    currentPasswordLabel: string;
    newPasswordLabel: string;
    confirmPasswordLabel: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    deleteConfirmPlaceholder: string;
  };
  helper: {
    forgotPassword: string;
    continueWithSocial: string;
    loginInstead: string;
    signupInstead: string;
    requiredAgreementTitle: string;
    requiredBadge: string;
    agreeSuffix: string;
    termsLabel: string;
    privacyLabel: string;
    signedInSuccessTitle: string;
    signedInSuccessBody: string;
    passwordChangedTitle: string;
    passwordChangedBody: string;
    passwordChangedReloginTitle: string;
    passwordChangedReloginBody: string;
    accountDeletedTitle: string;
    accountDeletedBody: string;
  };
  profile: {
    accountConnected: string;
    unknownEmail: string;
    telegramSectionTitle: string;
    telegramConnected: string;
    telegramLinkInstruction: string;
    telegramTokenCreateFailed: string;
    reopenProfileHint: string;
    paidOnly: string;
    deleteWarning: string;
    deleteInstruction: string;
    logoutFailed: string;
    deleteAccountFailed: string;
    telegramAlertsAriaLabel: string;
  };
  validation: {
    missingEmailOrPassword: string;
    missingPasswordFields: string;
    missingCurrentUserEmail: string;
    resetPasswordNeedsEmail: string;
    passwordMismatch: string;
    mustAgreeRequiredPolicies: string;
    currentPasswordIncorrect: string;
    alreadyRegistered: string;
    invalidEmail: string;
    weakPassword: string;
    emailRateLimit: string;
    authenticationFailed: string;
    signupFailed: string;
    passwordUpdateFailed: string;
    resetPasswordFailed: string;
    resetPasswordSent: string;
    emailVerificationSent: string;
  };
  passwordRule: {
    minLength: string;
    uppercase: string;
    lowercase: string;
    number: string;
    special: string;
  };
  social: {
    google: string;
    github: string;
    kakao: string;
    oauthFailed: (providerLabel: string, reason: string) => string;
  };
  exitDialog: {
    authCloseTitle: string;
    authCloseBody: string;
    authCloseConfirm: string;
  };
  a11y: {
    closeModal: string;
  };
}

export interface FallbackAuthMessageSet {
  tossLoginDescription: string;
  tossLoginAction: string;
  tossLoginLoadingAction: string;
  tossLoginFailed: string;
  tossLoginUnexpectedError: string;
  tossSessionApplyFailed: string;
  tossLogoutNetworkError: string;
  tossLogoutUnlinkDelayedWarning: string;
}

export const FALLBACK_AUTH_MESSAGES: Record<AppLang, FallbackAuthMessageSet> = {
  ko: {
    tossLoginDescription: '토스 앱에서만 사용 가능한 로그인입니다.',
    tossLoginAction: 'Toss로 계속하기',
    tossLoginLoadingAction: '처리 중...',
    tossLoginFailed: '토스 로그인에 실패했습니다.',
    tossLoginUnexpectedError: '로그인 중 오류가 발생했습니다.',
    tossSessionApplyFailed: '세션 설정에 실패했습니다. 다시 시도해주세요.',
    tossLogoutNetworkError: '로그아웃 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
    tossLogoutUnlinkDelayedWarning:
      '토스 서버 지연으로 연결을 끊지 못했습니다. 잠시 후 다시 시도해주세요.',
  },
  en: {
    tossLoginDescription: 'This login is only available in the Toss app.',
    tossLoginAction: 'Continue with Toss',
    tossLoginLoadingAction: 'Loading...',
    tossLoginFailed: 'Toss login failed.',
    tossLoginUnexpectedError: 'An error occurred during login.',
    tossSessionApplyFailed: 'Failed to apply the session. Please try again.',
    tossLogoutNetworkError:
      'An error occurred while logging out. Please try again.',
    tossLogoutUnlinkDelayedWarning:
      'Toss could not disconnect the link due to a server delay. Please try again shortly.',
  },
};

export const AUTH_MODAL_MESSAGES: Record<AppLang, AuthModalMessageSet> = {
  ko: {
    title: {
      login: '로그인',
      signup: '회원가입',
      profile: '사용자 프로필',
      'reset-password': '비밀번호 재설정',
      'change-password': '비밀번호 변경',
    },
    action: {
      processing: '처리 중...',
      acknowledge: '확인',
      login: '로그인',
      signup: '회원가입',
      changePassword: '비밀번호 업데이트',
      resetPassword: '비밀번호 변경',
      logout: '로그아웃',
      connectTelegram: '텔레그램 연결',
      upgradeMembership: '멤버십 업그레이드',
      deleteAccount: '회원 탈퇴',
      cancelDelete: '취소',
      deleteForever: '영구 삭제',
      openInTelegram: '텔레그램에서 열기',
    },
    field: {
      emailLabel: '이메일',
      passwordLabel: '비밀번호',
      currentPasswordLabel: '현재 비밀번호',
      newPasswordLabel: '새 비밀번호',
      confirmPasswordLabel: '비밀번호 확인',
      emailPlaceholder: 'name@example.com',
      passwordPlaceholder: '••••••••',
      deleteConfirmPlaceholder: 'DELETE',
    },
    helper: {
      forgotPassword: '비밀번호를 잊으셨나요? 재설정 메일 보내기',
      continueWithSocial: '또는 소셜 계정으로 로그인',
      loginInstead: '이미 계정이 있으신가요? 로그인',
      signupInstead: '계정이 없으신가요? 회원가입',
      requiredAgreementTitle: '필수 동의',
      requiredBadge: '필수',
      agreeSuffix: '에 동의합니다',
      termsLabel: '이용약관',
      privacyLabel: '개인정보 처리방침',
      signedInSuccessTitle: '로그인 완료',
      signedInSuccessBody: '로그인이 완료되었습니다. 프로필 화면으로 이동합니다.',
      passwordChangedTitle: '비밀번호 변경 완료',
      passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
      passwordChangedReloginTitle: '비밀번호 재설정 완료',
      passwordChangedReloginBody: '새 비밀번호가 적용되었습니다. 다시 로그인해주세요.',
      accountDeletedTitle: '회원 탈퇴 완료',
      accountDeletedBody: '계정이 삭제되었습니다.',
    },
    profile: {
      accountConnected: '연결된 계정',
      unknownEmail: '알 수 없는 이메일',
      telegramSectionTitle: '텔레그램 연동',
      telegramConnected: '텔레그램 연결됨',
      telegramLinkInstruction:
        '아래 명령어를 텔레그램 봇에 전송해 연결을 완료하세요.',
      telegramTokenCreateFailed: '텔레그램 연결 토큰 생성에 실패했습니다.',
      reopenProfileHint: '연결 후 프로필을 다시 열어 상태를 확인하세요.',
      paidOnly: '유료 멤버십에서만 사용할 수 있습니다.',
      deleteWarning: '회원 탈퇴 후 데이터는 복구할 수 없습니다.',
      deleteInstruction: '확인을 위해 DELETE 를 입력해주세요.',
      logoutFailed: '로그아웃에 실패했습니다.',
      deleteAccountFailed: '회원 탈퇴에 실패했습니다.',
      telegramAlertsAriaLabel: '텔레그램 알림 토글',
    },
    validation: {
      missingEmailOrPassword: '이메일과 비밀번호를 모두 입력해주세요.',
      missingPasswordFields: '모든 비밀번호 입력란을 채워주세요.',
      missingCurrentUserEmail:
        '이메일 정보를 불러오지 못했습니다. 다시 로그인 후 시도해주세요.',
      resetPasswordNeedsEmail: '비밀번호 재설정을 위해 이메일을 입력해주세요.',
      passwordMismatch: '비밀번호가 일치하지 않습니다.',
      mustAgreeRequiredPolicies:
        '이용약관과 개인정보 처리방침에 동의해야 합니다.',
      currentPasswordIncorrect: '현재 비밀번호가 올바르지 않습니다.',
      alreadyRegistered: '이미 가입된 이메일입니다.',
      invalidEmail: '유효하지 않은 이메일 주소입니다.',
      weakPassword: '비밀번호가 너무 짧거나 약합니다.',
      emailRateLimit:
        '이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
      authenticationFailed: '인증 중 오류가 발생했습니다.',
      signupFailed: '회원가입에 실패했습니다.',
      passwordUpdateFailed: '비밀번호 변경에 실패했습니다.',
      resetPasswordFailed: '비밀번호 재설정 메일 전송에 실패했습니다.',
      resetPasswordSent:
        '비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해주세요.',
      emailVerificationSent:
        '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요.',
    },
    passwordRule: {
      minLength: '비밀번호는 최소 8자 이상이어야 합니다.',
      uppercase: '대문자를 1개 이상 포함해야 합니다.',
      lowercase: '소문자를 1개 이상 포함해야 합니다.',
      number: '숫자를 1개 이상 포함해야 합니다.',
      special: '특수문자를 1개 이상 포함해야 합니다.',
    },
    social: {
      google: 'Google',
      github: 'GitHub',
      kakao: '카카오',
      oauthFailed: (providerLabel, reason) =>
        `${providerLabel} 로그인에 실패했습니다: ${reason}`,
    },
    exitDialog: {
      authCloseTitle: '인증을 종료할까요?',
      authCloseBody: '로그인을 마치지 않고 인증 창을 닫습니다.',
      authCloseConfirm: '종료하기',
    },
    a11y: {
      closeModal: '닫기',
    },
  },
  en: {
    title: {
      login: 'Login',
      signup: 'Sign Up',
      profile: 'User Profile',
      'reset-password': 'Reset Password',
      'change-password': 'Change Password',
    },
    action: {
      processing: 'Working...',
      acknowledge: 'OK',
      login: 'Login',
      signup: 'Sign Up',
      changePassword: 'Update Password',
      resetPassword: 'Update Password',
      logout: 'Logout',
      connectTelegram: 'Connect Telegram',
      upgradeMembership: 'Upgrade Membership',
      deleteAccount: 'Delete Account',
      cancelDelete: 'Cancel',
      deleteForever: 'Delete Forever',
      openInTelegram: 'Open in Telegram',
    },
    field: {
      emailLabel: 'Email',
      passwordLabel: 'Password',
      currentPasswordLabel: 'Current Password',
      newPasswordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm Password',
      emailPlaceholder: 'name@example.com',
      passwordPlaceholder: '••••••••',
      deleteConfirmPlaceholder: 'DELETE',
    },
    helper: {
      forgotPassword: 'Forgot password? Send reset email',
      continueWithSocial: 'Or continue with',
      loginInstead: 'Already have an account? Login',
      signupInstead: "Don't have an account? Sign up",
      requiredAgreementTitle: 'Required Agreements',
      requiredBadge: 'Required',
      agreeSuffix: ' - I agree',
      termsLabel: 'Terms of Service',
      privacyLabel: 'Privacy Policy',
      signedInSuccessTitle: 'Signed In',
      signedInSuccessBody:
        'You are signed in successfully. Moving to your profile.',
      passwordChangedTitle: 'Password Updated',
      passwordChangedBody: 'Your password has been changed successfully.',
      passwordChangedReloginTitle: 'Password Reset Complete',
      passwordChangedReloginBody:
        'Your new password is active now. Please sign in again.',
      accountDeletedTitle: 'Account Deleted',
      accountDeletedBody: 'Your account has been deleted.',
    },
    profile: {
      accountConnected: 'Connected Account',
      unknownEmail: 'Unknown email',
      telegramSectionTitle: 'Telegram',
      telegramConnected: 'Telegram connected',
      telegramLinkInstruction:
        'Send the command below to the Telegram bot to complete the connection.',
      telegramTokenCreateFailed: 'Failed to create Telegram link token.',
      reopenProfileHint:
        'Reopen the profile modal after linking to refresh state.',
      paidOnly: 'This feature is available for paid members only.',
      deleteWarning: 'Your data cannot be restored after account deletion.',
      deleteInstruction: 'Type DELETE to confirm.',
      logoutFailed: 'Failed to log out.',
      deleteAccountFailed: 'Failed to delete account.',
      telegramAlertsAriaLabel: 'Telegram alerts toggle',
    },
    validation: {
      missingEmailOrPassword: 'Please enter both email and password.',
      missingPasswordFields: 'Please fill in all password fields.',
      missingCurrentUserEmail:
        'Email is not available. Please log in again and retry.',
      resetPasswordNeedsEmail:
        'Please enter your email to reset password.',
      passwordMismatch: 'Passwords do not match.',
      mustAgreeRequiredPolicies:
        'You must agree to the Terms of Service and Privacy Policy.',
      currentPasswordIncorrect: 'Current password is incorrect.',
      alreadyRegistered: 'This email is already registered.',
      invalidEmail: 'Invalid email address.',
      weakPassword: 'Password is too short or weak.',
      emailRateLimit:
        'Email rate limit exceeded. Please try again later.',
      authenticationFailed: 'Authentication error occurred.',
      signupFailed: 'Sign up failed.',
      passwordUpdateFailed: 'Failed to update password.',
      resetPasswordFailed: 'Failed to send reset password email.',
      resetPasswordSent:
        'Password reset email sent. Please check your inbox.',
      emailVerificationSent:
        'Sign up successful. Please verify your email account.',
    },
    passwordRule: {
      minLength: 'Password must be at least 8 characters.',
      uppercase: 'Must include at least 1 uppercase letter.',
      lowercase: 'Must include at least 1 lowercase letter.',
      number: 'Must include at least 1 number.',
      special: 'Must include at least 1 special character.',
    },
    social: {
      google: 'Google',
      github: 'GitHub',
      kakao: 'Kakao',
      oauthFailed: (providerLabel, reason) =>
        `${providerLabel} login failed: ${reason}`,
    },
    exitDialog: {
      authCloseTitle: 'Close authentication?',
      authCloseBody:
        'You are leaving the authentication flow before completion.',
      authCloseConfirm: 'Close',
    },
    a11y: {
      closeModal: 'Close modal',
    },
  },
};

const AUTH_MODAL_MESSAGE_CACHE = new Map<AppLang, AuthModalMessageSet>();

export function getAuthModalMessages(lang: AppLang): AuthModalMessageSet {
  const cached = AUTH_MODAL_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = AUTH_MODAL_MESSAGES[lang];
  AUTH_MODAL_MESSAGE_CACHE.set(lang, messages);
  return messages;
}