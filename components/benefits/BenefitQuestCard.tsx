import React from 'react';
import { ArrowRight } from 'lucide-react';

interface BenefitQuestCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel?: string;
  readonly loadingLabel: string;
  readonly statusLabel: string;
  readonly icon: React.ReactNode;
  readonly accentClassName: string;
  readonly metaLabel?: string;
  readonly isCtaLoading?: boolean;
  readonly isCtaDisabled?: boolean;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly onCtaClick?: () => void;
}

export function BenefitQuestCard({
  title,
  subtitle,
  ctaLabel,
  loadingLabel,
  statusLabel,
  icon,
  accentClassName,
  metaLabel,
  isCtaLoading = false,
  isCtaDisabled = false,
  children,
  actions,
  onCtaClick,
}: BenefitQuestCardProps): React.ReactElement {
  const shouldRenderDefaultAction = ctaLabel != null;
  const shouldDisableCta = isCtaDisabled || isCtaLoading || onCtaClick == null;
  const ctaClassName = shouldDisableCta
    ? 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500'
    : 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 hover:-translate-y-0.5 dark:bg-white dark:text-slate-950';
  const resolvedCtaLabel = isCtaLoading ? loadingLabel : ctaLabel;

  return (
    <article className="group rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-[#080B15] dark:shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-3 text-white shadow-lg ${accentClassName}`}>
          {icon}
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-white/5 dark:text-slate-400">
          {statusLabel}
        </span>
      </div>
      <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
        {title}
      </h3>
      {metaLabel != null && (
        <p className="mt-1 text-xs font-black text-blue-500 dark:text-blue-300">
          {metaLabel}
        </p>
      )}
      <p className="mt-2 min-h-[48px] text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>
      {children}
      {actions}
      {shouldRenderDefaultAction && (
        <button
          type="button"
          onClick={onCtaClick}
          disabled={shouldDisableCta}
          className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-all ${ctaClassName}`}
        >
          {resolvedCtaLabel}
          <ArrowRight size={16} aria-hidden />
        </button>
      )}
    </article>
  );
}
