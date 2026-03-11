import React, { useEffect, useState } from 'react';

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
          'max-w-sm rounded-full bg-slate-900/95 text-white',
          'px-4 py-3 text-sm font-medium shadow-2xl',
          'transition-all duration-200 ease-out',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        ].join(' ')}
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {message}
      </div>
    </div>
  );
};

export default Toast;

