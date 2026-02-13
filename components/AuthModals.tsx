import React, { useState, useEffect, useMemo } from 'react';
import { I18N } from '../constants';
import { X, UserCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabase';
import { cancelSubscription } from '../services/payment/paymentService';
import { buildRedirectUrl } from '../utils/authHelpers';
import { TDSModal, TDSModalHeader } from './tds';
import { useTossApp } from '../contexts/TossAppContext';
import { AUTH_VIEW_MAP, type AuthModalType } from './auth';

interface AuthModalsProps {
  lang: 'ko' | 'en';
  type: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password';
  onClose: () => void;
  onSwitchType: (type: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password') => void;
  onLogin: (user: { id: string; email: string }) => void;
  onLogout: () => void;
  currentUserEmail?: string | null;
  currentTier?: 'free' | 'pro' | 'premium' | null;
  currentUserId?: string;
  /** 텔레그램 계정 연결 여부 (연결됨 표시용) */
  telegramConnectedAt?: string | null;
  /** 텔레그램 알림 사용 여부 (토글 값, user_profiles.telegram_enabled) */
  telegramAlertsEnabled?: boolean;
  /** 텔레그램 알림 사용 여부 변경 시 호출 (DB 업데이트용) */
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
}

const AuthModals: React.FC<AuthModalsProps> = ({ lang, type, onClose, onSwitchType, onLogin, onLogout, currentUserEmail, currentTier = 'free', currentUserId, telegramConnectedAt = null, telegramAlertsEnabled = false, onTelegramAlertsEnabledChange }) => {
  const t = I18N[lang];
  const { isInTossApp } = useTossApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const [telegramLinkToken, setTelegramLinkToken] = useState<string | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelSub, setShowCancelSub] = useState(false);
  const [cancelSubLoading, setCancelSubLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [termsConsent, setTermsConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  useEffect(() => {
    if (type !== 'profile') setTelegramLinkToken(null);
  }, [type]);

  const tierLabel =
    currentTier === 'premium'
      ? 'PREMIUM'
      : currentTier === 'pro'
      ? 'PRO'
      : 'FREE';

  // 비밀번호 강도 검증 (최소 8자, 대문자, 소문자, 숫자, 특수문자 포함)
  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return lang === 'ko' ? '비밀번호는 최소 8자 이상이어야 합니다.' : 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return lang === 'ko' ? '대문자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 uppercase letter.';
    if (!/[a-z]/.test(pw)) return lang === 'ko' ? '소문자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 lowercase letter.';
    if (!/[0-9]/.test(pw)) return lang === 'ko' ? '숫자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 number.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return lang === 'ko' ? '특수문자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 special character.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (type === 'change-password') {
      // 프로필 내에서 사용하는 비밀번호 변경 (현재 비밀번호 + 새 비밀번호)
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError(lang === 'ko' ? '모든 비밀번호 입력란을 채워주세요.' : 'Please fill in all password fields.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(lang === 'ko' ? '새 비밀번호가 일치하지 않습니다.' : 'New passwords do not match.');
        return;
      }
      const pwError = validatePassword(newPassword);
      if (pwError) { setError(pwError); return; }

      setLoading(true);
      setError(null);
      setInfo(null);

      try {
        const emailToUse = currentUserEmail || email;
        if (!emailToUse) {
          setError(lang === 'ko' ? '이메일 정보를 불러오지 못했습니다. 다시 로그인 후 시도해주세요.' : 'Email not available. Please log in again and retry.');
          setLoading(false);
          return;
        }

        // 현재 비밀번호 확인을 위해 재로그인 시도
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password: currentPassword,
        });
        if (signInError) {
          setError(lang === 'ko' ? '현재 비밀번호가 올바르지 않습니다.' : 'Current password is incorrect.');
          setLoading(false);
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          console.error('[Auth] Password update error:', updateError.message);
          setError(lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.');
        } else {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setInfo(null);

          if (typeof window !== 'undefined') {
            alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다.' : 'Password updated successfully.');
          }
          onSwitchType('profile');
        }
      } catch (err: any) {
        console.error('[Auth] Password change error:', err?.message);
        setError(lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (type === 'reset-password') {
      if (!newPassword || !confirmPassword) {
        setError(lang === 'ko' ? '새 비밀번호를 입력해주세요.' : 'Please enter new password.');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        setError(lang === 'ko' ? '비밀번호가 일치하지 않습니다.' : 'Passwords do not match.');
        return;
      }
      
      const pwError2 = validatePassword(newPassword);
      if (pwError2) { setError(pwError2); return; }
      
      setLoading(true);
      setError(null);
      setInfo(null);
      
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        
        if (error) {
          console.error('[Auth] Password reset update error:', error.message);
          setError(lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.');
        } else {
          setNewPassword('');
          setConfirmPassword('');
          setInfo(null);

          if (typeof window !== 'undefined') {
            alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.' : 'Password updated successfully. Please log in again.');
          }

          onSwitchType('login');
          onClose();
        }
      } catch (err: any) {
        console.error('[Auth] Password reset error:', err?.message);
        setError(lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.');
      } finally {
        setLoading(false);
      }
      return;
    }
    
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (type === 'signup') {
        // 동의 검증
        if (!termsConsent || !privacyConsent) {
          setError(lang === 'ko' ? '이용약관과 개인정보 처리방침에 동의해야 합니다.' : 'You must agree to the Terms of Service and Privacy Policy.');
          setLoading(false);
          return;
        }

        const consentTimestamp = new Date().toISOString();
        const emailRedirectTo = buildRedirectUrl('/auth/callback');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: {
              terms_consent_at: consentTimestamp,
              privacy_consent_at: consentTimestamp,
            },
          },
        });

        if (error) {
          console.error('[Auth] Signup error:', error.message);
          // 이미 가입된 이메일인 경우만 구체적으로 안내
          const isAlreadyRegistered = error.message?.toLowerCase().includes('already registered');
          const errorMessage = isAlreadyRegistered
            ? (lang === 'ko' ? '이미 가입된 이메일입니다.' : 'This email is already registered.')
            : (lang === 'ko' ? '회원가입에 실패했습니다.' : 'Sign up failed.');
          setError(errorMessage);
          setLoading(false);
          return;
        }

        // 이메일 인증이 필요한 경우
        if (data.user && !data.session) {
          setInfo(
            lang === 'ko'
              ? '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요. 인증 링크를 클릭하면 자동으로 로그인됩니다.'
              : 'Sign up successful! Please check your email to verify your account. Click the verification link to automatically log in.'
          );
          // 이메일 인증 안내 후 로그인 화면으로 전환
          setTimeout(() => {
            setEmail('');
            setPassword('');
            onSwitchType('login');
          }, 3000);
        } else if (data.user && data.session) {
          // 이메일 인증이 필요 없는 경우 (즉시 로그인)
          onLogin({
            id: data.user.id,
            email: data.user.email || email,
          });
          onClose(); // 프로필 모달 대신 모달 닫기
        }
      } else if (type === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        if (data.user) {
          onLogin({
            id: data.user.id,
            email: data.user.email || email,
          });
          onClose(); // 프로필 모달 대신 모달 닫기
        }
      }
    } catch (err: any) {
      // AbortError는 무시
      if (err?.name === 'AbortError') {
        setLoading(false);
        return;
      }
      
      console.error('[Auth] Auth error:', err?.message);
      // 에러 메시지를 사용자 친화적으로 표시 (내부 정보 노출 방지)
      let errorMessage = lang === 'ko' ? '인증 중 오류가 발생했습니다.' : 'Authentication error occurred.';
      
      // Supabase 에러 메시지를 한국어로 번역 (주요 에러들)
      if (err?.message) {
        if (err.message.includes('User already registered')) {
          errorMessage = lang === 'ko' ? '이미 등록된 이메일입니다. 로그인을 시도해주세요.' : 'This email is already registered. Please try logging in.';
        } else if (err.message.includes('Invalid email')) {
          errorMessage = lang === 'ko' ? '유효하지 않은 이메일 주소입니다.' : 'Invalid email address.';
        } else if (err.message.includes('Password')) {
          errorMessage = lang === 'ko' ? '비밀번호가 너무 짧거나 약합니다.' : 'Password is too short or weak.';
        } else if (err.message.includes('Email rate limit')) {
          errorMessage = lang === 'ko' ? '이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' : 'Email rate limit exceeded. Please try again later.';
        }
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleResetPassword = async (emailToUse?: string) => {
    const targetEmail = emailToUse || email || currentUserEmail;
    
    if (!targetEmail) {
      setError(lang === 'ko' ? '비밀번호 재설정을 위해 이메일을 입력해주세요.' : 'Please enter your email to reset password.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const redirectTo = buildRedirectUrl('/auth/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo,
      });
      if (error) throw error;
      setInfo(
        lang === 'ko'
          ? '비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해주세요.'
          : 'Password reset email sent. Please check your inbox.',
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'github' | 'kakao') => {
    // 회원가입 모드에서는 동의 필수
    if (type === 'signup' && (!termsConsent || !privacyConsent)) {
      setError(lang === 'ko' ? '이용약관과 개인정보 처리방침에 동의해야 합니다.' : 'You must agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      // 소셜 로그인 리다이렉트 전에 동의 시점을 localStorage에 저장
      if (type === 'signup') {
        const consentTimestamp = new Date().toISOString();
        localStorage.setItem('btd_pending_consent', JSON.stringify({
          terms_consent_at: consentTimestamp,
          privacy_consent_at: consentTimestamp,
        }));
      }

      const redirectTo = buildRedirectUrl('/auth/callback');
      console.log(`Attempting ${provider} login with redirect: ${redirectTo}`);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: {
            // 카카오의 경우 추가 파라미터가 필요할 수 있음
            ...(provider === 'kakao' && {
              access_type: 'offline',
              prompt: 'consent',
            }),
          },
        },
      });
      
      if (error) {
        // AbortError는 무시 (요청이 취소된 경우)
        if (error.name === 'AbortError') {
          console.log(`${provider} login request was aborted`);
          setLoading(false);
          return;
        }
        console.error(`${provider} login error:`, error);
        throw error;
      }
      
      console.log(`${provider} login initiated:`, data);
      // 실제 리디렉션은 Supabase에서 처리됨
      // 에러가 없으면 리디렉션이 일어나므로 loading을 false로 설정하지 않음
    } catch (err: any) {
      // AbortError는 무시
      if (err?.name === 'AbortError') {
        console.log(`${provider} login request was aborted`);
        setLoading(false);
        return;
      }
      
      console.error(`${provider} login failed:`, err);
      const errorMessage = err?.message || `${provider} login failed`;
      setError(
        lang === 'ko' 
          ? `${provider === 'kakao' ? '카카오' : provider} 로그인에 실패했습니다: ${errorMessage}`
          : `${provider} login failed: ${errorMessage}`
      );
      setLoading(false);
    }
  };

  const onConnectTelegram = async (): Promise<string> => {
    if (!currentUserId) throw new Error('User ID required');
    const token = crypto.randomUUID().replace(/-/g, '');
    const { error: insertError } = await supabase.from('telegram_link_tokens').insert({ user_id: currentUserId, token });
    if (insertError) throw insertError;
    return token;
  };

  const onDeleteAccount = async (): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error(lang === 'ko' ? '인증 세션이 만료되었습니다. 다시 로그인해주세요.' : 'Session expired. Please log in again.');
    const res = await supabase.functions.invoke('delete-account', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.error) throw new Error(res.error.message || 'Account deletion failed');
    alert(lang === 'ko' ? '회원 탈퇴가 완료되었습니다.' : 'Your account has been deleted.');
    await onLogout();
  };

  const modalTitle =
    type === 'login'
      ? t.login
      : type === 'signup'
      ? t.signup
      : type === 'reset-password'
      ? (lang === 'ko' ? '비밀번호 재설정' : 'Reset Password')
      : type === 'change-password'
      ? (lang === 'ko' ? '비밀번호 변경' : 'Change Password')
      : 'User Profile';

  const modalContent = (
    <>
      {isInTossApp ? (
        <TDSModalHeader
          title={modalTitle}
          onClose={onClose}
          leftAccessory={
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? <UserCheck className="text-white" size={20} /> : <ShieldCheck className="text-white" size={20} />}
            </div>
          }
        />
      ) : (
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? <UserCheck className="text-white" size={20} /> : <ShieldCheck className="text-white" size={20} />}
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{modalTitle}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400" aria-label="닫기"><X size={24} /></button>
        </div>
      )}

      {/* Content — AUTH_VIEW_MAP 기반 단일 렌더 (Phase 0.3) */}
      <div className="p-6 md:p-10 space-y-6 md:space-y-8 flex-1 overflow-y-auto overscroll-contain">
        {(() => {
          const ViewComponent = AUTH_VIEW_MAP[type];
          const viewProps =
            type === 'login' || type === 'signup'
              ? {
                  lang,
                  type,
                  onClose,
                  onSwitchType,
                  onLogin,
                  email,
                  setEmail,
                  password,
                  setPassword,
                  loading,
                  error,
                  info,
                  handleSubmit,
                  handleResetPassword,
                  handleSocialLogin,
                  termsConsent,
                  setTermsConsent,
                  privacyConsent,
                  setPrivacyConsent,
                  setError,
                  isInTossApp,
                }
              : type === 'reset-password'
              ? {
                  lang,
                  onClose,
                  onSwitchType,
                  newPassword,
                  setNewPassword,
                  confirmPassword,
                  setConfirmPassword,
                  loading,
                  error,
                  info,
                  handleSubmit,
                }
              : type === 'change-password'
              ? {
                  lang,
                  onSwitchType,
                  currentUserEmail: currentUserEmail ?? undefined,
                  currentPassword,
                  setCurrentPassword,
                  newPassword,
                  setNewPassword,
                  confirmPassword,
                  setConfirmPassword,
                  loading,
                  error,
                  info,
                  handleSubmit,
                }
              : {
                  lang,
                  onClose,
                  onSwitchType,
                  onLogout,
                  currentUserEmail,
                  currentTier: currentTier ?? 'free',
                  currentUserId,
                  tierLabel,
                  telegramConnectedAt,
                  telegramAlertsEnabled,
                  onTelegramAlertsEnabledChange,
                  error,
                  info,
                  setInfo,
                  loading,
                  setLoading,
                  setError,
                  telegramLinkToken,
                  setTelegramLinkToken,
                  telegramLinkLoading,
                  setTelegramLinkLoading,
                  showDeleteConfirm,
                  setShowDeleteConfirm,
                  showCancelSub,
                  setShowCancelSub,
                  cancelSubLoading,
                  setCancelSubLoading,
                  deleteConfirmText,
                  setDeleteConfirmText,
                  cancelSubscription,
                  onConnectTelegram,
                  onDeleteAccount,
                };
          return <ViewComponent {...viewProps} />;
        })()}
      </div>
    </>
  );

  return isInTossApp ? (
    <TDSModal open onClose={onClose}>{modalContent}</TDSModal>
  ) : (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]" style={{ touchAction: 'pan-y' }}>
        {modalContent}
      </div>
    </div>
  );
};

export default AuthModals;