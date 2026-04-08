import React from 'react';
import { Lock, Key } from 'lucide-react';
import { TDSTextField, TDSButton } from '../tds';
import type { ChangePasswordViewProps } from './authViewTypes';

function ChangePasswordView({
  copy,
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
  isInTossApp,
}: ChangePasswordViewProps): React.ReactElement {
  const submitLabel = loading
    ? copy.action.processing
    : copy.action.changePassword;

  if (isInTossApp) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <TDSTextField label={copy.field.currentPasswordLabel} type="password" value={currentPassword} onChange={setCurrentPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        <TDSTextField label={copy.field.newPasswordLabel} type="password" value={newPassword} onChange={setNewPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        <TDSTextField label={copy.field.confirmPasswordLabel} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
        {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}
        <TDSButton type="submit" fullWidth loading={loading} disabled={loading}>{submitLabel}</TDSButton>
      </form>
    );
  }

  return (
  <form onSubmit={handleSubmit} className="space-y-6">
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.currentPasswordLabel}</label>
      <div className="relative">
        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.newPasswordLabel}</label>
      <div className="relative">
        <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.confirmPasswordLabel}</label>
      <div className="relative">
        <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    {error && (
      <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>
    )}
    {info && (
      <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>
    )}
    <button
      type="submit"
      className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
      disabled={loading}
    >
      {submitLabel}
    </button>
  </form>
  );
}

export default ChangePasswordView;