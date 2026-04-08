import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio, Trade } from '@/types';
import { fetchStockPrices } from '@/services/stockService';
import { calculateHoldings } from '@/utils/portfolioCalculations';
import {
  getPortfolioDetailsMessages,
  type PortfolioDetailsMessageSet,
} from '@/constants/messages/portfolioDetailsMessages';
import { useAsyncTdsConfirm } from '@/components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '@/constants/tdsDialogMessages';

/** USD 등 2소수 화폐 스칼라 — Rule 1: EPSILON 포함 센트 반올림 */
const MONEY_DECIMAL_SCALE = 100;

function roundMoneyScalar2(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_DECIMAL_SCALE) / MONEY_DECIMAL_SCALE;
}

type CalendarCell =
  | { key: string; kind: 'empty' }
  | { key: string; kind: 'date'; date: Date };

interface HoldingSummaryItem {
  ticker: string;
  quantity: number;
  avgPrice: number;
  valuation: number;
}

interface UsePortfolioDetailsControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  isHistory?: boolean;
  onDeleteTrade: (tradeId: string) => void | Promise<void>;
}

export interface UsePortfolioDetailsControllerResult {
  copy: PortfolioDetailsMessageSet;
  labels: (typeof TDS_DIALOG_MESSAGES)['ko']['actions'];
  deleteDialogProps: ReturnType<typeof useAsyncTdsConfirm>['dialogProps'];
  isReadOnly: boolean;
  selectedDate: string;
  currentMonth: Date;
  calendarGrid: CalendarCell[];
  holdingsSummary: HoldingSummaryItem[];
  selectedDayTrades: Trade[];
  getTradesForDate: (date: string) => Trade[];
  handleSetSelectedDate: (date: string) => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  handleRequestDeleteTrade: (tradeId: string) => void;
}

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCalendarGrid(currentMonth: Date): CalendarCell[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay();
  const leadingEmptyCount =
    firstWeekday >= 1 && firstWeekday <= 5 ? firstWeekday - 1 : 0;

  const cells: CalendarCell[] = [];
  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push({
      key: `empty-${year}-${month}-${index}`,
      kind: 'empty',
    });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    cells.push({
      key: getDateKey(date),
      kind: 'date',
      date,
    });
  }

  return cells;
}

export function usePortfolioDetailsController({
  lang,
  portfolio,
  isHistory,
  onDeleteTrade,
}: UsePortfolioDetailsControllerParams): UsePortfolioDetailsControllerResult {
  const copy = getPortfolioDetailsMessages(lang);
  const labels = (TDS_DIALOG_MESSAGES[lang] ?? TDS_DIALOG_MESSAGES.ko).actions;
  const deleteDialog = useAsyncTdsConfirm(lang);
  const [selectedDate, setSelectedDate] = useState(() => getDateKey(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});

  const isReadOnly = isHistory ?? Boolean(portfolio.isClosed);

  const holdings = useMemo(() => {
    if (isReadOnly) {
      return [];
    }
    return calculateHoldings(portfolio);
  }, [isReadOnly, portfolio]);

  useEffect(() => {
    if (isReadOnly || holdings.length === 0) {
      setStockPrices({});
      return;
    }

    let isCancelled = false;

    fetchStockPrices(holdings.map((holding) => holding.stock))
      .then((prices) => {
        if (isCancelled) {
          return;
        }

        const nextPrices = Object.fromEntries(
          Object.entries(prices).map(([ticker, data]) => [ticker, data.price]),
        );
        setStockPrices(nextPrices);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch stock prices', error);
        setStockPrices({});
      });

    return () => {
      isCancelled = true;
    };
  }, [holdings, isReadOnly]);

  // Rule 1 & 6: calculateHoldings가 이미 종목별 가중 평균 단가를 반환하므로 reduce로 다시 합치지 않는다.
  // 잘못된 avgPrice 덮어쓰기는 금융 수학 파괴. O(N) map 한 번만 허용.
  // §0.6: valuation = 시가 우선 — unitPrice = stockPrices[ticker] ?? avgPrice (제품 정책).
  // Rule 1: avgPrice·valuation 등 화폐 스칼라는 EPSILON 포함 2소수 반올림. quantity는 정수 주만 가정 → 별도 반올림 생략.
  const holdingsSummary = useMemo(() => {
    if (isReadOnly || holdings.length === 0) {
      return [];
    }

    return holdings.map((holding) => {
      const unitPrice = stockPrices[holding.stock] ?? holding.avgPrice;
      const rawValuation = holding.quantity * unitPrice;

      return {
        ticker: holding.stock,
        quantity: holding.quantity,
        avgPrice: roundMoneyScalar2(holding.avgPrice),
        valuation: roundMoneyScalar2(rawValuation),
      };
    });
  }, [holdings, isReadOnly, stockPrices]);

  const tradesByDate = useMemo(() => {
    return portfolio.trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const currentTrades = acc[trade.date] ?? [];
      currentTrades.push(trade);
      acc[trade.date] = currentTrades;
      return acc;
    }, {});
  }, [portfolio.trades]);

  const selectedDayTrades = tradesByDate[selectedDate] ?? [];
  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const getTradesForDate = useCallback(
    (date: string) => tradesByDate[date] ?? [],
    [tradesByDate],
  );

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
    );
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
    );
  }, []);

  const handleRequestDeleteTrade = useCallback(
    (tradeId: string) => {
      deleteDialog.open({
        title: copy.deleteTradeDialog.title,
        body: copy.deleteTradeDialog.body,
        confirmLabel: copy.deleteTradeDialog.confirm,
        tone: 'danger',
        action: () => onDeleteTrade(tradeId),
      });
    },
    [copy.deleteTradeDialog, deleteDialog, onDeleteTrade],
  );

  return {
    copy,
    labels,
    deleteDialogProps: deleteDialog.dialogProps,
    isReadOnly,
    selectedDate,
    currentMonth,
    calendarGrid,
    holdingsSummary,
    selectedDayTrades,
    getTradesForDate,
    handleSetSelectedDate: setSelectedDate,
    handlePrevMonth,
    handleNextMonth,
    handleRequestDeleteTrade,
  };
}
