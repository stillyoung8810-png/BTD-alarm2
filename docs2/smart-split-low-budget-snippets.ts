/**
 * 스마트 스플릿 저예산 매수 가이드 시뮬레이션 스니펫.
 *
 * 목적:
 * - 프로덕션 코드 적용 전 `isLowBudget` 상태 확장과 라인 빌더 분기를 검증한다.
 * - 실제 UI/훅/서버 배치 코드는 수정하지 않는다.
 */

const PERCENT_DENOMINATOR = 100;
const MIN_VALID_UNIT_COST = 0.000001;
// MOC 주문은 당일 변동성을 흡수하기 위해 현재가에 15% 여유 버퍼를 둔다.
const MOC_PRICE_BUFFER_MULTIPLIER = 1.15;

type Lang = 'ko' | 'en';

interface MultiSplitDisplayOrderSnippet {
  price: number;
  quantity: number;
}

interface MultiSplitDisplayQuantityOnlyOrderSnippet {
  quantity: number;
}

interface MultiSplitSellGuideSnippet {
  mainTakeProfitQty: number;
  intermediateTakeProfitQty: number;
  riskCutQty: number;
  displayMainTakeProfit?: MultiSplitDisplayOrderSnippet;
  displayIntermediateTakeProfit?: MultiSplitDisplayOrderSnippet;
}

interface MultiSplitGuideStateSnippet {
  cashUsagePct: number;
  totalInvested: number;
  totalSeed: number;
  remainingBudget: number;
  currentQuantity: number;
  avgPrice: number;
  isFirstBuy: boolean;
  isDataError: boolean;
  isSeedExhausted: boolean;
  isLowBudget: boolean;
  appliedLocRatioPct: number;
  displayLocBuy?: MultiSplitDisplayOrderSnippet;
  displayMocBuy?: MultiSplitDisplayQuantityOnlyOrderSnippet;
  sellGuide: MultiSplitSellGuideSnippet;
}

interface CalculateGuideStateSnippetArgs {
  oneTimeAmount: number;
  totalSplitCount: number;
  totalInvested: number;
  currentQuantity: number;
  avgPrice: number;
  currentPrice: number;
  feeRatePct: number;
  baseLocRatioPct: number;
  targetReturnRatePct: number;
  intermediateReturnRatePct: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
}

const MESSAGES: Record<Lang, Record<string, string>> = {
  ko: {
    cashUsage: '현금 사용률',
    locBuy: '평단가 매수 (LOC)',
    mocBuy: '분할 매수 (MOC)',
    noHoldings: '보유 수량이 없습니다.',
    firstBuyGuide:
      '첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.',
    dataErrorNotice: '평단가 정보를 불러올 수 없습니다.',
    mainTakeProfit: '메인 익절',
    intermediateTakeProfit: '중간 익절',
    riskCut: '위험 관리 손절',
    buyGuide: '매수 가이드',
    insufficientFunds: '매수금 부족',
    sharesUnit: '주',
  },
  en: {
    cashUsage: 'Cash Usage',
    locBuy: 'Average-price buy (LOC)',
    mocBuy: 'Split buy (MOC)',
    noHoldings: 'There is no holding quantity.',
    firstBuyGuide:
      'For the first buy, feel free to buy anytime during market hours using one buy tranche as the reference.',
    dataErrorNotice: 'Unable to load average price information.',
    mainTakeProfit: 'Main take profit',
    intermediateTakeProfit: 'Intermediate take profit',
    riskCut: 'Risk management stop-loss',
    buyGuide: 'Buy guide',
    insufficientFunds: 'Insufficient Funds',
    sharesUnit: ' shares',
  },
};

function roundMoneySnippet(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function floorSafeQuantitySnippet(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value + Number.EPSILON);
}

function buildDisplayOrderSnippet(
  price: number,
  quantity: number,
): MultiSplitDisplayOrderSnippet | undefined {
  if (!Number.isFinite(price) || price <= MIN_VALID_UNIT_COST) {
    return undefined;
  }

  return {
    price: roundMoneySnippet(price),
    quantity: floorSafeQuantitySnippet(quantity),
  };
}

function calculateGuideStateSnippet(
  args: CalculateGuideStateSnippetArgs,
): MultiSplitGuideStateSnippet {
  const totalSeed = roundMoneySnippet(args.oneTimeAmount * args.totalSplitCount);
  const totalInvested = roundMoneySnippet(Math.max(0, args.totalInvested));
  const remainingBudget = roundMoneySnippet(
    Math.max(0, totalSeed - totalInvested),
  );
  const cashUsagePct =
    totalSeed > 0
      ? roundMoneySnippet(
          Math.min(
            100,
            Math.max(0, (totalInvested / totalSeed) * PERCENT_DENOMINATOR),
          ),
        )
      : 0;

  const normalizedCurrentQuantity = Math.max(0, args.currentQuantity);
  const normalizedAvgPrice = Math.max(0, args.avgPrice);
  const isFirstBuy = normalizedCurrentQuantity <= 0;
  const isDataError =
    normalizedCurrentQuantity > 0 && normalizedAvgPrice <= MIN_VALID_UNIT_COST;
  const isSeedExhausted = totalInvested >= totalSeed;
  // 0원은 완전 소진 상태와 겹치므로, "1회분보다 작은 잔여 예산"은 0 초과일 때만 별도 표시한다.
  const isLowBudget =
    remainingBudget > 0 && remainingBudget < args.oneTimeAmount;

  const safeQuantity = floorSafeQuantitySnippet(normalizedCurrentQuantity);
  const mainTakeProfitQty = Math.min(
    safeQuantity,
    Math.round(
      safeQuantity *
        (args.mainTakeProfitRatioPct / PERCENT_DENOMINATOR) +
        Number.EPSILON,
    ),
  );
  const intermediateTakeProfitQty = Math.max(
    0,
    safeQuantity - mainTakeProfitQty,
  );
  const riskCutQty = floorSafeQuantitySnippet(
    safeQuantity * (args.riskCutRatioPct / PERCENT_DENOMINATOR),
  );

  const sellGuide: MultiSplitSellGuideSnippet = {
    mainTakeProfitQty,
    intermediateTakeProfitQty,
    riskCutQty,
    displayMainTakeProfit: buildDisplayOrderSnippet(
      args.avgPrice *
        (1 + args.targetReturnRatePct / PERCENT_DENOMINATOR),
      mainTakeProfitQty,
    ),
    displayIntermediateTakeProfit: buildDisplayOrderSnippet(
      args.avgPrice *
        (1 + args.intermediateReturnRatePct / PERCENT_DENOMINATOR),
      intermediateTakeProfitQty,
    ),
  };

  const baseState: MultiSplitGuideStateSnippet = {
    cashUsagePct,
    totalInvested,
    totalSeed,
    remainingBudget,
    currentQuantity: normalizedCurrentQuantity,
    avgPrice: normalizedAvgPrice,
    isFirstBuy,
    isDataError,
    isSeedExhausted,
    isLowBudget,
    appliedLocRatioPct: args.baseLocRatioPct,
    sellGuide,
  };

  if (isFirstBuy || isDataError || isSeedExhausted || isLowBudget) {
    return baseState;
  }

  const buyTrancheBudget = Math.min(args.oneTimeAmount, remainingBudget);
  const locBudget =
    buyTrancheBudget * (args.baseLocRatioPct / PERCENT_DENOMINATOR);
  const mocBudget = Math.max(0, buyTrancheBudget - locBudget);
  const locUnitCost = normalizedAvgPrice * (1 + args.feeRatePct / PERCENT_DENOMINATOR);
  const mocUnitCost = args.currentPrice * MOC_PRICE_BUFFER_MULTIPLIER;
  const locBuyQuantity =
    locUnitCost > MIN_VALID_UNIT_COST
      ? floorSafeQuantitySnippet(locBudget / locUnitCost)
      : 0;
  const mocBuyQuantity =
    mocUnitCost > MIN_VALID_UNIT_COST
      ? floorSafeQuantitySnippet(mocBudget / mocUnitCost)
      : 0;

  return {
    ...baseState,
    displayLocBuy: buildDisplayOrderSnippet(
      normalizedAvgPrice,
      locBuyQuantity,
    ),
    displayMocBuy: {
      quantity: mocBuyQuantity,
    },
  };
}

function formatCurrencySnippet(value: number): string {
  return `$${roundMoneySnippet(value).toFixed(2)}`;
}

function buildMultiSplitSummaryLinesSnippet(args: {
  lang: Lang;
  execution: MultiSplitGuideStateSnippet;
}): string[] {
  const messages = MESSAGES[args.lang] ?? MESSAGES.ko;
  const { execution } = args;
  const lines = [
    `${messages.cashUsage}: ${roundMoneySnippet(execution.cashUsagePct)}%`,
  ];

  if (execution.isFirstBuy) {
    lines.push(`${messages.buyGuide}: ${messages.firstBuyGuide}`);
    return lines;
  }

  if (execution.isDataError) {
    lines.push(messages.dataErrorNotice);
    return lines;
  }

  if (execution.isLowBudget) {
    lines.push(`${messages.buyGuide}: ${messages.insufficientFunds}`);
  } else {
    if (execution.displayLocBuy != null) {
      lines.push(
        `${messages.locBuy}: ${formatCurrencySnippet(
          execution.displayLocBuy.price,
        )} / ${execution.displayLocBuy.quantity}${messages.sharesUnit}`,
      );
    }

    if (execution.displayMocBuy != null) {
      lines.push(
        `${messages.mocBuy}: ${execution.displayMocBuy.quantity}${messages.sharesUnit}`,
      );
    }
  }

  if (execution.sellGuide.displayMainTakeProfit != null) {
    lines.push(
      `${messages.mainTakeProfit}: ${formatCurrencySnippet(
        execution.sellGuide.displayMainTakeProfit.price,
      )} / ${execution.sellGuide.displayMainTakeProfit.quantity}${messages.sharesUnit}`,
    );
  }

  if (execution.sellGuide.displayIntermediateTakeProfit != null) {
    lines.push(
      `${messages.intermediateTakeProfit}: ${formatCurrencySnippet(
        execution.sellGuide.displayIntermediateTakeProfit.price,
      )} / ${execution.sellGuide.displayIntermediateTakeProfit.quantity}${messages.sharesUnit}`,
    );
  }

  lines.push(
    `${messages.riskCut}: ${execution.sellGuide.riskCutQty}${messages.sharesUnit}`,
  );

  return lines;
}

function assertSnippet(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function simulateSmartSplitLowBudgetScenario(): void {
  const lowBudgetState = calculateGuideStateSnippet({
    oneTimeAmount: 1_000,
    totalSplitCount: 10,
    totalInvested: 9_500,
    currentQuantity: 100,
    avgPrice: 95,
    currentPrice: 90,
    feeRatePct: 0.25,
    baseLocRatioPct: 50,
    targetReturnRatePct: 10,
    intermediateReturnRatePct: 5,
    mainTakeProfitRatioPct: 40,
    riskCutRatioPct: 20,
  });

  const lowBudgetLines = buildMultiSplitSummaryLinesSnippet({
    lang: 'ko',
    execution: lowBudgetState,
  });

  assertSnippet(lowBudgetState.isLowBudget, 'low budget flag should be true');
  assertSnippet(
    lowBudgetLines.includes('매수 가이드: 매수금 부족'),
    'low budget message should be visible',
  );
  assertSnippet(
    !lowBudgetLines.some((line) => line.startsWith('평단가 매수')),
    'LOC buy line should be hidden',
  );
  assertSnippet(
    !lowBudgetLines.some((line) => line.startsWith('분할 매수')),
    'MOC buy line should be hidden',
  );
  assertSnippet(
    lowBudgetLines.some((line) => line.startsWith('위험 관리 손절')),
    'risk cut line should remain visible',
  );

  const normalBudgetState = calculateGuideStateSnippet({
    oneTimeAmount: 1_000,
    totalSplitCount: 10,
    totalInvested: 8_000,
    currentQuantity: 100,
    avgPrice: 95,
    currentPrice: 90,
    feeRatePct: 0.25,
    baseLocRatioPct: 50,
    targetReturnRatePct: 10,
    intermediateReturnRatePct: 5,
    mainTakeProfitRatioPct: 40,
    riskCutRatioPct: 20,
  });

  const normalBudgetLines = buildMultiSplitSummaryLinesSnippet({
    lang: 'ko',
    execution: normalBudgetState,
  });

  assertSnippet(
    !normalBudgetState.isLowBudget,
    'normal budget flag should be false',
  );
  assertSnippet(
    normalBudgetLines.some((line) => line.startsWith('평단가 매수')),
    'LOC buy line should be visible in normal budget',
  );
  assertSnippet(
    normalBudgetLines.some((line) => line.startsWith('분할 매수')),
    'MOC buy line should be visible in normal budget',
  );

  const firstBuyState = calculateGuideStateSnippet({
    oneTimeAmount: 1_000,
    totalSplitCount: 10,
    totalInvested: 0,
    currentQuantity: 0,
    avgPrice: 0,
    currentPrice: 90,
    feeRatePct: 0.25,
    baseLocRatioPct: 50,
    targetReturnRatePct: 10,
    intermediateReturnRatePct: 5,
    mainTakeProfitRatioPct: 40,
    riskCutRatioPct: 20,
  });

  const firstBuyLines = buildMultiSplitSummaryLinesSnippet({
    lang: 'ko',
    execution: firstBuyState,
  });

  assertSnippet(firstBuyState.isFirstBuy, 'first buy flag should be true');
  assertSnippet(
    firstBuyLines.some((line) =>
      line.includes(
        '첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.',
      ),
    ),
    'first buy guide should be visible',
  );
  assertSnippet(
    !firstBuyLines.some((line) => line.startsWith('평단가 매수')),
    'LOC buy line should be hidden before first buy',
  );
  assertSnippet(
    !firstBuyLines.some((line) => line.startsWith('위험 관리 손절')),
    'sell guide should be hidden before first buy',
  );

  const dataErrorState = calculateGuideStateSnippet({
    oneTimeAmount: 1_000,
    totalSplitCount: 10,
    totalInvested: 500,
    currentQuantity: 10,
    avgPrice: 0,
    currentPrice: 90,
    feeRatePct: 0.25,
    baseLocRatioPct: 50,
    targetReturnRatePct: 10,
    intermediateReturnRatePct: 5,
    mainTakeProfitRatioPct: 40,
    riskCutRatioPct: 20,
  });

  const dataErrorLines = buildMultiSplitSummaryLinesSnippet({
    lang: 'ko',
    execution: dataErrorState,
  });

  assertSnippet(
    !dataErrorState.isFirstBuy,
    'data error with holdings should not be first buy',
  );
  assertSnippet(
    dataErrorState.isDataError,
    'data error flag should be true when holdings exist without average price',
  );
  assertSnippet(
    dataErrorLines.includes('평단가 정보를 불러올 수 없습니다.'),
    'data error notice should be visible',
  );
  assertSnippet(
    !dataErrorLines.some((line) => line.includes('첫 매수는')),
    'first buy guide should not be visible for corrupted holding data',
  );
}

simulateSmartSplitLowBudgetScenario();
