/**
 * TDS 모달 래퍼
 * - 토스 앱: @toss/tds-mobile Modal (open, Modal.Overlay, Modal.Content)
 * - 웹: 공통 MODAL 상수 기반 레이아웃 (헤더/푸터/본문 슬롯)
 */

import React from 'react';
import { useTossApp } from '../../contexts/TossAppContext';
import { MODAL } from '../ui/constants';
import { TDSButton } from './TDSButton';

export interface TDSModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 모달이 닫힌 후 애니메이션 완료 시 (TDS Modal onExited) */
  onExited?: () => void;
}

export interface TDSModalHeaderProps {
  title: React.ReactNode;
  onClose: () => void;
  /** 헤더 왼쪽 아이콘/뱃지 등 */
  leftAccessory?: React.ReactNode;
}

export interface TDSModalFooterProps {
  primaryLabel: React.ReactNode;
  onPrimary: () => void;
  secondaryLabel?: React.ReactNode;
  onSecondary?: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  primaryVariant?: 'primary' | 'danger' | 'dangerFill';
}

export const TDSModalHeader: React.FC<TDSModalHeaderProps> = ({
  title,
  onClose,
  leftAccessory,
}) => (
  <div className={MODAL.header}>
    <div className="flex items-center gap-3">
      {leftAccessory}
      <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
        {title}
      </h2>
    </div>
    <button
      type="button"
      onClick={onClose}
      className={MODAL.closeButton}
      aria-label="닫기"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
);

export const TDSModalFooter: React.FC<TDSModalFooterProps> = ({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  primaryLoading = false,
  primaryDisabled = false,
  primaryVariant = 'primary',
}) => (
  <div className="p-6 md:p-8 border-t border-slate-200 dark:border-white/5 flex gap-3 shrink-0">
    {secondaryLabel != null && onSecondary != null && (
      <TDSButton variant="tertiary" fullWidth onClick={onSecondary} className="flex-1">
        {secondaryLabel}
      </TDSButton>
    )}
    <TDSButton
      variant={primaryVariant}
      fullWidth
      loading={primaryLoading}
      disabled={primaryDisabled}
      onClick={onPrimary}
      className="flex-1"
    >
      {primaryLabel}
    </TDSButton>
  </div>
);

export const TDSModal: React.FC<TDSModalProps> = ({
  open,
  onClose,
  onExited,
  children,
}) => {
  const { isInTossApp } = useTossApp();

  if (!open) return null;

  /* R2 롤백: TDS 분기 제거. require('@toss/tds-mobile') 제거로 번들 에러 방지. 항상 웹 브랜치. */

  return (
    <div className={MODAL.overlay} role="dialog" aria-modal="true">
      <div className={MODAL.backdrop} onClick={onClose} aria-hidden />
      <div
        className={MODAL.panel}
        style={{ touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export default TDSModal;
