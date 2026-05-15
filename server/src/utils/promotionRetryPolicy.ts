const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_MULTIPLIER = 2;

function readPositiveIntegerEnv(
  key: string,
  fallbackValue: number,
): number {
  const rawValue = process.env[key];
  if (rawValue == null || rawValue.trim() === "") {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
}

export function getPromotionRetryMaxAttempts(): number {
  return readPositiveIntegerEnv(
    "BENEFIT_PROMOTION_RETRY_MAX_ATTEMPTS",
    DEFAULT_MAX_ATTEMPTS,
  );
}

export function resolvePromotionRetryDelayMs(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    throw new Error("attemptCount_must_be_non_negative_integer");
  }

  const initialDelayMs = readPositiveIntegerEnv(
    "BENEFIT_PROMOTION_RETRY_INITIAL_DELAY_MS",
    DEFAULT_INITIAL_DELAY_MS,
  );
  const maxDelayMs = readPositiveIntegerEnv(
    "BENEFIT_PROMOTION_RETRY_MAX_DELAY_MS",
    DEFAULT_MAX_DELAY_MS,
  );
  const retryDelayMs = initialDelayMs * BACKOFF_MULTIPLIER ** attemptCount;

  return Math.min(retryDelayMs, maxDelayMs);
}

export function resolveNextPromotionRetryAt(
  attemptCount: number,
  now = new Date(),
): string {
  const retryDelayMs = resolvePromotionRetryDelayMs(attemptCount);
  return new Date(now.getTime() + retryDelayMs).toISOString();
}
