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

  if (isInTossApp) {
    try {
      const { Button: TDSButtonComponent } = require('@toss/tds-mobile');
      const tdsColor = variant === 'danger' || variant === 'dangerFill' ? 'danger' : 'primary';
      const tdsVariant = variant === 'secondary' || variant === 'tertiary' ? 'weak' : 'fill';
      return (
        <TDSButtonComponent
          type={type}
          color={tdsColor}
          variant={tdsVariant}
          display={fullWidth ? 'block' : 'inline'}
          size={size === 'small' ? 'small' : size === 'medium' ? 'medium' : 'xlarge'}
          disabled={isDisabled}
          loading={loading}
          onClick={onClick}
          aria-label={ariaLabel}
          className={className}
        >
          {loading ? null : children}
        </TDSButtonComponent>
      );
    } catch {
      /* @toss/tds-mobile not available, fall through to web */
    }
  }

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
