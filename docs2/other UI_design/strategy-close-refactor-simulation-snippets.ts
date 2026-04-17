/**
 * Strategy close refactor simulation snippets
 *
 * Purpose:
 * - block close when any active shares remain
 * - skip the obsolete termination input step
 * - keep History metrics perfectly aligned with Settlement metrics
 * - fix aggregate ROI to use profit-weighted capital math
 */

const DECIMAL_BASE = 10;
const ZERO_AMOUNT = 0;
const MONEY_DECIMAL_PLACES = 2;
// 프로덕션 구현에서는 utils/financialMath.ts의 SSOT 상수를 그대로 가져옵니다.
export const HOLDINGS_QTY_EPSILON = 1e-10;
const EN_US_LOCALE = 'en-US';
const SYSTEM_ERROR_TOAST_KEY = 'systemError';

const CLOSE_STRATEGY_REQUIRES_NO_SHARES_TOAST_KEY =
  'closeStrategyRequiresNoSharesToast';

type SimTradeType = 'buy' | 'sell';
type SimCloseStrategyToastKey =
  typeof CLOSE_STRATEGY_REQUIRES_NO_SHARES_TOAST_KEY;
type SimSettlementMetricKey =
  | 'totalInvested'
  | 'alreadyRealized'
  | 'profit'
  | 'yieldRate';

interface SimTrade {
  id: string;
  type: SimTradeType;
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
}

interface SimPortfolio {
  id: string;
  name: string;
  trades: SimTrade[];
}

interface SimSettlementSummary {
  totalInvested: number;
  alreadyRealized: number;
  totalReturn: number;
  profit: number;
  yieldRate: number;
}

type SimAggregateRoiInput = Pick<SimSettlementSummary, 'totalInvested' | 'profit'>;

interface SimHistoryRecordVm {
  totalInvested: number;
  profit: number;
  yieldRate: number;
  investedText: string;
  profitText: string;
  yieldText: string;
}

type SimCloseStrategyDecision =
  | {
      kind: 'toast';
      messageKey: SimCloseStrategyToastKey;
    }
  | {
      kind: 'open_settlement_result';
      summary: SimSettlementSummary;
    };

interface SimCloseStrategyState {
  isClosing: boolean;
  settlementOpenCount: number;
  lastSettlementSummary: SimSettlementSummary | null;
  toastKeys: string[];
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertArrayEqual<T>(
  actual: readonly T[],
  expected: readonly T[],
  label: string,
): void {
  const actualSerialized = JSON.stringify(actual);
  const expectedSerialized = JSON.stringify(expected);

  if (actualSerialized !== expectedSerialized) {
    throw new Error(
      `${label}: expected ${expectedSerialized}, received ${actualSerialized}`,
    );
  }
}

function createDeferredSim<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function roundMoneySim(value: number): number {
  if (!Number.isFinite(value)) {
    return ZERO_AMOUNT;
  }

  return (
    Math.round((value + Number.EPSILON) * DECIMAL_BASE ** MONEY_DECIMAL_PLACES) /
    DECIMAL_BASE ** MONEY_DECIMAL_PLACES
  );
}

function isRoundedZeroSim(value: number): boolean {
  return Object.is(value, -0) || value === ZERO_AMOUNT;
}

function getChronologicalTradesSim(trades: readonly SimTrade[]): SimTrade[] {
  return [...trades].sort((left, right) => left.date.localeCompare(right.date));
}

function buildHoldingQuantityMapSim(
  trades: readonly SimTrade[],
): Map<string, number> {
  const holdingQuantityMap = new Map<string, number>();

  for (const trade of getChronologicalTradesSim(trades)) {
    const currentQuantity = holdingQuantityMap.get(trade.stock) ?? 0;
    const normalizedQuantity = Math.abs(trade.quantity);

    if (trade.type === 'buy') {
      holdingQuantityMap.set(
        trade.stock,
        roundMoneySim(currentQuantity + normalizedQuantity),
      );
      continue;
    }

    const nextQuantity = roundMoneySim(currentQuantity - normalizedQuantity);
    if (nextQuantity < -HOLDINGS_QTY_EPSILON) {
      throw new Error(
        `[strategy-close-sim] oversell detected for ${trade.stock}: current=${currentQuantity}, sell=${normalizedQuantity}`,
      );
    }

    holdingQuantityMap.set(
      trade.stock,
      nextQuantity <= HOLDINGS_QTY_EPSILON ? 0 : nextQuantity,
    );
  }

  return holdingQuantityMap;
}

function hasActiveSharesSim(portfolio: SimPortfolio): boolean {
  return Array.from(buildHoldingQuantityMapSim(portfolio.trades).values()).some(
    (quantity) => quantity > HOLDINGS_QTY_EPSILON,
  );
}

function calculateTotalInvestedSim(trades: readonly SimTrade[]): number {
  return roundMoneySim(
    trades.reduce((sum, trade) => {
      if (trade.type !== 'buy') {
        return sum;
      }

      return sum + trade.price * trade.quantity + Math.abs(trade.fee);
    }, 0),
  );
}

function calculateTotalSellProceedsSim(trades: readonly SimTrade[]): number {
  return roundMoneySim(
    trades.reduce((sum, trade) => {
      if (trade.type !== 'sell') {
        return sum;
      }

      return sum + trade.price * trade.quantity - Math.abs(trade.fee);
    }, 0),
  );
}

function buildClosedStrategySettlementSummarySim(
  portfolio: SimPortfolio,
): SimSettlementSummary {
  const totalInvested = calculateTotalInvestedSim(portfolio.trades);
  const totalReturn = calculateTotalSellProceedsSim(portfolio.trades);
  const profit = roundMoneySim(totalReturn - totalInvested);
  const yieldRate =
    totalInvested > ZERO_AMOUNT
      ? roundMoneySim((profit / totalInvested) * 100)
      : ZERO_AMOUNT;

  return {
    totalInvested,
    // 새 종료 정책에서는 잔여 주식이 0이어야 종료되므로, 최종 회수금과 이미 실현된 회수금이 동일합니다.
    alreadyRealized: totalReturn,
    totalReturn,
    profit,
    yieldRate,
  };
}

function formatUsdValueSim(value: number): string {
  const rounded = roundMoneySim(value);
  const displayValue = isRoundedZeroSim(rounded) ? ZERO_AMOUNT : rounded;

  return `$${displayValue.toLocaleString(EN_US_LOCALE, {
    minimumFractionDigits: MONEY_DECIMAL_PLACES,
    maximumFractionDigits: MONEY_DECIMAL_PLACES,
  })}`;
}

function formatSignedUsdValueSim(value: number): string {
  const rounded = roundMoneySim(value);

  if (isRoundedZeroSim(rounded)) {
    return formatUsdValueSim(ZERO_AMOUNT);
  }

  if (rounded > ZERO_AMOUNT) {
    return `+${formatUsdValueSim(rounded)}`;
  }

  return `-${formatUsdValueSim(Math.abs(rounded))}`;
}

function formatSignedPercentSim(value: number): string {
  const rounded = roundMoneySim(value);

  if (isRoundedZeroSim(rounded)) {
    return `${ZERO_AMOUNT.toFixed(MONEY_DECIMAL_PLACES)}%`;
  }

  if (rounded > ZERO_AMOUNT) {
    return `+${rounded.toFixed(MONEY_DECIMAL_PLACES)}%`;
  }

  return `${rounded.toFixed(MONEY_DECIMAL_PLACES)}%`;
}

function buildHistoryRecordVmSim(portfolio: SimPortfolio): SimHistoryRecordVm {
  const summary = buildClosedStrategySettlementSummarySim(portfolio);

  return {
    totalInvested: summary.totalInvested,
    profit: summary.profit,
    yieldRate: summary.yieldRate,
    investedText: formatUsdValueSim(summary.totalInvested),
    profitText: formatSignedUsdValueSim(summary.profit),
    yieldText: formatSignedPercentSim(summary.yieldRate),
  };
}

function calculateAggregateHistoryRoiSim(
  summaries: readonly SimAggregateRoiInput[],
): number {
  const totalInvested = roundMoneySim(
    summaries.reduce((sum, summary) => sum + summary.totalInvested, 0),
  );

  if (totalInvested <= ZERO_AMOUNT) {
    return ZERO_AMOUNT;
  }

  const totalProfit = roundMoneySim(
    summaries.reduce((sum, summary) => sum + summary.profit, 0),
  );

  return roundMoneySim((totalProfit / totalInvested) * 100);
}

function buildSettlementMetricKeysSim(): SimSettlementMetricKey[] {
  return ['totalInvested', 'alreadyRealized', 'profit', 'yieldRate'];
}

function handleCloseStrategySim(
  portfolio: SimPortfolio,
): SimCloseStrategyDecision {
  if (hasActiveSharesSim(portfolio)) {
    return {
      kind: 'toast',
      messageKey: CLOSE_STRATEGY_REQUIRES_NO_SHARES_TOAST_KEY,
    };
  }

  return {
    kind: 'open_settlement_result',
    summary: buildClosedStrategySettlementSummarySim(portfolio),
  };
}

async function handleCloseStrategyWithMutexSim(args: {
  portfolio: SimPortfolio;
  state: SimCloseStrategyState;
  executeClosePortfolio: () => Promise<SimSettlementSummary | null>;
}): Promise<void> {
  const { portfolio, state, executeClosePortfolio } = args;

  if (state.isClosing) {
    return;
  }

  if (hasActiveSharesSim(portfolio)) {
    state.toastKeys.push(CLOSE_STRATEGY_REQUIRES_NO_SHARES_TOAST_KEY);
    return;
  }

  state.isClosing = true;

  try {
    const result = await executeClosePortfolio();
    if (result == null) {
      return;
    }

    state.lastSettlementSummary = result;
    state.settlementOpenCount += 1;
  } catch (_error: unknown) {
    state.toastKeys.push(SYSTEM_ERROR_TOAST_KEY);
  } finally {
    state.isClosing = false;
  }
}

function makeSimTrade(args: {
  id: string;
  type: SimTradeType;
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee?: number;
}): SimTrade {
  return {
    id: args.id,
    type: args.type,
    stock: args.stock,
    date: args.date,
    price: args.price,
    quantity: args.quantity,
    fee: args.fee ?? ZERO_AMOUNT,
  };
}

function makeSimPortfolio(args: {
  id: string;
  name: string;
  trades: SimTrade[];
}): SimPortfolio {
  return {
    id: args.id,
    name: args.name,
    trades: args.trades,
  };
}

export function simulateCloseBlockedWhenActiveSharesRemain(): void {
  const portfolio = makeSimPortfolio({
    id: 'p-active',
    name: 'Active Shares',
    trades: [
      makeSimTrade({
        id: 'buy-1',
        type: 'buy',
        stock: 'QQQ',
        date: '2026-04-01',
        price: 100,
        quantity: 10,
      }),
      makeSimTrade({
        id: 'sell-1',
        type: 'sell',
        stock: 'QQQ',
        date: '2026-04-02',
        price: 110,
        quantity: 4,
      }),
    ],
  });

  const decision = handleCloseStrategySim(portfolio);

  assertEqual(decision.kind, 'toast', 'close blocked decision kind');
  if (decision.kind !== 'toast') {
    throw new Error('close blocked decision kind narrowing failed');
  }
  assertEqual(
    decision.messageKey,
    CLOSE_STRATEGY_REQUIRES_NO_SHARES_TOAST_KEY,
    'close blocked toast key',
  );
}

export function simulateCloseGoesDirectlyToSettlementWhenNoSharesRemain(): void {
  const portfolio = makeSimPortfolio({
    id: 'p-closed',
    name: 'No Shares',
    trades: [
      makeSimTrade({
        id: 'buy-1',
        type: 'buy',
        stock: 'TQQQ',
        date: '2026-04-01',
        price: 100,
        quantity: 2,
      }),
      makeSimTrade({
        id: 'sell-1',
        type: 'sell',
        stock: 'TQQQ',
        date: '2026-04-02',
        price: 120,
        quantity: 2,
      }),
    ],
  });

  const decision = handleCloseStrategySim(portfolio);

  assertEqual(
    decision.kind,
    'open_settlement_result',
    'direct settlement decision kind',
  );
  if (decision.kind !== 'open_settlement_result') {
    throw new Error('direct settlement decision kind narrowing failed');
  }
  assertEqual(decision.summary.totalInvested, 200, 'direct close invested');
  assertEqual(decision.summary.totalReturn, 240, 'direct close return');
  assertEqual(decision.summary.profit, 40, 'direct close profit');
  assertEqual(decision.summary.yieldRate, 20, 'direct close yield');
}

export function simulateHistoryAndSettlementMetricsStaySynced(): void {
  const portfolio = makeSimPortfolio({
    id: 'p-sync',
    name: 'Sync Target',
    trades: [
      makeSimTrade({
        id: 'buy-1',
        type: 'buy',
        stock: 'SOXL',
        date: '2026-04-01',
        price: 100,
        quantity: 5,
        fee: 1,
      }),
      makeSimTrade({
        id: 'buy-2',
        type: 'buy',
        stock: 'SOXL',
        date: '2026-04-02',
        price: 120,
        quantity: 5,
        fee: 1,
      }),
      makeSimTrade({
        id: 'sell-1',
        type: 'sell',
        stock: 'SOXL',
        date: '2026-04-03',
        price: 130,
        quantity: 4,
        fee: 1,
      }),
      makeSimTrade({
        id: 'sell-2',
        type: 'sell',
        stock: 'SOXL',
        date: '2026-04-04',
        price: 140,
        quantity: 6,
        fee: 1,
      }),
    ],
  });

  const settlement = buildClosedStrategySettlementSummarySim(portfolio);
  const historyVm = buildHistoryRecordVmSim(portfolio);

  assertEqual(settlement.totalInvested, 1102, 'settlement invested');
  assertEqual(settlement.totalReturn, 1358, 'settlement total return');
  assertEqual(settlement.profit, 256, 'settlement profit');
  assertEqual(settlement.yieldRate, 23.23, 'settlement yield');

  assertEqual(historyVm.totalInvested, settlement.totalInvested, 'history invested');
  assertEqual(historyVm.profit, settlement.profit, 'history profit');
  assertEqual(historyVm.yieldRate, settlement.yieldRate, 'history yield');
  assertEqual(historyVm.investedText, '$1,102.00', 'history invested text');
  assertEqual(historyVm.profitText, '+$256.00', 'history profit text');
  assertEqual(historyVm.yieldText, '+23.23%', 'history yield text');
  assertEqual(
    historyVm.investedText,
    formatUsdValueSim(settlement.totalInvested),
    'settlement/history invested display sync',
  );
  assertEqual(
    historyVm.profitText,
    formatSignedUsdValueSim(settlement.profit),
    'settlement/history profit display sync',
  );
  assertEqual(
    historyVm.yieldText,
    formatSignedPercentSim(settlement.yieldRate),
    'settlement/history yield display sync',
  );
}

export function simulateAggregateRoiUsesCapitalWeightedFormula(): void {
  const highYieldSmallCapital = makeSimPortfolio({
    id: 'p-small',
    name: 'Small Capital',
    trades: [
      makeSimTrade({
        id: 'buy-small',
        type: 'buy',
        stock: 'QQQ',
        date: '2026-04-01',
        price: 100,
        quantity: 1,
      }),
      makeSimTrade({
        id: 'sell-small',
        type: 'sell',
        stock: 'QQQ',
        date: '2026-04-02',
        price: 150,
        quantity: 1,
      }),
    ],
  });
  const flatLargeCapital = makeSimPortfolio({
    id: 'p-large',
    name: 'Large Capital',
    trades: [
      makeSimTrade({
        id: 'buy-large',
        type: 'buy',
        stock: 'TQQQ',
        date: '2026-04-01',
        price: 100,
        quantity: 3,
      }),
      makeSimTrade({
        id: 'sell-large',
        type: 'sell',
        stock: 'TQQQ',
        date: '2026-04-02',
        price: 100,
        quantity: 3,
      }),
    ],
  });

  const aggregateRoi = calculateAggregateHistoryRoiSim(
    [highYieldSmallCapital, flatLargeCapital].map((portfolio) => {
      const settlement = buildClosedStrategySettlementSummarySim(portfolio);

      return {
        totalInvested: settlement.totalInvested,
        profit: settlement.profit,
      };
    }),
  );

  assertEqual(aggregateRoi, 12.5, 'aggregate ROI');
}

export function simulateAggregateRoiGuardsDivisionByZero(): void {
  const emptyPortfolio = makeSimPortfolio({
    id: 'p-empty',
    name: 'Zero Invested',
    trades: [],
  });

  const aggregateRoi = calculateAggregateHistoryRoiSim([
    {
      totalInvested: calculateTotalInvestedSim(emptyPortfolio.trades),
      profit: 0,
    },
  ]);

  assertEqual(aggregateRoi, 0, 'aggregate ROI zero guard');
}

export function simulateSettlementModalHidesObsoleteFields(): void {
  const metricKeys = buildSettlementMetricKeysSim();

  assertArrayEqual(
    metricKeys,
    ['totalInvested', 'alreadyRealized', 'profit', 'yieldRate'],
    'settlement metric keys',
  );
}

export async function simulateCloseMutexBlocksDoubleSubmit(): Promise<void> {
  const portfolio = makeSimPortfolio({
    id: 'p-mutex',
    name: 'Mutex Target',
    trades: [
      makeSimTrade({
        id: 'buy-1',
        type: 'buy',
        stock: 'QQQ',
        date: '2026-04-01',
        price: 100,
        quantity: 1,
      }),
      makeSimTrade({
        id: 'sell-1',
        type: 'sell',
        stock: 'QQQ',
        date: '2026-04-02',
        price: 120,
        quantity: 1,
      }),
    ],
  });
  const state: SimCloseStrategyState = {
    isClosing: false,
    settlementOpenCount: 0,
    lastSettlementSummary: null,
    toastKeys: [],
  };
  const deferred = createDeferredSim<SimSettlementSummary | null>();
  const settlement = buildClosedStrategySettlementSummarySim(portfolio);
  let closeCallCount = 0;

  const firstCall = handleCloseStrategyWithMutexSim({
    portfolio,
    state,
    executeClosePortfolio: async () => {
      closeCallCount += 1;
      return deferred.promise;
    },
  });
  const secondCall = handleCloseStrategyWithMutexSim({
    portfolio,
    state,
    executeClosePortfolio: async () => {
      closeCallCount += 1;
      return deferred.promise;
    },
  });

  await Promise.resolve();
  assertEqual(closeCallCount, 1, 'close mutex call count before resolve');
  assertEqual(state.isClosing, true, 'close mutex locked while pending');

  deferred.resolve(settlement);
  await Promise.all([firstCall, secondCall]);

  assertEqual(closeCallCount, 1, 'close mutex final call count');
  assertEqual(state.isClosing, false, 'close mutex unlocked after success');
  assertEqual(state.settlementOpenCount, 1, 'close mutex settlement open count');
  assertEqual(state.toastKeys.length, 0, 'close mutex toast count');
}

export async function simulateCloseMutexUnlocksAfterFailure(): Promise<void> {
  const portfolio = makeSimPortfolio({
    id: 'p-failure',
    name: 'Failure Target',
    trades: [
      makeSimTrade({
        id: 'buy-1',
        type: 'buy',
        stock: 'SOXL',
        date: '2026-04-01',
        price: 100,
        quantity: 2,
      }),
      makeSimTrade({
        id: 'sell-1',
        type: 'sell',
        stock: 'SOXL',
        date: '2026-04-02',
        price: 110,
        quantity: 2,
      }),
    ],
  });
  const state: SimCloseStrategyState = {
    isClosing: false,
    settlementOpenCount: 0,
    lastSettlementSummary: null,
    toastKeys: [],
  };
  let closeCallCount = 0;

  await handleCloseStrategyWithMutexSim({
    portfolio,
    state,
    executeClosePortfolio: async () => {
      closeCallCount += 1;
      throw new Error('close failed');
    },
  });

  assertEqual(closeCallCount, 1, 'close failure first call count');
  assertEqual(state.isClosing, false, 'close failure unlock');
  assertArrayEqual(
    state.toastKeys,
    [SYSTEM_ERROR_TOAST_KEY],
    'close failure toast keys',
  );

  await handleCloseStrategyWithMutexSim({
    portfolio,
    state,
    executeClosePortfolio: async () => {
      closeCallCount += 1;
      return buildClosedStrategySettlementSummarySim(portfolio);
    },
  });

  assertEqual(closeCallCount, 2, 'close failure retry call count');
  assertEqual(state.settlementOpenCount, 1, 'close failure retry settlement count');
}
