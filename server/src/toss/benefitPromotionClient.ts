import axios from "axios";
import { tossClient } from "../tossClient";

const PROMOTION_GET_KEY_ENDPOINT =
  "/api-partner/v1/apps-in-toss/promotion/execute-promotion/get-key";
const PROMOTION_EXECUTE_ENDPOINT =
  "/api-partner/v1/apps-in-toss/promotion/execute-promotion";
const PROMOTION_RESULT_ENDPOINT =
  "/api-partner/v1/apps-in-toss/promotion/execution-result";

export interface TossPromotionFailure {
  readonly errorCode: string;
  readonly message: string;
}

export interface TossPromotionKeyResult {
  readonly key: string;
}

export interface TossPromotionExecuteResult {
  readonly key: string;
}

export type TossPromotionExecutionStatus = "SUCCESS" | "PENDING" | "FAILED";

export interface TossPromotionResultStatus {
  readonly status: TossPromotionExecutionStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readStringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function readTossFailure(data: unknown): TossPromotionFailure | null {
  if (!isRecord(data)) {
    return null;
  }

  const error = data.error;
  if (!isRecord(error)) {
    return null;
  }

  const errorCode = readStringField(error, "errorCode") ?? "UNKNOWN_TOSS_ERROR";
  const message =
    readStringField(error, "reason") ??
    readStringField(error, "message") ??
    "Toss promotion request failed";

  return { errorCode, message };
}

function createFailureFromUnknown(
  error: unknown,
  fallbackMessage: string,
): TossPromotionFailure {
  if (axios.isAxiosError(error)) {
    const tossFailure = readTossFailure(error.response?.data);
    if (tossFailure != null) {
      return tossFailure;
    }

    return {
      errorCode: error.code ?? "TOSS_NETWORK_ERROR",
      message: error.message || fallbackMessage,
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: "TOSS_PROMOTION_ERROR",
      message: error.message,
    };
  }

  return {
    errorCode: "TOSS_PROMOTION_ERROR",
    message: fallbackMessage,
  };
}

function assertSuccessEnvelope(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new Error("toss_response_must_be_object");
  }

  const resultType = readStringField(data, "resultType");
  if (resultType === "FAIL") {
    const failure = readTossFailure(data);
    throw new TossPromotionRequestError(
      failure?.errorCode ?? "UNKNOWN_TOSS_ERROR",
      failure?.message ?? "Toss promotion request failed",
    );
  }

  if (resultType !== "SUCCESS") {
    throw new Error("toss_result_type_invalid");
  }

  const success = data.success;
  if (!isRecord(success) && typeof success !== "string") {
    throw new Error("toss_success_payload_invalid");
  }

  return { success };
}

function readSuccessKey(data: unknown): string {
  const envelope = assertSuccessEnvelope(data);
  const success = envelope.success;
  if (!isRecord(success)) {
    throw new Error("toss_success_key_payload_invalid");
  }

  const key = readStringField(success, "key");
  if (key == null) {
    throw new Error("toss_promotion_key_missing");
  }

  return key;
}

function readExecutionStatus(data: unknown): TossPromotionExecutionStatus {
  const envelope = assertSuccessEnvelope(data);
  const success = envelope.success;
  if (typeof success !== "string") {
    throw new Error("toss_execution_status_payload_invalid");
  }

  if (success === "SUCCESS" || success === "PENDING" || success === "FAILED") {
    return success;
  }

  throw new Error("toss_execution_status_invalid");
}

export class TossPromotionRequestError extends Error {
  public readonly errorCode: string;

  public constructor(errorCode: string, message: string) {
    super(message);
    this.name = "TossPromotionRequestError";
    this.errorCode = errorCode;
  }
}

export function normalizeTossPromotionError(error: unknown): TossPromotionFailure {
  if (error instanceof TossPromotionRequestError) {
    return {
      errorCode: error.errorCode,
      message: error.message,
    };
  }

  return createFailureFromUnknown(error, "Toss promotion request failed");
}

export async function getPromotionRewardKey(
  tossUserKey: string,
): Promise<TossPromotionKeyResult> {
  try {
    const response = await tossClient.post<unknown>(
      PROMOTION_GET_KEY_ENDPOINT,
      {},
      {
        headers: {
          "x-toss-user-key": tossUserKey,
        },
      },
    );

    return { key: readSuccessKey(response.data) };
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    throw new TossPromotionRequestError(failure.errorCode, failure.message);
  }
}

export async function executePromotionReward(params: {
  readonly tossUserKey: string;
  readonly promotionCode: string;
  readonly key: string;
  readonly amount: number;
}): Promise<TossPromotionExecuteResult> {
  try {
    const response = await tossClient.post<unknown>(
      PROMOTION_EXECUTE_ENDPOINT,
      {
        promotionCode: params.promotionCode,
        key: params.key,
        amount: params.amount,
      },
      {
        headers: {
          "x-toss-user-key": params.tossUserKey,
        },
      },
    );

    return { key: readSuccessKey(response.data) };
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    throw new TossPromotionRequestError(failure.errorCode, failure.message);
  }
}

export async function readPromotionExecutionResult(params: {
  readonly tossUserKey: string;
  readonly promotionCode: string;
  readonly key: string;
}): Promise<TossPromotionResultStatus> {
  try {
    const response = await tossClient.post<unknown>(
      PROMOTION_RESULT_ENDPOINT,
      {
        promotionCode: params.promotionCode,
        key: params.key,
      },
      {
        headers: {
          "x-toss-user-key": params.tossUserKey,
        },
      },
    );

    return { status: readExecutionStatus(response.data) };
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    throw new TossPromotionRequestError(failure.errorCode, failure.message);
  }
}
