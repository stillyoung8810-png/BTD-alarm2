---
name: 미니앱 모달 높이 안정화 리팩토링 스니펫
overview: 고위험/중위험 모달의 viewport, 내부 스크롤, footer safe-area 문제를 실제 적용 가능한 코드 스니펫으로 정리합니다.
stage: pre-implementation
status: draft
---

# 미니앱 모달 높이 안정화 리팩토링 스니펫

## 적용 원칙

- 이 문서는 실제 코드 변경 전 스니펫입니다.
- 금융 계산, 저장 handler, 결제 handler, async mutex는 변경하지 않습니다.
- 새 UI 문구를 추가하지 않습니다.
- 새 컴포넌트 추상화는 만들지 않고, 반복되는 Tailwind class-token만 공통 상수로 분리합니다.

## 1. 공통 레이아웃 token

대상 파일: `components/ui/constants.ts`

```ts
export const MINIAPP_MODAL_LAYOUT = {
  overlay:
    'fixed inset-0 flex min-h-[100dvh] items-center justify-center px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
  panel: 'relative flex min-h-0 max-h-full w-full flex-col overflow-hidden',
  header: 'shrink-0',
  body: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
  footer: 'shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
} as const;
```

검토:

- `max-h-full`은 overlay의 `min-h-[100dvh]`와 safe-area padding 안에서 동작합니다.
- `body`에 `min-h-0`이 있어 flex child가 실제로 줄어들 수 있습니다.
- footer의 bottom padding은 홈 인디케이터/미니앱 하단 inset과 버튼 겹침을 줄입니다.

## 2. 고위험 모달 공통 import

대상 파일:

- `components/TradeExecutionModal.tsx`
- `components/QuickInputModal.tsx`

```ts
import { MINIAPP_MODAL_LAYOUT } from './ui/constants';
```

주의:

- import 외에는 함수/상태/handler를 건드리지 않습니다.
- `handleSave`, `isExecutingTradeRef`, `isSaving`, `isSaveDisabled`, `Promise.resolve(onSave(...))`는 반드시 유지합니다.
- 아래 스니펫은 “전체 return 교체”가 아니라 기존 JSX의 `className` 부분만 바꾸는 지시입니다.

## 3. `TradeExecutionModal` 부분 교체

대상 파일: `components/TradeExecutionModal.tsx`

overlay 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.overlay} z-[120]`}>
```

panel 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.panel} z-[121] max-w-2xl rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl`}
  style={{ touchAction: 'pan-y' }}
>
```

header 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.header} flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6`}
>
```

body 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.body} space-y-6 p-6`}>
```

footer 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.footer} flex gap-4 border-t border-slate-200 bg-slate-50 px-6 pt-6`}
>
```

유지해야 하는 코드:

```tsx
onClick={() => {
  void onSave();
}}
disabled={isSaveDisabled}
aria-busy={isSaving}
```

## 4. `QuickInputModal` 부분 교체

대상 파일: `components/QuickInputModal.tsx`

overlay 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.overlay} z-[120]`}>
```

panel 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.panel} z-[121] max-w-md rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl`}
  style={{ touchAction: 'pan-y' }}
>
```

header 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.header} flex items-center justify-between border-b border-slate-200 p-6`}
>
```

body 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.body} space-y-6 p-6`}>
```

footer 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.footer} flex gap-4 border-t border-slate-200 bg-slate-50 px-6 pt-6`}
>
```

유지해야 하는 코드:

```tsx
onClick={() => {
  void onSave();
}}
disabled={isSaveDisabled}
aria-busy={isSaving}
```

## 5. `InfoModal` 부분 교체

대상 파일: `components/InfoModal.tsx`

추가 import:

```ts
import { MINIAPP_MODAL_LAYOUT } from './ui/constants';
```

overlay 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.overlay} z-[220]`}>
```

panel 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.panel} max-w-sm rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]`}
  style={{ touchAction: 'pan-y' }}
>
```

header 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.header} flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-900/40`}
>
```

body 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.body} p-6`}>
```

footer 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.footer} px-6 pt-0`}>
```

유지해야 하는 코드:

```tsx
role="button"
tabIndex={0}
aria-label={closeAriaLabel}
onKeyDown={(event) => {
  handlePressEnterOrSpace(event, onClose);
}}
```

## 6. `CheckoutModal` 최소 교체

대상 파일: `components/CheckoutModal.tsx`

추가 import:

```ts
import { MINIAPP_MODAL_LAYOUT } from './ui/constants';
```

header 교체:

```tsx
<div
  className={`${MINIAPP_MODAL_LAYOUT.header} flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#0B0F19]`}
>
```

body 교체:

```tsx
<div className={`${MINIAPP_MODAL_LAYOUT.body} space-y-6 p-6`}>
```

삭제 대상:

```tsx
max-h-[calc(100vh-8rem)]
```

주의:

- `TDSModal`의 overlay/panel은 이미 `MODAL.overlay`와 `MODAL.panel`을 사용하므로 교체하지 않습니다.
- 기존 결제 버튼은 body 내부에 그대로 둡니다. CTA sticky footer 전환은 결제 화면 UX 변경 폭이 커서 이번 범위에서는 제외합니다.
- `isExecutingRef` 기반 결제 mutex와 `await Promise.resolve(handleTossIapPay())`는 변경하지 않습니다.

## 7. `SettlementModals` 최소 교체

대상 파일: `components/SettlementModals.tsx`

추가 import는 필요하지 않습니다. 출시 직전 변경 폭을 줄이기 위해 기존 overlay/panel은 유지하고 header/body/footer class만 보강합니다.

header 교체:

```tsx
<div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-6 pb-2 md:p-8 dark:border-white/5">
```

body 교체:

```tsx
<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 md:p-8">
```

footer 교체:

```tsx
<div className="shrink-0 border-t border-slate-200 px-8 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] dark:border-white/5">
```

유지해야 하는 코드:

```tsx
className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#161d2a] dark:shadow-2xl"
```

## 구현 전 체크리스트

- `npx vitest run --config docs2/miniapp_modal_layout_vitest.config.ts` 통과
- 구현 후 실제 코드 기반 테스트 추가 및 통과
- 스니펫 적용 후 `ReadLints`로 변경 파일 진단
- 저장/취소/결제 handler, mutex, `Promise.resolve(...)` 동작 변경 없음 확인
- 작은 화면 수동 확인: 320px 폭, 568px 높이 기준에서 footer 접근 가능
- iOS/Android WebView safe-area 하단 겹침 없음 확인

## 구현 후 실제 파일 검증 스니펫

아래 스니펫은 구현 후 별도 테스트 파일로 옮겨 실제 파일 내용을 검증하는 용도입니다. 사전 시뮬레이션처럼 문서 내 문자열을 검사하지 않고, 구현된 파일을 대상으로 검사해야 합니다.

```ts
type RuntimeFileContract = {
  readonly path: string;
  readonly mustContain: readonly string[];
  readonly mustNotContain?: readonly string[];
};

const RUNTIME_FILE_CONTRACTS: readonly RuntimeFileContract[] = [
  {
    path: 'components/ui/constants.ts',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'min-h-[100dvh]',
      'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      'env(safe-area-inset-bottom,0px)',
    ],
  },
  {
    path: 'components/TradeExecutionModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingTradeRef',
      'Promise.resolve(onSave(',
      'aria-busy={isSaving}',
    ],
  },
  {
    path: 'components/QuickInputModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingTradeRef',
      'Promise.resolve(onSave(',
      'aria-busy={isSaving}',
    ],
  },
  {
    path: 'components/InfoModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'role="button"',
      'tabIndex={0}',
      'handlePressEnterOrSpace',
    ],
  },
  {
    path: 'components/CheckoutModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingRef',
      'await Promise.resolve(handleTossIapPay())',
    ],
    mustNotContain: ['max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/SettlementModals.tsx',
    mustContain: [
      'max-h-[calc(100dvh-2rem)]',
      'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      'pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
    ],
    mustNotContain: ['MINIAPP_MODAL_LAYOUT'],
  },
];
```

검토:

- `SettlementModals`는 출시 직전 변경 폭을 줄이기 위해 공통 상수를 import하지 않습니다.
- `TradeExecutionModal`, `QuickInputModal`, `CheckoutModal`은 저장/결제 mutex와 `Promise.resolve(...)` 유지 여부를 같이 확인합니다.
- 이 계약은 문자열 기반 smoke test입니다. 통과 후에도 작은 화면 수동 확인은 별도로 필요합니다.
