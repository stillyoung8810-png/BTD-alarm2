import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyGuideSheetProps } from './types/ui';

function renderGuideImage(params: {
  resolvedImageSrc: string;
  alt: string;
  hasImageLoadError: boolean;
  brokenImageMessage: string;
  onImageError: React.ReactEventHandler<HTMLImageElement>;
}): React.ReactElement {
  const {
    resolvedImageSrc,
    alt,
    hasImageLoadError,
    brokenImageMessage,
    onImageError,
  } = params;

  if (resolvedImageSrc.length === 0 || hasImageLoadError) {
    return (
      <div className={STRATEGY_CREATOR_STYLES.strategyGuideImageFallback}>
        {brokenImageMessage}
      </div>
    );
  }

  return (
    <img
      src={resolvedImageSrc}
      alt={alt}
      draggable={false}
      onError={onImageError}
      className={STRATEGY_CREATOR_STYLES.strategyGuideImage}
    />
  );
}

export function StrategyGuideSheet({
  labels,
  entry,
  onClose,
}: StrategyGuideSheetProps): React.ReactElement {
  const titleId = `strategy-guide-title-${entry.id}`;
  const resolvedImageSrc = entry.overviewImageSrc.trim();
  const [hasImageLoadError, setHasImageLoadError] = useState(false);

  useEffect(() => {
    setHasImageLoadError(false);
  }, [resolvedImageSrc]);

  const handleImageError = useCallback<
    React.ReactEventHandler<HTMLImageElement>
  >(() => {
    setHasImageLoadError(true);
  }, []);

  return (
    <div className={STRATEGY_CREATOR_STYLES.strategyGuideOverlay}>
      <div
        role="button"
        tabIndex={0}
        aria-label={labels.closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className={STRATEGY_CREATOR_STYLES.backdrop}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={STRATEGY_CREATOR_STYLES.strategyGuidePanel}
      >
        <div className={STRATEGY_CREATOR_STYLES.strategyGuideHeader}>
          <div className="min-w-0">
            <p className={STRATEGY_CREATOR_STYLES.strategyGuideEyebrow}>
              {labels.dialogTitle}
            </p>
            <h2
              id={titleId}
              className={STRATEGY_CREATOR_STYLES.strategyGuideTitle}
            >
              {entry.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeAriaLabel}
            className={STRATEGY_CREATOR_STYLES.strategyGuideIconButton}
          >
            <X size={22} aria-hidden />
          </button>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.strategyGuideBody}>
          {renderGuideImage({
            resolvedImageSrc,
            alt: entry.overviewImageAlt,
            hasImageLoadError,
            brokenImageMessage: labels.brokenImageMessage,
            onImageError: handleImageError,
          })}
        </div>

        <div className={STRATEGY_CREATOR_STYLES.strategyGuideFooter}>
          <button
            type="button"
            onClick={onClose}
            className={STRATEGY_CREATOR_STYLES.secondaryButton}
          >
            {labels.closeLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
