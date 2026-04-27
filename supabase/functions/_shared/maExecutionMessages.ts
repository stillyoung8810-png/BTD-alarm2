import { getStrategyName, type Lang } from './strategyNames.ts';

export type { Lang };

export interface MaExecutionMessageMap {
  strategyName: string;
  alarmTimes: string;
  noOrder: string;
  section: string;
  buy: string;
  sectionPartialProfit: string;
  sectionWatchRsiNotMet: string;
  sectionWatchAlignmentNotMet: string;
  sectionWatchBothNotMet: string;
  sharesUnit: string;
}

const MA_EXECUTION_MESSAGES: Record<Lang, Omit<MaExecutionMessageMap, 'strategyName'>> = {
  ko: {
    alarmTimes: '알람 시간',
    noOrder: '오늘 주문 요약은 앱에서 확인해 주세요.',
    section: '구간',
    buy: '매수',
    sectionPartialProfit: '중간익절',
    sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
    sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
    sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
    sharesUnit: '주',
  },
  en: {
    alarmTimes: 'Alarm times',
    noOrder: "Please check today's orders in the app.",
    section: 'Section',
    buy: 'Buy',
    sectionPartialProfit: 'Partial profit',
    sectionWatchRsiNotMet: 'Watch (RSI not met)',
    sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
    sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
    sharesUnit: 'shares',
  },
};

export function getMaExecutionMessages(lang: Lang): MaExecutionMessageMap {
  const messages = MA_EXECUTION_MESSAGES[lang] ?? MA_EXECUTION_MESSAGES.ko;
  return {
    strategyName: getStrategyName(lang, 'ma_interval'),
    ...messages,
  };
}
