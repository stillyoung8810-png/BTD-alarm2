import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, X, Zap } from 'lucide-react';
import { CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
import { getTradeMessages } from '../constants/messages/tradeMessages';
import { getLatestLocalTradeDateFromDb } from '../services/stockService';
import type { AppLang, Portfolio, Trade } from '../types';
import { calculateHoldings } from '../utils/portfolioCalculations';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import {
  getHoldingQuantityForStock,
  getSellQuantityLimitViolation,
} from '../utils/tradeSellValidation';
import StockLogo from './StockLogo';
import {
  buildTradeFeePreview,
  calculateBudgetBuyQuantity,
  calculateMocSellQuantity,
  createTradeId,
  formatShareQuantity,
  formatTradeDateLabel,
  formatUsd,
  getTodayDateKey,
  parseTradeNumericInput,
  shouldWarnTradeBudgetExceeded,
} from '../src/utils/tradeModalCalculations';

const EMPTY_STOCK_BADGE = {
  gradient: 'linear-gradient(135deg, #2563eb, #1e40af)',
  label: 'STOCK',
};
const MAX_SHARE_DECIMAL_PLACES = 4;

interface QuickInputModalProps {
  lang: AppLang;
  portfolio: Portfolio;
  activeSection?: 1 | 2 | 3;
  onClose: () => void;
  onSave: (trade: Trade) => Promise<void> | void;
}

interface QuickInputModalViewProps {
  title: string;
  tradeType: Trade['type'];
  buyLabel: string;
  sellLabel: string;
  stockLabel: string;
  executionPriceLabel: string;
  quantityLabel: string;
  autoQuantityLabel: string;
  estimatedFeeLabel: string;
  totalSettlementLabel: string;
  latestTradeSummary: string | null;
  noticePrimary: string;
  noticeSecondary: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
  selectableStocks: string[];
  selectedStock: string;
  isSellMode: boolean;
  isMoc: boolean;
  priceRaw: string;
  quantityRaw: string;
  resolvedQuantityText: string;
  feeText: string;
  totalSettlementText: string;
  shouldShowQuantityInput: boolean;
  mocSellTitle: string;
  mocSellDescription: string;
  validationMessage: string | null;
  budgetWarningTitle: string | null;
  budgetWarningMessage: string | null;
  isSaveDisabled: boolean;
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
  onClose: () => void;
  onChangeTradeType: (nextType: Trade['type']) => void;
  onSelectStock: (stock: string) => void;
  onChangePrice: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onToggleMoc: () => void;
  onSave: () => Promise<void>;
}

function getUniqueStocks(stocks: string[]): string[] {
  return Array.from(
    new Set(stocks.map((stock) => stock.trim()).filter((stock) => stock !== '')),
  );
}

function getActiveSectionStock(
  portfolio: Portfolio,
  activeSection: 1 | 2 | 3,
): string {
  switch (activeSection) {
    case 1:
      return portfolio.strategy.ma1.stock;
    case 2:
      return portfolio.strategy.ma2.stock;
    case 3:
      return portfolio.strategy.ma3.stock;
    default: {
      const exhaustiveCheck: never = activeSection;
      return exhaustiveCheck;
    }
  }
}

function getSellableStocks(portfolio: Portfolio): string[] {
  return calculateHoldings(portfolio)
    .filter((holding) => holding.quantity > 0)
    .map((holding) => holding.stock);
}

export default function QuickInputModal({
  lang,
  portfolio,
  activeSection = 1,
  onClose,
  onSave,
}: QuickInputModalProps): React.ReactElement {
  const copy = getTradeMessages(lang);
  const isVrStrategy = portfolio.strategy.vrBand != null;
  const targetStockForDate =
    portfolio.strategy.multiSplit?.targetStock ??
    portfolio.strategy.noStopMultiSplit?.targetStock ??
    portfolio.strategy.ma0.stock;

  const sellableStocks = useMemo(() => getSellableStocks(portfolio), [portfolio]);
  const activeSectionStock = getActiveSectionStock(portfolio, activeSection);

  const [tradeType, setTradeType] = useState<Trade['type']>('buy');
  const [selectedStockRaw, setSelectedStockRaw] = useState('');
  const [priceRaw, setPriceRaw] = useState('');
  const [quantityRaw, setQuantityRaw] = useState('');
  const [isMoc, setIsMoc] = useState(false);
  const [latestTradeDate, setLatestTradeDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isExecutingTradeRef = useRef(false);

  let selectedStock = '';
  if (tradeType === 'buy') {
    selectedStock = activeSectionStock;
  } else if (sellableStocks.includes(selectedStockRaw)) {
    selectedStock = selectedStockRaw;
  } else {
    selectedStock = sellableStocks[0] ?? '';
  }

  const availableSellQuantity = useMemo(() => {
    if (tradeType !== 'sell' || selectedStock === '') {
      return 0;
    }
    return getHoldingQuantityForStock(portfolio.trades, selectedStock);
  }, [tradeType, selectedStock, portfolio.trades]);

  const price = parseTradeNumericInput(priceRaw);
  const manualQuantity = parseTradeNumericInput(quantityRaw);
  const mocQuantity = calculateMocSellQuantity(availableSellQuantity);
  const autoBuyQuantity =
    tradeType === 'buy' && !isVrStrategy
      ? calculateBudgetBuyQuantity({
          price,
          dailyBuyAmount: portfolio.dailyBuyAmount,
          feeRatePercent: portfolio.feeRate,
        })
      : 0;

  let resolvedQuantity = manualQuantity;
  if (tradeType === 'sell' && isMoc) {
    resolvedQuantity = mocQuantity;
  } else if (tradeType === 'buy' && !isVrStrategy) {
    resolvedQuantity = autoBuyQuantity;
  }

  const preview = buildTradeFeePreview({
    tradeType,
    price,
    quantity: resolvedQuantity,
    feeRatePercent: portfolio.feeRate,
  });
  const latestTradeDateResolved = latestTradeDate || getTodayDateKey();
  const shouldShowQuantityInput =
    tradeType === 'sell' || (tradeType === 'buy' && isVrStrategy);

  useEffect(() => {
    let isMounted = true;

    const loadLatestTradeDate = async (): Promise<void> => {
      try {
        const latest = await getLatestLocalTradeDateFromDb(targetStockForDate);
        if (!isMounted) {
          return;
        }
        if (latest != null && latest.trim() !== '') {
          setLatestTradeDate(latest);
          return;
        }
      } catch (error: unknown) {
        console.error('[QuickInputModal] latest trade date fetch failed', error);
      }

      if (isMounted) {
        setLatestTradeDate(getTodayDateKey());
      }
    };

    void loadLatestTradeDate();

    return () => {
      isMounted = false;
    };
  }, [targetStockForDate]);

  let validationMessage: string | null = null;
  if (tradeType === 'sell' && selectedStock === '') {
    validationMessage = copy.helper.noHoldings;
  } else if (!areStrictPositiveFiniteScalars(price)) {
    validationMessage = copy.helper.invalidPrice;
  } else if (tradeType === 'buy' && !isVrStrategy && resolvedQuantity === 0) {
    validationMessage = copy.helper.zeroQuantityBudgetLocked;
  } else if (!areStrictPositiveFiniteScalars(resolvedQuantity)) {
    validationMessage = copy.helper.invalidQuantity;
  } else if (tradeType === 'sell') {
    const sellLimitViolation = getSellQuantityLimitViolation({
      stock: selectedStock,
      availableQuantity: availableSellQuantity,
      requestedQuantity: resolvedQuantity,
    });

    if (sellLimitViolation != null) {
      validationMessage = copy.helper.sellQuantityExceedsHoldings(
        formatShareQuantity(
          sellLimitViolation.availableQuantity,
          MAX_SHARE_DECIMAL_PLACES,
        ),
        formatShareQuantity(
          sellLimitViolation.requestedQuantity,
          MAX_SHARE_DECIMAL_PLACES,
        ),
      );
    }
  }

  const shouldWarnBudget = shouldWarnTradeBudgetExceeded({
    tradeType,
    totalSettlement: preview.totalSettlement,
    dailyBuyAmount: portfolio.dailyBuyAmount,
  });
  const budgetWarningMessage = shouldWarnBudget
    ? copy.helper.budgetExceededDetail(
        formatUsd(portfolio.dailyBuyAmount),
        formatUsd(preview.totalSettlement),
      )
    : null;
  const isSaveDisabled = validationMessage != null || isSaving;

  const handleChangeTradeType = useCallback((nextType: Trade['type']): void => {
    setTradeType(nextType);
    setSelectedStockRaw('');
    if (nextType === 'buy') {
      setIsMoc(false);
    }
  }, []);

  const handleToggleMoc = useCallback((): void => {
    setIsMoc((previous) => !previous);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (isExecutingTradeRef.current || isSaveDisabled) {
      return;
    }

    const nextTrade: Trade = {
      id: createTradeId(),
      type: tradeType,
      stock: selectedStock,
      date: latestTradeDateResolved,
      price,
      quantity: resolvedQuantity,
      fee: preview.totalFee,
      isMOC: tradeType === 'sell' && isMoc ? true : undefined,
    };

    try {
      isExecutingTradeRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextTrade));
      onClose();
    } catch (error: unknown) {
      console.error('[QuickInputModal] save failed', error);
    } finally {
      isExecutingTradeRef.current = false;
      setIsSaving(false);
    }
  }, [
    isMoc,
    isSaveDisabled,
    latestTradeDateResolved,
    onClose,
    onSave,
    preview.totalFee,
    price,
    resolvedQuantity,
    selectedStock,
    tradeType,
  ]);

  return (
    <QuickInputModalView
      title={copy.title.quickInput}
      tradeType={tradeType}
      buyLabel={copy.action.buy}
      sellLabel={copy.action.sell}
      stockLabel={copy.field.stock}
      executionPriceLabel={copy.field.executionPrice}
      quantityLabel={copy.field.quantity}
      autoQuantityLabel={copy.field.autoQuantity}
      estimatedFeeLabel={copy.field.estimatedFee}
      totalSettlementLabel={copy.field.totalSettlement}
      latestTradeSummary={
        latestTradeDateResolved
          ? copy.helper.latestTradeDateSummary(
              formatTradeDateLabel(latestTradeDateResolved, lang),
            )
          : null
      }
      noticePrimary={
        tradeType === 'buy'
          ? copy.helper.activeSectionAutoSelect
          : copy.helper.holdingsSellOnly
      }
      noticeSecondary={copy.helper.feeRateApplied(portfolio.feeRate)}
      closeAriaLabel={copy.aria.closeModal}
      backdropAriaLabel={copy.aria.closeBackdrop}
      selectableStocks={
        tradeType === 'buy'
          ? getUniqueStocks([activeSectionStock])
          : sellableStocks
      }
      selectedStock={selectedStock}
      isSellMode={tradeType === 'sell'}
      isMoc={isMoc}
      priceRaw={priceRaw}
      quantityRaw={quantityRaw}
      resolvedQuantityText={formatShareQuantity(
        resolvedQuantity,
        Number.isInteger(resolvedQuantity) ? 0 : 1,
      )}
      feeText={formatUsd(preview.totalFee, 4)}
      totalSettlementText={formatUsd(preview.totalSettlement)}
      shouldShowQuantityInput={shouldShowQuantityInput}
      mocSellTitle={copy.helper.mocSellTitle}
      mocSellDescription={copy.helper.mocSellDescription}
      validationMessage={validationMessage}
      budgetWarningTitle={shouldWarnBudget ? copy.helper.budgetExceededTitle : null}
      budgetWarningMessage={budgetWarningMessage}
      isSaveDisabled={isSaveDisabled}
      isSaving={isSaving}
      saveLabel={isSaving ? copy.helper.executingTrade : copy.action.save}
      cancelLabel={copy.action.cancel}
      onClose={onClose}
      onChangeTradeType={handleChangeTradeType}
      onSelectStock={setSelectedStockRaw}
      onChangePrice={setPriceRaw}
      onChangeQuantity={setQuantityRaw}
      onToggleMoc={handleToggleMoc}
      onSave={handleSave}
    />
  );
}

const QuickInputModalView = React.memo(function QuickInputModalView({
  title,
  tradeType,
  buyLabel,
  sellLabel,
  stockLabel,
  executionPriceLabel,
  quantityLabel,
  autoQuantityLabel,
  estimatedFeeLabel,
  totalSettlementLabel,
  latestTradeSummary,
  noticePrimary,
  noticeSecondary,
  closeAriaLabel,
  backdropAriaLabel,
  selectableStocks,
  selectedStock,
  isSellMode,
  isMoc,
  priceRaw,
  quantityRaw,
  resolvedQuantityText,
  feeText,
  totalSettlementText,
  shouldShowQuantityInput,
  mocSellTitle,
  mocSellDescription,
  validationMessage,
  budgetWarningTitle,
  budgetWarningMessage,
  isSaveDisabled,
  isSaving,
  saveLabel,
  cancelLabel,
  onClose,
  onChangeTradeType,
  onSelectStock,
  onChangePrice,
  onChangeQuantity,
  onToggleMoc,
  onSave,
}: QuickInputModalViewProps): React.ReactElement {
  const handlePriceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangePrice(event.target.value);
    },
    [onChangePrice],
  );

  const handleQuantityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeQuantity(event.target.value);
    },
    [onChangeQuantity],
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={backdropAriaLabel}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />
      <div className="relative z-[121] flex w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg">
                <Zap size={20} className="fill-white text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-900">{title}</h2>
            </div>
            {latestTradeSummary != null ? (
              <p className="text-[10px] font-bold text-slate-500">
                {latestTradeSummary}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={closeAriaLabel}
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="shrink-0 text-amber-500" size={18} />
            <div className="text-[11px] font-bold leading-snug text-amber-700">
              <div>{noticePrimary}</div>
              <div className="opacity-80">{noticeSecondary}</div>
            </div>
          </div>

          <div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => onChangeTradeType('buy')}
              className={`flex-1 rounded-xl py-4 text-xs font-black ${
                tradeType === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {buyLabel}
            </button>
            <button
              type="button"
              onClick={() => onChangeTradeType('sell')}
              className={`flex-1 rounded-xl py-4 text-xs font-black ${
                tradeType === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {sellLabel}
            </button>
          </div>

          {isSellMode ? (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex-1">
                <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                  {mocSellTitle}
                </div>
                <div className="text-[11px] leading-relaxed text-slate-500">
                  {mocSellDescription}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleMoc}
                aria-pressed={isMoc}
                className={`relative h-6 w-12 rounded-full ${
                  isMoc ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    isMoc ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {stockLabel}
            </div>
            <div className="flex flex-wrap gap-4">
              {selectableStocks.map((ticker) => {
                const info = CUSTOM_GRADIENT_LOGOS[ticker] ?? EMPTY_STOCK_BADGE;
                const isSelected = selectedStock === ticker;
                return (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => onSelectStock(ticker)}
                    className={`relative flex h-14 w-14 flex-col items-center justify-center overflow-hidden rounded-2xl p-2 text-white ${
                      isSelected
                        ? 'scale-105 ring-2 ring-blue-500 ring-offset-2'
                        : 'opacity-60 grayscale'
                    }`}
                    style={{ background: info.gradient }}
                  >
                    <StockLogo
                      ticker={ticker}
                      size="full"
                      shape="squircle2"
                      paidAccent={PAID_STOCKS.includes(ticker)}
                      className="absolute inset-0"
                    />
                    <span className="z-10 text-[10px] font-black">{ticker}</span>
                    <span className="z-10 text-[5px] font-bold uppercase tracking-tight opacity-80">
                      {info.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {executionPriceLabel}
              </div>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={priceRaw}
                  onChange={handlePriceChange}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100/50 p-5 pl-10 text-lg font-black text-slate-900 outline-none"
                />
              </div>
            </div>

            {shouldShowQuantityInput ? (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {quantityLabel}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={quantityRaw}
                  onChange={handleQuantityChange}
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100/50 p-5 text-lg font-black text-slate-900 outline-none"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[11px] font-bold uppercase tracking-widest">
                {autoQuantityLabel}
              </span>
              <span className="text-lg font-black text-slate-900">
                {resolvedQuantityText}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[11px] font-bold uppercase tracking-widest">
                {estimatedFeeLabel}
              </span>
              <span className="text-sm font-black text-slate-900">{feeText}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-900">
                {totalSettlementLabel}
              </span>
              <span className="text-xl font-black text-blue-600">
                {totalSettlementText}
              </span>
            </div>
          </div>

          {validationMessage != null ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-600">
              {validationMessage}
            </div>
          ) : null}

          {budgetWarningTitle != null && budgetWarningMessage != null ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-1 text-sm font-black text-amber-700">
                {budgetWarningTitle}
              </div>
              <div className="text-sm font-medium text-amber-700">
                {budgetWarningMessage}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-4 border-t border-slate-200 bg-slate-50 p-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-100 py-4 font-black text-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void onSave();
            }}
            disabled={isSaveDisabled}
            aria-busy={isSaving}
            className="flex-[2] rounded-2xl bg-blue-600 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {saveLabel}
              <ChevronRight size={16} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
});

QuickInputModalView.displayName = 'QuickInputModalView';