export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isFiniteNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isStrictPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function areStrictPositiveFiniteScalars(...values: unknown[]): boolean {
  return values.every(isStrictPositiveFiniteNumber);
}

export function areFiniteNonNegativeScalars(...values: unknown[]): boolean {
  return values.every(isFiniteNonNegativeNumber);
}

export function areFiniteScalars(...values: unknown[]): boolean {
  return values.every(isFiniteNumber);
}

export function isStrictPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function areAllFiniteNumbers(values: unknown[]): boolean {
  return (
    Array.isArray(values) &&
    values.every(isFiniteNumber)
  );
}

export function parseNumberFromTrimmedExternalString(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return Number.NaN;
  }

  return Number(trimmed);
}
