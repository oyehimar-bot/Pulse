-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'AWAITING_BUYER', 'AWAITING_PAYMENT', 'FUNDED', 'DELIVERED', 'RELEASED', 'DISPUTED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('META', 'PAYAZA');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "display_name" TEXT,
    "phone" TEXT NOT NULL,
    "pulse_id" TEXT NOT NULL,
    "is_seller" BOOLEAN NOT NULL DEFAULT false,
    "is_buyer" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_phrase" TEXT NOT NULL DEFAULT 'Not set',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "deal_code" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "buyer_id" TEXT,
    "buyer_phone" TEXT,
    "description" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "rights_text" TEXT NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "verification_phrase" TEXT,
    "expires_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_events" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "from_status" "DealStatus",
    "to_status" "DealStatus",
    "actor_id" TEXT,
    "message_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_kobo" BIGINT NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "external_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "whatsapp_id" TEXT,
    "sender_phone" TEXT NOT NULL,
    "user_id" TEXT,
    "deal_id" TEXT,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_error" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "sha256_hash" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_pulse_id_key" ON "users"("pulse_id");

-- CreateIndex
CREATE INDEX "users_phone_is_phone_verified_idx" ON "users"("phone", "is_phone_verified");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "deals_deal_code_key" ON "deals"("deal_code");

-- CreateIndex
CREATE INDEX "deals_seller_id_status_created_at_idx" ON "deals"("seller_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "deals_buyer_id_status_created_at_idx" ON "deals"("buyer_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "deals_buyer_phone_idx" ON "deals"("buyer_phone");

-- CreateIndex
CREATE INDEX "deals_status_expires_at_idx" ON "deals"("status", "expires_at");

-- CreateIndex
CREATE INDEX "deal_events_deal_id_created_at_idx" ON "deal_events"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "deal_events_type_created_at_idx" ON "deal_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_account_created_at_idx" ON "ledger_entries"("account", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_deal_id_created_at_idx" ON "ledger_entries"("deal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "payments_deal_id_status_idx" ON "payments"("deal_id", "status");

-- CreateIndex
CREATE INDEX "webhook_events_source_received_at_idx" ON "webhook_events"("source", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_received_at_idx" ON "webhook_events"("processed_at", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_source_external_id_key" ON "webhook_events"("source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_whatsapp_id_key" ON "messages"("whatsapp_id");

-- CreateIndex
CREATE INDEX "messages_sender_phone_sent_at_idx" ON "messages"("sender_phone", "sent_at");

-- CreateIndex
CREATE INDEX "messages_deal_id_sent_at_idx" ON "messages"("deal_id", "sent_at");

-- CreateIndex
CREATE INDEX "messages_user_id_sent_at_idx" ON "messages"("user_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_deal_id_key" ON "licenses"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_certificate_number_key" ON "licenses"("certificate_number");

-- CreateIndex
CREATE INDEX "licenses_sha256_hash_idx" ON "licenses"("sha256_hash");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
