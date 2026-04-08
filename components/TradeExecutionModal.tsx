import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
import {
  getTradeMessages,
  type TradeMessageSet,
} from '../constants/messages/tradeMessages';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import type { AppLang, Portfolio, Trade } from '../types';
import { calculateHoldings } from '../utils/portfolioCalculations';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import StockLogo from './StockLogo';
import {
  buildTradeFeePreview,
  buildTradeSettlementPreview,
  createTradeId,
  dateKeyToLocalDate,
  formatCalendarMonthLabel,
  formatShareQuantity,
  formatTradeDateLabel,
  formatUsd,
  getMonthStartDateKey,
  getTodayDateKey,
  parseTradeNumericInput,
  shiftMonthDateKey,
  shouldWarnTradeBudgetExceeded,
} from '../src/utils/tradeModalCalculations';

const EMPTY_STOCK_BADGE = {
  gradient: 'linear-gradient(135deg, #2563eb, #1e40af)',
  label: 'STOCK',
};

interface TradeExecutionModalProps {
  lang: AppLang;
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (trade: Trade) => Promise<void> | void;
}

interface TradeExecutionModalViewProps {
  lang: AppLang;
  title: string;
  tradeType: Trade['type'];
  buyLabel: string;
  sellLabel: string;
  stockLabel: string;
  buyDateLabel: string;
  sellDateLabel: string;
  executionPriceLabel: string;
  quantityLabel: string;
  estimatedFeeLabel: string;
  finalFeeLabel: string;
  totalSettlementLabel: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
  openCalendarAriaLabel: string;
  previousMonthAriaLabel: string;
  nextMonthAriaLabel: string;
  calendarWeekdays: string[];
  selectableStocks: string[];
  selectedStock: string;
  date: string;
  formattedDateLabel: string;
  calendarMonthKey: string;
  formattedCalendarMonthLabel: string;
  isCalendarOpen: boolean;
  priceRaw: string;
  quantityRaw: string;
  feeOverrideRaw: string;
  isMoc: boolean;
  isNoStopMultiSplit: boolean;
  noStopGuideTitle: string;
  noStopGuideLines: string[];
  mocSellTitle: string;
  mocSellDescription: string;
  feePreviewText: string;
  resolvedFeeText: string;
  totalSettlementText: string;
  validationMessage: string | null;
  budgetWarningTitle: string | null;
  budgetWarningMessage: string | null;
  confirmMessage: string;
  manualFeeOverrideHint: string;
  isSaveDisabled: boolean;
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
  onClose: () => void;
  onChangeTradeType: (nextType: Trade['type']) => void;
  onSelectStock: (stock: string) => void;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onSelectDate: (dateKey: string) => void;
  onMoveCalendarMonth: (delta: number) => void;
  onChangePrice: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onChangeFeeOverride: (value: string) => void;
  onToggleMoc: () => void;
  onSave: () => Promise<void>;
}

function getUniqueStocks(stocks: string[]): string[] {
  return Array.from(
    new Set(stocks.map((stock) => stock.trim()).filter((stock) => stock !== '')),
  );
}

function getTradeExecutionBuyStocks(portfolio: Portfolio): string[] {
  if (portfolio.strategy.noStopMultiSplit != null) {
    return getUniqueStocks([portfolio.strategy.noStopMultiSplit.targetStock]);
  }

  return getUniqueStocks([
    portfolio.strategy.ma1.stock,
    portfolio.strategy.ma2.stock,
    portfolio.strategy.ma3.stock,
  ]);
}

function getSellableStocks(portfolio: Portfolio): string[] {
  return calculateHoldings(portfolio)
    .filter((holding) => holding.quantity > 0)
    .map((holding) => holding.stock);
}

function buildCalendarDayKeys(monthKey: string): Array<string | null> {
  const monthDate = dateKeyToLocalDate(monthKey);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Array<string | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dayDate = new Date(year, month, day);
    const dayYear = dayDate.getFullYear();
    const dayMonth = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dayNumber = String(dayDate.getDate()).padStart(2, '0');
    days.push(`${dayYear}-${dayMonth}-${dayNumber}`);
  }

  return days;
}

function buildNoStopGuideLines(
  copy: TradeMessageSet,
  executionData: ReturnType<typeof useNoStopMultiSplitExecution>['executionData'],
  takeProfitPct: number,
): string[] {
  if (executionData == null) {
    return [];
  }

  if (executionData.isFirstBuy) {
    return [copy.helper.noStopFirstBuyHint];
  }

  const lines: string[] = [];

  if (executionData.lowLoc != null) {
    lines.push(
      `${copy.helper.lowLoc}: ${formatUsd(executionData.lowLoc.price)} / ${formatShareQuantity(executionData.lowLoc.quantity)}${copy.helper.sharesUnit}`,
    );
  }

  if (executionData.highLoc != null) {
    lines.push(
      `${copy.helper.highLoc}: ${formatUsd(executionData.highLoc.price)} / ${formatShareQuantity(executionData.highLoc.quantity)}${copy.helper.sharesUnit}`,
    );
    lines.push(copy.helper.noStopGuaranteedDailyFill);
  }

  if (executionData.isSplitComplete) {
    lines.push(copy.helper.noStopSplitComplete);
  }

  if (executionData.takeProfit != null) {
    lines.push(copy.helper.noStopTakeProfitTarget(takeProfitPct));
  }

  return lines;
}

export default function TradeExecutionModal({
  lang,
  portfolio,
  onClose,
  onSave,
}: TradeExecutionModalProps): React.ReactElement {
  const copy = getTradeMessages(lang);
  const noStopExecution = useNoStopMultiSplitExecution(portfolio, lang);

  const buyStocks = useMemo(() => getTradeExecutionBuyStocks(portfolio), [portfolio]);
  const sellableStocks = useMemo(() => getSellableStocks(portfolio), [portfolio]);
  const isNoStopMultiSplit = portfolio.strategy.noStopMultiSplit != null;
  const takeProfitPct = portfolio.strategy.noStopMultiSplit?.takeProfitPct ?? 0;

  const [tradeType, setTradeType] = useState<Trade['type']>('buy');
  const [selectedStockRaw, setSelectedStockRaw] = useState('');
  const [date, setDate] = useState<string>(getTodayDateKey());
  const [calendarMonthKey, setCalendarMonthKey] = useState<string>(
    getMonthStartDateKey(getTodayDateKey()),
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [priceRaw, setPriceRaw] = useState('');
  const [quantityRaw, setQuantityRaw] = useState('');
  const [feeOverrideRaw, setFeeOverrideRaw] = useState('');
  const [isMoc, setIsMoc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isExecutingTradeRef = useRef(false);

  const selectableStocks = tradeType === 'buy' ? buyStocks : sellableStocks;
  const selectedStock = selectableStocks.includes(selectedStockRaw)
    ? selectedStockRaw
    : (selectableStocks[0] ?? '');

  const price = parseTradeNumericInput(priceRaw);
  const quantity = parseTradeNumericInput(quantityRaw);
  const feePreview = buildTradeFeePreview({
    tradeType,
    price,
    quantity,
    feeRatePercent: portfolio.feeRate,
  });
  const hasManualFeeOverride = feeOverrideRaw.trim() !== '';
  const resolvedFee = hasManualFeeOverride
    ? parseTradeNumericInput(feeOverrideRaw)
    : feePreview.totalFee;
  const totalSettlement = buildTradeSettlementPreview({
    tradeType,
    price,
    quantity,
    fee: resolvedFee,
  });

  const noStopGuideLines = useMemo(
    () => buildNoStopGuideLines(copy, noStopExecution.executionData, takeProfitPct),
    [copy, noStopExecution.executionData, takeProfitPct],
  );

  let validationMessage: string | null = null;
  if (selectedStock === '') {
    if (tradeType === 'sell') {
      validationMessage = copy.helper.noHoldings;
    } else {
      validationMessage = copy.helper.chooseStockFirst;
    }
  } else if (!areStrictPositiveFiniteScalars(price)) {
    validationMessage = copy.helper.invalidPrice;
  } else if (!areStrictPositiveFiniteScalars(quantity)) {
    validationMessage = copy.helper.invalidQuantity;
  }

  const shouldWarnBudget = shouldWarnTradeBudgetExceeded({
    tradeType,
    totalSettlement,
    dailyBuyAmount: portfolio.dailyBuyAmount,
  });
  const budgetWarningMessage = shouldWarnBudget
    ? copy.helper.budgetExceededDetail(
        formatUsd(portfolio.dailyBuyAmount),
        formatUsd(totalSettlement),
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

  const handleToggleCalendar = useCallback((): void => {
    setCalendarMonthKey(getMonthStartDateKey(date));
    setIsCalendarOpen((previous) => !previous);
  }, [date]);

  const handleCloseCalendar = useCallback((): void => {
    setIsCalendarOpen(false);
  }, []);

  const handleSelectDate = useCallback((nextDate: string): void => {
    setDate(nextDate);
    setCalendarMonthKey(getMonthStartDateKey(nextDate));
    setIsCalendarOpen(false);
  }, []);

  const handleMoveCalendarMonth = useCallback((delta: number): void => {
    setCalendarMonthKey((previous) => shiftMonthDateKey(previous, delta));
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
      date,
      price,
      quantity,
      fee: resolvedFee,
      isMOC: tradeType === 'sell' && isMoc ? true : undefined,
    };

    try {
      isExecutingTradeRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextTrade));
      onClose();
    } catch (error: unknown) {
      console.error('[TradeExecutionModal] save failed', error);
    } finally {
      isExecutingTradeRef.current = false;
      setIsSaving(false);
    }
  }, [
    date,
    isMoc,
    isSaveDisabled,
    onClose,
    onSave,
    price,
    quantity,
    resolvedFee,
    selectedStock,
    tradeType,
  ]);

  return (
    <TradeExecutionModalView
      lang={lang}
      title={copy.title.tradeExecution}
      tradeType={tradeType}
      buyLabel={copy.action.buy}
      sellLabel={copy.action.sell}
      stockLabel={copy.field.stock}
      buyDateLabel={copy.field.buyDate}
      sellDateLabel={copy.field.sellDate}
      executionPriceLabel={copy.field.executionPrice}
      quantityLabel={copy.field.quantity}
      estimatedFeeLabel={copy.field.estimatedFee}
      finalFeeLabel={copy.field.finalFee}
      totalSettlementLabel={copy.field.totalSettlement}
      closeAriaLabel={copy.aria.closeModal}
      backdropAriaLabel={copy.aria.closeBackdrop}
      openCalendarAriaLabel={copy.aria.openCalendar}
      previousMonthAriaLabel={copy.aria.previousMonth}
      nextMonthAriaLabel={copy.aria.nextMonth}
      calendarWeekdays={copy.calendar.weekdays}
      selectableStocks={selectableStocks}
      selectedStock={selectedStock}
      date={date}
      formattedDateLabel={formatTradeDateLabel(date, lang)}
      calendarMonthKey={calendarMonthKey}
      formattedCalendarMonthLabel={formatCalendarMonthLabel(calendarMonthKey, lang)}
      isCalendarOpen={isCalendarOpen}
      priceRaw={priceRaw}
      quantityRaw={quantityRaw}
      feeOverrideRaw={feeOverrideRaw}
      isMoc={isMoc}
      isNoStopMultiSplit={isNoStopMultiSplit}
      noStopGuideTitle={copy.helper.noStopGuideTitle}
      noStopGuideLines={noStopGuideLines}
      mocSellTitle={copy.helper.mocSellTitle}
      mocSellDescription={copy.helper.mocSellDescription}
      feePreviewText={formatUsd(feePreview.totalFee, 4)}
      resolvedFeeText={formatUsd(resolvedFee, 4)}
      totalSettlementText={formatUsd(totalSettlement)}
      validationMessage={validationMessage}
      budgetWarningTitle={shouldWarnBudget ? copy.helper.budgetExceededTitle : null}
      budgetWarningMessage={budgetWarningMessage}
      confirmMessage={copy.helper.confirmBeforeSave}
      manualFeeOverrideHint={copy.helper.manualFeeOverrideHint}
      isSaveDisabled={isSaveDisabled}
      isSaving={isSaving}
      saveLabel={isSaving ? copy.helper.executingTrade : copy.action.save}
      cancelLabel={copy.action.cancel}
      onClose={onClose}
      onChangeTradeType={handleChangeTradeType}
      onSelectStock={setSelectedStockRaw}
      onToggleCalendar={handleToggleCalendar}
      onCloseCalendar={handleCloseCalendar}
      onSelectDate={handleSelectDate}
      onMoveCalendarMonth={handleMoveCalendarMonth}
      onChangePrice={setPriceRaw}
      onChangeQuantity={setQuantityRaw}
      onChangeFeeOverride={setFeeOverrideRaw}
      onToggleMoc={handleToggleMoc}
      onSave={handleSave}
    />
  );
}

const TradeExecutionModalView = React.memo(function TradeExecutionModalView({
  title,
  tradeType,
  buyLabel,
  sellLabel,
  stockLabel,
  buyDateLabel,
  sellDateLabel,
  executionPriceLabel,
  quantityLabel,
  estimatedFeeLabel,
  finalFeeLabel,
  totalSettlementLabel,
  closeAriaLabel,
  backdropAriaLabel,
  openCalendarAriaLabel,
  previousMonthAriaLabel,
  nextMonthAriaLabel,
  calendarWeekdays,
  selectableStocks,
  selectedStock,
  date,
  formattedDateLabel,
  calendarMonthKey,
  formattedCalendarMonthLabel,
  isCalendarOpen,
  priceRaw,
  quantityRaw,
  feeOverrideRaw,
  isMoc,
  isNoStopMultiSplit,
  noStopGuideTitle,
  noStopGuideLines,
  mocSellTitle,
  mocSellDescription,
  feePreviewText,
  resolvedFeeText,
  totalSettlementText,
  validationMessage,
  budgetWarningTitle,
  budgetWarningMessage,
  confirmMessage,
  manualFeeOverrideHint,
  isSaveDisabled,
  isSaving,
  saveLabel,
  cancelLabel,
  onClose,
  onChangeTradeType,
  onSelectStock,
  onToggleCalendar,
  onCloseCalendar,
  onSelectDate,
  onMoveCalendarMonth,
  onChangePrice,
  onChangeQuantity,
  onChangeFeeOverride,
  onToggleMoc,
  onSave,
}: TradeExecutionModalViewProps): React.ReactElement {
  const calendarDayKeys = useMemo(
    () => buildCalendarDayKeys(calendarMonthKey),
    [calendarMonthKey],
  );

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

  const handleFeeOverrideChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeFeeOverride(event.target.value);
    },
    [onChangeFeeOverride],
  );

  const dateLabel = tradeType === 'buy' ? buyDateLabel : sellDateLabel;
  const shouldShowMocToggle = tradeType === 'sell' && !isNoStopMultiSplit;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={backdropAriaLabel}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />
      <div className="relative z-[121] flex w-full max-w-2xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label={closeAriaLabel}
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex rounded-[1.5rem] border border-slate-200 bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => onChangeTradeType('buy')}
              className={`flex-1 rounded-2xl py-4 text-xs font-black ${
                tradeType === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {buyLabel}
            </button>
            <button
              type="button"
              onClick={() => onChangeTradeType('sell')}
              className={`flex-1 rounded-2xl py-4 text-xs font-black ${
                tradeType === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {sellLabel}
            </button>
          </div>

          {shouldShowMocToggle ? (
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

          {isNoStopMultiSplit && noStopGuideLines.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-600">
                {noStopGuideTitle}
              </div>
              <div className="space-y-2 text-sm font-bold text-slate-800">
                {noStopGuideLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
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
                    className={`relative flex h-16 w-16 flex-col items-center justify-center overflow-hidden rounded-2xl p-2 text-white ${
                      isSelected
                        ? 'scale-105 ring-2 ring-blue-500 ring-offset-2'
                        : 'opacity-50 grayscale'
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

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {dateLabel}
            </div>
            <div className="relative">
              <Calendar
                className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-slate-500"
                size={20}
              />
              <button
                type="button"
                aria-label={openCalendarAriaLabel}
                onClick={onToggleCalendar}
                className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-16 text-left font-bold text-slate-900"
              >
                {formattedDateLabel}
              </button>
              {isCalendarOpen ? (
                <>
                  <button
                    type="button"
                    aria-label={backdropAriaLabel}
                    onClick={onCloseCalendar}
                    className="fixed inset-0 z-[121]"
                  />
                  <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-[122] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                      <button
                        type="button"
                        aria-label={previousMonthAriaLabel}
                        onClick={() => onMoveCalendarMonth(-1)}
                        className="rounded-full p-2 text-blue-500"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div className="text-lg font-black text-slate-900">
                        {formattedCalendarMonthLabel}
                      </div>
                      <button
                        type="button"
                        aria-label={nextMonthAriaLabel}
                        onClick={() => onMoveCalendarMonth(1)}
                        className="rounded-full p-2 text-blue-500"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 px-4 pt-4 pb-2">
                      {calendarWeekdays.map((weekday) => (
                        <div
                          key={weekday}
                          className="flex h-8 items-center justify-center text-xs font-bold text-slate-400"
                        >
                          {weekday}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 px-4 pb-4">
                      {calendarDayKeys.map((dayKey, index) => {
                        if (dayKey == null) {
                          return <div key={`empty-${index}`} className="h-12" />;
                        }

                        const dayDate = dateKeyToLocalDate(dayKey);
                        const isWeekend =
                          dayDate.getDay() === 0 || dayDate.getDay() === 6;
                        const isSelected = dayKey === date;

                        if (isWeekend) {
                          return (
                            <div
                              key={dayKey}
                              aria-disabled="true"
                              className="flex h-12 items-center justify-center text-gray-300 opacity-30"
                            >
                              {dayDate.getDate()}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => onSelectDate(dayKey)}
                            className={`flex h-12 items-center justify-center rounded-full text-lg font-medium ${
                              isSelected ? 'bg-blue-500 text-white' : 'text-slate-900'
                            }`}
                          >
                            {dayDate.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {executionPriceLabel}
              </div>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={priceRaw}
                  onChange={handlePriceChange}
                  placeholder="0.00"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-12 text-xl font-black text-slate-900 outline-none"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {quantityLabel}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={quantityRaw}
                onChange={handleQuantityChange}
                placeholder="0"
                className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 text-xl font-black text-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {estimatedFeeLabel}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-xl font-black text-slate-900">
                {feePreviewText}
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {finalFeeLabel}
              </div>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={feeOverrideRaw}
                  onChange={handleFeeOverrideChange}
                  placeholder={resolvedFeeText.replace('$', '')}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-12 text-xl font-black text-slate-900 outline-none"
                />
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                {manualFeeOverrideHint}
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                {totalSettlementLabel}
              </span>
              <span className="text-2xl font-black text-blue-600">
                {totalSettlementText}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500">{confirmMessage}</p>
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
            className="rounded-2xl border border-slate-200 px-6 py-4 font-black text-slate-600"
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
            className="flex-1 rounded-2xl bg-blue-600 px-6 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

TradeExecutionModalView.displayName = 'TradeExecutionModalView';