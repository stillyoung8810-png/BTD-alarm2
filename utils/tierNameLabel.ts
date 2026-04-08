import { I18N } from '../constants';
import type { TierNameTranslationKey } from '../constants/tierNameTranslationKeys';
import type { AppLang } from '../types';

export function getTierNameLabel(
  lang: AppLang,
  translationKey: TierNameTranslationKey,
): string {
  const row = I18N[lang] as Record<string, string | undefined>;
  const label = row[translationKey];
  return typeof label === 'string' && label.length > 0 ? label : translationKey;
}