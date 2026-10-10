import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { expireUnacceptedDeals } from "./expiry.js";

test("expiry worker closes deals that are still awaiting buyer entry", async () => {
  const calls: string[] = [];
  const transaction = {
    deal: {
      findUnique: async () => ({ id: "deal-1", status: "AWAITING_BUYER" }),
      updateMany: async () => { calls.push("deal-expired"); return { count: 1 }; },
      findUniqueOrThrow: async () => ({ id: "deal-1", status: "EXPIRED" })
    },
    dealEvent: { create: async () => { calls.push("expiry-event"); } }
  };
  const prisma = {
    deal: { findMany: async (args: { where: { status: string; expiresAt: { lte: Date } } }) => {
      assert.equal(args.where.status, "AWAITING_BUYER");
      assert.equal(args.where.expiresAt.lte.toISOString(), "2026-10-10T00:00:00.000Z");
      return [{ id: "deal-1" }];
    } },
    $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction)
  } as unknown as PrismaClient;

  const expired = await expireUnacceptedDeals(prisma, new Date("2026-10-10T00:00:00.000Z"));

  assert.equal(expired, 1);
  assert.deepEqual(calls, ["deal-expired", "expiry-event"]);
});
