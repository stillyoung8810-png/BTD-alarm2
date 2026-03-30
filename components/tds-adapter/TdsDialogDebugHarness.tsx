import React, { useEffect, useMemo } from 'react';
import { TdsConfirmDialog } from './TdsConfirmDialog';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { useAsyncTdsConfirm } from './useAsyncTdsConfirm';

export const TdsDialogDebugHarness: React.FC = () => {
  const labels = TDS_DIALOG_MESSAGES.ko.actions;
  const portfolioMessages = TDS_DIALOG_MESSAGES.ko.portfolio;
  const dialog = useAsyncTdsConfirm('ko');

  const stressTestBody = useMemo(
    () =>
      Array.from({ length: 4 }, () => portfolioMessages.deleteBody)
        .join(' ')
        .trim(),
    [portfolioMessages.deleteBody],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const mode = query.get('mode');

    dialog.open({
      title: portfolioMessages.deleteTitle,
      body: stressTestBody,
      confirmLabel: portfolioMessages.deleteConfirm,
      tone: 'danger',
      action: async () => {
        if (mode === 'autofail') {
          throw new Error('toast_debug_forced_failure');
        }

        const response = await fetch('/favicon.svg', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('toast_debug_fetch_failed');
        }
      },
    });
  }, [
    dialog.open,
    portfolioMessages.deleteConfirm,
    portfolioMessages.deleteTitle,
    stressTestBody,
  ]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('mode') !== 'autofail' || !dialog.snapshot.isOpen) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void dialog.runConfirm();
    }, 250);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dialog.runConfirm, dialog.snapshot.isOpen]);

  return (
    <div className="min-h-[100dvh] bg-slate-100 px-4 py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-md">
        <div className="glass relative overflow-hidden rounded-[2.5rem] p-7 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50 pointer-events-none" />
          <div className="relative z-10 space-y-5">
            <div className="h-8 w-36 rounded-2xl bg-slate-200/80" />
            <div className="h-5 w-24 rounded-xl bg-slate-200/70" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-20 rounded-[1.5rem] bg-slate-200/70" />
              <div className="h-20 rounded-[1.5rem] bg-slate-200/70" />
            </div>
            <div className="h-24 rounded-[1.75rem] bg-slate-200/70" />
            <div className="h-12 rounded-[1.25rem] bg-slate-200/70" />
          </div>
        </div>
      </div>

      <TdsConfirmDialog {...dialog.dialogProps} labels={labels} />
    </div>
  );
};

export default TdsDialogDebugHarness;
