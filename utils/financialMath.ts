export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function ceilToTwoDecimals(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export function roundShares4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function floorToNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value + Number.EPSILON));
}
