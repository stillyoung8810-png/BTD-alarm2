import { describe, expect, it } from 'vitest';
import {
  calculateMA,
  calculateRollingIndicators,
  calculateRSI,
} from './technicalIndicators';

describe('technicalIndicators', () => {
  describe('calculateMA', () => {
    it('period가 0 이하이면 0을 반환한다', () => {
      expect(calculateMA([100, 101, 102], 0)).toBe(0);
      expect(calculateMA([100, 101, 102], -1)).toBe(0);
    });

    it('비유한 종가가 섞이면 0을 반환한다', () => {
      expect(calculateMA([100, Number.NaN, 102], 3)).toBe(0);
    });
  });

  describe('calculateRSI', () => {
    it('period가 유효하지 않으면 중립값 50을 반환한다', () => {
      expect(calculateRSI([100, 101, 102], 0)).toBe(50);
    });

    it('비유한 종가가 섞이면 중립값 50을 반환한다', () => {
      expect(calculateRSI([100, Infinity, 102, 103], 2)).toBe(50);
    });
  });

  describe('calculateRollingIndicators', () => {
    it('부분 윈도우에서도 내부 MA 가드를 그대로 사용한다', () => {
      const indicators = calculateRollingIndicators([100, 101, 102]);
      expect(indicators[1].ma20).toBe(100.5);
      expect(indicators[2].ma20).toBe(101);
      expect(indicators[0].rsi).toBe(50);
    });
  });
});
