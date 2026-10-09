import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

loadDotEnv({ path: resolve(process.cwd(), "../.env") });

const prisma = new PrismaClient();

async function main() {
  const seller = await prisma.user.upsert({
    where: { phone: "+2348012345678" },
    update: {},
    create: {
      displayName: "Demo Seller",
      phone: "+2348012345678",
      pulseId: "PULSE-DEMO01",
      isSeller: true,
      isPhoneVerified: true,
      verificationPhrase: "blue notebook"
    }
  });

  const buyer = await prisma.user.upsert({
    where: { phone: "+2348098765432" },
    update: {},
    create: {
      displayName: "Demo Buyer",
      phone: "+2348098765432",
      pulseId: "PULSE-DEMO02",
      isBuyer: true,
      isPhoneVerified: true,
      verificationPhrase: "green studio"
    }
  });

  await prisma.deal.upsert({
    where: { dealCode: "DEMO0001" },
    update: {},
    create: {
      dealCode: "DEMO0001",
      sellerId: seller.id,
      buyerId: buyer.id,
      buyerPhone: buyer.phone,
      description: "Three music beats",
      items: [{ description: "Music beat", quantity: 3 }],
      rightsText: "Full rights as agreed by both parties",
      amountKobo: 5000000n,
      status: "DRAFT",
      events: {
        create: {
          type: "DEAL_CREATED",
          toStatus: "DRAFT",
          actorId: seller.id,
          data: { seeded: true }
        }
      }
    }
  });

  console.info("Seeded demo seller, buyer, and deal DEMO0001.");
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());