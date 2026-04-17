/**
 * Sell quantity guard simulation snippets
 *
 * Purpose:
 * - verify manual sell quantity caps before production edits
 * - validate selected AI trades only, in the same order they will be saved
 * - keep the harness self-contained and easy to run in isolation
 */

const HOLDINGS_QTY_EPSILON = 1e-10;
const MAX_SHARE_DECIMAL_PLACES = 4;
const SHARE_DECIMAL_SCALE = 10 ** MAX_SHARE_DECIMAL_PLACES;

type SimTradeType = 'buy' | 'sell';

interface SimFinancialArgRule {
  min?: number;
  strictPositive?: boolean;
}

interface SimTrade {
  id: string;
  type: SimTradeType;
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean;
}

interface SimRecognizedTradeItem {
  type: SimTradeType;
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee?: number;
  isMOC?: boolean;
}

interface SimSellQuantityLimitViolation {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
  tradeIndex?: number;
}

interface SimTradeMessages {
  chooseStockFirst: string;
  invalidPrice: string;
  invalidQuantity: string;
  noHoldings: string;
  zeroQuantityBudgetLocked: string;
  sellQuantityExceedsHoldings: (
    availableQuantityText: string,
    requestedQuantityText: string,
  ) => string;
}

interface SimAiMessages {
  sellQuantityExceedsHoldings: (
    stock: string,
    availableQuantityText: string,
    requestedQuantityText: string,
  ) => string;
}

interface SimAiConfirmResult {
  didSave: boolean;
  errorMessage: string | null;
  savedTradeCount: number;
}

interface SimLookupCounter {
  count: number;
}

interface SimDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface SimAiSaveState {
  isSaving: boolean;
  errorMessage: string | null;
  closeCount: number;
}

const SIM_TRADE_MESSAGES: SimTradeMessages = {
  chooseStockFirst: '먼저 종목을 선택해주세요.',
  invalidPrice: '체결 단가는 0보다 커야 합니다.',
  invalidQuantity: '수량은 0보다 커야 합니다.',
  noHoldings: '매도 가능한 보유 종목이 없습니다.',
  zeroQuantityBudgetLocked:
    '현재 예산과 수수료율 기준으로 계산된 매수 수량이 0주입니다.',
  sellQuantityExceedsHoldings: (availableQuantityText, requestedQuantityText) =>
    `현재 보유 ${availableQuantityText}주를 초과한 ${requestedQuantityText}주 매도는 저장할 수 없습니다.`,
};

const SIM_AI_MESSAGES: SimAiMessages = {
  sellQuantityExceedsHoldings: (
    stock,
    availableQuantityText,
    requestedQuantityText,
  ) =>
    `${stock} 보유 ${availableQuantityText}주를 초과한 ${requestedQuantityText}주 매도는 저장할 수 없습니다. 선택한 거래를 조정해주세요.`,
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

function createDeferredSim<T>(): SimDeferred<T> {
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

function validateFinancialArgsSim(
  args: Record<string, number>,
  rules: Record<string, SimFinancialArgRule>,
  context: string,
): void {
  const prefix = `[sell-guard-sim] ${context}: `;

  for (const [name, value] of Object.entries(args)) {
    const rule = rules[name];
    if (rule == null) {
      throw new Error(`${prefix}missing rule for ${name}`);
    }

    if (!Number.isFinite(value)) {
      throw new Error(`${prefix}${name} must be finite`);
    }

    if (rule.strictPositive && value <= 0) {
      throw new Error(`${prefix}${name} must be > 0`);
    }

    if (rule.min != null && value < rule.min) {
      throw new Error(`${prefix}${name} must be >= ${rule.min}`);
    }
  }
}

function normalizeTradeStockSim(stock: string): string {
  return stock.trim().toUpperCase();
}

function normalizeTradeQuantitySim(quantity: number): number {
  const normalizedQuantity = Math.abs(Number(quantity));
  validateFinancialArgsSim(
    { quantity: normalizedQuantity },
    { quantity: { strictPositive: true } },
    'normalizeTradeQuantitySim',
  );
  return normalizedQuantity;
}

function roundShareQuantitySim(quantity: number): number {
  return (
    Math.round((quantity + Number.EPSILON) * SHARE_DECIMAL_SCALE) /
    SHARE_DECIMAL_SCALE
  );
}

function formatShareQuantitySim(quantity: number): string {
  const roundedQuantity = roundShareQuantitySim(quantity);
  if (Number.isInteger(roundedQuantity)) {
    return String(roundedQuantity);
  }

  return roundedQuantity
    .toFixed(MAX_SHARE_DECIMAL_PLACES)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function getChronologicalTradesSim(trades: readonly SimTrade[]): SimTrade[] {
  // 최신 거래를 배열 앞에 두는 현재 저장 방식에서도, holdings 계산은 시간순으로
  // 동작해야 초과 매도 검증이 흔들리지 않습니다.
  return [...trades]
    .reverse()
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildHoldingQuantityMapSim(
  existingTrades: readonly SimTrade[],
): Map<string, number> {
  const quantityMap = new Map<string, number>();

  for (const trade of getChronologicalTradesSim(existingTrades)) {
    const stock = normalizeTradeStockSim(trade.stock);
    if (stock.length === 0) {
      continue;
    }

    const quantity = normalizeTradeQuantitySim(trade.quantity);
    const currentQuantity = quantityMap.get(stock) ?? 0;

    if (trade.type === 'buy') {
      quantityMap.set(stock, currentQuantity + quantity);
      continue;
    }

    if (currentQuantity + HOLDINGS_QTY_EPSILON < quantity) {
      throw new Error(
        `[${stock}] oversell in existing history: tried=${quantity}, current=${currentQuantity}`,
      );
    }

    const nextQuantity = currentQuantity - quantity;
    if (nextQuantity <= HOLDINGS_QTY_EPSILON) {
      quantityMap.set(stock, 0);
      continue;
    }

    quantityMap.set(stock, nextQuantity);
  }

  return quantityMap;
}

function getHoldingQuantityForStockSim(
  existingTrades: readonly SimTrade[],
  stock: string,
): number {
  const normalizedStock = normalizeTradeStockSim(stock);
  if (normalizedStock.length === 0) {
    return 0;
  }

  return buildHoldingQuantityMapSim(existingTrades).get(normalizedStock) ?? 0;
}

function createAvailableSellQuantitySelectorSim(): (args: {
  tradeType: SimTradeType;
  selectedStock: string;
  trades: readonly SimTrade[];
  counter?: SimLookupCounter;
}) => number {
  let previousTradeType: SimTradeType | null = null;
  let previousSelectedStock = '';
  let previousTrades: readonly SimTrade[] | null = null;
  let previousResult = 0;

  return ({ tradeType, selectedStock, trades, counter }) => {
    const canReuseCachedResult =
      previousTradeType === tradeType &&
      previousSelectedStock === selectedStock &&
      previousTrades === trades;

    if (canReuseCachedResult) {
      return previousResult;
    }

    previousTradeType = tradeType;
    previousSelectedStock = selectedStock;
    previousTrades = trades;

    if (tradeType !== 'sell' || selectedStock === '') {
      previousResult = 0;
      return previousResult;
    }

    if (counter != null) {
      counter.count += 1;
    }

    previousResult = getHoldingQuantityForStockSim(trades, selectedStock);
    return previousResult;
  };
}

function getSellQuantityLimitViolationSim(args: {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
}): SimSellQuantityLimitViolation | null {
  const normalizedStock = normalizeTradeStockSim(args.stock);
  const availableQuantity = Math.max(0, args.availableQuantity);
  const requestedQuantity = normalizeTradeQuantitySim(args.requestedQuantity);

  validateFinancialArgsSim(
    { availableQuantity },
    { availableQuantity: { min: 0 } },
    'getSellQuantityLimitViolationSim',
  );

  if (normalizedStock.length === 0) {
    return null;
  }

  if (requestedQuantity <= availableQuantity + HOLDINGS_QTY_EPSILON) {
    return null;
  }

  return {
    stock: normalizedStock,
    availableQuantity,
    requestedQuantity,
  };
}

function validateSelectedTradesAgainstHoldingsSim(
  existingTrades: readonly SimTrade[],
  selectedTrades: readonly Pick<SimTrade, 'type' | 'stock' | 'quantity'>[],
): SimSellQuantityLimitViolation | null {
  const holdingQuantityMap = buildHoldingQuantityMapSim(existingTrades);

  for (let index = 0; index < selectedTrades.length; index += 1) {
    const trade = selectedTrades[index];
    const stock = normalizeTradeStockSim(trade.stock);
    const quantity = normalizeTradeQuantitySim(trade.quantity);
    const currentQuantity = holdingQuantityMap.get(stock) ?? 0;

    if (trade.type === 'buy') {
      holdingQuantityMap.set(stock, currentQuantity + quantity);
      continue;
    }

    const violation = getSellQuantityLimitViolationSim({
      stock,
      availableQuantity: currentQuantity,
      requestedQuantity: quantity,
    });

    if (violation != null) {
      return {
        ...violation,
        tradeIndex: index,
      };
    }

    holdingQuantityMap.set(stock, currentQuantity - quantity);
  }

  return null;
}

function buildManualValidationMessageSim(args: {
  existingTrades: readonly SimTrade[];
  tradeType: SimTradeType;
  selectedStock: string;
  price: number;
  quantity: number;
  messages: SimTradeMessages;
  isAutoBuyQuantityZero?: boolean;
  availableQuantityLookup?: (args: {
    existingTrades: readonly SimTrade[];
    selectedStock: string;
  }) => number;
}): string | null {
  const {
    existingTrades,
    tradeType,
    selectedStock,
    price,
    quantity,
    messages,
    isAutoBuyQuantityZero = false,
    availableQuantityLookup,
  } = args;

  if (selectedStock.trim().length === 0) {
    if (tradeType === 'sell') {
      return messages.noHoldings;
    }
    return messages.chooseStockFirst;
  }

  if (!Number.isFinite(price) || price <= 0) {
    return messages.invalidPrice;
  }

  if (tradeType === 'buy' && isAutoBuyQuantityZero) {
    return messages.zeroQuantityBudgetLocked;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return messages.invalidQuantity;
  }

  if (tradeType !== 'sell') {
    return null;
  }

  const availableQuantity =
    availableQuantityLookup?.({
      existingTrades,
      selectedStock,
    }) ?? getHoldingQuantityForStockSim(existingTrades, selectedStock);
  const violation = getSellQuantityLimitViolationSim({
    stock: selectedStock,
    availableQuantity,
    requestedQuantity: quantity,
  });

  if (violation == null) {
    return null;
  }

  return messages.sellQuantityExceedsHoldings(
    formatShareQuantitySim(violation.availableQuantity),
    formatShareQuantitySim(violation.requestedQuantity),
  );
}

function toSimTrade(
  recognizedTrade: SimRecognizedTradeItem,
  index: number,
): SimTrade {
  return {
    id: `recognized-${index}`,
    type: recognizedTrade.type,
    stock: recognizedTrade.stock,
    date: recognizedTrade.date,
    price: recognizedTrade.price,
    quantity: recognizedTrade.quantity,
    fee: recognizedTrade.fee ?? 0,
    isMOC: recognizedTrade.isMOC,
  };
}

function selectRecognizedTradesSim(args: {
  recognizedTrades: readonly SimRecognizedTradeItem[];
  selectedIndexes: ReadonlySet<number>;
}): SimTrade[] {
  const { recognizedTrades, selectedIndexes } = args;

  return recognizedTrades
    .map((recognizedTrade, index) => ({ recognizedTrade, index }))
    .filter(({ index }) => selectedIndexes.has(index))
    .map(({ recognizedTrade, index }) => toSimTrade(recognizedTrade, index));
}

function handleAiConfirmSaveSim(args: {
  existingTrades: readonly SimTrade[];
  recognizedTrades: readonly SimRecognizedTradeItem[];
  selectedIndexes: ReadonlySet<number>;
  messages: SimAiMessages;
}): SimAiConfirmResult {
  const { existingTrades, recognizedTrades, selectedIndexes, messages } = args;
  const selectedTrades = selectRecognizedTradesSim({
    recognizedTrades,
    selectedIndexes,
  });

  if (selectedTrades.length === 0) {
    return {
      didSave: false,
      errorMessage: null,
      savedTradeCount: 0,
    };
  }

  const violation = validateSelectedTradesAgainstHoldingsSim(
    existingTrades,
    selectedTrades,
  );

  if (violation != null) {
    return {
      didSave: false,
      errorMessage: messages.sellQuantityExceedsHoldings(
        violation.stock,
        formatShareQuantitySim(violation.availableQuantity),
        formatShareQuantitySim(violation.requestedQuantity),
      ),
      savedTradeCount: 0,
    };
  }

  return {
    didSave: true,
    errorMessage: null,
    savedTradeCount: selectedTrades.length,
  };
}

async function handleAiConfirmSaveWithMutexSim(args: {
  saveState: SimAiSaveState;
  existingTrades: readonly SimTrade[];
  recognizedTrades: readonly SimRecognizedTradeItem[];
  selectedIndexes: ReadonlySet<number>;
  messages: SimAiMessages;
  onSave: (selectedTrades: readonly SimTrade[]) => Promise<void>;
}): Promise<void> {
  const {
    saveState,
    existingTrades,
    recognizedTrades,
    selectedIndexes,
    messages,
    onSave,
  } = args;

  if (saveState.isSaving) {
    return;
  }

  const selectedTrades = selectRecognizedTradesSim({
    recognizedTrades,
    selectedIndexes,
  });
  if (selectedTrades.length === 0) {
    saveState.closeCount += 1;
    return;
  }

  const violation = validateSelectedTradesAgainstHoldingsSim(
    existingTrades,
    selectedTrades,
  );
  if (violation != null) {
    saveState.errorMessage = messages.sellQuantityExceedsHoldings(
      violation.stock,
      formatShareQuantitySim(violation.availableQuantity),
      formatShareQuantitySim(violation.requestedQuantity),
    );
    return;
  }

  saveState.isSaving = true;

  try {
    saveState.errorMessage = null;
    await Promise.resolve(onSave(selectedTrades));
    saveState.closeCount += 1;
  } catch (error: unknown) {
    saveState.errorMessage = 'AI_SAVE_FAILED';
  } finally {
    saveState.isSaving = false;
  }
}

function makeSimTrade(args: {
  id: string;
  type: SimTradeType;
  stock: string;
  date: string;
  quantity: number;
  price?: number;
  fee?: number;
}): SimTrade {
  return {
    id: args.id,
    type: args.type,
    stock: args.stock,
    date: args.date,
    quantity: args.quantity,
    price: args.price ?? 100,
    fee: args.fee ?? 0,
  };
}

export function simulateChronologicalHoldingQuantity(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'sell-latest',
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      quantity: 4,
    }),
    makeSimTrade({
      id: 'buy-oldest',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];

  const availableQuantity = getHoldingQuantityForStockSim(existingTrades, 'qqq');
  assertEqual(availableQuantity, 6, 'chronological holding quantity');
}

export function simulateQuickInputSellLimit(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'sell-latest',
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      quantity: 4,
    }),
    makeSimTrade({
      id: 'buy-oldest',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];

  const validationMessage = buildManualValidationMessageSim({
    existingTrades,
    tradeType: 'sell',
    selectedStock: 'QQQ',
    price: 101,
    quantity: 7,
    messages: SIM_TRADE_MESSAGES,
  });

  assertEqual(
    validationMessage,
    SIM_TRADE_MESSAGES.sellQuantityExceedsHoldings('6', '7'),
    'quick input sell cap',
  );
}

export function simulateTradeExecutionSellLimit(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'TQQQ',
      date: '2026-04-10',
      quantity: 3,
    }),
  ];

  const validationMessage = buildManualValidationMessageSim({
    existingTrades,
    tradeType: 'sell',
    selectedStock: 'TQQQ',
    price: 99,
    quantity: 5,
    messages: SIM_TRADE_MESSAGES,
  });

  assertEqual(
    validationMessage,
    SIM_TRADE_MESSAGES.sellQuantityExceedsHoldings('3', '5'),
    'trade execution sell cap',
  );
}

export function simulateExactSellPass(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 6,
    }),
  ];

  const validationMessage = buildManualValidationMessageSim({
    existingTrades,
    tradeType: 'sell',
    selectedStock: 'QQQ',
    price: 103,
    quantity: 6,
    messages: SIM_TRADE_MESSAGES,
  });

  assertEqual(validationMessage, null, 'exact sell pass');
}

export function simulateFloatingPointSellPass(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10.333,
    }),
  ];

  const validationMessage = buildManualValidationMessageSim({
    existingTrades,
    tradeType: 'sell',
    selectedStock: 'QQQ',
    price: 104,
    quantity: 10.3330000000001,
    messages: SIM_TRADE_MESSAGES,
  });

  assertEqual(validationMessage, null, 'floating point full sell pass');
}

export function simulateNoHoldingsMessagePriority(): void {
  const validationMessage = buildManualValidationMessageSim({
    existingTrades: [],
    tradeType: 'sell',
    selectedStock: '',
    price: 100,
    quantity: 99,
    messages: SIM_TRADE_MESSAGES,
  });

  assertEqual(
    validationMessage,
    SIM_TRADE_MESSAGES.noHoldings,
    'no holdings priority',
  );
}

export function simulateLazyValidationSkipsOversellLookup(): void {
  let lookupCount = 0;

  const validationMessage = buildManualValidationMessageSim({
    existingTrades: [
      makeSimTrade({
        id: 'buy',
        type: 'buy',
        stock: 'QQQ',
        date: '2026-04-15',
        quantity: 10,
      }),
    ],
    tradeType: 'sell',
    selectedStock: 'QQQ',
    price: 0,
    quantity: 20,
    messages: SIM_TRADE_MESSAGES,
    availableQuantityLookup: ({ existingTrades, selectedStock }) => {
      lookupCount += 1;
      return getHoldingQuantityForStockSim(existingTrades, selectedStock);
    },
  });

  assertEqual(
    validationMessage,
    SIM_TRADE_MESSAGES.invalidPrice,
    'lazy validation invalid price',
  );
  assertEqual(lookupCount, 0, 'lazy validation lookup count');
}

export function simulateMemoizedAvailableSellQuantity(): void {
  const selector = createAvailableSellQuantitySelectorSim();
  const counter: SimLookupCounter = { count: 0 };
  const trades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];

  const first = selector({
    tradeType: 'sell',
    selectedStock: 'QQQ',
    trades,
    counter,
  });
  const second = selector({
    tradeType: 'sell',
    selectedStock: 'QQQ',
    trades,
    counter,
  });
  const third = selector({
    tradeType: 'sell',
    selectedStock: 'TQQQ',
    trades,
    counter,
  });

  assertEqual(first, 10, 'memo selector first result');
  assertEqual(second, 10, 'memo selector cached result');
  assertEqual(third, 0, 'memo selector changed stock result');
  assertEqual(counter.count, 2, 'memo selector recompute count');
}

export function simulateAiSelectedTradesOnly(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];

  const recognizedTrades: SimRecognizedTradeItem[] = [
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 110,
      quantity: 8,
    },
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 111,
      quantity: 5,
    },
    {
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 102,
      quantity: 3,
    },
  ];

  const result = handleAiConfirmSaveSim({
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0, 2]),
    messages: SIM_AI_MESSAGES,
  });

  assertTruthy(result.didSave, 'AI selected-only save');
  assertEqual(result.errorMessage, null, 'AI selected-only error');
  assertEqual(result.savedTradeCount, 2, 'AI selected-only trade count');
}

export function simulateAiSequentialOversellBlock(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];

  const recognizedTrades: SimRecognizedTradeItem[] = [
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 110,
      quantity: 8,
    },
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 111,
      quantity: 5,
    },
  ];

  const result = handleAiConfirmSaveSim({
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0, 1]),
    messages: SIM_AI_MESSAGES,
  });

  assertEqual(result.didSave, false, 'AI sequential oversell blocked');
  assertEqual(result.savedTradeCount, 0, 'AI blocked trade count');
  assertEqual(
    result.errorMessage,
    SIM_AI_MESSAGES.sellQuantityExceedsHoldings('QQQ', '2', '5'),
    'AI sequential oversell message',
  );
}

export function simulateAiBuyThenSellPass(): void {
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy-existing',
      type: 'buy',
      stock: 'TQQQ',
      date: '2026-04-15',
      quantity: 2,
    }),
  ];

  const recognizedTrades: SimRecognizedTradeItem[] = [
    {
      type: 'buy',
      stock: 'TQQQ',
      date: '2026-04-16',
      price: 90,
      quantity: 3,
    },
    {
      type: 'sell',
      stock: 'TQQQ',
      date: '2026-04-16',
      price: 95,
      quantity: 4,
    },
  ];

  const result = handleAiConfirmSaveSim({
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0, 1]),
    messages: SIM_AI_MESSAGES,
  });

  assertTruthy(result.didSave, 'AI buy then sell pass');
  assertEqual(result.errorMessage, null, 'AI buy then sell error');
  assertEqual(result.savedTradeCount, 2, 'AI buy then sell count');
}

export async function simulateAiMutexBlocksDoubleClick(): Promise<void> {
  const saveState: SimAiSaveState = {
    isSaving: false,
    errorMessage: null,
    closeCount: 0,
  };
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];
  const recognizedTrades: SimRecognizedTradeItem[] = [
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 110,
      quantity: 5,
    },
  ];
  const deferredSave = createDeferredSim<void>();
  let saveCallCount = 0;

  const firstCall = handleAiConfirmSaveWithMutexSim({
    saveState,
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0]),
    messages: SIM_AI_MESSAGES,
    onSave: async () => {
      saveCallCount += 1;
      await deferredSave.promise;
    },
  });
  const secondCall = handleAiConfirmSaveWithMutexSim({
    saveState,
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0]),
    messages: SIM_AI_MESSAGES,
    onSave: async () => {
      saveCallCount += 1;
      await deferredSave.promise;
    },
  });

  await Promise.resolve();
  assertEqual(saveCallCount, 1, 'AI mutex save call count before resolve');
  assertEqual(saveState.isSaving, true, 'AI mutex locked while saving');

  deferredSave.resolve();
  await Promise.all([firstCall, secondCall]);

  assertEqual(saveCallCount, 1, 'AI mutex final save call count');
  assertEqual(saveState.isSaving, false, 'AI mutex unlocked after save');
  assertEqual(saveState.closeCount, 1, 'AI close count after save');
}

export async function simulateAiMutexUnlocksAfterFailure(): Promise<void> {
  const saveState: SimAiSaveState = {
    isSaving: false,
    errorMessage: null,
    closeCount: 0,
  };
  const existingTrades: SimTrade[] = [
    makeSimTrade({
      id: 'buy',
      type: 'buy',
      stock: 'QQQ',
      date: '2026-04-15',
      quantity: 10,
    }),
  ];
  const recognizedTrades: SimRecognizedTradeItem[] = [
    {
      type: 'sell',
      stock: 'QQQ',
      date: '2026-04-16',
      price: 110,
      quantity: 5,
    },
  ];
  let saveCallCount = 0;

  await handleAiConfirmSaveWithMutexSim({
    saveState,
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0]),
    messages: SIM_AI_MESSAGES,
    onSave: async () => {
      saveCallCount += 1;
      throw new Error('save failed');
    },
  });

  assertEqual(saveCallCount, 1, 'AI failure save call count');
  assertEqual(saveState.isSaving, false, 'AI mutex unlocked after failure');
  assertEqual(saveState.errorMessage, 'AI_SAVE_FAILED', 'AI failure message set');

  await handleAiConfirmSaveWithMutexSim({
    saveState,
    existingTrades,
    recognizedTrades,
    selectedIndexes: new Set<number>([0]),
    messages: SIM_AI_MESSAGES,
    onSave: async () => {
      saveCallCount += 1;
    },
  });

  assertEqual(saveCallCount, 2, 'AI retry save call count');
  assertEqual(saveState.closeCount, 1, 'AI retry close count');
}
