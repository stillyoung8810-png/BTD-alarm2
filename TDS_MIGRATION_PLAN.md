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
- **확인 다이얼로그 코디네이터**: `TdsConfirmDialog` / `TdsAlertDialog`를 쓰는 모든 스니펫은 **Phase 0-6a 표준 템플릿**과 동일하게 `isConfirmLoading` + `try` / `catch` / `finally` + **성공 시에만** 닫기를 적용한다(옛 「먼저 닫고 뒤에서 액션」 패턴 금지).

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
  };
  refund: {
    guideTitle: string;
    guideBody: string;
  };
  common: {
    acknowledge: string;
    /** 환불·결제 비동기 실패 시 토스트(다이얼로그는 유지) */
    refundActionFailed: string;
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
    },
    refund: {
      guideTitle: '환불 안내',
      guideBody:
        '안드로이드는 토스 앱 결제내역의 환불 경로를 이용하고, iOS는 애플 고객센터 환불 경로를 이용합니다.',
    },
    common: {
      acknowledge: '확인',
      refundActionFailed:
        '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
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
    },
    refund: {
      guideTitle: 'Refund guide',
      guideBody:
        'Use Toss payment history on Android, or Apple Support on iOS, to request a refund.',
    },
    common: {
      acknowledge: 'OK',
      refundActionFailed:
        'Something went wrong. Please try again in a moment.',
    },
  },
};
```

### 설계 포인트

- JSX에는 한국어/영어를 직접 넣지 않습니다.
- 종료 유형은 `ExitDialogReason`으로 분기하고, 번역 문자열로 로직을 분기하지 않습니다.
- 추후 심사 카피가 바뀌더라도 **사전 파일만 수정**하면 됩니다.
- `common.refundActionFailed`는 결제·환불 등 **비동기 확인 실패 시 토스트 문구 SSOT**로 둡니다(상태/런타임 방어 규칙 §5-3).

## Phase 0-2. 공통 타입 및 닫힌 상태 팩토리

### `components/tds-adapter/dialogState.ts`

```ts
import type { DialogTone } from '../../constants/tdsDialogMessages';

export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  body: string;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone: DialogTone;
  onConfirm: (() => Promise<void> | void) | null;
}

export const createClosedAlertDialogState = (): AlertDialogState => ({
  isOpen: false,
  title: '',
  body: '',
});

export const createClosedConfirmDialogState = (): ConfirmDialogState => ({
  isOpen: false,
  title: '',
  body: '',
  confirmLabel: '',
  tone: 'primary',
  onConfirm: null,
});
```

### 설계 포인트

- 닫힌 상태를 팩토리 함수로 만들면 초기화 로직이 중복되지 않습니다.
- `onConfirm`은 `null` 허용으로 설계해 stale callback을 방지합니다.

## Phase 0-3. `TdsDialogShell.tsx`

### `components/tds-adapter/TdsDialogShell.tsx`

```tsx
import React, {
  useCallback,
  useEffect,
  useId,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { useTossApp } from '../../contexts/TossAppContext';
import { TDSModal } from '../tds';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

const WEB_DIALOG_MAX_WIDTH_CLASS = 'max-w-md';

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

const handleClosableKeyDown = (
  event: KeyboardEvent<HTMLDivElement>,
  tryClose: () => void,
): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    tryClose();
  }
};

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

  // 웹 폴백: ESC로 닫기 — 로딩 중에는 리스너가 early return 하도록 분기(토스는 TDSModal→guardedClose에 위임).
  // Hooks 순서 유지: 조기 return null은 이 useEffect 아래에 둔다.
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
  }, [isConfirmLoading, isInTossApp, isOpen, onClose]);

  // Web 폴백만 닫힌 상태에서 조기 반환: 오버레이·dialogBody 생성 비용을 피한다.
  // Toss 경로에서는 최상단 if (!isOpen) return null을 두지 않는다 — TDSModal이 open={false}를
  // 한 번은 받아야 퇴장 전이(exit)를 구현한 레이어에서 처리할 수 있다(실제 동작은 아래 설계 포인트 참고).
  if (!isInTossApp && !isOpen) {
    return null;
  }

  const dialogBody = (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={`relative w-full ${maxWidthClassName} overflow-hidden rounded-[2rem] bg-white shadow-xl`}
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        role="button"
        tabIndex={isConfirmLoading ? -1 : 0}
        aria-label={labels.backdropAriaLabel}
        aria-disabled={isConfirmLoading}
        onClick={guardedClose}
        onKeyDown={(event) => handleClosableKeyDown(event, guardedClose)}
        className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm ${
          isConfirmLoading ? 'pointer-events-none' : ''
        }`}
      />
      {dialogBody}
    </div>
  );
};

export default TdsDialogShell;
```

### 설계 포인트

- 실제 토스 환경 분기는 `useTossApp().isInTossApp`로만 판단합니다.
- TDS 원본을 화면에서 직접 쓰지 않고, **`TdsDialogShell`만 공개 API**로 사용합니다.
- **`isConfirmLoading` + `guardedClose`:** `true`일 때는 `onClose`가 호출되지 않습니다. X 버튼 비활성화, 웹 배경 `pointer-events-none`·`tabIndex={-1}`, 웹 전용 `Escape` 리스너에서 조기 반환, `TDSModal`의 `onClose`도 동일하게 `guardedClose`로 연결해 **로딩 중 이탈 경로를 막습니다.**
- **최상단 `if (!isOpen) return null`은 제거**합니다. 토스 경로에서 `TDSModal`이 닫힐 때도 `open={false}`를 전달받을 수 있게 해, 퇴장 전이를 담당하는 구현(공식 TDS Modal 등)과 계약을 맞춥니다.
- **현재 저장소의 `components/tds/TDSModal.tsx`도 `!open`이면 `return null`인 경우가 많습니다.** 그 경우 쉘만 고쳐도 즉시 부드러운 exit가 보이지 않을 수 있으므로, **실제 퇴장 애니메이션·`onExited` 타이밍은 `TDSModal`(또는 `@toss/tds-mobile` 직결) 개선과 함께 검증**합니다.
- **조건부 렌더링:** 웹 폴백에서만 `!isInTossApp && !isOpen`일 때 `null`로 차단해, 닫힌 웹 모달에서 `dialogBody` 트리를 만들지 않습니다. 토스 경로는 닫힘 중에도 `TDSModal` 자식이 필요할 수 있어 이 최적화를 적용하지 않습니다.
- 웹 폴백에서도 backdrop은 A11y 요구사항을 만족하도록 `role`, `tabIndex`, `onKeyDown`, `aria-label`을 포함합니다.
- `titleId`/`bodyId`를 사용해 스크린 리더 연결을 명확히 합니다.

## Phase 0-4. `TdsAlertDialog.tsx`

### `components/tds-adapter/TdsAlertDialog.tsx`

```tsx
import React, { useCallback } from 'react';
import { TDSButton } from '../tds';
import { TdsDialogShell } from './TdsDialogShell';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

export interface TdsAlertDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  labels: DialogActionLabels;
  isConfirmLoading?: boolean;
  onClose: () => void;
  onConfirm?: () => Promise<void> | void;
}

export const TdsAlertDialog: React.FC<TdsAlertDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  labels,
  isConfirmLoading = false,
  onClose,
  onConfirm,
}) => {
  const handleConfirmClick = useCallback(async () => {
    // SRP: 부모가 onConfirm을 전달하면 닫기 제어권을 부모에 위임한다.
    // onConfirm이 없을 때만(순수 Alert) 자식이 onClose를 호출해 이중 닫기(Double Close)를 방지한다.
    if (onConfirm) {
      await Promise.resolve(onConfirm());
    } else {
      onClose();
    }
  }, [onClose, onConfirm]);

  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      isConfirmLoading={isConfirmLoading}
      footer={
        <TDSButton
          type="button"
          variant="primary"
          fullWidth
          loading={isConfirmLoading}
          disabled={isConfirmLoading}
          onClick={handleConfirmClick}
        >
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

- 버튼 문구는 모두 외부에서 주입됩니다.
- **`onConfirm`이 있으면** 확인 후 `onClose`를 **자식에서 호출하지 않는다.** 부모의 `onConfirm` 안에서 `setState`로 닫기까지 처리해 **이중 상태 변이(Double State Mutation)** 를 막는다.
- **`onConfirm`이 없으면** 순수 알림으로 동작하며, 이때만 자식이 `onClose()`로 닫는다.
- 별도 state mutation은 렌더 단계가 아닌 `handleConfirmClick`에서만 일어난다.
- **`isConfirmLoading`을 `TdsDialogShell`에 전달**해 로딩 중 X·배경·ESC·TDS `onClose`가 막히도록 한다(One-click Lock + Block Close during Loading).
- 확인 버튼은 `loading` + `disabled`로 **중복 클릭(중복 요청)** 을 이중으로 방어한다.

## Phase 0-5. `TdsConfirmDialog.tsx`

### `components/tds-adapter/TdsConfirmDialog.tsx`

```tsx
import React, { useCallback } from 'react';
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
  isConfirmLoading = false,
  onClose,
  onConfirm,
}) => {
  const handleConfirmClick = useCallback(async () => {
    await Promise.resolve(onConfirm());
  }, [onConfirm]);

  return (
    <TdsDialogShell
      isOpen={isOpen}
      title={title}
      labels={labels}
      onClose={onClose}
      isConfirmLoading={isConfirmLoading}
      footer={
        <div className="flex gap-3">
          <TDSButton
            type="button"
            variant="tertiary"
            fullWidth
            disabled={isConfirmLoading}
            onClick={onClose}
          >
            {labels.cancel}
          </TDSButton>
          <TDSButton
            type="button"
            variant={getButtonVariant(tone)}
            fullWidth
            loading={isConfirmLoading}
            disabled={isConfirmLoading}
            onClick={handleConfirmClick}
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
- **`isConfirmLoading`을 `TdsDialogShell`에 전달**해 로딩 중 헤더 X·배경·ESC가 막힌다. 취소 버튼도 `disabled`로 두어 **로딩 중 이중 액션(취소로 닫힘 vs 확인 진행)** 을 막는다(결제·환불 등 일관 잠금 UX).
- 확인 버튼은 `loading` + `disabled`로 One-click Lock을 강화한다.
- **Safe Try-Catch-Finally**는 부모의 `onConfirm` 구현에 두고, 어댑터는 닫기 차단만 담당한다.

## Phase 0-6. 상태 주입과 해제 패턴

### 샘플: `open`, `title`, `body`, `onConfirm` 주입/해제

```tsx
import React, { useCallback, useState } from 'react';
import type { AppLang } from '../types';
import {
  TDS_DIALOG_MESSAGES,
  type DialogActionLabels,
} from '../constants/tdsDialogMessages';
import {
  createClosedConfirmDialogState,
  type ConfirmDialogState,
} from '../components/tds-adapter/dialogState';
import { TdsConfirmDialog } from '../components/tds-adapter/TdsConfirmDialog';

interface ConfirmDialogSampleProps {
  lang: AppLang;
}

export const ConfirmDialogSample: React.FC<ConfirmDialogSampleProps> = ({
  lang,
}) => {
  const messages = TDS_DIALOG_MESSAGES[lang];
  const [confirmState, setConfirmState] = useState<ConfirmDialogState>(
    createClosedConfirmDialogState(),
  );
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const handleCloseConfirmDialog = useCallback(() => {
    setConfirmState(createClosedConfirmDialogState());
  }, []);

  const handleOpenDangerDialog = useCallback(() => {
    setConfirmState({
      isOpen: true,
      title: messages.history.clearTitle,
      body: messages.history.clearBody,
      confirmLabel: messages.history.clearConfirm,
      tone: 'danger',
      onConfirm: async () => {
        console.log('danger action');
      },
    });
  }, [messages.history.clearBody, messages.history.clearConfirm, messages.history.clearTitle]);

  const handleConfirm = useCallback(async () => {
    const action = confirmState.onConfirm;
    if (action == null) {
      return;
    }

    setIsConfirmLoading(true);
    try {
      await Promise.resolve(action());
      handleCloseConfirmDialog();
    } catch (_error: unknown) {
      // §5-3: 모달 유지 — showErrorToast(messages.common.refundActionFailed); 로깅 시 _error 전달
    } finally {
      setIsConfirmLoading(false);
    }
  }, [confirmState.onConfirm, handleCloseConfirmDialog]);

  return (
    <>
      <button type="button" onClick={handleOpenDangerDialog}>
        open
      </button>
      <TdsConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        body={confirmState.body}
        confirmLabel={confirmState.confirmLabel}
        labels={messages.actions}
        tone={confirmState.tone}
        isConfirmLoading={isConfirmLoading}
        onClose={handleCloseConfirmDialog}
        onConfirm={handleConfirm}
      />
    </>
  );
};
```

### 설계 포인트

- `onConfirm`는 렌더 단계에서 실행되지 않습니다.
- **상태/런타임 방어 규칙 §5와 정렬:** 확인 핸들러는 **`await` 성공 후에만** `handleCloseConfirmDialog`를 호출하고, `isConfirmLoading`을 쉘에 넘겨 One-click Lock·닫기 잠금을 켠다. (과거 스니펫의 「먼저 닫고 뒤에서 액션」 패턴은 비동기 실패 시 모달을 복구할 수 없어 **문서 내에서 폐기**한다.)
- 아래 **Phase 0-6a**와 **동일한 제어 흐름**(문자열·주석 포함)을 유지해 문서 전체 AST를 단일 표준으로 맞춘다.

## Phase 0-6a. 확인 다이얼로그 `onConfirm` 표준 템플릿 (SSOT)

`ConfirmDialogSample`, `AuthModalCoordinator`, `HistoryHeaderActions`는 **아래 블록과 구조적으로 동일**해야 한다. 차이는 `confirmState`/`handleClose*` 이름과 `TdsConfirmDialog` 주입 props뿐이다.

### 패턴 A — `ConfirmDialogState` + `TdsConfirmDialog`

```tsx
const handleConfirmFromConfirmState = useCallback(async () => {
  const action = confirmState.onConfirm;
  if (action == null) {
    return;
  }

  setIsConfirmLoading(true);
  try {
    await Promise.resolve(action());
    handleCloseDialog(); // 성공(Resolved) 후에만 호출
  } catch (_error: unknown) {
    // §5-3: 모달 유지 — showErrorToast(messages.common.refundActionFailed); 로깅 시 _error 전달
  } finally {
    setIsConfirmLoading(false);
  }
}, [confirmState.onConfirm, handleCloseDialog]);
```

| 스니펫 | `handleCloseDialog`에 해당하는 심볼 |
|---|---|
| Phase 0-6 `ConfirmDialogSample` | `handleCloseConfirmDialog` |
| Phase 1-P0 `AuthModalCoordinator` | `handleCloseExitDialog` |
| Phase 1-P1 `HistoryHeaderActions` | `handleCloseConfirmDialog` |

`TdsConfirmDialog`에는 반드시 `isConfirmLoading={isConfirmLoading}`를 넘긴다.

### 패턴 B — `AlertDialogState` + `TdsAlertDialog` (예: 환불 안내)

`state.onConfirm`에 액션을 넣지 않고, 확인 시 **클로저로 주입된 비동기**만 실행하는 경우(Phase 1-P1 `RefundGuideController`):

```tsx
const handleConfirmAlertAsync = useCallback(async () => {
  setIsConfirmLoading(true);
  try {
    await Promise.resolve(onProcessWebRefund());
    handleCloseAlertDialog();
    onCloseRefundPanel();
  } catch (_error: unknown) {
    // §5-3: 모달 유지 — showErrorToast(dialogMessages.common.refundActionFailed); 로깅 시 _error 전달
  } finally {
    setIsConfirmLoading(false);
  }
}, [handleCloseAlertDialog, onCloseRefundPanel, onProcessWebRefund]);
```

### 설계 포인트

- **금지:** `handleClose*`를 `await` **앞**에 두는 옛 패턴(실패 시 복구 불가).
- **필수:** `setIsConfirmLoading(true)`는 `try` 직전, `setIsConfirmLoading(false)`는 `finally`만 사용.
- `action == null`이면 **로딩 플래그를 켜지 않고** 즉시 return한다.
- **`confirmState.onConfirm` 안에서 하위 비동기 경계를 호출할 때는 Promise가 코디네이터의 `await`까지 전파되게 한다.** (1) `return onRequestMiniAppExit();`처럼 반환하거나, (2) `async () => { await onRequestMiniAppExit(); 후속동기작업(); }`처럼 **후속 동기 부작용(예: `onCloseAuthModal`)은 `await` 뒤에만** 둔다. 호출만 하고 `await`/`return` 없이 넘기면 `await Promise.resolve(action())`가 즉시 resolve되어 §5-3 `catch`가 무력화되고, **닫기를 앞에 두면 언마운트 경합**이 난다(Phase 1-P0 `AuthModalCoordinator` 참고).

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
import React, { useCallback, useState } from 'react';
import type { AppLang } from '../types';
import { useTossApp } from '../contexts/TossAppContext';
import AuthModals from '../components/AuthModals';
import { TdsConfirmDialog } from '../components/tds-adapter/TdsConfirmDialog';
import {
  TDS_DIALOG_MESSAGES,
  type ExitDialogReason,
} from '../constants/tdsDialogMessages';
import {
  createClosedConfirmDialogState,
  type ConfirmDialogState,
} from '../components/tds-adapter/dialogState';

/** 무거운 `AuthModals` 자식으로 매 렌더 새 함수를 넘기지 않기 위한 안정 참조 */
const NOOP = (): void => {};

interface AuthModalCoordinatorProps {
  lang: AppLang;
  isOpen: boolean;
  onCloseAuthModal: () => void;
  /** reject를 반환해야 `handleConfirmExit`의 `try/catch`가 비동기 실패를 잡을 수 있음 */
  onRequestMiniAppExit: () => Promise<void> | void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
}) => {
  const { isInTossApp } = useTossApp();
  const dialogMessages = TDS_DIALOG_MESSAGES[lang];
  const [confirmState, setConfirmState] = useState<ConfirmDialogState>(
    createClosedConfirmDialogState(),
  );
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const handleCloseExitDialog = useCallback(() => {
    setConfirmState(createClosedConfirmDialogState());
  }, []);

  const handleRequestExit = useCallback(
    (reason: ExitDialogReason) => {
      if (!isInTossApp) {
        onCloseAuthModal();
        return;
      }

      const exitMessage = dialogMessages.exit[reason];

      setConfirmState({
        isOpen: true,
        title: exitMessage.title,
        body: exitMessage.body,
        confirmLabel: exitMessage.confirm,
        tone: 'primary',
        onConfirm: async () => {
          await Promise.resolve(onRequestMiniAppExit());
          onCloseAuthModal();
        },
      });
    },
    [dialogMessages.exit, isInTossApp, onCloseAuthModal, onRequestMiniAppExit],
  );

  const handleAuthClose = useCallback(() => {
    handleRequestExit('auth_close');
  }, [handleRequestExit]);

  const handleConfirmExit = useCallback(async () => {
    const action = confirmState.onConfirm;
    if (action == null) {
      return;
    }

    setIsConfirmLoading(true);
    try {
      await Promise.resolve(action());
      handleCloseExitDialog();
    } catch (_error: unknown) {
      // §5-3: 모달 유지 — showErrorToast(dialogMessages.common.refundActionFailed); 로깅 시 _error 전달
    } finally {
      setIsConfirmLoading(false);
    }
  }, [confirmState.onConfirm, handleCloseExitDialog]);

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

      <TdsConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        body={confirmState.body}
        confirmLabel={confirmState.confirmLabel}
        labels={dialogMessages.actions}
        tone={confirmState.tone}
        isConfirmLoading={isConfirmLoading}
        onClose={handleCloseExitDialog}
        onConfirm={handleConfirmExit}
      />
    </>
  );
};
```

### 설계 포인트

- 종료 동작은 `onRequestMiniAppExit`로 위임하므로, 토스 공식 API 선택은 앱 경계에서만 결정됩니다.
- 토스 앱이 아닐 때는 기존 웹 UX를 유지합니다.
- `AuthModals`는 여전히 기존 비즈니스 로직을 유지하고, **닫기 이벤트만 외부 코디네이터가 가로채는 방식**입니다.
- **§5·Phase 0-6a·Promise 체이닝:** props 타입은 `onRequestMiniAppExit: () => Promise<void> | void`이다. `confirmState.onConfirm`은 **`async`로 두고 `await Promise.resolve(onRequestMiniAppExit())`가 끝난 뒤에만 `onCloseAuthModal()`을 호출**한다. 이렇게 하면 코디네이터의 `handleConfirmExit`가 동일 Promise를 `await`하며 reject를 `catch`로 넘길 수 있고, **`return` 없이 하위 비동기만 호출하는 패턴**처럼 `await`가 즉시 끝나 버리는 Silent Failure도 방지한다.
- 비동기 작업(`onRequestMiniAppExit`)이 온전히 `await`된 후 성공 시에만 `onCloseAuthModal()`을 호출하도록 순서를 강제하여, **언마운트 경합(Unmount Race Condition)** 으로 인한 UX 파괴를 방지한다.
- **자식 props 안정화:** `AuthModals`는 폼·상태가 큰 컴포넌트일 수 있으므로 `onClose`는 `handleAuthClose`(`useCallback`), 플레이스홀더는 모듈 상수 `NOOP`로 고정해 **렌더마다 새 함수 참조를 만들지 않는다.**

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
import React, { useCallback, useState } from 'react';
import type { AppLang } from '../types';
import { TdsConfirmDialog } from '../components/tds-adapter/TdsConfirmDialog';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import {
  createClosedConfirmDialogState,
  type ConfirmDialogState,
} from '../components/tds-adapter/dialogState';

interface HistoryHeaderActionsProps {
  lang: AppLang;
  canClearHistory: boolean;
  /** 실패 시 reject하는 Promise를 반환하면 §5-3 `catch`에서 모달 유지·토스트가 동작한다. */
  onClearHistory: () => Promise<void> | void;
}

export const HistoryHeaderActions: React.FC<HistoryHeaderActionsProps> = ({
  lang,
  canClearHistory,
  onClearHistory,
}) => {
  const dialogMessages = TDS_DIALOG_MESSAGES[lang];
  const [confirmState, setConfirmState] = useState<ConfirmDialogState>(
    createClosedConfirmDialogState(),
  );
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const handleCloseConfirmDialog = useCallback(() => {
    setConfirmState(createClosedConfirmDialogState());
  }, []);

  const handleRequestClearHistory = useCallback(() => {
    setConfirmState({
      isOpen: true,
      title: dialogMessages.history.clearTitle,
      body: dialogMessages.history.clearBody,
      confirmLabel: dialogMessages.history.clearConfirm,
      tone: 'danger',
      onConfirm: onClearHistory,
    });
  }, [
    dialogMessages.history.clearBody,
    dialogMessages.history.clearConfirm,
    dialogMessages.history.clearTitle,
    onClearHistory,
  ]);

  const handleConfirmClearHistory = useCallback(async () => {
    const action = confirmState.onConfirm;
    if (action == null) {
      return;
    }

    setIsConfirmLoading(true);
    try {
      await Promise.resolve(action());
      handleCloseConfirmDialog();
    } catch (_error: unknown) {
      // §5-3: 모달 유지 — showErrorToast(dialogMessages.common.refundActionFailed); 로깅 시 _error 전달
    } finally {
      setIsConfirmLoading(false);
    }
  }, [confirmState.onConfirm, handleCloseConfirmDialog]);

  if (!canClearHistory) {
    return null;
  }

  return (
    <>
      <button type="button" onClick={handleRequestClearHistory}>
        clear
      </button>

      <TdsConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        body={confirmState.body}
        confirmLabel={confirmState.confirmLabel}
        labels={dialogMessages.actions}
        tone={confirmState.tone}
        isConfirmLoading={isConfirmLoading}
        onClose={handleCloseConfirmDialog}
        onConfirm={handleConfirmClearHistory}
      />
    </>
  );
};
```

### 설계 포인트

- 상태 갱신은 오직 `handleRequestClearHistory`, `handleCloseConfirmDialog`, `handleConfirmClearHistory`에서만 일어납니다.
- 렌더 단계에서 state mutation이 일어나지 않습니다.
- `onClearHistory`는 기존 비즈니스 로직을 유지하되, **비동기·실패 전파가 필요하면 Promise + reject**로 구현해 §5-3과 맞춘다.
- **§5-1·5-2·Phase 0-6a:** `handleConfirmClearHistory`는 **패턴 A**와 동일하며, `isConfirmLoading`을 `TdsConfirmDialog`에 주입해 확인 이중 클릭과 로딩 중 닫기를 막는다.

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

`ProfileView` 등 상위에서 **웹 환경의 기존 환불 플로우**(예: 포트원/서버 검증 후 처리)를 `onProcessWebRefund`로 주입한다. `if (!isInTossApp) return;`만 두면 웹 사용자는 버튼이 **무반응(Silent Failure)** 이 되므로 금지한다.

```tsx
// components/auth/ProfileView.tsx 내부 RefundGuideController (수정 스니펫)
import React, { useCallback, useState } from 'react';
import type { AppLang } from '../../types';
import { TdsAlertDialog } from '../tds-adapter/TdsAlertDialog';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import {
  createClosedAlertDialogState,
  type AlertDialogState,
} from '../tds-adapter/dialogState';
// import { showErrorToast } from '../Toast'; // 프로젝트의 토스트/알림 유틸

interface RefundGuideControllerProps {
  lang: AppLang;
  isInTossApp: boolean;
  onCloseRefundPanel: () => void;
  /**
   * 웹: 패널에서 즉시 실행할 환불 플로우(기존 handleRefundConfirm 비토스 분기).
   * 토스: 다이얼로그 확인 시 `handleConfirmRefundGuide`의 try에서 await — 안내 확인만이면 `async () => {}` 주입.
   */
  onProcessWebRefund: () => Promise<void> | void;
}

export const RefundGuideController: React.FC<RefundGuideControllerProps> = ({
  lang,
  isInTossApp,
  onCloseRefundPanel,
  onProcessWebRefund,
}) => {
  const dialogMessages = TDS_DIALOG_MESSAGES[lang];
  const [alertState, setAlertState] = useState<AlertDialogState>(
    createClosedAlertDialogState(),
  );
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const handleCloseAlertDialog = useCallback(() => {
    setAlertState(createClosedAlertDialogState());
  }, []);

  const handleRequestRefundGuide = useCallback(() => {
    if (!isInTossApp) {
      onProcessWebRefund();
      onCloseRefundPanel();
      return;
    }

    setAlertState({
      isOpen: true,
      title: dialogMessages.refund.guideTitle,
      body: dialogMessages.refund.guideBody,
    });
  }, [
    dialogMessages.refund.guideBody,
    dialogMessages.refund.guideTitle,
    isInTossApp,
    onCloseRefundPanel,
    onProcessWebRefund,
  ]);

  const handleConfirmRefundGuide = useCallback(async () => {
    setIsConfirmLoading(true);
    try {
      await Promise.resolve(onProcessWebRefund());
      handleCloseAlertDialog();
      onCloseRefundPanel();
    } catch (_error: unknown) {
      // §5-3: 모달 유지 — showErrorToast(dialogMessages.common.refundActionFailed); 로깅 시 _error 전달
    } finally {
      setIsConfirmLoading(false);
    }
  }, [handleCloseAlertDialog, onCloseRefundPanel, onProcessWebRefund]);

  return (
    <>
      <button type="button" onClick={handleRequestRefundGuide}>
        refund
      </button>

      <TdsAlertDialog
        isOpen={alertState.isOpen}
        title={alertState.title}
        body={alertState.body}
        confirmLabel={dialogMessages.common.acknowledge}
        labels={dialogMessages.actions}
        isConfirmLoading={isConfirmLoading}
        onClose={handleCloseAlertDialog}
        onConfirm={handleConfirmRefundGuide}
      />
    </>
  );
};
```

### 설계 포인트

- 토스: TDS 계열 안내 다이얼로그만 연다. **`handleConfirmRefundGuide`는 Phase 0-6a 패턴 B**와 동일하게, `try`에서 `await onProcessWebRefund()`가 성공(Resolved)한 뒤에만 `handleCloseAlertDialog`·`onCloseRefundPanel`을 호출한다.
- **`catch`에서는 다이얼로그를 닫지 않는다.** `dialogMessages.common.refundActionFailed`를 토스트 등으로 노출하고(하드코딩 문자열 금지), **`finally`에서 `isConfirmLoading`을 해제**해 X·배경·ESC 잠금을 푼다.
- 토스 안내 확인만 필요하면 부모가 `onProcessWebRefund`에 `async () => {}`를 넘겨 네트워크 없이 성공 경로만 탄다.
- 웹: `onProcessWebRefund`로 **기존 비즈니스 플로우를 단절 없이** 이어 받고, 패널은 `onCloseRefundPanel`로 닫는다. (웹 즉시 경로에도 동일한 try/catch를 씌우는 것을 권장한다.)
- 문구는 모두 `TDS_DIALOG_MESSAGES`에서 주입한다.

---

## 상태/런타임 방어 규칙

## 1. Render phase에서 state mutation 금지

- `setState`는 클릭/확인/닫기 핸들러 안에서만 호출합니다.
- JSX 안에서 `setState(...)`를 직접 실행하지 않습니다.
- `confirmState.onConfirm?.()` 같은 호출도 렌더 안에서 하지 않습니다.

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

결제·환불·삭제 등 **부작용이 큰 확인 다이얼로그**에는 아래를 기본 계약으로 둡니다. **코디네이터 구현의 단일 기준은 Phase 0-6a**이며, 구체 예시는 Phase 0-3 `TdsDialogShell`, Phase 0-4/0-5 어댑터, Phase 0-6 `ConfirmDialogSample`, Phase 1-P0 `AuthModalCoordinator`, Phase 1-P1 `HistoryHeaderActions`·`RefundGuideController`를 참고합니다.

### 5-1. 중복 클릭 차단 (One-click Lock)

- 비동기 확인 중(`isConfirmLoading === true`)에는 **확인 버튼을 즉시 비활성화**하고, 가능하면 `loading` 표시를 겹쳐 **중복 API 요청**을 막습니다.
- `TDSButton`에 `disabled={isConfirmLoading}`와 `loading={isConfirmLoading}`를 함께 쓰는 패턴을 권장합니다.

### 5-2. 로딩 중 화면 잠금 (Block Close during Loading)

- `isConfirmLoading` 동안은 **X(닫기)**, **배경(Backdrop) 클릭**, **Escape**, 그리고 토스 경로에서 `TDSModal`이 호출하는 **`onClose`**까지 **`guardedClose`로 통일**해 닫기 호출을 무시합니다.
- `TdsConfirmDialog`는 **취소 버튼도 동일 구간에서 `disabled`** 처리해, 진행 중인 확인과 경쟁하는 닫기 동작을 막습니다.

### 5-3. Safe Try-Catch-Finally

- `onConfirm`에서 `async` 작업을 실행할 때는 부모에서 **`try` / `catch` / `finally`를 강제**하는 Mental Model을 따릅니다.
- **성공(Resolved) 시에만** `setState`로 모달을 닫고 후속 UI(패널 닫기 등)를 진행합니다.
- **`catch`에서는 모달을 닫지 않고** `TDS_DIALOG_MESSAGES.common.refundActionFailed` 등 **사전에 정의된 문구로 토스트·인라인 오류**를 냅니다.
- **`finally`에서 `setIsConfirmLoading(false)`** 로 잠금을 해제해, 사용자가 재시도하거나 수동으로 닫을 수 있게 합니다.

---

## 권장 구현 순서

## Phase 0. 어댑터 준비

1. `constants/tdsDialogMessages.ts`
2. `components/tds-adapter/dialogState.ts`
3. `components/tds-adapter/TdsDialogShell.tsx`
4. `components/tds-adapter/TdsAlertDialog.tsx`
5. `components/tds-adapter/TdsConfirmDialog.tsx`

**완료 기준**

- 새 다이얼로그는 모두 어댑터만 통해 생성 가능
- i18n 문구가 단일 사전에 존재
- 토스/웹 분기가 `TdsDialogShell` 내부로 캡슐화
- 비동기 확인이 있는 화면은 **`isConfirmLoading` + `guardedClose` + 부모 `try/catch/finally`** 계약을 따름(상태/런타임 방어 규칙 §5)

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
- `TdsConfirmDialog` / `TdsAlertDialog` 코디네이터는 **Phase 0-6a**(`isConfirmLoading` + 성공 시에만 닫기 + `try`/`catch`/`finally`)를 위반하지 않음

## Phase 2. Hook 계층 분리

1. `usePortfolios.ts`
2. `useAuth.ts`

**완료 기준**

- Hook이 UI 팝업을 직접 호출하지 않음
- 화면에서만 다이얼로그를 제어함

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
