import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { graphApiBase } from "../webhooks/whatsapp.js";

export type ReplyButton = { id: string; title: string };
export type WhatsAppDocument = { bytes: Uint8Array; fileName: string; mimeType: string; caption?: string };

type MetaApiErrorBody = { error?: { message?: string; code?: number; error_subcode?: number } };
type MetaSendResponse = { messages?: Array<{ id?: string }> };
type MetaMediaResponse = { id?: string };

export class WhatsAppSendError extends Error {
  constructor(message: string, readonly providerCode?: number) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

function phoneForGraphApi(phone: string): string {
  return phone.replace(/\D/g, "");
}

function failedMessageText(error: WhatsAppSendError): string {
  if (error.providerCode === 131047) {
    return "WhatsApp send failed because the 24-hour customer service window is closed.";
  }
  return `WhatsApp send failed${error.providerCode ? ` (Meta error ${error.providerCode})` : ""}.`;
}

export class WhatsAppSender {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly logger: Pick<Console, "warn"> = console
  ) {}

  async sendText(to: string, body: string, dealId?: string) {
    return this.sendMessage(to, body, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForGraphApi(to),
      type: "text",
      text: { preview_url: false, body }
    }, dealId);
  }

  async sendReplyButtons(to: string, body: string, buttons: ReplyButton[], dealId?: string) {
    if (buttons.length < 1 || buttons.length > 3) throw new Error("WhatsApp reply messages require one to three buttons.");
    for (const button of buttons) {
      if (!button.id || button.id.length > 256 || !button.title || button.title.length > 20) {
        throw new Error("WhatsApp button IDs must be present and titles must be at most 20 characters.");
      }
    }

    return this.sendMessage(to, body, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForGraphApi(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((button) => ({
            type: "reply",
            reply: { id: button.id, title: button.title }
          }))
        }
      }
    }, dealId);
  }

  async sendDocument(to: string, document: WhatsAppDocument, dealId?: string) {
    const userId = await this.recipientUserId(to);
    const outbound = await this.prisma.message.create({
      data: {
        direction: "OUTBOUND",
        senderPhone: this.config.PULSE_WHATSAPP_NUMBER,
        body: document.caption ?? `Document: ${document.fileName}`,
        ...(userId ? { userId } : {}),
        ...(dealId ? { dealId } : {}),
      }
    });

    try {
      const media = await this.uploadMedia(document);
      const response = await this.postMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneForGraphApi(to),
        type: "document",
        document: {
          id: media.id,
          filename: document.fileName,
          ...(document.caption ? { caption: document.caption } : {})
        }
      });
      const whatsappId = response.messages?.[0]?.id;
      if (!whatsappId) throw new WhatsAppSendError("Meta returned no message ID.");
      await this.prisma.message.update({ where: { id: outbound.id }, data: { whatsappId } });
      return { id: outbound.id, whatsappId };
    } catch (error) {
      const sendError = normalizeError(error);
      await this.prisma.message.update({ where: { id: outbound.id }, data: { deliveryError: failedMessageText(sendError) } });
      this.logger.warn({
        event: "whatsapp_send_failed",
        messageId: outbound.id,
        providerCode: sendError.providerCode ?? null
      }, failedMessageText(sendError));
      throw sendError;
    }
  }

  private async recipientUserId(phone: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({ where: { phone: `+${phoneForGraphApi(phone)}` }, select: { id: true } });
    return user?.id;
  }

  private async sendMessage(to: string, body: string, payload: Record<string, unknown>, dealId?: string) {
    const userId = await this.recipientUserId(to);
    const outbound = await this.prisma.message.create({
      data: {
        direction: "OUTBOUND",
        senderPhone: this.config.PULSE_WHATSAPP_NUMBER,
        body,
        ...(userId ? { userId } : {}),
        ...(dealId ? { dealId } : {})
      }
    });

    try {
      const response = await this.postMessage(payload);
      const whatsappId = response.messages?.[0]?.id;
      if (!whatsappId) throw new WhatsAppSendError("Meta returned no message ID.");
      await this.prisma.message.update({ where: { id: outbound.id }, data: { whatsappId } });
      return { id: outbound.id, whatsappId };
    } catch (error) {
      const sendError = normalizeError(error);
      await this.prisma.message.update({ where: { id: outbound.id }, data: { deliveryError: failedMessageText(sendError) } });
      this.logger.warn({
        event: "whatsapp_send_failed",
        messageId: outbound.id,
        providerCode: sendError.providerCode ?? null
      }, failedMessageText(sendError));
      throw sendError;
    }
  }

  private async uploadMedia(document: WhatsAppDocument): Promise<MetaMediaResponse & { id: string }> {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("file", new Blob([Uint8Array.from(document.bytes).buffer], { type: document.mimeType }), document.fileName);

    const response = await this.fetcher(`${graphApiBase}/${this.config.WHATSAPP_API_VERSION}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}` },
      body: form
    });
    const result = await this.readJson<MetaMediaResponse>(response);
    if (!result.id) throw new WhatsAppSendError("Meta returned no uploaded media ID.");
    return { ...result, id: result.id };
  }

  private async postMessage(payload: Record<string, unknown>): Promise<MetaSendResponse> {
    const response = await this.fetcher(`${graphApiBase}/${this.config.WHATSAPP_API_VERSION}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return this.readJson<MetaSendResponse>(response);
  }

  private async readJson<T>(response: Response): Promise<T> {
    const result = await response.json() as T & MetaApiErrorBody;
    if (!response.ok) {
      const providerError = result.error;
      throw new WhatsAppSendError(
        "Meta Graph API rejected the request.",
        providerError?.code
      );
    }
    return result;
  }
}

function normalizeError(error: unknown): WhatsAppSendError {
  if (error instanceof WhatsAppSendError) return error;
  return new WhatsAppSendError("Network error while contacting Meta Graph API.");
}
