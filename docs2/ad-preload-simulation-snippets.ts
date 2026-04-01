import type { UserTier } from '@/types/userTier';

/**
 * Ad preload architecture snippets
 *
 * Why:
 * - 클릭 시점 load 금지 원칙을 코드 레벨에서 강제합니다.
 * - logical placement key와 adGroupId를 분리해 preload 상태 충돌을 방지합니다.
 * - 토스 통합 광고 API(loadFullScreenAd/showFullScreenAd)를 주입형 bridge로 감쌉니다.
 * - 마이그레이션: 구형 전면용 `adService.ts`(삭제됨)의 loadAppsInTossAdMob/showAppsInTossAdMob 래핑은 **앱에서 제거 완료** — 본 매니저 + 통합 `loadFullScreenAd`/`showFullScreenAd`로 **100% 전환**(계획서 §7). 보상형만 `rewardAdService.ts`에서 동일 GoogleAdMob API 사용. Telemetry·데이터 로깅은 **당장 스킵**(후속).
 * - 테스트 adGroupId는 ads/develop.html · ads/intro.html 명시 ID를 씁니다.
 *   (IntegratedAd.html 예제의 다른 샘플 ID와 별개 — 정책 페이지 우선.)
 *
 * Workspace rules (docs2/ad-preload-architecture.md 부록 참고):
 * - Rule 1·6: drainLoadQueue — while 루프 + isDrainingQueue; prime — clearRetryTimer + clearCooldownTimer(좀비 쿨다운 방지)
 * - Rule 6: pickNextLoadableKey — splice·루프 인덱스 조작 금지, kept 재할당; notify — Array.from(listeners)
 * - Rule 7: 검증 성공 분기 외 non-null assertion 미사용
 * - Rule 11: executeWithTimeout + onCancel; createSafeUnregister는 isConsumed 멱등; executor 동기 throw 시 try/catch → safeReject
 * - Rule 6·11: 티어는 `initialTier`+`setCurrentTier` SSOT — prime/drain/retry/showInstant에 tier 인자 없음; prime — drainLoadQueue .catch + onDrainError
 * - Rule 6: showInstant — AppAudio pause/show/resume 단일 try/catch; resume 예외는 내부 try/catch로 삼켜 Promise 결괏값 보존
 * - Rule 6: activeLoadPlacementKey 등 읽히지 않는 필드 금지; dispose 후 비동기 테일·좀비 retry 차단
 * - Rule 10: 스냅샷 객체 얕은 복사 금지 + getSnapshots 배열 참조 캐시(cachedSnapshotsReadonly)
 * - Rule 2: subscribe 즉시 호출 없음; React는 useSyncExternalStore로 스토어 구독(티어는 useLayoutEffect로 ref 동기화)
 * - Rule 6·7·11: 앱 부트스트랩에서는 SDK 심볼을 `IntegratedAdApi`에 **직접 대입하지 않음** — `services/ads/tossIntegratedFullScreenAdApi.ts`의 **Safe Wrapper**(`checkIsSupported`, `createSafeLoadAd`/`createSafeShowAd`)로 타입 경계·`undefined` 크래시를 선제 차단 (`docs2/integrated-full-screen-ad-bridge-refactor-plan.md` §3.2)
 * - 전면 전역 쿨타임: 생성자에서 `Math.max(0, globalCooldownMs ?? DEFAULT)` 클램프 + `elapsedMs = Math.max(0, nowMs - lastShown)` 시계 역전 방어 (`docs2/interstitial-global-cooldown-plan.md`)
 */

/** @see https://developers-apps-in-toss.toss.im/ads/develop.html — 테스트하기 */
export const TOSS_INTERSTITIAL_TEST_AD_GROUP_ID = 'ait-ad-test-interstitial-id';

const PRELOAD_TIMEOUT_MS = 10_000;
const SHOW_TIMEOUT_MS = 10_000;
const BASE_RETRY_DELAY_MS = 3_000;
const MAX_BACKOFF_EXPONENT = 4;
const POST_DISMISS_COOLDOWN_MS = 1_000;
/** 전역 전면 쿨타임 기본값 — `GlobalAdManagerOptions.globalCooldownMs` 미주입 시 사용(Rule 8·OCP). */
const DEFAULT_INTERSTITIAL_GLOBAL_COOLDOWN_MS = 60_000;
const DEFAULT_WAIT_FOR_PHASE_TIMEOUT_MS = 15_000;
const WAIT_FOR_PHASE_POLL_INTERVAL_MS = 50;

export type { UserTier };
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

export const INTERSTITIAL_PLACEMENT_DEFINITIONS: readonly PlacementDefinition[] = [
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    adGroupId: TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    adGroupId: TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard', 'portfolio_details'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.ALARM_SAVE,
    adGroupId: TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL,
    adGroupId: TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
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
  | 'skipped_first_action_exemption'
  | 'skipped_show_in_progress'
  | 'skipped_global_cooldown'
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

/** `dispose` 후 `getSnapshots()` — 안정적 참조(빈 배열 매번 새로 만들지 않음) */
const DISPOSED_GET_SNAPSHOTS_FALLBACK: ReadonlyArray<AdSlotSnapshot> = Object.freeze([]);

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

/** @see https://developers-apps-in-toss.toss.im/ads/qa.html — 전면 재생 시 배경음·효과음 일시 정지·복귀 후 재개 */
export interface AppAudioManager {
  pauseAllSounds: () => void;
  resumeAllSounds: () => void;
}

/** 가상 시뮬(`runVirtualAdSimulation`) 전용 — 운영 빌드는 Context 등에서 실제 오디오 구현을 주입한다. */
const DOCUMENT_SIMULATION_SILENT_AUDIO: AppAudioManager = {
  pauseAllSounds: () => {},
  resumeAllSounds: () => {},
};

export interface GlobalAdManagerOptions {
  /** 운영: 글로벌 BGM/효과음과 연결. 시뮬·단위 테스트만 인라인 no-op 객체를 넘긴다 — 노출용 noop 팩토리는 두지 않는다(Rule 6). */
  readonly audioManager: AppAudioManager;
  readonly now?: () => number;
  /**
   * true(기본): 세션 첫 `showInstant`만 `skipped_first_action_exemption` — 계획서 §4.4 확정.
   * 탭/스크롤 `markFirstAction` 없음. 가상 시뮬레이션만 false.
   */
  readonly deferFirstInterstitialAttemptOncePerSession?: boolean;
  /**
   * OCP: `prime` → `drainLoadQueue` 비동기 체인에서 잡힌 예외를 외부 모니터링으로 넘길 때 주입.
   * Sentry·Datadog 등은 루트 DI에서 `captureException` / `logger.error` 래핑을 연결한다. 미주입 시 `console.error` 폴백.
   */
  readonly onDrainError?: (error: unknown) => void;
  /**
   * Rule 6: 티어를 비동기 체인(drain·retry·cooldown 타이머)에 인자로 넘기면 드레인 루프·setTimeout 클로저에 **stale tier**가 박힌다.
   * 생성 시점 티어 + `setCurrentTier`로만 동기화하고, 평가는 항상 `this.currentTier` 단일 소스.
   */
  readonly initialTier: UserTier;
  /**
   * 전역 전면 광고 성공 노출 직후 쿨타임(ms). A/B·Remote Config 주입용.
   * 미주입 시 `DEFAULT_INTERSTITIAL_GLOBAL_COOLDOWN_MS`. 음수는 생성자에서 0으로 클램프.
   */
  readonly globalCooldownMs?: number;
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

/**
 * Rule 11: Promise에만 타임아웃을 씌우면 원본 bridge의 unregister가 남아 리스너가 누적될 수 있음.
 * 타임아웃 시 onCancel에 등록한 cleanup이 반드시 실행되도록 executor 패턴을 씁니다.
 * Edge: executor가 동기 throw하면 Promise 생성자가 reject하지만 safeReject가 안 타면 clearTimeout이 안 됨 —
 * try/catch로 safeReject를 보장해 타이머 누수를 막습니다.
 */
function executeWithTimeout<T>(
  executor: (
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
    onCancel: (cancelHandler: () => void) => void,
  ) => void,
  timeoutMs: number,
  timeoutCode: AdResultCode,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let cancelFn: (() => void) | null = null;
    let isSettled = false;

    const timerId = setTimeout(() => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      if (cancelFn != null) {
        cancelFn();
        cancelFn = null;
      }
      reject(new Error(timeoutCode));
    }, timeoutMs);

    const safeResolve = (value: T): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      clearTimeout(timerId);
      resolve(value);
    };

    const safeReject = (reason?: unknown): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      clearTimeout(timerId);
      reject(reason);
    };

    try {
      executor(safeResolve, safeReject, (handler) => {
        cancelFn = handler;
      });
    } catch (error: unknown) {
      safeReject(error);
    }
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
        api.loadFullScreenAd.isSupported() &&
        api.showFullScreenAd.isSupported()
      );
    },

    async load(adGroupId: string): Promise<void> {
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
    PlacementDefinition
  >();

  private readonly slots = new Map<InterstitialPlacementKey, SlotRuntime>();
  private readonly listeners = new Set<ManagerListener>();
  private loadQueue: InterstitialPlacementKey[] = [];

  /** 동시에 여러 `drainLoadQueue` 비동기 진입 방지 — while 루프 단일 드레이너 보장 */
  private isDrainingQueue = false;
  private isDisposed = false;

  /**
   * Rule 10: `getSnapshots()`가 호출될 때마다 새 배열을 만들면 Context 구독 전체가 매번 리렌더된다.
   * `updateSnapshot`으로 무효화하기 전까지 **동일 배열 참조**를 재사용한다.
   */
  private cachedSnapshotsReadonly: ReadonlyArray<AdSlotSnapshot> | null = null;

  private readonly audioManager: AppAudioManager;
  private readonly nowFn: () => number;
  private readonly deferFirstInterstitialAttemptOncePerSession: boolean;
  private readonly onDrainError: (error: unknown) => void;
  private hasConsumedDeferredFirstInterstitialAttempt = false;
  private currentTier: UserTier;
  private lastInterstitialShowCompletedAtMs: number | null = null;
  private readonly globalCooldownMs: number;

  public constructor(
    private readonly bridge: FullScreenAdBridge,
    definitions: readonly PlacementDefinition[],
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
    this.globalCooldownMs = Math.max(
      0,
      options.globalCooldownMs ?? DEFAULT_INTERSTITIAL_GLOBAL_COOLDOWN_MS,
    );

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

  /**
   * Task-sized grace window: 연속 저장/설정 중에는 전면이 끼어들지 않도록 전역 노출 간격을 둔다.
   * 시스템 시계가 역전되어도 남은 쿨타임이 비정상적으로 늘어나지 않게 경과 시간을 0 이상으로 고정한다.
   */
  private getRemainingInterstitialCooldownMs(nowMs: number): number {
    if (this.lastInterstitialShowCompletedAtMs == null) {
      return 0;
    }

    const elapsedMs = Math.max(
      0,
      nowMs - this.lastInterstitialShowCompletedAtMs,
    );
    if (elapsedMs >= this.globalCooldownMs) {
      return 0;
    }

    return this.globalCooldownMs - elapsedMs;
  }

  /**
   * React·루트에서 **렌더 사이클에 맞춰** 최신 구독 티어를 반영한다 (`useLayoutEffect` 권장).
   * 드레인·재시도·`showInstant` 검증은 모두 이 값을 읽는다 — tier를 메서드 인자로 깊이 넘기지 않는다.
   */
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

  /**
   * Rule 10: 슬롯 객체는 `updateSnapshot`에서만 교체·얕은 복사 없이 `slot.snapshot` 참조를 노출.
   * 배열은 `cachedSnapshotsReadonly`로 캐시해 **상태 불변 시 동일 배열 참조**를 유지한다.
   * (소비 측에서 스냅샷·배열을 변이하지 말 것.)
   */
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
      this.handleShowInstantRejected(key, validation.code);
      return { shown: false, code: validation.code };
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

      const completedAtMs = this.nowFn();
      this.lastInterstitialShowCompletedAtMs = completedAtMs;
      this.updateSnapshot(key, {
        phase: 'cooldown',
        lastShowCompletedAtMs: completedAtMs,
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
    | { ok: true; definition: PlacementDefinition; slot: SlotRuntime }
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

    const nowMs = this.nowFn();
    if (this.getRemainingInterstitialCooldownMs(nowMs) > 0) {
      return { ok: false, code: 'skipped_global_cooldown' };
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

    if (code === 'skipped_global_cooldown') {
      this.updateSnapshot(key, {
        lastResultCode: 'skipped_global_cooldown',
        lastErrorMessage: null,
      });
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

  /**
   * 앱 루트(프로세스·루트 컨테이너)에서만 호출. Provider·하위 `useEffect` cleanup에서 호출하면 전역 광고가 영구 마비된다.
   */
  static tearDownForAppRoot(manager: GlobalAdManager): void {
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
    this.lastInterstitialShowCompletedAtMs = null;

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

  /**
   * Rule 1·6: `loadQueuedPlacement` finally에서 `drainLoadQueue`를 재귀 await 하면
   * Promise 체인이 꼬리에 꼬리를 물 수 있음 — 단일 while 루프로 평탄화.
   * `isDrainingQueue`로 중복 진입 시 상위 루프가 큐를 계속 비우게 함.
   */
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

  public getShowAttemptCount(adGroupId: string): number {
    return this.showCursor.get(adGroupId) ?? 0;
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

export interface CooldownSimulationResult {
  firstShow: InstantShowResult;
  blockedWithinCooldown: InstantShowResult;
  showCallCountBeforeIdleWait: number;
  showCallCountAfterIdleWait: number;
  shownAfterCooldownWithNewTrigger: InstantShowResult;
  finalSnapshots: ReadonlyArray<AdSlotSnapshot>;
}

export async function waitForSlotPhase(
  manager: GlobalAdManager,
  key: InterstitialPlacementKey,
  targetPhase: AdSlotPhase,
  timeoutMs: number = DEFAULT_WAIT_FOR_PHASE_TIMEOUT_MS,
): Promise<void> {
  let elapsedMs = 0;

  while (elapsedMs <= timeoutMs) {
    const snapshot = manager.getSnapshot(key);
    if (snapshot?.phase === targetPhase) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, WAIT_FOR_PHASE_POLL_INTERVAL_MS);
    });

    elapsedMs += WAIT_FOR_PHASE_POLL_INTERVAL_MS;
  }

  throw new Error('wait_for_phase_timeout');
}

export async function runVirtualAdSimulation(): Promise<SimulationResult> {
  const bridge = new VirtualFullScreenAdBridge(
    {
      [TOSS_INTERSTITIAL_TEST_AD_GROUP_ID]: [
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: false, errorMessage: 'virtual_load_network_error' },
      ],
    },
    {
      [TOSS_INTERSTITIAL_TEST_AD_GROUP_ID]: [
        { delayMs: 80, shouldSucceed: true },
        { delayMs: 80, shouldSucceed: false, errorMessage: 'failed_to_show' },
      ],
    },
  );

  const manager = new GlobalAdManager(bridge, INTERSTITIAL_PLACEMENT_DEFINITIONS, {
    audioManager: DOCUMENT_SIMULATION_SILENT_AUDIO,
    deferFirstInterstitialAttemptOncePerSession: false,
    initialTier: 'free',
  });

  manager.primeRoute('dashboard');
  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'ready',
  );

  const firstShow = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
  );

  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'ready',
  );

  const secondShow = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
  );

  return {
    firstShow,
    secondShow,
    finalSnapshots: manager.getSnapshots(),
  };
}

export async function runVirtualCooldownSimulation(): Promise<CooldownSimulationResult> {
  let nowMs = 1_000_000;
  const bridge = new VirtualFullScreenAdBridge(
    {
      [TOSS_INTERSTITIAL_TEST_AD_GROUP_ID]: [
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: true },
        { delayMs: 120, shouldSucceed: true },
      ],
    },
    {
      [TOSS_INTERSTITIAL_TEST_AD_GROUP_ID]: [
        { delayMs: 80, shouldSucceed: true },
        { delayMs: 80, shouldSucceed: true },
      ],
    },
  );

  const manager = new GlobalAdManager(bridge, INTERSTITIAL_PLACEMENT_DEFINITIONS, {
    audioManager: DOCUMENT_SIMULATION_SILENT_AUDIO,
    deferFirstInterstitialAttemptOncePerSession: false,
    initialTier: 'free',
    now: () => nowMs,
    globalCooldownMs: DEFAULT_INTERSTITIAL_GLOBAL_COOLDOWN_MS,
  });

  manager.primeRoute('dashboard');
  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    'ready',
  );
  await waitForSlotPhase(
    manager,
    INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    'ready',
  );

  const firstShow = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
  );

  nowMs += 30_000;
  const blockedWithinCooldown = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
  );

  const showCallCountBeforeIdleWait = bridge.getShowAttemptCount(
    TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
  );

  nowMs += 31_000;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 150);
  });

  const showCallCountAfterIdleWait = bridge.getShowAttemptCount(
    TOSS_INTERSTITIAL_TEST_AD_GROUP_ID,
  );

  const shownAfterCooldownWithNewTrigger = await manager.showInstant(
    INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
  );

  return {
    firstShow,
    blockedWithinCooldown,
    showCallCountBeforeIdleWait,
    showCallCountAfterIdleWait,
    shownAfterCooldownWithNewTrigger,
    finalSnapshots: manager.getSnapshots(),
  };
}

/**
 * Integration note (SSOT: `services/ads/tossIntegratedFullScreenAdApi.ts`, 계획서 §3.2):
 * - `@apps-in-toss/web-framework`의 `loadFullScreenAd`/`showFullScreenAd`를 **그대로** bridge에 넘기지 않고,
 *   `OfficialLoadFullScreenAd`/`OfficialShowFullScreenAd` 시그니처에 맞춘 **Safe Wrapper**로 감싼
 *   `tossIntegratedFullScreenAdApi`를 `createTossIntegratedFullScreenAdBridge(tossIntegratedFullScreenAdApi)`에 전달 (`App.tsx`는 import·주입만).
 * - 래퍼: `typeof === 'function'` 가드, `isSupported`는 `checkIsSupported`(+ try/catch), 파라미터는
 *   `Parameters<typeof loadFullScreenAd>[0]` 등 **경계 단일 캐스팅** — `any`/`as unknown as IntegratedAdApi` 금지.
 * const bridge = createTossIntegratedFullScreenAdBridge(tossIntegratedAdApi);
 * const manager = new GlobalAdManager(bridge, getInterstitialPlacementDefinitions(), {
 *   audioManager: appAudioFromRootContext,
 *   initialTier: userTierAtBootstrap,
 *   onDrainError: (error) => { Sentry.captureException(error); }, // 선택 — OCP, §4.1 계획서
 * });
 * // Provider useLayoutEffect에서 manager.setCurrentTier(userTier)로 매 렌더 동기화(§3.1)
 * // React: docs2/ad-preload-AdPreloadProvider.tsx — useSyncExternalStore + showInstantAd(Rule 11)
 */
