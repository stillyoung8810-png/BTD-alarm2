import React from 'react';
import type {
  BenefitMessages,
  BenefitWalletBoardItemCopy,
} from '@/constants/messages/benefitMessages';

interface BenefitWalletBoardProps {
  readonly copy: BenefitMessages;
  readonly items: readonly BenefitWalletBoardItemCopy[];
  readonly isLoading?: boolean;
}

function WalletSkeletonItem(): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white/60 p-4 dark:bg-white/[0.03]">
      <div className="mb-3 h-3 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="h-6 w-24 animate-pulse rounded-full bg-slate-300 dark:bg-slate-600" />
    </div>
  );
}

function WalletItem({
  item,
}: {
  readonly item: BenefitWalletBoardItemCopy;
}): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        {item.label}
      </p>
      <p className="mt-2 text-xl font-black tracking-tight text-slate-900 dark:text-white">
        {item.value}
      </p>
    </div>
  );
}

export function BenefitWalletBoard({
  copy,
  items,
  isLoading = true,
}: BenefitWalletBoardProps): React.ReactElement {
  return (
    <section
      className="overflow-hidden rounded-[2rem] border border-blue-500/10 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-xl shadow-blue-500/5 dark:from-[#08111f] dark:via-[#080B15] dark:to-[#111827]"
      aria-label={copy.walletTitle}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {copy.walletTitle}
          </h2>
          <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
            {copy.walletSubtitle}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label={copy.walletSkeletonLabel}
          aria-busy="true"
        >
          <WalletSkeletonItem />
          <WalletSkeletonItem />
          <WalletSkeletonItem />
          <WalletSkeletonItem />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <WalletItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
