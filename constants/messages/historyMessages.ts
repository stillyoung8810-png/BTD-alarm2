import type { AppLang } from '@/types';

const EMPTY_DATE_LABEL = '-';

function formatClosedDateLabel(value: string, locale: string): string {
  if (value.trim() === '') {
    return EMPTY_DATE_LABEL;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString(locale);
}

export interface HistoryMessageSet {
  historyTitle: string;
  historySubtitle: string;
  totalProfitLabel: string;
  yieldLabel: string;
  closedStrategiesLabel: string;
  noHistoryLabel: string;
  totalInvestedLabel: string;
  totalYieldLabel: string;
  investedFormulaLabel: string;
  yieldFormulaLabel: string;
  detailsLabel: string;
  startDate: (value: string) => string;
  closedDate: (value: string) => string;
}

export const HISTORY_MESSAGES: Record<AppLang, HistoryMessageSet> = {
  ko: {
    historyTitle: '투자이력',
    historySubtitle: '완료된 투자 전략 성과',
    totalProfitLabel: '누적 수익',
    yieldLabel: '수익률',
    closedStrategiesLabel: '종료된 전략',
    noHistoryLabel: '기록된 내역이 없습니다.',
    totalInvestedLabel: '총 투자금',
    totalYieldLabel: '총 수익률',
    investedFormulaLabel: '[Sigma(Buy + Fee)]',
    yieldFormulaLabel: '[(Total Return / Total Invested - 1) * 100]',
    detailsLabel: '정산 상세보기',
    startDate: (value: string) => `시작: ${value}`,
    closedDate: (value: string) =>
      `종료: ${formatClosedDateLabel(value, 'ko-KR')}`,
  },
  en: {
    historyTitle: 'History',
    historySubtitle: 'Performance of completed strategies',
    totalProfitLabel: 'Total Profit',
    yieldLabel: 'YIELD',
    closedStrategiesLabel: 'Closed Strategies',
    noHistoryLabel: 'No history found.',
    totalInvestedLabel: 'Total Invested',
    totalYieldLabel: 'Total Yield',
    investedFormulaLabel: '[Sigma(Buy + Fee)]',
    yieldFormulaLabel: '[(Total Return / Total Invested - 1) * 100]',
    detailsLabel: 'View Settlement',
    startDate: (value: string) => `Start: ${value}`,
    closedDate: (value: string) =>
      `End: ${formatClosedDateLabel(value, 'en-US')}`,
  },
};

const HISTORY_MESSAGE_CACHE = new Map<AppLang, HistoryMessageSet>();

export function getHistoryMessages(lang: AppLang): HistoryMessageSet {
  const cached = HISTORY_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = HISTORY_MESSAGES[lang];
  HISTORY_MESSAGE_CACHE.set(lang, messages);
  return messages;
}
