/**
 * 구독 티어 표시용 view-model: 번역 키 + 스타일 메타데이터만 반환 (표시 문자열은 View/I18N).
 */

import { Crown, Star, Zap } from 'lucide-react';
import {
  TIER_NAME_TRANSLATION_KEY,
  type TierNameTranslationKey,
} from '../constants/tierNameTranslationKeys';

export type TierValue = 'free' | 'pro' | 'premium' | string;

export type { TierNameTranslationKey };

export interface TierDisplay {
  translationKey: TierNameTranslationKey;
  tierClassName: string;
  TierIcon: typeof Crown;
  tierIconClassName: string;
}

type TierDisplayKey = 'free' | 'pro' | 'premium';

function normalizeTierKey(tier: TierValue): TierDisplayKey {
  const normalized = (typeof tier === 'string' ? tier : 'free').toLowerCase();

  if (normalized === 'premium' || normalized === 'enterprise') {
    return 'premium';
  }

  if (normalized === 'pro') {
    return 'pro';
  }

  return 'free';
}

export function useTierDisplay(tier: TierValue): TierDisplay {
  const tierKey = normalizeTierKey(tier);

  switch (tierKey) {
    case 'premium':
      return {
        translationKey: TIER_NAME_TRANSLATION_KEY.PREMIUM,
        tierClassName: 'shimmer-text-premium',
        TierIcon: Crown,
        tierIconClassName: 'premium-icon-breath',
      };
    case 'pro':
      return {
        translationKey: TIER_NAME_TRANSLATION_KEY.PRO,
        tierClassName: 'shimmer-text-pro',
        TierIcon: Star,
        tierIconClassName: 'pro-icon-twinkle',
      };
    case 'free':
      return {
        translationKey: TIER_NAME_TRANSLATION_KEY.FREE,
        tierClassName: 'text-free-matte',
        TierIcon: Zap,
        tierIconClassName: 'free-icon-zap',
      };
    default: {
      const exhaustiveCheck: never = tierKey;
      return exhaustiveCheck;
    }
  }
}
