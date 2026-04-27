import { validateFinancialArgs } from '../utils/vrBandStrategy';

interface SharedFinancialValidationArgs {
  name: string;
  value: number;
  context: string;
  min?: number;
  max?: number;
  strictPositive?: boolean;
  integer?: boolean;
  maxDecimalPlaces?: number;
}

function createTargetValueChannelValidationError(
  context: string,
  message: string,
): Error {
  return new Error(`[TVC_Math_Error] ${context}: ${message}`);
}

function countDecimalPlaces(value: number): number {
  const valueText = value.toString().toLowerCase();
  if (!valueText.includes('e')) {
    return valueText.split('.')[1]?.length ?? 0;
  }

  const [coefficientText, exponentText] = valueText.split('e');
  const exponent = Number(exponentText);
  const fractionalLength = coefficientText.split('.')[1]?.length ?? 0;

  if (!Number.isFinite(exponent)) {
    return fractionalLength;
  }

  return Math.max(0, fractionalLength - exponent);
}

export function validateWithSharedFinancialArgs(
  args: SharedFinancialValidationArgs,
): void {
  const baseRule =
    args.strictPositive === true
      ? { strictPositive: true }
      : args.min !== undefined
        ? { min: args.min }
        : {};

  validateFinancialArgs(
    { [args.name]: args.value },
    { [args.name]: baseRule },
    args.context,
  );

  if (args.min !== undefined && args.strictPositive === true && args.value < args.min) {
    throw createTargetValueChannelValidationError(
      args.context,
      `${args.name} must be >= ${args.min}. Received: ${args.name}=${args.value}`,
    );
  }

  if (args.integer === true && !Number.isInteger(args.value)) {
    throw createTargetValueChannelValidationError(
      args.context,
      `${args.name} must be an integer. Received: ${args.name}=${args.value}`,
    );
  }

  if (
    args.maxDecimalPlaces !== undefined &&
    countDecimalPlaces(args.value) > args.maxDecimalPlaces
  ) {
    throw createTargetValueChannelValidationError(
      args.context,
      `${args.name} must have <= ${args.maxDecimalPlaces} decimal places. Received: ${args.name}=${args.value}`,
    );
  }

  if (args.max !== undefined && args.value > args.max) {
    throw createTargetValueChannelValidationError(
      args.context,
      `${args.name} must be <= ${args.max}. Received: ${args.name}=${args.value}`,
    );
  }
}
