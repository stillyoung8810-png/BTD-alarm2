import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { parse as secureJsonParse } from "secure-json-parse";
import { tossAuthRoutes } from "./routes/tossAuthRoute";
import { paymentRoutes } from "./routes/payment";
import { tossSmartMessageRoutes } from "./routes/tossSmartMessageRoute";
import { tossWebhookRoutes } from "./routes/tossWebhook";
import { tossDisconnectCallbackRoutes } from "./routes/tossDisconnectCallbackRoute";
import { tossSelfUnlinkRoute } from "./routes/tossSelfUnlinkRoute";
import { benefitPromotionRoutes } from "./routes/benefitPromotionRoute";

dotenv.config();

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    ...(process.env.NODE_ENV !== "production" && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
  },
});

/**
 * 기본 Fastify JSON 파서는 Content-Type: application/json + 빈 바디를 400(FST_ERR_CTP_EMPTY_JSON_BODY)으로 거부한다.
 * 구버전 미니앱(self-unlink 등)이 빈 바디로 보내는 경우가 있어, 빈 문자열은 {} 로 정규화한다.
 */
server.removeContentTypeParser("application/json");
server.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (request, body, done) => {
    if (body === "") {
      done(null, {});
      return;
    }
    try {
      done(
        null,
        secureJsonParse(body, {
          protoAction: "error",
          constructorAction: "error",
        }),
      );
    } catch {
      const err = new Error("Invalid JSON") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  },
);

/** 모든 요청에 correlation_id 부여·request.log에 자동 바인딩 (관찰 가능성) */
server.addHook("onRequest", async (request) => {
  const headerId = request.headers["x-correlation-id"];
  const correlationId =
    (typeof headerId === "string" && headerId.trim()) || randomUUID();
  request.correlationId = correlationId;
  request.log = request.log.child({ correlationId });
});

const start = async () => {
    try {
        // CORS (Fastify 5: await register)
        await server.register(cors, {
            origin: process.env.CORS_ORIGIN || true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        });

        await server.register(tossAuthRoutes);
        await server.register(paymentRoutes);
        await server.register(tossSmartMessageRoutes);
        await server.register(tossWebhookRoutes);
        await server.register(tossDisconnectCallbackRoutes);
        await server.register(tossSelfUnlinkRoute);
        await server.register(benefitPromotionRoutes);

        server.get("/health", async () => ({ status: "ok" }));

        const port = parseInt(process.env.PORT || "3000", 10);
        const host = "0.0.0.0";
        await server.listen({ port, host });
        console.log(`Server listening on ${host}:${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
