CREATE TYPE "PayoutStatus" AS ENUM ('READY', 'PENDING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "users"
  ADD COLUMN "payout_bank_code" TEXT,
  ADD COLUMN "payout_account_number" TEXT,
  ADD COLUMN "payout_account_name" TEXT,
  ADD COLUMN "payout_sender_address" TEXT,
  ADD COLUMN "payout_details_confirmed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "payouts" (
  "id" TEXT NOT NULL,
  "deal_id" TEXT NOT NULL,
  "recipient_id" TEXT NOT NULL,
  "provider_reference" TEXT NOT NULL,
  "amount_kobo" BIGINT NOT NULL,
  "bank_code" TEXT,
  "account_number" TEXT,
  "account_name" TEXT,
  "status" "PayoutStatus" NOT NULL DEFAULT 'READY',
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payouts_deal_id_key" ON "payouts"("deal_id");
CREATE UNIQUE INDEX "payouts_provider_reference_key" ON "payouts"("provider_reference");
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;