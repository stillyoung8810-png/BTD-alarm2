import type { FastifyBaseLogger } from "fastify";
import {
  executePromotionReward,
  getPromotionRewardKey,
  normalizeTossPromotionError,
  readPromotionExecutionResult,
} from "../toss/benefitPromotionClient";
import {
  beginBenefitPromotionAttempt,
  completeBenefitPromotionSuccess,
  markBenefitPromotionRetry,
  readBenefitPromotionExecutionTarget,
  restoreBenefitPromotionFailure,
  type BenefitPromotionExecutionTarget,
  type BenefitPromotionRpcResult,
} from "./benefitPromotionRepository";
import {
  getPromotionRetryMaxAttempts,
  resolveNextPromotionRetryAt,
} from "../utils/promotionRetryPolicy";

const PROMOTION_KEY_TTL_MS = 60 * 60 * 1_000;
const PER_REQUEST_TOSS_POINT_LIMIT = 5_000;
const RESTORABLE_TOSS_ERROR_CODES = new Set([
  "4100",
  "4109",
  "4112",
  "4114",
  "4116",
]);
const DUPLICATE_KEY_ERROR_CODE = "4113";

export interface ExecuteBenefitPromotionInput {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly correlationId: string;
  readonly log: FastifyBaseLogger;
}

export interface ExecuteBenefitPromotionResult {
  readonly success: boolean;
  readonly status: string;
  readonly reason?: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly tossPointAmount: number;
  readonly moneyBalance: number;
  readonly nextPromotionRetryAt?: string | null;
  readonly tossErrorCode?: string | null;
  readonly tossErrorMessage?: string | null;
  readonly restoredMoney?: number;
}

function isFutureIso(value: string | null, now = new Date()): boolean {
  if (value == null) {
    return false;
  }

  const parsedTime = Date.parse(value);
  if (!Number.isFinite(parsedTime)) {
    return false;
  }

  return parsedTime > now.getTime();
}

function isPromotionKeyUsable(target: BenefitPromotionExecutionTarget): boolean {
  if (target.promotionKey == null || target.promotionKeyExpiresAt == null) {
    return false;
  }

  return isFutureIso(target.promotionKeyExpiresAt);
}

function resolveKeyExpiresAt(issuedAt: Date): string {
  return new Date(issuedAt.getTime() + PROMOTION_KEY_TTL_MS).toISOString();
}

function toResult(
  rpcResult: BenefitPromotionRpcResult,
  success: boolean,
  reason?: string,
): ExecuteBenefitPromotionResult {
  return {
    success,
    status: rpcResult.status,
    reason,
    payoutId: rpcResult.payoutId,
    redeemRequestId: rpcResult.redeemRequestId,
    tossPointAmount: rpcResult.tossPointAmount,
    moneyBalance: rpcResult.moneyBalance,
    nextPromotionRetryAt: rpcResult.nextPromotionRetryAt,
    tossErrorCode: rpcResult.tossErrorCode,
    tossErrorMessage: rpcResult.tossErrorMessage,
    restoredMoney: rpcResult.restoredMoney,
  };
}

function resolveRetryTimestamp(
  promotionAttemptCount: number,
  now = new Date(),
): string | null {
  if (promotionAttemptCount >= getPromotionRetryMaxAttempts()) {
    return null;
  }

  return resolveNextPromotionRetryAt(promotionAttemptCount, now);
}

async function resolvePromotionKey(
  target: BenefitPromotionExecutionTarget,
): Promise<{
  readonly key: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}> {
  if (isPromotionKeyUsable(target)) {
    return {
      key: target.promotionKey ?? "",
      issuedAt: new Date().toISOString(),
      expiresAt: target.promotionKeyExpiresAt ?? "",
    };
  }

  const issuedAt = new Date();
  const keyResult = await getPromotionRewardKey(target.tossUserKey);
  return {
    key: keyResult.key,
    issuedAt: issuedAt.toISOString(),
    expiresAt: resolveKeyExpiresAt(issuedAt),
  };
}

async function markRetryOrPending(params: {
  readonly target: BenefitPromotionExecutionTarget;
  readonly beginResult: BenefitPromotionRpcResult;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly reason: string;
}): Promise<ExecuteBenefitPromotionResult> {
  const promotionAttemptCount =
    params.beginResult.promotionAttemptCount ??
    params.target.promotionAttemptCount + 1;
  const nextPromotionRetryAt = resolveRetryTimestamp(promotionAttemptCount);
  const retryResult = await markBenefitPromotionRetry({
    userId: params.target.userId,
    payoutId: params.target.payoutId,
    redeemRequestId: params.target.redeemRequestId,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    nextPromotionRetryAt,
  });

  const reason =
    nextPromotionRetryAt == null
      ? "promotion_retry_max_attempts_reached"
      : params.reason;

  return toResult(retryResult, false, reason);
}

async function restoreFailure(params: {
  readonly target: BenefitPromotionExecutionTarget;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly reason: string;
}): Promise<ExecuteBenefitPromotionResult> {
  const restoredResult = await restoreBenefitPromotionFailure({
    userId: params.target.userId,
    payoutId: params.target.payoutId,
    redeemRequestId: params.target.redeemRequestId,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  });

  return toResult(restoredResult, false, params.reason);
}

async function handlePromotionFailure(params: {
  readonly target: BenefitPromotionExecutionTarget;
  readonly beginResult: BenefitPromotionRpcResult;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly reason: string;
}): Promise<ExecuteBenefitPromotionResult> {
  if (RESTORABLE_TOSS_ERROR_CODES.has(params.errorCode)) {
    return await restoreFailure({
      target: params.target,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      reason: params.reason,
    });
  }

  return await markRetryOrPending(params);
}

async function executePromotionAttempt(params: {
  readonly target: BenefitPromotionExecutionTarget;
  readonly shouldForce: boolean;
  readonly log: FastifyBaseLogger;
}): Promise<ExecuteBenefitPromotionResult> {
  const key = await resolvePromotionKey(params.target);
  const processingRetryAt = resolveNextPromotionRetryAt(
    params.target.promotionAttemptCount,
  );
  const beginResult = await beginBenefitPromotionAttempt({
    userId: params.target.userId,
    payoutId: params.target.payoutId,
    redeemRequestId: params.target.redeemRequestId,
    promotionKey: key.key,
    keyIssuedAt: key.issuedAt,
    keyExpiresAt: key.expiresAt,
    processingRetryAt,
    shouldForce: params.shouldForce,
  });

  if (beginResult.canExecute !== true) {
    return toResult(beginResult, false, beginResult.reason ?? "not_executable");
  }

  try {
    await executePromotionReward({
      tossUserKey: params.target.tossUserKey,
      promotionCode: params.target.promotionCode,
      key: key.key,
      amount: params.target.tossPointAmount,
    });
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    if (
      failure.errorCode === DUPLICATE_KEY_ERROR_CODE &&
      !params.shouldForce
    ) {
      params.log.warn(
        { payoutId: params.target.payoutId },
        "[BenefitPromotion] Duplicate key detected; retrying once with a new key",
      );
      const refreshedTarget = {
        ...params.target,
        promotionKey: null,
        promotionKeyExpiresAt: null,
        promotionAttemptCount:
          beginResult.promotionAttemptCount ??
          params.target.promotionAttemptCount + 1,
      };
      return await executePromotionAttempt({
        target: refreshedTarget,
        shouldForce: true,
        log: params.log,
      });
    }

    return await handlePromotionFailure({
      target: params.target,
      beginResult,
      errorCode: failure.errorCode,
      errorMessage: failure.message,
      reason: "execute_promotion_failed",
    });
  }

  try {
    const executionResult = await readPromotionExecutionResult({
      tossUserKey: params.target.tossUserKey,
      promotionCode: params.target.promotionCode,
      key: key.key,
    });

    if (executionResult.status === "SUCCESS") {
      const successResult = await completeBenefitPromotionSuccess({
        userId: params.target.userId,
        payoutId: params.target.payoutId,
        redeemRequestId: params.target.redeemRequestId,
      });
      return toResult(successResult, true, "promotion_success");
    }

    if (executionResult.status === "FAILED") {
      return await restoreFailure({
        target: params.target,
        errorCode: "TOSS_PROMOTION_FAILED",
        errorMessage: "Toss promotion execution result is FAILED",
        reason: "execution_result_failed",
      });
    }

    return await markRetryOrPending({
      target: params.target,
      beginResult,
      errorCode: "TOSS_PROMOTION_PENDING",
      errorMessage: "Toss promotion execution result is PENDING",
      reason: "execution_result_pending",
    });
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    return await handlePromotionFailure({
      target: params.target,
      beginResult,
      errorCode: failure.errorCode,
      errorMessage: failure.message,
      reason: "execution_result_read_failed",
    });
  }
}

export async function executeBenefitPromotion(
  input: ExecuteBenefitPromotionInput,
): Promise<ExecuteBenefitPromotionResult> {
  const target = await readBenefitPromotionExecutionTarget({
    userId: input.userId,
    payoutId: input.payoutId,
    redeemRequestId: input.redeemRequestId,
  });

  if (target.tossPointAmount > PER_REQUEST_TOSS_POINT_LIMIT) {
    return await restoreFailure({
      target,
      errorCode: "4114",
      errorMessage: "Toss point amount exceeds per-request limit",
      reason: "per_request_limit_exceeded",
    });
  }

  if (target.status !== "pending") {
    return {
      success: target.status === "success",
      status: target.status,
      reason: "payout_already_finalized",
      payoutId: target.payoutId,
      redeemRequestId: target.redeemRequestId,
      tossPointAmount: target.tossPointAmount,
      moneyBalance: target.moneyBalance,
      nextPromotionRetryAt: target.nextPromotionRetryAt,
    };
  }

  if (isFutureIso(target.nextPromotionRetryAt)) {
    return {
      success: false,
      status: target.status,
      reason: "retry_not_due",
      payoutId: target.payoutId,
      redeemRequestId: target.redeemRequestId,
      tossPointAmount: target.tossPointAmount,
      moneyBalance: target.moneyBalance,
      nextPromotionRetryAt: target.nextPromotionRetryAt,
    };
  }

  input.log.info(
    {
      payoutId: target.payoutId,
      redeemRequestId: target.redeemRequestId,
      tossPointAmount: target.tossPointAmount,
    },
    "[BenefitPromotion] Executing Toss promotion",
  );

  return await executePromotionAttempt({
    target,
    shouldForce: false,
    log: input.log,
  });
}
