import {
  HOLDINGS_QTY_EPSILON,
  floorToNonNegativeInt,
  roundMoney,
  roundShares4,
} from '../utils/financialMath';
import { validateFinancialArgs } from '../utils/vrBandStrategy';

const PERCENT_DENOMINATOR = 100;
const MOC_SAFETY_BUFFER_MULTIPLIER = 1.15;
const MAX_PROGRESS_PERCENT = 100;
const MIN_PROGRESS_PERCENT = 0;
const MONEY_DECIMAL_PLACES = 2;
const SHARE_DECIMAL_PLACES = 4;
const EMPTY_STRING = '';
const NO_STOP_EXECUTION_ERROR_NO_EXECUTABLE_ORDERS =
  'ERROR_NO_EXECUTABLE_ORDERS';

type SimTradeType = 'buy' | 'sell';
type SimExecutionMessageId =
  | 'noStop.strategyProgress'
  | 'noStop.lowLoc'
  | 'noStop.mocBuy'
  | 'noStop.takeProfit'
  | 'noStop.firstBuyHint'
  | 'noStop.splitComplete'
  | 'common.sharesUnit';

interface SimTradeInput {
  type: SimTradeType;
  stock: string;
  price: number;
  quantity: number;
  fee: number;
}

interface SimHolding {
  stock: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
}

interface SimNoStopStrategy {
  targetStock: string;
  appliedLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
}

interface SimPricedOrder {
  price: number;
  quantity: number;
}

interface SimQuantityOnlyOrder {
  quantity: number;
}

interface SimBudgetAllocation {
  finalLocQuantity: number;
  finalMocQuantity: number;
}

interface SimExecutionResult {
  progressPct: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: SimPricedOrder;
  displayMocBuy?: SimQuantityOnlyOrder;
  executableLowLoc?: SimPricedOrder;
  executableMocBuy?: SimQuantityOnlyOrder;
  takeProfit?: SimPricedOrder;
}

interface SimBrokerLimitOrder {
  type: 'LIMIT';
  price: number;
  quantity: number;
}

interface SimBrokerMocOrder {
  type: 'MARKET_ON_CLOSE';
  quantity: number;
}

type SimBrokerOrder = SimBrokerLimitOrder | SimBrokerMocOrder;

type SimBrokerExecutor = (orders: readonly SimBrokerOrder[]) => Promise<void>;

interface SimUseNoStopExecutionArgs {
  trades: readonly SimTradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  currentPrice: number;
  strategy: SimNoStopStrategy;
}

interface SimNoStopHookViewModel {
  progressPct: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: SimPricedOrder;
  displayMocBuy?: SimQuantityOnlyOrder;
  takeProfit?: SimPricedOrder;
  onExecute: () => Promise<void>;
}

interface SimFormatExecutionLineArgs {
  label: string;
  quantity: number;
  sharesUnit: string;
  price?: number;
}

type SimExecutionMessages = Record<SimExecutionMessageId, string>;

const SIM_EXECUTION_MESSAGE_IDS = {
  strategyProgress: 'noStop.strategyProgress',
  lowLoc: 'noStop.lowLoc',
  mocBuy: 'noStop.mocBuy',
  takeProfit: 'noStop.takeProfit',
  firstBuyHint: 'noStop.firstBuyHint',
  splitComplete: 'noStop.splitComplete',
  sharesUnit: 'common.sharesUnit',
} as const satisfies Record<string, SimExecutionMessageId>;

const SIM_EXECUTION_MESSAGES_KO: SimExecutionMessages = {
  'noStop.strategyProgress': '전략 진행률',
  'noStop.lowLoc': '평단가 매수 (LOC)',
  'noStop.mocBuy': '분할 매수 (MOC)',
  'noStop.takeProfit': '익절 목표',
  'noStop.firstBuyHint': '첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.',
  'noStop.splitComplete':
    '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유와 익절만 수행합니다.',
  'common.sharesUnit': '주',
};

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertTruthy(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`${label}: expected truthy condition`);
  }
}

async function assertRejects(
  callback: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let didReject = false;

  try {
    await callback();
  } catch {
    didReject = true;
  }

  if (!didReject) {
    throw new Error(`${label}: expected callback to reject`);
  }
}

function assertThrows(callback: () => unknown, label: string): void {
  let didThrow = false;

  try {
    callback();
  } catch {
    didThrow = true;
  }

  if (!didThrow) {
    throw new Error(`${label}: expected callback to throw`);
  }
}

function normalizeTickerSim(stock: string): string {
  return stock.trim().toUpperCase();
}

function normalizeMoneyLikeValueSim(value: number, context: string): number {
  const normalizedValue = Math.abs(Number(value));
  validateFinancialArgs(
    { normalizedValue },
    { normalizedValue: { min: 0 } },
    context,
  );
  return normalizedValue;
}

function floorSafeQuantitySim(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return floorToNonNegativeInt(value + Number.EPSILON);
}

function formatUsdSim(value: number): string {
  return `$${roundMoney(value).toLocaleString('en-US', {
    minimumFractionDigits: MONEY_DECIMAL_PLACES,
    maximumFractionDigits: MONEY_DECIMAL_PLACES,
  })}`;
}

function formatShareQuantitySim(quantity: number): string {
  const roundedQuantity = roundShares4(quantity);
  if (Number.isInteger(roundedQuantity)) {
    return String(roundedQuantity);
  }

  return roundedQuantity
    .toFixed(SHARE_DECIMAL_PLACES)
    .replace(/0+$/, EMPTY_STRING)
    .replace(/\.$/, EMPTY_STRING);
}

function buildOrderEntryAllowZeroSim(
  price: number,
  quantity: number,
): SimPricedOrder | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: Math.max(0, floorSafeQuantitySim(quantity)),
  };
}

function buildQuantityOnlyOrderAllowZeroSim(
  quantity: number,
): SimQuantityOnlyOrder {
  return {
    quantity: Math.max(0, floorSafeQuantitySim(quantity)),
  };
}

function deriveExecutableOrderSim<T extends { quantity: number }>(
  displayOrder?: T,
): T | undefined {
  return displayOrder != null && displayOrder.quantity >= 1
    ? displayOrder
    : undefined;
}

function formatExecutionLineSim(args: SimFormatExecutionLineArgs): string {
  const quantityText = `${formatShareQuantitySim(args.quantity)}${args.sharesUnit}`;
  if (args.price == null) {
    return `${args.label}: ${quantityText}`;
  }

  return `${args.label}: ${formatUsdSim(args.price)} / ${quantityText}`;
}

function formatTakeProfitLineSim(
  takeProfit: SimPricedOrder,
  messages: SimExecutionMessages,
): string {
  return formatExecutionLineSim({
    label: messages[SIM_EXECUTION_MESSAGE_IDS.takeProfit],
    price: takeProfit.price,
    quantity: takeProfit.quantity,
    sharesUnit: messages[SIM_EXECUTION_MESSAGE_IDS.sharesUnit],
  });
}

function buildExecutableBrokerOrdersSim(
  execution: SimExecutionResult,
): SimBrokerOrder[] {
  const orders: SimBrokerOrder[] = [];

  if (execution.executableLowLoc != null) {
    orders.push({
      type: 'LIMIT',
      price: execution.executableLowLoc.price,
      quantity: execution.executableLowLoc.quantity,
    });
  }

  if (execution.executableMocBuy != null) {
    orders.push({
      type: 'MARKET_ON_CLOSE',
      quantity: execution.executableMocBuy.quantity,
    });
  }

  if (orders.length === 0) {
    throw new Error(NO_STOP_EXECUTION_ERROR_NO_EXECUTABLE_ORDERS);
  }

  return orders;
}

function createNoStopHookViewModelSim(
  execution: SimExecutionResult,
  executeBrokerOrders: SimBrokerExecutor = async () => {},
): SimNoStopHookViewModel {
  let isExecuting = false;

  return {
    progressPct: execution.progressPct,
    isFirstBuy: execution.isFirstBuy,
    isSplitComplete: execution.isSplitComplete,
    displayLowLoc: execution.displayLowLoc,
    displayMocBuy: execution.displayMocBuy,
    takeProfit: execution.takeProfit,
    onExecute: async () => {
      if (isExecuting) {
        return;
      }

      isExecuting = true;

      try {
        const orders = buildExecutableBrokerOrdersSim(execution);
        await Promise.resolve(executeBrokerOrders(orders));
      } finally {
        isExecuting = false;
      }
    },
  };
}

function hasSameHookDependenciesSim(
  previousArgs: SimUseNoStopExecutionArgs | null,
  nextArgs: SimUseNoStopExecutionArgs,
): boolean {
  if (previousArgs == null) {
    return false;
  }

  return (
    previousArgs.trades === nextArgs.trades &&
    previousArgs.oneTimeAmount === nextArgs.oneTimeAmount &&
    previousArgs.feeRate === nextArgs.feeRate &&
    previousArgs.currentPrice === nextArgs.currentPrice &&
    previousArgs.strategy === nextArgs.strategy
  );
}

function createNoStopHookRendererSim(
  executeBrokerOrders: SimBrokerExecutor = async () => {},
): (args: SimUseNoStopExecutionArgs) => SimNoStopHookViewModel {
  let previousArgs: SimUseNoStopExecutionArgs | null = null;
  let previousExecution: SimExecutionResult | null = null;
  let previousOnExecute: SimNoStopHookViewModel['onExecute'] | null = null;
  let previousViewModel: SimNoStopHookViewModel | null = null;
  let isExecuting = false;

  return (args: SimUseNoStopExecutionArgs): SimNoStopHookViewModel => {
    const shouldReuseExecution = hasSameHookDependenciesSim(previousArgs, args);
    const execution =
      shouldReuseExecution && previousExecution != null
        ? previousExecution
        : calculateNoStopExecutionSim(args);

    const onExecute =
      shouldReuseExecution && previousOnExecute != null
        ? previousOnExecute
        : async () => {
            if (isExecuting) {
              return;
            }

            isExecuting = true;

            try {
              const orders = buildExecutableBrokerOrdersSim(execution);
              await Promise.resolve(executeBrokerOrders(orders));
            } finally {
              isExecuting = false;
            }
          };

    const shouldReuseViewModel =
      shouldReuseExecution &&
      previousViewModel != null &&
      previousExecution === execution &&
      previousOnExecute === onExecute;

    const viewModel = shouldReuseViewModel
      ? previousViewModel
      : {
          progressPct: execution.progressPct,
          isFirstBuy: execution.isFirstBuy,
          isSplitComplete: execution.isSplitComplete,
          displayLowLoc: execution.displayLowLoc,
          displayMocBuy: execution.displayMocBuy,
          takeProfit: execution.takeProfit,
          onExecute,
        };

    previousArgs = args;
    previousExecution = execution;
    previousOnExecute = onExecute;
    previousViewModel = viewModel;

    return viewModel;
  };
}

function validateTradeInputSim(trade: SimTradeInput, context: string): void {
  validateFinancialArgs(
    {
      price: normalizeMoneyLikeValueSim(trade.price, `${context}.price`),
      quantity: normalizeMoneyLikeValueSim(
        trade.quantity,
        `${context}.quantity`,
      ),
      fee: normalizeMoneyLikeValueSim(trade.fee, `${context}.fee`),
    },
    {
      price: { strictPositive: true },
      quantity: { strictPositive: true },
      fee: { min: 0 },
    },
    context,
  );
}

function calcHoldingsSim(trades: readonly SimTradeInput[]): SimHolding[] {
  const holdingMap = new Map<string, { quantity: number; totalCost: number }>();

  for (const trade of trades) {
    validateTradeInputSim(trade, 'calcHoldingsSim.trade');
    const stock = normalizeTickerSim(trade.stock);
    if (stock.length === 0) {
      continue;
    }

    const quantity = normalizeMoneyLikeValueSim(
      trade.quantity,
      'calcHoldingsSim.trade.quantity',
    );
    const price = normalizeMoneyLikeValueSim(
      trade.price,
      'calcHoldingsSim.trade.price',
    );
    const fee = normalizeMoneyLikeValueSim(
      trade.fee,
      'calcHoldingsSim.trade.fee',
    );
    const previous = holdingMap.get(stock) ?? { quantity: 0, totalCost: 0 };

    if (trade.type === 'buy') {
      previous.quantity += quantity;
      previous.totalCost += price * quantity + fee;
      holdingMap.set(stock, previous);
      continue;
    }

    if (previous.quantity + HOLDINGS_QTY_EPSILON < quantity) {
      throw new Error(
        `[${stock}] oversell in simulation history: tried=${quantity}, current=${previous.quantity}`,
      );
    }

    const currentAvgPrice =
      previous.quantity > HOLDINGS_QTY_EPSILON
        ? previous.totalCost / previous.quantity
        : 0;

    previous.quantity -= quantity;
    if (previous.quantity <= HOLDINGS_QTY_EPSILON) {
      holdingMap.set(stock, { quantity: 0, totalCost: 0 });
      continue;
    }

    previous.totalCost = previous.quantity * currentAvgPrice;
    holdingMap.set(stock, previous);
  }

  return Array.from(holdingMap.entries()).map(([stock, data]) => ({
    stock,
    quantity: data.quantity,
    totalCost: data.totalCost,
    avgPrice:
      data.quantity > HOLDINGS_QTY_EPSILON ? data.totalCost / data.quantity : 0,
  }));
}

function findTargetHoldingSim(
  trades: readonly SimTradeInput[],
  targetStock: string,
): SimHolding | null {
  const normalizedTargetStock = normalizeTickerSim(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  return (
    calcHoldingsSim(trades).find(
      (holding) => normalizeTickerSim(holding.stock) === normalizedTargetStock,
    ) ?? null
  );
}

function calculateNoStopProgressPctSim(args: {
  totalInvested: number;
  oneTimeAmount: number;
  totalSplitCount: number;
}): number {
  const totalInvested = normalizeMoneyLikeValueSim(
    args.totalInvested,
    'calculateNoStopProgressPctSim.totalInvested',
  );
  const oneTimeAmount = normalizeMoneyLikeValueSim(
    args.oneTimeAmount,
    'calculateNoStopProgressPctSim.oneTimeAmount',
  );
  const totalSplitCount = normalizeMoneyLikeValueSim(
    args.totalSplitCount,
    'calculateNoStopProgressPctSim.totalSplitCount',
  );

  validateFinancialArgs(
    {
      totalInvested,
      oneTimeAmount,
      totalSplitCount,
    },
    {
      totalInvested: { min: 0 },
      oneTimeAmount: { strictPositive: true },
      totalSplitCount: { strictPositive: true },
    },
    'calculateNoStopProgressPctSim',
  );

  const totalSeed = oneTimeAmount * totalSplitCount;
  const rawProgressPct =
    (totalInvested / totalSeed) * PERCENT_DENOMINATOR;

  return roundMoney(
    Math.min(
      MAX_PROGRESS_PERCENT,
      Math.max(MIN_PROGRESS_PERCENT, rawProgressPct),
    ),
  );
}

function calculateLocUnitCostSim(avgPrice: number, feeRate: number): number {
  validateFinancialArgs(
    { avgPrice, feeRate },
    {
      avgPrice: { strictPositive: true },
      feeRate: { min: 0 },
    },
    'calculateLocUnitCostSim',
  );

  return avgPrice * (1 + feeRate / PERCENT_DENOMINATOR);
}

function calculateMocUnitCostSim(currentPrice: number): number {
  validateFinancialArgs(
    { currentPrice },
    { currentPrice: { strictPositive: true } },
    'calculateMocUnitCostSim',
  );

  return currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
}

function calculateCurrentEngineAllocationSim(args: {
  oneTimeAmount: number;
  feeRate: number;
  avgPrice: number;
  currentPrice: number;
  appliedLocRatio: number;
}): SimBudgetAllocation {
  const locUnitCost = calculateLocUnitCostSim(args.avgPrice, args.feeRate);
  const mocUnitCost = calculateMocUnitCostSim(args.currentPrice);
  const baseLocBudget =
    args.oneTimeAmount * (args.appliedLocRatio / PERCENT_DENOMINATOR);
  const finalLocQuantity = floorSafeQuantitySim(baseLocBudget / locUnitCost);
  const usedLocCost = finalLocQuantity * locUnitCost;
  const mocBudget = Math.max(0, args.oneTimeAmount - usedLocCost);
  const finalMocQuantity = floorSafeQuantitySim(mocBudget / mocUnitCost);

  return {
    finalLocQuantity,
    finalMocQuantity,
  };
}

function calculateMocFirstRemainingToLocAllocationSim(args: {
  oneTimeAmount: number;
  feeRate: number;
  avgPrice: number;
  currentPrice: number;
  appliedLocRatio: number;
}): SimBudgetAllocation {
  const oneTimeAmount = normalizeMoneyLikeValueSim(
    args.oneTimeAmount,
    'calculateMocFirstRemainingToLocAllocationSim.oneTimeAmount',
  );
  const feeRate = normalizeMoneyLikeValueSim(
    args.feeRate,
    'calculateMocFirstRemainingToLocAllocationSim.feeRate',
  );
  const avgPrice = normalizeMoneyLikeValueSim(
    args.avgPrice,
    'calculateMocFirstRemainingToLocAllocationSim.avgPrice',
  );
  const currentPrice = normalizeMoneyLikeValueSim(
    args.currentPrice,
    'calculateMocFirstRemainingToLocAllocationSim.currentPrice',
  );
  const appliedLocRatio = normalizeMoneyLikeValueSim(
    args.appliedLocRatio,
    'calculateMocFirstRemainingToLocAllocationSim.appliedLocRatio',
  );

  validateFinancialArgs(
    {
      oneTimeAmount,
      feeRate,
      avgPrice,
      currentPrice,
      appliedLocRatio,
    },
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      avgPrice: { strictPositive: true },
      currentPrice: { strictPositive: true },
      appliedLocRatio: { min: 0, max: PERCENT_DENOMINATOR },
    },
    'calculateMocFirstRemainingToLocAllocationSim',
  );

  if (appliedLocRatio > PERCENT_DENOMINATOR) {
    throw new Error(
      `calculateMocFirstRemainingToLocAllocationSim.appliedLocRatio must be <= ${PERCENT_DENOMINATOR}`,
    );
  }

  const locUnitCost = calculateLocUnitCostSim(avgPrice, feeRate);
  const mocUnitCost = calculateMocUnitCostSim(currentPrice);
  const baseLocBudget =
    oneTimeAmount * (appliedLocRatio / PERCENT_DENOMINATOR);
  const baseMocBudget = Math.max(0, oneTimeAmount - baseLocBudget);
  const finalMocQuantity = floorSafeQuantitySim(baseMocBudget / mocUnitCost);
  const usedMocCost = finalMocQuantity * mocUnitCost;
  const remainingForLoc = Math.max(0, oneTimeAmount - usedMocCost);
  const finalLocQuantity = floorSafeQuantitySim(remainingForLoc / locUnitCost);

  return {
    finalLocQuantity,
    finalMocQuantity,
  };
}

function calculateNoStopExecutionSim(args: {
  trades: readonly SimTradeInput[];
  oneTimeAmount: number;
  feeRate: number;
  currentPrice: number;
  strategy: SimNoStopStrategy;
}): SimExecutionResult {
  const oneTimeAmount = normalizeMoneyLikeValueSim(
    args.oneTimeAmount,
    'calculateNoStopExecutionSim.oneTimeAmount',
  );
  const feeRate = normalizeMoneyLikeValueSim(
    args.feeRate,
    'calculateNoStopExecutionSim.feeRate',
  );
  const currentPrice = normalizeMoneyLikeValueSim(
    args.currentPrice,
    'calculateNoStopExecutionSim.currentPrice',
  );

  validateFinancialArgs(
    {
      oneTimeAmount,
      feeRate,
      currentPrice,
      appliedLocRatio: normalizeMoneyLikeValueSim(
        args.strategy.appliedLocRatio,
        'calculateNoStopExecutionSim.appliedLocRatio',
      ),
      takeProfitPct: normalizeMoneyLikeValueSim(
        args.strategy.takeProfitPct,
        'calculateNoStopExecutionSim.takeProfitPct',
      ),
      totalSplitCount: normalizeMoneyLikeValueSim(
        args.strategy.totalSplitCount,
        'calculateNoStopExecutionSim.totalSplitCount',
      ),
    },
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      currentPrice: { strictPositive: true },
      appliedLocRatio: { min: 0, max: PERCENT_DENOMINATOR },
      takeProfitPct: { min: 0 },
      totalSplitCount: { strictPositive: true },
    },
    'calculateNoStopExecutionSim',
  );

  if (args.strategy.appliedLocRatio > PERCENT_DENOMINATOR) {
    throw new Error(
      `calculateNoStopExecutionSim.appliedLocRatio must be <= ${PERCENT_DENOMINATOR}`,
    );
  }

  const targetHolding = findTargetHoldingSim(
    args.trades,
    args.strategy.targetStock,
  );
  const totalInvested = targetHolding?.totalCost ?? 0;
  const currentQuantity = targetHolding?.quantity ?? 0;
  const avgPrice = targetHolding?.avgPrice ?? 0;
  const totalSeed = oneTimeAmount * args.strategy.totalSplitCount;
  const isFirstBuy =
    !(currentQuantity > HOLDINGS_QTY_EPSILON && avgPrice > HOLDINGS_QTY_EPSILON);
  const isSplitComplete = totalInvested + HOLDINGS_QTY_EPSILON >= totalSeed;
  const result: SimExecutionResult = {
    progressPct: calculateNoStopProgressPctSim({
      totalInvested,
      oneTimeAmount,
      totalSplitCount: args.strategy.totalSplitCount,
    }),
    isFirstBuy,
    isSplitComplete,
  };

  if (isFirstBuy) {
    return result;
  }

  result.takeProfit = deriveExecutableOrderSim(
    buildOrderEntryAllowZeroSim(
      avgPrice * (1 + args.strategy.takeProfitPct / PERCENT_DENOMINATOR),
      currentQuantity,
    ),
  );

  if (isSplitComplete) {
    return result;
  }

  const allocation = calculateMocFirstRemainingToLocAllocationSim({
    oneTimeAmount,
    feeRate,
    avgPrice,
    currentPrice,
    appliedLocRatio: args.strategy.appliedLocRatio,
  });

  const displayLowLoc = buildOrderEntryAllowZeroSim(
    avgPrice,
    allocation.finalLocQuantity,
  );
  const displayMocBuy = buildQuantityOnlyOrderAllowZeroSim(
    allocation.finalMocQuantity,
  );
  result.displayLowLoc = displayLowLoc;
  result.displayMocBuy = displayMocBuy;
  result.executableLowLoc = deriveExecutableOrderSim(displayLowLoc);
  result.executableMocBuy = deriveExecutableOrderSim(displayMocBuy);

  return result;
}

function buildNoStopExecutionSummaryLinesSim(
  execution: SimExecutionResult,
  messages: SimExecutionMessages = SIM_EXECUTION_MESSAGES_KO,
): string[] {
  const lines = [
    `${messages[SIM_EXECUTION_MESSAGE_IDS.strategyProgress]}: ${execution.progressPct}%`,
  ];

  if (execution.isFirstBuy) {
    lines.push(messages[SIM_EXECUTION_MESSAGE_IDS.firstBuyHint]);
    return lines;
  }

  if (execution.isSplitComplete) {
    if (execution.takeProfit != null) {
      lines.push(formatTakeProfitLineSim(execution.takeProfit, messages));
    }
    lines.push(messages[SIM_EXECUTION_MESSAGE_IDS.splitComplete]);
    return lines;
  }

  if (execution.displayLowLoc != null) {
    lines.push(
      formatExecutionLineSim({
        label: messages[SIM_EXECUTION_MESSAGE_IDS.lowLoc],
        price: execution.displayLowLoc.price,
        quantity: execution.displayLowLoc.quantity,
        sharesUnit: messages[SIM_EXECUTION_MESSAGE_IDS.sharesUnit],
      }),
    );
  }

  if (execution.displayMocBuy != null) {
    lines.push(
      formatExecutionLineSim({
        label: messages[SIM_EXECUTION_MESSAGE_IDS.mocBuy],
        quantity: execution.displayMocBuy.quantity,
        sharesUnit: messages[SIM_EXECUTION_MESSAGE_IDS.sharesUnit],
      }),
    );
  }

  if (execution.takeProfit != null) {
    lines.push(formatTakeProfitLineSim(execution.takeProfit, messages));
  }

  return lines;
}

function createActiveHoldingScenarioTradesSim(
  avgPrice: number = 100,
  quantity: number = 10,
): SimTradeInput[] {
  return [
    {
      type: 'buy',
      stock: 'TQQQ',
      price: avgPrice,
      quantity,
      fee: 0,
    },
  ];
}

export function simulateCurrentEngineBaselineConsumesLocLeftoverIntoMoc(): void {
  const allocation = calculateCurrentEngineAllocationSim({
    oneTimeAmount: 1000,
    feeRate: 0.25,
    avgPrice: 100,
    currentPrice: 80,
    appliedLocRatio: 50,
  });

  assertEqual(allocation.finalLocQuantity, 4, 'current engine LOC quantity');
  assertEqual(allocation.finalMocQuantity, 6, 'current engine MOC quantity');
}

export function simulateCeoEdgeCaseUsesMocFirstThenRemainingToLoc(): void {
  const allocation = calculateMocFirstRemainingToLocAllocationSim({
    oneTimeAmount: 100,
    feeRate: 0,
    avgPrice: 30,
    currentPrice: 30,
    appliedLocRatio: 50,
  });

  assertEqual(allocation.finalLocQuantity, 2, 'CEO edge case final LOC quantity');
  assertEqual(allocation.finalMocQuantity, 1, 'CEO edge case final MOC quantity');
}

export function simulateRemainingToLocKeepsBaseMocQuantityUntouched(): void {
  const allocation = calculateMocFirstRemainingToLocAllocationSim({
    oneTimeAmount: 100,
    feeRate: 0,
    avgPrice: 30,
    currentPrice: 30,
    appliedLocRatio: 50,
  });

  const expectedMocQuantity = floorSafeQuantitySim(
    (100 - 100 * (50 / PERCENT_DENOMINATOR)) / calculateMocUnitCostSim(30),
  );

  assertEqual(
    allocation.finalMocQuantity,
    expectedMocQuantity,
    'leftover sweep must not inflate MOC quantity',
  );
}

export function simulateZeroShareSummaryLinesStayVisibleWhenBudgetBelowPrice(): void {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 1),
    oneTimeAmount: 20,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });
  const lines = buildNoStopExecutionSummaryLinesSim(execution);

  assertEqual(execution.displayLowLoc?.quantity, 0, 'zero-share display LOC quantity');
  assertEqual(execution.displayMocBuy?.quantity, 0, 'zero-share display MOC quantity');
  assertEqual(execution.executableLowLoc, undefined, 'zero-share executable LOC blocked');
  assertEqual(execution.executableMocBuy, undefined, 'zero-share executable MOC blocked');
  assertTruthy(
    lines.includes('평단가 매수 (LOC): $100.00 / 0주'),
    'summary keeps zero-share LOC line',
  );
  assertTruthy(
    lines.includes('분할 매수 (MOC): 0주'),
    'summary keeps zero-share MOC line',
  );
}

export function simulateExecutableOrdersReuseDisplayReferences(): void {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 10),
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });

  assertTruthy(
    execution.displayLowLoc === execution.executableLowLoc,
    'executable LOC must reuse display LOC reference',
  );
  assertTruthy(
    execution.displayMocBuy === execution.executableMocBuy,
    'executable MOC must reuse display MOC reference',
  );
}

export function simulateAppliedLocRatioRejectsValuesAbove100(): void {
  assertThrows(
    () =>
      calculateMocFirstRemainingToLocAllocationSim({
        oneTimeAmount: 100,
        feeRate: 0,
        avgPrice: 30,
        currentPrice: 30,
        appliedLocRatio: 150,
      }),
    'appliedLocRatio above 100 must be rejected',
  );
}

export function simulateHookViewModelHidesExecutableFieldsFromUiSurface(): void {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 1),
    oneTimeAmount: 20,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });
  const hookViewModel = createNoStopHookViewModelSim(execution);

  assertTruthy(
    'displayLowLoc' in hookViewModel,
    'hook view model exposes display LOC data',
  );
  assertTruthy(
    'displayMocBuy' in hookViewModel,
    'hook view model exposes display MOC data',
  );
  assertTruthy(
    !('executableLowLoc' in hookViewModel),
    'hook view model must not expose executable LOC data',
  );
  assertTruthy(
    !('executableMocBuy' in hookViewModel),
    'hook view model must not expose executable MOC data',
  );
}

export function simulateHookRendererReusesReferencesWhenInputsAreStable(): void {
  const renderer = createNoStopHookRendererSim();
  const trades = createActiveHoldingScenarioTradesSim(100, 10);
  const strategy: SimNoStopStrategy = {
    targetStock: 'TQQQ',
    appliedLocRatio: 50,
    takeProfitPct: 10,
    totalSplitCount: 40,
  };

  const firstRender = renderer({
    trades,
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy,
  });
  const secondRender = renderer({
    trades,
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy,
  });

  assertTruthy(
    firstRender === secondRender,
    'hook renderer must reuse the same view model reference',
  );
  assertTruthy(
    firstRender.onExecute === secondRender.onExecute,
    'hook renderer must reuse the same execute callback reference',
  );
}

export async function simulateHookExecuteUsesOnlyExecutableOrders(): Promise<void> {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 10),
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });
  let receivedOrders: readonly SimBrokerOrder[] | null = null;
  const hookViewModel = createNoStopHookViewModelSim(
    execution,
    async (orders) => {
      receivedOrders = [...orders];
    },
  );

  await hookViewModel.onExecute();

  if (receivedOrders == null) {
    throw new Error('expected hook execute to forward broker orders');
  }

  assertEqual(receivedOrders.length, 2, 'hook execute broker order count');
  assertEqual(receivedOrders[0]?.type, 'LIMIT', 'first broker order type');
  assertEqual(receivedOrders[1]?.type, 'MARKET_ON_CLOSE', 'second broker order type');

  const limitOrder = receivedOrders[0];
  if (limitOrder?.type !== 'LIMIT') {
    throw new Error('expected LIMIT order in first broker order slot');
  }

  assertEqual(
    limitOrder.quantity,
    execution.executableLowLoc?.quantity,
    'LIMIT order quantity must come from executable LOC',
  );
  assertEqual(
    limitOrder.price,
    execution.executableLowLoc?.price,
    'LIMIT order price must come from executable LOC',
  );

  const mocOrder = receivedOrders[1];
  if (mocOrder?.type !== 'MARKET_ON_CLOSE') {
    throw new Error('expected MARKET_ON_CLOSE order in second broker order slot');
  }

  assertEqual(
    mocOrder.quantity,
    execution.executableMocBuy?.quantity,
    'MOC order quantity must come from executable MOC',
  );
}

export async function simulateHookExecuteFailsWhenNoExecutableOrdersExist(): Promise<void> {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 1),
    oneTimeAmount: 20,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });
  const hookViewModel = createNoStopHookViewModelSim(execution);

  await assertRejects(
    () => hookViewModel.onExecute(),
    'hook execute must fail without executable orders',
  );
}

export async function simulateHookExecuteMutexBlocksDuplicateSubmit(): Promise<void> {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 10),
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });

  let executeCallCount = 0;
  let releaseExecution: (() => void) | null = null;
  const pendingExecution = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });

  const hookViewModel = createNoStopHookViewModelSim(
    execution,
    async () => {
      executeCallCount += 1;
      await pendingExecution;
    },
  );

  const firstExecution = hookViewModel.onExecute();
  const secondExecution = hookViewModel.onExecute();

  assertEqual(executeCallCount, 1, 'mutex must block duplicate execute submissions');

  if (releaseExecution == null) {
    throw new Error('expected pending execution resolver');
  }

  releaseExecution();
  await firstExecution;
  await secondExecution;

  assertEqual(executeCallCount, 1, 'mutex keeps broker execution single-flight');
}

export function simulateFirstBuyStillShowsHintInsteadOfZeroLines(): void {
  const execution = calculateNoStopExecutionSim({
    trades: [],
    oneTimeAmount: 1000,
    feeRate: 0.25,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 40,
    },
  });
  const lines = buildNoStopExecutionSummaryLinesSim(execution);

  assertTruthy(execution.isFirstBuy, 'first-buy state');
  assertTruthy(
    lines.includes('첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.'),
    'first-buy summary keeps the hint',
  );
  assertTruthy(
    !lines.some((line) => line.includes('0주')),
    'first-buy summary must not render zero-share lines',
  );
}

export function simulateSplitCompleteStillShowsOnlyTakeProfit(): void {
  const execution = calculateNoStopExecutionSim({
    trades: createActiveHoldingScenarioTradesSim(100, 10),
    oneTimeAmount: 1000,
    feeRate: 0,
    currentPrice: 80,
    strategy: {
      targetStock: 'TQQQ',
      appliedLocRatio: 50,
      takeProfitPct: 10,
      totalSplitCount: 1,
    },
  });
  const lines = buildNoStopExecutionSummaryLinesSim(execution);

  assertTruthy(execution.isSplitComplete, 'split-complete state');
  assertTruthy(
    lines.includes('익절 목표: $110.00 / 10주'),
    'split-complete summary keeps take-profit',
  );
  assertTruthy(
    !lines.some((line) => line.includes('평단가 매수 (LOC)')),
    'split-complete summary removes LOC lines',
  );
  assertTruthy(
    !lines.some((line) => line.includes('분할 매수 (MOC)')),
    'split-complete summary removes MOC lines',
  );
}
