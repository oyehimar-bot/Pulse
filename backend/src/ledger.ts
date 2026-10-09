import { LedgerDirection, Prisma, PrismaClient } from "@prisma/client";

type AppendLedgerEntry = {
  account: string;
  direction: LedgerDirection;
  amountKobo: bigint;
  dealId: string;
  reason: string;
};

export async function appendLedgerEntry(
  client: PrismaClient | Prisma.TransactionClient,
  entry: AppendLedgerEntry
) {
  if (entry.amountKobo <= 0n) {
    throw new Error("Ledger entry amount must be a positive integer number of kobo.");
  }

  return client.ledgerEntry.create({ data: entry });
}

export async function getAccountBalance(
  client: PrismaClient | Prisma.TransactionClient,
  account: string
) {
  const entries = await client.ledgerEntry.groupBy({
    where: { account },
    by: ["direction"],
    _sum: { amountKobo: true }
  });

  const credits = entries.find((entry) => entry.direction === "CREDIT")?._sum.amountKobo ?? 0n;
  const debits = entries.find((entry) => entry.direction === "DEBIT")?._sum.amountKobo ?? 0n;
  return credits - debits;
}