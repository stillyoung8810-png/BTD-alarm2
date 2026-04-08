import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyCreatorLayoutProps } from './types/ui';

export function StrategyCreatorLayout({
  title,
  closeAriaLabel,
  cancelLabel,
  backLabel,
  primaryActionLabel,
  processingLabel,
  errorMessage,
  isSaving,
  isPrimaryDisabled,
  canGoBack,
  onClose,
  onBack,
  onPrimaryAction,
  children,
}: StrategyCreatorLayoutProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.overlay}>
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className={STRATEGY_CREATOR_STYLES.backdrop}
      />
      <div className={STRATEGY_CREATOR_STYLES.panel}>
        <div className={STRATEGY_CREATOR_STYLES.header}>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            className="rounded-full p-3 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.content}>{children}</div>

        {errorMessage != null && (
          <div className="px-6 pt-5 md:px-8">
            <p className={STRATEGY_CREATOR_STYLES.errorBanner}>
              {errorMessage}
            </p>
          </div>
        )}

        <div className={STRATEGY_CREATOR_STYLES.footer}>
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {backLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isPrimaryDisabled}
            className={STRATEGY_CREATOR_STYLES.primaryButton}
          >
            {isSaving ? processingLabel : primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}