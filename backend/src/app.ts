import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { z } from "zod";
import {
  AuthRateLimitError,
  createAuthChallenge,
  consumeWhatsAppProof,
  deleteSession,
  findSessionUser,
  issueChallengeSession
} from "./auth/service.js";
import type { AppConfig } from "./config.js";
import { registerWhatsAppWebhook } from "./webhooks/whatsapp.js";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number in international format, for example +2348012345678.");
const challengeSchema = z.object({
  phone: phoneSchema,
  displayName: z.string().trim().min(1).max(80).optional()
});
const challengeIdSchema = z.string().uuid();
const sessionCookieName = "pulse_session";

function readCookie(cookieHeader: string | undefined, name: string) {
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

function cookieAttributes(config: AppConfig) {
  const secure = new URL(config.PUBLIC_BASE_URL).protocol === "https:";
  const sameSite = secure ? "None" : "Lax";
  return `Path=/; HttpOnly; SameSite=${sameSite}${secure ? "; Secure" : ""}`;
}

function cookieValue(config: AppConfig, token: string, expiresAt: Date) {
  return `${sessionCookieName}=${token}; ${cookieAttributes(config)}; Expires=${expiresAt.toUTCString()}`;
}

export async function buildApp(config: AppConfig, prisma = new PrismaClient()) {
  const app = Fastify({ logger: true });

  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true
  });

  app.addHook("onClose", async () => prisma.$disconnect());

  app.register(helmet);
  app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true
  });

  app.get("/health", async () => ({ status: "ok", service: "pulse-api" }));

  app.post("/auth/challenges", async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid phone number or display name." });

    try {
      const challenge = await createAuthChallenge(prisma, config, {
        phone: parsed.data.phone,
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
        requesterIp: request.ip
      });
      return reply.header("Cache-Control", "no-store").code(201).send(challenge);
    } catch (error) {
      if (error instanceof AuthRateLimitError) {
        return reply.header("Retry-After", "900").code(429).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get<{ Params: { challengeId: string } }>("/auth/challenges/:challengeId", async (request, reply) => {
    if (!challengeIdSchema.safeParse(request.params.challengeId).success) {
      return reply.code(404).send({ error: "Verification request not found." });
    }

    const result = await issueChallengeSession(prisma, request.params.challengeId);
    reply.header("Cache-Control", "no-store");
    if (result.status === "NOT_FOUND") return reply.code(404).send({ error: "Verification request not found." });
    if (result.status === "LOCKED") return reply.send({ status: "LOCKED" });
    if (result.status === "EXPIRED") return reply.send({ status: "EXPIRED" });
    if (result.status !== "VERIFIED" || !("token" in result)) return reply.send({ status: "PENDING" });

    return reply
      .header("Set-Cookie", cookieValue(config, result.token, result.expiresAt))
      .send({ status: "VERIFIED", user: result.user });
  });

  app.get("/auth/me", async (request, reply) => {
    const token = readCookie(request.headers.cookie, sessionCookieName);
    const session = await findSessionUser(prisma, token);
    if (!session) return reply.code(401).send({ error: "Authentication required." });
    return reply.send({ user: session.user });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = readCookie(request.headers.cookie, sessionCookieName);
    await deleteSession(prisma, token);
    return reply.header("Set-Cookie", `${sessionCookieName}=; ${cookieAttributes(config)}; Max-Age=0`).code(204).send();
  });

  registerWhatsAppWebhook(app, prisma, config);

  return app;
}

export { consumeWhatsAppProof };