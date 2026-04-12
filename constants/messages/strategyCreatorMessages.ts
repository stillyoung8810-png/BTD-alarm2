import type { AppLang } from '@/types';

export interface StrategyCreatorMessageSet {
  titles: {
    strategySelect: string;
    maBase: string;
    maSections: string;
    multiSplitConfig: string;
    noStopMultiSplitConfig: string;
    vrBandConfig: string;
    strategyMeta: string;
  };
  actions: {
    cancel: string;
    back: string;
    next: string;
    save: string;
    startStrategy: string;
  };
  strategySelection: {
    heading: string;
    description: string;
  };
  strategyDefinitions: {
    rsi_ma_interval: { title: string; description: string };
    multi_split: { title: string; description: string };
    no_stop_multi_split: { title: string; description: string };
    vr_band: { title: string; description: string };
  };
  tierLabels: {
    FREE: string;
    PRO: string;
    PREMIUM: string;
  };
  stockPickerHeader: string;
  lockedTickerTooltip: string;
  duplicateSectionStockTooltip: string;
  portfolioLimitReached: (maxPortfolios: number) => string;
  duplicateSectionStocks: string;
  ma: {
    referenceStock: string;
    shortPeriod: string;
    longPeriod: string;
    rsiEnabled: string;
    alignmentEnabled: string;
    section1Title: string;
    section2Title: string;
    section3Title: string;
    sectionStock: string;
    rsiThreshold: string;
    takePartialProfit: string;
    partialProfitTargetPct: string;
  };
  multiSplit: {
    targetStock: string;
    targetReturnRate: string;
    totalSplitCount: string;
    leveragedRecommended: string;
  };
  noStopMultiSplit: {
    targetStock: string;
    lowLocBudgetRatio: string;
    highLocPremiumPct: string;
    takeProfitPct: string;
    totalSplitCount: string;
  };
  meta: {
    portfolioName: string;
    dailyBuyAmount: string;
    startDate: string;
    feeRatePercent: string;
  };
}

export const STRATEGY_CREATOR_MESSAGES: Record<AppLang, StrategyCreatorMessageSet> = {
  ko: {
    titles: {
      strategySelect: '전략 엔진 선택',
      maBase: '이평선 기본 설정',
      maSections: '구간별 진입 설정',
      multiSplitConfig: '다분할 매매법 설정',
      noStopMultiSplitConfig: '무손절 다분할 설정',
      vrBandConfig: 'VR 밴드 설정',
      strategyMeta: '포트폴리오 메타 정보',
    },
    actions: {
      cancel: '취소',
      back: '이전',
      next: '다음',
      save: '저장',
      startStrategy: '전략 시작',
    },
    strategySelection: {
      heading: '전략 엔진 선택',
      description: '사용할 전략을 선택하세요.',
    },
    strategyDefinitions: {
      rsi_ma_interval: {
        title: '이평선 구간 전략',
        description: '구간별 종목과 RSI/부분익절 규칙을 설정합니다.',
      },
      multi_split: {
        title: '다분할 매매법',
        description: '목표 수익률과 총 분할 횟수로 자동 주문 구조를 만듭니다.',
      },
      no_stop_multi_split: {
        title: '무손절 다분할',
        description: 'LOC 예산 배분과 프리미엄 규칙을 사용합니다.',
      },
      vr_band: {
        title: '타겟 밸류 채널',
        description: 'V 채널과 Pool 사용률을 기반으로 자동 비중 조절을 합니다.',
      },
    },
    tierLabels: {
      FREE: 'FREE',
      PRO: 'PRO',
      PREMIUM: 'PREMIUM',
    },
    stockPickerHeader: '종목 선택',
    lockedTickerTooltip: 'PRO/PREMIUM 전용 종목입니다.',
    duplicateSectionStockTooltip: '다른 구간에서 이미 선택된 종목입니다.',
    portfolioLimitReached: (maxPortfolios) =>
      `포트폴리오 생성 한도(${maxPortfolios}개)에 도달했습니다.`,
    duplicateSectionStocks: '구간 1, 2, 3에서 서로 다른 종목을 선택해 주세요.',
    ma: {
      referenceStock: '기준 종목',
      shortPeriod: '단기 이평 기간',
      longPeriod: '장기 이평 기간',
      rsiEnabled: 'RSI 조건 사용',
      alignmentEnabled: '정배열 조건 사용',
      section1Title: '구간 1',
      section2Title: '구간 2',
      section3Title: '구간 3',
      sectionStock: '매수 종목',
      rsiThreshold: 'RSI 기준값',
      takePartialProfit: '중간 이익 실현',
      partialProfitTargetPct: '목표 수익률 (%)',
    },
    multiSplit: {
      targetStock: '대상 종목',
      targetReturnRate: '목표 수익률 (A %)',
      totalSplitCount: '총 분할 횟수 (a회)',
      leveragedRecommended: '레버리지 ETF 권장',
    },
    noStopMultiSplit: {
      targetStock: '대상 종목',
      lowLocBudgetRatio: '저가 LOC 예산 비율 (%)',
      highLocPremiumPct: '고가 LOC 프리미엄 (%)',
      takeProfitPct: '익절 목표 수익률 (%)',
      totalSplitCount: '총 분할 횟수',
    },
    meta: {
      portfolioName: '포트폴리오 이름',
      dailyBuyAmount: '1회 매수 금액 ($)',
      startDate: '시작일',
      feeRatePercent: '수수료율 (%)',
    },
  },
  en: {
    titles: {
      strategySelect: 'Select Strategy Engine',
      maBase: 'Moving Average Base Settings',
      maSections: 'Section Entry Settings',
      multiSplitConfig: 'Multi-Split Settings',
      noStopMultiSplitConfig: 'No-Stop Multi-Split Settings',
      vrBandConfig: 'VR Band Settings',
      strategyMeta: 'Portfolio Meta Information',
    },
    actions: {
      cancel: 'Cancel',
      back: 'Back',
      next: 'Next',
      save: 'Save',
      startStrategy: 'Start Strategy',
    },
    strategySelection: {
      heading: 'Select Strategy Engine',
      description: 'Choose the strategy you want to use.',
    },
    strategyDefinitions: {
      rsi_ma_interval: {
        title: 'MA Interval Strategy',
        description: 'Configure section stocks, RSI, and partial profit rules.',
      },
      multi_split: {
        title: 'Multi-Split',
        description: 'Generate an order structure from target return and split count.',
      },
      no_stop_multi_split: {
        title: 'No-Stop Multi-Split',
        description: 'Use LOC budget ratio and premium rules.',
      },
      vr_band: {
        title: 'Target Value Channel',
        description: 'Automatically rebalance using channel and pool usage settings.',
      },
    },
    tierLabels: {
      FREE: 'FREE',
      PRO: 'PRO',
      PREMIUM: 'PREMIUM',
    },
    stockPickerHeader: 'Select Stock',
    lockedTickerTooltip: 'This ticker is PRO/PREMIUM only.',
    duplicateSectionStockTooltip: 'Already selected in another section.',
    portfolioLimitReached: (maxPortfolios) =>
      `Portfolio limit (${maxPortfolios}) reached.`,
    duplicateSectionStocks:
      'Please select different stocks for sections 1, 2, and 3.',
    ma: {
      referenceStock: 'Reference Stock',
      shortPeriod: 'Short MA Period',
      longPeriod: 'Long MA Period',
      rsiEnabled: 'Use RSI',
      alignmentEnabled: 'Use Alignment Condition',
      section1Title: 'Section 1',
      section2Title: 'Section 2',
      section3Title: 'Section 3',
      sectionStock: 'Buy Stock',
      rsiThreshold: 'RSI Threshold',
      takePartialProfit: 'Take Partial Profit',
      partialProfitTargetPct: 'Target Profit (%)',
    },
    multiSplit: {
      targetStock: 'Target Stock',
      targetReturnRate: 'Target Return Rate (A %)',
      totalSplitCount: 'Total Split Count (a)',
      leveragedRecommended: 'Leveraged ETF Recommended',
    },
    noStopMultiSplit: {
      targetStock: 'Target Stock',
      lowLocBudgetRatio: 'Low LOC Budget Ratio (%)',
      highLocPremiumPct: 'High LOC Premium (%)',
      takeProfitPct: 'Take Profit (%)',
      totalSplitCount: 'Total Split Count',
    },
    meta: {
      portfolioName: 'Portfolio Name',
      dailyBuyAmount: 'Buy Amount Per Order ($)',
      startDate: 'Start Date',
      feeRatePercent: 'Fee Rate (%)',
    },
  },
};

const STRATEGY_CREATOR_MESSAGE_CACHE = new Map<
  AppLang,
  StrategyCreatorMessageSet
>();

export function getStrategyCreatorMessages(
  lang: AppLang,
): StrategyCreatorMessageSet {
  const cached = STRATEGY_CREATOR_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = STRATEGY_CREATOR_MESSAGES[lang];
  STRATEGY_CREATOR_MESSAGE_CACHE.set(lang, messages);
  return messages;
}