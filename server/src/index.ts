import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { authRoutes } from "./routes/auth";
import { paymentRoutes } from "./routes/payment";

dotenv.config();

const server = Fastify({
    logger: true,
});

const start = async () => {
    try {
        // CORS (Fastify 5: await register)
        await server.register(cors, {
            origin: process.env.CORS_ORIGIN || true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        });

        await server.register(authRoutes);
        await server.register(paymentRoutes);

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
