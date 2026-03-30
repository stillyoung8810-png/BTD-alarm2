import { useCallback, useRef, useState } from 'react';
import type { AppLang } from '../../types';
import {
  TDS_DIALOG_MESSAGES,
  type DialogTone,
} from '../../constants/tdsDialogMessages';
import { showErrorToast } from './showErrorToast';

const FALLBACK_CONFIRM_ERROR_TOAST_MESSAGE: Record<AppLang, string> = {
  ko: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  en: 'Something went wrong. Please try again in a moment.',
};

function getConfirmErrorToastMessage(lang: AppLang): string {
  const localizedMessage = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed?.trim();
  if (localizedMessage != null && localizedMessage !== '') {
    return localizedMessage;
  }

  return FALLBACK_CONFIRM_ERROR_TOAST_MESSAGE[lang] ?? FALLBACK_CONFIRM_ERROR_TOAST_MESSAGE.ko;
}

export type AsyncTdsConfirmOpenParams = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: DialogTone;
  action: () => Promise<void> | void;
};

/** 닫힘 시에도 마지막 문구를 유지 — `isOpen`만 끄고 title/body를 비우지 않는다(퇴장 애니메이션). */
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
  runConfirm: () => Promise<void>;
  dialogProps: AsyncTdsConfirmDialogProps;
}

export function useAsyncTdsConfirm(lang: AppLang): UseAsyncTdsConfirmResult {
  const actionRef = useRef<(() => Promise<void> | void) | null>(null);
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
      showErrorToast(getConfirmErrorToastMessage(lang));
    } finally {
      isExecutingRef.current = false;
      setIsConfirmLoading(false);
    }
  }, [close, lang]);

  // Consumer가 `{...dialogProps}`로 전개하므로 래퍼 객체 참조 동일성은 의미가 적다.
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
