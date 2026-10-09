import assert from "node:assert/strict";
import { createHmac, randomInt } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig({
  DATABASE_URL: "postgresql://pulse:pulse@localhost:5432/pulse",
  SESSION_SECRET: "a-session-secret-with-at-least-32-characters",
  PUBLIC_BASE_URL: "https://pulse.example.test",
  FRONTEND_URL: "http://localhost:5173",
  WHATSAPP_PHONE_NUMBER_ID: "phone-id",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "business-id",
  WHATSAPP_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
  WHATSAPP_APP_SECRET: "app-secret",
  PULSE_WHATSAPP_NUMBER: "+2348000000000",
  PAYAZA_PUBLIC_KEY_TEST: "test-public-key",
  PAYAZA_SECRET_KEY_TEST: "test-secret-key",
  LICENSE_SIGNING_KEY: "a-license-signing-key-with-at-least-32-characters"
});

test("GET /health returns API liveness", async (context) => {
  const app = await buildApp(config);
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", service: "pulse-api" });
});

test("the raw-body plugin retains exact webhook JSON text", async (context) => {
  const app = await buildApp(config);
  context.after(() => app.close());

  const rawBody = '{"object":"not-whatsapp","entry":[]} ';
  const signature = `sha256=${createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/whatsapp",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature
    },
    payload: rawBody
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "Invalid WhatsApp webhook payload." });
});

test("WhatsApp proof creates a verified cookie session and enforces expiry and limits", {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert(databaseUrl);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const app = await buildApp({ ...config, DATABASE_URL: databaseUrl }, prisma);
  const phone = `+234${randomInt(1_000_000_000, 2_000_000_000)}`;
  const requestChallenge = (targetPhone = phone, remoteAddress = "198.51.100.44") => app.inject({
    method: "POST",
    url: "/auth/challenges",
    payload: { phone: targetPhone, displayName: "Auth Test" },
    remoteAddress
  });

  try {
    const created = await requestChallenge();
    assert.equal(created.statusCode, 201);
    const challenge = created.json() as { challengeId: string; code: string; whatsappLink: string };
    assert.match(challenge.code, /^\d{6}$/);
    assert.match(challenge.whatsappLink, /^https:\/\/wa\.me\/\d+\?text=\d{6}$/);

    const wrongSender = await app.inject({ method: "GET", url: `/auth/challenges/${challenge.challengeId}` });
    assert.equal(wrongSender.json().status, "PENDING");

    const { consumeWhatsAppProof } = await import("./app.js");
    assert.equal(await consumeWhatsAppProof(prisma, config, "+2348000000000", challenge.code), false);
    assert.equal(await consumeWhatsAppProof(prisma, config, phone, "000000"), false);
    assert.equal(await consumeWhatsAppProof(prisma, config, phone.slice(1), challenge.code), true);
    assert.equal(await consumeWhatsAppProof(prisma, config, phone, challenge.code), false);

    const verified = await app.inject({ method: "GET", url: `/auth/challenges/${challenge.challengeId}` });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().status, "VERIFIED");
    const cookieHeader = verified.headers["set-cookie"];
    assert.equal(typeof cookieHeader, "string");
    const cookie = (cookieHeader as string).split(";")[0];
    assert.match(cookieHeader as string, /HttpOnly/);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().user.phone, phone);
    assert.equal(me.json().user.displayName, "Auth Test");

    const loggedOut = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    assert.equal(loggedOut.statusCode, 204);
    const afterLogout = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    assert.equal(afterLogout.statusCode, 401);

    const expiredChallenge = await requestChallenge();
    const expired = expiredChallenge.json() as { challengeId: string };
    await prisma.authChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
    const expiredStatus = await app.inject({ method: "GET", url: `/auth/challenges/${expired.challengeId}` });
    assert.equal(expiredStatus.json().status, "EXPIRED");

    await requestChallenge();
    await requestChallenge();
    const rateLimited = await requestChallenge();
    assert.equal(rateLimited.statusCode, 429);

    const lockPhone = `+234${randomInt(1_000_000_000, 2_000_000_000)}`;
    const lockChallengeResponse = await requestChallenge(lockPhone, "198.51.100.45");
    const lockChallenge = lockChallengeResponse.json() as { challengeId: string; code: string };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(await consumeWhatsAppProof(prisma, config, lockPhone, "999999"), false);
    }
    assert.equal(await consumeWhatsAppProof(prisma, config, lockPhone, lockChallenge.code), false);
    const lockedStatus = await app.inject({ method: "GET", url: `/auth/challenges/${lockChallenge.challengeId}` });
    assert.equal(lockedStatus.json().status, "LOCKED");
    await prisma.authChallenge.deleteMany({ where: { phone: lockPhone } });

    const existingPhone = `+234${randomInt(1_000_000_000, 2_000_000_000)}`;
    const existingUser = await prisma.user.create({
      data: {
        phone: existingPhone,
        pulseId: `PULSE-${randomInt(0x10000000, 0x7fffffff).toString(16).toUpperCase()}`
      }
    });
    const loginChallengeResponse = await requestChallenge(existingPhone, "198.51.100.46");
    const loginChallenge = loginChallengeResponse.json() as { code: string };
    assert.equal(await consumeWhatsAppProof(prisma, config, existingPhone, loginChallenge.code), true);
    const matchedUsers = await prisma.user.findMany({ where: { phone: existingPhone } });
    assert.equal(matchedUsers.length, 1);
    assert.equal(matchedUsers[0]?.id, existingUser.id);
    assert.equal(matchedUsers[0]?.isPhoneVerified, true);
    await prisma.authChallenge.deleteMany({ where: { phone: existingPhone } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  } finally {
    await prisma.authChallenge.deleteMany({ where: { phone } });
    await prisma.user.deleteMany({ where: { phone } });
    await app.close();
  }
});