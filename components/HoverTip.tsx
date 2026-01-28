import React from 'react';

export default function HoverTip({
  text,
  children,
  className = '',
  bubbleClassName = '',
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  bubbleClassName?: string;
}) {
  return (
    <span className={`relative inline-block group/hover-tip ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap
        opacity-0 scale-95 group-hover/hover-tip:opacity-100 group-hover/hover-tip:scale-100 group-focus-within/hover-tip:opacity-100 group-focus-within/hover-tip:scale-100
        transition-all duration-150 z-[9999]
        ${bubbleClassName}`}
      >
        <span className="block rounded-xl bg-slate-900/90 text-white text-[10px] font-black tracking-widest px-3 py-2 border border-white/10 shadow-2xl backdrop-blur-md">
          {text}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-slate-900/90 rotate-45 border-r border-b border-white/10" />
      </span>
    </span>
  );
}

