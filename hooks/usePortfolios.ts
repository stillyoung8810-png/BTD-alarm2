import { useMemo } from 'react';
import { usePortfolioQuery } from './usePortfolioQuery';
import { usePortfolioMutations } from './usePortfolioMutations';
import type {
  SettlementResult,
  UsePortfoliosOptions,
  UsePortfoliosReturn,
} from './portfolioTypes';

export type {
  SettlementResult,
  UsePortfoliosOptions,
  UsePortfoliosReturn,
} from './portfolioTypes';

export function usePortfolios({
  userId,
  userProfile,
  portfolios,
  setPortfolios,
  lang,
}: UsePortfoliosOptions): UsePortfoliosReturn {
  const { fetchPortfolios, loadPortfoliosFromCache } = usePortfolioQuery({
    userId,
    setPortfolios,
  });
  const mutations = usePortfolioMutations({
    userId,
    userProfile,
    portfolios,
    setPortfolios,
    lang,
  });

  return useMemo(
    () => ({
      portfolios,
      setPortfolios,
      fetchPortfolios,
      loadPortfoliosFromCache,
      ...mutations,
    }),
    [
      fetchPortfolios,
      loadPortfoliosFromCache,
      mutations,
      portfolios,
      setPortfolios,
    ],
  );
}
