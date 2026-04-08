import type { AppLang } from '@/types';

export const APP_HASH = {
  privacy: '#privacy',
  terms: '#terms',
} as const;

export interface AppShellMessageSet {
  entryAppName: string;
  entryGoToDashboardAria: string;
  loadingDashboard: string;
  loadingGeneric: string;
  loadingBacktest: string;
  dailySummarySaveErrorPrefix: string;
  dailySummaryNetworkError: string;
  portfolioDeleteFailed: string;
  historyEntryDeleteFailed: string;
  historyClearFailed: string;
  communityBoardLabel: string;
  communityBoardAria: string;
  backtestPreparingTooltip: string;
}

export const APP_SHELL_MESSAGES: Record<AppLang, AppShellMessageSet> = {
  ko: {
    entryAppName: 'BUY THE DIP',
    entryGoToDashboardAria: '대시보드로 이동',
    loadingDashboard: '대시보드 로딩 중…',
    loadingGeneric: '로딩 중…',
    loadingBacktest: '백테스트 로딩 중…',
    dailySummarySaveErrorPrefix: '요약 저장 실패: ',
    dailySummaryNetworkError: '네트워크 오류로 요약을 저장하지 못했습니다.',
    portfolioDeleteFailed: '포트폴리오 삭제에 실패했습니다.',
    historyEntryDeleteFailed: '히스토리 항목 삭제에 실패했습니다.',
    historyClearFailed: '히스토리 비우기에 실패했습니다.',
    communityBoardLabel: '게시판',
    communityBoardAria: '게시판으로 이동',
    backtestPreparingTooltip:
      '더 나은 백테스트 경험을 위해\n다듬는 중이니 조금만 기다려 주세요.',
  },
  en: {
    entryAppName: 'BUY THE DIP',
    entryGoToDashboardAria: 'Go to dashboard',
    loadingDashboard: 'Loading dashboard…',
    loadingGeneric: 'Loading…',
    loadingBacktest: 'Loading backtest…',
    dailySummarySaveErrorPrefix: 'Could not save summary: ',
    dailySummaryNetworkError: 'Network error. Summary was not saved.',
    portfolioDeleteFailed: 'Could not delete portfolio.',
    historyEntryDeleteFailed: 'Could not delete history entry.',
    historyClearFailed: 'Could not clear history.',
    communityBoardLabel: 'Board',
    communityBoardAria: 'Go to board',
    backtestPreparingTooltip:
      'Polishing for a better backtest experience.\nPlease wait a bit.',
  },
};

const APP_SHELL_MESSAGE_CACHE = new Map<AppLang, AppShellMessageSet>();

export function getAppShellMessages(lang: AppLang): AppShellMessageSet {
  const cached = APP_SHELL_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = APP_SHELL_MESSAGES[lang];
  APP_SHELL_MESSAGE_CACHE.set(lang, messages);
  return messages;
}
