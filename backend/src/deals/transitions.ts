import { DealStatus, Prisma, PrismaClient } from "@prisma/client";

export class InvalidDealTransitionError extends Error {
  constructor(from: DealStatus, to: DealStatus) {
    super(`Deal cannot transition from ${from} to ${to}.`);
    this.name = "InvalidDealTransitionError";
  }
}

const allowedTransitions: Record<DealStatus, readonly DealStatus[]> = {
  DRAFT: ["AWAITING_BUYER", "EXPIRED"],
  AWAITING_BUYER: ["AWAITING_PAYMENT", "DISPUTED", "EXPIRED"],
  AWAITING_PAYMENT: ["FUNDED", "DISPUTED", "EXPIRED"],
  FUNDED: ["DELIVERED", "DISPUTED", "REFUNDED"],
  DELIVERED: ["RELEASED", "DISPUTED", "REFUNDED"],
  RELEASED: [],
  DISPUTED: ["REFUNDED", "RELEASED"],
  REFUNDED: [],
  EXPIRED: []
};

type TransitionOptions = {
  dealId: string;
  to: DealStatus;
  actorId?: string;
  messageId?: string;
  data?: Prisma.InputJsonValue;
};

export async function transitionDeal(
  client: PrismaClient,
  options: TransitionOptions
) {
  return client.$transaction(async (transaction: Prisma.TransactionClient) => {
    const deal = await transaction.deal.findUnique({ where: { id: options.dealId } });
    if (!deal) throw new Error(`Deal ${options.dealId} was not found.`);

    if (!allowedTransitions[deal.status]?.includes(options.to)) {
      throw new InvalidDealTransitionError(deal.status, options.to);
    }

    const updated = await transaction.deal.updateMany({
      where: { id: deal.id, status: deal.status },
      data: {
        status: options.to,
        ...(options.to === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(options.to === "RELEASED" ? { releasedAt: new Date() } : {})
      }
    });

    if (updated.count !== 1) {
      throw new Error(`Deal ${deal.id} changed during its transition. Retry the operation.`);
    }

    await transaction.dealEvent.create({
      data: {
        dealId: deal.id,
        type: "STATUS_TRANSITION",
        fromStatus: deal.status,
        toStatus: options.to,
        ...(options.actorId ? { actorId: options.actorId } : {}),
        ...(options.messageId ? { messageId: options.messageId } : {}),
        data: options.data ?? {}
      }
    });

    return transaction.deal.findUniqueOrThrow({ where: { id: deal.id } });
  });
}