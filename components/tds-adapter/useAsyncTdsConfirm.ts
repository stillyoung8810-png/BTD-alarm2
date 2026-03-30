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
  runConfirm: () => Promise<void>;
  dialogProps: AsyncTdsConfirmDialogProps;
}

export function useAsyncTdsConfirm(lang: AppLang): UseAsyncTdsConfirmResult {
  const actionRef = useRef<(() => Promise<void> | void) | null>(null);
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
      const errorMsg = TDS_DIALOG_MESSAGES[lang]?.common?.refundActionFailed;
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
