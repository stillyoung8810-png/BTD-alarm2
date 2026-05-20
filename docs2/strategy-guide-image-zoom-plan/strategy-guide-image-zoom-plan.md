---
name: 전략 설명 이미지 줌 계획서
overview: 전략 설명 시트 안의 가이드 이미지를 라이브러리 기반으로 확대/이동 가능하게 만들기 위한 별도 구현 계획입니다.
stage: pre-implementation
status: draft
---

# 전략 설명 이미지 줌 계획서

## 0. 목표

전략 설명 시트에 표시되는 인포그래픽 이미지를 손가락 pinch/pan으로 확대하고 이동할 수 있게 합니다. 이 기능은 기본 전략 설명 시트 계획과 분리합니다.

기본 시트/이미지 연결 계획:

- `docs2/strategy-guide-sheet-plan/strategy-guide-sheet-plan.md`

현재는 TVC(`vr_band`) 이미지만 연결되어 있습니다. 나머지 전략 이미지는 준비되면 기본 시트 계획에 따라 연결하고, 이 줌 컴포넌트는 동일하게 재사용합니다.

## 1. 명시적 가정

- 현재 `StrategyGuideSheet`는 TDS BottomSheet가 아니라 자체 `fixed overlay + section[role="dialog"]` 구조입니다.
- 현재 코드에는 drag-to-close 시트 제스처가 없습니다.
- 향후 BottomSheet로 전환될 경우, 부모 BottomSheet의 drag gesture API를 먼저 확인해야 합니다.
- TDS Mobile 공식 문서에서 독립적인 이미지 pinch zoom 컴포넌트는 확인되지 않았습니다.
- 따라서 줌 기능은 `react-zoom-pan-pinch` 같은 일반 React UI 라이브러리로 격리 구현합니다.

## 2. 범위

포함:

- `react-zoom-pan-pinch` 설치
- `ZoomableImage.tsx` 신규 분리
- 이미지 `src` 누락/로드 실패 fallback
- 미니앱 WebView 제스처 충돌 완화
- reset zoom 컨트롤
- i18n 라벨 확장

제외:

- 기본 설명 시트 버튼/시트 연결
- 전략별 이미지 자산 추가
- 금융 계산, 주문, 저장 로직
- `StrategyType` 전체 리팩토링
- TDS BottomSheet 전환

## Phase 1: Dependencies & Setup

## 3. 패키지 설치

프로젝트 루트에서 실행합니다.

```bash
npm install react-zoom-pan-pinch
```

설치 후 검증:

```bash
npm run typecheck:app
```

주의:

- 이 프로젝트는 `npm` 기준입니다. `yarn add` 또는 `pnpm add`를 쓰지 않습니다.
- 설치 후 `package.json`과 `package-lock.json`이 변경됩니다.
- 설치된 버전의 타입 정의를 반드시 확인합니다.

## 4. 라이브러리 타입 검증 차단 조건

설치 직후 다음을 확인합니다.

```text
node_modules/react-zoom-pan-pinch
└─ TransformWrapper props
└─ TransformComponent props
└─ useControls return type
```

확인 항목:

- `TransformWrapper`에 `initialScale`, `minScale`, `maxScale`, `centerOnInit`, `limitToBounds` prop이 존재하는지 확인합니다.
- `wheel`, `pinch`, `panning`, `doubleClick` option prop 이름과 타입을 확인합니다.
- `TransformComponent`에 `wrapperClass`, `contentClass`가 존재하는지 확인합니다.

차단 조건:

- 위 prop 중 하나라도 타입 정의와 다르면 구현을 멈추고, 설치된 버전의 타입에 맞춰 이 문서를 먼저 수정합니다.
- 타입 검증 전에는 구현 완료로 간주하지 않습니다.

## Phase 2: Component Architecture

## 5. 컴포넌트 계층

목표 JSX 트리:

```text
StrategyGuideSheet
└─ div.strategyGuideBody
   └─ ZoomableImage
      ├─ fallback UI when src missing/error
      └─ div.zoomableImageFrame
         └─ div.zoomableImageGestureBoundary
            └─ TransformWrapper
               ├─ ZoomableImageControls
               │  └─ reset zoom button
               └─ TransformComponent
                  └─ img
```

책임 분리:

- `StrategyGuideSheet`: 시트 레이아웃, 닫기, `ZoomableImage` 호출만 담당합니다.
- `ZoomableImage`: 이미지 상태, fallback, 줌/팬/핀치, 제스처 격리만 담당합니다.
- `ZoomableImageControls`: reset zoom 버튼만 담당합니다.

금지:

- `StrategyGuideSheet.tsx`에서 `TransformWrapper`를 직접 import하지 않습니다.
- `StrategyGuideSheet.tsx`에 줌 상태를 두지 않습니다.
- 줌 라이브러리 옵션 객체를 JSX inline으로 넘기지 않습니다.

## 6. 타입 계획

대상 파일: `components/strategyCreator/types/ui.ts`

```ts
export interface ZoomableImageLabels {
  resetZoomLabel: string;
  resetZoomAriaLabel: string;
  brokenImageMessage: string;
}

export interface ZoomableImageProps {
  src: string | null | undefined;
  alt: string;
  labels: ZoomableImageLabels;
  isZoomEnabled?: boolean;
}
```

기본 시트 타입의 라벨도 다음처럼 확장합니다.

```ts
export interface StrategyGuideSheetLabels {
  closeLabel: string;
  closeAriaLabel: string;
  dialogTitle: string;
  brokenImageMessage: string;
  image: ZoomableImageLabels;
}
```

검토:

- `src`는 null/undefined를 허용하고 컴포넌트 내부에서 guard 처리합니다.
- boolean prop은 `isZoomEnabled`로 명명합니다.
- `any`를 사용하지 않습니다.

## 7. 메시지 계획

대상 파일: `constants/messages/strategyCreatorMessages.ts`

```ts
strategyGuide: {
  labels: {
    closeLabel: string;
    closeAriaLabel: string;
    dialogTitle: string;
    brokenImageMessage: string;
    image: {
      resetZoomLabel: string;
      resetZoomAriaLabel: string;
      brokenImageMessage: string;
    };
  };
  vrBand: {
    title: string;
    openButtonAriaLabel: string;
    overviewImageAlt: string;
  };
};
```

검토:

- reset zoom 문구와 이미지 fallback 문구는 i18n 딕셔너리에서 가져옵니다.
- JSX에 한국어/영어를 직접 쓰지 않습니다.
- 번역 문자열로 로직 분기하지 않습니다.

## 8. 스타일 토큰 계획

대상 파일: `components/strategyCreator/styles.ts`

```ts
zoomableImageFrame:
  'relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-950',
zoomableImageGestureBoundary:
  'relative h-full min-h-[320px] w-full overflow-hidden',
zoomableImageTransformWrapper: 'h-full w-full',
zoomableImageTransformContent: 'h-full w-full',
zoomableImage:
  'block h-auto w-full select-none rounded-2xl object-contain',
zoomableImageControls:
  'absolute right-3 top-3 z-10 flex items-center gap-2',
zoomableImageResetButton:
  'rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800',
zoomableImageFallback:
  'flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 px-6 text-center text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400',
```

검토:

- 줌 관련 class를 컴포넌트 JSX에 흩뿌리지 않습니다.
- `min-h-[320px]`는 named token 내부에서만 관리합니다.

## Phase 3: Code Snippets

## 9. ZoomableImage 스니펫

대상 파일: `components/strategyCreator/ZoomableImage.tsx`

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  TransformComponent,
  TransformWrapper,
  useControls,
} from 'react-zoom-pan-pinch';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { ZoomableImageLabels, ZoomableImageProps } from './types/ui';

const MIN_SCALE = 1;
const INITIAL_SCALE = 1;
const MAX_SCALE = 4;

type TransformWrapperComponentProps = React.ComponentProps<
  typeof TransformWrapper
>;

const ZOOM_WHEEL_OPTIONS: NonNullable<
  TransformWrapperComponentProps['wheel']
> = {
  disabled: true,
};

const ZOOM_PINCH_OPTIONS: NonNullable<
  TransformWrapperComponentProps['pinch']
> = {
  disabled: false,
};

const ZOOM_PANNING_OPTIONS: NonNullable<
  TransformWrapperComponentProps['panning']
> = {
  disabled: false,
  velocityDisabled: true,
};

const ZOOM_DOUBLE_CLICK_OPTIONS: NonNullable<
  TransformWrapperComponentProps['doubleClick']
> = {
  disabled: false,
};

const ZOOM_TOUCH_ISOLATION_STYLE: React.CSSProperties = {
  touchAction: 'none',
  overscrollBehavior: 'contain',
};

interface ZoomableImageControlsProps {
  labels: Pick<ZoomableImageLabels, 'resetZoomLabel' | 'resetZoomAriaLabel'>;
}

function ZoomableImageControls({
  labels,
}: ZoomableImageControlsProps): React.ReactElement {
  const { resetTransform } = useControls();

  const handleResetZoom = useCallback(() => {
    resetTransform();
  }, [resetTransform]);

  const handleResetZoomKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      handlePressEnterOrSpace(event, handleResetZoom);
    },
    [handleResetZoom],
  );

  return (
    <div className={STRATEGY_CREATOR_STYLES.zoomableImageControls}>
      <button
        type="button"
        role="button"
        tabIndex={0}
        onClick={handleResetZoom}
        onKeyDown={handleResetZoomKeyDown}
        aria-label={labels.resetZoomAriaLabel}
        className={STRATEGY_CREATOR_STYLES.zoomableImageResetButton}
      >
        {labels.resetZoomLabel}
      </button>
    </div>
  );
}

export function ZoomableImage({
  src,
  alt,
  labels,
  isZoomEnabled = true,
}: ZoomableImageProps): React.ReactElement {
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const resolvedSrc = src?.trim() ?? '';

  useEffect(() => {
    setHasImageLoadError(false);
  }, [resolvedSrc]);

  const handleImageError = useCallback<
    React.ReactEventHandler<HTMLImageElement>
  >(() => {
    setHasImageLoadError(true);
  }, []);

  const handlePointerPropagation = useCallback<
    React.PointerEventHandler<HTMLDivElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  const handleTouchPropagation = useCallback<
    React.TouchEventHandler<HTMLDivElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  const handleWheelPropagation = useCallback<
    React.WheelEventHandler<HTMLDivElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  const shouldShowImageFallback =
    resolvedSrc.length === 0 || hasImageLoadError;

  if (shouldShowImageFallback) {
    return (
      <div className={STRATEGY_CREATOR_STYLES.zoomableImageFallback}>
        {labels.brokenImageMessage}
      </div>
    );
  }

  if (!isZoomEnabled) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        draggable={false}
        onError={handleImageError}
        className={STRATEGY_CREATOR_STYLES.zoomableImage}
      />
    );
  }

  return (
    <div
      className={STRATEGY_CREATOR_STYLES.zoomableImageFrame}
      onPointerDown={handlePointerPropagation}
      onPointerMove={handlePointerPropagation}
      onTouchStart={handleTouchPropagation}
      onTouchMove={handleTouchPropagation}
      onWheel={handleWheelPropagation}
      style={ZOOM_TOUCH_ISOLATION_STYLE}
    >
      <div className={STRATEGY_CREATOR_STYLES.zoomableImageGestureBoundary}>
        <TransformWrapper
          initialScale={INITIAL_SCALE}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          centerOnInit
          limitToBounds
          wheel={ZOOM_WHEEL_OPTIONS}
          pinch={ZOOM_PINCH_OPTIONS}
          panning={ZOOM_PANNING_OPTIONS}
          doubleClick={ZOOM_DOUBLE_CLICK_OPTIONS}
        >
          <ZoomableImageControls labels={labels} />
          <TransformComponent
            wrapperClass={STRATEGY_CREATOR_STYLES.zoomableImageTransformWrapper}
            contentClass={STRATEGY_CREATOR_STYLES.zoomableImageTransformContent}
          >
            <img
              src={resolvedSrc}
              alt={alt}
              draggable={false}
              onError={handleImageError}
              className={STRATEGY_CREATOR_STYLES.zoomableImage}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}
```

검토:

- `useMemo`로 단순 문자열 trim을 감싸지 않습니다.
- `isZoomEnabled=false`를 이미지 로드 실패로 취급하지 않습니다.
- 이벤트 handler는 inline으로 만들지 않습니다.
- 라이브러리 옵션 객체는 모듈 상단 상수입니다.
- capture phase 차단을 기본값으로 쓰지 않습니다.

## 10. StrategyGuideSheet 수정 스니펫

대상 파일: `components/strategyCreator/StrategyGuideSheet.tsx`

추가 import:

```tsx
import { ZoomableImage } from './ZoomableImage';
```

이미지 영역 교체:

```tsx
<div className={STRATEGY_CREATOR_STYLES.strategyGuideBody}>
  <ZoomableImage
    src={entry.overviewImageSrc}
    alt={entry.overviewImageAlt}
    labels={labels.image}
  />
</div>
```

검토:

- 부모 시트에는 줌 로직을 넣지 않습니다.
- 부모 시트는 primitive/string props와 labels 객체만 전달합니다.
- 줌 라이브러리 import는 `ZoomableImage.tsx`에만 존재합니다.

## Phase 4: Edge Case & WebView Mitigation

## 11. 미니앱 WebView 제스처 충돌 방지

기본 방어:

- `touchAction: 'none'`
- `overscrollBehavior: 'contain'`
- bubble phase에서 `stopPropagation`
- 부모 시트가 capture phase에서 drag를 잡는 구조라면 부모 BottomSheet의 drag disable/ignore selector API를 우선 확인

Mental Compile:

```text
사용자: 이미지 영역에 두 손가락 터치
→ ZoomableImage frame이 touch/pointer 이벤트 수신
→ event.stopPropagation()
→ 부모 overlay 또는 향후 BottomSheet drag handler로 전파 감소
→ TransformWrapper가 pinch/pan 계산
→ img에 transform 적용
```

주의:

- `preventDefault()`는 기본값으로 남발하지 않습니다.
- 현재 기본 시트에는 drag-to-close가 없으므로, 실제 충돌은 토스 WebView bounce/스크롤과의 충돌을 우선 확인합니다.

## 12. 검증 체크리스트

정적 검증:

```bash
npm run typecheck:app
```

수동 QA:

- TVC 설명 시트에서 이미지가 보입니다.
- 두 손가락 pinch로 확대됩니다.
- 확대 상태에서 pan이 됩니다.
- reset zoom 버튼으로 확대 상태가 초기화됩니다.
- 이미지 영역 조작 중 시트가 닫히지 않습니다.
- 이미지 경로가 잘못되면 fallback 메시지가 보입니다.
- `rsi_ma_interval`, `multi_split`, `no_stop_multi_split` 이미지가 준비되면 같은 컴포넌트를 재사용할 수 있습니다.

## 13. 금지 사항

- `StrategyGuideSheet.tsx`에 `TransformWrapper`를 직접 import하지 않습니다.
- `any`를 쓰지 않습니다.
- `src!`를 쓰지 않습니다.
- JSX에 한국어/영어 문구를 직접 쓰지 않습니다.
- `wheel={{ disabled: true }}` 같은 inline object prop을 쓰지 않습니다.
- `onTouchStart={(event) => ...}` 같은 inline handler를 쓰지 않습니다.
- 설치된 라이브러리 타입 확인 없이 스니펫을 확정하지 않습니다.
