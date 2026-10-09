import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isValidMetaSignature } from "./whatsapp.js";

test("Meta webhook signatures are verified against the exact raw body", () => {
  const secret = "meta-test-app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(isValidMetaSignature(body, signature, secret), true);
  assert.equal(isValidMetaSignature(Buffer.from(`${body.toString()} `), signature, secret), false);
  assert.equal(isValidMetaSignature(body, "sha256=bad", secret), false);
  assert.equal(isValidMetaSignature(body, undefined, secret), false);
});