/** 토스 연결 끊기 콜백 핸들러 전용 — message: 인간용, code: 기계용(응답 errorCode) */
export class TossDisconnectError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "TossDisconnectError";
  }
}

/** deleteUserData 전용 — 라우트에서 TossDisconnectError 와 동일 패턴으로 분기 */
export class DeleteUserDataError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "DeleteUserDataError";
  }
}
