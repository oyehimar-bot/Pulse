import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { releaseDealToPayout, submitDealDelivery } from "./delivery.js";

function fakeTransaction(startStatus: string, calls: string[], payoutData?: { data?: Record<string, unknown> }) {
  return {
    deal: {
      findUnique: async () => ({ id: "deal-1", status: startStatus }),
      updateMany: async () => { calls.push("deal-transitioned"); return { count: 1 }; },
      findUniqueOrThrow: async () => ({ id: "deal-1", status: "UPDATED" })
    },
    dealEvent: { create: async ({ data }: { data: { type: string } }) => { calls.push(data.type); } },
    ledgerEntry: { create: async ({ data }: { data: { account: string; direction: string; amountKobo: bigint } }) => {
      calls.push(`ledger:${data.account}:${data.direction}:${data.amountKobo}`);
    } },
    payout: { create: async ({ data }: { data: Record<string, unknown> }) => {
      if (payoutData) payoutData.data = data;
      calls.push("payout-created");
      return { id: "payout-1", ...data };
    } }
  };
}

test("seller delivery records an audited DELIVERED transition and note", async () => {
  const calls: string[] = [];
  const transaction = fakeTransaction("FUNDED", calls);
  const prisma = {
    $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction)
  } as unknown as PrismaClient;

  await submitDealDelivery(prisma, { dealId: "deal-1", sellerId: "seller-1", note: "Files sent by email" });

  assert.deepEqual(calls, ["deal-transitioned", "STATUS_TRANSITION", "DELIVERY_SUBMITTED"]);
});

test("buyer release atomically books escrow, fee, seller payable, and one ready payout", async () => {
  const calls: string[] = [];
  const payoutData: { data?: Record<string, unknown> } = {};
  const transaction = fakeTransaction("DELIVERED", calls, payoutData);
  const prisma = {
    $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction)
  } as unknown as PrismaClient;

  const result = await releaseDealToPayout(prisma, {
    dealId: "deal-1",
    dealCode: "ABC12345",
    sellerId: "seller-1",
    amountKobo: 2_500_000n,
    feePercent: 2.5,
    payoutDetails: { bankCode: "000013", accountNumber: "9207067319", accountName: "Jane Seller" }
  });

  assert.equal(result.feeKobo, 62_500n);
  assert.equal(result.sellerAmountKobo, 2_437_500n);
  assert.match(result.providerReference, /^PULSEABC12345[A-Fa-f0-9]{16}$/);
  assert.deepEqual(calls, [
    "deal-transitioned",
    "STATUS_TRANSITION",
    "ledger:deal:deal-1:escrow:DEBIT:2500000",
    "ledger:pulse:fees:CREDIT:62500",
    "ledger:seller:seller-1:payable:CREDIT:2437500",
    "payout-created"
  ]);
  assert.equal(payoutData.data?.status, "READY");
  assert.equal(payoutData.data?.bankCode, "000013");
  assert.equal(payoutData.data?.amountKobo, 2_437_500n);
});

test("buyer release rejects invalid fees before writing transaction state", async () => {
  let transactionStarted = false;
  const prisma = {
    $transaction: async () => { transactionStarted = true; }
  } as unknown as PrismaClient;

  await assert.rejects(releaseDealToPayout(prisma, {
    dealId: "deal-1",
    dealCode: "ABC12345",
    sellerId: "seller-1",
    amountKobo: 100n,
    feePercent: 100
  }), /fee must be less than/);
  assert.equal(transactionStarted, false);
});
