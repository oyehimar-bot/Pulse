-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "challenge_id" TEXT;

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "display_name" TEXT,
    "code_hash" TEXT NOT NULL,
    "requester_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_challenges_phone_expires_at_verified_at_idx" ON "auth_challenges"("phone", "expires_at", "verified_at");

-- CreateIndex
CREATE INDEX "auth_challenges_requester_hash_created_at_idx" ON "auth_challenges"("requester_hash", "created_at");

-- CreateIndex
CREATE INDEX "auth_rate_limit_buckets_bucket_start_idx" ON "auth_rate_limit_buckets"("bucket_start");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_buckets_scope_key_hash_bucket_start_key" ON "auth_rate_limit_buckets"("scope", "key_hash", "bucket_start");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_challenge_id_key" ON "sessions"("challenge_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "auth_challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
