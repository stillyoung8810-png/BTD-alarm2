import { describe, expect, it } from 'vitest';
import { buildPortfolioDraftFromWizardState } from './utils';

describe('StrategyCreator VR draft building', () => {
  it('VR 포트폴리오 초안은 루트 feeRate는 퍼센트로, vrBand.feeRate는 소수로 유지한다', () => {
    // Why: 루트와 전략 JSON의 단위 계약이 다르므로, 생성 시점부터 둘을 분리해 두지 않으면 이후 Pool 계산이 다시 깨집니다.
    const result = buildPortfolioDraftFromWizardState({
      selectedStrategy: 'vr_band',
      wizardState: {
        meta: {
          name: 'VR portfolio',
          startDate: '2026-04-13',
          dailyBuyAmount: 100,
          feeRatePercent: 0.25,
        },
        vrBand: {
          vrMode: 'lump_sum',
          initialCapital: 1_000,
          initialV: 500,
          minOrderQty: 1,
          bandUpperPct: 5,
          bandLowerPct: 5,
          g: 4,
          poolUsagePct: 50,
          deltaCash: 999,
          cycleWeeks: 1,
        },
      },
    });

    expect(result.portfolio.feeRate).toBe(0.25);
    expect(result.portfolio.strategy.vrBand?.feeRate).toBe(0.0025);
    expect(result.portfolio.strategy.vrBand?.poolUsageRateBuy).toBe(0.5);
    expect(result.portfolio.vrSnapshot?.pool).toBe(1_000);
    expect(result.portfolio.vrSnapshot?.currentV).toBe(500);
    expect(result.portfolio.strategy.vrBand?.deltaCash).toBe(0);
  });

  it('VR 초안 생성은 withdraw/accumulate 입력의 절댓값을 저장하고 실제 부호는 런타임 규칙에 맡긴다', () => {
    // Why: 폼 입력에서 부호가 흔들려도 저장 계약은 절댓값으로 단순화하고, V 계산 시 helper가 최종 부호를 강제해야 합니다.
    const accumulateResult = buildPortfolioDraftFromWizardState({
      selectedStrategy: 'vr_band',
      wizardState: {
        meta: {
          name: 'accumulate',
          startDate: '2026-04-13',
          dailyBuyAmount: 100,
          feeRatePercent: 0.25,
        },
        vrBand: {
          vrMode: 'accumulate',
          initialCapital: 1_000,
          initialV: 500,
          minOrderQty: 1,
          bandUpperPct: 5,
          bandLowerPct: 5,
          g: 4,
          poolUsagePct: 50,
          deltaCash: -50,
          cycleWeeks: 1,
        },
      },
    });
    const withdrawResult = buildPortfolioDraftFromWizardState({
      selectedStrategy: 'vr_band',
      wizardState: {
        meta: {
          name: 'withdraw',
          startDate: '2026-04-13',
          dailyBuyAmount: 100,
          feeRatePercent: 0.25,
        },
        vrBand: {
          vrMode: 'withdraw',
          initialCapital: 1_000,
          initialV: 500,
          minOrderQty: 1,
          bandUpperPct: 5,
          bandLowerPct: 5,
          g: 4,
          poolUsagePct: 50,
          deltaCash: 50,
          cycleWeeks: 1,
        },
      },
    });

    expect(accumulateResult.portfolio.strategy.vrBand?.vrMode).toBe('accumulate');
    expect(accumulateResult.portfolio.strategy.vrBand?.deltaCash).toBe(50);
    expect(withdrawResult.portfolio.strategy.vrBand?.vrMode).toBe('withdraw');
    expect(withdrawResult.portfolio.strategy.vrBand?.deltaCash).toBe(50);
  });
});
import { describe, expect, it } from 'vitest';
import { VR_BAND_WIDTH_PCT } from '@/constants/vrConstants';
import { sanitizeVrBandWidthPercent } from './utils';

describe('sanitizeVrBandWidthPercent', () => {
  it('빈 값은 기본값으로 되돌린다', () => {
    expect(sanitizeVrBandWidthPercent('')).toBe(VR_BAND_WIDTH_PCT.DEFAULT);
  });

  it('최소값보다 작으면 최소값으로 올린다', () => {
    expect(sanitizeVrBandWidthPercent(0)).toBe(VR_BAND_WIDTH_PCT.MIN);
  });

  it('최대값보다 크면 최대값으로 내린다', () => {
    expect(sanitizeVrBandWidthPercent(101)).toBe(VR_BAND_WIDTH_PCT.MAX);
  });

  it('유효한 범위 값은 그대로 유지한다', () => {
    expect(sanitizeVrBandWidthPercent(25)).toBe(25);
  });
});
