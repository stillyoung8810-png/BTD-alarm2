import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface ToastProps {
  message: string;
  onDone: () => void;
  durationMs?: number;
}

const EXIT_MS = 180;

const Toast: React.FC<ToastProps> = ({ message, onDone, durationMs = 2400 }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enterId = window.setTimeout(() => {
      setVisible(true);
    }, 10);

    const exitId = window.setTimeout(() => {
      setVisible(false);
    }, durationMs);

    const doneId = window.setTimeout(() => {
      onDone();
    }, durationMs + EXIT_MS);

    return () => {
      window.clearTimeout(enterId);
      window.clearTimeout(exitId);
      window.clearTimeout(doneId);
    };
  }, [durationMs, onDone]);

  return (
    <div className="fixed inset-x-0 bottom-6 z-[100] flex justify-center pointer-events-none px-4">
      <div
        className={[
          'max-w-sm rounded-full',
          'bg-gray-800 text-white dark:bg-white dark:text-slate-900',
          'px-4 text-sm font-medium shadow-2xl',
          'transition-all duration-200 ease-out',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        ].join(' ')}
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-bottom))',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-300 dark:text-amber-500" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
};

export default Toast;

