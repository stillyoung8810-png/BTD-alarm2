import type { AppLang } from '@/types';

export interface TradeMessageSet {
  title: {
    tradeExecution: string;
    quickInput: string;
  };
  action: {
    buy: string;
    sell: string;
    save: string;
    cancel: string;
    close: string;
  };
  field: {
    stock: string;
    buyDate: string;
    sellDate: string;
    executionPrice: string;
    quantity: string;
    autoQuantity: string;
    estimatedFee: string;
    finalFee: string;
    totalSettlement: string;
  };
  helper: {
    chooseStockFirst: string;
    invalidPrice: string;
    invalidQuantity: string;
    noHoldings: string;
    sellQuantityExceedsHoldings: (
      availableQuantityText: string,
      requestedQuantityText: string,
    ) => string;
    zeroQuantityBudgetLocked: string;
    confirmBeforeSave: string;
    activeSectionAutoSelect: string;
    holdingsSellOnly: string;
    feeRateApplied: (feeRatePercent: number) => string;
    latestTradeDateSummary: (formattedDate: string) => string;
    budgetExceededTitle: string;
    budgetExceededDetail: (budgetText: string, settlementText: string) => string;
    mocSellTitle: string;
    mocSellDescription: string;
    manualFeeOverrideHint: string;
    executingTrade: string;
    strategyGuideTitle: string;
  };
  aria: {
    closeModal: string;
    closeBackdrop: string;
    openCalendar: string;
    previousMonth: string;
    nextMonth: string;
  };
  calendar: {
    weekdays: string[];
  };
}

export const TRADE_MESSAGES: Record<AppLang, TradeMessageSet> = {
  ko: {
    title: {
      tradeExecution: '상세 매매 실행 기록',
      quickInput: '빠른 매매 입력',
    },
    action: {
      buy: '매수',
      sell: '매도',
      save: '저장하기',
      cancel: '취소',
      close: '닫기',
    },
    field: {
      stock: '종목',
      buyDate: '매수일',
      sellDate: '매도일',
      executionPrice: '체결 단가',
      quantity: '수량',
      autoQuantity: '자동 계산 수량',
      estimatedFee: '예상 수수료',
      finalFee: '최종 반영 수수료',
      totalSettlement: '최종 정산 금액',
    },
    helper: {
      chooseStockFirst: '먼저 종목을 선택해주세요.',
      invalidPrice: '체결 단가는 0보다 커야 합니다.',
      invalidQuantity: '수량은 0보다 커야 합니다.',
      noHoldings: '매도 가능한 보유 종목이 없습니다.',
      sellQuantityExceedsHoldings: (
        availableQuantityText,
        requestedQuantityText,
      ) =>
        `현재 보유 ${availableQuantityText}주를 초과한 ${requestedQuantityText}주 매도는 저장할 수 없습니다.`,
      zeroQuantityBudgetLocked:
        '현재 예산과 수수료율 기준으로 계산된 매수 수량이 0주입니다. 체결 단가를 낮추거나 수량을 직접 입력할 수 있는 모드로 전환해주세요.',
      confirmBeforeSave: '체결 내용을 확인한 뒤 저장해주세요.',
      activeSectionAutoSelect: '현재 활성 구간 종목을 자동 선택합니다.',
      holdingsSellOnly: '매도는 실제 보유 수량 범위 안에서만 진행합니다.',
      feeRateApplied: (feeRatePercent) => `수수료율 ${feeRatePercent}% 적용`,
      latestTradeDateSummary: (formattedDate) =>
        `${formattedDate} 기준 매매 내역 입력입니다.`,
      budgetExceededTitle: '예산 초과 경고',
      budgetExceededDetail: (budgetText, settlementText) =>
        `예상 정산 금액 ${settlementText} 이(가) 일일 예산 ${budgetText} 을 초과합니다. 저장은 막지 않지만, 사용자가 확인하고 진행해야 합니다.`,
      mocSellTitle: 'MOC 매도',
      mocSellDescription:
        '장 마감 종가 기준으로 매도 체결을 기록합니다.',
      manualFeeOverrideHint:
        '직접 수수료를 입력하면 자동 계산값 대신 그 값을 저장합니다.',
      executingTrade: '체결 저장 중...',
      strategyGuideTitle: '전략 실행 가이드',
    },
    aria: {
      closeModal: '매매 입력 모달 닫기',
      closeBackdrop: '매매 입력 모달 배경 닫기',
      openCalendar: '달력 열기',
      previousMonth: '이전 달',
      nextMonth: '다음 달',
    },
    calendar: {
      weekdays: ['일', '월', '화', '수', '목', '금', '토'],
    },
  },
  en: {
    title: {
      tradeExecution: 'Trade Execution Record',
      quickInput: 'Quick Input',
    },
    action: {
      buy: 'Buy',
      sell: 'Sell',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
    },
    field: {
      stock: 'Ticker',
      buyDate: 'Buy Date',
      sellDate: 'Sell Date',
      executionPrice: 'Execution Price',
      quantity: 'Quantity',
      autoQuantity: 'Calculated Quantity',
      estimatedFee: 'Estimated Fee',
      finalFee: 'Final Fee',
      totalSettlement: 'Total Settlement',
    },
    helper: {
      chooseStockFirst: 'Select a ticker first.',
      invalidPrice: 'Execution price must be greater than zero.',
      invalidQuantity: 'Quantity must be greater than zero.',
      noHoldings: 'There are no holdings available to sell.',
      sellQuantityExceedsHoldings: (
        availableQuantityText,
        requestedQuantityText,
      ) =>
        `You cannot save a sell quantity of ${requestedQuantityText} shares because only ${availableQuantityText} shares are currently held.`,
      zeroQuantityBudgetLocked:
        'The calculated buy quantity is 0 shares for the current budget and fee rate. Lower the execution price or switch to a mode with manual quantity input.',
      confirmBeforeSave: 'Review the execution details before saving.',
      activeSectionAutoSelect:
        'The active section ticker is selected automatically.',
      holdingsSellOnly:
        'Sell orders are constrained to actual current holdings only.',
      feeRateApplied: (feeRatePercent) =>
        `${feeRatePercent}% fee rate applied`,
      latestTradeDateSummary: (formattedDate) =>
        `Entering trade data for ${formattedDate}.`,
      budgetExceededTitle: 'Budget Warning',
      budgetExceededDetail: (budgetText, settlementText) =>
        `Estimated settlement ${settlementText} exceeds the daily budget ${budgetText}. Saving remains non-blocking, but the user must acknowledge the risk.`,
      mocSellTitle: 'MOC Sell',
      mocSellDescription:
        'Records the sell execution at the market close price.',
      manualFeeOverrideHint:
        'If you enter a manual fee, it overrides the calculated fee.',
      executingTrade: 'Saving trade...',
      strategyGuideTitle: 'Strategy Execution Guide',
    },
    aria: {
      closeModal: 'Close trade modal',
      closeBackdrop: 'Close trade modal backdrop',
      openCalendar: 'Open calendar',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
    },
    calendar: {
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
  },
};

const TRADE_MESSAGE_CACHE = new Map<AppLang, TradeMessageSet>();

export function getTradeMessages(lang: AppLang): TradeMessageSet {
  const cached = TRADE_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = TRADE_MESSAGES[lang];
  TRADE_MESSAGE_CACHE.set(lang, messages);
  return messages;
}