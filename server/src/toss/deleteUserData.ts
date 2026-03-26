import { supabaseAdmin } from "../supabaseClient";
import type { RequestLogger } from "./logger";
import { DeleteUserDataError } from "./errors";

/** 매직 스트링 금지: 라우트/알림에서 분기 가능한 기계적 코드 */
export const DELETE_USER_DATA_ERROR_CODES = {
  TABLE_DELETE_FAILED: "DELETE_USER_DATA_TABLE_DELETE_FAILED",
  AUTH_DELETE_FAILED: "DELETE_USER_DATA_AUTH_DELETE_FAILED",
} as const;

const DELETED_TABLE_NAMES = ["portfolio_history", "portfolios"] as const;

export type DeleteUserDataStage =
  | (typeof DELETED_TABLE_NAMES)[number]
  | "auth_delete";

export interface DeleteUserDataResult {
  deletedAuthUserId: string;
  deletedTables: typeof DELETED_TABLE_NAMES;
}

/**
 * 토스 철회/탈퇴 시 "미니앱에 사용자 데이터가 남지 않음" 기준을 만족시키기 위한 단일 삭제 진입점.
 * 테이블이 2개뿐이므로 from() 에 리터럴 테이블명을 써 Supabase 제네릭 추론을 살립니다.
 *
 * 원자성: Auth Admin API와 PostgREST 삭제를 단일 DB 트랜잭션으로 묶을 수 없어, 중간 실패 시 부분 삭제가 가능합니다.
 *
 * authUserId: 호출자가 검증·신뢰 가능한 UUID만 전달합니다. 내부 trim/형식 검사 없음.
 */
export async function deleteUserData(
  authUserId: string,
  log: RequestLogger,
): Promise<DeleteUserDataResult> {
  const { error: historyError } = await supabaseAdmin
    .from("portfolio_history")
    .delete()
    .eq("user_id", authUserId);

  if (historyError) {
    log.error(
      { authUserId, stage: "portfolio_history" as const, error: historyError },
      "deleteUserData portfolio_history delete failed",
    );
    throw new DeleteUserDataError(
      "Failed to delete rows from portfolio_history",
      DELETE_USER_DATA_ERROR_CODES.TABLE_DELETE_FAILED,
    );
  }

  const { error: portfoliosError } = await supabaseAdmin
    .from("portfolios")
    .delete()
    .eq("user_id", authUserId);

  if (portfoliosError) {
    log.error(
      { authUserId, stage: "portfolios" as const, error: portfoliosError },
      "deleteUserData portfolios delete failed",
    );
    throw new DeleteUserDataError(
      "Failed to delete rows from portfolios",
      DELETE_USER_DATA_ERROR_CODES.TABLE_DELETE_FAILED,
    );
  }

  log.info(
    { authUserId, stage: "auth_delete" as const },
    "deleteUserData deleting auth user",
  );

  const { error: deleteError } =
    await supabaseAdmin.auth.admin.deleteUser(authUserId);

  if (deleteError) {
    log.error(
      { authUserId, stage: "auth_delete" as const, deleteError },
      "deleteUserData auth.deleteUser failed",
    );
    throw new DeleteUserDataError(
      "Failed to delete user via Auth Admin API",
      DELETE_USER_DATA_ERROR_CODES.AUTH_DELETE_FAILED,
    );
  }

  return {
    deletedAuthUserId: authUserId,
    deletedTables: DELETED_TABLE_NAMES,
  };
}
