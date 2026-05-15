export const DAILY_FREE_ATTEMPT_COUNT = 1;
export const DAILY_MAX_ATTEMPTS_PER_MISSION = 5;
export const DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION =
  DAILY_MAX_ATTEMPTS_PER_MISSION - DAILY_FREE_ATTEMPT_COUNT;
export const FIXED_ATTEMPT_REWARD_MONEY = 10;
export const ATTENDANCE_REWARD_MONEY = 5;
export const ATTENDANCE_STREAK_BONUS_INTERVAL_DAYS = 10;
export const ATTENDANCE_STREAK_BONUS_MONEY = 10;
export const TOSS_POINT_REDEEM_THRESHOLD_MONEY = 1_000;
export const TOSS_POINT_REDEEM_AMOUNT = 100;
export const TOSS_POINT_REDEEM_MAX_POINT_PER_REQUEST = 5_000;
export const QUESTION_RECENT_EXCLUDE_DAYS = 30;
export const LOW_QUALITY_MIN_ACCURACY_RATE = 0.2;
export const LOW_QUALITY_MAX_ACCURACY_RATE = 0.95;
export const PENDING_AD_GROUP_ID_PREFIX = 'APPROVED_';
export const MS_PER_DAY = 86_400_000;

export type MissionKind = 'price_prediction' | 'stock_quiz';
export type AnswerOutcome = 'correct' | 'incorrect';
export type QuestionPhase = 'phase_1_core' | 'phase_2_market' | 'phase_3_current';
export type RewardedAdServerUnlockReason =
  | 'granted'
  | 'attempt_limit_reached'
  | 'unlock_limit_reached';
export type TossPointRedeemExecutionStatus =
  | 'not_redeemable'
  | 'success'
  | 'failed_restored';
export type BenefitWalletBoardItemId =
  | 'redeemable'
  | 'lifetime'
  | 'pending'
  | 'nextRedeem';
export type BenefitLedgerSource =
  (typeof BENEFIT_LEDGER_SOURCES)[keyof typeof BENEFIT_LEDGER_SOURCES];

export interface DailyAttemptState {
  readonly completedAttempts: number;
  readonly rewardedAdUnlocks: number;
}

export interface DailyAttemptAvailability {
  readonly maxAttempts: number;
  readonly availableAttempts: number;
  readonly remainingAttempts: number;
  readonly canStartAttempt: boolean;
  readonly canWatchRewardedAd: boolean;
}

export interface AttemptReward {
  readonly baseMoney: number;
  readonly bonusMoney: number;
  readonly totalMoney: number;
}

export interface AttendanceRewardInput {
  readonly consecutiveAttendanceDays: number;
  readonly hasWatchedInterstitialForStreakBonus: boolean;
}

export interface AttendanceRewardResult {
  readonly attendanceMoney: number;
  readonly streakBonusMoney: number;
  readonly totalMoney: number;
  readonly requiresInterstitialForBonus: boolean;
}

export interface AttendanceStreakBonusClaimInput {
  readonly consecutiveAttendanceDays: number;
  readonly hasWatchedInterstitialForStreakBonus: boolean;
  readonly hasAlreadyClaimedStreakBonus: boolean;
}

export interface AttendanceStreakBonusClaimResult {
  readonly canGrant: boolean;
  readonly grantedBonusMoney: number;
  readonly shouldReturnExistingResult: boolean;
  readonly requiresInterstitialForBonus: boolean;
}

export interface TossPointRedemptionInput {
  readonly currentMoneyBalance: number;
}

export interface TossPointRedemptionResult {
  readonly redeemedMoney: number;
  readonly remainingMoneyBalance: number;
  readonly tossPointToPay: number;
  readonly canRequestPromotionReward: boolean;
}

export interface PromotionRewardRequestParams {
  readonly promotionCode: string;
  readonly amount: number;
}

export interface TossPointRedeemExecutionInput {
  readonly currentMoneyBalance: number;
  readonly hasTossRewardGranted: boolean;
}

export interface TossPointRedeemExecutionResult {
  readonly status: TossPointRedeemExecutionStatus;
  readonly debitedMoney: number;
  readonly restoredMoney: number;
  readonly finalMoneyBalance: number;
  readonly tossPointToPay: number;
}

export interface BenefitWalletBoardInput {
  readonly currentMoneyBalance: number;
  readonly pendingTossPointAmount: number;
  readonly lifetimeEarnedMoney: number;
}

export interface BenefitWalletBoardSummary {
  readonly currentMoneyBalance: number;
  readonly lifetimeEarnedMoney: number;
  readonly redeemableMoney: number;
  readonly redeemableTossPoint: number;
  readonly pendingTossPointAmount: number;
  readonly moneyUntilNextRedeem: number;
  readonly canRedeem: boolean;
}

export interface BenefitWalletBoardItemLabels {
  readonly redeemableLabel: string;
  readonly lifetimeLabel: string;
  readonly pendingLabel: string;
  readonly nextRedeemLabel: string;
}

export interface BenefitWalletBoardItemValues {
  readonly redeemableTossPointText: string;
  readonly lifetimeEarnedMoneyText: string;
  readonly pendingTossPointText: string;
  readonly nextRedeemText: string;
}

export interface BenefitWalletBoardItem {
  readonly id: BenefitWalletBoardItemId;
  readonly label: string;
  readonly value: string;
}

export interface QuizQuestionSnapshot {
  readonly id: string;
  readonly phase: QuestionPhase;
  readonly category: string;
  readonly isActive: boolean;
  readonly totalAttempts: number;
  readonly correctAttempts: number;
}

export interface UserQuestionAttemptSnapshot {
  readonly questionId: string;
  readonly answeredAt: string;
}

export interface QuizSelectionInput {
  readonly questions: readonly QuizQuestionSnapshot[];
  readonly userAttempts: readonly UserQuestionAttemptSnapshot[];
  readonly nowIso: string;
}

export interface QuizQuestionBankPlan {
  readonly phase1CoreQuestionCount: number;
  readonly phase2MarketQuestionCount: number;
  readonly phase3CurrentQuestionCount: number;
}

export interface BenefitFeatureGateInput {
  readonly isFeatureFlagEnabled: boolean;
  readonly hasTossPromotionApproval: boolean;
  readonly requiredAdGroupIds: readonly string[];
  readonly hasBenefitApiReady: boolean;
  readonly isInTossApp: boolean;
}

export interface RewardedAdServerUnlockResult {
  readonly canGrant: boolean;
  readonly reason: RewardedAdServerUnlockReason;
  readonly nextState: DailyAttemptState;
  readonly availability: DailyAttemptAvailability;
}

type StrategyStockKey = 'ma0' | 'ma1' | 'ma2' | 'ma3';

export interface PredictionStrategyStockSlot {
  readonly stock?: string | null;
}

export interface PredictionPortfolioStrategySnapshot {
  readonly ma0?: PredictionStrategyStockSlot | null;
  readonly ma1?: PredictionStrategyStockSlot | null;
  readonly ma2?: PredictionStrategyStockSlot | null;
  readonly ma3?: PredictionStrategyStockSlot | null;
}

export interface PredictionPortfolioSnapshot {
  readonly strategy?: PredictionPortfolioStrategySnapshot | null;
}

export const RECOMMENDED_QUIZ_QUESTION_BANK_PLAN: QuizQuestionBankPlan = {
  phase1CoreQuestionCount: 200,
  phase2MarketQuestionCount: 200,
  phase3CurrentQuestionCount: 200,
} as const;

export const BENEFIT_LEDGER_SOURCES = {
  attendanceBase: 'attendance_base',
  attendanceStreakBonus: 'attendance_streak_bonus',
  stockQuizAttempt: 'stock_quiz_attempt',
  pricePredictionAttempt: 'price_prediction_attempt',
  tossRedeemDebit: 'toss_redeem_debit',
  tossRedeemRestore: 'toss_redeem_restore',
} as const;

const STRATEGY_STOCK_KEYS: readonly StrategyStockKey[] = [
  'ma0',
  'ma1',
  'ma2',
  'ma3',
] as const;

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName}_must_be_non_negative_integer`);
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName}_must_be_positive_integer`);
  }
}

function assertDailyAttemptState(state: DailyAttemptState): void {
  assertNonNegativeInteger(state.completedAttempts, 'completedAttempts');
  assertNonNegativeInteger(state.rewardedAdUnlocks, 'rewardedAdUnlocks');

  if (state.completedAttempts > DAILY_MAX_ATTEMPTS_PER_MISSION) {
    throw new Error('completedAttempts_must_not_exceed_daily_attempt_limit');
  }

  if (state.rewardedAdUnlocks > DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION) {
    throw new Error('rewardedAdUnlocks_must_not_exceed_daily_unlock_limit');
  }

  if (
    state.completedAttempts >
    state.rewardedAdUnlocks + DAILY_FREE_ATTEMPT_COUNT
  ) {
    throw new Error('completedAttempts_must_not_exceed_unlocked_attempts');
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function normalizeBenefitLedgerSourceId(sourceId: string): string {
  const normalizedSourceId = sourceId.trim();
  if (normalizedSourceId === '') {
    throw new Error('sourceId_must_not_be_empty');
  }

  return normalizedSourceId;
}

function isWithinRecentWindow(
  answeredAt: string,
  nowIso: string,
  recentDays: number,
): boolean {
  assertPositiveInteger(recentDays, 'recentDays');

  const answeredTimeMs = Date.parse(answeredAt);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(answeredTimeMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  const elapsedMs = Math.max(0, nowMs - answeredTimeMs);
  return elapsedMs < recentDays * MS_PER_DAY;
}

function calculateAccuracyRate(question: QuizQuestionSnapshot): number | null {
  assertNonNegativeInteger(question.totalAttempts, 'totalAttempts');
  assertNonNegativeInteger(question.correctAttempts, 'correctAttempts');

  if (question.totalAttempts === 0) {
    return null;
  }

  return question.correctAttempts / question.totalAttempts;
}

function isQualityBandQuestion(question: QuizQuestionSnapshot): boolean {
  const accuracyRate = calculateAccuracyRate(question);
  if (accuracyRate == null) {
    return true;
  }

  return (
    accuracyRate >= LOW_QUALITY_MIN_ACCURACY_RATE &&
    accuracyRate <= LOW_QUALITY_MAX_ACCURACY_RATE
  );
}

function sortQuestionsByStablePriority(
  questions: readonly QuizQuestionSnapshot[],
): QuizQuestionSnapshot[] {
  return [...questions].sort((left, right) => {
    const phaseCompare = left.phase.localeCompare(right.phase);
    if (phaseCompare !== 0) {
      return phaseCompare;
    }

    return left.id.localeCompare(right.id);
  });
}

export function resolveDailyAttemptAvailability(
  state: DailyAttemptState,
): DailyAttemptAvailability {
  assertDailyAttemptState(state);

  const cappedAvailableAttempts = Math.min(
    DAILY_FREE_ATTEMPT_COUNT + state.rewardedAdUnlocks,
    DAILY_MAX_ATTEMPTS_PER_MISSION,
  );
  const remainingAttempts = Math.max(
    0,
    cappedAvailableAttempts - state.completedAttempts,
  );
  const hasAttemptCapacity =
    state.completedAttempts < DAILY_MAX_ATTEMPTS_PER_MISSION;
  const hasRewardedAdUnlockCapacity =
    state.rewardedAdUnlocks < DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION;

  return {
    maxAttempts: DAILY_MAX_ATTEMPTS_PER_MISSION,
    availableAttempts: cappedAvailableAttempts,
    remainingAttempts,
    canStartAttempt: remainingAttempts > 0,
    canWatchRewardedAd:
      hasAttemptCapacity &&
      hasRewardedAdUnlockCapacity &&
      cappedAvailableAttempts < DAILY_MAX_ATTEMPTS_PER_MISSION,
  };
}

export function resolveMissionAvailabilityForView(
  state: DailyAttemptState,
): DailyAttemptAvailability | null {
  try {
    return resolveDailyAttemptAvailability(state);
  } catch {
    return null;
  }
}

export function grantRewardedAdUnlock(
  state: DailyAttemptState,
): DailyAttemptState {
  const availability = resolveDailyAttemptAvailability(state);
  if (!availability.canWatchRewardedAd) {
    return state;
  }

  return {
    ...state,
    rewardedAdUnlocks: state.rewardedAdUnlocks + 1,
  };
}

export function resolveRewardedAdServerUnlock(
  state: DailyAttemptState,
): RewardedAdServerUnlockResult {
  const availability = resolveDailyAttemptAvailability(state);
  if (state.completedAttempts >= DAILY_MAX_ATTEMPTS_PER_MISSION) {
    return {
      canGrant: false,
      reason: 'attempt_limit_reached',
      nextState: state,
      availability,
    };
  }

  if (
    state.rewardedAdUnlocks >= DAILY_REWARDED_AD_UNLOCK_LIMIT_PER_MISSION ||
    !availability.canWatchRewardedAd
  ) {
    return {
      canGrant: false,
      reason: 'unlock_limit_reached',
      nextState: state,
      availability,
    };
  }

  const nextState = {
    ...state,
    rewardedAdUnlocks: state.rewardedAdUnlocks + 1,
  };

  return {
    canGrant: true,
    reason: 'granted',
    nextState,
    availability: resolveDailyAttemptAvailability(nextState),
  };
}

export function calculateAttemptReward(outcome: AnswerOutcome): AttemptReward {
  switch (outcome) {
    case 'correct':
    case 'incorrect':
      return {
        baseMoney: FIXED_ATTEMPT_REWARD_MONEY,
        bonusMoney: 0,
        totalMoney: FIXED_ATTEMPT_REWARD_MONEY,
      };
    default: {
      const _exhaustiveCheck: never = outcome;
      return _exhaustiveCheck;
    }
  }
}

export function calculateAttendanceReward(
  input: AttendanceRewardInput,
): AttendanceRewardResult {
  assertPositiveInteger(
    input.consecutiveAttendanceDays,
    'consecutiveAttendanceDays',
  );

  const isStreakBonusDay =
    input.consecutiveAttendanceDays % ATTENDANCE_STREAK_BONUS_INTERVAL_DAYS ===
    0;
  const shouldGrantStreakBonus =
    isStreakBonusDay && input.hasWatchedInterstitialForStreakBonus;
  const streakBonusMoney = shouldGrantStreakBonus
    ? ATTENDANCE_STREAK_BONUS_MONEY
    : 0;

  return {
    attendanceMoney: ATTENDANCE_REWARD_MONEY,
    streakBonusMoney,
    totalMoney: ATTENDANCE_REWARD_MONEY + streakBonusMoney,
    requiresInterstitialForBonus:
      isStreakBonusDay && !input.hasWatchedInterstitialForStreakBonus,
  };
}

export function resolveAttendanceStreakBonusClaim(
  input: AttendanceStreakBonusClaimInput,
): AttendanceStreakBonusClaimResult {
  assertPositiveInteger(
    input.consecutiveAttendanceDays,
    'consecutiveAttendanceDays',
  );

  if (input.hasAlreadyClaimedStreakBonus) {
    return {
      canGrant: false,
      grantedBonusMoney: 0,
      shouldReturnExistingResult: true,
      requiresInterstitialForBonus: false,
    };
  }

  const isStreakBonusDay =
    input.consecutiveAttendanceDays % ATTENDANCE_STREAK_BONUS_INTERVAL_DAYS ===
    0;
  if (!isStreakBonusDay) {
    return {
      canGrant: false,
      grantedBonusMoney: 0,
      shouldReturnExistingResult: false,
      requiresInterstitialForBonus: false,
    };
  }

  if (!input.hasWatchedInterstitialForStreakBonus) {
    return {
      canGrant: false,
      grantedBonusMoney: 0,
      shouldReturnExistingResult: false,
      requiresInterstitialForBonus: true,
    };
  }

  return {
    canGrant: true,
    grantedBonusMoney: ATTENDANCE_STREAK_BONUS_MONEY,
    shouldReturnExistingResult: false,
    requiresInterstitialForBonus: false,
  };
}

export function redeemTossPoints(
  input: TossPointRedemptionInput,
): TossPointRedemptionResult {
  assertNonNegativeInteger(input.currentMoneyBalance, 'currentMoneyBalance');

  const redeemableBundleCountByBalance = Math.floor(
    input.currentMoneyBalance / TOSS_POINT_REDEEM_THRESHOLD_MONEY,
  );
  const redeemableBundleCountByRequest = Math.floor(
    TOSS_POINT_REDEEM_MAX_POINT_PER_REQUEST / TOSS_POINT_REDEEM_AMOUNT,
  );
  const redeemBundleCount = Math.min(
    redeemableBundleCountByBalance,
    redeemableBundleCountByRequest,
  );
  const redeemedMoney = redeemBundleCount * TOSS_POINT_REDEEM_THRESHOLD_MONEY;
  const tossPointToPay = redeemBundleCount * TOSS_POINT_REDEEM_AMOUNT;

  return {
    redeemedMoney,
    remainingMoneyBalance: input.currentMoneyBalance - redeemedMoney,
    tossPointToPay,
    canRequestPromotionReward: tossPointToPay > 0,
  };
}

export function resolvePromotionRewardRequestParams(
  promotionCode: string,
  tossPointAmount: number,
): PromotionRewardRequestParams {
  const normalizedPromotionCode = promotionCode.trim();
  if (normalizedPromotionCode === '') {
    throw new Error('promotionCode_must_not_be_empty');
  }

  assertPositiveInteger(tossPointAmount, 'tossPointAmount');

  return {
    promotionCode: normalizedPromotionCode,
    amount: tossPointAmount,
  };
}

export function executeTossPointRedeemSettlement(
  input: TossPointRedeemExecutionInput,
): TossPointRedeemExecutionResult {
  const redemption = redeemTossPoints({
    currentMoneyBalance: input.currentMoneyBalance,
  });
  if (!redemption.canRequestPromotionReward) {
    return {
      status: 'not_redeemable',
      debitedMoney: 0,
      restoredMoney: 0,
      finalMoneyBalance: input.currentMoneyBalance,
      tossPointToPay: 0,
    };
  }

  if (input.hasTossRewardGranted) {
    return {
      status: 'success',
      debitedMoney: redemption.redeemedMoney,
      restoredMoney: 0,
      finalMoneyBalance: redemption.remainingMoneyBalance,
      tossPointToPay: redemption.tossPointToPay,
    };
  }

  return {
    status: 'failed_restored',
    debitedMoney: redemption.redeemedMoney,
    restoredMoney: redemption.redeemedMoney,
    finalMoneyBalance: input.currentMoneyBalance,
    tossPointToPay: 0,
  };
}

export function resolveBenefitWalletBoardSummary(
  input: BenefitWalletBoardInput,
): BenefitWalletBoardSummary {
  assertNonNegativeInteger(input.currentMoneyBalance, 'currentMoneyBalance');
  assertNonNegativeInteger(
    input.pendingTossPointAmount,
    'pendingTossPointAmount',
  );
  assertNonNegativeInteger(input.lifetimeEarnedMoney, 'lifetimeEarnedMoney');

  const redemption = redeemTossPoints({
    currentMoneyBalance: input.currentMoneyBalance,
  });
  const remainderMoney =
    input.currentMoneyBalance % TOSS_POINT_REDEEM_THRESHOLD_MONEY;
  const moneyUntilNextRedeem =
    remainderMoney === 0 && input.currentMoneyBalance > 0
      ? 0
      : TOSS_POINT_REDEEM_THRESHOLD_MONEY - remainderMoney;

  return {
    currentMoneyBalance: input.currentMoneyBalance,
    lifetimeEarnedMoney: input.lifetimeEarnedMoney,
    redeemableMoney: redemption.redeemedMoney,
    redeemableTossPoint: redemption.tossPointToPay,
    pendingTossPointAmount: input.pendingTossPointAmount,
    moneyUntilNextRedeem,
    canRedeem: redemption.canRequestPromotionReward,
  };
}

export function resolveBenefitWalletBoardItems(
  labels: BenefitWalletBoardItemLabels,
  values: BenefitWalletBoardItemValues,
): readonly BenefitWalletBoardItem[] {
  return [
    {
      id: 'redeemable',
      label: labels.redeemableLabel,
      value: values.redeemableTossPointText,
    },
    {
      id: 'lifetime',
      label: labels.lifetimeLabel,
      value: values.lifetimeEarnedMoneyText,
    },
    {
      id: 'pending',
      label: labels.pendingLabel,
      value: values.pendingTossPointText,
    },
    {
      id: 'nextRedeem',
      label: labels.nextRedeemLabel,
      value: values.nextRedeemText,
    },
  ] as const;
}

export function hasApprovedAdGroupId(adGroupId: string): boolean {
  const normalizedAdGroupId = adGroupId.trim();
  if (normalizedAdGroupId === '') {
    return false;
  }

  return !normalizedAdGroupId.startsWith(PENDING_AD_GROUP_ID_PREFIX);
}

export function hasApprovedRequiredAdGroupIds(
  adGroupIds: readonly string[],
): boolean {
  if (adGroupIds.length === 0) {
    return false;
  }

  return adGroupIds.every(hasApprovedAdGroupId);
}

export function shouldExposeBenefitTab(input: BenefitFeatureGateInput): boolean {
  return (
    input.isFeatureFlagEnabled &&
    input.hasTossPromotionApproval &&
    hasApprovedRequiredAdGroupIds(input.requiredAdGroupIds) &&
    input.hasBenefitApiReady &&
    input.isInTossApp
  );
}

export function selectNextQuizQuestion(
  input: QuizSelectionInput,
): QuizQuestionSnapshot | null {
  const activeQuestions = sortQuestionsByStablePriority(
    input.questions.filter((question) => question.isActive),
  );
  if (activeQuestions.length === 0) {
    return null;
  }

  const attemptedQuestionIds = new Set(
    input.userAttempts.map((attempt) => attempt.questionId),
  );
  const recentQuestionIds = new Set(
    input.userAttempts
      .filter((attempt) =>
        isWithinRecentWindow(
          attempt.answeredAt,
          input.nowIso,
          QUESTION_RECENT_EXCLUDE_DAYS,
        ),
      )
      .map((attempt) => attempt.questionId),
  );

  const neverAttempted = activeQuestions.find(
    (question) => !attemptedQuestionIds.has(question.id),
  );
  if (neverAttempted != null) {
    return neverAttempted;
  }

  const notRecentAndGoodQuality = activeQuestions.find(
    (question) =>
      !recentQuestionIds.has(question.id) && isQualityBandQuestion(question),
  );
  if (notRecentAndGoodQuality != null) {
    return notRecentAndGoodQuality;
  }

  const notRecent = activeQuestions.find(
    (question) => !recentQuestionIds.has(question.id),
  );
  if (notRecent != null) {
    return notRecent;
  }

  return activeQuestions[0] ?? null;
}

export function resolvePredictionCandidateSymbols(
  portfolios: readonly PredictionPortfolioSnapshot[],
  supportedSymbols: readonly string[],
  fallbackSymbols: readonly string[],
): readonly string[] {
  const supportedSet = new Set(
    supportedSymbols
      .map(normalizeSymbol)
      .filter((symbol) => symbol !== ''),
  );
  const portfolioSymbols = new Set<string>();

  for (const portfolio of portfolios) {
    for (const key of STRATEGY_STOCK_KEYS) {
      const symbol = portfolio.strategy?.[key]?.stock;
      if (symbol == null) {
        continue;
      }

      const normalizedSymbol = normalizeSymbol(symbol);
      if (supportedSet.has(normalizedSymbol)) {
        portfolioSymbols.add(normalizedSymbol);
      }
    }
  }

  if (portfolioSymbols.size > 0) {
    return [...portfolioSymbols];
  }

  return fallbackSymbols
    .map(normalizeSymbol)
    .filter((symbol) => supportedSet.has(symbol));
}

export function calculateQuestionBankTotal(
  plan: QuizQuestionBankPlan,
): number {
  assertNonNegativeInteger(
    plan.phase1CoreQuestionCount,
    'phase1CoreQuestionCount',
  );
  assertNonNegativeInteger(
    plan.phase2MarketQuestionCount,
    'phase2MarketQuestionCount',
  );
  assertNonNegativeInteger(
    plan.phase3CurrentQuestionCount,
    'phase3CurrentQuestionCount',
  );

  return (
    plan.phase1CoreQuestionCount +
    plan.phase2MarketQuestionCount +
    plan.phase3CurrentQuestionCount
  );
}
