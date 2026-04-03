import type { UserTier } from '@/types/userTier';

export type PaidTier = UserTier;

export function resolvePaidTier(currentTier: string): PaidTier {
  if (currentTier === 'pro') {
    return 'pro';
  }

  if (currentTier === 'premium' || currentTier === 'enterprise') {
    return 'premium';
  }

  return 'free';
}

export function replaceHashIfMatched(expectedHash: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentLocation = window.location;
  if (currentLocation.hash !== expectedHash) {
    return;
  }

  window.history.replaceState(
    null,
    '',
    `${currentLocation.pathname}${currentLocation.search}`,
  );
}

export function assertNever(value: never): never {
  throw new Error(`[assertNever] Unexpected value: ${String(value)}`);
}
