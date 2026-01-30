import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** 접근성용 라벨 (선택) */
  'aria-label'?: string;
}

/**
 * Markets.tsx와 동일한 pill-style 스위치.
 * AlarmModal, AuthModals 등에서 통일된 토글 디자인용.
 */
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled = false, 'aria-label': ariaLabel }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-all duration-300 ${
        checked ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-slate-600'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
};

export default Toggle;
