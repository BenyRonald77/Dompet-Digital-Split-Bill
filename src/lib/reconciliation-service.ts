import { prisma } from "@/lib/prisma";
import { LedgerDirection } from "@/lib/constants";

/**
 * Memverifikasi dua invarian akuntansi double-entry:
 * 1. Total seluruh debit sistem = total seluruh kredit sistem.
 * 2. Saldo cache tiap akun (`balanceCache`) = hasil hitung ulang dari
 *    ledger-nya sendiri (kredit - debit) — mendeteksi bila ada bug yang
 *    membuat cache menyimpang dari sumber kebenaran (ledger).
 */
export async function runReconciliation() {
  const totals = await prisma.ledgerEntry.groupBy({
    by: ["direction"],
    _sum: { amount: true },
  });
  const totalDebit = totals.find((t) => t.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
  const totalCredit = totals.find((t) => t.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;

  const perAccount = await prisma.ledgerEntry.groupBy({
    by: ["accountId", "direction"],
    _sum: { amount: true },
  });

  const computedByAccount = new Map<string, number>();
  for (const row of perAccount) {
    const sign = row.direction === LedgerDirection.CREDIT ? 1 : -1;
    const current = computedByAccount.get(row.accountId) ?? 0;
    computedByAccount.set(row.accountId, current + sign * (row._sum.amount ?? 0));
  }

  const accounts = await prisma.account.findMany();
  const mismatched = accounts
    .map((account) => ({
      accountId: account.id,
      cached: account.balanceCache,
      computed: computedByAccount.get(account.id) ?? 0,
    }))
    .filter((row) => row.cached !== row.computed);

  const balanced = totalDebit === totalCredit && mismatched.length === 0;

  return prisma.reconciliationRun.create({
    data: {
      totalDebit,
      totalCredit,
      balanced,
      mismatchedAccounts: JSON.stringify(mismatched),
    },
  });
}

export async function listReconciliationRuns(limit = 30) {
  return prisma.reconciliationRun.findMany({
    orderBy: { runAt: "desc" },
    take: limit,
  });
}
