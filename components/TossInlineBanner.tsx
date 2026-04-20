import React, {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useTossBanner,
  type TossAdsAttachBannerOptions,
  type TossAdsAttachBannerResult,
  type TossAdsBannerCallbackPayload,
} from '../hooks/useTossBanner';
import { getResolvedMarketBannerAdGroupId } from '../services/ads/adPlacements';

export type TossInlineBannerVariant = 'card' | 'expanded';

export interface TossInlineBannerProps {
  adGroupId?: string;
  shouldShowAd: boolean;
  isInTossApp: boolean;
  className?: string;
  containerClassName?: string;
  variant?: TossInlineBannerVariant;
}

export function TossInlineBanner(props: TossInlineBannerProps): ReactElement | null {
  const {
    adGroupId = getResolvedMarketBannerAdGroupId(),
    shouldShowAd,
    isInTossApp,
    className,
    containerClassName,
    variant = 'card',
  } = props;

  if (!isInTossApp || !shouldShowAd) {
    return null;
  }

  const { isSupported, isInitialized, attachBanner } = useTossBanner();
  const [targetElement, setTargetElement] = useState<HTMLDivElement | null>(null);
  const [hasAttached, setHasAttached] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  const attachedRef = useRef<TossAdsAttachBannerResult | null>(null);

  const setRef = useCallback((element: HTMLDivElement | null): void => {
    setTargetElement(element);
  }, []);

  const handleBannerFailure = useCallback(
    (_payload?: TossAdsBannerCallbackPayload): void => {
      setIsFailed(true);
    },
    [],
  );

  useEffect(() => {
    if (
      !isSupported ||
      !isInitialized ||
      targetElement == null ||
      isFailed ||
      attachedRef.current != null
    ) {
      return;
    }

    let isCancelled = false;
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const attachSafely = (): void => {
      if (isCancelled || targetElement == null) {
        return;
      }

      if (
        typeof document !== 'undefined' &&
        !document.body.contains(targetElement)
      ) {
        return;
      }

      const options: TossAdsAttachBannerOptions = {
        theme: 'auto',
        tone: 'grey',
        variant,
        callbacks: {
          onNoFill: handleBannerFailure,
          onAdFailedToRender: handleBannerFailure,
        },
      };

      const attached = attachBanner(adGroupId, targetElement, options);
      if (attached == null) {
        setIsFailed(true);
        return;
      }

      attachedRef.current = attached;
      setHasAttached(true);
    };

    try {
      firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(attachSafely);
      });
    } catch {
      attachSafely();
    }

    return () => {
      isCancelled = true;
      if (firstFrameId != null) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId != null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [
    adGroupId,
    attachBanner,
    handleBannerFailure,
    isFailed,
    isInitialized,
    isSupported,
    targetElement,
    variant,
  ]);

  useEffect(() => {
    if (!isFailed) {
      return;
    }

    const attached = attachedRef.current;
    if (attached == null) {
      return;
    }

    try {
      attached.destroy();
    } catch {
      // No fill 이후 늦게 도착한 정리 실패가 전체 화면 실패로 번지지 않게 막습니다.
    } finally {
      attachedRef.current = null;
    }
  }, [isFailed]);

  useEffect(() => {
    return () => {
      const attached = attachedRef.current;
      if (attached == null) {
        return;
      }

      try {
        attached.destroy();
      } catch {
        // 언마운트 시점 정리 실패를 화면 오류로 승격하지 않습니다.
      } finally {
        attachedRef.current = null;
      }
    };
  }, []);

  if (!isSupported || isFailed) {
    return null;
  }

  const resolvedWrapperClassName = [className, hasAttached ? 'my-6 w-full' : '']
    .filter((value): value is string => value != null && value !== '')
    .join(' ');

  const resolvedContainerClassName = ['w-full', containerClassName]
    .filter((value): value is string => value != null && value !== '')
    .join(' ');

  return (
    <div className={resolvedWrapperClassName}>
      <div ref={setRef} className={resolvedContainerClassName} />
    </div>
  );
}