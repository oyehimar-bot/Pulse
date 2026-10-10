import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "./config.js";
import { processPendingPayazaEvents } from "./payaza.js";

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

test("successful Payaza payment atomically funds escrow and notifies both parties", async () => {
  const event = {
    id: "event-1",
    payload: { transaction_reference: "P-C-20261010-ABC123", transaction_status: "Funds Received" }
  };
  const payment = {
    id: "payment-1",
    dealId: "deal-1",
    providerReference: "payaza-link:84021",
    payazaLinkId: 84021,
    amountKobo: 125050n,
    status: "PENDING",
    deal: {
      id: "deal-1",
      dealCode: "ABC12345",
      buyerPhone: "+2348012345678",
      status: "AWAITING_PAYMENT",
      seller: { phone: "+2348098765432" }
    }
  };
  const databaseCalls: string[] = [];
  const notices: Array<{ to: string; body: string; dealId?: string }> = [];
  const transaction = {
    payment: {
      findUniqueOrThrow: async () => payment,
      update: async () => { databaseCalls.push("payment-succeeded"); }
    },
    deal: {
      findUnique: async () => ({ id: "deal-1", status: "AWAITING_PAYMENT" }),
      updateMany: async () => { databaseCalls.push("deal-funded"); return { count: 1 }; },
      findUniqueOrThrow: async () => ({ id: "deal-1", status: "FUNDED" })
    },
    dealEvent: { create: async () => { databaseCalls.push("transition-event"); } },
    ledgerEntry: { create: async () => { databaseCalls.push("escrow-credit"); } },
    webhookEvent: { update: async () => { databaseCalls.push("webhook-processed"); } }
  };
  const prisma = {
    webhookEvent: {
      findMany: async () => [event],
      update: async () => { databaseCalls.push("webhook-error"); }
    },
    payment: {
      findUnique: async () => null,
      findMany: async () => [payment]
    },
    $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction)
  } as unknown as PrismaClient;
  const notifier = {
    sendText: async (to: string, body: string, dealId?: string) => {
      notices.push({ to, body, ...(dealId ? { dealId } : {}) });
    }
  };
  const fetcher: typeof fetch = async (input) => {
    assert.equal(String(input), "https://api.payaza.africa/live/payment-link/merchant/fetch-payment-link-transactions?link_id=84021&page=1");
    return new Response(JSON.stringify({
      status: true,
      data: {
        items: [{ transaction_reference: "P-C-20261010-ABC123", transaction_status: "Completed", transaction_amount: 1250.5 }]
      }
    }), { status: 200 });
  };

  await processPendingPayazaEvents(prisma, config, notifier, fetcher);

  assert.deepEqual(databaseCalls, [
    "payment-succeeded",
    "deal-funded",
    "transition-event",
    "escrow-credit",
    "webhook-processed"
  ]);
  assert.equal(notices.length, 2);
  assert.deepEqual(notices.map((notice) => notice.to), ["+2348012345678", "+2348098765432"]);
  assert.ok(notices.every((notice) => notice.dealId === "deal-1"));
});
