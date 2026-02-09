/**
 * 기술 지표 계산 순수 함수 모듈
 *
 * calculateMA, calculateRSI 등 서버/클라이언트 공용 기술 지표 계산 로직.
 * side effect 없음 — 입력만으로 출력이 결정됩니다.
 */

// ---------------------------------------------------------------------------
// 이동평균선 (MA)
// ---------------------------------------------------------------------------

/**
 * 단순 이동평균선(SMA) 계산
 * @param prices 가격 배열 (오름차순)
 * @param period 이동평균 기간
 * @returns 이동평균값 (데이터 부족 시 0)
 */
export const calculateMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const recentPrices = prices.slice(-period);
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
};

// ---------------------------------------------------------------------------
// RSI (Relative Strength Index)
// ---------------------------------------------------------------------------

/**
 * RSI 계산 (Wilder's Smoothing 방식)
 *
 * Wilder's Smoothing 알고리즘:
 * 1. 첫 번째 평균은 period 기간의 단순 평균
 * 2. 이후는 Wilder's Smoothing 공식:
 *    - Average Gain = (Previous Avg Gain × (period - 1) + Current Gain) / period
 *    - Average Loss = (Previous Avg Loss × (period - 1) + Current Loss) / period
 * 3. RS = Average Gain / Average Loss
 * 4. RSI = 100 - (100 / (1 + RS))
 *
 * @param prices 가격 배열 (오름차순, 가장 오래된 것부터)
 * @param period RSI 기간 (기본값: 14일)
 * @returns RSI 값 (0-100), 데이터 부족 시 50 (중립)
 */
export const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) {
    return 50;
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const currentGain = changes[i] > 0 ? changes[i] : 0;
    const currentLoss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.max(0, Math.min(100, rsi));
};

// ---------------------------------------------------------------------------
// 롤링 윈도우 지표 계산 (레코드 배열 전체에 대해)
// ---------------------------------------------------------------------------

/** MA/RSI가 계산된 가격 레코드 */
export interface PriceRecordWithIndicators {
  close: number;
  ma20?: number;
  ma60?: number;
  ma120?: number;
  rsi?: number;
}

/**
 * 가격 배열의 각 레코드에 대해 롤링 윈도우 방식으로 MA20/60/120, RSI를 계산합니다.
 * 원본 배열을 변경하지 않고 새 배열을 반환합니다.
 *
 * @param prices 종가(close) 배열 (오름차순)
 * @returns 각 인덱스별 { ma20, ma60, ma120, rsi } 배열
 */
export function calculateRollingIndicators(prices: number[]): PriceRecordWithIndicators[] {
  return prices.map((close, index) => {
    const result: PriceRecordWithIndicators = { close };

    // MA20
    if (index >= 19) {
      result.ma20 = calculateMA(prices.slice(index - 19, index + 1), 20);
    } else if (index > 0) {
      const window = prices.slice(0, index + 1);
      result.ma20 = calculateMA(window, window.length);
    }

    // MA60
    if (index >= 59) {
      result.ma60 = calculateMA(prices.slice(index - 59, index + 1), 60);
    } else if (index > 0) {
      const window = prices.slice(0, index + 1);
      result.ma60 = calculateMA(window, window.length);
    }

    // MA120
    if (index >= 119) {
      result.ma120 = calculateMA(prices.slice(index - 119, index + 1), 120);
    } else if (index > 0) {
      const window = prices.slice(0, index + 1);
      result.ma120 = calculateMA(window, window.length);
    }

    // RSI (14일 이상 필요)
    if (index >= 14) {
      result.rsi = calculateRSI(prices.slice(0, index + 1));
    } else {
      result.rsi = 50;
    }

    return result;
  });
}
