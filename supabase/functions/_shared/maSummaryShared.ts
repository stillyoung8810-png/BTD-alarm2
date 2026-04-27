import type {
  Portfolio,
  Strategy,
} from './types.ts';
import {
  buildMultiSplitExecutionSummaryLines,
  type MultiSplitExecutionSummaryData,
} from './multiSplitExecutionMessages.ts';
import {
  buildNoStopExecutionSummaryLines,
  type NoStopExecutionSummaryData,
} from './noStopExecutionMessages.ts';
import { getMaExecutionMessages } from './maExecutionMessages.ts';
import { getVrExecutionMessages } from './vrExecutionMessages.ts';
import { getStrategyNames } from './strategyNames.ts';

export type Lang = 'ko' | 'en';

type MultiSplitExecutionData = MultiSplitExecutionSummaryData;

interface NoStopMultiSplitExecutionData extends NoStopExecutionSummaryData {
  currentRound: number;
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

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getStrategyLabel(portfolio: Portfolio, lang: Lang): string {
  const names = getStrategyNames(lang);

  if (portfolio.strategy.vrBand) {
    return names.vr_band;
  }
  if (portfolio.strategy.multiSplit) {
    return names.multi_split;
  }
  if (portfolio.strategy.noStopMultiSplit) {
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

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const messages = getVrExecutionMessages(lang);
  const snapshot = portfolio.vrSnapshot;

  if (!snapshot) {
    return `- ${messages.pendingHint}`;
  }

  const lines: string[] = [];
  const vrMode = portfolio.strategy.vrBand?.vrMode;

  if (vrMode) {
    lines.push(`[${messages.modeLabel[vrMode]}]`);
  }

  const { currentV, pool, bandLow, bandHigh } = snapshot;
  lines.push(`- ${messages.targetValue}: ${formatCurrency(currentV)}`);
  lines.push(`- ${messages.pool}: ${formatCurrency(pool)}`);
  if (typeof bandLow === 'number' && typeof bandHigh === 'number') {
    lines.push(
      `- ${messages.band}: ${formatCurrency(bandLow)} ~ ${formatCurrency(bandHigh)}`,
    );
  }

  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    lines.push(`- ${messages.maxBuyHint(maxStep)}`);
  }

  lines.push(`- ${messages.readyHint}`);

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
  noStopMultiSplitExecutionData?: NoStopMultiSplitExecutionData | null;
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
  const messages = getMaExecutionMessages(lang);
  const hours = (portfolio.alarmconfig?.selectedHours ?? []).join(', ');
  const lines: string[] = [];
  const portfolioName = portfolio?.name ?? '';
  const isVrBand = Boolean(portfolio.strategy.vrBand);
  const isMultiSplit = portfolio.strategy.multiSplit != null;
  const isNoStopMultiSplit = portfolio.strategy.noStopMultiSplit != null;

  lines.push(`📌 ${portfolioName}`);
  lines.push(`- ${getStrategyLabel(portfolio, lang)}`);
  const tzLabel = portfolio.alarmconfig?.timezone || 'Asia/Seoul';
  lines.push(`- ${messages.alarmTimes} (${tzLabel}): ${hours || '-'}`);

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
          `- ${messages.section} ${maActiveSection}: ${messages.sectionWatchBothNotMet}`,
        );
      } else if (effectiveAlignmentNot) {
        lines.push(
          `- ${messages.section} ${maActiveSection}: ${messages.sectionWatchAlignmentNotMet}`,
        );
      } else if (effectiveRsiNot) {
        lines.push(
          `- ${messages.section} ${maActiveSection}: ${messages.sectionWatchRsiNotMet}`,
        );
      } else {
        const stock = getMaSectionStock(portfolio, maActiveSection);
        if (stock) {
          lines.push(
            `- ${messages.section} ${maActiveSection}: ${stock} ${messages.buy}`,
          );
        }
      }
    }

    if (maPartialProfitLines && maPartialProfitLines.length > 0) {
      maPartialProfitLines.forEach(({ section, stock, quantity }) => {
        if (section !== 1 && section !== 2 && section !== 3) return;

        if (!isMaPartialProfitEnabled(portfolio, section)) return;

        const roundedQuantity = Math.round(quantity);
        if (roundedQuantity > 0 && stock) {
          lines.push(
            `- ${messages.section} ${section} ${messages.sectionPartialProfit}: ${stock} ${roundedQuantity}${messages.sharesUnit}`,
          );
        }
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

  if (options.multiSplitExecutionData == null) {
    lines.push(`- ${messages.noOrder}`);
    return lines.join('\n');
  }

  const multiSplitLines = buildMultiSplitExecutionSummaryLines({
    lang,
    execution: options.multiSplitExecutionData,
  });
  lines.push(...multiSplitLines.map((line) => `- ${line}`));
  return lines.join('\n');
}

export type { PartialProfitStrategyConfig };
