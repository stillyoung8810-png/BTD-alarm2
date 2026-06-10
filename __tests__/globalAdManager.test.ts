import { describe, expect, it } from 'vitest';
import {
  GlobalAdManager,
  type AppAudioManager,
  type FullScreenAdBridge,
  type UserTier,
} from '@/services/ads/globalAdManager';
import {
  getInterstitialPlacementDefinitions,
  INTERSTITIAL_PLACEMENT_KEYS,
  type InterstitialPlacementDefinition,
  type InterstitialPlacementKey,
} from '@/services/ads/interstitialPlacementConfig';

const TEST_AD_GROUP_ID = 'test-interstitial-ad-group';
const TEST_GLOBAL_COOLDOWN_MS = 60_000;
const WAIT_FOR_READY_MAX_ATTEMPTS = 10;

const SILENT_AUDIO_MANAGER: AppAudioManager = {
  pauseAllSounds: () => {},
  resumeAllSounds: () => {},
};

const TEST_INTERSTITIAL_DEFINITIONS = [
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    adGroupId: TEST_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
    shouldDeferFirstAttempt: true,
  },
  {
    key: INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    adGroupId: TEST_AD_GROUP_ID,
    preloadOnRoutes: ['dashboard'],
    eligibleTiers: ['free'],
    shouldDeferFirstAttempt: true,
  },
] as const satisfies readonly InterstitialPlacementDefinition[];

class RecordingFullScreenAdBridge implements FullScreenAdBridge {
  public readonly shownAdGroupIds: string[] = [];

  public isSupported(): boolean {
    return true;
  }

  public async load(_adGroupId: string): Promise<void> {
    return Promise.resolve();
  }

  public async show(adGroupId: string): Promise<void> {
    this.shownAdGroupIds.push(adGroupId);
    return Promise.resolve();
  }
}

function waitOneTick(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

async function waitForReadySlot(
  manager: GlobalAdManager,
  key: InterstitialPlacementKey,
): Promise<void> {
  for (let attempt = 0; attempt < WAIT_FOR_READY_MAX_ATTEMPTS; attempt += 1) {
    if (manager.getSnapshot(key)?.phase === 'ready') {
      return;
    }

    await waitOneTick();
  }

  throw new Error(`ad_slot_not_ready:${key}`);
}

describe('GlobalAdManager app interstitial policy', () => {
  it('shows the first ready interstitial immediately when first-attempt exemption is disabled', async () => {
    const bridge = new RecordingFullScreenAdBridge();
    const manager = new GlobalAdManager(bridge, TEST_INTERSTITIAL_DEFINITIONS, {
      audioManager: SILENT_AUDIO_MANAGER,
      deferFirstInterstitialAttemptOncePerSession: false,
      globalCooldownMs: TEST_GLOBAL_COOLDOWN_MS,
      initialTier: 'free',
    });

    manager.prime(INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE);
    await waitForReadySlot(manager, INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE);

    const result = await manager.showInstant(
      INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    );

    expect(result).toEqual({ shown: true, code: 'shown' });
    expect(bridge.shownAdGroupIds).toEqual([TEST_AD_GROUP_ID]);
  });

  it('blocks the next interstitial during the 60 second global cooldown', async () => {
    let nowMs = 0;
    const bridge = new RecordingFullScreenAdBridge();
    const manager = new GlobalAdManager(bridge, TEST_INTERSTITIAL_DEFINITIONS, {
      audioManager: SILENT_AUDIO_MANAGER,
      deferFirstInterstitialAttemptOncePerSession: false,
      globalCooldownMs: TEST_GLOBAL_COOLDOWN_MS,
      initialTier: 'free',
      now: () => nowMs,
    });

    manager.prime(INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE);
    manager.prime(INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);
    await waitForReadySlot(manager, INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE);
    await waitForReadySlot(manager, INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);

    const firstResult = await manager.showInstant(
      INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
    );

    nowMs = TEST_GLOBAL_COOLDOWN_MS - 1;
    const cooldownResult = await manager.showInstant(
      INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE,
    );

    expect(firstResult).toEqual({ shown: true, code: 'shown' });
    expect(cooldownResult).toEqual({
      shown: false,
      code: 'skipped_global_cooldown',
    });
    expect(bridge.shownAdGroupIds).toEqual([TEST_AD_GROUP_ID]);
  });

  it.each<UserTier>(['pro', 'premium'])(
    'shows benefit interstitial for %s tier',
    async (initialTier) => {
      const bridge = new RecordingFullScreenAdBridge();
      const manager = new GlobalAdManager(
        bridge,
        getInterstitialPlacementDefinitions(),
        {
          audioManager: SILENT_AUDIO_MANAGER,
          deferFirstInterstitialAttemptOncePerSession: false,
          globalCooldownMs: TEST_GLOBAL_COOLDOWN_MS,
          initialTier,
        },
      );

      manager.prime(INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD);
      await waitForReadySlot(
        manager,
        INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD,
      );

      const result = await manager.showInstant(
        INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD,
      );

      expect(result).toEqual({ shown: true, code: 'shown' });
      expect(bridge.shownAdGroupIds).toHaveLength(1);
    },
  );
});
