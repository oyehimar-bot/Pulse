import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { transitionDealInTransaction } from "./deals/transitions.js";
import { appendLedgerEntry } from "./ledger.js";
import type { AppConfig } from "./config.js";

type PayazaWebhookPayload = {
  transaction_reference?: string;
  merchant_reference?: string;
  transaction_status?: string;
  status?: string;
  amount_received?: number | string;
  request_amount?: number | string;
  session_id?: string;
  narration?: string;
  response_code?: string;
  [key: string]: unknown;
};

type PayazaPaymentLinkResponse = {
  status?: boolean;
  data?: { id?: number; link?: string };
};

type PayazaLinkTransaction = {
  transaction_reference?: string;
  transaction_status?: string;
  transaction_amount?: number | string;
};

type PayazaLinkTransactionsResponse = {
  status?: boolean;
  data?: { items?: PayazaLinkTransaction[] };
};

type PaymentNotifier = { sendText(to: string, body: string, dealId?: string): Promise<unknown> };

class RetryablePayazaError extends Error {}

export type PayazaPaymentLink = { id: number; url: string };

export async function createPayazaPaymentLink(
  config: AppConfig,
  deal: { dealCode: string; description: string; amountKobo: bigint },
  fetcher: typeof fetch = fetch
): Promise<PayazaPaymentLink> {
  if (deal.amountKobo > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Deal amount is too large for Payaza's payment-link API.");
  }

  const response = await fetcher("https://api.payaza.africa/live/payment-link/merchant/create-payment-link", {
    method: "POST",
    headers: {
      Authorization: `Payaza ${Buffer.from(config.PAYAZA_PUBLIC_KEY_TEST, "utf8").toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      payment_link_name: `PulseDeal${deal.dealCode}`,
      payment_description: deal.description,
      has_fixed_amount: true,
      payment_amount: Number(deal.amountKobo) / 100,
      country_code: "NGA",
      currency_code: "NGN",
      collect_customer_first_and_last_name: false,
      collect_customer_email: false,
      collect_customer_phone_number: true,
      fee_bearer_type: "Business"
    })
  });

  if (!response.ok) throw new Error("Payaza could not create the payment link.");
  const result = await response.json() as PayazaPaymentLinkResponse;
  const linkId = result.data?.id;
  const linkUrl = result.data?.link;
  if (result.status !== true || typeof linkId !== "number" || !Number.isInteger(linkId) || typeof linkUrl !== "string") {
    throw new Error("Payaza returned an invalid payment link response.");
  }
  try {
    if (new URL(linkUrl).protocol !== "https:") throw new Error();
  } catch {
    throw new Error("Payaza returned an invalid payment link URL.");
  }

  return { id: linkId, url: linkUrl };
}

export async function getOrCreatePayazaPaymentLink(
  prisma: PrismaClient,
  config: AppConfig,
  deal: { id: string; dealCode: string; description: string; amountKobo: bigint }
): Promise<PayazaPaymentLink> {
  const existing = await prisma.payment.findFirst({
    where: { dealId: deal.id, status: "PENDING", payazaLinkId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { payazaLinkId: true, rawPayload: true }
  });
  const storedLink = existing?.rawPayload as { link?: unknown } | null;
  if (existing?.payazaLinkId && typeof storedLink?.link === "string") {
    return { id: existing.payazaLinkId, url: storedLink.link };
  }

  const link = await createPayazaPaymentLink(config, deal);
  await prisma.payment.create({
    data: {
      dealId: deal.id,
      providerReference: `payaza-link:${link.id}`,
      payazaLinkId: link.id,
      amountKobo: deal.amountKobo,
      rawPayload: asJson({ link: link.url })
    }
  });
  return link;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isSuccessfulStatus(payload: PayazaWebhookPayload): boolean {
  const status = `${payload.transaction_status ?? payload.status ?? ""}`.trim().toUpperCase();
  return ["NIP_SUCCESS", "SUCCESS", "COMPLETED", "FUNDS RECEIVED"].includes(status);
}

function isFailedStatus(payload: PayazaWebhookPayload): boolean {
  const status = `${payload.transaction_status ?? payload.status ?? ""}`.trim().toUpperCase();
  return ["NIP_FAILURE", "FAILED", "DECLINED", "TRANSACTION FAILED"].includes(status);
}

function amountToKobo(value: number | string | undefined): bigint {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  return BigInt(Math.round(amount * 100));
}

async function fetchPaymentLinkTransactions(
  config: AppConfig,
  linkId: number,
  fetcher: typeof fetch
): Promise<PayazaLinkTransaction[]> {
  let response: Response;
  try {
    response = await fetcher(`https://api.payaza.africa/live/payment-link/merchant/fetch-payment-link-transactions?link_id=${linkId}&page=1`, {
      headers: {
        Authorization: `Payaza ${Buffer.from(config.PAYAZA_PUBLIC_KEY_TEST, "utf8").toString("base64")}`
      }
    });
  } catch {
    throw new RetryablePayazaError("Payaza transaction lookup is temporarily unavailable.");
  }

  if (!response.ok) throw new RetryablePayazaError("Payaza transaction lookup is temporarily unavailable.");
  const result = await response.json() as PayazaLinkTransactionsResponse;
  if (result.status !== true || !Array.isArray(result.data?.items)) {
    throw new RetryablePayazaError("Payaza transaction lookup returned an invalid response.");
  }
  return result.data.items;
}

export function isValidPayazaSignature(rawBody: string | Buffer, header: string | undefined, secretKey: string): boolean {
  if (!header || !/^[A-Za-z0-9+/]{86}==$/.test(header)) return false;

  const supplied = Buffer.from(header, "base64");
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function processPendingPayazaEvents(
  prisma: PrismaClient,
  config: AppConfig,
  notifier: PaymentNotifier,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const events = await prisma.webhookEvent.findMany({
    where: { source: "PAYAZA", processedAt: null, processingError: null },
    orderBy: { receivedAt: "asc" },
    take: 25
  });

  for (const event of events) {
    try {
      const payload = event.payload as unknown as PayazaWebhookPayload;
      const providerReference = payload.transaction_reference;
      if (!providerReference) {
        throw new Error("Payaza payload is missing its transaction reference.");
      }

      const existingPayment = await prisma.payment.findUnique({
        where: { providerReference: String(providerReference) },
        select: { id: true, status: true }
      });

      if (existingPayment) {
        await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
        continue;
      }

      const success = isSuccessfulStatus(payload);
      const failure = isFailedStatus(payload);
      if (!success && !failure) {
        await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
        continue;
      }

      const reference = String(providerReference);
      const linkedPayments = await prisma.payment.findMany({
        where: { status: "PENDING", payazaLinkId: { not: null } },
        include: { deal: { include: { seller: true } } },
        orderBy: { createdAt: "asc" }
      });

      let match: { payment: typeof linkedPayments[number]; transaction: PayazaLinkTransaction } | undefined;
      for (const payment of linkedPayments) {
        if (payment.payazaLinkId === null) continue;
        const transactions = await fetchPaymentLinkTransactions(config, payment.payazaLinkId, fetcher);
        const transaction = transactions.find((item) => item.transaction_reference === reference);
        if (transaction) {
          match = { payment, transaction };
          break;
        }
      }

      if (!match) throw new RetryablePayazaError(`Transaction ${reference} is not yet visible for a pending payment link.`);

      const transactionSucceeded = match.transaction.transaction_status?.trim().toUpperCase() === "COMPLETED";
      const transactionFailed = match.transaction.transaction_status?.trim().toUpperCase() === "FAILED";
      if ((success && !transactionSucceeded) || (failure && !transactionFailed)) {
        throw new RetryablePayazaError(`Transaction ${reference} has not reached the webhook's terminal status in Payaza.`);
      }

      const amountKobo = amountToKobo(match.transaction.transaction_amount);
      if (success && amountKobo !== match.payment.amountKobo) {
        throw new Error(`Payaza transaction ${reference} amount does not match the deal amount.`);
      }

      let fundedDeal: { id: string; dealCode: string; buyerPhone: string | null; sellerPhone: string } | undefined;
      await prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUniqueOrThrow({ where: { id: match.payment.id }, include: { deal: { include: { seller: true } } } });
        if (payment.status !== "PENDING") {
          await transaction.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
          return;
        }

        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            providerReference: reference,
            status: success ? "SUCCEEDED" : "FAILED",
            ...(success ? { amountKobo } : {}),
            rawPayload: asJson(payload)
          }
        });

        if (success) {
          await transitionDealInTransaction(transaction, {
            dealId: payment.dealId,
            to: "FUNDED",
            data: { source: "payaza_webhook", providerReference: reference, amountKobo: amountKobo.toString() }
          });
          await appendLedgerEntry(transaction, {
            account: `deal:${payment.dealId}:escrow`,
            direction: "CREDIT",
            amountKobo,
            dealId: payment.dealId,
            reason: "Payaza payment received and escrow funded"
          });
          fundedDeal = {
            id: payment.deal.id,
            dealCode: payment.deal.dealCode,
            buyerPhone: payment.deal.buyerPhone,
            sellerPhone: payment.deal.seller.phone
          };
        }

        await transaction.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), processingError: null } });
      });

      if (fundedDeal) {
        const notice = `Payment received for deal ${fundedDeal.dealCode}. The funds are held in escrow while the seller prepares your license.`;
        await Promise.allSettled([
          ...(fundedDeal.buyerPhone ? [notifier.sendText(fundedDeal.buyerPhone, notice, fundedDeal.id)] : []),
          notifier.sendText(fundedDeal.sellerPhone, `Deal ${fundedDeal.dealCode} is funded. You can now prepare and deliver the licensed work.`, fundedDeal.id)
        ]);
      }
    } catch (error) {
      if (error instanceof RetryablePayazaError) continue;
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown Payaza processing error";
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { processingError: message } });
    }
  }
}

export function registerPayazaWebhook(app: FastifyInstance, prisma: PrismaClient, config: AppConfig, notifier: PaymentNotifier) {
  let workerScheduled = false;
  const recoveryTimer = setInterval(() => {
    if (workerScheduled) return;
    workerScheduled = true;
    setImmediate(() => {
      void processPendingPayazaEvents(prisma, config, notifier).catch(() => {
        app.log.error("Payaza webhook worker failed; pending events will be retried.");
      }).finally(() => {
        workerScheduled = false;
      });
    });
  }, 10000);
  recoveryTimer.unref();

  app.addHook("onClose", async () => clearInterval(recoveryTimer));

  app.post("/webhooks/payaza", { config: { rawBody: true } }, async (request, reply) => {
    const rawBody = request.rawBody;
    const signature = request.headers["x-payaza-signature"];
    if (typeof rawBody !== "string" || !isValidPayazaSignature(rawBody, typeof signature === "string" ? signature : undefined, config.PAYAZA_SECRET_KEY_TEST)) {
      request.log.warn({ requestId: request.id }, "Rejected Payaza webhook with invalid signature");
      return reply.code(401).send({ error: "Invalid Payaza webhook signature." });
    }

    const payload = request.body as PayazaWebhookPayload;
    if (!payload || typeof payload !== "object") {
      return reply.code(400).send({ error: "Invalid Payaza webhook payload." });
    }

    const providerReference = payload.transaction_reference;
    if (!providerReference) {
      return reply.code(400).send({ error: "Payaza webhook payload missing a transaction reference." });
    }

    const rows = [{
      source: "PAYAZA" as const,
      externalId: `payaza:${String(providerReference)}:${String(payload.transaction_status ?? payload.status ?? "unknown").toLowerCase()}`,
      payload: asJson(payload)
    }];

    await prisma.webhookEvent.createMany({ data: rows, skipDuplicates: true });
    if (rows.length > 0) {
      workerScheduled = true;
      setImmediate(() => {
        void processPendingPayazaEvents(prisma, config, notifier).catch(() => {
          app.log.error("Payaza webhook worker failed while processing a queued event.");
        }).finally(() => {
          workerScheduled = false;
        });
      });
    }

    return reply.code(200).send({ status: "ok" });
  });

  return { processPendingPayazaEvents };
}