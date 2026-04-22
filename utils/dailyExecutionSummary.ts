/**
 * Daily execution 요약 텍스트 포맷팅 (계산 없음).
 * Dashboard에서 이미 계산된 multiSplitExecutionData 를
 * 텔레그램용 완성 문자열로만 변환합니다.
 */

import { Portfolio } from '../types';
import { DEFAULT_TIMEZONE } from '../constants/vrConstants';
import {
  formatCurrency,
  getVrCyclePeriodText,
  sanitizeVrCycleWeeks,
} from './vrBandStrategy';
import {
  buildMultiSplitExecutionSummaryLines,
  type MultiSplitExecutionSummaryData,
} from '../supabase/functions/_shared/multiSplitExecutionMessages.ts';
import {
  buildNoStopExecutionSummaryLines,
  type NoStopExecutionSummaryData,
} from '../supabase/functions/_shared/noStopExecutionMessages.ts';

export type Lang = 'ko' | 'en';

const STRINGS: Record<Lang, {
  strategyMultiSplit: string;
  strategyNoStopMultiSplit: string;
  strategyMa: string;
  strategyVrBand: string;
  alarmTimes: string;
  noOrder: string;
  section: string;
  buy: string;
  sectionProfit: string; // "구간N 익절" (레거시)
  sectionPartialProfit: string; // "중간익절" — 구간별 목표 수익률 도달 시만 출력
  sectionWatchRsiNotMet: string; // "관망 (RSI 조건 미충족)" — ma0.rsiEnabled 시에만
  sectionWatchAlignmentNotMet: string; // "관망 (정배열 미충족)" — ma0.alignmentEnabled 시에만
  sectionWatchBothNotMet: string; // "관망 (정배열 미충족, RSI 조건 미충족)"
  sharesUnit: string;
  vrV: string;
  vrPool: string;
  vrBand: string;
  cyclePeriodFormat: (cycleIndex: number, start: string, end: string) => string;
  vrModeLumpSum: string;
  vrModeAccumulate: string;
  vrModeWithdraw: string;
  vrMaxBuyHint: (step: number) => string;
  vrNoOrder: string;
  vrReadyHint: string;
}> = {
  ko: {
    strategyMultiSplit: '스마트 스플릿',
    strategyNoStopMultiSplit: '다분할 매매법(무손절)',
    strategyMa: '이평선 구간매수',
    strategyVrBand: '타겟 밸류 채널',
    alarmTimes: '알람 시간',
    noOrder: '오늘 주문 요약은 앱에서 확인해 주세요.',
    section: '구간',
    buy: '매수',
    sectionProfit: '익절',
    sectionPartialProfit: '중간익절',
    sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
    sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
    sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
    sharesUnit: '주',
    vrV: 'V (목표 밸류)',
    vrPool: 'Pool (가상 금고)',
    vrBand: '밴드',
    cyclePeriodFormat: (n, s, e) => `#${n}: ${s} ~ ${e}`,
    vrModeLumpSum: '거치식',
    vrModeAccumulate: '적립식',
    vrModeWithdraw: '인출식',
    vrMaxBuyHint: (step) => `예약 매수는 표의 ${step}번까지 주문하세요`,
    vrNoOrder: '대기 중인 주문 없음',
    vrReadyHint: 'VR 밴드 룰에 따라 예약 주문표를 참고하여 매매하세요.',
  },
  en: {
    strategyMultiSplit: 'Smart Split',
    strategyNoStopMultiSplit: 'No-Stop Multi-Split',
    strategyMa: 'Moving Average Strategy',
    strategyVrBand: 'Target Value Channel',
    alarmTimes: 'Alarm times',
    noOrder: 'Please check today\'s orders in the app.',
    section: 'Section',
    buy: 'Buy',
    sectionProfit: 'Take profit',
    sectionPartialProfit: 'Partial profit',
    sectionWatchRsiNotMet: 'Watch (RSI not met)',
    sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
    sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
    sharesUnit: 'shares',
    vrV: 'V (Target Value)',
    vrPool: 'Pool',
    vrBand: 'Band',
    cyclePeriodFormat: (n, s, e) => `Cycle ${n}: ${s} to ${e}`,
    vrModeLumpSum: 'Lump sum',
    vrModeAccumulate: 'Accumulate',
    vrModeWithdraw: 'Withdraw',
    vrMaxBuyHint: (step) => `Place reserve buy orders up to row ${step}.`,
    vrNoOrder: 'No pending orders',
    vrReadyHint: 'Follow the VR band rules using the reservation order table.',
  },
};

export type MultiSplitExecutionData = MultiSplitExecutionSummaryData;

export interface NoStopMultiSplitExecutionData extends NoStopExecutionSummaryData {
  currentRound: number;
}

/** 대시보드 VR 일별실행 헤더·알람 VR 블록과 동일한 사이클·타임존·포맷 규칙. */
export function getVrDailyExecutionCycleHeaderLabel(
  portfolio: Portfolio,
  lang: Lang,
): string | null {
  const vrParams = portfolio.strategy.vrBand;
  if (!vrParams) return null;

  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;
  const tz = portfolio.alarmconfig?.timezone || DEFAULT_TIMEZONE;

  const text = getVrCyclePeriodText({
    startDate: portfolio.startDate,
    cycleWeeks: sanitizeVrCycleWeeks(vrParams.cycleWeeks),
    currentCycleIndex: snapshot?.cycleIndex,
    lang,
    timezone: tz,
    cycleFormat: (idx, start, end) => s.cyclePeriodFormat(idx, start, end),
  });

  if (!text || text === '-') return null;
  return text;
}

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;
  const vrParams = portfolio.strategy.vrBand;

  if (!snapshot) {
    const mode = vrParams?.vrMode;
    const fallbackMode =
      mode === 'lump_sum'
        ? s.vrModeLumpSum
        : mode === 'withdraw'
          ? s.vrModeWithdraw
          : s.vrModeAccumulate;
    return `[${fallbackMode}]\n- ${s.vrNoOrder}\n- ${s.vrReadyHint}`;
  }

  const lines: string[] = [];
  let headerLine = '';

  if (vrParams?.vrMode) {
    const modeLabelMap: Record<'lump_sum' | 'accumulate' | 'withdraw', string> = {
      lump_sum: s.vrModeLumpSum,
      accumulate: s.vrModeAccumulate,
      withdraw: s.vrModeWithdraw,
    };
    const modeLabel = modeLabelMap[vrParams.vrMode];
    headerLine += `[${modeLabel}]`;
  }

  const cycleText = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);
  if (cycleText) {
    headerLine += ` (${cycleText})`;
  }

  if (headerLine) {
    lines.push(headerLine);
  }

  lines.push(`- ${s.vrV}: ${formatCurrency(snapshot.currentV)}`);
  lines.push(`- ${s.vrPool}: ${formatCurrency(snapshot.pool)}`);
  if (typeof snapshot.bandLow === 'number' && typeof snapshot.bandHigh === 'number') {
    lines.push(
      `- ${s.vrBand}: ${formatCurrency(snapshot.bandLow)} ~ ${formatCurrency(snapshot.bandHigh)}`,
    );
  }

  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    lines.push(`- ${s.vrMaxBuyHint(maxStep)}`);
  } else {
    lines.push(`- ${s.vrNoOrder}`);
  }

  lines.push(`- ${s.vrReadyHint}`);

  return lines.join('\n');
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
    noStopMultiSplitExecutionData?: NoStopMultiSplitExecutionData | null;
    /** 이평선 구간매수: 현재 활성 구간(1/2/3). 있으면 "구간 N: 종목 매수" 한 줄 추가 후 텔레그램에도 노출 */
    maActiveSection?: 1 | 2 | 3 | null;
    /** 이평선 구간매수: 목표 수익률 도달 시 "구간 N 중간익절: 종목 수량주" 라인들. 구간별 takePartialProfit이 true일 때만 출력. */
    maPartialProfitLines?: { section: 1 | 2 | 3; stock: string; quantity: number }[];
    /** 이평선 구간매수 + RSI 사용 시: RSI 조건 미충족이면 true → "구간 N: 관망 (RSI 조건 미충족)" 표시 */
    maRsiNotMet?: boolean;
    /** 이평선 구간매수 + 정배열 사용 시: 정배열 미충족(maA ≤ maB)이면 true → "구간 N: 관망 (정배열 미충족)" 표시 */
    maAlignmentNotMet?: boolean;
    /** VR 밴드 전략: 예약 매수 가이드용 최대 매수 스텝 */
    vrMaxBuyStep?: number;
  },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const tzLabel = portfolio.alarmconfig?.timezone || 'Asia/Seoul';
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? '';
  const isVrBand = !!portfolio.strategy.vrBand;
  const isMultiSplit = !!portfolio.strategy.multiSplit;
  const isNoStopMultiSplit = !!portfolio.strategy.noStopMultiSplit;

  lines.push(`📌 ${portfolioName}`);
  lines.push(
    isVrBand
      ? `- ${s.strategyVrBand}`
      : isMultiSplit
        ? `- ${s.strategyMultiSplit}`
        : isNoStopMultiSplit
          ? `- ${s.strategyNoStopMultiSplit}`
          : `- ${s.strategyMa}`,
  );
  lines.push(`- ${s.alarmTimes} (${tzLabel}): ${hours || '-'}`);

  if (isVrBand) {
    const vrBlock = formatVrBandBlock(portfolio, lang, { vrMaxBuyStep: options.vrMaxBuyStep ?? 0 });
    if (vrBlock) {
      lines.push(vrBlock);
    }
    return lines.join('\n');
  }

  // 이평선 구간매수: 구간은 ma0.maAPeriod/maBPeriod 2개만 사용(백테스트와 동일). 계산은 Dashboard에서 수행.
  // RSI/정배열 관망 문구는 ma0.rsiEnabled / ma0.alignmentEnabled 가 true일 때만 출력.
  if (!isMultiSplit && !isNoStopMultiSplit) {
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

  const unit = s.sharesUnit;

  if (isNoStopMultiSplit) {
    const data = options.noStopMultiSplitExecutionData;

    if (data == null) {
      lines.push(`- ${s.noOrder}`);
      return lines.join('\n');
    }

    const noStopLines = buildNoStopExecutionSummaryLines({
      lang,
      execution: data,
      formatPrice: (price) => `$${price.toFixed(2)}`,
      formatQuantity: (quantity) => String(Math.round(quantity)),
      sharesUnit: lang === 'en' ? ` ${unit}` : unit,
    });
    lines.push(...noStopLines.map((line) => `- ${line}`));
    return lines.join('\n');
  }

  const { multiSplitExecutionData } = options;
  if (multiSplitExecutionData == null) {
    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  const multiSplitLines = buildMultiSplitExecutionSummaryLines({
    lang,
    execution: multiSplitExecutionData,
  });
  lines.push(...multiSplitLines.map((line) => `- ${line}`));
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
 * 상세 블록은 Dashboard에서 계산 후 onDailyExecutionSummaryChange로 넘기므로,
 * 이 함수는 보조용(캐시 초기값·폴백)으로만 사용됩니다.
 */
export function buildDailyExecutionSummary(portfolios: Portfolio[], lang: Lang): string {
  const blocks = portfolios
    .filter((p) => p.alarmconfig?.enabled && (p.alarmconfig.selectedHours?.length ?? 0) > 0)
    .map((p) =>
      formatPortfolioDailyExecutionBlock(p, lang, {})
    );
  return joinDailyExecutionBlocks(blocks);
}
