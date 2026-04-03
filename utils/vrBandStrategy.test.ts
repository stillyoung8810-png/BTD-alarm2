import { describe, expect, it } from 'vitest';
import { TIME_MS, VR_CYCLE } from '../constants/vrConstants';
import {
  calculateCycleIndexFromDates,
  sanitizeVrCycleWeeks,
} from './vrBandStrategy';

describe('vrBandStrategy B1 guards', () => {
  describe('calculateCycleIndexFromDates', () => {
    it('음수 UTC ms는 제품 계약상 0으로 차단한다', () => {
      expect(calculateCycleIndexFromDates(-1, TIME_MS.PER_DAY, 2)).toBe(0);
      expect(calculateCycleIndexFromDates(0, -1, 2)).toBe(0);
    });

    it('사이클 몫을 floor(+EPSILON)로 계산한다', () => {
      const cycleLengthMs = 2 * TIME_MS.PER_WEEK;
      const targetDateMs =
        cycleLengthMs * 2 - TIME_MS.PER_DAY + Number.EPSILON;

      expect(calculateCycleIndexFromDates(0, targetDateMs, 2)).toBe(2);
    });
  });

  describe('sanitizeVrCycleWeeks', () => {
    it('문자열 입력은 trim 후 파싱한다', () => {
      expect(sanitizeVrCycleWeeks(' 4 ')).toBe(4);
    });

    it('빈 문자열과 비문자 입력은 기본 주기로 되돌린다', () => {
      expect(sanitizeVrCycleWeeks('   ')).toBe(VR_CYCLE.DEFAULT_WEEKS);
      expect(sanitizeVrCycleWeeks([])).toBe(VR_CYCLE.DEFAULT_WEEKS);
    });
  });
});
