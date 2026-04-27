const DEFAULT_TOAST_MESSAGE = '설정 범위를 벗어 났어요.';

const MA_PERIOD = {
  MIN: 1,
  MAX: 250,
  FALLBACK: 20,
} as const;

const PERCENT_ZERO_TO_FULL = {
  MIN: 0,
  MAX: 100,
} as const;

const PERCENT_ONE_TO_FULL = {
  MIN: 1,
  MAX: 100,
} as const;

const MULTI_SPLIT_COUNT = {
  MIN: 20,
  MAX: 80,
  FALLBACK: 40,
} as const;

const TVC_BASE_GROWTH_RATE = {
  MIN: 1,
  MAX: 20,
  FALLBACK: 10,
} as const;

const TVC_SMART_BRAKE_THRESHOLD = {
  MIN: 1,
  MAX: 99,
  FALLBACK: 50,
} as const;

const TVC_BAND_WIDTH = {
  MIN: 1,
  MAX: 100,
  FALLBACK: 5,
} as const;

const TVC_MIN_ORDER_QTY = {
  MIN: 1,
  FALLBACK: 1,
} as const;

type RoundingMode = 'none' | 'integer';

interface NormalizeDraftNumberArgs {
  rawValue: string;
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: RoundingMode;
}

interface NormalizedDraftNumberResult {
  value: number;
  didClamp: boolean;
  shouldShowOutOfRangeToast: boolean;
  hasInvalidNumberConfig: boolean;
  hasInvalidFormat: boolean;
}

interface DraftNumberRules {
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: RoundingMode;
}

interface CommitClampedInputParams {
  rawValue: string;
  rules: DraftNumberRules;
  updateValue: (value: number) => void;
  outOfRangeToastMessage: string;
  currentCommittedValue: number;
  invalidFormatToastMessage?: string;
  showErrorToast: (message: string) => void;
  reportInvalidNumberConfig: (rules: DraftNumberRules) => void;
}

interface ControllerCommitResult {
  value: number;
  stateValue: number | null;
  toastMessages: string[];
  invalidConfigReports: DraftNumberRules[];
  invalidFormatReports: string[];
}

interface FieldClampCase {
  id: string;
  fallback: number;
  min: number;
  max?: number;
  roundingMode?: RoundingMode;
  rawBelow: string;
  expectedBelow: number;
  rawInside: string;
  expectedInside: number;
  rawAbove?: string;
  expectedAbove?: number;
}

interface MalformedBoundsCase {
  id: string;
  input: NormalizeDraftNumberArgs;
  expectedValue: number;
  expectedDidClamp: boolean;
}

function normalizeFiniteFallback(value: number): {
  value: number;
  hasInvalidNumberConfig: boolean;
} {
  if (Number.isFinite(value)) {
    return {
      value,
      hasInvalidNumberConfig: false,
    };
  }

  return {
    value: 0,
    hasInvalidNumberConfig: true,
  };
}

function normalizeSafeBounds(args: {
  fallback: number;
  min: number;
  max?: number;
}): {
  safeMin: number;
  safeMax?: number;
  hasInvalidNumberConfig: boolean;
} {
  const hasInvalidMin = !Number.isFinite(args.min);
  const safeMin = hasInvalidMin ? args.fallback : args.min;

  if (args.max === undefined) {
    return {
      safeMin,
      hasInvalidNumberConfig: hasInvalidMin,
    };
  }

  if (!Number.isFinite(args.max) || args.max < safeMin) {
    return {
      safeMin,
      safeMax: safeMin,
      hasInvalidNumberConfig: true,
    };
  }

  return {
    safeMin,
    safeMax: args.max,
    hasInvalidNumberConfig: hasInvalidMin,
  };
}

function roundDraftValue(value: number, mode: RoundingMode): number {
  if (mode === 'integer') {
    return Math.round(value + Number.EPSILON);
  }

  return value;
}

export function normalizeDraftNumberToBounds(
  args: NormalizeDraftNumberArgs,
): NormalizedDraftNumberResult {
  const fallback = normalizeFiniteFallback(args.fallback);
  const trimmedValue = args.rawValue.trim();

  if (trimmedValue === '') {
    return {
      value: fallback.value,
      didClamp: false,
      shouldShowOutOfRangeToast: false,
      hasInvalidNumberConfig: fallback.hasInvalidNumberConfig,
      hasInvalidFormat: false,
    };
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return {
      value: fallback.value,
      didClamp: false,
      shouldShowOutOfRangeToast: false,
      hasInvalidNumberConfig: fallback.hasInvalidNumberConfig,
      hasInvalidFormat: true,
    };
  }

  const processedValue = roundDraftValue(
    parsedValue,
    args.roundingMode ?? 'none',
  );
  const bounds = normalizeSafeBounds({
    fallback: fallback.value,
    min: args.min,
    max: args.max,
  });

  const valueWithMin = Math.max(bounds.safeMin, processedValue);
  const value =
    bounds.safeMax === undefined
      ? valueWithMin
      : Math.min(bounds.safeMax, valueWithMin);
  const didClamp = value !== processedValue;
  const hasInvalidNumberConfig =
    fallback.hasInvalidNumberConfig || bounds.hasInvalidNumberConfig;

  return {
    value,
    didClamp,
    shouldShowOutOfRangeToast: didClamp && !hasInvalidNumberConfig,
    hasInvalidNumberConfig,
    hasInvalidFormat: false,
  };
}

function commitClampedInput(params: CommitClampedInputParams): number {
  const {
    rawValue,
    rules,
    updateValue,
    outOfRangeToastMessage,
    currentCommittedValue,
    invalidFormatToastMessage,
    showErrorToast,
    reportInvalidNumberConfig,
  } = params;

  const normalized = normalizeDraftNumberToBounds({
    rawValue,
    ...rules,
  });

  if (normalized.hasInvalidNumberConfig) {
    reportInvalidNumberConfig(rules);
    updateValue(normalized.value);
    return normalized.value;
  }

  if (normalized.hasInvalidFormat) {
    if (invalidFormatToastMessage !== undefined) {
      showErrorToast(invalidFormatToastMessage);
    }
    return Number.isFinite(currentCommittedValue)
      ? currentCommittedValue
      : normalized.value;
  }

  updateValue(normalized.value);

  if (normalized.shouldShowOutOfRangeToast) {
    showErrorToast(outOfRangeToastMessage);
  }

  return normalized.value;
}

function simulateControllerCommit(params: {
  rawValue: string;
  rules: DraftNumberRules;
  outOfRangeToastMessage?: string;
  currentCommittedValue?: number;
  invalidFormatToastMessage?: string;
}): ControllerCommitResult {
  let stateValue: number | null = null;
  const toastMessages: string[] = [];
  const invalidConfigReports: DraftNumberRules[] = [];
  const value = commitClampedInput({
    rawValue: params.rawValue,
    rules: params.rules,
    outOfRangeToastMessage:
      params.outOfRangeToastMessage ?? DEFAULT_TOAST_MESSAGE,
    currentCommittedValue:
      params.currentCommittedValue ?? params.rules.fallback,
    invalidFormatToastMessage: params.invalidFormatToastMessage,
    updateValue(nextValue: number): void {
      stateValue = nextValue;
    },
    showErrorToast(message: string): void {
      toastMessages.push(message);
    },
    reportInvalidNumberConfig(rules: DraftNumberRules): void {
      invalidConfigReports.push(rules);
    },
  });

  return {
    value,
    stateValue,
    toastMessages,
    invalidConfigReports,
    invalidFormatReports: [],
  };
}

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected=${expected}, actual=${actual}`);
  }
}

function assertControllerCommit(params: {
  testName: string;
  rawValue: string;
  rules: DraftNumberRules;
  expectedValue: number;
  expectedStateValue?: number | null;
  expectedToastCount: number;
  expectedFirstToastMessage?: string;
  expectedInvalidConfigCount?: number;
  expectedInvalidFormatCount?: number;
  outOfRangeToastMessage?: string;
  currentCommittedValue?: number;
  invalidFormatToastMessage?: string;
}): void {
  const result = simulateControllerCommit({
    rawValue: params.rawValue,
    rules: params.rules,
    outOfRangeToastMessage: params.outOfRangeToastMessage,
    currentCommittedValue: params.currentCommittedValue,
    invalidFormatToastMessage: params.invalidFormatToastMessage,
  });

  assertEqual(`${params.testName}.value`, result.value, params.expectedValue);
  assertEqual(
    `${params.testName}.stateValue`,
    result.stateValue,
    params.expectedStateValue === undefined
      ? params.expectedValue
      : params.expectedStateValue,
  );
  assertEqual(
    `${params.testName}.toastCount`,
    result.toastMessages.length,
    params.expectedToastCount,
  );
  assertEqual(
    `${params.testName}.invalidConfigCount`,
    result.invalidConfigReports.length,
    params.expectedInvalidConfigCount ?? 0,
  );
  assertEqual(
    `${params.testName}.invalidFormatCount`,
    result.invalidFormatReports.length,
    params.expectedInvalidFormatCount ?? 0,
  );

  if (params.expectedToastCount > 0) {
    assertEqual(
      `${params.testName}.toastMessage`,
      result.toastMessages[0] ?? '',
      params.expectedFirstToastMessage ?? DEFAULT_TOAST_MESSAGE,
    );
  }
}

function assertPureNormalization(params: {
  testName: string;
  input: NormalizeDraftNumberArgs;
  expectedValue: number;
  expectedDidClamp: boolean;
  expectedToast: boolean;
  expectedInvalidConfig: boolean;
  expectedInvalidFormat: boolean;
}): void {
  const normalized = normalizeDraftNumberToBounds(params.input);

  assertEqual(`${params.testName}.value`, normalized.value, params.expectedValue);
  assertEqual(
    `${params.testName}.didClamp`,
    normalized.didClamp,
    params.expectedDidClamp,
  );
  assertEqual(
    `${params.testName}.shouldShowOutOfRangeToast`,
    normalized.shouldShowOutOfRangeToast,
    params.expectedToast,
  );
  assertEqual(
    `${params.testName}.hasInvalidNumberConfig`,
    normalized.hasInvalidNumberConfig,
    params.expectedInvalidConfig,
  );
  assertEqual(
    `${params.testName}.hasInvalidFormat`,
    normalized.hasInvalidFormat,
    params.expectedInvalidFormat,
  );
}

const FIELD_CLAMP_CASES: readonly FieldClampCase[] = [
  {
    id: 'maShortPeriod',
    fallback: MA_PERIOD.FALLBACK,
    min: MA_PERIOD.MIN,
    max: MA_PERIOD.MAX,
    rawBelow: '0',
    expectedBelow: MA_PERIOD.MIN,
    rawInside: '60',
    expectedInside: 60,
    rawAbove: '251',
    expectedAbove: MA_PERIOD.MAX,
  },
  {
    id: 'maSectionRsiThreshold',
    fallback: 30,
    min: PERCENT_ZERO_TO_FULL.MIN,
    max: PERCENT_ZERO_TO_FULL.MAX,
    rawBelow: '-1',
    expectedBelow: PERCENT_ZERO_TO_FULL.MIN,
    rawInside: '40',
    expectedInside: 40,
    rawAbove: '101',
    expectedAbove: PERCENT_ZERO_TO_FULL.MAX,
  },
  {
    id: 'maSectionPartialProfitTargetPct',
    fallback: 10,
    min: PERCENT_ONE_TO_FULL.MIN,
    max: PERCENT_ONE_TO_FULL.MAX,
    rawBelow: '0',
    expectedBelow: PERCENT_ONE_TO_FULL.MIN,
    rawInside: '12',
    expectedInside: 12,
    rawAbove: '101',
    expectedAbove: PERCENT_ONE_TO_FULL.MAX,
  },
  {
    id: 'multiSplitTotalSplitCount',
    fallback: MULTI_SPLIT_COUNT.FALLBACK,
    min: MULTI_SPLIT_COUNT.MIN,
    max: MULTI_SPLIT_COUNT.MAX,
    rawBelow: '19',
    expectedBelow: MULTI_SPLIT_COUNT.MIN,
    rawInside: '40',
    expectedInside: 40,
    rawAbove: '81',
    expectedAbove: MULTI_SPLIT_COUNT.MAX,
  },
  {
    id: 'multiSplitBaseLocRatio',
    fallback: 50,
    min: PERCENT_ZERO_TO_FULL.MIN,
    max: PERCENT_ZERO_TO_FULL.MAX,
    rawBelow: '-1',
    expectedBelow: PERCENT_ZERO_TO_FULL.MIN,
    rawInside: '50',
    expectedInside: 50,
    rawAbove: '101',
    expectedAbove: PERCENT_ZERO_TO_FULL.MAX,
  },
  {
    id: 'multiSplitMainTakeProfitRatioPct',
    fallback: 50,
    min: PERCENT_ONE_TO_FULL.MIN,
    max: PERCENT_ONE_TO_FULL.MAX,
    rawBelow: '0',
    expectedBelow: PERCENT_ONE_TO_FULL.MIN,
    rawInside: '50',
    expectedInside: 50,
    rawAbove: '101',
    expectedAbove: PERCENT_ONE_TO_FULL.MAX,
  },
  {
    id: 'multiSplitRiskCutRatioPct',
    fallback: 20,
    min: PERCENT_ZERO_TO_FULL.MIN,
    max: PERCENT_ZERO_TO_FULL.MAX,
    rawBelow: '-1',
    expectedBelow: PERCENT_ZERO_TO_FULL.MIN,
    rawInside: '25',
    expectedInside: 25,
    rawAbove: '101',
    expectedAbove: PERCENT_ZERO_TO_FULL.MAX,
  },
  {
    id: 'noStopTakeProfitPct',
    fallback: 10,
    min: PERCENT_ZERO_TO_FULL.MIN,
    max: PERCENT_ZERO_TO_FULL.MAX,
    rawBelow: '-1',
    expectedBelow: PERCENT_ZERO_TO_FULL.MIN,
    rawInside: '10',
    expectedInside: 10,
    rawAbove: '101',
    expectedAbove: PERCENT_ZERO_TO_FULL.MAX,
  },
  {
    id: 'tvcBaseGrowthRatePct',
    fallback: TVC_BASE_GROWTH_RATE.FALLBACK,
    min: TVC_BASE_GROWTH_RATE.MIN,
    max: TVC_BASE_GROWTH_RATE.MAX,
    roundingMode: 'integer',
    rawBelow: '0',
    expectedBelow: TVC_BASE_GROWTH_RATE.MIN,
    rawInside: '10',
    expectedInside: 10,
    rawAbove: '21',
    expectedAbove: TVC_BASE_GROWTH_RATE.MAX,
  },
  {
    id: 'tvcSmartBrakeThresholdPct',
    fallback: TVC_SMART_BRAKE_THRESHOLD.FALLBACK,
    min: TVC_SMART_BRAKE_THRESHOLD.MIN,
    max: TVC_SMART_BRAKE_THRESHOLD.MAX,
    roundingMode: 'integer',
    rawBelow: '0',
    expectedBelow: TVC_SMART_BRAKE_THRESHOLD.MIN,
    rawInside: '50',
    expectedInside: 50,
    rawAbove: '100',
    expectedAbove: TVC_SMART_BRAKE_THRESHOLD.MAX,
  },
  {
    id: 'tvcBandWidthPct',
    fallback: TVC_BAND_WIDTH.FALLBACK,
    min: TVC_BAND_WIDTH.MIN,
    max: TVC_BAND_WIDTH.MAX,
    rawBelow: '0',
    expectedBelow: TVC_BAND_WIDTH.MIN,
    rawInside: '5',
    expectedInside: 5,
    rawAbove: '101',
    expectedAbove: TVC_BAND_WIDTH.MAX,
  },
  {
    id: 'tvcPoolUsagePct',
    fallback: 50,
    min: PERCENT_ZERO_TO_FULL.MIN,
    max: PERCENT_ZERO_TO_FULL.MAX,
    rawBelow: '-1',
    expectedBelow: PERCENT_ZERO_TO_FULL.MIN,
    rawInside: '50',
    expectedInside: 50,
    rawAbove: '101',
    expectedAbove: PERCENT_ZERO_TO_FULL.MAX,
  },
  {
    id: 'tvcMinOrderQty',
    fallback: TVC_MIN_ORDER_QTY.FALLBACK,
    min: TVC_MIN_ORDER_QTY.MIN,
    rawBelow: '0',
    expectedBelow: TVC_MIN_ORDER_QTY.MIN,
    rawInside: '1',
    expectedInside: 1,
  },
] as const;

const MALFORMED_BOUNDS_CASES: readonly MalformedBoundsCase[] = [
  {
    id: 'minGreaterThanMax',
    input: {
      rawValue: '50',
      fallback: 10,
      min: 100,
      max: 0,
    },
    expectedValue: 100,
    expectedDidClamp: true,
  },
  {
    id: 'nonFiniteMinUsesFallbackAsMin',
    input: {
      rawValue: '5',
      fallback: 10,
      min: Number.NaN,
      max: 100,
    },
    expectedValue: 10,
    expectedDidClamp: true,
  },
  {
    id: 'nonFiniteMaxLocksToSafeMin',
    input: {
      rawValue: '50',
      fallback: 10,
      min: 20,
      max: Number.NaN,
    },
    expectedValue: 20,
    expectedDidClamp: true,
  },
  {
    id: 'nonFiniteFallbackUsesLastResortZero',
    input: {
      rawValue: '',
      fallback: Number.NaN,
      min: 1,
      max: 10,
    },
    expectedValue: 0,
    expectedDidClamp: false,
  },
] as const;

function runFieldClampCases(): void {
  for (const clampCase of FIELD_CLAMP_CASES) {
    const rules = {
      fallback: clampCase.fallback,
      min: clampCase.min,
      max: clampCase.max,
      roundingMode: clampCase.roundingMode,
    };

    assertControllerCommit({
      testName: `${clampCase.id}.below`,
      rawValue: clampCase.rawBelow,
      rules,
      expectedValue: clampCase.expectedBelow,
      expectedToastCount: 1,
    });

    assertControllerCommit({
      testName: `${clampCase.id}.inside`,
      rawValue: clampCase.rawInside,
      rules,
      expectedValue: clampCase.expectedInside,
      expectedToastCount: 0,
    });

    assertControllerCommit({
      testName: `${clampCase.id}.empty`,
      rawValue: '',
      rules,
      expectedValue: clampCase.fallback,
      expectedToastCount: 0,
    });

    assertControllerCommit({
      testName: `${clampCase.id}.nonNumeric`,
      rawValue: 'not-a-number',
      rules,
      expectedValue: clampCase.expectedInside,
      expectedStateValue: null,
      expectedToastCount: 0,
      currentCommittedValue: clampCase.expectedInside,
    });

    if (
      clampCase.rawAbove !== undefined &&
      clampCase.expectedAbove !== undefined
    ) {
      assertControllerCommit({
        testName: `${clampCase.id}.above`,
        rawValue: clampCase.rawAbove,
        rules,
        expectedValue: clampCase.expectedAbove,
        expectedToastCount: 1,
      });
    }
  }
}

function runMalformedBoundsCases(): void {
  for (const malformedCase of MALFORMED_BOUNDS_CASES) {
    assertPureNormalization({
      testName: malformedCase.id,
      input: malformedCase.input,
      expectedValue: malformedCase.expectedValue,
      expectedDidClamp: malformedCase.expectedDidClamp,
      expectedToast: false,
      expectedInvalidConfig: true,
      expectedInvalidFormat: false,
    });

    assertControllerCommit({
      testName: `${malformedCase.id}.controller`,
      rawValue: malformedCase.input.rawValue,
      rules: malformedCase.input,
      expectedValue: malformedCase.expectedValue,
      expectedToastCount: 0,
      expectedInvalidConfigCount: 1,
    });
  }
}

function runInvalidFormatCases(): void {
  const invalidFormatRules = {
    fallback: TVC_BASE_GROWTH_RATE.FALLBACK,
    min: TVC_BASE_GROWTH_RATE.MIN,
    max: TVC_BASE_GROWTH_RATE.MAX,
    roundingMode: 'integer' as const,
  };
  const currentCommittedValue = 12;

  assertPureNormalization({
    testName: 'invalidFormat.directHandlerCall',
    input: {
      rawValue: 'not-a-number',
      ...invalidFormatRules,
    },
    expectedValue: TVC_BASE_GROWTH_RATE.FALLBACK,
    expectedDidClamp: false,
    expectedToast: false,
    expectedInvalidConfig: false,
    expectedInvalidFormat: true,
  });

  assertControllerCommit({
    testName: 'invalidFormat.controllerNoToast',
    rawValue: 'not-a-number',
    rules: invalidFormatRules,
    expectedValue: currentCommittedValue,
    expectedStateValue: null,
    expectedToastCount: 0,
    currentCommittedValue,
  });

  assertControllerCommit({
    testName: 'invalidFormat.controllerWithToast',
    rawValue: 'not-a-number',
    rules: invalidFormatRules,
    expectedValue: currentCommittedValue,
    expectedStateValue: null,
    expectedToastCount: 1,
    expectedFirstToastMessage: '숫자만 입력해 주세요.',
    currentCommittedValue,
    invalidFormatToastMessage: '숫자만 입력해 주세요.',
  });
}

export function runStrategyCreatorClampToastSimulation(): void {
  runFieldClampCases();
  runMalformedBoundsCases();
  runInvalidFormatCases();
}

runStrategyCreatorClampToastSimulation();

console.log('[strategy_creator_clamp_toast_snippets] simulation passed');
