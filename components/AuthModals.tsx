
import React, { useState } from 'react';
import { I18N } from '../constants';
import { X, Mail, Lock, LogOut, Key, UserCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabase';

interface AuthModalsProps {
  lang: 'ko' | 'en';
  type: 'login' | 'signup' | 'profile' | 'reset-password';
  onClose: () => void;
  onSwitchType: (type: 'login' | 'signup' | 'profile' | 'reset-password') => void;
  onLogin: (user: { id: string; email: string }) => void;
  onLogout: () => void;
  currentUserEmail?: string | null;
}

const AuthModals: React.FC<AuthModalsProps> = ({ lang, type, onClose, onSwitchType, onLogin, onLogout, currentUserEmail }) => {
  const t = I18N[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 베이스 URL과 경로를 안전하게 합쳐서 슬래시 중복/누락을 방지하는 헬퍼
  const buildRedirectUrl = (path: string) => {
    const rawBase = import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const base = rawBase.replace(/\/+$/, ''); // 끝 슬래시 제거
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
        
        if (error) throw error;
        
        setInfo(
          lang === 'ko'
            ? '비밀번호가 성공적으로 변경되었습니다.'
            : 'Password updated successfully.'
        );
        
        // 성공 후 프로필 모드로 전환
        setTimeout(() => {
          setNewPassword('');
          setConfirmPassword('');
          onSwitchType('profile');
        }, 2000);
      } catch (err: any) {
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
        const { data, error } = await supabase.auth.signUp({
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
          onSwitchType('profile');
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
          onSwitchType('profile');
        }
      }
    } catch (err: any) {
      const message = err?.message || 'Authentication error';
      setError(message);
    } finally {
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
      <div className="absolute inset-0 bg-[#0B0F19]/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-[#161d2a] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/40">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                 {type === 'profile' ? <UserCheck className="text-white" size={20} /> : <ShieldCheck className="text-white" size={20} />}
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {type === 'login' ? t.login : type === 'signup' ? t.signup : type === 'reset-password' ? (lang === 'ko' ? '비밀번호 재설정' : 'Reset Password') : 'User Profile'}
              </h2>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500"><X size={24} /></button>
        </div>

        <div className="p-10 space-y-8">
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
                    className="w-full p-5 pl-14 bg-slate-900 border border-white/5 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
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
                    className="w-full p-5 pl-14 bg-slate-900 border border-white/5 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
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
          ) : type === 'profile' ? (
            <div className="space-y-6">
               <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 text-center">
                  <div className="w-20 h-20 bg-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-xl border-4 border-white/10">
                     <UserCheck size={40} className="text-white" />
                  </div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                    {lang === 'ko' ? '로그인 계정' : 'Logged in as'}
                  </p>
                  <p className="text-white font-black text-lg">
                    {currentUserEmail || 'unknown'}
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
                    onClick={() => handleResetPassword(currentUserEmail || undefined)}
                    disabled={loading}
                    className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-white/5 hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
                      className="w-full p-5 pl-14 bg-slate-900 border border-white/5 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
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
                      className="w-full p-5 pl-14 bg-slate-900 border border-white/5 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
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
                className="w-full mt-3 text-[11px] font-bold text-slate-400 hover:text-blue-400 transition-colors uppercase tracking-widest underline-offset-4"
              >
                {lang === 'ko' ? '비밀번호를 잊으셨나요? 재설정 메일 보내기' : 'Forgot password? Send reset email'}
              </button>

              <div className="pt-4 border-t border-white/5 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] text-center">
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
                    className="py-3 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest border border-white/20 hover:bg-slate-800 transition-all disabled:opacity-60"
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
