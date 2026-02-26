/**
 * TossRoute: 요청 수신, Zod .strict() 검증, AuthService/TossProvider에 request.log 전파.
 * - correlation_id는 onRequest 훅에서 request에 바인딩되며 request.log에 포함됨.
 * - 요청 body: authorizationCode, referrer(sandbox|DEFAULT) 만 허용.
 * - 에러 시 규격화된 { error, errorCode?, requestId? } 반환.
 */

import { FastifyInstance } from 'fastify';
import { parseTossExchangeBody } from '../toss/authSchemas';
import { getToken, getLoginMe } from '../toss/TossProvider';
import { ensureSessionForTossUserKey } from '../toss/AuthService';

export async function tossAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/toss/exchange', async (request, reply) => {
    const { correlationId, log } = request;

    const rawBody = request.body;
    if (rawBody == null || typeof rawBody !== 'object') {
      log.warn('Toss exchange: request body missing or not an object');
      return reply.code(400).send({
        error: 'Request body is required (JSON with authorizationCode, referrer)',
        errorCode: 'VALIDATION_ERROR',
        requestId: correlationId,
      });
    }

    const parsed = parseTossExchangeBody(rawBody);
    if (!parsed.success) {
      log.warn({ error: parsed.error }, 'Toss exchange body validation failed');
      return reply.code(400).send({
        error: parsed.error,
        errorCode: 'VALIDATION_ERROR',
        requestId: correlationId,
      });
    }

    const { authorizationCode, referrer } = parsed.data;
    const codeTrimmed = authorizationCode.trim();
    if (!codeTrimmed) {
      log.warn('Toss exchange: authorizationCode is empty after trim');
      return reply.code(400).send({
        error: 'authorizationCode is required',
        errorCode: 'VALIDATION_ERROR',
        requestId: correlationId,
      });
    }

    const tokenResult = await getToken(codeTrimmed, referrer, log);
    if (!tokenResult.success) {
      return reply.code(400).send({
        ...tokenResult.error,
        requestId: correlationId,
      });
    }

    const loginMeResult = await getLoginMe(tokenResult.data.accessToken, log);
    if (!loginMeResult.success) {
      return reply.code(400).send({
        ...loginMeResult.error,
        requestId: correlationId,
      });
    }

    try {
      const session = await ensureSessionForTossUserKey(loginMeResult.userKey, log);
      return reply.send({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session creation failed';
      log.error({ err, message }, 'AuthService ensureSession failed');
      return reply.code(500).send({
        error: message,
        errorCode: 'SESSION_FAILED',
        requestId: correlationId,
      });
    }
  });
}
