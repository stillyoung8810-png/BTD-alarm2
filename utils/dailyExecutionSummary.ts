/**
 * Daily execution 요약 텍스트 포맷팅 (계산 없음).
 * Dashboard에서 이미 계산된 multiSplitExecutionData / quarterStopLossData 를
 * 텔레그램용 완성 문자열로만 변환합니다.
 */

import { Portfolio } from '../types';

export type Lang = 'ko' | 'en';

const STRINGS: Record<Lang, {
  strategyMultiSplit: string;
  strategyMa: string;
  alarmTimes: string;
  noOrder: string;
  locBuy1: string;
  locBuy2: string;
  locSell: string;
  limitSell: string;
  mocSell: string;
  firstBuyAmount: string;
  quarterHint: string;
  sharesUnit: string;
}> = {
  ko: {
    strategyMultiSplit: '다분할 매매법',
    strategyMa: '이평선 구간매수',
    alarmTimes: '알람 시간 (KST)',
    noOrder: '오늘 주문 요약은 앱에서 확인해 주세요.',
    locBuy1: 'LOC 매수1',
    locBuy2: 'LOC 매수2',
    locSell: 'LOC 매도',
    limitSell: '지정가 매도',
    mocSell: 'MOC 매도',
    firstBuyAmount: '1회 매수금',
    quarterHint: 'MOC 매도 하여 쿼터 손절 모드 시작',
    sharesUnit: '주',
  },
  en: {
    strategyMultiSplit: 'Multi-Split Strategy',
    strategyMa: 'Moving Average Strategy',
    alarmTimes: 'Alarm times (KST)',
    noOrder: 'Please check today\'s orders in the app.',
    locBuy1: 'LOC Buy1',
    locBuy2: 'LOC Buy2',
    locSell: 'LOC Sell',
    limitSell: 'Limit Sell',
    mocSell: 'MOC Sell',
    firstBuyAmount: '1st Buy Amount',
    quarterHint: 'Execute MOC sell to start quarter stop-loss mode',
    sharesUnit: 'shares',
  },
};

export interface MultiSplitExecutionData {
  phase: 'first' | 'second' | 'quarter' | null;
  locBuy1?: { price: number; quantity: number };
  locBuy2?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
  mocSell?: { quantity: number };
}

export interface QuarterStopLossData {
  hasMOC: boolean;
  mocQuantity?: number;
  newOneTimeAmount?: number;
  locBuy?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
}

function linePriceQty(label: string, price: number, qty: number, unit: string): string {
  const q = Math.round(qty);
  if (q <= 0) return '';
  return `- ${label}: ${price.toFixed(2)} / ${q}${unit}`;
}

/**
 * 이미 계산된 데이터만 받아서, 한 포트폴리오에 대한 텔레그램용 블록 문자열을 반환합니다.
 * 계산 로직은 없습니다.
 */
export function formatPortfolioDailyExecutionBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: {
    multiSplitExecutionData?: MultiSplitExecutionData | null;
    quarterStopLossData?: QuarterStopLossData | null;
    multiSplitPhase?: 'first' | 'second' | 'quarter' | null;
    isQuarterStopLossActive?: boolean;
  },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const lines: string[] = [];

  lines.push(`📌 ${portfolio.name}`);
  lines.push(portfolio.strategy.multiSplit ? `- ${s.strategyMultiSplit}` : `- ${s.strategyMa}`);
  lines.push(`- ${s.alarmTimes}: ${hours || '-'}`);

  if (!portfolio.strategy.multiSplit) {
    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  const { multiSplitExecutionData, quarterStopLossData, multiSplitPhase, isQuarterStopLossActive } = options;
  const unit = s.sharesUnit;

  if (isQuarterStopLossActive && quarterStopLossData) {
    if (!quarterStopLossData.hasMOC) {
      const qty = quarterStopLossData.mocQuantity ?? 0;
      lines.push(`- ${s.mocSell}: ${qty.toFixed(2)} ${unit}`);
      lines.push(`- ${s.quarterHint}`);
    } else {
      if (quarterStopLossData.newOneTimeAmount != null) {
        lines.push(`- ${s.firstBuyAmount}: $${quarterStopLossData.newOneTimeAmount.toFixed(2)}`);
      }
      if (quarterStopLossData.locBuy) {
        lines.push(linePriceQty(s.locBuy2, quarterStopLossData.locBuy.price, quarterStopLossData.locBuy.quantity, unit));
      }
      if (quarterStopLossData.locSell) {
        lines.push(linePriceQty(s.locSell, quarterStopLossData.locSell.price, quarterStopLossData.locSell.quantity, unit));
      }
      if (quarterStopLossData.limitSell) {
        lines.push(linePriceQty(s.limitSell, quarterStopLossData.limitSell.price, quarterStopLossData.limitSell.quantity, unit));
      }
    }
    return lines.join('\n');
  }

  if (multiSplitExecutionData && multiSplitPhase === 'first') {
    if (multiSplitExecutionData.locBuy1) {
      lines.push(linePriceQty(s.locBuy1, multiSplitExecutionData.locBuy1.price, multiSplitExecutionData.locBuy1.quantity, unit));
    }
    if (multiSplitExecutionData.locBuy2) {
      lines.push(linePriceQty(s.locBuy2, multiSplitExecutionData.locBuy2!.price, multiSplitExecutionData.locBuy2!.quantity, unit));
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(linePriceQty(s.locSell, multiSplitExecutionData.locSell.price, multiSplitExecutionData.locSell.quantity, unit));
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(linePriceQty(s.limitSell, multiSplitExecutionData.limitSell.price, multiSplitExecutionData.limitSell.quantity, unit));
    }
    return lines.join('\n');
  }

  if (multiSplitExecutionData && multiSplitPhase === 'second') {
    if (multiSplitExecutionData.locBuy2) {
      lines.push(linePriceQty(s.locBuy2, multiSplitExecutionData.locBuy2.price, multiSplitExecutionData.locBuy2.quantity, unit));
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(linePriceQty(s.locSell, multiSplitExecutionData.locSell.price, multiSplitExecutionData.locSell.quantity, unit));
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(linePriceQty(s.limitSell, multiSplitExecutionData.limitSell.price, multiSplitExecutionData.limitSell.quantity, unit));
    }
    return lines.join('\n');
  }

  lines.push(`- ${s.noOrder}`);
  return lines.join('\n');
}

/**
 * 여러 포트폴리오 블록을 하나의 요약 텍스트로 합칩니다.
 */
export function joinDailyExecutionBlocks(blocks: string[]): string {
  const filtered = blocks.filter(Boolean);
  if (filtered.length === 0) return '';
  return filtered.join('\n\n');
}

/**
 * 알람이 켜진 포트폴리오만 골라 최소 요약 문자열을 만듭니다.
 * 상세 블록(quarterStopLossData 등)은 Dashboard에서 계산 후 onDailyExecutionSummaryChange로 넘기므로,
 * 이 함수는 보조용(캐시 초기값·폴백)으로만 사용됩니다. isQuarterMode(DB 플래그)로 쿼터 모드 여부를 반영합니다.
 */
export function buildDailyExecutionSummary(portfolios: Portfolio[], lang: Lang): string {
  const blocks = portfolios
    .filter((p) => p.alarmconfig?.enabled && (p.alarmconfig.selectedHours?.length ?? 0) > 0)
    .map((p) =>
      formatPortfolioDailyExecutionBlock(p, lang, {
        multiSplitPhase: null,
        isQuarterStopLossActive: p.isQuarterMode === true,
      })
    );
  return joinDailyExecutionBlocks(blocks);
}
