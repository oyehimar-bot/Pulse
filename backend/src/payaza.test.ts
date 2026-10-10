import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "./config.js";
import { buildPayazaPayoutRequest, initiatePayazaPayout, processPendingPayazaEvents } from "./payaza.js";

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

test("Payaza NUBAN payout uses the documented request and test headers", async () => {
  const payoutConfig = loadConfig({
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
    PAYAZA_TENANT_ID: "test",
    PAYAZA_TRANSACTION_PIN: "419374",
    PAYAZA_ACCOUNT_REFERENCE: "1010000009",
    LICENSE_SIGNING_KEY: "a-license-signing-key-with-at-least-32-characters"
  });
  const request = buildPayazaPayoutRequest(payoutConfig, {
    amountKobo: 122550n,
    providerReference: "PULSEABC12345FEDCBA987654",
    dealCode: "ABC12345",
    sellerName: "Jane Seller",
    sellerPhone: "+2348012345678",
    senderAddress: "123 Sample Street, Lagos",
    bankCode: "000013",
    accountNumber: "9207067319",
    accountName: "Jane Seller"
  });
  let requestUrl = "";
  let requestHeaders = new Headers();
  let requestBody: unknown;
  const response = await initiatePayazaPayout(payoutConfig, request, async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body)) as unknown;
    return new Response(JSON.stringify({ response_code: 200, response_content: { response_status: "TRANSACTION_INITIATED" } }), { status: 200 });
  });

  assert.equal(requestUrl, "https://api.payaza.africa/live/payout-receptor/payout");
  assert.equal(requestHeaders.get("Authorization"), `Payaza ${Buffer.from(payoutConfig.PAYAZA_PUBLIC_KEY_TEST).toString("base64")}`);
  assert.equal(requestHeaders.get("X-TenantID"), "test");
  assert.equal(requestHeaders.get("Content-Type"), "application/json");
  assert.deepEqual(requestBody, request);
  assert.equal(request.service_payload.payout_amount, 1225.5);
  assert.equal(request.service_payload.payout_beneficiaries[0]?.transaction_reference, "PULSEABC12345FEDCBA987654");
  assert.equal(response.response_content?.response_status, "TRANSACTION_INITIATED");
});

test("successful Payaza transfer settles the payout and debits seller payable once", async () => {
  const event = {
    id: "payout-event-1",
    payload: { transaction_reference: "PULSEABC12345FEDCBA987654", transaction_type: "DEBIT", transaction_status: "NIP_SUCCESS", amount_received: 1225.5 }
  };
  const payout = {
    id: "payout-1",
    dealId: "deal-1",
    recipientId: "seller-1",
    providerReference: "PULSEABC12345FEDCBA987654",
    amountKobo: 122550n,
    status: "PENDING",
    deal: { dealCode: "ABC12345" },
    recipient: { phone: "+2348012345678" }
  };
  const calls: string[] = [];
  const transaction = {
    payout: {
      updateMany: async () => { calls.push("payout-succeeded"); return { count: 1 }; }
    },
    ledgerEntry: { create: async () => { calls.push("seller-payable-debited"); } },
    dealEvent: { create: async () => { calls.push("payout-event-created"); } },
    webhookEvent: { update: async () => { calls.push("webhook-processed"); } }
  };
  const prisma = {
    webhookEvent: { findMany: async () => [event], update: async () => { calls.push("webhook-error"); } },
    payout: { findUnique: async () => payout },
    $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction)
  } as unknown as PrismaClient;
  const messages: string[] = [];

  await processPendingPayazaEvents(prisma, config, { sendText: async (to, body) => { messages.push(`${to}: ${body}`); } });

  assert.deepEqual(calls, ["payout-succeeded", "seller-payable-debited", "payout-event-created", "webhook-processed"]);
  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /Payaza confirmed payout/);
});
