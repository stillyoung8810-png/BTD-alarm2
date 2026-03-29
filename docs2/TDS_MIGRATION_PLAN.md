# TDS Migration Plan

## 목적

이 문서는 `BTD-alarm2`의 토스 미니앱 출시 심사를 위해, 토스 디자인 시스템(TDS)을 **전면 개편 없이 선택적으로 도입**하기 위한 구조적 마이그레이션 계획서입니다.

최우선 목표는 [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html?tab=app-nongame-must)의 핵심 문구인 **"사용자 안내나 확인이 필요한 경우 TDS 모달을 사용해요"**를 실무적으로 충족하는 것입니다.

이 문서는 실제 소스 코드를 수정하지 않고도 **AST 레벨에서 Mental Compile**이 가능하도록, 실제 구현에 가까운 TypeScript/React 스니펫을 포함합니다.

## 심사 문구 vs 운영진 해석

### 공식 체크리스트 문구

공개 체크리스트 문구는 **"사용자 안내나 확인이 필요한 경우 TDS 모달을 사용해요"**로 넓게 읽힐 수 있습니다.

### 운영진 답변

운영진 답변 요지는 다음과 같습니다.

- **유저에게 안내를 하기 위한 모달이 노출되는 경우**
- 예: **미니앱 닫기**, 종료, 이탈, 정책 고지
- 이 경우에는 **TDS 모달을 활용**

### 계획서 반영

이 계획서는 적용 범위를 두 층으로 나눕니다.

| 구분 | 의미 | 우선순위 |
|---|---|---|
| `Tier 1-P0` | 운영진 답변에 직접 대응하는 종료/이탈/정책 안내 모달 | 최우선 |
| `Tier 1-P1` | 공개 체크리스트를 보수적으로 커버하는 일반 alert/confirm/결제·삭제 안내 | 차순위 |

즉, **이번 라운드의 필수 목표는 P0**, 시간이 허용되면 **P1까지 확장**하는 전략입니다.

## 전제와 원칙

- **Big Bang Rewrite 금지**: 전략 빌더, 차트, 복합 입력 폼은 유지합니다.
- **P0 우선**: 종료·이탈·정책 고지 모달을 먼저 TDS 계열로 정리합니다.
- **래퍼 우선**: 실제 화면은 TDS 원본을 직접 쓰지 않고 `components/tds-adapter/` 래퍼만 사용합니다.
- **공식 API 경계 유지**: 실제 토스 종료 동작은 이 문서에서 추측하지 않고, `onRequestMiniAppExit` 같은 앱 경계 콜백으로 위임합니다.
- **Strict I18N**: 버튼/제목/본문은 JSX에 하드코딩하지 않고, 별도 다국어 사전에서 주입합니다.
- **Tier 3 보호**: 복잡한 비즈니스 폼은 이번 마이그레이션에서 건드리지 않습니다.
- **확인 다이얼로그 코디네이터**: **`TdsConfirmDialog`만** **`useAsyncTdsConfirm(lang)`** 과 짝을 이룬다(`onConfirm` → `runConfirm`). **기획상 단일 버튼만 노출하는 비동기 안내**는 **`hideCancel={true}`** 로 처리하고 `TdsAlertDialog`로 우회하지 않는다. **`TdsAlertDialog`는 순수 안내(확인 한 번으로 닫힘)** 만 담당하며 `onClose`만 받고, 비동기·로딩·`catch`·에러 토스트는 넣지 않는다(SRP). `useState`에 **콜백 함수를 저장하지 않는다**(Stale Closure·직렬화·디버깅 리스크). 비동기 확인의 **훅 단일 구현** 규칙은 **`TdsConfirmDialog` 경로**에만 적용한다.

## 현재 상태 요약

- `components/tds/TDSModal.tsx`, `components/tds/TDSButton.tsx`, `components/tds/TDSTextField.tsx` 래퍼가 이미 존재합니다.
- 하지만 현재 주석 기준으로는 **토스 전용 분기가 롤백되어 웹 폴백만 동작**합니다.
- 즉, **기본 세팅은 존재하지만, 실제 TDS 연결은 복구되지 않은 상태**입니다.
- 특히 아래 경로에는 브라우저 기본 팝업이 남아 있습니다.
  - `components/History.tsx`
  - `components/CheckoutModal.tsx`
  - `components/AuthModals.tsx`
  - `components/auth/ProfileView.tsx`
  - `hooks/usePortfolios.ts`
  - `App.tsx`

---

## 분석 요약표

| 파일명 | 대상 컴포넌트/심볼 | Tier | 난이도 | 예상 리스크 | 판단 |
|---|---|---:|---|---|---|
| `components/tds/TDSModal.tsx` | `TDSModal` | 1 | Med | 현재는 웹 폴백만 존재 | 코어 래퍼 재정의 필요 |
| `components/AuthModals.tsx` | 로그인/가입/프로필 모달 | 1 | Med | 종료 정책과 연결됨 | `Tier 1-P0` 핵심 |
| `components/CheckoutModal.tsx` | 결제 결과 안내 | 1 | Med | 결제 상태와 알림이 결합 | `Tier 1-P1` 우선 후보 |
| `components/History.tsx` | `window.confirm` | 1 | Low | 호출 방식만 변경 | `Tier 1-P1` 빠른 치환 가능 |
| `components/auth/ProfileView.tsx` | 토스 환불 안내 `alert` | 1 | Low | 단일 안내 메시지 | `Tier 1-P1` 빠른 치환 가능 |
| `hooks/usePortfolios.ts` | 다수 `alert`/`confirm` | 1 | High | Hook이 UI를 직접 호출 | 2차 작업 필요 |
| `components/QuickInputModal.tsx` | 단순 폼 버튼/입력 | 2 | Med | 입력 타입 정합성 | 후순위 |
| `components/SettlementModals.tsx` | 입력/결과 모달 | 2 | Med | 레이아웃 회귀 위험 | 후순위 |
| `components/Toast.tsx` | 토스트 | 2 | Low | 종료 타이밍 점검 필요 | 후순위 |
| `components/CustomDropdown.tsx` | 확장형 드롭다운 | 2 | High | badge/tooltip 등 확장 필드 다수 | 부분 경로만 검토 |
| `components/StrategyCreator.tsx` | 전략 생성기 | 3 | High | 상태·비즈니스 로직 집중 | 절대 보류 |
| `components/strategies/VrBandStrategyForm.tsx` | VR 전략 폼 | 3 | High | 부모와 강결합 | 절대 보류 |
| `components/Backtest.tsx` | 백테스트 폼 | 3 | High | 단계형 폼/슬라이더 결합 | 절대 보류 |
| `components/Markets.tsx` | 차트 화면 | 3 | High | 차트/툴팁/데이터 결합 | 절대 보류 |

---

## Tier 분류

## Tier 1. 심사 필수 & 독립적 교체 가능

### `Tier 1-P0`

- 미니앱 종료 확인
- 뒤로가기 이탈 확인
- 로그인 화면 닫기와 연결된 종료/이탈 안내
- 운영/정책상 반드시 모달로 알려야 하는 차단·고지

### `Tier 1-P1`

- `window.alert`
- `window.confirm`
- 삭제 확인
- 결제 완료/실패/검증 실패 안내
- 환불 경로 안내
- 단순 안내용 커스텀 모달

## Tier 2. 일관성 향상 & 중간 연계성

- Button
- TextField
- Toggle
- Toast
- 단순 Menu/BottomSheet

## Tier 3. 고위험 & 복잡한 비즈니스 로직

- `StrategyCreator.tsx`
- `VrBandStrategyForm.tsx`
- `Dashboard.tsx`
- `Backtest.tsx`
- `BacktestResultsCharts.tsx`
- `Markets.tsx`
- `VrOrderModal.tsx`

---

## Phase 0. 어댑터 컴포넌트 설계 스니펫

이 단계의 목표는 실제 화면이 직접 `TDSModal`을 호출하지 않고, **프로젝트 전용 어댑터**를 통해 TDS를 사용하도록 만드는 것입니다.

## Phase 0-1. 다국어 사전 정의

버튼 텍스트와 문구를 JSX에 하드코딩하지 않기 위해, 별도 사전을 둡니다. 기존 `constants/vrMessages.ts`가 VR 전용이므로, 이 계획서는 **동일 원칙의 별도 SSOT 파일**을 제안합니다.

### `constants/tdsDialogMessages.ts`

```ts
import type { AppLang } from '../types';

export type ExitDialogReason = 'app_exit' | 'auth_close' | 'back_navigation';
export type DialogTone = 'primary' | 'danger';

export interface DialogActionLabels {
  confirm: string;
  cancel: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
}

export interface ExitDialogMessage {
  title: string;
  body: string;
  confirm: string;
}

export interface TdsDialogMessageSet {
  actions: DialogActionLabels;
  exit: Record<ExitDialogReason, ExitDialogMessage>;
  history: {
    clearTitle: string;
    clearBody: string;
    clearConfirm: string;
    /** 내역 초기화 확인 모달을 여는 트리거(버튼 라벨·접근성용) */
    openClearDialog: string;
  };
  refund: {
    guideTitle: string;
    guideBody: string;
    /** 환불 안내 모달을 여는 트리거(버튼 라벨·접근성용) */
    openRefundGuide: string;
  };
  /** 계획서·스토리북 샘플 전용(프로덕션 트리거와 분리 가능) */
  samples: {
    openDangerConfirmSample: string;
  };
  common: {
    acknowledge: string;
    /** 환불·결제 비동기 실패 시 토스트(다이얼로그는 유지) */
    refundActionFailed: string;
    /** 웹 단발 비동기(다이얼로그 미경유) 트리거 버튼 로딩·접근성 라벨 */
    webAsyncProcessing: string;
  };
}

export const TDS_DIALOG_MESSAGES: Record<AppLang, TdsDialogMessageSet> = {
  ko: {
    actions: {
      confirm: '확인',
      cancel: '취소',
      closeAriaLabel: '모달 닫기',
      backdropAriaLabel: '배경 클릭으로 모달 닫기',
    },
    exit: {
      app_exit: {
        title: '미니앱 종료',
        body: '현재 화면을 종료하고 토스 앱으로 돌아갑니다.',
        confirm: '종료하기',
      },
      auth_close: {
        title: '로그인 종료',
        body: '로그인을 닫으면 미니앱이 종료됩니다.',
        confirm: '닫고 종료',
      },
      back_navigation: {
        title: '화면 이탈',
        body: '현재 화면을 나가면 진행 중인 내용이 저장되지 않을 수 있습니다.',
        confirm: '나가기',
      },
    },
    history: {
      clearTitle: '내역 초기화',
      clearBody: '삭제된 내역은 복구할 수 없습니다.',
      clearConfirm: '초기화',
      openClearDialog: '내역 초기화 확인',
    },
    refund: {
      guideTitle: '환불 안내',
      guideBody:
        '안드로이드는 토스 앱 결제내역의 환불 경로를 이용하고, iOS는 애플 고객센터 환불 경로를 이용합니다.',
      openRefundGuide: '환불 안내 보기',
    },
    samples: {
      openDangerConfirmSample: '위험 확인 예시 열기',
    },
    common: {
      acknowledge: '확인',
      refundActionFailed:
        '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      webAsyncProcessing: '처리 중…',
    },
  },
  en: {
    actions: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      closeAriaLabel: 'Close dialog',
      backdropAriaLabel: 'Close dialog from backdrop',
    },
    exit: {
      app_exit: {
        title: 'Exit mini app',
        body: 'This action closes the current screen and returns to Toss.',
        confirm: 'Exit',
      },
      auth_close: {
        title: 'Close login',
        body: 'Closing the login flow exits the mini app.',
        confirm: 'Close and exit',
      },
      back_navigation: {
        title: 'Leave screen',
        body: 'Unsaved progress may be lost if you leave this screen.',
        confirm: 'Leave',
      },
    },
    history: {
      clearTitle: 'Clear history',
      clearBody: 'Deleted history cannot be restored.',
      clearConfirm: 'Clear',
      openClearDialog: 'Open clear history confirmation',
    },
    refund: {
      guideTitle: 'Refund guide',
      guideBody:
        'Use Toss payment history on Android, or Apple Support on iOS, to request a refund.',
      openRefundGuide: 'Open refund guide',
    },
    samples: {
      openDangerConfirmSample: 'Open sample danger confirm',
    },
    common: {
      acknowledge: 'OK',
      refundActionFailed:
        'Something went wrong. Please try again in a moment.',
      webAsyncProcessing: 'Processing…',
    },
  },
};
```

### 설계 포인트

- JSX에는 한국어/영어를 직접 넣지 않습니다.
- 종료 유형은 `ExitDialogReason`으로 분기하고, 번역 문자열로 로직을 분기하지 않습니다.
- 추후 심사 카피가 바뀌더라도 **사전 파일만 수정**하면 됩니다.
- `common.refundActionFailed`는 **모든 `useAsyncTdsConfirm` 실패 토스트의 유일 문구 SSOT**입니다(이름은 역사적이나, 환불 외 비동기 확인에도 동일 키를 씁니다). §5-3·훅 `catch`에서만 참조합니다.
- `common.webAsyncProcessing`은 **웹 단발 비동기 트리거**(다이얼로그 미경유)의 **버튼 로딩 라벨** 전용입니다.

## Phase 0-2. 공통 타입 및 닫힌 상태 팩토리

### `components/tds-adapter/dialogState.ts`

```ts
export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  body: string;
}

export const createClosedAlertDialogState = (): AlertDialogState => ({
  isOpen: false,
  title: '',
  body: '',
});
```

### 설계 포인트

- **확인(`TdsConfirmDialog`) 다이얼로그의 UI 스냅샷은 `useAsyncTdsConfirm`(Phase 0-2b)이 소유**한다. `useState`에 **함수(`onConfirm`)를 넣지 않는다** — 직렬화·디버깅·**Stale Closure**(금융 도메인) 리스크를 피하기 위함이다.
- 단일 알림(`TdsAlertDialog`)만 `AlertDialogState`로 단순 열림/문구를 유지할 수 있다. 비동기 확인이 붙는 스냅샷은 **`useAsyncTdsConfirm` + `TdsConfirmDialog`** 로만 다룬다.

## Phase 0-2b. `useAsyncTdsConfirm` — 비동기 확인 DRY·액션 ref 캡슐화

### `components/tds-adapter/showErrorToast.ts` (토스트 SSOT 진입점)

**이미 번역이 끝난 최종 문자열만** 받는다. JSX 리터럴·임의 하드코딩 문자열을 인자로 넘기는 것은 금지(호출부 리뷰로 검증).

```ts
/**
 * @param message 반드시 `TDS_DIALOG_MESSAGES[lang].…` 등 사전에서 조회한 값만 허용.
 */
export function showErrorToast(message: string): void {
  // 프로젝트 표준 토스트로 위임 (예: 전역 Toast 컨텍스트, sonner, 커스텀 컴포넌트)
}
```

### `components/tds-adapter/useAsyncTdsConfirm.ts`

로딩·`try` / `catch` / `finally`·성공 시 닫기·`actionRef` 보관을 **한 곳**에 둔다. **`lang`은 필수 인자** — `catch`에서 토스트 문구를 **오직 `TDS_DIALOG_MESSAGES[lang].common.refundActionFailed`** 로만 조회한다(주석·재량 금지).

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import type { AppLang } from '../../types';
import {
  TDS_DIALOG_MESSAGES,
  type DialogTone,
} from '../../constants/tdsDialogMessages';
import { showErrorToast } from './showErrorToast';

export type AsyncTdsConfirmOpenParams = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: DialogTone;
  /**
   * 모달을 `open`할 때만 ref에 기록된다. state에 넣지 않는다.
   * 호출 시점의 클로저가 최신 props를 캡처한다.
   */
  action: () => Promise<void> | void;
};

type ConfirmDialogSnapshot =
  | { isOpen: false }
  | {
      isOpen: true;
      title: string;
      body: string;
      confirmLabel: string;
      tone: DialogTone;
    };

export type AsyncTdsConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone: DialogTone;
  isConfirmLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export interface UseAsyncTdsConfirmResult {
  snapshot: ConfirmDialogSnapshot;
  isConfirmLoading: boolean;
  open: (params: AsyncTdsConfirmOpenParams) => void;
  close: () => void;
  /** `TdsConfirmDialog`의 `onConfirm`에 그대로 연결 (`TdsAlertDialog`에는 사용하지 않음) */
  runConfirm: () => Promise<void>;
  /** `TdsConfirmDialog`에 `labels`·`hideCancel` 등만 합쳐서 전개 */
  dialogProps: AsyncTdsConfirmDialogProps;
}

export function useAsyncTdsConfirm(
  lang: AppLang,
): UseAsyncTdsConfirmResult {
  const actionRef = useRef<(() => Promise<void> | void) | null>(null);
  /** `setIsConfirmLoading(true)` 커밋 전 틱에 대한 더블 클릭·연타 방지(동기 락) */
  const isExecutingRef = useRef(false);
  const [snapshot, setSnapshot] = useState<ConfirmDialogSnapshot>({
    isOpen: false,
  });
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const close = useCallback(() => {
    actionRef.current = null;
    setSnapshot({ isOpen: false });
  }, []);

  const open = useCallback((params: AsyncTdsConfirmOpenParams) => {
    const { action, title, body, confirmLabel, tone } = params;
    actionRef.current = action;
    setSnapshot({
      isOpen: true,
      title,
      body,
      confirmLabel,
      tone,
    });
  }, []);

  const runConfirm = useCallback(async () => {
    const fn = actionRef.current;
    if (fn == null || isExecutingRef.current) {
      return;
    }
    isExecutingRef.current = true;
    setIsConfirmLoading(true);
    try {
      await Promise.resolve(fn());
      close();
    } catch (_error: unknown) {
      const errorMsg =
        TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMsg != null && errorMsg !== '') {
        showErrorToast(errorMsg);
      }
    } finally {
      isExecutingRef.current = false;
      setIsConfirmLoading(false);
    }
  }, [close, lang]);

  const dialogProps = useMemo((): AsyncTdsConfirmDialogProps => {
    if (!snapshot.isOpen) {
      return {
        isOpen: false,
        title: '',
        body: '',
        confirmLabel: '',
        tone: 'primary',
        isConfirmLoading,
        onClose: close,
        onConfirm: runConfirm,
      };
    }
    return {
      isOpen: true,
      title: snapshot.title,
      body: snapshot.body,
      confirmLabel: snapshot.confirmLabel,
      tone: snapshot.tone,
      isConfirmLoading,
      onClose: close,
      onConfirm: runConfirm,
    };
  }, [snapshot, isConfirmLoading, close, runConfirm]);

  return {
    snapshot,
    isConfirmLoading,
    open,
    close,
    runConfirm,
    dialogProps,
  };
}
```

### 설계 포인트

- **`useAsyncTdsConfirm(lang)`:** `lang` 없이 훅을 쓰는 패턴은 **금지**. 언어 전환이 있으면 **동일 컴포넌트 트리에서 `lang` prop이 바뀔 때 훅이 재실행**되어 `runConfirm`의 `TDS_DIALOG_MESSAGES[lang]`가 최신을 가리킨다.
- **`catch` 내부 토스트:** `TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed` 로 조회한 뒤 **문자열이 있을 때만** `showErrorToast`를 호출한다(`catch` 안에서 i18n 접근이 터져 **2차 크래시·WSOD** 나는 것을 막음). **허용 키는 `refundActionFailed`만**(다른 문구·리터럴·임의 분기 **금지**).
- `common.refundActionFailed` 키 이름은 **비동기 확인 실패용 범용 사용자 메시지 SSOT**로 쓴다(환불 전용이 아님).
- **단방향 데이터 흐름:** state는 **문자열·불리언 등 순수 스냅샷**만; 실행 권한은 **ref + `open` 시 주입된 `action`**.
- **`runConfirm` 단일 진입점**으로 §5(One-click Lock, Safe try/catch) 보일러플레이트를 제거한다.
- **동기 락(`isExecutingRef`):** `isConfirmLoading`만으로는 리페인트 전 **한 틱** 동안 중복 `runConfirm` 호출이 들어올 수 있다. **`isExecutingRef`** 로 진입 즉시 막아 금융·결제 계열 **더블 서밋**을 원천 차단한다(`finally`에서 해제).
- **환불 안내 등「확인 시 비동기 작업」이 필요하면 `TdsConfirmDialog` + 본 훅**을 쓴다. **단일 확인 버튼만 기획되면 `hideCancel={true}`** 를 쓴다. `TdsAlertDialog`는 **문구 확인 후 즉시 `onClose`만** 호출하는 정적 안내에 한정한다(SRP·오용 방지).
- **`open` / `close` / `runConfirm`은 `useCallback`으로 안정화**한다. 소비 컴포넌트의 `useCallback` 의존성에는 **`exitDialog` 전체가 아니라 `exitDialog.open` 등 개별 함수**를 넣어 불필요한 재생성을 피한다. `runConfirm`을 deps에 넣을 때는 **`lang`이 바뀌면 갱신되는 것이 정상**이다.
- **`dialog.open({ title, body, … })`를 호출하는 `useCallback`:** `TDS_DIALOG_MESSAGES[lang]`의 **하위 필드를 의존성 배열에 늘어놓지 않는다**. 콜백 **내부**에서 `const messages = TDS_DIALOG_MESSAGES[lang].…`로 조회하고, 의존성은 **`lang`·`…Dialog.open`·`action`에 쓰는 props 콜백** 위주로 압축한다.
- **`dialogProps`:** Consumer가 `isOpen ? snap.title : ''` 패턴을 반복하지 않도록, **`useMemo`로 `TdsConfirmDialog`에 넘길 필드를 훅이 파생**한다. Consumer는 **`<TdsConfirmDialog {...dialog.dialogProps} labels={…} />`** 에 **`hideCancel` 등만 추가**한다(DRY).

## Phase 0-3. `TdsDialogShell.tsx`

### `components/tds-adapter/TdsDialogShell.tsx`

```tsx
import React, {
  useCallback,
  useEffect,
  useId,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useTossApp } from '../../contexts/TossAppContext';
import { TDSModal } from '../tds';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

/** z-index를 JSX에 숫자 리터럴로 박지 않기 위한 레이어 상수(Tailwind 클래스 문자열) */
const WEB_MODAL_OVERLAY_Z_CLASS = 'z-[200]';
const WEB_DIALOG_MAX_WIDTH_CLASS = 'max-w-md';
/** 백드롭(동일 포커스 트랩 내 형제)보다 패널을 위에 겹친다 */
const WEB_DIALOG_PANEL_Z_CLASS = 'z-10';

export interface TdsDialogShellProps {
  isOpen: boolean;
  title: string;
  labels: DialogActionLabels;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onExited?: () => void;
  maxWidthClassName?: string;
  /**
   * 비동기 확인(결제·환불 등) 중에는 닫기를 무시한다.
   * Block Close during Loading: X·배경·ESC·TDS onClose 모두 `guardedClose`로 통일.
   */
  isConfirmLoading?: boolean;
}

export const TdsDialogShell: React.FC<TdsDialogShellProps> = ({
  isOpen,
  title,
  labels,
  onClose,
  children,
  footer,
  onExited,
  maxWidthClassName = WEB_DIALOG_MAX_WIDTH_CLASS,
  isConfirmLoading = false,
}) => {
  const { isInTossApp } = useTossApp();
  const titleId = useId();
  const bodyId = useId();

  const guardedClose = useCallback(() => {
    if (isConfirmLoading) {
      return;
    }
    onClose();
  }, [isConfirmLoading, onClose]);

  const handleBackdropKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        guardedClose();
      }
    },
    [guardedClose],
  );

  useEffect(() => {
    if (isInTossApp || !isOpen) {
      return;
    }
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      if (isConfirmLoading) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isInTossApp, isOpen, isConfirmLoading, onClose]);

  if (!isInTossApp && !isOpen) {
    return null;
  }

  const dialogBody = (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={`relative ${WEB_DIALOG_PANEL_Z_CLASS} w-full ${maxWidthClassName} overflow-hidden rounded-[2rem] bg-white shadow-xl`}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={guardedClose}
          disabled={isConfirmLoading}
          aria-busy={isConfirmLoading}
          aria-label={labels.closeAriaLabel}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div id={bodyId} className="px-6 py-5">
        {children}
      </div>

      {footer != null ? (
        <footer className="border-t border-slate-200 px-6 py-5">
          {footer}
        </footer>
      ) : null}
    </section>
  );

  if (isInTossApp) {
    return (
      <TDSModal open={isOpen} onClose={guardedClose} onExited={onExited}>
        {dialogBody}
      </TDSModal>
    );
  }

  return (
    <FocusScope trapped loop>
      <div
        className={`fixed inset-0 ${WEB_MODAL_OVERLAY_Z_CLASS} flex items-center justify-center p-4`}
      >
        <div
          role="button"
          tabIndex={isConfirmLoading ? -1 : 0}
          aria-label={labels.backdropAriaLabel}
          aria-disabled={isConfirmLoading}
          onClick={guardedClose}
          onKeyDown={handleBackdropKeyDown}
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm ${
            isConfirmLoading ? 'pointer-events-none' : ''
          }`}
        />
        {dialogBody}
      </div>
    </FocusScope>
  );
};

export default TdsDialogShell;
```

**의존성:** 웹 폴백 포커스 트랩을 위해 `@radix-ui/react-focus-scope`를 설치한다(토스 번들에는 TDS Modal 쪽 A11y를 우선 따른다).

**참고:** `@radix-ui/react-focus-scope`의 공개 API에는 `returnFocus` prop이 없다. 트리거로 포커스를 되돌리는 동작은 **언마운트 시 기본 복귀**에 맡기거나, 필요 시 `onUnmountAutoFocus`로 조정한다.

### 설계 포인트

- 실제 토스 환경 분기는 `useTossApp().isInTossApp`로만 판단합니다.
- TDS 원본을 화면에서 직접 쓰지 않고, **`TdsDialogShell`만 공개 API**로 사용합니다.
- **`isConfirmLoading`과 닫기 잠금(Post-paint 레이스 방지):** `useEffect`로 ref에 미러링하면 **페인트 이후**에야 ref가 갱신되어, 로딩 직후 **Escape·백드롭이 한 틱 동안 잠금을 뚫을 수 있다**. 따라서 **`guardedClose`·문서 `Escape` 핸들러는 `isConfirmLoading` props를 클로저로 직접 참조**하고, **`useCallback` / `useEffect` deps에 `isConfirmLoading`을 포함**한다(리스너 재등록 비용은 허용).
- **`isConfirmLoading` + `guardedClose`:** `true`일 때는 `onClose`가 호출되지 않습니다. X·배경·`TDSModal`의 `onClose`도 `guardedClose`로 통일합니다.
- **`WEB_MODAL_OVERLAY_Z_CLASS` / `WEB_DIALOG_PANEL_Z_CLASS`:** 오버레이·패널의 `z-index`는 **상수(또는 Tailwind theme)** 로만 관리한다. 백드롭과 패널은 **`fixed` 루트 div 안의 형제**이며, 패널(`dialogBody`)에 **`z-10`** 등을 주어 클릭·포인터 타깃이 패널에 닿게 한다.
- **`FocusScope` 단일 자식 계약:** `@radix-ui/react-focus-scope`의 `FocusScope`는 구현상 **`React.Children.only`에 해당하는 단일 React 요소**만 자식으로 받는다. 백드롭 `div`와 `dialogBody` **두 개를 `FocusScope`의 직접 자식으로 두면** 런타임에서 크래시(화면 전체 실패)가 날 수 있으므로, **`FocusScope` → 유일한 자식 `div`(fixed·flex 루트) → 그 안에 백드롭 + 패널** 순으로 감싼다.
- **웹 폴백 A11y — 포커스 트랩과 백드롭 키보드 닫기의 정합:** 백드롭(`role="button"`, `tabIndex`, Enter/Space)을 **트랩 밖**에만 두면 Tab이 패널 안에서만 돌아 **백드롭 키보드 닫기가 데드 코드**가 될 수 있다. 위 래퍼 안에서 백드롭과 패널을 **형제로 두어** 동일 트랩·Tab 순환에 포함시킨다. **`handleBackdropKeyDown`은 `useCallback`으로 고정**해 렌더마다 인라인 화살표 함수를 만들지 않는다(Rule 10 정합).
- **최상단 `if (!isOpen) return null`은 제거**합니다. 토스 경로에서 `TDSModal`이 닫힐 때도 `open={false}`를 전달받을 수 있게 해, 퇴장 전이를 담당하는 구현(공식 TDS Modal 등)과 계약을 맞춥니다.
- **현재 저장소의 `components/tds/TDSModal.tsx`도 `!open`이면 `return null`인 경우가 많습니다.** 그 경우 쉘만 고쳐도 즉시 부드러운 exit가 보이지 않을 수 있으므로, **실제 퇴장 애니메이션·`onExited` 타이밍은 `TDSModal`(또는 `@toss/tds-mobile` 직결) 개선과 함께 검증**합니다.
- **조건부 렌더링:** 웹 폴백에서만 `!isInTossApp && !isOpen`일 때 `null`로 차단합니다.
- `titleId`/`bodyId`로 스크린 리더 연결을 명확히 합니다.

## Phase 0-4. `TdsAlertDialog.tsx`

### `components/tds-adapter/TdsAlertDialog.tsx`

```tsx
import React from 'react';
import { TDSButton } from '../tds';
import { TdsDialogShell } from './TdsDialogShell';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

export interface TdsAlertDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  labels: DialogActionLabels;
  onClose: () => void;
}

export const TdsAlertDialog: React.FC<TdsAlertDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  labels,
  onClose,
}) => {
  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      footer={
        <TDSButton type="button" variant="primary" fullWidth onClick={onClose}>
          {confirmLabel}
        </TDSButton>
      }
    >
      <p className="text-sm leading-6 text-slate-700">{body}</p>
    </TdsDialogShell>
  );
};

export default TdsAlertDialog;
```

### 설계 포인트

- 버튼 문구는 모두 외부에서 주입합니다.
- **SRP:** 알림은 **확인 클릭 → 즉시 `onClose` 한 번**만 수행합니다. 비동기 확인·로딩·`runConfirm`은 **`TdsConfirmDialog` + `useAsyncTdsConfirm(lang)`** 에만 둡니다.
- **`isConfirmLoading` / `onConfirm` 없음:** 로딩 잠금·원클릭 락이 필요하면 **확인 다이얼로그 계열**로 분리합니다.

### 컴포넌트 역할(Contract) 경계

- **`TdsAlertDialog`**: 로딩이나 비동기 통신이 **전혀 없는** 순수 동기식 단순 안내판 역할만 수행한다. 확인 클릭은 **즉시 `onClose` 한 번**으로 끝난다.
- **`TdsConfirmDialog` (`hideCancel={true}`)**: 사용자 눈에는 Alert처럼 **단일 버튼(확인)** 만 노출되지만, 이면에서는 `useAsyncTdsConfirm`·API·로딩·에러 토스트 등 **비동기 로직과 에러 핸들링**이 필요한 경우에 사용한다. `TdsAlertDialog`에 비동기를 억지로 얹지 않고, **비동기 확인 경로는 `TdsConfirmDialog`로만 통일**한다.

## Phase 0-5. `TdsConfirmDialog.tsx`

### `components/tds-adapter/TdsConfirmDialog.tsx`

```tsx
import React from 'react';
import { TDSButton } from '../tds';
import { TdsDialogShell } from './TdsDialogShell';
import type {
  DialogActionLabels,
  DialogTone,
} from '../../constants/tdsDialogMessages';

const getButtonVariant = (tone: DialogTone): 'primary' | 'dangerFill' => {
  switch (tone) {
    case 'danger':
      return 'dangerFill';
    case 'primary':
      return 'primary';
    default: {
      const neverTone: never = tone;
      return neverTone;
    }
  }
};

export interface TdsConfirmDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  labels: DialogActionLabels;
  tone?: DialogTone;
  /** `true`이면 취소 버튼을 렌더하지 않는다. 확인 버튼만 `flex` 행을 채운다(기획상 단일 액션). 기본 `false`. */
  hideCancel?: boolean;
  isConfirmLoading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const TdsConfirmDialog: React.FC<TdsConfirmDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  labels,
  tone = 'primary',
  hideCancel = false,
  isConfirmLoading = false,
  onClose,
  onConfirm,
}) => {
  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      isConfirmLoading={isConfirmLoading}
      footer={
        <div className="flex w-full gap-3">
          {!hideCancel ? (
            <TDSButton
              type="button"
              variant="tertiary"
              fullWidth
              className="min-w-0 flex-1"
              disabled={isConfirmLoading}
              onClick={onClose}
            >
              {labels.cancel}
            </TDSButton>
          ) : null}
          <TDSButton
            type="button"
            variant={getButtonVariant(tone)}
            fullWidth
            className="min-w-0 flex-1"
            loading={isConfirmLoading}
            disabled={isConfirmLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </TDSButton>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-700">{body}</p>
    </TdsDialogShell>
  );
};

export default TdsConfirmDialog;
```

### 설계 포인트

- `tone`은 문자열 비교용 번역 텍스트가 아니라 union type으로 관리합니다.
- `switch` + `never` 체크로 exhaustive typing을 보장합니다.
- `confirmLabel`은 위험 액션별로 다르게 주입 가능합니다.
- 비동기 통신 및 로딩 제어가 필요하지만 단일 버튼만 노출해야 하는 Alert 성격의 화면(예: 환불 안내)을 위해 `hideCancel`을 지원하여 SRP를 유지한다. (`TdsAlertDialog`에 비동기를 얹지 않고 **`TdsConfirmDialog` + `useAsyncTdsConfirm` 경로만** 쓴다.)
- **`isConfirmLoading`을 `TdsDialogShell`에 전달**해 로딩 중 헤더 X·배경·ESC가 막힌다. **`hideCancel`이 `false`일 때만** 취소 버튼을 렌더하며, 해당 버튼은 로딩 중 `disabled`로 **이중 액션(취소로 닫힘 vs 확인 진행)** 을 막는다(결제·삭제 등).
- 확인 버튼은 **`onClick={onConfirm}`** 으로 직접 연결한다. 부모가 내려주는 `onConfirm`(일반적으로 `runConfirm`)이 이미 `try` / `catch` / 락을 포함하므로 **`async` 래퍼·`Promise.resolve` 중첩**을 두지 않는다.
- 확인 버튼은 `loading` + `disabled`로 One-click Lock을 강화한다. 푸터는 항상 **`flex w-full gap-3`** 를 유지하고, `hideCancel`일 때는 확인 버튼만 **`flex-1`·`min-w-0`** 로 행을 채운다.
- **Safe Try-Catch-Finally**는 **`useAsyncTdsConfirm.runConfirm`** 에 두고, 본 어댑터는 닫기 차단·버튼 `loading`·이벤트 위임만 담당한다.

## Phase 0-6. `useAsyncTdsConfirm` 적용 샘플 (`ConfirmDialogSample`)

### `components/tds-adapter/ConfirmDialogSample.tsx` (교육·스토리북용)

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsConfirmDialog } from './TdsConfirmDialog';
import { useAsyncTdsConfirm } from './useAsyncTdsConfirm';

interface ConfirmDialogSampleProps {
  lang: AppLang;
}

export const ConfirmDialogSample: React.FC<ConfirmDialogSampleProps> = ({
  lang,
}) => {
  const dialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const sampleTrigger =
    TDS_DIALOG_MESSAGES[lang]?.samples?.openDangerConfirmSample ?? '';

  const handleOpenDangerDialog = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.history;
    if (messages == null) {
      return;
    }
    dialog.open({
      title: messages.clearTitle ?? '',
      body: messages.clearBody ?? '',
      confirmLabel: messages.clearConfirm ?? '',
      tone: 'danger',
      action: async () => {
        // 샘플: 실제 구현에서는 API 등
      },
    });
  }, [dialog.open, lang]);

  return (
    <>
      <button type="button" onClick={handleOpenDangerDialog}>
        {sampleTrigger}
      </button>
      {labels != null ? (
        <TdsConfirmDialog {...dialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

### 설계 포인트

- **트리거·`labels`:** `samples?.openDangerConfirmSample ?? ''`, **`labels`는 `?.actions` + `labels != null`일 때만 `TdsConfirmDialog`**. `open` 전 **`history` 가드**.
- **`useAsyncTdsConfirm(lang)`이 §5·에러 토스트 i18n 전부 소유**; 샘플·Phase 1 코디네이터는 **`lang`을 넘겨** `open` / `close` / `runConfirm`만 연결한다.
- **`handleOpenDangerDialog`의 `useCallback` 의존성**은 **`[dialog.open, lang]`** 처럼 압축한다. 문구는 콜백 내부의 `TDS_DIALOG_MESSAGES[lang]` 조회로 얻는다.
- **`TdsConfirmDialog`:** **`{...dialog.dialogProps}`** 로 스냅샷 매핑을 훅에 위임한다.

## Phase 0-6a. 확인 플로우 SSOT (복붙 금지)

- **단일 진입점:** 비동기 확인·로딩·닫기·`catch`·**다국어 토스트**는 **`useAsyncTdsConfirm(lang).runConfirm`** 에만 구현한다. Phase 1 스니펫에 `try/catch/finally` 블록을 **다시 붙이지 않는다.**
- **`useCallback` + `dialog.open`:** `TDS_DIALOG_MESSAGES[lang]`의 **개별 문자열 필드를 deps에 나열하지 않는다**. 콜백 안에서 `TDS_DIALOG_MESSAGES[lang]`(또는 `.history` / `.refund` 등)으로 읽고, deps는 **`lang`·`…Dialog.open`·관련 props 핸들러** 위주로 둔다(Phase 0-6 `ConfirmDialogSample`, Phase 1-P0 `AuthModalCoordinator`, Phase 1-P1 `HistoryHeaderActions`·`RefundGuideController`와 동일 패턴).
- **`open({ ..., action })`:** `action`은 **ref에만** 저장되며, `open` 호출 시점의 최신 props를 캡처한다. **`useState`에 함수를 넣지 않는다.**
- **환불 안내 등 비동기 확인:** **`TdsConfirmDialog {...dialog.dialogProps} labels={…} hideCancel`** 패턴으로 단일 확인 버튼만 노출한다. **`TdsAlertDialog`는 쓰지 않는다.**
- **언마운트 경합 방지:** `action` 내부에서 **`await` 비동기 경계를 먼저 처리**하고, **부모 모달/패널을 닫는 동기 작업은 그 뒤에** 둔다(Phase 1-P0 `AuthModalCoordinator` 참고).

---

## Phase 1-P0. 이탈/종료 모달 적용 스니펫

이 단계는 운영진 답변에 **가장 직접 대응**합니다.

## 샘플 대상

- 미니앱 종료 버튼
- 뒤로가기 이탈
- 로그인 화면 닫기

실제 토스 종료 API는 이 문서에서 추측하지 않습니다. 대신 **앱 경계 콜백** `onRequestMiniAppExit`로 위임합니다.

## Before

아래 코드는 현재 프로젝트에서 흔히 보이는 **직접 닫기 패턴**을 단순화한 예시입니다.

```tsx
interface AuthModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModalContainer: React.FC<AuthModalContainerProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <AuthModals
      lang="ko"
      type="login"
      onClose={onClose}
      onSwitchType={() => {}}
      onLogin={() => {}}
      onLogout={() => {}}
    />
  );
};
```

문제점:

- `onClose()`가 곧바로 호출되어 **종료 확인이 없음**
- 토스 운영진이 강조한 **이탈/종료 안내 모달** 요구를 만족하지 못함
- 로그인 닫기 = 앱 종료 정책을 코드에서 설명하지 못함

## After

### 샘플: `AuthModalCoordinator.tsx`

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../types';
import { useTossApp } from '../contexts/TossAppContext';
import AuthModals from '../components/AuthModals';
import { TdsConfirmDialog } from '../components/tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../components/tds-adapter/useAsyncTdsConfirm';
import {
  TDS_DIALOG_MESSAGES,
  type ExitDialogReason,
} from '../constants/tdsDialogMessages';

const NOOP = (): void => {};

interface AuthModalCoordinatorProps {
  lang: AppLang;
  isOpen: boolean;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
}) => {
  const { isInTossApp } = useTossApp();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const exitDialog = useAsyncTdsConfirm(lang);

  const handleRequestExit = useCallback(
    (reason: ExitDialogReason) => {
      if (!isInTossApp) {
        onCloseAuthModal();
        return;
      }
      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.[reason];
      if (exitMessage == null) {
        return;
      }
      exitDialog.open({
        title: exitMessage.title ?? '',
        body: exitMessage.body ?? '',
        confirmLabel: exitMessage.confirm ?? '',
        tone: 'primary',
        action: async () => {
          await Promise.resolve(onRequestMiniAppExit());
          onCloseAuthModal();
        },
      });
    },
    [
      exitDialog.open,
      isInTossApp,
      lang,
      onCloseAuthModal,
      onRequestMiniAppExit,
    ],
  );

  const handleAuthClose = useCallback(() => {
    handleRequestExit('auth_close');
  }, [handleRequestExit]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AuthModals
        lang={lang}
        type="login"
        onClose={handleAuthClose}
        onSwitchType={NOOP}
        onLogin={NOOP}
        onLogout={NOOP}
      />

      {labels != null ? (
        <TdsConfirmDialog {...exitDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

### 설계 포인트

- **`labels`:** `TDS_DIALOG_MESSAGES[lang]?.actions` 로 조회하고, **`labels == null`이면 `TdsConfirmDialog`를 렌더하지 않는다**(런타임·i18n 맵 불일치 시 WSOD 방지). `AuthModals`는 유지한다.
- 종료 동작은 `onRequestMiniAppExit`로 위임하므로, 토스 공식 API 선택은 앱 경계에서만 결정됩니다.
- 토스 앱이 아닐 때는 기존 웹 UX를 유지합니다.
- `AuthModals`는 여전히 기존 비즈니스 로직을 유지하고, **닫기 이벤트만 외부 코디네이터가 가로채는 방식**입니다.
- **`useAsyncTdsConfirm(lang)`:** `open`의 `action`만 ref에 보관하고, **`await onRequestMiniAppExit()` 이후에만 `onCloseAuthModal()`** 을 호출해 **언마운트 경합**과 Silent Failure를 동시에 피합니다. 실패 시 토스트는 훅이 **`showErrorToast(TDS_DIALOG_MESSAGES[lang].common.refundActionFailed)`** 로만 처리합니다.
- **`handleRequestExit`의 `useCallback`:** `dialogMessages.exit` 전체를 deps에 넣지 않고, **`TDS_DIALOG_MESSAGES[lang]?.exit?.[reason]`** 로 조회한 뒤 **`exitMessage == null`이면 조기 return** 한다. 필드는 **`?? ''`** 로 방어한다. **`labels`** 는 **`?.actions`** 및 **`labels != null` 조건부 렌더**로 동일 원칙을 적용한다.
- **자식 props 안정화:** `onClose={handleAuthClose}`, `NOOP` 고정 참조 유지.

---

## Phase 1-P1. `alert` / `confirm` 박멸 스니펫

이 단계는 공개 체크리스트를 보수적으로 커버하기 위한 확장 작업입니다.

## 샘플 A. `History.tsx`의 `window.confirm`

### Before

현재 `History.tsx`의 핵심 구조는 아래와 같습니다.

```tsx
const confirmAndRun = (msg: string, fn: () => void) => {
  if (window.confirm(msg)) fn();
};

<button
  onClick={() =>
    confirmAndRun(
      lang === 'ko'
        ? '삭제되면 되돌릴 수 없습니다. 삭제하시겠습니까?'
        : 'Clear all history records? This will not delete the original portfolios.',
      onClearHistory,
    )
  }
>
  ...
</button>
```

문제점:

- 브라우저 기본 `confirm`
- JSX 내부에 분기 로직과 액션 주입이 섞여 있음
- i18n 문구가 컴포넌트 안으로 퍼져 있음

### After

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../types';
import { TdsConfirmDialog } from '../components/tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';

interface HistoryHeaderActionsProps {
  lang: AppLang;
  canClearHistory: boolean;
  onClearHistory: () => Promise<void> | void;
}

export const HistoryHeaderActions: React.FC<HistoryHeaderActionsProps> = ({
  lang,
  canClearHistory,
  onClearHistory,
}) => {
  const clearDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const triggerLabel =
    TDS_DIALOG_MESSAGES[lang]?.history?.openClearDialog ?? '';

  const handleRequestClearHistory = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.history;
    if (messages == null) {
      return;
    }
    clearDialog.open({
      title: messages.clearTitle ?? '',
      body: messages.clearBody ?? '',
      confirmLabel: messages.clearConfirm ?? '',
      tone: 'danger',
      action: onClearHistory,
    });
  }, [clearDialog.open, lang, onClearHistory]);

  if (!canClearHistory) {
    return null;
  }

  return (
    <>
      <button type="button" onClick={handleRequestClearHistory}>
        {triggerLabel}
      </button>

      {labels != null ? (
        <TdsConfirmDialog {...clearDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

### 설계 포인트

- 렌더 단계에서 state mutation이 일어나지 않습니다.
- `onClearHistory`는 기존 비즈니스 로직을 유지하되, **실패 시 reject**하면 훅의 `catch` 경로로 들어갑니다.
- **`useAsyncTdsConfirm(lang)` 단일 경로**로 §5-1·5-2·에러 토스트 i18n을 만족; 트리거 라벨은 **`history.openClearDialog`**(하드코딩 금지).
- **`handleRequestClearHistory`:** `TDS_DIALOG_MESSAGES[lang]?.history` 가드 후 `open`; 필드 **`?? ''`**. **`labels`·`triggerLabel`은 `?.` / `??`**, **`TdsConfirmDialog`는 `labels != null`일 때만**(AuthModalCoordinator·ConfirmDialogSample과 동일 수준).

## 샘플 B. `ProfileView.tsx`의 토스 환불 안내 `alert`

### Before

현재 구조는 아래와 같습니다.

```tsx
const handleRefundConfirm = async () => {
  if (isInTossApp) {
    const tossRefundGuide = lang === 'ko'
      ? '토스 앱 > 결제내역에서 "환불받기"를 이용하시거나(안드로이드), 애플 고객센터를 통해 환불을 진행해 주세요(iOS).'
      : 'Please use "Get Refund" in Toss > Payment History on Android, or request a refund through Apple Support on iOS.';

    alert(tossRefundGuide);
    setShowCancelSub(false);
    return;
  }

  // ...
};
```

문제점:

- 토스 환경에서 브라우저 기본 `alert`
- 문구가 함수 내부에 직접 존재
- 닫힘 상태와 안내 상태가 분리되어 있지 않음

### After

`ProfileView` 등 상위에서 **웹 환경의 기존 환불 플로우**(예: 포트원/서버 검증 후 처리)를 `onProcessWebRefund`로 주입한다. `if (!isInTossApp) return;`만 두면 웹 사용자는 버튼이 **무반응(Silent Failure)** 이 되므로 금지한다. **`!isInTossApp` 분기에서 `onProcessWebRefund`를 `await` 없이 호출하고 패널만 닫으면** 실패 시 **Unhandled Promise Rejection** 과 **에러 미인지**가 남으므로, 아래처럼 **동기화·토스트**를 맞춘다.

```tsx
// components/auth/ProfileView.tsx 내부 RefundGuideController (수정 스니펫)
import React, { useCallback, useRef, useState } from 'react';
import type { AppLang } from '../../types';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface RefundGuideControllerProps {
  lang: AppLang;
  isInTossApp: boolean;
  onCloseRefundPanel: () => void;
  onProcessWebRefund: () => Promise<void> | void;
}

export const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isInTossApp,
  onCloseRefundPanel,
  onProcessWebRefund,
}) => {
  const refundDialog = useAsyncTdsConfirm(lang);
  const [isWebLoading, setIsWebLoading] = useState(false);
  /** 배치 전 1틱 연타 방지(논리 락). `isWebLoading`과 병행 */
  const isWebProcessingRef = useRef(false);

  const handleRequestRefundGuide = useCallback(async () => {
    if (!isInTossApp) {
      if (isWebProcessingRef.current) {
        return;
      }
      isWebProcessingRef.current = true;
      setIsWebLoading(true);
      try {
        await Promise.resolve(onProcessWebRefund());
        onCloseRefundPanel();
      } catch (_error: unknown) {
        const errorMsg =
          TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
        if (errorMsg != null && errorMsg !== '') {
          showErrorToast(errorMsg);
        }
      } finally {
        isWebProcessingRef.current = false;
        setIsWebLoading(false);
      }
      return;
    }

    const dm = TDS_DIALOG_MESSAGES[lang];
    if (dm == null) {
      return;
    }
    refundDialog.open({
      title: dm.refund?.guideTitle ?? '',
      body: dm.refund?.guideBody ?? '',
      confirmLabel: dm.common?.acknowledge ?? '',
      tone: 'primary',
      action: async () => {
        await Promise.resolve(onProcessWebRefund());
        onCloseRefundPanel();
      },
    });
  }, [
    isInTossApp,
    lang,
    onCloseRefundPanel,
    onProcessWebRefund,
    refundDialog.open,
  ]);

  const messages = TDS_DIALOG_MESSAGES[lang];

  return (
    <>
      <button
        type="button"
        onClick={handleRequestRefundGuide}
        disabled={isWebLoading}
        aria-busy={isWebLoading}
      >
        {isWebLoading
          ? (messages?.common?.webAsyncProcessing ?? '')
          : (messages?.refund?.openRefundGuide ?? '')}
      </button>

      {messages?.actions != null ? (
        <TdsConfirmDialog
          {...refundDialog.dialogProps}
          labels={messages.actions}
          hideCancel={true}
        />
      ) : null}
    </>
  );
};
```

### 설계 포인트

- 토스: **`useAsyncTdsConfirm(lang)`** 으로 안내 모달을 연다. `action` 안에서 **`await onProcessWebRefund()` 후 `onCloseRefundPanel()`** — 성공 시 훅이 다이얼로그를 닫는다.
- **웹(`!isInTossApp`):** **동기 락(필수) + `isWebLoading`(필수)** 를 **병행**한다. 입구에서 **`isWebProcessingRef.current`가 이미 `true`이면 즉시 return**; 아니면 **`isWebProcessingRef.current = true`** 후 **`setIsWebLoading(true)`**. **`await Promise.resolve(onProcessWebRefund())`** 후 **성공 시에만** `onCloseRefundPanel()`. 실패 시 **`TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`를 조회해 문자열이 있을 때만** `showErrorToast`(Phase 0-2b `catch`와 동일한 **WSOD 방어**). **`finally`에서 `isWebProcessingRef.current = false` 및 `setIsWebLoading(false)`**. 버튼은 **`disabled` + `aria-busy`**·라벨은 **`common.webAsyncProcessing`** / **`refund.openRefundGuide`** 를 **`?.` / `?? ''`** 로 전환(하드코딩 금지).
- 기획상 **취소 버튼 없이 확인만** 노출: **`hideCancel={true}`** + **`{...refundDialog.dialogProps}`**(`tone`·`confirmLabel`은 스냅샷·훅이 책임). 헤더 닫기(X)·`onClose`는 `TdsDialogShell` 계약으로 그대로 둔다.
- **`handleRequestRefundGuide`:** `async` + **`useCallback` 의존성**에는 **`isWebLoading`을 넣지 않는다**(연타 방어는 **ref 뮤텍스**가 담당). deps는 **`isInTossApp`·`lang`·`onCloseRefundPanel`·`onProcessWebRefund`·`refundDialog.open`** 등. 토스 분기 `open` 전 **`dm == null` 조기 return**; 필드는 **`?.` / `?? ''`**.
- 트리거 `onClick`은 반환 Promise를 기다리지 않아도 되며, **거부는 콜백 내부 `try/catch`에서 흡수**한다.
- §5-3: **`runConfirm`의 `catch`** 와 동일하게, **웹 단발 분기**도 **`?.` 조회 후 truthy일 때만** `showErrorToast` — **허용 키는 `refundActionFailed`만**(다이얼로그·훅을 타지 않기 때문에 호출부에서 한 번 처리).
- 토스 안내용 **`TdsConfirmDialog`:** **`messages?.actions != null`일 때만** 렌더하여 **`labels` 무방비 접근**을 막는다(Phase 1-P0 `AuthModalCoordinator`·`HistoryHeaderActions`와 동일 수준).
- 토스 안내 확인만 필요하면 부모가 `onProcessWebRefund`에 `async () => {}` 주입.
- 트리거 라벨은 **`refund.openRefundGuide`**.
- 문구는 모두 `TDS_DIALOG_MESSAGES`에서 주입한다.

---

## 상태/런타임 방어 규칙

## 1. Render phase에서 state mutation 금지

- `setState`는 클릭/확인/닫기 핸들러 안에서만 호출합니다.
- JSX 안에서 `setState(...)`를 직접 실행하지 않습니다.
- **렌더 본문에서 `ref.current`에 대입하지 않습니다.** 최신 props/state를 ref에 미러링할 때는 **`useEffect` 안에서만** 갱신합니다(Concurrent 렌더·워크스페이스 규칙과 정합).
- **`useAsyncTdsConfirm`의 `runConfirm` / `action` ref** 를 렌더 본문에서 직접 호출하지 않습니다(이벤트 핸들러·훅 내부만).

## 2. 중첩 모달 최소화

- 부모 모달 위에 확인 모달을 무한히 쌓지 않습니다.
- 가능하면 **현재 모달 닫기 -> 전역 다이얼로그 표시** 또는 **같은 계층에서 하나만 표시** 원칙을 따릅니다.

## 3. Hook에서 UI 직접 호출 금지

- `usePortfolios.ts`, `useAuth.ts`는 2차 라운드에서 `alert`를 제거합니다.
- 최종 목표는 Hook이 `Result` 또는 `ErrorCode`만 반환하고, 화면이 다이얼로그를 열도록 분리하는 것입니다.

## 4. i18n SSOT 강제

- `확인`, `취소`, `닫기`, `종료하기` 같은 문구를 JSX에 직접 쓰지 않습니다.
- `TDS_DIALOG_MESSAGES` 또는 동급 사전만 사용합니다.

## 5. 결제·환불 도메인 UX 안전장치 (3대 원칙)

결제·환불·삭제 등 **부작용이 큰 확인 다이얼로그**에는 아래를 기본 계약으로 둡니다. **코디네이터 구현의 단일 기준은 `useAsyncTdsConfirm`(Phase 0-2b)** 이며, 구체 예시는 Phase 0-3 `TdsDialogShell`, Phase 0-4/0-5 어댑터, Phase 0-6 `ConfirmDialogSample`, Phase 1-P0 `AuthModalCoordinator`, Phase 1-P1 `HistoryHeaderActions`·`RefundGuideController`를 참고합니다.

### 5-1. 중복 클릭 차단 (One-click Lock)

- 비동기 확인 중(`isConfirmLoading === true`)에는 **확인 버튼을 즉시 비활성화**하고, 가능하면 `loading` 표시를 겹쳐 **중복 API 요청**을 막습니다.
- `TDSButton`에 `disabled={isConfirmLoading}`와 `loading={isConfirmLoading}`를 함께 쓰는 패턴을 권장합니다.
- **동기 락(필수):** 리페인트 전 한 틱 동안 `disabled`가 아직 `false`일 수 있으므로, **`useAsyncTdsConfirm`의 `runConfirm` 입구에 `isExecutingRef` 뮤텍스**를 두어 연타·더블 클릭으로 인한 **중복 `action` 실행**을 막습니다(Phase 0-2b 스니펫).
- **웹 단발 경로:** `runConfirm`을 호출하지 않는 분기(예: Phase 1-P1 `RefundGuideController`의 `!isInTossApp`)에서는 **`isWebProcessingRef` 동기 뮤텍스(필수) + `isWebLoading` + 버튼 `disabled`** 로 **배치 전 1틱 연타**와 **중복 API 호출**을 막고, **시각적 피드백**은 `isWebLoading`으로 맞춘다(상태만으로는 부족 — **Rule 1 / §5-1**).

### 5-2. 로딩 중 화면 잠금 (Block Close during Loading)

- `isConfirmLoading` 동안은 **X(닫기)**, **배경(Backdrop) 클릭**, **Escape**, 그리고 토스 경로에서 `TDSModal`이 호출하는 **`onClose`**까지 **`guardedClose`로 통일**해 닫기 호출을 무시합니다.
- `TdsConfirmDialog`는 **`hideCancel`이 `false`일 때만** 취소 버튼을 렌더하며, 해당 버튼은 동일 구간에서 **`disabled`** 처리해 진행 중인 확인과 경쟁하는 닫기 동작을 막습니다. **`hideCancel={true}`** 인 화면은 푸터 취소는 없고, 헤더 X·배경·ESC·`guardedClose` 계약은 동일합니다.

### 5-3. Safe Try-Catch-Finally

- 비동기 확인은 **`useAsyncTdsConfirm(lang).runConfirm`** 안에서만 `try` / `catch` / `finally`를 수행합니다(부모 컴포넌트에 동일 블록 복붙 금지). **예외:** 다이얼로그·`runConfirm`을 거치지 않는 **웹 단발 분기**(Phase 1-P1 `RefundGuideController`의 `!isInTossApp`)는 호출부에서 **`await` + `TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed` 가드 후** 동일 키로 `showErrorToast`를 **한 번만** 처리합니다.
- **성공(Resolved) 시에만** 훅이 모달 스냅샷을 닫고, `action` 내부에서 패널 닫기 등 후속 UI를 정의합니다.
- **`catch`에서는 모달을 닫지 않고**, 토스트는 **`TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`를 조회해 문자열이 있을 때만** `showErrorToast`를 호출합니다(직접 체인 접근 금지 — **catch 내부 2차 크래시·WSOD** 방지). **허용 키는 `refundActionFailed`만**; `lang` 없이 훅을 쓰거나, `catch` 안에서 문자열 리터럴·임의 변수로 토스트를 띄우는 것은 **금지**입니다.
- **`finally`에서 로딩 해제**는 훅 단일 경로입니다.
- **`showErrorToast`** 는 Phase 0-2b의 `components/tds-adapter/showErrorToast.ts`에 두고, 인자는 **사전에서 조회한 문자열만** 받게 계약합니다.

---

## 권장 구현 순서

## Phase 0. 어댑터 준비

1. `constants/tdsDialogMessages.ts`
2. `components/tds-adapter/dialogState.ts` (`AlertDialogState` 등 **순수 데이터**만)
3. `components/tds-adapter/showErrorToast.ts` (**번역 완료 문자열만** 받는 토스트 진입점)
4. `components/tds-adapter/useAsyncTdsConfirm.ts` (**§5·비동기 확인·i18n 에러 토스트 SSOT**, 시그니처 `useAsyncTdsConfirm(lang)`)
5. `components/tds-adapter/TdsDialogShell.tsx` (웹 폴백용 **`@radix-ui/react-focus-scope`** 패키지 추가)
6. `components/tds-adapter/TdsAlertDialog.tsx`
7. `components/tds-adapter/TdsConfirmDialog.tsx`

**완료 기준**

- 새 다이얼로그는 모두 어댑터만 통해 생성 가능
- i18n 문구가 단일 사전에 존재
- 토스/웹 분기가 `TdsDialogShell` 내부로 캡슐화
- 비동기 확인이 있는 화면은 **`useAsyncTdsConfirm(lang)` + `TdsDialogShell`의 `guardedClose`** 로 §5를 만족한다(부모에 `try/catch`·토스트 호출 복붙 금지).
- **`TdsConfirmDialog`** 는 **`{...dialog.dialogProps}`** 로 훅 파생 props를 받고, Consumer는 **`isOpen ? snap…` 삼항 연산자 보일러플레이트를 쓰지 않는다**.
- **`showErrorToast` + `refundActionFailed` 키(SSOT)** 조합이 실패 알림의 유일한 사용자 대면 경로다(조회는 **`TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`** 가드 패턴; 웹 단발 분기 예외는 §5-3).

## Phase 1a. `Tier 1-P0` 적용

1. 로그인 화면 닫기 -> 종료 확인
2. 앱 종료/이탈 -> 종료 확인
3. 정책/차단 고지 -> 알림 다이얼로그

**완료 기준**

- 운영진이 강조한 종료/이탈 모달이 TDS 계열로 정리됨
- `onRequestMiniAppExit` 같은 경계 콜백으로 종료 로직이 분리됨

## Phase 1b. `Tier 1-P1` 적용

1. `History.tsx`의 `window.confirm`
2. `ProfileView.tsx`의 토스 환불 `alert`
3. `CheckoutModal.tsx`의 결제 결과 안내
4. `AuthModals.tsx`의 완료형 `alert`
5. `App.tsx`의 한도 초과 `alert`

**완료 기준**

- 토스 앱 주요 경로에서 브라우저 기본 팝업이 사라짐
- 안내/확인 모달이 동일 어댑터 패턴으로 통일됨
- **`TdsConfirmDialog` 코디네이터**는 **`useAsyncTdsConfirm(lang)`** 을 거치며, 상태에 콜백을 저장하거나 `try/catch`·**에러 토스트**를 화면마다 복붙하지 않음(`lang`은 화면이 이미 보유한 `AppLang`과 동일 소스에서 전달). **`TdsAlertDialog`는 로컬 `onClose`만** 두고 본 훅과 짝짓지 않음.

## Phase 2. Hook 계층 분리

**목표:** `usePortfolios`·`useAuth`가 **`alert` / `window.confirm` / DOM 기반 팝업을 호출하지 않는다**. 데이터·세션 상태와 **부작용(API 호출)** 만 담당하고, **사용자 의사 확인·문구 표시·접근성**은 **UI 계층 + `Tds*Dialog` + `useAsyncTdsConfirm` / `TdsAlertDialog`** 가 전담한다.

**범위(본 Phase에서 다루는 대표 케이스):**

1. `usePortfolios.ts`의 **`handleDeletePortfolio`** — `window.confirm` + 실패 `alert` 제거.
2. `useAuth.ts`의 **`clearAuthState(showAlert)`** — 세션 만료 시 **`alert` 제거**, UI가 감지 가능한 **상태 신호**로 대체.

> **같은 훅의 잔여 UI 호출:** `usePortfolios.ts`에는 저장·검증·거래 CRUD 등 **다수의 `alert`가 남아 있다**. 본 Phase 스니펫은 **삭제 플로우를 SSOT 예시**로 제시하고, 나머지는 **동일 패턴(검증 → 결과/에러 코드 반환 또는 throw, UI에서 다이얼로그·토스트)** 으로 순차 제거한다. `useAuth.ts`의 `USER_UPDATED` 비밀번호 성공 `alert` 등도 **동일 원칙**으로 UI 또는 토스트 SSOT로 이전한다.

---

### Phase 2-0. `TDS_DIALOG_MESSAGES` 확장(필수 선행)

Hook에는 **사용자 노출 문자열을 두지 않는다**. 아래 키를 **Phase 0-1 사전**에 추가하고, Consumer만 `TDS_DIALOG_MESSAGES[lang]`로 읽는다.

```ts
// TdsDialogMessageSet 에 추가(개념 스니펫 — 실제 병합은 Phase 0-1 파일에 반영)
  portfolio: {
    /** 삭제 확인 다이얼로그 */
    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    /** 카드/행의 삭제 진입 트리거(버튼 라벨) */
    openDeleteConfirm: string;
  };
  auth: {
    /** 세션 만료 단순 안내(TdsAlertDialog) */
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    sessionExpiredAcknowledge: string;
  };
```

- **`portfolio.*`:** `useAsyncTdsConfirm` + `TdsConfirmDialog` (`tone: 'danger'`)용.
- **`auth.*`:** `TdsAlertDialog`용(비동기 없음, 확인 클릭 → `onClose`만).

삭제 **API 실패** 후 토스트는 Phase 0-2b 계약에 따라 **`common.refundActionFailed`(범용 비동기 실패 SSOT)** 로 통일하거나, 필요 시 `common`에 **`mutationFailed`** 를 추가해 포트폴리오·거래 등에 공통 사용한다(키 추가 시 **한국어/영어 모두** 채울 것).

---

### Phase 2-1. `usePortfolios.ts` — 포트폴리오 삭제

#### Before — 문제점

- **`handleDeletePortfolio` 내부**에서 `lang`에 따라 메시지를 **문자열 리터럴로 조합**한 뒤 **`window.confirm(msg)`** 로 사용자 확인을 받는다. Hook이 **브라우저 네이티브 UI**에 의존하므로 **토스 웹뷰·심사 가이드(네이티브 대화상자 지양)** 와 충돌하고, **i18n SSOT**(`TDS_DIALOG_MESSAGES`)와 **이원화**된다.
- Supabase `error` 시 **`alert`로 원시 메시지**를 노출한다. 동일하게 **Hook의 UI 월권**이며, 실패 UX를 **다이얼로그/토스트 계약**과 맞출 수 없다.

#### Before 코드 스니펫(실제 저장소 구조 요약)

```ts
// hooks/usePortfolios.ts — 현행(발췌). Hook이 확인·알림을 담당하는 안티패턴.
const handleDeletePortfolio = useCallback(
  async (id: string) => {
    const msg =
      lang === 'ko'
        ? '정말로 이 포트폴리오를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
        : 'Are you sure you want to delete this portfolio? This action cannot be undone.';
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('portfolios').delete().eq('id', id);
    if (error) {
      alert(
        lang === 'ko'
          ? `포트폴리오 삭제에 실패했습니다: ${error.message}`
          : `Failed to delete portfolio: ${error.message}`,
      );
      return;
    }
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  },
  [lang],
);
```

#### After — Hook 스니펫(데이터만)

- **`window.confirm` / `alert` 전면 제거.**
- 확인은 호출하지 않는다. **이미 사용자가 확인한 뒤** UI가 호출한다고 가정한다.
- 실패 시 **`throw new Error('delete_failed', { cause: error })`** 형태로 **기계 판별 가능한 코드**만 던진다(메시지 문자열은 사용자 노출용이 아니라 **UI 계층에서 토스트/매핑용 식별자**로만 쓴다). 디버깅을 위해 **원인 객체는 `cause`에 유지**하는 것을 권장한다. 팀 규약으로 `const DELETE_PORTFOLIO_FAILED = 'delete_failed' as const` 를 **`constants/portfolioErrors.ts`** 등에 두고 재사용해도 된다.
- 성공 시에만 로컬 상태에서 해당 `id`를 제거한다.

```ts
// hooks/usePortfolios.ts — 발췌
const deletePortfolioById = useCallback(
  async (id: string) => {
    const { error } = await supabase.from('portfolios').delete().eq('id', id);
    if (error != null) {
      throw new Error('delete_failed', { cause: error });
    }
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  },
  [setPortfolios],
);
// return 객체에는 deletePortfolioById 노출; 기존 handleDeletePortfolio 이름은 제거하거나
// 레거시 호출부 마이그레이션 후 삭제(Dead code 금지).
```

- **의존성 무결성:** `setPortfolios`는 `usePortfolios` 내부 로컬 state가 아니라 **외부에서 주입된 setter** 이므로, `useCallback` deps에 **반드시 포함**한다. 삭제 경로에서 **Stale Closure** 를 허용하지 않는다.

#### After — UI Consumer 스니펫 (`PortfolioCardActions.tsx` 예시)

- **삭제 버튼 클릭 → `useAsyncTdsConfirm.open`으로 문구 스냅샷 → 사용자가 확인 시 `deletePortfolioById(id)` 호출.**
- `runConfirm`의 `catch`는 Phase 0-2b대로 **`TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`**(또는 공용 `mutationFailed`)만 사용한다.
- **`labels` / `actions` 무방비 접근 금지:** Phase 1-P1과 동일하게 **`?.` + `labels != null`일 때만** `TdsConfirmDialog` 렌더.

```tsx
// components/portfolio/PortfolioCardActions.tsx — 계획용 예시(경로는 프로젝트에 맞게 조정)
import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';

interface PortfolioCardActionsProps {
  lang: AppLang;
  portfolioId: string;
  onDeletePortfolio: (id: string) => Promise<void>;
}

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  portfolioId,
  onDeletePortfolio,
}) => {
  const deleteDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const triggerLabel =
    TDS_DIALOG_MESSAGES[lang]?.portfolio?.openDeleteConfirm ?? '';

  const handleRequestDelete = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.portfolio;
    if (messages == null) return;

    deleteDialog.open({
      title: messages.deleteTitle ?? '',
      body: messages.deleteBody ?? '',
      confirmLabel: messages.deleteConfirm ?? '',
      tone: 'danger',
      action: () => onDeletePortfolio(portfolioId),
    });
  }, [deleteDialog.open, lang, onDeletePortfolio, portfolioId]);

  return (
    <>
      <button type="button" onClick={handleRequestDelete}>
        {triggerLabel}
      </button>
      {labels != null ? (
        <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

- **Prop 네이밍 계약:** Hook 내부 구현 이름은 **`deletePortfolioById`** 여도 괜찮지만, **자식 컴포넌트에 주입하는 callback prop은 `onDeletePortfolio`** 로 통일한다.
- **`App.tsx` 등 상위:** `usePortfolios()`의 **`deletePortfolioById`** 를 **`onDeletePortfolio={deletePortfolioById}`** 형태로 내려주고, 기존 **`onDeletePortfolio={handleDeletePortfolio}`** 는 위 컴포넌트로 대체한다.

---

### Phase 2-2. `useAuth.ts` — 세션 만료 `alert` 제거

#### Before — 문제점

- **`clearAuthState`** 가 `showAlert === true`일 때 **`alert(lang === 'ko' ? '…' : '…')`** 를 직접 호출한다. 인증 상태 정리(스토리지·`signOut`·`setUser(null)` 등)와 **사용자 알림**이 한 함수에 섞여 **SRP 위반**이며, Hook이 **DOM `alert`** 에 의존한다.

#### Before 코드 스니펫(실제 저장소 구조 요약)

```ts
// hooks/useAuth.ts — useEffect 내부 발췌
const clearAuthState = async (showAlert: boolean = true) => {
  // … clearAuthStorage, signOut, setUser(null), setPortfolios([]) …
  if (showAlert) {
    alert(
      lang === 'ko'
        ? '세션이 만료되었습니다. 다시 로그인해 주세요.'
        : 'Session expired. Please log in again.',
    );
  }
};
```

#### After — Hook 스니펫(상태 신호)

- **`alert` 호출 삭제.**
- 세션 오류로 **강제 로그아웃이며 사용자에게 알려야 할 때**만, **`hasSessionExpired`** 를 `true`(또는 리터럴 유니온)로 세팅한다. `showAlert: false` 경로(복구 가능 오류 등)는 기존처럼 **조용히 정리**만 한다.
- UI는 다이얼로그를 닫을 때 **`handleDismissSessionExpired`** 로 플래그를 내린다.

```ts
// UseAuthReturn 확장(개념)
hasSessionExpired: boolean;
handleDismissSessionExpired: () => void;

// hooks/useAuth.ts — 상태
const [hasSessionExpired, setHasSessionExpired] = useState(false);

const handleDismissSessionExpired = useCallback(() => {
  setHasSessionExpired(false);
}, []);

// clearAuthState 내부: alert 제거 후
if (showAlert) {
  setHasSessionExpired(true);
}

// return { …, hasSessionExpired, handleDismissSessionExpired };
```

#### After — UI Consumer 스니펫 (`SessionExpiredAlertGate` 또는 `App.tsx` 근처)

- **`hasSessionExpired === true`** 이면 **`TdsAlertDialog`** 로 **`auth.sessionExpired*`** 문구 표시.
- 확인 클릭 시 **`handleDismissSessionExpired()`** 만 호출(비동기 없음 — Phase 0-4 계약).

```tsx
// components/auth/SessionExpiredAlertGate.tsx — 계획용 예시
import React from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsAlertDialog } from '../tds-adapter/TdsAlertDialog';

interface SessionExpiredAlertGateProps {
  lang: AppLang;
  isOpen: boolean;
  onDismiss: () => void;
}

export const SessionExpiredAlertGate: React.FC<SessionExpiredAlertGateProps> = ({
  lang,
  isOpen,
  onDismiss,
}) => {
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;

  if (authMessages == null || labels == null) {
    return null;
  }

  return (
    <TdsAlertDialog
      isOpen={isOpen}
      title={authMessages.sessionExpiredTitle ?? ''}
      body={authMessages.sessionExpiredBody ?? ''}
      confirmLabel={authMessages.sessionExpiredAcknowledge ?? ''}
      labels={labels}
      onClose={onDismiss}
    />
  );
};

// App.tsx(발췌): hasSessionExpired, handleDismissSessionExpired 를 useAuth에서 받아 전달
// <SessionExpiredAlertGate
//   lang={lang}
//   isOpen={hasSessionExpired}
//   onDismiss={handleDismissSessionExpired}
// />
```

- **`AuthModalCoordinator`와의 관계:** 세션 만료는 **전역·비모달 우선** 알림이므로 **`App` 최상단** 또는 **인증 레이아웃**에 두는 것이 자연스럽다. 로그인 모달 코디네이터와 **동일 사전(`TDS_DIALOG_MESSAGES`)** 을 쓰되, **책임 분리**를 위해 컴포넌트는 분리해도 된다.
- **Blind `useMemo` 금지:** `SessionExpiredAlertGate`의 문구 매핑은 **가벼운 문자열 읽기 + Guard Clause** 로 충분하다. 단순 객체 조립을 메모이제이션하지 말고, **`authMessages == null || labels == null` 조기 반환**으로 평탄하게 유지한다.

---

### 설계 포인트(반드시 준수)

1. **SRP:** Hook은 **API·캐시·React state** 만; **모달/confirm/alert** 는 **React 컴포넌트 트리**에서만.
2. **에러 핸들링 일원화:** 비동기 확인 실패 토스트는 **`useAsyncTdsConfirm.runConfirm`의 `catch`** 한 경로(Phase 0-2b). Hook은 **`throw` 또는 Result 타입**으로만 신호한다.
3. **Strict I18N:** Hook에 **한글/영문 리터럴 금지**. 식별은 **`delete_failed` 같은 기계 코드**(필요 시 `as const` 상수화) 또는 Result의 **discriminated union**으로.
4. **토스 심사·UX:** 네이티브 `alert`/`confirm` 제거 후 **TDS/어댑터**만 사용자 대면 창으로 사용한다.
5. **React Hook 규칙:** 외부에서 주입된 함수·값을 참조하는 `useCallback`은 **필요 의존성을 생략하지 않는다**. 본 Phase의 `deletePortfolioById`는 **`[setPortfolios]`** 를 유지한다.
6. **Zero Dead Code / No Blind useMemo:** 분리 후 **`window.confirm` 분기·미사용 `lang` 기반 메시지 조합**은 Hook에서 **완전 삭제**하고, Consumer에서도 **단순 문자열 매핑용 `useMemo`** 는 추가하지 않는다.
7. **Naming Convention:** Boolean state는 **`is` / `has` / `should` / `can`** 접두사를, 이벤트 핸들러는 **`handle*`**, callback prop은 **`on*`** 접두사를 유지한다. 본 Phase에서는 **`hasSessionExpired`**, **`handleDismissSessionExpired`**, **`onDeletePortfolio`** 를 기준 이름으로 사용한다.

**완료 기준**

- `usePortfolios`의 **삭제 경로**에서 `window.confirm` / `alert` 가 **0건**.
- `useAuth`의 **`clearAuthState`** 에서 **`alert` 가 0건**; 세션 만료는 **`hasSessionExpired` + `TdsAlertDialog`** 로만 노출.
- 포트폴리오 삭제는 **`PortfolioCardActions`(또는 동등 코디네이터) + `useAsyncTdsConfirm` + `deletePortfolioById`** 패턴으로 동작.
- **`TDS_DIALOG_MESSAGES`** 에 **`portfolio`·`auth` 섹션**이 추가되어 있고, Consumer에서만 참조한다.

## Phase 3. 선택적 일관성 개선

1. `Toast`
2. `Toggle`
3. 인증 입력 폼
4. 단순 Button/Input

---

## 작업 경계

### 이번 마이그레이션에서 절대 수정하지 않는 범위

- `components/StrategyCreator.tsx`
- `components/strategies/VrBandStrategyForm.tsx`
- `components/Dashboard.tsx`
- `components/Backtest.tsx`
- `components/BacktestResultsCharts.tsx`
- `components/Markets.tsx`
- `components/VrOrderModal.tsx`

### 명시적 제약

**Tier 3로 분류된 복잡한 비즈니스 폼(`StrategyCreator.tsx`, `VrBandStrategyForm.tsx` 등)은 본 마이그레이션에서 절대 수정하지 않습니다.**

이 라운드의 목표는 심사 통과이며, 비즈니스 로직이 얽힌 고위험 폼의 UI 전면 교체가 아닙니다.

---

## 승인 결과를 기준으로 한 최종 권고

### 최소 승인 범위

1. `Tier 1-P0` 종료/이탈/정책 안내 모달만 우선 구현
2. `TdsDialogShell`, `TdsAlertDialog`, `TdsConfirmDialog`만 먼저 도입

### 권장 승인 범위

1. `Tier 1-P0`
2. `Tier 1-P1`
3. 브라우저 기본 `alert`/`confirm` 제거

이렇게 하면 심사 대응과 리스크 관리 사이의 균형이 가장 좋습니다.
