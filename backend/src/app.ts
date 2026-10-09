import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";

export function buildApp(config: AppConfig) {
  const app = Fastify({ logger: true });

  app.register(helmet);
  app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true
  });

  app.get("/health", async () => ({ status: "ok", service: "pulse-api" }));

  return app;
}