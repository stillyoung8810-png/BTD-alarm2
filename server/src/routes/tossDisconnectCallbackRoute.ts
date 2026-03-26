/**
 * 토스 공식 §7: 연결 끊기 콜백 — POST JSON { userKey, referrer }, Basic Auth.
 * @see docs/TOSS_DISCONNECT_CALLBACK_IMPLEMENTATION_PLAN.md
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  handleTossDisconnect,
  TOSS_DISCONNECT_REFERRERS,
} from "../toss/tossDisconnectHandler";
import { DeleteUserDataError, TossDisconnectError } from "../toss/errors";

const TOSS_WEBHOOK_USER = process.env.TOSS_WEBHOOK_USER ?? "";
const TOSS_WEBHOOK_PASSWORD = process.env.TOSS_WEBHOOK_PASSWORD ?? "";
export const TOSS_DISCONNECT_PATH = "/webhook/toss/disconnect";

const RESPONSE_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DISCONNECT_CALLBACK_FAILED: "DISCONNECT_CALLBACK_FAILED",
} as const;

const INTERNAL_FALLBACK_MESSAGE = "UNKNOWN_SERVER_ERROR";

const tossDisconnectBodySchema = z
  .object({
    userKey: z
      .union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .refine((s) => s.length > 0, { message: "userKey must be non-empty" }),
    referrer: z.enum(TOSS_DISCONNECT_REFERRERS),
  })
  .strict();

function hasValidBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  if (!TOSS_WEBHOOK_USER || !TOSS_WEBHOOK_PASSWORD) {
    return false;
  }

  try {
    const encodedValue = authHeader.slice("Basic ".length).trim();
    const decodedValue = Buffer.from(encodedValue, "base64").toString("utf8");
    const [user, password] = decodedValue.split(":");
    return user === TOSS_WEBHOOK_USER && password === TOSS_WEBHOOK_PASSWORD;
  } catch {
    return false;
  }
}

export async function tossDisconnectCallbackRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(
    TOSS_DISCONNECT_PATH,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { correlationId, log } = request;

      if (!hasValidBasicAuth(request.headers.authorization)) {
        log.warn("Toss disconnect callback unauthorized");
        return reply.code(401).send({
          error: "Unauthorized",
          errorCode: RESPONSE_CODES.UNAUTHORIZED,
          requestId: correlationId,
        });
      }

      const parsed = tossDisconnectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        log.warn(
          { zodError: parsed.error.flatten() },
          "Toss disconnect callback payload validation failed",
        );
        return reply.code(400).send({
          error: "Invalid payload",
          errorCode: RESPONSE_CODES.VALIDATION_ERROR,
          requestId: correlationId,
        });
      }

      try {
        const result = await handleTossDisconnect(
          {
            userKey: parsed.data.userKey,
            referrer: parsed.data.referrer,
          },
          log,
        );

        return reply.code(200).send({
          success: true,
          action: result.action,
          requestId: correlationId,
        });
      } catch (error: unknown) {
        if (
          error instanceof TossDisconnectError ||
          error instanceof DeleteUserDataError
        ) {
          log.error(
            { code: error.code, statusCode: error.statusCode },
            error.message,
          );
          return reply.code(error.statusCode).send({
            error: error.message,
            errorCode: error.code,
            requestId: correlationId,
          });
        }

        log.error({ error }, "Toss disconnect unhandled exception");
        return reply.code(500).send({
          error: INTERNAL_FALLBACK_MESSAGE,
          errorCode: RESPONSE_CODES.DISCONNECT_CALLBACK_FAILED,
          requestId: correlationId,
        });
      }
    },
  );
}
