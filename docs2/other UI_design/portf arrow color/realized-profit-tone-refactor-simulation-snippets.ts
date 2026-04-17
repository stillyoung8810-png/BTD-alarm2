/**
 * Realized profit tone simulation snippets
 *
 * Purpose:
 * - verify that the realized-profit row tone follows realizedProfit
 * - keep the ROI badge tone yield-based
 * - neutralize rounded-zero realized profit before production edits
 */

const DECIMAL_BASE = 10;
const ZERO_AMOUNT = 0;
const USD_DISPLAY_DECIMAL_PLACES = 2;
const ROI_DISPLAY_DECIMAL_PLACES = 1;
const LOADING_ELLIPSIS_LABEL = '...';
const EN_US_LOCALE = 'en-US';

type SimDashboardChangeTone = 'positive' | 'negative' | 'neutral';
type SimDirectionKey = 'up' | 'down' | 'none';
type SimIndicatorIconName = 'TrendingUp' | 'TrendingDown' | 'Circle';

const TONE_TEXT_COLOR_MAP: Record<SimDashboardChangeTone, string> = {
  positive: 'text-emerald-500',
  negative: 'text-rose-500',
  neutral: 'text-slate-400 dark:text-slate-500',
};

const TONE_BADGE_CLASS_MAP: Record<SimDashboardChangeTone, string> = {
  positive: 'bg-emerald-500 text-white',
  negative: 'bg-rose-500 text-white',
  neutral: 'bg-slate-500 text-white',
};

const TONE_ROTATION_CLASS_MAP: Record<SimDashboardChangeTone, string> = {
  positive: '',
  negative: 'rotate-180',
  neutral: '',
};

const TONE_INDICATOR_KEY_MAP: Record<SimDashboardChangeTone, SimDirectionKey> = {
  positive: 'up',
  negative: 'down',
  neutral: 'none',
};

const REALIZED_PROFIT_INDICATOR_ICON_NAME_MAP: Record<
  SimDirectionKey,
  SimIndicatorIconName
> = {
  up: 'TrendingUp',
  down: 'TrendingDown',
  none: 'Circle',
};

interface SimPortfolioCardVm {
  yieldTone: SimDashboardChangeTone;
  realizedProfitTone: SimDashboardChangeTone;
  roiText: string;
  roiBadgeClassName: string;
  roiIconClassName: string;
  realizedProfitText: string;
  realizedProfitIndicatorKey: SimDirectionKey;
  realizedProfitIndicatorIconName: SimIndicatorIconName;
  isRealizedProfitIndicatorAriaHidden: boolean;
  realizedProfitTextClassName: string;
}

interface SimPortfolioCardVmArgs {
  isMetricsLoading: boolean;
  yieldRate: number;
  realizedProfit: number;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function normalizeDecimalPlacesSim(digits: number): number {
  if (!Number.isFinite(digits)) {
    return USD_DISPLAY_DECIMAL_PLACES;
  }

  return Math.max(0, Math.trunc(digits));
}

function getRoundedSim(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): number {
  if (!Number.isFinite(value)) {
    return ZERO_AMOUNT;
  }

  const normalizedDigits = normalizeDecimalPlacesSim(digits);
  const factor = DECIMAL_BASE ** normalizedDigits;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isRoundedZeroSim(value: number): boolean {
  return Object.is(value, -0) || value === ZERO_AMOUNT;
}

function formatUsdValueSim(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedDigits = normalizeDecimalPlacesSim(digits);
  const rounded = getRoundedSim(value, normalizedDigits);
  const displayValue = isRoundedZeroSim(rounded) ? ZERO_AMOUNT : rounded;

  return `$${displayValue.toLocaleString(EN_US_LOCALE, {
    minimumFractionDigits: normalizedDigits,
    maximumFractionDigits: normalizedDigits,
  })}`;
}

function formatSignedUsdValueSim(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedDigits = normalizeDecimalPlacesSim(digits);
  const rounded = getRoundedSim(value, normalizedDigits);

  if (isRoundedZeroSim(rounded)) {
    return formatUsdValueSim(ZERO_AMOUNT, normalizedDigits);
  }

  if (rounded > ZERO_AMOUNT) {
    return `+${formatUsdValueSim(rounded, normalizedDigits)}`;
  }

  return `-${formatUsdValueSim(Math.abs(rounded), normalizedDigits)}`;
}

function formatSignedPercentSim(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): string {
  const normalizedDigits = normalizeDecimalPlacesSim(digits);
  const rounded = getRoundedSim(value, normalizedDigits);

  if (isRoundedZeroSim(rounded)) {
    return `${ZERO_AMOUNT.toFixed(normalizedDigits)}%`;
  }

  if (rounded > ZERO_AMOUNT) {
    return `+${rounded.toFixed(normalizedDigits)}%`;
  }

  return `${rounded.toFixed(normalizedDigits)}%`;
}

function getChangeToneSim(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): SimDashboardChangeTone {
  const rounded = getRoundedSim(value, digits);

  if (rounded > ZERO_AMOUNT) {
    return 'positive';
  }
  if (rounded < ZERO_AMOUNT) {
    return 'negative';
  }
  return 'neutral';
}

function getRealizedProfitIndicatorKeySim(
  tone: SimDashboardChangeTone,
): SimDirectionKey {
  return TONE_INDICATOR_KEY_MAP[tone];
}

function getRealizedProfitTextClassNameSim(
  tone: SimDashboardChangeTone,
): string {
  return TONE_TEXT_COLOR_MAP[tone];
}

function getRoiBadgeClassNameSim(tone: SimDashboardChangeTone): string {
  return TONE_BADGE_CLASS_MAP[tone];
}

function getRoiIconClassNameSim(tone: SimDashboardChangeTone): string {
  return TONE_ROTATION_CLASS_MAP[tone];
}

function getRealizedProfitIndicatorIconNameSim(
  indicatorKey: SimDirectionKey,
): SimIndicatorIconName {
  return REALIZED_PROFIT_INDICATOR_ICON_NAME_MAP[indicatorKey];
}

function buildPortfolioCardVmSim(
  args: SimPortfolioCardVmArgs,
): SimPortfolioCardVm {
  const yieldTone = args.isMetricsLoading
    ? 'neutral'
    : getChangeToneSim(args.yieldRate, ROI_DISPLAY_DECIMAL_PLACES);
  const realizedProfitTone = args.isMetricsLoading
    ? 'neutral'
    : getChangeToneSim(
        args.realizedProfit,
        USD_DISPLAY_DECIMAL_PLACES,
      );

  return {
    yieldTone,
    realizedProfitTone,
    roiText: args.isMetricsLoading
      ? LOADING_ELLIPSIS_LABEL
      : formatSignedPercentSim(args.yieldRate, ROI_DISPLAY_DECIMAL_PLACES),
    roiBadgeClassName: getRoiBadgeClassNameSim(yieldTone),
    roiIconClassName: getRoiIconClassNameSim(yieldTone),
    realizedProfitText: args.isMetricsLoading
      ? LOADING_ELLIPSIS_LABEL
      : formatSignedUsdValueSim(
          args.realizedProfit,
          USD_DISPLAY_DECIMAL_PLACES,
        ),
    realizedProfitIndicatorKey:
      getRealizedProfitIndicatorKeySim(realizedProfitTone),
    realizedProfitIndicatorIconName:
      getRealizedProfitIndicatorIconNameSim(
        getRealizedProfitIndicatorKeySim(realizedProfitTone),
      ),
    isRealizedProfitIndicatorAriaHidden: true,
    realizedProfitTextClassName:
      getRealizedProfitTextClassNameSim(realizedProfitTone),
  };
}

export function simulateNegativeRealizedProfitRowUsesLossTone(): void {
  const vm = buildPortfolioCardVmSim({
    isMetricsLoading: false,
    yieldRate: 3.2,
    realizedProfit: -5.26,
  });

  assertEqual(vm.yieldTone, 'positive', 'yield tone');
  assertEqual(
    vm.roiBadgeClassName,
    TONE_BADGE_CLASS_MAP.positive,
    'ROI badge',
  );
  assertEqual(vm.realizedProfitTone, 'negative', 'realized profit tone');
  assertEqual(
    vm.realizedProfitIndicatorKey,
    'down',
    'realized profit indicator',
  );
  assertEqual(
    vm.realizedProfitIndicatorIconName,
    'TrendingDown',
    'realized profit indicator icon',
  );
  assertEqual(
    vm.isRealizedProfitIndicatorAriaHidden,
    true,
    'realized profit icon aria-hidden',
  );
  assertEqual(
    vm.realizedProfitTextClassName,
    TONE_TEXT_COLOR_MAP.negative,
    'realized profit class',
  );
  assertEqual(vm.realizedProfitText, '-$5.26', 'realized profit text');
}

export function simulatePositiveRealizedProfitRowUsesGainTone(): void {
  const vm = buildPortfolioCardVmSim({
    isMetricsLoading: false,
    yieldRate: -4.1,
    realizedProfit: 5.26,
  });

  assertEqual(vm.yieldTone, 'negative', 'yield tone');
  assertEqual(
    vm.roiBadgeClassName,
    TONE_BADGE_CLASS_MAP.negative,
    'ROI badge',
  );
  assertEqual(
    vm.roiIconClassName,
    TONE_ROTATION_CLASS_MAP.negative,
    'ROI icon',
  );
  assertEqual(vm.realizedProfitTone, 'positive', 'realized profit tone');
  assertEqual(
    vm.realizedProfitIndicatorKey,
    'up',
    'realized profit indicator',
  );
  assertEqual(
    vm.realizedProfitIndicatorIconName,
    'TrendingUp',
    'realized profit indicator icon',
  );
  assertEqual(
    vm.isRealizedProfitIndicatorAriaHidden,
    true,
    'realized profit icon aria-hidden',
  );
  assertEqual(
    vm.realizedProfitTextClassName,
    TONE_TEXT_COLOR_MAP.positive,
    'realized profit class',
  );
  assertEqual(vm.realizedProfitText, '+$5.26', 'realized profit text');
}

export function simulateRoundedZeroRealizedProfitRowUsesNeutralTone(): void {
  const vm = buildPortfolioCardVmSim({
    isMetricsLoading: false,
    yieldRate: 2.7,
    realizedProfit: -0.004,
  });

  assertEqual(vm.realizedProfitTone, 'neutral', 'realized profit tone');
  assertEqual(
    vm.realizedProfitIndicatorKey,
    'none',
    'realized profit indicator',
  );
  assertEqual(
    vm.realizedProfitIndicatorIconName,
    'Circle',
    'realized profit indicator icon',
  );
  assertEqual(
    vm.isRealizedProfitIndicatorAriaHidden,
    true,
    'realized profit icon aria-hidden',
  );
  assertEqual(
    vm.realizedProfitTextClassName,
    TONE_TEXT_COLOR_MAP.neutral,
    'realized profit class',
  );
  assertEqual(vm.realizedProfitText, '$0.00', 'realized profit text');
}

export function simulateLoadingStateKeepsRealizedToneNeutral(): void {
  const vm = buildPortfolioCardVmSim({
    isMetricsLoading: true,
    yieldRate: -9.9,
    realizedProfit: 123.45,
  });

  assertEqual(vm.realizedProfitTone, 'neutral', 'realized profit tone');
  assertEqual(
    vm.realizedProfitIndicatorKey,
    'none',
    'realized profit indicator',
  );
  assertEqual(
    vm.realizedProfitIndicatorIconName,
    'Circle',
    'realized profit indicator icon',
  );
  assertEqual(
    vm.isRealizedProfitIndicatorAriaHidden,
    true,
    'realized profit icon aria-hidden',
  );
  assertEqual(
    vm.realizedProfitText,
    LOADING_ELLIPSIS_LABEL,
    'realized profit text',
  );
}
