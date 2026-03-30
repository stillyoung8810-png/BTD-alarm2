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
    /** 헤더의 전체 내역 초기화 버튼 라벨 */
    clearHistoryButton: string;
    /** 단일 종료 전략 기록 삭제 확인 */
    deleteRecordTitle: string;
    deleteRecordBody: string;
    deleteRecordConfirm: string;
    deleteRecordButton: string;
  };
  portfolio: {
    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    openDeleteConfirm: string;
  };
  auth: {
    signedInSuccessTitle: string;
    signedInSuccessBody: string;
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    sessionExpiredAcknowledge: string;
    passwordChangedTitle: string;
    passwordChangedBody: string;
    passwordChangedReloginTitle: string;
    passwordChangedReloginBody: string;
    accountDeletedTitle: string;
    accountDeletedBody: string;
  };
  checkout: {
    /** 결제 성공·실패·검증 안내 등 공통 알림 제목 */
    resultNoticeTitle: string;
  };
  app: {
    portfolioLimitTitle: string;
    portfolioLimitBody: (maxCount: number) => string;
  };
  refund: {
    guideTitle: string;
    guideBody: string;
    openRefundGuide: string;
    requestRefund: string;
    confirmPrompt: string;
    eligiblePolicy: string;
    ineligiblePolicy: string;
    confirmRefund: string;
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
      clearHistoryButton: '내역 초기화',
      deleteRecordTitle: '기록 삭제',
      deleteRecordBody:
        '이 종료 전략 기록을 삭제합니다. Supabase에서도 제거되며 되돌릴 수 없습니다.',
      deleteRecordConfirm: '삭제',
      deleteRecordButton: '기록 삭제',
    },
    portfolio: {
      deleteTitle: '포트폴리오 삭제',
      deleteBody:
        '정말로 이 포트폴리오를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      deleteConfirm: '삭제',
      openDeleteConfirm: '포트폴리오 삭제',
    },
    auth: {
      signedInSuccessTitle: '인증 완료',
      signedInSuccessBody: '환영합니다. 인증이 완료되었습니다.',
      sessionExpiredTitle: '세션 만료',
      sessionExpiredBody: '세션이 만료되었습니다. 다시 로그인해 주세요.',
      sessionExpiredAcknowledge: '확인',
      passwordChangedTitle: '비밀번호 변경',
      passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
      passwordChangedReloginTitle: '비밀번호 변경',
      passwordChangedReloginBody:
        '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
      accountDeletedTitle: '회원 탈퇴',
      accountDeletedBody: '회원 탈퇴가 완료되었습니다.',
    },
    checkout: {
      resultNoticeTitle: '결제 안내',
    },
    app: {
      portfolioLimitTitle: '포트폴리오 한도',
      portfolioLimitBody: (maxCount: number) =>
        `포트폴리오 생성 한도(${maxCount}개)에 도달했습니다. 더 많은 포트폴리오를 만들려면 업그레이드를 고려해 보세요.`,
    },
    refund: {
      guideTitle: '환불 안내',
      guideBody:
        '안드로이드는 토스 앱 결제내역의 환불 경로를 이용하고, iOS는 애플 고객센터 환불 경로를 이용합니다.',
      openRefundGuide: '환불 안내 보기',
      requestRefund: '환불 요청',
      confirmPrompt: '환불을 요청하시겠습니까?',
      eligiblePolicy:
        '결제 후 7일 이내이고 이용 기록이 없으면 전액 환불 후 서비스가 즉시 해제됩니다.',
      ineligiblePolicy:
        '그 외에는 환불이 불가하며, 이용 기간 만료 시 자동 종료됩니다.',
      confirmRefund: '환불 확인',
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
      clearHistoryButton: 'Clear History',
      deleteRecordTitle: 'Delete record',
      deleteRecordBody:
        'This removes the closed strategy record from Supabase. This cannot be undone.',
      deleteRecordConfirm: 'Delete',
      deleteRecordButton: 'Delete',
    },
    portfolio: {
      deleteTitle: 'Delete portfolio',
      deleteBody:
        'Are you sure you want to delete this portfolio? This action cannot be undone.',
      deleteConfirm: 'Delete',
      openDeleteConfirm: 'Delete portfolio',
    },
    auth: {
      signedInSuccessTitle: 'Authentication complete',
      signedInSuccessBody: 'Welcome. Authentication is complete.',
      sessionExpiredTitle: 'Session expired',
      sessionExpiredBody: 'Your session expired. Please sign in again.',
      sessionExpiredAcknowledge: 'OK',
      passwordChangedTitle: 'Password updated',
      passwordChangedBody: 'Your password was updated successfully.',
      passwordChangedReloginTitle: 'Password updated',
      passwordChangedReloginBody:
        'Your password was updated. Please log in again.',
      accountDeletedTitle: 'Account deleted',
      accountDeletedBody: 'Your account has been deleted.',
    },
    checkout: {
      resultNoticeTitle: 'Payment notice',
    },
    app: {
      portfolioLimitTitle: 'Portfolio limit',
      portfolioLimitBody: (maxCount: number) =>
        `Portfolio limit (${maxCount}) reached. Please upgrade for more.`,
    },
    refund: {
      guideTitle: 'Refund guide',
      guideBody:
        'Use Toss payment history on Android, or Apple Support on iOS, to request a refund.',
      openRefundGuide: 'Open refund guide',
      requestRefund: 'Request refund',
      confirmPrompt: 'Do you want to request a refund?',
      eligiblePolicy:
        'Within 7 days and with no usage history, you receive a full refund and access is revoked immediately.',
      ineligiblePolicy:
        'Otherwise, a refund is not available and access ends automatically at expiration.',
      confirmRefund: 'Confirm refund',
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
