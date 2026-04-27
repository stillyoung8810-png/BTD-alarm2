import { roundMoney } from './financialMath.ts';
import type { MultiSplitGuideState } from './multiSplitShared.ts';

export type Lang = 'ko' | 'en';

export type MultiSplitExecutionMessageId =
  | 'multiSplit.cashUsage'
  | 'multiSplit.locBuy'
  | 'multiSplit.mocBuy'
  | 'multiSplit.buyGuide'
  | 'multiSplit.insufficientFunds'
  | 'multiSplit.firstBuyGuide'
  | 'multiSplit.dataErrorNotice'
  | 'multiSplit.mainTakeProfit'
  | 'multiSplit.intermediateTakeProfit'
  | 'multiSplit.riskCut'
  | 'format.textLine'
  | 'format.percentLabel'
  | 'format.priceQuantity'
  | 'format.quantityOnly'
  | 'common.sharesUnit';

export const MULTI_SPLIT_EXECUTION_MESSAGE_IDS = {
  cashUsage: 'multiSplit.cashUsage',
  locBuy: 'multiSplit.locBuy',
  mocBuy: 'multiSplit.mocBuy',
  buyGuide: 'multiSplit.buyGuide',
  insufficientFunds: 'multiSplit.insufficientFunds',
  firstBuyGuide: 'multiSplit.firstBuyGuide',
  dataErrorNotice: 'multiSplit.dataErrorNotice',
  mainTakeProfit: 'multiSplit.mainTakeProfit',
  intermediateTakeProfit: 'multiSplit.intermediateTakeProfit',
  riskCut: 'multiSplit.riskCut',
  textLine: 'format.textLine',
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
    'multiSplit.buyGuide': '매수 가이드',
    'multiSplit.insufficientFunds': '매수금 부족',
    'multiSplit.firstBuyGuide':
      '첫 매수는 장중 아무 때나, 1회 매수금 기준으로 자유롭게 매수해 주세요.',
    'multiSplit.dataErrorNotice': '평단가 정보를 불러올 수 없습니다.',
    'multiSplit.mainTakeProfit': '메인 익절',
    'multiSplit.intermediateTakeProfit': '중간 익절',
    'multiSplit.riskCut': '위험 관리 손절',
    'format.textLine': '{label}: {value}',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': '주',
  },
  en: {
    'multiSplit.cashUsage': 'Cash Usage',
    'multiSplit.locBuy': 'Average-price buy (LOC)',
    'multiSplit.mocBuy': 'Split buy (MOC)',
    'multiSplit.buyGuide': 'Buy guide',
    'multiSplit.insufficientFunds': 'Insufficient Funds',
    'multiSplit.firstBuyGuide':
      'For the first buy, feel free to buy anytime during market hours using one buy tranche as the reference.',
    'multiSplit.dataErrorNotice': 'Unable to load average price information.',
    'multiSplit.mainTakeProfit': 'Main take profit',
    'multiSplit.intermediateTakeProfit': 'Intermediate take profit',
    'multiSplit.riskCut': 'Risk management stop-loss',
    'format.textLine': '{label}: {value}',
    'format.percentLabel': '{label}: {value}%',
    'format.priceQuantity': '{label}: {price} / {quantity}{unit}',
    'format.quantityOnly': '{label}: {quantity}{unit}',
    'common.sharesUnit': ' shares',
  },
};

export type MultiSplitExecutionSummaryData = Pick<
  MultiSplitGuideState,
  | 'cashUsagePct'
  | 'isFirstBuy'
  | 'isDataError'
  | 'isSeedExhausted'
  | 'isLowBudget'
  | 'displayLocBuy'
  | 'displayMocBuy'
  | 'sellGuide'
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

function formatTextLine(args: {
  template: string;
  label: string;
  value: string;
}): string {
  return applyTemplate({
    template: args.template,
    replacements: {
      label: args.label,
      value: args.value,
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

  if (args.execution.isFirstBuy) {
    lines.push(
      formatTextLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.textLine],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.buyGuide],
        value: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.firstBuyGuide],
      }),
    );
    return lines;
  }

  if (args.execution.isDataError) {
    lines.push(messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.dataErrorNotice]);
    return lines;
  }

  if (args.execution.isLowBudget) {
    lines.push(
      formatTextLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.textLine],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.buyGuide],
        value: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.insufficientFunds],
      }),
    );
  } else {
    if (args.execution.displayLocBuy != null) {
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

    if (args.execution.displayMocBuy != null) {
      lines.push(
        formatQuantityLine({
          template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.quantityOnly],
          label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mocBuy],
          quantity: args.execution.displayMocBuy.quantity,
          sharesUnit,
        }),
      );
    }
  }

  if (args.execution.sellGuide.displayMainTakeProfit != null) {
    lines.push(
      formatPriceQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.priceQuantity],
        label: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.mainTakeProfit],
        price: args.execution.sellGuide.displayMainTakeProfit.price,
        quantity: args.execution.sellGuide.displayMainTakeProfit.quantity,
        sharesUnit,
      }),
    );
  }

  if (args.execution.sellGuide.displayIntermediateTakeProfit != null) {
    lines.push(
      formatPriceQuantityLine({
        template: messages[MULTI_SPLIT_EXECUTION_MESSAGE_IDS.priceQuantity],
        label:
          messages[
            MULTI_SPLIT_EXECUTION_MESSAGE_IDS.intermediateTakeProfit
          ],
        price: args.execution.sellGuide.displayIntermediateTakeProfit.price,
        quantity: args.execution.sellGuide.displayIntermediateTakeProfit.quantity,
        sharesUnit,
      }),
    );
  }

  const shouldShowRiskCut =
    args.execution.isLowBudget || args.execution.isSeedExhausted;
  if (shouldShowRiskCut) {
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
