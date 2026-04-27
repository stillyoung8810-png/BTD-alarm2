import { roundMoney } from '../utils/financialMath';
import {
  calculateTvcNextVPreview,
  type TvcNextVSimulationInput,
} from './tvc_engine_simulation';

const ZERO_AMOUNT = 0;
const BAND_RATE_LOWER = 0.05;
const BAND_RATE_UPPER = 0.05;
const MIN_ORDER_QTY = 1;
const MOCK_FEE_RATE = 0.0025;
const MOCK_POOL_USAGE_RATE_BUY = 0.5;

export type TvcVrMode = 'lump_sum' | 'accumulate' | 'withdraw';

const TVC_VR_MODES: readonly TvcVrMode[] = [
  'lump_sum',
  'accumulate',
  'withdraw',
];
const LAUNCH_HIDDEN_TVC_VR_MODES = new Set<TvcVrMode>(['withdraw']);

// Why: React 렌더링 사이클에서 하위 컴포넌트의 불필요한 리렌더링(참조 변경)을 막기 위해
// 앱 로드 시 단 1회만 계산되어 고정된 메모리 주소를 갖는 상수로 노출합니다.
export const VISIBLE_TVC_VR_MODES: readonly TvcVrMode[] = TVC_VR_MODES.filter(
  (mode) => !LAUNCH_HIDDEN_TVC_VR_MODES.has(mode),
);

export interface TvcCycleRefreshPreviewInput {
  vrMode: TvcVrMode;
  previousV: number;
  previousPool: number;
  previousShares: number;
  adjustment: number;
  baseGrowthRatePct: number;
  smartBrakeThresholdPct: number;
  previousCycleIndex: number;
}

export interface TvcMockOrderPreview {
  poolUsed: number;
  bandUsed: number;
  isGenerated: boolean;
}

export interface TvcCycleRefreshPreview {
  vrMode: TvcVrMode;
  nextV: number;
  nextPool: number;
  bandLow: number;
  bandHigh: number;
  buyOrderPreview: TvcMockOrderPreview;
  sellOrderPreview: TvcMockOrderPreview;
  cycleIndex: number;
}

export interface TvcCycleRefreshSimulationResult {
  visibleVrModes: readonly TvcVrMode[];
  accumulateNormalMode: TvcCycleRefreshPreview;
  accumulateSafetyMode: TvcCycleRefreshPreview;
  lumpSumEngineMode: TvcCycleRefreshPreview;
  withdrawEngineMode: TvcCycleRefreshPreview;
  zeroPoolSettlement: TvcCycleRefreshPreview;
  overWithdrawGuardPassed: boolean;
}

interface TvcPreviewStateExpectation
  extends Partial<
    Pick<
      TvcCycleRefreshPreview,
      'nextV' | 'nextPool' | 'bandLow' | 'bandHigh' | 'cycleIndex'
    >
  > {
  buyOrderPoolUsed?: number;
  buyOrderBandUsed?: number;
  buyOrderGenerated?: boolean;
  sellOrderPoolUsed?: number;
  sellOrderBandUsed?: number;
  sellOrderGenerated?: boolean;
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] ${name} must be a finite number.`,
    );
  }
}

function assertStrictPositiveNumber(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value <= ZERO_AMOUNT) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] ${name} must be greater than 0.`,
    );
  }
}

function assertNonNegativeNumber(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value < ZERO_AMOUNT) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] ${name} must be greater than or equal to 0.`,
    );
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < ZERO_AMOUNT) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] ${name} must be a non-negative safe integer (e.g., 0, 1, 2...). actual: ${value}`,
    );
  }
}

function assertSimulationValue(
  label: string,
  actual: number | boolean,
  expected: number | boolean,
): void {
  if (actual !== expected) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] ${label}: expected=${expected}, actual=${actual}`,
    );
  }
}

function assertThrows(label: string, callback: () => void): void {
  try {
    callback();
  } catch {
    return;
  }

  throw new Error(
    `[TVC_Cycle_Refresh_Simulation_Error] ${label}: expected callback to throw.`,
  );
}

function buildMockBandPreview(nextV: number): {
  bandLow: number;
  bandHigh: number;
} {
  assertStrictPositiveNumber('nextV', nextV);

  return {
    bandLow: roundMoney(nextV * (1 - BAND_RATE_LOWER)),
    bandHigh: roundMoney(nextV * (1 + BAND_RATE_UPPER)),
  };
}

function buildMockBuyOrderPreview(args: {
  nextPool: number;
  bandLow: number;
}): TvcMockOrderPreview {
  assertNonNegativeNumber('nextPool', args.nextPool);
  assertStrictPositiveNumber('bandLow', args.bandLow);

  const maxBuyBudget = roundMoney(args.nextPool * MOCK_POOL_USAGE_RATE_BUY);
  const minimumOrderCost = roundMoney(
    args.bandLow * MIN_ORDER_QTY * (1 + MOCK_FEE_RATE),
  );

  return {
    poolUsed: args.nextPool,
    bandUsed: args.bandLow,
    // Why: minimumOrderCost가 0보다 크므로, maxBuyBudget >= minimumOrderCost가 참이면 nextPool > 0은 수학적으로 당연히 보장됩니다.
    isGenerated: maxBuyBudget >= minimumOrderCost,
  };
}

function buildMockSellOrderPreview(args: {
  previousShares: number;
  nextPool: number;
  bandHigh: number;
}): TvcMockOrderPreview {
  assertNonNegativeNumber('previousShares', args.previousShares);
  assertNonNegativeNumber('nextPool', args.nextPool);
  assertStrictPositiveNumber('bandHigh', args.bandHigh);

  return {
    poolUsed: args.nextPool,
    bandUsed: args.bandHigh,
    isGenerated: args.previousShares >= MIN_ORDER_QTY,
  };
}

function assertPreviewState(
  testName: string,
  actual: TvcCycleRefreshPreview,
  expected: TvcPreviewStateExpectation,
): void {
  if (expected.nextV !== undefined) {
    assertSimulationValue(`${testName}.nextV`, actual.nextV, expected.nextV);
  }
  if (expected.nextPool !== undefined) {
    assertSimulationValue(
      `${testName}.nextPool`,
      actual.nextPool,
      expected.nextPool,
    );
  }
  if (expected.bandLow !== undefined) {
    assertSimulationValue(
      `${testName}.bandLow`,
      actual.bandLow,
      expected.bandLow,
    );
  }
  if (expected.bandHigh !== undefined) {
    assertSimulationValue(
      `${testName}.bandHigh`,
      actual.bandHigh,
      expected.bandHigh,
    );
  }
  if (expected.cycleIndex !== undefined) {
    assertSimulationValue(
      `${testName}.cycleIndex`,
      actual.cycleIndex,
      expected.cycleIndex,
    );
  }
  if (expected.buyOrderPoolUsed !== undefined) {
    assertSimulationValue(
      `${testName}.buyOrderPreview.poolUsed`,
      actual.buyOrderPreview.poolUsed,
      expected.buyOrderPoolUsed,
    );
  }
  if (expected.buyOrderBandUsed !== undefined) {
    assertSimulationValue(
      `${testName}.buyOrderPreview.bandUsed`,
      actual.buyOrderPreview.bandUsed,
      expected.buyOrderBandUsed,
    );
  }
  if (expected.buyOrderGenerated !== undefined) {
    assertSimulationValue(
      `${testName}.buyOrderPreview.isGenerated`,
      actual.buyOrderPreview.isGenerated,
      expected.buyOrderGenerated,
    );
  }
  if (expected.sellOrderPoolUsed !== undefined) {
    assertSimulationValue(
      `${testName}.sellOrderPreview.poolUsed`,
      actual.sellOrderPreview.poolUsed,
      expected.sellOrderPoolUsed,
    );
  }
  if (expected.sellOrderBandUsed !== undefined) {
    assertSimulationValue(
      `${testName}.sellOrderPreview.bandUsed`,
      actual.sellOrderPreview.bandUsed,
      expected.sellOrderBandUsed,
    );
  }
  if (expected.sellOrderGenerated !== undefined) {
    assertSimulationValue(
      `${testName}.sellOrderPreview.isGenerated`,
      actual.sellOrderPreview.isGenerated,
      expected.sellOrderGenerated,
    );
  }
}

/**
 * Why this preview stays intentionally orchestration-only:
 * - `V_next` 수학은 `calculateTvcNextVPreview`에 위임해 DRY를 지킵니다.
 * - 이 함수는 적립 전 pool이 수학 엔진에 들어가고, 정산 후 pool이 밴드/주문표 배선으로 흘러가는지만 검증합니다.
 * - 실제 DB, UI, 프로덕션 주문 생성은 범위 밖이며, 여기서는 배선 검증용 mock preview만 사용합니다.
 */
export function buildRefreshedTvcSnapshotPreview(
  input: TvcCycleRefreshPreviewInput,
): TvcCycleRefreshPreview {
  assertStrictPositiveNumber('previousV', input.previousV);
  assertNonNegativeNumber('previousPool', input.previousPool);
  assertNonNegativeNumber('previousShares', input.previousShares);
  assertFiniteNumber('adjustment', input.adjustment);
  assertNonNegativeSafeInteger(
    'previousCycleIndex',
    input.previousCycleIndex,
  );

  const nextPool = roundMoney(input.previousPool + input.adjustment);
  // Why: 잔고 부족 시 무거운 수학 엔진을 호출하지 않고 즉시 실행을 중단하여 자원을 절약하고 에러 추적을 단순화합니다.
  if (nextPool < ZERO_AMOUNT) {
    throw new Error(
      `[TVC_Cycle_Refresh_Simulation_Error] Insufficient pool. nextPool cannot be negative: ${nextPool}`,
    );
  }

  const mathEngineInput: TvcNextVSimulationInput = {
    currentV: input.previousV,
    pool: input.previousPool,
    deltaCash: input.adjustment,
    baseGrowthRatePct: input.baseGrowthRatePct,
    smartBrakeThresholdPct: input.smartBrakeThresholdPct,
  };
  const mathResult = calculateTvcNextVPreview(mathEngineInput);

  const { bandLow, bandHigh } = buildMockBandPreview(mathResult.nextV);
  const buyOrderPreview = buildMockBuyOrderPreview({
    nextPool,
    bandLow,
  });
  const sellOrderPreview = buildMockSellOrderPreview({
    previousShares: input.previousShares,
    nextPool,
    bandHigh,
  });

  return {
    vrMode: input.vrMode,
    nextV: mathResult.nextV,
    nextPool,
    bandLow,
    bandHigh,
    buyOrderPreview,
    sellOrderPreview,
    cycleIndex: input.previousCycleIndex + 1,
  };
}

export function runCycleRefreshSimulation(): TvcCycleRefreshSimulationResult {
  assertSimulationValue(
    'visibleVrModes.withdrawExcluded',
    VISIBLE_TVC_VR_MODES.includes('withdraw'),
    false,
  );
  assertSimulationValue(
    'engineModes.withdrawRetained',
    TVC_VR_MODES.includes('withdraw'),
    true,
  );

  const accumulateNormalMode = buildRefreshedTvcSnapshotPreview({
    vrMode: 'accumulate',
    previousV: 1000,
    previousPool: 200,
    previousShares: 2,
    adjustment: 100,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 15,
    previousCycleIndex: 1,
  });

  assertPreviewState('accumulateNormalMode', accumulateNormalMode, {
    nextV: 1120,
    nextPool: 300,
    bandLow: 1064,
    bandHigh: 1176,
    buyOrderPoolUsed: 300,
    buyOrderBandUsed: 1064,
    sellOrderPoolUsed: 300,
    sellOrderBandUsed: 1176,
    cycleIndex: 2,
  });

  const accumulateSafetyMode = buildRefreshedTvcSnapshotPreview({
    vrMode: 'accumulate',
    previousV: 1000,
    previousPool: 200,
    previousShares: 2,
    adjustment: 100,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 25,
    previousCycleIndex: 2,
  });

  assertPreviewState('accumulateSafetyMode', accumulateSafetyMode, {
    nextV: 1104,
    nextPool: 300,
    bandLow: 1048.8,
    bandHigh: 1159.2,
    buyOrderPoolUsed: 300,
    sellOrderPoolUsed: 300,
    cycleIndex: 3,
  });

  const lumpSumEngineMode = buildRefreshedTvcSnapshotPreview({
    vrMode: 'lump_sum',
    previousV: 1000,
    previousPool: 200,
    previousShares: 2,
    adjustment: 0,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 15,
    previousCycleIndex: 3,
  });

  assertPreviewState('lumpSumEngineMode', lumpSumEngineMode, {
    nextV: 1020,
    nextPool: 200,
    bandLow: 969,
    bandHigh: 1071,
    buyOrderPoolUsed: 200,
    buyOrderBandUsed: 969,
    sellOrderPoolUsed: 200,
    sellOrderBandUsed: 1071,
    cycleIndex: 4,
  });

  const withdrawEngineMode = buildRefreshedTvcSnapshotPreview({
    vrMode: 'withdraw',
    previousV: 1000,
    previousPool: 400,
    previousShares: 2,
    adjustment: -100,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 25,
    previousCycleIndex: 4,
  });

  assertPreviewState('withdrawEngineMode', withdrawEngineMode, {
    nextV: 940,
    nextPool: 300,
    bandLow: 893,
    bandHigh: 987,
    sellOrderPoolUsed: 300,
    sellOrderBandUsed: 987,
    cycleIndex: 5,
  });

  const zeroPoolSettlement = buildRefreshedTvcSnapshotPreview({
    vrMode: 'withdraw',
    previousV: 1000,
    previousPool: 200,
    previousShares: 2,
    adjustment: -200,
    baseGrowthRatePct: 10,
    smartBrakeThresholdPct: 25,
    previousCycleIndex: 5,
  });

  assertPreviewState('zeroPoolSettlement', zeroPoolSettlement, {
    nextV: 804,
    nextPool: 0,
    buyOrderGenerated: false,
    sellOrderPoolUsed: 0,
    cycleIndex: 6,
  });

  assertThrows('overWithdrawGuard', () => {
    buildRefreshedTvcSnapshotPreview({
      vrMode: 'withdraw',
      previousV: 1000,
      previousPool: 200,
      previousShares: 2,
      adjustment: -500,
      baseGrowthRatePct: 10,
      smartBrakeThresholdPct: 25,
      previousCycleIndex: 6,
    });
  });

  return {
    visibleVrModes: VISIBLE_TVC_VR_MODES,
    accumulateNormalMode,
    accumulateSafetyMode,
    lumpSumEngineMode,
    withdrawEngineMode,
    zeroPoolSettlement,
    overWithdrawGuardPassed: true,
  };
}
