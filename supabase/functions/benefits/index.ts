import { serve } from "std/http/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCorsHeaders, getJsonCorsHeaders } from "../_shared/cors.ts";
import {
  ATTENDANCE_STREAK_BONUS_INTERVAL_DAYS,
  redeemTossPoints,
  resolveBenefitWalletBoardSummary,
  resolveDailyAttemptAvailability,
  selectNextQuizQuestion,
  type DailyAttemptState,
  type MissionKind,
  type QuestionPhase,
  type QuizQuestionSnapshot,
  type UserQuestionAttemptSnapshot,
} from "../../../services/benefits/benefitRewardPolicy.ts";

type JsonObject = Record<string, unknown>;

interface AuthenticatedRequestContext {
  readonly adminClient: SupabaseClient;
  readonly userId: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOSS_BENEFIT_PROMOTION_CODE =
  Deno.env.get("TOSS_BENEFIT_PROMOTION_CODE") ?? "MOCK_BENEFIT_PROMOTION_CODE";
const RAILWAY_BFF_URL = Deno.env.get("RAILWAY_BFF_URL")?.trim() ?? "";
const BENEFIT_BFF_INTERNAL_SECRET =
  Deno.env.get("BENEFIT_BFF_INTERNAL_SECRET")?.trim() ?? "";

const MISSION_KINDS = new Set<MissionKind>([
  "price_prediction",
  "stock_quiz",
]);
const QUESTION_PHASES = new Set<QuestionPhase>([
  "phase_1_core",
  "phase_2_market",
  "phase_3_current",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const QUIZ_QUESTION_QUERY_LIMIT = 500;
const QUIZ_ATTEMPT_HISTORY_LIMIT = 1_000;
const BENEFIT_BFF_PROMOTION_TIMEOUT_MS = 15_000;
const BENEFIT_BFF_PROMOTION_PATH = "/benefits/toss-point/execute-promotion";

interface BenefitWalletRow {
  readonly money_balance: number;
  readonly lifetime_earned_money: number;
}

interface BenefitPayoutRow {
  readonly toss_point_amount: number;
}

interface BenefitAttendanceRow {
  readonly consecutive_days: number;
  readonly streak_bonus_money?: number;
  readonly streak_bonus_ad_shown?: boolean;
}

interface BenefitQuizQuestionRow {
  readonly id: string;
  readonly phase: string;
  readonly category: string;
  readonly difficulty: string;
  readonly question_type: string;
  readonly question: string;
  readonly choices: unknown;
  readonly topic: string | null;
  readonly is_active: boolean;
  readonly total_attempts: number;
  readonly correct_attempts: number;
}

interface BenefitQuizAttemptRow {
  readonly question_id: string;
  readonly answered_at: string;
}

interface BenefitPredictionQuestionRow {
  readonly id: string;
  readonly symbol: string;
  readonly question_date: string;
  readonly base_trade_date: string;
  readonly base_close: number | string;
}

interface BenefitPredictionAccuracySummaryRow {
  readonly result_trade_date: string;
  readonly correct_attempts: number;
  readonly settled_attempts: number;
  readonly accuracy_rate: number | string;
}

interface BenefitRedeemRpcResult {
  readonly payoutId: string;
  readonly status?: string;
  readonly tossPointAmount?: number;
  readonly moneyBalance?: number;
}

interface QuizChoice {
  readonly id: string;
  readonly label: string;
}

function jsonResponse(
  req: Request,
  status: number,
  body: JsonObject,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: getJsonCorsHeaders(req, {
      allowHeaders: "Content-Type, Authorization, apikey",
    }),
  });
}

function assertRequiredEnv(): void {
  if (
    SUPABASE_URL.trim() === "" ||
    SUPABASE_ANON_KEY.trim() === "" ||
    SUPABASE_SERVICE_ROLE_KEY.trim() === ""
  ) {
    throw new Error("supabase_env_missing");
  }
}

function getKstDateString(date = new Date()): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function isJsonObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isQuestionPhase(value: string): value is QuestionPhase {
  return QUESTION_PHASES.has(value as QuestionPhase);
}

function normalizeStockSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${fieldName}_must_be_non_negative_integer`);
  }

  return value as number;
}

function readPositiveNumber(value: unknown, fieldName: string): number {
  const parsedValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${fieldName}_must_be_positive_number`);
  }

  return parsedValue;
}

function readQuizChoices(value: unknown): readonly QuizChoice[] {
  if (!Array.isArray(value)) {
    throw new Error("quiz_question_choices_invalid");
  }

  return value.map((choice) => {
    if (!isJsonObject(choice)) {
      throw new Error("quiz_question_choices_invalid");
    }

    const id = choice.id;
    const label = choice.label;
    if (typeof id !== "string" || typeof label !== "string") {
      throw new Error("quiz_question_choices_invalid");
    }

    return {
      id,
      label,
    };
  });
}

function resolveNextAttemptSequence(state: DailyAttemptState): number | null {
  const availability = resolveDailyAttemptAvailability(state);
  if (!availability.canStartAttempt) {
    return null;
  }

  return state.completedAttempts + 1;
}

function isStreakBonusDue(consecutiveDays: number): boolean {
  return (
    consecutiveDays > 0 &&
    consecutiveDays % ATTENDANCE_STREAK_BONUS_INTERVAL_DAYS === 0
  );
}

async function readBody(req: Request): Promise<JsonObject> {
  const body = await req.json().catch(() => ({}));
  if (!isJsonObject(body)) {
    throw new Error("request_body_must_be_json_object");
  }

  return body;
}

function readRequiredString(
  body: JsonObject,
  key: string,
): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key}_required`);
  }

  return value.trim();
}

function readStringField(record: JsonObject, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key}_required`);
  }

  return value.trim();
}

function readOptionalIntegerField(
  record: JsonObject,
  key: string,
): number | undefined {
  const value = record[key];
  if (value == null) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${key}_must_be_integer`);
  }

  return value as number;
}

function readOptionalDateString(
  body: JsonObject,
  key: string,
): string {
  const value = body[key];
  if (value == null) {
    return getKstDateString();
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key}_must_be_yyyy_mm_dd`);
  }

  return value;
}

function readRequiredUuid(body: JsonObject, key: string): string {
  const value = readRequiredString(body, key);
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${key}_must_be_uuid`);
  }

  return value;
}

function readRequiredInteger(body: JsonObject, key: string): number {
  const value = body[key];
  if (!Number.isInteger(value)) {
    throw new Error(`${key}_must_be_integer`);
  }

  return value as number;
}

function readBoolean(body: JsonObject, key: string): boolean {
  const value = body[key];
  if (value == null) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${key}_must_be_boolean`);
  }

  return value;
}

function readMissionKind(body: JsonObject): MissionKind {
  const value = readRequiredString(body, "missionKind");
  if (!MISSION_KINDS.has(value as MissionKind)) {
    throw new Error("missionKind_invalid");
  }

  return value as MissionKind;
}

function normalizeRoutePath(req: Request): string {
  const pathName = new URL(req.url).pathname;
  const marker = "/benefits";
  const markerIndex = pathName.indexOf(marker);
  if (markerIndex < 0) {
    return "/";
  }

  return pathName.slice(markerIndex + marker.length) || "/";
}

function parseRedeemRpcResult(data: unknown): BenefitRedeemRpcResult {
  if (!isJsonObject(data)) {
    throw new Error("redeem_rpc_result_invalid");
  }

  const status = data.status;
  if (status != null && typeof status !== "string") {
    throw new Error("redeem_status_invalid");
  }

  return {
    payoutId: readStringField(data, "payoutId"),
    status: typeof status === "string" ? status : undefined,
    tossPointAmount: readOptionalIntegerField(data, "tossPointAmount"),
    moneyBalance: readOptionalIntegerField(data, "moneyBalance"),
  };
}

function resolveBenefitBffPromotionUrl(): string | null {
  if (
    RAILWAY_BFF_URL.trim() === "" ||
    BENEFIT_BFF_INTERNAL_SECRET.trim() === ""
  ) {
    return null;
  }

  return `${RAILWAY_BFF_URL.replace(/\/+$/, "")}${BENEFIT_BFF_PROMOTION_PATH}`;
}

async function executePromotionViaBff(
  req: Request,
  context: AuthenticatedRequestContext,
  redeemRequestId: string,
  redeemResult: BenefitRedeemRpcResult,
): Promise<JsonObject> {
  const promotionUrl = resolveBenefitBffPromotionUrl();
  if (promotionUrl == null) {
    return {
      success: false,
      status: "pending",
      reason: "benefit_bff_env_missing",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, BENEFIT_BFF_PROMOTION_TIMEOUT_MS);

  try {
    const correlationId =
      req.headers.get("x-correlation-id") ?? crypto.randomUUID();
    const response = await fetch(promotionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BENEFIT_BFF_INTERNAL_SECRET}`,
        "X-Correlation-ID": correlationId,
      },
      body: JSON.stringify({
        userId: context.userId,
        redeemRequestId,
        payoutId: redeemResult.payoutId,
      }),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!isJsonObject(responseBody)) {
      return {
        success: false,
        status: "pending",
        reason: "benefit_bff_response_invalid",
        httpStatus: response.status,
      };
    }

    return {
      ...responseBody,
      httpStatus: response.status,
      success: response.ok && responseBody.success === true,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "benefit_bff_request_failed";
    return {
      success: false,
      status: "pending",
      reason: "benefit_bff_request_failed",
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authenticateRequest(
  req: Request,
): Promise<AuthenticatedRequestContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(req, 401, { error: "authentication_required" });
  }

  assertRequiredEnv();

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error != null || user == null) {
    return jsonResponse(req, 401, { error: "invalid_auth_token" });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    adminClient,
    userId: user.id,
  };
}

async function readDailyAttemptState(
  adminClient: SupabaseClient,
  userId: string,
  missionKind: MissionKind,
  missionDate: string,
): Promise<DailyAttemptState> {
  const { data, error } = await adminClient
    .from("benefit_mission_daily_states")
    .select("completed_attempts, rewarded_ad_unlocks")
    .eq("user_id", userId)
    .eq("mission_kind", missionKind)
    .eq("mission_date", missionDate)
    .maybeSingle();

  if (error != null) {
    throw new Error(`daily_state_read_failed:${error.message}`);
  }

  return {
    completedAttempts: data?.completed_attempts ?? 0,
    rewardedAdUnlocks: data?.rewarded_ad_unlocks ?? 0,
  };
}

async function readMissionSummary(
  adminClient: SupabaseClient,
  userId: string,
  missionKind: MissionKind,
  missionDate: string,
): Promise<JsonObject> {
  const state = await readDailyAttemptState(
    adminClient,
    userId,
    missionKind,
    missionDate,
  );
  const availability = resolveDailyAttemptAvailability(state);

  return {
    missionKind,
    missionDate,
    completedAttempts: state.completedAttempts,
    rewardedAdUnlocks: state.rewardedAdUnlocks,
    nextAttemptSequence: resolveNextAttemptSequence(state),
    availability,
  };
}

async function readPendingTossPointAmount(
  adminClient: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await adminClient
    .from("benefit_toss_point_payouts")
    .select("toss_point_amount")
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error != null) {
    throw new Error(`pending_payout_read_failed:${error.message}`);
  }

  const payoutRows = (data ?? []) as readonly BenefitPayoutRow[];
  return payoutRows.reduce((total, row) => {
    const tossPointAmount = readNonNegativeInteger(
      row.toss_point_amount,
      "tossPointAmount",
    );
    return total + tossPointAmount;
  }, 0);
}

async function readAttendanceSummary(
  adminClient: SupabaseClient,
  userId: string,
  attendanceDate: string,
): Promise<JsonObject> {
  const { data: todayAttendance, error: todayError } = await adminClient
    .from("benefit_attendance")
    .select("consecutive_days, streak_bonus_money, streak_bonus_ad_shown")
    .eq("user_id", userId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();

  if (todayError != null) {
    throw new Error(`attendance_read_failed:${todayError.message}`);
  }

  const todayRow = todayAttendance as BenefitAttendanceRow | null;
  if (todayRow != null) {
    const consecutiveDays = readNonNegativeInteger(
      todayRow.consecutive_days,
      "consecutiveDays",
    );
    const streakBonusMoney = readNonNegativeInteger(
      todayRow.streak_bonus_money ?? 0,
      "streakBonusMoney",
    );

    return {
      attendanceDate,
      hasCheckedInToday: true,
      consecutiveDays,
      nextConsecutiveDays: consecutiveDays,
      requiresInterstitialForBonus:
        isStreakBonusDue(consecutiveDays) && streakBonusMoney === 0,
      streakBonusAdShown: todayRow.streak_bonus_ad_shown ?? false,
      streakBonusMoney,
    };
  }

  const previousDate = new Date(
    new Date(`${attendanceDate}T00:00:00.000Z`).getTime() - MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  const { data: previousAttendance, error: previousError } = await adminClient
    .from("benefit_attendance")
    .select("consecutive_days")
    .eq("user_id", userId)
    .eq("attendance_date", previousDate)
    .maybeSingle();

  if (previousError != null) {
    throw new Error(`previous_attendance_read_failed:${previousError.message}`);
  }

  const previousRow = previousAttendance as BenefitAttendanceRow | null;
  const previousConsecutiveDays = readNonNegativeInteger(
    previousRow?.consecutive_days ?? 0,
    "previousConsecutiveDays",
  );
  const nextConsecutiveDays = previousConsecutiveDays + 1;

  return {
    attendanceDate,
    hasCheckedInToday: false,
    consecutiveDays: 0,
    nextConsecutiveDays,
    requiresInterstitialForBonus: isStreakBonusDue(nextConsecutiveDays),
    streakBonusAdShown: false,
    streakBonusMoney: 0,
  };
}

function formatPredictionAccuracySummary(
  row: BenefitPredictionAccuracySummaryRow | null,
): JsonObject | null {
  if (row == null) {
    return null;
  }

  const settledAttempts = readNonNegativeInteger(
    row.settled_attempts,
    "settledAttempts",
  );
  if (settledAttempts <= 0) {
    return null;
  }

  const accuracyRate = Number.parseFloat(String(row.accuracy_rate));
  if (!Number.isFinite(accuracyRate) || accuracyRate < 0 || accuracyRate > 1) {
    throw new Error("prediction_accuracy_rate_invalid");
  }

  const correctAttempts = readNonNegativeInteger(
    row.correct_attempts,
    "correctAttempts",
  );
  if (correctAttempts > settledAttempts) {
    throw new Error("prediction_accuracy_attempt_count_invalid");
  }

  return {
    resultTradeDate: row.result_trade_date,
    correctAttempts,
    settledAttempts,
    accuracyRate,
  };
}

async function readPredictionAccuracySummary(
  adminClient: SupabaseClient,
  userId: string,
): Promise<JsonObject | null> {
  const { data, error } = await adminClient
    .from("benefit_prediction_accuracy_summaries")
    .select("result_trade_date, correct_attempts, settled_attempts, accuracy_rate")
    .eq("user_id", userId)
    .maybeSingle();

  if (error != null) {
    throw new Error(`prediction_accuracy_summary_read_failed:${error.message}`);
  }

  return formatPredictionAccuracySummary(
    data as BenefitPredictionAccuracySummaryRow | null,
  );
}

async function handleSummary(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const summaryDate = readOptionalDateString(body, "summaryDate");

  const { data: wallet, error: walletError } = await context.adminClient
    .from("benefit_wallets")
    .select("money_balance, lifetime_earned_money")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (walletError != null) {
    throw new Error(`wallet_read_failed:${walletError.message}`);
  }

  const walletRow = wallet as BenefitWalletRow | null;
  const currentMoneyBalance = readNonNegativeInteger(
    walletRow?.money_balance ?? 0,
    "currentMoneyBalance",
  );
  const lifetimeEarnedMoney = readNonNegativeInteger(
    walletRow?.lifetime_earned_money ?? 0,
    "lifetimeEarnedMoney",
  );
  const pendingTossPointAmount = await readPendingTossPointAmount(
    context.adminClient,
    context.userId,
  );
  const walletBoard = resolveBenefitWalletBoardSummary({
    currentMoneyBalance,
    lifetimeEarnedMoney,
    pendingTossPointAmount,
  });

  const [
    attendance,
    quizMission,
    predictionMission,
    predictionAccuracy,
  ] = await Promise.all([
    readAttendanceSummary(context.adminClient, context.userId, summaryDate),
    readMissionSummary(
      context.adminClient,
      context.userId,
      "stock_quiz",
      summaryDate,
    ),
    readMissionSummary(
      context.adminClient,
      context.userId,
      "price_prediction",
      summaryDate,
    ),
    readPredictionAccuracySummary(context.adminClient, context.userId),
  ]);

  return jsonResponse(req, 200, {
    success: true,
    data: {
      summaryDate,
      wallet: {
        moneyBalance: currentMoneyBalance,
        lifetimeEarnedMoney,
      },
      pendingPayout: {
        tossPointAmount: pendingTossPointAmount,
        hasPendingPayout: pendingTossPointAmount > 0,
      },
      walletBoard,
      attendance,
      missions: {
        stockQuiz: quizMission,
        pricePrediction: predictionMission,
      },
      predictionAccuracy,
    },
  });
}

function toQuizQuestionSnapshot(
  row: BenefitQuizQuestionRow,
): QuizQuestionSnapshot | null {
  if (!isQuestionPhase(row.phase)) {
    return null;
  }

  return {
    id: row.id,
    phase: row.phase,
    category: row.category,
    isActive: row.is_active,
    totalAttempts: readNonNegativeInteger(row.total_attempts, "totalAttempts"),
    correctAttempts: readNonNegativeInteger(
      row.correct_attempts,
      "correctAttempts",
    ),
  };
}

function formatQuizQuestion(row: BenefitQuizQuestionRow): JsonObject {
  return {
    id: row.id,
    phase: row.phase,
    category: row.category,
    difficulty: row.difficulty,
    questionType: row.question_type,
    question: row.question,
    choices: readQuizChoices(row.choices),
    topic: row.topic,
  };
}

async function readQuizAttemptSnapshots(
  adminClient: SupabaseClient,
  userId: string,
): Promise<readonly UserQuestionAttemptSnapshot[]> {
  const { data, error } = await adminClient
    .from("benefit_quiz_attempts")
    .select("question_id, answered_at")
    .eq("user_id", userId)
    .order("answered_at", { ascending: false })
    .limit(QUIZ_ATTEMPT_HISTORY_LIMIT);

  if (error != null) {
    throw new Error(`quiz_attempt_history_read_failed:${error.message}`);
  }

  const attemptRows = (data ?? []) as readonly BenefitQuizAttemptRow[];
  return attemptRows.map((row) => ({
    questionId: row.question_id,
    answeredAt: row.answered_at,
  }));
}

async function handleQuizQuestion(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const attemptDate = readOptionalDateString(body, "attemptDate");
  const missionState = await readDailyAttemptState(
    context.adminClient,
    context.userId,
    "stock_quiz",
    attemptDate,
  );
  const availability = resolveDailyAttemptAvailability(missionState);
  if (!availability.canStartAttempt) {
    return jsonResponse(req, 200, {
      success: true,
      data: {
        attemptDate,
        attemptSequence: null,
        availability,
        question: null,
        reason: "no_unlocked_attempt_available",
      },
    });
  }

  const { data, error } = await context.adminClient
    .from("benefit_quiz_questions")
    .select(
      "id, phase, category, difficulty, question_type, question, choices, topic, is_active, total_attempts, correct_attempts",
    )
    .eq("is_active", true)
    .eq("review_status", "approved")
    .order("phase", { ascending: true })
    .order("id", { ascending: true })
    .limit(QUIZ_QUESTION_QUERY_LIMIT);

  if (error != null) {
    throw new Error(`quiz_question_read_failed:${error.message}`);
  }

  const questionRows = (data ?? []) as readonly BenefitQuizQuestionRow[];
  const questionSnapshots = questionRows
    .map(toQuizQuestionSnapshot)
    .filter((question): question is QuizQuestionSnapshot => question != null);
  const selectedQuestion = selectNextQuizQuestion({
    questions: questionSnapshots,
    userAttempts: await readQuizAttemptSnapshots(
      context.adminClient,
      context.userId,
    ),
    nowIso: new Date().toISOString(),
  });

  if (selectedQuestion == null) {
    return jsonResponse(req, 200, {
      success: true,
      data: {
        attemptDate,
        attemptSequence: resolveNextAttemptSequence(missionState),
        availability,
        question: null,
        reason: "quiz_question_not_ready",
      },
    });
  }

  const selectedRow = questionRows.find((row) => row.id === selectedQuestion.id);
  if (selectedRow == null) {
    throw new Error("selected_quiz_question_missing");
  }

  return jsonResponse(req, 200, {
    success: true,
    data: {
      attemptDate,
      attemptSequence: resolveNextAttemptSequence(missionState),
      availability,
      question: formatQuizQuestion(selectedRow),
    },
  });
}

function formatPredictionQuestion(
  row: BenefitPredictionQuestionRow,
): JsonObject {
  return {
    id: row.id,
    symbol: normalizeStockSymbol(row.symbol),
    questionDate: row.question_date,
    baseTradeDate: row.base_trade_date,
    baseClose: readPositiveNumber(row.base_close, "baseClose"),
  };
}

async function handlePredictionQuestion(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const attemptDate = readOptionalDateString(body, "attemptDate");
  const missionState = await readDailyAttemptState(
    context.adminClient,
    context.userId,
    "price_prediction",
    attemptDate,
  );
  const availability = resolveDailyAttemptAvailability(missionState);
  if (!availability.canStartAttempt) {
    return jsonResponse(req, 200, {
      success: true,
      data: {
        attemptDate,
        attemptSequence: null,
        availability,
        question: null,
        reason: "no_unlocked_attempt_available",
      },
    });
  }

  const attemptSequence = resolveNextAttemptSequence(missionState);
  if (attemptSequence == null) {
    return jsonResponse(req, 200, {
      success: true,
      data: {
        attemptDate,
        attemptSequence: null,
        availability,
        question: null,
        reason: "no_unlocked_attempt_available",
      },
    });
  }

  const { data, error } = await context.adminClient.rpc(
    "select_benefit_prediction_question",
    {
      p_user_id: context.userId,
      p_attempt_date: attemptDate,
      p_attempt_sequence: attemptSequence,
    },
  );

  if (error != null) {
    throw new Error(`prediction_question_select_failed:${error.message}`);
  }

  const questionRows = (data ?? []) as readonly BenefitPredictionQuestionRow[];
  const selectedQuestion = questionRows[0] ?? null;
  if (selectedQuestion == null) {
    return jsonResponse(req, 200, {
      success: true,
      data: {
        attemptDate,
        attemptSequence,
        availability,
        question: null,
        reason: "prediction_question_not_ready",
      },
    });
  }

  return jsonResponse(req, 200, {
    success: true,
    data: {
      attemptDate,
      attemptSequence,
      availability,
      question: formatPredictionQuestion(selectedQuestion),
    },
  });
}

async function handleAttendance(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const attendanceDate = readOptionalDateString(body, "attendanceDate");
  const hasWatchedInterstitialForStreakBonus = readBoolean(
    body,
    "hasWatchedInterstitialForStreakBonus",
  );

  const { data, error } = await context.adminClient.rpc(
    "attend_and_claim_reward",
    {
      p_user_id: context.userId,
      p_attendance_date: attendanceDate,
      p_has_watched_interstitial_for_streak_bonus:
        hasWatchedInterstitialForStreakBonus,
    },
  );

  if (error != null) {
    throw new Error(`attendance_rpc_failed:${error.message}`);
  }

  return jsonResponse(req, 200, { success: true, data });
}

async function handleAdUnlock(
  req: Request,
  context: AuthenticatedRequestContext,
  routeMissionKind?: MissionKind,
): Promise<Response> {
  const body = await readBody(req);
  const missionKind = routeMissionKind ?? readMissionKind(body);
  const missionDate = readOptionalDateString(body, "missionDate");
  const idempotencyKey = readRequiredString(body, "idempotencyKey");

  const { data, error } = await context.adminClient.rpc(
    "unlock_benefit_mission_ad",
    {
      p_user_id: context.userId,
      p_mission_kind: missionKind,
      p_mission_date: missionDate,
      p_idempotency_key: idempotencyKey,
    },
  );

  if (error != null) {
    throw new Error(`ad_unlock_rpc_failed:${error.message}`);
  }

  return jsonResponse(req, 200, { success: true, data });
}

async function assertCanStartAttempt(
  adminClient: SupabaseClient,
  userId: string,
  missionKind: MissionKind,
  attemptDate: string,
): Promise<void> {
  const currentState = await readDailyAttemptState(
    adminClient,
    userId,
    missionKind,
    attemptDate,
  );
  const availability = resolveDailyAttemptAvailability(currentState);
  if (!availability.canStartAttempt) {
    throw new Error("no_unlocked_attempt_available");
  }
}

async function handleQuizAttempt(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const questionId = readRequiredUuid(body, "questionId");
  const attemptDate = readOptionalDateString(body, "attemptDate");
  const attemptSequence = readRequiredInteger(body, "attemptSequence");
  if (attemptSequence < 1 || attemptSequence > 5) {
    throw new Error("attemptSequence_must_be_between_1_and_5");
  }

  const idempotencyKey = readRequiredString(body, "idempotencyKey");
  const selectedChoiceId = readRequiredString(body, "selectedChoiceId");

  await assertCanStartAttempt(
    context.adminClient,
    context.userId,
    "stock_quiz",
    attemptDate,
  );

  const { data, error } = await context.adminClient.rpc(
    "submit_quiz_and_claim_reward",
    {
      p_user_id: context.userId,
      p_question_id: questionId,
      p_attempt_date: attemptDate,
      p_attempt_sequence: attemptSequence,
      p_idempotency_key: idempotencyKey,
      p_selected_choice_id: selectedChoiceId,
    },
  );

  if (error != null) {
    throw new Error(`quiz_attempt_rpc_failed:${error.message}`);
  }

  return jsonResponse(req, 200, { success: true, data });
}

async function handlePredictionAttempt(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const questionId = readRequiredUuid(body, "questionId");
  const attemptDate = readOptionalDateString(body, "attemptDate");
  const attemptSequence = readRequiredInteger(body, "attemptSequence");
  if (attemptSequence < 1 || attemptSequence > 5) {
    throw new Error("attemptSequence_must_be_between_1_and_5");
  }

  const idempotencyKey = readRequiredString(body, "idempotencyKey");
  const selectedDirection = readRequiredString(body, "selectedDirection");

  if (selectedDirection !== "up" && selectedDirection !== "down") {
    throw new Error("selectedDirection_invalid");
  }

  await assertCanStartAttempt(
    context.adminClient,
    context.userId,
    "price_prediction",
    attemptDate,
  );

  const { data, error } = await context.adminClient.rpc(
    "submit_prediction_and_claim_reward",
    {
      p_user_id: context.userId,
      p_question_id: questionId,
      p_attempt_date: attemptDate,
      p_attempt_sequence: attemptSequence,
      p_idempotency_key: idempotencyKey,
      p_selected_direction: selectedDirection,
    },
  );

  if (error != null) {
    throw new Error(`prediction_attempt_rpc_failed:${error.message}`);
  }

  return jsonResponse(req, 200, { success: true, data });
}

async function handleTossPointRedeem(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const body = await readBody(req);
  const redeemRequestId = readRequiredString(body, "redeemRequestId");

  const { data: wallet, error: walletError } = await context.adminClient
    .from("benefit_wallets")
    .select("money_balance")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (walletError != null) {
    throw new Error(`wallet_read_failed:${walletError.message}`);
  }

  const redemption = redeemTossPoints({
    currentMoneyBalance: wallet?.money_balance ?? 0,
  });

  if (!redemption.canRequestPromotionReward) {
    return jsonResponse(req, 409, {
      success: false,
      reason: "not_enough_money_to_redeem",
    });
  }

  const { data, error } = await context.adminClient.rpc(
    "lock_and_create_pending_toss_redeem",
    {
      p_user_id: context.userId,
      p_redeem_request_id: redeemRequestId,
      p_promotion_code: TOSS_BENEFIT_PROMOTION_CODE,
    },
  );

  if (error != null) {
    throw new Error(`toss_redeem_rpc_failed:${error.message}`);
  }

  const redeemResult = parseRedeemRpcResult(data);
  const bffExecution = await executePromotionViaBff(
    req,
    context,
    redeemRequestId,
    redeemResult,
  );
  const hasExecutedPromotion = bffExecution.success === true;

  return jsonResponse(req, hasExecutedPromotion ? 200 : 202, {
    success: true,
    data,
    bffExecution,
    s2sMocked: false,
  });
}

async function routeRequest(
  req: Request,
  context: AuthenticatedRequestContext,
): Promise<Response> {
  const routePath = normalizeRoutePath(req);

  switch (routePath) {
    case "/summary":
      return await handleSummary(req, context);
    case "/attendance/check-in":
      return await handleAttendance(req, context);
    case "/quiz/question":
      return await handleQuizQuestion(req, context);
    case "/quiz/attempt":
      return await handleQuizAttempt(req, context);
    case "/quiz/ad-unlock":
      return await handleAdUnlock(req, context, "stock_quiz");
    case "/prediction/question":
      return await handlePredictionQuestion(req, context);
    case "/prediction/attempt":
      return await handlePredictionAttempt(req, context);
    case "/prediction/ad-unlock":
      return await handleAdUnlock(req, context, "price_prediction");
    case "/ad-unlock":
      return await handleAdUnlock(req, context);
    case "/toss-point/redeem":
      return await handleTossPointRedeem(req, context);
    default:
      return jsonResponse(req, 404, { error: "benefit_route_not_found" });
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req, {
    allowHeaders: "Content-Type, Authorization, apikey",
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed" });
  }

  try {
    const context = await authenticateRequest(req);
    if (context instanceof Response) {
      return context;
    }

    return await routeRequest(req, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[benefits] request failed:", message);

    const isClientError =
      message.endsWith("_required") ||
      message.endsWith("_invalid") ||
      message.includes("_must_") ||
      message.includes("no_unlocked_attempt_available") ||
      message.includes("daily_attempt_limit_reached") ||
      message.includes("not_enough_money_to_redeem") ||
      message.includes("attempt_sequence_must_match_next_attempt") ||
      message.includes("out_of_range") ||
      message.includes("not_in_choices") ||
      message.includes("not_available");

    return jsonResponse(req, isClientError ? 400 : 500, {
      success: false,
      error: isClientError ? message : "benefit_request_failed",
    });
  }
});
