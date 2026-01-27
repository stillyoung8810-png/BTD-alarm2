
import React, { useState } from 'react';
import { I18N } from '../constants';
import { X, Mail, Lock, LogOut, Key, UserCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../services/supabase';

interface AuthModalsProps {
  lang: 'ko' | 'en';
  type: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password';
  onClose: () => void;
  onSwitchType: (type: 'login' | 'signup' | 'profile' | 'reset-password' | 'change-password') => void;
  onLogin: (user: { id: string; email: string }) => void;
  onLogout: () => void;
  currentUserEmail?: string | null;
  currentTier?: 'free' | 'pro' | 'premium' | null;
}

const AuthModals: React.FC<AuthModalsProps> = ({ lang, type, onClose, onSwitchType, onLogin, onLogout, currentUserEmail, currentTier = 'free' }) => {
  const t = I18N[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const tierLabel =
    currentTier === 'premium'
      ? 'PREMIUM'
      : currentTier === 'pro'
      ? 'PRO'
      : 'FREE';

  // 베이스 URL과 경로를 안전하게 합쳐서 슬래시 중복/누락을 방지하는 헬퍼
  const buildRedirectUrl = (path: string) => {
    const rawBase = import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const base = rawBase.replace(/\/+$/, ''); // 끝 슬래시 제거
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
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
      if (newPassword.length < 6) {
        setError(lang === 'ko' ? '비밀번호는 최소 6자 이상이어야 합니다.' : 'Password must be at least 6 characters.');
        return;
      }

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
          setError(updateError.message || (lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.'));
        } else {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setInfo(null);

          if (typeof window !== 'undefined') {
            alert(lang === '코' ? '비밀번호가 성공적으로 변경되었습니다.' : 'Password updated successfully.');
          }
          onSwitchType('profile');
        }
      } catch (err: any) {
        setError(err?.message || (lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.'));
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
      
      if (newPassword.length < 6) {
        setError(lang === 'ko' ? '비밀번호는 최소 6자 이상이어야 합니다.' : 'Password must be at least 6 characters.');
        return;
      }
      
      setLoading(true);
      setError(null);
      setInfo(null);
      
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        
        if (error) {
          // Supabase에서 반환된 구체적인 에러 메시지를 화면에 표시
          setError(error.message || (lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.'));
        } else {
          // 소셜 로그인 사용자가 처음 비밀번호를 설정하는 경우도 동일하게 처리됨
          setNewPassword('');
          setConfirmPassword('');
          setInfo(null);

          if (typeof window !== 'undefined') {
            alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.' : 'Password updated successfully. Please log in again.');
          }

          // 모달 닫기 (상위에서 authModal을 null로 설정)
          onSwitchType('login');
          onClose();
        }
      } catch (err: any) {
        // 예외 발생 시에도 구체적인 메시지 표시
        setError(err?.message || (lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.'));
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
        const emailRedirectTo = buildRedirectUrl('/auth/callback');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
          },
        });

        if (error) {
          // 에러를 사용자에게 명확하게 표시
          const errorMessage = error.message || (lang === 'ko' ? '회원가입에 실패했습니다.' : 'Sign up failed.');
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
      
      // 에러 메시지를 사용자 친화적으로 표시
      let errorMessage = err?.message || (lang === 'ko' ? '인증 중 오류가 발생했습니다.' : 'Authentication error occurred.');
      
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
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[calc(100dvh-2rem)]"
        style={{ touchAction: 'pan-y' }}
      >
        
        {/* Header - 고정 */}
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                 {type === 'profile' ? <UserCheck className="text-white" size={20} /> : <ShieldCheck className="text-white" size={20} />}
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {type === 'login'
                  ? t.login
                  : type === 'signup'
                  ? t.signup
                  : type === 'reset-password'
                  ? (lang === 'ko' ? '비밀번호 재설정' : 'Reset Password')
                  : type === 'change-password'
                  ? (lang === 'ko' ? '비밀번호 변경' : 'Change Password')
                  : 'User Profile'}
              </h2>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"><X size={24} /></button>
        </div>

        {/* Content - 스크롤 가능 */}
        <div className="p-6 md:p-10 space-y-6 md:space-y-8 flex-1 overflow-y-auto overscroll-contain">
          {type === 'reset-password' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{lang === 'ko' ? '새 비밀번호' : 'New Password'}</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{lang === 'ko' ? '비밀번호 확인' : 'Confirm Password'}</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                  {error}
                </p>
              )}
              {info && (
                <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">
                  {info}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
                disabled={loading}
              >
                {loading
                  ? lang === 'ko'
                    ? '처리 중...'
                    : 'Working...'
                  : lang === 'ko'
                    ? '비밀번호 변경'
                    : 'Update Password'}
              </button>
            </form>
          ) : type === 'change-password' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  {lang === 'ko' ? '현재 비밀번호' : 'Current Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  {lang === 'ko' ? '새 비밀번호' : 'New Password'}
                </label>
                <div className="relative">
                  <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  {lang === 'ko' ? '새 비밀번호 확인' : 'Confirm New Password'}
                </label>
                <div className="relative">
                  <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                  {error}
                </p>
              )}
              {info && (
                <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">
                  {info}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
                disabled={loading}
              >
                {loading
                  ? lang === 'ko'
                    ? '처리 중...'
                    : 'Working...'
                  : lang === 'ko'
                  ? '비밀번호 업데이트'
                  : 'Update Password'}
              </button>
            </form>
          ) : type === 'profile' ? (
            <div className="space-y-6">
               <div className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-white/5 text-center">
                  <div className="relative w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center shadow-xl border border-white/10">
                     <UserCheck size={40} className="text-slate-100" />
                     {currentTier !== 'free' && (
                       <div className={`absolute -bottom-2 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                         currentTier === 'premium'
                           ? 'bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.55)]'
                           : 'bg-sky-400 text-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.45)]'
                       }`}>
                         <Sparkles size={10} className="hidden" />
                         {tierLabel}
                       </div>
                     )}
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                    {lang === 'ko' ? 'ACCOUNT CONNECTED' : 'ACCOUNT CONNECTED'}
                  </p>
                  <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
                    {currentUserEmail || 'unknown'}
                  </p>
                  <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
                    {tierLabel === 'FREE'
                      ? (lang === 'ko' ? 'FREE 회원' : 'FREE MEMBER')
                      : tierLabel === 'PRO'
                      ? (lang === 'ko' ? 'PRO 회원' : 'PRO MEMBER')
                      : (lang === 'ko' ? 'PREMIUM 회원' : 'PREMIUM MEMBER')}
                  </p>
               </div>

               {error && (
                 <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                   {error}
                 </p>
               )}
               {info && (
                 <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">
                   {info}
                 </p>
               )}
               
               <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => onSwitchType('change-password')}
                    disabled={loading}
                    className="w-full py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Key size={18} /> {t.changePassword}
                  </button>
                  <button 
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await onLogout();
                      } catch (err) {
                        setError(lang === 'ko' ? '로그아웃 중 오류가 발생했습니다.' : 'Error during logout');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="w-full py-5 bg-rose-600/10 text-rose-500 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <LogOut size={18} /> {t.logout}
                  </button>
               </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.email}</label>
                 <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="email" 
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.password}</label>
                 <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="password" 
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                 </div>
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
                  {error}
                </p>
              )}
              {info && (
                <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">
                  {info}
                </p>
              )}

              <button
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
                disabled={loading}
              >
                {loading
                  ? lang === 'ko'
                    ? '처리 중...'
                    : 'Working...'
                  : type === 'login'
                    ? t.login
                    : t.signup}
              </button>

              <button
                type="button"
                onClick={() => handleResetPassword()}
                className="w-full mt-3 py-2 text-[11px] font-bold text-slate-400 hover:text-blue-400 transition-colors uppercase tracking-widest underline-offset-4 active:scale-95 transition-transform"
              >
                {lang === 'ko' ? '비밀번호를 잊으셨나요? 재설정 메일 보내기' : 'Forgot password? Send reset email'}
              </button>

              <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-[0.2em] text-center">
                  {lang === 'ko' ? '또는 소셜 계정으로 로그인' : 'Or continue with'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('google')}
                    className="py-3 bg-white text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest border border-white/10 hover:bg-slate-100 transition-all disabled:opacity-60"
                    disabled={loading}
                  >
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('kakao')}
                    className="py-3 bg-[#FEE500] text-[#000000] rounded-2xl font-black text-[11px] uppercase tracking-widest border border-[#FEE500]/20 hover:bg-[#FEE500]/90 transition-all disabled:opacity-60 shadow-sm"
                    disabled={loading}
                  >
                    {lang === 'ko' ? '카카오' : 'Kakao'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('github')}
                    className="py-3 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white rounded-2xl font-black text-[11px] uppercase tracking-widest border border-slate-200 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all disabled:opacity-60"
                    disabled={loading}
                  >
                    GitHub
                  </button>
                </div>
              </div>

              <div className="text-center pt-4">
                {type === 'login' ? (
                  <button 
                    type="button"
                    onClick={() => onSwitchType('signup')}
                    className="text-[11px] font-bold text-slate-500 hover:text-blue-500 transition-colors uppercase tracking-widest"
                  >
                    {lang === 'ko' ? '계정이 없으신가요? 회원가입' : "Don't have an account? Sign Up"}
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={() => onSwitchType('login')}
                    className="text-[11px] font-bold text-slate-500 hover:text-blue-500 transition-colors uppercase tracking-widest"
                  >
                    {lang === 'ko' ? '이미 계정이 있으신가요? 로그인' : "Already have an account? Login"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModals;
