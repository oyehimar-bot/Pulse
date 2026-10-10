import assert from "node:assert/strict";
import Fastify from "fastify";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "../config.js";
import { registerDashboardRoutes } from "./routes.js";

const config = loadConfig({
  DATABASE_URL: "postgresql://pulse:pulse@localhost:5432/pulse",
  SESSION_SECRET: "a-session-secret-with-at-least-32-characters",
  PUBLIC_BASE_URL: "https://api.pulse.example.test",
  FRONTEND_URL: "https://pulse.example.test",
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

const user = { id: "user-1", displayName: "Ada Seller", phone: "+2348012345678", pulseId: "PULSE-ADA", isPhoneVerified: true };
const deal = {
  id: "deal-1",
  dealCode: "ABC12345",
  description: "Original music pack",
  amountKobo: 2_500_000n,
  status: "RELEASED",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
  deliveredAt: new Date("2026-10-01T12:00:00Z"),
  releasedAt: new Date("2026-10-02T00:00:00Z"),
  sellerId: user.id,
  buyerId: "buyer-1",
  seller: { displayName: "Ada Seller", pulseId: "PULSE-ADA" },
  buyer: { displayName: "Buyer", pulseId: "PULSE-BUYER" },
  license: { certificateNumber: "PULSE-LIC-ABC12345-1A2B3C4D", sha256Hash: "a".repeat(64), createdAt: new Date("2026-10-02T00:00:00Z") },
  payout: { status: "READY", amountKobo: 2_437_500n }
};

function makeApp() {
  const prisma = {
    session: { findUnique: async () => ({ expiresAt: new Date(Date.now() + 60_000), user }) },
    deal: {
      findMany: async () => [deal],
      findFirst: async () => ({
        ...deal,
        buyerPhone: "+2348098765432",
        rightsText: "Exclusive digital use",
        items: [{ quantity: 1, description: "music pack" }],
        events: [],
        ledgerEntries: [{ id: "ledger-1", account: "pulse:fees", direction: "CREDIT", amountKobo: 62_500n, reason: "Escrow fee", createdAt: new Date("2026-10-02T00:00:00Z") }],
        messages: [],
        payments: [{ id: "payment-1", status: "SUCCEEDED", amountKobo: 2_500_000n, createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") }]
      })
    },
    license: {
      findMany: async () => [{
        certificateNumber: "PULSE-LIC-ABC12345-1A2B3C4D",
        sha256Hash: "a".repeat(64),
        createdAt: new Date("2026-10-02T00:00:00Z"),
        deal: { dealCode: "ABC12345", description: "Original music pack", rightsText: "Exclusive digital use", amountKobo: 2_500_000n }
      }]
    }
  } as unknown as PrismaClient;
  const app = Fastify();
  registerDashboardRoutes(app, prisma, config);
  return app;
}

test("dashboard API requires a valid session cookie", async (context) => {
  const app = makeApp();
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/dashboard" });
  assert.equal(response.statusCode, 401);
});

test("dashboard and deal endpoints return scoped money-safe DTOs", async (context) => {
  const app = makeApp();
  context.after(() => app.close());
  const headers = { cookie: "pulse_session=session-token" };

  const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers });
  assert.equal(dashboard.statusCode, 200);
  assert.equal(dashboard.json().summary.totalValueKobo, "2500000");
  assert.equal(dashboard.json().deals[0].amountKobo, "2500000");
  assert.equal(dashboard.json().deals[0].role, "SELLER");
  assert.equal(dashboard.json().deals[0].payout.amountKobo, "2437500");

  const detail = await app.inject({ method: "GET", url: "/api/deals/ABC12345", headers });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().deal.ledgerEntries[0].amountKobo, "62500");
  assert.equal(detail.json().deal.payments[0].amountKobo, "2500000");
  assert.equal(detail.json().deal.license.verificationUrl, "https://pulse.example.test/verify/PULSE-LIC-ABC12345-1A2B3C4D");

  const licenses = await app.inject({ method: "GET", url: "/api/licenses", headers });
  assert.equal(licenses.statusCode, 200);
  assert.equal(licenses.json().licenses[0].deal.amountKobo, "2500000");
  assert.equal(licenses.json().licenses[0].verificationUrl, "https://pulse.example.test/verify/PULSE-LIC-ABC12345-1A2B3C4D");
});
