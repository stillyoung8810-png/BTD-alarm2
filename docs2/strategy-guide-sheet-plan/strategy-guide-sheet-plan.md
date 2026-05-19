---
name: 전략 설명 시트 UI 계획서
overview: 포트폴리오 생성 플로우의 전략 선택 카드에 설명 버튼과 상세 시트를 추가하기 위한 구현 전 계획과 AST 매핑 가능한 스니펫입니다.
stage: pre-implementation
status: draft
---

# 전략 설명 시트 UI 계획서

## 0. 범위

이 문서는 새 포트폴리오 생성 모달의 첫 단계인 전략 선택 화면에 "작은 설명 버튼"과 전략 설명 시트를 추가하기 위한 구현 전 계획서입니다. 실제 전략별 상세 설명 본문은 아직 확정하지 않았으므로, 이 문서에서는 상세 내용의 제목만 만들고 본문은 비워둡니다.

첨부된 TVC 가이드 이미지는 추후 구현 시 재사용할 수 있도록 워크스페이스에 선보관합니다. 현재 코어 `StrategyType`에는 TVC가 포함되어 있지 않으므로, 이 문서에서는 해당 이미지를 "향후 TVC 전략 설명 시트용 예약 자산"으로만 기록하고 실제 렌더링 연결은 범위에서 제외합니다.

이번 변경의 대상은 다음 파일 경계로 제한합니다.

- `constants/messages/strategyCreatorMessages.ts`
- `components/strategyCreator/types/ui.ts`
- `components/strategyCreator/useStrategyCreatorController.tsx`
- `components/strategyCreator/StrategyCreator.tsx`
- `components/strategyCreator/steps/StrategySelectionStepView.tsx`
- `components/strategyCreator/styles.ts`
- `components/strategyCreator/StrategyGuideSheet.tsx` 신규

이번 계획에서 의도적으로 제외하는 범위는 다음과 같습니다.

- 하단 네비게이션 탭 추가
- 멤버십 탭 내부 설명 콘텐츠 추가
- `App.tsx`, `TabContent.tsx`, `Dashboard.tsx` 상태 확장
- 금융 계산, 주문 생성, 검증 규칙, 저장 로직 변경
- `Portfolio` 또는 코어 `Strategy` 데이터 모델 리팩토링

## 0-1. 예약 자산

### TVC 가이드 이미지

- 보관 경로: `public/images/strategy-guides/tvc-guide-overview.png`
- 자산 용도: 향후 TVC 상세 설명 버튼 클릭 시 열리는 설명 시트의 대표 이미지
- 현재 상태: 파일만 선보관, UI 연결 없음
- 연결 전제 조건: `StrategyType` 또는 이에 준하는 전략 목록에 TVC가 실제로 추가된 이후에만 사용

향후 구현 시 이미지 참조는 앱 번들 import가 아니라 정적 경로를 우선 사용합니다.

```ts
const TVC_GUIDE_IMAGE_SRC = '/images/strategy-guides/tvc-guide-overview.png';
```

검토:

- `public/images` 경로를 사용하므로 나중에 설명 시트에서 바로 정적 자산으로 참조할 수 있습니다.
- 아직 TVC 전략이 현재 전략 생성 플로우에 존재하지 않으므로, 지금 단계에서는 이 상수를 실제 코드에 넣지 않습니다.
- 미래에 TVC를 추가하더라도 이미지 파일 위치를 다시 옮길 필요가 없도록 경로를 안정화합니다.

## 1. 현재 구조 판정

현재 `StrategyType`은 다음 4개입니다.

```ts
export type StrategyType =
  | 'rsi_ma_interval'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';
```

현재 전략 선택 화면은 `StrategySelectionStepView`에서 `definitions.map`으로 카드를 렌더링하고, 카드 전체를 하나의 `<button>`으로 사용합니다. 이 구조에 설명 버튼을 그대로 넣으면 "button 안에 button"이 되어 HTML 구조, 접근성, 이벤트 전파가 모두 나빠집니다.

따라서 카드 구조는 다음 계약으로 바꿔야 합니다.

- 카드 본문 버튼: 전략 선택만 담당합니다.
- 우측 상단 작은 설명 버튼: 설명 시트 열기만 담당합니다.
- 설명 시트는 생성 마법사와 같은 레벨의 형제 오버레이로 렌더링합니다.
- 설명 시트는 선택 중인 전략을 바꾸지 않습니다.

## 2. 유지보수성 기준의 냉정한 리뷰

현재 구조에서 그대로 덧붙이면 다음 문제가 생깁니다.

- 카드 전체가 `<button>`인 상태에서 내부에 설명 `<button>`을 넣는 방식은 중첩 인터랙티브 요소라서 즉시 폐기해야 합니다.
- 설명 문구를 컴포넌트 JSX 안에 직접 넣으면 i18n 규칙 위반이며, 이후 마케팅 문구 수정 때 중복 수정 포인트가 생깁니다.
- 설명 콘텐츠를 `title` 같은 번역 문자열로 분기하면 전략명 변경 시 런타임 버그가 납니다. 반드시 `StrategyType` 키로만 분기해야 합니다.
- 설명 시트 상태를 `App.tsx`나 `Dashboard.tsx`로 올리면 상태 범위가 과도하게 커집니다. 이 기능은 `StrategyCreator` 안에서만 쓰이므로 컨트롤러 내부 상태로 충분합니다.
- 현재 코어 `Strategy` 데이터 모델은 모든 전략이 MA 계열 데이터에 끌려가는 Fat Interface 기술 부채가 있습니다. 이번 UI 설명 기능은 그 부채를 고치지 않으며, 고쳐서도 안 됩니다. 설명 기능은 `StrategyType`과 메시지 딕셔너리만 참조해야 합니다.
- 상세 설명 본문이 없는 상태로 버튼을 릴리즈하면 빈 모달이 열립니다. 이는 제품 품질상 실패입니다. 따라서 실제 배포 전에는 상세 본문을 채운 뒤 버튼 노출을 활성화해야 합니다.

## 3. 컴포넌트 분할

권장 분할은 다음과 같습니다.

```text
StrategyCreator
├─ StrategyCreatorLayout
│  └─ StrategySelectionStepView
│     └─ StrategyDefinitionCard
└─ StrategyGuideSheet
```

역할은 다음처럼 제한합니다.

- `StrategyCreator`: 컨트롤러와 뷰를 연결하고, 시트가 열렸을 때 형제 레벨로 렌더링합니다.
- `useStrategyCreatorController`: `guideStrategyId` 상태와 open/close handler만 가집니다.
- `StrategySelectionStepView`: 전략 목록, 선택 상태, 설명 버튼 콜백 전달만 담당합니다.
- `StrategyDefinitionCard`: 카드 한 장의 선택 버튼과 설명 버튼을 분리합니다.
- `StrategyGuideSheet`: 시트 레이아웃, 닫기 동작, 제목 렌더링만 담당합니다.
- `strategyCreatorMessages`: 모든 UI 문자열과 전략별 제목을 보관합니다.

## 4. 상세 내용 제목

아래 각 제목의 상세 본문은 추후 별도 계획에서 채웁니다. 현재 문서에서는 본문을 의도적으로 비워 둡니다.

### rsi_ma_interval

### multi_split

### no_stop_multi_split

### vr_band

## 5. 스니펫 1: 메시지 모델 확장

대상 파일: `constants/messages/strategyCreatorMessages.ts`

핵심 목적은 전략 설명 시트가 컴포넌트 내부 하드코딩 없이 동작하게 만드는 것입니다. 상세 본문은 아직 넣지 않고, 전략별 제목과 공통 버튼 라벨만 둡니다.

```ts
import type { AppLang } from '@/types';
import type { StrategyType } from '@/src/components/StrategyCreator/utils';
import { getStrategyNames } from '../../supabase/functions/_shared/strategyNames.ts';
```

`StrategyCreatorMessageSet`에 다음 필드를 추가합니다.

```ts
export interface StrategyGuideEntryMessage {
  title: string;
}

export interface StrategyGuideMessageSet {
  labels: {
    closeLabel: string;
    closeAriaLabel: string;
    dialogTitle: string;
  };
  openButtonAriaLabels: Record<StrategyType, string>;
  entries: Record<StrategyType, StrategyGuideEntryMessage>;
}

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
  strategyGuide: StrategyGuideMessageSet;
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
  outOfRangeToast: string;
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
  vrBand: {
    initialTHelper: string;
    baseGrowthRatePctHelper: string;
    poolUsagePctHelper: string;
    smartBrakeThresholdPctHelper: string;
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
```

`ko.strategyDefinitions` 바로 아래에 다음을 추가합니다.

```ts
    strategyGuide: {
      labels: {
        closeLabel: '닫기',
        closeAriaLabel: '전략 설명 닫기',
        dialogTitle: '전략 설명',
      },
      openButtonAriaLabels: {
        rsi_ma_interval: `${STRATEGY_NAMES_KO.rsi_ma_interval} 전략 설명 보기`,
        multi_split: `${STRATEGY_NAMES_KO.multi_split} 전략 설명 보기`,
        no_stop_multi_split: `${STRATEGY_NAMES_KO.no_stop_multi_split} 전략 설명 보기`,
        vr_band: `${STRATEGY_NAMES_KO.vr_band} 전략 설명 보기`,
      },
      entries: {
        rsi_ma_interval: {
          title: STRATEGY_NAMES_KO.rsi_ma_interval,
        },
        multi_split: {
          title: STRATEGY_NAMES_KO.multi_split,
        },
        no_stop_multi_split: {
          title: STRATEGY_NAMES_KO.no_stop_multi_split,
        },
        vr_band: {
          title: STRATEGY_NAMES_KO.vr_band,
        },
      },
    },
```

`en.strategyDefinitions` 바로 아래에 다음을 추가합니다.

```ts
    strategyGuide: {
      labels: {
        closeLabel: 'Close',
        closeAriaLabel: 'Close strategy guide',
        dialogTitle: 'Strategy Guide',
      },
      openButtonAriaLabels: {
        rsi_ma_interval: `View ${STRATEGY_NAMES_EN.rsi_ma_interval} strategy guide`,
        multi_split: `View ${STRATEGY_NAMES_EN.multi_split} strategy guide`,
        no_stop_multi_split: `View ${STRATEGY_NAMES_EN.no_stop_multi_split} strategy guide`,
        vr_band: `View ${STRATEGY_NAMES_EN.vr_band} strategy guide`,
      },
      entries: {
        rsi_ma_interval: {
          title: STRATEGY_NAMES_EN.rsi_ma_interval,
        },
        multi_split: {
          title: STRATEGY_NAMES_EN.multi_split,
        },
        no_stop_multi_split: {
          title: STRATEGY_NAMES_EN.no_stop_multi_split,
        },
        vr_band: {
          title: STRATEGY_NAMES_EN.vr_band,
        },
      },
    },
```

검토:

- `Record<StrategyType, ...>`이므로 새 전략이 추가되면 누락된 메시지가 컴파일 단계에서 드러납니다.
- 상세 본문 필드를 만들지 않으므로 빈 상세 내용을 데이터로 위장하지 않습니다.
- JSX 하드코딩 없이 모든 라벨을 i18n 딕셔너리에서 가져옵니다.

## 6. 스니펫 2: UI 타입 확장

대상 파일: `components/strategyCreator/types/ui.ts`

```ts
export interface StrategyGuideEntryViewModel {
  id: StrategyType;
  title: string;
}

export interface StrategyGuideSheetLabels {
  closeLabel: string;
  closeAriaLabel: string;
  dialogTitle: string;
}

export interface StrategyGuideSheetProps {
  labels: StrategyGuideSheetLabels;
  entry: StrategyGuideEntryViewModel;
  onClose: () => void;
}

export interface StrategySelectionStepViewProps {
  lang: AppLang;
  heading: string;
  description: string;
  definitions: readonly StrategyDefinitionViewModel[];
  selectedStrategy: StrategyType | null;
  strategyGuideButtonAriaLabels: Readonly<Record<StrategyType, string>>;
  onSelectStrategy: (strategy: StrategyType) => void;
  onOpenStrategyGuide: (strategy: StrategyType) => void;
}
```

검토:

- 콜백 prop은 `on*` 접두사를 사용합니다.
- `StrategyGuideEntryViewModel.id`는 시트 제목 id와 테스트 식별에 사용 가능한 안정 키입니다.
- `Readonly<Record<StrategyType, string>>`은 StepView가 라벨 객체를 수정하지 못하게 합니다.

## 6-1. 스니펫 2-1: 스타일 토큰 확장

대상 파일: `components/strategyCreator/styles.ts`

시트 레이아웃과 설명 버튼의 임의 Tailwind 값을 컴포넌트에 직접 흩뿌리지 않습니다. `STRATEGY_CREATOR_STYLES` 안에 명명된 토큰으로 모아, z-index와 viewport 크기 값의 의미를 한 곳에서 통제합니다.

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
    'w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 dark:bg-slate-900/80 dark:text-white',
  primaryButton:
    'flex-1 rounded-2xl bg-blue-600 px-6 py-5 text-xs font-black uppercase text-white shadow-[0_12px_40px_rgba(37,99,235,0.35)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50',
  secondaryButton:
    'rounded-2xl border border-slate-600/60 bg-slate-800 px-6 py-5 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-slate-700',
  errorBanner:
    'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600',
  helperText: 'text-[11px] font-medium text-slate-500 dark:text-slate-400',
  strategyGuideOverlay:
    'fixed inset-0 z-[220] flex items-center justify-center p-4',
  strategyGuidePanel:
    'relative flex h-[min(86vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]',
  strategyGuideHeader:
    'flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10',
  strategyGuideEyebrow:
    'text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400',
  strategyGuideTitle:
    'truncate text-lg font-black text-slate-900 dark:text-white',
  strategyGuideBody: 'min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8',
  strategyGuideFooter:
    'border-t border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80',
  strategyGuideIconButton:
    'rounded-full p-3 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10',
  strategyGuideInfoButton:
    'absolute right-5 top-5 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
} as const;
```

검토:

- z-index와 viewport height는 컴포넌트 JSX에 직접 쓰지 않고, 전략 생성 레이아웃 스타일 토큰으로 집중합니다.
- 기존 토큰은 유지하고 신규 토큰만 추가합니다.
- 같은 class 묶음을 2회 이상 반복하지 않습니다.

## 7. 스니펫 3: 컨트롤러 상태 추가

대상 파일: `components/strategyCreator/useStrategyCreatorController.tsx`

`selectedStrategy` 상태 근처에 다음 상태를 추가합니다.

```ts
  const [guideStrategyId, setGuideStrategyId] = useState<StrategyType | null>(
    null,
  );
```

`strategyDefinitions` 아래에 다음 파생값과 handler를 추가합니다.

```ts
  const strategyGuideEntry =
    guideStrategyId == null
      ? null
      : {
          id: guideStrategyId,
          title: copy.strategyGuide.entries[guideStrategyId].title,
        };

  const handleOpenStrategyGuide = useCallback((strategy: StrategyType) => {
    setGuideStrategyId(strategy);
  }, []);

  const handleCloseStrategyGuide = useCallback(() => {
    setGuideStrategyId(null);
  }, []);
```

컨트롤러 return 객체에 다음 필드를 추가합니다.

```ts
    strategyGuideEntry,
    handleOpenStrategyGuide,
    handleCloseStrategyGuide,
```

검토:

- 상태는 `StrategyCreator` 플로우 안에만 머뭅니다. `App.tsx`로 올리지 않습니다.
- `strategyGuideEntry`는 소형 객체라 `useMemo`가 필요 없습니다.
- async 작업이 없으므로 mutex가 필요하지 않습니다.
- `copy.strategyGuide.entries[guideStrategyId]`는 `Record<StrategyType, ...>`이므로 정상 타입에서는 누락될 수 없습니다.

## 8. 스니펫 4: 전략 설명 시트 신규 파일

대상 파일: `components/strategyCreator/StrategyGuideSheet.tsx`

```tsx
import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyGuideSheetProps } from './types/ui';

export function StrategyGuideSheet({
  labels,
  entry,
  onClose,
}: StrategyGuideSheetProps): React.ReactElement {
  const titleId = `strategy-guide-title-${entry.id}`;

  return (
    <div className={STRATEGY_CREATOR_STYLES.strategyGuideOverlay}>
      <div
        role="button"
        tabIndex={0}
        aria-label={labels.closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className={STRATEGY_CREATOR_STYLES.backdrop}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={STRATEGY_CREATOR_STYLES.strategyGuidePanel}
      >
        <div className={STRATEGY_CREATOR_STYLES.strategyGuideHeader}>
          <div className="min-w-0">
            <p className={STRATEGY_CREATOR_STYLES.strategyGuideEyebrow}>
              {labels.dialogTitle}
            </p>
            <h2
              id={titleId}
              className={STRATEGY_CREATOR_STYLES.strategyGuideTitle}
            >
              {entry.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeAriaLabel}
            className={STRATEGY_CREATOR_STYLES.strategyGuideIconButton}
          >
            <X size={22} aria-hidden />
          </button>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.strategyGuideBody} />

        <div className={STRATEGY_CREATOR_STYLES.strategyGuideFooter}>
          <button
            type="button"
            onClick={onClose}
            className={STRATEGY_CREATOR_STYLES.secondaryButton}
          >
            {labels.closeLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
```

검토:

- 상세 본문 영역은 의도적으로 비워 둡니다.
- 배경 `<div>`는 인터랙티브 요소이므로 `role`, `tabIndex`, `onKeyDown`, `aria-label`을 모두 갖습니다.
- `strategyGuideOverlay`는 기존 `StrategyCreatorLayout` 오버레이보다 위에 뜨도록 스타일 토큰에서 관리합니다.
- `role="dialog"`와 `aria-modal="true"`를 둬 시트의 의미를 명확히 합니다.
- 닫기 handler는 동기 상태 변경만 하므로 async mutex 대상이 아닙니다.

## 9. 스니펫 5: 전략 선택 카드 분리

대상 파일: `components/strategyCreator/steps/StrategySelectionStepView.tsx`

```tsx
import React, { useCallback } from 'react';
import { Info } from 'lucide-react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  StrategyDefinitionViewModel,
  StrategySelectionStepViewProps,
} from '../types/ui';
import type { StrategyType } from '@/src/components/StrategyCreator/utils';
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

interface StrategyDefinitionCardProps {
  definition: StrategyDefinitionViewModel;
  isSelected: boolean;
  strategyGuideButtonAriaLabel: string;
  onSelectStrategy: (strategy: StrategyType) => void;
  onOpenStrategyGuide: (strategy: StrategyType) => void;
}

function getStrategyCardClassName(isSelected: boolean): string {
  if (isSelected) {
    return 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10';
  }

  return 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70';
}

function StrategyDefinitionCard({
  definition,
  isSelected,
  strategyGuideButtonAriaLabel,
  onSelectStrategy,
  onOpenStrategyGuide,
}: StrategyDefinitionCardProps): React.ReactElement {
  const handleSelectStrategy = useCallback(() => {
    onSelectStrategy(definition.id);
  }, [definition.id, onSelectStrategy]);

  const handleOpenStrategyGuide = useCallback(() => {
    onOpenStrategyGuide(definition.id);
  }, [definition.id, onOpenStrategyGuide]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleSelectStrategy}
        className={`w-full rounded-[2rem] border p-6 pr-16 text-left transition-all ${getStrategyCardClassName(
          isSelected,
        )}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${definition.gradientClassName}`}
          >
            {definition.icon}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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

      <button
        type="button"
        onClick={handleOpenStrategyGuide}
        aria-label={strategyGuideButtonAriaLabel}
        className={STRATEGY_CREATOR_STYLES.strategyGuideInfoButton}
      >
        <Info size={16} aria-hidden />
      </button>
    </div>
  );
}

export function StrategySelectionStepView({
  lang,
  heading,
  description,
  definitions,
  selectedStrategy,
  strategyGuideButtonAriaLabels,
  onSelectStrategy,
  onOpenStrategyGuide,
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
        {definitions.map((definition) => (
          <StrategyDefinitionCard
            key={definition.id}
            definition={definition}
            isSelected={selectedStrategy === definition.id}
            strategyGuideButtonAriaLabel={
              strategyGuideButtonAriaLabels[definition.id]
            }
            onSelectStrategy={onSelectStrategy}
            onOpenStrategyGuide={onOpenStrategyGuide}
          />
        ))}
      </div>

      <LegalDisclaimer
        lang={lang}
        variant="accent"
        layoutClassName="pt-2 text-center"
      />
    </div>
  );
}
```

검토:

- 중첩 버튼을 제거했습니다.
- `definition.id`를 `key`로 사용하므로 index key를 쓰지 않습니다.
- 선택 버튼과 설명 버튼의 이벤트 책임이 분리됩니다.
- JSX 중첩 삼항이 없고, 선택 스타일은 `getStrategyCardClassName`로 분리했습니다.
- 버튼 라벨은 메시지 딕셔너리에서 전달됩니다.

## 10. 스니펫 6: StrategyCreator 연결

대상 파일: `components/strategyCreator/StrategyCreator.tsx`

import를 추가합니다.

```ts
import { StrategyGuideSheet } from './StrategyGuideSheet';
```

`strategy_select` 분기에서 props를 추가합니다.

```tsx
          <StrategySelectionStepView
            lang={lang}
            heading={controller.copy.strategySelection.heading}
            description={controller.copy.strategySelection.description}
            definitions={controller.strategyDefinitions}
            selectedStrategy={controller.selectedStrategy}
            strategyGuideButtonAriaLabels={
              controller.copy.strategyGuide.openButtonAriaLabels
            }
            onSelectStrategy={controller.handleSelectStrategy}
            onOpenStrategyGuide={controller.handleOpenStrategyGuide}
          />
```

return 영역에 시트를 형제 레벨로 추가합니다.

```tsx
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
      </StrategyCreatorLayout>

      {controller.strategyGuideEntry != null && (
        <StrategyGuideSheet
          labels={controller.copy.strategyGuide.labels}
          entry={controller.strategyGuideEntry}
          onClose={controller.handleCloseStrategyGuide}
        />
      )}
    </>
  );
```

검토:

- 설명 시트는 마법사 내부 콘텐츠가 아니라 형제 오버레이입니다.
- `controller.strategyGuideEntry != null` guard가 있으므로 non-null assertion이 필요 없습니다.
- 시트를 닫아도 `selectedStrategy`와 `step`은 변경되지 않습니다.

## 11. 가상 런타임 시뮬레이션

### 11.1 AST 매핑

1. `StrategyCreator.tsx`가 `useStrategyCreatorController`를 호출합니다.
2. 컨트롤러 return 타입은 명시되어 있지 않지만, 반환 객체에 `strategyGuideEntry`, `handleOpenStrategyGuide`, `handleCloseStrategyGuide`가 추가됩니다.
3. `StrategySelectionStepViewProps`에 `strategyGuideButtonAriaLabels`, `onOpenStrategyGuide`가 추가됩니다.
4. `StrategyCreator.tsx`의 `strategy_select` 분기는 두 prop을 모두 전달합니다.
5. `StrategySelectionStepView`는 `definitions.map`에서 각 `definition.id`로 `strategyGuideButtonAriaLabels[definition.id]`를 조회합니다.
6. `definition.id`는 `StrategyType`이므로 `Readonly<Record<StrategyType, string>>` 인덱싱이 성립합니다.
7. 설명 버튼 클릭은 `StrategyDefinitionCard.handleOpenStrategyGuide`를 호출합니다.
8. `handleOpenStrategyGuide`는 `guideStrategyId`를 해당 `StrategyType`으로 설정합니다.
9. 렌더 재실행 시 `strategyGuideEntry`가 `{ id, title }` 객체가 됩니다.
10. `StrategyCreator.tsx`는 `strategyGuideEntry != null`일 때 `StrategyGuideSheet`를 렌더링합니다.
11. `StrategyGuideSheet`는 `entry.id`로 `titleId`를 생성하고, `entry.title`을 `<h2>`에 렌더링합니다.
12. 닫기 버튼 또는 backdrop activation은 `handleCloseStrategyGuide`를 호출합니다.
13. `guideStrategyId`가 `null`이 되어 다음 렌더에서 `StrategyGuideSheet`가 언마운트됩니다.

### 11.2 타입 체크 시뮬레이션

- `StrategyGuideMessageSet.entries`는 `Record<StrategyType, StrategyGuideEntryMessage>`입니다. 4개 전략 중 하나라도 빠지면 컴파일 에러가 납니다.
- `openButtonAriaLabels`도 `Record<StrategyType, string>`입니다. aria-label 누락이 타입 단계에서 걸립니다.
- `StrategyGuideSheet`는 `entry: StrategyGuideEntryViewModel`을 필수로 받습니다. nullable entry를 직접 넘길 수 없습니다.
- `controller.strategyGuideEntry != null` guard 이후에만 시트를 렌더링하므로 non-null assertion이 필요 없습니다.
- `StrategyDefinitionCard`는 `StrategyDefinitionViewModel`을 그대로 받아 기존 `buildStrategyDefinitions` 산출물과 호환됩니다.

### 11.3 이벤트 흐름 시뮬레이션

- 카드 본문 클릭: `onSelectStrategy(definition.id)`만 실행됩니다.
- 설명 버튼 클릭: `onOpenStrategyGuide(definition.id)`만 실행됩니다.
- 설명 버튼은 카드 버튼 밖에 있으므로 이벤트 전파 차단에 의존하지 않습니다.
- 설명 시트 닫기: `guideStrategyId`만 `null`로 바뀝니다.
- 전략 선택 상태, 마법사 step, 저장 가능 여부는 변경되지 않습니다.

### 11.4 접근성 시뮬레이션

- 카드 선택은 실제 `<button>`입니다.
- 설명 버튼도 실제 `<button>`이고, `aria-label`을 갖습니다.
- 시트 backdrop은 `div`이므로 `role="button"`, `tabIndex={0}`, `onKeyDown`, `aria-label`을 모두 갖습니다.
- 시트는 `role="dialog"`, `aria-modal="true"`, `aria-labelledby`를 갖습니다.
- `X`와 `Info` 아이콘은 `aria-hidden`으로 장식 처리합니다.

### 11.5 품질 규칙 위반 여부

- 금융 계산 없음: divide-by-zero, floating-point rounding, sign enforcement, order loop 규칙 영향 없음.
- async 없음: one-click mutex, bridge rejection wrapping 영향 없음.
- i18n 준수: JSX에 한국어/영어 UI 문자열을 직접 넣지 않습니다.
- string-based logic 없음: 전략명 문자열이 아니라 `StrategyType` 키로만 조회합니다.
- `any` 없음: 추가 타입은 모두 구체 타입입니다.
- non-null assertion 없음: null guard를 사용합니다.
- magic number: 시트 z-index와 viewport 크기 토큰은 JSX에 직접 두지 않고 `STRATEGY_CREATOR_STYLES` 안에 명명해 둡니다.
- SRP: 카드, 시트, 컨트롤러 상태가 분리됩니다.
- OCP: 새 전략 추가 시 `StrategyType`과 메시지 `Record` 확장으로 컴파일 에러가 안내합니다.

## 12. 구현 전 차단 조건

상세 본문이 비어 있는 상태로 실제 사용자에게 버튼을 노출하면 안 됩니다. 구현 시작 전에 다음 중 하나를 선택해야 합니다.

- 상세 본문 계획서를 먼저 작성하고, 본문까지 채운 뒤 버튼을 노출합니다.
- 또는 임시 feature flag를 두고 내부 QA에서만 버튼을 노출합니다.

임시 feature flag를 둔다면 플래그 이름은 boolean naming 규칙에 맞춰 `shouldShowStrategyGuideButton`처럼 작성해야 합니다. 단, 이 문서의 스니펫에는 feature flag를 넣지 않았습니다. 아직 실제 출시 정책이 확정되지 않았기 때문입니다.

## 13. 최종 판정

이 계획은 현재 코드 구조에 억지로 전역 탭을 추가하지 않고, 포트폴리오 생성 플로우 안에서만 상태와 UI를 닫아 둡니다. 코어 전략 모델의 Fat Interface 부채를 건드리지 않으면서도, 새 설명 기능이 해당 부채에 의존하지 않도록 `StrategyType`과 i18n 메시지 딕셔너리만 사용합니다.

구현 시 반드시 지켜야 할 결론은 다음과 같습니다.

- 설명 버튼은 카드 버튼 안에 넣지 않습니다.
- 상세 본문은 JSX에 직접 쓰지 않습니다.
- `title` 또는 번역 문자열로 분기하지 않습니다.
- 설명 시트 상태를 `App.tsx`로 올리지 않습니다.
- 상세 본문이 비어 있으면 외부 사용자에게 노출하지 않습니다.
