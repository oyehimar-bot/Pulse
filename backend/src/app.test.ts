import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

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

test("GET /health returns API liveness", async (context) => {
  const app = buildApp(config);
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", service: "pulse-api" });
});