/**
 * 프로필 뷰 (계정 정보, 텔레그램, 비밀번호 변경, 로그아웃, 환불, 탈퇴)
 * Phase 0.3 — AuthModals 서브뷰 분리
 * Phase 3 — 토스에서 TDSButton 사용
 */

import React from 'react';
import { UserCheck, Key, LogOut, Send, Sparkles } from 'lucide-react';
import { I18N } from '../../constants';
import { COMMON_MESSAGES } from '../../constants/messages/commonMessages';
import {
  PROFILE_MESSAGES,
  getAccountDeletionFailedMessage,
  getDeleteConfirmInstruction,
  getDeleteConfirmValue,
  getMembershipMemberBadge,
  getTelegramBotSearchMessage,
} from '../../constants/messages/profileMessages';
import Toggle from '../Toggle';
import HoverTip from '../HoverTip';
import { TDSButton } from '../tds';
import { getDictionaryCopy } from '../../utils/getDictionaryCopy';
import { resolvePaidTier, type PaidTier } from '../../utils/appEntryHelpers';
import type { ProfileViewProps } from './authViewTypes';
import RefundGuideController from './RefundGuideController';

function getTierChipClassName(paidTier: PaidTier): string {
  switch (paidTier) {
    case 'premium':
      return 'bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.55)]';
    case 'pro':
      return 'bg-sky-400 text-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.45)]';
    case 'free':
      return 'bg-slate-900/80 text-slate-100';
    default: {
      const exhaustiveCheck: never = paidTier;
      return exhaustiveCheck;
    }
  }
}

const ProfileView: React.FC<ProfileViewProps> = ({
  lang,
  onSwitchType,
  onLogout,
  onUpgradePlan,
  currentUserEmail,
  currentTier,
  currentUserId,
  telegramConnectedAt,
  telegramAlertsEnabled,
  onTelegramAlertsEnabledChange,
  error,
  info,
  loading,
  setLoading,
  setError,
  telegramLinkToken,
  setTelegramLinkToken,
  telegramLinkLoading,
  setTelegramLinkLoading,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteConfirmText,
  setDeleteConfirmText,
  onConnectTelegram,
  onDeleteAccount,
  isInTossApp,
}) => {
  const t = I18N[lang];
  const commonCopy = getDictionaryCopy(COMMON_MESSAGES, lang, 'COMMON_MESSAGES');
  const profileCopy = getDictionaryCopy(
    PROFILE_MESSAGES,
    lang,
    'PROFILE_MESSAGES',
  );
  const paidTier = resolvePaidTier(currentTier);
  const membershipBadge = getMembershipMemberBadge(paidTier, lang);
  const deleteConfirmValue = getDeleteConfirmValue(lang);
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  const telegramBotSearchMessage = getTelegramBotSearchMessage(
    lang,
    telegramBotUsername,
  );

  const handleConnectTelegramClick = async () => {
    if (!currentUserId) return;
    setTelegramLinkLoading(true);
    setError(null);
    try {
      const token = await onConnectTelegram();
      setTelegramLinkToken(token);
      if (telegramBotUsername) {
        window.open(
          `https://t.me/${telegramBotUsername}?start=${token}`,
          '_blank',
          'noopener,noreferrer',
        );
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : profileCopy.telegramTokenCreateFailed;
      setError(msg);
    } finally {
      setTelegramLinkLoading(false);
    }
  };

  const handleDeleteAccountClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : profileCopy.unknownError;
      setError(getAccountDeletionFailedMessage(lang, msg));
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoading(true);
    try {
      await onLogout();
    } catch (err: unknown) {
      console.error('[ProfileView] Logout failed:', err);
      setError(profileCopy.logoutFailed);
    } finally {
      setLoading(false);
    }
  };

  const canUpgrade = !!onUpgradePlan && paidTier !== 'premium';
  const handleUpgradeClick = () => {
    if (!canUpgrade || !onUpgradePlan) return;
    const nextPlan: 'pro' | 'premium' = paidTier === 'free' ? 'pro' : 'premium';
    onUpgradePlan(nextPlan);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-white/5 text-center">
        <div className="relative w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center shadow-xl border border-white/10">
          <UserCheck size={40} className="text-slate-100" />
          {paidTier !== 'free' && (
            <div
              className={`absolute -bottom-2 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${getTierChipClassName(
                paidTier,
              )}`}
            >
              <Sparkles size={10} className="hidden" />
              {membershipBadge}
            </div>
          )}
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
          {profileCopy.accountConnected}
        </p>
        <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
          {currentUserEmail ?? profileCopy.unknownEmail}
        </p>
        <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
          {membershipBadge}
        </p>
      </div>

      {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
      {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}

      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {profileCopy.telegramSectionTitle}
        </p>
        {paidTier !== 'free' ? (
          <>
            {telegramConnectedAt ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">
                  {profileCopy.telegramConnected}
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">({new Date(telegramConnectedAt).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US')})</span>
                </p>
                <Toggle
                  checked={telegramAlertsEnabled}
                  onChange={(v) => onTelegramAlertsEnabledChange?.(v)}
                  aria-label={profileCopy.telegramAlertsAriaLabel}
                />
              </div>
            ) : telegramLinkToken ? (
              <div className="space-y-2 text-left">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {profileCopy.telegramLinkInstruction}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {telegramBotSearchMessage}
                </p>
                <p className="font-mono text-sm font-black bg-slate-800 text-emerald-400 px-3 py-2 rounded-xl break-all">/start {telegramLinkToken}</p>
                {telegramBotUsername ? (
                  <a href={`https://t.me/${telegramBotUsername}?start=${telegramLinkToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] text-white rounded-xl text-sm font-bold hover:opacity-90">
                    <Send size={16} /> {profileCopy.openInTelegram}
                  </a>
                ) : null}
                <p className="text-[10px] text-slate-500">
                  {profileCopy.reopenProfileHint}
                </p>
              </div>
            ) : isInTossApp ? (
              <TDSButton variant="tertiary" fullWidth disabled={!currentUserId || telegramLinkLoading} loading={telegramLinkLoading} onClick={handleConnectTelegramClick} className="flex items-center justify-center gap-2 text-[#0088cc] border-[#0088cc]/30">
                <Send size={18} />
                {telegramLinkLoading
                  ? commonCopy.processing
                  : profileCopy.connectTelegram}
              </TDSButton>
            ) : (
              <button type="button" disabled={!currentUserId || telegramLinkLoading} onClick={handleConnectTelegramClick} className="w-full py-4 bg-[#0088cc]/10 text-[#0088cc] dark:text-[#54a9eb] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-[#0088cc]/30 hover:bg-[#0088cc]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                <Send size={18} />
                {telegramLinkLoading
                  ? commonCopy.processing
                  : profileCopy.connectTelegram}
              </button>
            )}
          </>
        ) : (
          <HoverTip text={profileCopy.paidOnly}>
            <span className="inline-block w-full">
              <button type="button" disabled className="w-full py-4 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-80">
                <Send size={18} /> {profileCopy.connectTelegram}
              </button>
            </span>
          </HoverTip>
        )}
      </div>

      {canUpgrade && (
        <div className="space-y-3">
          {isInTossApp ? (
            <TDSButton
              variant="primary"
              fullWidth
              onClick={handleUpgradeClick}
              disabled={loading}
              className="flex items-center justify-center gap-3"
            >
              {profileCopy.upgradeMembership}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={handleUpgradeClick}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-md hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {profileCopy.upgradeMembership}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {/* 토스 미니앱 환경에서는 비밀번호 변경 버튼 숨김 */}
        {!isInTossApp && (
          <button
            type="button"
            onClick={() => onSwitchType('change-password')}
            disabled={loading}
            className="w-full py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Key size={18} /> {t.changePassword}
          </button>
        )}

        {/* 로그아웃 버튼은 환경별 스타일만 다르게 노출 */}
        {isInTossApp ? (
          <TDSButton
            variant="tertiary"
            fullWidth
            onClick={handleLogoutClick}
            disabled={loading}
            className="flex items-center justify-center gap-3 text-rose-500 border border-rose-500/20"
          >
            <LogOut size={18} /> {t.logout}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={handleLogoutClick}
            disabled={loading}
            className="w-full py-5 bg-rose-600/10 text-rose-500 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogOut size={18} /> {t.logout}
          </button>
        )}

        {currentTier !== 'free' && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/5">
            <RefundGuideController
              lang={lang}
              isDisabled={loading}
            />
          </div>
        )}

        {/* 토스 미니앱 환경에서는 회원 탈퇴 UI 전체 숨김 */}
        {!isInTossApp && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/5">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="w-full py-3 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest underline-offset-4 disabled:opacity-60"
              >
                {profileCopy.deleteAccount}
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800/50">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {profileCopy.deleteWarning}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {getDeleteConfirmInstruction(lang)}
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteConfirmValue}
                  className="w-full p-3 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500/50"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest"
                  >
                    {profileCopy.cancelDelete}
                  </button>
                  <button
                    type="button"
                    disabled={loading || deleteConfirmText !== deleteConfirmValue}
                    onClick={handleDeleteAccountClick}
                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                  >
                    {loading ? commonCopy.processing : profileCopy.deleteForever}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileView;
