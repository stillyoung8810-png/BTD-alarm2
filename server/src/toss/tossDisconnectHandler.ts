import type { RequestLogger } from "./logger";
import { supabaseAdmin } from "../supabaseClient";
import { deleteUserData } from "./deleteUserData";
import { TossDisconnectError } from "./errors";

export const TOSS_DISCONNECT_REFERRERS = [
  "UNLINK",
  "WITHDRAWAL_TERMS",
  "WITHDRAWAL_TOSS",
] as const;

export type TossDisconnectReferrer =
  (typeof TOSS_DISCONNECT_REFERRERS)[number];

export const TOSS_DISCONNECT_ERROR_CODES = {
  MAPPING_LOOKUP_FAILED: "TOSS_DISCONNECT_MAPPING_LOOKUP_FAILED",
  MAPPING_DELETE_FAILED: "TOSS_DISCONNECT_MAPPING_DELETE_FAILED",
  PROFILE_UPDATE_FAILED: "TOSS_DISCONNECT_PROFILE_UPDATE_FAILED",
  UNSUPPORTED_REFERRER: "TOSS_DISCONNECT_UNSUPPORTED_REFERRER",
} as const;

/** userKey 는 라우트 Zod에서 trim + min(1) 까지 끝난 값만 전달한다. */
export interface TossDisconnectEvent {
  userKey: string;
  referrer: TossDisconnectReferrer;
}

export interface TossDisconnectResult {
  action: "unlinked" | "withdrawn" | "noop";
  authUserId?: string;
}

/**
 * 토스 userKey → Supabase auth.users.id
 * - 콜백 SLA를 위해 toss_accounts 단일 조회만 사용 (listUsers 전수 스캔 금지).
 * - 매핑이 없으면 null: 상위에서 noop 처리.
 */
async function resolveAuthUserIdByTossUserKey(
  userKey: string,
  log: RequestLogger,
): Promise<string | null> {
  const { data: mapping, error: mappingError } = await supabaseAdmin
    .from("toss_accounts")
    .select("auth_user_id")
    .eq("toss_user_key", userKey)
    .maybeSingle();

  if (mappingError) {
    log.error({ userKey, mappingError }, "toss_accounts lookup failed");
    throw new TossDisconnectError(
      "Failed to query toss_accounts mapping",
      TOSS_DISCONNECT_ERROR_CODES.MAPPING_LOOKUP_FAILED,
    );
  }

  return mapping?.auth_user_id ?? null;
}

async function handleUnlink(
  userKey: string,
  log: RequestLogger,
): Promise<TossDisconnectResult> {
  const authUserId = await resolveAuthUserIdByTossUserKey(userKey, log);

  if (!authUserId) {
    log.info({ userKey }, "UNLINK noop: no toss_accounts row");
    return { action: "noop" };
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from("user_profiles")
    .update({ toss_user_key: null })
    .eq("id", authUserId);

  if (profileUpdateError) {
    log.error(
      { userKey, authUserId, profileUpdateError },
      "UNLINK user_profiles update failed",
    );
    throw new TossDisconnectError(
      "Failed to clear toss_user_key on user profile",
      TOSS_DISCONNECT_ERROR_CODES.PROFILE_UPDATE_FAILED,
    );
  }

  const { error: mappingDeleteError } = await supabaseAdmin
    .from("toss_accounts")
    .delete()
    .eq("toss_user_key", userKey);

  if (mappingDeleteError) {
    log.error(
      { userKey, authUserId, mappingDeleteError },
      "UNLINK toss_accounts delete failed",
    );
    throw new TossDisconnectError(
      "Failed to delete toss_accounts mapping row",
      TOSS_DISCONNECT_ERROR_CODES.MAPPING_DELETE_FAILED,
    );
  }

  return {
    action: "unlinked",
    authUserId,
  };
}

async function handleWithdrawal(
  userKey: string,
  log: RequestLogger,
): Promise<TossDisconnectResult> {
  const authUserId = await resolveAuthUserIdByTossUserKey(userKey, log);

  if (!authUserId) {
    log.info({ userKey }, "WITHDRAWAL noop: no toss_accounts row");
    return { action: "noop" };
  }

  await deleteUserData(authUserId, log);

  return {
    action: "withdrawn",
    authUserId,
  };
}

export async function handleTossDisconnect(
  event: TossDisconnectEvent,
  log: RequestLogger,
): Promise<TossDisconnectResult> {
  switch (event.referrer) {
    case "UNLINK":
      return handleUnlink(event.userKey, log);
    case "WITHDRAWAL_TERMS":
    case "WITHDRAWAL_TOSS":
      return handleWithdrawal(event.userKey, log);
    default: {
      const exhaustiveCheck: never = event.referrer;
      log.error({ exhaustiveCheck }, "Unsupported toss disconnect referrer");
      throw new TossDisconnectError(
        "Unsupported disconnect referrer",
        TOSS_DISCONNECT_ERROR_CODES.UNSUPPORTED_REFERRER,
      );
    }
  }
}
