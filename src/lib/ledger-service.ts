import { prisma } from "@/lib/prisma";
import {
  EXTERNAL_ACCOUNT_CODE,
  LedgerDirection,
  TransactionType,
} from "@/lib/constants";

export class LedgerError extends Error {}
export class InsufficientBalanceError extends LedgerError {}

// SQLite mengunci seluruh database per penulisan (single-writer), jadi di
// bawah beban tinggi transaksi interaktif bisa mengantre lebih lama dari
// timeout default Prisma (5 detik). PostgreSQL production tidak punya
// batasan ini karena mengunci per-baris, bukan seluruh database — nilai
// ini hanya jaring pengaman tambahan untuk skenario stress-test lokal.
const TRANSACTION_OPTIONS = { timeout: 15000, maxWait: 15000 };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function findTransactionByIdempotencyKey(idempotencyKey: string) {
  return prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey },
    include: { entries: true },
  });
}

export async function getAccountForUser(userId: string) {
  return prisma.account.findUniqueOrThrow({ where: { userId } });
}

export async function getBalance(userId: string): Promise<number> {
  const account = await getAccountForUser(userId);
  return account.balanceCache;
}

/**
 * Top-up saldo (simulasi, tanpa payment gateway sungguhan): mencatat
 * DEBIT ke akun sistem EXTERNAL dan CREDIT ke akun pengguna dalam satu
 * transaksi database. Idempotent lewat idempotencyKey.
 */
export async function topUp(params: {
  userId: string;
  amount: number;
  idempotencyKey: string;
}) {
  if (params.amount <= 0) throw new LedgerError("Jumlah top-up harus lebih dari 0");

  const existing = await findTransactionByIdempotencyKey(params.idempotencyKey);
  if (existing) return { transaction: existing, idempotentReplay: true as const };

  try {
    const transaction = await prisma.$transaction(async (tx) => {
      const external = await tx.account.findUniqueOrThrow({
        where: { code: EXTERNAL_ACCOUNT_CODE },
      });
      const userAccount = await tx.account.findUniqueOrThrow({
        where: { userId: params.userId },
      });

      const created = await tx.ledgerTransaction.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          type: TransactionType.TOPUP,
          description: "Top-up saldo",
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: created.id,
            accountId: external.id,
            direction: LedgerDirection.DEBIT,
            amount: params.amount,
          },
          {
            transactionId: created.id,
            accountId: userAccount.id,
            direction: LedgerDirection.CREDIT,
            amount: params.amount,
          },
        ],
      });

      await tx.account.update({
        where: { id: external.id },
        data: { balanceCache: { decrement: params.amount } },
      });
      await tx.account.update({
        where: { id: userAccount.id },
        data: { balanceCache: { increment: params.amount } },
      });

      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { entries: true },
      });
    }, TRANSACTION_OPTIONS);

    return { transaction, idempotentReplay: false as const };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await findTransactionByIdempotencyKey(params.idempotencyKey);
      if (raced) return { transaction: raced, idempotentReplay: true as const };
    }
    throw error;
  }
}

/**
 * Transfer saldo antar pengguna. Saldo pengirim dicek & dikurangi lewat
 * satu UPDATE atomik dengan syarat `balanceCache >= amount` (bukan
 * read-then-write terpisah) — ini yang mencegah saldo minus walau ada dua
 * transfer keluar dari akun yang sama berjalan bersamaan. Idempotent lewat
 * idempotencyKey.
 */
export async function transfer(params: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  idempotencyKey: string;
  type?: (typeof TransactionType)[keyof typeof TransactionType];
  description?: string;
}) {
  if (params.amount <= 0) throw new LedgerError("Jumlah transfer harus lebih dari 0");
  if (params.fromUserId === params.toUserId) {
    throw new LedgerError("Tidak bisa transfer ke akun sendiri");
  }

  const existing = await findTransactionByIdempotencyKey(params.idempotencyKey);
  if (existing) return { transaction: existing, idempotentReplay: true as const };

  try {
    const transaction = await prisma.$transaction(async (tx) => {
      const [fromAccount, toAccount] = await Promise.all([
        tx.account.findUnique({ where: { userId: params.fromUserId } }),
        tx.account.findUnique({ where: { userId: params.toUserId } }),
      ]);
      if (!fromAccount) throw new LedgerError("Akun pengirim tidak ditemukan");
      if (!toAccount) throw new LedgerError("Akun penerima tidak ditemukan");

      // UPDATE atomik bersyarat — inilah penjamin utama saldo tidak minus.
      const debited = await tx.account.updateMany({
        where: { id: fromAccount.id, balanceCache: { gte: params.amount } },
        data: { balanceCache: { decrement: params.amount } },
      });
      if (debited.count === 0) {
        throw new InsufficientBalanceError("Saldo tidak cukup untuk transfer ini");
      }

      await tx.account.update({
        where: { id: toAccount.id },
        data: { balanceCache: { increment: params.amount } },
      });

      const created = await tx.ledgerTransaction.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          type: params.type ?? TransactionType.TRANSFER,
          description: params.description ?? "Transfer",
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: created.id,
            accountId: fromAccount.id,
            direction: LedgerDirection.DEBIT,
            amount: params.amount,
          },
          {
            transactionId: created.id,
            accountId: toAccount.id,
            direction: LedgerDirection.CREDIT,
            amount: params.amount,
          },
        ],
      });

      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { entries: true },
      });
    }, TRANSACTION_OPTIONS);

    return { transaction, idempotentReplay: false as const };
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    if (isUniqueConstraintError(error)) {
      const raced = await findTransactionByIdempotencyKey(params.idempotencyKey);
      if (raced) return { transaction: raced, idempotentReplay: true as const };
    }
    throw error;
  }
}

export async function getLedgerHistory(userId: string, limit = 100) {
  const account = await getAccountForUser(userId);
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { transaction: true },
  });

  return entries.map((entry) => ({
    id: entry.id,
    direction: entry.direction,
    amount: entry.amount,
    createdAt: entry.createdAt,
    transactionType: entry.transaction.type,
    description: entry.transaction.description,
  }));
}
