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
  strategyName: Record<DashboardStrategyKind, string>;
  execution: {
    calculating: string;
    noHoldings: string;
    insufficientAmount: string;
    checkingSection: string;
    mocSellLabel: string;
    sharesUnit: string;
    startQuarterStopLoss: string;
    firstBuyAmountLabel: string;
    avgPriceTimesPointNineMinusOffset: string;
    avgPriceTimesPointNine: string;
    locBuy1: string;
    locBuy2: string;
    locSell: string;
    limitSell: string;
    section: string;
    buy: string;
    sectionWatchBothNotMet: string;
    sectionWatchAlignmentNotMet: string;
    sectionWatchRsiNotMet: string;
    sectionPartialProfit: string;
    strategyPreparing: string;
    noStopSplitComplete: string;
    noStopTakeProfitTarget: string;
    lowLoc: string;
    highLoc: string;
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
    strategyName: {
      vr_band: '타겟 밸류 채널',
      multi_split: '다분할 매매법',
      no_stop_multi_split: '다분할 매매법(무손절)',
      ma_interval: '이평선 구간매수',
    },
    execution: {
      calculating: '계산 중...',
      noHoldings: '보유 없음',
      insufficientAmount:
        '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
      checkingSection: '구간 확인 중…',
      mocSellLabel: 'MOC 매도',
      sharesUnit: '주',
      startQuarterStopLoss: 'MOC 매도 하여 쿼터 손절 모드 시작하세요',
      firstBuyAmountLabel: '1회 매수금',
      avgPriceTimesPointNineMinusOffset: '현재 평균 단가 × 0.9 - 0.01',
      avgPriceTimesPointNine: '현재 평균 단가 × 0.9',
      locBuy1: 'LOC 매수1',
      locBuy2: 'LOC 매수2',
      locSell: 'LOC 매도',
      limitSell: '지정가 매도',
      section: '구간',
      buy: '매수',
      sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
      sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
      sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
      sectionPartialProfit: '중간익절',
      strategyPreparing: '전략 준비 중',
      noStopSplitComplete:
        '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유(존버)와 익절만 수행합니다.',
      noStopTakeProfitTarget: '익절 목표',
      lowLoc: '저가 LOC',
      highLoc: '고가 LOC',
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
    strategyName: {
      vr_band: 'Target Value Channel',
      multi_split: 'Multi-Split Trading',
      no_stop_multi_split: 'No-Stop Multi-Split',
      ma_interval: 'MA Interval Buying',
    },
    execution: {
      calculating: 'Calculating...',
      noHoldings: 'No holdings',
      insufficientAmount:
        'Notice: 1st buy amount is too low to place orders. Please check your settings.',
      checkingSection: 'Checking section…',
      mocSellLabel: 'MOC Sell',
      sharesUnit: 'shares',
      startQuarterStopLoss:
        'Start quarter stop-loss mode by executing MOC sell',
      firstBuyAmountLabel: '1st Buy Amount',
      avgPriceTimesPointNineMinusOffset: 'Avg Price × 0.9 - 0.01',
      avgPriceTimesPointNine: 'Avg Price × 0.9',
      locBuy1: 'LOC Buy 1',
      locBuy2: 'LOC Buy 2',
      locSell: 'LOC Sell',
      limitSell: 'Limit Sell',
      section: 'Section',
      buy: 'Buy',
      sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
      sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
      sectionWatchRsiNotMet: 'Watch (RSI not met)',
      sectionPartialProfit: 'Partial profit',
      strategyPreparing: 'Strategy preparing',
      noStopSplitComplete:
        'All split buys are complete. Hold and wait for take profit without additional buys.',
      noStopTakeProfitTarget: 'Take-profit target',
      lowLoc: 'Low LOC',
      highLoc: 'High LOC',
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