---
name: 전략 설명 시트 기본 계획서
overview: 새 포트폴리오 생성 플로우의 전략 선택 카드에 데이터 기반 설명 버튼과 전략별 인포그래픽 이미지를 연결하기 위한 기본 계획입니다.
stage: implemented
status: completed
---

# 전략 설명 시트 기본 계획서

## 0. 목표

새 포트폴리오 생성 모달의 첫 단계인 전략 선택 화면에서, 사용자가 전략별 설명을 바로 확인할 수 있게 합니다. 설명 진입점은 각 전략 카드 우측 상단의 작은 정보 버튼입니다.

현재는 이동평균선 구간 전략(`rsi_ma_interval`), TVC(`vr_band`), Smart Split(`multi_split`), 무손절 다분할(`no_stop_multi_split`) 전략의 인포그래픽 이미지가 준비되어 있습니다. 이후 전략 이미지도 **렌더링 컴포넌트/컨트롤러 코드를 수정하지 않고**, 자산 맵과 i18n 데이터만 추가해서 같은 방식으로 연결합니다.

이미지 확대/핀치 줌 기능은 이 문서에서 다루지 않습니다. 해당 기능은 별도 문서 `docs2/strategy-guide-image-zoom-plan/strategy-guide-image-zoom-plan.md`에서 관리합니다.

**관련 지식 문서 (NotebookLM·카피 작성용):**

| 문서 | 용도 |
|---|---|
| [`NOTEBOOKLM_SMART_SPLIT_PROMPT.md`](./NOTEBOOKLM_SMART_SPLIT_PROMPT.md) | **NotebookLM 복붙용 프롬프트** (본문 + 후속 수정 프롬프트) |
| [`NOTEBOOKLM_SMART_SPLIT_MODAL_BRIEF.md`](./NOTEBOOKLM_SMART_SPLIT_MODAL_BRIEF.md) | 조사 범위·앱 고정 사실·산출물 체크리스트 |
| [`NO_STOP_NOTEBOOKLM_CONTEXT.md`](./NO_STOP_NOTEBOOKLM_CONTEXT.md) | 앱 계산 SSOT(§0 역할, §9 스마트 스플릿 vs 무손절 비교) |
| [`NOTEBOOKLM_MA_STRATEGY_CONTEXT.md`](./NOTEBOOKLM_MA_STRATEGY_CONTEXT.md) | 이동평균선 구간 전략 계산·구간 판정·필터 로직 SSOT |
| [`NOTEBOOKLM_MA_STRATEGY_ANALYSIS_REPORT.md`](./NOTEBOOKLM_MA_STRATEGY_ANALYSIS_REPORT.md) | NotebookLM이 정리한 이동평균선 구간 전략 장단점·카피 참고 보고서 |
| [`NOTEBOOKLM_MA_STRATEGY_INFOGRAPHIC_PROMPT.md`](./NOTEBOOKLM_MA_STRATEGY_INFOGRAPHIC_PROMPT.md) | 이동평균선 구간 전략 인포그래픽 제작 프롬프트 |

## 1. 핵심 설계 결정

TVC만 콕 집어서 별도 JSX 분기를 만들지 않습니다. 모든 전략 카드는 `definitions.map`으로 동일한 `StrategyDefinitionCard` 컴포넌트를 렌더링합니다.

정보 버튼 노출 여부는 데이터 유무로만 결정합니다.

```text
strategyGuideEntriesByStrategy[definition.id] != null
```

향후 다른 전략 이미지가 준비되면 다음 데이터만 추가합니다.

- `constants/strategyGuideAssets.ts`의 이미지 경로 맵
- `constants/messages/strategyCreatorMessages.ts`의 i18n entry

컴포넌트 렌더링 코드는 바꾸지 않습니다.

## 2. 범위

이번 기본 계획에 포함합니다.

- 전략 선택 카드에 설명 버튼 추가
- 모든 전략 카드를 동일한 구조로 렌더링
- 가이드 데이터가 있는 전략에만 설명 버튼 표시
- 설명 시트를 `StrategyCreator` 내부 오버레이로 렌더링
- 현재는 이동평균선 구간 전략, TVC, Smart Split, 무손절 다분할 인포그래픽 이미지를 표시
- 이후 전략은 이미지 준비 후 데이터만 추가해서 연결
- UI 텍스트는 `constants/messages/strategyCreatorMessages.ts`에서 관리

이번 기본 계획에서 제외합니다.

- 이미지 핀치 줌/팬 기능
- `react-zoom-pan-pinch` 또는 기타 줌 라이브러리 설치
- 하단 네비게이션 탭 추가
- 멤버십 탭 내부 콘텐츠 추가
- 코어 `StrategyType`, `Portfolio`, 전략 데이터 모델 리팩토링
- 금융 계산, 주문 생성, 저장 로직 변경

## 3. 자산 데이터 계획

대상 파일: `constants/strategyGuideAssets.ts`

최종 파일은 기존 `TVC_GUIDE_OVERVIEW_IMAGE_SRC`와 해당 주석 없이 아래 맵만 남깁니다.

```ts
import type { StrategyType } from '@/src/components/StrategyCreator/utils';

export const STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY = {
  rsi_ma_interval: '/images/strategy-guides/ma-strategy-guide-overview.png',
  multi_split: '/images/strategy-guides/smart-split-guide-overview.png',
  no_stop_multi_split:
    '/images/strategy-guides/no-stop-multi-split-guide-overview.png',
  vr_band: '/images/strategy-guides/tvc-guide-overview.png',
} as const satisfies Partial<Record<StrategyType, string>>;
```

검토:

- 준비되지 않은 전략 이미지를 임의로 추가하지 않습니다.
- `rsi_ma_interval` 이미지는 `public/images/strategy-guides/ma-strategy-guide-overview.png`에 저장합니다.
- `multi_split` 이미지는 `public/images/strategy-guides/smart-split-guide-overview.png`에 저장합니다.
- `no_stop_multi_split` 이미지는 `public/images/strategy-guides/no-stop-multi-split-guide-overview.png`에 저장합니다.
- `vr_band` 이미지는 `public/images/strategy-guides/tvc-guide-overview.png`에 저장합니다.
- 이미지 경로는 전략 ID 기반 맵으로 관리합니다.
- 이미지 경로를 JSX에 직접 하드코딩하지 않습니다.
- 새 전략이 `StrategyType`에 추가되어도 이 맵은 `Partial<Record<StrategyType, string>>`이므로 미준비 상태를 허용합니다.
- 기존 `TVC_GUIDE_OVERVIEW_IMAGE_SRC` 상수는 새 맵으로 완전히 대체합니다. 구현 시 기존 상수를 삭제하여 dead code를 남기지 않고, `STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY`만 전략 가이드 이미지 경로의 단일 진실 공급원으로 유지합니다.

## 4. 컴포넌트 경계

목표 구조:

```text
StrategyCreator
├─ StrategyCreatorLayout
│  └─ StrategySelectionStepView
│     └─ definitions.map(...)
│        └─ StrategyDefinitionCard
│           ├─ select button
│           └─ optional guide info button
└─ StrategyGuideSheet
   └─ img
```

책임 분리:

- `StrategyCreator`: 컨트롤러와 시트 렌더링을 연결합니다.
- `useStrategyCreatorController`: 설명 시트 open/close 상태, 가이드 entry lookup 생성을 담당합니다.
- `StrategySelectionStepView`: 전략 카드 목록을 동일 구조로 렌더링합니다.
- `StrategyDefinitionCard`: 카드 선택 버튼과 선택적 설명 버튼을 분리합니다.
- `StrategyGuideSheet`: 설명 시트 레이아웃, 닫기, 이미지 표시만 담당합니다.
- `strategyCreatorMessages`: 모든 UI 문구, aria-label, 이미지 alt를 담당합니다.

## 5. 타입 계획

대상 파일: `components/strategyCreator/types/ui.ts`

```ts
import type {
  StrategyGuideEntryMessage,
  StrategyGuideLabelsMessage,
} from '@/constants/messages/strategyCreatorMessages';

export interface StrategyGuideEntryViewModel
  extends StrategyGuideEntryMessage {
  id: StrategyType;
  overviewImageSrc: string;
}

export type StrategyGuideEntryLookup = Readonly<
  Partial<Record<StrategyType, StrategyGuideEntryViewModel>>
>;

export type StrategyGuideSheetLabels = StrategyGuideLabelsMessage;

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
  guideEntriesByStrategy: StrategyGuideEntryLookup;
  onSelectStrategy: (strategy: StrategyType) => void;
  onOpenStrategyGuide: (strategy: StrategyType) => void;
}
```

검토:

- 안내 문구 타입(`StrategyGuideEntryMessage`, `StrategyGuideLabelsMessage`)은 메시지 딕셔너리 파일이 소유합니다.
- UI 타입 파일은 메시지 타입을 소비만 하며, `constants/messages/strategyCreatorMessages.ts`가 UI 컴포넌트 타입에 의존하지 않습니다.
- `StrategyType`은 `components/strategyCreator/types/ui.ts`의 기존 import 블록에 이미 포함되어 있으므로 중복 import를 추가하지 않습니다.
- `StrategyGuideEntryViewModel.id`는 `StrategyType`입니다. TVC만 특별 취급하지 않습니다.
- 가이드 미준비 전략은 lookup에 entry가 없는 상태로 표현합니다.
- `any`와 non-null assertion을 사용하지 않습니다.
- 콜백 prop은 `on*` 규칙을 지킵니다.

## 6. 메시지 계획

대상 파일: `constants/messages/strategyCreatorMessages.ts`

`StrategyCreatorMessageSet`에 다음 구조를 추가합니다. `strategyGuide` 필드는 `strategySelection` 바로 다음, `strategyDefinitions` 바로 전에 삽입합니다.

```ts
import type { StrategyType } from '@/src/components/StrategyCreator/utils';

export interface StrategyGuideLabelsMessage {
  closeLabel: string;
  closeAriaLabel: string;
  dialogTitle: string;
  brokenImageMessage: string;
}

export interface StrategyGuideEntryMessage {
  title: string;
  openButtonAriaLabel: string;
  overviewImageAlt: string;
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
  strategyGuide: {
    labels: StrategyGuideLabelsMessage;
    entries: Partial<Record<StrategyType, StrategyGuideEntryMessage>>;
  };
  strategyDefinitions: {
    rsi_ma_interval: { title: string; description: string };
    multi_split: { title: string; description: string };
    no_stop_multi_split: { title: string; description: string };
    vr_band: { title: string; description: string };
  };
  // 기존 tierLabels 이하 필드는 그대로 유지합니다.
}
```

한국어 메시지 예시:

```ts
strategyGuide: {
  labels: {
    closeLabel: '닫기',
    closeAriaLabel: '전략 설명 닫기',
    dialogTitle: '전략 설명',
    brokenImageMessage: '전략 설명 이미지를 불러오지 못했어요.',
  },
  entries: {
    rsi_ma_interval: {
      title: '이동평균선 구간 전략',
      openButtonAriaLabel: `${STRATEGY_NAMES_KO.rsi_ma_interval} 전략 설명 보기`,
      overviewImageAlt:
        '이동평균선 구간 전략의 3구간 판정과 보조 지표 필터를 설명하는 인포그래픽',
    },
    multi_split: {
      title: '다분할 매매',
      openButtonAriaLabel: `${STRATEGY_NAMES_KO.multi_split} 전략 설명 보기`,
      overviewImageAlt:
        'Smart Split 전략의 분할 매수와 2단 익절 구조를 설명하는 인포그래픽',
    },
    no_stop_multi_split: {
      title: '무손절 다분할',
      openButtonAriaLabel: `${STRATEGY_NAMES_KO.no_stop_multi_split} 전략 설명 보기`,
      overviewImageAlt:
        '무손절 다분할 전략의 분할 매수와 전량 익절 구조를 설명하는 인포그래픽',
    },
    vr_band: {
      title: 'TVC 전략 기술적 가이드라인',
      openButtonAriaLabel: `${STRATEGY_NAMES_KO.vr_band} 전략 설명 보기`,
      overviewImageAlt: 'TVC 전략 기술적 가이드라인 개요 이미지',
    },
  },
},
```

영어 메시지 예시:

```ts
strategyGuide: {
  labels: {
    closeLabel: 'Close',
    closeAriaLabel: 'Close strategy guide',
    dialogTitle: 'Strategy Guide',
    brokenImageMessage: 'The strategy guide image could not be loaded.',
  },
  entries: {
    rsi_ma_interval: {
      title: 'MA Strategy',
      openButtonAriaLabel: `View ${STRATEGY_NAMES_EN.rsi_ma_interval} strategy guide`,
      overviewImageAlt:
        'Infographic explaining the MA Strategy zone determination and indicator filters',
    },
    multi_split: {
      title: 'Smart Split',
      openButtonAriaLabel: `View ${STRATEGY_NAMES_EN.multi_split} strategy guide`,
      overviewImageAlt:
        'Infographic explaining Smart Split staged buying and two-level take-profit structure',
    },
    no_stop_multi_split: {
      title: 'No-Stop Multi-Split',
      openButtonAriaLabel: `View ${STRATEGY_NAMES_EN.no_stop_multi_split} strategy guide`,
      overviewImageAlt:
        'Infographic explaining the no-stop multi-split staged buying and full take-profit structure',
    },
    vr_band: {
      title: 'TVC Strategy Technical Guideline',
      openButtonAriaLabel: `View ${STRATEGY_NAMES_EN.vr_band} strategy guide`,
      overviewImageAlt: 'TVC strategy technical guideline overview image',
    },
  },
},
```

검토:

- JSX에 한국어/영어 문구를 직접 쓰지 않습니다.
- 전략명 문자열로 로직 분기하지 않습니다.
- 메시지 딕셔너리가 안내 문구 타입을 직접 소유하므로 UI 컴포넌트 타입에 의존하지 않습니다.
- `strategyGuide` 필드는 반드시 `StrategyCreatorMessageSet` 인터페이스 내부에 선언합니다. 최상위에 단독 `strategyGuide: { ... };` 블록을 두지 않습니다.
- 이동평균선 구간 전략(`rsi_ma_interval`), Smart Split(`multi_split`), 무손절 다분할(`no_stop_multi_split`), TVC(`vr_band`)는 `entries`와 이미지 맵에 모두 등록합니다.
- 향후 다른 전략 이미지는 `entries`에 전략 ID 키를 추가해서 연결합니다.
- `entries`와 이미지 맵의 키 불일치는 QA/테스트에서 확인해야 합니다.

## 7. 스타일 토큰 계획

대상 파일: `components/strategyCreator/styles.ts`

`STRATEGY_CREATOR_STYLES`에 다음 토큰을 추가합니다.

```ts
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
strategyGuideImage:
  'w-full rounded-2xl border border-slate-200 dark:border-white/10',
strategyGuideImageFallback:
  'flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 px-6 text-center text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400',
strategyGuideFooter:
  'border-t border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80',
strategyGuideIconButton:
  'rounded-full p-3 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10',
strategyGuideInfoButton:
  'absolute right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
```

값 기준:

- `z-[220]`: 기존 `StrategyCreatorLayout` 오버레이보다 위에 떠야 합니다.
- `h-[min(86vh,760px)]`: 작은 모바일 화면에서 헤더/푸터 포함 여백을 남기는 상한입니다.
- `min-h-[320px]`: 이미지 실패 상태가 빈 시트처럼 보이지 않게 하는 최소 시각 영역입니다.
- `h-11 w-11`: 모바일 터치 환경에서 약 44px 수준의 최소 터치 영역을 확보하기 위한 정보 버튼 크기입니다.

## 8. 설명 시트 스니펫

대상 파일: `components/strategyCreator/StrategyGuideSheet.tsx`

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyGuideSheetProps } from './types/ui';

function renderGuideImage(params: {
  resolvedImageSrc: string;
  alt: string;
  hasImageLoadError: boolean;
  brokenImageMessage: string;
  onImageError: React.ReactEventHandler<HTMLImageElement>;
}): React.ReactElement {
  const {
    resolvedImageSrc,
    alt,
    hasImageLoadError,
    brokenImageMessage,
    onImageError,
  } = params;

  if (resolvedImageSrc.length === 0 || hasImageLoadError) {
    return (
      <div className={STRATEGY_CREATOR_STYLES.strategyGuideImageFallback}>
        {brokenImageMessage}
      </div>
    );
  }

  return (
    <img
      src={resolvedImageSrc}
      alt={alt}
      draggable={false}
      onError={onImageError}
      className={STRATEGY_CREATOR_STYLES.strategyGuideImage}
    />
  );
}

export function StrategyGuideSheet({
  labels,
  entry,
  onClose,
}: StrategyGuideSheetProps): React.ReactElement {
  const titleId = `strategy-guide-title-${entry.id}`;
  const resolvedImageSrc = entry.overviewImageSrc?.trim() ?? '';
  const [hasImageLoadError, setHasImageLoadError] = useState(false);

  useEffect(() => {
    setHasImageLoadError(false);
  }, [resolvedImageSrc]);

  const handleImageError = useCallback<
    React.ReactEventHandler<HTMLImageElement>
  >(() => {
    setHasImageLoadError(true);
  }, []);

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

        <div className={STRATEGY_CREATOR_STYLES.strategyGuideBody}>
          {renderGuideImage({
            resolvedImageSrc,
            alt: entry.overviewImageAlt,
            hasImageLoadError,
            brokenImageMessage: labels.brokenImageMessage,
            onImageError: handleImageError,
          })}
        </div>

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

- 이 스니펫에는 이미지 확대/핀치 줌 기능이 없습니다.
- nested ternary 없이 helper function으로 fallback을 분리합니다.
- fallback 문구는 i18n 딕셔너리에서 가져옵니다.
- backdrop은 interactive div이므로 `role`, `tabIndex`, `onKeyDown`, `aria-label`을 모두 갖습니다.
- `any`와 non-null assertion을 사용하지 않습니다.

## 9. 컨트롤러 연결 계획

대상 파일: `components/strategyCreator/useStrategyCreatorController.tsx`

추가 import:

```ts
import { STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY } from '@/constants/strategyGuideAssets';
import type { StrategyGuideEntryMessage } from '@/constants/messages/strategyCreatorMessages';
import type {
  StrategyGuideEntryLookup,
  StrategyGuideEntryViewModel,
} from './types/ui';
```

순수 helper:

```ts
function buildStrategyGuideEntries(params: {
  definitions: readonly StrategyDefinitionViewModel[];
  messages: Partial<Record<StrategyType, StrategyGuideEntryMessage>>;
  imageSrcByStrategy: Partial<Record<StrategyType, string>>;
}): StrategyGuideEntryLookup {
  const entries: Partial<Record<StrategyType, StrategyGuideEntryViewModel>> = {};

  for (const definition of params.definitions) {
    const message = params.messages[definition.id];
    const overviewImageSrc = params.imageSrcByStrategy[definition.id];

    if (message == null || overviewImageSrc == null) {
      continue;
    }

    entries[definition.id] = {
      id: definition.id,
      title: message.title,
      openButtonAriaLabel: message.openButtonAriaLabel,
      overviewImageAlt: message.overviewImageAlt,
      overviewImageSrc,
    };
  }

  return entries;
}
```

상태:

```ts
const [guideStrategyId, setGuideStrategyId] = useState<StrategyType | null>(
  null,
);
```

파생값과 handler:

```ts
const guideEntriesByStrategy = useMemo(
  () =>
    buildStrategyGuideEntries({
      definitions: strategyDefinitions,
      messages: copy.strategyGuide.entries,
      imageSrcByStrategy: STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY,
    }),
  [copy.strategyGuide.entries, strategyDefinitions],
);

const strategyGuideEntry =
  guideStrategyId == null
    ? null
    : guideEntriesByStrategy[guideStrategyId] ?? null;

const handleOpenStrategyGuide = useCallback((strategy: StrategyType) => {
  setGuideStrategyId(strategy);
}, []);

const handleCloseStrategyGuide = useCallback(() => {
  setGuideStrategyId(null);
}, []);
```

return 객체 추가:

```ts
guideEntriesByStrategy,
strategyGuideEntry,
handleOpenStrategyGuide,
handleCloseStrategyGuide,
```

검토:

- 특정 전략 ID를 컨트롤러 로직에서 분기하지 않습니다.
- 가이드 데이터가 있는 전략만 lookup에 들어갑니다.
- `useMemo`는 `guideEntriesByStrategy` 객체를 child prop으로 넘길 때 referential stability를 유지하기 위한 용도입니다.
- async 작업이 아니므로 mutex 대상이 아닙니다.

## 10. StrategyCreator 연결 계획

대상 파일: `components/strategyCreator/StrategyCreator.tsx`

추가 import:

```ts
import { StrategyGuideSheet } from './StrategyGuideSheet';
```

`StrategySelectionStepView` prop 추가:

```tsx
<StrategySelectionStepView
  lang={lang}
  heading={controller.copy.strategySelection.heading}
  description={controller.copy.strategySelection.description}
  definitions={controller.strategyDefinitions}
  selectedStrategy={controller.selectedStrategy}
  guideEntriesByStrategy={controller.guideEntriesByStrategy}
  onSelectStrategy={controller.handleSelectStrategy}
  onOpenStrategyGuide={controller.handleOpenStrategyGuide}
/>
```

`StrategyCreator`의 최종 `return` AST 계층:

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

- `strategyGuideEntry != null` guard가 있으므로 non-null assertion이 필요 없습니다.
- 설명 시트는 `StrategyCreatorLayout`의 `children` 내부가 아니라 Fragment의 두 번째 자식으로 렌더링합니다.
- 이 AST 계층은 시트를 기존 생성 마법사와 형제 레벨 오버레이로 고정합니다.
- 특정 전략 전용 prop을 추가하지 않습니다.

## 11. 전략 선택 화면 계획

대상 파일: `components/strategyCreator/steps/StrategySelectionStepView.tsx`

카드는 모든 전략에 같은 컴포넌트를 사용합니다.

```tsx
import React, { useCallback } from 'react';
import { Info } from 'lucide-react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  StrategyDefinitionViewModel,
  StrategyGuideEntryViewModel,
  StrategySelectionStepViewProps,
} from '../types/ui';
import type { StrategyType } from '@/src/components/StrategyCreator/utils';
import { LegalDisclaimer } from '@/components/common/LegalDisclaimer';

function getStrategyCardClassName(isSelected: boolean): string {
  if (isSelected) {
    return 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10';
  }

  return 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70';
}

interface StrategyDefinitionCardProps {
  definition: StrategyDefinitionViewModel;
  guideEntry: StrategyGuideEntryViewModel | null;
  isSelected: boolean;
  onSelectStrategy: (strategy: StrategyType) => void;
  onOpenStrategyGuide: (strategy: StrategyType) => void;
}

function StrategyDefinitionCard({
  definition,
  guideEntry,
  isSelected,
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

      {guideEntry != null && (
        <button
          type="button"
          onClick={handleOpenStrategyGuide}
          aria-label={guideEntry.openButtonAriaLabel}
          className={STRATEGY_CREATOR_STYLES.strategyGuideInfoButton}
        >
          <Info size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function StrategySelectionStepView({
  lang,
  heading,
  description,
  definitions,
  selectedStrategy,
  guideEntriesByStrategy,
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
            guideEntry={guideEntriesByStrategy[definition.id] ?? null}
            isSelected={selectedStrategy === definition.id}
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

- 모든 전략을 동일한 카드 컴포넌트로 렌더링합니다.
- TVC 전용 JSX 분기가 없습니다.
- 정보 버튼은 `guideEntry != null`인 전략에만 보입니다.
- 정보 버튼은 카드 선택 버튼 안에 들어가지 않습니다.
- `definition.id`를 stable key로 유지합니다.
- inline object prop을 사용하지 않습니다.
- map 내부에서 inline handler를 만들지 않습니다.

## 12. 가상 런타임 시뮬레이션

```text
사용자: 새 포트폴리오 생성 모달 열기
→ useStrategyCreatorController 실행
→ strategyDefinitions 생성
→ buildStrategyGuideEntries 실행
→ 각 definition.id별로 message와 imageSrc를 조회
→ 현재는 rsi_ma_interval, multi_split, no_stop_multi_split, vr_band에 message + imageSrc가 모두 있음
→ guideEntriesByStrategy.rsi_ma_interval 생성
→ guideEntriesByStrategy.multi_split 생성
→ guideEntriesByStrategy.no_stop_multi_split 생성
→ guideEntriesByStrategy.vr_band 생성
→ StrategyCreator 렌더
→ StrategySelectionStepView 렌더
→ definitions.map으로 모든 전략을 StrategyDefinitionCard로 렌더
→ rsi_ma_interval: guideEntry 있음, 정보 버튼 표시
→ multi_split: guideEntry 있음, 정보 버튼 표시
→ no_stop_multi_split: guideEntry 있음, 정보 버튼 표시
→ vr_band: guideEntry 있음, 정보 버튼 표시
→ 사용자: rsi_ma_interval 정보 버튼 클릭
→ handleOpenStrategyGuide('rsi_ma_interval')
→ guideStrategyId = 'rsi_ma_interval'
→ strategyGuideEntry = guideEntriesByStrategy.rsi_ma_interval
→ StrategyGuideSheet 렌더
→ 이미지 로드 성공: 인포그래픽 표시
→ 닫기 버튼 또는 backdrop activation
→ handleCloseStrategyGuide()
→ guideStrategyId = null
→ StrategyGuideSheet unmount
```

이동평균선 구간 전략, Smart Split, 무손절 다분할 이미지 연결은 다음 데이터 추가만으로 완료됩니다.

```text
STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY.rsi_ma_interval 추가
STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY.multi_split 추가
STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY.no_stop_multi_split 추가
→ ko/en strategyGuide.entries.rsi_ma_interval 추가
→ ko/en strategyGuide.entries.multi_split 추가
→ ko/en strategyGuide.entries.no_stop_multi_split 추가
→ buildStrategyGuideEntries가 자동으로 rsi_ma_interval/multi_split/no_stop_multi_split entry 생성
→ StrategyDefinitionCard가 자동으로 rsi_ma_interval/multi_split/no_stop_multi_split 정보 버튼 표시
→ 컴포넌트 렌더링 코드 수정 없음
```

## 13. 구현 적용 순서

1. `constants/messages/strategyCreatorMessages.ts`에 `StrategyGuideLabelsMessage`, `StrategyGuideEntryMessage`, `strategyGuide` i18n 구조 추가
2. `constants/strategyGuideAssets.ts`에 `STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY` 추가 후 기존 `TVC_GUIDE_OVERVIEW_IMAGE_SRC` 삭제
3. `components/strategyCreator/types/ui.ts`에 가이드 타입 추가
4. `components/strategyCreator/styles.ts`에 시트/버튼 토큰 추가
5. `components/strategyCreator/StrategyGuideSheet.tsx`를 기본 이미지 시트로 정리
6. `components/strategyCreator/useStrategyCreatorController.tsx`에 가이드 lookup/state/handler 추가
7. `components/strategyCreator/StrategyCreator.tsx`에 prop과 시트 렌더링 연결
8. `components/strategyCreator/steps/StrategySelectionStepView.tsx`를 데이터 기반 카드 구조로 교체
9. `npm run typecheck:app`

## 14. 검증 체크리스트

정적 검증:

```bash
npm run typecheck:app
```

수동 QA:

- 모든 전략 카드가 동일한 시각 구조로 보입니다.
- 현재는 이동평균선 구간 전략, TVC, Smart Split, 무손절 다분할 카드에 정보 버튼이 보입니다.
- 가이드 미준비 전략 카드는 기존 선택 동작을 유지합니다.
- 이동평균선 구간 전략, TVC, Smart Split, 무손절 다분할 정보 버튼 클릭 시 설명 시트가 열립니다.
- 각 전략에 연결된 인포그래픽 이미지가 표시됩니다.
- 이미지 경로가 비어 있거나 로드 실패하면 fallback 메시지가 표시됩니다.
- 닫기 버튼과 backdrop 키보드 activation으로 시트가 닫힙니다.
- 이미지 확대/핀치 줌은 이 문서 범위에서 동작하지 않아야 합니다.

데이터 정합성 검증:

- 현재 `Partial<Record>`와 `continue` 로직은 데이터가 부족할 때 정보 버튼을 조용히 숨기는 silent fallback을 의도한 동작으로 유지합니다.
- 이 구조에서는 이미지 맵과 ko/en `strategyGuide.entries`의 키 불일치를 typecheck만으로 강제할 수 없습니다.
- 출시 전 수동 QA에서 `STRATEGY_GUIDE_IMAGE_SRC_BY_STRATEGY`와 ko/en `strategyGuide.entries`의 키가 의도대로 맞는지 확인합니다.

## 15. 별도 문서

이미지 확대/핀치 줌 기능은 별도 계획서에서 관리합니다.

- `docs2/strategy-guide-image-zoom-plan/strategy-guide-image-zoom-plan.md`

해당 문서는 다음을 다룹니다.

- `react-zoom-pan-pinch` 설치
- `ZoomableImage.tsx` 분리
- 미니앱 WebView 제스처 충돌 방지
- reset zoom 컨트롤
- 라이브러리 타입 검증
