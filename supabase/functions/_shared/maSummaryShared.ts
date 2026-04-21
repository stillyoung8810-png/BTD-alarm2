import type {
  Portfolio,
  Strategy,
  VrBandStrategyParams,
} from './types.ts';

export type Lang = 'ko' | 'en';

interface MultiSplitExecutionData {
  phase: 'first' | 'second' | 'quarter' | null;
  locBuy1?: { price: number; quantity: number };
  locBuy2?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
  mocSell?: { quantity: number };
}

interface QuarterStopLossData {
  hasMOC: boolean;
  mocQuantity?: number;
  newOneTimeAmount?: number;
  locBuy?: { price: number; quantity: number };
  locSell?: { price: number; quantity: number };
  limitSell?: { price: number; quantity: number };
}

interface NoStopMultiSplitExecutionData {
  currentRound: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  lowLoc?: { price: number; quantity: number };
  highLoc?: { price: number; quantity: number };
  takeProfit?: { price: number; quantity: number };
}

type PartialProfitStrategyConfig =
  | Strategy['ma1']
  | Strategy['ma2']
  | Strategy['ma3'];

export interface MaPartialProfitLine {
  section: 1 | 2 | 3;
  stock: string;
  quantity: number;
}

export interface MaHoldingLike {
  stock: string;
  quantity: number;
  avgPrice: number;
}

export interface MaSnapshotLike {
  price?: number | null;
  rsi?: number | null;
}

export const DEFAULT_MA_RSI_FALLBACK = 50;

const STRINGS: Record<
  Lang,
  {
    strategyMultiSplit: string;
    strategyNoStopMultiSplit: string;
    strategyMa: string;
    strategyVrBand: string;
    alarmTimes: string;
    noOrder: string;
    overLimit: string;
    section: string;
    buy: string;
    sectionProfit: string;
    sectionPartialProfit: string;
    sectionWatchRsiNotMet: string;
    sectionWatchAlignmentNotMet: string;
    sectionWatchBothNotMet: string;
    locBuy1: string;
    locBuy2: string;
    lowLoc: string;
    highLoc: string;
    locSell: string;
    limitSell: string;
    mocSell: string;
    firstBuyAmount: string;
    noStopFirstBuyHint: string;
    noStopSplitComplete: string;
    noStopTakeProfitTarget: string;
    noStopGuaranteedDailyFill: string;
    quarterHint: string;
    firstRoundStartHint: string;
    multiSplitInsufficientAmount: string;
    sharesUnit: string;
  }
> = {
  ko: {
    strategyMultiSplit: '다분할 매매법',
    strategyNoStopMultiSplit: '다분할 매매법(무손절)',
    strategyMa: '이평선 구간매수',
    strategyVrBand: '타겟 밸류 채널',
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
    lowLoc: '저가 LOC',
    highLoc: '고가 LOC',
    locSell: 'LOC 매도',
    limitSell: '지정가 매도',
    mocSell: 'MOC 매도',
    firstBuyAmount: '1회 매수금',
    noStopFirstBuyHint: '첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.',
    noStopSplitComplete:
      '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유(존버)와 익절만 수행합니다.',
    noStopTakeProfitTarget: '익절 목표',
    noStopGuaranteedDailyFill: '매일 체결 보장용',
    quarterHint: 'MOC 매도 하여 쿼터 손절 모드 시작',
    firstRoundStartHint: '1회차 매수를 시작하세요',
    multiSplitInsufficientAmount:
      '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
    sharesUnit: '주',
  },
  en: {
    strategyMultiSplit: 'Multi-Split Strategy',
    strategyNoStopMultiSplit: 'No-Stop Multi-Split',
    strategyMa: 'Moving Average Strategy',
    strategyVrBand: 'Target Value Channel',
    alarmTimes: 'Alarm times',
    noOrder: "Please check today's orders in the app.",
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
    lowLoc: 'Low LOC',
    highLoc: 'High LOC',
    locSell: 'LOC Sell',
    limitSell: 'Limit Sell',
    mocSell: 'MOC Sell',
    firstBuyAmount: '1st Buy Amount',
    noStopFirstBuyHint:
      'For your first buy, feel free to buy anytime during market hours.',
    noStopSplitComplete:
      'All split buys are complete. Hold and wait for take profit without additional buys.',
    noStopTakeProfitTarget: 'Take-profit target',
    noStopGuaranteedDailyFill: 'For guaranteed daily fill',
    quarterHint: 'Execute MOC sell to start quarter stop-loss mode',
    firstRoundStartHint: 'Start your 1st round buy',
    multiSplitInsufficientAmount:
      'Notice: 1st buy amount is too low to place orders. Please check your settings.',
    sharesUnit: 'shares',
  },
};

function linePriceQty(
  label: string,
  price: number,
  qty: number,
  unit: string,
  options: { allowZeroQuantity?: boolean } = {},
): string {
  if (
    typeof price !== 'number' ||
    typeof qty !== 'number' ||
    Number.isNaN(price) ||
    Number.isNaN(qty)
  ) {
    return '';
  }

  const roundedQuantity = Math.round(qty);
  if (roundedQuantity <= 0 && options.allowZeroQuantity !== true) {
    return '';
  }

  return `- ${label}: ${price.toFixed(2)} / ${roundedQuantity}${unit}`;
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getVrModeLabel(
  vrMode: VrBandStrategyParams['vrMode'],
  lang: Lang,
): string {
  switch (vrMode) {
    case 'lump_sum':
      return lang === 'ko' ? '거치식' : 'Lump-sum';
    case 'accumulate':
      return lang === 'ko' ? '적립식' : 'Accumulate';
    case 'withdraw':
      return lang === 'ko' ? '인출식' : 'Withdraw';
    default: {
      const exhaustiveCheck: never = vrMode;
      return exhaustiveCheck;
    }
  }
}

function getStrategyLabel(
  portfolio: Portfolio,
  strings: Record<keyof (typeof STRINGS)['ko'], string>,
): string {
  if (portfolio.strategy.vrBand) {
    return strings.strategyVrBand;
  }
  if (portfolio.strategy.multiSplit) {
    return strings.strategyMultiSplit;
  }
  if (portfolio.strategy.noStopMultiSplit) {
    return strings.strategyNoStopMultiSplit;
  }
  return strings.strategyMa;
}

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;

  if (!snapshot) {
    const pending =
      lang === 'ko'
        ? 'VR 밴드 전략 데이터를 계산하는 중입니다. 첫 매수를 V값 안에서 진행해 주세요.'
        : 'Calculating VR band data. Please execute your first buy within the V value.';
    return `- ${pending}`;
  }

  const lines: string[] = [];
  const vrMode = portfolio.strategy.vrBand?.vrMode;

  if (vrMode) {
    lines.push(`[${getVrModeLabel(vrMode, lang)}]`);
  }

  const { currentV, pool, bandLow, bandHigh } = snapshot;
  lines.push(`- V: ${formatCurrency(currentV)}`);
  lines.push(`- Pool: ${formatCurrency(pool)}`);
  if (typeof bandLow === 'number' && typeof bandHigh === 'number') {
    lines.push(`- Band: ${bandLow.toFixed(2)} ~ ${bandHigh.toFixed(2)}`);
  }

  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    const hint =
      lang === 'ko'
        ? `예약 매수는 표의 ${maxStep}번까지 주문하세요`
        : `Place reserve buy orders up to row ${maxStep}.`;
    lines.push(`- ${hint}`);
  }

  const readyHint =
    lang === 'ko'
      ? 'VR 밴드 룰에 따라 예약 주문표를 참고하여 매매하세요.'
      : 'Follow the VR band rules using the reservation order table.';
  lines.push(`- ${readyHint}`);

  return lines.join('\n');
}

export function getMaPeriods(
  portfolio: Portfolio,
): { maAPeriod: number; maBPeriod: number } {
  const strategy = portfolio.strategy;
  const ma1 = strategy.ma1 as { period?: number };
  const ma2 = strategy.ma2 as { period1?: number; period2?: number };
  const ma3 = strategy.ma3 as { period?: number };

  return {
    maAPeriod: strategy.ma0.maAPeriod ?? ma1.period ?? 20,
    maBPeriod: strategy.ma0.maBPeriod ?? ma3.period ?? ma2.period2 ?? 60,
  };
}

export function determineMaActiveSectionFromValues(
  ma0Price: number,
  maA: number,
  maB: number,
): 1 | 2 | 3 | null {
  if (!Number.isFinite(ma0Price) || ma0Price <= 0) {
    return null;
  }

  const hi = Math.max(maA, maB);
  const lo = Math.min(maA, maB);

  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= 0 || lo <= 0) {
    return null;
  }

  if (ma0Price > hi) return 1;
  if (ma0Price < lo) return 3;
  return 2;
}

export function calculateMaRsiNotMet(input: {
  strategy: Pick<Strategy, 'ma0' | 'ma1' | 'ma2' | 'ma3'>;
  section: 1 | 2 | 3 | null;
  currentRsi?: number | null;
}): boolean {
  const { strategy, section, currentRsi } = input;

  if (
    strategy.ma0.rsiEnabled !== true ||
    (section !== 1 && section !== 2 && section !== 3)
  ) {
    return false;
  }

  const threshold =
    section === 1
      ? strategy.ma1?.rsiThreshold
      : section === 2
        ? strategy.ma2?.rsiThreshold
        : strategy.ma3?.rsiThreshold;

  const normalizedRsi =
    typeof currentRsi === 'number' && Number.isFinite(currentRsi)
      ? currentRsi
      : DEFAULT_MA_RSI_FALLBACK;

  return threshold != null && normalizedRsi > threshold;
}

export function calculateMaAlignmentNotMet(input: {
  isAlignmentEnabled?: boolean;
  maA: number;
  maB: number;
}): boolean {
  if (input.isAlignmentEnabled !== true) {
    return false;
  }

  return input.maA <= input.maB;
}

export function collectMaPartialProfitLine(input: {
  section: 1 | 2 | 3;
  config: PartialProfitStrategyConfig | undefined;
  holdings: readonly MaHoldingLike[];
  prices: Record<string, MaSnapshotLike | undefined>;
}): MaPartialProfitLine | null {
  const { section, config, holdings, prices } = input;

  if (
    config?.takePartialProfit !== true ||
    config.partialProfitTargetPct == null ||
    config.partialProfitTargetPct <= 0
  ) {
    return null;
  }

  const holding = holdings.find((item) => item.stock === config.stock);
  if (holding == null || holding.quantity <= 0 || holding.avgPrice <= 0) {
    return null;
  }

  const currentPrice = prices[config.stock]?.price ?? 0;
  if (currentPrice <= 0) {
    return null;
  }

  const yieldPct = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
  if (yieldPct < config.partialProfitTargetPct) {
    return null;
  }

  return {
    section,
    stock: config.stock,
    quantity: holding.quantity,
  };
}

export interface DailyExecutionBlockOptions {
  multiSplitExecutionData?: MultiSplitExecutionData | null;
  quarterStopLossData?: QuarterStopLossData | null;
  noStopMultiSplitExecutionData?: NoStopMultiSplitExecutionData | null;
  multiSplitPhase?: 'first' | 'second' | 'quarter' | null;
  isQuarterStopLossActive?: boolean;
  multiSplitOverLimit?: boolean;
  multiSplitFirstRoundHint?: boolean;
  multiSplitInsufficientAmount?: boolean;
  maActiveSection?: 1 | 2 | 3 | null;
  maPartialProfitLines?: {
    section: 1 | 2 | 3;
    stock: string;
    quantity: number;
  }[];
  maRsiNotMet?: boolean;
  maAlignmentNotMet?: boolean;
  vrMaxBuyStep?: number;
}

export function formatPortfolioDailyExecutionBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: DailyExecutionBlockOptions,
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? '';
  const isVrBand = Boolean(portfolio.strategy.vrBand);
  const isMultiSplit = portfolio.strategy.multiSplit != null;
  const isNoStopMultiSplit = portfolio.strategy.noStopMultiSplit != null;

  lines.push(`📌 ${portfolioName}`);
  lines.push(`- ${getStrategyLabel(portfolio, s)}`);
  const tzLabel = portfolio.alarmconfig?.timezone || 'Asia/Seoul';
  lines.push(`- ${s.alarmTimes} (${tzLabel}): ${hours || '-'}`);

  if (isVrBand) {
    const vrBlock = formatVrBandBlock(portfolio, lang, {
      vrMaxBuyStep: options.vrMaxBuyStep ?? 0,
    });
    if (vrBlock) lines.push(vrBlock);
    return lines.join('\n');
  }

  if (!isMultiSplit && !isNoStopMultiSplit) {
    const {
      maActiveSection,
      maPartialProfitLines,
      maRsiNotMet,
      maAlignmentNotMet,
    } = options;
    const rsiEnabled = portfolio.strategy.ma0?.rsiEnabled === true;
    const alignmentEnabled = portfolio.strategy.ma0?.alignmentEnabled === true;
    const effectiveRsiNot = rsiEnabled && maRsiNotMet === true;
    const effectiveAlignmentNot =
      alignmentEnabled && maAlignmentNotMet === true;

    if (maActiveSection === 1 || maActiveSection === 2 || maActiveSection === 3) {
      if (effectiveAlignmentNot && effectiveRsiNot) {
        lines.push(
          `- ${s.section} ${maActiveSection}: ${s.sectionWatchBothNotMet}`,
        );
      } else if (effectiveAlignmentNot) {
        lines.push(
          `- ${s.section} ${maActiveSection}: ${s.sectionWatchAlignmentNotMet}`,
        );
      } else if (effectiveRsiNot) {
        lines.push(
          `- ${s.section} ${maActiveSection}: ${s.sectionWatchRsiNotMet}`,
        );
      } else {
        const stock =
          maActiveSection === 1
            ? (portfolio.strategy.ma1?.stock ?? '')
            : maActiveSection === 2
              ? (portfolio.strategy.ma2?.stock ?? '')
              : (portfolio.strategy.ma3?.stock ?? '');
        if (stock) lines.push(`- ${s.section} ${maActiveSection}: ${stock} ${s.buy}`);
      }
    }

    if (maPartialProfitLines && maPartialProfitLines.length > 0) {
      const ma1 = portfolio.strategy.ma1;
      const ma2 = portfolio.strategy.ma2;
      const ma3 = portfolio.strategy.ma3;

      maPartialProfitLines.forEach(({ section, stock, quantity }) => {
        if (section !== 1 && section !== 2 && section !== 3) return;

        const takeEnabled =
          section === 1
            ? ma1?.takePartialProfit
            : section === 2
              ? ma2?.takePartialProfit
              : ma3?.takePartialProfit;

        if (!takeEnabled) return;

        const roundedQuantity = Math.round(quantity);
        if (roundedQuantity > 0 && stock) {
          lines.push(
            `- ${s.section} ${section} ${s.sectionPartialProfit}: ${stock} ${roundedQuantity}${s.sharesUnit}`,
          );
        }
      });
    }

    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  const unit = s.sharesUnit;

  if (isNoStopMultiSplit) {
    const data = options.noStopMultiSplitExecutionData;
    const takeProfitPct = portfolio.strategy.noStopMultiSplit?.takeProfitPct ?? 0;

    if (data?.isFirstBuy) {
      lines.push(`- ${s.noStopFirstBuyHint}`);
      return lines.join('\n');
    }
    if (data?.lowLoc) {
      lines.push(linePriceQty(s.lowLoc, data.lowLoc.price, data.lowLoc.quantity, unit));
    }
    if (data?.highLoc) {
      const highLocLine = linePriceQty(
        s.highLoc,
        data.highLoc.price,
        data.highLoc.quantity,
        unit,
      );
      if (highLocLine) lines.push(`${highLocLine} (${s.noStopGuaranteedDailyFill})`);
    }
    if (data?.isSplitComplete) {
      lines.push(`- ${s.noStopSplitComplete}`);
    }
    if (data?.takeProfit) {
      lines.push(
        lang === 'ko'
          ? `- ${s.noStopTakeProfitTarget}: 평단 대비 +${takeProfitPct}% (전량 지정가 매도)`
          : `- ${s.noStopTakeProfitTarget}: Avg price +${takeProfitPct}% (full limit sell)`,
      );
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  const {
    multiSplitExecutionData,
    quarterStopLossData,
    multiSplitPhase,
    isQuarterStopLossActive,
    multiSplitOverLimit,
    multiSplitFirstRoundHint,
    multiSplitInsufficientAmount,
  } = options;

  if (multiSplitOverLimit) {
    lines.push(`- ${s.overLimit}`);
    return lines.join('\n');
  }
  if (multiSplitInsufficientAmount) {
    lines.push(`- ${s.multiSplitInsufficientAmount}`);
    lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  if (isQuarterStopLossActive && quarterStopLossData) {
    if (!quarterStopLossData.hasMOC) {
      const quantity = quarterStopLossData.mocQuantity ?? 0;
      lines.push(`- ${s.mocSell}: ${quantity.toFixed(2)} ${unit}`);
      lines.push(`- ${s.quarterHint}`);
    } else {
      if (quarterStopLossData.newOneTimeAmount != null) {
        lines.push(
          `- ${s.firstBuyAmount}: $${quarterStopLossData.newOneTimeAmount.toFixed(2)}`,
        );
      }
      if (quarterStopLossData.locBuy) {
        lines.push(
          linePriceQty(
            s.locBuy2,
            quarterStopLossData.locBuy.price,
            quarterStopLossData.locBuy.quantity,
            unit,
          ),
        );
      }
      if (quarterStopLossData.locSell) {
        lines.push(
          linePriceQty(
            s.locSell,
            quarterStopLossData.locSell.price,
            quarterStopLossData.locSell.quantity,
            unit,
            { allowZeroQuantity: true },
          ),
        );
      }
      if (quarterStopLossData.limitSell) {
        lines.push(
          linePriceQty(
            s.limitSell,
            quarterStopLossData.limitSell.price,
            quarterStopLossData.limitSell.quantity,
            unit,
            { allowZeroQuantity: true },
          ),
        );
      }
    }
    return lines.join('\n');
  }

  if (multiSplitExecutionData && multiSplitPhase === 'first') {
    if (multiSplitExecutionData.locBuy1) {
      lines.push(
        linePriceQty(
          s.locBuy1,
          multiSplitExecutionData.locBuy1.price,
          multiSplitExecutionData.locBuy1.quantity,
          unit,
        ),
      );
    }
    if (multiSplitExecutionData.locBuy2) {
      lines.push(
        linePriceQty(
          s.locBuy2,
          multiSplitExecutionData.locBuy2.price,
          multiSplitExecutionData.locBuy2.quantity,
          unit,
        ),
      );
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(
        linePriceQty(
          s.locSell,
          multiSplitExecutionData.locSell.price,
          multiSplitExecutionData.locSell.quantity,
          unit,
          { allowZeroQuantity: true },
        ),
      );
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(
        linePriceQty(
          s.limitSell,
          multiSplitExecutionData.limitSell.price,
          multiSplitExecutionData.limitSell.quantity,
          unit,
          { allowZeroQuantity: true },
        ),
      );
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  if (multiSplitExecutionData && multiSplitPhase === 'second') {
    if (multiSplitExecutionData.locBuy2) {
      lines.push(
        linePriceQty(
          s.locBuy2,
          multiSplitExecutionData.locBuy2.price,
          multiSplitExecutionData.locBuy2.quantity,
          unit,
        ),
      );
    }
    if (multiSplitExecutionData.locSell) {
      lines.push(
        linePriceQty(
          s.locSell,
          multiSplitExecutionData.locSell.price,
          multiSplitExecutionData.locSell.quantity,
          unit,
          { allowZeroQuantity: true },
        ),
      );
    }
    if (multiSplitExecutionData.limitSell) {
      lines.push(
        linePriceQty(
          s.limitSell,
          multiSplitExecutionData.limitSell.price,
          multiSplitExecutionData.limitSell.quantity,
          unit,
          { allowZeroQuantity: true },
        ),
      );
    }
    if (lines.length <= 3) lines.push(`- ${s.noOrder}`);
    return lines.join('\n');
  }

  if (multiSplitFirstRoundHint) {
    lines.push(`- ${s.firstRoundStartHint}`);
  }
  lines.push(`- ${s.noOrder}`);
  return lines.join('\n');
}

export function collectMaPartialProfitLines(
  portfolio: Portfolio,
  maPartialProfitLines: { section: 1 | 2 | 3; stock: string; quantity: number }[],
): string[] {
  const ma1 = portfolio.strategy.ma1;
  const ma2 = portfolio.strategy.ma2;
  const ma3 = portfolio.strategy.ma3;

  return maPartialProfitLines.reduce<string[]>((lines, { section, stock, quantity }) => {
    if (section !== 1 && section !== 2 && section !== 3) {
      return lines;
    }

    const takeEnabled =
      section === 1
        ? ma1?.takePartialProfit
        : section === 2
          ? ma2?.takePartialProfit
          : ma3?.takePartialProfit;

    if (!takeEnabled) {
      return lines;
    }

    const roundedQuantity = Math.round(quantity);
    if (roundedQuantity > 0 && stock) {
      const s = STRINGS.ko;
      lines.push(
        `- ${s.section} ${section} ${s.sectionPartialProfit}: ${stock} ${roundedQuantity}${s.sharesUnit}`,
      );
    }

    return lines;
  }, []);
}

export type { PartialProfitStrategyConfig };
