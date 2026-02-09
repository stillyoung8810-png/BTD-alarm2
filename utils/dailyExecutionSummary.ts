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
  overLimit: string;
  section: string;
  buy: string;
  sectionProfit: string; // "구간N 익절" (레거시)
  sectionPartialProfit: string; // "중간익절" — 구간별 목표 수익률 도달 시만 출력
  sectionWatchRsiNotMet: string; // "관망 (RSI 조건 미충족)" — ma0.rsiEnabled 시에만
  sectionWatchAlignmentNotMet: string; // "관망 (정배열 미충족)" — ma0.alignmentEnabled 시에만
  sectionWatchBothNotMet: string; // "관망 (정배열 미충족, RSI 조건 미충족)"
  locBuy1: string;
  locBuy2: string;
  locSell: string;
  limitSell: string;
  mocSell: string;
  firstBuyAmount: string;
  quarterHint: string;
  /** 다분할: T가 0 이상 0.5 미만일 때 "1회차 매수를 시작하세요" */
  firstRoundStartHint: string;
  /** 다분할: 1회 매수금 < 1주 가격 시 */
  multiSplitInsufficientAmount: string;
  sharesUnit: string;
}> = {
  ko: {
    strategyMultiSplit: '다분할 매매법',
    strategyMa: '이평선 구간매수',
    alarmTimes: '알람 시간',
    noOrder: '오늘 주문 요약은 앱에서 확인해 주세요.',
    overLimit: '매매 내역을 확인하세요. 총투자금을 초과했습니다.',
    section: '구간',
    buy: '매수',
    sectionProfit: '익절',
    sectionPartialProfit: '중간익절',
    sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
    sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
    sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
    locBuy1: 'LOC 매수1',
    locBuy2: 'LOC 매수2',
    locSell: 'LOC 매도',
    limitSell: '지정가 매도',
    mocSell: 'MOC 매도',
    firstBuyAmount: '1회 매수금',
    quarterHint: 'MOC 매도 하여 쿼터 손절 모드 시작',
    firstRoundStartHint: '1회차 매수를 시작하세요',
    multiSplitInsufficientAmount: '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
    sharesUnit: '주',
  },
  en: {
    strategyMultiSplit: 'Multi-Split Strategy',
    strategyMa: 'Moving Average Strategy',
    alarmTimes: 'Alarm times',
    noOrder: 'Please check today\'s orders in the app.',
    overLimit: 'Check your trades. Total invested has exceeded the limit.',
    section: 'Section',
    buy: 'Buy',
    sectionProfit: 'Take profit',
    sectionPartialProfit: 'Partial profit',
    sectionWatchRsiNotMet: 'Watch (RSI not met)',
    sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
    sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
    locBuy1: 'LOC Buy1',
    locBuy2: 'LOC Buy2',
    locSell: 'LOC Sell',
    limitSell: 'Limit Sell',
    mocSell: 'MOC Sell',
    firstBuyAmount: '1st Buy Amount',
    quarterHint: 'Execute MOC sell to start quarter stop-loss mode',
    firstRoundStartHint: 'Start your 1st round buy',
    multiSplitInsufficientAmount: 'Notice: 1st buy amount is too low to place orders. Please check your settings.',
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
  if (typeof price !== 'number' || typeof qty !== 'number' || Number.isNaN(price) || Number.isNaN(qty)) return '';
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
    /** 다분할 매매법: 총투자금이 1회 투자금 × a 를 초과한 경우 true */
    multiSplitOverLimit?: boolean;
    /** 다분할 매매법: T가 0 이상 0.5 미만일 때 true → "1회차 매수를 시작하세요" 표시 */
    multiSplitFirstRoundHint?: boolean;
    /** 다분할 매매법: 1회 매수금 < 1주 가격으로 주문 생성 불가 시 true → 금액 부족 알림 문구 표시 */
    multiSplitInsufficientAmount?: boolean;
    /** 이평선 구간매수: 현재 활성 구간(1/2/3). 있으면 "구간 N: 종목 매수" 한 줄 추가 후 텔레그램에도 노출 */
    maActiveSection?: 1 | 2 | 3 | null;
    /** 이평선 구간매수: 목표 수익률 도달 시 "구간 N 중간익절: 종목 수량주" 라인들. 구간별 takePartialProfit이 true일 때만 출력. */
    maPartialProfitLines?: { section: 1 | 2 | 3; stock: string; quantity: number }[];
    /** 이평선 구간매수 + RSI 사용 시: RSI 조건 미충족이면 true → "구간 N: 관망 (RSI 조건 미충족)" 표시 */
    maRsiNotMet?: boolean;
    /** 이평선 구간매수 + 정배열 사용 시: 정배열 미충족(maA ≤ maB)이면 true → "구간 N: 관망 (정배열 미충족)" 표시 */
    maAlignmentNotMet?: boolean;
  },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const tzLabel = portfolio.alarmconfig?.timezone || 'Asia/Seoul';
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? '';

  lines.push(`📌 ${portfolioName}`);
  lines.push(portfolio.strategy.multiSplit ? `- ${s.strategyMultiSplit}` : `- ${s.strategyMa}`);
  lines.push(`- ${s.alarmTimes} (${tzLabel}): ${hours || '-'}`);

  // 이평선 구간매수: 구간은 ma0.maAPeriod/maBPeriod 2개만 사용(백테스트와 동일). 계산은 Dashboard에서 수행.
  // RSI/정배열 관망 문구는 ma0.rsiEnabled / ma0.alignmentEnabled 가 true일 때만 출력.
  if (!portfolio.strategy.multiSplit) {
    const { maActiveSection, maPartialProfitLines, maRsiNotMet, maAlignmentNotMet } = options;
    const rsiEnabled = portfolio.strategy.ma0?.rsiEnabled === true;
    const alignmentEnabled = portfolio.strategy.ma0?.alignmentEnabled === true;
    const effectiveRsiNot = rsiEnabled && (maRsiNotMet === true);
    const effectiveAlignmentNot = alignmentEnabled && (maAlignmentNotMet === true);

    if (maActiveSection === 1 || maActiveSection === 2 || maActiveSection === 3) {
      if (effectiveAlignmentNot && effectiveRsiNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchBothNotMet}`);
      } else if (effectiveAlignmentNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchAlignmentNotMet}`);
      } else if (effectiveRsiNot) {
        lines.push(`- ${s.section} ${maActiveSection}: ${s.sectionWatchRsiNotMet}`);
      } else {
        const stock = maActiveSection === 1
          ? (portfolio.strategy.ma1?.stock ?? '')
          : maActiveSection === 2
            ? (portfolio.strategy.ma2?.stock ?? '')
            : (portfolio.strategy.ma3?.stock ?? '');
        if (stock) lines.push(`- ${s.section} ${maActiveSection}: ${stock} ${s.buy}`);
      }
    }
    // 중간익절: maPartialProfitLines에 데이터가 있고, 해당 구간 takePartialProfit이 켜져 있을 때만 출력
    if (maPartialProfitLines && maPartialProfitLines.length > 0) {
      const ma1 = portfolio.strategy.ma1;
      const ma2 = portfolio.strategy.ma2;
      const ma3 = portfolio.strategy.ma3;
      maPartialProfitLines.forEach(({ section, stock, quantity }) => {
        if (section !== 1 && section !== 2 && section !== 3) return;
        const takeEnabled = section === 1 ? ma1?.takePartialProfit : section === 2 ? ma2?.takePartialProfit : ma3?.takePartialProfit;
        if (!takeEnabled) return;
        const q = Math.round(quantity);
        if (q > 0 && stock) lines.push(`- ${s.section} ${section} ${s.sectionPartialProfit}: ${stock} ${q}${s.sharesUnit}`);
      });
    }
    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  const { multiSplitExecutionData, quarterStopLossData, multiSplitPhase, isQuarterStopLossActive, multiSplitOverLimit, multiSplitFirstRoundHint, multiSplitInsufficientAmount } = options;

  // 다분할 매매법: 총투자금 초과 시 안내 문구만 표시
  if (multiSplitOverLimit) {
    lines.push(`- ${s.overLimit}`);
    return lines.join('\n');
  }
  // 다분할 매매법: 1회 매수금 부족으로 주문 생성 불가 시 알림
  if (multiSplitInsufficientAmount) {
    lines.push(`- ${s.multiSplitInsufficientAmount}`);
    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }
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

  // first / second phase 공통 처리 (first일 때만 locBuy1 추가)
  if (multiSplitExecutionData && (multiSplitPhase === 'first' || multiSplitPhase === 'second')) {
    if (multiSplitPhase === 'first' && multiSplitExecutionData.locBuy1) {
      lines.push(linePriceQty(s.locBuy1, multiSplitExecutionData.locBuy1.price, multiSplitExecutionData.locBuy1.quantity, unit));
    }
    if (multiSplitExecutionData.locBuy2) {
      lines.push(linePriceQty(s.locBuy2, multiSplitExecutionData.locBuy2.price, multiSplitExecutionData.locBuy2.quantity, unit));
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(linePriceQty(s.locSell, multiSplitExecutionData.locSell.price, multiSplitExecutionData.locSell.quantity, unit));
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(linePriceQty(s.limitSell, multiSplitExecutionData.limitSell.price, multiSplitExecutionData.limitSell.quantity, unit));
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  // 다분할: T가 0 이상 0.5 미만일 때 1회차 매수 안내 (phase 없음)
  if (multiSplitFirstRoundHint) {
    lines.push(`- ${s.firstRoundStartHint}`);
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
