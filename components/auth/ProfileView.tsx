import React from 'react';
import { Copy, UserCheck, Key, LogOut, Send, Sparkles } from 'lucide-react';
import type { AppLang } from '../../types';
import { getMembershipMemberBadge } from '../../constants/messages/profileMessages';
import Toggle from '../Toggle';
import { TDSButton } from '../tds';
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

const PROFILE_DATE_LOCALE: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

const DEFAULT_TELEGRAM_BOT_USERNAME = 'btd_alarm_bot';
const TELEGRAM_COPY_BUTTON_CLASS_NAME =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[#0088cc]/30 bg-[#0088cc]/10 px-3 py-2 text-xs font-black text-[#0088cc] transition-colors hover:bg-[#0088cc]/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#54a9eb]';

function getProfileErrorMessage(
  prefix: string,
  error: unknown,
): string {
  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim() !== ''
  ) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
}

function getResolvedTelegramBotUsername(username: string | undefined): string {
  const normalized = username?.trim().replace(/^@+/, '') ?? '';
  if (normalized.length > 0) {
    return normalized;
  }

  return DEFAULT_TELEGRAM_BOT_USERNAME;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (text.trim().length === 0) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // WebView나 권한 정책에서 Clipboard API가 막히면 textarea 방식으로 재시도합니다.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function ProfileView({
  lang,
  copy,
  onSwitchType,
  onLogout,
  isLogoutPending,
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
  setInfo,
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
}: ProfileViewProps): React.ReactElement {
  const paidTier = resolvePaidTier(currentTier);
  const membershipBadge = getMembershipMemberBadge(paidTier, lang);
  const deleteConfirmValue = copy.field.deleteConfirmPlaceholder;
  const isProfileActionDisabled = loading || isLogoutPending;
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  const resolvedTelegramBotUsername =
    getResolvedTelegramBotUsername(telegramBotUsername);
  const telegramBotUsernameForCopy = `@${resolvedTelegramBotUsername}`;
  const telegramStartCommand = telegramLinkToken
    ? `/start ${telegramLinkToken}`
    : '';

  const handleConnectTelegramClick = async () => {
    if (!currentUserId || isLogoutPending) return;
    setTelegramLinkLoading(true);
    setError(null);
    setInfo(null);
    try {
      const token = await onConnectTelegram();
      setTelegramLinkToken(token);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : copy.profile.telegramTokenCreateFailed;
      setError(msg);
    } finally {
      setTelegramLinkLoading(false);
    }
  };

  const handleCopyTelegramText = async (text: string): Promise<void> => {
    setError(null);
    setInfo(null);
    const didCopy = await copyTextToClipboard(text);
    if (didCopy) {
      setInfo(copy.profile.copiedToClipboard);
      return;
    }

    setError(copy.profile.clipboardCopyFailed);
  };

  const handleCopyTelegramUsername = (): void => {
    void handleCopyTelegramText(telegramBotUsernameForCopy);
  };

  const handleCopyTelegramStartCommand = (): void => {
    void handleCopyTelegramText(telegramStartCommand);
  };

  const handleDeleteAccountClick = async () => {
    if (isLogoutPending) return;
    setLoading(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (err: unknown) {
      setError(getProfileErrorMessage(copy.profile.deleteAccountFailed, err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = (): void => {
    void Promise.resolve(onLogout());
  };

  const canUpgrade = !!onUpgradePlan && paidTier !== 'premium';
  const handleUpgradeClick = () => {
    if (!canUpgrade || !onUpgradePlan) return;
    const nextPlan: 'pro' | 'premium' = paidTier === 'free' ? 'pro' : 'premium';
    onUpgradePlan(nextPlan);
  };

  const renderTelegramContent = (): React.ReactNode => {
    if (telegramConnectedAt) {
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">
            {copy.profile.telegramConnected}
            <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">
              (
              {new Date(telegramConnectedAt).toLocaleDateString(
                PROFILE_DATE_LOCALE[lang],
              )}
              )
            </span>
          </p>
          <Toggle
            checked={telegramAlertsEnabled}
            onChange={(v) => onTelegramAlertsEnabledChange?.(v)}
            disabled={isProfileActionDisabled}
            aria-label={copy.profile.telegramAlertsAriaLabel}
          />
        </div>
      );
    }

    if (telegramLinkToken) {
      return (
        <div className="space-y-3 text-left">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {copy.profile.telegramLinkInstruction}
          </p>
          <div className="space-y-2 rounded-2xl border border-[#0088cc]/20 bg-white p-3 dark:bg-slate-950/40">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {copy.profile.telegramBotSearchPrefix}{' '}
              <span className="whitespace-nowrap">
                (
                <span className="font-black text-[#0088cc] dark:text-[#54a9eb]">
                  {telegramBotUsernameForCopy}
                </span>
                )
              </span>
              {copy.profile.telegramBotSearchSuffix}
            </p>
            <button
              type="button"
              onClick={handleCopyTelegramUsername}
              className={TELEGRAM_COPY_BUTTON_CLASS_NAME}
              aria-label={copy.profile.copyTelegramUsername}
            >
              <Copy size={14} />
              {copy.profile.copyTelegramUsername}
            </button>
          </div>
          <div className="space-y-2">
            <p className="font-mono text-sm font-black bg-slate-800 text-emerald-400 px-3 py-2 rounded-xl break-all">
              {telegramStartCommand}
            </p>
            <button
              type="button"
              onClick={handleCopyTelegramStartCommand}
              className={TELEGRAM_COPY_BUTTON_CLASS_NAME}
              aria-label={copy.profile.copyTelegramStartCommand}
            >
              <Copy size={14} />
              {copy.profile.copyTelegramStartCommand}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            {copy.profile.reopenProfileHint}
          </p>
        </div>
      );
    }

    if (isInTossApp) {
      return (
        <TDSButton variant="tertiary" fullWidth disabled={!currentUserId || telegramLinkLoading || isLogoutPending} loading={telegramLinkLoading} onClick={handleConnectTelegramClick} className="flex items-center justify-center gap-2 text-[#0088cc] border-[#0088cc]/30">
          <Send size={18} />
          {telegramLinkLoading
            ? copy.action.processing
            : copy.action.connectTelegram}
        </TDSButton>
      );
    }

    return (
      <button type="button" disabled={!currentUserId || telegramLinkLoading || isLogoutPending} onClick={handleConnectTelegramClick} className="w-full py-4 bg-[#0088cc]/10 text-[#0088cc] dark:text-[#54a9eb] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-[#0088cc]/30 hover:bg-[#0088cc]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
        <Send size={18} />
        {telegramLinkLoading
          ? copy.action.processing
          : copy.action.connectTelegram}
      </button>
    );
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
          {copy.profile.accountConnected}
        </p>
        <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
          {currentUserEmail ?? copy.profile.unknownEmail}
        </p>
        <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
          {membershipBadge}
        </p>
      </div>

      {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
      {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}

      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {copy.profile.telegramSectionTitle}
        </p>
        {renderTelegramContent()}
      </div>

      {canUpgrade && (
        <div className="space-y-3">
          {isInTossApp ? (
            <TDSButton
              variant="primary"
              fullWidth
              onClick={handleUpgradeClick}
              disabled={isProfileActionDisabled}
              className="flex items-center justify-center gap-3"
            >
              {copy.action.upgradeMembership}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={handleUpgradeClick}
              disabled={isProfileActionDisabled}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-md hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {copy.action.upgradeMembership}
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
            disabled={isProfileActionDisabled}
            className="w-full py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Key size={18} /> {copy.action.changePassword}
          </button>
        )}

        {/* 로그아웃 버튼은 환경별 스타일만 다르게 노출 */}
        {isInTossApp ? (
          <TDSButton
            variant="tertiary"
            fullWidth
            onClick={handleLogoutClick}
            loading={isLogoutPending}
            disabled={isProfileActionDisabled}
            className="flex items-center justify-center gap-3 text-rose-500 border border-rose-500/20"
          >
            <LogOut size={18} />{' '}
            {isLogoutPending ? copy.action.processing : copy.action.logout}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={handleLogoutClick}
            disabled={isProfileActionDisabled}
            className="w-full py-5 bg-rose-600/10 text-rose-500 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogOut size={18} />{' '}
            {isLogoutPending ? copy.action.processing : copy.action.logout}
          </button>
        )}

        {currentTier !== 'free' && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/5">
            <RefundGuideController
              lang={lang}
              isDisabled={isProfileActionDisabled}
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
                disabled={isProfileActionDisabled}
                className="w-full py-3 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest underline-offset-4 disabled:opacity-60"
              >
                {copy.action.deleteAccount}
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800/50">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {copy.profile.deleteWarning}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {copy.profile.deleteInstruction}
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
                    {copy.action.cancelDelete}
                  </button>
                  <button
                    type="button"
                    disabled={
                      isProfileActionDisabled ||
                      deleteConfirmText !== deleteConfirmValue
                    }
                    onClick={handleDeleteAccountClick}
                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                  >
                    {loading ? copy.action.processing : copy.action.deleteForever}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileView;