/**
 * Ad preload architecture snippets
 *
 * Why:
 * - 클릭 시점 load 금지 원칙을 코드 레벨에서 강제합니다.
 * - logical placement key와 adGroupId를 분리해 preload 상태 충돌을 방지합니다.
 * - 토스 최신 공식 통합 광고 API(loadFullScreenAd/showFullScreenAd)를 주입형 bridge로 감싸
 *   실제 앱 연결과 가상 시뮬레이션을 같은 manager 인터페이스로 검증할 수 있게 합니다.
 */

const PRELOAD_TIMEOUT_MS = 8_000;
const SHOW_TIMEOUT_MS = 8_000;
const READY_TTL_MS = 60_000;
const BASE_RETRY_DELAY_MS = 3_000;
const MAX_BACKOFF_EXPONENT = 4;
const POST_DISMISS_COOLDOWN_MS = 500;
const DEFAULT_WAIT_FOR_PHASE_TIMEOUT_MS = 15_000;
const WAIT_FOR_PHASE_POLL_INTERVAL_MS = 50;

export type UserTier = 'free' | 'pro' | 'premium';
export type AdRouteKey = 'dashboard' | 'history' | 'portfolio_details';

export const INTERSTITIAL_PLACEMENT_KEYS = {
  STRATEGY_SAVE: 'strategy_save',
  TRADE_SAVE: 'trade_save',
  ALARM_SAVE: 'alarm_save',
  SETTLEMENT_DETAIL: 'settlement_detail',
} as const;

export type InterstitialPlacementKey =
  (typeof INTERSTITIAL_PLACEMENT_KEYS)[keyof typeof INTERSTITIAL_PLACEMENT_KEYS];

export interface PlacementDefinition {
  key: InterstitialPlacementKey;
  adGroupId: string;
  preloadOnRoutes: readonly AdRouteKey[];
  eligibleTiers: readonly UserTier[];
}

const TEST_INTERSTITIAL_AD_GROUP_ID = 'ait.dev.43daa14da3ae487b';

export const INTERSTITIAL_PLACEMENT_DEFINITIONS: readonly PlacementDefinition[] = [
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    adGroupId: TEST_INTERSTITIAL_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    adGroupId: TEST_INTERSTITIAL_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard', 'portfolio_details'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.ALARM_SAVE,
    adGroupId: TEST_INTERSTITIAL_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL,
    adGroupId: TEST_INTERSTITIAL_AD_GROUP_ID,
    preloadOnRoutes: ['history', 'portfolio_details'],
    eligibleTiers: ['free'],
  },
] as const;

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
  | 'skipped_stale_ready'
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
  loadFullScreenAd: OfficialLoadFullScreenAd;
  showFullScreenAd: OfficialShowFullScreenAd;
}

export interface FullScreenAdBridge {
  isSupported(): boolean;
  load(adGroupId: string): Promise<void>;
  show(adGroupId: string): Promise<void>;
}

interface SlotRuntime {
  snapshot: AdSlotSnapshot;
  isLoadLocked: boolean;
  isShowLocked: boolean;
  retryTimerId: ReturnType<typeof setTimeout> | null;
  cooldownTimerId: ReturnType<typeof setTimeout> | null;
}

function createInitialSnapshot(
  key: InterstitialPlacementKey,
): AdSlotSnapshot {
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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutCode: AdResultCode,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new Error(timeoutCode));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timerId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timerId);
        reject(error);
      },
    );
  });
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
  placement: PlacementDefinition,
  tier: UserTier,
): boolean {
  return placement.eligibleTiers.includes(tier);
}

function isReadySnapshotStale(
  snapshot: AdSlotSnapshot,
  nowMs: number,
): boolean {
  if (snapshot.readyAtMs == null) {
    return true;
  }

  return nowMs - snapshot.readyAtMs > READY_TTL_MS;
}

function createSafeUnregister(
  register: (cleanup: () => void) => () => void,
): () => void {
  let unregister: (() => void) | null = null;
  let shouldRunAfterAssign = false;

  const cleanup = (): void => {
    if (unregister == null) {
      shouldRunAfterAssign = true;
      return;
    }

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
        api.loadFullScreenAd.isSupported() &&
        api.showFullScreenAd.isSupported()
      );
    },

    async load(adGroupId: string): Promise<void> {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const cleanup = createSafeUnregister((safeCleanup) =>
            api.loadFullScreenAd({
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
            }),
          );

          void cleanup;
        }),
        PRELOAD_TIMEOUT_MS,
        'load_timeout',
      );
    },

    async show(adGroupId: string): Promise<void> {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const cleanup = createSafeUnregister((safeCleanup) =>
            api.showFullScreenAd({
              options: { adGroupId },
              onEvent: (event) => {
                switch (event.type) {
                  case 'requested':
                  case 'show':
                  case 'impression':
                  case 'clicked':
                    return;
                  case 'dismissed':
                    safeCleanup();
                    resolve();
                    return;
                  case 'failedToShow':
                    safeCleanup();
                    reject(new Error('failed_to_show'));
                    return;
                  case 'userEarnedReward':
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
            }),
          );

          void cleanup;
        }),
        SHOW_TIMEOUT_MS,
        'show_timeout',
      );
    },
  };
}

export class GlobalAdManager {
  private readonly definitions = new Map<
    InterstitialPlacementKey,
    PlacementDefinition
  >();

  private readonly slots = new Map<InterstitialPlacementKey, SlotRuntime>();
  private readonly listeners = new Set<ManagerListener>();
  private readonly loadQueue: InterstitialPlacementKey[] = [];

  private activeLoadPlacementKey: InterstitialPlacementKey | null = null;
  private isDisposed = false;

  public constructor(
    private readonly bridge: FullScreenAdBridge,
    definitions: readonly PlacementDefinition[],
    private readonly now: () => number = () => Date.now(),
  ) {
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

  public subscribe(listener: ManagerListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshots());

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshots(): ReadonlyArray<AdSlotSnapshot> {
    return Array.from(this.slots.values()).map((slot) => ({ ...slot.snapshot }));
  }

  public getSnapshot(
    key: InterstitialPlacementKey,
  ): AdSlotSnapshot | null {
    const slot = this.slots.get(key);
    if (slot == null) {
      return null;
    }

    return { ...slot.snapshot };
  }

  public primeRoute(routeKey: AdRouteKey, tier: UserTier): void {
    for (const definition of this.definitions.values()) {
      if (!definition.preloadOnRoutes.includes(routeKey)) {
        continue;
      }

      this.prime(definition.key, tier);
    }
  }

  public prime(key: InterstitialPlacementKey, tier: UserTier): void {
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

    if (!isTierEligible(definition, tier)) {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: 'skipped_ineligible_tier',
        lastErrorMessage: null,
      });
      return;
    }

    const nowMs = this.now();
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
    this.enqueue(key);
    this.updateSnapshot(key, {
      phase: 'queued',
      lastErrorMessage: null,
    });
    void this.drainLoadQueue(tier);
  }

  public async showInstant(
    key: InterstitialPlacementKey,
    tier: UserTier,
  ): Promise<InstantShowResult> {
    if (this.isDisposed) {
      return { shown: false, code: 'show_error' };
    }

    const definition = this.definitions.get(key);
    const slot = this.slots.get(key);
    if (definition == null || slot == null) {
      return { shown: false, code: 'show_error' };
    }

    if (!this.bridge.isSupported()) {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: 'skipped_unsupported',
        lastErrorMessage: null,
      });
      return { shown: false, code: 'skipped_unsupported' };
    }

    if (!isTierEligible(definition, tier)) {
      this.updateSnapshot(key, {
        phase: 'disabled',
        lastResultCode: 'skipped_ineligible_tier',
        lastErrorMessage: null,
      });
      return { shown: false, code: 'skipped_ineligible_tier' };
    }

    if (slot.isShowLocked) {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_show_in_progress',
      });
      return { shown: false, code: 'skipped_show_in_progress' };
    }

    const nowMs = this.now();
    if (slot.snapshot.phase !== 'ready') {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_not_ready',
      });
      this.prime(key, tier);
      return { shown: false, code: 'skipped_not_ready' };
    }

    if (isReadySnapshotStale(slot.snapshot, nowMs)) {
      this.updateSnapshot(key, {
        phase: 'idle',
        readyAtMs: null,
        lastResultCode: 'skipped_stale_ready',
      });
      this.prime(key, tier);
      return { shown: false, code: 'skipped_stale_ready' };
    }

    slot.isShowLocked = true;
    this.clearCooldownTimer(slot);
    this.updateSnapshot(key, {
      phase: 'showing',
      lastErrorMessage: null,
    });

    try {
      await this.bridge.show(definition.adGroupId);
      this.updateSnapshot(key, {
        phase: 'cooldown',
        lastShowCompletedAtMs: this.now(),
        lastResultCode: 'shown',
        lastErrorMessage: null,
      });
      this.schedulePostDismissReload(key, tier);
      return { shown: true, code: 'shown' };
    } catch (error: unknown) {
      const code = this.mapShowErrorToCode(error);
      this.recordFailure(key, code, getErrorMessage(error), tier);
      return { shown: false, code };
    } finally {
      slot.isShowLocked = false;
    }
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.listeners.clear();
    this.loadQueue.length = 0;

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

  private async drainLoadQueue(tier: UserTier): Promise<void> {
    if (this.isDisposed || this.activeLoadPlacementKey != null) {
      return;
    }

    const nextKey = this.pickNextLoadableKey(tier);
    if (nextKey == null) {
      return;
    }

    await this.loadQueuedPlacement(nextKey, tier);
  }

  private pickNextLoadableKey(
    tier: UserTier,
  ): InterstitialPlacementKey | null {
    while (this.loadQueue.length > 0) {
      const nextKey = this.loadQueue.shift();
      if (nextKey == null) {
        return null;
      }

      const definition = this.definitions.get(nextKey);
      const slot = this.slots.get(nextKey);
      if (definition == null || slot == null) {
        continue;
      }

      if (!isTierEligible(definition, tier)) {
        continue;
      }

      const nowMs = this.now();
      if (slot.snapshot.nextRetryAtMs != null && nowMs < slot.snapshot.nextRetryAtMs) {
        continue;
      }

      if (slot.isLoadLocked || slot.isShowLocked) {
        continue;
      }

      return nextKey;
    }

    return null;
  }

  private async loadQueuedPlacement(
    key: InterstitialPlacementKey,
    tier: UserTier,
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
    this.activeLoadPlacementKey = key;
    this.updateSnapshot(key, {
      phase: 'loading',
      lastLoadStartedAtMs: this.now(),
      lastErrorMessage: null,
    });

    try {
      await this.bridge.load(definition.adGroupId);
      this.updateSnapshot(key, {
        phase: 'ready',
        readyAtMs: this.now(),
        lastLoadCompletedAtMs: this.now(),
        consecutiveFailures: 0,
        nextRetryAtMs: null,
        lastResultCode: 'loaded',
        lastErrorMessage: null,
      });
    } catch (error: unknown) {
      const code = this.mapLoadErrorToCode(error);
      this.recordFailure(key, code, getErrorMessage(error), tier);
    } finally {
      slot.isLoadLocked = false;
      this.activeLoadPlacementKey = null;
      await this.drainLoadQueue(tier);
    }
  }

  private recordFailure(
    key: InterstitialPlacementKey,
    code: AdResultCode,
    errorMessage: string,
    tier: UserTier,
  ): void {
    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    const nextFailureCount = slot.snapshot.consecutiveFailures + 1;
    const nextRetryAtMs = calculateNextRetryAtMs(this.now(), nextFailureCount);

    this.updateSnapshot(key, {
      phase: 'error',
      readyAtMs: null,
      consecutiveFailures: nextFailureCount,
      nextRetryAtMs,
      lastResultCode: code,
      lastErrorMessage: errorMessage,
    });

    this.scheduleRetry(key, tier, nextRetryAtMs);
  }

  private scheduleRetry(
    key: InterstitialPlacementKey,
    tier: UserTier,
    nextRetryAtMs: number,
  ): void {
    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    this.clearRetryTimer(slot);

    const delayMs = Math.max(nextRetryAtMs - this.now(), 0);
    slot.retryTimerId = setTimeout(() => {
      slot.retryTimerId = null;
      this.prime(key, tier);
    }, delayMs);
  }

  private schedulePostDismissReload(
    key: InterstitialPlacementKey,
    tier: UserTier,
  ): void {
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
      this.prime(key, tier);
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

  private updateSnapshot(
    key: InterstitialPlacementKey,
    partial: Partial<AdSlotSnapshot>,
  ): void {
    const slot = this.slots.get(key);
    if (slot == null) {
      return;
    }

    slot.snapshot = {
      ...slot.snapshot,
      ...partial,
    };
    this.notify();
  }

  private notify(): void {
    const snapshots = this.getSnapshots();
    for (const listener of this.listeners) {
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

export interface VirtualLoadPlanStep {
  delayMs: number;
  shouldSucceed: boolean;
  errorMessage?: string;
}

export interface VirtualShowPlanStep {
  delayMs: number;
  shouldSucceed: boolean;
  errorMessage?: string;
}

export class VirtualFullScreenAdBridge implements FullScreenAdBridge {
  private readonly loadCursor = new Map<string, number>();
  private readonly showCursor = new Map<string, number>();

  public constructor(
    private readonly loadPlans: Readonly<Record<string, readonly VirtualLoadPlanStep[]>>,
    private readonly showPlans: Readonly<Record<string, readonly VirtualShowPlanStep[]>>,
    private readonly isFeatureSupported: boolean = true,
  ) {}

  public isSupported(): boolean {
    return this.isFeatureSupported;
  }

  public async load(adGroupId: string): Promise<void> {
    const plan = this.getCurrentStep(adGroupId, this.loadPlans, this.loadCursor);
    await this.sleep(plan.delayMs);
    if (!plan.shouldSucceed) {
      throw new Error(plan.errorMessage ?? 'virtual_load_error');
    }
  }

  public async show(adGroupId: string): Promise<void> {
    const plan = this.getCurrentStep(adGroupId, this.showPlans, this.showCursor);
    await this.sleep(plan.delayMs);
    if (!plan.shouldSucceed) {
      throw new Error(plan.errorMessage ?? 'failed_to_show');
    }
  }

  private getCurrentStep<T extends VirtualLoadPlanStep | VirtualShowPlanStep>(
    adGroupId: string,
    planTable: Readonly<Record<string, readonly T[]>>,
    cursorTable: Map<string, number>,
  ): T {
    const plan = planTable[adGroupId];
    if (plan == null || plan.length === 0) {
      throw new Error('virtual_plan_missing');
    }

    const currentIndex = cursorTable.get(adGroupId) ?? 0;
    const safeIndex = currentIndex < plan.length ? currentIndex : plan.length - 1;
    cursorTable.set(adGroupId, safeIndex + 1);
    return plan[safeIndex];
  }

  private async sleep(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

export interface SimulationResult {
  firstShow: InstantShowResult;
  secondShow: InstantShowResult;
  finalSnapshots: ReadonlyArray<AdSlotSnapshot>;
}

export async function waitForSlotPhase(
  manager: GlobalAdManager,
  key: InterstitialPlacementKey,
  targetPhase: AdSlotPhase,
  timeoutMs: number = DEFAULT_WAIT_FOR_PHASE_TIMEOUT_MS,
): Promise<void> {
  const startedAtMs = Date.now();

  while (Date.now() - startedAtMs <= timeoutMs) {
    const snapshot = manager.getSnapshot(key);
    if (snapshot?.phase === targetPhase) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, WAIT_FOR_PHASE_POLL_INTERVAL_MS);
    });
  }

  throw new Error('wait_for_phase_timeout');
}

export async function runVirtualAdSimulation(): Promise<SimulationResult> {
  const bridge = new VirtualFullScreenAdBridge(
    {
      [TEST_INTERSTITIAL_AD_GROUP_ID]: [
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: false, errorMessage: 'virtual_load_network_error' },
      ],
    },
    {
      [TEST_INTERSTITIAL_AD_GROUP_ID]: [
        { delayMs: 80, shouldSucceed: true },
        { delayMs: 80, shouldSucceed: false, errorMessage: 'failed_to_show' },
      ],
    },
  );

  const manager = new GlobalAdManager(
    bridge,
    INTERSTITIAL_PLACEMENT_DEFINITIONS,
  );

  manager.primeRoute('dashboard', 'free');
  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'ready',
  );

  const firstShow = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'free',
  );

  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'ready',
  );

  const secondShow = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    'free',
  );

  return {
    firstShow,
    secondShow,
    finalSnapshots: manager.getSnapshots(),
  };
}

/**
 * Integration note:
 * const bridge = createTossIntegratedFullScreenAdBridge({
 *   loadFullScreenAd,
 *   showFullScreenAd,
 * });
 * const manager = new GlobalAdManager(bridge, INTERSTITIAL_PLACEMENT_DEFINITIONS);
 */
