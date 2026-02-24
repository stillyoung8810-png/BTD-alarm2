/**
 * TDS 텍스트필드 래퍼
 * - 토스 앱: @toss/tds-mobile TextField (variant: box | line | big | hero)
 * - 웹: 공통 INPUT 상수 기반 input + label + help/error
 */

import React from 'react';
import { useTossApp } from '../../contexts/TossAppContext';
import { INPUT } from '../ui/constants';

export interface TDSTextFieldProps {
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  help?: React.ReactNode;
  /** 웹에서만: 왼쪽 아이콘 영역이 있으면 pl-14 적용 */
  withLeftIcon?: boolean;
  className?: string;
  required?: boolean;
  autoComplete?: string;
}

export const TDSTextField: React.FC<TDSTextFieldProps> = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  hasError = false,
  help,
  withLeftIcon = false,
  className = '',
  required = false,
  autoComplete,
}) => {
  const { isInTossApp } = useTossApp();

  /* R2 롤백: TDS 분기 제거. require('@toss/tds-mobile') 제거로 번들 에러 방지. 항상 웹 브랜치. */

  const inputClass = [
    INPUT.base,
    withLeftIcon ? INPUT.withLeftIcon : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-2">
      {label != null && (
        <label className={INPUT.label}>
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        className={inputClass}
        aria-invalid={hasError}
      />
      {hasError && help && (
        <p className="text-xs font-bold text-rose-500" role="alert">
          {help}
        </p>
      )}
      {!hasError && help && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{help}</p>
      )}
    </div>
  );
};

export default TDSTextField;
