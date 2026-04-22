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
    referenceStockHelper: string;
    shortPeriod: string;
    longPeriod: string;
    rsiEnabled: string;
    rsiEnabledHelper: string;
    alignmentEnabled: string;
    alignmentEnabledHelper: string;
    section1Title: string;
    section1Helper: string;
    section2Title: string;
    section2Helper: string;
    section3Title: string;
    section3Helper: string;
    sectionStock: string;
    rsiThreshold: string;
    takePartialProfit: string;
    partialProfitTargetPct: string;
  };
  multiSplit: {
    targetStock: string;
    targetReturnRate: string;
    intermediateReturnRate: string;
    totalSplitCount: string;
    baseLocRatio: string;
    mainTakeProfitRatioPct: string;
    intermediateTakeProfitRatioPct: string;
    riskCutRatioPct: string;
    riskCutRatioPctHelper: string;
    outOfRangeToast: string;
    rsiConditionLabel: string;
    rsiConditionHelper: string;
    alignmentConditionLabel: string;
    alignmentConditionHelper: string;
    criterionGroupLabel: string;
    budgetGroupLabel: string;
    rsiCriteria: {
      rsi30: string;
      rsi40: string;
      rsi50: string;
    };
    alignmentCriteria: {
      ma5_20: string;
      ma20_60: string;
      ma60_120: string;
    };
    budgetPresets: {
      loc70: string;
      balanced: string;
      moc70: string;
    };
    leveragedRecommended: string;
  };
  noStopMultiSplit: {
    targetStock: string;
    baseLocRatio: string;
    takeProfitPct: string;
    totalSplitCount: string;
    rsiConditionLabel: string;
    rsiConditionHelper: string;
    alignmentConditionLabel: string;
    alignmentConditionHelper: string;
    criterionGroupLabel: string;
    budgetGroupLabel: string;
    rsiCriteria: {
      rsi30: string;
      rsi40: string;
      rsi50: string;
    };
    alignmentCriteria: {
      ma5_20: string;
      ma20_60: string;
      ma60_120: string;
    };
    budgetPresets: {
      loc70: string;
      balanced: string;
      moc70: string;
    };
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
      multiSplitConfig: '스마트 스플릿 설정',
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
        title: '스마트 스플릿',
        description:
          '현금 사용률과 조건부 LOC/MOC 프리셋을 기반으로 매매 가이드를 구성합니다.',
      },
      no_stop_multi_split: {
        title: '무손절 다분할',
        description: '기본 LOC 비율과 조건별 프리셋 규칙을 설정합니다.',
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
      referenceStockHelper: '매매 구간(1~3)을 결정하는 기준이 되는 종목이에요.',
      shortPeriod: '단기 이평 기간',
      longPeriod: '장기 이평 기간',
      rsiEnabled: 'RSI 조건 사용',
      rsiEnabledHelper: '선택한 종목의 RSI가 설정값 아래일 때만 진입해요.',
      alignmentEnabled: '정배열 조건 사용',
      alignmentEnabledHelper:
        '단기 이평선이 장기 이평선 위에 있는 상승 추세에서만 진입해요.',
      section1Title: '구간 1',
      section1Helper: '현재가가 두 이평선보다 모두 높은 구간이에요.',
      section2Title: '구간 2',
      section2Helper: '현재가가 단기·장기 이평선 사이에 있는 구간이에요.',
      section3Title: '구간 3',
      section3Helper: '현재가가 두 이평선보다 모두 낮은 구간이에요.',
      sectionStock: '매수 종목',
      rsiThreshold: 'RSI 기준값',
      takePartialProfit: '중간 이익 실현',
      partialProfitTargetPct: '목표 수익률 (%)',
    },
    multiSplit: {
      targetStock: '대상 종목',
      targetReturnRate: '목표 수익률 (A %)',
      intermediateReturnRate: '중간 익절 수익률 (B %)',
      totalSplitCount: '총 분할 횟수 (a회)',
      baseLocRatio: '평단가 매수 비율 (LOC 주문) (%)',
      mainTakeProfitRatioPct: '메인 익절 비중 (%)',
      intermediateTakeProfitRatioPct: '중간 익절 비중 (자동 계산)',
      riskCutRatioPct: '리스크 컷 비중 (%)',
      riskCutRatioPctHelper: '현금 소진시, 손절할 보유 물량 비율',
      outOfRangeToast: '설정 범위를 벗어 났어요.',
      rsiConditionLabel: 'RSI 조건',
      rsiConditionHelper:
        'RSI 조건이 충족되면 저장된 프리셋으로 LOC/MOC 비율을 덮어씁니다.',
      alignmentConditionLabel: '정배열 조건',
      alignmentConditionHelper:
        '선택한 이평 조합이 정배열일 때만 조건부 예산 프리셋을 적용합니다.',
      criterionGroupLabel: '판정 기준',
      budgetGroupLabel: '예산 프리셋',
      rsiCriteria: {
        rsi30: '공격적 (RSI < 30)',
        rsi40: '보통 (RSI < 40)',
        rsi50: '방어적 (RSI < 50)',
      },
      alignmentCriteria: {
        ma5_20: '5/20 이평',
        ma20_60: '20/60 이평',
        ma60_120: '60/120 이평',
      },
      budgetPresets: {
        loc70: '방어 위주 (LOC 70%)',
        balanced: '균형 (LOC 50%)',
        moc70: '추격 위주 (MOC 70%)',
      },
      leveragedRecommended: '레버리지 ETF 권장',
    },
    noStopMultiSplit: {
      targetStock: '대상 종목',
      baseLocRatio: '평단가 매수 비율 (LOC 주문) (%)',
      takeProfitPct: '익절 목표 수익률 (%)',
      totalSplitCount: '총 분할 횟수',
      rsiConditionLabel: 'RSI 조건',
      rsiConditionHelper: 'RSI 조건이 충족되면 선택한 프리셋 비율로 LOC/MOC 비중을 조정해요.',
      alignmentConditionLabel: '정배열 조건',
      alignmentConditionHelper:
        '선택한 이평 조합이 정배열일 때만 조건부 예산 프리셋을 적용해요.',
      criterionGroupLabel: '판정 기준',
      budgetGroupLabel: '예산 프리셋',
      rsiCriteria: {
        rsi30: '공격적 (RSI < 30)',
        rsi40: '보통 (RSI < 40)',
        rsi50: '방어적 (RSI < 50)',
      },
      alignmentCriteria: {
        ma5_20: '5/20 이평',
        ma20_60: '20/60 이평',
        ma60_120: '60/120 이평',
      },
      budgetPresets: {
        loc70: '방어 위주 (LOC 70%)',
        balanced: '균형 (LOC 50%)',
        moc70: '추격 위주 (MOC 70%)',
      },
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
      multiSplitConfig: 'Smart Split Settings',
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
        title: 'Smart Split',
        description:
          'Build execution guidance from cash usage and conditional LOC/MOC presets.',
      },
      no_stop_multi_split: {
        title: 'No-Stop Multi-Split',
        description: 'Configure the base LOC ratio and conditional preset rules.',
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
      referenceStockHelper:
        'This asset determines which trading zone (1-3) is active.',
      shortPeriod: 'Short MA Period',
      longPeriod: 'Long MA Period',
      rsiEnabled: 'Use RSI',
      rsiEnabledHelper:
        "Enter only when the selected stock's RSI is below the threshold.",
      alignmentEnabled: 'Use Alignment Condition',
      alignmentEnabledHelper:
        'Enter only during an uptrend when the short-term MA stays above the long-term MA.',
      section1Title: 'Section 1',
      section1Helper:
        'This zone is active when the current price is above both moving averages.',
      section2Title: 'Section 2',
      section2Helper:
        'This zone is active when the current price sits between the short-term and long-term moving averages.',
      section3Title: 'Section 3',
      section3Helper:
        'This zone is active when the current price is below both moving averages.',
      sectionStock: 'Buy Stock',
      rsiThreshold: 'RSI Threshold',
      takePartialProfit: 'Take Partial Profit',
      partialProfitTargetPct: 'Target Profit (%)',
    },
    multiSplit: {
      targetStock: 'Target Stock',
      targetReturnRate: 'Target Return Rate (A %)',
      intermediateReturnRate: 'Intermediate Take-Profit Return (B %)',
      totalSplitCount: 'Total Split Count (a)',
      baseLocRatio: 'Average Price Buy Ratio (LOC Order) (%)',
      mainTakeProfitRatioPct: 'Main Take-Profit Ratio (%)',
      intermediateTakeProfitRatioPct:
        'Intermediate Take-Profit Ratio (Derived)',
      riskCutRatioPct: 'Risk Cut Ratio (%)',
      riskCutRatioPctHelper: 'Ratio of holdings to cut when cash is exhausted.',
      outOfRangeToast: 'The value is outside the allowed range.',
      rsiConditionLabel: 'RSI Condition',
      rsiConditionHelper:
        'When the RSI condition is met, override the LOC/MOC ratio with the saved preset.',
      alignmentConditionLabel: 'Alignment Condition',
      alignmentConditionHelper:
        'Apply the conditional budget preset only when the selected MA pair is aligned.',
      criterionGroupLabel: 'Criterion Preset',
      budgetGroupLabel: 'Budget Preset',
      rsiCriteria: {
        rsi30: 'Aggressive (RSI < 30)',
        rsi40: 'Moderate (RSI < 40)',
        rsi50: 'Defensive (RSI < 50)',
      },
      alignmentCriteria: {
        ma5_20: 'MA 5/20',
        ma20_60: 'MA 20/60',
        ma60_120: 'MA 60/120',
      },
      budgetPresets: {
        loc70: 'Defense Bias (LOC 70%)',
        balanced: 'Balanced (LOC 50%)',
        moc70: 'Chasing Bias (MOC 70%)',
      },
      leveragedRecommended: 'Leveraged ETF Recommended',
    },
    noStopMultiSplit: {
      targetStock: 'Target Stock',
      baseLocRatio: 'Average Price LOC Ratio (%)',
      takeProfitPct: 'Take Profit (%)',
      totalSplitCount: 'Total Split Count',
      rsiConditionLabel: 'RSI Condition',
      rsiConditionHelper:
        'When the RSI condition is met, apply the selected LOC/MOC preset ratio.',
      alignmentConditionLabel: 'Alignment Condition',
      alignmentConditionHelper:
        'Apply the conditional budget preset only when the selected MA pair is aligned.',
      criterionGroupLabel: 'Criterion Preset',
      budgetGroupLabel: 'Budget Preset',
      rsiCriteria: {
        rsi30: 'Aggressive (RSI < 30)',
        rsi40: 'Moderate (RSI < 40)',
        rsi50: 'Defensive (RSI < 50)',
      },
      alignmentCriteria: {
        ma5_20: 'MA 5/20',
        ma20_60: 'MA 20/60',
        ma60_120: 'MA 60/120',
      },
      budgetPresets: {
        loc70: 'Defense Bias (LOC 70%)',
        balanced: 'Balanced (LOC 50%)',
        moc70: 'Chasing Bias (MOC 70%)',
      },
    },
    meta: {
      portfolioName: 'Portfolio Name',
      dailyBuyAmount: 'Buy Amount Per Order ($)',
      startDate: 'Start Date',
      feeRatePercent: 'Fee Rate (%)',
    },
  },
};

export function getStrategyCreatorMessages(
  lang: AppLang,
): StrategyCreatorMessageSet {
  return STRATEGY_CREATOR_MESSAGES[lang];
}