import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerTdsErrorToastHandler } from './showErrorToast';

const TOAST_AUTO_HIDE_MS = 3_000;

export const TdsErrorToastHost: React.FC = () => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleShowToast = useCallback(
    (message: string) => {
      const trimmedMessage = message.trim();
      if (trimmedMessage === '') {
        return;
      }

      clearHideTimer();
      setToastMessage(trimmedMessage);
      hideTimerRef.current = setTimeout(() => {
        setToastMessage(null);
        hideTimerRef.current = null;
      }, TOAST_AUTO_HIDE_MS);
    },
    [clearHideTimer],
  );

  useEffect(() => {
    registerTdsErrorToastHandler(handleShowToast);

    return () => {
      registerTdsErrorToastHandler(null);
      clearHideTimer();
    };
  }, [clearHideTimer, handleShowToast]);

  if (toastMessage == null) {
    return null;
  }

  const toastContent = (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[320] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="max-w-md rounded-2xl bg-slate-900/95 px-4 py-3 text-sm font-medium text-white shadow-2xl dark:bg-slate-100/95 dark:text-slate-900"
      >
        {toastMessage}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return toastContent;
  }

  return createPortal(toastContent, document.body);
};

export default TdsErrorToastHost;
