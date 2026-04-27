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
import {
  getMaExecutionMessages,
} from '../supabase/functions/_shared/maExecutionMessages.ts';
import {
  getVrExecutionMessages,
} from '../supabase/functions/_shared/vrExecutionMessages.ts';
import { getStrategyNames } from '../supabase/functions/_shared/strategyNames.ts';

export type Lang = 'ko' | 'en';

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

  const messages = getVrExecutionMessages(lang);
  const snapshot = portfolio.vrSnapshot;
  const tz = portfolio.alarmconfig?.timezone || DEFAULT_TIMEZONE;

  const text = getVrCyclePeriodText({
    startDate: portfolio.startDate,
    cycleWeeks: sanitizeVrCycleWeeks(vrParams.cycleWeeks),
    currentCycleIndex: snapshot?.cycleIndex,
    lang,
    timezone: tz,
    cycleFormat: (idx, start, end) => messages.cyclePeriod(idx, start, end),
  });

  if (!text || text === '-') return null;
  return text;
}

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const messages = getVrExecutionMessages(lang);
  const snapshot = portfolio.vrSnapshot;
  const vrParams = portfolio.strategy.vrBand;

  if (!snapshot) {
    const fallbackMode = messages.modeLabel[vrParams?.vrMode ?? 'accumulate'];
    return `[${fallbackMode}]\n- ${messages.noOrder}\n- ${messages.readyHint}`;
  }

  const lines: string[] = [];
  let headerLine = '';

  if (vrParams?.vrMode) {
    const modeLabel = messages.modeLabel[vrParams.vrMode];
    headerLine += `[${modeLabel}]`;
  }

  const cycleText = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);
  if (cycleText) {
    headerLine += ` (${cycleText})`;
  }

  if (headerLine) {
    lines.push(headerLine);
  }

  lines.push(`- ${messages.targetValue}: ${formatCurrency(snapshot.currentV)}`);
  lines.push(`- ${messages.pool}: ${formatCurrency(snapshot.pool)}`);
  if (typeof snapshot.bandLow === 'number' && typeof snapshot.bandHigh === 'number') {
    lines.push(
      `- ${messages.band}: ${formatCurrency(snapshot.bandLow)} ~ ${formatCurrency(snapshot.bandHigh)}`,
    );
  }

  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    lines.push(`- ${messages.maxBuyHint(maxStep)}`);
  } else {
    lines.push(`- ${messages.noOrder}`);
  }

  lines.push(`- ${messages.readyHint}`);

  return lines.join('\n');
}

function getDailyExecutionStrategyName(input: {
  isVrBand: boolean;
  isMultiSplit: boolean;
  isNoStopMultiSplit: boolean;
  lang: Lang;
}): string {
  const names = getStrategyNames(input.lang);

  if (input.isVrBand) {
    return names.vr_band;
  }
  if (input.isMultiSplit) {
    return names.multi_split;
  }
  if (input.isNoStopMultiSplit) {
    return names.no_stop_multi_split;
  }
  return names.ma_interval;
}

function getMaSectionStock(portfolio: Portfolio, section: 1 | 2 | 3): string {
  switch (section) {
    case 1:
      return portfolio.strategy.ma1?.stock ?? '';
    case 2:
      return portfolio.strategy.ma2?.stock ?? '';
    case 3:
      return portfolio.strategy.ma3?.stock ?? '';
    default: {
      const exhaustiveCheck: never = section;
      return exhaustiveCheck;
    }
  }
}

function isMaPartialProfitEnabled(
  portfolio: Portfolio,
  section: 1 | 2 | 3,
): boolean {
  switch (section) {
    case 1:
      return portfolio.strategy.ma1?.takePartialProfit === true;
    case 2:
      return portfolio.strategy.ma2?.takePartialProfit === true;
    case 3:
      return portfolio.strategy.ma3?.takePartialProfit === true;
    default: {
      const exhaustiveCheck: never = section;
      return exhaustiveCheck;
    }
  }
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
  const messages = getMaExecutionMessages(lang);
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const tzLabel = portfolio.alarmconfig?.timezone || 'Asia/Seoul';
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? '';
  const isVrBand = !!portfolio.strategy.vrBand;
  const isMultiSplit = !!portfolio.strategy.multiSplit;
  const isNoStopMultiSplit = !!portfolio.strategy.noStopMultiSplit;

  lines.push(`📌 ${portfolioName}`);
  lines.push(`- ${getDailyExecutionStrategyName({
    isVrBand,
    isMultiSplit,
    isNoStopMultiSplit,
    lang,
  })}`);
  lines.push(`- ${messages.alarmTimes} (${tzLabel}): ${hours || '-'}`);

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
        lines.push(`- ${messages.section} ${maActiveSection}: ${messages.sectionWatchBothNotMet}`);
      } else if (effectiveAlignmentNot) {
        lines.push(`- ${messages.section} ${maActiveSection}: ${messages.sectionWatchAlignmentNotMet}`);
      } else if (effectiveRsiNot) {
        lines.push(`- ${messages.section} ${maActiveSection}: ${messages.sectionWatchRsiNotMet}`);
      } else {
        const stock = getMaSectionStock(portfolio, maActiveSection);
        if (stock) lines.push(`- ${messages.section} ${maActiveSection}: ${stock} ${messages.buy}`);
      }
    }
    // 중간익절: maPartialProfitLines에 데이터가 있고, 해당 구간 takePartialProfit이 켜져 있을 때만 출력
    if (maPartialProfitLines && maPartialProfitLines.length > 0) {
      maPartialProfitLines.forEach(({ section, stock, quantity }) => {
        if (section !== 1 && section !== 2 && section !== 3) return;
        if (!isMaPartialProfitEnabled(portfolio, section)) return;
        const q = Math.round(quantity);
        if (q > 0 && stock) lines.push(`- ${messages.section} ${section} ${messages.sectionPartialProfit}: ${stock} ${q}${messages.sharesUnit}`);
      });
    }
    lines.push(`- ${messages.noOrder}`);
    return lines.join('\n');
  }

  const unit = messages.sharesUnit;

  if (isNoStopMultiSplit) {
    const data = options.noStopMultiSplitExecutionData;

    if (data == null) {
      lines.push(`- ${messages.noOrder}`);
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
    lines.push(`- ${messages.noOrder}`);
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
