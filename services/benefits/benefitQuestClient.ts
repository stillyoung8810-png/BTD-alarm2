import { readTrimmedViteEnv } from '@/utils/viteImportMetaEnv';
import {
  createServiceError,
  failResult,
  fetchJsonWithTimeout,
  isRecord,
  type ServiceError,
  type ServiceErrorCode,
  type ServiceResult,
} from '../serviceUtils';
import { isSupabaseConfigured, supabase } from '../supabase';
import type {
  BenefitWalletBoardSummary,
  DailyAttemptAvailability,
  MissionKind,
  QuestionPhase,
} from './benefitRewardPolicy';

const BENEFIT_FUNCTION_NAME = 'benefits';
const BENEFIT_REQUEST_TIMEOUT_MS = 12_000;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_CONFLICT = 409;
const SUMMARY_ROUTE = '/summary';
const ATTENDANCE_CHECK_IN_ROUTE = '/attendance/check-in';
const QUIZ_QUESTION_ROUTE = '/quiz/question';
const QUIZ_ATTEMPT_ROUTE = '/quiz/attempt';
const QUIZ_AD_UNLOCK_ROUTE = '/quiz/ad-unlock';
const PREDICTION_QUESTION_ROUTE = '/prediction/question';
const PREDICTION_ATTEMPT_ROUTE = '/prediction/attempt';
const PREDICTION_AD_UNLOCK_ROUTE = '/prediction/ad-unlock';
const TOSS_POINT_REDEEM_ROUTE = '/toss-point/redeem';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BenefitRoute =
  | typeof SUMMARY_ROUTE
  | typeof ATTENDANCE_CHECK_IN_ROUTE
  | typeof QUIZ_QUESTION_ROUTE
  | typeof QUIZ_ATTEMPT_ROUTE
  | typeof QUIZ_AD_UNLOCK_ROUTE
  | typeof PREDICTION_QUESTION_ROUTE
  | typeof PREDICTION_ATTEMPT_ROUTE
  | typeof PREDICTION_AD_UNLOCK_ROUTE
  | typeof TOSS_POINT_REDEEM_ROUTE;

export type BenefitQuestionUnavailableReason =
  | 'no_unlocked_attempt_available'
  | 'quiz_question_not_ready'
  | 'prediction_question_not_ready'
  | 'prediction_candidate_not_ready';

export type BenefitAdUnlockReason =
  | 'granted'
  | 'attempt_limit_reached'
  | 'unlock_limit_reached';

export type PredictionDirection = 'up' | 'down';

interface BenefitApiSuccessEnvelope {
  readonly success: true;
  readonly data: unknown;
  readonly s2sMocked?: boolean;
}

type BenefitResponseDecoder<T> = (
  data: unknown,
  envelope: BenefitApiSuccessEnvelope,
) => T | null;

interface BenefitRequestOptions<T> {
  readonly route: BenefitRoute;
  readonly body?: Record<string, unknown>;
  readonly fallback: T | null;
  readonly decode: BenefitResponseDecoder<T>;
}

interface BenefitAuthHeadersResult {
  readonly ok: true;
  readonly headers: Record<string, string>;
}

export interface BenefitMissionSummary {
  readonly missionKind: MissionKind;
  readonly missionDate: string;
  readonly completedAttempts: number;
  readonly rewardedAdUnlocks: number;
  readonly nextAttemptSequence: number | null;
  readonly availability: DailyAttemptAvailability;
}

export interface BenefitAttendanceSummary {
  readonly attendanceDate: string;
  readonly hasCheckedInToday: boolean;
  readonly consecutiveDays: number;
  readonly nextConsecutiveDays: number;
  readonly requiresInterstitialForBonus: boolean;
  readonly streakBonusAdShown: boolean;
  readonly streakBonusMoney: number;
}

export interface BenefitSummary {
  readonly summaryDate: string;
  readonly wallet: {
    readonly moneyBalance: number;
    readonly lifetimeEarnedMoney: number;
  };
  readonly pendingPayout: {
    readonly tossPointAmount: number;
    readonly hasPendingPayout: boolean;
  };
  readonly walletBoard: BenefitWalletBoardSummary;
  readonly attendance: BenefitAttendanceSummary;
  readonly missions: {
    readonly stockQuiz: BenefitMissionSummary;
    readonly pricePrediction: BenefitMissionSummary;
  };
}

export interface BenefitSummaryRequest {
  readonly summaryDate?: string;
}

export interface BenefitQuizChoice {
  readonly id: string;
  readonly label: string;
}

export interface BenefitQuizQuestion {
  readonly id: string;
  readonly phase: QuestionPhase;
  readonly category: string;
  readonly difficulty: string;
  readonly questionType: string;
  readonly question: string;
  readonly choices: readonly BenefitQuizChoice[];
  readonly topic: string | null;
}

export interface BenefitQuizQuestionResponse {
  readonly attemptDate: string;
  readonly attemptSequence: number | null;
  readonly availability: DailyAttemptAvailability;
  readonly question: BenefitQuizQuestion | null;
  readonly reason?: BenefitQuestionUnavailableReason;
}

export interface BenefitPredictionQuestion {
  readonly id: string;
  readonly symbol: string;
  readonly questionDate: string;
  readonly baseTradeDate: string;
  readonly baseClose: number;
}

export interface BenefitPredictionQuestionResponse {
  readonly attemptDate: string;
  readonly attemptSequence: number | null;
  readonly availability: DailyAttemptAvailability;
  readonly question: BenefitPredictionQuestion | null;
  readonly reason?: BenefitQuestionUnavailableReason;
}

export interface BenefitQuestionRequest {
  readonly attemptDate?: string;
}

export interface BenefitAttendanceCheckInRequest {
  readonly attendanceDate?: string;
  readonly hasWatchedInterstitialForStreakBonus?: boolean;
}

export interface BenefitAttendanceCheckInResult {
  readonly attendanceDate: string;
  readonly consecutiveDays: number;
  readonly baseMoneyGranted: number;
  readonly streakBonusMoneyGranted: number;
  readonly requiresInterstitialForBonus: boolean;
  readonly moneyBalance: number;
  readonly lifetimeEarnedMoney: number;
}

export interface BenefitAdUnlockRequest {
  readonly missionKind: MissionKind;
  readonly missionDate?: string;
}

export interface BenefitAdUnlockResult {
  readonly canGrant: boolean;
  readonly reason: BenefitAdUnlockReason;
  readonly completedAttempts: number;
  readonly rewardedAdUnlocks: number;
}

export interface BenefitQuizAttemptRequest {
  readonly questionId: string;
  readonly attemptDate?: string;
  readonly attemptSequence: number;
  readonly idempotencyKey: string;
  readonly selectedChoiceId: string;
}

export interface BenefitQuizAttemptResult {
  readonly alreadyProcessed: boolean;
  readonly attemptId: string;
  readonly isCorrect: boolean;
  readonly rewardMoney: number;
  readonly completedAttempts: number;
  readonly moneyBalance: number;
}

export interface BenefitPredictionAttemptRequest {
  readonly questionId: string;
  readonly attemptDate?: string;
  readonly attemptSequence: number;
  readonly idempotencyKey: string;
  readonly selectedDirection: PredictionDirection;
}

export interface BenefitPredictionAttemptResult {
  readonly alreadyProcessed: boolean;
  readonly attemptId: string;
  readonly isCorrect: boolean | null;
  readonly rewardMoney: number;
  readonly completedAttempts: number;
  readonly moneyBalance: number;
}

export interface BenefitTossPointRedeemRequest {
  readonly redeemRequestId: string;
}

export interface BenefitTossPointRedeemResult {
  readonly alreadyProcessed: boolean;
  readonly payoutId: string;
  readonly status: string;
  readonly redeemedMoney: number;
  readonly tossPointAmount: number;
  readonly moneyBalance: number;
  readonly isS2sMocked: boolean;
}

function getBenefitEndpointUrl(route: BenefitRoute): string | null {
  const supabaseUrl = readTrimmedViteEnv('VITE_SUPABASE_URL');
  if (!isSupabaseConfigured || supabaseUrl.length === 0) {
    return null;
  }

  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${BENEFIT_FUNCTION_NAME}${route}`;
}

function createMissingEnvResult<T>(
  fallback: T | null,
  route: BenefitRoute,
): ServiceResult<T | null> {
  return failResult(
    fallback,
    createServiceError('MISSING_ENV', 'benefit_api_env_missing', {
      retryable: false,
      context: { route },
    }),
    { route },
  );
}

async function getBenefitAuthHeaders(
  route: BenefitRoute,
): Promise<BenefitAuthHeadersResult | ServiceError> {
  const anonKey = readTrimmedViteEnv('VITE_SUPABASE_ANON_KEY');
  if (!isSupabaseConfigured || anonKey.length === 0) {
    return createServiceError('MISSING_ENV', 'benefit_api_env_missing', {
      retryable: false,
      context: { route },
    });
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error != null) {
    return createServiceError('AUTH_REQUIRED', 'benefit_session_read_failed', {
      retryable: false,
      cause: error,
      context: { route },
    });
  }

  if (session?.access_token == null || session.access_token.trim() === '') {
    return createServiceError('AUTH_REQUIRED', 'authentication_required', {
      retryable: false,
      context: { route },
    });
  }

  return {
    ok: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  };
}

function isSuccessEnvelope(value: unknown): value is BenefitApiSuccessEnvelope {
  return isRecord(value) && value.success === true && 'data' in value;
}

function readBenefitFailureCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.error === 'string' && value.error.trim() !== '') {
    return value.error.trim();
  }

  if (typeof value.reason === 'string' && value.reason.trim() !== '') {
    return value.reason.trim();
  }

  return null;
}

function mapBenefitFailureToErrorCode(
  benefitFailureCode: string | null,
  httpStatus?: number,
): ServiceErrorCode {
  if (
    benefitFailureCode === 'authentication_required' ||
    benefitFailureCode === 'invalid_auth_token'
  ) {
    return 'AUTH_REQUIRED';
  }

  if (benefitFailureCode === 'benefit_route_not_found') {
    return 'NOT_FOUND';
  }

  if (benefitFailureCode === 'benefit_request_failed') {
    return 'SERVER_ERROR';
  }

  if (
    benefitFailureCode?.endsWith('_required') === true ||
    benefitFailureCode?.endsWith('_invalid') === true ||
    benefitFailureCode?.includes('_must_') === true ||
    benefitFailureCode?.includes('_out_of_range') === true ||
    benefitFailureCode?.includes('not_available') === true ||
    httpStatus === HTTP_STATUS_BAD_REQUEST
  ) {
    return 'INVALID_INPUT';
  }

  if (httpStatus === HTTP_STATUS_CONFLICT) {
    return 'HTTP_ERROR';
  }

  return 'UNKNOWN';
}

function normalizeBenefitServiceError(error: ServiceError): ServiceError {
  const benefitFailureCode = readBenefitFailureCode(error.cause);
  if (benefitFailureCode == null) {
    return error;
  }

  return createServiceError(
    mapBenefitFailureToErrorCode(benefitFailureCode, error.httpStatus),
    benefitFailureCode,
    {
      retryable: error.retryable,
      httpStatus: error.httpStatus,
      cause: error.cause,
      context: {
        ...(error.context ?? {}),
        benefitFailureCode,
      },
    },
  );
}

function createInvalidResponseResult<T>(
  fallback: T | null,
  route: BenefitRoute,
  cause: unknown,
): ServiceResult<T | null> {
  return failResult(
    fallback,
    createServiceError('INVALID_RESPONSE', 'benefit_response_invalid', {
      retryable: false,
      cause,
      context: { route },
    }),
    { route },
  );
}

async function postBenefitRequest<T>(
  options: BenefitRequestOptions<T>,
): Promise<ServiceResult<T | null>> {
  const endpointUrl = getBenefitEndpointUrl(options.route);
  if (endpointUrl == null) {
    return createMissingEnvResult(options.fallback, options.route);
  }

  const authHeaders = await getBenefitAuthHeaders(options.route);
  if (!('ok' in authHeaders)) {
    return failResult(options.fallback, authHeaders, { route: options.route });
  }

  const responseResult = await fetchJsonWithTimeout<null>(
    endpointUrl,
    {
      method: 'POST',
      headers: authHeaders.headers,
      body: JSON.stringify(options.body ?? {}),
    },
    null,
    {
      timeoutMs: BENEFIT_REQUEST_TIMEOUT_MS,
      context: { route: options.route },
    },
  );

  if (!responseResult.ok) {
    return failResult(
      options.fallback,
      normalizeBenefitServiceError(responseResult.error),
      responseResult.context,
    );
  }

  if (!isSuccessEnvelope(responseResult.data)) {
    return createInvalidResponseResult(
      options.fallback,
      options.route,
      responseResult.data,
    );
  }

  const decodedData = options.decode(responseResult.data.data, responseResult.data);
  if (decodedData == null) {
    return createInvalidResponseResult(
      options.fallback,
      options.route,
      responseResult.data,
    );
  }

  return {
    ok: true,
    data: decodedData,
    context: responseResult.context,
  };
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readUuid(value: Record<string, unknown>, key: string): string | null {
  const candidate = readString(value, key);
  if (candidate == null || !UUID_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function readDateString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = readString(value, key);
  if (candidate == null || !DATE_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function readBoolean(value: Record<string, unknown>, key: string): boolean | null {
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : null;
}

function readNonNegativeInteger(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = value[key];
  if (
    typeof candidate !== 'number' ||
    !Number.isInteger(candidate) ||
    candidate < 0
  ) {
    return null;
  }

  return candidate;
}

function readPositiveNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = value[key];
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= 0) {
    return null;
  }

  return candidate;
}

function readNullableNonNegativeInteger(
  value: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const candidate = value[key];
  if (candidate == null) {
    return null;
  }

  if (
    typeof candidate !== 'number' ||
    !Number.isInteger(candidate) ||
    candidate < 0
  ) {
    return undefined;
  }

  return candidate;
}

function readQuestionPhase(value: string): QuestionPhase | null {
  if (
    value === 'phase_1_core' ||
    value === 'phase_2_market' ||
    value === 'phase_3_current'
  ) {
    return value;
  }

  return null;
}

function readMissionKind(value: unknown): MissionKind | null {
  if (value === 'price_prediction' || value === 'stock_quiz') {
    return value;
  }

  return null;
}

function readQuestionUnavailableReason(
  value: unknown,
): BenefitQuestionUnavailableReason | undefined {
  if (
    value === 'no_unlocked_attempt_available' ||
    value === 'quiz_question_not_ready' ||
    value === 'prediction_question_not_ready' ||
    value === 'prediction_candidate_not_ready'
  ) {
    return value;
  }

  return undefined;
}

function readAdUnlockReason(value: unknown): BenefitAdUnlockReason | null {
  if (
    value === 'granted' ||
    value === 'attempt_limit_reached' ||
    value === 'unlock_limit_reached'
  ) {
    return value;
  }

  return null;
}

function decodeAvailability(value: unknown): DailyAttemptAvailability | null {
  if (!isRecord(value)) {
    return null;
  }

  const maxAttempts = readNonNegativeInteger(value, 'maxAttempts');
  const availableAttempts = readNonNegativeInteger(value, 'availableAttempts');
  const remainingAttempts = readNonNegativeInteger(value, 'remainingAttempts');
  const canStartAttempt = readBoolean(value, 'canStartAttempt');
  const canWatchRewardedAd = readBoolean(value, 'canWatchRewardedAd');
  if (
    maxAttempts == null ||
    availableAttempts == null ||
    remainingAttempts == null ||
    canStartAttempt == null ||
    canWatchRewardedAd == null
  ) {
    return null;
  }

  return {
    maxAttempts,
    availableAttempts,
    remainingAttempts,
    canStartAttempt,
    canWatchRewardedAd,
  };
}

function decodeWalletBoardSummary(
  value: unknown,
): BenefitWalletBoardSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const currentMoneyBalance = readNonNegativeInteger(value, 'currentMoneyBalance');
  const lifetimeEarnedMoney = readNonNegativeInteger(value, 'lifetimeEarnedMoney');
  const redeemableMoney = readNonNegativeInteger(value, 'redeemableMoney');
  const redeemableTossPoint = readNonNegativeInteger(value, 'redeemableTossPoint');
  const pendingTossPointAmount = readNonNegativeInteger(
    value,
    'pendingTossPointAmount',
  );
  const moneyUntilNextRedeem = readNonNegativeInteger(
    value,
    'moneyUntilNextRedeem',
  );
  const canRedeem = readBoolean(value, 'canRedeem');
  if (
    currentMoneyBalance == null ||
    lifetimeEarnedMoney == null ||
    redeemableMoney == null ||
    redeemableTossPoint == null ||
    pendingTossPointAmount == null ||
    moneyUntilNextRedeem == null ||
    canRedeem == null
  ) {
    return null;
  }

  return {
    currentMoneyBalance,
    lifetimeEarnedMoney,
    redeemableMoney,
    redeemableTossPoint,
    pendingTossPointAmount,
    moneyUntilNextRedeem,
    canRedeem,
  };
}

function decodeMissionSummary(value: unknown): BenefitMissionSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const missionKind = readMissionKind(value.missionKind);
  const missionDate = readDateString(value, 'missionDate');
  const completedAttempts = readNonNegativeInteger(value, 'completedAttempts');
  const rewardedAdUnlocks = readNonNegativeInteger(value, 'rewardedAdUnlocks');
  const nextAttemptSequence = readNullableNonNegativeInteger(
    value,
    'nextAttemptSequence',
  );
  const availability = decodeAvailability(value.availability);
  if (
    missionKind == null ||
    missionDate == null ||
    completedAttempts == null ||
    rewardedAdUnlocks == null ||
    nextAttemptSequence === undefined ||
    availability == null
  ) {
    return null;
  }

  return {
    missionKind,
    missionDate,
    completedAttempts,
    rewardedAdUnlocks,
    nextAttemptSequence,
    availability,
  };
}

function decodeAttendanceSummary(value: unknown): BenefitAttendanceSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const attendanceDate = readDateString(value, 'attendanceDate');
  const hasCheckedInToday = readBoolean(value, 'hasCheckedInToday');
  const consecutiveDays = readNonNegativeInteger(value, 'consecutiveDays');
  const nextConsecutiveDays = readNonNegativeInteger(value, 'nextConsecutiveDays');
  const requiresInterstitialForBonus = readBoolean(
    value,
    'requiresInterstitialForBonus',
  );
  const streakBonusAdShown = readBoolean(value, 'streakBonusAdShown');
  const streakBonusMoney = readNonNegativeInteger(value, 'streakBonusMoney');
  if (
    attendanceDate == null ||
    hasCheckedInToday == null ||
    consecutiveDays == null ||
    nextConsecutiveDays == null ||
    requiresInterstitialForBonus == null ||
    streakBonusAdShown == null ||
    streakBonusMoney == null
  ) {
    return null;
  }

  return {
    attendanceDate,
    hasCheckedInToday,
    consecutiveDays,
    nextConsecutiveDays,
    requiresInterstitialForBonus,
    streakBonusAdShown,
    streakBonusMoney,
  };
}

function decodeBenefitSummary(value: unknown): BenefitSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const summaryDate = readDateString(value, 'summaryDate');
  const wallet = isRecord(value.wallet) ? value.wallet : null;
  const pendingPayout = isRecord(value.pendingPayout) ? value.pendingPayout : null;
  const missions = isRecord(value.missions) ? value.missions : null;
  const walletBoard = decodeWalletBoardSummary(value.walletBoard);
  const attendance = decodeAttendanceSummary(value.attendance);
  const stockQuiz = decodeMissionSummary(missions?.stockQuiz);
  const pricePrediction = decodeMissionSummary(missions?.pricePrediction);

  if (
    summaryDate == null ||
    wallet == null ||
    pendingPayout == null ||
    walletBoard == null ||
    attendance == null ||
    stockQuiz == null ||
    pricePrediction == null
  ) {
    return null;
  }

  const moneyBalance = readNonNegativeInteger(wallet, 'moneyBalance');
  const lifetimeEarnedMoney = readNonNegativeInteger(
    wallet,
    'lifetimeEarnedMoney',
  );
  const tossPointAmount = readNonNegativeInteger(
    pendingPayout,
    'tossPointAmount',
  );
  const hasPendingPayout = readBoolean(pendingPayout, 'hasPendingPayout');
  if (
    moneyBalance == null ||
    lifetimeEarnedMoney == null ||
    tossPointAmount == null ||
    hasPendingPayout == null
  ) {
    return null;
  }

  return {
    summaryDate,
    wallet: {
      moneyBalance,
      lifetimeEarnedMoney,
    },
    pendingPayout: {
      tossPointAmount,
      hasPendingPayout,
    },
    walletBoard,
    attendance,
    missions: {
      stockQuiz,
      pricePrediction,
    },
  };
}

function decodeQuizChoice(value: unknown): BenefitQuizChoice | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const label = readString(value, 'label');
  if (id == null || label == null) {
    return null;
  }

  return { id, label };
}

function decodeQuizQuestion(value: unknown): BenefitQuizQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readUuid(value, 'id');
  const rawPhase = readString(value, 'phase');
  const phase = rawPhase == null ? null : readQuestionPhase(rawPhase);
  const category = readString(value, 'category');
  const difficulty = readString(value, 'difficulty');
  const questionType = readString(value, 'questionType');
  const question = readString(value, 'question');
  const choices = Array.isArray(value.choices)
    ? value.choices.map(decodeQuizChoice)
    : null;
  const topic = value.topic == null ? null : readString(value, 'topic');
  const hasInvalidTopic = value.topic != null && topic == null;
  if (
    id == null ||
    phase == null ||
    category == null ||
    difficulty == null ||
    questionType == null ||
    question == null ||
    choices == null ||
    choices.some((choice) => choice == null) ||
    hasInvalidTopic
  ) {
    return null;
  }

  return {
    id,
    phase,
    category,
    difficulty,
    questionType,
    question,
    choices: choices.filter((choice): choice is BenefitQuizChoice => choice != null),
    topic,
  };
}

function decodeQuizQuestionResponse(
  value: unknown,
): BenefitQuizQuestionResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const attemptDate = readDateString(value, 'attemptDate');
  const attemptSequence = readNullableNonNegativeInteger(value, 'attemptSequence');
  const availability = decodeAvailability(value.availability);
  const question =
    value.question == null ? null : decodeQuizQuestion(value.question);
  const reason = readQuestionUnavailableReason(value.reason);
  if (
    attemptDate == null ||
    attemptSequence === undefined ||
    availability == null ||
    (value.question != null && question == null)
  ) {
    return null;
  }

  return {
    attemptDate,
    attemptSequence,
    availability,
    question,
    reason,
  };
}

function decodePredictionQuestion(value: unknown): BenefitPredictionQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readUuid(value, 'id');
  const symbol = readString(value, 'symbol');
  const questionDate = readDateString(value, 'questionDate');
  const baseTradeDate = readDateString(value, 'baseTradeDate');
  const baseClose = readPositiveNumber(value, 'baseClose');
  if (
    id == null ||
    symbol == null ||
    questionDate == null ||
    baseTradeDate == null ||
    baseClose == null
  ) {
    return null;
  }

  return {
    id,
    symbol,
    questionDate,
    baseTradeDate,
    baseClose,
  };
}

function decodePredictionQuestionResponse(
  value: unknown,
): BenefitPredictionQuestionResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const attemptDate = readDateString(value, 'attemptDate');
  const attemptSequence = readNullableNonNegativeInteger(value, 'attemptSequence');
  const availability = decodeAvailability(value.availability);
  const question =
    value.question == null ? null : decodePredictionQuestion(value.question);
  const reason = readQuestionUnavailableReason(value.reason);
  if (
    attemptDate == null ||
    attemptSequence === undefined ||
    availability == null ||
    (value.question != null && question == null)
  ) {
    return null;
  }

  return {
    attemptDate,
    attemptSequence,
    availability,
    question,
    reason,
  };
}

function decodeAttendanceCheckInResult(
  value: unknown,
): BenefitAttendanceCheckInResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const attendanceDate = readDateString(value, 'attendanceDate');
  const consecutiveDays = readNonNegativeInteger(value, 'consecutiveDays');
  const baseMoneyGranted = readNonNegativeInteger(value, 'baseMoneyGranted');
  const streakBonusMoneyGranted = readNonNegativeInteger(
    value,
    'streakBonusMoneyGranted',
  );
  const requiresInterstitialForBonus = readBoolean(
    value,
    'requiresInterstitialForBonus',
  );
  const moneyBalance = readNonNegativeInteger(value, 'moneyBalance');
  const lifetimeEarnedMoney = readNonNegativeInteger(
    value,
    'lifetimeEarnedMoney',
  );
  if (
    attendanceDate == null ||
    consecutiveDays == null ||
    baseMoneyGranted == null ||
    streakBonusMoneyGranted == null ||
    requiresInterstitialForBonus == null ||
    moneyBalance == null ||
    lifetimeEarnedMoney == null
  ) {
    return null;
  }

  return {
    attendanceDate,
    consecutiveDays,
    baseMoneyGranted,
    streakBonusMoneyGranted,
    requiresInterstitialForBonus,
    moneyBalance,
    lifetimeEarnedMoney,
  };
}

function decodeAdUnlockResult(value: unknown): BenefitAdUnlockResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const canGrant = readBoolean(value, 'canGrant');
  const reason = readAdUnlockReason(value.reason);
  const completedAttempts = readNonNegativeInteger(value, 'completedAttempts');
  const rewardedAdUnlocks = readNonNegativeInteger(value, 'rewardedAdUnlocks');
  if (
    canGrant == null ||
    reason == null ||
    completedAttempts == null ||
    rewardedAdUnlocks == null
  ) {
    return null;
  }

  return {
    canGrant,
    reason,
    completedAttempts,
    rewardedAdUnlocks,
  };
}

function decodeQuizAttemptResult(value: unknown): BenefitQuizAttemptResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const alreadyProcessed = readBoolean(value, 'alreadyProcessed');
  const attemptId = readUuid(value, 'attemptId');
  const isCorrect = readBoolean(value, 'isCorrect');
  const rewardMoney = readNonNegativeInteger(value, 'rewardMoney');
  const completedAttempts = readNonNegativeInteger(value, 'completedAttempts');
  const moneyBalance = readNonNegativeInteger(value, 'moneyBalance');
  if (
    alreadyProcessed == null ||
    attemptId == null ||
    isCorrect == null ||
    rewardMoney == null ||
    completedAttempts == null ||
    moneyBalance == null
  ) {
    return null;
  }

  return {
    alreadyProcessed,
    attemptId,
    isCorrect,
    rewardMoney,
    completedAttempts,
    moneyBalance,
  };
}

function decodePredictionAttemptResult(
  value: unknown,
): BenefitPredictionAttemptResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const alreadyProcessed = readBoolean(value, 'alreadyProcessed');
  const attemptId = readUuid(value, 'attemptId');
  const isCorrect =
    value.isCorrect == null ? null : readBoolean(value, 'isCorrect');
  const rewardMoney = readNonNegativeInteger(value, 'rewardMoney');
  const completedAttempts = readNonNegativeInteger(value, 'completedAttempts');
  const moneyBalance = readNonNegativeInteger(value, 'moneyBalance');
  if (
    alreadyProcessed == null ||
    attemptId == null ||
    isCorrect === undefined ||
    rewardMoney == null ||
    completedAttempts == null ||
    moneyBalance == null
  ) {
    return null;
  }

  return {
    alreadyProcessed,
    attemptId,
    isCorrect,
    rewardMoney,
    completedAttempts,
    moneyBalance,
  };
}

function decodeTossPointRedeemResult(
  value: unknown,
  envelope: BenefitApiSuccessEnvelope,
): BenefitTossPointRedeemResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const alreadyProcessed = readBoolean(value, 'alreadyProcessed');
  const payoutId = readUuid(value, 'payoutId');
  const status = readString(value, 'status');
  const redeemedMoney = readNonNegativeInteger(value, 'redeemedMoney');
  const tossPointAmount = readNonNegativeInteger(value, 'tossPointAmount');
  const moneyBalance = readNonNegativeInteger(value, 'moneyBalance');
  if (
    alreadyProcessed == null ||
    payoutId == null ||
    status == null ||
    redeemedMoney == null ||
    tossPointAmount == null ||
    moneyBalance == null
  ) {
    return null;
  }

  return {
    alreadyProcessed,
    payoutId,
    status,
    redeemedMoney,
    tossPointAmount,
    moneyBalance,
    isS2sMocked: envelope.s2sMocked === true,
  };
}

function stripUndefinedValues(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function readAdUnlockRoute(missionKind: MissionKind): BenefitRoute {
  return missionKind === 'stock_quiz'
    ? QUIZ_AD_UNLOCK_ROUTE
    : PREDICTION_AD_UNLOCK_ROUTE;
}

export function loadBenefitSummary(
  request: BenefitSummaryRequest = {},
): Promise<ServiceResult<BenefitSummary | null>> {
  return postBenefitRequest({
    route: SUMMARY_ROUTE,
    body: stripUndefinedValues({ summaryDate: request.summaryDate }),
    fallback: null,
    decode: decodeBenefitSummary,
  });
}

export function loadBenefitQuizQuestion(
  request: BenefitQuestionRequest = {},
): Promise<ServiceResult<BenefitQuizQuestionResponse | null>> {
  return postBenefitRequest({
    route: QUIZ_QUESTION_ROUTE,
    body: stripUndefinedValues({ attemptDate: request.attemptDate }),
    fallback: null,
    decode: decodeQuizQuestionResponse,
  });
}

export function loadBenefitPredictionQuestion(
  request: BenefitQuestionRequest = {},
): Promise<ServiceResult<BenefitPredictionQuestionResponse | null>> {
  return postBenefitRequest({
    route: PREDICTION_QUESTION_ROUTE,
    body: stripUndefinedValues({ attemptDate: request.attemptDate }),
    fallback: null,
    decode: decodePredictionQuestionResponse,
  });
}

export function checkInBenefitAttendance(
  request: BenefitAttendanceCheckInRequest = {},
): Promise<ServiceResult<BenefitAttendanceCheckInResult | null>> {
  return postBenefitRequest({
    route: ATTENDANCE_CHECK_IN_ROUTE,
    body: stripUndefinedValues({
      attendanceDate: request.attendanceDate,
      hasWatchedInterstitialForStreakBonus:
        request.hasWatchedInterstitialForStreakBonus,
    }),
    fallback: null,
    decode: decodeAttendanceCheckInResult,
  });
}

export function unlockBenefitMissionAd(
  request: BenefitAdUnlockRequest,
): Promise<ServiceResult<BenefitAdUnlockResult | null>> {
  return postBenefitRequest({
    route: readAdUnlockRoute(request.missionKind),
    body: stripUndefinedValues({ missionDate: request.missionDate }),
    fallback: null,
    decode: decodeAdUnlockResult,
  });
}

export function submitBenefitQuizAttempt(
  request: BenefitQuizAttemptRequest,
): Promise<ServiceResult<BenefitQuizAttemptResult | null>> {
  return postBenefitRequest({
    route: QUIZ_ATTEMPT_ROUTE,
    body: stripUndefinedValues({
      questionId: request.questionId,
      attemptDate: request.attemptDate,
      attemptSequence: request.attemptSequence,
      idempotencyKey: request.idempotencyKey,
      selectedChoiceId: request.selectedChoiceId,
    }),
    fallback: null,
    decode: decodeQuizAttemptResult,
  });
}

export function submitBenefitPredictionAttempt(
  request: BenefitPredictionAttemptRequest,
): Promise<ServiceResult<BenefitPredictionAttemptResult | null>> {
  return postBenefitRequest({
    route: PREDICTION_ATTEMPT_ROUTE,
    body: stripUndefinedValues({
      questionId: request.questionId,
      attemptDate: request.attemptDate,
      attemptSequence: request.attemptSequence,
      idempotencyKey: request.idempotencyKey,
      selectedDirection: request.selectedDirection,
    }),
    fallback: null,
    decode: decodePredictionAttemptResult,
  });
}

export function redeemBenefitTossPoint(
  request: BenefitTossPointRedeemRequest,
): Promise<ServiceResult<BenefitTossPointRedeemResult | null>> {
  return postBenefitRequest({
    route: TOSS_POINT_REDEEM_ROUTE,
    body: { redeemRequestId: request.redeemRequestId },
    fallback: null,
    decode: decodeTossPointRedeemResult,
  });
}
