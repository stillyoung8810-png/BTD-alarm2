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
