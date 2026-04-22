export type Lang = 'ko' | 'en';

export type NoStopExecutionMessageId =
  | 'noStop.strategyProgress'
  | 'noStop.lowLoc'
  | 'noStop.mocBuy'
  | 'noStop.takeProfit'
  | 'noStop.firstBuyHint'
  | 'noStop.splitComplete'
  | 'common.sharesUnit';

export const NO_STOP_EXECUTION_MESSAGE_IDS = {
  strategyProgress: 'noStop.strategyProgress',
  lowLoc: 'noStop.lowLoc',
  mocBuy: 'noStop.mocBuy',
  takeProfit: 'noStop.takeProfit',
  firstBuyHint: 'noStop.firstBuyHint',
  splitComplete: 'noStop.splitComplete',
  sharesUnit: 'common.sharesUnit',
} as const satisfies Record<string, NoStopExecutionMessageId>;

const MIN_PROGRESS_PERCENT = 0;
const MAX_PROGRESS_PERCENT = 100;
const PERCENT_SCALE = 100;

type NoStopExecutionMessageMap = Record<NoStopExecutionMessageId, string>;

const NO_STOP_EXECUTION_MESSAGES: Record<Lang, NoStopExecutionMessageMap> = {
  ko: {
    'noStop.strategyProgress': '전략 진행률',
    'noStop.lowLoc': '평단가 매수 (LOC)',
    'noStop.mocBuy': '분할 매수 (MOC)',
    'noStop.takeProfit': '익절 목표',
    'noStop.firstBuyHint': '첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.',
    'noStop.splitComplete':
      '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유와 익절만 수행합니다.',
    'common.sharesUnit': '주',
  },
  en: {
    'noStop.strategyProgress': 'Strategy progress',
    'noStop.lowLoc': 'Average-price buy (LOC)',
    'noStop.mocBuy': 'Split buy (MOC)',
    'noStop.takeProfit': 'Take-profit target',
    'noStop.firstBuyHint':
      'For the first buy, feel free to buy anytime during market hours.',
    'noStop.splitComplete':
      'All split buys are complete. Hold the position and wait for take profit without additional buys.',
    'common.sharesUnit': ' shares',
  },
};

export interface NoStopExecutionSummaryData {
  progressPct: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: { price: number; quantity: number };
  displayMocBuy?: { quantity: number };
  takeProfit?: { price: number; quantity: number };
}

interface FormatExecutionLineArgs {
  label: string;
  price?: number;
  quantity: number;
  formatPrice: (price: number) => string;
  formatQuantity: (quantity: number) => string;
  sharesUnit: string;
}

export function getNoStopExecutionMessages(lang: Lang): NoStopExecutionMessageMap {
  return NO_STOP_EXECUTION_MESSAGES[lang] ?? NO_STOP_EXECUTION_MESSAGES.ko;
}

function normalizeProgressPct(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_PROGRESS_PERCENT;
  }

  const boundedValue = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, value),
  );

  return Math.round((boundedValue + Number.EPSILON) * PERCENT_SCALE) / PERCENT_SCALE;
}

export function formatNoStopProgressText(progressPct: number): string {
  const normalizedProgress = normalizeProgressPct(progressPct);
  const fixedText = normalizedProgress.toFixed(2).replace(/\.?0+$/, '');
  return `${fixedText}%`;
}

function formatExecutionLine(args: FormatExecutionLineArgs): string {
  const quantityText = `${args.formatQuantity(args.quantity)}${args.sharesUnit}`;
  if (args.price == null) {
    return `${args.label}: ${quantityText}`;
  }

  return `${args.label}: ${args.formatPrice(args.price)} / ${quantityText}`;
}

export function buildNoStopExecutionSummaryLines(args: {
  lang: Lang;
  execution: NoStopExecutionSummaryData;
  formatPrice: (price: number) => string;
  formatQuantity: (quantity: number) => string;
  sharesUnit?: string;
}): string[] {
  const messages = getNoStopExecutionMessages(args.lang);
  const sharesUnit =
    args.sharesUnit ?? messages[NO_STOP_EXECUTION_MESSAGE_IDS.sharesUnit];
  const lines = [
    `${messages[NO_STOP_EXECUTION_MESSAGE_IDS.strategyProgress]}: ${formatNoStopProgressText(
      args.execution.progressPct,
    )}`,
  ];

  if (args.execution.isFirstBuy) {
    lines.push(messages[NO_STOP_EXECUTION_MESSAGE_IDS.firstBuyHint]);
    return lines;
  }

  if (args.execution.isSplitComplete) {
    if (args.execution.takeProfit != null) {
      lines.push(
        formatExecutionLine({
          label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.takeProfit],
          price: args.execution.takeProfit.price,
          quantity: args.execution.takeProfit.quantity,
          formatPrice: args.formatPrice,
          formatQuantity: args.formatQuantity,
          sharesUnit,
        }),
      );
    }

    lines.push(messages[NO_STOP_EXECUTION_MESSAGE_IDS.splitComplete]);
    return lines;
  }

  if (args.execution.displayLowLoc != null) {
    lines.push(
      formatExecutionLine({
        label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.lowLoc],
        price: args.execution.displayLowLoc.price,
        quantity: args.execution.displayLowLoc.quantity,
        formatPrice: args.formatPrice,
        formatQuantity: args.formatQuantity,
        sharesUnit,
      }),
    );
  }

  if (args.execution.displayMocBuy != null) {
    lines.push(
      formatExecutionLine({
        label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.mocBuy],
        quantity: args.execution.displayMocBuy.quantity,
        formatPrice: args.formatPrice,
        formatQuantity: args.formatQuantity,
        sharesUnit,
      }),
    );
  }

  if (args.execution.takeProfit != null) {
    lines.push(
      formatExecutionLine({
        label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.takeProfit],
        price: args.execution.takeProfit.price,
        quantity: args.execution.takeProfit.quantity,
        formatPrice: args.formatPrice,
        formatQuantity: args.formatQuantity,
        sharesUnit,
      }),
    );
  }

  return lines;
}
