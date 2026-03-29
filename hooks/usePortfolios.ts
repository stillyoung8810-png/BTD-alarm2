import { useState, useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '../services/supabase';
import { normalizePortfolioData } from '../utils/portfolioNormalize';
import { calculateHoldings, calculateTotalInvested, getTotalSellProceeds } from '../utils/portfolioCalculations';
import { calculatePoolDelta, computeVrSnapshotAfterTrade } from '../utils/vrBandStrategy';
import { getEffectiveSubscription } from '../utils/subscriptionUtils';
import type { Portfolio, Trade } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';

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
  lang: 'ko' | 'en';
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
  handleDeletePortfolio: (id: string) => Promise<void>;
  handleDeleteHistory: (portfolioId: string) => Promise<void>;
  handleClearHistory: () => Promise<void>;
}

export function usePortfolios({
  lang,
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
  }, []);

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
  }, []);

  const fetchPortfolios = useCallback((userId: string): void => {
    loadPortfoliosFromCache(userId);
    fetchPortfoliosFromSupabase(userId).catch((err) =>
      console.error('[fetchPortfolios] 백그라운드 업데이트 실패:', err)
    );
  }, [loadPortfoliosFromCache, fetchPortfoliosFromSupabase]);

  const handleAddPortfolio = useCallback(
    async (newP: Omit<Portfolio, 'id'>, onSuccess?: () => void) => {
      if (!userIdOption) {
        alert(lang === 'ko' ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.' : 'Session expired. Please log in again.');
        return;
      }
      const activePortfolios = portfolios.filter((p) => !p.isClosed);
      const maxPortfolios = userProfile?.max_portfolios ?? 3;
      if (maxPortfolios !== -1 && activePortfolios.length >= maxPortfolios) {
        const effectiveTier = getEffectiveSubscription(userProfile).tier;
        const tierName = effectiveTier === 'free' ? '무료' : effectiveTier;
        alert(
          lang === 'ko'
            ? `${tierName} 플랜에서는 최대 ${maxPortfolios}개의 포트폴리오만 생성할 수 있습니다.`
            : `You can only create up to ${maxPortfolios} portfolios on the ${tierName} plan.`
        );
        return;
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
        alert(lang === 'ko' ? '포트폴리오 이름을 입력해주세요.' : 'Please enter a portfolio name.');
        return;
      }
      if (rest.name.length > 100) {
        alert(lang === 'ko' ? '포트폴리오 이름은 100자 이내여야 합니다.' : 'Portfolio name must be 100 characters or less.');
        return;
      }
      if (typeof dailyBuyAmount !== 'number' || !isFinite(dailyBuyAmount) || dailyBuyAmount <= 0) {
        alert(lang === 'ko' ? '매일 매수 금액은 0보다 큰 값이어야 합니다.' : 'Daily buy amount must be greater than 0.');
        return;
      }
      if (dailyBuyAmount > 1_000_000) {
        alert(lang === 'ko' ? '매일 매수 금액은 $1,000,000 이하여야 합니다.' : 'Daily buy amount must be $1,000,000 or less.');
        return;
      }
      if (typeof feeRate !== 'number' || !isFinite(feeRate) || feeRate < 0 || feeRate > 10) {
        alert(lang === 'ko' ? '수수료율은 0% ~ 10% 사이여야 합니다.' : 'Fee rate must be between 0% and 10%.');
        return;
      }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        alert(lang === 'ko' ? '시작일을 올바른 형식(YYYY-MM-DD)으로 입력해주세요.' : 'Please enter a valid start date (YYYY-MM-DD).');
        return;
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
        alert(`저장 실패: ${error.message}`);
        return;
      }
      if (data?.length) {
        const normalized = normalizePortfolioData(data);
        setPortfolios((prev) => [...prev, ...normalized]);
        await Promise.resolve(onSuccess?.());
        alert(lang === 'ko' ? '저장 성공!' : 'Saved!');
      }
    },
    [lang, userIdOption, userProfile, portfolios]
  );

  const handleClosePortfolio = useCallback(
    async (
      portfolioId: string,
      finalSells: Array<{ stock: string; quantity: number; price: number; fee: number }>,
      additionalFee: number
    ): Promise<SettlementResult | null> => {
      const portfolio = portfolios.find((p) => p.id === portfolioId);
      if (!portfolio || !userIdOption) return null;

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
        alert(
          lang === 'ko'
            ? '이력 저장에 실패하여 포트폴리오를 종료하지 않았습니다. 다시 시도해주세요.'
            : 'Failed to save portfolio history. Please try again.'
        );
        return null;
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
        alert(lang === 'ko' ? '전략 종료 저장에 실패했습니다.' : 'Failed to save termination.');
        return null;
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
    [lang, userIdOption, portfolios]
  );

  const handleUpdatePortfolio = useCallback(
    async (updated: Portfolio) => {
      if (!updated.name?.trim() || updated.name.length > 100) {
        alert(lang === 'ko' ? '포트폴리오 이름은 1~100자여야 합니다.' : 'Portfolio name must be 1-100 characters.');
        return;
      }
      if (
        typeof updated.dailyBuyAmount !== 'number' ||
        !isFinite(updated.dailyBuyAmount) ||
        updated.dailyBuyAmount <= 0 ||
        updated.dailyBuyAmount > 1_000_000
      ) {
        alert(lang === 'ko' ? '매일 매수 금액은 $0 초과 ~ $1,000,000 이하여야 합니다.' : 'Daily buy amount must be between $0 and $1,000,000.');
        return;
      }
      if (
        typeof updated.feeRate !== 'number' ||
        !isFinite(updated.feeRate) ||
        updated.feeRate < 0 ||
        updated.feeRate > 10
      ) {
        alert(lang === 'ko' ? '수수료율은 0% ~ 10% 사이여야 합니다.' : 'Fee rate must be between 0% and 10%.');
        return;
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
        alert(lang === 'ko' ? '포트폴리오 업데이트에 실패했습니다.' : 'Failed to update portfolio.');
        return;
      }
      setPortfolios((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    },
    [lang]
  );

  const handleAddTrade = useCallback(
    async (portfolioId: string, trade: Trade) => {
      const target = portfolios.find((p) => p.id === portfolioId);
      if (!target) return;

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
        alert(lang === 'ko' ? '거래 추가에 실패했습니다.' : 'Failed to add trade.');
        return;
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
    [lang, portfolios]
  );

  const handleDeleteTrade = useCallback(
    async (portfolioId: string, tradeId: string) => {
      const target = portfolios.find((p) => p.id === portfolioId);
      if (!target) return;
      const updatedTrades = target.trades.filter((t) => t.id !== tradeId);
      const { error } = await supabase
        .from('portfolios')
        .update({ trades: updatedTrades })
        .eq('id', portfolioId);
      if (error) {
        alert(lang === 'ko' ? '거래 삭제에 실패했습니다.' : 'Failed to delete trade.');
        return;
      }
      setPortfolios((prev) =>
        prev.map((p) => (p.id === portfolioId ? { ...p, trades: updatedTrades } : p))
      );
    },
    [lang, portfolios]
  );

  const handleDeletePortfolio = useCallback(
    async (id: string) => {
      const msg =
        lang === 'ko'
          ? '정말로 이 포트폴리오를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
          : 'Are you sure you want to delete this portfolio? This action cannot be undone.';
      if (!window.confirm(msg)) return;
      const { error } = await supabase.from('portfolios').delete().eq('id', id);
      if (error) {
        alert(lang === 'ko' ? `포트폴리오 삭제에 실패했습니다: ${error.message}` : `Failed to delete portfolio: ${error.message}`);
        return;
      }
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
    },
    [lang]
  );

  const handleDeleteHistory = useCallback(
    async (portfolioId: string) => {
      if (!userIdOption) return;
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
        alert(lang === 'ko' ? '종료 내역 삭제에 실패했습니다.' : 'Failed to delete history.');
        return;
      }
      setPortfolios((prev) => prev.filter((p) => p.id !== portfolioId));
    },
    [lang, userIdOption]
  );

  const handleClearHistory = useCallback(async () => {
    if (!userIdOption) return;
    const msg =
      lang === 'ko'
        ? '모든 종료 내역을 삭제하시겠습니까? (되돌릴 수 없습니다)'
        : 'Delete all history records? This cannot be undone.';
    if (!window.confirm(msg)) return;
    const { error: histErr } = await supabase.from('portfolio_history').delete().eq('user_id', userIdOption);
    const { error: portErr } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userIdOption)
      .eq('is_closed', true);
    if (histErr || portErr) {
      alert(lang === 'ko' ? '종료 내역 전체 삭제에 실패했습니다.' : 'Failed to clear history.');
      return;
    }
    setPortfolios((prev) => prev.filter((p) => !p.isClosed));
  }, [lang, userIdOption]);

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
    handleDeletePortfolio,
    handleDeleteHistory,
    handleClearHistory,
  };
}
