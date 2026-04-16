# PHASE C MA Microcopy Plan

## 1. Objective
이 Phase의 목표는 Moving Average (MA) Strategy Setup UI에서 **금융 비전문 사용자도 각 입력값의 의미를 즉시 이해할 수 있도록** helper microcopy를 추가하는 것입니다. 핵심은 수학 로직을 바꾸는 것이 아니라, 이미 존재하는 MA 구간 판정과 진입 조건을 **plain-language 설명**으로 풀어 주어 진입 장벽을 낮추는 데 있습니다.

이번 개선은 다음 원칙을 지켜야 합니다.

- **Rule 3 / Strict I18N**: Korean/English UI 문구는 JSX에 직접 쓰지 않고 SSOT dictionary에서만 읽습니다.
- **SRP / 최소 변경**: MA 계산 로직(`determineActiveSection`, backtest, validation)은 건드리지 않고, `strategyCreatorMessages.ts` + `StrategyCreator.tsx` + `MaWizardStepViews.tsx` + `types/ui.ts`까지만 좁게 수정합니다.
- **Visual Hierarchy**: helper text는 Toss-style의 낮은 시각 강조도로 라벨 바로 아래에 붙여서, 기존 primary label을 방해하지 않도록 합니다.
- **OCP / 재사용성**: 반복되는 helper markup은 작은 local helper component로 정리해 중복 JSX를 만들지 않습니다.

SSOT 위치는 **`constants/messages/strategyCreatorMessages.ts`**로 고정하는 것이 가장 유지보수에 유리합니다. 이유는 현재 MA setup step의 label/title copy가 이미 이 파일 하나에 모여 있어, 신규 helper text까지 같은 파일에 넣는 편이 **추적성**, **번역 일관성**, **리뷰 비용** 측면에서 가장 단순하기 때문입니다.

## 2. I18N SSOT Definition
모든 신규 microcopy는 `constants/messages/strategyCreatorMessages.ts`의 `ma` namespace에 추가합니다. 이렇게 하면 MA setup label과 helper가 한 객체에 묶여, 향후 copy audit 시에도 한 곳만 보면 됩니다.

아래는 **완전한 파일 스니펫**입니다.

```ts
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

export function getStrategyCreatorMessages(
  lang: AppLang,
): StrategyCreatorMessageSet {
  return STRATEGY_CREATOR_MESSAGES[lang];
}
```

## 3. Component Architecture & UI Snippets
이번 변경은 **UI 설명 계층만 추가**하고, MA 구간 계산식 자체는 그대로 둡니다. 즉, `max(maA, maB)` / `min(maA, maB)` 수식은 여전히 계산 로직에만 존재하고, Setup UI에서는 사람이 이해하기 쉬운 설명으로만 노출합니다.

변경 범위는 아래 3개 레이어로 제한합니다.

- `components/strategyCreator/types/ui.ts`: 새 helper prop 계약 추가
- `components/strategyCreator/StrategyCreator.tsx`: SSOT dictionary key를 view prop으로 연결
- `components/strategyCreator/steps/MaWizardStepViews.tsx`: helper text 실제 렌더링

### 3.1 Supporting Prop Contract
`MaBaseStepViewProps`와 `MaSectionsStepViewProps`에 필요한 helper prop만 추가합니다. Controller state, validation, wizard navigation은 변경하지 않습니다.

```ts
export interface MaBaseStepViewProps {
  stockOptions: readonly StrategyStockOption[];
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  referenceStockLabel: string;
  referenceStockHelper: string;
  shortPeriodLabel: string;
  longPeriodLabel: string;
  rsiEnabledLabel: string;
  rsiEnabledHelper: string;
  alignmentEnabledLabel: string;
  alignmentEnabledHelper: string;
  ma0Stock: string;
  maShortPeriod: number;
  maLongPeriod: number;
  isRsiEnabled: boolean;
  isAlignmentEnabled: boolean;
  onMa0StockChange: (value: string) => void;
  onMaShortPeriodChange: (value: string) => void;
  onMaLongPeriodChange: (value: string) => void;
  onRsiEnabledChange: (value: boolean) => void;
  onAlignmentEnabledChange: (value: boolean) => void;
}

export interface MaSectionsStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  section1Title: string;
  section1Helper: string;
  section2Title: string;
  section2Helper: string;
  section3Title: string;
  section3Helper: string;
  sectionStockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptionsForMa1: readonly StrategyStockOption[];
  stockOptionsForMa2: readonly StrategyStockOption[];
  stockOptionsForMa3: readonly StrategyStockOption[];
  ma1Stock: string;
  ma2Stock: string;
  ma3Stock: string;
  ma1RsiThreshold: number;
  ma2RsiThreshold: number;
  ma3RsiThreshold: number;
  isRsiEnabled: boolean;
  isMa1TakePartialProfit: boolean;
  isMa2TakePartialProfit: boolean;
  isMa3TakePartialProfit: boolean;
  ma1PartialProfitTargetPct: number;
  ma2PartialProfitTargetPct: number;
  ma3PartialProfitTargetPct: number;
  onMa1StockChange: (value: string) => void;
  onMa2StockChange: (value: string) => void;
  onMa3StockChange: (value: string) => void;
  onMa1RsiThresholdChange: (value: string) => void;
  onMa2RsiThresholdChange: (value: string) => void;
  onMa3RsiThresholdChange: (value: string) => void;
  onMa1TakePartialProfitChange: (value: boolean) => void;
  onMa2TakePartialProfitChange: (value: boolean) => void;
  onMa3TakePartialProfitChange: (value: boolean) => void;
  onMa1PartialProfitTargetPctChange: (value: string) => void;
  onMa2PartialProfitTargetPctChange: (value: string) => void;
  onMa3PartialProfitTargetPctChange: (value: string) => void;
}
```

### 3.2 Dictionary Key Consumption in `StrategyCreator.tsx`
dictionary consumption은 현재 구조를 그대로 유지하고, `controller.copy.ma.*`를 view props로만 전달합니다. 즉, i18n lookup은 container 단계에서 끝내고 dumb view는 string prop만 렌더링합니다.

```tsx
case 'ma_base':
  return (
    <MaBaseStepView
      stockOptions={controller.stockOptions}
      stockPickerHeader={controller.copy.stockPickerHeader}
      dropdownInfoModalLabels={{
        badgeLabel: controller.noticeLabel,
        closeAriaLabel: controller.closeLabel,
        confirmLabel: controller.acknowledgeLabel,
        title: controller.noticeLabel,
        defaultMessage: controller.copy.lockedTickerTooltip,
      }}
      referenceStockLabel={controller.copy.ma.referenceStock}
      referenceStockHelper={controller.copy.ma.referenceStockHelper}
      shortPeriodLabel={controller.copy.ma.shortPeriod}
      longPeriodLabel={controller.copy.ma.longPeriod}
      rsiEnabledLabel={controller.copy.ma.rsiEnabled}
      rsiEnabledHelper={controller.copy.ma.rsiEnabledHelper}
      alignmentEnabledLabel={controller.copy.ma.alignmentEnabled}
      alignmentEnabledHelper={controller.copy.ma.alignmentEnabledHelper}
      ma0Stock={controller.ma0Stock}
      maShortPeriod={controller.maShortPeriod}
      maLongPeriod={controller.maLongPeriod}
      isRsiEnabled={controller.isRsiEnabled}
      isAlignmentEnabled={controller.isAlignmentEnabled}
      onMa0StockChange={controller.handleMa0StockChange}
      onMaShortPeriodChange={controller.handleMaShortPeriodChange}
      onMaLongPeriodChange={controller.handleMaLongPeriodChange}
      onRsiEnabledChange={controller.handleRsiEnabledChange}
      onAlignmentEnabledChange={controller.handleAlignmentEnabledChange}
    />
  );

case 'ma_sections':
  return (
    <MaSectionsStepView
      stockPickerHeader={controller.copy.stockPickerHeader}
      dropdownInfoModalLabels={{
        badgeLabel: controller.noticeLabel,
        closeAriaLabel: controller.closeLabel,
        confirmLabel: controller.acknowledgeLabel,
        title: controller.noticeLabel,
        defaultMessage: controller.copy.lockedTickerTooltip,
      }}
      section1Title={controller.copy.ma.section1Title}
      section1Helper={controller.copy.ma.section1Helper}
      section2Title={controller.copy.ma.section2Title}
      section2Helper={controller.copy.ma.section2Helper}
      section3Title={controller.copy.ma.section3Title}
      section3Helper={controller.copy.ma.section3Helper}
      sectionStockLabel={controller.copy.ma.sectionStock}
      rsiThresholdLabel={controller.copy.ma.rsiThreshold}
      takePartialProfitLabel={controller.copy.ma.takePartialProfit}
      partialProfitTargetLabel={controller.copy.ma.partialProfitTargetPct}
      stockOptionsForMa1={controller.stockOptionsForMa1}
      stockOptionsForMa2={controller.stockOptionsForMa2}
      stockOptionsForMa3={controller.stockOptionsForMa3}
      ma1Stock={controller.ma1Stock}
      ma2Stock={controller.ma2Stock}
      ma3Stock={controller.ma3Stock}
      ma1RsiThreshold={controller.ma1RsiThreshold}
      ma2RsiThreshold={controller.ma2RsiThreshold}
      ma3RsiThreshold={controller.ma3RsiThreshold}
      isRsiEnabled={controller.isRsiEnabled}
      isMa1TakePartialProfit={controller.isMa1TakePartialProfit}
      isMa2TakePartialProfit={controller.isMa2TakePartialProfit}
      isMa3TakePartialProfit={controller.isMa3TakePartialProfit}
      ma1PartialProfitTargetPct={controller.ma1PartialProfitTargetPct}
      ma2PartialProfitTargetPct={controller.ma2PartialProfitTargetPct}
      ma3PartialProfitTargetPct={controller.ma3PartialProfitTargetPct}
      onMa1StockChange={controller.handleMa1StockChange}
      onMa2StockChange={controller.handleMa2StockChange}
      onMa3StockChange={controller.handleMa3StockChange}
      onMa1RsiThresholdChange={controller.handleMa1RsiThresholdChange}
      onMa2RsiThresholdChange={controller.handleMa2RsiThresholdChange}
      onMa3RsiThresholdChange={controller.handleMa3RsiThresholdChange}
      onMa1TakePartialProfitChange={
        controller.handleMa1TakePartialProfitChange
      }
      onMa2TakePartialProfitChange={
        controller.handleMa2TakePartialProfitChange
      }
      onMa3TakePartialProfitChange={
        controller.handleMa3TakePartialProfitChange
      }
      onMa1PartialProfitTargetPctChange={
        controller.handleMa1PartialProfitTargetPctChange
      }
      onMa2PartialProfitTargetPctChange={
        controller.handleMa2PartialProfitTargetPctChange
      }
      onMa3PartialProfitTargetPctChange={
        controller.handleMa3PartialProfitTargetPctChange
      }
    />
  );
```

### 3.3 UI Rendering in `MaWizardStepViews.tsx`
아래 스니펫은 helper text를 라벨 바로 아래에 넣는 실제 렌더링 코드입니다. 핵심 포인트는 다음과 같습니다.

- helper text styling을 한 constant로 모아 중복 className을 막습니다.
- `FieldHeader`로 label/helper 조합을 공통화하되, **실제 form control과 연결되는 경우에만 `<label htmlFor>`를 사용**합니다.
- 반복 렌더링되는 `SectionCard`는 `sectionId`(`ma1`, `ma2`, `ma3`)를 받아 내부 input ID prefix를 고정해, 다중 구간에서도 label orphan이 생기지 않도록 합니다.
- `ToggleField`는 사용자 요청 범위를 넘지 않도록 기존 상호작용 구조를 유지하고, helper text만 추가합니다.
- `SectionCard`는 구간 제목 아래에 자연어 설명을 붙여 formula-like 표현을 UI에서 제거합니다.

```tsx
import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MaBaseStepViewProps,
  MaSectionsStepViewProps,
} from '../types/ui';

const MICROCOPY_TEXT_CLASS_NAME =
  'mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400';

function FieldHeader({
  id,
  label,
  helperText,
}: {
  id?: string;
  label: string;
  helperText?: string;
}): React.ReactElement {
  const helperId = id ? `${id}-helper` : undefined;

  return (
    <div>
      {id ? (
        <label htmlFor={id} className={STRATEGY_CREATOR_STYLES.fieldLabel}>
          {label}
        </label>
      ) : (
        <span className={STRATEGY_CREATOR_STYLES.fieldLabel}>{label}</span>
      )}
      {helperText ? (
        <p id={helperId} className={MICROCOPY_TEXT_CLASS_NAME}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function ToggleField({
  label,
  helperText,
  isChecked,
  onChange,
}: {
  label: string;
  helperText?: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <div className="pr-4">
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {label}
        </span>
        {helperText ? (
          <p className={MICROCOPY_TEXT_CLASS_NAME}>{helperText}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!isChecked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${
          isChecked ? 'bg-blue-500' : 'bg-slate-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            isChecked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PartialProfitField(props: {
  idPrefix: string;
  label: string;
  targetLabel: string;
  isEnabled: boolean;
  targetValue: number;
  onEnabledChange: (value: boolean) => void;
  onTargetValueChange: (value: string) => void;
}): React.ReactElement {
  const inputId = `${props.idPrefix}-partial-profit-target`;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleField
        label={props.label}
        isChecked={props.isEnabled}
        onChange={props.onEnabledChange}
      />
      {props.isEnabled && (
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader id={inputId} label={props.targetLabel} />
          <input
            id={inputId}
            type="number"
            value={props.targetValue}
            onChange={(event) => props.onTargetValueChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      )}
    </div>
  );
}

function SectionCard(props: {
  sectionId: string;
  title: string;
  titleHelper: string;
  stockPickerHeader: string;
  dropdownInfoModalLabels: MaSectionsStepViewProps['dropdownInfoModalLabels'];
  stockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptions: MaSectionsStepViewProps['stockOptionsForMa1'];
  stock: string;
  rsiThreshold: number;
  isRsiEnabled: boolean;
  isTakePartialProfit: boolean;
  partialProfitTargetPct: number;
  onStockChange: (value: string) => void;
  onRsiThresholdChange: (value: string) => void;
  onTakePartialProfitChange: (value: boolean) => void;
  onPartialProfitTargetPctChange: (value: string) => void;
}): React.ReactElement {
  const rsiInputId = `${props.sectionId}-rsi-threshold`;

  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            {props.title}
          </h3>
          <p className={MICROCOPY_TEXT_CLASS_NAME}>{props.titleHelper}</p>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader label={props.stockLabel} />
          <CustomDropdown
            value={props.stock}
            options={props.stockOptions}
            onChange={props.onStockChange}
            header={props.stockPickerHeader}
            infoModalBadgeLabel={props.dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={props.dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={props.dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={props.dropdownInfoModalLabels.title}
            infoModalDefaultMessage={props.dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        {props.isRsiEnabled && (
          <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
            <FieldHeader id={rsiInputId} label={props.rsiThresholdLabel} />
            <input
              id={rsiInputId}
              type="number"
              value={props.rsiThreshold}
              onChange={(event) => props.onRsiThresholdChange(event.target.value)}
              className={STRATEGY_CREATOR_STYLES.textInput}
            />
          </div>
        )}

        <PartialProfitField
          idPrefix={props.sectionId}
          label={props.takePartialProfitLabel}
          targetLabel={props.partialProfitTargetLabel}
          isEnabled={props.isTakePartialProfit}
          targetValue={props.partialProfitTargetPct}
          onEnabledChange={props.onTakePartialProfitChange}
          onTargetValueChange={props.onPartialProfitTargetPctChange}
        />
      </div>
    </div>
  );
}

export function MaBaseStepView({
  stockOptions,
  stockPickerHeader,
  dropdownInfoModalLabels,
  referenceStockLabel,
  referenceStockHelper,
  shortPeriodLabel,
  longPeriodLabel,
  rsiEnabledLabel,
  rsiEnabledHelper,
  alignmentEnabledLabel,
  alignmentEnabledHelper,
  ma0Stock,
  maShortPeriod,
  maLongPeriod,
  isRsiEnabled,
  isAlignmentEnabled,
  onMa0StockChange,
  onMaShortPeriodChange,
  onMaLongPeriodChange,
  onRsiEnabledChange,
  onAlignmentEnabledChange,
}: MaBaseStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader
            label={referenceStockLabel}
            helperText={referenceStockHelper}
          />
          <CustomDropdown
            value={ma0Stock}
            options={stockOptions}
            onChange={onMa0StockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader id="ma-short-period" label={shortPeriodLabel} />
          <input
            id="ma-short-period"
            type="number"
            value={maShortPeriod}
            onChange={(event) => onMaShortPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader id="ma-long-period" label={longPeriodLabel} />
          <input
            id="ma-long-period"
            type="number"
            value={maLongPeriod}
            onChange={(event) => onMaLongPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ToggleField
          label={rsiEnabledLabel}
          helperText={rsiEnabledHelper}
          isChecked={isRsiEnabled}
          onChange={onRsiEnabledChange}
        />
        <ToggleField
          label={alignmentEnabledLabel}
          helperText={alignmentEnabledHelper}
          isChecked={isAlignmentEnabled}
          onChange={onAlignmentEnabledChange}
        />
      </div>
    </div>
  );
}

export function MaSectionsStepView(
  props: MaSectionsStepViewProps,
): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionCard
        sectionId="ma1"
        title={props.section1Title}
        titleHelper={props.section1Helper}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa1}
        stock={props.ma1Stock}
        rsiThreshold={props.ma1RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa1TakePartialProfit}
        partialProfitTargetPct={props.ma1PartialProfitTargetPct}
        onStockChange={props.onMa1StockChange}
        onRsiThresholdChange={props.onMa1RsiThresholdChange}
        onTakePartialProfitChange={props.onMa1TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa1PartialProfitTargetPctChange}
      />
      <SectionCard
        sectionId="ma2"
        title={props.section2Title}
        titleHelper={props.section2Helper}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa2}
        stock={props.ma2Stock}
        rsiThreshold={props.ma2RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa2TakePartialProfit}
        partialProfitTargetPct={props.ma2PartialProfitTargetPct}
        onStockChange={props.onMa2StockChange}
        onRsiThresholdChange={props.onMa2RsiThresholdChange}
        onTakePartialProfitChange={props.onMa2TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa2PartialProfitTargetPctChange}
      />
      <SectionCard
        sectionId="ma3"
        title={props.section3Title}
        titleHelper={props.section3Helper}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa3}
        stock={props.ma3Stock}
        rsiThreshold={props.ma3RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa3TakePartialProfit}
        partialProfitTargetPct={props.ma3PartialProfitTargetPct}
        onStockChange={props.onMa3StockChange}
        onRsiThresholdChange={props.onMa3RsiThresholdChange}
        onTakePartialProfitChange={props.onMa3TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa3PartialProfitTargetPctChange}
      />
    </div>
  );
}
```

이 설계의 장점은 다음과 같습니다.

- helper text가 모두 `copy.ma.*`에서 오므로 JSX hardcoding이 없습니다.
- `FieldHeader` 한 곳에서 helper rendering을 공통화해 label/helper 조합의 중복을 제거합니다.
- MA 수식 설명을 UI에 직접 노출하지 않고도, 사용자는 구간 의미를 자연어로 바로 이해할 수 있습니다.
- 기존 step flow, validation, stock option filtering, duplicate-section rule은 그대로 유지됩니다.

## 4. Verification Checklist
- `StrategyCreator.tsx`, `MaWizardStepViews.tsx` JSX 안에 Korean/English raw string helper text가 직접 들어가지 않았는지 확인합니다.
- `constants/messages/strategyCreatorMessages.ts`의 `ma` namespace에 신규 6개 helper key가 **`ko`와 `en` 모두** 추가되었는지 확인합니다.
- `MaBaseStepViewProps`, `MaSectionsStepViewProps`가 신규 helper prop을 정확히 선언하고, `StrategyCreator.tsx`가 빠짐없이 전달하는지 확인합니다.
- helper text가 라벨 또는 섹션 제목 **바로 아래**에 렌더링되는지 확인합니다.
- helper text class가 `text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed` 또는 동등한 시각 계층을 유지하는지 확인합니다.
- `구간 1/2/3` 설명이 formula 표현(`max(maA, maB)`, `min(maA, maB)`) 대신 사용자 친화적 자연어로만 보이는지 확인합니다.
- `RSI 조건 사용`, `정배열 조건 사용` toggle의 layout이 light/dark mode, mobile width, desktop width에서 깨지지 않는지 확인합니다.
- `ma1-rsi-threshold`, `ma2-rsi-threshold`, `ma3-rsi-threshold` 및 각 `partial-profit-target`처럼 반복 구간 input에 고유 ID prefix가 적용되어 orphan label이 없는지 확인합니다.
- 기존 MA 계산 로직, validation, wizard navigation, duplicate-section stock 제한이 변경되지 않았는지 확인합니다.
- `strategyCreatorMessages.ts`, `types/ui.ts`, `StrategyCreator.tsx`, `MaWizardStepViews.tsx` 기준으로 TypeScript 오류가 0인지 확인합니다.
- final implementation 후 editor diagnostics 또는 repository standard type-check에서 신규 lint/type error가 없는지 확인합니다.
