import type { AppLang } from '../types';
import type {
  SummaryFormulaId,
  SummaryRowId,
} from './target_value_channel_summary_contract';

export interface TargetValueChannelAdjustmentModeLabels {
  none: string;
  deposit: string;
  withdraw: string;
}

export interface TargetValueChannelCreatorMessages {
  screenTitle: string;
  strategyTitle: string;
  strategyDescription: string;
  initialCapitalLabel: string;
  initialAllocationPctLabel: string;
  initialTargetValuePreviewLabel: string;
  initialAvailableCashPreviewLabel: string;
  baseGrowthRateLabel: string;
  smartBrakeThresholdLabel: string;
  bandUpperLabel: string;
  bandLowerLabel: string;
  feeRateLabel: string;
  adjustmentModeLabel: string;
  adjustmentModeOptions: TargetValueChannelAdjustmentModeLabels;
  adjustmentAmountLabel: string;
  adjustmentAmountDisabledHint: string;
  submitLabel: string;
}

export interface TargetValueChannelOrderModalMessages {
  title: string;
  tabs: {
    sell: string;
    buy: string;
  };
  columns: {
    step: string;
    price: string;
    qty: string;
    sharesAfter: string;
    cashAfter: string;
  };
  currentStateBadge: string;
  guideBadge: string;
  emptyOrder: string;
  closeModalAriaLabel: string;
  cycleFixedBadge: string;
}

export interface TargetValueChannelDashboardMessages {
  strategyName: string;
  openOrderTableButtonLabel: string;
  summaryRegionAriaLabel: string;
  currentTargetValueLabel: string;
  currentAvailableCashLabel: string;
  bandRangeLabel: string;
  pending: string;
  firstBuyPrompt: string;
  soldOutWaiting: string;
  maxBuyHint: (step: number) => string;
}

export interface TargetValueChannelDailyExecutionMessages {
  strategyLabel: string;
  currentTargetValueLabel: string;
  currentAvailableCashLabel: string;
  bandRangeLabel: string;
  noOrder: string;
  readyHint: string;
  adjustmentModeLabels: TargetValueChannelAdjustmentModeLabels;
  formatAdjustmentHeader: (mode: 'deposit' | 'withdraw') => string;
}

export interface TargetValueChannelSummaryCardMessages {
  title: string;
  helper: string;
  formulaLabel: string;
  rowLabels: Record<SummaryRowId, string>;
  rowDescriptions: Record<SummaryRowId, string>;
  formulas: Record<SummaryFormulaId, string>;
  initialTargetValueDerivedFrom: (
    capitalDisplay: string,
    allocationPct: number,
  ) => string;
}

export interface TargetValueChannelMessagesContract {
  creator: TargetValueChannelCreatorMessages;
  orderModal: TargetValueChannelOrderModalMessages;
  dashboard: TargetValueChannelDashboardMessages;
  dailyExecution: TargetValueChannelDailyExecutionMessages;
  summaryCard: TargetValueChannelSummaryCardMessages;
}

const TARGET_VALUE_CHANNEL_FORMULAS: Record<
  AppLang,
  Record<SummaryFormulaId, string>
> = {
  ko: {
    normalMode: 'T_next = T_current × (1 + (R_base × CR)) + Adjustment',
    safetyMode: 'T_next = T_current × (1 + (R_base × CR^2)) + Adjustment',
  },
  en: {
    normalMode: 'T_next = T_current × (1 + (R_base × CR)) + Adjustment',
    safetyMode: 'T_next = T_current × (1 + (R_base × CR^2)) + Adjustment',
  },
};

const TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS: Record<
  AppLang,
  TargetValueChannelAdjustmentModeLabels
> = {
  ko: {
    none: '없음',
    deposit: '입금',
    withdraw: '출금',
  },
  en: {
    none: 'None',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
  },
};

const TARGET_VALUE_CHANNEL_STRATEGY_NAME: Record<AppLang, string> = {
  ko: '타겟 밸류 채널',
  en: 'Target Value Channel',
};

const TARGET_VALUE_CHANNEL_CREATOR_SCREEN_TITLE: Record<AppLang, string> = {
  ko: '타겟 밸류 채널 설정',
  en: 'Target Value Channel Settings',
};

const TARGET_VALUE_CHANNEL_CREATOR_SUBMIT_LABEL: Record<AppLang, string> = {
  ko: '타겟 밸류 채널 전략 시작',
  en: 'Start Target Value Channel Strategy',
};

function formatTargetValueChannelAdjustmentHeader(
  lang: AppLang,
  mode: 'deposit' | 'withdraw',
): string {
  return `[${TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS[lang][mode]}]`;
}

const TARGET_VALUE_CHANNEL_ROW_LABELS: Record<
  AppLang,
  Record<SummaryRowId, string>
> = {
  ko: {
    initialTargetValue: '초기 목표 평가금 (T)',
    initialAvailableCash: '초기 가용 현금',
    baseGrowthRate: '기본 목표 상승률',
    smartBrakeThreshold: '스마트 브레이크 임계값',
    safetyMode: '안전모드',
    normalMode: '일반 구간',
  },
  en: {
    initialTargetValue: 'Initial Target Value (T)',
    initialAvailableCash: 'Initial Available Cash',
    baseGrowthRate: 'Base Growth Rate',
    smartBrakeThreshold: 'Smart Brake Threshold',
    safetyMode: 'Safety Mode',
    normalMode: 'Normal Zone',
  },
};

const TARGET_VALUE_CHANNEL_ROW_DESCRIPTIONS: Record<
  AppLang,
  Record<SummaryRowId, string>
> = {
  ko: {
    initialTargetValue: '첫 사이클 목표 평가금이에요.',
    initialAvailableCash: '첫 사이클 이후 밴드 하단 매수에 사용할 현금이에요.',
    baseGrowthRate:
      '매 사이클 목표 평가금의 기본 상승률이에요. 가용 현금에 따라 자동 보정돼요.',
    smartBrakeThreshold:
      '현금 비중이 이 값 이하로 내려가면 안전모드가 켜져요.',
    safetyMode:
      '현금이 줄어들수록 다음 목표 평가금 상승폭이 자동으로 완만해집니다.',
    normalMode:
      '가용 현금이 충분하면 다음 목표 평가금이 선형적으로 증가합니다.',
  },
  en: {
    initialTargetValue: 'This is the first cycle target value.',
    initialAvailableCash:
      'This cash is reserved for lower-band buys after the first cycle seed.',
    baseGrowthRate:
      'This is the default target-value growth rate for each cycle and it is adjusted by available cash.',
    smartBrakeThreshold:
      'Safety mode turns on when the cash ratio is at or below this threshold.',
    safetyMode:
      'As cash decreases, the next target value grows more conservatively.',
    normalMode:
      'When available cash is sufficient, the next target value grows linearly.',
  },
};

export const TARGET_VALUE_CHANNEL_FATAL_FALLBACK: Record<AppLang, string> = {
  ko: '구성 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.',
  en: 'Configuration Load Error. Please try refreshing the page.',
};

export const TARGET_VALUE_CHANNEL_MESSAGES: Record<
  AppLang,
  TargetValueChannelMessagesContract
> = {
  ko: {
    creator: {
      screenTitle: TARGET_VALUE_CHANNEL_CREATOR_SCREEN_TITLE.ko,
      strategyTitle: TARGET_VALUE_CHANNEL_STRATEGY_NAME.ko,
      strategyDescription:
        '가용 현금 비중에 따라 다음 목표 평가금 상승폭이 자동 조절되는 전략이에요.',
      initialCapitalLabel: '총 투자 원금',
      initialAllocationPctLabel: '초기 투입 비중 (%)',
      initialTargetValuePreviewLabel: '초기 목표 평가금 (T)',
      initialAvailableCashPreviewLabel: '초기 가용 현금',
      baseGrowthRateLabel: '기본 목표 상승률 (%)',
      smartBrakeThresholdLabel: '스마트 브레이크 임계값 (%)',
      bandUpperLabel: '상단 밴드 폭 (%)',
      bandLowerLabel: '하단 밴드 폭 (%)',
      feeRateLabel: '수수료율 (%)',
      adjustmentModeLabel: 'Adjustment 모드',
      adjustmentModeOptions: TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS.ko,
      adjustmentAmountLabel: '입금/출금 금액',
      adjustmentAmountDisabledHint:
        'Adjustment 모드가 없음이면 금액 입력은 비활성화되고 0으로 저장돼요.',
      submitLabel: TARGET_VALUE_CHANNEL_CREATOR_SUBMIT_LABEL.ko,
    },
    orderModal: {
      title: '예약매수 표 / 예약매도 표',
      tabs: {
        sell: '예약매도 표',
        buy: '예약매수 표',
      },
      columns: {
        step: '단계',
        price: '가격 ($)',
        qty: '수량',
        sharesAfter: '보유량',
        cashAfter: 'Cash After',
      },
      currentStateBadge: '현재',
      guideBadge: '가이드',
      emptyOrder: '해당 탭에 예약 주문 내역이 없습니다.',
      closeModalAriaLabel: '모달 닫기',
      cycleFixedBadge: '이번 사이클 고정',
    },
    dashboard: {
      strategyName: TARGET_VALUE_CHANNEL_STRATEGY_NAME.ko,
      openOrderTableButtonLabel: '예약 주문 가격표 보기',
      summaryRegionAriaLabel: '타겟 밸류 채널 요약',
      currentTargetValueLabel: '현재 목표 평가금 (T)',
      currentAvailableCashLabel: '현재 가용 현금',
      bandRangeLabel: '상단/하단 밴드',
      pending:
        '아직 첫 매매를 진행하지 않았습니다. 설정된 목표 평가금에 맞춰 첫 매수를 진행해 주세요.',
      firstBuyPrompt: '설정된 목표 평가금에 맞춰 첫 매수를 진행해 주세요.',
      soldOutWaiting: '전량 매도 상태, 다음 진입 시점 대기.',
      maxBuyHint: (step) => `예약 매수는 표의 ${step}번까지 주문하세요`,
    },
    dailyExecution: {
      strategyLabel: TARGET_VALUE_CHANNEL_STRATEGY_NAME.ko,
      currentTargetValueLabel: '현재 목표 평가금 (T)',
      currentAvailableCashLabel: '현재 가용 현금',
      bandRangeLabel: '상단/하단 밴드',
      noOrder: '대기 중인 주문 없음',
      readyHint: '상단/하단 밴드와 예약 주문표를 참고해 매매하세요.',
      adjustmentModeLabels: TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS.ko,
      formatAdjustmentHeader: (mode) =>
        formatTargetValueChannelAdjustmentHeader('ko', mode),
    },
    summaryCard: {
      title: '타겟 밸류 채널 요약',
      helper:
        '입력값은 정수 상태 그대로 유지하고, 계산 엔진 안에서만 소수로 변환합니다.',
      formulaLabel: '수식',
      rowLabels: TARGET_VALUE_CHANNEL_ROW_LABELS.ko,
      rowDescriptions: TARGET_VALUE_CHANNEL_ROW_DESCRIPTIONS.ko,
      formulas: TARGET_VALUE_CHANNEL_FORMULAS.ko,
      initialTargetValueDerivedFrom: (capitalDisplay, allocationPct) =>
        `첫 사이클 목표 평가금이에요. 총 투자 원금 ${capitalDisplay}와 초기 투입 비중 ${allocationPct}%로 계산한 값이에요.`,
    },
  },
  en: {
    creator: {
      screenTitle: TARGET_VALUE_CHANNEL_CREATOR_SCREEN_TITLE.en,
      strategyTitle: TARGET_VALUE_CHANNEL_STRATEGY_NAME.en,
      strategyDescription:
        'This strategy automatically adjusts the next target-value growth by the available-cash ratio.',
      initialCapitalLabel: 'Total Capital',
      initialAllocationPctLabel: 'Initial Allocation (%)',
      initialTargetValuePreviewLabel: 'Initial Target Value (T)',
      initialAvailableCashPreviewLabel: 'Initial Available Cash',
      baseGrowthRateLabel: 'Base Growth Rate (%)',
      smartBrakeThresholdLabel: 'Smart Brake Threshold (%)',
      bandUpperLabel: 'Upper Band Width (%)',
      bandLowerLabel: 'Lower Band Width (%)',
      feeRateLabel: 'Fee Rate (%)',
      adjustmentModeLabel: 'Adjustment Mode',
      adjustmentModeOptions: TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS.en,
      adjustmentAmountLabel: 'Deposit/Withdraw Amount',
      adjustmentAmountDisabledHint:
        'When adjustment mode is none, the amount input is disabled and persisted as 0.',
      submitLabel: TARGET_VALUE_CHANNEL_CREATOR_SUBMIT_LABEL.en,
    },
    orderModal: {
      title: 'Reservation Buy/Sell Table',
      tabs: {
        sell: 'Reservation Sell Table',
        buy: 'Reservation Buy Table',
      },
      columns: {
        step: 'Step',
        price: 'Price ($)',
        qty: 'Qty',
        sharesAfter: 'Shares After',
        cashAfter: 'Cash After',
      },
      currentStateBadge: 'Current',
      guideBadge: 'Guide',
      emptyOrder: 'No reservation orders in this tab.',
      closeModalAriaLabel: 'Close modal',
      cycleFixedBadge: 'Fixed for this cycle',
    },
    dashboard: {
      strategyName: TARGET_VALUE_CHANNEL_STRATEGY_NAME.en,
      openOrderTableButtonLabel: 'View Reservation Order Table',
      summaryRegionAriaLabel: 'Target Value Channel Summary',
      currentTargetValueLabel: 'Current Target Value (T)',
      currentAvailableCashLabel: 'Current Available Cash',
      bandRangeLabel: 'Band Range',
      pending:
        'No trades have been executed yet. Please place your first buy according to the configured target value.',
      firstBuyPrompt:
        'Please place your first buy according to the configured target value.',
      soldOutWaiting: 'Completely sold out, waiting for the next entry.',
      maxBuyHint: (step) => `Place reserve buy orders up to row ${step}.`,
    },
    dailyExecution: {
      strategyLabel: TARGET_VALUE_CHANNEL_STRATEGY_NAME.en,
      currentTargetValueLabel: 'Current Target Value (T)',
      currentAvailableCashLabel: 'Current Available Cash',
      bandRangeLabel: 'Band Range',
      noOrder: 'No pending orders',
      readyHint: 'Follow the band range and reservation order tables.',
      adjustmentModeLabels: TARGET_VALUE_CHANNEL_ADJUSTMENT_MODE_LABELS.en,
      formatAdjustmentHeader: (mode) =>
        formatTargetValueChannelAdjustmentHeader('en', mode),
    },
    summaryCard: {
      title: 'Target Value Channel Summary',
      helper:
        'UI and DB keep integer inputs as-is. Only the pure engine converts them to decimals.',
      formulaLabel: 'Formula',
      rowLabels: TARGET_VALUE_CHANNEL_ROW_LABELS.en,
      rowDescriptions: TARGET_VALUE_CHANNEL_ROW_DESCRIPTIONS.en,
      formulas: TARGET_VALUE_CHANNEL_FORMULAS.en,
      initialTargetValueDerivedFrom: (capitalDisplay, allocationPct) =>
        `This is the first cycle target value. It is derived from total capital ${capitalDisplay} and initial allocation ${allocationPct}%.`,
    },
  },
};

export interface TargetValueChannelStrategyCreatorLegacyMessageProjection {
  titles: {
    vrBandConfig: string;
  };
  strategyDefinitions: {
    vr_band: {
      title: string;
      description: string;
    };
  };
}

export interface TargetValueChannelDashboardLegacyMessageProjection {
  strategyName: {
    vr_band: string;
  };
}

// Keep legacy internal keys stable while moving all visible TVC copy to one owner.
export function buildTargetValueChannelStrategyCreatorLegacyMessageProjection(
  lang: AppLang,
): TargetValueChannelStrategyCreatorLegacyMessageProjection {
  const messages = TARGET_VALUE_CHANNEL_MESSAGES[lang];

  return {
    titles: {
      vrBandConfig: messages.creator.screenTitle,
    },
    strategyDefinitions: {
      vr_band: {
        title: messages.creator.strategyTitle,
        description: messages.creator.strategyDescription,
      },
    },
  };
}

export function buildTargetValueChannelDashboardLegacyMessageProjection(
  lang: AppLang,
): TargetValueChannelDashboardLegacyMessageProjection {
  return {
    strategyName: {
      vr_band: TARGET_VALUE_CHANNEL_MESSAGES[lang].dashboard.strategyName,
    },
  };
}
