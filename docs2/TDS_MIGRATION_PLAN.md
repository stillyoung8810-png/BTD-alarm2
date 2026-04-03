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
- **확인 다이얼로그 코디네이터**: **`TdsConfirmDialog`만** **`useAsyncTdsConfirm(lang)`** 과 짝을 이룬다(`onConfirm` → `runConfirm`). **기획상 단일 버튼만 노출하는 비동기 안내**는 **`shouldHideCancel={true}`** 로 처리하고 `TdsAlertDialog`로 우회하지 않는다. **`TdsAlertDialog`는 순수 안내(확인 한 번으로 닫힘)** 만 담당하며 `onClose`만 받고, 비동기·로딩·`catch`·에러 토스트는 넣지 않는다(SRP). `useState`에 **콜백 함수를 저장하지 않는다**(Stale Closure·직렬화·디버깅 리스크). 비동기 확인의 **훅 단일 구현** 규칙은 **`TdsConfirmDialog` 경로**에만 적용한다.

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
  auth: {
    /** 로그인/즉시 세션 생성 회원가입 성공 후 노출할 환영 안내 */
    signedInSuccessTitle: string;
    signedInSuccessBody: string;
    /** 비밀번호 변경 완료 안내 */
    passwordChangedTitle: string;
    passwordChangedBody: string;
    /** 비밀번호 변경 후 재로그인 안내 */
    passwordChangedReloginTitle: string;
    passwordChangedReloginBody: string;
    /** 회원 탈퇴 완료 안내 */
    accountDeletedTitle: string;
    accountDeletedBody: string;
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
    auth: {
      signedInSuccessTitle: '인증 완료',
      signedInSuccessBody: '환영합니다. 인증이 완료되었습니다.',
      passwordChangedTitle: '비밀번호 변경',
      passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
      passwordChangedReloginTitle: '비밀번호 변경',
      passwordChangedReloginBody: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
      accountDeletedTitle: '회원 탈퇴',
      accountDeletedBody: '회원 탈퇴가 완료되었습니다.',
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
    auth: {
      signedInSuccessTitle: 'Authentication complete',
      signedInSuccessBody: 'Welcome. Authentication is complete.',
      passwordChangedTitle: 'Password updated',
      passwordChangedBody: 'Your password was updated successfully.',
      passwordChangedReloginTitle: 'Password updated',
      passwordChangedReloginBody: 'Your password was updated. Please log in again.',
      accountDeletedTitle: 'Account deleted',
      accountDeletedBody: 'Your account has been deleted.',
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

- **CI·타입 검증(필수):** 각 `AppLang`에 대해 **`actions`** 및 **`common`(예: `acknowledge`·`refundActionFailed`·`webAsyncProcessing`) 등 TDS 다이얼로그·코디네이터가 전제하는 **핵심 키**가 하나라도 빠지면 **`pnpm build` 또는 CI 단계에서 실패**하도록 강제한다(`satisfies`·스키마/키 존재 테스트·커스텀 검증 스크립트 등). 이렇게 해서 **`labels == null`인 채 `open`만 호출되는 "투명 인간 팝업"** 을 원천 차단한다.
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

### React Core Principles · **Rule 2** 정합 (렌더 페이즈 vs 본 훅)

- **금지(앱 전역 Mutex 등):** 함수 컴포넌트 **렌더 본문**에서 `actionRef.current = latestCallback` 처럼 **매 렌더마다** ref를 갱신하는 패턴. 최신 콜백을 ref에 싣는 경우에는 **`useLayoutEffect(() => { … }, [callback])`** 만 사용한다(`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1, `docs2/PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` Phase A **Mutex** 행).
- **본 훅(`useAsyncTdsConfirm`)과 구분:** 아래 스니펫의 `actionRef.current = action` 은 **`open(params)`가 호출될 때만** 실행된다 — **코디네이터가 다이얼로그를 연 명령 경로**(렌더 루프와 무관). `close`에서 `null` 로 비우는 것도 **`close` / `runConfirm` 성공 후** 같은 **비렌더 경로**다. 스니펫을 복사할 때 **렌더 본문으로 올려 붙이지 말 것.**
- **토스트:** `showErrorToast`는 **`catch`·가드·이벤트 핸들러** 등 **렌더 밖**에서 호출한다. 렌더 중(예: 사전 폴백) 알림이 필요하면 **`Promise.resolve().then(() => showErrorToast(...))`** 로 **커밋 이후**로 미룬다(동일 Rule 2).

```ts
import { useCallback, useRef, useState } from 'react';
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

/** 닫힘 시에도 마지막으로 연 문구를 유지한다 — `isOpen`만 끄고 title/body를 비우지 않는다(퇴장 애니메이션 스냅샷 규칙). */
export interface ConfirmDialogSnapshot {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone: DialogTone;
}

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
  /** `TdsConfirmDialog`에 `labels`·`shouldHideCancel` 등만 합쳐서 전개 */
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
    title: '',
    body: '',
    confirmLabel: '',
    tone: 'primary',
  });
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const close = useCallback(() => {
    actionRef.current = null;
    setSnapshot((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const open = useCallback((params: AsyncTdsConfirmOpenParams) => {
    const { action, title, body, confirmLabel, tone } = params;
    // Rule 2: 렌더 본문이 아님 — `open()` 호출(명령 경로) 시에만 ref 갱신. Mutex 훅의 "매 렌더 ref 대입" 안티패턴과 혼동 금지.
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

  // [블라인드 useMemo 금지 — Core Principles] Consumer가 `{...dialogProps}`로 전개하므로
  // 래퍼 객체의 참조 동일성은 하위 리렌더 방지에 거의 기여하지 않고, deps 추적·오버헤드만 남는다.
  const dialogProps: AsyncTdsConfirmDialogProps = {
    isOpen: snapshot.isOpen,
    title: snapshot.title,
    body: snapshot.body,
    confirmLabel: snapshot.confirmLabel,
    tone: snapshot.tone,
    isConfirmLoading,
    onClose: close,
    onConfirm: runConfirm,
  };

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
- **환불 안내 등「확인 시 비동기 작업」이 필요하면 `TdsConfirmDialog` + 본 훅**을 쓴다. **단일 확인 버튼만 기획되면 `shouldHideCancel={true}`** 를 쓴다. `TdsAlertDialog`는 **문구 확인 후 즉시 `onClose`만** 호출하는 정적 안내에 한정한다(SRP·오용 방지).
- **`open` / `close` / `runConfirm`은 `useCallback`으로 안정화**한다. 소비 컴포넌트의 `useCallback` 의존성에는 **`exitDialog` 전체가 아니라 `exitDialog.open` 등 개별 함수**를 넣어 불필요한 재생성을 피한다. `runConfirm`을 deps에 넣을 때는 **`lang`이 바뀌면 갱신되는 것이 정상**이다.
- **`dialog.open({ title, body, … })`를 호출하는 `useCallback`:** `TDS_DIALOG_MESSAGES[lang]`의 **하위 필드를 의존성 배열에 늘어놓지 않는다**. 콜백 **내부**에서 `const messages = TDS_DIALOG_MESSAGES[lang].…`로 조회하고, 의존성은 **`lang`·`…Dialog.open`·`action`에 쓰는 props 콜백** 위주로 압축한다.
- **`dialogProps`·퇴장 애니메이션 (스냅샷 SSOT):** `close()`(및 성공 시 `runConfirm` → `close`) 호출 직후 **`isOpen: false`만 반영**하고, **`title`·`body`·`confirmLabel`·`tone`은 직전 스냅샷을 유지**한다. 그렇지 않고 닫힘 분기에서 문자열을 즉시 `''`로 덮으면, `TDSModal` 등이 퇴장 트랜지션(~수백 ms)을 재생하는 동안 **본문·버튼 라벨이 먼저 증발**하는 UX가 난다. 스냅샷 타입은 **유니온 `{ isOpen: false } | { isOpen: true, … }` 대신 단일 객체**로 평탄화해, 닫힘 중에도 마지막 문구가 그대로 투영되게 한다.
- **`dialogProps` (블라인드 `useMemo` 금지):** 필드 매핑은 훅이 **한 곳에서 평탄한 객체**로 조립해 Consumer가 **`<TdsConfirmDialog {...dialog.dialogProps} labels={…} />`** 만 쓰면 되게 한다(DRY). 다만 **`useMemo`로 `dialogProps` 래퍼 참조를 고정하지 않는다** — Spread 전개 시 **자식이 받는 props 묶음은 매 렌더 새로 구성**되므로, 래퍼 참조 안정성은 **메모된 자식의 리렌더 억제에 실질적 도움이 되지 않고**, deps·실행 비용만 남는다.

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
- **`TdsConfirmDialog` (`shouldHideCancel={true}`)**: 사용자 눈에는 Alert처럼 **단일 버튼(확인)** 만 노출되지만, 이면에서는 `useAsyncTdsConfirm`·API·로딩·에러 토스트 등 **비동기 로직과 에러 핸들링**이 필요한 경우에 사용한다. `TdsAlertDialog`에 비동기를 억지로 얹지 않고, **비동기 확인 경로는 `TdsConfirmDialog`로만 통일**한다.

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
      // [Rule 7] 컴파일 타임 망라적 검사
      const _exhaustiveCheck: never = tone;
      void _exhaustiveCheck;
      // [Rule 6] 런타임 오염(브리지·직렬화 등) 시에도 TDSButton에 잘못된 variant가 흐르지 않게 안전 기본값
      return 'primary';
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
  /** [Rule 8] `true`이면 취소 버튼을 렌더하지 않는다. 확인 버튼만 `flex` 행을 채운다(기획상 단일 액션). 기본 `false`. */
  shouldHideCancel?: boolean;
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
  shouldHideCancel = false,
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
          {!shouldHideCancel ? (
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

- **Rule 8:** 불리언 prop·로컬 불리언은 **`is` / `has` / `should` / `can`** 접두사를 쓴다. 취소 버튼 숨김은 **`shouldHideCancel`** (`hideCancel` 등 동사-원형 접두사 금지).
- `tone`은 문자열 비교용 번역 텍스트가 아니라 union type으로 관리합니다.
- **`getButtonVariant`:** `switch` + `never` 로 **컴파일 타임** 망라적 검사를 보장하되, **`default`에서는 `return neverTone` 금지** — 런타임에 union 밖 문자열이 들어오면 그대로 `TDSButton` `variant`로 흘러 **크래시·스타일 붕괴**가 난다. **`void _exhaustiveCheck` 후 `'primary'` 폴백**으로 방어한다(Rule 6·7).
- `confirmLabel`은 위험 액션별로 다르게 주입 가능합니다.
- 비동기 통신 및 로딩 제어가 필요하지만 단일 버튼만 노출해야 하는 Alert 성격의 화면(예: 환불 안내)을 위해 `shouldHideCancel`을 지원하여 SRP를 유지한다. (`TdsAlertDialog`에 비동기를 얹지 않고 **`TdsConfirmDialog` + `useAsyncTdsConfirm` 경로만** 쓴다.)
- **`isConfirmLoading`을 `TdsDialogShell`에 전달**해 로딩 중 헤더 X·배경·ESC가 막힌다. **`shouldHideCancel`이 `false`일 때만** 취소 버튼을 렌더하며, 해당 버튼은 로딩 중 `disabled`로 **이중 액션(취소로 닫힘 vs 확인 진행)** 을 막는다(결제·삭제 등).
- 확인 버튼은 **`onClick={onConfirm}`** 으로 직접 연결한다. 부모가 내려주는 `onConfirm`(일반적으로 `runConfirm`)이 이미 `try` / `catch` / 락을 포함하므로 **`async` 래퍼·`Promise.resolve` 중첩**을 두지 않는다.
- 확인 버튼은 `loading` + `disabled`로 One-click Lock을 강화한다. 푸터는 항상 **`flex w-full gap-3`** 를 유지하고, `shouldHideCancel`일 때는 확인 버튼만 **`flex-1`·`min-w-0`** 로 행을 채운다.
- **Safe Try-Catch-Finally**는 **`useAsyncTdsConfirm.runConfirm`** 에 두고, 본 어댑터는 닫기 차단·버튼 `loading`·이벤트 위임만 담당한다.

## Phase 0-6. `useAsyncTdsConfirm` 적용 샘플 (`ConfirmDialogSample`)

### `components/tds-adapter/ConfirmDialogSample.tsx` (교육·스토리북용)

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsConfirmDialog } from './TdsConfirmDialog';
import { useAsyncTdsConfirm } from './useAsyncTdsConfirm';
import { showErrorToast } from './showErrorToast';

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
      const errorMsg =
        TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMsg != null && errorMsg !== '') {
        showErrorToast(errorMsg);
      }
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

- **트리거·`labels`:** `samples?.openDangerConfirmSample ?? ''`, **`labels`는 `?.actions` + `labels != null`일 때만 `TdsConfirmDialog`**. `history` 누락 시 **빈 `return` 금지** → **`common.refundActionFailed` 가드 후 `showErrorToast`**(Phase 0-2b 키 SSOT; 확인 다이얼로그는 열지 않음).
- **`useAsyncTdsConfirm(lang)`이 §5·에러 토스트 i18n 전부 소유**; 샘플·Phase 1 코디네이터는 **`lang`을 넘겨** `open` / `close` / `runConfirm`만 연결한다.
- **`handleOpenDangerDialog`의 `useCallback` 의존성**은 **`[dialog.open, lang]`** 처럼 압축한다. 문구는 콜백 내부의 `TDS_DIALOG_MESSAGES[lang]` 조회로 얻는다.
- **`TdsConfirmDialog`:** **`{...dialog.dialogProps}`** 로 스냅샷 매핑을 훅에 위임한다.

## Phase 0-6a. 확인 플로우 SSOT (복붙 금지)

- **Rule 6 — i18n 사전 누락 시 Silent Failure 금지:** `TDS_DIALOG_MESSAGES[lang]?.…` 조회가 **`null`/`undefined`일 때** 핸들러를 **빈 `return`만으로 끝내지 않는다.** 분기별 폴백은 아래를 따른다.
  - **이탈·닫기·모달 취소 계열(위험한 2차 액션 없음):** 확인 TDS를 열 수 없으면 **즉시 안전한 1차 동작**(예: **`onCloseAuthModal()`**, 로그인 패널 닫기)으로 **플로우를 진행**한다(사용자가 버튼에 갇히지 않게).
  - **삭제·결제·환불 등 확인 없이 실행하면 위험한 액션:** 문구 세트가 없으면 **실행하지 않고**, **`common.refundActionFailed`(Phase 0-2b SSOT)를 `?.`로 조회해 문자열이 있을 때만 `showErrorToast`** 한다(하드코딩 문구 금지).
  - **예외 — `SessionExpiredAlertGate`:** `authMessages == null || labels == null`이면 **`return null`로 조용히 실패**하는 패턴을 **유지**한다. **`refundActionFailed` 등 공통 토스트를 억지로 띄우지 않는다** — 만료 상태와 무관한 일반 오류 토스트가 겹치면 **UX가 혼란**스럽다. 키 누락은 **Phase 0-1의 CI·타입 검증**으로 막는다.
- **단일 진입점:** 비동기 확인·로딩·닫기·`catch`·**다국어 토스트**는 **`useAsyncTdsConfirm(lang).runConfirm`** 에만 구현한다. Phase 1 스니펫에 `try/catch/finally` 블록을 **다시 붙이지 않는다.**
- **`useCallback` + `dialog.open`:** `TDS_DIALOG_MESSAGES[lang]`의 **개별 문자열 필드를 deps에 나열하지 않는다**. 콜백 안에서 `TDS_DIALOG_MESSAGES[lang]`(또는 `.history` / `.refund` 등)으로 읽고, deps는 **`lang`·`…Dialog.open`·관련 props 핸들러** 위주로 둔다(Phase 0-6 `ConfirmDialogSample`, Phase 1-P0 `AuthModalCoordinator`, Phase 1-P1 `HistoryHeaderActions`·`RefundGuideController`와 동일 패턴).
- **`open({ ..., action })`:** `action`은 **ref에만** 저장되며, `open` 호출 시점의 최신 props를 캡처한다. **`useState`에 함수를 넣지 않는다.**
- **환불 안내 등 비동기 확인:** **`TdsConfirmDialog {...dialog.dialogProps} labels={…} shouldHideCancel={true}`** 패턴으로 단일 확인 버튼만 노출한다. **`TdsAlertDialog`는 쓰지 않는다.**
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
      onSignedIn={() => {}}
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

### 샘플: `AuthModalCoordinator.tsx` (Rule 5 — 단일 SSOT 완성본)

**[Rule 5 / Architecture]** 본 Phase에서 `AuthModalCoordinator`의 **유일한 복사·붙여넣기 원본**은 아래 블록뿐이다. 종료 확인과 환영 확인은 각각 **`useAsyncTdsConfirm(lang)` 인스턴스를 분리**해 상태를 섞지 않는다.

파일 위치: `components/auth/AuthModalCoordinator.tsx`. `AuthModals`의 나머지 필수 props(`onSwitchType`, `onLogout`, `currentUserEmail` 등)는 **`BaseAuthModalsProps`로 상위에서 전달**하고, **성공 경로는 `onSignedIn`을 코디네이터 내부에서 생성해 주입**한다.

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../../types';
import { useTossApp } from '../../contexts/TossAppContext';
import AuthModals from '../AuthModals';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import {
  TDS_DIALOG_MESSAGES,
  type ExitDialogReason,
} from '../../constants/tdsDialogMessages';

type BaseAuthModalsProps = Omit<
  React.ComponentProps<typeof AuthModals>,
  'lang' | 'onClose' | 'onRequestClose' | 'onSignedIn'
>;

type SignedInUser = {
  id: string;
  email: string;
};

interface AuthModalCoordinatorProps extends BaseAuthModalsProps {
  lang: AppLang;
  isOpen: boolean;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
  onCommitSignedIn: (user: SignedInUser) => Promise<void> | void;
  onFinishSignedInFlow: (user: SignedInUser) => Promise<void> | void;
}

export const AuthModalCoordinator: React.FC<AuthModalCoordinatorProps> = ({
  lang,
  isOpen,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  type,
  ...authModalProps
}) => {
  const { isInTossApp } = useTossApp();
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const exitDialog = useAsyncTdsConfirm(lang);
  const welcomeDialog = useAsyncTdsConfirm(lang);

  const handleSignedIn = useCallback(
    async (user: SignedInUser) => {
      await Promise.resolve(onCommitSignedIn(user));

      const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
      const acknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
      const canShowSignedInWelcome =
        isInTossApp && (type === 'login' || type === 'signup');

      if (
        !canShowSignedInWelcome ||
        authMessages == null ||
        acknowledge == null ||
        actionLabels == null
      ) {
        await Promise.resolve(onFinishSignedInFlow(user));
        return;
      }

      welcomeDialog.open({
        title: authMessages.signedInSuccessTitle ?? '',
        body: authMessages.signedInSuccessBody ?? '',
        confirmLabel: acknowledge,
        tone: 'primary',
        action: async () => {
          await Promise.resolve(onFinishSignedInFlow(user));
        },
      });
    },
    [
      isInTossApp,
      lang,
      onCommitSignedIn,
      onFinishSignedInFlow,
      type,
      welcomeDialog.open,
    ],
  );

  const handleRequestExit = useCallback(
    (reason: ExitDialogReason) => {
      if (!isInTossApp || type !== 'login') {
        onCloseAuthModal();
        return;
      }

      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.[reason];
      const actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
      if (exitMessage == null || actionLabels == null) {
        onCloseAuthModal();
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
      type,
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
        {...authModalProps}
        lang={lang}
        type={type}
        onClose={onCloseAuthModal}
        onRequestClose={handleAuthClose}
        onSignedIn={handleSignedIn}
      />

      {labels != null ? (
        <>
          <TdsConfirmDialog {...exitDialog.dialogProps} labels={labels} />
          <TdsConfirmDialog
            {...welcomeDialog.dialogProps}
            labels={labels}
            shouldHideCancel={true}
          />
        </>
      ) : null}
    </>
  );
};

export default AuthModalCoordinator;
```

### 설계 포인트

- **성공 경로 API SSOT:** `onSignedIn`은 **내부 핸들러**이며, 상위와의 공개 계약은 **`onCommitSignedIn` / `onFinishSignedInFlow`** 이다. Phase 4 `App.tsx` 발췌는 동일 SSOT를 전제로 읽는다.
- **`labels`:** `TDS_DIALOG_MESSAGES[lang]?.actions` 로 조회하고, **`labels == null`이면 두 `TdsConfirmDialog` 모두 렌더하지 않는다**(WSOD 방지). `AuthModals`는 유지한다.
- 종료 동작은 `onRequestMiniAppExit`로 위임하므로, 토스 공식 API 선택은 앱 경계에서만 결정된다.
- **`!isInTossApp || type !== 'login'`:** 토스 앱이 아니거나 **로그인 모달이 아닐 때**는 이탈 확인 없이 **`onCloseAuthModal()`만** 호출한다(Phase 4 계약과 동일).
- `AuthModals`는 **`onClose={onCloseAuthModal}`** / **`onRequestClose={handleAuthClose}`** 로 닫기 UX만 분리한다.
- **`exitDialog` / `welcomeDialog`:** 각각 독립 훅 인스턴스로 **open 상태·콜백 ref를 섞지 않는다.**
- **단일 버튼 환영 안내:** `TdsAlertDialog`가 아니라 **`shouldHideCancel={true}` 인 `TdsConfirmDialog`** 로, **확인 클릭 시점의 `action`에서만** `onFinishSignedInFlow`를 호출한다.
- **`useAsyncTdsConfirm` (이탈):** **`await onRequestMiniAppExit()` 이후에만 `onCloseAuthModal()`**; 실패 토스트는 훅의 **`refundActionFailed` 가드 + `showErrorToast`** 계약(Phase 0-2b).
- **`handleRequestExit`:** **`TDS_DIALOG_MESSAGES[lang]?.exit?.[reason]`** 및 **`actions`** 를 각각 조회한다. **`exitMessage == null`이거나 `actions == null`이면** TDS를 열지 않고 **`onCloseAuthModal()`** 로 폴백한다(라벨 없이 `open` 금지·화면 갇힘 방지). **`type`** 은 deps에 포함한다.
- **`handleSignedIn` (Rule 5 & 10):** 가드에서 외부 스코프의 `labels` 대신 콜백 내부에서 **`actionLabels = TDS_DIALOG_MESSAGES[lang]?.actions`** 를 조회한다. **`useCallback` deps에 `labels`나 사전 하위 문자열을 넣지 않는다.**
- **default export:** named import를 표준으로 쓰되, `export default` 병행은 Phase 4 발췌와 정합 가능하다.
- **환영 노출 조건:** **토스 앱 + (`login` 또는 `signup`)** 에서만 환영 TDS; 그 외는 `onFinishSignedInFlow`만 즉시 호출한다.
- **닫기 순서:** 환영 확인 후 **`onFinishSignedInFlow`만** 호출하고, 그 경로에서 **`onCloseAuthModal()`을 코디네이터가 추가로 무조건 호출하지 않는다**(프로필 전환 직후 `null` 덮어쓰기 방지). 필요 시 `onFinishSignedInFlow` 구현 안에서 상위가 모달 상태를 일관되게 정리한다.
- **I18N:** 환영 문구는 **`auth.signedInSuccessTitle` / `auth.signedInSuccessBody`**, 확인 라벨은 **`common.acknowledge` 재사용**(DRY).
- **애니메이션:** `useAsyncTdsConfirm`의 **`close`는 `isOpen`만 끄고 문구 유지**(Phase 0-2b).
- **Soft Lock 범위:** `shouldHideCancel={true}` 는 **취소 버튼 숨김**이며, **X / Backdrop / ESC 차단은 어댑터 별도 API**(예: `isDismissible`)가 필요하면 별 작업으로 분리한다(Phase 1b 완료 기준과 동일).

### `AuthModals.tsx` · `App.tsx` (Coordinator 외 필수 연동 — 스니펫 없이 요약)

위 **`AuthModalCoordinator` 블록과 수동 병합하지 않는다.** 아래는 **해당 파일에만** 적용하는 계약 요약이다.

- **`AuthModals.tsx`:** 로그인·회원가입 직후 세션 생성 등 **모든 성공 분기**에서 **`await onSignedIn(user)` 후 `return`**. 성공 경로에서 **`onClose()`를 호출하지 않는다.** Props: **`onSignedIn: (user: SignedInUser) => Promise<void> | void`** (기존 비즈니스 props는 유지).
- **`AuthModals.tsx` (비로그인 성공 외):** 비밀번호 변경 완료·재설정 완료·탈퇴 완료 등은 **`TdsAlertDialog`** 로 표시한다. **`auth` 복사 또는 `actions` 라벨이 없으면** `useEffect`에서 **`handleAuthCompletionClose`** 를 호출해 기존 분기(`onSwitchType` / `onClose` / `onLogout`)로 **조용히 폴백**한다(WSOD 방지).
- **`App.tsx`:** `AuthModalCoordinator`에 **`onCommitSignedIn`** 과 **`onFinishSignedInFlow`** 를 주입한다.
  - **실제 구현:** `onCommitSignedIn`은 `setUser`, `justLoggedInRef`, `fetchUserProfile`, `fetchPortfolios`를 **`Promise.all`** 로 병렬 처리한다(UI 전환 없음).
  - **실제 구현:** `onFinishSignedInFlow`는 **`setAuthModal('profile')`** 만 수행한다(모달 닫기는 코디네이터·환영 플로우와 중복하지 않음).
  - **백 내비게이션:** `handleRequestBackNavigation`에서 **`exit` 메시지 또는 `actions`가 없으면** 다이얼로그 없이 **`onLeave()`** 를 호출한다(토스에서 조용히 멈추지 않도록).

**근본 원인 요약(참고):** 환영 TDS 누락은 **i18n 키 부재**, **성공 시 즉시 `onClose`**, **상위에서 조기 UI 전환** 등이 겹칠 때 발생한다. 구현 시 **코디네이터 단일 SSOT + 위 두 파일 계약**을 함께 만족하면 된다.

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

**SSOT 파일:** `components/HistoryHeaderActions.tsx` (아래는 레포 구현과 동일한 발췌)

```tsx
import React, { useCallback } from 'react';
import type { AppLang } from '../types';
import { Trash2 } from 'lucide-react';
import { TdsConfirmDialog } from './tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from './tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { showErrorToast } from './tds-adapter/showErrorToast';

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
  const historyMessages = TDS_DIALOG_MESSAGES[lang]?.history;
  const triggerLabel =
    historyMessages?.clearHistoryButton ??
    historyMessages?.openClearDialog ??
    '';

  const handleRequestClearHistory = useCallback(() => {
    const currentLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
    const currentHistoryMessages = TDS_DIALOG_MESSAGES[lang]?.history;

    if (currentHistoryMessages == null || currentLabels == null) {
      const errorMessage =
        TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMessage != null && errorMessage !== '') {
        showErrorToast(errorMessage);
      }
      return;
    }

    clearDialog.open({
      title: currentHistoryMessages.clearTitle ?? '',
      body: currentHistoryMessages.clearBody ?? '',
      confirmLabel: currentHistoryMessages.clearConfirm ?? '',
      tone: 'danger',
      action: onClearHistory,
    });
  }, [clearDialog.open, lang, onClearHistory]);

  if (!canClearHistory) {
    return null;
  }

  return (
    <>
      <button type="button" onClick={handleRequestClearHistory} /* …스타일 생략… */>
        <Trash2 size={14} />
        <span>{triggerLabel}</span>
      </button>

      {labels != null ? (
        <TdsConfirmDialog {...clearDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

**`History.tsx`:** 헤더의 전체 초기화는 `HistoryHeaderActions`만 사용한다. **행 단위 기록 삭제**는 동일 화면에 **`historyDialog` 인스턴스(별도 `useAsyncTdsConfirm`)** 를 두고, `history`·`actions` 누락 시 **`refundActionFailed` 토스트** 후 `return`한다.

**`usePortfolios.ts`:** `handleClearHistory` / `handleDeleteHistory`에서 **`window.confirm` / `alert`를 제거**하고, 실패 시 **`throw`** 로 UI 측 `useAsyncTdsConfirm`의 `catch`로 전달한다.

### 설계 포인트

- 렌더 단계에서 state mutation이 일어나지 않습니다.
- `onClearHistory`는 기존 비즈니스 로직을 유지하되, **실패 시 reject**하면 훅의 `catch` 경로로 들어갑니다.
- **`useAsyncTdsConfirm(lang)` 단일 경로**로 §5-1·5-2·에러 토스트 i18n을 만족한다.
- **트리거 라벨:** **`history.clearHistoryButton`** 을 우선하고, 없으면 **`history.openClearDialog`** 로 폴백한다(하드코딩 금지).
- **`handleRequestClearHistory` (Rule 5 & 10):** `history` **와** `actions` **둘 다** 있을 때만 `open`한다. 둘 중 하나라도 없으면 **`refundActionFailed` 토스트** 후 `return`. **`useCallback` deps에 사전 하위 객체를 넣지 않고**, 핸들러 내부에서 `TDS_DIALOG_MESSAGES[lang]`을 다시 조회한다.
- **`TdsConfirmDialog`는 `labels != null`일 때만** 렌더한다.

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

**SSOT 파일:** `components/auth/RefundGuideController.tsx`  
`ProfileView`는 **`onProcessWebRefund`** 만 주입한다(기존 `cancelSubscription()` 래핑). **단일 버튼으로 바로 안내 다이얼로그를 여는 구조가 아니라**, 아래 **2단계 UI**로 구현되어 있다.

1. **1단계:** `refund.requestRefund` 라벨로 패널을 연다(토스는 `TDSButton`, 웹은 기존 텍스트 버튼 스타일).
2. **2단계:** `refund.confirmPrompt` / `eligiblePolicy` / `ineligiblePolicy` 문구와 취소·확인 버튼을 보여준다. 취소 라벨은 **`actions.cancel`**.
3. **웹:** 확인 클릭 시 **`isWebProcessingRef` + `isWebLoading`** 으로 연타를 막고, **`await Promise.resolve(onProcessWebRefund())`** 성공 시에만 패널을 닫는다. 실패 시 **`refundActionFailed` 토스트**.
4. **토스:** 확인 클릭 시 **`refundDialog.open`** 으로 `TdsConfirmDialog`(`shouldHideCancel={true}`)를 연다. `action`에서는 **패널만 닫고** `onProcessWebRefund`는 호출하지 않는다(스토어 환불은 앱 결제 흐름으로 처리).

**`TDS_DIALOG_MESSAGES.refund` 확장 (실제 SSOT):** 기존 `guideTitle` / `guideBody` / `openRefundGuide` 외에 **`requestRefund`**, **`confirmPrompt`**, **`eligiblePolicy`**, **`ineligiblePolicy`**, **`confirmRefund`** 키가 추가되어 있다.

**토스트 헬퍼:** `showRefundErrorToast`는 **`useCallback`으로 감싸지 않고**, 호출 시점에 `TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`를 조회한다(Rule 5 & 10 deps 최소화).

```tsx
// 발췌: 실제 파일과 동일한 책임 분리만 요약 (전체는 RefundGuideController.tsx 참고)
interface RefundGuideControllerProps {
  lang: AppLang;
  isInTossApp: boolean;
  isDisabled: boolean;
  onProcessWebRefund: () => Promise<void> | void;
}

// render: isRefundPanelOpen ? (안내 카드 + 취소/확인) : (requestRefund 버튼)
// 토스 확인 → refundDialog.open({ ..., action: () => setIsRefundPanelOpen(false) })
// 웹 확인 → try { await onProcessWebRefund(); setIsRefundPanelOpen(false); } catch { showRefundErrorToast(); }
```

### 설계 포인트

- **웹(`!isInTossApp`):** **동기 락(필수) + `isWebLoading`(필수)** 를 **병행**한다. **`await Promise.resolve(onProcessWebRefund())`** 후 **성공 시에만** 패널을 닫는다.
- **토스:** 안내 **`TdsConfirmDialog`** 는 **`refund` + `common.acknowledge` + `actions`가 모두 있을 때만** `open`한다. 부족하면 **`refundActionFailed` 토스트**만 띄운다. 확인 **`action`에서 `onProcessWebRefund`를 호출하지 않는다**(계획서 초안 스니펫과 다름 — 실제 코드 기준).
- **`useCallback` (Rule 5 & 10):** `handleConfirmRefund` deps는 **`isInTossApp`, `lang`, `onProcessWebRefund`, `refundDialog.open`** 만 포함한다. 에러 토스트는 deps에 넣지 않는다.
- **취소 버튼:** 2단계 패널의 취소는 **`actions.cancel`** 을 사용한다(단일 버튼 다이얼로그만이 아님).
- **확인 버튼 라벨:** 토스 2단계에서는 **`refund.openRefundGuide`**, 웹에서는 **`refund.confirmRefund`** / 로딩 중 **`common.webAsyncProcessing`**.
- **`refund` 또는 `actions`가 없으면** 컨트롤러는 **`return null`**(상위에서 유료 구간만 렌더하는 전제와 함께 사용).

### Phase 1: 계획서 초안 대비 실제 코드 차이 체크리스트 (유지보수용)

아래는 **이 문서의 Phase 1 초안 스니펫과 달라진 점**을 한곳에 모은 것이다. 상세 스니펫은 위 **After** 블록 및 레포 파일이 SSOT다.

| 구분 | 초안(문서) | 실제 코드 |
|------|------------|-----------|
| `AuthModalCoordinator` `handleSignedIn` | 가드에 외부 `labels` 사용, deps에 `labels` 포함 | 콜백 내부 `actionLabels` 조회, **deps에 `labels` 없음** |
| `AuthModalCoordinator` `handleRequestExit` | `exitMessage == null`만 폴백 | **`exitMessage` 또는 `actions` 없으면** `onCloseAuthModal()` |
| `App.tsx` `onCommitSignedIn` | 문서에 구체 코드 없음(Phase 4 참조) | **`Promise.all`** 로 `fetchUserProfile` + `fetchPortfolios` 병렬 |
| `App.tsx` 백 내비게이션 | `exitMessage == null`이면 무응답 가능 | **`exit` 또는 `actions` 없으면 `onLeave()`** |
| `AuthModals` | Phase 1 요약에 없음 | 비밀번호/탈퇴 완료 **`TdsAlertDialog`** + 사전 누락 시 **`useEffect` 폴백** |
| `HistoryHeaderActions` | `openClearDialog`만 트리거, `history`만 검사 | **`clearHistoryButton ?? openClearDialog`**, **`history`+`actions` 동시 검사** |
| `History.tsx` | 샘플은 헤더만 | **단건 삭제**는 별도 `historyDialog` 인스턴스 유지 |
| `usePortfolios` 히스토리 | confirm/alert | **confirm/alert 제거, `throw`** |
| `RefundGuideController` | 단일 버튼 + `onCloseRefundPanel` | **2단계 패널** + **`isDisabled`**, 토스 확인 시 **`onProcessWebRefund` 미호출** |
| `TDS_DIALOG_MESSAGES.refund` | 3키 | **`requestRefund` 등 5키 추가** |

### Phase 2·4: 계획서 초안 대비 실제 코드 차이 체크리스트 (유지보수용)

아래는 **Phase 2·Phase 4 초안(본 문서)과 달라진 점**을 한곳에 모은 것이다. 세부 SSOT는 레포의 `hooks/usePortfolios.ts`, `hooks/useAuth.ts`, `App.tsx`, `constants/portfolioMutationErrors.ts`, `components/portfolio/PortfolioCardActions.tsx`, `components/auth/SessionExpiredAlertGate.tsx`다.

| 구분 | 초안(문서) | 실제 코드 |
|------|------------|-----------|
| `usePortfolios` 범위 | 삭제(`handleDeletePortfolio`) + 히스토리 등 **일부** `alert`/`confirm` 제거를 전제로 “잔여 다수” 언급 | **전 경로**에서 네이티브 `alert`/`confirm` **0건**. 생성·검증·종료·거래·삭제·히스토리 등 모두 **`throw` + 기계 코드** |
| 에러 코드 형태 | 예시로 `new Error('delete_failed', { cause })` | **`constants/portfolioMutationErrors.ts`** 의 `PORTFOLIO_MUTATION_ERROR_CODES` + `createPortfolioMutationError` (`portfolio_delete_failed` 등 **접두 `portfolio_`** 통일) |
| 사용자 문구 위치 | Hook 밖에서만, 토스트는 `refundActionFailed` 등 TDS 사전만 언급 | 포트폴리오 **검증·실패 안내 본문**은 **`getPortfolioMutationNotice(lang, error)`** 가 **`portfolioMutationErrors.ts` 내 한·영 문자열**로 복원(제목·본문). 삭제 확인 문구만 `TDS_DIALOG_MESSAGES.portfolio` |
| `usePortfolios` 옵션 | `lang` 포함 가정 | **`lang` 옵션 제거**(Hook에 언어 분기 없음) |
| `deletePortfolioById` 쿼리 | `.delete().eq('id', id)` 예시 | **`.eq('user_id', userIdOption).eq('id', id)`** 로 소유자 스코프 명시 |
| `PortfolioCardActions` | 삭제 버튼만, `onDeletePortfolio(id)` | **알람 + 삭제** 묶음. **`onDeletePortfolio: () => void \| Promise<void>`** (부모가 `id` 클로저 주입). `lang`은 **`'ko' \| 'en'`** |
| `Dashboard.tsx` | “이번 마이그레이션에서 절대 수정하지 않는 범위”에 포함 | **Phase 2에서 예외적으로 수정** — 카드 우측 상단을 `PortfolioCardActions`로 치환 |
| `App.tsx` 포트폴리오 실패 UX | 문서에 없음(토스트만 가정) | **`portfolioMutationNotice` 상태 + `TdsAlertDialog`** (`common.acknowledge` + `actions`). `runPortfolioMutation`으로 **저장 실패**와 **포트폴리오 비즈니스 오류**를 분리. **전면/리워드 광고**는 `GlobalAdManager`·`rewardAdService` 등 별도 경로(레거시 `showInterstitialOnTransition`·`adService` 전면 제거 후) |
| `handleAddTradeWithAd` | 문서 미기술 | **`handleAddTrade`만 `runPortfolioMutation`**, 이후 인터스티셜(광고 실패가 포트폴리오 오류로 매핑되지 않게) |
| `useAuth` `USER_UPDATED` | 비번 성공 `alert` → UI 이전 언급 | **`alert` 제거**, 성공 안내는 **`AuthModals`의 `TdsAlertDialog`** 경로에 위임(훅에서 중복 알림 없음) |
| `SessionExpiredAlertGate` | 예시 prop `onDismiss` | 실제 prop은 **`onClose`** (`App` → `handleDismissSessionExpired`) |
| `useAuth` 옵션 | `lang` 전달 가정 | **`lang` 제거**, `setPortfolios` 타입을 **`Portfolio[]`** 로 정리 |
| Phase 4 동적 import | `App`만 동적 import, 청크 분리 기대 | **Vite 빌드 시** `@apps-in-toss/web-framework` / `web-analytics` 등이 **전이 정적 import**로 `web-bridge`를 끌어올 수 있어, **“완전 별도 청크”는 보장되지 않을 수 있음**. **`App.tsx` 최상단 정적 import 금지** 계약은 준수 |
| `AuthModalCoordinator` import | Phase 4 스니펫은 named import 권장 | **`App.tsx`는 `import AuthModalCoordinator from '…'` (default)** 유지 가능(문서 권장과 불일치 — 팀에서 하나로 통일 권장) |

---

## 상태/런타임 방어 규칙

## 1. Render phase에서 state mutation·UI 부수효과 금지 (Core Principles **Rule 2**)

- `setState`는 클릭/확인/닫기 핸들러 안에서만 호출합니다.
- JSX 안에서 `setState(...)`를 직접 실행하지 않습니다.
- **렌더 본문에서 `ref.current`에 대입하지 않습니다.**  
  - **props·콜백을 ref에 미러링**하는 패턴(예: `hooks/useMutexAction`의 `actionRef`)은 **`useLayoutEffect`** 에서만 갱신합니다 — Concurrent 렌더 tearing을 피하고, 페인트 직전에 최신 핸들러가 잡히게 합니다(`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1).  
  - **`useAsyncTdsConfirm`의 `open` / `close` 내부**에서 `actionRef`를 세팅하는 것은 **렌더가 아니라 `useCallback`으로 싸인 명령형 API 경로**이므로 위 규칙과 **충돌하지 않습니다**(Phase 0-2b 상단 "Rule 2 정합" 참고). 스니펫을 **렌더 본문으로 잘못 옮기지 말 것.**
- **렌더 경로에서 `showErrorToast` 등 전역 UI를 동기 호출하지 않습니다.** 사전 폴백 알림이 필요하면 **`Promise.resolve().then(() => …)`** 로 **커밋 이후**로 미룹니다(`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5).
- **`useAsyncTdsConfirm`의 `runConfirm`** 을 렌더 본문에서 직접 호출하지 않습니다(이벤트 핸들러·훅 내부만).

## 2. 중첩 모달 최소화

- 부모 모달 위에 확인 모달을 무한히 쌓지 않습니다.
- 가능하면 **현재 모달 닫기 -> 전역 다이얼로그 표시** 또는 **같은 계층에서 하나만 표시** 원칙을 따릅니다.

## 3. Hook에서 UI 직접 호출 금지

- **`usePortfolios.ts` (반영 완료):** **`alert` / `window.confirm` 0건**. 실패·검증 위반은 **`createPortfolioMutationError` + 코드**로 `throw`한다. 호출부(`App.tsx` 등)는 **`getPortfolioMutationNotice`** 또는 `useAsyncTdsConfirm`으로 사용자 안내를 연다.
- **`useAuth.ts` (반영 완료):** 세션 만료 등 **`alert` 0건**. **`hasSessionExpired` + `SessionExpiredAlertGate`(`TdsAlertDialog`)** 로만 노출한다.
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
- `TdsConfirmDialog`는 **`shouldHideCancel`이 `false`일 때만** 취소 버튼을 렌더하며, 해당 버튼은 동일 구간에서 **`disabled`** 처리해 진행 중인 확인과 경쟁하는 닫기 동작을 막습니다. **`shouldHideCancel={true}`** 인 화면은 푸터 취소는 없고, 헤더 X·배경·ESC·`guardedClose` 계약은 동일합니다.

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
- **`TdsConfirmDialog`** 는 **`{...dialog.dialogProps}`** 로 훅 파생 props를 받고, Consumer는 **`isOpen ? snap…` 삼항 연산자 보일러플레이트를 쓰지 않는다**. **`useAsyncTdsConfirm`의 `close`는 `isOpen`만 끄고 문구 필드는 유지**하여 퇴장 애니메이션 중 텍스트 증발을 막는다(Phase 0-2b 스니펫·설계 포인트).
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
4. `AuthModals.tsx`의 비밀번호 변경/회원 탈퇴 완료형 `alert`
5. `App.tsx`의 한도 초과 `alert`
6. 로그인/즉시 세션 생성 회원가입 성공 -> 환영 안내(TDS) -> 확인 후 후속 화면 전환/닫기

**완료 기준**

- 토스 앱 주요 경로에서 브라우저 기본 팝업이 사라짐
- 안내/확인 모달이 동일 어댑터 패턴으로 통일됨
- **`TdsConfirmDialog` 코디네이터**는 **`useAsyncTdsConfirm(lang)`** 을 거치며, 상태에 콜백을 저장하거나 `try/catch`·**에러 토스트**를 화면마다 복붙하지 않음(`lang`은 화면이 이미 보유한 `AppLang`과 동일 소스에서 전달). **`TdsAlertDialog`는 로컬 `onClose`만** 두고 본 훅과 짝짓지 않음.
- 로그인/즉시 세션 생성 회원가입 성공 후 환영 안내를 붙일 때도 **`AuthModals`가 직접 닫히지 않고**, **코디네이터가 `useAsyncTdsConfirm(lang)`로 TDS를 연 뒤 상위 `App.tsx`가 최종 전환을 결정**한다.
- 사용자가 확인하기 전까지 **인증 패널은 직접 닫히지 않는다.**
- 환영 TDS는 **`shouldHideCancel={true}` 기반 Soft Lock** 이며, **`X` / `Backdrop` / `ESC` dismiss 차단은 이번 범위에 포함되지 않는다.**

## Phase 2. Hook 계층 분리

**목표:** `usePortfolios`·`useAuth`가 **`alert` / `window.confirm` / DOM 기반 팝업을 호출하지 않는다**. 데이터·세션 상태와 **부작용(API 호출)** 만 담당하고, **사용자 의사 확인·문구 표시·접근성**은 **UI 계층 + `Tds*Dialog` + `useAsyncTdsConfirm` / `TdsAlertDialog`** 가 전담한다.

**범위(실제 구현 기준):**

1. `usePortfolios.ts` — **전체** mutation 경로에서 **`window.confirm` / `alert` 제거**. 삭제 확인은 UI(`PortfolioCardActions` + `useAsyncTdsConfirm`)로 이전하고, 훅은 **`deletePortfolioById`** 만 노출한다.
2. `useAuth.ts` — **`clearAuthState(shouldShowAlert)`** 경로의 세션 만료 **`alert` 제거**, **`hasSessionExpired`** 상태로 대체. `USER_UPDATED` 비밀번호 성공 **`alert`는 훅에서 제거**하고, 완료 안내는 **`AuthModals`의 `TdsAlertDialog`** 에 맡긴다.

> **문서 초안과의 차이:** 초안은 “삭제만 예시 + 나머지 `alert`는 순차”였으나, **토스 심사·Hook 순수성**을 위해 **`usePortfolios`는 한 번에 전 경로 정리**했다. 에러 코드·문구 매핑은 **`constants/portfolioMutationErrors.ts`** 가 SSOT다(아래 Phase 2·4 체크리스트 참고).

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

삭제 **API 실패**는 `useAsyncTdsConfirm` 경로면 Phase 0-2b대로 **`common.refundActionFailed`** 토스트가 잡힌다. 그 외 **검증 실패·DB 실패** 등은 **`App.tsx`의 `TdsAlertDialog` notice**(`getPortfolioMutationNotice` + `common.acknowledge`)로 안내한다(문서 초안의 “전부 토스트/단일 키”만 쓰기와 다름).

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
- 실패 시 **`createPortfolioMutationError(PORTFOLIO_MUTATION_ERROR_CODES.deleteFailed, error)`** 등 **`constants/portfolioMutationErrors.ts`** 의 코드만 던진다(문서 초안의 리터럴 `'delete_failed'` 대신 **`portfolio_delete_failed`** 등 접두 통일). **`cause`** 에 Supabase `error` 등 원인을 유지한다.
- 성공 시에만 로컬 상태에서 해당 `id`를 제거한다.

```ts
// hooks/usePortfolios.ts — 발췌(실제 코드 요약)
const deletePortfolioById = useCallback(
  async (id: string) => {
    if (!userIdOption) {
      throw createPortfolioMutationError(PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired);
    }
    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userIdOption)
      .eq('id', id);
    if (error != null) {
      throw createPortfolioMutationError(PORTFOLIO_MUTATION_ERROR_CODES.deleteFailed, error);
    }
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  },
  [setPortfolios, userIdOption],
);
```

- **의존성 무결성:** `setPortfolios`·`userIdOption` 등 훅이 참조하는 **외부 주입 값은 deps에 전부 포함**한다. `loadPortfoliosFromCache` / `fetchPortfoliosFromSupabase` 등에도 **`setPortfolios`** 를 포함한다(초안 스니펫에는 없었으나 실제 코드 기준).

#### After — UI Consumer 스니펫 (`PortfolioCardActions.tsx` 예시)

- **삭제 버튼 클릭 → `useAsyncTdsConfirm.open`으로 문구 스냅샷 → 사용자가 확인 시 `deletePortfolioById(id)` 호출.**
- `runConfirm`의 `catch`는 Phase 0-2b대로 **`TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed`**(또는 공용 `mutationFailed`)만 사용한다.
- **`labels` / `actions` 무방비 접근 금지:** Phase 1-P1과 동일하게 **`?.` + `labels != null`일 때만** `TdsConfirmDialog` 렌더.

```tsx
// components/portfolio/PortfolioCardActions.tsx — 발췌(알람·삭제 UI 전체는 레포 SSOT)
import React, { useCallback } from 'react';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface PortfolioCardActionsProps {
  lang: 'ko' | 'en';
  isAlarmEnabled: boolean;
  onOpenAlarm: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  isAlarmEnabled,
  onOpenAlarm,
  onDeletePortfolio,
}) => {
  const deleteDialog = useAsyncTdsConfirm(lang);
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const triggerLabel =
    TDS_DIALOG_MESSAGES[lang]?.portfolio?.openDeleteConfirm ?? '';

  const handleRequestDelete = useCallback(() => {
    const messages = TDS_DIALOG_MESSAGES[lang]?.portfolio;
    if (messages == null) {
      const errorMsg =
        TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
      if (errorMsg != null && errorMsg !== '') {
        showErrorToast(errorMsg);
      }
      return;
    }

    deleteDialog.open({
      title: messages.deleteTitle ?? '',
      body: messages.deleteBody ?? '',
      confirmLabel: messages.deleteConfirm ?? '',
      tone: 'danger',
      action: onDeletePortfolio,
    });
  }, [deleteDialog.open, lang, onDeletePortfolio]);

  return (
    <>
      {/* …알람(onOpenAlarm)·삭제(handleRequestDelete) 버튼 렌더 — 토스는 TDSButton, 웹은 네이티브 button … */}
      {labels != null ? (
        <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
      ) : null}
    </>
  );
};
```

- **`portfolio` 사전 누락 시:** 빈 `return` 금지 → **`refundActionFailed` 가드 후 `showErrorToast`**(Phase 0-6a·삭제는 무분별 실행 금지).
- **Prop 네이밍 계약:** Hook 내부 구현 이름은 **`deletePortfolioById`** 여도 괜찮지만, **자식 컴포넌트에 주입하는 callback prop은 `onDeletePortfolio`** 로 통일한다.
- **`App.tsx` 등 상위:** `usePortfolios()`의 **`deletePortfolioById`** 를 **`Dashboard`의 `onDeletePortfolio`** 로 그대로 내려보내고, 카드에서는 **`() => onDeletePortfolio(p.id)`** 클로저로 `PortfolioCardActions`에 넘긴다. 그 외 mutation 실패는 **`runPortfolioMutation` + `portfolioMutationNotice` + `TdsAlertDialog`** 로 처리한다(초안에는 없던 패턴).

---

### Phase 2-2. `useAuth.ts` — 세션 만료 `alert` 제거

#### Before — 문제점

- **`clearAuthState`** 가 `shouldShowAlert === true`일 때 **`alert(lang === 'ko' ? '…' : '…')`** 를 직접 호출한다. 인증 상태 정리(스토리지·`signOut`·`setUser(null)` 등)와 **사용자 알림**이 한 함수에 섞여 **SRP 위반**이며, Hook이 **DOM `alert`** 에 의존한다.

#### Before 코드 스니펫(실제 저장소 구조 요약)

```ts
// hooks/useAuth.ts — useEffect 내부 발췌
const clearAuthState = async (shouldShowAlert: boolean = true) => {
  // … clearAuthStorage, signOut, setUser(null), setPortfolios([]) …
  if (shouldShowAlert) {
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
- **[Rule 8]** 플래그 매개변수명은 **`shouldShowAlert`** (`showAlert` 금지).
- 세션 오류로 **강제 로그아웃이며 사용자에게 알려야 할 때**만, **`hasSessionExpired`** 를 `true`(또는 리터럴 유니온)로 세팅한다. `shouldShowAlert: false` 경로(복구 가능 오류 등)는 기존처럼 **조용히 정리**만 한다.
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
if (shouldShowAlert) {
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
  onClose: () => void;
}

export const SessionExpiredAlertGate: React.FC<SessionExpiredAlertGateProps> = ({
  lang,
  isOpen,
  onClose,
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
      onClose={onClose}
    />
  );
};

// App.tsx(발췌): hasSessionExpired, handleDismissSessionExpired 를 useAuth에서 받아 전달
// <SessionExpiredAlertGate
//   lang={lang}
//   isOpen={hasSessionExpired}
//   onClose={handleDismissSessionExpired}
// />
```

- **`AuthModalCoordinator`와의 관계:** 세션 만료는 **전역·비모달 우선** 알림이므로 **`App` 최상단** 또는 **인증 레이아웃**에 두는 것이 자연스럽다. 로그인 모달 코디네이터와 **동일 사전(`TDS_DIALOG_MESSAGES`)** 을 쓰되, **책임 분리**를 위해 컴포넌트는 분리해도 된다.
- **사전 누락 시(`return null` 유지):** `authMessages == null || labels == null`이면 **지금처럼 `return null`로 조용히 실패**하게 둔다. **`refundActionFailed` 등 공통 토스트를 여기서 억지로 띄우지 않는다** — 세션 만료 맥락과 섞이면 사용자에게 **혼란**만 줄 수 있다. **`actions`·`auth.sessionExpired*`** 등은 **Phase 0-1 CI·타입 검증**으로 누락 시 빌드 실패를 강제해, 런타임에 이 분기에 들어가지 않게 한다.
- **Blind `useMemo` 금지:** `SessionExpiredAlertGate`의 문구 매핑은 **가벼운 문자열 읽기 + Guard Clause** 로 충분하다. 단순 객체 조립을 메모이제이션하지 말고, **`authMessages == null || labels == null` 조기 반환**으로 평탄하게 유지한다.

---

### 설계 포인트(반드시 준수)

1. **SRP:** Hook은 **API·캐시·React state** 만; **모달/confirm/alert** 는 **React 컴포넌트 트리**에서만.
2. **에러 핸들링 일원화:** 비동기 확인 실패 토스트는 **`useAsyncTdsConfirm.runConfirm`의 `catch`** 한 경로(Phase 0-2b). Hook은 **`throw` 또는 Result 타입**으로만 신호한다.
3. **Strict I18N:** Hook에 **한글/영문 리터럴 금지**. 식별은 **`PORTFOLIO_MUTATION_ERROR_CODES` 등 기계 코드**로 `throw`하고, 사용자 문구는 **`getPortfolioMutationNotice`**(또는 TDS 사전)에서만 조합한다(초안의 `'delete_failed'` 단일 문자열만 언급과 다름).
4. **토스 심사·UX:** 네이티브 `alert`/`confirm` 제거 후 **TDS/어댑터**만 사용자 대면 창으로 사용한다.
5. **React Hook 규칙:** 외부에서 주입된 함수·값을 참조하는 `useCallback`은 **필요 의존성을 생략하지 않는다**. 본 Phase의 `deletePortfolioById`는 **`[setPortfolios]`** 를 유지한다.
6. **Zero Dead Code / No Blind useMemo:** 분리 후 **`window.confirm` 분기·미사용 `lang` 기반 메시지 조합**은 Hook에서 **완전 삭제**하고, Consumer에서도 **단순 문자열 매핑용 `useMemo`** 는 추가하지 않는다.
7. **Naming Convention (Rule 8):** Boolean state·파라미터는 **`is` / `has` / `should` / `can`** 접두사를, 이벤트 핸들러는 **`handle*`**, callback prop은 **`on*`** 접두사를 유지한다. 본 Phase에서는 **`clearAuthState(shouldShowAlert)`**, **`hasSessionExpired`**, **`handleDismissSessionExpired`**, **`onDeletePortfolio`**, 그리고 Phase 0-5 **`TdsConfirmDialog`의 `shouldHideCancel`** 을 기준으로 사용한다.

**완료 기준**

- `usePortfolios` **전 경로**에서 `window.confirm` / `alert` 가 **0건**.
- `useAuth`의 **`clearAuthState`** 에서 **`alert` 가 0건**; 세션 만료는 **`hasSessionExpired` + `SessionExpiredAlertGate`(`TdsAlertDialog`)** 로만 노출.
- 포트폴리오 삭제는 **`PortfolioCardActions` + `useAsyncTdsConfirm` + `deletePortfolioById`** 패턴으로 동작.
- **`TDS_DIALOG_MESSAGES`** 에 **`portfolio`·`auth.sessionExpired*`** 가 있고, 삭제 확인·세션 만료 문구는 여기서 읽는다.
- **`constants/portfolioMutationErrors.ts`** 에 mutation 코드·`getPortfolioMutationNotice`가 있고, **`App.tsx`** 에서 검증/DB 실패 안내용 **`TdsAlertDialog`** notice와 연결된다.

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
- `components/Dashboard.tsx` — **예외:** Phase 2에서 **카드 우측 상단 액션만** `PortfolioCardActions`로 교체하기 위해 **해당 구간만 수정**했다(전면 TDS화·로직 변경은 아님).
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

---

## Phase 4. Final Assembly (API Integration)

### 대상 및 목적

- **대상 파일:** `App.tsx` (앱 최상위 진입점).
- **연동 API:** `@apps-in-toss/web-bridge` 모듈의 `closeView()`를 기준안으로 사용한다. **투 트랙(웹+토스)에서는 `App.tsx` 최상단에 해당 패키지를 정적 `import` 하지 않는다(Rule 6·에지 복원력).** 종료 확정 시점에만 **`import()` 동적 로드**로 청크를 불러온 뒤 `closeView()`를 호출한다. **실구현 전에는 토스 공식 문서로 최종 모듈 경로·시그니처를 확인**하고, 필요하면 `@apps-in-toss/web-framework` 재수출과 **하나의 경로만** 팀 표준으로 확정한다.
- **목적:** Phase 0 ~ Phase 3까지 분리해 둔 **미니앱 종료 시그널**을, 실제 토스 런타임에서 동작하는 공식 종료 API와 연결하는 **최종 조립(Final Assembly)** 단계이다. 하위 **`AuthModalCoordinator`**(및 동일 계약의 코디네이터)가 노출하는 **`onRequestMiniAppExit`** prop에, 앱 경계에서만 `closeView`를 호출하는 핸들러를 **의존성 주입(DI)** 한다. 하위는 “종료를 요청한다”는 의미만 유지하고, **토스 WebView 브리지 호출은 `App.tsx` 한곳**에서만 수행한다.
- **현재 계약 범위:** 현행 `AuthModalCoordinator` 기준으로 `onRequestMiniAppExit`는 **토스 앱 환경(`isInTossApp === true`) + 로그인 모달(`type === 'login'`) + 사용자가 종료 확인 다이얼로그에서 승인한 경우**에만 호출된다. 즉, 이번 Phase 4는 **현재 로그인 종료 경로를 실제 API에 연결하는 최종 조립**이며, 다른 모달 타입이나 다른 종료 사유까지 자동으로 `closeView()`에 연결되는 것은 아니다.

### 구현 스니펫 (`useCallback` + 코디네이터 주입)

인라인 화살표 함수를 `AuthModalCoordinator`에 직접 넘기지 않고, **Rule 10** 에 맞춰 **`useCallback`으로 안정 참조**를 만든 뒤 주입한다. **`@apps-in-toss/web-bridge`는 Rule 6에 따라 최상단 정적 import를 쓰지 않고**, `handleRequestMiniAppExit` 내부에서만 **동적 `import()`** 로 로드한다. 아래 스니펫은 **Phase 4에서 추가/변경되는 핸들러와 코디네이터 주입 props만** 보여 주는 발췌이며, **Phase 1b의 성공 경로 SSOT(`onSignedIn` / `onCommitSignedIn` / `onFinishSignedInFlow`)를 이미 반영한 `App.tsx`를 전제**한다. 여기서 **`onSignedIn`은 `App.tsx`가 직접 넘기는 prop이 아니라, `AuthModalCoordinator`가 내부에서 만들어 `AuthModals`에 주입하는 prop**이다.

```tsx
import React, { useCallback } from 'react';
import { AuthModalCoordinator } from './components/auth/AuthModalCoordinator';

const App: React.FC = () => {
  const handleCommitSignedIn = useCallback(
    async (user: SignedInUser): Promise<void> => {
      setUser(user);
      justLoggedInRef.current = true;
      await Promise.all([
        Promise.resolve(fetchUserProfile(user.id)),
        Promise.resolve(fetchPortfolios(user.id)),
      ]);
    },
    [fetchPortfolios, fetchUserProfile, setUser],
  );

  const handleFinishSignedInFlow = useCallback(
    async (_user: SignedInUser): Promise<void> => {
      setAuthModal('profile');
    },
    [setAuthModal],
  );

  const handleRequestMiniAppExit = useCallback(async (): Promise<void> => {
    try {
      const bridge = await import('@apps-in-toss/web-bridge');
      if (typeof bridge.closeView !== 'function') {
        throw new Error('closeView is not available on the loaded bridge module');
      }
      // [Rule 6] closeView가 void를 반환하든 Promise를 반환하든, await Promise.resolve로 통일해
      // 비동기 reject가 try/catch 밖으로 새 나가 Unhandled Rejection이 되지 않게 한다.
      await Promise.resolve(bridge.closeView());
    } catch (error) {
      console.error('Failed to execute Toss closeView:', error);
      throw error;
    }
  }, []);

  return (
    <>
      {/* …기존 앱 본문… */}
      {/* 기존 App과 동일: onSwitchType, onLogout, currentUserEmail 등 나머지 필수 props 유지 */}
      {/* 닫힘(authModal === null)일 때 type은 TS·런타임 계약용 placeholder. isOpen이 false면 코디네이터가 조기 return 하여 AuthModals에는 전달되지 않음 */}
      <AuthModalCoordinator
        isOpen={authModal != null}
        lang={lang}
        type={authModal ?? 'login'}
        onCloseAuthModal={handleCloseAuthModal}
        onCommitSignedIn={handleCommitSignedIn}
        onFinishSignedInFlow={handleFinishSignedInFlow}
        onRequestMiniAppExit={handleRequestMiniAppExit}
      />
    </>
  );
};
```

- **import 형태 (Phase 1-P0와 AST 계약 일치):** `AuthModalCoordinator.tsx`는 **`export const AuthModalCoordinator`**(Phase 1-P0 스니펫)와 **`export default`**를 **함께** 제공한다. 현행 `App.tsx`가 default를 쓰고 있어도 런타임은 정상이나, **계획서상 Phase 4 스니펫은 Phase 1-P0과 동일하게 `import { AuthModalCoordinator } from '…'` named import를 표준**으로 한다(복붙 시 문서 간 모순·`undefined` 컴포넌트 혼동 방지). 실제 코드 정리 시 **한 스타일로 통일**하면 된다.
- **성공 경로 API SSOT:** `AuthModalCoordinator`의 성공 경로 퍼블릭 계약은 **`onCommitSignedIn` / `onFinishSignedInFlow`** 이다. Phase 4를 포함한 본 문서의 모든 `App.tsx` 발췌는 이 기준을 전제로 읽는다.
- **`type`과 `authModal === null` (Rule 7·계약 명시성):** `authModal`이 `null`이면 `type={authModal}`만으로는 **TypeScript에서 `type`이 `AuthModalType`을 요구할 때 컴파일 에러**가 난다. **`AuthModalCoordinator`의 `type`을 `| null`로 늘리는 방식**도 가능하나, 본 계획서는 **호출부(`App.tsx`)만 수정**하는 경로를 기본으로 한다: **`type={authModal ?? 'login'}`**. `isOpen={authModal != null}`와 함께 쓰면 닫힘 시 **`!isOpen` 조기 반환** 때문에 placeholder `'login'`은 **`AuthModals` 렌더 경로에 실제로 쓰이지 않는다**(컴파일·참조 안정용 sentinel). 다만 코디네이터 훅의 의존성 배열에는 닫힘 중에도 `'login'`이 잡힐 수 있으므로, **sentinel 문자열은 팀 내에서 한 가지로 고정**하고(본 스니펫은 `'login'`), Phase 1a와의 정합(로그인 종료 플로우)과 어긋나지 않게 둔다. 대안으로 `AuthModalType | null`을 코디네이터에 도입하는 모델링도 타당하나, **이 문서의 Phase 4 스니펫은 상위 `??` 패턴을 채택**한다.
- **상위 `{authModal && …}` 제거(이중 가딩 정리):** 가시성은 **`isOpen` 한 축**에 두는 편이 읽기 쉽고, 코디네이터 인스턴스·내부 훅 상태가 **모달을 닫았다가 다시 열 때** 상위 언마운트 없이 유지될 수 있다. 다만 **현행 `AuthModalCoordinator`는 `!isOpen`이면 즉시 `return null`** 이라, 자식(`AuthModals` 등) 트리는 닫힘과 함께 언마운트된다. 즉 **이 변경만으로 TDS 퇴장 애니메이션(onExited 등) 문제가 자동 해결된다고 단정할 수 없고**, 진짜 “닫히는 동안 셸 유지”는 **`TDSModal`·쉘 계약을 별도로 다루는 작업**과 연결된다.
- **`handleRequestMiniAppExit`·동적 import (Rule 6):** `useCallback`으로 메모이제이션한다. **`await import('…')`** 는 **네트워크·청크 로드**이므로 실패할 수 있다고 가정하고, 위 스니펫처럼 **`try/catch` + `closeView` 존재 검사(`typeof … === 'function'`)** 를 둔다. **`closeView` 호출은 `await Promise.resolve(bridge.closeView())` 로만 수행**한다 — 브리지가 **동기 `void`** 이든 **비동기 `Promise<void>`** 이든, **`try` 안에서 reject가 잡히지 않고 허공으로 나가는 Unhandled Rejection** 을 막고, 상위가 성공으로 착각해 모달만 닫히는 **Silent Failure** 를 방지한다. **`catch`에서 로깅 후 반드시 `throw error`로 재전파**하여 `AuthModalCoordinator`의 `await Promise.resolve(onRequestMiniAppExit())` → **`useAsyncTdsConfirm`의 `catch`/토스트 계약**으로 이어지게 한다. 사용자 대면 문구가 아닌 **콘솔/로그 메시지**는 프로젝트 표준 로거(Sentry 등)로 치환 가능하다. **`await import()`** 는 종료 확정 시점에만 실행되어 브리지 모듈 top-level이 **첫 페인트 전**에 평가될 위험을 줄인다(완전한 브리지 예외 모델은 토스 SDK 문서로 재확인).
- **Phase 1a와의 정합:** `AuthModalCoordinator` 내부의 조건은 **`!isInTossApp || type !== 'login'` 이면 `onCloseAuthModal()`만 호출하고 즉시 반환**하는 구조다. 따라서 현행 설계에서 `onRequestMiniAppExit`는 **웹 브라우저 경로뿐 아니라, 토스 앱의 비로그인 모달 경로에서도 호출되지 않는다.**
- **비동기/오류 계약 (Rule 7):** `onRequestMiniAppExit` 타입은 `() => Promise<void> | void`를 유지한다. `async` 핸들러는 `Promise<void>`에 해당한다. **`closeView`만 `await` 하면** 타입 정의가 `void`일 때 **`await-thenable`** 등 린트/TS 경고가 날 수 있으므로, **항상 `await Promise.resolve(bridge.closeView())`** 로 통일한다 — **동기·비동기 시그니처 변경에도 동일 패턴**으로 reject를 `catch`에 포착한다. 호출이 reject되면 **기존 `useAsyncTdsConfirm`의 `catch` 계약**에 따라 다이얼로그는 즉시 닫히지 않고, 실패 알림 경로로 위임된다.
- **빌드·의존성:** Vite 등은 **빌드 타임**에 `@apps-in-toss/web-bridge` 청크를 묶을 수 있어야 하므로, 패키지가 **의존성 그래프에 존재**하는지(직접 또는 전이)는 여전히 필요하다. Phase 4의 **런타임 정책**은 “**최상단 정적 import 금지 + 종료 핸들러 내 동적 import**”로 확정한다.
- **Vite 리포터 주의:** `@apps-in-toss/web-framework` / `web-analytics` 등이 **`web-bridge`를 전이 정적 import**하면, 빌드 시 **“동적 import인데도 다른 모듈이 정적으로 끌어온다”** 류 경고가 날 수 있다. **`App.tsx`의 정책(최상단 정적 import 없음)** 과는 별개로, 번들에 브리지가 포함될 수 있음을 전제한다.

### 설계 철학 — 의존성 주입(DI)으로 결합도 낮추기

- **팝업·모달 UI는 플랫폼에 묶이지 않는다:** 로그인 닫기, 종료 확인 등 **화면 책임**만 갖고, `@apps-in-toss/web-bridge` 같은 **호스트 앱 전용 API**는 알지 않는다. 종료 “의도”만 `onRequestMiniAppExit`로 위로 올리고, **실제 종료 구현**은 `App.tsx`에서 주입한다.
- **테스트·웹·토스 투 트랙:** 동일 UI를 브라우저에서 개발할 때 하위 컴포넌트가 `closeView`를 직접 import하면 환경별 분기·목(mock)이 UI 곳곳에 퍼진다. DI하면 **앱 셸만 교체·스텁**하면 되어 변경 범위가 한정된다.
- **SRP·OCP:** 종료 정책이나 브리지 시그니처가 바뀌어도 **코디네이터 이하 수정을 최소화**하고, 경계(`App.tsx`)만 조정하면 된다.
