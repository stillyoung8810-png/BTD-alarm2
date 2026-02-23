/**
 * Fastify 요청에 correlation_id 및 요청 스코프 로거 바인딩 타입.
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** 요청 추적용 ID. onRequest 훅에서 X-Correlation-ID 또는 randomUUID()로 설정 */
    correlationId: string;
  }
}
