import React from 'react';
import type { AppLang } from '@/types';
import { getCommonMessages } from '@/constants/messages/commonMessages';

const DISCLAIMER_MESSAGE_KEY_BY_VARIANT = {
  minimal: 'legalDisclaimerMinimal',
  standard: 'legalDisclaimerStandard',
  accent: 'legalDisclaimerAccent',
} as const;

export type LegalDisclaimerVariant =
  keyof typeof DISCLAIMER_MESSAGE_KEY_BY_VARIANT;

const DISCLAIMER_CLASSNAME_BY_VARIANT: Record<LegalDisclaimerVariant, string> = {
  minimal:
    'text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed',
  standard:
    'text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed',
  accent:
    'text-[12px] font-semibold text-slate-600 dark:text-slate-300 leading-relaxed',
};

interface LegalDisclaimerProps {
  lang: AppLang;
  variant?: LegalDisclaimerVariant;
  layoutClassName?: string;
}

export const LegalDisclaimer = React.memo(function LegalDisclaimer({
  lang,
  variant = 'standard',
  layoutClassName = '',
}: LegalDisclaimerProps): React.ReactElement {
  const copy = getCommonMessages(lang);
  const messageKey = DISCLAIMER_MESSAGE_KEY_BY_VARIANT[variant];
  const baseClassName = DISCLAIMER_CLASSNAME_BY_VARIANT[variant];

  return (
    <div role="note" className={`${baseClassName} ${layoutClassName}`.trim()}>
      {copy[messageKey]}
    </div>
  );
});

LegalDisclaimer.displayName = 'LegalDisclaimer';
