/**
 * 프로필 뷰 (계정 정보, 텔레그램, 비밀번호 변경, 로그아웃, 환불, 탈퇴)
 * Phase 0.3 — AuthModals 서브뷰 분리
 * Phase 3 — 토스에서 TDSButton 사용
 */

import React from 'react';
import { UserCheck, Key, LogOut, Send, Sparkles } from 'lucide-react';
import { I18N } from '../../constants';
import Toggle from '../Toggle';
import HoverTip from '../HoverTip';
import { TDSButton } from '../tds';
import type { ProfileViewProps } from './authViewTypes';
import RefundGuideController from './RefundGuideController';

const ProfileView: React.FC<ProfileViewProps> = ({
  lang,
  onSwitchType,
  onLogout,
  onUpgradePlan,
  currentUserEmail,
  currentTier,
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
  deleteConfirmText,
  setDeleteConfirmText,
  onConnectTelegram,
  onDeleteAccount,
  isInTossApp,
}) => {
  const t = I18N[lang];

  const handleConnectTelegramClick = async () => {
    if (!currentUserId) return;
    setTelegramLinkLoading(true);
    setError(null);
    try {
      const token = await onConnectTelegram();
      setTelegramLinkToken(token);
      const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string;
      if (botUsername) window.open(`https://t.me/${botUsername}?start=${token}`, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : lang === 'ko' ? '토큰 생성에 실패했습니다.' : 'Failed to create link token.';
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
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : lang === 'ko' ? '알 수 없는 오류' : 'Unknown error';
      setError(lang === 'ko' ? `회원 탈퇴 실패: ${msg}` : `Account deletion failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const canUpgrade = !!onUpgradePlan && currentTier !== 'premium';
  const handleUpgradeClick = () => {
    if (!canUpgrade || !onUpgradePlan) return;
    const nextPlan: 'pro' | 'premium' = currentTier === 'free' ? 'pro' : 'premium';
    onUpgradePlan(nextPlan);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-white/5 text-center">
        <div className="relative w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center shadow-xl border border-white/10">
          <UserCheck size={40} className="text-slate-100" />
          {currentTier !== 'free' && (
            <div className={`absolute -bottom-2 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
              currentTier === 'premium' ? 'bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.55)]' : 'bg-sky-400 text-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.45)]'
            }`}>
              <Sparkles size={10} className="hidden" />
              {tierLabel}
            </div>
          )}
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">{lang === 'ko' ? 'ACCOUNT CONNECTED' : 'ACCOUNT CONNECTED'}</p>
        <p className="text-slate-900 dark:text-white font-black text-lg mb-1">{currentUserEmail || 'unknown'}</p>
        <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
          {tierLabel === 'FREE' ? (lang === 'ko' ? 'FREE 회원' : 'FREE MEMBER') : tierLabel === 'PRO' ? (lang === 'ko' ? 'PRO 회원' : 'PRO MEMBER') : (lang === 'ko' ? 'PREMIUM 회원' : 'PREMIUM MEMBER')}
        </p>
      </div>

      {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
      {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}

      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lang === 'ko' ? '텔레그램 알림' : 'TELEGRAM'}</p>
        {(currentTier === 'pro' || currentTier === 'premium') ? (
          <>
            {telegramConnectedAt ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">
                  {lang === 'ko' ? '연결됨' : 'Connected'}
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">({new Date(telegramConnectedAt).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US')})</span>
                </p>
                <Toggle checked={telegramAlertsEnabled} onChange={(v) => onTelegramAlertsEnabledChange?.(v)} aria-label={lang === 'ko' ? '텔레그램 알림 사용' : 'Telegram alerts'} />
              </div>
            ) : telegramLinkToken ? (
              <div className="space-y-2 text-left">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{lang === 'ko' ? '아래 링크를 클릭하거나, 텔레그램에서 봇에게 다음을 보내주세요:' : 'Click the link below or send the following to the bot on Telegram:'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{lang === 'ko' ? '봇 유저네임(@btd_alarm_bot) 을 검색하세요.' : 'Search for the bot username (@btd_alarm_bot).'}</p>
                <p className="font-mono text-sm font-black bg-slate-800 text-emerald-400 px-3 py-2 rounded-xl break-all">/start {telegramLinkToken}</p>
                {(import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string) ? (
                  <a href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}?start=${telegramLinkToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] text-white rounded-xl text-sm font-bold hover:opacity-90">
                    <Send size={16} /> {lang === 'ko' ? '텔레그램에서 열기' : 'Open in Telegram'}
                  </a>
                ) : null}
                <p className="text-[10px] text-slate-500">{lang === 'ko' ? '연결 후 프로필을 다시 열면 상태가 반영됩니다.' : 'Reopen profile after connecting to see status.'}</p>
              </div>
            ) : isInTossApp ? (
              <TDSButton variant="tertiary" fullWidth disabled={!currentUserId || telegramLinkLoading} loading={telegramLinkLoading} onClick={handleConnectTelegramClick} className="flex items-center justify-center gap-2 text-[#0088cc] border-[#0088cc]/30">
                <Send size={18} />
                {telegramLinkLoading ? (lang === 'ko' ? '처리 중…' : 'Loading…') : (lang === 'ko' ? '텔레그램 연결하기' : 'Connect Telegram')}
              </TDSButton>
            ) : (
              <button type="button" disabled={!currentUserId || telegramLinkLoading} onClick={handleConnectTelegramClick} className="w-full py-4 bg-[#0088cc]/10 text-[#0088cc] dark:text-[#54a9eb] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-[#0088cc]/30 hover:bg-[#0088cc]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                <Send size={18} />
                {telegramLinkLoading ? (lang === 'ko' ? '처리 중…' : 'Loading…') : (lang === 'ko' ? '텔레그램 연결하기' : 'Connect Telegram')}
              </button>
            )}
          </>
        ) : (
          <HoverTip text={lang === 'ko' ? '유료 회원만 이용 가능합니다.' : 'Available for paid members only.'}>
            <span className="inline-block w-full">
              <button type="button" disabled className="w-full py-4 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-80">
                <Send size={18} /> {lang === 'ko' ? '텔레그램 연결하기' : 'Connect Telegram'}
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
              {lang === 'ko' ? '멤버십 업그레이드' : 'Upgrade Membership'}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={handleUpgradeClick}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-md hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {lang === 'ko' ? '멤버십 업그레이드' : 'Upgrade Membership'}
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
            className="flex items-center justify-center gap-3 text-rose-500 border border-rose-500/20"
          >
            <LogOut size={18} /> {t.logout}
          </TDSButton>
        ) : (
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
                {lang === 'ko' ? '회원 탈퇴' : 'Delete Account'}
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800/50">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {lang === 'ko'
                    ? '⚠️ 회원 탈퇴 시 모든 데이터(포트폴리오, 매매기록, 알람 설정 등)가 영구 삭제되며 복구할 수 없습니다.'
                    : '⚠️ Deleting your account will permanently remove all data (portfolios, trades, alarms, etc.) and cannot be undone.'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'ko' ? '확인을 위해 아래에 "탈퇴합니다"를 입력해주세요.' : 'Type "DELETE" below to confirm.'}
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={lang === 'ko' ? '탈퇴합니다' : 'DELETE'}
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
                    {lang === 'ko' ? '취소' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={loading || (lang === 'ko' ? deleteConfirmText !== '탈퇴합니다' : deleteConfirmText !== 'DELETE')}
                    onClick={handleDeleteAccountClick}
                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                  >
                    {loading ? (lang === 'ko' ? '처리 중...' : 'Processing...') : (lang === 'ko' ? '영구 삭제' : 'Delete Forever')}
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
