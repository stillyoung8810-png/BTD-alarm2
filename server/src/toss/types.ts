/**
 * 토스 로그인 API DTO (공식 문서 camelCase 기준).
 * 응답은 Selective Picking만 사용, .strict() 미적용 (Postel's Law).
 */

/** generate-token 성공 시 필요한 필드만 추출 */
export interface TossTokenSuccessDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** login-me 성공 시 필요한 필드만 추출. userKey는 DB 저장 시 string으로 변환 */
export interface TossLoginMeSuccessDto {
  userKey: number;
}

/** 토스 API 실패 시 error 객체 */
export interface TossErrorPayload {
  errorCode?: string;
  reason?: string;
}

/** 클라이언트에 반환하는 규격화된 에러 */
export interface NormalizedTossError {
  error: string;
  errorCode?: string;
  requestId?: string;
}

/** BFF 세션 응답 */
export interface TossSessionResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string | undefined };
}
