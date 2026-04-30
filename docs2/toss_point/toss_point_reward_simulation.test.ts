import { describe, expect, it } from 'vitest';
import {
  RECOMMENDED_QUIZ_QUESTION_BANK_PLAN,
  calculateAttemptReward,
  calculateAttendanceReward,
  calculateQuestionBankTotal,
  executeTossPointRedeemSettlement,
  grantRewardedAdUnlock,
  hasApprovedAdGroupId,
  redeemTossPoints,
  resolveAttendanceStreakBonusClaim,
  resolveBenefitWalletBoardItems,
  resolveBenefitWalletBoardSummary,
  resolveDailyAttemptAvailability,
  resolveMissionAvailabilityForView,
  resolvePromotionRewardRequestParams,
  resolvePredictionCandidateSymbols,
  resolveRewardedAdServerUnlock,
  selectNextQuizQuestion,
  shouldExposeBenefitTab,
  type DailyAttemptState,
  type PredictionPortfolioSnapshot,
  type QuizQuestionSnapshot,
  type UserQuestionAttemptSnapshot,
} from './toss_point_reward_simulation_snippets';

function makeAttemptState(
  overrides: Partial<DailyAttemptState> = {},
): DailyAttemptState {
  return {
    completedAttempts: 0,
    rewardedAdUnlocks: 0,
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<QuizQuestionSnapshot>,
): QuizQuestionSnapshot {
  return {
    id: 'q-default',
    phase: 'phase_1_core',
    category: 'stock_basic',
    isActive: true,
    totalAttempts: 0,
    correctAttempts: 0,
    ...overrides,
  };
}

describe('toss point reward policy simulation', () => {
  it('pays 1 money for participation and 9 extra money for a correct answer', () => {
    expect(calculateAttemptReward('correct')).toEqual({
      baseMoney: 1,
      bonusMoney: 9,
      totalMoney: 10,
    });
    expect(calculateAttemptReward('incorrect')).toEqual({
      baseMoney: 1,
      bonusMoney: 0,
      totalMoney: 1,
    });
  });

  it('allows one free attempt and unlocks up to five attempts with rewarded ads', () => {
    expect(resolveDailyAttemptAvailability(makeAttemptState())).toEqual({
      maxAttempts: 5,
      availableAttempts: 1,
      remainingAttempts: 1,
      canStartAttempt: true,
      canWatchRewardedAd: true,
    });

    const afterFreeAttempt = makeAttemptState({ completedAttempts: 1 });
    expect(resolveDailyAttemptAvailability(afterFreeAttempt)).toMatchObject({
      availableAttempts: 1,
      remainingAttempts: 0,
      canStartAttempt: false,
      canWatchRewardedAd: true,
    });

    const afterRewardedAd = grantRewardedAdUnlock(afterFreeAttempt);
    expect(resolveDailyAttemptAvailability(afterRewardedAd)).toMatchObject({
      availableAttempts: 2,
      remainingAttempts: 1,
      canStartAttempt: true,
    });

    const maxedState = makeAttemptState({
      completedAttempts: 5,
      rewardedAdUnlocks: 4,
    });
    expect(resolveDailyAttemptAvailability(maxedState)).toMatchObject({
      availableAttempts: 5,
      remainingAttempts: 0,
      canStartAttempt: false,
      canWatchRewardedAd: false,
    });
    expect(grantRewardedAdUnlock(maxedState)).toBe(maxedState);
  });

  it('keeps rewarded ad unlock policy simple: boolean completion plus daily count', () => {
    const state = makeAttemptState({
      completedAttempts: 1,
      rewardedAdUnlocks: 3,
    });

    const unlocked = grantRewardedAdUnlock(state);
    expect(unlocked).toEqual({
      completedAttempts: 1,
      rewardedAdUnlocks: 4,
    });
    expect(resolveDailyAttemptAvailability(unlocked)).toMatchObject({
      availableAttempts: 5,
      canWatchRewardedAd: false,
    });
  });

  it('does not unlock extra attempts after the daily attempt capacity is already exhausted', () => {
    const exhaustedState = makeAttemptState({
      completedAttempts: 5,
      rewardedAdUnlocks: 4,
    });

    expect(resolveDailyAttemptAvailability(exhaustedState)).toMatchObject({
      remainingAttempts: 0,
      canStartAttempt: false,
      canWatchRewardedAd: false,
    });
    expect(grantRewardedAdUnlock(exhaustedState)).toBe(exhaustedState);
    expect(resolveRewardedAdServerUnlock(exhaustedState)).toMatchObject({
      canGrant: false,
      reason: 'attempt_limit_reached',
      nextState: exhaustedState,
    });
  });

  it('rejects impossible daily attempt states before they reach reward logic', () => {
    const impossibleState = makeAttemptState({
      completedAttempts: 5,
      rewardedAdUnlocks: 0,
    });

    expect(() => resolveDailyAttemptAvailability(impossibleState)).toThrow(
      'completedAttempts_must_not_exceed_unlocked_attempts',
    );
    expect(() => resolveRewardedAdServerUnlock(impossibleState)).toThrow(
      'completedAttempts_must_not_exceed_unlocked_attempts',
    );
  });

  it('returns a safe null availability for invalid server state in the UI view layer', () => {
    const impossibleState = makeAttemptState({
      completedAttempts: 5,
      rewardedAdUnlocks: 0,
    });

    expect(resolveMissionAvailabilityForView(impossibleState)).toBeNull();
    expect(
      resolveMissionAvailabilityForView(
        makeAttemptState({
          completedAttempts: 1,
          rewardedAdUnlocks: 1,
        }),
      ),
    ).toMatchObject({
      availableAttempts: 2,
      remainingAttempts: 1,
      canStartAttempt: true,
    });
  });

  it('returns a stable server decision for rewarded ad unlock attempts', () => {
    const grantableState = makeAttemptState({
      completedAttempts: 1,
      rewardedAdUnlocks: 2,
    });

    expect(resolveRewardedAdServerUnlock(grantableState)).toMatchObject({
      canGrant: true,
      reason: 'granted',
      nextState: {
        completedAttempts: 1,
        rewardedAdUnlocks: 3,
      },
    });

    const unlockLimitState = makeAttemptState({
      completedAttempts: 1,
      rewardedAdUnlocks: 4,
    });
    expect(resolveRewardedAdServerUnlock(unlockLimitState)).toMatchObject({
      canGrant: false,
      reason: 'unlock_limit_reached',
      nextState: unlockLimitState,
    });
  });

  it('pays attendance money every day and requires interstitial before streak bonus', () => {
    expect(
      calculateAttendanceReward({
        consecutiveAttendanceDays: 9,
        hasWatchedInterstitialForStreakBonus: false,
      }),
    ).toEqual({
      attendanceMoney: 1,
      streakBonusMoney: 0,
      totalMoney: 1,
      requiresInterstitialForBonus: false,
    });

    expect(
      calculateAttendanceReward({
        consecutiveAttendanceDays: 10,
        hasWatchedInterstitialForStreakBonus: false,
      }),
    ).toEqual({
      attendanceMoney: 1,
      streakBonusMoney: 0,
      totalMoney: 1,
      requiresInterstitialForBonus: true,
    });

    expect(
      calculateAttendanceReward({
        consecutiveAttendanceDays: 10,
        hasWatchedInterstitialForStreakBonus: true,
      }),
    ).toEqual({
      attendanceMoney: 1,
      streakBonusMoney: 10,
      totalMoney: 11,
      requiresInterstitialForBonus: false,
    });
  });

  it('keeps attendance streak bonus idempotent after the first successful claim', () => {
    expect(
      resolveAttendanceStreakBonusClaim({
        consecutiveAttendanceDays: 10,
        hasWatchedInterstitialForStreakBonus: true,
        hasAlreadyClaimedStreakBonus: false,
      }),
    ).toEqual({
      canGrant: true,
      grantedBonusMoney: 10,
      shouldReturnExistingResult: false,
      requiresInterstitialForBonus: false,
    });

    expect(
      resolveAttendanceStreakBonusClaim({
        consecutiveAttendanceDays: 10,
        hasWatchedInterstitialForStreakBonus: true,
        hasAlreadyClaimedStreakBonus: true,
      }),
    ).toEqual({
      canGrant: false,
      grantedBonusMoney: 0,
      shouldReturnExistingResult: true,
      requiresInterstitialForBonus: false,
    });

    expect(
      resolveAttendanceStreakBonusClaim({
        consecutiveAttendanceDays: 10,
        hasWatchedInterstitialForStreakBonus: false,
        hasAlreadyClaimedStreakBonus: false,
      }),
    ).toMatchObject({
      canGrant: false,
      requiresInterstitialForBonus: true,
    });
  });

  it('redeems 1,000 money bundles into 100 Toss points with a 5,000P request cap', () => {
    expect(
      redeemTossPoints({
        currentMoneyBalance: 999,
      }),
    ).toEqual({
      redeemedMoney: 0,
      remainingMoneyBalance: 999,
      tossPointToPay: 0,
      canRequestPromotionReward: false,
    });

    expect(
      redeemTossPoints({
        currentMoneyBalance: 2_060,
      }),
    ).toEqual({
      redeemedMoney: 2_000,
      remainingMoneyBalance: 60,
      tossPointToPay: 200,
      canRequestPromotionReward: true,
    });

    expect(
      redeemTossPoints({
        currentMoneyBalance: 60_000,
      }),
    ).toEqual({
      redeemedMoney: 50_000,
      remainingMoneyBalance: 10_000,
      tossPointToPay: 5_000,
      canRequestPromotionReward: true,
    });
  });

  it('uses Toss point amount, not internal money, as promotion reward amount', () => {
    const redemption = redeemTossPoints({
      currentMoneyBalance: 2_060,
    });

    expect(
      resolvePromotionRewardRequestParams(
        ' benefit-promotion-code ',
        redemption.tossPointToPay,
      ),
    ).toEqual({
      promotionCode: 'benefit-promotion-code',
      amount: 200,
    });
    expect(redemption.redeemedMoney).toBe(2_000);
    expect(redemption.tossPointToPay).not.toBe(redemption.redeemedMoney);
  });

  it('keeps the benefit tab hidden until every launch gate is ready', () => {
    const approvedAdGroupIds = [
      'benefit-quiz-reward-ad-group-id',
      'benefit-prediction-reward-ad-group-id',
    ] as const;

    expect(hasApprovedAdGroupId('APPROVED_BENEFIT_QUIZ_REWARD_AD_GROUP_ID')).toBe(
      false,
    );
    expect(hasApprovedAdGroupId('benefit-quiz-reward-ad-group-id')).toBe(true);

    expect(
      shouldExposeBenefitTab({
        isFeatureFlagEnabled: true,
        hasTossPromotionApproval: true,
        requiredAdGroupIds: approvedAdGroupIds,
        hasBenefitApiReady: true,
        isInTossApp: true,
      }),
    ).toBe(true);

    expect(
      shouldExposeBenefitTab({
        isFeatureFlagEnabled: false,
        hasTossPromotionApproval: true,
        requiredAdGroupIds: approvedAdGroupIds,
        hasBenefitApiReady: true,
        isInTossApp: true,
      }),
    ).toBe(false);

    expect(
      shouldExposeBenefitTab({
        isFeatureFlagEnabled: true,
        hasTossPromotionApproval: false,
        requiredAdGroupIds: approvedAdGroupIds,
        hasBenefitApiReady: true,
        isInTossApp: true,
      }),
    ).toBe(false);

    expect(
      shouldExposeBenefitTab({
        isFeatureFlagEnabled: true,
        hasTossPromotionApproval: true,
        requiredAdGroupIds: [
          'APPROVED_BENEFIT_QUIZ_REWARD_AD_GROUP_ID',
          'benefit-prediction-reward-ad-group-id',
        ],
        hasBenefitApiReady: true,
        isInTossApp: true,
      }),
    ).toBe(false);
  });

  it('summarizes the top benefit wallet board without trusting client-side payout math', () => {
    expect(
      resolveBenefitWalletBoardSummary({
        currentMoneyBalance: 2_450,
        pendingTossPointAmount: 100,
        lifetimeEarnedMoney: 12_345,
      }),
    ).toEqual({
      currentMoneyBalance: 2_450,
      lifetimeEarnedMoney: 12_345,
      redeemableMoney: 2_000,
      redeemableTossPoint: 200,
      pendingTossPointAmount: 100,
      moneyUntilNextRedeem: 550,
      canRedeem: true,
    });

    expect(
      resolveBenefitWalletBoardSummary({
        currentMoneyBalance: 60_000,
        pendingTossPointAmount: 0,
        lifetimeEarnedMoney: 60_000,
      }),
    ).toMatchObject({
      redeemableMoney: 50_000,
      redeemableTossPoint: 5_000,
      moneyUntilNextRedeem: 0,
      canRedeem: true,
    });
  });

  it('builds the wallet board summary items from stable IDs instead of repeated markup', () => {
    expect(
      resolveBenefitWalletBoardItems(
        {
          redeemableLabel: '받을 수 있는 토스 포인트',
          lifetimeLabel: '누적 적립 머니',
          pendingLabel: '지급 대기',
          nextRedeemLabel: '다음 받기까지',
        },
        {
          redeemableTossPointText: '200P',
          lifetimeEarnedMoneyText: '12,345머니',
          pendingTossPointText: '100P',
          nextRedeemText: '550머니',
        },
      ),
    ).toEqual([
      {
        id: 'redeemable',
        label: '받을 수 있는 토스 포인트',
        value: '200P',
      },
      {
        id: 'lifetime',
        label: '누적 적립 머니',
        value: '12,345머니',
      },
      {
        id: 'pending',
        label: '지급 대기',
        value: '100P',
      },
      {
        id: 'nextRedeem',
        label: '다음 받기까지',
        value: '550머니',
      },
    ]);
  });

  it('restores money when Toss point reward settlement fails after a pending debit', () => {
    expect(
      executeTossPointRedeemSettlement({
        currentMoneyBalance: 2_500,
        hasTossRewardGranted: true,
      }),
    ).toEqual({
      status: 'success',
      debitedMoney: 2_000,
      restoredMoney: 0,
      finalMoneyBalance: 500,
      tossPointToPay: 200,
    });

    expect(
      executeTossPointRedeemSettlement({
        currentMoneyBalance: 2_500,
        hasTossRewardGranted: false,
      }),
    ).toEqual({
      status: 'failed_restored',
      debitedMoney: 2_000,
      restoredMoney: 2_000,
      finalMoneyBalance: 2_500,
      tossPointToPay: 0,
    });
  });

  it('keeps the recommended quiz bank at 600 questions', () => {
    expect(calculateQuestionBankTotal(RECOMMENDED_QUIZ_QUESTION_BANK_PLAN)).toBe(
      600,
    );
  });

  it('selects quiz questions by unattempted, not-recent, quality-band, then fallback priority', () => {
    const nowIso = '2026-04-29T00:00:00.000Z';
    const questions: readonly QuizQuestionSnapshot[] = [
      makeQuestion({
        id: 'q-1-attempted-recent',
        totalAttempts: 10,
        correctAttempts: 8,
      }),
      makeQuestion({
        id: 'q-2-attempted-old-low-quality',
        totalAttempts: 100,
        correctAttempts: 99,
      }),
      makeQuestion({
        id: 'q-3-attempted-old-good-quality',
        totalAttempts: 100,
        correctAttempts: 70,
      }),
      makeQuestion({
        id: 'q-4-never-attempted',
      }),
    ];
    const attempts: readonly UserQuestionAttemptSnapshot[] = [
      {
        questionId: 'q-1-attempted-recent',
        answeredAt: '2026-04-20T00:00:00.000Z',
      },
      {
        questionId: 'q-2-attempted-old-low-quality',
        answeredAt: '2026-02-01T00:00:00.000Z',
      },
      {
        questionId: 'q-3-attempted-old-good-quality',
        answeredAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    expect(
      selectNextQuizQuestion({
        questions,
        userAttempts: attempts,
        nowIso,
      })?.id,
    ).toBe('q-4-never-attempted');

    expect(
      selectNextQuizQuestion({
        questions: questions.filter(
          (question) => question.id !== 'q-4-never-attempted',
        ),
        userAttempts: attempts,
        nowIso,
      })?.id,
    ).toBe('q-3-attempted-old-good-quality');
  });

  it('falls back to the oldest stable active question when every question is recent', () => {
    const nowIso = '2026-04-29T00:00:00.000Z';
    const questions: readonly QuizQuestionSnapshot[] = [
      makeQuestion({ id: 'q-b' }),
      makeQuestion({ id: 'q-a' }),
    ];
    const attempts: readonly UserQuestionAttemptSnapshot[] = [
      {
        questionId: 'q-a',
        answeredAt: '2026-04-28T00:00:00.000Z',
      },
      {
        questionId: 'q-b',
        answeredAt: '2026-04-28T00:00:00.000Z',
      },
    ];

    expect(
      selectNextQuizQuestion({
        questions,
        userAttempts: attempts,
        nowIso,
      })?.id,
    ).toBe('q-a');
  });

  it('resolves price prediction candidates without crashing on partial portfolio data', () => {
    const portfolios: readonly PredictionPortfolioSnapshot[] = [
      {
        strategy: {
          ma0: { stock: ' nvda ' },
          ma1: null,
          ma2: { stock: 'UNKNOWN' },
        },
      },
      {
        strategy: null,
      },
      {},
      {
        strategy: {
          ma3: { stock: 'qqq' },
        },
      },
    ];

    expect(
      resolvePredictionCandidateSymbols(
        portfolios,
        ['QQQ', 'NVDA', 'SPY'],
        ['SPY'],
      ),
    ).toEqual(['NVDA', 'QQQ']);

    expect(
      resolvePredictionCandidateSymbols(
        [{ strategy: { ma0: { stock: 'UNKNOWN' } } }],
        ['QQQ', 'SPY'],
        [' spy ', 'UNKNOWN'],
      ),
    ).toEqual(['SPY']);
  });
});
