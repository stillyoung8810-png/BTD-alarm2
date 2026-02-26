import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { tossAuthRoutes } from "./routes/tossAuthRoute";
import { paymentRoutes } from "./routes/payment";
import { tossWebhookRoutes } from "./routes/tossWebhook";

dotenv.config();

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    ...(process.env.NODE_ENV !== "production" && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
  },
});

/** 모든 요청에 correlation_id 부여·request.log에 자동 바인딩 (관찰 가능성) */
server.addHook("onRequest", async (request) => {
  const headerId = request.headers["x-correlation-id"];
  const correlationId =
    (typeof headerId === "string" && headerId.trim()) || randomUUID();
  request.correlationId = correlationId;
  (request as { log: ReturnType<typeof request.log.child> }).log =
    request.log.child({ correlationId });
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
        await server.register(tossWebhookRoutes);

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
