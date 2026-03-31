import type { UserTier } from '@/types/userTier';
import type {
  AdRouteKey,
  InterstitialPlacementDefinition,
  InterstitialPlacementKey,
} from './interstitialPlacementConfig';

const PRELOAD_TIMEOUT_MS = 10_000;
const SHOW_TIMEOUT_MS = 10_000;
const BASE_RETRY_DELAY_MS = 3_000;
const MAX_BACKOFF_EXPONENT = 4;
const POST_DISMISS_COOLDOWN_MS = 1_000;

export type { UserTier };

export type AdSlotPhase =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'ready'
  | 'showing'
  | 'cooldown'
  | 'error'
  | 'disabled';

export type AdResultCode =
  | 'none'
  | 'loaded'
  | 'shown'
  | 'skipped_unsupported'
  | 'skipped_ineligible_tier'
  | 'skipped_not_ready'
  | 'skipped_first_action_exemption'
  | 'skipped_show_in_progress'
  | 'load_timeout'
  | 'load_error'
  | 'show_timeout'
  | 'failed_to_show'
  | 'show_error';

export interface AdSlotSnapshot {
  key: InterstitialPlacementKey;
  phase: AdSlotPhase;
  readyAtMs: number | null;
  lastLoadStartedAtMs: number | null;
  lastLoadCompletedAtMs: number | null;
  lastShowCompletedAtMs: number | null;
  consecutiveFailures: number;
  nextRetryAtMs: number | null;
  lastResultCode: AdResultCode;
  lastErrorMessage: string | null;
}

export interface InstantShowResult {
  shown: boolean;
  code: AdResultCode;
}

export type ManagerListener = (snapshots: ReadonlyArray<AdSlotSnapshot>) => void;

export interface AppAudioManager {
  pauseAllSounds: () => void;
  resumeAllSounds: () => void;
}

export interface OfficialLoadFullScreenAdEvent {
  type: 'loaded';
}

export type OfficialShowFullScreenAdEvent =
  | { type: 'requested' }
  | { type: 'show' }
  | { type: 'impression' }
  | { type: 'clicked' }
  | { type: 'dismissed' }
  | { type: 'failedToShow' }
  | {
      type: 'userEarnedReward';
      data: {
        unitType: string;
        unitAmount: number;
      };
    };

export interface OfficialLoadFullScreenAd {
  (params: {
    options: { adGroupId: string };
    onEvent: (event: OfficialLoadFullScreenAdEvent) => void;
    onError: (error: unknown) => void;
  }): () => void;
  isSupported(): boolean;
}

export interface OfficialShowFullScreenAd {
  (params: {
    options: { adGroupId: string };
    onEvent: (event: OfficialShowFullScreenAdEvent) => void;
    onError: (error: unknown) => void;
  }): () => void;
  isSupported(): boolean;
}

export interface IntegratedAdApi {
  readonly loadFullScreenAd?: OfficialLoadFullScreenAd;
  readonly showFullScreenAd?: OfficialShowFullScreenAd;
}

export interface FullScreenAdBridge {
  isSupported(): boolean;
  load(adGroupId: string): Promise<void>;
  show(adGroupId: string): Promise<void>;
}

export interface GlobalAdManagerOptions {
  readonly audioManager: AppAudioManager;
  readonly now?: () => number;
  readonly deferFirstInterstitialAttemptOncePerSession?: boolean;
  readonly onDrainError?: (error: unknown) => void;
  readonly initialTier: UserTier;
}

interface SlotRuntime {
  snapshot: AdSlotSnapshot;
  isLoadLocked: boolean;
  isShowLocked: boolean;
  retryTimerId: ReturnType<typeof setTimeout> | null;
  cooldownTimerId: ReturnType<typeof setTimeout> | null;
}

const DISPOSED_GET_SNAPSHOTS_FALLBACK: ReadonlyArray<AdSlotSnapshot> =
  Object.freeze([]);

function createInitialSnapshot(key: InterstitialPlacementKey): AdSlotSnapshot {
  return {
    key,
    phase: 'idle',
    readyAtMs: null,
    lastLoadStartedAtMs: null,
    lastLoadCompletedAtMs: null,
    lastShowCompletedAtMs: null,
    consecutiveFailures: 0,
    nextRetryAtMs: null,
    lastResultCode: 'none',
    lastErrorMessage: null,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'unknown_error';
}

function calculateNextRetryAtMs(
  nowMs: number,
  consecutiveFailures: number,
): number {
  const safeFailureCount = consecutiveFailures > 0 ? consecutiveFailures : 1;
  const exponent = Math.min(safeFailureCount - 1, MAX_BACKOFF_EXPONENT);
  const delayMs = BASE_RETRY_DELAY_MS * 2 ** exponent;
  return nowMs + delayMs;
}

function isTierEligible(
  placement: InterstitialPlacementDefinition,
  tier: UserTier,
): boolean {
  return placement.eligibleTiers.includes(tier);
}

function hasSupportedLoadMethod(
  method: IntegratedAdApi['loadFullScreenAd'],
): method is OfficialLoadFullScreenAd {
  if (typeof method !== 'function') {
    return false;
  }

  if (typeof method.isSupported !== 'function') {
    return false;
  }

  return method.isSupported() === true;
}

function hasSupportedShowMethod(
  method: IntegratedAdApi['showFullScreenAd'],
): method is OfficialShowFullScreenAd {
  if (typeof method !== 'function') {
    return false;
  }

  if (typeof method.isSupported !== 'function') {
    return false;
  }

  return method.isSupported() === true;
}

function executeWithTimeout<T>(
  executor: (
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
    onCancel: (cancelHandler: () => void) => void,
  ) => void,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelHandler: (() => void) | null = null;

    const safeResolve = (value: T): void => {
      if (timerId != null) {
        clearTimeout(timerId);
        timerId = null;
      }
      resolve(value);
    };

    const safeReject = (reason?: unknown): void => {
      if (timerId != null) {
        clearTimeout(timerId);
        timerId = null;
      }
      reject(reason);
    };

    timerId = setTimeout(() => {
      if (cancelHandler != null) {
        cancelHandler();
      }
      safeReject(new Error(timeoutMessage));
    }, timeoutMs);

    try {
      executor(
        safeResolve,
        safeReject,
        (handler: () => void) => {
          cancelHandler = handler;
        },
      );
    } catch (error: unknown) {
      safeReject(error);
    }
  });
}

function createSafeUnregister(
  register: (cleanup: () => void) => () => void,
): () => void {
  let unregister: (() => void) | null = null;
  let shouldRunAfterAssign = false;
  let isConsumed = false;

  const cleanup = (): void => {
    if (isConsumed) {
      return;
    }

    if (unregister == null) {
      shouldRunAfterAssign = true;
      return;
    }

    isConsumed = true;
    const current = unregister;
    unregister = null;
    current();
  };

  unregister = register(cleanup);

  if (shouldRunAfterAssign) {
    cleanup();
  }

  return cleanup;
}

export function createTossIntegratedFullScreenAdBridge(
  api: IntegratedAdApi,
): FullScreenAdBridge {
  return {
    isSupported(): boolean {
      return (
        hasSupportedLoadMethod(api.loadFullScreenAd) &&
        hasSupportedShowMethod(api.showFullScreenAd)
      );
    },

    async load(adGroupId: string): Promise<void> {
      if (!hasSupportedLoadMethod(api.loadFullScreenAd)) {
        throw new Error('unsupported');
      }

      return executeWithTimeout<void>(
        (resolve, reject, onCancel) => {
          const cleanup = createSafeUnregister((safeCleanup) => {
            onCancel(() => {
              safeCleanup();
            });

            return api.loadFullScreenAd({
              options: { adGroupId },
              onEvent: (event) => {
                if (event.type !== 'loaded') {
                  return;
                }

                safeCleanup();
                resolve();
              },
              onError: (error: unknown) => {
                safeCleanup();
                reject(error);
              },
            });
          });

          void cleanup;
        },
        PRELOAD_TIMEOUT_MS,
        'load_timeout',
      );
    },

    async show(adGroupId: string): Promise<void> {
      if (!hasSupportedShowMethod(api.showFullScreenAd)) {
        throw new Error('unsupported');
      }

      return executeWithTimeout<void>(
        (resolve, reject, onCancel) => {
          const cleanup = createSafeUnregister((safeCleanup) => {
            onCancel(() => {
              safeCleanup();
            });

            return api.showFullScreenAd({
              options: { adGroupId },
              onEvent: (event) => {
                switch (event.type) {
                  case 'requested':
                  case 'show':
                  case 'impression':
                  case 'clicked':
                  case 'userEarnedReward':
                    return;
                  case 'dismissed':
                    safeCleanup();
                    resolve();
                    return;
                  case 'failedToShow':
                    safeCleanup();
                    reject(new Error('failed_to_show'));
                    return;
                  default: {
                    const neverEvent: never = event;
                    void neverEvent;
                  }
                }
              },
              onError: (error: unknown) => {
                safeCleanup();
                reject(error);
              },
            });
          });

          void cleanup;
        },
        SHOW_TIMEOUT_MS,
        'show_timeout',
      );
    },
  };
}

export class GlobalAdManager {
  private readonly definitions = new Map<
    InterstitialPlacementKey,
    InterstitialPlacementDefinition
  >();
  private readonly slots = new Map<InterstitialPlacementKey, SlotRuntime>();
  private readonly listeners = new Set<ManagerListener>();
  private loadQueue: InterstitialPlacementKey[] = [];
  private isDrainingQueue = false;
  private isDisposed = false;

  private readonly audioManager: AppAudioManager;
  private readonly nowFn: () => number;
  private readonly deferFirstInterstitialAttemptOncePerSession: boolean;
  private readonly onDrainError: (error: unknown) => void;

  private cachedSnapshotsReadonly: ReadonlyArray<AdSlotSnapshot> | null = null;
  private currentTier: UserTier;
  private hasConsumedDeferredFirstInterstitialAttempt = false;

  public constructor(
    private readonly bridge: FullScreenAdBridge,
    definitions: readonly InterstitialPlacementDefinition[],
    options: GlobalAdManagerOptions,
  ) {
    this.audioManager = options.audioManager;
    this.nowFn = options.now ?? (() => Date.now());
    this.deferFirstInterstitialAttemptOncePerSession =
      options.deferFirstInterstitialAttemptOncePerSession !== false;
    this.currentTier = options.initialTier;
    this.onDrainError =
      options.onDrainError ??
      ((error: unknown) => {
        console.error(
          '[GlobalAdManager] Unhandled error during drainLoadQueue:',
          error,
        );
      });

    definitions.forEach((definition) => {
      this.definitions.set(definition.key, definition);
      this.slots.set(definition.key, {
        snapshot: createInitialSnapshot(definition.key),
        isLoadLocked: false,
        isShowLocked: false,
        retryTimerId: null,
        cooldownTimerId: null,
      });
    });
  }

  public setCurrentTier(tier: UserTier): void {
    if (this.isDisposed) {
      return;
    }

    this.currentTier = tier;
  }

  public subscribe(listener: ManagerListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshots(): ReadonlyArray<AdSlotSnapshot> {
    if (this.isDisposed) {
      return DISPOSED_GET_SNAPSHOTS_FALLBACK;
    }

    if (this.cachedSnapshotsReadonly == null) {
      this.cachedSnapshotsReadonly = Array.from(this.slots.values()).map(
        (slot) => slot.snapshot,
      );
    }

    return this.cachedSnapshotsReadonly;
  }

  public getSnapshot(
    key: InterstitialPlacementKey,
  ): AdSlotSnapshot | null {
    const slot = this.slots.get(key);
    if (slot == null) {
      return null;
    }

    return slot.snapshot;
  }

  public primeRoute(routeKey: AdRouteKey): void {
    for (const definition of this.definitions.values()) {
      if (!definition.preloadOnRoutes.includes(routeKey)) {
        continue;
      }

      this.prime(definition.key);
    }
  }

  public prime(key: InterstitialPlacementKey): void {
    if (this.isDisposed) {
      return;
    }

    const definition = this.definitions.get(key);
    const slot = this.slots.get(key);
    if (definition == null || slot == null) {
      return;
    }

    if (!this.bridge.isSupported()) {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: 'skipped_unsupported',
        lastErrorMessage: null,
      });
      return;
    }

    if (!isTierEligible(definition, this.currentTier)) {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: 'skipped_ineligible_tier',
        lastErrorMessage: null,
      });
      return;
    }

    const nowMs = this.nowFn();
    if (slot.snapshot.nextRetryAtMs != null && nowMs < slot.snapshot.nextRetryAtMs) {
      return;
    }

    if (
      slot.snapshot.phase === 'queued' ||
      slot.snapshot.phase === 'loading' ||
      slot.snapshot.phase === 'ready' ||
      slot.snapshot.phase === 'showing'
    ) {
      return;
    }

    this.clearRetryTimer(slot);
    this.clearCooldownTimer(slot);
    this.enqueue(key);
    this.updateSnapshot(key, {
      phase: 'queued',
      lastErrorMessage: null,
    });
    void this.drainLoadQueue().catch((error: unknown) => {
      this.onDrainError(error);
    });
  }

  public async showInstant(
    key: InterstitialPlacementKey,
  ): Promise<InstantShowResult> {
    if (this.isDisposed) {
      return { shown: false, code: 'show_error' };
    }

    const validation = this.validateShowInstant(key);
    if (validation.ok === false) {
      const rejectionCode = validation.code;
      this.handleShowInstantRejected(key, rejectionCode);
      return { shown: false, code: rejectionCode };
    }

    const { definition, slot } = validation;

    slot.isShowLocked = true;
    this.clearCooldownTimer(slot);
    this.updateSnapshot(key, {
      phase: 'showing',
      lastErrorMessage: null,
    });

    try {
      this.audioManager.pauseAllSounds();
      await this.bridge.show(definition.adGroupId);

      if (this.isDisposed) {
        return { shown: false, code: 'show_error' };
      }

      this.updateSnapshot(key, {
        phase: 'cooldown',
        lastShowCompletedAtMs: this.nowFn(),
        lastResultCode: 'shown',
        lastErrorMessage: null,
      });
      this.schedulePostDismissReload(key);

      return { shown: true, code: 'shown' };
    } catch (error: unknown) {
      if (this.isDisposed) {
        return { shown: false, code: 'show_error' };
      }

      const code = this.mapShowErrorToCode(error);
      this.recordFailure(key, code, getErrorMessage(error));
      return { shown: false, code };
    } finally {
      slot.isShowLocked = false;

      try {
        this.audioManager.resumeAllSounds();
      } catch (resumeError: unknown) {
        console.error(
          '[GlobalAdManager] Failed to safely resume sounds:',
          resumeError,
        );
      }
    }
  }

  private validateShowInstant(
    key: InterstitialPlacementKey,
  ):
    | {
        ok: true;
        definition: InterstitialPlacementDefinition;
        slot: SlotRuntime;
      }
    | { ok: false; code: AdResultCode } {
    const definition = this.definitions.get(key);
    const slot = this.slots.get(key);
    if (definition == null || slot == null) {
      return { ok: false, code: 'show_error' };
    }

    if (!this.bridge.isSupported()) {
      return { ok: false, code: 'skipped_unsupported' };
    }

    if (!isTierEligible(definition, this.currentTier)) {
      return { ok: false, code: 'skipped_ineligible_tier' };
    }

    if (this.deferFirstInterstitialAttemptOncePerSession) {
      if (!this.hasConsumedDeferredFirstInterstitialAttempt) {
        this.hasConsumedDeferredFirstInterstitialAttempt = true;
        return { ok: false, code: 'skipped_first_action_exemption' };
      }
    }

    if (slot.isShowLocked) {
      return { ok: false, code: 'skipped_show_in_progress' };
    }

    if (slot.snapshot.phase !== 'ready') {
      return { ok: false, code: 'skipped_not_ready' };
    }

    return { ok: true, definition, slot };
  }

  private handleShowInstantRejected(
    key: InterstitialPlacementKey,
    code: AdResultCode,
  ): void {
    if (code === 'show_error') {
      return;
    }

    if (code === 'skipped_first_action_exemption') {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_first_action_exemption',
      });
      this.prime(key);
      return;
    }

    if (code === 'skipped_not_ready') {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_not_ready',
      });
      this.prime(key);
      return;
    }

    if (code === 'skipped_show_in_progress') {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_show_in_progress',
      });
      return;
    }

    if (code === 'skipped_unsupported' || code === 'skipped_ineligible_tier') {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: code,
        lastErrorMessage: null,
      });
    }
  }

  public static tearDownForAppRoot(manager: GlobalAdManager): void {
    manager.disposeInternal();
  }

  private disposeInternal(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.isDrainingQueue = false;
    this.cachedSnapshotsReadonly = null;
    this.listeners.clear();
    this.loadQueue.length = 0;
    this.hasConsumedDeferredFirstInterstitialAttempt = false;

    for (const slot of this.slots.values()) {
      this.clearRetryTimer(slot);
      this.clearCooldownTimer(slot);
    }
  }

  private enqueue(key: InterstitialPlacementKey): void {
    if (this.loadQueue.includes(key)) {
      return;
    }

    this.loadQueue.push(key);
  }

  private async drainLoadQueue(): Promise<void> {
    if (this.isDisposed || this.isDrainingQueue) {
      return;
    }

    this.isDrainingQueue = true;
    try {
      while (true) {
        if (this.isDisposed) {
          break;
        }

        const nextKey = this.pickNextLoadableKey();
        if (nextKey == null) {
          break;
        }

        await this.loadQueuedPlacement(nextKey);
      }
    } finally {
      this.isDrainingQueue = false;
    }
  }

  private pickNextLoadableKey(): InterstitialPlacementKey | null {
    const nowMs = this.nowFn();
    const kept: InterstitialPlacementKey[] = [];
    let picked: InterstitialPlacementKey | null = null;

    for (const key of this.loadQueue) {
      const definition = this.definitions.get(key);
      const slot = this.slots.get(key);

      if (
        definition == null ||
        slot == null ||
        !isTierEligible(definition, this.currentTier)
      ) {
        continue;
      }

      if (slot.snapshot.nextRetryAtMs != null && nowMs < slot.snapshot.nextRetryAtMs) {
        kept.push(key);
        continue;
      }

      if (slot.isLoadLocked || slot.isShowLocked) {
        kept.push(key);
        continue;
      }

      if (picked == null) {
        picked = key;
        continue;
      }

      kept.push(key);
    }

    this.loadQueue = kept;
    return picked;
  }

  private async loadQueuedPlacement(
    key: InterstitialPlacementKey,
  ): Promise<void> {
    const definition = this.definitions.get(key);
    const slot = this.slots.get(key);
    if (definition == null || slot == null) {
      return;
    }

    if (slot.isLoadLocked) {
      return;
    }

    slot.isLoadLocked = true;
    this.updateSnapshot(key, {
      phase: 'loading',
      lastLoadStartedAtMs: this.nowFn(),
      lastErrorMessage: null,
    });

    try {
      await this.bridge.load(definition.adGroupId);
      if (this.isDisposed) {
        return;
      }

      this.updateSnapshot(key, {
        phase: 'ready',
        readyAtMs: this.nowFn(),
        lastLoadCompletedAtMs: this.nowFn(),
        consecutiveFailures: 0,
        nextRetryAtMs: null,
        lastResultCode: 'loaded',
        lastErrorMessage: null,
      });
    } catch (error: unknown) {
      if (this.isDisposed) {
        return;
      }

      const code = this.mapLoadErrorToCode(error);
      this.recordFailure(key, code, getErrorMessage(error));
    } finally {
      slot.isLoadLocked = false;
    }
  }

  private schedulePostDismissReload(key: InterstitialPlacementKey): void {
    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    this.clearCooldownTimer(slot);
    slot.cooldownTimerId = setTimeout(() => {
      slot.cooldownTimerId = null;
      this.updateSnapshot(key, {
        phase: 'idle',
        readyAtMs: null,
      });
      this.prime(key);
    }, POST_DISMISS_COOLDOWN_MS);
  }

  private clearRetryTimer(slot: SlotRuntime): void {
    if (slot.retryTimerId == null) {
      return;
    }

    clearTimeout(slot.retryTimerId);
    slot.retryTimerId = null;
  }

  private clearCooldownTimer(slot: SlotRuntime): void {
    if (slot.cooldownTimerId == null) {
      return;
    }

    clearTimeout(slot.cooldownTimerId);
    slot.cooldownTimerId = null;
  }

  private recordFailure(
    key: InterstitialPlacementKey,
    code: AdResultCode,
    errorMessage: string,
  ): void {
    if (this.isDisposed) {
      return;
    }

    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    const nextFailureCount = slot.snapshot.consecutiveFailures + 1;
    const nextRetryAtMs = calculateNextRetryAtMs(this.nowFn(), nextFailureCount);

    this.updateSnapshot(key, {
      phase: 'error',
      readyAtMs: null,
      consecutiveFailures: nextFailureCount,
      nextRetryAtMs,
      lastResultCode: code,
      lastErrorMessage: errorMessage,
    });

    this.scheduleRetry(key, nextRetryAtMs);
  }

  private scheduleRetry(
    key: InterstitialPlacementKey,
    nextRetryAtMs: number,
  ): void {
    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    this.clearRetryTimer(slot);

    const delayMs = Math.max(nextRetryAtMs - this.nowFn(), 0);
    slot.retryTimerId = setTimeout(() => {
      slot.retryTimerId = null;
      this.prime(key);
    }, delayMs);
  }

  private updateSnapshot(
    key: InterstitialPlacementKey,
    partial: Partial<AdSlotSnapshot>,
  ): void {
    if (this.isDisposed) {
      return;
    }

    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    slot.snapshot = {
      ...slot.snapshot,
      ...partial,
    };
    this.cachedSnapshotsReadonly = null;
    this.notify();
  }

  private notify(): void {
    const snapshots = this.getSnapshots();
    const currentListeners = Array.from(this.listeners);

    for (const listener of currentListeners) {
      listener(snapshots);
    }
  }

  private mapLoadErrorToCode(error: unknown): AdResultCode {
    const message = getErrorMessage(error);
    if (message === 'load_timeout') {
      return 'load_timeout';
    }

    return 'load_error';
  }

  private mapShowErrorToCode(error: unknown): AdResultCode {
    const message = getErrorMessage(error);
    if (message === 'show_timeout') {
      return 'show_timeout';
    }

    if (message === 'failed_to_show') {
      return 'failed_to_show';
    }

    return 'show_error';
  }
}
