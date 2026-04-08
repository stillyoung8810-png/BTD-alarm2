import React from 'react';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { PAID_STOCKS } from '@/constants';
import type { Trade } from '@/types';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import StockLogo from '@/components/StockLogo';
import { TdsConfirmDialog } from '@/components/tds-adapter/TdsConfirmDialog';
import type { UsePortfolioDetailsControllerResult } from './usePortfolioDetailsController';

interface PortfolioDetailsViewProps {
  portfolioName: string;
  controller: UsePortfolioDetailsControllerResult;
  onClose: () => void;
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatInteger(value: number): string {
  return value.toLocaleString();
}

function getTradeTypeLabel(
  trade: Trade,
  copy: UsePortfolioDetailsControllerResult['copy'],
): string {
  return trade.type === 'buy' ? copy.buyLabel : copy.sellLabel;
}

function getSettlementAmount(trade: Trade): number {
  const gross = trade.price * trade.quantity;
  if (trade.type === 'buy') {
    return gross + Math.abs(trade.fee);
  }

  return gross - Math.abs(trade.fee);
}

function renderStockIcon(
  ticker: string,
  size: 'sm' | 'md' = 'sm',
  index = 0,
): React.ReactElement {
  const sizeClassName = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const stackStyle =
    size === 'sm' && index > 0
      ? {
          marginLeft: '-1.2rem',
          zIndex: 10 + index,
          transform: `rotate(${index * 3}deg) translateY(${index}px)`,
        }
      : undefined;

  return (
    <div
      key={`${ticker}-${index}`}
      className={`relative ${sizeClassName} flex-shrink-0`}
      style={stackStyle}
    >
      <StockLogo
        ticker={ticker}
        size={size}
        shape="circle"
        paidAccent={PAID_STOCKS.includes(ticker)}
        showFallbackText
        className={`${sizeClassName} border border-white/20 shadow-lg`}
      />
    </div>
  );
}

export function PortfolioDetailsView({
  portfolioName,
  controller,
  onClose,
}: PortfolioDetailsViewProps): React.ReactElement {
  const year = controller.currentMonth.getFullYear();
  const month = controller.currentMonth.getMonth() + 1;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          role="button"
          tabIndex={0}
          aria-label={controller.copy.aria.closeBackdrop}
          onClick={onClose}
          onKeyDown={(event) => {
            handlePressEnterOrSpace(event, onClose);
          }}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-md dark:bg-slate-950/80"
        />
        <div
          className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-white/5 dark:bg-slate-900/30">
            <h2 className="flex items-center gap-2 text-2xl font-black text-slate-900 dark:text-white">
              <span>{portfolioName}</span>
              {controller.isReadOnly ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                  {controller.copy.settledBadge}
                </span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-3 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label={controller.copy.aria.closeModal}
            >
              <X size={24} />
            </button>
          </div>

          <div className="scrollbar-hide flex-1 space-y-8 overflow-y-auto overscroll-contain bg-slate-50 p-6 md:space-y-10 md:p-8 dark:bg-transparent">
            {!controller.isReadOnly ? (
              <section className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {controller.copy.holdingsSummaryTitle}
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {controller.holdingsSummary.length === 0 ? (
                    <div className="col-span-full rounded-[2rem] border border-slate-200 bg-slate-100 p-8 text-center dark:border-white/5 dark:bg-white/5">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">
                        {controller.copy.noHoldings}
                      </p>
                    </div>
                  ) : (
                    controller.holdingsSummary.map((holding) => (
                      <div
                        key={holding.ticker}
                        className="group relative flex items-center gap-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/40 dark:shadow-lg"
                      >
                        <div className="absolute left-0 top-0 h-full w-1.5 bg-blue-600" />
                        {renderStockIcon(holding.ticker, 'md')}
                        <div className="grid flex-1 grid-cols-2 gap-4">
                          <div>
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.quantity}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatInteger(holding.quantity)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.avgPrice}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(holding.avgPrice)}
                            </p>
                          </div>
                          <div className="col-span-2 border-t border-slate-200 pt-2 dark:border-white/5">
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.totalValuation}
                            </span>
                            <p className="text-base font-black text-emerald-500">
                              {formatCurrency(holding.valuation)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {controller.copy.weekdayCalendarTitle}
              </h3>
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-md backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/40 dark:shadow-inner">
                <div className="mb-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={controller.handlePrevMonth}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label={controller.copy.aria.previousMonth}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <h4 className="text-xl font-black uppercase tracking-widest text-slate-900 dark:text-white">
                    {controller.copy.monthTitle(year, month)}
                  </h4>
                  <button
                    type="button"
                    onClick={controller.handleNextMonth}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label={controller.copy.aria.nextMonth}
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-5">
                  {controller.copy.weekdayHeaders.map((weekday) => (
                    <div
                      key={weekday}
                      className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {controller.calendarGrid.map((cell) => {
                    if (cell.kind === 'empty') {
                      return (
                        <div
                          key={cell.key}
                          className="min-h-[120px] rounded-3xl bg-slate-100 opacity-20 dark:bg-white/5"
                        />
                      );
                    }

                    const dateKey = getDateKey(cell.date);
                    const allTradesForDate =
                      controller.getTradesForDate(dateKey);
                    const isSelected = controller.selectedDate === dateKey;

                    const buys = allTradesForDate.filter(
                      (trade) => trade.type === 'buy',
                    );
                    const sells = allTradesForDate.filter(
                      (trade) => trade.type === 'sell',
                    );

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => controller.handleSetSelectedDate(dateKey)}
                        aria-label={controller.copy.aria.selectDate(dateKey)}
                        className={`relative flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-3xl border p-3 transition-all ${
                          isSelected
                            ? 'z-10 scale-105 border-blue-500 bg-blue-50 shadow-xl dark:bg-blue-600/20'
                            : 'border-slate-200 bg-slate-50 shadow-sm hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                        }`}
                      >
                        <span
                          className={`text-[11px] font-black ${
                            isSelected ? 'text-blue-500' : 'text-slate-500'
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>

                        <div className="flex w-full flex-col items-center gap-2">
                          {buys.length > 0 ? (
                            <div className="flex w-full items-center justify-center">
                              {buys.map((trade, index) =>
                                renderStockIcon(trade.stock, 'sm', index),
                              )}
                            </div>
                          ) : null}
                          {sells.length > 0 ? (
                            <div className="flex w-full items-center justify-center">
                              {sells.map((trade, index) =>
                                renderStockIcon(trade.stock, 'sm', index),
                              )}
                            </div>
                          ) : null}
                          {allTradesForDate.length > 0 ? (
                            <div className="mt-1.5 flex gap-1.5">
                              {buys.length > 0 ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                              ) : null}
                              {sells.length > 0 ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {controller.copy.selectedDateTradesTitle}
              </h3>
              <div className="space-y-4">
                {controller.selectedDayTrades.length === 0 ? (
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-100 p-10 text-center backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">
                      {controller.copy.noTrades}
                    </p>
                  </div>
                ) : (
                  controller.selectedDayTrades.map((trade) => {
                    const isFinalSell =
                      trade.type === 'sell' &&
                      trade.id.startsWith('final-');
                    const tradeTypeLabel = getTradeTypeLabel(
                      trade,
                      controller.copy,
                    );

                    return (
                      <div
                        key={trade.id}
                        className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md transition-all backdrop-blur-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:shadow-lg dark:hover:bg-white/10"
                      >
                        <div
                          className={`absolute left-0 top-0 h-full w-1.5 ${
                            trade.type === 'buy'
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                          }`}
                        />

                        <div className="mb-6 flex items-center justify-between pr-12">
                          <div className="flex items-center gap-4">
                            {renderStockIcon(trade.stock, 'md')}
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                {isFinalSell ? (
                                  <span>
                                    [{controller.copy.finalSettlementSellPrefix}]{' '}
                                  </span>
                                ) : null}
                                {trade.stock}
                              </h4>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                {tradeTypeLabel}{' '}
                                {controller.copy.tradeExecutionSuffix}
                              </p>
                            </div>
                          </div>
                          <div
                            className={`rounded-full border px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${
                              trade.type === 'buy'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                                : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                            }`}
                          >
                            {tradeTypeLabel}
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.executionPrice}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(trade.price)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.quantity}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatInteger(trade.quantity)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.fee}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(Math.abs(trade.fee))}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.settlementAmount}
                            </span>
                            <p
                              className={`text-sm font-black ${
                                trade.type === 'buy'
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                              }`}
                            >
                              {formatCurrency(getSettlementAmount(trade))}
                            </p>
                          </div>
                        </div>

                        {!controller.isReadOnly ? (
                          <button
                            type="button"
                            onClick={() =>
                              controller.handleRequestDeleteTrade(trade.id)
                            }
                            aria-label={controller.copy.aria.openTradeDeleteDialog(
                              trade.stock,
                              controller.selectedDate,
                            )}
                            className="absolute right-6 top-6 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-rose-500 shadow-sm transition-all hover:bg-rose-600 hover:text-white"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="flex gap-4 border-t border-slate-200 bg-slate-50 p-8 dark:border-white/5 dark:bg-slate-900/30">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-slate-300 bg-slate-200 py-5 text-xs font-black uppercase tracking-widest text-slate-700 shadow-md transition-all hover:bg-slate-300 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              {controller.copy.closeAction}
            </button>
          </div>
        </div>
      </div>

      <TdsConfirmDialog
        {...controller.deleteDialogProps}
        labels={controller.labels}
      />
    </>
  );
}

export default PortfolioDetailsView;