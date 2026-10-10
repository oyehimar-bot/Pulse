import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { consumeWhatsAppProof } from "../auth/service.js";
import {
  buildDealSummaryText,
  buildDraftReply,
  buildSellerShareMessage,
  clearBuyerDecisionContext,
  clearSellerDraft,
  confirmSellerDraft,
  getBuyerDecisionContext,
  getDraftStage,
  getSellerDraft,
  markDraftAwaitingVerification,
  nextDraftPrompt,
  normalizePhoneNumber,
  parseDealDraftText,
  setBuyerDecisionContext,
  setSellerDraft
} from "../deals/drafting.js";
import { transitionDeal } from "../deals/transitions.js";
import { getOrCreatePayazaPaymentLink } from "../payaza.js";
import { WhatsAppSender } from "../whatsapp/sender.js";

const graphApiBase = "https://graph.facebook.com";
const verifyQuerySchema = {
  type: "object",
  properties: {
    "hub.mode": { type: "string" },
    "hub.verify_token": { type: "string" },
    "hub.challenge": { type: "string" }
  }
} as const;

type MetaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
};

type MetaStatus = {
  id: string;
  status: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type MetaPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMessage[];
        statuses?: MetaStatus[];
      };
    }>;
  }>;
};

type QueueItem = { externalId: string; kind: "message" | "status"; value: MetaMessage | MetaStatus };

export function isValidMetaSignature(rawBody: string | Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const supplied = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function extractQueueItems(payload: MetaPayload): QueueItem[] {
  const items: QueueItem[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      for (const message of change.value?.messages ?? []) {
        if (message.id && message.from) items.push({ externalId: `message:${message.id}`, kind: "message", value: message });
      }
      for (const status of change.value?.statuses ?? []) {
        if (status.id && status.status) {
          const statusKey = `${status.id}:${status.status}:${status.timestamp ?? ""}`;
          items.push({ externalId: `status:${statusKey}`, kind: "status", value: status });
        }
      }
    }
  }
  return items;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizePhone(phone: string): string {
  return `+${phone.replace(/\D/g, "")}`;
}

function messageBody(message: MetaMessage): string {
  if (message.type === "text" && message.text?.body) return message.text.body;
  const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (reply) return reply.id ? `${reply.id} ${reply.title ?? ""}`.trim() : reply.title ?? "";
  return message.type ? `[${message.type} message]` : "[WhatsApp message]";
}

async function findActiveDeal(prisma: PrismaClient, phone: string, userId?: string) {
  const activeStatuses = ["AWAITING_BUYER", "AWAITING_PAYMENT", "FUNDED", "DELIVERED", "DISPUTED"] as const;
  return prisma.deal.findFirst({
    where: {
      status: { in: [...activeStatuses] },
      OR: [
        { buyerPhone: phone },
        ...(userId ? [{ sellerId: userId }, { buyerId: userId }] : [])
      ]
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });
}

async function processMessage(
  prisma: PrismaClient,
  config: AppConfig,
  event: { id: string; payload: Prisma.JsonValue },
  sender: WhatsAppSender
) {
  const queued = event.payload as unknown as { kind: "message"; value: MetaMessage };
  const incoming = queued.value;
  const phone = normalizePhone(incoming.from);
  const body = messageBody(incoming);

  if (/^\d{6}$/.test(body)) {
    await consumeWhatsAppProof(prisma, config, phone, body);
  }

  const currentDraft = getSellerDraft(phone);
  const stage = getDraftStage(phone);
  const buyerDecisionCode = getBuyerDecisionContext(phone);

  if (body.toLowerCase().includes("accept_deal") || body.toLowerCase().includes("decline_deal")) {
    const fallbackDeal = buyerDecisionCode ? null : await prisma.deal.findFirst({
      where: { buyerPhone: phone, status: "AWAITING_BUYER" },
      select: { dealCode: true },
      orderBy: { createdAt: "desc" }
    });
    const pendingCode = buyerDecisionCode ?? fallbackDeal?.dealCode;
    if (!pendingCode) {
      await sender.sendText(phone, "That deal is no longer open for buyer entry. Ask the seller for a fresh link.");
    } else {
      const pendingDeal = await prisma.deal.findFirst({
        where: { dealCode: pendingCode, status: "AWAITING_BUYER" },
        include: { seller: true }
      });
      if (!pendingDeal) {
        await sender.sendText(phone, "That deal is no longer open for buyer entry. Ask the seller for a fresh link.");
      } else {
        const buyerUser = await prisma.user.findUnique({ where: { phone }, select: { id: true, isPhoneVerified: true } });
        const nextStatus = body.toLowerCase().includes("accept_deal") ? "AWAITING_PAYMENT" : "EXPIRED";
        await prisma.deal.update({
          where: { id: pendingDeal.id },
          data: {
            buyerPhone: phone,
            buyerId: buyerUser?.id ?? pendingDeal.buyerId ?? null,
            buyerVerifiedOnPulse: buyerUser?.isPhoneVerified ?? false,
          }
        });

        let paymentLink: { id: number; url: string } | undefined;
        if (nextStatus === "AWAITING_PAYMENT") {
          paymentLink = await getOrCreatePayazaPaymentLink(prisma, config, pendingDeal);
        }

        await transitionDeal(prisma, {
          dealId: pendingDeal.id,
          to: nextStatus,
          ...(buyerUser?.id ? { actorId: buyerUser.id } : {}),
          data: { source: "buyer_decision" }
        });
        clearBuyerDecisionContext(phone);
        const sellerMessage = nextStatus === "AWAITING_PAYMENT"
          ? `The buyer accepted deal ${pendingDeal.dealCode}. Payment is now awaiting completion.`
          : `${pendingDeal.seller.displayName ?? "Your seller"} saw the deal declined and it is now closed.`;
        await sender.sendText(pendingDeal.seller.phone, sellerMessage);
        if (paymentLink) {
          await sender.sendText(phone, `Deal accepted. Pay ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(pendingDeal.amountKobo) / 100)} securely through Payaza:\n${paymentLink.url}`, pendingDeal.id);
        }
      }
    }
  } else if (/^DEAL-[A-Z0-9]{6,8}$/i.test(body)) {
    const normalizedCode = body.trim().replace(/^DEAL-/i, "").toUpperCase();
    const deal = await prisma.deal.findFirst({
      where: { dealCode: normalizedCode, status: "AWAITING_BUYER" },
      include: { seller: true }
    });

    if (!deal) {
      await sender.sendText(phone, "That deal link is not open or has already moved past buyer entry. Ask the seller for a fresh link.");
    } else {
      const buyerUser = await prisma.user.findUnique({ where: { phone }, select: { id: true, isPhoneVerified: true } });
      const buyerPhone = normalizePhoneNumber(phone);
      const updated = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          buyerPhone,
          buyerId: buyerUser?.id ?? deal.buyerId ?? null,
          buyerVerifiedOnPulse: buyerUser?.isPhoneVerified ?? false,
        }
      });

      const itemSummary = Array.isArray(updated.items) ? updated.items.map((item) => {
        const record = item as { description?: string; quantity?: number };
        return `${record.quantity ?? 1} ${record.description ?? "item"}`;
      }).join(", ") : `${updated.description}`;

      const buyerMessage = [
        `Seller: ${deal.seller.displayName ?? "Pulse seller"} (${deal.seller.pulseId})`,
        ...(deal.verificationPhrase ? ["Your seller said you'd recognize this phrase.", deal.verificationPhrase] : []),
        buildDealSummaryText(itemSummary, deal.rightsText, deal.amountKobo, buyerPhone),
        ""
      ].join("\n");

      setBuyerDecisionContext(phone, deal.dealCode);
      await sender.sendReplyButtons(phone, buyerMessage, [
        { id: "accept_deal", title: "Accept Deal" },
        { id: "decline_deal", title: "Decline Deal" }
      ]);
    }
  } else if (body.includes("deal_confirm")) {
    if (currentDraft) {
      markDraftAwaitingVerification(phone);
      await sender.sendText(phone, nextDraftPrompt());
    }
  } else if (body.includes("deal_edit")) {
    clearSellerDraft(phone);
    await sender.sendText(phone, "Please send the corrected deal message and I will refresh the draft.");
  } else if (stage === "AWAITING_VERIFICATION") {
    const phrase = body.trim().toUpperCase() === "SKIP" ? null : body.trim() || null;
    const createdDeal = await confirmSellerDraft(prisma, phone, phrase);
    if (createdDeal) {
      const draft = getSellerDraft(phone);
      const shareDraft = draft ?? currentDraft;
      if (shareDraft) {
        await sender.sendText(phone, buildSellerShareMessage(shareDraft, createdDeal.dealCode));
      } else {
        await sender.sendText(phone, `Deal ${createdDeal.dealCode} is ready to share with your buyer.`);
      }
    } else {
      await sender.sendText(phone, "I could not save that draft. Please send the deal message again to start a fresh draft.");
    }
  } else {
    const parsedDraft = await parseDealDraftText(body);
    if (parsedDraft) {
      setSellerDraft(phone, parsedDraft);
      await sender.sendReplyButtons(phone, buildDraftReply(parsedDraft), [
        { id: "deal_confirm", title: "Confirm Deal" },
        { id: "deal_edit", title: "Edit Deal" }
      ]);
    }
  }

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  const deal = await findActiveDeal(prisma, phone, user?.id);
  await prisma.message.upsert({
    where: { whatsappId: incoming.id },
    create: {
      direction: "INBOUND",
      whatsappId: incoming.id,
      senderPhone: phone,
      body,
      ...(user ? { userId: user.id } : {}),
      ...(deal ? { dealId: deal.id } : {})
    },
    update: {
      ...(user ? { userId: user.id } : {}),
      ...(deal ? { dealId: deal.id } : {})
    }
  });
}

async function processStatus(prisma: PrismaClient, event: { payload: Prisma.JsonValue }) {
  const queued = event.payload as unknown as { kind: "status"; value: MetaStatus };
  const status = queued.value;
  if (status.status === "failed") {
    const firstError = status.errors?.[0];
    const reason = firstError?.code === 131047
      ? "WhatsApp send failed because the 24-hour customer service window is closed."
      : `WhatsApp delivery failed${firstError?.code ? ` (Meta error ${firstError.code})` : ""}${firstError?.title ? `: ${firstError.title}` : ""}.`;
    await prisma.message.updateMany({
      where: { whatsappId: status.id, direction: "OUTBOUND" },
      data: { deliveryError: reason }
    });
  } else if (["sent", "delivered", "read"].includes(status.status)) {
    await prisma.message.updateMany({
      where: { whatsappId: status.id, direction: "OUTBOUND" },
      data: { deliveryError: null }
    });
  }
}

export async function processPendingMetaEvents(prisma: PrismaClient, config: AppConfig, sender = new WhatsAppSender(prisma, config)): Promise<void> {
  const events = await prisma.webhookEvent.findMany({
    where: { source: "META", processedAt: null, processingError: null },
    orderBy: { receivedAt: "asc" },
    take: 25
  });

  for (const event of events) {
    try {
      const payload = event.payload as unknown as { kind: string };
      if (payload.kind === "message") await processMessage(prisma, config, event, sender);
      else if (payload.kind === "status") await processStatus(prisma, event);
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing error";
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { processingError: message } });
    }
  }
}

export function registerWhatsAppWebhook(app: FastifyInstance, prisma: PrismaClient, config: AppConfig) {
  const sender = new WhatsAppSender(prisma, config);
  let workerScheduled = false;
  const recoveryTimer = setInterval(() => scheduleWorker(), 1500);
  recoveryTimer.unref();
  app.addHook("onClose", async () => clearInterval(recoveryTimer));

  const scheduleWorker = () => {
    if (workerScheduled) return;
    workerScheduled = true;
    setImmediate(() => {
      void processPendingMetaEvents(prisma, config, sender).catch(() => {
        app.log.error("WhatsApp webhook worker failed; pending events will be retried.");
      }).finally(() => {
        workerScheduled = false;
      });
    });
  };

  app.get<{ Querystring: Record<string, string | undefined> }>("/webhooks/whatsapp", { schema: { querystring: verifyQuerySchema } }, async (request, reply) => {
    const mode = request.query["hub.mode"];
    const verifyToken = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];
    if (mode !== "subscribe" || verifyToken !== config.WHATSAPP_VERIFY_TOKEN || !challenge) {
      return reply.code(403).send("Forbidden");
    }
    return reply.type("text/plain").send(challenge);
  });

  app.post("/webhooks/whatsapp", { config: { rawBody: true } }, async (request, reply) => {
    const rawBody = request.rawBody;
    const signature = request.headers["x-hub-signature-256"];
    if (typeof rawBody !== "string" || !isValidMetaSignature(rawBody, typeof signature === "string" ? signature : undefined, config.WHATSAPP_APP_SECRET)) {
      request.log.warn({ requestId: request.id }, "Rejected WhatsApp webhook with invalid signature");
      return reply.code(401).send({ error: "Invalid webhook signature." });
    }

    const payload = request.body as MetaPayload;
    if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
      return reply.code(400).send({ error: "Invalid WhatsApp webhook payload." });
    }

    const items = payload.entry?.flatMap((entry) => entry.changes ?? [])
      .filter((change) => change.field === "messages" && change.value?.metadata?.phone_number_id === config.WHATSAPP_PHONE_NUMBER_ID)
      .flatMap((change) => extractQueueItems({
        object: "whatsapp_business_account",
        entry: [{ changes: [change] }]
      })) ?? [];
    const rows = items.map((item) => ({
      source: "META" as const,
      externalId: item.externalId,
      payload: asJson({ kind: item.kind, value: item.value }),
      ...(item.kind === "message" ? { receivedAt: new Date() } : {})
    }));
    if (rows.length) {
      await prisma.webhookEvent.createMany({ data: rows, skipDuplicates: true });
      scheduleWorker();
    }
    return reply.code(200).send({ status: "ok" });
  });

  return { scheduleWorker };
}

export type { MetaPayload, MetaMessage, MetaStatus };
export { graphApiBase };
