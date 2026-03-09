import React, {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
// 🚨 주의: 우리가 방금 만든 안전한 useTossBanner.ts 파일에서 직접 타입을 가져옵니다!
import { 
  useTossBanner, 
  type TossAdsAttachBannerOptions, 
  type TossAdsAttachBannerResult 
} from '../hooks/useTossBanner';
import { BANNER_AD_GROUP_ID } from '../services/ads/adPlacements';

export type TossInlineBannerVariant = 'card' | 'expanded';

export interface TossInlineBannerProps {
  adGroupId?: string;
  currentTier: 'free' | 'pro' | 'premium' | string;
  isInTossApp: boolean;
  className?: string;
  variant?: TossInlineBannerVariant;
}

export function TossInlineBanner(props: TossInlineBannerProps): ReactElement | null {
  const {
    adGroupId = BANNER_AD_GROUP_ID,
    currentTier,
    isInTossApp,
    className,
    variant = 'card',
  } = props;

  if (!isInTossApp) return null;

  const normalizedTier = (currentTier ?? 'free').toString().toLowerCase();
  if (normalizedTier !== 'free') return null;

  const { isSupported, isInitialized, attachBanner } = useTossBanner();
  const [targetElement, setTargetElement] = useState<HTMLDivElement | null>(null);
  const [hasAttached, setHasAttached] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  const attachedRef = useRef<TossAdsAttachBannerResult | null>(null);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    setTargetElement(el);
  }, []);

  useEffect(() => {
    if (!isSupported || !isInitialized || !targetElement || isFailed || attachedRef.current) return;

    let cancelled = false;
    let raf1: number | null = null;
    let raf2: number | null = null;

    const attachSafely = () => {
      if (cancelled || !targetElement) return;
      if (typeof document !== 'undefined' && !document.body.contains(targetElement)) return;

      const options: TossAdsAttachBannerOptions = {
        theme: 'auto',
        tone: 'grey',
        variant,
        callbacks: {
          // 💡 완벽 해결: 파라미터(payload)를 추가하여 TS 에러를 방지합니다.
          onNoFill: (payload?: any) => { setIsFailed(true); },
          onAdFailedToRender: (payload?: any) => { setIsFailed(true); },
        },
      };

      let attached: TossAdsAttachBannerResult | undefined;
      try {
        attached = attachBanner(adGroupId, targetElement, options);
      } catch (error) {
        setIsFailed(true);
        return;
      }

      if (!attached) {
        setIsFailed(true);
        return;
      }

      attachedRef.current = attached;
      setHasAttached(true);
    };

    try {
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(attachSafely);
      });
    } catch (error) {
      attachSafely();
    }

    return () => {
      cancelled = true;
      if (raf1 != null) window.cancelAnimationFrame(raf1);
      if (raf2 != null) window.cancelAnimationFrame(raf2);
    };
  }, [adGroupId, attachBanner, isFailed, isInitialized, isSupported, targetElement, variant]);

  useEffect(() => {
    if (!isFailed) return;
    const attached = attachedRef.current;
    if (!attached) return;
    try { attached.destroy(); } catch (error) {} finally { attachedRef.current = null; }
  }, [isFailed]);

  useEffect(() => () => {
    const attached = attachedRef.current;
    if (!attached) return;
    try { attached.destroy(); } catch (error) {} finally { attachedRef.current = null; }
  }, []);

  if (!isSupported || isFailed) return null;

  const containerStyle: CSSProperties | undefined = hasAttached
    ? { marginTop: 24, marginBottom: 24, width: '100%' }
    : undefined;

  return (
    <div className={className} style={containerStyle}>
      <div ref={setRef} style={{ width: '100%' }} />
    </div>
  );
}