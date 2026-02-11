/**
 * 토스 미니앱 콜백: 회원 탈퇴 요청 시 토스가 이 URL로 호출합니다.
 * Authorization: Basic {base64(username:password)} 로 검증합니다.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../supabaseClient';

const TOSS_WEBHOOK_USER = process.env.TOSS_WEBHOOK_USER || '';
const TOSS_WEBHOOK_PASSWORD = process.env.TOSS_WEBHOOK_PASSWORD || '';

function validateBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  if (!TOSS_WEBHOOK_USER || !TOSS_WEBHOOK_PASSWORD) return false;
  const base64 = authHeader.slice(6).trim();
  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    return user === TOSS_WEBHOOK_USER && pass === TOSS_WEBHOOK_PASSWORD;
  } catch {
    return false;
  }
}

interface WithdrawalBody {
  user_id?: string;
}

export async function tossWebhookRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: WithdrawalBody }>(
    '/webhook/toss-member-withdrawal',
    async (request: FastifyRequest<{ Body: WithdrawalBody }>, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!validateBasicAuth(authHeader)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body || {};
      const userId = body.user_id?.trim();
      if (!userId) {
        return reply.code(400).send({
          error: 'Missing user_id in request body. Send { "user_id": "Supabase user UUID" }.',
        });
      }

      try {
        const { error: historyError } = await supabaseAdmin
          .from('portfolio_history')
          .delete()
          .eq('user_id', userId);
        if (historyError) fastify.log.warn({ err: historyError }, 'portfolio_history delete');

        const { error: portfolioError } = await supabaseAdmin
          .from('portfolios')
          .delete()
          .eq('user_id', userId);
        if (portfolioError) {
          fastify.log.error({ err: portfolioError }, 'portfolios delete');
          return reply.code(500).send({ error: 'Failed to delete user data' });
        }

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
          fastify.log.error({ err: deleteError }, 'auth deleteUser');
          return reply.code(500).send({ error: 'Failed to delete account' });
        }

        fastify.log.info({ userId }, 'Toss withdrawal: account deleted');
        return reply.send({ success: true });
      } catch (err) {
        fastify.log.error(err, 'Toss withdrawal webhook error');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}
