import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../supabaseClient';
import { sendMessage } from '../toss/TossProvider';

const tossSmartMessageBodySchema = z
  .object({
    userId: z.string().trim().min(1, 'userId is required'),
    context: z.record(z.string(), z.string()),
  })
  .strict();

function parseTossSmartMessageBody(
  body: unknown
): { success: true; data: z.infer<typeof tossSmartMessageBodySchema> } | { success: false; error: string } {
  const result = tossSmartMessageBodySchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors = result.error.flatten().fieldErrors;
  const message =
    Object.entries(fieldErrors)
      .map(([, value]) => (Array.isArray(value) ? value.join(', ') : String(value)))
      .join('; ') || result.error.message;

  return { success: false, error: message };
}

export async function tossSmartMessageRoutes(fastify: FastifyInstance) {
  fastify.post('/internal/toss/messages/send', async (request, reply) => {
    const { correlationId, log } = request;
    const internalSecret = process.env.INTERNAL_ALARM_SECRET;
    const headerSecret = request.headers['x-internal-alarm-secret'];

    if (!internalSecret || headerSecret !== internalSecret) {
      log.warn('Toss smart message: invalid internal secret');
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        requestId: correlationId,
      });
    }

    const parsed = parseTossSmartMessageBody(request.body);
    if (!parsed.success) {
      log.warn({ error: parsed.error }, 'Toss smart message body validation failed');
      return reply.code(400).send({
        success: false,
        error: parsed.error,
        requestId: correlationId,
      });
    }

    const { userId, context } = parsed.data;
    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('toss_user_key')
      .eq('id', userId)
      .single();

    if (error) {
      log.error({ err: error, userId }, 'Toss smart message: failed to load toss_user_key');
      return reply.code(500).send({
        success: false,
        error: 'Failed to load toss user profile',
        requestId: correlationId,
      });
    }

    if (!profile?.toss_user_key) {
      log.warn({ userId }, 'Toss smart message: toss_user_key not found');
      return reply.code(400).send({
        success: false,
        error: 'toss_user_key not found',
        requestId: correlationId,
      });
    }

    const result = await sendMessage(
      profile.toss_user_key,
      'btdalarm-push_msg',
      context,
      log
    );

    if (!result.success) {
      return reply.code(502).send({
        success: false,
        ...result.error,
        requestId: correlationId,
      });
    }

    return reply.send({
      success: true,
      data: result.data,
      requestId: correlationId,
    });
  });
}
