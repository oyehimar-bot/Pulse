import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";

export type LicenseSnapshot = {
  certificateNumber: string;
  dealCode: string;
  issuedAt: string;
  sellerName: string;
  buyerName: string;
  workDescription: string;
  items: unknown;
  rights: string;
  amountKobo: string;
  currency: "NGN";
};

export type LicenseDocument = {
  certificateNumber: string;
  sha256Hash: string;
  verificationUrl: string;
  filePath: string;
  bytes: Buffer;
  canonicalData: LicenseSnapshot;
};

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortCanonical(item)]));
  }
  return value;
}

export function canonicalLicenseJson(data: LicenseSnapshot): string {
  return JSON.stringify(sortCanonical(data));
}

export function hashLicenseData(data: LicenseSnapshot): string {
  return createHash("sha256").update(canonicalLicenseJson(data), "utf8").digest("hex");
}

export async function renderLicensePdf(data: LicenseSnapshot, hash: string, verificationUrl: string): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "H", margin: 1, width: 320 });
  const qrPng = Buffer.from(qrDataUrl.slice(qrDataUrl.indexOf(",") + 1), "base64");
  const document = new PDFDocument({ size: "A4", margin: 54, info: { Title: `Pulse Digital License ${data.certificateNumber}`, Author: "Pulse" } });
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.rect(0, 0, document.page.width, 12).fill("#126b5b");
    document.fillColor("#126b5b").font("Helvetica-Bold").fontSize(12).text("PULSE  /  DIGITAL RIGHTS REGISTRY");
    document.moveDown(2);
    document.fillColor("#1c2522").font("Helvetica-Bold").fontSize(28).text("Digital License Certificate");
    document.moveDown(0.5);
    document.fillColor("#56645e").font("Helvetica").fontSize(11).text(`Certificate ${data.certificateNumber}`);
    document.moveDown(1.6);

    const rows: Array<[string, string]> = [
      ["Work", data.workDescription],
      ["Seller / Licensor", data.sellerName],
      ["Buyer / Licensee", data.buyerName],
      ["Rights Granted", data.rights],
      ["Deal Reference", data.dealCode],
      ["Issued", new Date(data.issuedAt).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" })],
      ["Consideration", `${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(BigInt(data.amountKobo)) / 100)} (recorded deal value)`]
    ];

    for (const [label, value] of rows) {
      document.fillColor("#126b5b").font("Helvetica-Bold").fontSize(9).text(label.toUpperCase());
      document.fillColor("#1c2522").font("Helvetica").fontSize(12).text(value, { width: 480 });
      document.moveDown(0.75);
    }

    document.moveDown(0.5);
    document.fillColor("#1c2522").font("Helvetica-Bold").fontSize(10).text("INTEGRITY HASH (SHA-256)");
    document.fillColor("#56645e").font("Courier").fontSize(8).text(hash, { width: 470 });
    document.image(qrPng, document.page.width - document.page.margins.right - 112, document.y + 12, { width: 96, height: 96 });
    document.moveDown(2);
    document.fillColor("#56645e").font("Helvetica").fontSize(9).text(`Verify this certificate at ${verificationUrl}`, { width: 420 });
    document.moveDown(1.2);
    document.fillColor("#56645e").fontSize(8).text("This certificate records the deal terms confirmed in Pulse. It is not a substitute for the underlying agreement or applicable law.", { width: 480 });
    document.end();
  });
}

function verificationUrl(config: AppConfig, certificateNumber: string): string {
  return new URL(`/verify/${encodeURIComponent(certificateNumber)}`, config.FRONTEND_URL).toString();
}

function localCertificatePath(certificateNumber: string, storageDirectory: string): string {
  return path.resolve(storageDirectory, `${certificateNumber}.pdf`);
}

async function makeDocument(
  certificateNumber: string,
  sha256Hash: string,
  canonicalData: LicenseSnapshot,
  filePath: string,
  config: AppConfig
): Promise<LicenseDocument> {
  const url = verificationUrl(config, certificateNumber);
  await mkdir(path.dirname(filePath), { recursive: true });
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    bytes = await renderLicensePdf(canonicalData, sha256Hash, url);
    const temporaryPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporaryPath, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporaryPath, filePath);
  }
  return { certificateNumber, sha256Hash, verificationUrl: url, filePath, bytes, canonicalData };
}

export async function issueLicenseForDeal(
  prisma: PrismaClient,
  config: AppConfig,
  dealId: string,
  storageDirectory = path.resolve(process.cwd(), "storage", "licenses")
): Promise<LicenseDocument> {
  const existing = await prisma.license.findUnique({ where: { dealId } });
  if (existing) {
    return makeDocument(
      existing.certificateNumber,
      existing.sha256Hash,
      existing.canonicalData as unknown as LicenseSnapshot,
      existing.filePath,
      config
    );
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { seller: true, buyer: true }
  });
  if (!deal) throw new Error("Deal was not found for license issuance.");
  if (deal.status !== "RELEASED") throw new Error("A license certificate can only be issued after buyer release.");

  const certificateNumber = `PULSE-LIC-${deal.dealCode}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const canonicalData: LicenseSnapshot = {
    certificateNumber,
    dealCode: deal.dealCode,
    issuedAt: new Date().toISOString(),
    sellerName: deal.seller.displayName ?? deal.seller.pulseId,
    buyerName: deal.buyer?.displayName ?? deal.buyer?.pulseId ?? "Verified deal buyer",
    workDescription: deal.description,
    items: deal.items,
    rights: deal.rightsText,
    amountKobo: deal.amountKobo.toString(),
    currency: "NGN"
  };
  const sha256Hash = hashLicenseData(canonicalData);
  const filePath = localCertificatePath(certificateNumber, storageDirectory);
  const document = await makeDocument(certificateNumber, sha256Hash, canonicalData, filePath, config);

  try {
    await prisma.license.create({
      data: {
        dealId: deal.id,
        certificateNumber,
        sha256Hash,
        canonicalData: JSON.parse(canonicalLicenseJson(canonicalData)) as Prisma.InputJsonValue,
        filePath
      }
    });
  } catch (error) {
    await rm(filePath, { force: true });
    const raced = await prisma.license.findUnique({ where: { dealId } });
    if (!raced) throw error;
    return makeDocument(
      raced.certificateNumber,
      raced.sha256Hash,
      raced.canonicalData as unknown as LicenseSnapshot,
      raced.filePath,
      config
    );
  }

  return document;
}

export function isValidLicenseRecord(record: { sha256Hash: string; canonicalData: Prisma.JsonValue }): boolean {
  return hashLicenseData(record.canonicalData as unknown as LicenseSnapshot) === record.sha256Hash;
}

export function registerLicenseRoutes(app: import("fastify").FastifyInstance, prisma: PrismaClient, config: AppConfig) {
  app.get<{ Params: { certificateNumber: string } }>("/licenses/:certificateNumber/verify", async (request, reply) => {
    const certificateNumber = request.params.certificateNumber;
    if (!/^PULSE-LIC-[A-Z0-9]{6,8}-[A-F0-9]{8}$/.test(certificateNumber)) {
      return reply.code(404).send({ valid: false, error: "Certificate not found." });
    }
    const license = await prisma.license.findUnique({ where: { certificateNumber } });
    if (!license) return reply.code(404).send({ valid: false, error: "Certificate not found." });
    const valid = isValidLicenseRecord(license);
    return reply.send({
      valid,
      certificateNumber: license.certificateNumber,
      sha256: license.sha256Hash,
      issuedAt: (license.canonicalData as unknown as LicenseSnapshot).issuedAt,
      license: license.canonicalData
    });
  });

  app.get<{ Params: { certificateNumber: string } }>("/licenses/:certificateNumber.pdf", async (request, reply) => {
    const certificateNumber = request.params.certificateNumber;
    if (!/^PULSE-LIC-[A-Z0-9]{6,8}-[A-F0-9]{8}$/.test(certificateNumber)) {
      return reply.code(404).send({ error: "Certificate not found." });
    }
    const license = await prisma.license.findUnique({ where: { certificateNumber } });
    if (!license) return reply.code(404).send({ error: "Certificate not found." });
    if (!isValidLicenseRecord(license)) return reply.code(409).send({ error: "Certificate integrity check failed." });
    try {
      const document = await makeDocument(
        license.certificateNumber,
        license.sha256Hash,
        license.canonicalData as unknown as LicenseSnapshot,
        license.filePath,
        config
      );
      return reply
        .type("application/pdf")
        .header("Content-Disposition", `inline; filename="${license.certificateNumber}.pdf"`)
        .send(document.bytes);
    } catch {
      return reply.code(404).send({ error: "Certificate file is unavailable." });
    }
  });
}
