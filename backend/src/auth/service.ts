import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";

const challengeLifetimeMs = 5 * 60 * 1000;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const rateWindowMs = 15 * 60 * 1000;

export class AuthRateLimitError extends Error {
  constructor() {
    super("Too many verification requests. Please try again later.");
    this.name = "AuthRateLimitError";
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function digest(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

function createCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function bucketStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / rateWindowMs) * rateWindowMs);
}

async function incrementBucket(
  transaction: Prisma.TransactionClient,
  scope: string,
  keyHash: string,
  start: Date
): Promise<number> {
  const rows = await transaction.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "auth_rate_limit_buckets" ("id", "scope", "key_hash", "bucket_start", "count", "updated_at")
    VALUES (${randomUUID()}, ${scope}, ${keyHash}, ${start}, 1, NOW())
    ON CONFLICT ("scope", "key_hash", "bucket_start")
    DO UPDATE SET "count" = "auth_rate_limit_buckets"."count" + 1, "updated_at" = NOW()
    RETURNING "count"
  `;
  return rows[0]?.count ?? 0;
}

export async function createAuthChallenge(
  prisma: PrismaClient,
  config: AppConfig,
  input: { phone: string; displayName?: string; requesterIp: string }
) {
  const now = new Date();
  const windowStart = bucketStart(now);
  const phoneKey = digest(config.SESSION_SECRET, "rate-phone", input.phone);
  const ipKey = digest(config.SESSION_SECRET, "rate-ip", input.requesterIp);

  const [phoneCount, ipCount] = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const phoneAttempts = await incrementBucket(transaction, "phone", phoneKey, windowStart);
    const ipAttempts = await incrementBucket(transaction, "ip", ipKey, windowStart);
    return [phoneAttempts, ipAttempts] as const;
  });

  if (phoneCount > 3 || ipCount > 10) throw new AuthRateLimitError();

  const id = randomUUID();
  const code = createCode();
  const expiresAt = new Date(now.getTime() + challengeLifetimeMs);

  await prisma.$transaction([
    prisma.authChallenge.updateMany({
      where: { phone: input.phone, verifiedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now }
    }),
    prisma.authChallenge.create({
      data: {
        id,
        phone: input.phone,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        codeHash: digest(config.SESSION_SECRET, "auth-code", `${id}:${code}`),
        requesterHash: ipKey,
        expiresAt
      }
    })
  ]);

  const whatsappNumber = config.PULSE_WHATSAPP_NUMBER.replace(/\D/g, "");
  return {
    challengeId: id,
    code,
    expiresAt: expiresAt.toISOString(),
    whatsappLink: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(code)}`
  };
}

export async function consumeWhatsAppProof(
  prisma: PrismaClient,
  config: AppConfig,
  senderPhone: string,
  messageText: string
): Promise<boolean> {
  const code = messageText.trim();
  if (!/^\d{6}$/.test(code)) return false;

  const senderDigits = senderPhone.replace(/\D/g, "");
  const normalizedSender = `+${senderDigits}`;

  const now = new Date();
  const challenges = await prisma.authChallenge.findMany({
    where: { phone: normalizedSender, verifiedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
    orderBy: { createdAt: "desc" },
    take: 3
  });

  const challenge = challenges.find((candidate) => {
    const actual = Buffer.from(candidate.codeHash, "hex");
    const expected = Buffer.from(digest(config.SESSION_SECRET, "auth-code", `${candidate.id}:${code}`), "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!challenge) {
    const latest = await prisma.authChallenge.findFirst({
      where: { phone: normalizedSender, verifiedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" }
    });
    if (latest) {
      await prisma.authChallenge.updateMany({
        where: { id: latest.id, attempts: { lt: 5 }, verifiedAt: null, expiresAt: { gt: now } },
        data: { attempts: { increment: 1 } }
      });
    }
    return false;
  }

  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const claimed = await transaction.authChallenge.updateMany({
      where: { id: challenge.id, verifiedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now }
    });
    if (claimed.count !== 1) return false;

    const user = await transaction.user.findUnique({ where: { phone: normalizedSender } });
    if (user) {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          isPhoneVerified: true,
          ...(user.displayName === null && challenge.displayName ? { displayName: challenge.displayName } : {})
        }
      });
    } else {
      await transaction.user.create({
        data: {
          phone: normalizedSender,
          pulseId: `PULSE-${randomBytes(4).toString("hex").toUpperCase()}`,
          isPhoneVerified: true,
          ...(challenge.displayName ? { displayName: challenge.displayName } : {})
        }
      });
    }

    return true;
  });
}

export async function issueChallengeSession(prisma: PrismaClient, challengeId: string) {
  const now = new Date();
  const challenge = await prisma.authChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { status: "NOT_FOUND" as const };
  if (!challenge.verifiedAt) {
    if (challenge.attempts >= 5) return { status: "LOCKED" as const };
    return { status: challenge.expiresAt <= now ? "EXPIRED" as const : "PENDING" as const };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + sessionLifetimeMs);
  const session = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const currentChallenge = await transaction.authChallenge.findUnique({ where: { id: challengeId } });
    if (!currentChallenge?.verifiedAt) return null;
    const user = await transaction.user.findUnique({ where: { phone: currentChallenge.phone } });
    if (!user?.isPhoneVerified) return null;

    await transaction.session.deleteMany({ where: { challengeId } });
    await transaction.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        challengeId,
        expiresAt
      }
    });
    return user;
  });

  if (!session) return { status: "PENDING" as const };
  return { status: "VERIFIED" as const, token, expiresAt, user: publicUser(session) };
}

export function publicUser(user: { id: string; displayName: string | null; phone: string; pulseId: string }) {
  return { id: user.id, displayName: user.displayName, phone: user.phone, pulseId: user.pulseId };
}

export async function findSessionUser(prisma: PrismaClient, token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isPhoneVerified) return null;
  return { sessionId: session.id, user: publicUser(session.user) };
}

export async function deleteSession(prisma: PrismaClient, token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}