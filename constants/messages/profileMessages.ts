import type { AppLang } from '@/types';
import type { PaidTier } from '@/utils/appEntryHelpers';

export interface ProfileMessageSet {
  accountConnected: string;
  unknownEmail: string;
  telegramSectionTitle: string;
  telegramConnected: string;
  telegramAlertsAriaLabel: string;
  telegramLinkInstruction: string;
  reopenProfileHint: string;
  connectTelegram: string;
  paidOnly: string;
  upgradeMembership: string;
  telegramTokenCreateFailed: string;
  unknownError: string;
  logoutFailed: string;
  deleteAccount: string;
  deleteWarning: string;
  deleteForever: string;
  cancelDelete: string;
}

export const PROFILE_MESSAGES: Record<AppLang, ProfileMessageSet> = {
  ko: {
    accountConnected: '계정 연결됨',
    unknownEmail: '알 수 없는 이메일',
    telegramSectionTitle: '텔레그램 알림',
    telegramConnected: '연결됨',
    telegramAlertsAriaLabel: '텔레그램 알림 사용',
    telegramLinkInstruction:
      '아래 링크를 클릭하거나, 텔레그램에서 봇에게 다음을 보내주세요:',
    reopenProfileHint: '연결 후 앱을 다시 열거나 재로그인하면 상태가 반영돼요.',
    connectTelegram: '텔레그램 연결하기',
    paidOnly: '유료 회원만 이용 가능합니다.',
    upgradeMembership: '멤버십 업그레이드',
    telegramTokenCreateFailed: '토큰 생성에 실패했습니다.',
    unknownError: '알 수 없는 오류',
    logoutFailed: '로그아웃 중 오류가 발생했습니다.',
    deleteAccount: '회원 탈퇴',
    deleteWarning:
      '⚠️ 회원 탈퇴 시 모든 데이터(포트폴리오, 매매기록, 알람 설정 등)가 영구 삭제되며 복구할 수 없습니다.',
    deleteForever: '영구 삭제',
    cancelDelete: '취소',
  },
  en: {
    accountConnected: 'ACCOUNT CONNECTED',
    unknownEmail: 'Unknown email',
    telegramSectionTitle: 'TELEGRAM',
    telegramConnected: 'Connected',
    telegramAlertsAriaLabel: 'Telegram alerts',
    telegramLinkInstruction:
      'Click the link below or send the following to the bot on Telegram:',
    reopenProfileHint:
      'After linking, reopen the app or sign in again to refresh state.',
    connectTelegram: 'Connect Telegram',
    paidOnly: 'Available for paid members only.',
    upgradeMembership: 'Upgrade Membership',
    telegramTokenCreateFailed: 'Failed to create link token.',
    unknownError: 'Unknown error',
    logoutFailed: 'Error during logout',
    deleteAccount: 'Delete Account',
    deleteWarning:
      '⚠️ Deleting your account will permanently remove all data (portfolios, trades, alarms, etc.) and cannot be undone.',
    deleteForever: 'Delete Forever',
    cancelDelete: 'Cancel',
  },
};

const PROFILE_MESSAGE_CACHE = new Map<AppLang, ProfileMessageSet>();

export function getProfileMessages(lang: AppLang): ProfileMessageSet {
  const cached = PROFILE_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = PROFILE_MESSAGES[lang];
  PROFILE_MESSAGE_CACHE.set(lang, messages);
  return messages;
}

const MEMBERSHIP_MEMBER_BADGES: Record<PaidTier, Record<AppLang, string>> = {
  free: {
    ko: 'FREE 회원',
    en: 'FREE MEMBER',
  },
  pro: {
    ko: 'PRO 회원',
    en: 'PRO MEMBER',
  },
  premium: {
    ko: 'PREMIUM 회원',
    en: 'PREMIUM MEMBER',
  },
};

const DELETE_CONFIRM_VALUES: Record<AppLang, string> = {
  ko: '탈퇴합니다',
  en: 'DELETE',
};

export function getMembershipMemberBadge(
  paidTier: PaidTier,
  lang: AppLang,
): string {
  return MEMBERSHIP_MEMBER_BADGES[paidTier][lang];
}

export function getDeleteConfirmValue(lang: AppLang): string {
  return DELETE_CONFIRM_VALUES[lang];
}

export function getDeleteConfirmInstruction(lang: AppLang): string {
  const deleteConfirmValue = getDeleteConfirmValue(lang);

  if (lang === 'ko') {
    return `확인을 위해 아래에 "${deleteConfirmValue}"를 입력해주세요.`;
  }

  return `Type "${deleteConfirmValue}" below to confirm.`;
}

export function getAccountDeletionFailedMessage(
  lang: AppLang,
  detail: string,
): string {
  if (lang === 'ko') {
    return `회원 탈퇴 실패: ${detail}`;
  }

  return `Account deletion failed: ${detail}`;
}
