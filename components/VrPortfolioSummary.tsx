'use client';

import React, { useMemo } from 'react';
import type { AppLang, OrderLevel, VrBandStrategyParams, VrSnapshot } from '../types';
import { calculateMaxBuyStep, toDisplayNumber } from '../utils/vrBandStrategy';
import { VR_SUMMARY, VR_DASHBOARD_HINT } from '../constants/vrMessages';

export interface VrPortfolioSummaryProps {
  vrSettings: VrBandStrategyParams;
  vrSnapshot: VrSnapshot | undefined;
  lang: AppLang;
}

export default function VrPortfolioSummary({
  vrSettings,
  vrSnapshot,
  lang,
}: VrPortfolioSummaryProps) {
  const hasSnapshot = vrSnapshot != null;

  const stepZeroRow: OrderLevel | null = useMemo(
    () =>
      hasSnapshot
        ? {
            step: 0,
            price: 0,
            qty: 0,
            isBuffer: false,
            sharesAfter: vrSnapshot!.shares,
            poolAfter: vrSnapshot!.pool,
          }
        : null,
    [hasSnapshot, vrSnapshot?.shares, vrSnapshot?.pool]
  );

  const safeBuyOrders = useMemo(
    () => (stepZeroRow && vrSnapshot ? [stepZeroRow, ...(vrSnapshot.buyOrders ?? [])] : []),
    [stepZeroRow, vrSnapshot]
  );

  const safeSellOrders = useMemo(
    () => (stepZeroRow && vrSnapshot ? [stepZeroRow, ...(vrSnapshot.sellOrders ?? [])] : []),
    [stepZeroRow, vrSnapshot]
  );

  const currentV = hasSnapshot ? toDisplayNumber(vrSnapshot!.currentV) : toDisplayNumber(vrSettings.initialV);
  const poolBase = hasSnapshot ? vrSnapshot!.pool : vrSettings.initialCapital;
  const pool = toDisplayNumber(poolBase);
  const bandLowSource = hasSnapshot ? vrSnapshot!.bandLow : vrSettings.initialV * (1 - vrSettings.bandRateLower);
  const bandHighSource = hasSnapshot ? vrSnapshot!.bandHigh : vrSettings.initialV * (1 + vrSettings.bandRateUpper);
  const bandLow = toDisplayNumber(bandLowSource);
  const bandHigh = toDisplayNumber(bandHighSource);
  const maxBuyStep = hasSnapshot ? calculateMaxBuyStep(vrSnapshot!.buyOrders ?? []) : 0;

  const formatCurrency = (val: number | null) =>
    val === null ? '-' : `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (!hasSnapshot) {
    return (
      <div role="status" className="text-sm text-blue-700 dark:text-blue-300">
        {VR_DASHBOARD_HINT[lang].pending}
      </div>
    );
  }

  return (
    <div className="space-y-2" role="region" aria-label={lang === 'ko' ? 'VR 전략 요약' : 'VR Strategy Summary'}>
      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 space-y-0.5">
        <div>V: {formatCurrency(currentV)}</div>
        <div>Pool: {formatCurrency(pool)}</div>
        <div>
          {lang === 'ko' ? '밴드' : 'Band'}:{' '}
          {bandLow === null || bandHigh === null ? '-' : `${bandLow.toFixed(2)} ~ ${bandHigh.toFixed(2)}`}
        </div>
      </div>
      {maxBuyStep > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {VR_SUMMARY[lang].maxBuyHint(maxBuyStep)}
        </p>
      )}
    </div>
  );
}
