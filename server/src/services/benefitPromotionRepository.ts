import { supabaseAdmin } from "../supabaseClient";

export type BenefitPromotionPayoutStatus = "pending" | "success" | "failed";

export interface BenefitPromotionExecutionTarget {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly promotionCode: string;
  readonly promotionKey: string | null;
  readonly promotionKeyExpiresAt: string | null;
  readonly promotionAttemptCount: number;
  readonly nextPromotionRetryAt: string | null;
  readonly status: BenefitPromotionPayoutStatus;
  readonly tossPointAmount: number;
  readonly redeemedMoney: number;
  readonly moneyBalance: number;
  readonly tossUserKey: string;
}

export interface BenefitPromotionRpcResult {
  readonly canExecute?: boolean;
  readonly reason?: string;
  readonly status: BenefitPromotionPayoutStatus;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly promotionCode?: string;
  readonly promotionKey?: string;
  readonly tossPointAmount: number;
  readonly redeemedMoney?: number;
  readonly restoredMoney?: number;
  readonly moneyBalance: number;
  readonly promotionAttemptCount?: number;
  readonly nextPromotionRetryAt?: string | null;
  readonly tossErrorCode?: string | null;
  readonly tossErrorMessage?: string | null;
  readonly completedAt?: string | null;
}

interface BenefitPayoutRow {
  readonly id: string;
  readonly user_id: string;
  readonly redeem_request_id: string;
  readonly promotion_code: string;
  readonly redeemed_money: number;
  readonly toss_point_amount: number;
  readonly toss_promotion_key: string | null;
  readonly toss_promotion_key_expires_at: string | null;
  readonly promotion_attempt_count: number;
  readonly next_promotion_retry_at: string | null;
  readonly status: string;
}

interface BenefitWalletRow {
  readonly money_balance: number;
}

interface TossAuthLinkRow {
  readonly toss_user_key: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName}_must_be_string`);
  }

  return value.trim();
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }

  return readString(value, fieldName);
}

function readInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName}_must_be_integer`);
  }

  return value as number;
}

function readStatus(value: unknown): BenefitPromotionPayoutStatus {
  if (value === "pending" || value === "success" || value === "failed") {
    return value;
  }

  throw new Error("payout_status_invalid");
}

function readBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${fieldName}_must_be_boolean`);
  }

  return value;
}

function parseRpcResult(data: unknown): BenefitPromotionRpcResult {
  if (!isRecord(data)) {
    throw new Error("benefit_promotion_rpc_result_invalid");
  }

  return {
    canExecute: readBoolean(data.canExecute, "canExecute"),
    reason: readNullableString(data.reason, "reason") ?? undefined,
    status: readStatus(data.status),
    payoutId: readString(data.payoutId, "payoutId"),
    redeemRequestId: readString(data.redeemRequestId, "redeemRequestId"),
    promotionCode:
      readNullableString(data.promotionCode, "promotionCode") ?? undefined,
    promotionKey:
      readNullableString(data.promotionKey, "promotionKey") ?? undefined,
    tossPointAmount: readInteger(data.tossPointAmount, "tossPointAmount"),
    redeemedMoney:
      data.redeemedMoney == null
        ? undefined
        : readInteger(data.redeemedMoney, "redeemedMoney"),
    restoredMoney:
      data.restoredMoney == null
        ? undefined
        : readInteger(data.restoredMoney, "restoredMoney"),
    moneyBalance: readInteger(data.moneyBalance, "moneyBalance"),
    promotionAttemptCount:
      data.promotionAttemptCount == null
        ? undefined
        : readInteger(data.promotionAttemptCount, "promotionAttemptCount"),
    nextPromotionRetryAt: readNullableString(
      data.nextPromotionRetryAt,
      "nextPromotionRetryAt",
    ),
    tossErrorCode: readNullableString(data.tossErrorCode, "tossErrorCode"),
    tossErrorMessage: readNullableString(
      data.tossErrorMessage,
      "tossErrorMessage",
    ),
    completedAt: readNullableString(data.completedAt, "completedAt"),
  };
}

function parsePayoutRow(row: BenefitPayoutRow): Omit<
  BenefitPromotionExecutionTarget,
  "moneyBalance" | "tossUserKey"
> {
  return {
    userId: readString(row.user_id, "userId"),
    payoutId: readString(row.id, "payoutId"),
    redeemRequestId: readString(row.redeem_request_id, "redeemRequestId"),
    promotionCode: readString(row.promotion_code, "promotionCode"),
    promotionKey: readNullableString(row.toss_promotion_key, "promotionKey"),
    promotionKeyExpiresAt: readNullableString(
      row.toss_promotion_key_expires_at,
      "promotionKeyExpiresAt",
    ),
    promotionAttemptCount: readInteger(
      row.promotion_attempt_count,
      "promotionAttemptCount",
    ),
    nextPromotionRetryAt: readNullableString(
      row.next_promotion_retry_at,
      "nextPromotionRetryAt",
    ),
    status: readStatus(row.status),
    tossPointAmount: readInteger(row.toss_point_amount, "tossPointAmount"),
    redeemedMoney: readInteger(row.redeemed_money, "redeemedMoney"),
  };
}

export async function readBenefitPromotionExecutionTarget(params: {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
}): Promise<BenefitPromotionExecutionTarget> {
  const { data: payout, error: payoutError } = await supabaseAdmin
    .from("benefit_toss_point_payouts")
    .select(
      [
        "id",
        "user_id",
        "redeem_request_id",
        "promotion_code",
        "redeemed_money",
        "toss_point_amount",
        "toss_promotion_key",
        "toss_promotion_key_expires_at",
        "promotion_attempt_count",
        "next_promotion_retry_at",
        "status",
      ].join(","),
    )
    .eq("id", params.payoutId)
    .eq("user_id", params.userId)
    .eq("redeem_request_id", params.redeemRequestId)
    .maybeSingle();

  if (payoutError != null) {
    throw new Error(`payout_read_failed:${payoutError.message}`);
  }

  if (payout == null) {
    throw new Error("payout_not_found");
  }

  const { data: wallet, error: walletError } = await supabaseAdmin
    .from("benefit_wallets")
    .select("money_balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (walletError != null) {
    throw new Error(`wallet_read_failed:${walletError.message}`);
  }

  if (wallet == null) {
    throw new Error("wallet_not_found");
  }

  const { data: tossAuthLink, error: tossAuthLinkError } = await supabaseAdmin
    .from("toss_auth_links")
    .select("toss_user_key")
    .eq("auth_user_id", params.userId)
    .maybeSingle();

  if (tossAuthLinkError != null) {
    throw new Error(`toss_auth_link_read_failed:${tossAuthLinkError.message}`);
  }

  if (tossAuthLink == null) {
    throw new Error("toss_user_key_not_found");
  }

  const payoutFields = parsePayoutRow(payout as unknown as BenefitPayoutRow);
  const walletRow = wallet as BenefitWalletRow;
  const tossAuthLinkRow = tossAuthLink as TossAuthLinkRow;

  return {
    ...payoutFields,
    moneyBalance: readInteger(walletRow.money_balance, "moneyBalance"),
    tossUserKey: readString(tossAuthLinkRow.toss_user_key, "tossUserKey"),
  };
}

export async function beginBenefitPromotionAttempt(params: {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly promotionKey: string;
  readonly keyIssuedAt: string;
  readonly keyExpiresAt: string;
  readonly processingRetryAt: string;
  readonly shouldForce: boolean;
}): Promise<BenefitPromotionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "begin_benefit_toss_promotion_attempt",
    {
      p_user_id: params.userId,
      p_payout_id: params.payoutId,
      p_redeem_request_id: params.redeemRequestId,
      p_promotion_key: params.promotionKey,
      p_key_issued_at: params.keyIssuedAt,
      p_key_expires_at: params.keyExpiresAt,
      p_processing_retry_at: params.processingRetryAt,
      p_force: params.shouldForce,
    },
  );

  if (error != null) {
    throw new Error(`begin_promotion_attempt_failed:${error.message}`);
  }

  return parseRpcResult(data);
}

export async function markBenefitPromotionRetry(params: {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly nextPromotionRetryAt: string | null;
}): Promise<BenefitPromotionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "mark_benefit_toss_promotion_retry",
    {
      p_user_id: params.userId,
      p_payout_id: params.payoutId,
      p_redeem_request_id: params.redeemRequestId,
      p_error_code: params.errorCode,
      p_error_message: params.errorMessage,
      p_next_promotion_retry_at: params.nextPromotionRetryAt,
    },
  );

  if (error != null) {
    throw new Error(`mark_promotion_retry_failed:${error.message}`);
  }

  return parseRpcResult(data);
}

export async function completeBenefitPromotionSuccess(params: {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
}): Promise<BenefitPromotionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "complete_benefit_toss_promotion_success",
    {
      p_user_id: params.userId,
      p_payout_id: params.payoutId,
      p_redeem_request_id: params.redeemRequestId,
    },
  );

  if (error != null) {
    throw new Error(`complete_promotion_success_failed:${error.message}`);
  }

  return parseRpcResult(data);
}

export async function restoreBenefitPromotionFailure(params: {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
}): Promise<BenefitPromotionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "restore_benefit_toss_promotion_failure",
    {
      p_user_id: params.userId,
      p_payout_id: params.payoutId,
      p_redeem_request_id: params.redeemRequestId,
      p_error_code: params.errorCode,
      p_error_message: params.errorMessage,
    },
  );

  if (error != null) {
    throw new Error(`restore_promotion_failure_failed:${error.message}`);
  }

  return parseRpcResult(data);
}
