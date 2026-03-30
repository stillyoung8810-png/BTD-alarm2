/**
 * 공통 UI 스타일 상수 (DRY)
 * 버튼/카드/모달 등 반복되는 클래스명을 한 곳에서 관리합니다.
 * TDS 래퍼의 웹 폴백 스타일과 일치시키기 위해 사용합니다.
 */

export const BUTTON = {
  base: 'py-3 rounded-2xl font-bold transition-all outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-60 disabled:pointer-events-none',
  primary:
    'bg-[#3182F6] text-white shadow-lg shadow-blue-500/20 hover:opacity-95 active:scale-[0.98] focus:ring-blue-500/50',
  secondary:
    'bg-transparent border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 focus:ring-slate-400',
  tertiary:
    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 focus:ring-slate-400',
  danger:
    'bg-rose-600/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white focus:ring-rose-500/50',
  dangerFill: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500/50',
  /** 풀 너비 블록 */
  full: 'w-full flex items-center justify-center gap-2',
  /** 작은 패딩 (세로) */
  compact: 'py-2.5 text-xs uppercase tracking-widest',
  large: 'py-5 text-sm uppercase tracking-widest',
} as const;

export const INPUT = {
  base: 'w-full p-5 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50 transition-all',
  withLeftIcon: 'pl-14',
  label: 'text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 block mb-1',
  error: 'text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3',
  info: 'text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3',
} as const;

export const MODAL = {
  overlay:
    'fixed inset-0 z-[200] flex min-h-[100dvh] items-center justify-center px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
  backdrop: 'absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl',
  panel:
    'relative w-full max-w-md min-h-0 max-h-full overflow-hidden rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a] flex flex-col',
  header:
    'p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0',
  body: 'p-6 md:p-10 flex-1 overflow-y-auto overscroll-contain',
  closeButton: 'p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400 transition-colors',
} as const;
