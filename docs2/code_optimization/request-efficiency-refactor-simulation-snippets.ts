/**
 * Request efficiency simulation snippets
 *
 * Purpose:
 * - verify request-count invariants before production refactor
 * - keep the harness self-contained and easy to copy into a temp runner
 * - validate duplicate-request removal, not full UI rendering
 */

const PERCENT_DECIMAL_SCALE = 100;
const CUSTOM_HISTORY_DAYS = 150;
const STANDARD_MA_PERIODS = [20, 60, 120] as const;

type Lang = 'ko' | 'en';
type StandardMaPeriod = (typeof STANDARD_MA_PERIODS)[number];

const SIM_APP_SHELL_MESSAGES: Record<
  Lang,
  { dailySummaryNetworkError: string }
> = {
  ko: { dailySummaryNetworkError: '네트워크 오류로 요약을 저장하지 못했습니다.' },
  en: { dailySummaryNetworkError: 'Network error. Summary was not saved.' },
};

const SIM_DASHBOARD_MESSAGES: Record<Lang, { systemError: string }> = {
  ko: { systemError: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  en: { systemError: 'A temporary error occurred. Please try again later.' },
};

interface SimHolding {
  stock: string;
  quantity: number;
  realizedPnL?: number;
}

interface SimTrade {
  stock: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  date: string;
}

interface SimPrice {
  price: number;
}

interface SimStockData extends SimPrice {
  ma20: number;
  ma60: number;
  ma120: number;
}

interface SimChartRow {
  date: string;
  price: number;
  ma20: number;
  ma60: number;
}

interface SimMetricsSnapshot {
  currentValuation: number;
  investedAmount: number;
  yieldRate: number;
  realizedProfit: number;
}

interface SimDashboardMetricState {
  currentValuation: number;
  investedAmount: number;
  yieldRate: number;
  realizedProfit: number;
}

interface SimCallCounter {
  priceFetches: number;
  historyFetches: number;
  preloadRuns: number;
}

interface SimAbortQueryResult {
  rows: readonly SimChartRow[];
  hasAbortBinding: boolean;
}

interface SimQueryOptions {
  signal?: AbortSignal;
}

const MA_PROPERTY_MAP: Record<StandardMaPeriod, keyof SimStockData> = {
  20: 'ma20',
  60: 'ma60',
  120: 'ma120',
};

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function roundPercent2(value: number): number {
  return (
    Math.round((value + Number.EPSILON) * PERCENT_DECIMAL_SCALE) /
    PERCENT_DECIMAL_SCALE
  );
}

function isStandardMaPeriod(period: number): period is StandardMaPeriod {
  return (STANDARD_MA_PERIODS as readonly number[]).includes(period);
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function createFailingAsyncTask(message: string): () => Promise<void> {
  return async () => {
    throw new Error(message);
  };
}

function createLatestValueRef<T>(initialValue: T): { current: T } {
  return { current: initialValue };
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getUniqueNonEmptySymbols(symbols: readonly string[]): string[] {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );
}

function getChronologicalTradesSim(trades: readonly SimTrade[]): SimTrade[] {
  return [...trades]
    .reverse()
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateHoldingsFromTradesUnsafeSim(trades: readonly SimTrade[]): Map<string, number> {
  const holdings = new Map<string, number>();

  trades.forEach((trade) => {
    const currentQuantity = holdings.get(trade.stock) ?? 0;

    if (trade.type === 'buy') {
      holdings.set(trade.stock, currentQuantity + trade.quantity);
      return;
    }

    if (holdings.has(trade.stock)) {
      holdings.set(trade.stock, currentQuantity - trade.quantity);
    }
  });

  return holdings;
}

function calculateHoldingsFromTradesSafeSim(trades: readonly SimTrade[]): Map<string, number> {
  return calculateHoldingsFromTradesUnsafeSim(getChronologicalTradesSim(trades));
}

async function buildPortfolioMetricsSnapshotSim(args: {
  holdings: readonly SimHolding[];
  investedAmount: number;
  fetchPrices: (
    symbols: string[],
    options?: SimQueryOptions,
  ) => Promise<Record<string, SimPrice>>;
  options?: SimQueryOptions;
}): Promise<SimMetricsSnapshot> {
  const { holdings, investedAmount, fetchPrices, options } = args;
  const realizedProfit = holdings.reduce(
    (sum, holding) => sum + (holding.realizedPnL ?? 0),
    0,
  );

  if (holdings.length === 0) {
    return {
      currentValuation: 0,
      investedAmount,
      yieldRate: 0,
      realizedProfit,
    };
  }

  const symbols = getUniqueNonEmptySymbols(
    holdings.map((holding) => holding.stock),
  );
  const priceMap = await fetchPrices(symbols, options);
  const currentValuation = holdings.reduce((sum, holding) => {
    const currentPrice = priceMap[holding.stock]?.price ?? 0;
    return sum + holding.quantity * currentPrice;
  }, 0);

  const yieldRate =
    investedAmount > 0
      ? roundPercent2((currentValuation / investedAmount - 1) * 100)
      : 0;

  return {
    currentValuation,
    investedAmount,
    yieldRate,
    realizedProfit,
  };
}

function commitDashboardMetricStateSim(
  snapshot: SimMetricsSnapshot,
): SimDashboardMetricState {
  return {
    currentValuation: snapshot.currentValuation,
    investedAmount: snapshot.investedAmount,
    yieldRate: snapshot.yieldRate,
    realizedProfit: snapshot.realizedProfit,
  };
}

async function loadMaAnalysisInputsSim(args: {
  baseStock: string;
  symbols: readonly string[];
  shouldLoadHistory: boolean;
  fetchPrices: (
    symbols: string[],
    options?: SimQueryOptions,
  ) => Promise<Record<string, SimPrice>>;
  fetchHistory: (
    symbol: string,
    days: number,
    options?: SimQueryOptions,
  ) => Promise<readonly SimChartRow[]>;
  options?: SimQueryOptions;
}): Promise<{ hasHistory: boolean }> {
  const {
    baseStock,
    symbols,
    shouldLoadHistory,
    fetchPrices,
    fetchHistory,
    options,
  } =
    args;

  await fetchPrices(getUniqueNonEmptySymbols(symbols), options);

  if (!shouldLoadHistory) {
    return { hasHistory: false };
  }

  await fetchHistory(baseStock, CUSTOM_HISTORY_DAYS, options);
  return { hasHistory: true };
}

function getMaValueFromLoadedDataSim(
  period: number,
  baseData: SimStockData | undefined,
  baseHistory: Array<{ price: number }> | null,
): number {
  if (baseData == null) {
    return 0;
  }

  if (isStandardMaPeriod(period)) {
    const maKey = MA_PROPERTY_MAP[period];
    const mappedValue = baseData[maKey];
    return typeof mappedValue === 'number' ? mappedValue : 0;
  }

  if (baseHistory == null || baseHistory.length < period) {
    return 0;
  }

  const lastPrice = baseHistory[baseHistory.length - 1]?.price ?? 0;
  return lastPrice;
}

function createSingleInFlightLoader(
  loader: () => Promise<void>,
): () => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return (): Promise<void> => {
    if (inFlight != null) {
      return inFlight;
    }

    inFlight = loader().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

function buildChartViewData(
  rawChartRows: readonly SimChartRow[],
  lang: Lang,
): Array<SimChartRow & { name: string }> {
  return rawChartRows.map((row) => ({
    ...row,
    name: `${lang}:${row.date}`,
  }));
}

function createAbortableHistoryFetcher(
  calls: SimCallCounter,
): (
  signal: AbortSignal,
  options?: { onAbort?: () => void },
) => Promise<readonly SimChartRow[]> {
  return (signal: AbortSignal, options?: { onAbort?: () => void }) =>
    new Promise<readonly SimChartRow[]>((resolve, reject) => {
      calls.historyFetches += 1;

      const handleAbort = (): void => {
        options?.onAbort?.();
        reject(createAbortError());
      };

      if (signal.aborted) {
        handleAbort();
        return;
      }

      signal.addEventListener('abort', handleAbort, { once: true });

      queueMicrotask(() => {
        signal.removeEventListener('abort', handleAbort);

        if (signal.aborted) {
          reject(createAbortError());
          return;
        }

        resolve([
          { date: '2026-04-13', price: 95, ma20: 94, ma60: 90 },
          { date: '2026-04-14', price: 97, ma20: 95, ma60: 91 },
        ]);
      });
    });
}

function createAbortablePriceFetcher(
  calls: SimCallCounter,
): (
  symbols: string[],
  options?: SimQueryOptions & { onAbort?: () => void },
) => Promise<Record<string, SimPrice>> {
  return (
    symbols: string[],
    options?: SimQueryOptions & { onAbort?: () => void },
  ) =>
    new Promise<Record<string, SimPrice>>((resolve, reject) => {
      calls.priceFetches += 1;
      const signal = options?.signal;

      const handleAbort = (): void => {
        options?.onAbort?.();
        reject(createAbortError());
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener('abort', handleAbort, { once: true });

      queueMicrotask(() => {
        signal?.removeEventListener('abort', handleAbort);

        if (signal?.aborted) {
          reject(createAbortError());
          return;
        }

        const result = Object.fromEntries(
          symbols.map((symbol) => [symbol, { price: 100 }]),
        ) as Record<string, SimPrice>;
        resolve(result);
      });
    });
}

async function fetchHistoryWithAbortBindingSim(
  signal?: AbortSignal,
): Promise<SimAbortQueryResult> {
  let boundSignal: AbortSignal | undefined;
  let hasAbortBinding = false;

  const query = {
    abortSignal(nextSignal: AbortSignal) {
      boundSignal = nextSignal;
      hasAbortBinding = true;
      return this;
    },
    async execute(): Promise<readonly SimChartRow[]> {
      if (boundSignal?.aborted) {
        throw createAbortError();
      }

      return [
        { date: '2026-04-13', price: 95, ma20: 94, ma60: 90 },
        { date: '2026-04-14', price: 97, ma20: 95, ma60: 91 },
      ];
    },
  };

  const boundQuery = signal != null ? query.abortSignal(signal) : query;
  const rows = await boundQuery.execute();

  return {
    rows,
    hasAbortBinding,
  };
}

async function lookupSymbolsInParallelSim(
  symbols: readonly string[],
): Promise<{ maxInFlight: number; startedCount: number }> {
  let inFlight = 0;
  let maxInFlight = 0;
  let startedCount = 0;

  await Promise.all(
    symbols.map(async () => {
      startedCount += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    }),
  );

  return {
    maxInFlight,
    startedCount,
  };
}

async function runWarmupsInParallelSim(
  warmups: Array<() => Promise<void>>,
): Promise<{ maxInFlight: number; startedCount: number }> {
  let inFlight = 0;
  let maxInFlight = 0;
  let startedCount = 0;

  await Promise.all(
    warmups.map(async (warmup) => {
      startedCount += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await warmup();
      inFlight -= 1;
    }),
  );

  return {
    maxInFlight,
    startedCount,
  };
}

async function runWarmupEffectSim(args: {
  loader: () => Promise<void>;
  onError: (error: unknown) => void;
  onToast: (message: string) => void;
  getToastMessage: () => string;
}): Promise<void> {
  const { loader, onError, onToast, getToastMessage } = args;
  await loader().catch((error: unknown) => {
    onError(error);
    onToast(getToastMessage());
  });
}

async function runDashboardAsyncEffectSim(args: {
  loadData: () => Promise<void>;
  onError: (error: unknown) => void;
  onToast: (message: string) => void;
  getToastMessage: () => string;
}): Promise<void> {
  const { loadData, onError, onToast, getToastMessage } = args;
  let isMounted = true;

  try {
    await loadData();
  } catch (error: unknown) {
    if (isMounted) {
      onError(error);
      onToast(getToastMessage());
    }
  } finally {
    isMounted = false;
  }
}

function shouldFetchHistoryDetailPrices(
  isReadOnly: boolean,
  holdingsCount: number,
): boolean {
  if (isReadOnly) {
    return false;
  }

  return holdingsCount > 0;
}

export async function simulateDashboardMetrics(): Promise<void> {
  const calls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };

  const snapshot = await buildPortfolioMetricsSnapshotSim({
    holdings: [
      { stock: 'QQQ', quantity: 2, realizedPnL: 5 },
      { stock: 'QQQ', quantity: 1, realizedPnL: 0 },
    ],
    investedAmount: 270,
    fetchPrices: async (symbols) => {
      calls.priceFetches += 1;
      assertEqual(symbols.length, 1, 'metrics symbols should be deduped');

      return {
        QQQ: { price: 100 },
      };
    },
  });

  assertEqual(calls.priceFetches, 1, 'dashboard metrics price fetch count');
  assertEqual(snapshot.currentValuation, 300, 'dashboard current valuation');
  assertEqual(snapshot.investedAmount, 270, 'dashboard invested amount');
  assertEqual(snapshot.yieldRate, 11.11, 'dashboard yield rate');
  assertEqual(snapshot.realizedProfit, 5, 'dashboard realized profit');
}

export async function simulateDashboardMetricSemanticMapping(): Promise<void> {
  const snapshot = await buildPortfolioMetricsSnapshotSim({
    holdings: [{ stock: 'QQQ', quantity: 3, realizedPnL: 5 }],
    investedAmount: 270,
    fetchPrices: async () => ({
      QQQ: { price: 100 },
    }),
  });
  const state = commitDashboardMetricStateSim(snapshot);

  assertEqual(
    state.currentValuation,
    300,
    'valuation state should receive current valuation only',
  );
  assertEqual(
    state.investedAmount,
    270,
    'invested amount state should receive principal only',
  );
  assertEqual(
    state.currentValuation === state.investedAmount,
    false,
    'valuation and invested amount should not collapse into one semantic bucket',
  );
}

export function simulateTradeOrderNormalization(): void {
  const newestFirstTrades: SimTrade[] = [
    {
      stock: 'TQQQ',
      type: 'sell',
      quantity: 1,
      price: 130,
      fee: 1,
      date: '2026-04-12',
    },
    {
      stock: 'TQQQ',
      type: 'buy',
      quantity: 1,
      price: 100,
      fee: 1,
      date: '2026-04-11',
    },
  ];
  const unsafeQuantity =
    calculateHoldingsFromTradesUnsafeSim(newestFirstTrades).get('TQQQ') ?? 0;
  const safeQuantity =
    calculateHoldingsFromTradesSafeSim(newestFirstTrades).get('TQQQ') ?? 0;

  assertEqual(
    unsafeQuantity,
    1,
    'newest-first iteration should reproduce the silent sell skip bug',
  );
  assertEqual(
    safeQuantity,
    0,
    'chronological normalization should apply sell after its prior buy',
  );

  const sameDayNewestFirstTrades: SimTrade[] = [
    {
      stock: 'SOXL',
      type: 'sell',
      quantity: 1,
      price: 25,
      fee: 0,
      date: '2026-04-12',
    },
    {
      stock: 'SOXL',
      type: 'buy',
      quantity: 1,
      price: 20,
      fee: 0,
      date: '2026-04-12',
    },
  ];
  const sameDaySafeQuantity =
    calculateHoldingsFromTradesSafeSim(sameDayNewestFirstTrades).get('SOXL') ??
    0;

  assertEqual(
    sameDaySafeQuantity,
    0,
    'same-date normalization should preserve user input order after reverse',
  );
}

export async function simulateDashboardAbort(): Promise<void> {
  const calls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };
  const abortController = new AbortController();
  const fetchPrices = createAbortablePriceFetcher(calls);
  let commitCount = 0;
  let abortCount = 0;

  const pending = buildPortfolioMetricsSnapshotSim({
    holdings: [{ stock: 'QQQ', quantity: 2, realizedPnL: 5 }],
    investedAmount: 200,
    fetchPrices: (symbols, options) =>
      fetchPrices(symbols, {
        ...options,
        onAbort: () => {
          abortCount += 1;
        },
      }),
    options: { signal: abortController.signal },
  })
    .then(() => {
      commitCount += 1;
    })
    .catch((error: unknown) => {
      if (isAbortLikeError(error)) {
        return;
      }

      throw error;
    });

  abortController.abort();
  await pending;

  assertEqual(calls.priceFetches, 1, 'dashboard abort should start one request');
  assertEqual(abortCount, 1, 'dashboard abort should trigger one abort path');
  assertEqual(commitCount, 0, 'dashboard abort should not commit stale metrics');
}

export async function simulateMaAnalysis(): Promise<void> {
  const standardCalls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };

  await loadMaAnalysisInputsSim({
    baseStock: 'TQQQ',
    symbols: ['TQQQ', 'QQQ', 'SOXL', 'SQQQ'],
    shouldLoadHistory: false,
    fetchPrices: async () => {
      standardCalls.priceFetches += 1;

      return {
        TQQQ: { price: 100 },
        QQQ: { price: 99 },
        SOXL: { price: 98 },
        SQQQ: { price: 97 },
      };
    },
    fetchHistory: async () => {
      standardCalls.historyFetches += 1;
      return [];
    },
  });

  assertEqual(
    standardCalls.priceFetches,
    1,
    'ma standard snapshot fetch count',
  );
  assertEqual(
    standardCalls.historyFetches,
    0,
    'ma standard history fetch count',
  );

  const customCalls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };

  await loadMaAnalysisInputsSim({
    baseStock: 'TQQQ',
    symbols: ['TQQQ', 'QQQ', 'SOXL', 'SQQQ'],
    shouldLoadHistory: true,
    fetchPrices: async () => {
      customCalls.priceFetches += 1;

      return {
        TQQQ: { price: 100 },
        QQQ: { price: 99 },
        SOXL: { price: 98 },
        SQQQ: { price: 97 },
      };
    },
    fetchHistory: async () => {
      customCalls.historyFetches += 1;

      return [
        { date: '2026-04-13', price: 95, ma20: 94, ma60: 90 },
        { date: '2026-04-14', price: 97, ma20: 95, ma60: 91 },
      ];
    },
  });

  assertEqual(customCalls.priceFetches, 1, 'ma custom snapshot fetch count');
  assertEqual(customCalls.historyFetches, 1, 'ma custom history fetch count');

  const loadedBaseData: SimStockData = {
    price: 100,
    ma20: 91,
    ma60: 81,
    ma120: 71,
  };

  assertEqual(
    getMaValueFromLoadedDataSim(20, loadedBaseData, null),
    91,
    'ma property map for 20-day line',
  );
  assertEqual(
    getMaValueFromLoadedDataSim(60, loadedBaseData, null),
    81,
    'ma property map for 60-day line',
  );
  assertEqual(
    getMaValueFromLoadedDataSim(120, loadedBaseData, null),
    71,
    'ma property map for 120-day line',
  );
}

export async function simulateMarkets(): Promise<void> {
  const calls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };

  const ensureInitialReady = createSingleInFlightLoader(async () => {
    calls.preloadRuns += 1;
    await Promise.resolve();
  });

  await Promise.all([ensureInitialReady(), ensureInitialReady()]);
  assertEqual(
    calls.preloadRuns,
    1,
    'shared preload should run once while pending',
  );

  const rawChartRows = await (async (): Promise<readonly SimChartRow[]> => {
    calls.historyFetches += 1;

    return [
      { date: '2026-04-13', price: 95, ma20: 94, ma60: 90 },
      { date: '2026-04-14', price: 97, ma20: 95, ma60: 91 },
    ];
  })();

  const koChart = buildChartViewData(rawChartRows, 'ko');
  const enChart = buildChartViewData(rawChartRows, 'en');

  assertEqual(
    calls.historyFetches,
    1,
    'language change should not refetch history',
  );
  assertEqual(
    koChart.length,
    enChart.length,
    'chart rows should only be reformatted',
  );
}

export async function simulateMarketsStaleDataRetention(): Promise<void> {
  let loggedErrors = 0;
  let stockDataState: Record<string, SimPrice> = {
    QQQ: { price: 101 },
  };
  let rawChartDataState: SimChartRow[] = [
    { date: '2026-04-11', price: 96, ma20: 95, ma60: 91 },
  ];

  const loadStockData = async (): Promise<void> => {
    try {
      throw new Error('price refresh failed');
    } catch (error: unknown) {
      if (isAbortLikeError(error)) {
        return;
      }

      loggedErrors += 1;
    }
  };

  const loadChartData = async (): Promise<void> => {
    try {
      throw new Error('chart refresh failed');
    } catch (error: unknown) {
      if (isAbortLikeError(error)) {
        return;
      }

      loggedErrors += 1;
    }
  };

  await loadStockData();
  await loadChartData();

  assertEqual(
    stockDataState.QQQ?.price ?? 0,
    101,
    'markets price refresh failure should preserve previous stock data',
  );
  assertEqual(
    rawChartDataState.length,
    1,
    'markets chart refresh failure should preserve previous chart rows',
  );
  assertEqual(
    rawChartDataState[0]?.date ?? '',
    '2026-04-11',
    'markets chart refresh failure should keep the previous chart snapshot',
  );
  assertEqual(loggedErrors, 2, 'markets failures should be logged without wiping UI');
}

export async function simulateMarketsAbort(): Promise<void> {
  const calls: SimCallCounter = {
    priceFetches: 0,
    historyFetches: 0,
    preloadRuns: 0,
  };
  const abortController = new AbortController();
  const fetchHistory = createAbortableHistoryFetcher(calls);
  let commitCount = 0;

  const loadChartData = async (): Promise<void> => {
    try {
      const history = await fetchHistory(abortController.signal);
      commitCount += history.length > 0 ? 1 : 0;
    } catch (error: unknown) {
      if (isAbortLikeError(error)) {
        return;
      }

      throw error;
    }
  };

  const pending = loadChartData();
  abortController.abort();
  await pending;

  assertEqual(calls.historyFetches, 1, 'abort path should start one request');
  assertEqual(commitCount, 0, 'aborted chart request should not commit state');
}

export async function simulateAbortBindingContract(): Promise<void> {
  const abortController = new AbortController();
  const result = await fetchHistoryWithAbortBindingSim(abortController.signal);

  assertEqual(
    result.hasAbortBinding,
    true,
    'history query should bind abort signal explicitly',
  );
  assertEqual(result.rows.length, 2, 'abort-bound query should still resolve rows');
}

export async function simulateParallelLookupSafety(): Promise<void> {
  const result = await lookupSymbolsInParallelSim(['QQQ', 'TQQQ', 'SOXL']);

  assertEqual(result.startedCount, 3, 'parallel lookup should start all symbols');
  assertEqual(
    result.maxInFlight > 1,
    true,
    'symbol lookup should be concurrent instead of sequential',
  );
}

export async function simulateParallelWarmupSafety(): Promise<void> {
  const result = await runWarmupsInParallelSim([
    async () => Promise.resolve(),
    async () => Promise.resolve(),
  ]);

  assertEqual(result.startedCount, 2, 'parallel warmup should start both tasks');
  assertEqual(
    result.maxInFlight > 1,
    true,
    'warmups should run concurrently instead of sequentially',
  );
}

export async function simulateWarmupCatchSafety(): Promise<void> {
  let loggedErrors = 0;
  let toastCount = 0;
  let lastToastMessage = '';
  const shellCopyRef = createLatestValueRef(SIM_APP_SHELL_MESSAGES.ko);

  await runWarmupEffectSim({
    loader: createFailingAsyncTask('warmup failed'),
    onError: () => {
      loggedErrors += 1;
    },
    onToast: (message: string) => {
      toastCount += 1;
      lastToastMessage = message;
    },
    getToastMessage: () => shellCopyRef.current.dailySummaryNetworkError,
  });

  assertEqual(loggedErrors, 1, 'warmup failure should be caught exactly once');
  assertEqual(toastCount, 1, 'warmup failure should toast exactly once');
  assertEqual(
    lastToastMessage,
    SIM_APP_SHELL_MESSAGES.ko.dailySummaryNetworkError,
    'warmup toast should use app shell SSOT',
  );
}

export async function simulateDashboardCatchSafety(): Promise<void> {
  let loggedErrors = 0;
  let toastCount = 0;
  let lastToastMessage = '';
  const dashboardCopyRef = createLatestValueRef(SIM_DASHBOARD_MESSAGES.ko);

  await runDashboardAsyncEffectSim({
    loadData: createFailingAsyncTask('dashboard failed'),
    onError: () => {
      loggedErrors += 1;
    },
    onToast: (message: string) => {
      toastCount += 1;
      lastToastMessage = message;
    },
    getToastMessage: () => dashboardCopyRef.current.systemError,
  });

  assertEqual(
    loggedErrors,
    1,
    'dashboard async failure should be caught exactly once',
  );
  assertEqual(toastCount, 1, 'dashboard failure should toast exactly once');
  assertEqual(
    lastToastMessage,
    SIM_DASHBOARD_MESSAGES.ko.systemError,
    'dashboard toast should use dashboard message SSOT',
  );
}

export async function simulateLatestLangRefSafety(): Promise<void> {
  let warmupToastMessage = '';
  let dashboardToastMessage = '';

  const shellCopyRef = createLatestValueRef(SIM_APP_SHELL_MESSAGES.ko);
  const dashboardCopyRef = createLatestValueRef(SIM_DASHBOARD_MESSAGES.ko);

  // 언어 변경은 ref 동기화만 만들고, data-loading effect 자체를 다시 실행하지 않습니다.
  shellCopyRef.current = SIM_APP_SHELL_MESSAGES.en;
  dashboardCopyRef.current = SIM_DASHBOARD_MESSAGES.en;

  await runWarmupEffectSim({
    loader: createFailingAsyncTask('warmup failed after language change'),
    onError: () => undefined,
    onToast: (message: string) => {
      warmupToastMessage = message;
    },
    getToastMessage: () => shellCopyRef.current.dailySummaryNetworkError,
  });

  await runDashboardAsyncEffectSim({
    loadData: createFailingAsyncTask('dashboard failed after language change'),
    onError: () => undefined,
    onToast: (message: string) => {
      dashboardToastMessage = message;
    },
    getToastMessage: () => dashboardCopyRef.current.systemError,
  });

  assertEqual(
    warmupToastMessage,
    SIM_APP_SHELL_MESSAGES.en.dailySummaryNetworkError,
    'warmup should toast latest language without rerunning effect',
  );
  assertEqual(
    dashboardToastMessage,
    SIM_DASHBOARD_MESSAGES.en.systemError,
    'dashboard should toast latest language without rerunning effect',
  );
}

export function simulateHistoryFreeze(): void {
  const shouldFetch = shouldFetchHistoryDetailPrices(true, 3);
  assertEqual(shouldFetch, false, 'history detail should stay read-only');
}

export async function runRequestEfficiencySimulation(): Promise<void> {
  await simulateDashboardMetrics();
  await simulateDashboardAbort();
  await simulateDashboardCatchSafety();
  await simulateMaAnalysis();
  await simulateMarkets();
  await simulateMarketsAbort();
  await simulateAbortBindingContract();
  await simulateParallelLookupSafety();
  await simulateParallelWarmupSafety();
  await simulateWarmupCatchSafety();
  await simulateLatestLangRefSafety();
  simulateHistoryFreeze();
  console.log('request-efficiency-simulation:PASS');
}
