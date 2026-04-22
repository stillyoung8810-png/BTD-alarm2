import type { AppLang } from '@/types';

export type DashboardStrategyKind =
  | 'vr_band'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'ma_interval';

export interface DashboardMessageSet {
  portfolioTitle: string;
  portfolioSubtitle: string;
  createLabel: string;
  systemError: string;
  emptyPortfolio: string;
  valuationLabel: string;
  realizedProfitLabel: string;
  realizedProfitAfterFees: string;
  paidTickerNoticeTitle: string;
  paidTickerLockedTooltip: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
  cycleHeaderTitle: string;
  openAlarmSettingsAria: string;
  openDetailsAria: (portfolioName: string) => string;
  openExecutionAria: (portfolioName: string) => string;
  terminate: string;
  closeStrategyRequiresNoSharesToast: string;
  strategyName: Record<DashboardStrategyKind, string>;
  execution: {
    calculating: string;
    noHoldings: string;
    insufficientAmount: string;
    checkingSection: string;
    sharesUnit: string;
    section: string;
    buy: string;
    sectionWatchBothNotMet: string;
    sectionWatchAlignmentNotMet: string;
    sectionWatchRsiNotMet: string;
    sectionPartialProfit: string;
    strategyPreparing: string;
    multiSplitProgressBarAriaLabel: string;
    noStopProgressBarAriaLabel: string;
  };
}

export const DASHBOARD_MESSAGES: Record<AppLang, DashboardMessageSet> = {
  ko: {
    portfolioTitle: '포트폴리오 관리',
    portfolioSubtitle:
      '일별 종가를 바탕으로 체계적인 중/장기 분할 매수 관리 시스템입니다.',
    createLabel: '새 포트폴리오',
    systemError: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    emptyPortfolio: '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.',
    valuationLabel: '평가금액',
    realizedProfitLabel: '실현손익',
    realizedProfitAfterFees: '(제비용 반영)',
    paidTickerNoticeTitle: 'PRO/PREMIUM 전용',
    paidTickerLockedTooltip: 'PRO/PREMIUM 전용 종목입니다.',
    aiTradeRecognitionAria: 'AI 매매 인식',
    quickInputAria: '퀵 입력',
    cycleHeaderTitle: '현재 리밸런싱 사이클 기간',
    openAlarmSettingsAria: '알람 설정 열기',
    openDetailsAria: (portfolioName: string) =>
      `${portfolioName} 상세 보기 열기`,
    openExecutionAria: (portfolioName: string) =>
      `${portfolioName} 일별 매매 실행 열기`,
    terminate: '전략 종료하기',
    closeStrategyRequiresNoSharesToast:
      '보유 주식을 모두 매도해야 종료가 가능해요.',
    strategyName: {
      vr_band: '타겟 밸류 채널',
      multi_split: '스마트 스플릿',
      no_stop_multi_split: '다분할 매매법(무손절)',
      ma_interval: '이평선 구간매수',
    },
    execution: {
      calculating: '계산 중...',
      noHoldings: '보유 없음',
      insufficientAmount:
        '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
      checkingSection: '구간 확인 중…',
      sharesUnit: '주',
      section: '구간',
      buy: '매수',
      sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
      sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
      sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
      sectionPartialProfit: '중간익절',
      strategyPreparing: '전략 준비 중',
      multiSplitProgressBarAriaLabel: '스마트 스플릿 현금 사용률',
      noStopProgressBarAriaLabel: '무손절 전략 진행률',
    },
  },
  en: {
    portfolioTitle: 'Portfolio Management',
    portfolioSubtitle:
      'Systematic asset accumulation through quantitative dip-buying strategies.',
    createLabel: 'New Portfolio',
    systemError: 'A temporary error occurred. Please try again later.',
    emptyPortfolio: 'No portfolios. Please add a portfolio.',
    valuationLabel: 'Valuation',
    realizedProfitLabel: 'Realized P/L',
    realizedProfitAfterFees: '(After fees)',
    paidTickerNoticeTitle: 'PRO/PREMIUM Only',
    paidTickerLockedTooltip: 'This ticker is PRO/PREMIUM only.',
    aiTradeRecognitionAria: 'AI Trade Recognition',
    quickInputAria: 'Quick input',
    cycleHeaderTitle: 'Current rebalancing cycle',
    openAlarmSettingsAria: 'Open alarm settings',
    openDetailsAria: (portfolioName: string) =>
      `Open details for ${portfolioName}`,
    openExecutionAria: (portfolioName: string) =>
      `Open daily execution for ${portfolioName}`,
    terminate: 'TERMINATE STRATEGY',
    closeStrategyRequiresNoSharesToast:
      'You need to sell all held shares before closing the strategy.',
    strategyName: {
      vr_band: 'Target Value Channel',
      multi_split: 'Smart Split',
      no_stop_multi_split: 'No-Stop Multi-Split',
      ma_interval: 'MA Interval Buying',
    },
    execution: {
      calculating: 'Calculating...',
      noHoldings: 'No holdings',
      insufficientAmount:
        'Notice: 1st buy amount is too low to place orders. Please check your settings.',
      checkingSection: 'Checking section…',
      sharesUnit: 'shares',
      section: 'Section',
      buy: 'Buy',
      sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
      sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
      sectionWatchRsiNotMet: 'Watch (RSI not met)',
      sectionPartialProfit: 'Partial profit',
      strategyPreparing: 'Strategy preparing',
      multiSplitProgressBarAriaLabel: 'Smart Split cash usage',
      noStopProgressBarAriaLabel: 'No-stop strategy progress',
    },
  },
};

const DASHBOARD_MESSAGE_CACHE = new Map<AppLang, DashboardMessageSet>();

export function getDashboardMessages(lang: AppLang): DashboardMessageSet {
  const cached = DASHBOARD_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = DASHBOARD_MESSAGES[lang];
  DASHBOARD_MESSAGE_CACHE.set(lang, messages);
  return messages;
}