import { describe, expect, it } from 'vitest';
import type { VrBandStrategyParams } from '../types';
import {
  calculateBands as calculateClientBands,
  calculateNextV as calculateClientNextV,
  generateBuyOrders as generateClientBuyOrders,
  generateSellOrders as generateClientSellOrders,
} from './vrBandStrategy';
import {
  calculateBands as calculateEdgeBands,
  calculateNextV as calculateEdgeNextV,
  generateBuyOrders as generateEdgeBuyOrders,
  generateSellOrders as generateEdgeSellOrders,
} from '../supabase/functions/_shared/vrBandStrategy.ts';

const BASE_VR_NUMBERS = {
  initialV: 1_000,
  initialCapital: 400,
  bandRateUpper: 0.1,
  bandRateLower: 0.1,
  feeRate: 0.0025,
  G: 4,
  minOrderQty: 1,
  poolUsageRateBuy: 0.5,
  cycleWeeks: 1,
  baseGrowthRatePct: 10,
  smartBrakeThresholdPct: 30,
} as const;

function createVrParams(
  mode: VrBandStrategyParams['vrMode'],
  deltaCash: number,
): VrBandStrategyParams {
  switch (mode) {
    case 'accumulate':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'accumulate',
        deltaCash,
      };
    case 'withdraw':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'withdraw',
        deltaCash,
      };
    case 'lump_sum':
      return {
        ...BASE_VR_NUMBERS,
        vrMode: 'lump_sum',
        deltaCash: 0,
      };
    default: {
      const exhaustiveCheck: never = mode;
      return exhaustiveCheck;
    }
  }
}

describe('TVC client/edge parity', () => {
  it.each([
    createVrParams('accumulate', 50),
    createVrParams('withdraw', 50),
    createVrParams('lump_sum', 0),
  ])('동일한 입력이면 next V와 밴드를 동일하게 계산한다: %s', (params) => {
    const clientNextV = calculateClientNextV(1_000, 400, params);
    const edgeNextV = calculateEdgeNextV(1_000, 400, params);

    expect(edgeNextV).toBe(clientNextV);
    expect(
      calculateEdgeBands(
        edgeNextV,
        params.bandRateUpper,
        params.bandRateLower,
      ),
    ).toEqual(
      calculateClientBands(
        clientNextV,
        params.bandRateUpper,
        params.bandRateLower,
      ),
    );
  });

  it('동일한 입력이면 주문표를 동일하게 생성한다', () => {
    const buyOrderInput = {
      shares: 10,
      pool: 450,
      bandLow: 950,
      minOrderQty: 1,
      feeRate: 0.0025,
      poolUsageRateBuy: 0.5,
    };
    const sellOrderInput = {
      shares: 10,
      pool: 450,
      bandHigh: 1_150,
      minOrderQty: 1,
      feeRate: 0.0025,
    };

    expect(generateEdgeBuyOrders(buyOrderInput)).toEqual(
      generateClientBuyOrders(buyOrderInput),
    );
    expect(generateEdgeSellOrders(sellOrderInput)).toEqual(
      generateClientSellOrders(sellOrderInput),
    );
  });
});
