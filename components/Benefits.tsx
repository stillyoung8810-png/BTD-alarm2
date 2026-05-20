import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBenefitMessages,
  type BenefitMessages,
  type BenefitWalletBoardItemCopy,
} from '@/constants/messages/benefitMessages';
import { useMutexAction } from '@/hooks/useMutexAction';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import { useAdPreload } from '@/services/ads/AdPreloadProvider';
import {
  getResolvedBenefitFeedBannerAdGroupId,
  REWARD_UNLOCK_AI_AD_GROUP_ID,
} from '@/services/ads/adPlacements';
import { INTERSTITIAL_PLACEMENT_KEYS } from '@/services/ads/interstitialPlacementConfig';
import { requestRewardAd } from '@/services/ads/rewardAdService';
import {
  checkInBenefitAttendance,
  loadBenefitPredictionQuestion,
  loadBenefitQuizQuestion,
  loadBenefitSummary,
  redeemBenefitTossPoint,
  submitBenefitPredictionAttempt,
  submitBenefitQuizAttempt,
  unlockBenefitMissionAd,
  type BenefitAdUnlockReason,
  type BenefitAdUnlockResult,
  type BenefitPredictionQuestionResponse,
  type BenefitQuizQuestionResponse,
  type BenefitSummary,
  type BenefitTossPointRedeemResult,
  type PredictionDirection,
} from '@/services/benefits/benefitQuestClient';
import type { MissionKind } from '@/services/benefits/benefitRewardPolicy';
import type {
  ServiceError,
  ServiceErrorCode,
  ServiceResult,
} from '@/services/serviceUtils';
import type { AppLang } from '@/types';
import { useTossApp } from '@/contexts/TossAppContext';
import { AttendanceQuestCard } from './benefits/AttendanceQuestCard';
import { BenefitWalletBoard } from './benefits/BenefitWalletBoard';
import { PredictionQuestCard } from './benefits/PredictionQuestCard';
import { StockQuizQuestCard } from './benefits/StockQuizQuestCard';
import { TossPointReceiveCard } from './benefits/TossPointReceiveCard';
import { TossInlineBanner } from './TossInlineBanner';

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

interface BenefitQuestionState<Response> {
  readonly status: RequestStatus;
  readonly response: Response | null;
}

interface BenefitsProps {
  readonly lang: AppLang;
  readonly shouldShowAds: boolean;
  readonly isAuthenticated: boolean;
}

const BENEFIT_LOCALE_BY_LANG: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
} as const;
const PERCENT_SCALE = 100;
const PERCENT_DECIMAL_PLACES = 0;
const PERCENT_ROUNDING_SCALE = 10 ** PERCENT_DECIMAL_PLACES;
const AD_UNLOCK_RETRY_DELAYS_MS = [700, 1_500] as const;
const NO_REWARD_MONEY = 0;
const NO_UNLOCKED_ATTEMPT_REASON = 'no_unlocked_attempt_available';
const ERROR_TOAST_DEDUP_WINDOW_MS = 1_200;
const TOSS_PAYOUT_STATUS_PENDING = 'pending';
const TOSS_PAYOUT_STATUS_FAILED = 'failed';
const BENEFIT_FEED_BANNER_CONTAINER_CLASS = 'h-[410px] min-h-[410px] w-full';

const MISSION_ATTEMPT_LIMIT_CODES = [
  'attempt_limit_reached',
  'daily_attempt_limit_reached',
] as const;
const MISSION_NOT_UNLOCKED_CODES = [NO_UNLOCKED_ATTEMPT_REASON] as const;
const MISSION_QUESTION_UNAVAILABLE_CODES = [
  'quiz_question_not_ready',
  'prediction_question_not_ready',
  'prediction_candidate_not_ready',
  'quiz_question_not_available',
  'prediction_question_not_available',
] as const;
const MISSION_INVALID_ATTEMPT_CODES = [
  'attempt_sequence_must_match_next_attempt',
  'attempt_sequence_out_of_range',
  'attemptSequence_must_be_between_1_and_5',
] as const;
const AD_UNLOCK_LIMIT_CODES = ['unlock_limit_reached'] as const;
const AD_UNLOCK_RETRYABLE_ERROR_CODES: readonly ServiceErrorCode[] = [
  'NETWORK',
  'TIMEOUT',
  'SERVER_ERROR',
];
const TOSS_POINT_NOT_ENOUGH_CODES = ['not_enough_money_to_redeem'] as const;
const TOSS_POINT_PENDING_CODES = [
  'pending_toss_redeem_exists',
  'pending_payout_exists',
  'payout_pending',
  'already_pending',
] as const;
const TOSS_POINT_PREPARING_CODES = [
  '4100',
  'promotion_not_found',
  'toss_promotion_not_found',
] as const;
const TOSS_POINT_UNAVAILABLE_CODES = [
  '4109',
  'promotion_inactive',
  'promotion_closed',
  'promotion_ended',
  'promotion_expired',
  'promotion_budget_exhausted',
  'budget_exhausted',
] as const;
const TOSS_POINT_BUDGET_RETRY_CODES = [
  '4112',
  'budget_not_enough',
  'insufficient_promotion_budget',
] as const;
const TOSS_POINT_KEY_RETRY_CODES = [
  '4113',
  'promotion_key_already_used',
  'promotion_key_expired',
  'promotion_key_invalid',
  'key_expired',
] as const;
const TOSS_POINT_RESULT_MISSING_CODES = [
  '4111',
  'promotion_execution_result_not_found',
  'execution_result_not_found',
] as const;
const TOSS_POINT_REQUEST_LIMIT_CODES = [
  '4114',
  'promotion_amount_limit_exceeded',
  'promotion_request_limit_exceeded',
  'amount_limit_exceeded',
] as const;
const TOSS_POINT_RESTORE_CODES = [
  'toss_redeem_restore_completed',
  'payout_restored',
  'promotion_failed_restored',
] as const;

function formatBenefitInteger(value: number, lang: AppLang): string {
  return value.toLocaleString(BENEFIT_LOCALE_BY_LANG[lang]);
}

function formatMoneyValue(
  value: number,
  lang: AppLang,
  copy: BenefitMessages,
): string {
  const formattedValue = formatBenefitInteger(value, lang);
  if (lang === 'ko') {
    return `${formattedValue}${copy.moneyUnit}`;
  }

  return `${formattedValue} ${copy.moneyUnit}`;
}

function formatPointValue(
  value: number,
  lang: AppLang,
  copy: BenefitMessages,
): string {
  return `${formatBenefitInteger(value, lang)}${copy.tossPointUnit}`;
}

function formatWalletItemValue(
  itemId: BenefitWalletBoardItemCopy['id'],
  summary: BenefitSummary,
  lang: AppLang,
  copy: BenefitMessages,
): string {
  switch (itemId) {
    case 'balance':
      return formatMoneyValue(summary.walletBoard.currentMoneyBalance, lang, copy);
    case 'lifetime':
      return formatMoneyValue(summary.walletBoard.lifetimeEarnedMoney, lang, copy);
    case 'redeemable':
      return formatPointValue(summary.walletBoard.redeemableTossPoint, lang, copy);
    case 'pending':
      return formatPointValue(summary.walletBoard.pendingTossPointAmount, lang, copy);
    default: {
      const exhaustiveCheck: never = itemId;
      return exhaustiveCheck;
    }
  }
}

function resolveWalletItems(
  copy: BenefitMessages,
  summary: BenefitSummary | null,
  lang: AppLang,
): readonly BenefitWalletBoardItemCopy[] {
  if (summary == null) {
    return copy.walletItems;
  }

  return copy.walletItems.map((item) => ({
    ...item,
    value: formatWalletItemValue(item.id, summary, lang, copy),
  }));
}

function formatPredictionAccuracyText(
  summary: BenefitSummary | null,
  copy: BenefitMessages,
): string {
  const predictionAccuracy = summary?.predictionAccuracy ?? null;
  if (predictionAccuracy == null || predictionAccuracy.settledAttempts <= 0) {
    return copy.predictionLastAccuracyEmptyLabel;
  }

  const rawPercent = predictionAccuracy.accuracyRate * PERCENT_SCALE;
  const roundedPercent =
    Math.round((rawPercent + Number.EPSILON) * PERCENT_ROUNDING_SCALE) /
    PERCENT_ROUNDING_SCALE;

  return `${copy.predictionLastAccuracyLabel}: ${roundedPercent.toFixed(
    PERCENT_DECIMAL_PLACES,
  )}%`;
}

function waitForAdUnlockRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function isRetryableAdUnlockError(error: ServiceError): boolean {
  return AD_UNLOCK_RETRYABLE_ERROR_CODES.includes(error.code);
}

async function unlockBenefitMissionAdWithRetry(request: {
  readonly missionKind: MissionKind;
  readonly missionDate: string;
  readonly idempotencyKey: string;
}): Promise<ServiceResult<BenefitAdUnlockResult | null>> {
  let result = await unlockBenefitMissionAd(request);

  for (const delayMs of AD_UNLOCK_RETRY_DELAYS_MS) {
    if (result.ok || !isRetryableAdUnlockError(result.error)) {
      return result;
    }

    await waitForAdUnlockRetry(delayMs);
    result = await unlockBenefitMissionAd(request);
  }

  return result;
}

function createIdempotencyKey(prefix: string): string {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}:${randomValue}`;
}

function hasBenefitFailureCode(
  errorMessage: string,
  failureCodes: readonly string[],
): boolean {
  return failureCodes.some((failureCode) => errorMessage.includes(failureCode));
}

function resolveAdUnlockReasonMessage(
  reason: BenefitAdUnlockReason,
  copy: BenefitMessages,
): string {
  switch (reason) {
    case 'granted':
      return copy.rewardAdUnlockSuccessMessage;
    case 'attempt_limit_reached':
      return copy.attemptLimitReachedMessage;
    case 'unlock_limit_reached':
      return copy.unlockLimitReachedMessage;
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

function resolveTossPointRedeemSuccessMessage(
  result: BenefitTossPointRedeemResult,
  copy: BenefitMessages,
): string {
  if (result.status === TOSS_PAYOUT_STATUS_FAILED) {
    return copy.tossPointRestoreCompletedMessage;
  }

  if (result.alreadyProcessed || result.status === TOSS_PAYOUT_STATUS_PENDING) {
    return copy.tossPointPendingMessage;
  }

  if (result.isS2sMocked) {
    return copy.tossPointMockPendingMessage;
  }

  return copy.tossPointSuccessMessage;
}

function resolveServiceErrorMessage(
  error: ServiceError,
  copy: BenefitMessages,
): string {
  if (error.code === 'AUTH_REQUIRED') {
    return copy.authRequiredMessage;
  }

  if (error.code === 'NETWORK' || error.code === 'TIMEOUT') {
    return copy.networkErrorMessage;
  }

  if (error.code === 'MISSING_ENV') {
    return copy.benefitApiSetupMessage;
  }

  if (error.code === 'NOT_FOUND') {
    return copy.benefitApiRouteMissingMessage;
  }

  const failureMessage = error.message;
  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_NOT_ENOUGH_CODES)) {
    return copy.tossPointNotEnoughMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_PENDING_CODES)) {
    return copy.tossPointPendingMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_PREPARING_CODES)) {
    return copy.tossPointPreparingMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_UNAVAILABLE_CODES)) {
    return copy.tossPointUnavailableMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_BUDGET_RETRY_CODES)) {
    return copy.tossPointBudgetRetryMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_KEY_RETRY_CODES)) {
    return copy.tossPointKeyRetryMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_RESULT_MISSING_CODES)) {
    return copy.tossPointResultMissingMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_REQUEST_LIMIT_CODES)) {
    return copy.tossPointRequestLimitMessage;
  }

  if (hasBenefitFailureCode(failureMessage, TOSS_POINT_RESTORE_CODES)) {
    return copy.tossPointRestoreCompletedMessage;
  }

  if (hasBenefitFailureCode(failureMessage, MISSION_ATTEMPT_LIMIT_CODES)) {
    return copy.attemptLimitReachedMessage;
  }

  if (hasBenefitFailureCode(failureMessage, MISSION_NOT_UNLOCKED_CODES)) {
    return copy.missionNotUnlockedMessage;
  }

  if (hasBenefitFailureCode(failureMessage, AD_UNLOCK_LIMIT_CODES)) {
    return copy.unlockLimitReachedMessage;
  }

  if (hasBenefitFailureCode(failureMessage, MISSION_QUESTION_UNAVAILABLE_CODES)) {
    return copy.missionQuestionUnavailableMessage;
  }

  if (hasBenefitFailureCode(failureMessage, MISSION_INVALID_ATTEMPT_CODES)) {
    return copy.missionInvalidAttemptMessage;
  }

  if (error.code === 'SERVER_ERROR') {
    return copy.benefitServerErrorMessage;
  }

  return copy.genericActionError;
}

function resolveQuestionStatusLabel(
  status: RequestStatus,
  hasQuestion: boolean,
  canUnlockWithAd: boolean,
  unavailableReason: string | undefined,
  fallbackStatus: string,
  readyStatus: string,
  unavailableStatus: string,
  completedStatus: string,
): string {
  if (status === 'loading' || status === 'idle') {
    return fallbackStatus;
  }

  if (hasQuestion) {
    return readyStatus;
  }

  if (unavailableReason === NO_UNLOCKED_ATTEMPT_REASON) {
    return completedStatus;
  }

  if (canUnlockWithAd) {
    return readyStatus;
  }

  if (
    status === 'error' ||
    (unavailableReason != null &&
      unavailableReason !== NO_UNLOCKED_ATTEMPT_REASON)
  ) {
    return unavailableStatus;
  }

  return completedStatus;
}

function resolveAttendanceStatusLabel(
  copy: BenefitMessages,
  summary: BenefitSummary | null,
): string {
  if (summary == null) {
    return copy.attendanceStatus;
  }

  if (summary.attendance.hasCheckedInToday) {
    return copy.attendanceCompletedStatus;
  }

  return copy.attendanceReadyStatus;
}

function resolveTossPointStatusLabel(
  copy: BenefitMessages,
  summary: BenefitSummary | null,
): string {
  if (summary == null) {
    return copy.tossPointStatus;
  }

  if (summary.pendingPayout.hasPendingPayout) {
    return copy.tossPointPendingStatus;
  }

  return copy.tossPointReadyStatus;
}

export default function Benefits({
  lang,
  shouldShowAds,
  isAuthenticated,
}: BenefitsProps): React.ReactElement {
  const copy = getBenefitMessages(lang);
  const { showInstantAd } = useAdPreload();
  const { isInTossApp } = useTossApp();
  const [summaryStatus, setSummaryStatus] = useState<RequestStatus>('idle');
  const [summary, setSummary] = useState<BenefitSummary | null>(null);
  const [quizState, setQuizState] = useState<
    BenefitQuestionState<BenefitQuizQuestionResponse>
  >({
    status: 'idle',
    response: null,
  });
  const [predictionState, setPredictionState] = useState<
    BenefitQuestionState<BenefitPredictionQuestionResponse>
  >({
    status: 'idle',
    response: null,
  });
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const summaryRequestIdRef = useRef(0);
  const quizRequestIdRef = useRef(0);
  const predictionRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const lastErrorToastRef = useRef<{
    readonly message: string;
    readonly shownAt: number;
  } | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    setSummaryStatus('idle');
    setSummary(null);
    setQuizState({ status: 'idle', response: null });
    setPredictionState({ status: 'idle', response: null });
    setNoticeMessage(null);
  }, [isAuthenticated]);

  const publishInfoNotice = useCallback((message: string): void => {
    setNoticeMessage(message);
  }, []);

  const publishErrorNotice = useCallback((message: string): void => {
    setNoticeMessage(message);

    const currentTimeMs = Date.now();
    const previousToast = lastErrorToastRef.current;
    const hasRecentlyShownSameToast =
      previousToast?.message === message &&
      currentTimeMs - previousToast.shownAt < ERROR_TOAST_DEDUP_WINDOW_MS;
    if (hasRecentlyShownSameToast) {
      return;
    }

    lastErrorToastRef.current = { message, shownAt: currentTimeMs };
    try {
      showErrorToast(message);
    } catch (error: unknown) {
      console.error('[Benefits] error toast failed:', error);
    }
  }, []);

  const publishRequestFailure = useCallback(
    <T,>(result: ServiceResult<T>, fallbackMessage: string): void => {
      if (result.ok) {
        publishInfoNotice(fallbackMessage);
        return;
      }

      publishErrorNotice(resolveServiceErrorMessage(result.error, copy));
    },
    [copy, publishErrorNotice, publishInfoNotice],
  );

  const loadSummary = useCallback(async (): Promise<BenefitSummary | null> => {
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setSummaryStatus('loading');

    const result = await loadBenefitSummary();
    if (!isMountedRef.current || summaryRequestIdRef.current !== requestId) {
      return null;
    }

    if (!result.ok || result.data == null) {
      setSummaryStatus('error');
      publishRequestFailure(result, copy.summaryLoadError);
      return null;
    }

    setSummary(result.data);
    setSummaryStatus('ready');
    return result.data;
  }, [copy.summaryLoadError, publishRequestFailure]);

  const loadQuizQuestion = useCallback(
    async (attemptDate: string): Promise<BenefitQuizQuestionResponse | null> => {
      const requestId = quizRequestIdRef.current + 1;
      quizRequestIdRef.current = requestId;
      setQuizState((current) => ({
        status: 'loading',
        response: current.response,
      }));

      const result = await loadBenefitQuizQuestion({ attemptDate });
      if (!isMountedRef.current || quizRequestIdRef.current !== requestId) {
        return null;
      }

      if (!result.ok || result.data == null) {
        setQuizState({ status: 'error', response: null });
        publishRequestFailure(result, copy.quizNoQuestionMessage);
        return null;
      }

      setQuizState({ status: 'ready', response: result.data });
      return result.data;
    },
    [copy.quizNoQuestionMessage, publishRequestFailure],
  );

  const loadPredictionQuestion = useCallback(
    async (
      attemptDate: string,
    ): Promise<BenefitPredictionQuestionResponse | null> => {
      const requestId = predictionRequestIdRef.current + 1;
      predictionRequestIdRef.current = requestId;
      setPredictionState((current) => ({
        status: 'loading',
        response: current.response,
      }));

      const result = await loadBenefitPredictionQuestion({ attemptDate });
      if (
        !isMountedRef.current ||
        predictionRequestIdRef.current !== requestId
      ) {
        return null;
      }

      if (!result.ok || result.data == null) {
        setPredictionState({ status: 'error', response: null });
        publishRequestFailure(result, copy.predictionNoQuestionMessage);
        return null;
      }

      setPredictionState({ status: 'ready', response: result.data });
      return result.data;
    },
    [copy.predictionNoQuestionMessage, publishRequestFailure],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadInitialBenefitState = async (): Promise<void> => {
      const nextSummary = await loadSummary();
      if (nextSummary == null) {
        return;
      }

      await Promise.all([
        loadQuizQuestion(nextSummary.summaryDate),
        loadPredictionQuestion(nextSummary.summaryDate),
      ]);
    };

    void loadInitialBenefitState();
  }, [isAuthenticated, loadPredictionQuestion, loadQuizQuestion, loadSummary]);

  const refreshBenefitState = useCallback(async (): Promise<void> => {
    const nextSummary = await loadSummary();
    if (nextSummary == null) {
      return;
    }

    await Promise.all([
      loadQuizQuestion(nextSummary.summaryDate),
      loadPredictionQuestion(nextSummary.summaryDate),
    ]);
  }, [loadPredictionQuestion, loadQuizQuestion, loadSummary]);

  const showBenefitInterstitial = useCallback((): void => {
    void showInstantAd(INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD).catch(
      (error: unknown) => {
        console.error('[Benefits] interstitial failed:', error);
      },
    );
  }, [showInstantAd]);

  const handleAttendanceCheckInCore = useCallback(async (): Promise<boolean> => {
    if (summary == null) {
      publishErrorNotice(copy.summaryLoadError);
      return false;
    }

    const hasWatchedInterstitialForStreakBonus =
      summary.attendance.requiresInterstitialForBonus
        ? await showInstantAd(INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD)
        : false;
    const result = await checkInBenefitAttendance({
      attendanceDate: summary.summaryDate,
      hasWatchedInterstitialForStreakBonus,
    });

    if (!result.ok || result.data == null) {
      publishRequestFailure(result, copy.genericActionError);
      return false;
    }

    publishInfoNotice(
      result.data.streakBonusMoneyGranted > NO_REWARD_MONEY
        ? copy.attendanceStreakSuccessMessage
        : copy.attendanceSuccessMessage,
    );
    await refreshBenefitState();
    return true;
  }, [
    copy.attendanceStreakSuccessMessage,
    copy.attendanceSuccessMessage,
    copy.genericActionError,
    copy.summaryLoadError,
    publishErrorNotice,
    publishInfoNotice,
    publishRequestFailure,
    refreshBenefitState,
    showInstantAd,
    summary,
  ]);

  const handleQuizChoiceSubmitCore = useCallback(
    async (selectedChoiceId: string): Promise<boolean> => {
      const response = quizState.response;
      if (response?.question == null || response.attemptSequence == null) {
        publishErrorNotice(copy.quizNoQuestionMessage);
        return false;
      }

      const result = await submitBenefitQuizAttempt({
        questionId: response.question.id,
        attemptDate: response.attemptDate,
        attemptSequence: response.attemptSequence,
        idempotencyKey: createIdempotencyKey('quiz'),
        selectedChoiceId,
      });

      if (!result.ok || result.data == null) {
        publishRequestFailure(result, copy.genericActionError);
        return false;
      }

      publishInfoNotice(
        result.data.isCorrect ? copy.quizCorrectMessage : copy.quizIncorrectMessage,
      );
      showBenefitInterstitial();
      await refreshBenefitState();
      return true;
    },
    [
      copy.genericActionError,
      copy.quizCorrectMessage,
      copy.quizIncorrectMessage,
      copy.quizNoQuestionMessage,
      publishErrorNotice,
      publishInfoNotice,
      publishRequestFailure,
      quizState.response,
      refreshBenefitState,
      showBenefitInterstitial,
    ],
  );

  const handlePredictionSubmitCore = useCallback(
    async (selectedDirection: PredictionDirection): Promise<boolean> => {
      const response = predictionState.response;
      if (response?.question == null || response.attemptSequence == null) {
        publishErrorNotice(copy.predictionNoQuestionMessage);
        return false;
      }

      const result = await submitBenefitPredictionAttempt({
        questionId: response.question.id,
        attemptDate: response.attemptDate,
        attemptSequence: response.attemptSequence,
        idempotencyKey: createIdempotencyKey('prediction'),
        selectedDirection,
      });

      if (!result.ok || result.data == null) {
        publishRequestFailure(result, copy.genericActionError);
        return false;
      }

      publishInfoNotice(
        result.data.isCorrect == null
          ? copy.predictionPendingResultMessage
          : copy.predictionSubmitSuccessMessage,
      );
      showBenefitInterstitial();
      await refreshBenefitState();
      return true;
    },
    [
      copy.genericActionError,
      copy.predictionNoQuestionMessage,
      copy.predictionPendingResultMessage,
      copy.predictionSubmitSuccessMessage,
      predictionState.response,
      publishErrorNotice,
      publishInfoNotice,
      publishRequestFailure,
      refreshBenefitState,
      showBenefitInterstitial,
    ],
  );

  const unlockMissionWithRewardAd = useCallback(
    async (missionKind: MissionKind): Promise<boolean> => {
      const missionDate = summary?.summaryDate;
      if (missionDate == null) {
        publishErrorNotice(copy.summaryLoadError);
        return false;
      }

      const hasCompletedRewardAd = await requestRewardAd(REWARD_UNLOCK_AI_AD_GROUP_ID);
      if (!hasCompletedRewardAd) {
        publishErrorNotice(copy.rewardAdNotCompletedMessage);
        return false;
      }

      const idempotencyKey = createIdempotencyKey(`ad-unlock:${missionKind}`);
      const result = await unlockBenefitMissionAdWithRetry({
        missionKind,
        missionDate,
        idempotencyKey,
      });

      if (!result.ok || result.data == null) {
        publishRequestFailure(result, copy.genericActionError);
        return false;
      }

      if (!result.data.canGrant) {
        publishErrorNotice(resolveAdUnlockReasonMessage(result.data.reason, copy));
        return false;
      }

      publishInfoNotice(copy.rewardAdUnlockSuccessMessage);
      await refreshBenefitState();
      return true;
    },
    [
      copy,
      publishErrorNotice,
      publishInfoNotice,
      publishRequestFailure,
      refreshBenefitState,
      summary?.summaryDate,
    ],
  );

  const handleTossPointRedeemCore = useCallback(async (): Promise<boolean> => {
    if (summary == null) {
      publishErrorNotice(copy.summaryLoadError);
      return false;
    }

    if (summary.pendingPayout.hasPendingPayout) {
      publishErrorNotice(copy.tossPointPendingMessage);
      return false;
    }

    if (!summary.walletBoard.canRedeem) {
      publishErrorNotice(copy.tossPointNotEnoughMessage);
      return false;
    }

    const result = await redeemBenefitTossPoint({
      redeemRequestId: createIdempotencyKey('toss-redeem'),
    });

    if (!result.ok || result.data == null) {
      publishRequestFailure(result, copy.genericActionError);
      return false;
    }

    publishInfoNotice(resolveTossPointRedeemSuccessMessage(result.data, copy));
    await refreshBenefitState();
    return true;
  }, [
    copy,
    publishErrorNotice,
    publishInfoNotice,
    publishRequestFailure,
    refreshBenefitState,
    summary,
  ]);

  const attendanceCommand = useMutexAction(handleAttendanceCheckInCore, {
    lockedReturnValue: false,
  });
  const quizSubmitCommand = useMutexAction(handleQuizChoiceSubmitCore, {
    lockedReturnValue: false,
  });
  const predictionSubmitCommand = useMutexAction(handlePredictionSubmitCore, {
    lockedReturnValue: false,
  });
  const quizUnlockCommand = useMutexAction(
    () => unlockMissionWithRewardAd('stock_quiz'),
    {
      lockedReturnValue: false,
    },
  );
  const predictionUnlockCommand = useMutexAction(
    () => unlockMissionWithRewardAd('price_prediction'),
    {
      lockedReturnValue: false,
    },
  );
  const tossPointRedeemCommand = useMutexAction(handleTossPointRedeemCore, {
    lockedReturnValue: false,
  });

  const handleRefreshQuizQuestion = useCallback((): void => {
    if (summary == null) {
      publishErrorNotice(copy.summaryLoadError);
      return;
    }

    void loadQuizQuestion(summary.summaryDate);
  }, [copy.summaryLoadError, loadQuizQuestion, publishErrorNotice, summary]);

  const handleRefreshPredictionQuestion = useCallback((): void => {
    if (summary == null) {
      publishErrorNotice(copy.summaryLoadError);
      return;
    }

    void loadPredictionQuestion(summary.summaryDate);
  }, [copy.summaryLoadError, loadPredictionQuestion, publishErrorNotice, summary]);

  const walletItems = resolveWalletItems(copy, summary, lang);
  const shouldLockGuestBenefits = !isAuthenticated;
  const isSummaryLoading =
    isAuthenticated && summaryStatus === 'loading' && summary == null;
  const isAttendanceDisabled =
    shouldLockGuestBenefits ||
    summary == null ||
    summary.attendance.hasCheckedInToday ||
    attendanceCommand.isExecuting;
  const attendanceStatusLabel = shouldLockGuestBenefits
    ? copy.guestLockedStatus
    : resolveAttendanceStatusLabel(copy, summary);
  const canUnlockQuizWithAd =
    !shouldLockGuestBenefits &&
    quizState.response?.reason === NO_UNLOCKED_ATTEMPT_REASON &&
    quizState.response?.availability.canWatchRewardedAd === true;
  const canUnlockPredictionWithAd =
    !shouldLockGuestBenefits &&
    predictionState.response?.reason === NO_UNLOCKED_ATTEMPT_REASON &&
    predictionState.response?.availability.canWatchRewardedAd === true;
  const isQuizBusy =
    quizSubmitCommand.isExecuting ||
    quizUnlockCommand.isExecuting ||
    quizState.status === 'loading';
  const isPredictionBusy =
    predictionSubmitCommand.isExecuting ||
    predictionUnlockCommand.isExecuting ||
    predictionState.status === 'loading';
  const quizStatusLabel = shouldLockGuestBenefits
    ? copy.guestLockedStatus
    : resolveQuestionStatusLabel(
        quizState.status,
        quizState.response?.question != null,
        canUnlockQuizWithAd,
        quizState.response?.reason,
        copy.quizStatus,
        copy.quizReadyStatus,
        copy.quizUnavailableStatus,
        copy.quizCompletedStatus,
      );
  const predictionStatusLabel = shouldLockGuestBenefits
    ? copy.guestLockedStatus
    : resolveQuestionStatusLabel(
        predictionState.status,
        predictionState.response?.question != null,
        canUnlockPredictionWithAd,
        predictionState.response?.reason,
        copy.predictionStatus,
        copy.predictionReadyStatus,
        copy.predictionUnavailableStatus,
        copy.predictionCompletedStatus,
      );
  const predictionLastAccuracyLabel = formatPredictionAccuracyText(summary, copy);
  const tossPointStatusLabel = shouldLockGuestBenefits
    ? copy.guestLockedStatus
    : resolveTossPointStatusLabel(copy, summary);
  const isTossPointRedeemDisabled =
    shouldLockGuestBenefits ||
    summary == null ||
    summary.pendingPayout.hasPendingPayout ||
    !summary.walletBoard.canRedeem ||
    tossPointRedeemCommand.isExecuting;
  const noticeText = shouldLockGuestBenefits
    ? copy.guestNoticeMessage
    : noticeMessage ?? copy.apiPendingNotice;
  const benefitFeedBannerAdGroupId = getResolvedBenefitFeedBannerAdGroupId();
  const shouldRenderBenefitFeedBanner =
    shouldShowAds &&
    isInTossApp &&
    benefitFeedBannerAdGroupId.trim() !== '';
  const shouldShowMissionSubmitInterstitialNotice = shouldShowAds && isInTossApp;

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
            {copy.pageTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 dark:text-slate-400">
            {copy.pageSubtitle}
          </p>
        </div>
      </header>

      <BenefitWalletBoard
        copy={copy}
        items={walletItems}
        isLoading={isSummaryLoading}
      />

      <section
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label={copy.pageTitle}
      >
        <AttendanceQuestCard
          copy={copy}
          statusLabel={attendanceStatusLabel}
          isLoading={attendanceCommand.isExecuting}
          isDisabled={isAttendanceDisabled}
          shouldShowBannerAd={shouldShowAds}
          isInTossApp={isInTossApp}
          onCheckIn={attendanceCommand.run}
        />
        <PredictionQuestCard
          copy={copy}
          lang={lang}
          statusLabel={predictionStatusLabel}
          lastAccuracyLabel={predictionLastAccuracyLabel}
          questionResponse={predictionState.response}
          isLoading={predictionState.status === 'loading'}
          isBusy={isPredictionBusy}
          isDisabled={summary == null}
          canUnlockWithAd={canUnlockPredictionWithAd}
          shouldShowSubmitInterstitialNotice={
            shouldShowMissionSubmitInterstitialNotice
          }
          onRefreshQuestion={handleRefreshPredictionQuestion}
          onSelectDirection={predictionSubmitCommand.run}
          onUnlockWithAd={predictionUnlockCommand.run}
        />
        <StockQuizQuestCard
          copy={copy}
          statusLabel={quizStatusLabel}
          questionResponse={quizState.response}
          isLoading={quizState.status === 'loading'}
          isBusy={isQuizBusy}
          isDisabled={summary == null}
          canUnlockWithAd={canUnlockQuizWithAd}
          shouldShowSubmitInterstitialNotice={
            shouldShowMissionSubmitInterstitialNotice
          }
          onRefreshQuestion={handleRefreshQuizQuestion}
          onSelectChoice={quizSubmitCommand.run}
          onUnlockWithAd={quizUnlockCommand.run}
        />
        <TossPointReceiveCard
          copy={copy}
          statusLabel={tossPointStatusLabel}
          isLoading={tossPointRedeemCommand.isExecuting}
          isDisabled={isTossPointRedeemDisabled}
          onRedeem={tossPointRedeemCommand.run}
        />
      </section>

      <aside
        className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"
        aria-live="polite"
      >
        {noticeText}
      </aside>

      {shouldRenderBenefitFeedBanner ? (
        <TossInlineBanner
          adGroupId={benefitFeedBannerAdGroupId}
          shouldShowAd
          isInTossApp={isInTossApp}
          className="!my-0"
          containerClassName={BENEFIT_FEED_BANNER_CONTAINER_CLASS}
          variant="card"
        />
      ) : null}
    </div>
  );
}
