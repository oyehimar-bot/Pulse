import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export type DealDraft = {
  amountKobo: bigint;
  quantity: number;
  itemDescription: string;
  rightsText: string;
  buyerPhone: string;
};

type DraftStage = "AWAITING_CONFIRMATION" | "AWAITING_VERIFICATION";

const activeDrafts = new Map<string, DealDraft>();
const draftStages = new Map<string, DraftStage>();
const buyerDecisionMap = new Map<string, string>();

export const DEAL_SHARE_NUMBER = "15556546846";

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.startsWith("234")) return `+${digits}`;
  return `+${digits}`;
}

export function setSellerDraft(sellerPhone: string, draft: DealDraft) {
  const normalized = normalizePhoneNumber(sellerPhone);
  activeDrafts.set(normalized, draft);
  draftStages.set(normalized, "AWAITING_CONFIRMATION");
}

export function getSellerDraft(sellerPhone: string): DealDraft | undefined {
  return activeDrafts.get(normalizePhoneNumber(sellerPhone));
}

export function getDraftStage(sellerPhone: string): DraftStage | undefined {
  return draftStages.get(normalizePhoneNumber(sellerPhone));
}

export function markDraftAwaitingVerification(sellerPhone: string) {
  const normalized = normalizePhoneNumber(sellerPhone);
  if (!activeDrafts.has(normalized)) return;
  draftStages.set(normalized, "AWAITING_VERIFICATION");
}

export function clearSellerDraft(sellerPhone: string) {
  const normalized = normalizePhoneNumber(sellerPhone);
  activeDrafts.delete(normalized);
  draftStages.delete(normalized);
}

export function setBuyerDecisionContext(phone: string, dealCode: string) {
  buyerDecisionMap.set(normalizePhoneNumber(phone), dealCode);
}

export function getBuyerDecisionContext(phone: string): string | undefined {
  return buyerDecisionMap.get(normalizePhoneNumber(phone));
}

export function clearBuyerDecisionContext(phone: string) {
  buyerDecisionMap.delete(normalizePhoneNumber(phone));
}

export function buildDealShareLink(code: string): string {
  return `https://wa.me/${DEAL_SHARE_NUMBER}?text=DEAL-${code.toUpperCase()}`;
}

export function createShortDealCode(): string {
  let code = "";
  do {
    code = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();
  } while (!/^[A-Z0-9]{6,8}$/.test(code));
  return code;
}

function parseRegexDraft(rawText: string): DealDraft | null {
  const text = rawText.trim();

  const match = text.match(/N\s*(\d+(?:\.\d+)?)(k)?\s+for\s+(\d+)\s+(.+?)(?:,\s*([^,]+?))?\s*,?\s*buyer\s+is\s*(\+?[0-9]\d{9,14})/i);
  if (!match) return null;

  const amountNumber = Number(match[1]);
  const amountKobo = BigInt(Math.round(amountNumber * (match[2] ? 1000 : 1) * 100));
  const quantity = Number(match[3]);
  const itemDescription = (match[4] ?? "item").trim();
  const rightsText = (match[5] ?? "full rights").trim();
  const buyerPhoneValue = match[6] ?? "";
  const buyerPhone = normalizePhoneNumber(buyerPhoneValue);

  if (!itemDescription || !rightsText || !buyerPhone || amountKobo <= 0n || quantity < 1) {
    return null;
  }

  return {
    amountKobo,
    quantity,
    itemDescription,
    rightsText,
    buyerPhone
  };
}

async function parseWithAnthropic(rawText: string): Promise<DealDraft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 256,
        temperature: 0,
        system: "Extract a sales deal from seller chat. Return ONLY a JSON object with keys: amountKobo, quantity, itemDescription, rightsText, buyerPhone. The amountKobo should be the integer value in kobo. buyerPhone must be in international format like +2348012345678.",
        messages: [{ role: "user", content: `Extract the deal from this exact seller message:\n${rawText}` }]
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text = data.content?.find((part) => part.type === "text")?.text ?? "";
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as Partial<DealDraft> & { amountKobo?: number | string; buyerPhone?: string };
    const amountKobo = typeof parsed.amountKobo === "bigint" ? parsed.amountKobo : BigInt(parsed.amountKobo ?? "0");
    const buyerPhone = parsed.buyerPhone ? normalizePhoneNumber(parsed.buyerPhone) : "";
    const itemDescription = (parsed.itemDescription ?? "").trim();
    const rightsText = (parsed.rightsText ?? "").trim();
    if (!itemDescription || !rightsText || !buyerPhone || !amountKobo || !parsed.quantity) {
      return null;
    }

    return {
      amountKobo,
      quantity: Number(parsed.quantity),
      itemDescription,
      rightsText,
      buyerPhone
    };
  } catch {
    return null;
  }
}

export async function parseDealDraftText(rawText: string): Promise<DealDraft | null> {
  const normalizedText = rawText.trim();
  if (!normalizedText) return null;

  const aiDraft = await parseWithAnthropic(normalizedText);
  if (aiDraft) return aiDraft;

  return parseRegexDraft(normalizedText);
}

export function buildDraftReply(draft: DealDraft): string {
  const amountNaira = Number(draft.amountKobo) / 100;
  return [
    "Draft deal",
    `Items: ${draft.quantity} ${draft.itemDescription}`,
    `Rights: ${draft.rightsText}`,
    `Amount: ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amountNaira)}`,
    `Buyer: ${draft.buyerPhone}`,
    ""
  ].join("\n");
}

export function buildDealSummaryText(
  items: string,
  rightsText: string,
  amountKobo: bigint,
  buyerPhone: string
): string {
  const amountNaira = Number(amountKobo) / 100;
  return [
    "Deal summary",
    `Items: ${items}`,
    `Rights: ${rightsText}`,
    `Amount: ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amountNaira)}`,
    `Buyer: ${buyerPhone}`
  ].join("\n");
}

export function buildSellerShareMessage(draft: DealDraft, dealCode: string): string {
  return [
    buildDealSummaryText(`${draft.quantity} ${draft.itemDescription}`, draft.rightsText, draft.amountKobo, draft.buyerPhone),
    "",
    buildDealShareLink(dealCode),
    "Share this link in your existing chat with your buyer. They tap it, message Pulse, and the deal opens for them."
  ].join("\n");
}

export async function confirmSellerDraft(prisma: PrismaClient, sellerPhone: string, verificationPhrase?: string | null) {
  const draft = getSellerDraft(sellerPhone);
  if (!draft) return null;

  const seller = await prisma.user.findUnique({
    where: { phone: normalizePhoneNumber(sellerPhone) },
    select: { id: true, phone: true, displayName: true }
  });
  if (!seller) return null;

  const buyerPhone = normalizePhoneNumber(draft.buyerPhone);
  const buyer = await prisma.user.upsert({
    where: { phone: buyerPhone },
    update: { isBuyer: true },
    create: {
      phone: buyerPhone,
      pulseId: `PULSE-${randomBytes(4).toString("hex").toUpperCase()}`,
      displayName: "Buyer",
      isBuyer: true,
      isPhoneVerified: false,
      verificationPhrase: "Not set"
    }
  });

  let dealCode = createShortDealCode();
  while (await prisma.deal.findUnique({ where: { dealCode } })) {
    dealCode = createShortDealCode();
  }

  const created = await prisma.deal.create({
    data: {
      dealCode,
      sellerId: seller.id,
      buyerId: buyer.id,
      buyerPhone: buyer.phone,
      description: `${draft.quantity} ${draft.itemDescription}`,
      items: [{ description: draft.itemDescription, quantity: draft.quantity }],
      rightsText: draft.rightsText,
      amountKobo: draft.amountKobo,
      status: "AWAITING_BUYER",
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      buyerVerifiedOnPulse: buyer.isPhoneVerified,
      verificationPhrase: verificationPhrase && verificationPhrase.trim().toUpperCase() !== "SKIP" ? verificationPhrase.trim() : null,
      events: {
        create: {
          type: "DEAL_CREATED",
          toStatus: "AWAITING_BUYER",
          actorId: seller.id,
          data: { source: "chat_draft" }
        }
      }
    }
  });

  clearSellerDraft(sellerPhone);
  return created;
}

export function draftForSellerReply(sellerPhone: string, body: string): boolean {
  const draftState = getDraftStage(sellerPhone);
  if (draftState === "AWAITING_VERIFICATION") {
    return true;
  }

  if (body.includes("deal_confirm")) return true;
  if (body.includes("deal_edit")) return true;
  return Boolean(getSellerDraft(sellerPhone));
}

export function nextDraftPrompt(): string {
  return "Set a verification phrase only your buyer would recognize from your earlier chat (optional, reply SKIP to skip).";
}
