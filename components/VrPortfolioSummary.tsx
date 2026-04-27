'use client';

import React, { useMemo } from 'react';
import type { AppLang, VrBandStrategyParams, VrSnapshot } from '../types';
import { calculateMaxBuyStep, formatCurrency } from '../utils/vrBandStrategy';
import { VR_SUMMARY, VR_DASHBOARD_HINT } from '../constants/vrMessages';

export interface VrPortfolioSummaryProps {
  vrSettings: VrBandStrategyParams;
  vrSnapshot: VrSnapshot | undefined;
  lang: AppLang;
  hasEverBought?: boolean;
}

export default function VrPortfolioSummary({
  vrSettings,
  vrSnapshot,
  lang,
  hasEverBought = false,
}: VrPortfolioSummaryProps) {
  const hasSnapshot = vrSnapshot != null;

  const maxBuyStep = useMemo(() => {
    if (!vrSnapshot) return 0;
    return calculateMaxBuyStep(vrSnapshot.buyOrders ?? []);
  }, [vrSnapshot]);

  if (!hasSnapshot || !vrSnapshot) {
    return (
      <div role="status" className="text-sm text-blue-700 dark:text-blue-300">
        {VR_DASHBOARD_HINT[lang].pending}
      </div>
    );
  }

  const isFlatPosition = vrSnapshot.shares <= 0;

  return (
    <div className="space-y-2" role="region" aria-label={lang === 'ko' ? '전략 요약' : 'Strategy Summary'}>
      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 space-y-0.5">
        <div>T: {formatCurrency(vrSnapshot.currentV)}</div>
        <div>Cash: {formatCurrency(vrSnapshot.pool)}</div>
        <div>
          {lang === 'ko' ? '밴드' : 'Band'}: {formatCurrency(vrSnapshot.bandLow)} ~ {formatCurrency(vrSnapshot.bandHigh)}
        </div>
      </div>
      {isFlatPosition && (
        <p className="text-sm text-blue-700 dark:text-blue-300" role="status">
          {hasEverBought
            ? VR_DASHBOARD_HINT[lang].soldOutWaiting
            : VR_DASHBOARD_HINT[lang].firstBuyPrompt}
        </p>
      )}
      {!isFlatPosition && maxBuyStep > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {VR_SUMMARY[lang].maxBuyHint(maxBuyStep)}
        </p>
      )}
    </div>
  );
}
