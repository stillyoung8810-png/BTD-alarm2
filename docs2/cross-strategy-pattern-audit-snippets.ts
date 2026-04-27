/**
 * Cross-strategy audit implementation snippets.
 *
 * These snippets are intentionally framework-light. Validate each target file
 * against the current local code before applying.
 */

type ServiceResult<T> =
  | {
      ok: true;
      data: T;
      context?: Record<string, string | number | boolean>;
    }
  | {
      ok: false;
      data: T;
      error: {
        code: 'TIMEOUT' | 'NETWORK' | 'INVALID_INPUT';
        message: string;
        retryable: boolean;
        context?: Record<string, string | number | boolean>;
      };
      context?: Record<string, string | number | boolean>;
    };

interface StockQueryOptions {
  signal?: AbortSignal;
}

interface StockData {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
}

interface StockHistoryPoint {
  date: string;
  price: number;
  ma20?: number;
  ma60?: number;
}

interface IndicatorRequirements {
  needsRsi: boolean;
  maPeriods: readonly Array<5 | 20 | 60 | 120>;
}

interface MultiSplitRuntimeStrategy {
  targetStock: string;
}

const EMPTY_INDICATOR_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: false,
  maPeriods: [],
};

function createAbortFailure<T>(fallback: T, context: {
  cacheKey: string;
}): ServiceResult<T> {
  return {
    ok: false,
    data: fallback,
    error: {
      code: 'TIMEOUT',
      message: 'request_aborted',
      retryable: true,
      context,
    },
    context,
  };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function buildSymbolSetKey(symbols: readonly string[], mode: string): string {
  const normalizedSymbols = Array.from(
    new Set(
      symbols
        .map(normalizeSymbol)
        .filter((symbol) => symbol.length > 0),
    ),
  ).sort();

  return `${mode}|${normalizedSymbols.join(',')}`;
}

function resolveSharedRequestWithAbort<T>(args: {
  request: Promise<ServiceResult<T>>;
  fallback: T;
  signal?: AbortSignal;
  cacheKey: string;
}): Promise<ServiceResult<T>> {
  if (args.signal == null) {
    return args.request;
  }

  if (args.signal.aborted) {
    return Promise.resolve(
      createAbortFailure(args.fallback, { cacheKey: args.cacheKey }),
    );
  }

  return new Promise((resolve) => {
    const handleAbort = () => {
      resolve(createAbortFailure(args.fallback, { cacheKey: args.cacheKey }));
    };
    const handleResult = (result: ServiceResult<T>) => {
      args.signal?.removeEventListener('abort', handleAbort);
      resolve(result);
    };

    args.signal.addEventListener('abort', handleAbort, { once: true });
    args.request.then(handleResult, () => {
      args.signal?.removeEventListener('abort', handleAbort);
      resolve(
        createAbortFailure(args.fallback, { cacheKey: args.cacheKey }),
      );
    });
  });
}

const stockPriceInflightRequests = new Map<
  string,
  Promise<ServiceResult<Record<string, StockData>>>
>();

/**
 * Snippet A: `fetchStockPrices` in-flight dedupe.
 *
 * Apply inside `services/stockService.ts` by moving the existing implementation
 * body into `fetchStockPricesInternal`.
 */
export function fetchStockPricesWithInflightDedupe(args: {
  symbols: readonly string[];
  mode: 'full' | 'price-only';
  options?: StockQueryOptions;
  fetchStockPricesInternal: (
    symbols: readonly string[],
    options?: StockQueryOptions,
  ) => Promise<ServiceResult<Record<string, StockData>>>;
}): Promise<ServiceResult<Record<string, StockData>>> {
  const cacheKey = buildSymbolSetKey(args.symbols, args.mode);
  const fallback: Record<string, StockData> = {};

  if (args.options?.signal?.aborted) {
    return Promise.resolve(createAbortFailure(fallback, { cacheKey }));
  }

  const existingRequest = stockPriceInflightRequests.get(cacheKey);
  const request =
    existingRequest ??
    args.fetchStockPricesInternal(args.symbols, {
      ...args.options,
      signal: undefined,
    });

  if (existingRequest == null) {
    stockPriceInflightRequests.set(cacheKey, request);
    void request.finally(() => {
      stockPriceInflightRequests.delete(cacheKey);
    });
  }

  return resolveSharedRequestWithAbort({
    request,
    fallback,
    signal: args.options?.signal,
    cacheKey,
  });
}

const stockHistoryInflightRequests = new Map<
  string,
  Promise<ServiceResult<StockHistoryPoint[]>>
>();

/**
 * Snippet B: `fetchStockPriceHistory` in-flight dedupe.
 */
export function fetchStockHistoryWithInflightDedupe(args: {
  symbol: string;
  days: number;
  options?: StockQueryOptions;
  fetchStockHistoryInternal: (
    symbol: string,
    days: number,
    options?: StockQueryOptions,
  ) => Promise<ServiceResult<StockHistoryPoint[]>>;
}): Promise<ServiceResult<StockHistoryPoint[]>> {
  const normalizedSymbol = normalizeSymbol(args.symbol);
  const cacheKey = `${normalizedSymbol}|days:${args.days}`;
  const fallback: StockHistoryPoint[] = [];

  if (args.options?.signal?.aborted) {
    return Promise.resolve(createAbortFailure(fallback, { cacheKey }));
  }

  const existingRequest = stockHistoryInflightRequests.get(cacheKey);
  const request =
    existingRequest ??
    args.fetchStockHistoryInternal(normalizedSymbol, args.days, {
      ...args.options,
      signal: undefined,
    });

  if (existingRequest == null) {
    stockHistoryInflightRequests.set(cacheKey, request);
    void request.finally(() => {
      stockHistoryInflightRequests.delete(cacheKey);
    });
  }

  return resolveSharedRequestWithAbort({
    request,
    fallback,
    signal: args.options?.signal,
    cacheKey,
  });
}

function shouldFetchIndicators(args: {
  previousCacheKey: string | undefined;
  nextCacheKey: string;
}): boolean {
  return args.previousCacheKey !== args.nextCacheKey;
}

/**
 * Snippet C: Smart Split hook parity with No-Stop.
 *
 * Target: `hooks/useMultiSplitExecution.ts`.
 */
export function createMultiSplitFetchEffectGuard() {
  const previousCacheKeyRef: { current: string | undefined } = {
    current: undefined,
  };
  const resolvedSnapshotCacheKeyRef: { current: string | null } = {
    current: null,
  };

  return {
    reset(): void {
      previousCacheKeyRef.current = undefined;
      resolvedSnapshotCacheKeyRef.current = null;
    },
    shouldReuse(nextCacheKey: string): boolean {
      const shouldStartFetch = shouldFetchIndicators({
        previousCacheKey: previousCacheKeyRef.current,
        nextCacheKey,
      });

      return (
        !shouldStartFetch &&
        resolvedSnapshotCacheKeyRef.current === nextCacheKey
      );
    },
    markStarted(nextCacheKey: string): void {
      previousCacheKeyRef.current = nextCacheKey;
      resolvedSnapshotCacheKeyRef.current = null;
    },
    markResolved(nextCacheKey: string): void {
      resolvedSnapshotCacheKeyRef.current = nextCacheKey;
    },
  };
}

/**
 * Snippet D: derive the Smart Split fetch key from stable primitives.
 */
export function buildMultiSplitIndicatorCacheKey(args: {
  runtimeStrategy: MultiSplitRuntimeStrategy | null;
  requirements: IndicatorRequirements;
  buildRequirementKey: (input: {
    symbol: string;
    requirements: IndicatorRequirements;
  }) => string;
}): string {
  if (args.runtimeStrategy == null) {
    return '';
  }

  return args.buildRequirementKey({
    symbol: args.runtimeStrategy.targetStock,
    requirements: args.requirements,
  });
}

/**
 * Snippet E: Dashboard MA analysis ViewModel.
 *
 * Build this with `useMemo`, then depend on the returned primitives instead of
 * the whole `portfolio` object in the MA analysis effect.
 */
export function buildMaAnalysisDependencyKey(args: {
  ma0Stock: string;
  ma1Stock: string;
  ma2Stock: string;
  ma3Stock: string;
  maAPeriod: number;
  maBPeriod: number;
  ma0RsiEnabled: boolean;
  ma0AlignmentEnabled: boolean;
  ma1PartialProfit: boolean;
  ma2PartialProfit: boolean;
  ma3PartialProfit: boolean;
}): string {
  return [
    normalizeSymbol(args.ma0Stock),
    normalizeSymbol(args.ma1Stock),
    normalizeSymbol(args.ma2Stock),
    normalizeSymbol(args.ma3Stock),
    args.maAPeriod,
    args.maBPeriod,
    args.ma0RsiEnabled ? 1 : 0,
    args.ma0AlignmentEnabled ? 1 : 0,
    args.ma1PartialProfit ? 1 : 0,
    args.ma2PartialProfit ? 1 : 0,
    args.ma3PartialProfit ? 1 : 0,
  ].join('|');
}

/**
 * Snippet F: shared execution message shape for MA/VR consolidation.
 */
export interface ExecutionMessageDictionary {
  strategyName: string;
  alarmTimes: string;
  noOrder: string;
  sharesUnit: string;
}

export interface MaExecutionMessageDictionary
  extends ExecutionMessageDictionary {
  section: string;
  buy: string;
  partialProfit: string;
  watchRsiNotMet: string;
  watchAlignmentNotMet: string;
  watchBothNotMet: string;
}

export interface VrExecutionMessageDictionary
  extends ExecutionMessageDictionary {
  targetValue: string;
  pool: string;
  band: string;
  readyHint: string;
  noPendingOrder: string;
  maxBuyHint: (step: number) => string;
  modeLabel: Record<'lump_sum' | 'accumulate' | 'withdraw', string>;
}

export function createExecutionMessageAccessor<T extends ExecutionMessageDictionary>(
  messages: Record<'ko' | 'en', T>,
) {
  return (lang: 'ko' | 'en'): T => messages[lang] ?? messages.ko;
}

export const getSmartSplitIndicatorRequirements = (
  runtimeStrategy: MultiSplitRuntimeStrategy | null,
): IndicatorRequirements =>
  runtimeStrategy == null ? EMPTY_INDICATOR_REQUIREMENTS : {
    needsRsi: true,
    maPeriods: [5, 20, 60, 120],
  };
