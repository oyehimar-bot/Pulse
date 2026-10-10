import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { loadConfig } from "../config.js";
import { hashLicenseData, isValidLicenseRecord, issueLicenseForDeal, registerLicenseRoutes, renderLicensePdf, type LicenseSnapshot } from "./service.js";

const config = loadConfig({
  DATABASE_URL: "postgresql://pulse:pulse@localhost:5432/pulse",
  SESSION_SECRET: "a-session-secret-with-at-least-32-characters",
  PUBLIC_BASE_URL: "https://pulse.example.test",
  FRONTEND_URL: "http://localhost:5173",
  WHATSAPP_PHONE_NUMBER_ID: "phone-id",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "business-id",
  WHATSAPP_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
  WHATSAPP_APP_SECRET: "app-secret",
  PULSE_WHATSAPP_NUMBER: "+2348000000000",
  PAYAZA_PUBLIC_KEY_TEST: "test-public-key",
  PAYAZA_SECRET_KEY_TEST: "test-secret-key",
  LICENSE_SIGNING_KEY: "a-license-signing-key-with-at-least-32-characters"
});

const snapshot: LicenseSnapshot = {
  certificateNumber: "PULSE-LIC-ABC12345-1A2B3C4D",
  dealCode: "ABC12345",
  issuedAt: "2026-10-10T00:00:00.000Z",
  sellerName: "Pulse Seller",
  buyerName: "Pulse Buyer",
  workDescription: "Three original audio loops",
  items: [{ quantity: 3, description: "audio loops" }],
  rights: "Exclusive worldwide digital use",
  amountKobo: "2500000",
  currency: "NGN"
};

test("canonical license hashes are deterministic and detect snapshot tampering", () => {
  const hash = hashLicenseData(snapshot);
  assert.equal(hash, hashLicenseData({ ...snapshot, items: [{ description: "audio loops", quantity: 3 }] }));
  assert.equal(isValidLicenseRecord({ sha256Hash: hash, canonicalData: snapshot as unknown as Prisma.JsonValue }), true);
  assert.equal(isValidLicenseRecord({
    sha256Hash: hash,
    canonicalData: { ...snapshot, rights: "Different rights" } as unknown as Prisma.JsonValue
  }), false);
});

test("license PDF contains a valid PDF document and QR verification code", async () => {
  const hash = hashLicenseData(snapshot);
  const pdf = await renderLicensePdf(snapshot, hash, "https://pulse.example.test/licenses/PULSE-LIC-ABC12345-1A2B3C4D/verify");
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.includes(Buffer.from("/Type /Page", "ascii")));
  assert.ok(pdf.length > 3000);
});

test("license issuance requires release and reuses the persisted certificate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pulse-license-issue-test-"));
  const created: Array<Record<string, unknown>> = [];
  let dealStatus = "DELIVERED";
  const prisma = {
    license: {
      findUnique: async () => created.length ? created[0] : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push({
          id: "license-1",
          ...data,
          createdAt: new Date("2026-10-10T00:00:00.000Z")
        });
      }
    },
    deal: {
      findUnique: async () => ({
        id: "deal-1",
        dealCode: "ABC12345",
        status: dealStatus,
        description: "Three original audio loops",
        items: snapshot.items,
        rightsText: "Exclusive worldwide digital use",
        amountKobo: 2_500_000n,
        seller: { displayName: "Pulse Seller", pulseId: "PULSE-SELLER" },
        buyer: { displayName: "Pulse Buyer", pulseId: "PULSE-BUYER" }
      })
    }
  } as unknown as PrismaClient;

  try {
    await assert.rejects(issueLicenseForDeal(prisma, config, "deal-1", directory), /only be issued after buyer release/);
    assert.equal(created.length, 0);

    dealStatus = "RELEASED";
    const first = await issueLicenseForDeal(prisma, config, "deal-1", directory);
    const second = await issueLicenseForDeal(prisma, config, "deal-1", directory);
    assert.equal(created.length, 1);
    assert.equal(second.certificateNumber, first.certificateNumber);
    assert.equal(second.sha256Hash, first.sha256Hash);
    assert.equal(second.bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.deepEqual(JSON.parse(JSON.stringify(created[0]?.canonicalData)), first.canonicalData);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("public license routes verify snapshots and serve certificate PDF", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pulse-license-test-"));
  const filePath = path.join(directory, "certificate.pdf");
  const hash = hashLicenseData(snapshot);
  const pdf = await renderLicensePdf(snapshot, hash, `https://pulse.example.test/licenses/${snapshot.certificateNumber}/verify`);
  await writeFile(filePath, pdf);
  const record = {
    id: "license-1",
    dealId: "deal-1",
    certificateNumber: snapshot.certificateNumber,
    sha256Hash: hash,
    canonicalData: snapshot,
    filePath,
    createdAt: new Date(snapshot.issuedAt)
  };
  const prisma = { license: { findUnique: async () => record } } as unknown as PrismaClient;
  const app = Fastify();
  registerLicenseRoutes(app, prisma, config);
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const verified = await app.inject({ method: "GET", url: `/licenses/${snapshot.certificateNumber}/verify` });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().valid, true);
  assert.equal(verified.json().certificateNumber, snapshot.certificateNumber);

  const certificate = await app.inject({ method: "GET", url: `/licenses/${snapshot.certificateNumber}.pdf` });
  assert.equal(certificate.statusCode, 200);
  assert.match(certificate.headers["content-type"] ?? "", /application\/pdf/);
  assert.equal(certificate.rawPayload.subarray(0, 5).toString("ascii"), "%PDF-");

  const invalid = await app.inject({ method: "GET", url: "/licenses/not-a-certificate/verify" });
  assert.equal(invalid.statusCode, 404);

  const storedPdf = await readFile(filePath);
  assert.deepEqual(storedPdf, pdf);
});
