import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Portfolio } from '../types';
import {
  PORTFOLIO_FETCH_TIMEOUT_MS,
  fetchPortfoliosByUserSafe,
  readPortfolioCacheSafe,
} from '../services/portfolioService';
import type { ServiceResult } from '../services/serviceUtils';

interface UsePortfolioQueryArgs {
  userId: string | null;
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
}

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

interface QueryState<T> {
  status: QueryStatus;
  data: T;
  errorCode: string | null;
}

const EMPTY_PORTFOLIOS: Portfolio[] = [];

function createInitialQueryState<T>(data: T): QueryState<T> {
  return {
    status: 'idle',
    data,
    errorCode: null,
  };
}

function reduceServiceQueryState<T>(
  previous: QueryState<T>,
  result: ServiceResult<T>,
): QueryState<T> {
  if (result.ok) {
    return {
      status: 'success',
      data: result.data,
      errorCode: null,
    };
  }

  return {
    status: 'error',
    data: previous.data,
    errorCode: result.error.code,
  };
}

export function usePortfolioQuery({
  userId,
  setPortfolios,
}: UsePortfolioQueryArgs) {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [queryState, setQueryState] = useState(
    createInitialQueryState<Portfolio[]>(EMPTY_PORTFOLIOS),
  );

  const loadPortfoliosFromCache = useCallback(
    (targetUserId: string): boolean => {
      const cacheResult = readPortfolioCacheSafe(targetUserId);
      if (!cacheResult.ok) {
        return false;
      }

      setPortfolios(cacheResult.data);
      setQueryState((previous) => ({
        ...previous,
        data: cacheResult.data,
        errorCode: null,
      }));
      return true;
    },
    [setPortfolios],
  );

  const fetchPortfoliosInternal = useCallback(
    async (targetUserId: string | null | undefined): Promise<void> => {
      const safeUserId = (targetUserId ?? '').trim();
      if (safeUserId.length === 0) {
        requestIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setPortfolios(EMPTY_PORTFOLIOS);
        setQueryState(createInitialQueryState<Portfolio[]>(EMPTY_PORTFOLIOS));
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      loadPortfoliosFromCache(safeUserId);
      setQueryState((previous) => ({
        ...previous,
        status: 'loading',
        errorCode: null,
      }));

      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, PORTFOLIO_FETCH_TIMEOUT_MS);

      try {
        const result = await fetchPortfoliosByUserSafe(
          safeUserId,
          controller.signal,
        );
        if (requestIdRef.current !== requestId) {
          return;
        }

        setQueryState((previous) => reduceServiceQueryState(previous, result));
        if (result.ok) {
          setPortfolios(result.data);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [loadPortfoliosFromCache, setPortfolios],
  );

  const fetchPortfolios = useCallback(
    (targetUserId: string): void => {
      void fetchPortfoliosInternal(targetUserId);
    },
    [fetchPortfoliosInternal],
  );

  useEffect(() => {
    if ((userId ?? '').trim().length > 0) {
      return;
    }

    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPortfolios(EMPTY_PORTFOLIOS);
    setQueryState(createInitialQueryState<Portfolio[]>(EMPTY_PORTFOLIOS));
  }, [userId, setPortfolios]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  return {
    fetchPortfolios,
    loadPortfoliosFromCache,
    queryState,
  };
}
