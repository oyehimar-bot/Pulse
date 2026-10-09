import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

const requiredEnvironment = {
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
};

test("loadConfig applies defaults to blank optional and defaulted values", () => {
  const config = loadConfig({
    ...requiredEnvironment,
    PORT: "",
    WHATSAPP_API_VERSION: "",
    PAYAZA_TENANT_ID: "",
    ANTHROPIC_API_KEY: "",
    ESCROW_FEE_PERCENT: "",
    LICENSE_FEE_KOBO: ""
  });

  assert.equal(config.PORT, 3000);
  assert.equal(config.WHATSAPP_API_VERSION, "v25.0");
  assert.equal(config.PAYAZA_TENANT_ID, "test");
  assert.equal(config.ANTHROPIC_API_KEY, undefined);
  assert.equal(config.ESCROW_FEE_PERCENT, 2.5);
  assert.equal(config.LICENSE_FEE_KOBO, 50000);
});

test("loadConfig reports required missing variables without exposing values", () => {
  assert.throws(
    () => loadConfig({}),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /SESSION_SECRET/);
      return true;
    }
  );
});