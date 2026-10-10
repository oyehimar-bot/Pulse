import { config as loadDotEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashSessionToken } from "../src/auth/service.js";

loadDotEnv({ path: resolve(process.cwd(), "../.env") });

const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2] ?? "+2348012345678";
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new Error(`No user for phone ${phone}. Run the seed first.`);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt }
  });

  console.log(token);
}

main()
  .catch((error: unknown) => {
    console.error("Mint failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
