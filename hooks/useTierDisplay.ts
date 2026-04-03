/**
 * 구독 티어 표시 로직 단일 책임 훅 (DRY)
 * App.tsx 및 프로필 등에서 tierLabel, tierClassName, TierIcon, tierIconClassName 통일
 */

import { useMemo } from 'react';
import { Crown, Star, Zap } from 'lucide-react';

export type TierValue = 'free' | 'pro' | 'premium' | string;

export interface TierDisplay {
  tierLabel: string;
  tierClassName: string;
  TierIcon: typeof Crown;
  tierIconClassName: string;
}

export function useTierDisplay(tier: TierValue): TierDisplay {
  return useMemo(() => {
    const normalized = (typeof tier === 'string' ? tier : 'free').toLowerCase();
    const isPremium = normalized === 'premium' || normalized === 'enterprise';
    const isPro = normalized === 'pro';

    return {
      tierLabel: isPremium ? 'PREMIUM' : isPro ? 'PRO' : 'FREE',
      tierClassName: isPremium
        ? 'shimmer-text-premium'
        : isPro
        ? 'shimmer-text-pro'
        : 'text-free-matte',
      TierIcon: isPremium ? Crown : isPro ? Star : Zap,
      tierIconClassName: isPremium
        ? 'premium-icon-breath'
        : isPro
        ? 'pro-icon-twinkle'
        : 'free-icon-zap',
    };
  }, [tier]);
}
