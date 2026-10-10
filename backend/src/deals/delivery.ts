import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { transitionDealInTransaction } from "./transitions.js";

export async function submitDealDelivery(
  prisma: PrismaClient,
  options: { dealId: string; sellerId: string; note: string }
) {
  return prisma.$transaction(async (transaction) => {
    const deal = await transitionDealInTransaction(transaction, {
      dealId: options.dealId,
      to: "DELIVERED",
      data: { source: "seller_whatsapp", note: options.note }
    });
    await transaction.dealEvent.create({
      data: {
        dealId: options.dealId,
        type: "DELIVERY_SUBMITTED",
        actorId: options.sellerId,
        data: { note: options.note }
      }
    });
    return deal;
  });
}

export async function releaseDealToPayout(
  prisma: PrismaClient,
  options: {
    dealId: string;
    dealCode: string;
    sellerId: string;
    amountKobo: bigint;
    feePercent: number;
    payoutDetails?: { bankCode: string; accountNumber: string; accountName: string };
  }
) {
  if (!Number.isFinite(options.feePercent) || options.feePercent <= 0) {
    throw new Error("Escrow fee percentage must be a positive finite number.");
  }
  const feeKobo = (options.amountKobo * BigInt(Math.round(options.feePercent * 100))) / 10000n;
  if (options.amountKobo <= 0n || feeKobo >= options.amountKobo) {
    throw new Error("The escrow fee must be less than the deal amount.");
  }
  const sellerAmountKobo = options.amountKobo - feeKobo;
  const providerReference = `PULSE${options.dealCode}${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const payout = await prisma.$transaction(async (transaction) => {
    await transitionDealInTransaction(transaction, {
      dealId: options.dealId,
      to: "RELEASED",
      data: { source: "buyer_whatsapp", action: "release", feeKobo: feeKobo.toString(), sellerAmountKobo: sellerAmountKobo.toString() }
    });
    await transaction.ledgerEntry.create({
      data: {
        dealId: options.dealId,
        account: `deal:${options.dealId}:escrow`,
        direction: "DEBIT",
        amountKobo: options.amountKobo,
        reason: "Buyer released escrow after delivery"
      }
    });
    if (feeKobo > 0n) {
      await transaction.ledgerEntry.create({
        data: { dealId: options.dealId, account: "pulse:fees", direction: "CREDIT", amountKobo: feeKobo, reason: "Escrow service fee" }
      });
    }
    await transaction.ledgerEntry.create({
      data: {
        dealId: options.dealId,
        account: `seller:${options.sellerId}:payable`,
        direction: "CREDIT",
        amountKobo: sellerAmountKobo,
        reason: "Seller proceeds pending payout"
      }
    });
    return transaction.payout.create({
      data: {
        dealId: options.dealId,
        recipientId: options.sellerId,
        providerReference,
        amountKobo: sellerAmountKobo,
        ...(options.payoutDetails ?? {}),
        status: "READY"
      }
    });
  });

  return { payout, feeKobo, sellerAmountKobo, providerReference };
}
