/**
 * TDS 버튼 래퍼
 * - 토스 앱: @toss/tds-mobile Button (color, variant, display, size, loading)
 * - 웹: 공통 스타일 상수(BUTTON) 기반 button
 */

import React from 'react';
import { useTossApp } from '../../contexts/TossAppContext';
import { BUTTON } from '../ui/constants';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'dangerFill';
type ButtonSize = 'small' | 'medium' | 'large';

export interface TDSButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 풀 너비 블록 스타일 */
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  /** 접근성: aria-label 등 전달 */
  'aria-label'?: string;
}

const VARIANT_MAP: Record<ButtonVariant, string> = {
  primary: BUTTON.primary,
  secondary: BUTTON.secondary,
  tertiary: BUTTON.tertiary,
  danger: BUTTON.danger,
  dangerFill: BUTTON.dangerFill,
};

const SIZE_MAP: Record<ButtonSize, string> = {
  small: BUTTON.compact,
  medium: 'py-3 text-xs uppercase tracking-widest',
  large: BUTTON.large,
};

export const TDSButton: React.FC<TDSButtonProps> = ({
  variant = 'primary',
  size = 'large',
  fullWidth = false,
  disabled = false,
  loading = false,
  type = 'button',
  children,
  onClick,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const { isInTossApp } = useTossApp();
  const isDisabled = disabled || loading;

  /* R2 롤백: TDS 분기 제거. require('@toss/tds-mobile') 제거로 번들 에러 방지. 항상 웹 브랜치. */

  const variantClass = VARIANT_MAP[variant];
  const sizeClass = SIZE_MAP[size];
  const fullClass = fullWidth ? BUTTON.full : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={`${BUTTON.base} ${variantClass} ${sizeClass} ${fullClass} ${className}`.trim()}
    >
      {loading ? (
        <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <>{children}</>
      )}
    </button>
  );
};

export default TDSButton;
