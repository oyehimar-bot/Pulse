ALTER TABLE "payments" ADD COLUMN "payaza_link_id" INTEGER;

CREATE UNIQUE INDEX "payments_payaza_link_id_key" ON "payments"("payaza_link_id");