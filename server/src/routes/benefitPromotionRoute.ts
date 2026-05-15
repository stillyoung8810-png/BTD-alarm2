import { timingSafeEqual } from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { executeBenefitPromotion } from "../services/benefitPromotionService";

const benefitPromotionBodySchema = z
  .object({
    userId: z.string().uuid(),
    redeemRequestId: z.string().trim().min(1),
    payoutId: z.string().uuid(),
  })
  .strict();

function isAuthorizedInternalRequest(authHeader: string | undefined): boolean {
  const secret = process.env.BENEFIT_BFF_INTERNAL_SECRET?.trim() ?? "";
  if (secret === "" || authHeader == null) {
    return false;
  }

  const token = authHeader.replace(/^\s*Bearer\s+/i, "").trim();
  if (token === "") {
    return false;
  }

  const tokenBuffer = Buffer.from(token, "utf8");
  const secretBuffer = Buffer.from(secret, "utf8");
  if (tokenBuffer.length !== secretBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenBuffer, secretBuffer);
}

export async function benefitPromotionRoutes(fastify: FastifyInstance) {
  fastify.post("/benefits/toss-point/execute-promotion", async (request, reply) => {
    const { correlationId, log } = request;

    if (!isAuthorizedInternalRequest(request.headers.authorization)) {
      log.warn("[BenefitPromotion] Unauthorized internal request");
      return reply.code(401).send({
        success: false,
        error: "unauthorized_internal_request",
        requestId: correlationId,
      });
    }

    const parsedBody = benefitPromotionBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      log.warn(
        { error: parsedBody.error.flatten() },
        "[BenefitPromotion] Body validation failed",
      );
      return reply.code(400).send({
        success: false,
        error: "invalid_benefit_promotion_payload",
        requestId: correlationId,
      });
    }

    try {
      const result = await executeBenefitPromotion({
        ...parsedBody.data,
        correlationId,
        log,
      });

      return reply.code(result.success ? 200 : 202).send({
        ...result,
        requestId: correlationId,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "benefit_promotion_failed";
      log.error(
        { error, message },
        "[BenefitPromotion] Promotion execution failed",
      );

      return reply.code(500).send({
        success: false,
        error: "benefit_promotion_failed",
        message,
        requestId: correlationId,
      });
    }
  });
}
