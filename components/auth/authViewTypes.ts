/**
 * Auth 모달 서브뷰 공통 타입 (Phase 0.3 — 단일 책임, DRY)
 * 각 뷰는 필요한 props만 사용하고, AuthModals가 state/handlers를 내려줍니다.
 */

export type AuthModalType = 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password';

/** 로그인/회원가입 폼 공통 (LoginView, SignupView) */
export interface AuthEmailFormProps {
  lang: 'ko' | 'en';
  type: 'login' | 'signup';
  onClose: () => void;
  onSwitchType: (t: AuthModalType) => void;
  onLogin: (user: { id: string; email: string }) => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: 'google' | 'github' | 'kakao') => Promise<void>;
  termsConsent: boolean;
  setTermsConsent: (b: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (b: boolean) => void;
  setError: (s: string | null) => void;
  /** 토스 앱 내부일 때만 true — TossLoginView 표시 여부 */
  isInTossApp: boolean;
}

/** 비밀번호 재설정 (이메일 링크 진입 후 새 비밀번호 입력) */
export interface ResetPasswordViewProps {
  lang: 'ko' | 'en';
  onClose: () => void;
  onSwitchType: (t: AuthModalType) => void;
  newPassword: string;
  setNewPassword: (s: string) => void;
  confirmPassword: string;
  setConfirmPassword: (s: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  /** Phase 3: 토스에서 TDSTextField/TDSButton 사용 */
  isInTossApp?: boolean;
}

/** 비밀번호 변경 (프로필 내 현재 비밀번호 + 새 비밀번호) */
export interface ChangePasswordViewProps {
  lang: 'ko' | 'en';
  onSwitchType: (t: AuthModalType) => void;
  currentUserEmail: string | undefined | null;
  currentPassword: string;
  setCurrentPassword: (s: string) => void;
  newPassword: string;
  setNewPassword: (s: string) => void;
  confirmPassword: string;
  setConfirmPassword: (s: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  /** Phase 3: 토스에서 TDSTextField/TDSButton 사용 */
  isInTossApp?: boolean;
}

/** 프로필 (계정 정보, 텔레그램, 비밀번호 변경, 로그아웃, 환불, 탈퇴) */
export interface ProfileViewProps {
  lang: 'ko' | 'en';
  onClose: () => void;
  onSwitchType: (t: AuthModalType) => void;
  onLogout: () => void;
  currentUserEmail: string | undefined | null;
  currentTier: 'free' | 'pro' | 'premium';
  currentUserId: string | undefined;
  tierLabel: string;
  telegramConnectedAt: string | null;
  telegramAlertsEnabled: boolean;
  onTelegramAlertsEnabledChange: ((enabled: boolean) => void) | undefined;
  error: string | null;
  info: string | null;
  setInfo: (s: string | null) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;
  setError: (s: string | null) => void;
  telegramLinkToken: string | null;
  setTelegramLinkToken: (s: string | null) => void;
  telegramLinkLoading: boolean;
  setTelegramLinkLoading: (b: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (b: boolean) => void;
  showCancelSub: boolean;
  setShowCancelSub: (b: boolean) => void;
  cancelSubLoading: boolean;
  setCancelSubLoading: (b: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (s: string) => void;
  cancelSubscription: () => Promise<{ success: boolean; message?: string; error?: string }>;
  /** 텔레그램 연결 요청 — 성공 시 링크 토큰 반환 */
  onConnectTelegram: () => Promise<string>;
  /** 회원 탈퇴 실행 (세션 기반, 내부에서 getSession 등 호출) */
  onDeleteAccount: () => Promise<void>;
  /** Phase 3: 토스에서 TDSButton 사용 */
  isInTossApp?: boolean;
}
