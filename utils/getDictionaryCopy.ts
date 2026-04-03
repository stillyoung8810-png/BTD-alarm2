import type { AppLang } from '@/types';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';

const SYSTEM_FALLBACK_MESSAGES: Record<AppLang, string> = {
  ko: '사전 로드에 실패했습니다. 기본 언어로 표시합니다.',
  en: 'Failed to load dictionary. Falling back to default copy.',
} as const;

export function getDictionaryCopy<T>(
  dictionary: Record<AppLang, T>,
  lang: AppLang,
  dictionaryName: string,
): T {
  const selected = dictionary[lang];

  if (selected != null) {
    return selected;
  }

  const fallback = dictionary.ko;

  void Promise.resolve()
    .then(() => {
      showErrorToast(`[${dictionaryName}] ${SYSTEM_FALLBACK_MESSAGES[lang]}`);
    })
    .catch((error: unknown) => {
      console.error('[getDictionaryCopy] Fallback toast failed:', error);
    });

  return fallback;
}
