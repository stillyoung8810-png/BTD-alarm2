import { roundMoney } from './financialMath.ts';
import type { MultiSplitGuideState } from './multiSplitShared.ts';

export type Lang = 'ko' | 'en';

export type MultiSplitExecutionMessageId =
  | 'multiSplit.cashUsage'
  | 'multiSplit.locBuy'
  | 'multiSplit.mocBuy'
  | 'multiSplit.mainTakeProfit'
  | 'multiSplit.intermediateTakeProfit'
  | 'multiSplit.riskCut'
  | 'format.percentLabel'
  | 'format.priceQuantity'
  | 'format.quantityOnly'
  | 'common.sharesUnit';

export const MULTI_SPLIT_EXECUTION_MESSAGE_IDS = {
  cashUsage: 'multiSplit.cashUsage',
  locBuy: 'multiSplit.locBuy',
  mocBuy: 'multiSplit.mocBuy',
  mainTakeProfit: 'multiSplit.mainTakeProfit',
  intermediateTakeProfit: 'multiSplit.intermediateTakeProfit',
  riskCut: 'multiSplit.riskCut',
  percentLabel: 'format.percentLabel',
  priceQuantity: 'format.priceQuantity',
  quantityOnly: 'format.quantityOnly',
  sharesUnit: 'common.sharesUnit',
} as const satisfies Record<string, MultiSplitExecutionMessageId>;

type MultiSplitExecutionMessageMap = Record<
  MultiSplitExecutionMessageId,
  string
>;

const MIN_PROGRESS_PERCENT = 0;
const MAX_PROGRESS_PERCENT = 100;

const MULTI_SPLIT_EXECUTION_MESSAGES: Record<
  Lang,
  MultiSplitExecutionMessageMap
> = {
  ko: {
    'multiSplit.cashUsage': '현금 사용률',
    'multiSplit.locBuy': '평단가 매수 (LOC)',
    'multiSplit.mocBuy': '분할 매수 (MOC)',
    'multiSplit.mainTakeProfit': '메인 익절',
    'multiSplit.intermediateTakeProfit': '중간 익절',
    'multiSplit.riskCut': '리스크 컷',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': '주',
  },
  en: {
    'multiSplit.cashUsage': 'Cash Usage',
    'multiSplit.locBuy': 'Average-price buy (LOC)',
    'multiSplit.mocBuy': 'Split buy (MOC)',
    'multiSplit.mainTakeProfit': 'Main take profit',
    'multiSplit.intermediateTakeProfit': 'Intermediate take profit',
    'multiSplit.riskCut': 'Risk cut',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': ' shares',
  },
};

export type MultiSplitExecutionSummaryData = Pick<
  MultiSplitGuideState,
  'cashUsagePct' | 'displayLocBuy' | 'displayMocBuy' | 'sellGuide'
>;

export interface MultiSplitProgressVm {
  labelText: string;
  widthPct: number;
}

interface ApplyTemplateArgs {
  template: string;
  replacements: Record<string, string>;
}

interface FormatQuantityLineArgs {
  template: string;
  label: string;
  quantity: number;
  sharesUnit: string;
}

interface FormatPriceQuantityLineArgs extends FormatQuantityLineArgs {
  price: number;
}

export function getMultiSplitExecutionMessages(
  lang: Lang,
): MultiSplitExecutionMessageMap {
  return MULTI_SPLIT_EXECUTION_MESSAGES[lang] ?? MULTI_SPLIT_EXECUTION_MESSAGES.ko;
}

export function applyTemplate(args: ApplyTemplateArgs): string {
  let renderedText = args.template;

  for (const [key, value] of Object.entries(args.replacements)) {
    renderedText = renderedText.replaceAll(`{${key}}`, value);
  }

  return renderedText;
}

export function formatPercentText(value: number): string {
  const boundedValue = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, value),
  );

  return String(roundMoney(boundedValue));
}

export function formatCurrency(value: number, currencyCode: string = 'USD'): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  return roundMoney(value).toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantityLine(args: FormatQuantityLineArgs): string {
  return applyTemplate({
    template: args.template,
    replacements: {
      label: args.label,
      quantity: String(args.quantity),
      unit: args.sharesUnit,
    },
  });
}

function formatPriceQuantityLine(args: FormatPriceQuantityLineArgs): string {
  return applyTemplate({
    template: args.template,
    replacements: {
      label: args.label,
      price: formatCurrency(args.price),
      quantity: String(args.quantity),
      unit: args.sharesUnit,
    },
  });
}

export function buildMultiSplitProgressVm(args: {
  cashUsagePct: number;
  lang: Lang;
}): MultiSplitProgressVm {
  const boundedUsagePct = Math.min(
    MAX_PROGRESS_PERCENT,
    Math.max(MIN_PROGRESS_PERCENT, args.cashUsagePct),
  );
  const messages = getMultiSplitExecutionMessages(args.lang);

  return {
    labelText: applyTemplate({
      template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.percentLabel],
      replacements: {
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.cashUsage],
        value: formatPercentText(boundedUsagePct),
      },
    }),
    widthPct: boundedUsagePct,
  };
}

export function buildMultiSplitExecutionSummaryLines(args: {
  lang: Lang;
  execution: MultiSplitExecutionSummaryData;
}): string[] {
  const messages = getMultiSplitExecutionMessages(args.lang);
  const sharesUnit = messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.sharesUnit];
  const progressVm = buildMultiSplitProgressVm({
    cashUsagePct: args.execution.cashUsagePct,
    lang: args.lang,
  });
  const lines = [progressVm.labelText];

  if (
    args.execution.displayLocBuy != null &&
    args.execution.displayLocBuy.quantity > 0
  ) {
    lines.push(
      formatPriceQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.priceQuantity],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.locBuy],
        price: args.execution.displayLocBuy.price,
        quantity: args.execution.displayLocBuy.quantity,
        sharesUnit,
      }),
    );
  }

  if (
    args.execution.displayMocBuy != null &&
    args.execution.displayMocBuy.quantity > 0
  ) {
    lines.push(
      formatQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.quantityOnly],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mocBuy],
        quantity: args.execution.displayMocBuy.quantity,
        sharesUnit,
      }),
    );
  }

  if (args.execution.sellGuide.mainTakeProfitQty > 0) {
    lines.push(
      formatQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.quantityOnly],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mainTakeProfit],
        quantity: args.execution.sellGuide.mainTakeProfitQty,
        sharesUnit,
      }),
    );
  }

  if (args.execution.sellGuide.intermediateTakeProfitQty > 0) {
    lines.push(
      formatQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.quantityOnly],
        label:
          messages[
            MULTI_SPLIT_EXECUTION_MESSAGE_IDS.intermediateTakeProfit
          ],
        quantity: args.execution.sellGuide.intermediateTakeProfitQty,
        sharesUnit,
      }),
    );
  }

  if (args.execution.sellGuide.riskCutQty > 0) {
    lines.push(
      formatQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.quantityOnly],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.riskCut],
        quantity: args.execution.sellGuide.riskCutQty,
        sharesUnit,
      }),
    );
  }

  return lines;
}
