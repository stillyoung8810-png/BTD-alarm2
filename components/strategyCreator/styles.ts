export const STRATEGY_CREATOR_STYLES = {
  overlay:
    'fixed inset-0 z-[210] flex items-center justify-center p-4',
  backdrop:
    'absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md',
  panel:
    'relative flex h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]',
  header:
    'flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10',
  content:
    'flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 p-6 dark:bg-slate-950/70 md:p-8',
  footer:
    'flex gap-4 border-t border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80 md:p-8',
  sectionCard:
    'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70',
  fieldStack: 'space-y-3',
  fieldLabel:
    'text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400',
  textInput:
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 dark:bg-slate-900/80 dark:text-white',
  primaryButton:
    'flex-1 rounded-2xl bg-blue-600 px-6 py-5 text-xs font-black uppercase text-white shadow-[0_12px_40px_rgba(37,99,235,0.35)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50',
  secondaryButton:
    'rounded-2xl border border-slate-600/60 bg-slate-800 px-6 py-5 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-slate-700',
  errorBanner:
    'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600',
  helperText: 'text-[11px] font-medium text-slate-500 dark:text-slate-400',
} as const;