import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

loadDotEnv({ path: resolve(process.cwd(), "../.env") });
const prisma = new PrismaClient();

async function main() {
  const seller = await prisma.user.findUnique({ where: { phone: "+2348012345678" } });
  const buyer = await prisma.user.findUnique({ where: { phone: "+2348098765432" } });
  if (!seller || !buyer) throw new Error("seed users missing");
  await prisma.deal.upsert({
    where: { dealCode: "DELV0001" },
    update: {},
    create: {
      dealCode: "DELV0001",
      sellerId: seller.id,
      buyerId: buyer.id,
      buyerPhone: buyer.phone,
      description: "Brand identity package (buyer side)",
      items: [{ description: "Logo suite", quantity: 1 }],
      rightsText: "Full commercial rights on final delivery",
      amountKobo: 15000000n,
      status: "DELIVERED",
      deliveredAt: new Date(),
      events: {
        create: [
          { type: "DEAL_CREATED", toStatus: "DRAFT", actorId: seller.id, data: {} },
          { type: "DELIVERED", toStatus: "DELIVERED", actorId: seller.id, data: {} }
        ]
      }
    }
  });
  console.info("Seeded DELIVERED deal DELV0001.");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
