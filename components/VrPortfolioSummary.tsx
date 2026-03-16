'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { AppLang, OrderLevel, VrBandStrategyParams, VrSnapshot } from '../types';
import { calculateMaxBuyStep, toDisplayNumber } from '../utils/vrBandStrategy';
import { VR_FALLBACK, VR_SUMMARY } from '../constants/vrMessages';
import VrBadge from './VrBadge';
import VrOrderModal from './VrOrderModal';

const SNAPSHOT_PENDING_TIMEOUT_MS = 15_000;

export interface VrPortfolioSummaryProps {
  vrSettings: VrBandStrategyParams;
  vrSnapshot: VrSnapshot | undefined;
  /** 명시적 에러: 스냅샷 생성 실패/동기화 오류 시 상위에서 true 전달 시 즉시 실패 UI 표시 */
  vrSnapshotError?: boolean;
  lang: AppLang;
}

export default function VrPortfolioSummary({
  vrSettings,
  vrSnapshot,
  vrSnapshotError = false,
  lang,
}: VrPortfolioSummaryProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingTimedOut, setPendingTimedOut] = useState(false);

  useEffect(() => {
    if (vrSnapshot != null || vrSnapshotError) {
      setPendingTimedOut(false);
      return;
    }
    const t = setTimeout(() => setPendingTimedOut(true), SNAPSHOT_PENDING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [vrSnapshot, vrSnapshotError]);

  if (vrSnapshot == null) {
    const isError = vrSnapshotError || pendingTimedOut;
    const message = VR_FALLBACK[lang][isError ? 'error' : 'pending'];
    return (
      <div
        className={`mt-3 px-1 text-sm ${isError ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {message}
      </div>
    );
  }

  const stepZeroRow: OrderLevel = useMemo(
    () => ({
      step: 0,
      price: 0,
      qty: 0,
      isBuffer: false,
      sharesAfter: vrSnapshot.shares,
      poolAfter: vrSnapshot.pool,
    }),
    [vrSnapshot.shares, vrSnapshot.pool]
  );

  const safeBuyOrders = useMemo(
    () => [stepZeroRow, ...(vrSnapshot.buyOrders ?? [])],
    [stepZeroRow, vrSnapshot.buyOrders]
  );

  const safeSellOrders = useMemo(
    () => [stepZeroRow, ...(vrSnapshot.sellOrders ?? [])],
    [stepZeroRow, vrSnapshot.sellOrders]
  );

  const currentV = toDisplayNumber(vrSnapshot.currentV);
  const pool = toDisplayNumber(vrSnapshot.pool);
  const bandLow = toDisplayNumber(vrSnapshot.bandLow);
  const bandHigh = toDisplayNumber(vrSnapshot.bandHigh);
  const maxBuyStep = calculateMaxBuyStep(vrSnapshot.buyOrders ?? []);

  const formatCurrency = (val: number | null) =>
    val === null ? '-' : `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <VrBadge mode={vrSettings.vrMode} lang={lang} />
      </div>
      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 space-y-0.5">
        <div>V: {formatCurrency(currentV)}</div>
        <div>Pool: {formatCurrency(pool)}</div>
        <div>밴드: {bandLow === null || bandHigh === null ? '-' : `${bandLow.toFixed(2)} ~ ${bandHigh.toFixed(2)}`}</div>
      </div>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="w-full py-2.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
      >
        {VR_SUMMARY[lang].viewOrderTable}
      </button>
      {maxBuyStep > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {VR_SUMMARY[lang].maxBuyHint(maxBuyStep)}
        </p>
      )}
      <VrOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        buyOrders={safeBuyOrders}
        sellOrders={safeSellOrders}
        lang={lang}
      />
    </div>
  );
}
