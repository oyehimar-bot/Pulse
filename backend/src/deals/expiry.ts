import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { InvalidDealTransitionError, transitionDeal } from "./transitions.js";

export async function expireUnacceptedDeals(prisma: PrismaClient, now = new Date()): Promise<number> {
  const deals = await prisma.deal.findMany({
    where: { status: "AWAITING_BUYER", expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: 100
  });

  let expiredCount = 0;
  for (const deal of deals) {
    try {
      await transitionDeal(prisma, {
        dealId: deal.id,
        to: "EXPIRED",
        data: { source: "deal_expiry_worker" }
      });
      expiredCount += 1;
    } catch (error) {
      if (!(error instanceof InvalidDealTransitionError)) throw error;
    }
  }
  return expiredCount;
}

export function registerDealExpiryWorker(app: FastifyInstance, prisma: PrismaClient) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void expireUnacceptedDeals(prisma).catch(() => {
      app.log.error("Deal expiry worker failed; expired deals will be retried.");
    }).finally(() => {
      running = false;
    });
  }, 60_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
  return { expireUnacceptedDeals: () => expireUnacceptedDeals(prisma) };
}