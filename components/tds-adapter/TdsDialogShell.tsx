import React, {
  useCallback,
  useEffect,
  useId,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useTossApp } from '../../contexts/TossAppContext';
import { TDSModal } from '../tds';
import type { DialogActionLabels } from '../../constants/tdsDialogMessages';

const WEB_MODAL_OVERLAY_Z_CLASS = 'z-[200]';
const WEB_DIALOG_MAX_WIDTH_CLASS = 'max-w-md';
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
      className={`relative ${WEB_DIALOG_PANEL_Z_CLASS} flex min-h-0 max-h-full w-full ${maxWidthClassName} flex-col overflow-hidden rounded-[2rem] bg-white shadow-xl dark:bg-slate-900`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-700">
        <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">
          {title}
        </h2>
        <button
          type="button"
          onClick={guardedClose}
          disabled={isConfirmLoading}
          aria-busy={isConfirmLoading}
          aria-label={labels.closeAriaLabel}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div
        id={bodyId}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5"
      >
        {children}
      </div>

      {footer != null ? (
        <footer className="shrink-0 border-t border-slate-200 px-6 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] dark:border-slate-700">
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

  const webDialog = (
    <FocusScope trapped loop>
      <div
        className={`fixed inset-0 ${WEB_MODAL_OVERLAY_Z_CLASS} flex min-h-[100dvh] items-center justify-center px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]`}
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

  if (typeof document === 'undefined') {
    return webDialog;
  }

  return createPortal(webDialog, document.body);
};

export default TdsDialogShell;
