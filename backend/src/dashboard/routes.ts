import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { findSessionUser } from "../auth/service.js";
import type { AppConfig } from "../config.js";

const sessionCookieName = "pulse_session";

function readSessionToken(cookieHeader: string | undefined): string | undefined {
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`));
  return value?.slice(sessionCookieName.length + 1);
}

function dealWhere(user: { id: string; phone: string }) {
  return {
    OR: [
      { sellerId: user.id },
      { buyerId: user.id },
      { buyerPhone: user.phone }
    ]
  };
}

export function registerDashboardRoutes(app: FastifyInstance, prisma: PrismaClient, config: AppConfig) {
  app.get("/api/dashboard", async (request, reply) => {
    const session = await findSessionUser(prisma, readSessionToken(request.headers.cookie));
    if (!session) return reply.code(401).send({ error: "Authentication required." });

    const deals = await prisma.deal.findMany({
      where: dealWhere(session.user),
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        dealCode: true,
        description: true,
        amountKobo: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deliveredAt: true,
        releasedAt: true,
        sellerId: true,
        buyerId: true,
        seller: { select: { displayName: true, pulseId: true } },
        buyer: { select: { displayName: true, pulseId: true } },
        license: { select: { certificateNumber: true, sha256Hash: true, createdAt: true } },
        payout: { select: { status: true, amountKobo: true } }
      }
    });
    const active = deals.filter((deal) => ["AWAITING_BUYER", "AWAITING_PAYMENT", "FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status));
    const totalValueKobo = deals.reduce((total, deal) => total + deal.amountKobo, 0n);

    return reply.send({
      user: session.user,
      summary: {
        activeDeals: active.length,
        completedDeals: deals.filter((deal) => ["RELEASED", "REFUNDED"].includes(deal.status)).length,
        totalDeals: deals.length,
        totalValueKobo: totalValueKobo.toString()
      },
      deals: deals.map((deal) => ({
        ...deal,
        amountKobo: deal.amountKobo.toString(),
        payout: deal.payout ? { ...deal.payout, amountKobo: deal.payout.amountKobo.toString() } : null,
        role: deal.sellerId === session.user.id ? "SELLER" : "BUYER",
        counterparty: deal.sellerId === session.user.id
          ? (deal.buyer?.displayName ?? "Buyer")
          : (deal.seller.displayName ?? deal.seller.pulseId)
      }))
    });
  });

  app.get<{ Params: { dealCode: string } }>("/api/deals/:dealCode", async (request, reply) => {
    const session = await findSessionUser(prisma, readSessionToken(request.headers.cookie));
    if (!session) return reply.code(401).send({ error: "Authentication required." });

    const deal = await prisma.deal.findFirst({
      where: { dealCode: request.params.dealCode.toUpperCase(), ...dealWhere(session.user) },
      include: {
        seller: { select: { displayName: true, pulseId: true } },
        buyer: { select: { displayName: true, pulseId: true } },
        events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, fromStatus: true, toStatus: true, data: true, createdAt: true } },
        ledgerEntries: { orderBy: { createdAt: "asc" }, select: { id: true, account: true, direction: true, amountKobo: true, reason: true, createdAt: true } },
        messages: { orderBy: { sentAt: "asc" }, take: 100, select: { id: true, direction: true, senderPhone: true, body: true, sentAt: true, deliveryError: true } },
        payments: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, amountKobo: true, createdAt: true, updatedAt: true } },
        payout: { select: { status: true, amountKobo: true, createdAt: true, updatedAt: true } },
        license: { select: { certificateNumber: true, sha256Hash: true, createdAt: true } }
      }
    });
    if (!deal) return reply.code(404).send({ error: "Deal not found." });

    return reply.send({
      deal: {
        ...deal,
        amountKobo: deal.amountKobo.toString(),
        ledgerEntries: deal.ledgerEntries.map((entry) => ({ ...entry, amountKobo: entry.amountKobo.toString() })),
        payments: deal.payments.map((payment) => ({ ...payment, amountKobo: payment.amountKobo.toString() })),
        payout: deal.payout ? { ...deal.payout, amountKobo: deal.payout.amountKobo.toString() } : null,
        role: deal.sellerId === session.user.id ? "SELLER" : "BUYER",
        license: deal.license ? {
          ...deal.license,
          verificationUrl: new URL(`/verify/${encodeURIComponent(deal.license.certificateNumber)}`, config.FRONTEND_URL).toString(),
          pdfUrl: new URL(`/licenses/${encodeURIComponent(deal.license.certificateNumber)}.pdf`, config.PUBLIC_BASE_URL).toString()
        } : null
      }
    });
  });

  app.get("/api/licenses", async (request, reply) => {
    const session = await findSessionUser(prisma, readSessionToken(request.headers.cookie));
    if (!session) return reply.code(401).send({ error: "Authentication required." });

    const licenses = await prisma.license.findMany({
      where: { deal: dealWhere(session.user) },
      orderBy: { createdAt: "desc" },
      select: {
        certificateNumber: true,
        sha256Hash: true,
        createdAt: true,
        deal: { select: { dealCode: true, description: true, rightsText: true, amountKobo: true } }
      }
    });
    return reply.send({ licenses: licenses.map((license) => ({
      ...license,
      deal: { ...license.deal, amountKobo: license.deal.amountKobo.toString() },
      verificationUrl: new URL(`/verify/${encodeURIComponent(license.certificateNumber)}`, config.FRONTEND_URL).toString(),
      pdfUrl: new URL(`/licenses/${encodeURIComponent(license.certificateNumber)}.pdf`, config.PUBLIC_BASE_URL).toString()
    })) });
  });
}
