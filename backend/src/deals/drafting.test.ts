import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDealShareLink,
  clearSellerDraft,
  getSellerDraft,
  parseDealDraftText,
  setSellerDraft
} from "./drafting.js";

test("regex fallback parses a seller deal message into a draft payload", async () => {
  const result = await parseDealDraftText("N50k for 3 beats, full rights, buyer is 08012345678");

  assert.deepEqual(result, {
    amountKobo: 5_000_000n,
    quantity: 3,
    itemDescription: "beats",
    rightsText: "full rights",
    buyerPhone: "+2348012345678"
  });
});

test("deal drafts are kept in memory by seller phone with only one active draft", () => {
  const sellerPhone = "+2348012345678";
  const draft = {
    amountKobo: 4_500_000n,
    quantity: 2,
    itemDescription: "instrumentals",
    rightsText: "exclusive rights",
    buyerPhone: "+2348098765432"
  };

  setSellerDraft(sellerPhone, draft);
  assert.deepEqual(getSellerDraft(sellerPhone), draft);

  clearSellerDraft(sellerPhone);
  assert.equal(getSellerDraft(sellerPhone), undefined);
});

test("deal links use the required wa.me share format", () => {
  assert.equal(buildDealShareLink("ABCD1234"), "https://wa.me/15556546846?text=DEAL-ABCD1234");
});
