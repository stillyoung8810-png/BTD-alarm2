import { useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '../services/supabase';
import { normalizePortfolioData } from '../utils/portfolioNormalize';
import { calculateHoldings, calculateTotalInvested, getTotalSellProceeds } from '../utils/portfolioCalculations';
import { calculatePoolDelta, computeVrSnapshotAfterTrade } from '../utils/vrBandStrategy';
import { getEffectiveSubscription } from '../utils/subscriptionUtils';
import type { Portfolio, Trade } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';
import {
  createPortfolioMutationError,
  PORTFOLIO_MUTATION_ERROR_CODES,
} from '../constants/portfolioMutationErrors';

const PORTFOLIOS_CACHE_KEY = 'my_portfolios';

export interface SettlementResult {
  portfolio: Portfolio;
  totalInvested: number;
  alreadyRealized: number;
  finalSellAmount: number;
  totalReturn: number;
  profit: number;
  yieldRate: number;
}

export interface UsePortfoliosOptions {
  userId: string | null;
  userProfile: AppUserProfile | null;
  portfolios: Portfolio[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
}

export interface UsePortfoliosReturn {
  portfolios: Portfolio[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
  fetchPortfolios: (userId: string) => void;
  loadPortfoliosFromCache: (userId: string) => boolean;
  handleAddPortfolio: (newP: Omit<Portfolio, 'id'>, onSuccess?: () => void | Promise<void>) => Promise<void>;
  handleClosePortfolio: (
    portfolioId: string,
    finalSells: Array<{ stock: string; quantity: number; price: number; fee: number }>,
    additionalFee: number
  ) => Promise<SettlementResult | null>;
  handleUpdatePortfolio: (updated: Portfolio) => Promise<void>;
  handleAddTrade: (portfolioId: string, trade: Trade) => Promise<void>;
  handleDeleteTrade: (portfolioId: string, tradeId: string) => Promise<void>;
  deletePortfolioById: (id: string) => Promise<void>;
  handleDeleteHistory: (portfolioId: string) => Promise<void>;
  handleClearHistory: () => Promise<void>;
}

export function usePortfolios({
  userId: userIdOption,
  userProfile,
  portfolios,
  setPortfolios,
}: UsePortfoliosOptions): UsePortfoliosReturn {
  const fetchingPortfoliosRef = useRef<Set<string>>(new Set());
  const fetchPortfoliosAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const loadPortfoliosFromCache = useCallback((userId: string): boolean => {
    const cacheKey = `${PORTFOLIOS_CACHE_KEY}_${userId}`;
    try {
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        try {
          const parsedData = JSON.parse(cachedData);
          const normalizedData = normalizePortfolioData(parsedData);
          setPortfolios(normalizedData);
          return true;
        } catch {
          // ignore parse error
        }
      }
    } catch {
      // ignore cache error
    }
    return false;
  }, [setPortfolios]);

  const fetchPortfoliosFromSupabase = useCallback(async (userId: string): Promise<void> => {
    const cacheKey = `${PORTFOLIOS_CACHE_KEY}_${userId}`;
    if (fetchingPortfoliosRef.current.has(userId)) {
      const existingController = fetchPortfoliosAbortControllersRef.current.get(userId);
      if (existingController) existingController.abort();
    }
    fetchingPortfoliosRef.current.add(userId);
    const controller = new AbortController();
    fetchPortfoliosAbortControllersRef.current.set(userId, controller);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      timeoutId = setTimeout(() => controller.abort(), 10000);
      const { data, error } = await supabase
        .from('portfolios')
        .select('id, created_at, name, daily_buy_amount, start_date, fee_rate, is_closed, closed_at, final_sell_amount, trades, strategy, alarm_config, is_quarter_mode, user_id, vr_snapshot')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);

      if (error) {
        if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
          console.error('[fetchPortfoliosFromSupabase]', error.message);
        }
        return;
      }
      if (data) {
        const formattedData = normalizePortfolioData(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {}
        setPortfolios(formattedData);
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'AbortError' && !e?.message?.includes('aborted')) {
        console.error('[fetchPortfoliosFromSupabase]', e);
      }
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
      fetchingPortfoliosRef.current.delete(userId);
      fetchPortfoliosAbortControllersRef.current.delete(userId);
    }
  }, [setPortfolios]);

  const fetchPortfolios = useCallback((userId: string): void => {
    loadPortfoliosFromCache(userId);
    fetchPortfoliosFromSupabase(userId).catch((err) =>
      console.error('[fetchPortfolios] 백그라운드 업데이트 실패:', err)
    );
  }, [loadPortfoliosFromCache, fetchPortfoliosFromSupabase]);

  const handleAddPortfolio = useCallback(
    async (
      newP: Omit<Portfolio, 'id'>,
      onSuccess?: () => void | Promise<void>,
    ) => {
      if (!userIdOption) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
        );
      }
      const activePortfolios = portfolios.filter((p) => !p.isClosed);
      const maxPortfolios = userProfile?.max_portfolios ?? 3;
      if (maxPortfolios !== -1 && activePortfolios.length >= maxPortfolios) {
        const effectiveTier = getEffectiveSubscription(userProfile).tier;
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached,
          {
            maxPortfolios,
            effectiveTier,
          },
        );
      }
      const {
        dailyBuyAmount,
        startDate,
        feeRate,
        isClosed,
        closedAt,
        finalSellAmount,
        alarmconfig,
        isQuarterMode,
        vrSnapshot,
        ...rest
      } = newP;
      if (!rest.name?.trim()) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.nameRequired,
        );
      }
      if (rest.name.length > 100) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.nameTooLong,
        );
      }
      if (typeof dailyBuyAmount !== 'number' || !isFinite(dailyBuyAmount) || dailyBuyAmount <= 0) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.dailyBuyAmountInvalid,
        );
      }
      if (dailyBuyAmount > 1_000_000) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.dailyBuyAmountTooLarge,
        );
      }
      if (typeof feeRate !== 'number' || !isFinite(feeRate) || feeRate < 0 || feeRate > 10) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.feeRateInvalid,
        );
      }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.startDateInvalid,
        );
      }
      const payload = {
        ...rest,
        id: crypto.randomUUID(),
        user_id: userIdOption,
        daily_buy_amount: dailyBuyAmount,
        start_date: startDate,
        fee_rate: feeRate,
        is_closed: isClosed,
        closed_at: closedAt || null,
        final_sell_amount: finalSellAmount || null,
        alarm_config: alarmconfig || null,
        is_quarter_mode: isQuarterMode ?? false,
        vr_snapshot: vrSnapshot ?? null,
      };
      const { data, error } = await supabase.from('portfolios').insert([payload]).select();
      if (error) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.saveFailed,
          error,
        );
      }
      if (data?.length) {
        const normalized = normalizePortfolioData(data);
        setPortfolios((prev) => [...prev, ...normalized]);
        await Promise.resolve(onSuccess?.());
      }
    },
    [portfolios, setPortfolios, userIdOption, userProfile]
  );

  const handleClosePortfolio = useCallback(
    async (
      portfolioId: string,
      finalSells: Array<{ stock: string; quantity: number; price: number; fee: number }>,
      additionalFee: number
    ): Promise<SettlementResult | null> => {
      const portfolio = portfolios.find((p) => p.id === portfolioId);
      if (!portfolio) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
        );
      }
      if (!userIdOption) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
        );
      }

      const totalInvested = calculateTotalInvested(portfolio);
      const alreadyRealizedCash = getTotalSellProceeds(portfolio);
      const finalSellAmount =
        finalSells.reduce((sum, fs) => sum + fs.price * fs.quantity - fs.fee, 0) - additionalFee;
      const totalReturn = alreadyRealizedCash + finalSellAmount;
      const totalProfit = totalReturn - totalInvested;
      const yieldRate = totalInvested > 0 ? (totalReturn / totalInvested - 1) * 100 : 0;

      const endDate = new Date();
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      const finalSellTrades: Trade[] = finalSells.map((fs, index) => ({
        id: `final-${endDate.getTime()}-${index}`,
        type: 'sell',
        stock: fs.stock,
        date: endDateStr,
        price: fs.price,
        quantity: fs.quantity,
        fee: fs.fee,
      }));

      const updated = {
        ...portfolio,
        isClosed: true,
        closedAt: endDate.toISOString(),
        finalSellAmount: finalSellAmount + additionalFee,
        trades: [...portfolio.trades, ...finalSellTrades],
      };

      const startDate = portfolio.startDate ? new Date(portfolio.startDate) : new Date();
      const { error: historyError } = await supabase.from('portfolio_history').insert([
        {
          portfolio_id: portfolioId,
          user_id: userIdOption,
          portfolio_name: portfolio.name,
          total_invested: totalInvested,
          total_return: totalReturn,
          total_profit: totalProfit,
          yield_rate: yieldRate,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString(),
          strategy_detail: {
            strategy: portfolio.strategy,
            daily_buy_amount: portfolio.dailyBuyAmount,
            fee_rate: portfolio.feeRate,
            alarmconfig: portfolio.alarmconfig,
          },
        },
      ]);

      if (historyError) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.closeHistoryFailed,
          historyError,
        );
      }

      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          is_closed: true,
          closed_at: updated.closedAt,
          final_sell_amount: updated.finalSellAmount,
          trades: updated.trades,
        })
        .eq('id', portfolioId);

      if (updateError) {
        await supabase
          .from('portfolio_history')
          .delete()
          .eq('user_id', userIdOption)
          .eq('portfolio_id', portfolioId);
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.closeUpdateFailed,
          updateError,
        );
      }

      setPortfolios((prev) => prev.map((p) => (p.id === portfolioId ? updated : p)));
      return {
        portfolio: updated,
        totalInvested,
        alreadyRealized: alreadyRealizedCash,
        finalSellAmount: finalSellAmount + additionalFee,
        totalReturn,
        profit: totalProfit,
        yieldRate,
      };
    },
    [portfolios, setPortfolios, userIdOption]
  );

  const handleUpdatePortfolio = useCallback(
    async (updated: Portfolio) => {
      if (!updated.name?.trim() || updated.name.length > 100) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.updateNameInvalid,
        );
      }
      if (
        typeof updated.dailyBuyAmount !== 'number' ||
        !isFinite(updated.dailyBuyAmount) ||
        updated.dailyBuyAmount <= 0 ||
        updated.dailyBuyAmount > 1_000_000
      ) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.updateDailyBuyAmountInvalid,
        );
      }
      if (
        typeof updated.feeRate !== 'number' ||
        !isFinite(updated.feeRate) ||
        updated.feeRate < 0 ||
        updated.feeRate > 10
      ) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.updateFeeRateInvalid,
        );
      }
      const { error } = await supabase
        .from('portfolios')
        .update({
          name: updated.name,
          daily_buy_amount: updated.dailyBuyAmount,
          start_date: updated.startDate,
          fee_rate: updated.feeRate,
          strategy: updated.strategy,
          trades: updated.trades,
          is_closed: updated.isClosed,
          closed_at: updated.closedAt || null,
          final_sell_amount: updated.finalSellAmount || null,
          alarm_config: updated.alarmconfig || null,
          is_quarter_mode: updated.isQuarterMode ?? false,
          vr_snapshot: updated.vrSnapshot ?? null,
        })
        .eq('id', updated.id);

      if (error) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.updateFailed,
          error,
        );
      }
      setPortfolios((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    },
    [setPortfolios]
  );

  const handleAddTrade = useCallback(
    async (portfolioId: string, trade: Trade) => {
      const target = portfolios.find((p) => p.id === portfolioId);
      if (!target) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
        );
      }

      const normalizedTrade: Trade = {
        ...trade,
        price: Number(trade.price),
        quantity: Number(trade.quantity),
        fee: trade.fee !== undefined ? Number(trade.fee) : trade.fee,
      };

      const vrParams =
        target.strategy.vrBand ||
        (target.strategy as any).vr_band ||
        (target.strategy as any).vrBandStrategy;
      const isVrStrategy = !!vrParams;

      let vrSnapshot = target.vrSnapshot ?? null;
      let poolAfter: number | undefined;

      if (isVrStrategy && vrParams) {
        const params = vrParams;
        const currentPool =
          vrSnapshot?.pool ??
          params.initialCapital;

        try {
          const feeRate = Number(target.feeRate ?? params.feeRate);
          const delta = calculatePoolDelta(
            normalizedTrade.type,
            normalizedTrade.price,
            normalizedTrade.quantity,
            feeRate
          );
          poolAfter = currentPool + delta;
          vrSnapshot = computeVrSnapshotAfterTrade(
            vrSnapshot,
            normalizedTrade,
            poolAfter,
            params
          );
        } catch (err) {
          console.error('🚨 [VR_FATAL_ERROR] 계산 중 크래시 발생:', err);
        }
      }

      const tradeWithMeta: Trade =
        isVrStrategy && poolAfter !== undefined
          ? {
              ...normalizedTrade,
              metadata: { ...(trade.metadata ?? {}), pool_after: poolAfter },
            }
          : normalizedTrade;

      const updatedTrades = [tradeWithMeta, ...target.trades];
      const updatedPortfolio: Portfolio = {
        ...target,
        trades: updatedTrades,
        vrSnapshot: vrSnapshot ?? target.vrSnapshot,
      };

      const { error } = await supabase
        .from('portfolios')
        .update({
          trades: updatedTrades,
          vr_snapshot: updatedPortfolio.vrSnapshot ?? null,
        })
        .eq('id', portfolioId);

      if (error) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.addTradeFailed,
          error,
        );
      }

      let nextIsQuarterMode = target.isQuarterMode ?? false;
      if (target.strategy.multiSplit && nextIsQuarterMode && trade.type === 'sell') {
        const holdingsBefore = calculateHoldings(target);
        const holdingsAfter = calculateHoldings(updatedPortfolio);
        const qtyBefore = holdingsBefore.find((h) => h.stock === trade.stock)?.quantity ?? 0;
        const qtyAfter = holdingsAfter.find((h) => h.stock === trade.stock)?.quantity ?? 0;
        if (qtyBefore > 0) {
          const dropPct = (qtyBefore - qtyAfter) / qtyBefore;
          if (dropPct >= 0.2 || dropPct >= 0.99 || qtyAfter <= 0) {
            nextIsQuarterMode = false;
            await supabase.from('portfolios').update({ is_quarter_mode: false }).eq('id', portfolioId);
          }
        }
      }

      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === portfolioId
            ? { ...updatedPortfolio, isQuarterMode: nextIsQuarterMode }
            : p
        )
      );
    },
    [portfolios, setPortfolios]
  );

  const handleDeleteTrade = useCallback(
    async (portfolioId: string, tradeId: string) => {
      const target = portfolios.find((p) => p.id === portfolioId);
      if (!target) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
        );
      }
      const updatedTrades = target.trades.filter((t) => t.id !== tradeId);
      const { error } = await supabase
        .from('portfolios')
        .update({ trades: updatedTrades })
        .eq('id', portfolioId);
      if (error) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.deleteTradeFailed,
          error,
        );
      }
      setPortfolios((prev) =>
        prev.map((p) => (p.id === portfolioId ? { ...p, trades: updatedTrades } : p))
      );
    },
    [portfolios, setPortfolios]
  );

  const deletePortfolioById = useCallback(
    async (id: string) => {
      if (!userIdOption) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
        );
      }
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('user_id', userIdOption)
        .eq('id', id);
      if (error) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.deleteFailed,
          error,
        );
      }
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
    },
    [setPortfolios, userIdOption]
  );

  const handleDeleteHistory = useCallback(
    async (portfolioId: string) => {
      if (!userIdOption) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
        );
      }
      const { error: histErr } = await supabase
        .from('portfolio_history')
        .delete()
        .eq('user_id', userIdOption)
        .eq('portfolio_id', portfolioId);
      const { error: portErr } = await supabase
        .from('portfolios')
        .delete()
        .eq('user_id', userIdOption)
        .eq('id', portfolioId);
      if (histErr || portErr) {
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.deleteHistoryFailed,
          histErr ?? portErr,
        );
      }
      setPortfolios((prev) => prev.filter((p) => p.id !== portfolioId));
    },
    [setPortfolios, userIdOption]
  );

  const handleClearHistory = useCallback(async () => {
    if (!userIdOption) {
      throw createPortfolioMutationError(
        PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
      );
    }
    const { error: histErr } = await supabase.from('portfolio_history').delete().eq('user_id', userIdOption);
    const { error: portErr } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userIdOption)
      .eq('is_closed', true);
    if (histErr || portErr) {
      throw createPortfolioMutationError(
        PORTFOLIO_MUTATION_ERROR_CODES.clearHistoryFailed,
        histErr ?? portErr,
      );
    }
    setPortfolios((prev) => prev.filter((p) => !p.isClosed));
  }, [setPortfolios, userIdOption]);

  return {
    portfolios,
    setPortfolios,
    fetchPortfolios,
    loadPortfoliosFromCache,
    handleAddPortfolio,
    handleClosePortfolio,
    handleUpdatePortfolio,
    handleAddTrade,
    handleDeleteTrade,
    deletePortfolioById,
    handleDeleteHistory,
    handleClearHistory,
  };
}
