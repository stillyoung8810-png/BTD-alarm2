import React from 'react';
import { Info } from 'lucide-react';
import { LAOER_CREDIT_LABELS, LAOER_CREDIT_LINKS } from '../../constants/vrMessages';
import type { AppLang } from '../../types';

export interface LaoerCreditBannerProps {
  lang: AppLang;
}

const ANCHOR_CLASS =
  'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/20 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm transition-all hover:bg-white/30 active:scale-95';

export default function LaoerCreditBanner({ lang }: LaoerCreditBannerProps) {
  const t = LAOER_CREDIT_LABELS[lang];

  return (
    <div
      className="relative mt-8 w-full shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-blue-600 to-indigo-800 p-4 sm:rounded-3xl"
      role="region"
      aria-label={t.ariaRegion}
    >
      <div
        className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-blue-400/10 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 rounded-lg border border-white/10 bg-white/15 p-1.5 backdrop-blur-md">
          <Info size={16} className="text-white" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <h4 className="text-xs font-black uppercase tracking-widest text-white opacity-90">
              {t.title}
            </h4>
            <div className="h-px min-w-[2rem] flex-1 bg-white/20" />
          </div>

          <p className="mb-3 text-[11px] font-medium leading-relaxed text-blue-50/90">{t.desc}</p>

          <div className="flex flex-wrap items-center gap-2">
            {LAOER_CREDIT_LINKS.map(({ id, url, icon: Icon }) => (
              <a
                key={id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={ANCHOR_CLASS}
              >
                <Icon size={12} className="shrink-0 opacity-80" aria-hidden />
                {t.linkLabels[id]}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
