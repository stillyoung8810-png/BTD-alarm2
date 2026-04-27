import { TVC_LIMITS } from '../constants/vrConstants';
import { roundMoney } from '../utils/financialMath';
import { validateFinancialArgs } from '../utils/vrBandStrategy';
import { validateWithSharedFinancialArgs } from './target_value_channel_validation_bridge';

const ZERO_AMOUNT = 0;
const FULL_RATE = 1;
const PERCENT_DENOMINATOR = 100;
const RATE_DECIMAL_SCALE = 1_000_000;

/**
 * Why this snippet stays intentionally thin:
 * - `calculateNextV` 수학만 검증합니다.
 * - UI, 상태 관리, 주문표, DB 저장, refresh loop는 포함하지 않습니다.
 * - 퍼센트 입력은 정수(%)로 받고, 함수 내부에서만 `/ 100` 처리합니다.
 */
export interface TvcNextVSimulationInput {
  currentV: number;
  pool: number;
  deltaCash: number;
  baseGrowthRatePct: number;
  smartBrakeThresholdPct: number;
}

export interface TvcNextVSimulationResult {
  currentCRDecimal: number;
  currentCRPct: number;
  baseGrowthRateDecimal: number;
  smartBrakeThresholdDecimal: number;
  isSafetyMode: boolean;
  growthComponent: number;
  nextV: number;
}

function roundRate(value: number): number {
  const roundedAbsoluteValue =
    Math.round((Math.abs(value) + Number.EPSILON) * RATE_DECIMAL_SCALE) /
    RATE_DECIMAL_SCALE;

  if (roundedAbsoluteValue === ZERO_AMOUNT) {
    return ZERO_AMOUNT;
  }

  return value < ZERO_AMOUNT ? -roundedAbsoluteValue : roundedAbsoluteValue;
}

function toValidatedDecimalPercent(args: {
  name: string;
  rawPercent: number;
  min: number;
  max: number;
  context: string;
}): number {
  validateWithSharedFinancialArgs({
    name: args.name,
    value: args.rawPercent,
    min: args.min,
    max: args.max,
    integer: true,
    context: args.context,
  });

  return roundRate(args.rawPercent / PERCENT_DENOMINATOR);
}

export function calculateTvcNextVPreview(
  input: TvcNextVSimulationInput,
): TvcNextVSimulationResult {
  validateFinancialArgs(
    {
      currentV: input.currentV,
      pool: input.pool,
      deltaCash: input.deltaCash,
    },
    {
      currentV: { strictPositive: true },
      pool: { min: ZERO_AMOUNT },
      deltaCash: {},
    },
    'calculateTvcNextVPreview',
  );

  const baseGrowthRateDecimal = toValidatedDecimalPercent({
    name: 'baseGrowthRatePct',
    rawPercent: input.baseGrowthRatePct,
    min: TVC_LIMITS.BASE_GROWTH_RATE.MIN,
    max: TVC_LIMITS.BASE_GROWTH_RATE.MAX,
    context: 'calculateTvcNextVPreview',
  });
  const smartBrakeThresholdDecimal = toValidatedDecimalPercent({
    name: 'smartBrakeThresholdPct',
    rawPercent: input.smartBrakeThresholdPct,
    min: TVC_LIMITS.SMART_BRAKE_THRESHOLD.MIN,
    max: TVC_LIMITS.SMART_BRAKE_THRESHOLD.MAX,
    context: 'calculateTvcNextVPreview',
  });

  // Why: threshold와 같은 정밀도로 CR을 먼저 반올림해야 경계값 비교가 뒤집히지 않습니다.
  const currentCRDecimal = roundRate(input.pool / input.currentV);
  validateFinancialArgs(
    { currentCRDecimal },
    { currentCRDecimal: { min: ZERO_AMOUNT } },
    'calculateTvcNextVPreview:currentCR',
  );

  const isSafetyMode = currentCRDecimal <= smartBrakeThresholdDecimal;

  if (!isSafetyMode) {
    const rawGrowthComponent = input.pool * baseGrowthRateDecimal;
    const nextV = roundMoney(
      input.currentV + rawGrowthComponent + input.deltaCash,
    );

    validateFinancialArgs(
      { nextV },
      { nextV: { strictPositive: true } },
      'calculateTvcNextVPreview:nextV',
    );

    return {
      currentCRDecimal,
      currentCRPct: roundRate(currentCRDecimal * PERCENT_DENOMINATOR),
      baseGrowthRateDecimal,
      smartBrakeThresholdDecimal,
      isSafetyMode: false,
      growthComponent: roundMoney(rawGrowthComponent),
      nextV,
    };
  }

  const squaredCurrentCR = roundRate(currentCRDecimal * currentCRDecimal);
  const safetyGrowthRateDecimal = roundRate(
    baseGrowthRateDecimal * squaredCurrentCR,
  );
  const rawGrowthComponent = input.currentV * safetyGrowthRateDecimal;
  const nextV = roundMoney(
    input.currentV * (FULL_RATE + safetyGrowthRateDecimal) + input.deltaCash,
  );

  validateFinancialArgs(
    { nextV },
    { nextV: { strictPositive: true } },
    'calculateTvcNextVPreview:nextV',
  );

  return {
    currentCRDecimal,
    currentCRPct: roundRate(currentCRDecimal * PERCENT_DENOMINATOR),
    baseGrowthRateDecimal,
    smartBrakeThresholdDecimal,
    isSafetyMode: true,
    growthComponent: roundMoney(rawGrowthComponent),
    nextV,
  };
}

function assertSimulationValue(
  label: string,
  actual: number | boolean,
  expected: number | boolean,
): void {
  if (actual !== expected) {
    throw new Error(
      `[TVC_NextV_Simulation_Error] ${label}: expected=${expected}, actual=${actual}`,
    );
  }
}

export function runTvcNextVSimulationExamples(): {
  normalMode: TvcNextVSimulationResult;
  safetyMode: TvcNextVSimulationResult;
} {
  const normalMode = calculateTvcNextVPreview({
    currentV: 1000,
    pool: 400,
    deltaCash: 50,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 20,
  });
  assertSimulationValue('normalMode.isSafetyMode', normalMode.isSafetyMode, false);
  assertSimulationValue('normalMode.currentCRPct', normalMode.currentCRPct, 40);
  assertSimulationValue('normalMode.growthComponent', normalMode.growthComponent, 40);
  assertSimulationValue('normalMode.nextV', normalMode.nextV, 1090);

  const safetyMode = calculateTvcNextVPreview({
    currentV: 1000,
    pool: 200,
    deltaCash: 50,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 25,
  });
  assertSimulationValue('safetyMode.isSafetyMode', safetyMode.isSafetyMode, true);
  assertSimulationValue('safetyMode.currentCRPct', safetyMode.currentCRPct, 20);
  assertSimulationValue('safetyMode.growthComponent', safetyMode.growthComponent, 4);
  assertSimulationValue('safetyMode.nextV', safetyMode.nextV, 1054);

  return {
    normalMode,
    safetyMode,
  };
}
