/**
 * 로그인 전용 뷰 (Phase 0.3 — AuthModals 서브뷰 분리)
 * 토스 앱에서는 TossLoginView, 웹에서는 이메일/소셜 폼.
 */

import React from 'react';
import { Mail, Lock } from 'lucide-react';
import { I18N } from '../../constants';
import TossLoginView from '../TossLoginView';
import type { AuthEmailFormProps } from './authViewTypes';

interface LoginViewProps extends Omit<AuthEmailFormProps, 'type'> {
  type: 'login';
}

const LoginView: React.FC<LoginViewProps> = ({
  lang,
  onSwitchType,
  onSignedIn,
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
}) => {
  const t = I18N[lang];

  if (isInTossApp) {
    return (
      <>
        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}
        <TossLoginView lang={lang} onSignedIn={onSignedIn} onError={setError} />
      </>
    );
  }

  return (
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
        type="submit"
        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
        disabled={loading}
      >
        {loading ? (lang === 'ko' ? '처리 중...' : 'Working...') : t.login}
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
          <button type="button" onClick={() => handleSocialLogin('google')} className="py-3 bg-white text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest border border-white/10 hover:bg-slate-100 transition-all disabled:opacity-60" disabled={loading}>
            Google
          </button>
          <button type="button" onClick={() => handleSocialLogin('kakao')} className="py-3 bg-[#FEE500] text-[#000000] rounded-2xl font-black text-[11px] uppercase tracking-widest border border-[#FEE500]/20 hover:bg-[#FEE500]/90 transition-all disabled:opacity-60 shadow-sm" disabled={loading}>
            {lang === 'ko' ? '카카오' : 'Kakao'}
          </button>
          <button type="button" onClick={() => handleSocialLogin('github')} className="py-3 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white rounded-2xl font-black text-[11px] uppercase tracking-widest border border-slate-200 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all disabled:opacity-60" disabled={loading}>
            GitHub
          </button>
        </div>
      </div>
      <div className="text-center pt-4">
        <button type="button" onClick={() => onSwitchType('signup')} className="text-[11px] font-bold text-slate-500 hover:text-blue-500 transition-colors uppercase tracking-widest">
          {lang === 'ko' ? '계정이 없으신가요? 회원가입' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </form>
  );
};

export default LoginView;
