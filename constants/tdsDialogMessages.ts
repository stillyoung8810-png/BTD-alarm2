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
    openClearDialog: string;
  };
  refund: {
    guideTitle: string;
    guideBody: string;
    openRefundGuide: string;
  };
  samples: {
    openDangerConfirmSample: string;
  };
  common: {
    acknowledge: string;
    refundActionFailed: string;
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
