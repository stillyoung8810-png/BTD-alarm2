import type { AppLang } from '@/types';

export interface PortfolioDetailsMessageSet {
  settledBadge: string;
  holdingsSummaryTitle: string;
  noHoldings: string;
  avgPrice: string;
  totalValuation: string;
  weekdayCalendarTitle: string;
  weekdayHeaders: readonly string[];
  selectedDateTradesTitle: string;
  noTrades: string;
  finalSettlementSellPrefix: string;
  settlementAmount: string;
  buyLabel: string;
  sellLabel: string;
  tradeExecutionSuffix: string;
  executionPrice: string;
  quantity: string;
  fee: string;
  closeAction: string;
  monthTitle: (year: number, month: number) => string;
  deleteTradeDialog: {
    title: string;
    body: string;
    confirm: string;
  };
  aria: {
    closeModal: string;
    closeBackdrop: string;
    previousMonth: string;
    nextMonth: string;
    selectDate: (date: string) => string;
    openTradeDeleteDialog: (ticker: string, date: string) => string;
  };
}

export const PORTFOLIO_DETAILS_MESSAGES: Record<
  AppLang,
  PortfolioDetailsMessageSet
> = {
  ko: {
    settledBadge: '정산 완료',
    holdingsSummaryTitle: '보유 자산 요약',
    noHoldings: '보유 자산이 없습니다.',
    avgPrice: '평균 단가',
    totalValuation: '총 평가금액',
    weekdayCalendarTitle: '평일 거래 달력',
    weekdayHeaders: ['월', '화', '수', '목', '금'],
    selectedDateTradesTitle: '선택한 날짜 거래 내역',
    noTrades: '거래 내역이 없습니다.',
    finalSettlementSellPrefix: '최종 정산 매도',
    settlementAmount: '정산금',
    buyLabel: '매수',
    sellLabel: '매도',
    tradeExecutionSuffix: '매매',
    executionPrice: '체결 단가',
    quantity: '수량',
    fee: '수수료',
    closeAction: '닫기',
    monthTitle: (year: number, month: number) => `${year}년 ${month}월`,
    deleteTradeDialog: {
      title: '거래 기록 삭제',
      body: '이 거래 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      confirm: '삭제',
    },
    aria: {
      closeModal: '포트폴리오 상세 모달 닫기',
      closeBackdrop: '포트폴리오 상세 모달 배경 닫기',
      previousMonth: '이전 달 보기',
      nextMonth: '다음 달 보기',
      selectDate: (date: string) => `${date} 거래 내역 보기`,
      openTradeDeleteDialog: (ticker: string, date: string) =>
        `${date} ${ticker} 거래 기록 삭제 확인 열기`,
    },
  },
  en: {
    settledBadge: 'Settled',
    holdingsSummaryTitle: 'Holdings summary',
    noHoldings: 'No holdings available.',
    avgPrice: 'Avg price',
    totalValuation: 'Total valuation',
    weekdayCalendarTitle: 'Weekday calendar',
    weekdayHeaders: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    selectedDateTradesTitle: 'Selected date transactions',
    noTrades: 'No trade history.',
    finalSettlementSellPrefix: 'Final Settlement Sell',
    settlementAmount: 'Settlement',
    buyLabel: 'Buy',
    sellLabel: 'Sell',
    tradeExecutionSuffix: 'trade',
    executionPrice: 'Execution price',
    quantity: 'Quantity',
    fee: 'Fee',
    closeAction: 'Close',
    monthTitle: (year: number, month: number) => `${year}. ${month}`,
    deleteTradeDialog: {
      title: 'Delete trade record',
      body: 'Do you want to delete this trade record? This action cannot be undone.',
      confirm: 'Delete',
    },
    aria: {
      closeModal: 'Close portfolio details modal',
      closeBackdrop: 'Close portfolio details modal backdrop',
      previousMonth: 'Show previous month',
      nextMonth: 'Show next month',
      selectDate: (date: string) => `Show trades for ${date}`,
      openTradeDeleteDialog: (ticker: string, date: string) =>
        `Open delete confirmation for ${ticker} on ${date}`,
    },
  },
};

const PORTFOLIO_DETAILS_MESSAGE_CACHE = new Map<
  AppLang,
  PortfolioDetailsMessageSet
>();

export function getPortfolioDetailsMessages(
  lang: AppLang,
): PortfolioDetailsMessageSet {
  const cached = PORTFOLIO_DETAILS_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = PORTFOLIO_DETAILS_MESSAGES[lang];
  PORTFOLIO_DETAILS_MESSAGE_CACHE.set(lang, messages);
  return messages;
}