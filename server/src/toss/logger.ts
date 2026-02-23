/**
 * 구조화 로그: correlation_id 전파, 토큰 masking, expiresIn 등 맥락 포함.
 * RequestLogger: Fastify request.log 및 pino.Logger 호환 (하위 계층 공통 타입).
 */

import pino from 'pino';

/** 요청 스코프 로거. Fastify request.log 또는 pino child logger 전달용 (하위 계층은 info/warn/error만 사용) */
export type RequestLogger = Pick<pino.Logger, 'info' | 'warn' | 'error'>;

/** 앱 전역 단일 Pino 인스턴스. Fastify logger로 사용·onRequest에서 child 바인딩 */
export const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

/** 요청별 자식 로거 (correlation_id 바인딩). 라우트에서 request.log 사용 시 불필요 */
export function childLogger(correlationId: string): pino.Logger {
  return baseLogger.child({ correlationId });
}

/** 토큰 값은 절대 전체 출력 금지. 앞/뒤 일부만 노출 */
export function maskToken(token: string, visibleChars = 4): string {
  if (!token || token.length <= visibleChars * 2) return '***';
  return `${token.slice(0, visibleChars)}...${token.slice(-visibleChars)}`;
}
