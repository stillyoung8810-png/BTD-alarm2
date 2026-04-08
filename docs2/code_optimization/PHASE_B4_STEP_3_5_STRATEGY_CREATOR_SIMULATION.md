# PHASE B4 Step 3.5 StrategyCreator 해체 및 공통 UI 타입/스타일 정돈 시뮬레이션

## 0. 문서 상태

- 이 문서는 **PHASE B4 Step 3.5(StrategyCreator 해체·공통 UI 타입/스타일 정돈)** 가 **이미 구현된** 레포를 기준으로, **구조·원칙·경로·공개 계약**을 고정하는 **기준서(SSOT 문서)** 입니다.
- **실행·컴파일 정본은 항상 앱 소스**(`components/strategyCreator/**`, `constants/messages/strategyCreatorMessages.ts` 등)이며, §4 스니펫은 가능한 한 소스와 동기화합니다. **§4.4 컨트롤러**는 분량·드리프트 방지를 위해 **발췌 + 파일 정본**을 병행합니다(§8).
- 적용 대상 규칙: **Rule 1(금융 수학 무결성)**, **Rule 2·10(가짜 최적화 금지 / primitive props·참조 안정성)**, **Rule 4(A11y)**, **Rule 6(복잡도 평탄화)**, **Rule 7(Strict TS)**, **Rule 11(더블 제출 방어)**.

---

## 1. 로컬 사실 점검

### 1.1 구현 후 실제 경로

- 공개 엔트리(shim): `components/StrategyCreator.tsx` → `components/strategyCreator/StrategyCreator.tsx`
- draft/빌더 SSOT: `src/components/StrategyCreator/utils.ts`
- 저장 검증기: `constants/domain/financeRules.ts`의 `validatePortfolioSetupInput(...)`
- 전략 생성기 전용 문구: `constants/messages/strategyCreatorMessages.ts`
- 공통 모달/버튼 문구(알림·닫기·확인 등): `constants/messages/commonMessages.ts` — `CustomDropdown` 정보 모달 라벨은 여기서 `notice` / `acknowledge` / `close` 등을 controller가 노출해 step view에 전달합니다.
- VR 폼: `components/strategies/VrBandStrategyForm.tsx`, `constants/vrMessages.ts`
- 상위 저장 계약: `App.tsx`의 `onSaveCreator`

### 1.2 해체 전 단일 파일에서 확인되던 문제(역사적 기록)

아래 항목은 **거대 단일 `StrategyCreator` 시절**의 관찰입니다. 현재 트리에서는 `components/strategyCreator/` 분리·메시지 모듈화·controller 락으로 **대부분 해소된 상태**입니다.

1. 단일 **2300+ 라인** 파일에 상태/검증/저장/뷰/푸터/전략별 폼 과밀.
2. `useState` 다수로 step 의도 분산.
3. 내부 `renderStep*` 중첩.
4. `lang === 'ko' ? ...` 인라인 문구 다건.
5. `Number(e.target.value)` 직파싱 다건.
6. 한도·중복 종목 등에 `alert(...)` 혼용.
7. 상위는 **raw `onSave`** 유지 — Step 3.5는 **`saveCommand` 없이** controller 내부 `isSavingRef`로 락.
8. `useTDSMenu()`가 `{ Menu: null }`에 가까우면 Toss/Web 이중 분기만 비용 증가 — **step 쪽은 `CustomDropdown` 단일 경로**로 정리됨.
9. UI 타입·Tailwind 문자열이 본문에 혼재 — **`types/ui.ts` + `styles.ts`** 로 이전 완료.

### 1.3 레포와 Step 3.5의 연결 제약(현재도 유효)

1. `App.tsx`는 현재 `StrategyCreator`에 아래 형태로 저장 콜백을 주입합니다.

```tsx
<StrategyCreator
  lang={lang}
  onClose={onClose}
  onSave={onSaveCreator}
  canAccessPaidStocks={canAccessPaidStocks}
  maxPortfolios={maxPortfolios}
  currentPortfolioCount={activePortfolioCount}
/>
```

2. Step 3.5는 **`saveCommand`로 상위 계약을 바꾸지 않습니다.**
3. 저장 락은 `useStrategyCreatorController` 내부 **`isSavingRef` + `isSaving`** 입니다.
4. `src/components/StrategyCreator/utils.ts`는 **draft + `safeNumber` + `buildPortfolioDraftFromWizardState(...)`** SSOT로 그대로 소비합니다.
5. 전역 `styles/` 신규 도입 없이 **`components/strategyCreator/styles.ts`** 에 Tailwind class SSOT를 둡니다.

### 1.4 생성·배치된 파일(구현 완료)

다음 파일은 레포에 존재하며, 본 문서 §3·§4와 대응합니다.

1. `constants/messages/strategyCreatorMessages.ts`
2. `components/strategyCreator/types/ui.ts`
3. `components/strategyCreator/styles.ts`
4. `components/strategyCreator/useStrategyCreatorController.tsx`
5. `components/strategyCreator/StrategyCreator.tsx`
6. `components/strategyCreator/StrategyCreatorLayout.tsx`
7. `components/strategyCreator/steps/StrategySelectionStepView.tsx`
8. `components/strategyCreator/steps/MaWizardStepViews.tsx`
9. `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`

### 1.5 유지·고정 사항

1. 공개 엔트리 경로는 **`components/StrategyCreator.tsx`** 그대로 유지합니다.
2. `App.tsx`의 **raw `onSave` 계약**은 유지합니다.
3. `src/components/StrategyCreator/utils.ts` 의 `safeNumber`, `safeTrim`, `buildPortfolioDraftFromWizardState`, `hasDuplicatedSectionStocks`를 **그대로 SSOT**로 사용합니다.
4. `components/strategies/VrBandStrategyForm.tsx`는 기존 분리 컴포넌트이므로 **재활용**합니다.
5. `XState`, `React Hook Form`, generic form factory, runtime schema library 등 **과잉 추상화는 도입하지 않습니다.**

---

## 2. 설계 고정 원칙

### 2.1 폴더 구조와 공개 계약

- `components/StrategyCreator.tsx`는 **얇은 shim** 이고, 실제 구현은 `components/strategyCreator/` 에 있습니다.
- 이렇게 하면 `App.tsx` import 경로를 건드리지 않으면서 거대 파일 해체가 가능합니다.
- draft/빌더는 기존 `src/components/StrategyCreator/utils.ts` 를 그대로 재사용합니다.

### 2.2 타입 정돈

- truly shared하지 않은 UI 타입을 루트 `types/`로 올리지 않습니다.
- Step 3.5에서는 **도메인 전용 타입 파일 `components/strategyCreator/types/ui.ts`** 를 둡니다.
- 이유:
  - 현재 레포의 root `types/`는 앱 전역 계약 위주입니다.
  - `StrategyCreatorLayoutProps`, `StrategyWizardScreen`, `StrategyDefinitionViewModel` 같은 타입을 전역으로 빼면 오히려 scope가 커집니다.
  - 즉, **공통 UI 찌꺼기 정리**는 하되 **전역 타입 오염은 하지 않는 것**이 Pragmatism에 맞습니다.

### 2.3 스타일 정돈

- 별도 CSS 파일을 만들지 않습니다.
- 현재 레포는 Tailwind class string 중심이므로, 반복되는 modal shell / step card / input / footer button 클래스는 **`components/strategyCreator/styles.ts`** 로 모읍니다.
- 이 단계에서 `styles/` 루트 폴더를 새로 만들지 않는 이유는, 저장소 전체가 아직 CSS module 체계가 아니기 때문입니다.

### 2.4 Rule 1: 금융/입력 경계

- 숫자 파싱은 반드시 **`safeNumber(...)`** 를 사용합니다.
- money/fee는 `roundMoney(...)` 또는 `buildPortfolioDraftFromWizardState(...)`가 정한 최종 정규화를 따릅니다.
- 퍼센트/금액/수량 입력은 step view에서 raw string을 바로 `Number(...)` 하지 않고, controller의 `handle...Change(value: string)` 가 `safeNumber`를 통해 정리합니다.
- 최종 저장 직전에는 아래 순서를 고정합니다.
  1. `buildPortfolioDraftFromWizardState(...)`
  2. `validatePortfolioSetupInput(...)`
  3. `hasDuplicatedSectionStocks(...)`
  4. `await Promise.resolve(onSave(draft.portfolio))`

### 2.5 Rule 11: 최종 저장 Mutex

- Step 3.5 최종 저장은 **반드시 controller 내부 `isSavingRef`** 로 잠급니다.
- 현재 `App.tsx`가 raw `onSave`만 주입하므로, 이 단계에서는 `useMutexAction` 대신 아래 구조를 기준으로 고정합니다.

```tsx
const isSavingRef = useRef(false);
const [isSaving, setIsSaving] = useState(false);

const handleSubmit = useCallback(async (): Promise<void> => {
  if (isSavingRef.current) {
    return;
  }

  try {
    isSavingRef.current = true;
    setIsSaving(true);
    await Promise.resolve(onSave(nextPortfolio));
    onClose();
  } catch (error: unknown) {
    setErrorMessage(commonCopy.saveFailed);
    console.error('[StrategyCreator] save failed:', error);
  } finally {
    isSavingRef.current = false;
    setIsSaving(false);
  }
}, [commonCopy.saveFailed, nextPortfolio, onClose, onSave]);
```

- `disabled={isSaving}` 는 UI 힌트이고, **물리 락은 `isSavingRef`** 입니다.

### 2.6 Rule 2·10: 화면 분해 기준

- `useMemo`는 아래에만 씁니다.
  - 주식 드롭다운 옵션 배열처럼 **참조 안정성 가치가 있는 파생 배열**
  - 전략 정의 카드 목록처럼 **하위 view에 그대로 내려보내는 배열**
- `screen`, `title`, `primaryActionLabel`, `canGoBack`, **`shouldShowLaoerCreditBanner`** 같은 O(1) 분기·소형 `.some()` 은 **즉시 평가**합니다(맹목적 `useMemo` 금지).
- step view에는 `wizardState` 통객체를 직접 넘기지 않고, **필요한 primitive 값 + stable callback** 만 개별 prop으로 넘깁니다.
- **`StrategyCreator`는 `controller.screen`에 해당하는 step만 렌더링**합니다. 보이지 않는 단계용 `maBaseProps={{ ... }}` 등 **거대 인라인 객체를 매 렌더마다 5개씩 만들어 미들웨어에 넘기지 않습니다**(GC churn·입력 지연 방지). `switch + never`는 부모(`StrategyCreator.tsx`)에서 직접 수행합니다.

### 2.7 Zero Over-engineering

- 상태 머신 도입 금지
- generic field registry 금지
- `Record<string, unknown>` 금지
- step 분기는 **`StrategyCreator` 본문의 `switch + never`** 로 닫고, 별도 `StrategyStepRenderer` 미들웨어 파일은 두지 않습니다. field 업데이트는 **실용적인 `useState` + `useCallback`** 조합을 유지합니다.

---

## 3. 타깃 파일 구조

```text
components/
  StrategyCreator.tsx
  strategyCreator/
    StrategyCreator.tsx
    StrategyCreatorLayout.tsx
    styles.ts
    useStrategyCreatorController.tsx
    types/
      ui.ts
    steps/
      StrategySelectionStepView.tsx
      MaWizardStepViews.tsx
      SingleStockStrategyStepViews.tsx

constants/
  messages/
    strategyCreatorMessages.ts

src/
  components/
    StrategyCreator/
      utils.ts   // 기존 구현 SSOT 유지
```

---

## 4. 1:1 구현 스니펫

### 4.1 `constants/messages/strategyCreatorMessages.ts`

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
      alignmentEnabled: '정배열 매수 사용',
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
      alignmentEnabled: 'Require Alignment',
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

export function getStrategyCreatorMessages(
  lang: AppLang,
): StrategyCreatorMessageSet {
  return STRATEGY_CREATOR_MESSAGES[lang];
}
```

### 4.2 `components/strategyCreator/types/ui.ts`

```ts
import type { ReactNode } from 'react';
import type {
  StrategyCreatorMetaDraftInput,
  StrategyType,
} from '@/src/components/StrategyCreator/utils';

export type StrategyWizardScreen =
  | 'strategy_select'
  | 'ma_base'
  | 'ma_sections'
  | 'multi_split_config'
  | 'no_stop_multi_split_config'
  | 'vr_band_config'
  | 'strategy_meta';

export type StrategyTier = 'FREE' | 'PRO' | 'PREMIUM';

export interface StrategyStockOption {
  value: string;
  label: string;
  disabled?: boolean;
  badge?: string;
  tooltip?: string;
}

export interface StrategyDefinitionViewModel {
  id: StrategyType;
  title: string;
  description: string;
  tier: StrategyTier;
  tierLabel: string;
  icon: ReactNode;
  gradientClassName: string;
  isLaoerOriginal?: boolean;
}

export interface StrategyCreatorLayoutProps {
  title: string;
  closeAriaLabel: string;
  cancelLabel: string;
  backLabel: string;
  primaryActionLabel: string;
  processingLabel: string;
  errorMessage: string | null;
  isSaving: boolean;
  isPrimaryDisabled: boolean;
  canGoBack: boolean;
  onClose: () => void;
  onBack: () => void;
  onPrimaryAction: () => void;
  children: ReactNode;
}

export interface DropdownInfoModalLabels {
  badgeLabel: string;
  closeAriaLabel: string;
  confirmLabel: string;
  title: string;
  defaultMessage: string;
}

export interface StrategySelectionStepViewProps {
  heading: string;
  description: string;
  definitions: readonly StrategyDefinitionViewModel[];
  selectedStrategy: StrategyType | null;
  onSelectStrategy: (strategy: StrategyType) => void;
}

export interface MaBaseStepViewProps {
  stockOptions: readonly StrategyStockOption[];
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  referenceStockLabel: string;
  shortPeriodLabel: string;
  longPeriodLabel: string;
  rsiEnabledLabel: string;
  alignmentEnabledLabel: string;
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
  section2Title: string;
  section3Title: string;
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

export interface MultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  targetReturnRateLabel: string;
  totalSplitCountLabel: string;
  highlightedHint: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onTargetReturnRateChange: (value: string) => void;
  onTotalSplitCountChange: (value: string) => void;
}

export interface NoStopMultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  lowLocBudgetRatioLabel: string;
  highLocPremiumPctLabel: string;
  takeProfitPctLabel: string;
  totalSplitCountLabel: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onLowLocBudgetRatioChange: (value: string) => void;
  onHighLocPremiumPctChange: (value: string) => void;
  onTakeProfitPctChange: (value: string) => void;
  onTotalSplitCountChange: (value: string) => void;
}

export interface StrategyMetaStepViewProps {
  metaLabels: {
    portfolioName: string;
    dailyBuyAmount: string;
    startDate: string;
    feeRatePercent: string;
  };
  meta: StrategyCreatorMetaDraftInput;
  isVrStrategy: boolean;
  onNameChange: (value: string) => void;
  onDailyBuyAmountChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onFeeRatePercentChange: (value: string) => void;
}
```

### 4.3 `components/strategyCreator/styles.ts`

```ts
export const STRATEGY_CREATOR_STYLES = {
  overlay:
    'fixed inset-0 z-[210] flex items-center justify-center p-4',
  backdrop:
    'absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md',
  panel:
    'relative flex h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]',
  header:
    'flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10',
  content:
    'flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 p-6 dark:bg-slate-950/70 md:p-8',
  footer:
    'flex gap-4 border-t border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80 md:p-8',
  sectionCard:
    'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70',
  fieldStack: 'space-y-3',
  fieldLabel:
    'text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400',
  textInput:
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 dark:bg-slate-900/80 dark:text-white',
  primaryButton:
    'flex-1 rounded-2xl bg-blue-600 px-6 py-5 text-xs font-black uppercase text-white shadow-[0_12px_40px_rgba(37,99,235,0.35)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50',
  secondaryButton:
    'rounded-2xl border border-slate-600/60 bg-slate-800 px-6 py-5 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-slate-700',
  errorBanner:
    'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600',
  helperText: 'text-[11px] font-medium text-slate-500 dark:text-slate-400',
} as const;
```

### 4.4 `components/strategyCreator/useStrategyCreatorController.tsx`

**구현 정본:** 레포의 `components/strategyCreator/useStrategyCreatorController.tsx`(전체 약 1,083줄)입니다. 문서 부피·라인 드리프트를 줄이기 위해 **전문 코드 펜스는 두지 않습니다.** 아래 **발췌**는 소스와 동일한 구간을 반영합니다. `buildStockOptions`, `getWizardScreen`, `handleSubmit`, `useMemo(stepHandlers)` 등 중간 본문은 파일을 열어 확인하십시오.

**아키텍트 리뷰 반영(참조 안정성·Rule 10):** `return { ... }` 안에 MA/VR 필드용 인라인 화살표 함수를 쌓아 두면 메타(이름 등) 입력마다 핸들러 참조가 전부 갱신되어 하위 step·모달이 불필요하게 리렌더될 수 있습니다. `updateMaSection` / `updateVrBand`는 **`setWizardState(previous => …)` 함수형 업데이트**로 `useCallback(..., [])` 고정하고, step 전용 핸들러 묶음은 **`useMemo`로 한 객체(`stepHandlers`)**에 두어 `...stepHandlers`로 전달합니다. **`buildInitialWizardState().maInterval!` 같은 non-null assertion은 Rule 7 위반이므로 사용하지 않고**, `EMPTY_*_DRAFT`로 병합 폴백합니다.

**Rule 2:** Laoer 배너 표시 여부(`shouldShowLaoerCreditBanner`)는 **맹목적 `useMemo` 없이** 즉시 계산합니다.

**공개 API 보강:** `getCommonMessages`의 `notice` / `acknowledge` / `close`를 각각 **`noticeLabel`**, **`acknowledgeLabel`**, **`closeLabel`**(및 기존 필드)로 노출해, 종목 `CustomDropdown`의 정보 모달에 `DropdownInfoModalLabels`를 조립할 때 재사용합니다.

```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Layers, Orbit, TrendingUp } from 'lucide-react';
import { ALL_STOCKS, PAID_STOCKS } from '@/constants';
import {
  STRATEGY_DEFAULTS,
  roundMoney,
  validatePortfolioSetupInput,
} from '@/constants/domain/financeRules';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import { getStrategyCreatorMessages } from '@/constants/messages/strategyCreatorMessages';
import {
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '@/constants/vrConstants';
import type { AppLang, Portfolio, VrBandStrategyParams } from '@/types';
import {
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
  safeNumber,
  safeTrim,
  type StrategyCreatorMetaDraftInput,
  type StrategyType,
  type StrategyWizardDraftInput,
} from '@/src/components/StrategyCreator/utils';
import type {
  StrategyDefinitionViewModel,
  StrategyStockOption,
  StrategyTier,
  StrategyWizardScreen,
} from './types/ui';

// ... 중략: buildInitialWizardState, EMPTY_*_DRAFT, clampNumber, 핸들러, stepHandlers, handleSubmit 등 — 소스 파일 전문 참조

function buildStrategyDefinitions(
  copy: ReturnType<typeof getStrategyCreatorMessages>,
): StrategyDefinitionViewModel[] {
  const createDefinition = (
    id: StrategyType,
    tier: StrategyTier,
    icon: JSX.Element,
    gradientClassName: string,
    isLaoerOriginal?: boolean,
  ): StrategyDefinitionViewModel => ({
    id,
    title: copy.strategyDefinitions[id].title,
    description: copy.strategyDefinitions[id].description,
    tier,
    tierLabel: copy.tierLabels[tier],
    icon,
    gradientClassName,
    isLaoerOriginal,
  });

  return [
    createDefinition(
      'rsi_ma_interval',
      'FREE',
      <TrendingUp size={24} />,
      'from-blue-500 to-violet-500',
    ),
    createDefinition(
      'multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-teal-500',
      true,
    ),
    createDefinition(
      'no_stop_multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-green-500',
      true,
    ),
    createDefinition(
      'vr_band',
      'FREE',
      <Orbit size={24} />,
      'from-indigo-500 to-sky-500',
      true,
    ),
  ];
}

// export function useStrategyCreatorController({ ... }) { ... } 본문은 소스 참조
// --- 발췌: 훅 본문 하단 `return { ... }` 전체 ---

  return {
    copy,
    noticeLabel: commonCopy.notice,
    acknowledgeLabel: commonCopy.acknowledge,
    closeLabel: commonCopy.close,
    processingLabel: commonCopy.processing,
    screen,
    title,
    primaryActionLabel,
    isSaving,
    errorMessage,
    selectedStrategy,
    shouldShowLaoerCreditBanner,
    handleBack,
    handleClose: onClose,
    handlePrimaryButtonClick,
    canGoBack: step > 0,
    isPrimaryDisabled: selectedStrategy == null || isSaving,
    strategyDefinitions,
    handleSelectStrategy,
    stockOptions: fullStockOptions,
    stockOptionsForMa1,
    stockOptionsForMa2,
    stockOptionsForMa3,
    meta: wizardState.meta ?? {},
    ma0Stock: safeTrim(maInterval?.ma0Stock),
    maShortPeriod: safeNumber(
      maInterval?.maAPeriod,
      STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
    ),
    maLongPeriod: safeNumber(
      maInterval?.maBPeriod,
      STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    ),
    isRsiEnabled: Boolean(maInterval?.rsiEnabled),
    isAlignmentEnabled: Boolean(maInterval?.alignmentEnabled),
    handleMa0StockChange,
    handleMaShortPeriodChange,
    handleMaLongPeriodChange,
    handleRsiEnabledChange,
    handleAlignmentEnabledChange,
    ma1Stock: safeTrim(ma1?.stock),
    ma2Stock: safeTrim(ma2?.stock),
    ma3Stock: safeTrim(ma3?.stock),
    ma1RsiThreshold: safeNumber(
      ma1?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma2RsiThreshold: safeNumber(
      ma2?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma3RsiThreshold: safeNumber(
      ma3?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    isMa1TakePartialProfit: Boolean(ma1?.takePartialProfit),
    isMa2TakePartialProfit: Boolean(ma2?.takePartialProfit),
    isMa3TakePartialProfit: Boolean(ma3?.takePartialProfit),
    ma1PartialProfitTargetPct: safeNumber(
      ma1?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma2PartialProfitTargetPct: safeNumber(
      ma2?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma3PartialProfitTargetPct: safeNumber(
      ma3?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ...stepHandlers,
    multiSplitTargetStock: safeTrim(wizardState.multiSplit?.targetStock),
    multiSplitTargetReturnRate: safeNumber(
      wizardState.multiSplit?.targetReturnRate,
      STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
    ),
    multiSplitTotalSplitCount: safeNumber(
      wizardState.multiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleMultiSplitTargetStockChange,
    handleTargetReturnRateChange,
    handleMultiSplitTotalCountChange,
    noStopTargetStock: safeTrim(wizardState.noStopMultiSplit?.targetStock),
    noStopLowLocBudgetRatio: safeNumber(
      wizardState.noStopMultiSplit?.lowLocBudgetRatio,
      50,
    ),
    noStopHighLocPremiumPct: safeNumber(
      wizardState.noStopMultiSplit?.highLocPremiumPct,
      15,
    ),
    noStopTakeProfitPct: safeNumber(
      wizardState.noStopMultiSplit?.takeProfitPct,
      10,
    ),
    noStopTotalSplitCount: safeNumber(
      wizardState.noStopMultiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleNoStopTargetStockChange,
    handleNoStopLowLocBudgetRatioChange,
    handleNoStopHighLocPremiumPctChange,
    handleNoStopTakeProfitPctChange,
    handleNoStopTotalSplitCountChange,
    vrShowErrors: isVrShowErrors,
    vrMode: wizardState.vrBand?.vrMode ?? 'lump_sum',
    vrInitialCapital: safeNumber(
      wizardState.vrBand?.initialCapital,
      STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
    ),
    vrInitialV: safeNumber(
      wizardState.vrBand?.initialV,
      STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
    ),
    vrMinOrderQty: safeNumber(wizardState.vrBand?.minOrderQty, 1),
    vrBandUpperPct: safeNumber(wizardState.vrBand?.bandUpperPct, 5),
    vrBandLowerPct: safeNumber(wizardState.vrBand?.bandLowerPct, 5),
    vrG: safeNumber(wizardState.vrBand?.g, 10),
    vrPoolUsagePct: safeNumber(wizardState.vrBand?.poolUsagePct, 50),
    vrDeltaCash: safeNumber(wizardState.vrBand?.deltaCash, 0),
    vrCycleWeeks: safeNumber(
      wizardState.vrBand?.cycleWeeks,
      VR_CYCLE.DEFAULT_WEEKS,
    ),
    handleVrModeChange,
    handleNameChange,
    handleDailyBuyAmountChange,
    handleFeeRatePercentChange,
    handleStartDateChange,
  };
}
```

핵심:

- 상위 `App.tsx`는 **raw `onSave`** 를 유지하고, Step 3.5 controller는 **`isSavingRef` + `isSaving`** 로 이중 제출을 막습니다(상위 `useMutexAction` 유무와 독립).
- 종목 선택은 **`CustomDropdown` 단일 경로**이며, 유료 잠금 안내 모달 라벨은 `getCommonMessages` → controller의 **`noticeLabel` / `acknowledgeLabel` / `closeLabel`** 를 `DropdownInfoModalLabels`로 묶어 MA·다분할 step에 내려보냅니다(Rule 3·4).
- `safeNumber`는 UI 경계 파싱에만 쓰고, 최종 조립은 `buildPortfolioDraftFromWizardState(...)` 에 위임합니다.
- **Rule 10·참조 안정성:** `updateMaSection` / `updateVrBand` / MA 베이스 필드 변경은 모두 **`setWizardState(previous => …)`** 로 고정하고, MA 섹션·VR 수치용 다수 핸들러는 **`useMemo`로 만든 `stepHandlers` 한 객체**를 `return`에 스프레드합니다. `wizardState`에 매 렌더마다 의존하는 `getCurrentMaIntervalState`류는 피합니다.
- **Rule 4:** 모달 백드롭은 **전면 `<button>` 꼼수 대신** `div` + 키보드 활성화 패턴(`handlePressEnterOrSpace`)을 씁니다(아래 4.5 스니펫).
- **Rule 2:** `shouldShowLaoerCreditBanner`는 짧은 배열 `.some()`으로 **boolean을 만드는 O(1) 수준**이므로 **`useMemo`로 감싸지 않고** 즉시 평가합니다.

### 4.5 `components/strategyCreator/StrategyCreatorLayout.tsx`

**아키텍트 리뷰 반영(Rule 4·시맨틱):** 화면 전체를 덮는 투명 레이어를 `<button>`으로만 두면 스크린 리더가 **거대한 단일 버튼**으로 읽을 수 있어, “닫기” 의도와 무관한 시맨틱 왜곡이 됩니다. 백드롭은 **`div` + `role="button"` + `tabIndex={0}` + `onKeyDown`에서 `handlePressEnterOrSpace`**로 키보드 닫기를 제공합니다(헤더의 실제 닫기 `<button>`은 그대로 유지). `handlePressEnterOrSpace`는 레포의 `@/src/utils/a11yHelpers`에 있습니다(`tsconfig`의 `@/*` → 프로젝트 루트).

```tsx
import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyCreatorLayoutProps } from './types/ui';

export function StrategyCreatorLayout({
  title,
  closeAriaLabel,
  cancelLabel,
  backLabel,
  primaryActionLabel,
  processingLabel,
  errorMessage,
  isSaving,
  isPrimaryDisabled,
  canGoBack,
  onClose,
  onBack,
  onPrimaryAction,
  children,
}: StrategyCreatorLayoutProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.overlay}>
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className={STRATEGY_CREATOR_STYLES.backdrop}
      />
      <div className={STRATEGY_CREATOR_STYLES.panel}>
        <div className={STRATEGY_CREATOR_STYLES.header}>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            className="rounded-full p-3 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.content}>{children}</div>

        {errorMessage != null && (
          <div className="px-6 pt-5 md:px-8">
            <p className={STRATEGY_CREATOR_STYLES.errorBanner}>
              {errorMessage}
            </p>
          </div>
        )}

        <div className={STRATEGY_CREATOR_STYLES.footer}>
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {backLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isPrimaryDisabled}
            className={STRATEGY_CREATOR_STYLES.primaryButton}
          >
            {isSaving ? processingLabel : primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4.6 `components/strategyCreator/steps/StrategySelectionStepView.tsx`

```tsx
import React from 'react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type { StrategySelectionStepViewProps } from '../types/ui';

export function StrategySelectionStepView({
  heading,
  description,
  definitions,
  selectedStrategy,
  onSelectStrategy,
}: StrategySelectionStepViewProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          {heading}
        </h3>
        <p className={STRATEGY_CREATOR_STYLES.helperText}>{description}</p>
      </div>

      <div className="space-y-4">
        {definitions.map((definition) => {
          const isSelected = selectedStrategy === definition.id;

          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => onSelectStrategy(definition.id)}
              className={`w-full rounded-[2rem] border p-6 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10'
                  : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${definition.gradientClassName}`}
                >
                  {definition.icon}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                      {definition.title}
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {definition.tierLabel}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {definition.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### 4.7 `components/strategyCreator/steps/MaWizardStepViews.tsx`

```tsx
import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MaBaseStepViewProps,
  MaSectionsStepViewProps,
} from '../types/ui';

function ToggleField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <span className="text-sm font-black text-slate-900 dark:text-white">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!isChecked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
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
  label: string;
  targetLabel: string;
  isEnabled: boolean;
  targetValue: number;
  onEnabledChange: (value: boolean) => void;
  onTargetValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleField
        label={props.label}
        isChecked={props.isEnabled}
        onChange={props.onEnabledChange}
      />
      {props.isEnabled && (
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.targetLabel}
          </label>
          <input
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
  title: string;
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
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-4">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          {props.title}
        </h3>
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.stockLabel}
          </label>
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
            <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
              {props.rsiThresholdLabel}
            </label>
            <input
              type="number"
              value={props.rsiThreshold}
              onChange={(event) => props.onRsiThresholdChange(event.target.value)}
              className={STRATEGY_CREATOR_STYLES.textInput}
            />
          </div>
        )}

        <PartialProfitField
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
  shortPeriodLabel,
  longPeriodLabel,
  rsiEnabledLabel,
  alignmentEnabledLabel,
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
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {referenceStockLabel}
          </label>
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
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {shortPeriodLabel}
          </label>
          <input
            type="number"
            value={maShortPeriod}
            onChange={(event) => onMaShortPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {longPeriodLabel}
          </label>
          <input
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
          isChecked={isRsiEnabled}
          onChange={onRsiEnabledChange}
        />
        <ToggleField
          label={alignmentEnabledLabel}
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
        title={props.section1Title}
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
        title={props.section2Title}
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
        title={props.section3Title}
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

### 4.8 `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`

```tsx
import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MultiSplitConfigStepViewProps,
  NoStopMultiSplitConfigStepViewProps,
  StrategyMetaStepViewProps,
} from '../types/ui';

function LabeledNumberField(props: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
        {props.label}
      </label>
      <input
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={STRATEGY_CREATOR_STYLES.textInput}
      />
    </div>
  );
}

export function MultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  targetReturnRateLabel,
  totalSplitCountLabel,
  highlightedHint,
  stockOptions,
  targetStock,
  targetReturnRate,
  totalSplitCount,
  onTargetStockChange,
  onTargetReturnRateChange,
  onTotalSplitCountChange,
}: MultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
          <p className={STRATEGY_CREATOR_STYLES.helperText}>{highlightedHint}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={targetReturnRateLabel}
            value={targetReturnRate}
            onChange={onTargetReturnRateChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onChange={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function NoStopMultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  lowLocBudgetRatioLabel,
  highLocPremiumPctLabel,
  takeProfitPctLabel,
  totalSplitCountLabel,
  stockOptions,
  targetStock,
  lowLocBudgetRatio,
  highLocPremiumPct,
  takeProfitPct,
  totalSplitCount,
  onTargetStockChange,
  onLowLocBudgetRatioChange,
  onHighLocPremiumPctChange,
  onTakeProfitPctChange,
  onTotalSplitCountChange,
}: NoStopMultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={lowLocBudgetRatioLabel}
            value={lowLocBudgetRatio}
            onChange={onLowLocBudgetRatioChange}
          />
          <LabeledNumberField
            label={highLocPremiumPctLabel}
            value={highLocPremiumPct}
            onChange={onHighLocPremiumPctChange}
          />
          <LabeledNumberField
            label={takeProfitPctLabel}
            value={takeProfitPct}
            onChange={onTakeProfitPctChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onChange={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function StrategyMetaStepView({
  metaLabels,
  meta,
  isVrStrategy,
  onNameChange,
  onDailyBuyAmountChange,
  onStartDateChange,
  onFeeRatePercentChange,
}: StrategyMetaStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.portfolioName}
          </label>
          <input
            type="text"
            value={meta.name ?? ''}
            onChange={(event) => onNameChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        {!isVrStrategy && (
          <LabeledNumberField
            label={metaLabels.dailyBuyAmount}
            value={
              typeof meta.dailyBuyAmount === 'number' ? meta.dailyBuyAmount : 0
            }
            onChange={onDailyBuyAmountChange}
          />
        )}

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.startDate}
          </label>
          <input
            type="date"
            value={meta.startDate ?? ''}
            onChange={(event) => onStartDateChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <LabeledNumberField
          label={metaLabels.feeRatePercent}
          value={typeof meta.feeRatePercent === 'number' ? meta.feeRatePercent : 0}
          onChange={onFeeRatePercentChange}
        />
      </div>
    </div>
  );
}

```

### 4.9 `components/strategyCreator/StrategyCreator.tsx`

**아키텍트 리뷰 반영(Rule 6·10·GC):** `StrategyStepRenderer`에 `maBaseProps` 등 **미표시 단계용 거대 인라인 객체를 매 렌더 생성**해 넘기면, 전략 선택 화면에서도 메타 입력 한 글자마다 불필요한 할당이 폭증합니다. **`StrategyStepRenderer.tsx` 파일·타입은 두지 않고**, 부모에서 `switch (controller.screen)`으로 **현재 화면에 필요한 props만** 조립합니다.

```tsx
import React from 'react';
import LaoerCreditBanner from '@/components/strategies/LaoerCreditBanner';
import VrBandStrategyForm from '@/components/strategies/VrBandStrategyForm';
import type { AppLang, Portfolio } from '@/types';
import { StrategyCreatorLayout } from './StrategyCreatorLayout';
import { MaBaseStepView, MaSectionsStepView } from './steps/MaWizardStepViews';
import {
  MultiSplitConfigStepView,
  NoStopMultiSplitConfigStepView,
  StrategyMetaStepView,
} from './steps/SingleStockStrategyStepViews';
import { StrategySelectionStepView } from './steps/StrategySelectionStepView';
import { useStrategyCreatorController } from './useStrategyCreatorController';

interface StrategyCreatorProps {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks?: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
}

export default function StrategyCreator({
  lang,
  onClose,
  onSave,
  canAccessPaidStocks = false,
  maxPortfolios,
  currentPortfolioCount,
}: StrategyCreatorProps): React.ReactElement {
  const controller = useStrategyCreatorController({
    lang,
    onClose,
    onSave,
    canAccessPaidStocks,
    maxPortfolios,
    currentPortfolioCount,
  });

  const renderCurrentStep = (): React.ReactElement => {
    switch (controller.screen) {
      case 'strategy_select':
        return (
          <StrategySelectionStepView
            heading={controller.copy.strategySelection.heading}
            description={controller.copy.strategySelection.description}
            definitions={controller.strategyDefinitions}
            selectedStrategy={controller.selectedStrategy}
            onSelectStrategy={controller.handleSelectStrategy}
          />
        );
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
            shortPeriodLabel={controller.copy.ma.shortPeriod}
            longPeriodLabel={controller.copy.ma.longPeriod}
            rsiEnabledLabel={controller.copy.ma.rsiEnabled}
            alignmentEnabledLabel={controller.copy.ma.alignmentEnabled}
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
            section2Title={controller.copy.ma.section2Title}
            section3Title={controller.copy.ma.section3Title}
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
      case 'multi_split_config':
        return (
          <MultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.multiSplit.targetStock}
            targetReturnRateLabel={controller.copy.multiSplit.targetReturnRate}
            totalSplitCountLabel={controller.copy.multiSplit.totalSplitCount}
            highlightedHint={controller.copy.multiSplit.leveragedRecommended}
            stockOptions={controller.stockOptions}
            targetStock={controller.multiSplitTargetStock}
            targetReturnRate={controller.multiSplitTargetReturnRate}
            totalSplitCount={controller.multiSplitTotalSplitCount}
            onTargetStockChange={controller.handleMultiSplitTargetStockChange}
            onTargetReturnRateChange={controller.handleTargetReturnRateChange}
            onTotalSplitCountChange={controller.handleMultiSplitTotalCountChange}
          />
        );
      case 'no_stop_multi_split_config':
        return (
          <NoStopMultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.noStopMultiSplit.targetStock}
            lowLocBudgetRatioLabel={
              controller.copy.noStopMultiSplit.lowLocBudgetRatio
            }
            highLocPremiumPctLabel={
              controller.copy.noStopMultiSplit.highLocPremiumPct
            }
            takeProfitPctLabel={controller.copy.noStopMultiSplit.takeProfitPct}
            totalSplitCountLabel={
              controller.copy.noStopMultiSplit.totalSplitCount
            }
            stockOptions={controller.stockOptions}
            targetStock={controller.noStopTargetStock}
            lowLocBudgetRatio={controller.noStopLowLocBudgetRatio}
            highLocPremiumPct={controller.noStopHighLocPremiumPct}
            takeProfitPct={controller.noStopTakeProfitPct}
            totalSplitCount={controller.noStopTotalSplitCount}
            onTargetStockChange={controller.handleNoStopTargetStockChange}
            onLowLocBudgetRatioChange={
              controller.handleNoStopLowLocBudgetRatioChange
            }
            onHighLocPremiumPctChange={
              controller.handleNoStopHighLocPremiumPctChange
            }
            onTakeProfitPctChange={controller.handleNoStopTakeProfitPctChange}
            onTotalSplitCountChange={
              controller.handleNoStopTotalSplitCountChange
            }
          />
        );
      case 'vr_band_config':
        return (
          <VrBandStrategyForm
            lang={lang}
            showErrors={controller.vrShowErrors}
            vrMode={controller.vrMode}
            onVrModeChange={controller.handleVrModeChange}
            vrInitialCapital={controller.vrInitialCapital}
            onVrInitialCapitalChange={controller.handleVrInitialCapitalChange}
            vrInitialV={controller.vrInitialV}
            onVrInitialVChange={controller.handleVrInitialVChange}
            vrMinOrderQty={controller.vrMinOrderQty}
            onVrMinOrderQtyChange={controller.handleVrMinOrderQtyChange}
            vrBandUpperPct={controller.vrBandUpperPct}
            onVrBandUpperPctChange={controller.handleVrBandUpperPctChange}
            vrBandLowerPct={controller.vrBandLowerPct}
            onVrBandLowerPctChange={controller.handleVrBandLowerPctChange}
            vrG={controller.vrG}
            onVrGChange={controller.handleVrGChange}
            vrPoolUsagePct={controller.vrPoolUsagePct}
            onVrPoolUsagePctChange={controller.handleVrPoolUsagePctChange}
            vrDeltaCash={controller.vrDeltaCash}
            onVrDeltaCashChange={controller.handleVrDeltaCashChange}
            vrCycleWeeks={controller.vrCycleWeeks}
            onVrCycleWeeksChange={controller.handleVrCycleWeeksChange}
          />
        );
      case 'strategy_meta':
        return (
          <StrategyMetaStepView
            metaLabels={controller.copy.meta}
            meta={controller.meta}
            isVrStrategy={controller.selectedStrategy === 'vr_band'}
            onNameChange={controller.handleNameChange}
            onDailyBuyAmountChange={controller.handleDailyBuyAmountChange}
            onStartDateChange={controller.handleStartDateChange}
            onFeeRatePercentChange={controller.handleFeeRatePercentChange}
          />
        );
      default: {
        const exhaustiveCheck: never = controller.screen;
        return exhaustiveCheck;
      }
    }
  };

  return (
    <>
      <StrategyCreatorLayout
        title={controller.title}
        closeAriaLabel={controller.closeLabel}
        cancelLabel={controller.copy.actions.cancel}
        backLabel={controller.copy.actions.back}
        primaryActionLabel={controller.primaryActionLabel}
        processingLabel={controller.processingLabel}
        errorMessage={controller.errorMessage}
        isSaving={controller.isSaving}
        isPrimaryDisabled={controller.isPrimaryDisabled}
        canGoBack={controller.canGoBack}
        onClose={controller.handleClose}
        onBack={controller.handleBack}
        onPrimaryAction={controller.handlePrimaryButtonClick}
      >
        {renderCurrentStep()}
        {controller.shouldShowLaoerCreditBanner && (
          <LaoerCreditBanner lang={lang} />
        )}
      </StrategyCreatorLayout>
    </>
  );
}

```

### 4.10 `components/StrategyCreator.tsx`

```tsx
export { default } from './strategyCreator/StrategyCreator';
```

---

## 5. 구현 순서(완료 기준 역사적 정리)

1. `constants/messages/strategyCreatorMessages.ts`로 전략 생성기 문구를 고정해 본문 `lang ===` 분기를 제거했습니다.
2. `components/strategyCreator/types/ui.ts`와 `styles.ts`로 도메인 로컬 타입·Tailwind class SSOT를 분리했습니다.
3. `components/strategyCreator/useStrategyCreatorController.tsx`에 step·draft·저장 검증·`isSavingRef`·`noticeLabel` 등을 모았습니다.
4. `StrategyCreatorLayout.tsx`와 각 step view를 둔 뒤, `StrategyCreator.tsx`에서 `switch (controller.screen)`으로 **현재 화면만** 렌더링합니다(`StrategyStepRenderer` 미들웨어 없음).
5. `components/StrategyCreator.tsx`는 얇은 re-export shim으로 유지합니다.

---

## 6. 비목표

1. `App.tsx`의 `onSaveCreator` 계약을 `saveCommand`로 재배선하지 않습니다.
2. `src/components/StrategyCreator/utils.ts`를 다시 뒤엎지 않습니다.
3. `CustomDropdown`, `VrBandStrategyForm` 자체를 전면 리라이트하지 않습니다.
4. 전역 `types/ui.ts` 또는 `styles/` 루트 구조를 새로 강제하지 않습니다.

---

## 7. Mental Compile & Pragmatism 검증 보고서

### 7.1 Props 전달과 Rule 10

- `StrategyCreator`는 controller가 계산한 값을 **primitive/명시 props**로만 **현재 `screen`에 해당하는** step view에 전달합니다. 미표시 단계용 props 객체를 JSX에서 미리 조립해 두지 않습니다.
- `wizardState` 통객체를 step view에 직접 넘기지 않았습니다.
- 예:
  - `MaBaseStepView` / `MaSectionsStepView` / `MultiSplitConfigStepView` / `NoStopMultiSplitConfigStepView`: 종목 드롭다운용 **`dropdownInfoModalLabels`**(잠금 티커 설명 모달) + 수치·콜백 props
  - `StrategyMetaStepView`: `meta`, `isVrStrategy`, `onNameChange`, `onFeeRatePercentChange`
  - `VrBandStrategyForm`: 기존 명시 props 계약 유지
- `primaryActionLabel`, `screen`, `title`, **`shouldShowLaoerCreditBanner`** 는 O(1) 분기·소형 탐색이므로 `useMemo`로 감싸지 않았습니다(Rule 2).
- `stockOptions`, `strategyDefinitions`처럼 하위 view로 내려가는 파생 배열만 `useMemo`를 사용했습니다.

### 7.2 Rule 11 더블 제출 방어

- Step 3.5 최종 저장은 `useStrategyCreatorController` 내부의 **`isSavingRef` 동기 락**이 1차 방어선입니다.
- `isSaving` state는 버튼 disabled/로딩 표시에만 사용합니다.
- 저장 경로는 다음 순서를 가집니다.
  1. `selectedStrategy` 존재 확인
  2. `isSavingRef.current` 확인
  3. 포트폴리오 수 한도 확인
  4. `buildPortfolioDraftFromWizardState(...)`
  5. `validatePortfolioSetupInput(...)`
  6. `hasDuplicatedSectionStocks(...)`
  7. `await Promise.resolve(onSave(...))`
  8. 성공 시 `onClose()`
  9. `finally`에서 락 해제
- 따라서 repaint gap 사이의 연타도 `isSavingRef.current`가 즉시 차단합니다.

### 7.3 Rule 1 금융/입력 경계

- UI 입력 파싱은 `Number(...)`를 직접 쓰지 않고 `safeNumber(...)`를 거칩니다.
- meta money/fee는 `roundMoney(...)`로 정규화합니다.
- 최종 전략 조립은 이미 검증된 `src/components/StrategyCreator/utils.ts`의 SSOT를 사용합니다.
- VR delta cash, fee rate, MA 기간 등은 step view가 아니라 controller와 빌더에서만 정규화합니다.

### 7.4 Rule 6·7 복잡도/타입

- `StrategyWizardScreen` 분기는 **`StrategyCreator.tsx`의 `switch + never`**로 닫습니다(별도 `StrategyStepRenderer` 없음).
- `any`, `Record<string, unknown>` 를 step props에 쓰지 않았습니다.
- step props는 모두 `types/ui.ts`의 명시 인터페이스로 선언했습니다.
- `A ? B : C ? D : E` 형태의 3중첩 삼항은 쓰지 않았고, screen/title/action label은 helper function으로 평탄화했습니다.

### 7.5 Pragmatism / 오버 코딩 방지

- 비채택:
  - `XState`
  - `React Hook Form`
  - generic wizard schema renderer
  - `StrategyStepRenderer` 같이 **미표시 step용 통 props 객체를 매 렌더 조립**하는 미들웨어
  - `saveCommand` 상위 계약 변경
  - 전역 CSS 시스템 도입
- 채택:
  - 기존 공개 경로 유지용 shim
  - domain-local `types/ui.ts`
  - domain-local `styles.ts`
  - local `useState` + `useRef` + `useCallback`
  - 기존 `buildPortfolioDraftFromWizardState(...)` 재사용
- 즉, Step 3.5는 **거대 단일 파일을 controller/view/step으로 해체하는 최소 구조**로 완료되었고, 저장소 전역 아키텍처를 새로 세우지 않았습니다.

### 7.6 최종 결론

본 문서는 **구현 완료 트리**와 아래에 정합합니다.

1. `App.tsx`는 raw `onSaveCreator`를 그대로 주입합니다.
2. `src/components/StrategyCreator/utils.ts`는 draft/빌더 SSOT입니다.
3. `components/strategyCreator/**`로 해체·문구 분리·`isSavingRef`·`CustomDropdown` 정보 모달 라벨 전달이 반영되었습니다.
4. 상위 `saveCommand` 재배선 없이 **controller + layout + step views + domain-local type/style + 저장 락**으로 마무리되었습니다.

---

## 8. 계획서 대비 구현·문서 정합 메모

| 구분 | 내용 |
|------|------|
| **§4.4 컨트롤러 펜스** | 문서에는 **발췌**(상단 import, `buildStrategyDefinitions`, 훅 `return { ... }`)만 실었습니다. **전문은** `components/strategyCreator/useStrategyCreatorController.tsx`가 정본입니다. 의도적 중략이며, 동작·분기·락은 소스와 일치해야 합니다. |
| **§4.1·4.2·4.3·4.5–4.10** | 해당 펜스는 레포 파일과 **동기화**(§4.7–4.9는 소스에서 자동 치환)했습니다. |
| **추가 구현(계획 초안 대비)** | `DropdownInfoModalLabels`, controller의 `noticeLabel`·`acknowledgeLabel`, step의 `CustomDropdown` `infoModal*` props — **A11y·i18n 일관**을 위한 보강으로 문서에 반영했습니다. |

**현재 알려진 잔여 차이:** 위 표의 **§4.4 중략** 외에는, 본 문서가 가리키는 경로·공개 계약과 구현 간 **의도적 불일치는 없습니다**. §4.7–4.9 펜스는 소스 파일과 1:1로 맞춰 두었으므로, 해당 TSX를 수정할 때는 동일 섹션의 문서 스니펫도 함께 갱신하는 것이 좋습니다.
