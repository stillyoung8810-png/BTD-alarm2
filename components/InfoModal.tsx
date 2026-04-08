import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';

interface InfoModalProps {
  open: boolean;
  badgeLabel: string;
  title: string;
  message: string;
  closeAriaLabel: string;
  confirmLabel: string;
  onClose: () => void;
}

export default function InfoModal({
  open,
  badgeLabel,
  title,
  message,
  closeAriaLabel,
  confirmLabel,
  onClose,
}: InfoModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md"
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#161d2a] rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
          <div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {badgeLabel}
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
            aria-label={closeAriaLabel}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="p-6 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}